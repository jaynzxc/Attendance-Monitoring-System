/**
 * parent-alerts.js - Page controller for Parent Alerts & Intervention module
 * Bestlink College of the Philippines - Attendance Monitoring System (AMS)
 */

import { requireRole } from '../../lib/rbac-guard.js';
import { toast } from '../../components/toast.js';
import { getSupabase } from '../../lib/supabaseClient.js';
import { renderNumberedPagination } from '../../components/pagination.js';

let currentPage = 0;
const pageSize = 15;

// Seed data for at-risk students (replaced by live Supabase query when connected)
const SEED_RISK = [
  { name: 'John Reyes',      num: '2024-00109', section: 'BSIT 3-1', absent: 4, tardy: 6, rate: 82.5, priority: 'High',     parent: '+639171234567' },
  { name: 'Maria Santos',    num: '2024-00102', section: 'BSIT 3-1', absent: 3, tardy: 5, rate: 86.0, priority: 'High',     parent: '+639182345678' },
  { name: 'Kevin De Vera',   num: '2024-00103', section: 'BSIS 2-1', absent: 3, tardy: 4, rate: 88.2, priority: 'Moderate', parent: '+639193456789' },
  { name: 'Angela Lim',      num: '2024-00104', section: 'BSIT 3-2', absent: 2, tardy: 7, rate: 89.1, priority: 'Moderate', parent: '+639204567890' },
  { name: 'Carlo Mendoza',   num: '2024-00211', section: 'BSEMC 4A', absent: 3, tardy: 3, rate: 87.4, priority: 'Moderate', parent: '+639215678901' }
];

// Seed data for recent alert history
const SEED_HISTORY = [
  { name: 'John Reyes',    msg: 'Absence notification sent',    time: '08:12 AM', status: 'sent' },
  { name: 'Maria Santos',  msg: 'Tardiness warning delivered',  time: '08:04 AM', status: 'sent' },
  { name: 'Kevin De Vera', msg: 'Threshold warning — queued',   time: '07:58 AM', status: 'pending' },
  { name: 'Angela Lim',    msg: 'Absence notification failed',  time: '07:45 AM', status: 'failed' }
];

let atRiskData = [];

/**
 * Renders the at-risk table from the current dataset
 */
function renderRiskTable(data) {
  const tbody = document.getElementById('riskTableBody');
  const countEl = document.getElementById('riskCount');
  if (!tbody) return;

  if (countEl) countEl.textContent = `${data.length} students`;

  renderNumberedPagination({
    containerId: 'riskPageNumbersContainer',
    prevBtnId: 'riskPrevBtn',
    nextBtnId: 'riskNextBtn',
    infoTextId: 'riskPageInfoText',
    totalRecords: data.length,
    pageSize,
    currentPage,
    onPageChange: (newPage) => {
      currentPage = newPage;
      renderRiskTable(data);
    }
  });

  if (data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:36px; color:var(--text-3);">No at-risk students detected. All clear.</td></tr>';
    return;
  }

  const paged = data.slice(currentPage * pageSize, (currentPage + 1) * pageSize);

  tbody.innerHTML = paged.map(st => {
    const priorityBadge = st.priority === 'High'
      ? 'style="background:rgba(239,68,68,0.12); color:#EF4444;"'
      : 'style="background:rgba(245,158,11,0.12); color:#F59E0B;"';
    return `
      <tr>
        <td style="font-weight:700; color:var(--text-1);">${st.name}</td>
        <td><span style="font-family:monospace; font-weight:600;">${st.num}</span></td>
        <td style="font-weight:600;">${st.section}</td>
        <td><span style="font-weight:700; color:var(--absent);">${st.absent}</span></td>
        <td><span style="font-weight:700; color:var(--late);">${st.tardy}</span></td>
        <td style="font-weight:700; font-variant-numeric:tabular-nums;">${st.rate}%</td>
        <td><span class="badge" ${priorityBadge}>${st.priority} Priority</span></td>
        <td style="text-align:right;">
          <button class="btn-secondary btn-notify" data-name="${st.name}" style="padding:4px 10px; font-size:11.5px; display:inline-flex; align-items:center; gap:4px;">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 2 11 13M22 2 15 22l-4-9-9-4 20-7Z"/></svg>
            Alert
          </button>
        </td>
      </tr>
    `;
  }).join('');

  // Bind individual alert buttons
  document.querySelectorAll('.btn-notify').forEach(btn => {
    btn.addEventListener('click', () => {
      const name = btn.getAttribute('data-name');
      const select = document.getElementById('composeRecipient');
      if (select) {
        for (let i = 0; i < select.options.length; i++) {
          if (select.options[i].text === name) { select.selectedIndex = i; break; }
        }
      }
      document.getElementById('composeMessage')?.focus();
    });
  });
}

/**
 * Populates the recipient dropdown from the at-risk dataset
 */
