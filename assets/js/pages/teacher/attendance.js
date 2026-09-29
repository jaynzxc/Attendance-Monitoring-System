/**
 * attendance.js - Teacher Section Roll Call & Manual Override Controller
 * Bestlink College of the Philippines - Attendance Monitoring System (AMS)
 * Authoritative Reference: docs/UI-UX_Architecture.md, docs/WORKFLOW.md, docs/Security.md
 */

import { requireRole } from '../../lib/rbac-guard.js';
import { getCurrentUser } from '../../lib/auth.js';
import { sectionsApi } from '../../api/sectionsApi.js';
import { attendanceApi } from '../../api/attendanceApi.js';
import { subscribeToAttendanceLogs, unsubscribeChannel } from '../../lib/realtime.js';
import { showToast } from '../../components/toast.js';

let currentTeacher = null;
let assignedSections = [];
let selectedSectionId = null;
let selectedDate = new Date().toISOString().split('T')[0];
let currentRoster = [];
let realtimeChannel = null;

// Session State
let activeSession = null;
let sessionCountdownInterval = null;
let qrRotationInterval = null;
let qrSecondsRemaining = 30;
let qrCodeInstance = null;

// Modal State
let overrideTargetStudent = null;
let overrideTargetStatus = 'present';
let targetVoidStudent = null;

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Enforce Teacher Role Guard
  await requireRole(['teacher']);

  // 2. Fetch authenticated teacher profile
  currentTeacher = await getCurrentUser() || {
    id: 'b0000000-0000-0000-0000-000000000001',
    first_name: 'Ricardo',
    last_name: 'Santos',
    role: 'teacher'
  };

  // 3. Setup Date Input
  const dateInput = document.getElementById('attendanceDate');
  if (dateInput) {
    dateInput.value = selectedDate;
    dateInput.addEventListener('change', (e) => {
      selectedDate = e.target.value;
      loadSectionRoster();
    });
  }

  // 4. Setup Search Filter
  const searchInput = document.getElementById('studentSearchInput');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      filterRosterDisplay(e.target.value.trim().toLowerCase());
    });
  }

  // 5. Setup Batch Action Button
  const batchAbsentBtn = document.getElementById('markUnmarkedAbsentBtn');
  if (batchAbsentBtn) {
    batchAbsentBtn.addEventListener('click', handleBatchMarkAbsent);
  }

  // 6. Setup Modal Listeners
  initOverrideModal();
  initVoidModal();
  initTeacherQrModal();

  // 7. Setup Session Control Buttons
  initSessionButtons();

  // 8. Load Assigned Sections
  await loadAssignedSections();

  // 9. Subscribe to Live Realtime Gate Ingress
  initRealtimeIngress();
});

window.addEventListener('beforeunload', () => {
  if (realtimeChannel) {
    unsubscribeChannel(realtimeChannel);
  }
  if (sessionCountdownInterval) clearInterval(sessionCountdownInterval);
  if (qrRotationInterval) clearInterval(qrRotationInterval);
});

/**
 * Loads sections assigned to the logged-in teacher and sets initial selection
 */
async function loadAssignedSections() {
  const select = document.getElementById('sectionSelect');
  if (!select) return;

  try {
    assignedSections = await sectionsApi.getSectionsByTeacher(currentTeacher.id);

    if (!assignedSections || assignedSections.length === 0) {
      select.innerHTML = '<option value="">No sections assigned</option>';
      return;
    }

    // Check if URL specifies a section (?section=UUID)
    const urlParams = new URLSearchParams(window.location.search);
    const preselectedId = urlParams.get('section');

    select.innerHTML = assignedSections.map(sec => `
      <option value="${sec.id}">${sec.name} · ${sec.subject || 'Class'} (${sec.active_student_count || 0} students)</option>
    `).join('');

    if (preselectedId && assignedSections.some(s => s.id === preselectedId)) {
      select.value = preselectedId;
      selectedSectionId = preselectedId;
    } else {
      selectedSectionId = assignedSections[0].id;
      select.value = selectedSectionId;
    }

    select.addEventListener('change', async (e) => {
      selectedSectionId = e.target.value;
      await loadSectionRoster();
      await checkTeacherActiveSession();
    });

    await loadSectionRoster();
    await checkTeacherActiveSession();
  } catch (err) {
    console.error('[AMS Teacher Attendance] Error loading sections:', err);
    select.innerHTML = '<option value="">Failed to load sections</option>';
  }
}

/**
 * Loads student roster and merges today's attendance logs
 */
