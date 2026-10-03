// Bestlink College of the Philippines — Attendance Monitoring System (AMS)
// Authentication & Session Management Module
// Authoritative Reference: docs/Security.md §2, docs/UI-UX_BackendSpec.md §1

import { getSupabase } from './supabaseClient.js';

/**
 * Authenticates a user with email, student number, or teacher ID and password
 * @param {string} identifier (email, student_number e.g. s230110001, or teacher_id e.g. t230110001)
 * @param {string} password 
 * @returns {Promise<{user: object, role: string, error: string|null}>}
 */
export async function login(identifier, password) {
  const sb = getSupabase();
  if (!sb) {
    return { user: null, role: null, error: 'Database connection unavailable.' };
  }

  try {
    let emailToAuth = (identifier || '').trim().toLowerCase();

    // If identifier is not an email address, lookup email by student_number or employee_number
    if (!emailToAuth.includes('@')) {
      const { data: matchedUser } = await sb
        .from('users')
        .select('email')
        .or(`student_number.ilike.${emailToAuth},employee_number.ilike.${emailToAuth}`)
        .maybeSingle();

      if (matchedUser?.email) {
        emailToAuth = matchedUser.email;
      }
    }

    const { data: authData, error: authError } = await sb.auth.signInWithPassword({
      email: emailToAuth,
      password
    });

    if (authError) {
      return { user: null, role: null, error: authError.message };
    }

    // Resolve institutional role from public.users table
    const { data: userProfile, error: profileError } = await sb
      .from('users')
      .select('id, role, first_name, last_name, email, status, student_number, employee_number')
      .eq('id', authData.user.id)
      .single();

    if (profileError || !userProfile) {
      // If profile not yet synced, fallback to user metadata
      const fallbackRole = authData.user.user_metadata?.role || 'student';
      return {
        user: authData.user,
        role: fallbackRole,
        error: null
      };
    }

    if (userProfile.status === 'inactive') {
      await sb.auth.signOut();
      return { user: null, role: null, error: 'Account has been deactivated. Please contact the Registrar.' };
    }

    return {
      user: userProfile,
      role: userProfile.role,
      error: null
    };
  } catch (err) {
    console.error('[AMS Auth] Login exception:', err);
    return { user: null, role: null, error: 'An unexpected authentication error occurred.' };
  }
}

/**
 * Terminates the active session and clears browser tokens
 */
export async function logout() {
  const sb = getSupabase();
  if (sb) {
    try {
      await sb.auth.signOut();
    } catch (e) {
      console.warn('[AMS Auth] Sign out error:', e);
    }
  }
  sessionStorage.removeItem('ams_cached_role');
  sessionStorage.removeItem('ams_cached_user');
  window.location.href = '/index.html';
}

/**
 * Returns current authenticated user and profile
 */
export async function getCurrentUser() {
  const sb = getSupabase();
  if (!sb) return null;

  try {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return null;

    const { data: profile } = await sb
      .from('users')
      .select('id, role, first_name, last_name, email, status, student_number, employee_number')
      .eq('id', user.id)
      .single();

    return profile || user;
  } catch (err) {
    console.error('[AMS Auth] Error getting current user:', err);
    return null;
  }
}

/**
 * Maps institutional roles to their primary portal dashboards
 * @param {string} role 
 * @returns {string} Target dashboard URL
 */
export function getRoleDashboardPath(role) {
  switch (role) {
    case 'admin':
      return '/admin/dashboard.html';
    case 'teacher':
      return '/teacher/dashboard.html';
    case 'student':
      return '/student/dashboard.html';
    default:
      return '/index.html';
  }
}