function populateRecipientDropdown(data) {
  const select = document.getElementById('composeRecipient');
  if (!select) return;
  const existing = [...select.options].filter(o => !o.value);
  select.innerHTML = '';
  if (existing.length) select.appendChild(existing[0]);
  else {
    const blank = document.createElement('option');
    blank.value = '';
    blank.textContent = 'Select at-risk student...';
    select.appendChild(blank);
  }
  data.forEach(st => {
    const opt = document.createElement('option');
    opt.value = st.num;
    opt.textContent = `${st.name} — ${st.section}`;
    select.appendChild(opt);
  });
}

/**
 * Renders the alert history timeline
 */
function renderAlertHistory(history) {
  const container = document.getElementById('alertHistory');
  if (!container) return;

  const statusColor = { sent: '#10B981', pending: '#F59E0B', failed: '#EF4444' };
  const statusLabel = { sent: 'Sent', pending: 'Pending', failed: 'Failed' };

  container.innerHTML = history.map(ev => `
    <div class="alert-event">
      <span class="alert-status-dot" style="background:${statusColor[ev.status] || '#90CAF9'};"></span>
      <div class="alert-event-body">
        <div class="alert-name">${ev.name}</div>
        <div class="alert-meta">${ev.time} &middot; <span class="badge ${`badge-${ev.status}`}" style="font-size:10px;">${statusLabel[ev.status] || ev.status}</span></div>
        <div class="alert-msg">${ev.msg}</div>
        ${ev.status === 'failed' ? `<button class="btn-secondary" style="margin-top:6px; padding:3px 8px; font-size:11px;" onclick="retryAlert('${ev.name}')">Retry</button>` : ''}
      </div>
    </div>
  `).join('');
}

/**
 * Retries a failed alert
 */
window.retryAlert = function(name) {
  toast.show(`Retrying SMS alert for ${name}...`, 'info');
};

/**
 * Sends the composed SMS alert
 */
function bindSendButton() {
  const btn = document.getElementById('btnSendSingle');
  if (!btn) return;

  btn.addEventListener('click', () => {
    const recipient = document.getElementById('composeRecipient')?.value;
    const message   = document.getElementById('composeMessage')?.value?.trim();

    if (!recipient) { toast.show('Please select a recipient student.', 'error'); return; }
    if (!message)   { toast.show('Message cannot be empty.', 'error'); return; }

    const recipientName = document.getElementById('composeRecipient')?.selectedOptions?.[0]?.text?.split(' — ')[0] || 'Student';
    toast.show(`SMS alert queued for ${recipientName}'s parent/guardian.`, 'success');

    // Add to local history preview
    const now = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    SEED_HISTORY.unshift({ name: recipientName, msg: message.substring(0, 60) + (message.length > 60 ? '...' : ''), time: now, status: 'pending' });
    renderAlertHistory(SEED_HISTORY);

    document.getElementById('composeMessage').value = '';
    document.getElementById('charCount').textContent = '0';
  });
}

/**
 * Binds the bulk SMS button
 */
function bindBulkButton() {
  const btn = document.getElementById('btnSendBulk');
  if (!btn) return;
  btn.addEventListener('click', () => {
    if (atRiskData.length === 0) { toast.show('No at-risk students to alert.', 'info'); return; }
    toast.show(`Bulk SMS queued for ${atRiskData.length} parent contacts.`, 'success');
  });
}

/**
 * Binds the priority filter
 */
function bindFilter() {
  document.getElementById('filterPriority')?.addEventListener('change', (e) => {
    const val = e.target.value;
    const filtered = val ? atRiskData.filter(st => st.priority === val) : atRiskData;
    renderRiskTable(filtered);
  });
}

/**
 * Initializes Parent Alerts view
 */
async function init() {
  await requireRole(['admin']);

  // Try to load from Supabase; fall back to seed data
  const sb = getSupabase();
  if (sb) {
    try {
      const { data: students } = await sb
        .from('users')
        .select('id, first_name, last_name, student_number, sections:section_id(name)')
        .eq('role', 'student')
        .limit(20);
      // When real absence aggregation is wired, replace SEED_RISK here
    } catch (err) {
      console.warn('[ParentAlerts] DB unavailable, using seed data:', err);
    }
  }

  atRiskData = SEED_RISK;

  // Update KPIs
  const kpiSet = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  kpiSet('kpiAtRisk',       atRiskData.length);
  kpiSet('kpiAlertsSent',   SEED_HISTORY.filter(h => h.status === 'sent').length);
  kpiSet('kpiAlertsPending',SEED_HISTORY.filter(h => h.status === 'pending').length);
  kpiSet('kpiAlertsFailed', SEED_HISTORY.filter(h => h.status === 'failed').length);

  renderRiskTable(atRiskData);
  populateRecipientDropdown(atRiskData);
  renderAlertHistory(SEED_HISTORY);
  bindSendButton();
  bindBulkButton();
  bindFilter();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}