async function loadSectionRoster() {
  const tbody = document.getElementById('rosterTableBody');
  const rosterTitle = document.getElementById('sectionRosterTitle');
  const rosterSubtitle = document.getElementById('sectionRosterSubtitle');
  const countBadge = document.getElementById('rosterCountBadge');

  if (!selectedSectionId) {
    if (tbody) tbody.innerHTML = `<tr><td colspan="6" class="py-12 text-center text-sm" style="color: var(--text-3);">Please select a section.</td></tr>`;
    return;
  }

  const currentSec = assignedSections.find(s => s.id === selectedSectionId);
  if (rosterTitle && currentSec) {
    rosterTitle.textContent = `${currentSec.name} — Class Roll Call`;
  }
  if (rosterSubtitle && currentSec) {
    rosterSubtitle.textContent = `${currentSec.subject || 'Class'} · Academic Year ${currentSec.school_year || '2026-2027'}`;
  }

  if (tbody) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="py-12 text-center text-sm" style="color: var(--text-3);">
          Loading section roster and gate tap records...
        </td>
      </tr>
    `;
  }

  try {
    currentRoster = await sectionsApi.getSectionRosterWithAttendance(selectedSectionId, selectedDate);

    if (countBadge) {
      countBadge.textContent = `${currentRoster.length} Students`;
    }

    updateKpiCounters();
    renderRosterRows(currentRoster);
  } catch (err) {
    console.error('[AMS Teacher Attendance] Error loading roster:', err);
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" class="py-12 text-center text-sm text-red-500">
            Failed to load roster. Please try again.
          </td>
        </tr>
      `;
    }
  }
}

/**
 * Calculates section roll call KPIs
 */
function updateKpiCounters() {
  let present = 0, late = 0, absent = 0, excused = 0;

  currentRoster.forEach(s => {
    if (s.status === 'present') present++;
    else if (s.status === 'late') late++;
    else if (s.status === 'absent') absent++;
    else if (s.status === 'excused') excused++;
  });

  const total = currentRoster.length;
  const presentPct = total > 0 ? Math.round(((present + late) / total) * 100) : 0;

  const secPresentCount = document.getElementById('secPresentCount');
  const secPresentPct = document.getElementById('secPresentPct');
  const secLateCount = document.getElementById('secLateCount');
  const secAbsentCount = document.getElementById('secAbsentCount');
  const secExcusedCount = document.getElementById('secExcusedCount');

  if (secPresentCount) secPresentCount.textContent = present;
  if (secPresentPct) secPresentPct.textContent = `${presentPct}% present/late`;
  if (secLateCount) secLateCount.textContent = late;
  if (secAbsentCount) secAbsentCount.textContent = absent;
  if (secExcusedCount) secExcusedCount.textContent = excused;
}

/**
 * Renders table rows for current roster
 */
