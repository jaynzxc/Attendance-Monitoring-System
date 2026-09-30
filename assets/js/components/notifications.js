/**
 * notifications.js - Institutional In-App Notifications Component
 * Bestlink College of the Philippines — Attendance Monitoring System (AMS)
 * Authoritative Reference: docs/UI-UX_Architecture.md §3, docs/PRD.md §3
 * 
 * Provides an interactive, dual-theme, accessible popover notification center
 * triggered by the appbar bell icon. No emojis; crisp vector SVGs only.
 */

const STORAGE_PREFIX = 'ams_notifications_v1';
let currentUser = null;
let activeFilter = 'all'; // 'all' | 'unread'
let isOpen = false;
let panelEl = null;

/**
 * Initializes notifications for the current authenticated user and binds the appbar bell.
 * @param {object} user - User profile object containing id and role
 */
export function initNotifications(user) {
  currentUser = user || { id: 'default', role: 'student', first_name: 'User' };
  const bell = document.querySelector('.appbar .bell');
  if (!bell) return;

  // Make bell accessible
  bell.setAttribute('aria-haspopup', 'dialog');
  bell.setAttribute('aria-expanded', 'false');
  bell.setAttribute('aria-label', 'Open notifications panel');

  // Update initial unread indicator on the bell
  updateBellBadge();

  // Bind bell click & keyboard triggers
  bell.onclick = (e) => {
    e.stopPropagation();
    toggleNotificationPanel();
  };

  bell.onkeydown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggleNotificationPanel();
    }
  };

  // Close panel on outside click
  document.addEventListener('click', (e) => {
    if (!isOpen || !panelEl) return;
    const path = e.composedPath ? e.composedPath() : [];
    const isInsidePanel = path.includes(panelEl) || panelEl.contains(e.target);
    const isInsideBell = path.includes(bell) || bell.contains(e.target);
    if (!isInsidePanel && !isInsideBell) {
      closeNotificationPanel();
    }
  });

  // Close on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isOpen) {
      closeNotificationPanel();
      bell.focus();
    }
  });

  // Reposition panel on window resize
  window.addEventListener('resize', () => {
    if (isOpen && panelEl && bell) {
      repositionPanel(panelEl, bell);
    }
  });

  // Expose global helper for other scripts/modules
  window.addAMSNotification = addNotification;
}

/**
 * Retrieves notifications list from localStorage or generates initial role-based seeds
 */
export function getNotifications() {
  const key = `${STORAGE_PREFIX}_${currentUser?.role || 'student'}_${currentUser?.id || 'default'}`;
  const stored = localStorage.getItem(key);
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch (e) {
      console.warn('[AMS Notifications] Error parsing stored notifications:', e);
    }
  }

  // Seed default institutional notifications based on role
  const seeds = generateSeedNotifications(currentUser?.role || 'student');
  saveNotifications(seeds);
  return seeds;
}

/**
 * Persists notifications to localStorage and updates badge
 */
function saveNotifications(notifications) {
  const key = `${STORAGE_PREFIX}_${currentUser?.role || 'student'}_${currentUser?.id || 'default'}`;
  try {
    localStorage.setItem(key, JSON.stringify(notifications));
  } catch (e) {
    console.warn('[AMS Notifications] Storage quota exceeded:', e);
  }
  updateBellBadge();
}

/**
 * Adds a new notification programmatically (e.g. from Realtime tap or Slip update)
 * @param {object} notifData - { title, message, type, link, timestamp }
 */
export function addNotification(notifData) {
  const notifications = getNotifications();
  const newNotif = {
    id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    title: notifData.title || 'New Notification',
    message: notifData.message || '',
    type: notifData.type || 'info', // 'present' | 'late' | 'excuse' | 'award' | 'alert' | 'info'
    link: notifData.link || null,
    is_read: false,
    created_at: notifData.timestamp || new Date().toISOString()
  };

  notifications.unshift(newNotif);
  saveNotifications(notifications);

  // Animate the bell dot
  pulseBell();

  // If panel is currently open, re-render view
  if (isOpen && panelEl) {
    renderPanelContent(panelEl);
  }
}

/**
 * Toggles the open/closed state of the notifications popover
 */
export function toggleNotificationPanel() {
  if (isOpen) {
    closeNotificationPanel();
  } else {
    openNotificationPanel();
  }
}

