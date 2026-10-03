/**
 * profileDropdown.js - Minimal Profile Dropdown Menu & Profile Credentials Modal
 * Bestlink College of the Philippines — Attendance Monitoring System (AMS)
 * 
 * Provides a minimal, compact dropdown menu offering:
 * 1. Profile (View personal & institutional credentials)
 * 2. Logout (Triggers institutional signout confirmation modal)
 * 
 * Dual-theme compliant (Light / Midnight Navy), WCAG 2.1 AA accessible, no emojis.
 */

import { openSignOutModal } from './signOutModal.js';

let dropdownEl = null;
let currentProfileBtn = null;
let currentUser = null;
let isDropdownOpen = false;
let listenersAttached = false;

/**
 * Initializes the profile dropdown menu on the appbar profile button
 * @param {Object} user - The authenticated user profile
 */
export function initProfileDropdown(user) {
  if (user) currentUser = user;
  const profileBtn = document.querySelector('.appbar .profile');
  if (!profileBtn) return;

  currentProfileBtn = profileBtn;
  profileBtn.setAttribute('aria-haspopup', 'menu');
  profileBtn.setAttribute('aria-expanded', 'false');
  profileBtn.setAttribute('title', 'Account Menu');
  profileBtn.style.cursor = 'pointer';

  // Toggle on click
  profileBtn.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    toggleProfileDropdown();
  };

  // Keyboard navigation on profile button
  profileBtn.onkeydown = (e) => {
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
      e.preventDefault();
      openProfileDropdown();
    }
  };

  // Global listeners for outside click and window events (attach only once)
  if (!listenersAttached) {
    document.addEventListener('click', handleOutsideClick);
    window.addEventListener('resize', handleReposition);
    window.addEventListener('scroll', handleReposition, true);
    window.addEventListener('keydown', handleGlobalKeydown);
    listenersAttached = true;
  }
}

/**
 * Toggles the profile dropdown
 */
export function toggleProfileDropdown() {
  if (isDropdownOpen) {
    closeProfileDropdown();
  } else {
    openProfileDropdown();
  }
}

/**
 * Opens and positions the profile dropdown
 */
export function openProfileDropdown() {
  if (!currentProfileBtn) {
    currentProfileBtn = document.querySelector('.appbar .profile');
    if (!currentProfileBtn) return;
  }

  if (!dropdownEl) {
    dropdownEl = document.createElement('div');
    dropdownEl.id = 'amsProfileDropdown';
    dropdownEl.setAttribute('role', 'menu');
    dropdownEl.setAttribute('aria-label', 'Profile options');
    dropdownEl.style.cssText = `
      position: fixed;
      width: 184px;
      z-index: 99990;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 11px;
      box-shadow: 0 10px 26px -4px rgba(13, 71, 161, 0.16), 0 3px 8px rgba(0, 0, 0, 0.05);
      overflow: hidden;
      user-select: none;
      display: none;
      opacity: 0;
      transform: translateY(-4px) scale(0.98);
      transition: opacity 0.14s ease-out, transform 0.14s cubic-bezier(0.16, 1, 0.3, 1);
    `;

    dropdownEl.addEventListener('click', (e) => {
      e.stopPropagation();
    });

    document.body.appendChild(dropdownEl);
  }

  renderDropdownContent(dropdownEl);
  positionDropdown(dropdownEl, currentProfileBtn);

  dropdownEl.style.display = 'block';
  // Force reflow for reliable transition
  void dropdownEl.offsetHeight;
  dropdownEl.style.opacity = '1';
  dropdownEl.style.transform = 'translateY(0) scale(1)';

  currentProfileBtn.setAttribute('aria-expanded', 'true');
  isDropdownOpen = true;

  // Focus first menu item without triggering page scroll
  setTimeout(() => {
    dropdownEl.querySelector('.profile-menu-item')?.focus({ preventScroll: true });
  }, 40);
}

/**
 * Closes the profile dropdown
 */
