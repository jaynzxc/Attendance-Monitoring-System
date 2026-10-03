/**
 * emailNotificationsApi.js - Transactional Email Service
 * Handles Account Activation email dispatch.
 * Bestlink College of the Philippines - Attendance Monitoring System (AMS)
 *
 * Emails are rendered and sent server-side (fn_send_activation_email, see
 * supabase/migrations/20261004000003_server_side_email_dispatch.sql) so the Brevo
 * API key stays in Supabase Vault. The credentials email is sent by
 * fn_activate_user_account(p_token, p_origin) during activation.
 * Reference: docs/Security.md, docs/WORKFLOW.md
 */

import { getSupabase } from '../lib/supabaseClient.js';

const isBrowser = typeof window !== 'undefined';

export const emailNotificationsApi = {
  /**
   * Dispatches the Account Activation email for a newly created user (Admin only, enforced in DB).
   * @param {{ userId: string }} params
   */
  async sendActivationEmail({ userId }) {
    const sb = getSupabase();
    if (!sb) throw new Error('Database connection unavailable.');

    const { data, error } = await sb.rpc('fn_send_activation_email', {
      p_user_id: userId,
      p_origin: isBrowser ? window.location.origin : null
    });

    if (error) throw new Error(error.message);
    if (!data?.success) throw new Error(data?.error || 'Activation email dispatch failed.');
    return data;
  }
};