/**
 * Opens and positions the notifications panel
 */
export function openNotificationPanel() {
  const bell = document.querySelector('.appbar .bell');
  if (!bell) return;

  if (!panelEl) {
    panelEl = document.createElement('div');
    panelEl.id = 'amsNotificationPanel';
    panelEl.setAttribute('role', 'dialog');
    panelEl.setAttribute('aria-label', 'Notifications popover');

    // Stop ANY click inside panel from bubbling to document (prevents accidental panel closing)
    panelEl.addEventListener('click', (e) => {
      e.stopPropagation();
    });

    document.body.appendChild(panelEl);
  }

  renderPanelContent(panelEl);
  repositionPanel(panelEl, bell);

  panelEl.style.display = 'block';
  requestAnimationFrame(() => {
    panelEl.style.opacity = '1';
    panelEl.style.transform = 'translateY(0) scale(1)';
  });

  bell.setAttribute('aria-expanded', 'true');
  isOpen = true;
}

/**
 * Closes the notifications panel with animation
 */
export function closeNotificationPanel() {
  const bell = document.querySelector('.appbar .bell');
  if (!panelEl) return;

  panelEl.style.opacity = '0';
  panelEl.style.transform = 'translateY(-6px) scale(0.98)';

  setTimeout(() => {
    if (panelEl) panelEl.style.display = 'none';
  }, 180);

  if (bell) bell.setAttribute('aria-expanded', 'false');
  isOpen = false;
}

/**
 * Positions panel smoothly below the bell
 */
function repositionPanel(panel, bell) {
  const rect = bell.getBoundingClientRect();
  const panelWidth = Math.min(390, window.innerWidth - 24);
  let left = rect.right - panelWidth;
  if (left < 12) left = 12;

  panel.style.cssText = `
    position: fixed;
    top: ${rect.bottom + 8}px;
    left: ${left}px;
    width: ${panelWidth}px;
    z-index: 9999;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 14px;
    box-shadow: 0 16px 40px -6px rgba(13, 71, 161, 0.22), 0 6px 16px rgba(0, 0, 0, 0.08);
    display: none;
    opacity: 0;
    transform: translateY(-6px) scale(0.98);
    transition: opacity 0.18s cubic-bezier(0.16, 1, 0.3, 1), transform 0.18s cubic-bezier(0.16, 1, 0.3, 1);
    overflow: hidden;
    font-family: var(--font-inter);
  `;
}

/**
 * Renders the HTML structure and items inside the panel
 */
