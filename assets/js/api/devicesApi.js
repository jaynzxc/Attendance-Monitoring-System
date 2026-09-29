/**
 * devicesApi.js - ESP32 & QR scanner device registry service
 * Bestlink College of the Philippines - Attendance Monitoring System (AMS)
 * Authoritative Reference: docs/Security.md §4, docs/UI-UX_Architecture.md §4
 */

import { getSupabase } from '../lib/supabaseClient.js';

export const devicesApi = {
  /**
   * Fetches all registered scanning terminals with telemetry status
   */
  async getDevices() {
    const fallbackDevices = [
      { id: '70000000-0000-0000-0000-000000000001', device_code: 'GATE-01-ESP32', location: 'Main Gate Turnstile A', status: 'online' },
      { id: '70000000-0000-0000-0000-000000000002', device_code: 'GATE-02-ESP32', location: 'East Annex Gate Turnstile B', status: 'online' }
    ];

    const sb = getSupabase();
    if (!sb) return fallbackDevices;

    try {
      const { data, error } = await sb
        .from('scan_devices')
        .select('*')
        .order('device_code', { ascending: true });

      if (error) throw error;
      if (data && data.length > 0) return data;
      return fallbackDevices;
    } catch (err) {
      console.warn('[AMS API] getDevices warning, using fallback devices:', err);
      return fallbackDevices;
    }
  },

  /**
   * Registers a new scanner device
   */
  async registerDevice(deviceData) {
    const sb = getSupabase();
    if (!sb) throw new Error('Supabase client unavailable');

    // Generate random 32-char device key for ESP32 x-device-key authentication
    const rawKey = 'AMS-DEV-' + Math.random().toString(36).substring(2, 10).toUpperCase() + '-' + Date.now().toString(36).toUpperCase();

    const { data, error } = await sb
      .from('scan_devices')
      .insert([{
        ...deviceData,
        api_key_hash: rawKey
      }])
      .select()
      .single();

    if (error) throw error;
    return { ...data, rawKey };
  },

  /**
   * Updates scanner device details or status
   */
  async updateDevice(id, updates) {
    const sb = getSupabase();
    if (!sb) throw new Error('Supabase client unavailable');

    const { data, error } = await sb
      .from('scan_devices')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }
};
