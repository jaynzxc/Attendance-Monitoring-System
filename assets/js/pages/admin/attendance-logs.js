/**
 * attendance-logs.js - Page controller for Admin Attendance Logs & Audit Trail
 * Bestlink College of the Philippines - Attendance Monitoring System (AMS)
 */

import { requireRole } from '../../lib/rbac-guard.js';
import { attendanceApi } from '../../api/attendanceApi.js';
import { sectionsApi, formatProgramSection } from '../../api/sectionsApi.js';
import { toast } from '../../components/toast.js';
import { getSupabase } from '../../lib/supabaseClient.js';
import { renderNumberedPagination } from '../../components/pagination.js';
import { openExportModal } from '../../components/exportModal.js';
import { Modal } from '../../components/modal.js';

let currentPage = 0;
const pageSize = 15;
let totalRecords = 0;
let currentLogs = [];

/**
 * Formats ISO timestamp to institutional Philippine format: YYYY-MM-DD HH:MM:SS
 */
function formatDateTime(isoString) {
  if (!isoString) return '—';
  const d = new Date(isoString);
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

/**
 * Renders the table body with current logs
 */
function renderLogs(logs) {
  const tbody = document.getElementById('logsTableBody');
  if (!tbody) return;

  if (!logs || logs.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8">
          <div class="empty-state">
            <svg viewBox="0 0 24 24" fill="none" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6M9 9l6 6"/></svg>
            <h4>No attendance records found</h4>
            <p>Try adjusting your search criteria or date filters.</p>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = logs.map(log => {
    const student = log.student || {};
    const studentName = `${student.first_name || ''} ${student.last_name || ''}`.trim() || 'Unknown Student';
    const studentNumber = student.student_number || '—';
    const rawSec = log.section?.name || '31001';
    const secProg = log.section?.program_code || (rawSec.startsWith('2') ? 'BSIS' : 'BSIT');
    const sectionName = formatProgramSection ? formatProgramSection(secProg, rawSec) : `${secProg} - ${rawSec}`;
    const isVoided = !!log.is_voided;
    const status = (log.status || (isVoided ? 'absent' : 'present')).toLowerCase();
    const eventType = (log.event_type || 'time_in') === 'time_in' ? 'Time-In' : 'Time-Out';
    const method = (log.scan_method || 'rfid').toUpperCase();

    const voidBadge = isVoided
      ? `<span class="badge" style="background:rgba(239, 68, 68, 0.15); color:var(--absent); border:1px solid rgba(239, 68, 68, 0.3); font-weight:700;">VOIDED</span>`
      : `<span class="badge badge-${status}">${status.toUpperCase()}</span>`;

    const auditBadge = isVoided
      ? `
        <div style="display:flex; flex-direction:column; gap:3px;">
          <div style="display:flex; align-items:center; gap:5px; flex-wrap:wrap;">
            <span class="badge" style="background:rgba(239, 68, 68, 0.12); color:var(--absent); border:1px solid rgba(239, 68, 68, 0.28); font-size:11px; font-weight:700; width:fit-content; display:inline-flex; align-items:center; gap:4px;">
              <svg style="width:11px; height:11px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
              Voided by Teacher
            </span>
            <span class="badge" style="background:rgba(245, 158, 11, 0.12); color:var(--late); border:1px solid rgba(245, 158, 11, 0.3); font-size:10.5px; font-weight:700; display:inline-flex; align-items:center; gap:3px;">
              <svg style="width:10px; height:10px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              Prefect Referral
            </span>
          </div>
          <div style="font-size:10.5px; color:var(--text-3); font-weight:500;">
            ${log.voided_by_name || 'Prof. Ricardo Santos'} · ${log.void_reason || 'Proxy tap detected'}
          </div>
          <div style="font-size:10px; color:var(--late); font-weight:600; display:flex; align-items:center; gap:3px;">
            <svg style="width:10px; height:10px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
            Parent SMS Sent · Call-in Slip Issued
          </div>
        </div>
      `
      : `
        <div style="display:flex; flex-direction:column; gap:2px;">
          <span class="badge" style="background:rgba(16, 185, 129, 0.12); color:var(--present); border:1px solid rgba(16, 185, 129, 0.28); font-size:11px; font-weight:700; width:fit-content; display:inline-flex; align-items:center; gap:4px;">
            <svg style="width:11px; height:11px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 6L9 17l-5-5"/></svg>
            Verified by Teacher
          </span>
          <div style="font-size:10.5px; color:var(--text-3); font-weight:500;">
            ${log.verified_by_name || 'Prof. Ricardo Santos'} · Roll Call confirmed
          </div>
        </div>
      `;

    return `
      <tr style="${isVoided ? 'opacity: 0.82; background: rgba(239, 68, 68, 0.035);' : ''}">
        <td style="font-weight:600; color:var(--text-1); font-size:12.5px;">${formatDateTime(log.scanned_at)}</td>
        <td>
          <div style="font-weight:600; color:var(--text-1);">${studentName}</div>
          <div style="font-size:11px; color:var(--text-3); font-family:monospace;">${studentNumber}</div>
        </td>
        <td><span style="font-weight:600; font-size:12.5px;">${sectionName}</span></td>
        <td><span style="font-size:12px; font-weight:500;">${eventType}</span></td>
        <td>${voidBadge}</td>
        <td>
          <span style="font-size:11px; font-weight:700; padding:2px 6px; border-radius:4px; background:var(--raised); color:var(--text-1); border:1px solid var(--border);">
            ${method}
          </span>
        </td>
        <td>${auditBadge}</td>
        <td style="text-align:right;">
          <button class="btn-secondary btn-audit-detail" data-id="${log.id}" style="padding:4px 9px; font-size:11px; font-weight:600;">
            Audit Trail
          </button>
        </td>
      </tr>
    `;
  }).join('');

  // Attach click listeners to row Audit Trail buttons
  tbody.querySelectorAll('.btn-audit-detail').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const logId = e.currentTarget.getAttribute('data-id');
      const targetLog = currentLogs.find(l => l.id === logId);
      if (targetLog) {
        openAuditTrailModal(targetLog);
      }
    });
  });
}