function renderPanelContent(panel) {
  const notifications = getNotifications();
  const unreadCount = notifications.filter(n => !n.is_read).length;
  const filtered = activeFilter === 'unread' ? notifications.filter(n => !n.is_read) : notifications;

  panel.innerHTML = `
    <!-- Popover Header -->
    <div style="display: flex; align-items: center; justify-content: space-between; padding: 14px 16px; border-bottom: 1px solid var(--border); background: var(--surface-hover);">
      <div style="display: flex; align-items: center; gap: 8px;">
        <h3 style="margin: 0; font-size: 14px; font-weight: 700; color: var(--text-1); letter-spacing: -0.01em;">Notifications</h3>
        <span id="notifUnreadBadge" style="display: ${unreadCount > 0 ? 'inline-block' : 'none'}; font-size: 10px; font-weight: 700; padding: 2px 7px; border-radius: 10px; background: var(--accent); color: #fff;">${unreadCount} New</span>
      </div>
      <button id="notifCloseBtn" style="background: none; border: none; color: var(--text-3); cursor: pointer; padding: 2px 4px; display: flex; align-items: center; border-radius: 6px;" title="Close">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>

    <!-- Filter Tabs (All / Unread) & Mark all as read -->
    <div style="display: flex; align-items: center; justify-content: space-between; padding: 8px 14px; border-bottom: 1px solid var(--border); background: var(--surface);">
      <div style="display: flex; gap: 4px; align-items: center;">
        <button id="tabFilterAll" type="button" style="padding: 4px 10px; font-size: 11.5px; font-weight: 600; border-radius: 6px; border: none; cursor: pointer; background: ${activeFilter === 'all' ? 'var(--accent-soft)' : 'transparent'}; color: ${activeFilter === 'all' ? 'var(--accent)' : 'var(--text-2)'}; transition: all 0.15s ease;">
          All (${notifications.length})
        </button>
        <button id="tabFilterUnread" type="button" style="padding: 4px 10px; font-size: 11.5px; font-weight: 600; border-radius: 6px; border: none; cursor: pointer; background: ${activeFilter === 'unread' ? 'var(--accent-soft)' : 'transparent'}; color: ${activeFilter === 'unread' ? 'var(--accent)' : 'var(--text-2)'}; transition: all 0.15s ease;">
          Unread (${unreadCount})
        </button>
      </div>
      <button id="notifMarkAllReadBtn" type="button" style="display: ${unreadCount > 0 ? 'inline-flex' : 'none'}; background: none; border: none; font-size: 11px; font-weight: 600; color: var(--accent); cursor: pointer; padding: 3px 6px; border-radius: 6px; align-items: center; gap: 4px; transition: opacity 0.15s ease;" title="Mark all notifications as read">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        Mark all as read
      </button>
    </div>

    <!-- Notifications Scrollable List -->
    <div id="notifListContainer" style="max-height: 340px; overflow-y: auto; overscroll-behavior: contain; scrollbar-width: thin;">
      ${filtered.length === 0 ? `
        <div style="padding: 38px 20px; text-align: center;">
          <div style="width: 40px; height: 40px; border-radius: 12px; background: var(--raised); color: var(--accent); margin: 0 auto 10px; display: flex; align-items: center; justify-content: center;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
            </svg>
          </div>
          <p style="margin: 0 0 4px; font-size: 13px; font-weight: 600; color: var(--text-1);">You're all caught up</p>
          <p style="margin: 0; font-size: 11.5px; color: var(--text-3);">${activeFilter === 'unread' ? 'No unread notifications at the moment.' : 'No notifications recorded yet.'}</p>
        </div>
      ` : filtered.map(item => renderNotificationItem(item)).join('')}
    </div>

    <!-- Popover Footer -->
    <div id="notifFooter" style="display: ${notifications.length > 0 ? 'flex' : 'none'}; align-items: center; justify-content: flex-end; padding: 10px 16px; border-top: 1px solid var(--border); background: var(--surface-hover); font-size: 11px; color: var(--text-3);">
      <button id="notifClearAllBtn" type="button" style="background: none; border: none; font-size: 11px; color: var(--text-2); cursor: pointer; padding: 2px 4px; border-radius: 4px; text-decoration: underline;">
        Clear all
      </button>
    </div>
  `;

  // Attach inner event listeners
  const closeBtn = panel.querySelector('#notifCloseBtn');
  if (closeBtn) {
    closeBtn.onclick = (e) => {
      e.stopPropagation();
      closeNotificationPanel();
    };
  }

  const markAllBtn = panel.querySelector('#notifMarkAllReadBtn');
  if (markAllBtn) {
    markAllBtn.onclick = (e) => {
      e.stopPropagation();
      markAllAsRead();
      updateFilterTabsAndList(panel);
    };
  }

  const clearAllBtn = panel.querySelector('#notifClearAllBtn');
  if (clearAllBtn) {
    clearAllBtn.onclick = (e) => {
      e.stopPropagation();
      clearAllNotifications();
      updateFilterTabsAndList(panel);
    };
  }

  const tabAll = panel.querySelector('#tabFilterAll');
  if (tabAll) {
    tabAll.onclick = (e) => {
      e.stopPropagation();
      activeFilter = 'all';
      updateFilterTabsAndList(panel);
    };
  }

  const tabUnread = panel.querySelector('#tabFilterUnread');
  if (tabUnread) {
    tabUnread.onclick = (e) => {
      e.stopPropagation();
      activeFilter = 'unread';
      updateFilterTabsAndList(panel);
    };
  }

  bindItemEvents(panel);
}

/**
 * Updates filter tabs and list content in-place without destroying the popover DOM
 */
