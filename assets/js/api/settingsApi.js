/**
 * settingsApi.js - System settings, cutoffs, SMS templates & academic calendar service
 * Bestlink College of the Philippines - Attendance Monitoring System (AMS)
 */

import { getSupabase } from '../lib/supabaseClient.js';

export const settingsApi = {
  /**
   * Fetches key-value system settings
   */
  async getSettings() {
    const sb = getSupabase();
    if (!sb) {
      return {
        morning_late_cutoff: '08:00',
        morning_absent_cutoff: '09:00',
        afternoon_late_cutoff: '13:00',
        afternoon_absent_cutoff: '14:00',
        anti_passback_cooldown_min: '5',
        awards_min_attendance_rate: '98.0',
        awards_max_excused_slips: '2',
        sms_notifications_enabled: 'true'
      };
    }

    try {
      const { data, error } = await sb.from('system_settings').select('setting_key, setting_value');
      if (error) throw error;

      const settingsMap = {};
      (data || []).forEach(item => {
        settingsMap[item.setting_key] = item.setting_value;
      });
      return settingsMap;
    } catch (err) {
      console.warn('[AMS API] getSettings fallback:', err);
      return {
        morning_late_cutoff: '08:00',
        morning_absent_cutoff: '09:00',
        afternoon_late_cutoff: '13:00',
        afternoon_absent_cutoff: '14:00',
        anti_passback_cooldown_min: '5',
        awards_min_attendance_rate: '98.0',
        awards_max_excused_slips: '2',
        sms_notifications_enabled: 'true'
      };
    }
  },

  /**
   * Updates multiple setting keys
   */
  async updateSettings(settingsMap) {
    const sb = getSupabase();
    if (!sb) throw new Error('Supabase client unavailable');

    const updates = Object.entries(settingsMap).map(([setting_key, setting_value]) => ({
      setting_key,
      setting_value: String(setting_value),
      updated_at: new Date().toISOString()
    }));

    const { data, error } = await sb
      .from('system_settings')
      .upsert(updates, { onConflict: 'setting_key' });

    if (error) throw error;
    return data;
  },

  /**
   * Fetches academic calendar holidays
   */
  async getHolidays() {
    const sb = getSupabase();
    if (!sb) return [];

    try {
      const { data, error } = await sb
        .from('holidays')
        .select('*')
        .order('holiday_date', { ascending: true });

      if (error) throw error;
      return data || [];
    } catch (err) {
      console.error('[AMS API] getHolidays error:', err);
      return [];
    }
  },

  /**
   * Adds a new institutional holiday
   */
  async addHoliday(holidayData) {
    const sb = getSupabase();
    if (!sb) throw new Error('Supabase client unavailable');

    const { data, error } = await sb
      .from('holidays')
      .insert([holidayData])
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Deletes a holiday
   */
  async deleteHoliday(id) {
    const sb = getSupabase();
    if (!sb) throw new Error('Supabase client unavailable');

    const { error } = await sb.from('holidays').delete().eq('id', id);
    if (error) throw error;
    return true;
  }
};