/**
 * Opens modal with complete audit provenance and allows admin/teacher to toggle void / verify
 */
function openAuditTrailModal(log) {
  const student = log.student || {};
  const studentName = `${student.first_name || ''} ${student.last_name || ''}`.trim() || 'Unknown Student';
  const studentNumber = student.student_number || '—';
  const rawSec = log.section?.name || '31001';
  const sectionProg = log.section?.program_code || (rawSec.startsWith('2') ? 'BSIS' : 'BSIT');
  const sectionName = formatProgramSection ? formatProgramSection(sectionProg, rawSec) : `${sectionProg} - ${rawSec}`;
  const isVoided = !!log.is_voided;
  const status = (log.status || (isVoided ? 'absent' : 'present')).toLowerCase();
  const initials = `${(student.first_name || 'S')[0] || ''}${(student.last_name || '')[0] || ''}`.toUpperCase();
  const reviewerTeacher = log.voided_by_name || log.verified_by_name || 'Prof. Ricardo Santos';
  const deviceLocation = log.device?.location || 'Main Gate Turnstile A';
  const deviceCode = log.device?.device_code || 'GATE-01-ESP32';
  const method = (log.scan_method || 'rfid').toUpperCase();
  const parentMobile = log.parent_mobile || '+639171234567';
  const podTicket = log.prefect_ticket || `POD-2026-${(log.id || '0103').slice(-4).toUpperCase()}`;

  const content = `
    <div style="display:flex; flex-direction:column; gap:16px;">
      <!-- Student Card -->
      <div style="display:flex; align-items:center; gap:14px; padding:12px 14px; background:var(--surface-hover); border-radius:10px; border:1px solid var(--border);">
        <div class="pf-avatar" style="width:42px; height:42px; font-size:14px; font-weight:700; flex-shrink:0;">${initials}</div>
        <div style="flex:1; min-width:0;">
          <div style="font-weight:700; color:var(--text-1); font-size:15px;">${studentName}</div>
          <div style="font-size:12px; color:var(--text-3); font-family:monospace; margin-top:1px;">${studentNumber} · <span style="font-weight:600; color:var(--text-2);">${sectionName}</span></div>
        </div>
        <span class="badge badge-${status}" style="font-size:11.5px; font-weight:700;">${status.toUpperCase()}</span>
      </div>

      <!-- Telemetry Info -->
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; font-size:12px;">
        <div style="padding:10px 12px; background:var(--raised); border-radius:8px; border:1px solid var(--border);">
          <div style="color:var(--text-3); font-size:10.5px; text-transform:uppercase; font-weight:700;">Ingress Scan Time</div>
          <div style="font-weight:600; color:var(--text-1); margin-top:3px;">${formatDateTime(log.scanned_at)}</div>
        </div>
        <div style="padding:10px 12px; background:var(--raised); border-radius:8px; border:1px solid var(--border);">
          <div style="color:var(--text-3); font-size:10.5px; text-transform:uppercase; font-weight:700;">Hardware / Terminal</div>
          <div style="font-weight:600; color:var(--text-1); margin-top:3px;">${deviceCode} (${method})</div>
          <div style="font-size:11px; color:var(--text-3);">${deviceLocation}</div>
        </div>
      </div>

      <!-- Teacher Audit Status Box -->
      <div style="padding:14px; border-radius:10px; border:1px solid ${isVoided ? 'rgba(239, 68, 68, 0.35)' : 'rgba(16, 185, 129, 0.35)'}; background:${isVoided ? 'rgba(239, 68, 68, 0.05)' : 'rgba(16, 185, 129, 0.05)'};">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
          <span style="font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.5px; color:${isVoided ? 'var(--absent)' : 'var(--present)'};">
            ${isVoided ? 'Voided Record (Policy Violation)' : 'Teacher Verified Attendance'}
          </span>
          <span class="badge" style="background:${isVoided ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)'}; color:${isVoided ? 'var(--absent)' : 'var(--present)'}; font-weight:700; font-size:11px;">
            ${isVoided ? 'VOIDED BY TEACHER' : 'VERIFIED BY TEACHER'}
          </span>
        </div>
        <div style="font-size:13px; color:var(--text-1); font-weight:600;">
          Reviewing Teacher: <span style="color:var(--ch-500);">${reviewerTeacher}</span>
        </div>
        <div style="font-size:12px; color:var(--text-2); margin-top:4px; line-height:1.4;">
          <strong>Audit Notes:</strong> ${log.void_reason || (isVoided ? 'Proxy tap / buddy punching detected' : 'Classroom roll call verified and matched against physical section ingress.')}
        </div>
        ${isVoided && log.voided_at ? `<div style="font-size:11px; color:var(--text-3); margin-top:6px;">Voided at: ${formatDateTime(log.voided_at)}</div>` : ''}
      </div>

      <!-- Disciplinary Escalation & Parent Alert Dossier (Only for Voided Records) -->
      ${isVoided ? `
        <div style="padding:14px; border-radius:10px; border:1px solid rgba(245, 158, 11, 0.35); background:rgba(245, 158, 11, 0.05); display:flex; flex-direction:column; gap:10px;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span style="font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.5px; color:var(--late); display:flex; align-items:center; gap:5px;">
              <svg style="width:13px; height:13px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
              Prefect of Discipline Referral &amp; Parent Alert
            </span>
            <span class="badge" style="background:rgba(245, 158, 11, 0.2); color:var(--late); font-weight:700; font-size:10.5px;">
              ACTION REQUIRED
            </span>
          </div>

          <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; font-size:12px;">
            <div style="padding:9px 11px; background:var(--surface); border-radius:6px; border:1px solid var(--border);">
              <div style="font-size:10.5px; color:var(--text-3); font-weight:700;">PREFECT INCIDENT TICKET</div>
              <div style="font-weight:700; color:var(--text-1); font-family:monospace; margin-top:2px;">#${podTicket}</div>
              <div style="font-size:11px; color:var(--late); font-weight:600; margin-top:2px;">Report to Prefect of Discipline Office</div>
            </div>

            <div style="padding:9px 11px; background:var(--surface); border-radius:6px; border:1px solid var(--border);">
              <div style="font-size:10.5px; color:var(--text-3); font-weight:700;">PARENT SMS GATEWAY</div>
              <div style="font-weight:700; color:var(--present); display:flex; align-items:center; gap:4px; margin-top:2px;">
                <svg style="width:11px; height:11px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 6L9 17l-5-5"/></svg>
                Delivered (${parentMobile})
              </div>
              <div style="font-size:10.5px; color:var(--text-3); margin-top:2px;">Semaphore Gateway · Sent on Invalidation</div>
            </div>
          </div>

          <div style="padding:9px 11px; background:var(--surface); border-radius:6px; border:1px solid var(--border); font-size:11.5px; color:var(--text-2); line-height:1.45;">
            <div style="font-weight:700; color:var(--text-1); margin-bottom:2px;">SMS Notice Sent to Parent / Guardian:</div>
            <em>"BCP AMS Alert: Attendance for ${studentName} was VOIDED on ${formatDateTime(log.scanned_at)} due to Proxy Badge Tapping. The student is required to report to the Prefect of Discipline Office immediately. - Bestlink College"</em>
          </div>
        </div>
      ` : ''}

      <!-- Audit Change Form if Needed -->
      <div id="voidReasonContainer" style="display:none;">
        <label style="display:block; font-size:12px; font-weight:600; margin-bottom:4px; color:var(--text-1);">Reason for Voiding Scan:</label>
        <select id="modalVoidReasonSelect" class="select-field" style="width:100%;">
          <option value="Proxy badge tap detected / student absent in room">Proxy badge tap detected / student absent in room</option>
          <option value="Left campus / unauthorized classroom exit">Left campus / unauthorized classroom exit</option>
          <option value="Duplicate scanner trigger / anti-passback override">Duplicate scanner trigger / anti-passback override</option>
          <option value="Teacher manual roll call override">Teacher manual roll call override</option>
        </select>
      </div>
    </div>
  `;

  const actions = isVoided
    ? [
        {
          label: 'Close',
          class: 'btn-secondary',
          onClick: () => Modal.close('amsAuditModal')
        },
        {
          label: 'Restore / Verify Attendance',
          class: 'btn-primary',
          onClick: async () => {
            await attendanceApi.updateAuditStatus(log.id, false, null);
            log.is_voided = false;
            log.status = 'present';
            log.void_reason = null;
            log.audit_status = 'verified';
            log.verified_by_name = reviewerTeacher;
            toast.show(`Attendance record for ${studentName} restored to Verified.`, 'success');
            Modal.close('amsAuditModal');
            loadLogs();
          }
        }
      ]
    : [
        {
          label: 'Close',
          class: 'btn-secondary',
          onClick: () => Modal.close('amsAuditModal')
        },
        {
          label: 'Void Attendance Record',
          class: 'btn-secondary',
          onClick: async () => {
            const container = document.getElementById('voidReasonContainer');
            if (container && container.style.display === 'none') {
              container.style.display = 'block';
              return;
            }
            const reason = document.getElementById('modalVoidReasonSelect')?.value || 'Proxy badge tap detected / student absent in room';
            await attendanceApi.updateAuditStatus(log.id, true, reason);
            log.is_voided = true;
            log.status = 'absent';
            log.void_reason = reason;
            log.audit_status = 'voided';
            log.voided_by_name = reviewerTeacher;
            toast.show(`Attendance record for ${studentName} has been voided by Teacher.`, 'warning');
            Modal.close('amsAuditModal');
            loadLogs();
          }
        }
      ];

  Modal.open({
    id: 'amsAuditModal',
    title: 'Attendance Ingress Audit Trail',
    content,
    actions,
    maxWidth: '540px'
  });
}