function renderRosterRows(roster) {
  const tbody = document.getElementById('rosterTableBody');
  if (!tbody) return;

  if (roster.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="py-12 text-center text-sm" style="color: var(--text-3);">
          No enrolled students found in this section.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = roster.map(student => {
    const initials = `${(student.first_name || 'U')[0]}${(student.last_name || '')[0] || ''}`.toUpperCase();
    const fullName = `${student.first_name || ''} ${student.last_name || ''}`.trim();
    const studentNum = student.student_number || '2024-IT-00000';
    const status = student.is_voided ? 'absent' : (student.status || 'absent');

    let statusPillClass = 'pill-absent';
    let statusLabel = 'Absent';
    if (student.is_voided) {
      statusLabel = 'VOIDED';
    } else if (status === 'present') {
      statusPillClass = 'pill-present';
      statusLabel = 'Present';
    } else if (status === 'late') {
      statusPillClass = 'pill-late';
      statusLabel = 'Late';
    } else if (status === 'excused') {
      statusPillClass = 'pill-excused';
      statusLabel = 'Excused';
    }

    const timeInDisplay = student.scanned_at
      ? new Date(student.scanned_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })
      : '—';

    let methodDisplay = '—';
    if (student.is_voided) {
      methodDisplay = `<span class="text-rose-600 dark:text-rose-400 font-semibold">Voided · Buddy Punch</span>`;
    } else if (student.scan_method) {
      const method = student.scan_method.toUpperCase();
      const loc = student.device_location || (student.scan_method === 'qr' ? 'Classroom QR' : 'Gate Scanner');
      methodDisplay = `${method} · ${loc}`;
    }

    const manualBadge = (student.is_manual && !student.is_voided)
      ? `<span class="ml-1 text-[9px] font-bold px-1.5 py-0.5 rounded tracking-wide" style="background:var(--ch-100); color:var(--ch-900);">MANUAL</span>`
      : '';

    const voidBadgeStyle = student.is_voided
      ? `style="background:rgba(239, 68, 68, 0.15); color:var(--absent); border:1px solid rgba(239, 68, 68, 0.4);"`
      : '';

    // If student has a recorded tap and is not voided, teacher can void
    const canVoid = !!(student.scanned_at && !student.is_voided);

    return `
      <tr class="hover:bg-[var(--surface-hover)] transition-colors ${student.is_voided ? 'bg-rose-50/20 dark:bg-rose-950/20' : ''}" data-student-id="${student.id}" id="row-${student.id}">
        <!-- Student Identity -->
        <td class="py-3 px-4">
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs shrink-0" style="background: var(--raised); color: var(--accent);">
              ${initials}
            </div>
            <div>
              <div class="font-semibold text-sm student-name flex items-center gap-1.5">
                <span>${fullName}</span>
                ${manualBadge}
              </div>
              <div class="text-[11px]" style="color: var(--text-3);">${student.email || 'student@bestlink.edu.ph'}</div>
            </div>
          </div>
        </td>

        <!-- Student ID -->
        <td class="py-3 px-4 font-mono text-xs tabular-nums student-num" style="color: var(--text-2);">
          ${studentNum}
        </td>

        <!-- Status Pill -->
        <td class="py-3 px-4">
          <span class="pill ${statusPillClass} status-pill text-[11px] uppercase font-bold tracking-wider" ${voidBadgeStyle}>
            ${statusLabel}
          </span>
        </td>

        <!-- Time In -->
        <td class="py-3 px-4 font-mono text-xs tabular-nums time-cell" style="color: var(--text-2);">
          ${timeInDisplay}
        </td>

        <!-- Method & Location -->
        <td class="py-3 px-4 text-xs method-cell" style="color: var(--text-2);">
          ${methodDisplay}
        </td>

        <!-- Manual Fallback Actions -->
        <td class="py-3 px-4 text-center">
          <div class="flex items-center justify-center gap-1.5">
            <button type="button" class="quick-status-btn p-1.5 rounded hover:bg-emerald-100 dark:hover:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 transition-colors" data-id="${student.id}" data-status="present" title="Mark Present">
              <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
            </button>
            <button type="button" class="quick-status-btn p-1.5 rounded hover:bg-amber-100 dark:hover:bg-amber-950/60 text-amber-600 dark:text-amber-400 transition-colors" data-id="${student.id}" data-status="late" title="Mark Late">
              <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            </button>
            <button type="button" class="quick-status-btn p-1.5 rounded hover:bg-rose-100 dark:hover:bg-rose-950/60 text-rose-600 dark:text-rose-400 transition-colors" data-id="${student.id}" data-status="absent" title="Mark Absent">
              <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
            <button type="button" class="open-override-modal-btn p-1.5 rounded hover:bg-[var(--raised)] text-[var(--accent)] transition-colors" data-id="${student.id}" title="Custom Override / Audit Note">
              <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
            </button>
            ${canVoid ? `
              <button type="button" class="void-student-btn p-1.5 rounded hover:bg-rose-100 dark:hover:bg-rose-950/60 text-rose-600 dark:text-rose-400 transition-colors" data-id="${student.id}" title="Void Attendance (Buddy Punch Violation)">
                <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
              </button>
            ` : ''}
          </div>
        </td>
      </tr>
    `;
  }).join('');

  // Attach quick action listeners
  tbody.querySelectorAll('.quick-status-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const studentId = btn.getAttribute('data-id');
      const targetStatus = btn.getAttribute('data-status');
      performQuickOverride(studentId, targetStatus);
    });
  });

  tbody.querySelectorAll('.open-override-modal-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const studentId = btn.getAttribute('data-id');
      const student = currentRoster.find(s => s.id === studentId);
      if (student) {
        openOverrideModal(student);
      }
    });
  });

  tbody.querySelectorAll('.void-student-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const studentId = btn.getAttribute('data-id');
      const student = currentRoster.find(s => s.id === studentId);
      if (student) {
        openVoidModal(student);
      }
    });
  });

  // Populate Live Tap Stream with already scanned students for today
  renderLiveTapStreamFromRoster();
}

/**
 * Filter roster view based on search input
 */
function filterRosterDisplay(query) {
  const rows = document.querySelectorAll('#rosterTableBody tr[data-student-id]');
  rows.forEach(row => {
    const name = row.querySelector('.student-name')?.textContent?.toLowerCase() || '';
    const num = row.querySelector('.student-num')?.textContent?.toLowerCase() || '';
    if (!query || name.includes(query) || num.includes(query)) {
      row.style.display = '';
    } else {
      row.style.display = 'none';
    }
  });
}

/**
 * Performs quick 1-click manual override
 */
