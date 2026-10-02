/**
 * modal.js - Accessible institutional modal helper
 * Bestlink College of the Philippines - Attendance Monitoring System (AMS)
 */

export class Modal {
  /**
   * @param {Object} options
   * @param {string} options.id - Modal container ID
   * @param {string} options.title - Modal title
   * @param {string} options.content - HTML content inside modal body
   * @param {Array<{label: string, class?: string, onClick: Function}>} [options.actions]
   */
  static open({ id = 'ams-modal', title = '', content = '', actions = [], maxWidth = '520px' }) {
    // Remove existing modal if any
    Modal.close(id);

    const overlay = document.createElement('div');
    overlay.id = id;
    overlay.className = 'ams-modal-overlay';
    overlay.style.cssText = `
      position: fixed;
      inset: 0;
      background: rgba(7, 19, 36, 0.65);
      backdrop-filter: blur(4px);
      z-index: 9998;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
      opacity: 0;
      transition: opacity 0.2s ease;
    `;

    const dialog = document.createElement('div');
    dialog.className = 'ams-modal-dialog';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.style.cssText = `
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 14px;
      box-shadow: 0 16px 40px rgba(13, 71, 161, 0.2);
      width: 100%;
      max-width: ${maxWidth};
      max-height: 90vh;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      transform: scale(0.95);
      transition: transform 0.2s ease;
    `;

    // Header
    const header = document.createElement('div');
    header.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 18px 22px;
      border-bottom: 1px solid var(--border);
    `;
    header.innerHTML = `
      <h3 style="margin:0; font-size:16px; font-weight:700; color:var(--text-1);">${title}</h3>
      <button type="button" class="modal-close-btn" style="background:none; border:none; color:var(--text-3); cursor:pointer; padding:4px; display:flex; align-items:center; border-radius:6px;">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
      </button>
    `;

    // Body
    const body = document.createElement('div');
    body.className = 'ams-modal-body';
    body.style.cssText = `
      padding: 22px;
      flex: 1;
      color: var(--text-2);
      font-size: 13.5px;
      line-height: 1.5;
    `;
    body.innerHTML = content;

    // Footer
    const footer = document.createElement('div');
    footer.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 10px;
      padding: 16px 22px;
      border-top: 1px solid var(--border);
      background: var(--surface-hover);
    `;

    // Add buttons
    actions.forEach((btnConfig) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = btnConfig.class || 'pillbtn';
      btn.textContent = btnConfig.label;
      btn.style.cssText = `
        padding: 8px 16px;
        border-radius: 8px;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
      `;
      btn.addEventListener('click', (e) => {
        if (typeof btnConfig.onClick === 'function') {
          btnConfig.onClick(e, overlay);
        }
      });
      footer.appendChild(btn);
    });

    dialog.appendChild(header);
    dialog.appendChild(body);
    if (actions.length > 0) {
      dialog.appendChild(footer);
    }

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    // Close handlers
    const closeBtn = header.querySelector('.modal-close-btn');
    closeBtn.addEventListener('click', () => Modal.close(id));
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) Modal.close(id);
    });

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        Modal.close(id);
        window.removeEventListener('keydown', handleKeyDown);
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    // Animate open
    requestAnimationFrame(() => {
      overlay.style.opacity = '1';
      dialog.style.transform = 'scale(1)';
    });

    return overlay;
  }

  static close(id = 'ams-modal') {
    const el = document.getElementById(id);
    if (el && el.parentNode) {
      el.style.opacity = '0';
      const dialog = el.querySelector('.ams-modal-dialog');
      if (dialog) dialog.style.transform = 'scale(0.95)';
      setTimeout(() => {
        if (el.parentNode) el.parentNode.removeChild(el);
      }, 200);
    }
  }

  static updateContent(id, newHtml) {
    const overlay = document.getElementById(id);
    if (!overlay) return;
    const body = overlay.querySelector('.ams-modal-body');
    if (body) {
      body.innerHTML = newHtml;
    }
  }
}