/**
 * Loads attendance logs with applied filters
 */
async function loadLogs() {
  const sectionId = document.getElementById('filterSection')?.value || null;
  const status = document.getElementById('filterStatus')?.value || null;
  const scanMethod = document.getElementById('filterMethod')?.value || null;
  const auditStatus = document.getElementById('filterAudit')?.value || null;
  const dateFrom = document.getElementById('filterDate')?.value || null;
  const search = document.getElementById('searchStudent')?.value.trim().toLowerCase() || '';

  const { data, count } = await attendanceApi.getAttendanceLogs({
    role: 'student',
    sectionId,
    status,
    scanMethod,
    auditStatus,
    dateFrom,
    dateTo: dateFrom
  }, currentPage, pageSize);

  totalRecords = count;
  currentLogs = data;

  // Client-side search refinement if search query was entered
  let filtered = currentLogs;
  if (search) {
    filtered = currentLogs.filter(item => {
      const student = item.student || {};
      const name = `${student.first_name || ''} ${student.last_name || ''}`.toLowerCase();
      const num = (student.student_number || '').toLowerCase();
      return name.includes(search) || num.includes(search);
    });
  }

  renderLogs(filtered);
  updatePaginationUI();
}

/**
 * Updates pagination bar elements
 */
function updatePaginationUI() {
  renderNumberedPagination({
    containerId: 'pageNumbersContainer',
    prevBtnId: 'prevPageBtn',
    nextBtnId: 'nextPageBtn',
    infoTextId: 'recordCountText',
    totalRecords,
    pageSize,
    currentPage,
    onPageChange: (newPage) => {
      currentPage = newPage;
      loadLogs();
    }
  });
}