function updateFilterTabsAndList(panel) {
  const notifications = getNotifications();
  const unreadCount = notifications.filter(n => !n.is_read).length;
  const filtered = activeFilter === 'unread' ? notifications.filter(n => !n.is_read) : notifications;

  // 1. Update tab styling and counters
  const tabAll = panel.querySelector('#tabFilterAll');
  const tabUnread = panel.querySelector('#tabFilterUnread');

  if (tabAll) {
    tabAll.textContent = `All (${notifications.length})`;
    tabAll.style.background = activeFilter === 'all' ? 'var(--accent-soft)' : 'transparent';
    tabAll.style.color = activeFilter === 'all' ? 'var(--accent)' : 'var(--text-2)';
  }

  if (tabUnread) {
    tabUnread.textContent = `Unread (${unreadCount})`;
    tabUnread.style.background = activeFilter === 'unread' ? 'var(--accent-soft)' : 'transparent';
    tabUnread.style.color = activeFilter === 'unread' ? 'var(--accent)' : 'var(--text-2)';
  }

  // 2. Update header badge & mark all read button
  const badgeEl = panel.querySelector('#notifUnreadBadge');
  if (badgeEl) {
    badgeEl.style.display = unreadCount > 0 ? 'inline-block' : 'none';
    badgeEl.textContent = `${unreadCount} New`;
  }

  const markAllBtn = panel.querySelector('#notifMarkAllReadBtn');
  if (markAllBtn) {
    markAllBtn.style.display = unreadCount > 0 ? 'inline-flex' : 'none';
  }

  const footerEl = panel.querySelector('#notifFooter');
  if (footerEl) {
    footerEl.style.display = notifications.length > 0 ? 'flex' : 'none';
  }

  // 3. Update list items
  const listContainer = panel.querySelector('#notifListContainer');
  if (listContainer) {
    if (filtered.length === 0) {
      listContainer.innerHTML = `
        <div style="padding: 38px 20px; text-align: center;">
          <div style="width: 40px; height: 40px; border-radius: 12px; background: var(--raised); color: var(--accent); margin: 0 auto 10px; display: flex; align-items: center; justify-content: center;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
            </svg>
          </div>
          <p style="margin: 0 0 4px; font-size: 13px; font-weight: 600; color: var(--text-1);">You're all caught up</p>
          <p style="margin: 0; font-size: 11.5px; color: var(--text-3);">${activeFilter === 'unread' ? 'No unread notifications at the moment.' : 'No notifications recorded yet.'}</p>
        </div>
      `;
    } else {
      listContainer.innerHTML = filtered.map(item => renderNotificationItem(item)).join('');
    }

    bindItemEvents(panel);
  }
}

/**
 * Binds click, mark as read, and dismiss actions to list items
 */
function bindItemEvents(panel) {
  panel.querySelectorAll('.notif-item').forEach(el => {
    const notifId = el.getAttribute('data-id');
    const link = el.getAttribute('data-link');

    el.onclick = (e) => {
      e.stopPropagation();
      if (e.target.closest('.notif-dismiss-btn')) return;
      markAsRead(notifId);
      if (link) {
        window.location.href = link;
      } else {
        updateFilterTabsAndList(panel);
      }
    };

    const dismissBtn = el.querySelector('.notif-dismiss-btn');
    if (dismissBtn) {
      dismissBtn.onclick = (e) => {
        e.stopPropagation();
        deleteNotification(notifId);
        updateFilterTabsAndList(panel);
      };
    }
  });
}

/**
 * Generates single notification item HTML
 */
function renderNotificationItem(n) {
  const iconConfig = getNotificationIcon(n.type);
  const timeStr = formatRelativeTime(n.created_at);

  return `
    <div class="notif-item" data-id="${n.id}" data-link="${n.link || ''}" style="
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 12px 14px;
      border-bottom: 1px solid var(--border);
      background: ${n.is_read ? 'var(--surface)' : 'var(--raised)'};
      cursor: pointer;
      position: relative;
      transition: background 0.15s ease;
    ">
      <!-- Icon Container -->
      <div style="
        width: 32px;
        height: 32px;
        border-radius: 9px;
        background: ${iconConfig.bg};
        color: ${iconConfig.color};
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
      ">
        ${iconConfig.svg}
      </div>

      <!-- Text Details -->
      <div style="flex: 1; min-width: 0;">
        <div style="display: flex; align-items: baseline; justify-content: space-between; gap: 6px; margin-bottom: 2px;">
          <h4 style="margin: 0; font-size: 12.5px; font-weight: ${n.is_read ? '600' : '700'}; color: var(--text-1); letter-spacing: -0.01em;">
            ${escapeHtml(n.title)}
          </h4>
          <span style="font-size: 10.5px; color: var(--text-3); font-variant-numeric: tabular-nums; white-space: nowrap;">
            ${timeStr}
          </span>
        </div>
        <p style="margin: 0; font-size: 11.5px; color: var(--text-2); line-height: 1.4; word-break: break-word;">
          ${escapeHtml(n.message)}
        </p>
      </div>

      <!-- Unread indicator & Dismiss -->
      <div style="display: flex; flex-direction: column; align-items: flex-end; justify-content: space-between; gap: 6px;">
        ${!n.is_read ? `<span style="width: 7px; height: 7px; border-radius: 50%; background: var(--accent); flex-shrink: 0;" title="Unread"></span>` : '<span style="width: 7px; height: 7px;"></span>'}
        <button class="notif-dismiss-btn" title="Dismiss notification" style="background: none; border: none; padding: 2px; color: var(--text-3); cursor: pointer; opacity: 0.6; display: flex;">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
    </div>
  `;
}