async function performQuickOverride(studentId, targetStatus, reason = null) {
  const student = currentRoster.find(s => s.id === studentId);
  if (!student) return;

  const studentName = `${student.first_name} ${student.last_name}`;

  try {
    // 1. Optimistic UI update
    updateStudentRowUI(studentId, targetStatus, 'MANUAL · Classroom Override');

    // 2. Call transactional RPC fn_manual_attendance_override
    await attendanceApi.manualOverride({
      studentId,
      sectionId: selectedSectionId,
      status: targetStatus,
      reason: reason || 'Teacher live roll call manual verification',
      date: selectedDate
    });

    // 3. Update memory state
    student.status = targetStatus;
    student.scan_method = 'manual';
    student.scanned_at = student.scanned_at || new Date().toISOString();
    student.device_location = 'Classroom Manual Override';
    updateKpiCounters();

    showToast({
      title: 'Roll Call Updated',
      message: `${studentName} marked as ${targetStatus.toUpperCase()}.`,
      type: 'success'
    });
  } catch (err) {
    console.error('[AMS Teacher Attendance] Override failed:', err);
    showToast({
      title: 'Override Failed',
      message: 'Could not record override. Reverting changes.',
      type: 'error'
    });
    // Revert by reloading roster
    await loadSectionRoster();
  }
}

/**
 * Optimistically updates a table row visually
 */
function updateStudentRowUI(studentId, status, methodText) {
  const row = document.getElementById(`row-${studentId}`);
  if (!row) return;

  const pill = row.querySelector('.status-pill');
  const methodCell = row.querySelector('.method-cell');
  const timeCell = row.querySelector('.time-cell');

  if (pill) {
    pill.className = `pill status-pill text-[11px] uppercase font-bold tracking-wider ${
      status === 'present' ? 'pill-present' : status === 'late' ? 'pill-late' : status === 'excused' ? 'pill-excused' : 'pill-absent'
    }`;
    pill.textContent = status.toUpperCase();
  }

  if (methodCell) {
    methodCell.textContent = methodText;
  }

  if (timeCell && timeCell.textContent.trim() === '—') {
    timeCell.textContent = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
  }

  // Flash highlight animation
  row.classList.add('bg-blue-50/50', 'dark:bg-blue-950/40');
  setTimeout(() => {
    row.classList.remove('bg-blue-50/50', 'dark:bg-blue-950/40');
  }, 1200);
}

/**
 * Handles batch marking remaining unaccounted students as absent
 */
async function handleBatchMarkAbsent() {
  const unmarked = currentRoster.filter(s => s.status === 'absent' && !s.scanned_at);
  if (unmarked.length === 0) {
    showToast({
      title: 'Roster Up-to-Date',
      message: 'All students already have recorded attendance status.',
      type: 'info'
    });
    return;
  }

  const confirmMsg = `Are you sure you want to confirm ABSENT for ${unmarked.length} unmarked student(s)?`;
  if (!confirm(confirmMsg)) return;

  try {
    for (const student of unmarked) {
      await attendanceApi.manualOverride({
        studentId: student.id,
        sectionId: selectedSectionId,
        status: 'absent',
        reason: 'End-of-period batch absence marking by teacher',
        date: selectedDate
      });
      student.status = 'absent';
      student.scan_method = 'manual';
    }

    updateKpiCounters();
    renderRosterRows(currentRoster);

    showToast({
      title: 'Batch Action Complete',
      message: `${unmarked.length} student(s) marked as absent.`,
      type: 'success'
    });
  } catch (err) {
    console.error('[AMS Teacher Attendance] Batch action error:', err);
    showToast({
      title: 'Batch Action Error',
      message: 'Failed to complete batch update.',
      type: 'error'
    });
  }
}

/**
 * Initializes the detailed override modal dialog
 */
function initOverrideModal() {
  const modal = document.getElementById('overrideModal');
  const closeBtn = document.getElementById('closeOverrideModalBtn');
  const cancelBtn = document.getElementById('cancelOverrideBtn');
  const confirmBtn = document.getElementById('confirmOverrideBtn');
  const statusButtons = modal.querySelectorAll('.status-choice-btn');

  if (closeBtn) closeBtn.addEventListener('click', closeOverrideModal);
  if (cancelBtn) cancelBtn.addEventListener('click', closeOverrideModal);

  statusButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      statusButtons.forEach(b => {
        b.classList.remove('border-blue-500', 'bg-blue-50', 'dark:bg-blue-950/50', 'text-blue-600', 'dark:text-blue-400');
      });
      btn.classList.add('border-blue-500', 'bg-blue-50', 'dark:bg-blue-950/50', 'text-blue-600', 'dark:text-blue-400');
      overrideTargetStatus = btn.getAttribute('data-status');
    });
  });

  if (confirmBtn) {
    confirmBtn.addEventListener('click', async () => {
      if (!overrideTargetStudent) return;
      const reasonInput = document.getElementById('overrideReasonInput');
      const reason = reasonInput ? reasonInput.value.trim() : null;

      closeOverrideModal();
      await performQuickOverride(overrideTargetStudent.id, overrideTargetStatus, reason);
    });
  }
}