export function closeProfileDropdown() {
  if (!dropdownEl || !isDropdownOpen) return;

  dropdownEl.style.opacity = '0';
  dropdownEl.style.transform = 'translateY(-4px) scale(0.98)';

  setTimeout(() => {
    if (dropdownEl && !isDropdownOpen) dropdownEl.style.display = 'none';
  }, 140);

  if (currentProfileBtn) currentProfileBtn.setAttribute('aria-expanded', 'false');
  isDropdownOpen = false;
}

/**
 * Positions the dropdown smoothly right-aligned under the profile button
 */
function positionDropdown(dropdown, trigger) {
  if (!dropdown || !trigger) return;
  const rect = trigger.getBoundingClientRect();
  const dropdownWidth = 184;
  let left = rect.right - dropdownWidth;
  if (left < 12) left = 12;

  const top = rect.bottom + 6;

  dropdown.style.top = `${top}px`;
  dropdown.style.left = `${left}px`;
}

/**
 * Renders the minimal profile dropdown menu items (Profile, Logout)
 */
function renderDropdownContent(container) {
  const user = currentUser || {};
  const rawFirst = user.first_name || '';
  const isGenericAdmin = user.role === 'admin' && (!rawFirst || rawFirst === 'Elena' || rawFirst === 'Rosario');
  let fullName = isGenericAdmin
    ? 'Administrator'
    : (`${user.first_name || ''} ${user.last_name || ''}`.trim() || (user.role === 'admin' ? 'Administrator' : 'Juan Dela Cruz'));

  if (user.role === 'admin' && user.id) {
    try {
      const savedCustom = JSON.parse(localStorage.getItem(`ams_admin_custom_${user.id}`) || '{}');
      if (savedCustom.adminAccountTitle) {
        fullName = savedCustom.adminAccountTitle;
      }
    } catch (_) {}
  }
  const role = (user.role || 'Member').toLowerCase();
  const roleName = user.role === 'admin' ? 'System Admin' : (role.charAt(0).toUpperCase() + role.slice(1));
  const identifier = user.student_number || user.employee_number || 'ADM-2024-001';

  container.innerHTML = `
    <style>
      .profile-menu-item {
        display: flex;
        align-items: center;
        gap: 9px;
        width: 100%;
        padding: 8px 12px;
        font-size: 12.5px;
        font-weight: 500;
        color: var(--text-1);
        background: transparent;
        border: none;
        cursor: pointer;
        text-align: left;
        transition: background 0.12s ease, color 0.12s ease;
        outline: none;
        border-radius: 6px;
      }
      .profile-menu-item:hover, .profile-menu-item:focus-visible {
        background: var(--raised);
        color: var(--accent);
      }
      .profile-menu-item.logout-item {
        color: #ef4444;
      }
      .profile-menu-item.logout-item:hover, .profile-menu-item.logout-item:focus-visible {
        background: rgba(239, 68, 68, 0.08);
        color: #dc2626;
      }
    </style>

    <!-- Minimal Identity Header -->
    <div style="padding: 10px 12px 8px; border-bottom: 1px solid var(--border); background: var(--surface-hover);">
      <div style="font-size: 12.5px; font-weight: 700; color: var(--text-1); line-height: 1.25;" class="truncate">
        ${fullName}
      </div>
      <div style="font-size: 11px; color: var(--text-3); margin-top: 1px;" class="truncate">
        ${roleName} · ${identifier}
      </div>
    </div>

    <!-- Options List -->
    <div style="padding: 4px;">
      <!-- 1. Profile Option -->
      <button type="button" class="profile-menu-item" id="amsMenuProfile" role="menuitem">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
          <circle cx="12" cy="7" r="4"/>
        </svg>
        <span>Profile</span>
      </button>

      <!-- Minimal Divider -->
      <div style="border-top: 1px solid var(--border); margin: 3px 0;"></div>

      <!-- 2. Logout Option -->
      <button type="button" class="profile-menu-item logout-item" id="amsMenuLogout" role="menuitem">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
          <polyline points="16 17 21 12 16 7"/>
          <line x1="21" y1="12" x2="9" y2="12"/>
        </svg>
        <span>Logout</span>
      </button>
    </div>
  `;

  // Bind menu item clicks
  container.querySelector('#amsMenuProfile')?.addEventListener('click', () => {
    closeProfileDropdown();

    const path = window.location.pathname.toLowerCase();
    const role = (currentUser?.role || '').toLowerCase();

    if (path.includes('/student/') || role === 'student') {
      const target = path.includes('/student/') ? 'profile.html' : '../student/profile.html';
      window.location.href = target;
    } else if (path.includes('/teacher/') || role === 'teacher') {
      const target = path.includes('/teacher/') ? 'profile.html' : '../teacher/profile.html';
      window.location.href = target;
    } else {
      const target = path.includes('/admin/') ? 'profile.html' : '../admin/profile.html';
      window.location.href = target;
    }
  });

  container.querySelector('#amsMenuLogout')?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    closeProfileDropdown();
    openSignOutModal(currentUser);
  });
}

