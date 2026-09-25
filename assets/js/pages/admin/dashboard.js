/**
 * admin/dashboard.js - Page controller for Admin Overview Dashboard
 * Bestlink College of the Philippines - Attendance Monitoring System (AMS)
 */

import { renderTrendChart } from '../../components/charts.js';

/**
 * Animates a numeric element from 0 to target value
 * @param {string} id - Element ID
 * @param {number} end - Target value
 * @param {string} [suffix=''] - Optional suffix (e.g. '%')
 */
export function countUp(id, end, suffix = '') {
  const el = document.getElementById(id);
  if (!el) return;
  let cur = 0;
  const step = Math.max(1, Math.round(end / 30));
  const timer = setInterval(() => {
    cur = Math.min(end, cur + step);
    el.textContent = cur + suffix;
    if (cur >= end) clearInterval(timer);
  }, 16);
}

/**
 * Initializes Theme Toggle button and persists preference
 */
function initThemeToggle() {
  const themeToggleBtn = document.getElementById('themeToggle');
  if (!themeToggleBtn) return;

  // Restore saved theme or default to system/light
  const savedTheme = localStorage.getItem('ams-theme') || 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);

  themeToggleBtn.addEventListener('click', () => {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
    const nextTheme = currentTheme === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', nextTheme);
    localStorage.setItem('ams-theme', nextTheme);
    
    // Re-render chart to update palette/gridlines dynamically
    renderTrendChart('trendChart');
  });
}

/**
 * Prepends a newly scanned attendance event to the live scan stream list
 * @param {Object} scan - Scan record { initials, name, time, gate, status }
 */
export function prependLiveScan(scan) {
  const container = document.getElementById('liveScanList');
  if (!container) return;

  const row = document.createElement('div');
  row.className = 'list-row';
  
  const statusPillClass = scan.status === 'Late' ? 'pill-late' : 'pill-present';

  row.innerHTML = `
    <div class="avatar">${scan.initials || 'ST'}</div>
    <div class="row-main">
      <div class="name">${scan.name}</div>
      <div class="meta">${scan.time} · ${scan.gate || 'Gate 1'}</div>
    </div>
    <span class="pill ${statusPillClass}">${scan.status}</span>
  `;

  // Prepend and maintain max 10 rows
  container.insertBefore(row, container.firstChild);
  if (container.children.length > 8) {
    container.removeChild(container.lastChild);
  }
}

/**
 * Initialize all dashboard components
 */
function initDashboard() {
  // 1. Theme toggle
  initThemeToggle();

  // 2. Animated KPIs
  countUp('k1', 1042);
  countUp('k2', 94, '%');
  countUp('k3', 37);
  countUp('k4', 28);

  // 3. Render Trend Line Chart
  renderTrendChart('trendChart');
}

// Auto-run once DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initDashboard);
} else {
  initDashboard();
}