/**
 * Returns matching vector SVG and color scheme for notification type
 */
function getNotificationIcon(type) {
  switch (type) {
    case 'present':
      return {
        bg: 'var(--present-soft)',
        color: 'var(--present)',
        svg: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`
      };
    case 'late':
      return {
        bg: 'var(--late-soft)',
        color: 'var(--late)',
        svg: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`
      };
    case 'excuse':
      return {
        bg: 'rgba(2, 136, 209, 0.12)',
        color: '#0288D1',
        svg: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>`
      };
    case 'award':
      return {
        bg: 'rgba(99, 102, 241, 0.12)',
        color: '#6366F1',
        svg: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/></svg>`
      };
    case 'alert':
      return {
        bg: 'var(--absent-soft)',
        color: 'var(--absent)',
        svg: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`
      };
    default:
      return {
        bg: 'var(--accent-soft)',
        color: 'var(--accent)',
        svg: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`
      };
  }
}

/**
 * Updates unread badge dot in the appbar bell
 */
function updateBellBadge() {
  const bell = document.querySelector('.appbar .bell');
  if (!bell) return;

  const notifications = getNotifications();
  const unreadCount = notifications.filter(n => !n.is_read).length;
  let dot = bell.querySelector('.dot');

  if (unreadCount > 0) {
    if (!dot) {
      dot = document.createElement('span');
      dot.className = 'dot';
      bell.appendChild(dot);
    }
    dot.style.display = 'block';
    bell.setAttribute('title', `${unreadCount} unread notification${unreadCount === 1 ? '' : 's'}`);
  } else {
    if (dot) dot.style.display = 'none';
    bell.setAttribute('title', 'No unread notifications');
  }
}

/**
 * Pulses the bell when a live notification arrives
 */
function pulseBell() {
  const bell = document.querySelector('.appbar .bell');
  if (!bell) return;
  bell.classList.remove('animate-bounce');
  void bell.offsetWidth; // Reflow
  bell.classList.add('animate-bounce');
  setTimeout(() => bell.classList.remove('animate-bounce'), 1000);
}

/**
 * Marks single notification as read
 */
function markAsRead(id) {
  const notifications = getNotifications();
  const target = notifications.find(n => n.id === id);
  if (target && !target.is_read) {
    target.is_read = true;
    saveNotifications(notifications);
  }
}

/**
 * Marks all notifications as read
 */
export function markAllAsRead() {
  const notifications = getNotifications();
  notifications.forEach(n => n.is_read = true);
  saveNotifications(notifications);
}

/**
 * Deletes a single notification
 */
function deleteNotification(id) {
  const notifications = getNotifications();
  const updated = notifications.filter(n => n.id !== id);
  saveNotifications(updated);
}

/**
 * Clears all notifications
 */
export function clearAllNotifications() {
  saveNotifications([]);
}

/**
 * Human-readable relative time formatter
 */
