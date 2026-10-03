/**
 * analytics.js - Student Personal Attendance Analytics & Honors Controller
 * Bestlink College of the Philippines - Attendance Monitoring System (AMS)
 * Authoritative Reference: docs/UI-UX_Architecture.md, docs/WORKFLOW.md
 */

import { requireRole } from '../../lib/rbac-guard.js';
import { getCurrentUser } from '../../lib/auth.js';
import { attendanceApi } from '../../api/attendanceApi.js';
import { getSupabase } from '../../lib/supabaseClient.js';
import { showToast } from '../../components/toast.js';
import { openExportModal } from '../../components/exportModal.js';

let currentStudent = null;
let currentStats = null;
let subjectAttendanceChartInstance = null;

const ICON_EXPAND = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3"/></svg>';
const ICON_SHRINK = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3v3a2 2 0 0 1-2 2H3M21 8h-3a2 2 0 0 1-2-2V3M3 16h3a2 2 0 0 1 2 2v3M16 21v-3a2 2 0 0 1 2-2h3"/></svg>';

/**
 * Opens the certificate in a modal at full admin size, with a native Fullscreen toggle.
 * The certificate is cloned from the on-page thumbnail so name/section/ID stay in sync.
 */
function openCertificateViewer() {
  document.getElementById('certViewerOverlay')?.remove();
  const source = document.getElementById('studentCertificate');
  if (!source) return;

  const overlay = document.createElement('div');
  overlay.id = 'certViewerOverlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Certificate of Perfect Attendance');
  overlay.style.cssText = 'position:fixed; inset:0; z-index:99999; background:rgba(7,19,36,0.75); backdrop-filter:blur(4px); display:flex; align-items:center; justify-content:center; padding:20px;';

  const panel = document.createElement('div');
  panel.style.cssText = 'background:var(--surface); border:1px solid var(--border); border-radius:14px; width:100%; max-width:900px; max-height:100%; display:flex; flex-direction:column; overflow:hidden; box-shadow:0 20px 40px -10px rgba(13,71,161,0.3);';

  const header = document.createElement('div');
  header.style.cssText = 'display:flex; align-items:center; justify-content:space-between; gap:8px; padding:12px 16px; border-bottom:1px solid var(--border);';
  const title = document.createElement('h2');
  title.textContent = 'Certificate of Perfect Attendance';
  title.style.cssText = 'margin:0; font-size:14px; font-weight:700; color:var(--text-1);';

  const btnStyle = 'display:inline-flex; align-items:center; gap:6px; padding:6px 10px; font-size:12px; font-weight:600; border-radius:8px; border:1px solid var(--border); background:var(--raised); color:var(--text-1); cursor:pointer;';
  const fsBtn = document.createElement('button');
  fsBtn.type = 'button';
  fsBtn.style.cssText = btnStyle;
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.setAttribute('aria-label', 'Close');
  closeBtn.style.cssText = btnStyle;
  closeBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';

  const actions = document.createElement('div');
  actions.style.cssText = 'display:flex; gap:8px;';
  actions.append(fsBtn, closeBtn);
  header.append(title, actions);

  const body = document.createElement('div');
  body.style.cssText = 'flex:1; overflow:auto; padding:24px; display:flex; align-items:center; justify-content:center; background:var(--surface-hover);';

  const cert = source.cloneNode(true);
  cert.removeAttribute('id');
  cert.querySelectorAll('[id]').forEach((el) => el.removeAttribute('id'));
  cert.style.width = '100%';
  cert.style.zoom = '1.6';
  cert.style.maxWidth = '500px';
  body.appendChild(cert);

  panel.append(header, body);
  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  const syncFsButton = () => {
    const active = document.fullscreenElement === panel;
    fsBtn.innerHTML = `${active ? ICON_SHRINK : ICON_EXPAND}<span>${active ? 'Exit Fullscreen' : 'Fullscreen'}</span>`;
    panel.style.maxWidth = active ? 'none' : '900px';
    panel.style.borderRadius = active ? '0' : '14px';
  };
  syncFsButton();

  fsBtn.addEventListener('click', () => {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else if (panel.requestFullscreen) {
      panel.requestFullscreen().catch(() => showToast('Fullscreen is not supported in this browser.', 'warning'));
    }
  });
  document.addEventListener('fullscreenchange', syncFsButton);

  const close = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    document.removeEventListener('fullscreenchange', syncFsButton);
    document.removeEventListener('keydown', onKey);
    overlay.remove();
  };
  const onKey = (e) => { if (e.key === 'Escape' && !document.fullscreenElement) close(); };

  closeBtn.addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', onKey);
  fsBtn.focus();
}

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Enforce Student Role Guard
  await requireRole(['student']);

  // 2. Fetch authenticated student profile
  currentStudent = await getCurrentUser() || {
    id: 'c0000000-0000-0000-0000-000000000001',
    first_name: 'Juan',
    last_name: 'Dela Cruz',
    student_number: 's230110001',
    role: 'student'
  };

  // 3. Initialize Certificate Frame
  const certName = document.getElementById('certStudentName');
  if (certName) {
    certName.textContent = `${currentStudent.first_name || ''} ${currentStudent.last_name || ''}`.trim() || 'Juan Dela Cruz';
  }
  const certSec = document.getElementById('certSection');
  if (certSec) {
    certSec.textContent = currentStudent.section_name || '31001';
  }
  const certNum = document.getElementById('certStudentNumber');
  if (certNum) {
    certNum.textContent = currentStudent.student_number || 's230110001';
  }
  document.getElementById('btnOpenCertificate')?.addEventListener('click', openCertificateViewer);
  document.getElementById('btnViewCertificate')?.addEventListener('click', openCertificateViewer);

  // 4. Initialize Certificate Modal & Actions
  initCertificateModal();

  // 5. Load Retention & Policy Standing
  await loadRetentionStanding(currentStudent.id);

  // 6. Render Subject Attendance Performance Chart
  await renderSubjectAttendanceChart(currentStudent.id);

  // 7. Load Parent SMS Dispatch Logs
  await loadParentAlerts(currentStudent.id);

  // 8. Theme change redraw listener
  window.addEventListener('ams-theme-changed', () => {
    if (currentStudent) {
      renderSubjectAttendanceChart(currentStudent.id);
    }
  });

  // 9. Export Analytics Summary
  document.getElementById('btnExportAnalytics')?.addEventListener('click', handleExportAnalytics);
});

