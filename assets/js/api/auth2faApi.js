/**
 * auth2faApi.js - Two-Factor Authentication (2FA OTP) Service
 * Bestlink College of the Philippines - Attendance Monitoring System (AMS)
 *
 * OTP generation, storage, and Brevo email dispatch all happen server-side in
 * fn_request_login_otp (supabase/migrations/20261004000003_server_side_email_dispatch.sql).
 * The OTP value and the Brevo API key never reach the browser.
 * Reference: docs/Security.md, docs/DATA.md
 */

import { getSupabase } from '../lib/supabaseClient.js';

export const auth2faApi = {
  /**
   * Requests a 6-digit OTP for the currently signed-in user (session from the password step).
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async requestOtp() {
    const sb = getSupabase();
    if (!sb) {
      return { success: false, error: 'Database connection unavailable.' };
    }

    const { data, error } = await sb.rpc('fn_request_login_otp');
    if (error) {
      console.error('[auth2faApi] fn_request_login_otp error:', error);
      return { success: false, error: error.message };
    }
    return data || { success: false, error: 'Empty response from OTP service.' };
  },

  /**
   * Verifies the user-entered 6-digit OTP against the stored code in the users table
   * @param {string} userId - User UUID
   * @param {string} enteredOtp - 6-digit code entered by user
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async verifyOtp(userId, enteredOtp) {
    const sb = getSupabase();
    const cleanOtp = (enteredOtp || '').trim();

    if (!sb) {
      return { success: false, error: 'Database connection unavailable.' };
    }

    try {
      const { data, error } = await sb.rpc('fn_verify_user_otp', {
        p_user_id: userId,
        p_otp_code: cleanOtp
      });

      if (error) {
        console.error('[auth2faApi] fn_verify_user_otp error:', error);
        return { success: false, error: 'Verification service unavailable. Please try again.' };
      }

      if (data?.success) {
        return { success: true };
      }
      return { success: false, error: data?.error || 'Invalid verification code.' };
    } catch (err) {
      console.error('[auth2faApi] verifyOtp error:', err);
      return { success: false, error: 'An unexpected error occurred during OTP verification.' };
    }
  }
};
