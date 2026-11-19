/**
 * audit.js - Page controller for Super Admin System Audit Trail
 * Bestlink College of the Philippines - Attendance Monitoring System (AMS)
 */

import { requireRole } from '../../lib/rbac-guard.js';
import { getSupabase } from '../../lib/supabaseClient.js';
import { toast } from '../../components/toast.js';

let auditLogs = [];

async function loadAuditLogs() {
  const sb = getSupabase();
  if (!sb) return;

  const { data, error } = await sb
    .from('audit_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    toast.show('Failed to load audit logs: ' + error.message, 'error');
    return;
  }

  auditLogs = data || [];
  renderAuditTable();
}

function renderAuditTable() {
  const tbody = document.getElementById('auditTableBody');
  const search = document.getElementById('auditSearchInput')?.value.toLowerCase().trim() || '';

  const filtered = auditLogs.filter(item => {
    if (!search) return true;
    const action = (item.action || '').toLowerCase();
    const table = (item.table_name || '').toLowerCase();
    const details = JSON.stringify(item.details || {}).toLowerCase();
    return action.includes(search) || table.includes(search) || details.includes(search);
  });

  document.getElementById('auditCountText').textContent = `Showing ${filtered.length} of ${auditLogs.length} audit records`;

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="py-8 text-center text-slate-400">No audit records match your search.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(log => {
    const timeStr = new Date(log.created_at).toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
    const detailsStr = log.details ? JSON.stringify(log.details) : '--';

    return `
      <tr class="hover:bg-slate-50 transition-colors">
        <td class="py-3 px-4 font-mono text-slate-500 tabular-nums whitespace-nowrap">${timeStr}</td>
        <td class="py-3 px-4 font-bold text-slate-800">
          <span class="inline-block px-2 py-0.5 rounded text-[11px] font-mono bg-blue-50 text-blue-700">
            ${log.action}
          </span>
        </td>
        <td class="py-3 px-4 font-mono text-slate-600">${log.table_name || '--'}</td>
        <td class="py-3 px-4 font-mono text-slate-500 text-[11px] truncate max-w-[120px]">${log.record_id || '--'}</td>
        <td class="py-3 px-4 font-mono text-slate-600 text-[11px] max-w-md break-all" title="${detailsStr}">${detailsStr}</td>
      </tr>
    `;
  }).join('');
}

function exportAuditCsv() {
  if (auditLogs.length === 0) {
    toast.show('No audit data available to export.', 'warning');
    return;
  }

  const headers = ['Timestamp', 'Action', 'Table', 'Record ID', 'Details'];
  const rows = auditLogs.map(l => [
    `"${l.created_at}"`,
    `"${l.action}"`,
    `"${l.table_name || ''}"`,
    `"${l.record_id || ''}"`,
    `"${JSON.stringify(l.details || {}).replace(/"/g, '""')}"`
  ]);

  const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', `AMS_Audit_Trail_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  toast.show('Audit trail exported successfully.', 'success');
}

function initLayoutControls() {
  const sidebar = document.querySelector('.sidebar');
  const backdrop = document.getElementById('sidebarBackdrop');
  const toggleBtn = document.getElementById('sidebarToggle');

  toggleBtn?.addEventListener('click', () => {
    sidebar?.classList.toggle('open');
    backdrop?.classList.toggle('open');
  });

  backdrop?.addEventListener('click', () => {
    sidebar?.classList.remove('open');
    backdrop?.classList.remove('open');
  });

  const themeBtn = document.getElementById('themeToggleBtn');
  themeBtn?.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme') || 'light';
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('ams_theme', next);
  });
}

async function init() {
  await requireRole('super_admin');
  initLayoutControls();

  document.getElementById('auditSearchInput')?.addEventListener('input', renderAuditTable);
  document.getElementById('btnExportAuditCsv')?.addEventListener('click', exportAuditCsv);

  loadAuditLogs();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