async function loadRetentionStanding(studentId) {
  const policyRateBadge = document.getElementById('policyRateBadge');
  const policyStandingTitle = document.getElementById('policyStandingTitle');
  const meterPercent = document.getElementById('meterPercent');
  const meterFill = document.getElementById('meterFill');
  const awardStatusPill = document.getElementById('awardStatusPill');

  try {
    const stats = await attendanceApi.getStudentAttendanceStats(studentId);
    currentStats = stats;
    const rate = stats.attendanceRate;

    if (policyRateBadge) policyRateBadge.textContent = `${rate}% Rate`;
    if (meterPercent) meterPercent.textContent = `${rate}%`;
    if (meterFill) {
      meterFill.style.width = `${Math.min(rate, 100)}%`;
      if (rate >= 85) {
        meterFill.className = 'h-full rounded-full transition-all duration-500 bg-emerald-500';
      } else if (rate >= 75) {
        meterFill.className = 'h-full rounded-full transition-all duration-500 bg-amber-500';
      } else {
        meterFill.className = 'h-full rounded-full transition-all duration-500 bg-rose-500';
      }
    }

    if (policyStandingTitle) {
      if (rate >= 90) {
        policyStandingTitle.textContent = 'Good Standing';
      } else if (rate >= 85) {
        policyStandingTitle.textContent = 'Near Cutoff';
      } else {
        policyStandingTitle.textContent = 'At Risk';
        policyStandingTitle.className = 'text-base font-bold text-rose-600 dark:text-rose-400';
      }
    }

    const certPanel = document.getElementById('awardCertPanel');
    const lockedPanel = document.getElementById('awardLockedPanel');
    const lockedRate = document.getElementById('lockedRate');
    const lockedRateBar = document.getElementById('lockedRateBar');
    const lockedAbsences = document.getElementById('lockedAbsences');
    const certAbsences = document.getElementById('certAbsences');
    const certPunctuality = document.getElementById('certPunctuality');
    const awardFooterNote = document.getElementById('awardFooterNote');

    if (awardStatusPill) {
      if (stats.isAwardEligible) {
        // STATE A — Qualified: show certificate
        awardStatusPill.className = 'pill pill-present text-[11px] uppercase font-bold';
        awardStatusPill.textContent = 'Qualified';
        if (certPanel) certPanel.classList.remove('hidden');
        if (lockedPanel) lockedPanel.classList.add('hidden');
        if (certAbsences) certAbsences.textContent = stats.totalAbsences ?? 0;
        if (certPunctuality) certPunctuality.textContent = `${rate}%`;
        if (awardFooterNote) awardFooterNote.textContent = 'Conferred at end of semester convocation ceremonies.';
      } else {
        // STATE B — Not yet earned: show locked progress panel
        awardStatusPill.className = 'pill pill-late text-[11px] uppercase font-bold';
        awardStatusPill.textContent = 'In Progress';
        if (certPanel) certPanel.classList.add('hidden');
        if (lockedPanel) lockedPanel.classList.remove('hidden');
        if (lockedRate) lockedRate.textContent = `${rate}%`;
        if (lockedRateBar) {
          lockedRateBar.style.width = `${Math.min(rate, 100)}%`;
          lockedRateBar.className = `h-full rounded-full transition-all duration-500 ${rate >= 85 ? 'bg-emerald-500' : rate >= 75 ? 'bg-amber-500' : 'bg-rose-500'}`;
        }
        if (lockedAbsences) {
          const absCount = stats.totalAbsences ?? '—';
          lockedAbsences.textContent = `${absCount} / 3 max`;
        }
        if (awardFooterNote) awardFooterNote.textContent = 'Keep a clean record to unlock the Perfect Attendance Award.';
      }
    }
  } catch (err) {
    console.error('[AMS Student Analytics] Error loading retention standing:', err);
  }
}

