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

// Modal State
let overrideTargetStudent = null;
let overrideTargetStatus = 'present';

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

  // 7. Load Assigned Sections
  await loadAssignedSections();

  // 8. Subscribe to Live Realtime Gate Ingress
  initRealtimeIngress();
});

window.addEventListener('beforeunload', () => {
  if (realtimeChannel) {
    unsubscribeChannel(realtimeChannel);
  }
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

    select.addEventListener('change', (e) => {
      selectedSectionId = e.target.value;
      loadSectionRoster();
    });

    await loadSectionRoster();
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
    const status = student.status || 'absent';

    let statusPillClass = 'pill-absent';
    let statusLabel = 'Absent';
    if (status === 'present') {
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
    if (student.scan_method) {
      const method = student.scan_method.toUpperCase();
      const loc = student.device_location || 'Gate Scanner';
      methodDisplay = `${method} · ${loc}`;
    }

    return `
      <tr class="hover:bg-[var(--surface-hover)] transition-colors" data-student-id="${student.id}" id="row-${student.id}">
        <!-- Student Identity -->
        <td class="py-3 px-4">
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs shrink-0" style="background: var(--raised); color: var(--accent);">
              ${initials}
            </div>
            <div>
              <div class="font-semibold text-sm student-name">${fullName}</div>
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
          <span class="pill ${statusPillClass} status-pill text-[11px] uppercase font-bold tracking-wider">
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
 * Realtime WebSocket subscription for live student gate ingress
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

        showToast({
          title: 'Live Tap Received',
          message: `${student.first_name} ${student.last_name} scanned at gate (${newLog.status.toUpperCase()}).`,
          type: newLog.status === 'present' ? 'success' : 'warning'
        });
      }
    }
  });
}
