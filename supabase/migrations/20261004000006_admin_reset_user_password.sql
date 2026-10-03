-- Bestlink College of the Philippines Attendance Monitoring System (AMS)
-- Migration: Add Administrator User Password Reset Stored Procedure
-- Reference: docs/Security.md, docs/DATA.md

CREATE OR REPLACE FUNCTION fn_admin_reset_user_password(
  p_user_id UUID,
  p_new_password TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_email TEXT;
  v_role TEXT;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'User ID is required.');
  END IF;

  IF p_new_password IS NULL OR length(trim(p_new_password)) < 6 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Password must be at least 6 characters.');
  END IF;

  -- 1. Verify user exists in public.users
  SELECT email, role INTO v_user_email, v_role
  FROM public.users
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'User record not found in system.');
  END IF;

  -- 2. Update encrypted_password in auth.users
  UPDATE auth.users
  SET 
    encrypted_password = crypt(trim(p_new_password), gen_salt('bf')),
    updated_at = now()
  WHERE id = p_user_id;

  -- If the user was not yet in auth.users, create the auth record
  IF NOT FOUND THEN
    INSERT INTO auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      p_user_id,
      'authenticated',
      'authenticated',
      v_user_email,
      crypt(trim(p_new_password), gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}',
      jsonb_build_object('role', v_role),
      now(),
      now()
    );
  END IF;

  -- 3. Update initial_password_temp in public.users if column exists
  BEGIN
    UPDATE public.users
    SET initial_password_temp = trim(p_new_password)
    WHERE id = p_user_id;
  EXCEPTION WHEN OTHERS THEN
    -- Ignore if initial_password_temp does not exist
  END;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Password updated successfully.'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION fn_admin_reset_user_password(UUID, TEXT) TO service_role, authenticated, anon;