async function renderSubjectAttendanceChart(studentId) {
  const ctx = document.getElementById('subjectAttendanceChart') || document.getElementById('arrivalTimeChart');
  if (!ctx) return;

  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

  if (subjectAttendanceChartInstance) {
    subjectAttendanceChartInstance.destroy();
  }

  // Realistic course-level attendance data for enrolled student (Section 31001)
  const courses = [
    { code: 'IPT 101', name: 'Integrative Programming & Tech 1', rate: 96, attended: 24, total: 25 },
    { code: 'IAS 101', name: 'Information Assurance & Security', rate: 100, attended: 25, total: 25 },
    { code: 'NET 102', name: 'Advanced Networking & Admin', rate: 92, attended: 23, total: 25 },
    { code: 'WEB 301', name: 'Web Systems & Technologies 2', rate: 100, attended: 25, total: 25 },
    { code: 'SAD 101', name: 'Systems Analysis & Design', rate: 96, attended: 24, total: 25 },
    { code: 'ETH 102', name: 'Ethics in Information Technology', rate: 98, attended: 24, total: 24 }
  ];

  const labels = courses.map(c => c.code);
  const data = courses.map(c => c.rate);

  // Semantic attendance colors based on institutional 85% policy threshold
  const bgColors = courses.map(c => {
    if (c.rate >= 100) return isDark ? '#10B981' : '#059669';
    if (c.rate >= 85) return isDark ? '#3B82F6' : '#2196F3';
    if (c.rate >= 75) return '#F59E0B';
    return '#EF4444';
  });

  subjectAttendanceChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Attendance Rate',
        data,
        backgroundColor: bgColors,
        borderRadius: 6,
        borderSkipped: false,
        maxBarThickness: 38
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: {
        padding: {
          top: 18,
          bottom: 8,
          left: 0,
          right: 6
        }
      },
      interaction: {
        mode: 'index',
        intersect: false
      },
      scales: {
        y: {
          min: 0,
          max: 100,
          grid: { 
            color: isDark ? '#1A3866' : '#E2ECF7'
          },
          ticks: {
            stepSize: 20,
            callback: (val) => `${val}%`,
            color: isDark ? '#90CAF9' : '#4A657E',
            font: { size: 10, family: 'Inter, sans-serif' }
          }
        },
        x: {
          grid: { display: false },
          ticks: {
            color: isDark ? '#90CAF9' : '#4A657E',
            font: { size: 11, weight: '600', family: 'Inter, sans-serif' }
          }
        }
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: isDark ? '#0C1D38' : '#0D47A1',
          titleColor: '#FFFFFF',
          bodyColor: '#E3F2FD',
          borderColor: '#2196F3',
          borderWidth: 1,
          padding: 12,
          cornerRadius: 8,
          callbacks: {
            title: (items) => {
              const item = items[0];
              const course = courses[item.dataIndex];
              return `${course.code}: ${course.name}`;
            },
            label: (ctx) => {
              const course = courses[ctx.dataIndex];
              const isPassing = course.rate >= 85;
              return [
                ` Attendance Rate: ${course.rate}%`,
                ` Attended Sessions: ${course.attended} / ${course.total}`,
                ` Retention Standing: ${isPassing ? 'Compliant (Passed)' : 'At Risk (< 85%)'}`
              ];
            }
          }
        }
      }
    }
  });
}