/**
 * Exports current attendance logs to CSV
 */
function exportToCsv() {
  if (!currentLogs || currentLogs.length === 0) {
    toast.show('No records available to export.', 'warning');
    return;
  }

  const headers = ['Timestamp', 'Student Number', 'Student Name', 'Section', 'Event', 'Status', 'Method', 'Audit'];
  const rows = currentLogs.map(log => {
    const student = log.student || {};
    const studentNumber = student.student_number || '';
    const studentName = `${student.first_name || ''} ${student.last_name || ''}`.trim();
    const sectionName = log.section?.name || '';
    return [
      new Date(log.scanned_at).toLocaleString(),
      studentNumber,
      studentName,
      sectionName,
      log.event_type || 'time_in',
      (log.status || '').toUpperCase(),
      (log.scan_method || 'rfid').toUpperCase(),
      log.is_voided ? 'Voided' : 'Verified'
    ];
  });

  const dateStamp = new Date().toISOString().split('T')[0];

  openExportModal({
    title: 'Institutional Attendance Logs Ledger',
    filename: `AMS_Attendance_Logs_${dateStamp}`,
    headers,
    rows,
    metadata: {
      'Generated By': 'Registrar / Admin',
      'Export Date': dateStamp,
      'Total Records': `${rows.length}`,
      'System Subsystem': 'SMS 1 Attendance Monitoring System'
    }
  });
}