function openOverrideModal(student) {
  overrideTargetStudent = student;
  overrideTargetStatus = student.status || 'present';

  const modal = document.getElementById('overrideModal');
  const nameEl = document.getElementById('overrideStudentName');
  const idEl = document.getElementById('overrideStudentId');
  const reasonInput = document.getElementById('overrideReasonInput');
  const statusButtons = modal.querySelectorAll('.status-choice-btn');

  if (nameEl) nameEl.textContent = `${student.first_name} ${student.last_name}`;
  if (idEl) idEl.textContent = `Student Number: ${student.student_number || '2024-IT-00000'}`;
  if (reasonInput) reasonInput.value = '';

  statusButtons.forEach(btn => {
    const s = btn.getAttribute('data-status');
    if (s === overrideTargetStatus) {
      btn.classList.add('border-blue-500', 'bg-blue-50', 'dark:bg-blue-950/50', 'text-blue-600', 'dark:text-blue-400');
    } else {
      btn.classList.remove('border-blue-500', 'bg-blue-50', 'dark:bg-blue-950/50', 'text-blue-600', 'dark:text-blue-400');
    }
  });

  modal.classList.remove('hidden');
}

function closeOverrideModal() {
  const modal = document.getElementById('overrideModal');
  if (modal) modal.classList.add('hidden');
  overrideTargetStudent = null;
}

/**
 * Realtime WebSocket subscription for live student gate ingress & QR scans
 */
function initRealtimeIngress() {
  realtimeChannel = subscribeToAttendanceLogs((newLog) => {
    // If incoming scan belongs to currently selected section
    if (newLog.section_id === selectedSectionId && newLog.student_id) {
      const student = currentRoster.find(s => s.id === newLog.student_id);
      if (student) {
        student.status = newLog.status;
        student.scanned_at = newLog.scanned_at;
        student.scan_method = newLog.scan_method;

        const timeStr = new Date(newLog.scanned_at).toLocaleTimeString('en-US', {
          hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
        });

        updateStudentRowUI(
          student.id,
          newLog.status,
          `${(newLog.scan_method || 'rfid').toUpperCase()} · Gate Tap (${timeStr})`
        );
        updateKpiCounters();

        // Also push into the dedicated Live Scans Stream
        appendLiveTapToStream(student, newLog);

        showToast({
          title: 'Live Tap Received',
          message: `${student.first_name} ${student.last_name} scanned (${newLog.status.toUpperCase()}).`,
          type: newLog.status === 'present' ? 'success' : 'warning'
        });
      }
    }
  });
}

/**
 * Renders the live tap stream from existing scanned students in roster
 */
function renderLiveTapStreamFromRoster() {
  const container = document.getElementById('teacherLiveTapStream');
  if (!container) return;

  const scannedStudents = currentRoster.filter(s => s.scanned_at && !s.is_voided);
  if (scannedStudents.length === 0) {
    container.innerHTML = `
      <div class="text-center py-12 text-xs" style="color: var(--text-3);">
        No student card taps recorded yet for this session.
      </div>
    `;
    return;
  }

  // Sort descending by scanned_at
  const sorted = [...scannedStudents].sort((a, b) => new Date(b.scanned_at) - new Date(a.scanned_at));
  container.innerHTML = '';
  sorted.forEach(s => {
    const card = createLiveTapElement(s, {
      scanned_at: s.scanned_at,
      status: s.status,
      scan_method: s.scan_method
    });
    container.appendChild(card);
  });
}

/**
 * Appends or prepends a new incoming card tap into the live feed
 */
function appendLiveTapToStream(student, log) {
  const container = document.getElementById('teacherLiveTapStream');
  if (!container) return;

  if (container.querySelector('.text-center')) {
    container.innerHTML = '';
  }

  // Remove existing card for this student if present to prevent duplicates
  const existing = container.querySelector(`[data-stream-student-id="${student.id}"]`);
  if (existing) existing.remove();

  const card = createLiveTapElement(student, log);
  container.prepend(card);
}

/**
 * Creates a stream tap DOM card with quick Void button
 */
