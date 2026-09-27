// Bestlink College of the Philippines — Attendance Monitoring System (AMS)
// Supabase Client Singleton Helper
// Authoritative Reference: docs/UI-UX_BackendSpec.md, docs/Security.md

// Default configuration with browser runtime support and fallback storage
const DEFAULT_SUPABASE_URL = 'https://mock-bcp-ams.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.mock_key';

// Read from window runtime config if injected, or local storage, or default
const supabaseUrl = window.__AMS_CONFIG__?.SUPABASE_URL || localStorage.getItem('ams_supabase_url') || DEFAULT_SUPABASE_URL;
const supabaseAnonKey = window.__AMS_CONFIG__?.SUPABASE_ANON_KEY || localStorage.getItem('ams_supabase_anon_key') || DEFAULT_SUPABASE_ANON_KEY;

let clientInstance = null;

export function getSupabase() {
  if (clientInstance) {
    return clientInstance;
  }

  if (typeof window.supabase !== 'undefined' && typeof window.supabase.createClient === 'function') {
    clientInstance = window.supabase.createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true
      }
    });
    return clientInstance;
  }

  // Defensive fallback stub if Supabase CDN script hasn't loaded yet
  console.warn('[AMS SupabaseClient] @supabase/supabase-js CDN not yet detected on window.');
  return null;
}

export const supabase = getSupabase();
