/**
 * toast.js - Institutional Toast Notification System
 * Bestlink College of the Philippines - Attendance Monitoring System (AMS)
 * Strictly zero emojis - SVG icons styled via Color Hunt tokens
 */

class ToastManager {
  constructor() {
    this.container = null;
    if (typeof document !== 'undefined') {
      this.init();
    }
  }

  init() {
    if (document.getElementById('ams-toast-container')) {
      this.container = document.getElementById('ams-toast-container');
      return;
    }

    this.container = document.createElement('div');
    this.container.id = 'ams-toast-container';
    this.container.setAttribute('aria-live', 'polite');
    this.container.style.cssText = `
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 9999;
      display: flex;
      flex-direction: column;
      gap: 10px;
      max-width: 380px;
      pointer-events: none;
    `;
    document.body.appendChild(this.container);
  }

  /**
   * Shows a toast notification
   * @param {string} message - Notification text
   * @param {'success'|'error'|'warning'|'info'} [type='info'] - Severity level
   * @param {number} [duration=4000] - Duration in ms before auto-dismiss
   */
  show(message, type = 'info', duration = 4000) {
    if (!this.container) this.init();

    const toast = document.createElement('div');
    toast.className = `ams-toast ams-toast-${type}`;
    toast.style.cssText = `
      pointer-events: auto;
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 16px;
      border-radius: 10px;
      font-size: 13px;
      font-weight: 500;
      box-shadow: 0 4px 16px rgba(13, 71, 161, 0.15);
      border: 1px solid var(--border);
      background: var(--surface);
      color: var(--text-1);
      opacity: 0;
      transform: translateY(10px);
      transition: opacity 0.25s ease, transform 0.25s ease;
    `;

    // SVG icon mapping (strictly no emojis)
    let iconSvg = '';
    let accentColor = 'var(--ch-500)';

    if (type === 'success') {
      accentColor = 'var(--present)';
      iconSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${accentColor}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>`;
    } else if (type === 'error') {
      accentColor = 'var(--absent)';
      iconSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${accentColor}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6M9 9l6 6"/></svg>`;
    } else if (type === 'warning') {
      accentColor = 'var(--late)';
      iconSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${accentColor}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4M12 17h.01"/></svg>`;
    } else {
      accentColor = 'var(--accent)';
      iconSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${accentColor}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>`;
    }

    toast.innerHTML = `
      <div style="flex-shrink:0; display:flex; align-items:center;">${iconSvg}</div>
      <div style="flex:1; line-height:1.35;">${message}</div>
      <button type="button" aria-label="Dismiss" style="background:none; border:none; color:var(--text-3); cursor:pointer; padding:2px; display:flex; align-items:center;">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
      </button>
    `;

    const closeBtn = toast.querySelector('button');
    closeBtn.addEventListener('click', () => this.dismiss(toast));

    this.container.appendChild(toast);

    // Trigger animation
    requestAnimationFrame(() => {
      toast.style.opacity = '1';
      toast.style.transform = 'translateY(0)';
    });

    if (duration > 0) {
      setTimeout(() => this.dismiss(toast), duration);
    }
  }

  dismiss(toast) {
    if (!toast || !toast.parentNode) return;
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-8px)';
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 250);
  }
}

export const toast = new ToastManager();

/**
 * Universal showToast helper used across AMS portal pages
 * Accepts either an options object { title, message, type, duration } or (message, type, duration)
 */
export function showToast(optionsOrMessage, type = 'info', duration = 4000) {
  if (typeof optionsOrMessage === 'object' && optionsOrMessage !== null) {
    const title = optionsOrMessage.title ? `<strong>${optionsOrMessage.title}</strong>` : '';
    const text = optionsOrMessage.message || optionsOrMessage.text || '';
    const body = title && text ? `${title}<div style="font-size:12px;margin-top:2px;">${text}</div>` : (title || text);
    const t = optionsOrMessage.type || 'info';
    const d = optionsOrMessage.duration || 4000;
    toast.show(body, t, d);
  } else {
    toast.show(String(optionsOrMessage), type, duration);
  }
}
