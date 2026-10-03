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
let sessionTappedStudents = [];
let sessionCountdownInterval = null;
let qrRotationInterval = null;
let qrSecondsRemaining = 30;
let qrCodeInstance = null;

// Modal State
let overrideTargetStudent = null;
let overrideTargetStatus = 'present';
let targetVoidStudent = null;

// Subject Class Session & Method State
let pendingSubjectSection = null;
let selectedSubjectMethod = 'rfid';

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

  // 6. Setup Top Active Class Session Trigger
  const btnStartTop = document.getElementById('btnStartSubjectSessionTop');
  if (btnStartTop) {
    btnStartTop.addEventListener('click', () => {
      const currentSec = assignedSections.find(s => s.id === selectedSectionId);
      if (currentSec) {
        openSubjectMethodModal(currentSec);
      } else {
        showToast({ title: 'Select Subject', message: 'Please select a subject class first.', type: 'warning' });
      }
    });
  }

  // 7. Setup Modal Listeners & Session Controls
  initOverrideModal();
  initVoidModal();
  initBatchAbsentModal();
  initSessionModals();
  initSubjectMethodModal();

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

  try {
    assignedSections = await sectionsApi.getSectionsByTeacher(currentTeacher.id);

    if (!assignedSections || assignedSections.length === 0) {
      if (select) select.innerHTML = '<option value="">No sections assigned</option>';
      return;
    }

    // Check if URL specifies a section (?section=UUID)
    const urlParams = new URLSearchParams(window.location.search);
    const preselectedId = urlParams.get('section');

    if (select) {
      select.innerHTML = assignedSections.map(sec => `
        <option value="${sec.id}">${sec.name} · ${sec.subject || 'Class'} (${sec.active_student_count || 0} students)</option>
      `).join('');
    }

    if (preselectedId && assignedSections.some(s => s.id === preselectedId)) {
      if (select) select.value = preselectedId;
      selectedSectionId = preselectedId;
    } else {
      selectedSectionId = assignedSections[0].id;
      if (select) select.value = selectedSectionId;
    }

    if (select) {
      select.addEventListener('change', async (e) => {
        await selectSubjectClass(e.target.value);
      });
    }

    updateActiveClassBar();
    populateClassFilterDropdowns();
    initClassScheduleFilters();
    renderSubjectCards(assignedSections);
    await loadSectionRoster();
    await checkTeacherActiveSession();
  } catch (err) {
    console.error('[AMS Teacher Attendance] Error loading sections:', err);
    if (select) select.innerHTML = '<option value="">Failed to load sections</option>';
  }
}

/**
 * Populates the Section and Subject filter dropdowns from assignedSections
 */
function populateClassFilterDropdowns() {
  const secFilter = document.getElementById('classSectionFilter');
  const subjFilter = document.getElementById('classSubjectFilter');

  if (secFilter) {
    const uniqueSections = [...new Set(assignedSections.map(s => s.name).filter(Boolean))];
    secFilter.innerHTML = '<option value="">All Sections</option>' + uniqueSections.map(name => `
      <option value="${name}">${name}</option>
    `).join('');
  }

  if (subjFilter) {
    const uniqueSubjects = [];
    const seenCodes = new Set();
    assignedSections.forEach(s => {
      const code = s.subject_code || s.code || '';
      const name = s.subject_name || s.subject || 'Subject';
      if (code && !seenCodes.has(code)) {
        seenCodes.add(code);
        uniqueSubjects.push({ code, name });
      }
    });

    subjFilter.innerHTML = '<option value="">All Subjects</option>' + uniqueSubjects.map(sub => `
      <option value="${sub.code}">${sub.code} · ${sub.name}</option>
    `).join('');
  }
}

/**
 * Initializes listeners for search bar, section filter, and subject filter
 */
function initClassScheduleFilters() {
  const searchInput = document.getElementById('classSearchInput');
  const secFilter = document.getElementById('classSectionFilter');
  const subjFilter = document.getElementById('classSubjectFilter');
  const resetBtn = document.getElementById('btnResetClassFilters');

  function applyFilters() {
    const q = (searchInput?.value || '').trim().toLowerCase();
    const secVal = secFilter?.value || '';
    const subjVal = subjFilter?.value || '';

    const filtered = assignedSections.filter(sec => {
      const matchesQuery = !q || [
        sec.subject_code,
        sec.subject_name,
        sec.subject,
        sec.name,
        sec.room,
        sec.schedule
      ].some(val => (val || '').toLowerCase().includes(q));

      const matchesSec = !secVal || sec.name === secVal;
      const matchesSubj = !subjVal || (sec.subject_code === subjVal || (sec.code === subjVal));

      return matchesQuery && matchesSec && matchesSubj;
    });

    renderSubjectCards(filtered);
  }

  searchInput?.addEventListener('input', applyFilters);
  secFilter?.addEventListener('change', applyFilters);
  subjFilter?.addEventListener('change', applyFilters);

  resetBtn?.addEventListener('click', () => {
    if (searchInput) searchInput.value = '';
    if (secFilter) secFilter.value = '';
    if (subjFilter) subjFilter.value = '';
    renderSubjectCards(assignedSections);
  });
}

/**
 * Updates the Active Class Banner at the top with details of the selected subject
 */
