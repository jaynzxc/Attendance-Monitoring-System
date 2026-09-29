// Bestlink College of the Philippines — Attendance Monitoring System (AMS)
// Supabase Client Singleton Helper
// Authoritative Reference: docs/UI-UX_BackendSpec.md, docs/Security.md

import { createClient as esmCreateClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// Default configuration with browser runtime support and fallback storage
const DEFAULT_SUPABASE_URL = 'https://lbgrhbayadehorjixibx.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY = 'sb_publishable_iKVipoPe2iik-q_jyP8eYA_Ow0izfzs';

// Read from window runtime config if injected, or local storage, or default
const isBrowser = typeof window !== 'undefined';
const supabaseUrl = (isBrowser && (window.__AMS_CONFIG__?.SUPABASE_URL || window.localStorage?.getItem('ams_supabase_url'))) || DEFAULT_SUPABASE_URL;
const supabaseAnonKey = (isBrowser && (window.__AMS_CONFIG__?.SUPABASE_ANON_KEY || window.localStorage?.getItem('ams_supabase_anon_key'))) || DEFAULT_SUPABASE_ANON_KEY;

let clientInstance = null;

export function isSupabaseConfigured() {
  return isBrowser &&
    Boolean(supabaseUrl) &&
    !supabaseUrl.includes('mock-bcp-ams') &&
    !supabaseUrl.includes('your-project-ref');
}

export function getSupabase() {
  if (clientInstance) {
    return clientInstance;
  }

  // If Supabase URL is placeholder, operate in local offline/mock mode
  if (!isSupabaseConfigured()) {
    return null;
  }

  const factory = (typeof window !== 'undefined' && window.supabase?.createClient) || esmCreateClient;

  if (typeof factory === 'function') {
    try {
      clientInstance = factory(supabaseUrl, supabaseAnonKey, {
        auth: {
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: true
        }
      });
      return clientInstance;
    } catch (err) {
      console.warn('[AMS SupabaseClient] Failed to initialize client instance:', err);
    }
  }

  console.warn('[AMS SupabaseClient] @supabase/supabase-js not detected.');
  return null;
}

export const supabase = getSupabase();