function createLiveTapElement(student, log) {
  const name = `${student.first_name || ''} ${student.last_name || ''}`.trim() || 'Student';
  const studentNum = student.student_number || '2024-IT';
  const time = log.scanned_at ? new Date(log.scanned_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }) : 'Now';
  const method = (log.scan_method || 'rfid').toUpperCase();
  const isLate = log.status === 'late';

  const card = document.createElement('div');
  card.className = 'p-2.5 rounded-lg border flex items-center justify-between gap-3 text-xs';
  card.style.background = 'var(--surface)';
  card.style.borderColor = 'var(--border)';
  card.setAttribute('data-stream-student-id', student.id);

  card.innerHTML = `
    <div class="flex items-center gap-2.5 min-w-0">
      <div class="w-2.5 h-2.5 rounded-full ${isLate ? 'bg-amber-500' : 'bg-emerald-500'} shrink-0"></div>
      <div class="truncate">
        <div class="font-semibold text-[var(--text-1)] truncate">${name}</div>
        <div class="text-[10px] text-[var(--text-3)] font-mono">${studentNum} · <span class="font-bold text-[var(--ch-500)]">${method}</span></div>
      </div>
    </div>
    <div class="flex items-center gap-2 shrink-0">
      <div class="text-right">
        <div class="font-mono text-[11px] font-bold tabular-nums text-[var(--text-1)]">${time}</div>
        <span class="text-[9px] font-bold uppercase ${isLate ? 'text-amber-500' : 'text-emerald-600 dark:text-emerald-400'}">
          ${isLate ? 'LATE' : 'PRESENT'}
        </span>
      </div>
      <button type="button" class="btn-stream-void px-2 py-1 text-[11px] font-bold rounded bg-rose-500 hover:bg-rose-600 text-white transition-colors" title="Void Attendance (Buddy Punch / Proxy)">
        Void
      </button>
    </div>
  `;

  card.querySelector('.btn-stream-void')?.addEventListener('click', () => {
    openVoidModal(student);
  });

  return card;
}

/**
 * Initializes the Buddy-Punch Void Confirmation Modal
 */
function initVoidModal() {
  const modal = document.getElementById('voidConfirmModal');
  const closeBtn = document.getElementById('closeVoidModalBtn');
  const cancelBtn = document.getElementById('cancelVoidBtn');
  const confirmBtn = document.getElementById('confirmVoidBtn');

  if (closeBtn) closeBtn.addEventListener('click', closeVoidModal);
  if (cancelBtn) cancelBtn.addEventListener('click', closeVoidModal);

  if (confirmBtn) {
    confirmBtn.addEventListener('click', handleConfirmVoid);
  }
}

function openVoidModal(student) {
  targetVoidStudent = student;
  const modal = document.getElementById('voidConfirmModal');
  const nameEl = document.getElementById('voidStudentName');
  const detailsEl = document.getElementById('voidStudentDetails');
  const reasonInput = document.getElementById('voidReasonInput');

  if (nameEl) nameEl.textContent = `${student.first_name} ${student.last_name}`;
  if (detailsEl) {
    const timeStr = student.scanned_at
      ? new Date(student.scanned_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })
      : 'Recorded';
    detailsEl.textContent = `ID: ${student.student_number || '2024-IT-00000'} · Scanned: ${timeStr} · Method: ${(student.scan_method || 'rfid').toUpperCase()}`;
  }
  if (reasonInput) {
    reasonInput.value = 'Buddy punching / proxy tap detected during roll call';
  }

  if (modal) modal.classList.remove('hidden');
}

function closeVoidModal() {
  const modal = document.getElementById('voidConfirmModal');
  if (modal) modal.classList.add('hidden');
  targetVoidStudent = null;
}

async function handleConfirmVoid() {
  if (!targetVoidStudent) return;

  const reasonInput = document.getElementById('voidReasonInput');
  const reason = reasonInput ? reasonInput.value.trim() : 'Buddy punching / proxy tap detected';
  const student = targetVoidStudent;

  try {
    closeVoidModal();

    if (!student.log_id) {
      // In case roster row is mock or lacking log_id, fallback to manual absent
      await attendanceApi.manualOverride({
        studentId: student.id,
        sectionId: selectedSectionId,
        status: 'absent',
        reason: `[VOID] ${reason}`,
        date: selectedDate
      });
    } else {
      await attendanceApi.voidAttendanceRecord(student.log_id, reason, currentTeacher.id);
    }

    student.is_voided = true;
    student.status = 'absent';
    updateKpiCounters();
    renderRosterRows(currentRoster);

    showToast({
      title: 'Attendance Voided',
      message: `${student.first_name} ${student.last_name} marked ABSENT. Prefect incident reported.`,
      type: 'warning'
    });
  } catch (err) {
    console.error('[AMS Teacher Attendance] Void attendance error:', err);
    showToast({
      title: 'Action Failed',
      message: 'Could not void attendance record. Please try again.',
      type: 'error'
    });
  }
}

/**
 * Initializes Attendance Session Action Buttons
 */
function initSessionButtons() {
  const btnRfid = document.getElementById('btnTeacherStartRfid');
  const btnQr = document.getElementById('btnTeacherStartQr');
  const btnClose = document.getElementById('btnTeacherCloseSession');

  if (btnRfid) {
    btnRfid.addEventListener('click', handleStartRfidSession);
  }

  if (btnQr) {
    btnQr.addEventListener('click', handleStartQrSession);
  }

  if (btnClose) {
    btnClose.addEventListener('click', handleCloseActiveSession);
  }
}

