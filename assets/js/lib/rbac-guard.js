// Bestlink College of the Philippines — Attendance Monitoring System (AMS)
// Role-Based Access Control (RBAC) Client Guard & Layout Controller
// Authoritative Reference: docs/Security.md §3, docs/UI-UX_Architecture.md §3

import { getSupabase } from './supabaseClient.js';
import { getCurrentUser, logout } from './auth.js';
import { openSignOutModal } from '../components/signOutModal.js';

export { openSignOutModal };

/**
 * Enforces role restriction for portal views
 * @param {string|string[]} allowedRoles - Single role or array of allowed roles
 */
export async function requireRole(allowedRoles) {
  const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];

  // 1. Fast check via sessionStorage cache for smooth render
  const cachedRole = sessionStorage.getItem('ams_cached_role');
  if (cachedRole && !roles.includes(cachedRole)) {
    window.location.replace('/shared/unauthorized.html');
    return;
  }

  // 2. Authoritative check via Supabase Auth
  const sb = getSupabase();
  if (!sb) {
    console.warn('[AMS RBAC] Supabase client unavailable, skipping live guard.');
    const userRole = roles[0];
    const defaultProfile = userRole === 'teacher'
      ? { first_name: 'Ricardo', last_name: 'Santos', role: 'teacher' }
      : userRole === 'student'
      ? { first_name: 'Juan', last_name: 'Dela Cruz', role: 'student' }
      : { first_name: 'Elena', last_name: 'Bautista', role: 'admin' };

    let profile = defaultProfile;
    const cachedUser = sessionStorage.getItem('ams_cached_user');
    if (cachedUser) {
      try { profile = JSON.parse(cachedUser); } catch (e) {}
    }
    initLayoutBindings(profile);
    return;
  }

  try {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) {
      window.location.replace('/index.html');
      return;
    }

    const profile = await getCurrentUser();
    if (!profile) {
      window.location.replace('/index.html');
      return;
    }

    if (!roles.includes(profile.role)) {
      window.location.replace('/shared/unauthorized.html');
      return;
    }

    // Cache verified profile for session
    sessionStorage.setItem('ams_cached_role', profile.role);
    sessionStorage.setItem('ams_cached_user', JSON.stringify(profile));

    // Bind layout components (Profile info, Logout, Theme toggle)
    initLayoutBindings(profile);
  } catch (err) {
    console.error('[AMS RBAC] Guard verification error:', err);
  }
}

/**
 * Binds user profile info, theme toggling, and logout actions to common layout elements
 * @param {object} user 
 */
export function initLayoutBindings(user) {
  // Populate profile names & roles if elements exist
  const nameEl = document.querySelector('.pf-name');
  const roleEl = document.querySelector('.pf-role');
  const avatarEl = document.querySelector('.pf-avatar');

  if (nameEl && user) {
    nameEl.textContent = `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'User';
  }

  if (roleEl && user) {
    const roleCapitalized = user.role ? user.role.charAt(0).toUpperCase() + user.role.slice(1) : 'Member';
    roleEl.textContent = roleCapitalized;
  }

  if (avatarEl && user) {
    const initials = `${(user.first_name || 'U')[0]}${(user.last_name || '')[0] || ''}`.toUpperCase();
    avatarEl.textContent = initials;
  }

  // Bind logout modal form on profile card and any sign out triggers
  const signoutTriggers = document.querySelectorAll(
    '.appbar .profile, [data-action="signout"], [data-action="logout"], .logout-btn, #logoutBtn, #btnSignOut'
  );
  signoutTriggers.forEach((trigger) => {
    trigger.setAttribute('title', 'Click to Sign Out');
    trigger.onclick = (e) => {
      e.preventDefault();
      openSignOutModal(user);
    };
  });

  // Attach global shortcut for easy invocation
  window.openSignOutModal = (customUser) => openSignOutModal(customUser || user);

  // Initialize theme toggle
  initThemeToggle();
}

/**
 * Initializes Light / Dark mode theme toggle
 */
export function initThemeToggle() {
  const toggleBtn = document.querySelector('.theme-toggle') || document.getElementById('themeToggle');
  const root = document.documentElement;

  // Restore saved theme preference
  const savedTheme = localStorage.getItem('ams_theme') || 'light';
  root.setAttribute('data-theme', savedTheme);

  if (toggleBtn) {
    toggleBtn.onclick = () => {
      root.classList.add('theme-transitioning');
      const currentTheme = root.getAttribute('data-theme') || 'light';
      const newTheme = currentTheme === 'light' ? 'dark' : 'light';
      root.setAttribute('data-theme', newTheme);
      localStorage.setItem('ams_theme', newTheme);

      window.setTimeout(() => {
        root.classList.remove('theme-transitioning');
      }, 260);

      // Trigger custom event for Chart.js theme redraw
      window.dispatchEvent(new CustomEvent('ams-theme-changed', { detail: { theme: newTheme } }));
    };
  }
}
