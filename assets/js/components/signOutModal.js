/**
 * signOutModal.js - Accessible Institutional Sign Out Modal Form
 * Bestlink College of the Philippines — Attendance Monitoring System (AMS)
 * 
 * Replaces native browser alert/confirm with an institutional confirmation modal.
 * Dual-theme compliant (Light / Midnight Navy), WCAG 2.1 AA accessible, no emojis.
 */

import { logout } from '../lib/auth.js';

export function openSignOutModal(userProfile = null) {
  // If modal already open, focus it
  const existing = document.getElementById('amsSignOutModal');
  if (existing) {
    existing.querySelector('.signout-confirm-btn')?.focus();
    return;
  }

  // 1. Build modal elements
  const overlay = document.createElement('div');
  overlay.id = 'amsSignOutModal';
  overlay.className = 'ams-signout-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'signoutTitle');
  overlay.setAttribute('aria-describedby', 'signoutDesc');

  overlay.style.cssText = `
    position: fixed;
    inset: 0;
    z-index: 99999;
    background: rgba(7, 19, 36, 0.68);
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
    opacity: 0;
    transition: opacity 0.22s ease-out;
  `;

  overlay.innerHTML = `
    <style>
      .ams-signout-card button:focus-visible {
        outline: 2px solid var(--accent);
        outline-offset: 2px;
      }
      .signout-close-btn:hover {
        background: var(--raised) !important;
        color: var(--text-1) !important;
      }
      .signout-confirm-btn:hover:not(:disabled) {
        background: #dc2626 !important;
        border-color: #b91c1c !important;
        box-shadow: 0 4px 12px rgba(220, 38, 38, 0.4) !important;
      }
    </style>
    <div class="ams-signout-card" style="
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 15px;
      box-shadow: 0 18px 44px -8px rgba(13, 71, 161, 0.22), 0 4px 14px rgba(0, 0, 0, 0.08);
      width: 100%;
      max-width: 340px;
      overflow: hidden;
      transform: scale(0.95) translateY(6px);
      transition: transform 0.22s cubic-bezier(0.16, 1, 0.3, 1);
    ">
      <!-- Modal Header -->
      <div style="
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 16px 18px;
        border-bottom: 1px solid var(--border);
      ">
        <div style="display: flex; align-items: center; gap: 10px;">
          <div style="
            width: 32px;
            height: 32px;
            border-radius: 8px;
            background: rgba(239, 68, 68, 0.12);
            color: #ef4444;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
          ">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
              <polyline points="16 17 21 12 16 7"></polyline>
              <line x1="21" y1="12" x2="9" y2="12"></line>
            </svg>
          </div>
          <h2 id="signoutTitle" style="margin: 0; font-size: 15px; font-weight: 700; color: var(--text-1); letter-spacing: -0.01em;">
            Confirm Logout
          </h2>
        </div>

        <button type="button" class="signout-close-btn" aria-label="Close dialog" style="
          background: none;
          border: none;
          color: var(--text-3);
          cursor: pointer;
          padding: 5px;
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background 0.15s, color 0.15s;
        ">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>

      <!-- Modal Body Form -->
      <form id="amsSignOutForm" style="margin: 0;">
        <div style="padding: 24px 20px 22px; text-align: center;">
          <p id="signoutDesc" style="
            margin: 0;
            font-size: 13px;
            line-height: 1.55;
            color: var(--text-2);
          ">
            Are you sure you want to log out of your account? You will be signed out from this session and returned to the sign-in screen.
          </p>
        </div>

        <!-- Modal Footer Actions (Centered in the middle) -->
        <div style="
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 16px 18px 22px;
          border-top: 1px solid var(--border);
          background: var(--surface-hover);
        ">
          <button type="submit" class="signout-confirm-btn" style="
            background: #ef4444;
            border: 1px solid #dc2626;
            color: #ffffff;
            font-size: 13px;
            font-weight: 600;
            padding: 9px 32px;
            border-radius: 8px;
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 7px;
            box-shadow: 0 2px 8px rgba(239, 68, 68, 0.3);
            transition: all 0.15s ease;
          ">
            <svg class="signout-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
              <polyline points="16 17 21 12 16 7"></polyline>
              <line x1="21" y1="12" x2="9" y2="12"></line>
            </svg>
            <span class="btn-text">Logout</span>
          </button>
        </div>
      </form>
    </div>
  `;

  document.body.appendChild(overlay);

  const card = overlay.querySelector('.ams-signout-card');
  const closeBtn = overlay.querySelector('.signout-close-btn');
  const confirmBtn = overlay.querySelector('.signout-confirm-btn');
  const form = overlay.querySelector('#amsSignOutForm');

  // Trigger entrance transition
  requestAnimationFrame(() => {
    overlay.style.opacity = '1';
    if (card) card.style.transform = 'scale(1) translateY(0)';
  });

  // Focus confirm button by default
  confirmBtn?.focus();

  // Close function with exit transition
  const closeModal = () => {
    overlay.style.opacity = '0';
    if (card) card.style.transform = 'scale(0.95) translateY(6px)';
    window.removeEventListener('keydown', handleKeyDown);
    setTimeout(() => {
      overlay.remove();
    }, 220);
  };

  // Keyboard navigation: Escape closes modal
  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeModal();
    }
  };
  window.addEventListener('keydown', handleKeyDown);

  // Close triggers (X button and clicking outside backdrop)
  closeBtn?.addEventListener('click', closeModal);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      closeModal();
    }
  });

  // Form submit -> execute logout
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Disable buttons and show loading state
    if (confirmBtn) {
      confirmBtn.disabled = true;
      confirmBtn.style.opacity = '0.85';
      confirmBtn.style.cursor = 'not-allowed';
      const textSpan = confirmBtn.querySelector('.btn-text');
      if (textSpan) textSpan.textContent = 'Logging out...';
      const icon = confirmBtn.querySelector('.signout-icon');
      if (icon) {
        icon.outerHTML = `
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="animation: spin 0.8s linear infinite;">
            <circle cx="12" cy="12" r="10" stroke-opacity="0.25"></circle>
            <path d="M12 2a10 10 0 0 1 10 10" stroke-linecap="round"></path>
          </svg>
        `;
      }
    }
    if (closeBtn) closeBtn.disabled = true;

    try {
      await logout();
    } catch (err) {
      console.error('[AMS SignOut] Error logging out:', err);
      window.location.href = '/index.html';
    }
  });
}