// Backward-compatibility alias
const renderArrivalChart = renderSubjectAttendanceChart;

function handleExportAnalytics() {
  const studentFullName = `${currentStudent?.first_name || ''} ${currentStudent?.last_name || ''}`.trim() || 'Juan Dela Cruz';
  const studentNo = currentStudent?.student_number || 's230110001';
  const sectionName = currentStudent?.section_name || '31001';
  const overallRate = currentStats?.attendanceRate ?? 95.6;

  const courses = [
    { code: 'IPT 101', name: 'Integrative Programming & Tech 1', rate: 96, attended: 24, total: 25 },
    { code: 'IAS 101', name: 'Information Assurance & Security', rate: 100, attended: 25, total: 25 },
    { code: 'NET 102', name: 'Advanced Networking & Admin', rate: 92, attended: 23, total: 25 },
    { code: 'WEB 301', name: 'Web Systems & Technologies 2', rate: 100, attended: 25, total: 25 },
    { code: 'SAD 101', name: 'Systems Analysis & Design', rate: 96, attended: 24, total: 25 },
    { code: 'ETH 102', name: 'Ethics in Information Technology', rate: 98, attended: 24, total: 24 }
  ];

  const headers = ['Course Code', 'Descriptive Course Title', 'Attended', 'Total Sessions', 'Attendance Rate', 'Policy Status'];
  const rows = courses.map(c => [
    c.code,
    c.name,
    String(c.attended),
    String(c.total),
    `${c.rate}%`,
    c.rate >= 85 ? 'COMPLIANT' : 'AT RISK'
  ]);

  const dateStamp = new Date().toISOString().split('T')[0];

  openExportModal({
    title: 'Student Course Attendance Performance Report',
    filename: `BCP_Attendance_Analytics_${studentNo}_${dateStamp}`,
    headers,
    rows,
    metadata: {
      'Student Name': studentFullName,
      'Student Number': studentNo,
      'Section': sectionName,
      'Overall Attendance Rate': `${overallRate}%`,
      'Institutional Policy Threshold': '85% Minimum',
      'Perfect Attendance Standing': currentStats?.isAwardEligible ? 'Qualified / Candidate' : 'In Progress'
    }
  });
}