/**
 * Checks if a session is currently active for the selected section
 */
async function checkTeacherActiveSession() {
  if (!selectedSectionId) {
    hideSessionBanner();
    return;
  }

  try {
    const sessions = await attendanceApi.getActiveSessions({ section_id: selectedSectionId });
    if (sessions && sessions.length > 0) {
      activeSession = sessions[0];
      showSessionBanner(activeSession);
      startSessionCountdown(activeSession.session_end);
      if (activeSession.scan_method === 'qr') {
        startQrRotationTimer(activeSession.id);
      }
    } else {
      activeSession = null;
      hideSessionBanner();
    }
  } catch (err) {
    console.warn('[AMS Teacher Attendance] Error checking active session:', err);
  }
}

/**
 * Handles starting an RFID attendance session for the section
 */
async function handleStartRfidSession() {
  if (!selectedSectionId) {
    showToast({ title: 'Select Section', message: 'Please select an assigned section first.', type: 'warning' });
    return;
  }

  if (activeSession) {
    showToast({ title: 'Session Already Active', message: 'An attendance session is already running for this section.', type: 'info' });
    return;
  }

  try {
    const session = await attendanceApi.startSession({
      sectionId: selectedSectionId,
      scanMethod: 'rfid',
      durationMinutes: 30,
      presentCutoffMinutes: 20
    });

    activeSession = session;
    showSessionBanner(session);
    startSessionCountdown(session.session_end);

    showToast({
      title: 'RFID Attendance Live',
      message: 'Session is now open. Students may tap their RFID cards on the scanner.',
      type: 'success'
    });
  } catch (err) {
    console.error('[AMS Teacher Attendance] Error starting RFID session:', err);
    showToast({
      title: 'Could Not Start Session',
      message: err.message || 'Failed to start RFID session.',
      type: 'error'
    });
  }
}

/**
 * Handles starting a Dynamic QR Code attendance session with teacher GPS
 */
async function handleStartQrSession() {
  if (!selectedSectionId) {
    showToast({ title: 'Select Section', message: 'Please select an assigned section first.', type: 'warning' });
    return;
  }

  if (activeSession) {
    if (activeSession.scan_method === 'qr') {
      openTeacherQrModal(activeSession);
      return;
    }
    showToast({ title: 'Session Already Active', message: 'An RFID session is already active for this section.', type: 'info' });
    return;
  }

  if (!navigator.geolocation) {
    showToast({
      title: 'GPS Geolocation Required',
      message: 'Your browser does not support geolocation required for student QR anti-buddy-punching.',
      type: 'error'
    });
    return;
  }

  showToast({
    title: 'Acquiring GPS...',
    message: 'Acquiring high-precision classroom coordinates for 50m geofence...',
    type: 'info'
  });

  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      try {
        const teacherLat = pos.coords.latitude;
        const teacherLng = pos.coords.longitude;

        const session = await attendanceApi.startSession({
          sectionId: selectedSectionId,
          scanMethod: 'qr',
          teacherLat,
          teacherLng,
          durationMinutes: 30,
          presentCutoffMinutes: 20
        });

        activeSession = session;
        showSessionBanner(session);
        startSessionCountdown(session.session_end);
        openTeacherQrModal(session);

        showToast({
          title: 'Classroom QR Session Live',
          message: 'Dynamic QR attendance active with 50-meter anti-buddy-punch geofence.',
          type: 'success'
        });
      } catch (err) {
        console.error('[AMS Teacher Attendance] Error starting QR session:', err);
        showToast({
          title: 'Could Not Start QR Session',
          message: err.message || 'Failed to start QR session.',
          type: 'error'
        });
      }
    },
    (geoErr) => {
      console.warn('[AMS Teacher Attendance] Geolocation error:', geoErr);
      showToast({
        title: 'Location Permission Denied',
        message: 'Classroom QR sessions require teacher location to prevent offsite buddy punching. Please enable location or use RFID.',
        type: 'error'
      });
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
  );
}

/**
 * Handles early termination of the active attendance session
 */
async function handleCloseActiveSession() {
  if (!activeSession) return;

  const confirmed = confirm('Are you sure you want to end this attendance session early? Students will no longer be able to tap or scan.');
  if (!confirmed) return;

  try {
    await attendanceApi.closeSession(activeSession.id);
    activeSession = null;
    hideSessionBanner();
    closeTeacherQrModal();

    showToast({
      title: 'Session Closed Early',
      message: 'Classroom attendance session has been finalized.',
      type: 'info'
    });
  } catch (err) {
    console.error('[AMS Teacher Attendance] Error closing session:', err);
    showToast({
      title: 'Error Closing Session',
      message: 'Could not close session. Please try again.',
      type: 'error'
    });
  }
}

