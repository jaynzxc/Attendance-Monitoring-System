// Bestlink College of the Philippines — Attendance Monitoring System (AMS)
// Role-Based Access Control (RBAC) Client Guard & Layout Controller
// Authoritative Reference: docs/Security.md §3, docs/UI-UX_Architecture.md §3

import { getSupabase } from './supabaseClient.js';
import { getCurrentUser, logout } from './auth.js';
import { openSignOutModal } from '../components/signOutModal.js';
import { initNotifications, addNotification } from '../components/notifications.js';
import { initProfileDropdown } from '../components/profileDropdown.js';
import { initSessionTimeout } from './sessionTimeout.js';

export { openSignOutModal, initNotifications, addNotification, initProfileDropdown, initSessionTimeout };

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

  // Pre-bind layout bindings immediately with cached user profile
  // so appbar, profile dropdown, and buttons are instantly clickable on initial render
  const cachedUserStr = sessionStorage.getItem('ams_cached_user');
  if (cachedUserStr) {
    try {
      const cachedProfile = JSON.parse(cachedUserStr);
      if (cachedProfile) {
        initLayoutBindings(cachedProfile);
      }
    } catch (_) {}
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
      : { first_name: 'Administrator', last_name: '', role: 'admin' };

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
    const fallbackUserStr = sessionStorage.getItem('ams_cached_user');
    if (fallbackUserStr) {
      try { initLayoutBindings(JSON.parse(fallbackUserStr)); } catch (_) {}
    }
  }
}

/**
 * Binds user profile info, theme toggling, and logout actions to common layout elements
 * @param {object} user 
 */
export function initLayoutBindings(user) {
  // Auto-initialize idle session inactivity timeout monitor
  initSessionTimeout();

  // Populate profile names & roles if elements exist
  const nameEl = document.querySelector('.pf-name');
  const roleEl = document.querySelector('.pf-role');
  const avatarEl = document.querySelector('.pf-avatar');

  if (nameEl && user) {
    if (user.role === 'admin') {
      let adminTitle = 'Administrator';
      try {
        const savedCustom = JSON.parse(localStorage.getItem(`ams_admin_custom_${user.id}`) || '{}');
        if (savedCustom.adminAccountTitle) adminTitle = savedCustom.adminAccountTitle;
      } catch (_) {}
      nameEl.textContent = adminTitle;
    } else {
      nameEl.textContent = `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'User';
    }
  }

  if (roleEl && user) {
    const roleCapitalized = user.role ? user.role.charAt(0).toUpperCase() + user.role.slice(1) : 'Member';
    roleEl.textContent = roleCapitalized;
  }

  if (avatarEl && user) {
    const initials = user.role === 'admin'
      ? 'AD'
      : `${(user.first_name || 'U')[0]}${(user.last_name || '')[0] || ''}`.toUpperCase();
    avatarEl.textContent = initials;
  }

  // Initialize profile dropdown menu on appbar profile card (Profile, Settings, Logout)
  initProfileDropdown(user);

  // Bind logout modal form on explicit sign out triggers
  const signoutTriggers = document.querySelectorAll(
    '[data-action="signout"], [data-action="logout"], .logout-btn, #logoutBtn, #btnSignOut'
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

  // Initialize interactive in-app notification center on appbar bell
  initNotifications(user);

  // Initialize universal sidebar toggle across all modules and roles
  initSidebarToggle();
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

/**
 * Initializes universal sidebar toggle button and persistence across all modules & roles
 */
export function initSidebarToggle() {
  const layout = document.querySelector('.layout');
  const sidebar = document.querySelector('.sidebar');
  const appbar = document.querySelector('.appbar');
  if (!layout || !sidebar || !appbar) return;

  // 1. Ensure mobile backdrop exists
  let backdrop = document.getElementById('sidebarBackdrop');
  if (!backdrop) {
    backdrop = document.createElement('div');
    backdrop.id = 'sidebarBackdrop';
    backdrop.className = 'sidebar-backdrop';
    layout.prepend(backdrop);
  }

  // 2. Find or dynamically inject burger button into appbar on the left
  let toggleBtn = document.getElementById('sidebarToggleBtn');
  if (!toggleBtn) {
    // Derive module name from page
    const pageH1 = document.querySelector('.pagehead h1') || document.querySelector('h1');
    let moduleTitle = '';
    if (pageH1) {
      moduleTitle = pageH1.textContent.trim();
    } else {
      const parts = document.title.split(/—|–|-|&mdash;/);
      moduleTitle = parts[parts.length - 1].trim();
    }

    const leftContainer = document.createElement('div');
    leftContainer.style.cssText = 'display:flex; align-items:center; gap:12px; margin-right:auto;';
    leftContainer.innerHTML = `
      <button type="button" class="sidebar-toggle-btn" id="sidebarToggleBtn" aria-label="Toggle Sidebar Navigation" title="Toggle Sidebar">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="3" y1="6" x2="21" y2="6"></line>
          <line x1="3" y1="12" x2="21" y2="12"></line>
          <line x1="3" y1="18" x2="21" y2="18"></line>
        </svg>
      </button>
      <div style="display:flex; align-items:center; gap:8px;">
        <span style="font-size:13px; font-weight:700; color:var(--text-1);">${moduleTitle}</span>
      </div>
    `;

    appbar.prepend(leftContainer);
    toggleBtn = leftContainer.querySelector('#sidebarToggleBtn');
  }

  if (!toggleBtn) return;

  const updateUIState = (isCollapsed) => {
    toggleBtn.title = isCollapsed ? 'Expand Sidebar (Show Navigation)' : 'Collapse Sidebar (Maximize View)';
    toggleBtn.setAttribute('aria-expanded', isCollapsed ? 'false' : 'true');
    const wideBadge = document.getElementById('wideViewBadge');
    if (wideBadge) {
      if (isCollapsed) wideBadge.classList.remove('hidden');
      else wideBadge.classList.add('hidden');
    }
  };

  const toggleSidebar = () => {
    const isMobile = window.innerWidth <= 768;
    if (isMobile) {
      const isOpen = sidebar.classList.toggle('mobile-open');
      backdrop.classList.toggle('active', isOpen);
    } else {
      const isCollapsed = layout.classList.toggle('sidebar-collapsed');
      localStorage.setItem('ams_sidebar_collapsed', isCollapsed ? 'true' : 'false');
      updateUIState(isCollapsed);
      // Trigger resize for Chart.js, tables and grids
      window.dispatchEvent(new Event('resize'));
    }
  };

  // Restore saved collapse preference on desktop
  const savedState = localStorage.getItem('ams_sidebar_collapsed');
  if (window.innerWidth > 768 && savedState === 'true') {
    layout.classList.add('sidebar-collapsed');
    updateUIState(true);
  }

  toggleBtn.onclick = (e) => {
    e.preventDefault();
    toggleSidebar();
  };

  backdrop.onclick = () => {
    sidebar.classList.remove('mobile-open');
    backdrop.classList.remove('active');
  };

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      sidebar.classList.remove('mobile-open');
      backdrop.classList.remove('active');
    }
  });
}