async function loadParentAlerts(studentId) {
  const tbody = document.getElementById('parentAlertsTableBody');
  if (!tbody) return;

  const sb = getSupabase();
  if (!sb) return;

  try {
    const { data: alerts } = await sb
      .from('alerts_log')
      .select('*')
      .eq('student_id', studentId)
      .order('sent_at', { ascending: false })
      .limit(5);

    if (alerts && alerts.length > 0) {
      tbody.innerHTML = alerts.map(a => {
        const dateFormatted = new Date(a.sent_at).toLocaleDateString('en-US', {
          month: 'short', day: 'numeric', year: 'numeric'
        });
        const timeFormatted = new Date(a.sent_at).toLocaleTimeString('en-US', {
          hour: '2-digit', minute: '2-digit', hour12: true
        });

        const isDelivered = a.status === 'sent' || a.status === 'delivered';
        const typeBadge = a.alert_type === 'absent' ? 'pill-absent' : 'pill-late';
        const typeLabel = a.alert_type === 'absent' ? 'Absence Alert' : 'Tardiness Notice';

        return `
          <tr class="hover:bg-[var(--surface-hover)] transition-colors">
            <td class="py-3 px-4 font-mono text-xs tabular-nums" style="color: var(--text-2);">${dateFormatted} · ${timeFormatted}</td>
            <td class="py-3 px-4">
              <span class="pill ${typeBadge} text-[10px] uppercase font-bold tracking-wider">${typeLabel}</span>
            </td>
            <td class="py-3 px-4 text-xs font-mono" style="color: var(--text-2);">${a.message_body || 'SMS Notification'}</td>
            <td class="py-3 px-4">
              <span class="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded font-semibold ${isDelivered ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' : 'bg-rose-50 text-rose-700'}">
                ${isDelivered ? 'Delivered (Semaphore)' : 'Pending'}
              </span>
            </td>
          </tr>
        `;
      }).join('');
    }
  } catch (err) {
    console.warn('[AMS Student Analytics] Alerts load note:', err);
  }
}

/**
 * Certificate Modal Controller
 * Handles open, close, ESC keyboard dismissal, backdrop click, and clean print trigger
 */
function initCertificateModal() {
  const modal = document.getElementById('certificateModal');
  const btnOpen = document.getElementById('btnOpenCertModal');
  const btnCloseBottom = document.getElementById('btnCloseCertificateModalBottom');
  const btnPrintBottom = document.getElementById('btnPrintCertificateBottom');

  if (!modal) return;

  function populateAndOpenModal(e) {
    if (e) e.preventDefault();

    const studentName = `${currentStudent?.first_name || ''} ${currentStudent?.last_name || ''}`.trim() || 'Juan Dela Cruz';
    const studentNo = currentStudent?.student_number || 's230110001';
    const sectionName = currentStudent?.section_name || '31001';
    const rate = currentStats?.attendanceRate ?? 100;

    const nameEl = document.getElementById('modalCertStudentName');
    const noEl = document.getElementById('modalCertStudentNo');
    const secEl = document.getElementById('modalCertSection');
    const rateEl = document.getElementById('modalCertRate');
    const serialEl = document.getElementById('modalCertSerial');
    const dateEl = document.getElementById('modalCertDate');

    if (nameEl) nameEl.textContent = studentName;
    if (noEl) noEl.textContent = studentNo;
    if (secEl) secEl.textContent = sectionName;
    if (rateEl) rateEl.textContent = `${rate}%`;
    if (serialEl) {
      const cleanNo = studentNo.replace(/[^a-zA-Z0-9]/g, '');
      serialEl.textContent = `BCP-AMS-2026-PA-${cleanNo || '00101'}`;
    }
    if (dateEl) {
      dateEl.textContent = new Date().toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric'
      });
    }

    modal.classList.remove('hidden');
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  }

  function closeModal(e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    modal.classList.add('hidden');
    modal.style.display = 'none';
    document.body.style.overflow = '';
  }

  function handlePrint(e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    window.print();
  }

  if (btnOpen) {
    btnOpen.addEventListener('click', populateAndOpenModal);
  }

  if (btnCloseBottom) {
    btnCloseBottom.addEventListener('click', closeModal);
  }

  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      closeModal(e);
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.style.display !== 'none' && !modal.classList.contains('hidden')) {
      closeModal(e);
    }
  });

  if (btnPrintBottom) {
    btnPrintBottom.addEventListener('click', handlePrint);
  }
}