/**
 * Updates UI session banner
 */
function showSessionBanner(session) {
  const card = document.getElementById('teacherSessionCard');
  const title = document.getElementById('teacherSessionTitle');
  const badge = document.getElementById('teacherSessionMethodBadge');
  const details = document.getElementById('teacherSessionDetails');

  if (!card) return;

  const methodUpper = (session.scan_method || 'rfid').toUpperCase();
  if (title) title.textContent = `Active ${methodUpper} Attendance Session`;
  if (badge) badge.textContent = methodUpper;
  if (details) {
    details.textContent = session.scan_method === 'qr'
      ? 'Classroom QR window is live. Displaying rotating pass with 50m geofence.'
      : 'Session window is live. Students may tap their RFID cards on the scanner.';
  }

  card.style.display = 'block';
}

function hideSessionBanner() {
  const card = document.getElementById('teacherSessionCard');
  if (card) card.style.display = 'none';
  if (sessionCountdownInterval) {
    clearInterval(sessionCountdownInterval);
    sessionCountdownInterval = null;
  }
}

/**
 * Starts 1-second countdown for the session window
 */
function startSessionCountdown(sessionEndIso) {
  if (sessionCountdownInterval) clearInterval(sessionCountdownInterval);

  const countdownEl = document.getElementById('teacherSessionCountdown');
  const endMs = new Date(sessionEndIso).getTime();

  function update() {
    const diff = endMs - Date.now();
    if (diff <= 0) {
      if (countdownEl) countdownEl.textContent = '00:00';
      clearInterval(sessionCountdownInterval);
      sessionCountdownInterval = null;
      hideSessionBanner();
      activeSession = null;
      showToast({ title: 'Session Ended', message: 'The 30-minute attendance window has closed.', type: 'info' });
      return;
    }

    const mins = Math.floor(diff / 60000);
    const secs = Math.floor((diff % 60000) / 1000);
    if (countdownEl) {
      countdownEl.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
  }

  update();
  sessionCountdownInterval = setInterval(update, 1000);
}

/**
 * Initializes and manages Teacher QR Code Modal
 */
function initTeacherQrModal() {
  const modal = document.getElementById('teacherQrModal');
  const closeBtn = document.getElementById('closeTeacherQrModalBtn');
  const doneBtn = document.getElementById('btnDoneTeacherQr');

  if (closeBtn) closeBtn.addEventListener('click', closeTeacherQrModal);
  if (doneBtn) doneBtn.addEventListener('click', closeTeacherQrModal);
}

function openTeacherQrModal(session) {
  const modal = document.getElementById('teacherQrModal');
  if (!modal) return;

  renderTeacherQrCode(session.session_token);
  modal.classList.remove('hidden');

  startQrRotationTimer(session.id);
}

function closeTeacherQrModal() {
  const modal = document.getElementById('teacherQrModal');
  if (modal) modal.classList.add('hidden');
}

function renderTeacherQrCode(token) {
  const container = document.getElementById('teacherQrCodeContainer');
  const tokenDisplay = document.getElementById('qrTokenDisplay');

  if (tokenDisplay) {
    tokenDisplay.textContent = `Token: ${token ? token.substring(0, 16) + '...' : '--'}`;
  }

  if (!container) return;
  container.innerHTML = '';

  if (typeof QRCode !== 'undefined' && token) {
    qrCodeInstance = new QRCode(container, {
      text: token,
      width: 190,
      height: 190,
      colorDark: '#000000',
      colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.M
    });
  } else if (token) {
    container.innerHTML = `<div class="p-2 text-xs font-mono break-all">${token}</div>`;
  }
}

/**
 * Rotates QR session token every 30 seconds
 */
function startQrRotationTimer(sessionId) {
  if (qrRotationInterval) clearInterval(qrRotationInterval);
  qrSecondsRemaining = 30;

  const countdownEl = document.getElementById('qrRotationCountdown');
  if (countdownEl) countdownEl.textContent = `${qrSecondsRemaining}s`;

  qrRotationInterval = setInterval(async () => {
    qrSecondsRemaining--;

    if (countdownEl) {
      countdownEl.textContent = `${qrSecondsRemaining}s`;
    }

    if (qrSecondsRemaining <= 0) {
      qrSecondsRemaining = 30;
      try {
        const result = await attendanceApi.rotateQrToken(sessionId);
        if (result && result.session_token) {
          if (activeSession) activeSession.session_token = result.session_token;
          renderTeacherQrCode(result.session_token);
        }
      } catch (err) {
        console.warn('[AMS Teacher Attendance] Error rotating QR token:', err);
      }
    }
  }, 1000);
}