function updateActiveClassBar() {
  const currentSec = assignedSections.find(s => s.id === selectedSectionId);
  if (!currentSec) return;

  const subCode = currentSec.subject_code || currentSec.code || 'IT 301';
  const subName = currentSec.subject_name || currentSec.subject || 'Information Technology Core';
  const scheduleStr = currentSec.schedule || '08:00 AM – 10:00 AM';
  const roomStr = currentSec.room || 'Computer Lab 4';
  const count = currentSec.active_student_count || currentRoster.length || 0;

  const avatar = document.getElementById('activeClassAvatar');
  const codeBadge = document.getElementById('activeClassCodeBadge');
  const title = document.getElementById('activeClassTitle');
  const secBadge = document.getElementById('activeClassSectionBadge');
  const schedText = document.getElementById('activeClassScheduleText');
  const roomText = document.getElementById('activeClassRoomText');
  const countText = document.getElementById('activeClassEnrolledText');

  if (avatar) avatar.textContent = subCode.slice(0, 3).trim();
  if (codeBadge) codeBadge.textContent = subCode;
  if (title) title.textContent = subName;
  if (secBadge) secBadge.textContent = `Section: ${currentSec.name}`;
  if (schedText) schedText.textContent = scheduleStr;
  if (roomText) roomText.textContent = roomStr;
  if (countText) countText.textContent = `${count} Enrolled`;

  const btnTop = document.getElementById('btnStartSubjectSessionTop');
  if (btnTop) {
    const isLive = activeSession && activeSession.section_id === currentSec.id && activeSession.status === 'active';
    if (isLive) {
      btnTop.innerHTML = `
        <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
        <span>Session Live (${(activeSession.scan_method || 'rfid').toUpperCase()})</span>
      `;
      btnTop.style.background = 'var(--present)';
    } else {
      btnTop.innerHTML = `
        <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
        <span>Start Attendance Session</span>
      `;
      btnTop.style.background = 'var(--ch-900)';
    }
  }

  // Also sync hidden sectionSelect value
  const select = document.getElementById('sectionSelect');
  if (select && select.value !== currentSec.id) {
    select.value = currentSec.id;
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
    if (tbody) tbody.innerHTML = `<tr><td colspan="6" class="py-12 text-center text-sm" style="color: var(--text-3);">Please select a subject class.</td></tr>`;
    return;
  }

  const currentSec = assignedSections.find(s => s.id === selectedSectionId);
  if (rosterTitle && currentSec) {
    rosterTitle.textContent = `${currentSec.subject_name || currentSec.subject || 'Class'} · Section ${currentSec.name}`;
  }
  if (rosterSubtitle && currentSec) {
    rosterSubtitle.textContent = `Showing enrolled students · Academic Year ${currentSec.school_year || '2026-2027'} · Room: ${currentSec.room || 'TBA'} · ${currentSec.schedule || 'Scheduled'}`;
  }

  if (tbody) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="py-12 text-center text-sm" style="color: var(--text-3);">
          Loading enrolled student roster and attendance status...
        </td>
      </tr>
    `;
  }

  try {
    currentRoster = await sectionsApi.getSectionRosterWithAttendance(selectedSectionId, selectedDate);

    if (countBadge) {
      countBadge.textContent = `${currentRoster.length} Enrolled Students`;
    }

    updateActiveClassBar();
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
  const secLateChip = document.getElementById('secLateChip');
  const secAbsentCount = document.getElementById('secAbsentCount');
  const secExcusedCount = document.getElementById('secExcusedCount');

  if (secPresentCount) secPresentCount.textContent = present;
  if (secPresentPct) secPresentPct.textContent = `${presentPct}% present/late`;
  if (secLateCount) secLateCount.textContent = late;
  if (secAbsentCount) secAbsentCount.textContent = absent;
  if (secExcusedCount) secExcusedCount.textContent = excused;

  if (secLateChip) {
    const currentSec = assignedSections.find(s => s.id === selectedSectionId);
    if (currentSec && currentSec.schedule) {
      const match = currentSec.schedule.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
      if (match) {
        let h = parseInt(match[1], 10);
        let m = parseInt(match[2], 10) + 20;
        let mer = match[3].toUpperCase();
        if (m >= 60) {
          h += Math.floor(m / 60);
          m = m % 60;
          if (h >= 12 && mer === 'AM') mer = 'PM';
          else if (h > 12 && mer === 'PM') h = h % 12;
        }
        const timeStr = `${h}:${String(m).padStart(2, '0')} ${mer}`;
        secLateChip.textContent = `After ${timeStr}`;
      } else {
        secLateChip.textContent = '20m Grace period exceeded';
      }
    } else {
      secLateChip.textContent = '20m Grace period exceeded';
    }
  }
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
    const studentNum = student.student_number || 's230110000';
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

let pendingBatchUnmarked = [];

/**
 * Initializes Batch Absent confirmation modal
 */
function initBatchAbsentModal() {
  const modal = document.getElementById('batchAbsentModal');
  const closeBtn = document.getElementById('closeBatchAbsentModalBtn');
  const cancelBtn = document.getElementById('cancelBatchAbsentBtn');
  const confirmBtn = document.getElementById('confirmBatchAbsentBtn');

  if (closeBtn) closeBtn.addEventListener('click', closeBatchAbsentModal);
  if (cancelBtn) cancelBtn.addEventListener('click', closeBatchAbsentModal);
  if (confirmBtn) confirmBtn.addEventListener('click', executeBatchMarkAbsent);
}

function openBatchAbsentModal(unmarked) {
  pendingBatchUnmarked = unmarked;
  const modal = document.getElementById('batchAbsentModal');
  const countEl = document.getElementById('batchAbsentTargetCount');
  const secEl = document.getElementById('batchAbsentSectionLabel');

  const currentSec = assignedSections.find(s => s.id === selectedSectionId);
  const secName = currentSec?.name || 'Section';
  const subName = currentSec?.subject_name || currentSec?.subject || currentSec?.subject_code || 'Subject';

  if (countEl) {
    countEl.textContent = `${unmarked.length} Unmarked Student${unmarked.length > 1 ? 's' : ''}`;
  }
  if (secEl) {
    secEl.textContent = `Section: ${secName} · ${subName}`;
  }

  if (modal) modal.classList.remove('hidden');
}

function closeBatchAbsentModal() {
  const modal = document.getElementById('batchAbsentModal');
  if (modal) modal.classList.add('hidden');
  pendingBatchUnmarked = [];
}

/**
 * Handles batch marking remaining unaccounted students as absent (opens confirmation modal)
 */
function handleBatchMarkAbsent() {
  const unmarked = currentRoster.filter(s => s.status === 'absent' && !s.scanned_at);
  if (unmarked.length === 0) {
    showToast({
      title: 'Roster Up-to-Date',
      message: 'All students already have recorded attendance status.',
      type: 'info'
    });
    return;
  }

  openBatchAbsentModal(unmarked);
}

/**
 * Executes the confirmed batch absent action
 */
async function executeBatchMarkAbsent() {
  if (!pendingBatchUnmarked || pendingBatchUnmarked.length === 0) {
    closeBatchAbsentModal();
    return;
  }

  const confirmBtn = document.getElementById('confirmBatchAbsentBtn');
  const origBtnText = confirmBtn ? confirmBtn.innerHTML : '';
  if (confirmBtn) {
    confirmBtn.disabled = true;
    confirmBtn.innerHTML = `
      <svg class="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"/><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"/></svg>
      <span>Saving...</span>
    `;
  }

  const unmarked = [...pendingBatchUnmarked];

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

    closeBatchAbsentModal();
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
  } finally {
    if (confirmBtn) {
      confirmBtn.disabled = false;
      confirmBtn.innerHTML = origBtnText;
    }
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
  if (idEl) idEl.textContent = `Student Number: ${student.student_number || 's230110000'}`;
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
  const studentNum = student.student_number || 's23011';
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
    detailsEl.textContent = `ID: ${student.student_number || 's230110000'} · Scanned: ${timeStr} · Method: ${(student.scan_method || 'rfid').toUpperCase()}`;
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
 * Synthesizes audio feedback for student card taps, scans, and warnings
 */
function playTapFeedback(isSuccess = true) {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    if (ctx.state === 'suspended') {
      ctx.resume();
    }
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (isSuccess) {
      // Pleasant C5 -> G5 major-fifth harmonic chime
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(783.99, ctx.currentTime + 0.12);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.28);
      osc.start();
      osc.stop(ctx.currentTime + 0.3);
    } else {
      // Gentle 180Hz sawtooth buzz for duplicates / errors
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(180, ctx.currentTime);
      gain.gain.setValueAtTime(0.18, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);
      osc.start();
      osc.stop(ctx.currentTime + 0.25);
    }
  } catch (err) {
    // Audio context may be restricted by browser policy prior to interaction
  }
}

/**
 * Initializes Attendance Session Modals and Controls (Time-In Ingress Only)
 */
function initSessionModals() {
  // 1. Trigger Buttons on Main Page
  document.getElementById('btnTeacherStartRfid')?.addEventListener('click', openRfidSessionModal);
  document.getElementById('btnTeacherStartQr')?.addEventListener('click', openTeacherQrModal);
  document.getElementById('btnReopenSessionModal')?.addEventListener('click', () => {
    if (activeSession?.scan_method === 'qr') {
      openTeacherQrModal();
    } else {
      openRfidSessionModal();
    }
  });

  // 2. Modal Close & Cancel Triggers
  document.getElementById('closeRfidModalBtn')?.addEventListener('click', closeRfidSessionModal);
  document.getElementById('cancelRfidModalBtn')?.addEventListener('click', closeRfidSessionModal);
  document.getElementById('closeTeacherQrModalBtn')?.addEventListener('click', closeTeacherQrModal);
  document.getElementById('cancelQrModalBtn')?.addEventListener('click', closeTeacherQrModal);

  // 3. Confirm Start Session Triggers
  document.getElementById('confirmStartRfidBtn')?.addEventListener('click', handleStartRfidSession);
  document.getElementById('confirmStartQrBtn')?.addEventListener('click', handleStartQrSession);

  // 4. Terminate Active Session Triggers
  document.getElementById('btnCloseAndRecordRfidBtn')?.addEventListener('click', handleCloseActiveSession);
  document.getElementById('btnTeacherCloseQrSession')?.addEventListener('click', handleCloseActiveSession);
  document.getElementById('btnTeacherCloseSession')?.addEventListener('click', handleCloseActiveSession);

  // 5. Interactive Simulation / Demo Buttons
  document.getElementById('btnSimulateStudentEsp32Tap')?.addEventListener('click', simulateStudentEsp32Tap);
  document.getElementById('btnSimulateInvalidStudentTap')?.addEventListener('click', simulateInvalidStudentTap);
  document.getElementById('btnSimulateStudentQrScan')?.addEventListener('click', simulateStudentQrScan);
  document.getElementById('btnSimulateInvalidStudentQr')?.addEventListener('click', simulateInvalidStudentQr);
}

/**
 * Initializes the Subject Attendance Method Selection Modal
 */
function initSubjectMethodModal() {
  const cancelBtn = document.getElementById('cancelSubjectMethodModalBtn');
  const closeBtn = document.getElementById('closeSubjectMethodModalBtn');
  const launchBtn = document.getElementById('btnConfirmLaunchSubjectSession');
  const methodCards = document.querySelectorAll('#methodPickerCards .method-card-btn');

  cancelBtn?.addEventListener('click', closeSubjectMethodModal);
  closeBtn?.addEventListener('click', closeSubjectMethodModal);

  // Method toggles (RFID vs QR)
  methodCards.forEach(card => {
    card.addEventListener('click', () => {
      const method = card.getAttribute('data-method');
      selectedSubjectMethod = method;

      methodCards.forEach(c => {
        const isCurrent = c.getAttribute('data-method') === method;
        c.classList.toggle('active', isCurrent);
        c.setAttribute('aria-checked', isCurrent ? 'true' : 'false');
      });
    });
  });

  launchBtn?.addEventListener('click', handleConfirmLaunchSubjectSession);
}

function openSubjectMethodModal(section) {
  pendingSubjectSection = section;
  selectedSubjectMethod = 'rfid'; // Default to RFID

  const modal = document.getElementById('subjectAttendanceMethodModal');
  const codeBadge = document.getElementById('methodModalCodeBadge');
  const headcount = document.getElementById('methodModalHeadcount');
  const nameEl = document.getElementById('methodModalName');
  const secEl = document.getElementById('methodModalSection');
  const schedEl = document.getElementById('methodModalSchedule');
  const roomEl = document.getElementById('methodModalRoom');

  if (codeBadge) codeBadge.textContent = section.subject_code || section.name;
  if (headcount) headcount.textContent = `${section.active_student_count || 0} Enrolled Students`;
  if (nameEl) nameEl.textContent = section.subject_name || section.subject || 'Subject Class';
  if (secEl) secEl.textContent = section.name;
  if (schedEl) schedEl.textContent = section.schedule || '08:00 AM – 10:00 AM';
  if (roomEl) roomEl.textContent = section.room || 'Computer Lab 4';

  // Reset method cards visual state to RFID active without inline style conflicts
  const methodCards = document.querySelectorAll('#methodPickerCards .method-card-btn');
  methodCards.forEach(c => {
    const isRfid = c.getAttribute('data-method') === 'rfid';
    c.classList.toggle('active', isRfid);
    c.setAttribute('aria-checked', isRfid ? 'true' : 'false');
  });

  if (modal) modal.classList.remove('hidden');
}

function closeSubjectMethodModal() {
  const modal = document.getElementById('subjectAttendanceMethodModal');
  if (modal) modal.classList.add('hidden');
  pendingSubjectSection = null;
}

/**
 * Confirms launching attendance session for the chosen subject
 */
async function handleConfirmLaunchSubjectSession() {
  if (!pendingSubjectSection) return;

  const targetSec = pendingSubjectSection;
  closeSubjectMethodModal();

  // If switching section, update selectedSectionId and load roster
  if (targetSec.id !== selectedSectionId) {
    selectedSectionId = targetSec.id;
    const select = document.getElementById('sectionSelect');
    if (select) select.value = targetSec.id;
    await loadSectionRoster();
  }

  // Refresh cards so active session styling updates
  renderSubjectCards(assignedSections);

  if (selectedSubjectMethod === 'rfid') {
    openRfidSessionModal();
    await handleStartRfidSession();
  } else {
    openTeacherQrModal();
    await handleStartQrSession();
  }

  // Re-render subject cards with live status badge
  renderSubjectCards(assignedSections);
}

/**
 * Renders Today's Class Schedule & Subject Cards
 */
function renderSubjectCards(sections) {
  const grid = document.getElementById('subjectScheduleGrid');
  const countBadge = document.getElementById('activeScheduleCountBadge');

  if (countBadge) {
    countBadge.textContent = `${sections.length} ${sections.length === 1 ? 'Class' : 'Classes'} Today`;
  }

  if (!grid) return;

  if (!sections || sections.length === 0) {
    grid.innerHTML = `
      <div class="col-span-3 p-8 text-center text-xs card" style="color:var(--text-3);">
        No assigned subject classes scheduled for today.
      </div>
    `;
    return;
  }

  grid.innerHTML = sections.map((sec, idx) => {
    const isSelected = sec.id === selectedSectionId;
    const isSessionActiveForCard = activeSession && activeSession.section_id === sec.id && activeSession.status === 'active';
    const subCode = sec.subject_code || (sec.code ? sec.code : `IT 30${idx + 1}`);
    const subName = sec.subject_name || sec.subject || 'Information Technology Core';
    const scheduleStr = sec.schedule || '08:00 AM – 10:00 AM';
    const roomStr = sec.room || `Lab ${idx + 2}`;
    const studentCount = sec.active_student_count || 0;

    const cardBorder = isSessionActiveForCard
      ? 'border-2 border-emerald-500 shadow-md'
      : (isSelected
        ? 'border-2 border-[var(--ch-500)] shadow-md ring-2 ring-[var(--ch-500)]/15'
        : 'border border-[var(--border)] hover:border-[var(--ch-200)]');

    const cardBg = isSelected ? 'background:rgba(33, 150, 243, 0.04);' : 'background:var(--surface);';

    return `
      <div class="subject-card card p-4 flex flex-col justify-between transition-all relative overflow-hidden cursor-pointer ${cardBorder}" 
           data-sec-id="${sec.id}"
           style="${cardBg}">
        ${isSessionActiveForCard ? `
          <div class="absolute top-0 right-0 px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded-bl-lg flex items-center gap-1.5" style="background:var(--present); color:#fff;">
            <span class="w-1.5 h-1.5 rounded-full bg-white animate-pulse"></span>
            Session Live
          </div>
        ` : (isSelected ? `
          <div class="absolute top-0 right-0 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded-bl-lg flex items-center gap-1" style="background:var(--ch-500); color:#fff;">
            Active Class
          </div>
        ` : '')}

        <div>
          <!-- Header: Subject Code & Headcount -->
          <div class="flex items-center justify-between gap-2 mb-2 pr-14">
            <span class="badge font-mono text-xs font-bold px-2 py-0.5 rounded" style="background:var(--ch-100); color:var(--ch-900);">
              ${subCode}
            </span>
            <span class="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
              <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              ${studentCount} Enrolled
            </span>
          </div>

          <!-- Subject Name & Section -->
          <h4 class="font-bold text-sm text-[var(--text-1)] line-clamp-1" title="${subName}">
            ${subName}
          </h4>
          <div class="text-xs font-semibold mt-0.5 text-[var(--ch-500)]">
            Section: ${sec.name}
          </div>

          <!-- Schedule & Room -->
          <div class="mt-3 pt-3 border-t space-y-1.5 text-xs text-[var(--text-2)]" style="border-color:var(--border);">
            <div class="flex items-center gap-2">
              <svg class="w-3.5 h-3.5 shrink-0 opacity-70" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              <span class="truncate">${scheduleStr}</span>
            </div>
            <div class="flex items-center gap-2">
              <svg class="w-3.5 h-3.5 shrink-0 opacity-70" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
              <span class="truncate">${roomStr}</span>
            </div>
          </div>
        </div>

        <!-- Action Buttons -->
        <div class="mt-4 pt-3 border-t flex items-center gap-2" style="border-color:var(--border);">
          <button type="button" class="btn-start-subject-session flex-1 btn-primary text-xs font-semibold py-2 px-3 rounded-lg flex items-center justify-center gap-1.5 cursor-pointer" data-id="${sec.id}" style="background:var(--ch-900); color:#fff;">
            <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            <span>Start Attendance</span>
          </button>
        </div>
      </div>
    `;
  }).join('');

  // Attach card click & button event listeners
  grid.querySelectorAll('.subject-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('.btn-start-subject-session')) return;
      const secId = card.getAttribute('data-sec-id');
      if (secId) selectSubjectClass(secId);
    });
  });

  grid.querySelectorAll('.btn-start-subject-session').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const secId = e.currentTarget.getAttribute('data-id');
      const sec = sections.find(s => s.id === secId);
      if (sec) {
        if (sec.id !== selectedSectionId) {
          await selectSubjectClass(sec.id);
        }
        openSubjectMethodModal(sec);
      }
    });
  });
}

/**
 * Selects an assigned subject class, updates the view, banner, and loads its roster
 */
async function selectSubjectClass(secId) {
  if (!secId) return;
  selectedSectionId = secId;

  // Sync hidden select if present
  const select = document.getElementById('sectionSelect');
  if (select) select.value = secId;

  updateActiveClassBar();
  renderSubjectCards(assignedSections);
  await loadSectionRoster();
  await checkTeacherActiveSession();
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
 * Opens Student RFID Session Modal (State 1 Config or State 2 Active)
 */
function openRfidSessionModal() {
  if (!selectedSectionId) {
    showToast({ title: 'Select Section', message: 'Please select an assigned section first.', type: 'warning' });
    return;
  }

  const modal = document.getElementById('teacherRfidSessionModal');
  const configSec = document.getElementById('rfidConfigSection');
  const activeSec = document.getElementById('rfidActiveSection');
  const readyLabel = document.getElementById('rfidReadyLabel');
  const title = document.getElementById('rfidModalTitle');

  // Check if session already active
  if (activeSession && activeSession.status === 'active' && new Date(activeSession.session_end) > new Date()) {
    if (activeSession.scan_method === 'rfid') {
      configSec?.classList.add('hidden');
      activeSec?.classList.remove('hidden');
      readyLabel?.classList.remove('hidden');
      if (title) title.textContent = 'ESP32 Student RFID — Live Ingress Stream';
      modal?.classList.remove('hidden');
      return;
    } else {
      showToast({
        title: 'QR Session Already Active',
        message: 'A student QR attendance pass is currently running. Please close the QR session before starting an RFID session.',
        type: 'warning'
      });
      openTeacherQrModal();
      return;
    }
  }

  // Not active: show config form
  configSec?.classList.remove('hidden');
  activeSec?.classList.add('hidden');
  readyLabel?.classList.add('hidden');
  if (title) title.textContent = 'Student RFID Attendance Session';
  modal?.classList.remove('hidden');
}

function closeRfidSessionModal() {
  const modal = document.getElementById('teacherRfidSessionModal');
  if (modal) modal.classList.add('hidden');
}

/**
 * Handles starting an RFID attendance session for the section (Time-In Ingress Only)
 */
async function handleStartRfidSession() {
  if (!selectedSectionId) {
    showToast({ title: 'Select Section', message: 'Please select an assigned section first.', type: 'warning' });
    return;
  }

  // Students attendance is strictly Time-In (one-tap ingress)
  const sessionType = 'time_in';

  try {
    const session = await attendanceApi.startSession({
      sectionId: selectedSectionId,
      scanMethod: 'rfid',
      sessionType,
      durationMinutes: 30,
      presentCutoffMinutes: 20
    });

    activeSession = { ...session, session_type: sessionType };
    sessionTappedStudents = [];

    // Switch modal to live tap mode
    const configSec = document.getElementById('rfidConfigSection');
    const activeSec = document.getElementById('rfidActiveSection');
    const title = document.getElementById('rfidModalTitle');
    const tapCount = document.getElementById('modalRfidTapCount');
    const feed = document.getElementById('modalRfidTapFeed');
    const readyLabel = document.getElementById('rfidReadyLabel');
    const feedLabel = document.getElementById('rfidFeedLabel');

    if (configSec) configSec.classList.add('hidden');
    if (activeSec) activeSec.classList.remove('hidden');
    if (title) title.textContent = 'ESP32 Student RFID — Live Ingress Stream';
    if (tapCount) tapCount.textContent = '0 Tapped';
    if (readyLabel) {
      readyLabel.textContent = 'Active';
      readyLabel.classList.remove('hidden');
    }
    if (feedLabel) feedLabel.textContent = 'Live Student Ingress Feed';

    if (feed) {
      feed.innerHTML = `
        <div id="modalRfidEmptyFeed" class="py-10 text-center text-xs" style="color:var(--text-3);">
          Waiting for student RFID card tap on the ESP32 reader...
        </div>
      `;
    }

    showSessionBanner(activeSession);
    startSessionCountdown(session.session_end);

    showToast({
      title: 'ESP32 RFID — Session Active',
      message: 'Student Time-In session open (30-minute window). Ready for card taps.',
      type: 'success'
    });
  } catch (err) {
    console.error('[AMS Teacher Attendance] Start RFID Session failed:', err);

    // If session is already running, seamlessly connect to it and display State 2
    if (err.message && err.message.toLowerCase().includes('already')) {
      try {
        const activeList = await attendanceApi.getActiveSessions({ section_id: selectedSectionId });
        if (activeList && activeList.length > 0) {
          activeSession = activeList[0];
          sessionTappedStudents = sessionTappedStudents || [];

          const configSec = document.getElementById('rfidConfigSection');
          const activeSec = document.getElementById('rfidActiveSection');
          const title = document.getElementById('rfidModalTitle');
          const tapCount = document.getElementById('modalRfidTapCount');
          const readyLabel = document.getElementById('rfidReadyLabel');
          const feedLabel = document.getElementById('rfidFeedLabel');

          if (configSec) configSec.classList.add('hidden');
          if (activeSec) activeSec.classList.remove('hidden');
          if (title) title.textContent = 'ESP32 Student RFID — Live Ingress Stream';
          if (tapCount) tapCount.textContent = `${sessionTappedStudents.length} Tapped`;
          if (readyLabel) {
            readyLabel.textContent = 'Active';
            readyLabel.classList.remove('hidden');
          }
          if (feedLabel) feedLabel.textContent = 'Live Student Ingress Feed';

          showSessionBanner(activeSession);
          startSessionCountdown(activeSession.session_end);

          showToast({
            title: 'Resumed Active Session',
            message: 'Connected to the ongoing classroom RFID session.',
            type: 'info'
          });
          return;
        }
      } catch (resumeErr) {
        console.warn('[AMS Teacher Attendance] Could not auto-resume active RFID session:', resumeErr);
      }
    }

    showToast({
      title: 'Session Error',
      message: 'Failed to start RFID session: ' + (err.message || 'Error'),
      type: 'error'
    });
  }
}

/**
 * Opens Student QR Session Modal (State 1 Config or State 2 Active Split View)
 */
function openTeacherQrModal() {
  if (!selectedSectionId) {
    showToast({ title: 'Select Section', message: 'Please select an assigned section first.', type: 'warning' });
    return;
  }

  const modal = document.getElementById('teacherQrModal');
  const card = document.getElementById('qrModalCard');
  const configSec = document.getElementById('qrConfigSection');
  const activeSec = document.getElementById('qrActiveSection');
  const readyLabel = document.getElementById('qrReadyLabel');
  const title = document.getElementById('qrModalTitle');
  const qrTapCount = document.getElementById('modalQrTapCount');

  // Check if session already active
  if (activeSession && activeSession.status === 'active' && new Date(activeSession.session_end) > new Date()) {
    if (activeSession.scan_method === 'qr') {
      card?.classList.add('is-active-session');
      configSec?.classList.add('hidden');
      activeSec?.classList.remove('hidden');
      readyLabel?.classList.remove('hidden');
      if (title) title.textContent = 'Student QR Pass — Live Ingress Stream';
      if (qrTapCount) qrTapCount.textContent = `${sessionTappedStudents.length} Scanned`;
      renderTeacherQrCode(activeSession.session_token);
      modal?.classList.remove('hidden');
      return;
    } else {
      showToast({
        title: 'RFID Session Already Active',
        message: 'A student RFID attendance session is currently running. Please close the RFID session before opening a QR pass.',
        type: 'warning'
      });
      openRfidSessionModal();
      return;
    }
  }

  // Not active: show config
  card?.classList.remove('is-active-session');
  configSec?.classList.remove('hidden');
  activeSec?.classList.add('hidden');
  readyLabel?.classList.add('hidden');
  if (title) title.textContent = 'Student QR Attendance Session';
  modal?.classList.remove('hidden');
}

function closeTeacherQrModal() {
  const modal = document.getElementById('teacherQrModal');
  if (modal) modal.classList.add('hidden');
}

/**
 * Handles starting a Dynamic QR Code attendance session with teacher GPS (Time-In Ingress Only)
 */
async function handleStartQrSession() {
  if (!selectedSectionId) {
    showToast({ title: 'Select Section', message: 'Please select an assigned section first.', type: 'warning' });
    return;
  }

  // Students attendance is strictly Time-In (one-tap ingress)
  const sessionType = 'time_in';

  // Best-effort geolocation
  let teacherLat = 14.7011;
  let teacherLng = 121.0409; // Default Bestlink College centroid

  if (navigator.geolocation) {
    try {
      const pos = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 4000,
          maximumAge: 60000
        });
      });
      teacherLat = pos.coords.latitude;
      teacherLng = pos.coords.longitude;
    } catch (e) {
      console.warn('[AMS Teacher Attendance] Using campus centroid coordinates:', e);
    }
  }

  try {
    const session = await attendanceApi.startSession({
      sectionId: selectedSectionId,
      scanMethod: 'qr',
      sessionType,
      teacherLat,
      teacherLng,
      durationMinutes: 30,
      presentCutoffMinutes: 20
    });

    activeSession = { ...session, session_type: sessionType };
    sessionTappedStudents = [];

    // Switch modal to live split mode
    const card = document.getElementById('qrModalCard');
    const configSec = document.getElementById('qrConfigSection');
    const activeSec = document.getElementById('qrActiveSection');
    const title = document.getElementById('qrModalTitle');
    const readyLabel = document.getElementById('qrReadyLabel');
    const feedLabel = document.getElementById('qrFeedLabel');
    const tapCount = document.getElementById('modalQrTapCount');
    const feed = document.getElementById('modalQrTapFeed');

    card?.classList.add('is-active-session');
    if (configSec) configSec.classList.add('hidden');
    if (activeSec) activeSec.classList.remove('hidden');
    if (title) title.textContent = 'Student QR Pass — Live Ingress Stream';
    if (readyLabel) {
      readyLabel.textContent = 'Active';
      readyLabel.classList.remove('hidden');
    }
    if (feedLabel) feedLabel.textContent = 'Live Student QR Ingress Feed';
    if (tapCount) tapCount.textContent = '0 Scanned';

    if (feed) {
      feed.innerHTML = `
        <div id="modalQrEmptyFeed" class="py-12 text-center text-xs" style="color:var(--text-3);">
          Waiting for student QR scan on the terminal...
        </div>
      `;
    }

    renderTeacherQrCode(session.session_token);
    showSessionBanner(activeSession);
    startSessionCountdown(session.session_end);
    startQrRotationTimer(session.id);

    showToast({
      title: 'Student QR Pass Active',
      message: 'Dynamic QR attendance active with 50-meter anti-buddy-punch geofence.',
      type: 'success'
    });
  } catch (err) {
    console.error('[AMS Teacher Attendance] Start QR Session failed:', err);

    // If session is already running, seamlessly connect to it and display State 2
    if (err.message && err.message.toLowerCase().includes('already')) {
      try {
        const activeList = await attendanceApi.getActiveSessions({ section_id: selectedSectionId });
        if (activeList && activeList.length > 0) {
          activeSession = activeList[0];
          sessionTappedStudents = sessionTappedStudents || [];

          const card = document.getElementById('qrModalCard');
          const configSec = document.getElementById('qrConfigSection');
          const activeSec = document.getElementById('qrActiveSection');
          const title = document.getElementById('qrModalTitle');
          const readyLabel = document.getElementById('qrReadyLabel');
          const feedLabel = document.getElementById('qrFeedLabel');
          const tapCount = document.getElementById('modalQrTapCount');

          card?.classList.add('is-active-session');
          if (configSec) configSec.classList.add('hidden');
          if (activeSec) activeSec.classList.remove('hidden');
          if (title) title.textContent = 'Student QR Pass — Live Ingress Stream';
          if (readyLabel) {
            readyLabel.textContent = 'Active';
            readyLabel.classList.remove('hidden');
          }
          if (feedLabel) feedLabel.textContent = 'Live Student QR Ingress Feed';
          if (tapCount) tapCount.textContent = `${sessionTappedStudents.length} Scanned`;

          renderTeacherQrCode(activeSession.session_token);
          showSessionBanner(activeSession);
          startSessionCountdown(activeSession.session_end);
          startQrRotationTimer(activeSession.id);

          showToast({
            title: 'Resumed Active Session',
            message: 'Connected to the ongoing classroom QR session.',
            type: 'info'
          });
          return;
        }
      } catch (resumeErr) {
        console.warn('[AMS Teacher Attendance] Could not auto-resume active QR session:', resumeErr);
      }
    }

    showToast({
      title: 'Session Error',
      message: 'Failed to start QR session: ' + (err.message || 'Error'),
      type: 'error'
    });
  }
}

/**
 * Evaluates tardiness based on the subject's scheduled start time + 20 min grace period,
 * or based on when the teacher opened the session (if teacher opened late).
 */
function evaluateSubjectTardiness(section, scanDate = new Date()) {
  const scanTimeMs = scanDate.getTime();
  const graceMs = 20 * 60 * 1000;

  // 1. Calculate scheduled cutoff timestamp for today (+20 mins)
  const schedStr = section?.schedule || '08:00 AM – 10:00 AM';
  const startMatch = schedStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);

  const schedStart = new Date(scanDate);
  schedStart.setSeconds(0, 0);

  if (startMatch) {
    let hour = parseInt(startMatch[1], 10);
    const min = parseInt(startMatch[2], 10);
    const meridiem = startMatch[3].toUpperCase();
    if (meridiem === 'PM' && hour < 12) hour += 12;
    if (meridiem === 'AM' && hour === 12) hour = 0;
    schedStart.setHours(hour, min, 0, 0);
  } else {
    schedStart.setHours(8, 0, 0, 0);
  }

  const scheduledCutoffMs = schedStart.getTime() + graceMs;

  // 2. Calculate teacher session cutoff if session is active
  // If the teacher was late opening the session, grant 20 minutes from when the teacher opened it
  let sessionCutoffMs = 0;
  if (activeSession) {
    if (activeSession.present_cutoff) {
      sessionCutoffMs = new Date(activeSession.present_cutoff).getTime();
    } else if (activeSession.session_start) {
      sessionCutoffMs = new Date(activeSession.session_start).getTime() + graceMs;
    } else if (activeSession.session_end) {
      const sessionStartMs = new Date(activeSession.session_end).getTime() - 30 * 60 * 1000;
      sessionCutoffMs = sessionStartMs + graceMs;
    }
  }

  // Effective cutoff is whichever is later:
  // e.g., if schedule is 8:00 AM -> 8:20 AM
  // if teacher opened late at 8:15 AM -> 8:35 AM
  const effectiveCutoffMs = Math.max(scheduledCutoffMs, sessionCutoffMs);

  return scanTimeMs > effectiveCutoffMs;
}

/**
 * Records a verified student card tap or QR scan into the active session (Time-In Ingress)
 */
function recordStudentCardTap(student, cardUid = null, method = 'rfid') {
  if (!student) return;

  const currentSec = assignedSections.find(s => s.id === selectedSectionId);

  // Strict Subject Enrollment Verification
  // Only students enrolled in this specific subject roster are authorized
  const isEnrolled = currentRoster && currentRoster.some(s => s.id === student.id || (cardUid && s.card_uid === cardUid));

  if (!isEnrolled) {
    // 1. Negative error buzz
    playTapFeedback(false);

    const tapUid = cardUid || (method === 'qr' ? 'QR-INVALID' : 'CARD-INVALID');
    const studentName = student ? `${student.first_name || ''} ${student.last_name || ''}`.trim() : 'Unknown Student';
    const studentNum = student?.student_number || 'UNENROLLED';
    const subjectLabel = currentSec?.subject_code ? `${currentSec.subject_code} (${currentSec.name})` : 'this subject class';

    // 2. Access Denied Toast Notification
    showToast({
      title: 'Access Denied · Not Enrolled',
      message: `${studentName} (${studentNum}) is NOT enrolled in ${subjectLabel}. Attendance rejected.`,
      type: 'error'
    });

    // 3. In-Modal Live Feed Rejected Item (Red Highlight)
    const isQr = method === 'qr';
    const modalFeed = document.getElementById(isQr ? 'modalQrTapFeed' : 'modalRfidTapFeed');
    if (modalFeed) {
      const emptyPrompt = document.getElementById(isQr ? 'modalQrEmptyFeed' : 'modalRfidEmptyFeed');
      if (emptyPrompt) emptyPrompt.remove();

      const rejectItem = document.createElement('div');
      rejectItem.className = 'p-2.5 rounded-lg border flex items-center justify-between gap-3 text-xs animate-fade-in';
      rejectItem.style.cssText = 'background:rgba(239, 68, 68, 0.08); border-color:rgba(239, 68, 68, 0.3);';
      rejectItem.innerHTML = `
        <div class="flex items-center gap-2.5 min-w-0">
          <div class="w-7 h-7 rounded-full flex items-center justify-center font-bold text-[10px] shrink-0" style="background:var(--absent); color:#fff;">
            !
          </div>
          <div class="truncate">
            <div class="font-semibold text-rose-600 dark:text-rose-400 truncate">${studentName}</div>
            <div class="text-[10px] text-[var(--text-3)] font-mono">${studentNum} · ${tapUid}</div>
          </div>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <span class="badge" style="background:rgba(239, 68, 68, 0.15); color:var(--absent); border:1px solid rgba(239, 68, 68, 0.3); font-size:9px; font-weight:800;">REJECTED · NOT ENROLLED</span>
        </div>
      `;
      modalFeed.prepend(rejectItem);
    }

    // 4. Live Feed Stream Rejected Item on Main Page
    const streamFeed = document.getElementById('teacherLiveTapStream');
    if (streamFeed) {
      const emptyPrompt = streamFeed.querySelector('.text-center');
      if (emptyPrompt) emptyPrompt.remove();

      const initials = `${(student.first_name || 'U')[0]}${(student.last_name || '')[0] || ''}`.toUpperCase();
      const streamRejectItem = document.createElement('div');
      streamRejectItem.className = 'p-3 rounded-lg border flex items-center justify-between gap-3 text-xs animate-fade-in';
      streamRejectItem.style.cssText = 'background:rgba(239, 68, 68, 0.08); border-color:rgba(239, 68, 68, 0.3);';
      streamRejectItem.innerHTML = `
        <div class="flex items-center gap-2.5 min-w-0">
          <div class="w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs shrink-0" style="background:rgba(239, 68, 68, 0.18); color:var(--absent);">
            ${initials}
          </div>
          <div class="truncate">
            <div class="font-semibold text-sm text-rose-600 dark:text-rose-400 truncate">${studentName}</div>
            <div class="text-[11px] text-[var(--text-3)] font-mono">${studentNum} · NOT ENROLLED</div>
          </div>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <span class="pill pill-absent text-[10px] uppercase font-bold tracking-wider">REJECTED</span>
        </div>
      `;
      streamFeed.prepend(streamRejectItem);
    }

    return; // Strictly abort: do not grant attendance credit
  }

  const sessionType = 'time_in';
  const now = new Date();

  // Check anti-passback within current session
  const alreadyTapped = sessionTappedStudents.find(s => s.id === student.id);
  if (alreadyTapped) {
    playTapFeedback(false);
    showToast({
      title: 'Already Recorded',
      message: `${student.first_name} ${student.last_name} has already logged time-in for this session.`,
      type: 'warning'
    });
    return;
  }

  // Attendance status determination based on class scheduled start time + 15 min grace cutoff
  const isLate = evaluateSubjectTardiness(currentSec, now);
  const status = isLate ? 'late' : 'present';

  const tapUid = cardUid || (method === 'qr' ? ('QR-' + Math.floor(100000 + Math.random() * 900000)) : ('E2' + Math.floor(100000 + Math.random() * 900000)));
  const initials = `${(student.first_name || 'S')[0]}${(student.last_name || '')[0] || ''}`.toUpperCase();
  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });

  const record = {
    id: student.id,
    first_name: student.first_name,
    last_name: student.last_name,
    student_number: student.student_number || 's230110000',
    status: status,
    time: timeStr,
    scanned_at: now.toISOString(),
    method: method,
    card_uid: tapUid,
    session_type: sessionType
  };

  sessionTappedStudents.unshift(record);

  // 1. Update In-Modal Live Feed (RFID or QR)
  const isQr = method === 'qr';
  const tapCountEl = document.getElementById(isQr ? 'modalQrTapCount' : 'modalRfidTapCount');
  if (tapCountEl) {
    tapCountEl.textContent = `${sessionTappedStudents.length} ${isQr ? 'Scanned' : 'Tapped'}`;
  }

  const modalFeed = document.getElementById(isQr ? 'modalQrTapFeed' : 'modalRfidTapFeed');
  if (modalFeed) {
    const emptyPrompt = document.getElementById(isQr ? 'modalQrEmptyFeed' : 'modalRfidEmptyFeed');
    if (emptyPrompt) emptyPrompt.remove();

    const statusBadge = status === 'late'
      ? '<span class="badge" style="background:var(--late-soft); color:var(--late); font-size:9px; font-weight:800;">LATE</span>'
      : '<span class="badge" style="background:var(--present-soft); color:var(--present); font-size:9px; font-weight:800;">PRESENT</span>';

    const item = document.createElement('div');
    item.className = 'p-2.5 rounded-lg border flex items-center justify-between gap-3 text-xs animate-fade-in';
    item.style.cssText = 'background:var(--raised); border-color:var(--border);';
    item.innerHTML = `
      <div class="flex items-center gap-2.5 min-w-0">
        <div class="w-7 h-7 rounded-full flex items-center justify-center font-bold text-[10px] shrink-0" style="background:linear-gradient(135deg, var(--ch-500) 0%, var(--ch-900) 100%); color:#fff;">
          ${initials}
        </div>
        <div class="truncate">
          <div class="font-semibold text-[var(--text-1)] truncate">${student.first_name} ${student.last_name}</div>
          <div class="text-[10px] text-[var(--text-3)] font-mono">${record.student_number} · ${tapUid}</div>
        </div>
      </div>
      <div class="flex items-center gap-2 shrink-0">
        ${statusBadge}
        <span class="font-mono text-[10px] text-[var(--text-3)] tabular-nums">${timeStr}</span>
      </div>
    `;
    modalFeed.prepend(item);
  }

  // 2. Update Student in Current Roster & Table
  const rosterIdx = currentRoster.findIndex(s => s.id === student.id);
  if (rosterIdx !== -1) {
    currentRoster[rosterIdx].status = status;
    currentRoster[rosterIdx].scanned_at = now.toISOString();
    currentRoster[rosterIdx].scan_method = method;
    currentRoster[rosterIdx].is_voided = false;
    currentRoster[rosterIdx].device_location = method === 'qr' ? 'Classroom QR' : 'Classroom Reader';
  }

  updateKpiCounters();
  renderRosterRows(currentRoster);

  // 3. Highlight Table Row
  const row = document.getElementById(`row-${student.id}`);
  if (row) {
    row.style.background = 'rgba(16, 185, 129, 0.12)';
    setTimeout(() => {
      row.style.background = '';
    }, 1800);
  }

  // 4. Update Right-Hand Live Scans Stream on Main Page
  const streamFeed = document.getElementById('teacherLiveTapStream');
  if (streamFeed) {
    const emptyPrompt = streamFeed.querySelector('.text-center');
    if (emptyPrompt) emptyPrompt.remove();

    const streamItem = document.createElement('div');
    streamItem.className = 'p-3 rounded-lg border flex items-center justify-between gap-3 text-xs animate-fade-in';
    streamItem.style.cssText = 'background:var(--raised); border-color:var(--border);';
    streamItem.innerHTML = `
      <div class="flex items-center gap-2.5 min-w-0">
        <div class="w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs shrink-0" style="background:var(--ch-100); color:var(--ch-900);">
          ${initials}
        </div>
        <div class="truncate">
          <div class="font-semibold text-sm student-name truncate">${student.first_name} ${student.last_name}</div>
          <div class="text-[11px] text-[var(--text-3)] font-mono">${record.student_number} · ${method.toUpperCase()}</div>
        </div>
      </div>
      <div class="flex items-center gap-2 shrink-0">
        <span class="pill ${status === 'late' ? 'pill-late' : 'pill-present'} text-[10px] uppercase font-bold tracking-wider">${status}</span>
        <button type="button" class="void-student-btn p-1.5 rounded hover:bg-rose-100 dark:hover:bg-rose-950/60 text-rose-600 dark:text-rose-400 transition-colors" data-id="${student.id}" title="Void Attendance">
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
        </button>
      </div>
    `;
    streamItem.querySelector('.void-student-btn')?.addEventListener('click', () => {
      openVoidModal(student);
    });
    streamFeed.prepend(streamItem);
  }

  // 5. Play Positive Chime
  playTapFeedback(true);

  // 6. Notify via Toast
  showToast({
    title: `Time-In Logged: ${student.first_name} ${student.last_name}`,
    message: `Marked ${status.toUpperCase()} (${timeStr}) via ${method.toUpperCase()} · Card: ${tapUid}`,
    type: status === 'late' ? 'warning' : 'success'
  });
}

/**
 * Simulates an enrolled student RFID card tap on the ESP32 reader for demonstration
 */
function simulateStudentEsp32Tap() {
  if (!currentRoster || currentRoster.length === 0) {
    showToast({ title: 'Roster Empty', message: 'No students found in this section to simulate.', type: 'warning' });
    return;
  }

  // Find next enrolled student who hasn't tapped yet
  const untrapped = currentRoster.filter(s => !sessionTappedStudents.some(t => t.id === s.id));
  if (untrapped.length === 0) {
    showToast({
      title: 'Section Fully Checked In',
      message: 'All students in this section roster have already been recorded.',
      type: 'info'
    });
    return;
  }

  const student = untrapped[0];
  const fakeUid = student.card_uid || ('E280' + Math.floor(1000 + Math.random() * 9000));
  recordStudentCardTap(student, fakeUid, 'rfid');
}

/**
 * Simulates an un-enrolled student tapping an RFID card (Rejection Test)
 */
function simulateInvalidStudentTap() {
  const invalidStudent = {
    id: 'unenrolled-' + Math.floor(1000 + Math.random() * 9000),
    first_name: 'Mark Anthony',
    last_name: 'Reyes',
    student_number: '2023-CS-99120'
  };
  const fakeUid = 'E280' + Math.floor(8000 + Math.random() * 1999);
  recordStudentCardTap(invalidStudent, fakeUid, 'rfid');
}

/**
 * Simulates an enrolled student QR code scan for demonstration
 */
function simulateStudentQrScan() {
  if (!currentRoster || currentRoster.length === 0) {
    showToast({ title: 'Roster Empty', message: 'No students found in this section to simulate.', type: 'warning' });
    return;
  }

  // Find next enrolled student who hasn't scanned yet
  const unscanned = currentRoster.filter(s => !sessionTappedStudents.some(t => t.id === s.id));
  if (unscanned.length === 0) {
    showToast({
      title: 'Section Fully Checked In',
      message: 'All students in this section roster have already been recorded.',
      type: 'info'
    });
    return;
  }

  const student = unscanned[0];
  const fakeToken = 'QR-' + Math.floor(100000 + Math.random() * 900000);
  recordStudentCardTap(student, fakeToken, 'qr');
}

/**
 * Simulates an un-enrolled student scanning QR pass (Rejection Test)
 */
function simulateInvalidStudentQr() {
  const invalidStudent = {
    id: 'unenrolled-' + Math.floor(1000 + Math.random() * 9000),
    first_name: 'Patricia',
    last_name: 'Santos',
    student_number: '2022-BA-44821'
  };
  const fakeToken = 'QR-INVALID-' + Math.floor(100000 + Math.random() * 900000);
  recordStudentCardTap(invalidStudent, fakeToken, 'qr');
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
    closeRfidSessionModal();
    closeTeacherQrModal();
    renderSubjectCards(assignedSections);

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
  const methodBadge = document.getElementById('teacherSessionMethodBadge');
  const typeBadge = document.getElementById('teacherSessionTypeBadge');
  const details = document.getElementById('teacherSessionDetails');
  const reopenBtn = document.getElementById('btnReopenSessionModal');

  if (!card) return;

  const methodUpper = (session.scan_method || 'rfid').toUpperCase();

  if (title) title.textContent = `Active ${methodUpper} Attendance Session`;
  if (methodBadge) methodBadge.textContent = methodUpper;
  if (typeBadge) typeBadge.textContent = 'TIME-IN ONLY';

  if (details) {
    details.textContent = session.scan_method === 'qr'
      ? 'Classroom QR window is live. Displaying rotating pass for regular, irregular, and Octoberian students.'
      : 'Session window is live. Students may tap their RFID cards on the scanner for classroom time-in.';
  }

  if (reopenBtn) {
    reopenBtn.textContent = session.scan_method === 'qr' ? 'View Live QR' : 'View Live Tapping';
  }

  card.style.display = 'block';
  updateActiveClassBar();
}

function hideSessionBanner() {
  const card = document.getElementById('teacherSessionCard');
  if (card) card.style.display = 'none';
  if (sessionCountdownInterval) {
    clearInterval(sessionCountdownInterval);
    sessionCountdownInterval = null;
  }
  updateActiveClassBar();
}

/**
 * Starts 1-second countdown for the session window
 */
function startSessionCountdown(sessionEndIso) {
  if (sessionCountdownInterval) clearInterval(sessionCountdownInterval);

  const countdownEl = document.getElementById('teacherSessionCountdown');
  const modalRfidCountdown = document.getElementById('modalRfidCountdown');
  const modalRfidBar = document.getElementById('modalRfidProgressBar');
  const studentQrCountdown = document.getElementById('studentQrSessionRemaining');
  const studentQrBar = document.getElementById('studentQrSessionProgressBar');
  const studentQrPct = document.getElementById('studentQrSessionPct');

  const totalDurationMs = 30 * 60 * 1000;
  const endMs = new Date(sessionEndIso).getTime();

  function update() {
    const now = Date.now();
    const diff = endMs - now;

    if (diff <= 0) {
      if (countdownEl) countdownEl.textContent = '00:00';
      if (modalRfidCountdown) modalRfidCountdown.textContent = '00:00';
      if (studentQrCountdown) studentQrCountdown.textContent = '00:00';
      if (modalRfidBar) modalRfidBar.style.width = '0%';
      if (studentQrBar) studentQrBar.style.width = '0%';
      if (studentQrPct) studentQrPct.textContent = '0% remaining';

      clearInterval(sessionCountdownInterval);
      sessionCountdownInterval = null;
      hideSessionBanner();
      activeSession = null;
      renderSubjectCards(assignedSections);
      showToast({ title: 'Session Ended', message: 'The 30-minute attendance window has closed.', type: 'info' });
      return;
    }

    const mins = Math.floor(diff / 60000);
    const secs = Math.floor((diff % 60000) / 1000);
    const formatted = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

    if (countdownEl) countdownEl.textContent = formatted;
    if (modalRfidCountdown) modalRfidCountdown.textContent = formatted;
    if (studentQrCountdown) studentQrCountdown.textContent = formatted;

    const fraction = Math.max(0, Math.min(1, diff / totalDurationMs));
    const pct = Math.round(fraction * 100);

    if (modalRfidBar) modalRfidBar.style.width = `${pct}%`;
    if (studentQrBar) studentQrBar.style.width = `${pct}%`;
    if (studentQrPct) studentQrPct.textContent = `${pct}% remaining`;
  }

  update();
  sessionCountdownInterval = setInterval(update, 1000);
}

/**
 * Renders teacher rotating QR code on canvas
 */
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
      width: 170,
      height: 170,
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