/**
 * Outside click handler to dismiss dropdown
 */
function handleOutsideClick(e) {
  if (!isDropdownOpen || !dropdownEl) return;
  if (currentProfileBtn && currentProfileBtn.contains(e.target)) return;
  if (dropdownEl.contains(e.target)) return;
  closeProfileDropdown();
}

/**
 * Repositions dropdown when window resizes or scrolls
 */
function handleReposition() {
  if (isDropdownOpen && dropdownEl && currentProfileBtn) {
    positionDropdown(dropdownEl, currentProfileBtn);
  }
}

/**
 * Global keyboard accessibility
 */
function handleGlobalKeydown(e) {
  if (!isDropdownOpen || !dropdownEl) return;

  if (e.key === 'Escape') {
    e.preventDefault();
    closeProfileDropdown();
    currentProfileBtn?.focus();
    return;
  }

  const items = Array.from(dropdownEl.querySelectorAll('.profile-menu-item'));
  const currentIndex = items.indexOf(document.activeElement);

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    const nextIdx = (currentIndex + 1) % items.length;
    items[nextIdx]?.focus();
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    const prevIdx = (currentIndex - 1 + items.length) % items.length;
    items[prevIdx]?.focus();
  }
}

/**
 * Opens a minimal institutional Profile Credentials Modal
 */
