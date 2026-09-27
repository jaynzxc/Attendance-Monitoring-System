// Bestlink College of the Philippines — Attendance Monitoring System (AMS)
// Realtime WebSocket Subscription Helper
// Authoritative Reference: docs/UI-UX_BackendSpec.md §3

import { getSupabase } from './supabaseClient.js';

/**
 * Subscribes to real-time attendance logs insertions
 * @param {Function} onInsert - Callback receiving new log payload
 * @returns {object|null} Active channel
 */
export function subscribeToAttendanceLogs(onInsert) {
  const sb = getSupabase();
  if (!sb) return null;

  const channel = sb
    .channel('realtime:attendance_logs')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'attendance_logs' },
      (payload) => {
        if (typeof onInsert === 'function') {
          onInsert(payload.new);
        }
      }
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.log('[AMS Realtime] Subscribed to live attendance logs feed.');
      }
    });

  return channel;
}

/**
 * Subscribes to scanner device telemetry updates (heartbeats, online/offline status)
 * @param {Function} onUpdate - Callback receiving updated device payload
 * @returns {object|null} Active channel
 */
export function subscribeToDeviceStatus(onUpdate) {
  const sb = getSupabase();
  if (!sb) return null;

  const channel = sb
    .channel('realtime:scan_devices')
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'scan_devices' },
      (payload) => {
        if (typeof onUpdate === 'function') {
          onUpdate(payload.new);
        }
      }
    )
    .subscribe();

  return channel;
}

/**
 * Unsubscribes and cleans up a Realtime channel
 * @param {object} channel 
 */
export function unsubscribeChannel(channel) {
  const sb = getSupabase();
  if (sb && channel) {
    sb.removeChannel(channel);
  }
}
