-- Bestlink College of the Philippines Attendance Monitoring System (AMS)
-- Subsystem of SMS 1 (School Management System)
-- Migration: Add 2FA OTP columns to users table and secure verification RPCs
-- Reference: docs/Security.md, docs/DATA.md

-- 1. Add columns to public.users table (no separate OTP table)
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS otp_code TEXT,
ADD COLUMN IF NOT EXISTS otp_expires_at TIMESTAMPTZ;

-- 2. Function to store OTP securely
CREATE OR REPLACE FUNCTION fn_store_user_otp(
  p_user_id UUID,
  p_otp_code TEXT,
  p_validity_minutes INT DEFAULT 5
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE users
  SET 
    otp_code = p_otp_code,
    otp_expires_at = now() + (p_validity_minutes || ' minutes')::interval
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'User record not found');
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- 3. Function to verify and clear OTP atomically
CREATE OR REPLACE FUNCTION fn_verify_user_otp(
  p_user_id UUID,
  p_otp_code TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_stored_otp TEXT;
  v_expires_at TIMESTAMPTZ;
BEGIN
  SELECT otp_code, otp_expires_at
  INTO v_stored_otp, v_expires_at
  FROM users
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'User record not found');
  END IF;

  IF v_stored_otp IS NULL OR v_expires_at IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No active OTP request found. Please request a new code.');
  END IF;

  IF now() > v_expires_at THEN
    -- Expired OTP: clear for security
    UPDATE users SET otp_code = NULL, otp_expires_at = NULL WHERE id = p_user_id;
    RETURN jsonb_build_object('success', false, 'error', 'The verification code has expired. Please request a new code.');
  END IF;

  IF trim(v_stored_otp) <> trim(p_otp_code) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Incorrect verification code. Please check and try again.');
  END IF;

  -- Code is valid: Clear OTP immediately to prevent replay attacks
  UPDATE users SET otp_code = NULL, otp_expires_at = NULL WHERE id = p_user_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- 4. Set Execution Permissions
GRANT EXECUTE ON FUNCTION fn_store_user_otp(UUID, TEXT, INT) TO service_role, authenticated, anon;
GRANT EXECUTE ON FUNCTION fn_verify_user_otp(UUID, TEXT) TO service_role, authenticated, anon;
