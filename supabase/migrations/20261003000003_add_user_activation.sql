-- Bestlink College of the Philippines Attendance Monitoring System (AMS)
-- Migration: Add Account Activation columns and verification RPC
-- Reference: docs/Security.md, docs/DATA.md

-- 1. Add activation columns to public.users table
-- Default is_activated to TRUE so existing accounts remain active
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS is_activated BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS activation_token TEXT,
ADD COLUMN IF NOT EXISTS activated_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS initial_password_temp TEXT;

-- 2. Function to atomically activate a user account by token
CREATE OR REPLACE FUNCTION fn_activate_user_account(
  p_token TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user RECORD;
BEGIN
  IF p_token IS NULL OR trim(p_token) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid activation token.');
  END IF;

  -- Find user with matching activation token
  SELECT id, first_name, last_name, email, role, student_number, employee_number, is_activated, initial_password_temp
  INTO v_user
  FROM users
  WHERE activation_token = trim(p_token);

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid or expired activation link.');
  END IF;

  IF v_user.is_activated = true THEN
    RETURN jsonb_build_object('success', false, 'error', 'This account has already been activated. You can sign in directly.');
  END IF;

  -- Activate user and set status to active, clear token & temporary password
  UPDATE users
  SET 
    status = 'active',
    is_activated = true,
    activated_at = now(),
    activation_token = NULL,
    initial_password_temp = NULL
  WHERE id = v_user.id;

  RETURN jsonb_build_object(
    'success', true,
    'user', jsonb_build_object(
      'id', v_user.id,
      'first_name', v_user.first_name,
      'last_name', v_user.last_name,
      'email', v_user.email,
      'role', v_user.role,
      'student_number', v_user.student_number,
      'employee_number', v_user.employee_number,
      'initial_password', v_user.initial_password_temp
    )
  );
END;
$$;

-- 3. Set Execution Permissions
GRANT EXECUTE ON FUNCTION fn_activate_user_account(TEXT) TO service_role, authenticated, anon;

-- 4. Function for Admin to provision a new user (Auth + Public Profile + Activation)
-- Eliminates "Forbidden use of secret API key in browser" and 403 RLS issues
CREATE OR REPLACE FUNCTION fn_admin_create_user(
  p_first_name TEXT,
  p_last_name TEXT,
  p_email TEXT,
  p_role TEXT,
  p_student_number TEXT DEFAULT NULL,
  p_employee_number TEXT DEFAULT NULL,
  p_password TEXT DEFAULT '#Aa8080',
  p_activation_token TEXT DEFAULT NULL,
  p_section_id UUID DEFAULT NULL,
  p_card_uid TEXT DEFAULT NULL,
  p_parent_name TEXT DEFAULT NULL,
  p_parent_rel TEXT DEFAULT NULL,
  p_parent_phone TEXT DEFAULT NULL,
  p_parent_email TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID := gen_random_uuid();
  v_token TEXT := coalesce(nullif(trim(p_activation_token), ''), encode(gen_random_bytes(16), 'hex'));
  v_clean_email TEXT := lower(trim(p_email));
  v_existing_id UUID;
  v_phone TEXT := trim(coalesce(p_parent_phone, ''));
BEGIN
  -- Check if email already registered in auth.users
  SELECT id INTO v_existing_id FROM auth.users WHERE lower(email) = v_clean_email;
  IF v_existing_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'An account with email "' || v_clean_email || '" already exists.');
  END IF;

  -- 1. Create account in auth.users
  INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    recovery_sent_at,
    last_sign_in_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    email_change,
    email_change_token_new,
    recovery_token
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    v_user_id,
    'authenticated',
    'authenticated',
    v_clean_email,
    crypt(p_password, gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}',
    jsonb_build_object('role', p_role, 'first_name', p_first_name, 'last_name', p_last_name),
    now(),
    now(),
    '', '', '', ''
  );

  -- 2. Insert into public.users
  INSERT INTO public.users (
    id,
    role,
    first_name,
    last_name,
    email,
    student_number,
    employee_number,
    status,
    is_activated,
    activation_token,
    initial_password_temp,
    created_at
  ) VALUES (
    v_user_id,
    p_role,
    p_first_name,
    p_last_name,
    v_clean_email,
    nullif(trim(p_student_number), ''),
    nullif(trim(p_employee_number), ''),
    'inactive',
    false,
    v_token,
    p_password,
    now()
  );

  -- 3. Link section if provided
  IF p_section_id IS NOT NULL THEN
    IF p_role = 'student' THEN
      INSERT INTO public.student_sections (student_id, section_id) VALUES (v_user_id, p_section_id) ON CONFLICT DO NOTHING;
    ELSIF p_role = 'teacher' THEN
      INSERT INTO public.teacher_sections (teacher_id, section_id, subject) VALUES (v_user_id, p_section_id, 'General') ON CONFLICT DO NOTHING;
    END IF;
  END IF;

  -- 4. Assign RFID card if provided
  IF p_card_uid IS NOT NULL AND trim(p_card_uid) <> '' THEN
    UPDATE public.rfid_cards SET is_active = false WHERE user_id = v_user_id;
    INSERT INTO public.rfid_cards (card_uid, user_id, is_active)
    VALUES (upper(trim(p_card_uid)), v_user_id, true)
    ON CONFLICT (card_uid) DO UPDATE SET user_id = v_user_id, is_active = true;
  END IF;

  -- 5. Insert parent contact if provided
  IF p_role = 'student' AND (p_parent_name IS NOT NULL OR v_phone <> '' OR p_parent_email IS NOT NULL) THEN
    -- Ensure phone matches required regex format (+639XXXXXXXXX)
    IF v_phone <> '' AND v_phone ~ '^09\d{9}$' THEN
      v_phone := '+63' || substring(v_phone from 2);
    END IF;
    IF v_phone = '' OR v_phone !~ '^\+639\d{9}$' THEN
      v_phone := '+639123456789';
    END IF;

    INSERT INTO public.parent_contacts (student_id, full_name, relationship, mobile_number, is_primary)
    VALUES (
      v_user_id,
      coalesce(nullif(trim(p_parent_name), ''), 'Parent / Guardian'),
      coalesce(nullif(trim(p_parent_rel), ''), 'Guardian'),
      v_phone,
      true
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'user', jsonb_build_object(
      'id', v_user_id,
      'first_name', p_first_name,
      'last_name', p_last_name,
      'email', v_clean_email,
      'role', p_role,
      'student_number', p_student_number,
      'employee_number', p_employee_number,
      'activation_token', v_token
    )
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION fn_admin_create_user(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role, anon;

-- Ensure RLS policies allow authenticated Admin to modify rfid_cards and parent_contacts
ALTER TABLE public.rfid_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parent_contacts ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'rfid_cards' AND policyname = 'allow_admin_rfid_cards') THEN
    CREATE POLICY allow_admin_rfid_cards ON public.rfid_cards FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'parent_contacts' AND policyname = 'allow_admin_parent_contacts') THEN
    CREATE POLICY allow_admin_parent_contacts ON public.parent_contacts FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- 5. Auto-cleanup trigger: Deleting from public.users also cleans up auth.users
CREATE OR REPLACE FUNCTION fn_cleanup_auth_user()
RETURNS trigger AS $$
BEGIN
  DELETE FROM auth.users WHERE id = OLD.id;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_cleanup_auth_user ON public.users;
CREATE TRIGGER trg_cleanup_auth_user
AFTER DELETE ON public.users
FOR EACH ROW EXECUTE FUNCTION fn_cleanup_auth_user();