function formatRelativeTime(isoString) {
  try {
    const diffMs = Date.now() - new Date(isoString).getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHours = Math.floor(diffMin / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSec < 60) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    return new Date(isoString).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch (e) {
    return 'Recently';
  }
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Generates realistic institutional notifications tailored to each stakeholder role
 */
function generateSeedNotifications(role) {
  const now = Date.now();
  const minute = 60 * 1000;
  const hour = 60 * minute;

  if (role === 'student') {
    return [
      {
        id: 'seed_s_1',
        title: 'Campus Ingress Registered',
        message: 'Your gate check-in was recorded at 07:42 AM via RFID Card UID (E2806894) on Main Gate Turnstile A.',
        type: 'present',
        link: 'attendance-history.html',
        is_read: false,
        created_at: new Date(now - 14 * minute).toISOString()
      },
      {
        id: 'seed_s_2',
        title: 'Excuse Slip Approved',
        message: 'Your digital excuse slip for Sep 25 (Medical Consultation) was reviewed and approved by Prof. Santos.',
        type: 'excuse',
        link: 'attendance-history.html',
        is_read: false,
        created_at: new Date(now - 3 * hour).toISOString()
      },
      {
        id: 'seed_s_3',
        title: 'Punctuality Streak Milestone',
        message: 'Congratulations! You have maintained an active consecutive attendance streak of 18 days.',
        type: 'award',
        link: 'analytics.html',
        is_read: true,
        created_at: new Date(now - 28 * hour).toISOString()
      },
      {
        id: 'seed_s_4',
        title: 'Tardiness Notice Issued',
        message: 'Arrival at 08:14 AM on Sep 22 registered post-cutoff (+14m). Parent SMS alert was dispatched.',
        type: 'late',
        link: 'attendance-history.html',
        is_read: true,
        created_at: new Date(now - 72 * hour).toISOString()
      }
    ];
  } else if (role === 'teacher') {
    return [
      {
        id: 'seed_t_1',
        title: 'Excuse Slip Awaiting Approval',
        message: 'Student Juan Dela Cruz (BSIT 3-1) submitted an excuse slip with medical proof attachment.',
        type: 'excuse',
        link: 'excuse-slips.html',
        is_read: false,
        created_at: new Date(now - 25 * minute).toISOString()
      },
      {
        id: 'seed_t_2',
        title: 'Faculty Ingress Verified',
        message: 'RFID faculty check-in recorded at 07:45 AM. Verified on-time before the 08:00 AM shift cutoff.',
        type: 'present',
        link: 'my-logs.html',
        is_read: false,
        created_at: new Date(now - 2 * hour).toISOString()
      },
      {
        id: 'seed_t_3',
        title: 'Attendance Roll Call Alert',
        message: 'Section BSIT 3-1 attendance roll call is now open for your scheduled 09:00 AM lecture.',
        type: 'info',
        link: 'attendance.html',
        is_read: true,
        created_at: new Date(now - 5 * hour).toISOString()
      },
      {
        id: 'seed_t_4',
        title: 'Student Absence Intervention',
        message: '2 students in your advisory section have reached 3 unexcused absences this semester.',
        type: 'alert',
        link: 'analytics.html',
        is_read: true,
        created_at: new Date(now - 48 * hour).toISOString()
      }
    ];
  } else {
    // Admin Role
    return [
      {
        id: 'seed_a_1',
        title: 'Gate Scanner Telemetry Online',
        message: 'Scanner GATE-01-ESP32 (Main Gate Turnstile A) reported active heartbeat and zero buffered sync queues.',
        type: 'info',
        link: 'devices.html',
        is_read: false,
        created_at: new Date(now - 10 * minute).toISOString()
      },
      {
        id: 'seed_a_2',
        title: 'Excuse Slip Escalation',
        message: 'Excuse slip #ES-2024-001 has been escalated to Registrar for administrative audit review.',
        type: 'excuse',
        link: 'excuse-slips.html',
        is_read: false,
        created_at: new Date(now - 1 * hour).toISOString()
      },
      {
        id: 'seed_a_3',
        title: 'Parent SMS Alerts Dispatched',
        message: 'Automated morning tardiness notification batch processed via SMS Gateway (Semaphore).',
        type: 'present',
        link: 'parent-alerts.html',
        is_read: true,
        created_at: new Date(now - 4 * hour).toISOString()
      },
      {
        id: 'seed_a_4',
        title: 'Perfect Attendance Candidate List',
        message: 'Monthly honors computation finished: 128 student candidates eligible for Perfect Attendance Award.',
        type: 'award',
        link: 'awards.html',
        is_read: true,
        created_at: new Date(now - 24 * hour).toISOString()
      }
    ];
  }
}