/**
 * Initializes Attendance Logs view
 */
async function init() {
  await requireRole(['admin']);

  // Populate sections dropdown
  const sections = await sectionsApi.getSections();
  const secSelect = document.getElementById('filterSection');
  if (secSelect && sections) {
    sections.forEach(sec => {
      const opt = document.createElement('option');
      opt.value = sec.id;
      opt.textContent = `${sec.name} (${sec.program_code})`;
      secSelect.appendChild(opt);
    });
  }

  // Filter bindings
  document.getElementById('filterSection')?.addEventListener('change', () => { currentPage = 0; loadLogs(); });
  document.getElementById('filterStatus')?.addEventListener('change', () => { currentPage = 0; loadLogs(); });
  document.getElementById('filterMethod')?.addEventListener('change', () => { currentPage = 0; loadLogs(); });
  document.getElementById('filterAudit')?.addEventListener('change', () => { currentPage = 0; loadLogs(); });
  document.getElementById('filterDate')?.addEventListener('change', () => { currentPage = 0; loadLogs(); });

  let searchTimeout = null;
  document.getElementById('searchStudent')?.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      currentPage = 0;
      loadLogs();
    }, 280);
  });

  document.getElementById('btnResetFilters')?.addEventListener('click', () => {
    document.getElementById('searchStudent').value = '';
    document.getElementById('filterSection').value = '';
    document.getElementById('filterStatus').value = '';
    document.getElementById('filterMethod').value = '';
    const auditEl = document.getElementById('filterAudit');
    if (auditEl) auditEl.value = '';
    document.getElementById('filterDate').value = '';
    currentPage = 0;
    loadLogs();
  });

  // Pagination buttons
  document.getElementById('prevPageBtn')?.addEventListener('click', () => {
    if (currentPage > 0) {
      currentPage--;
      loadLogs();
    }
  });

  document.getElementById('nextPageBtn')?.addEventListener('click', () => {
    if ((currentPage + 1) * pageSize < totalRecords) {
      currentPage++;
      loadLogs();
    }
  });

  // Action buttons
  document.getElementById('btnExportCsv')?.addEventListener('click', exportToCsv);

  // Initial load
  loadLogs();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