export function openProfileModal(user = {}) {
  const existing = document.getElementById('amsProfileModalOverlay');
  if (existing) existing.remove();

  const fullName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'Juan Dela Cruz';
  const role = (user.role || 'Member').toLowerCase();
  const roleName = role.charAt(0).toUpperCase() + role.slice(1);
  const identifier = user.student_number || user.employee_number || 's230110001';
  const section = user.section_name || '31001';
  const email = user.email || `${identifier.toLowerCase()}@bcp.edu.ph`;
  const initials = `${(user.first_name || 'U')[0]}${(user.last_name || '')[0] || ''}`.toUpperCase();

  const overlay = document.createElement('div');
  overlay.id = 'amsProfileModalOverlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'profileModalTitle');

  overlay.style.cssText = `
    position: fixed;
    inset: 0;
    z-index: 99999;
    background: rgba(7, 19, 36, 0.7);
    backdrop-filter: blur(5px);
    -webkit-backdrop-filter: blur(5px);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
    opacity: 0;
    transition: opacity 0.18s ease-out;
  `;

  overlay.innerHTML = `
    <div class="profile-modal-card" style="
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 14px;
      box-shadow: 0 20px 40px -10px rgba(13, 71, 161, 0.22);
      width: 100%;
      max-width: 400px;
      overflow: hidden;
      transform: scale(0.96) translateY(4px);
      transition: transform 0.18s cubic-bezier(0.16, 1, 0.3, 1);
    ">
      <!-- Header -->
      <div style="display: flex; align-items: center; justify-content: space-between; padding: 14px 18px; border-bottom: 1px solid var(--border);">
        <div style="display: flex; align-items: center; gap: 8px;">
          <div style="width: 28px; height: 28px; border-radius: 7px; background: rgba(33, 150, 243, 0.12); color: var(--accent); display: flex; align-items: center; justify-content: center;">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
              <circle cx="12" cy="7" r="4"/>
            </svg>
          </div>
          <h2 id="profileModalTitle" style="margin: 0; font-size: 14.5px; font-weight: 700; color: var(--text-1);">
            User Profile
          </h2>
        </div>
        <button type="button" id="btnCloseProfileModal" aria-label="Close" style="background: none; border: none; color: var(--text-3); cursor: pointer; padding: 5px; border-radius: 6px; display: flex; align-items: center; justify-content: center;">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      <!-- Body -->
      <div style="padding: 18px 20px;">
        <div style="display: flex; align-items: center; gap: 14px; margin-bottom: 16px; padding-bottom: 14px; border-bottom: 1px solid var(--border);">
          <div style="width: 48px; height: 48px; border-radius: 12px; background: linear-gradient(135deg, var(--ch-900) 0%, var(--ch-500) 100%); color: #ffffff; display: flex; align-items: center; justify-content: center; font-size: 18px; font-weight: 800; box-shadow: 0 4px 12px rgba(33, 150, 243, 0.25);">
            ${initials}
          </div>
          <div style="min-width: 0;">
            <h3 style="margin: 0; font-size: 15.5px; font-weight: 700; color: var(--text-1); line-height: 1.25;" class="truncate">${fullName}</h3>
            <div style="display: flex; align-items: center; gap: 6px; margin-top: 3px;">
              <span style="font-size: 10.5px; font-weight: 700; text-transform: uppercase; padding: 2px 7px; border-radius: 4px; background: rgba(33, 150, 243, 0.12); color: var(--accent);">
                ${roleName}
              </span>
              <span style="font-size: 11px; color: var(--text-3); font-family: monospace;" class="truncate">
                ${identifier}
              </span>
            </div>
          </div>
        </div>

        <!-- Details Grid -->
        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; font-size: 12px;">
          <div style="background: var(--raised); padding: 10px 12px; border-radius: 8px; border: 1px solid var(--border);">
            <div style="font-size: 10.5px; font-weight: 600; color: var(--text-3); text-transform: uppercase;">Section / Unit</div>
            <div style="font-weight: 700; color: var(--text-1); margin-top: 2px;">${section}</div>
          </div>

          <div style="background: var(--raised); padding: 10px 12px; border-radius: 8px; border: 1px solid var(--border);">
            <div style="font-size: 10.5px; font-weight: 600; color: var(--text-3); text-transform: uppercase;">Status</div>
            <div style="font-weight: 700; color: #10B981; margin-top: 2px;">Active Ingress</div>
          </div>

          <div style="background: var(--raised); padding: 10px 12px; border-radius: 8px; border: 1px solid var(--border); grid-column: span 2;">
            <div style="font-size: 10.5px; font-weight: 600; color: var(--text-3); text-transform: uppercase;">Institutional Email</div>
            <div style="font-weight: 600; color: var(--text-1); margin-top: 2px;" class="truncate">${email}</div>
          </div>
        </div>
      </div>

      <!-- Footer -->
      <div style="display: flex; align-items: center; justify-content: flex-end; padding: 12px 18px; border-top: 1px solid var(--border); background: var(--surface-hover);">
        <button type="button" id="btnProfileModalDone" style="background: linear-gradient(135deg, var(--ch-900) 0%, var(--ch-500) 100%); color: #ffffff; border: none; font-size: 12px; font-weight: 600; padding: 7px 18px; border-radius: 7px; cursor: pointer;">
          Close
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const card = overlay.querySelector('.profile-modal-card');
  const closeBtn = overlay.querySelector('#btnCloseProfileModal');
  const doneBtn = overlay.querySelector('#btnProfileModalDone');

  requestAnimationFrame(() => {
    overlay.style.opacity = '1';
    if (card) card.style.transform = 'scale(1) translateY(0)';
  });

  const close = () => {
    overlay.style.opacity = '0';
    if (card) card.style.transform = 'scale(0.96) translateY(4px)';
    setTimeout(() => overlay.remove(), 180);
  };

  closeBtn?.addEventListener('click', close);
  doneBtn?.addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
}
