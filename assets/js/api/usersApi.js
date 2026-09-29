/**
 * usersApi.js - User directory service (Students, Teachers, Admins)
 * Bestlink College of the Philippines - Attendance Monitoring System (AMS)
 * Strictly soft deactivation (status = 'inactive') - Never hard delete
 */

import { getSupabase } from '../lib/supabaseClient.js';

export const usersApi = {
  /**
   * Fetches paginated users with optional role, section, and search filtering
   */
  async getUsers({ role = null, sectionId = null, search = '', status = 'active', page = 0, pageSize = 20 } = {}) {
    const sb = getSupabase();
    if (!sb) return { data: [], count: 0 };

    try {
      let query = sb
        .from('users')
        .select(`
          id,
          student_number,
          employee_number,
          first_name,
          last_name,
          email,
          role,
          status,
          created_at,
          rfid_cards ( id, card_uid, is_active ),
          parent_contacts ( id, full_name, relationship, mobile_number ),
          student_sections ( sections ( id, name, grade_level ) ),
          teacher_sections ( sections ( id, name ), subject )
        `, { count: 'exact' });

      if (role) {
        query = query.eq('role', role);
      }
      if (status) {
        query = query.eq('status', status);
      }
      if (search) {
        query = query.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,student_number.ilike.%${search}%,employee_number.ilike.%${search}%,email.ilike.%${search}%`);
      }

      query = query
        .order('last_name', { ascending: true })
        .range(page * pageSize, (page + 1) * pageSize - 1);

      const { data, count, error } = await query;
      if (error) throw error;

      return { data: data || [], count: count || 0 };
    } catch (err) {
      console.error('[AMS API] getUsers error:', err);
      return { data: [], count: 0 };
    }
  },

  /**
   * Fetches a single user with relations
   */
  async getUserById(id) {
    const sb = getSupabase();
    if (!sb) return null;

    try {
      const { data, error } = await sb
        .from('users')
        .select(`
          *,
          rfid_cards (*),
          qr_codes (*),
          parent_contacts (*),
          student_sections ( sections (*) ),
          teacher_sections ( sections (*), subject )
        `)
        .eq('id', id)
        .single();

      if (error) throw error;
      return data;
    } catch (err) {
      console.error('[AMS API] getUserById error:', err);
      return null;
    }
  },

  /**
   * Creates a new user record
   */
  async createUser(userData) {
    const sb = getSupabase();
    if (!sb) throw new Error('Supabase client unavailable');

    const { data, error } = await sb
      .from('users')
      .insert([userData])
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Updates an existing user record
   */
  async updateUser(id, updates) {
    const sb = getSupabase();
    if (!sb) throw new Error('Supabase client unavailable');

    const { data, error } = await sb
      .from('users')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Soft-deactivates a user (status = 'inactive')
   * Invariant: Never perform DELETE FROM users to preserve historical logs
   */
  async deactivateUser(id) {
    return this.updateUser(id, { status: 'inactive' });
  },

  /**
   * Assigns or updates an RFID card credential
   */
  async assignRfidCard(userId, cardUid) {
    const sb = getSupabase();
    if (!sb) throw new Error('Supabase client unavailable');

    // Deactivate previous cards
    await sb
      .from('rfid_cards')
      .update({ is_active: false })
      .eq('user_id', userId);

    // Insert new card
    const { data, error } = await sb
      .from('rfid_cards')
      .insert([{
        user_id: userId,
        card_uid: cardUid.toUpperCase().trim(),
        is_active: true
      }])
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Generates or rotates a QR fallback token
   */
  async rotateQrToken(userId) {
    const sb = getSupabase();
    if (!sb) throw new Error('Supabase client unavailable');

    // Deactivate older tokens
    await sb
      .from('qr_codes')
      .update({ is_active: false })
      .eq('user_id', userId);

    const token = 'QR-' + Math.random().toString(36).substring(2, 10).toUpperCase() + '-' + Date.now().toString(36).toUpperCase();

    const { data, error } = await sb
      .from('qr_codes')
      .insert([{
        user_id: userId,
        code_value: token,
        is_active: true
      }])
      .select()
      .single();

    if (error) throw error;
    return { token, ...data };
  }
};
