/**
 * live-session.js - Teacher Live Attendance Session Controller
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
let qrCountdownInterval = null;
let qrCodeInstance = null;

// Modal State (Preserved for single-student row actions)
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

  // 4. Setup Search & Toolbar Filters (Matching Admin Teacher Attendance)
  const searchInput = document.getElementById('studentSearchInput');
  const statusFilter = document.getElementById('filterStudentStatus');
  const methodFilter = document.getElementById('filterStudentMethod');

  searchInput?.addEventListener('input', () => filterRosterDisplay());
  statusFilter?.addEventListener('change', () => filterRosterDisplay());
  methodFilter?.addEventListener('change', () => filterRosterDisplay());

  // 5. Setup Batch Action Button
  const batchAbsentBtn = document.getElementById('markUnmarkedAbsentBtn');
  if (batchAbsentBtn) {
    batchAbsentBtn.addEventListener('click', handleBatchMarkAbsent);
  }

  // 6. Setup Dual Attendance Session Modals (RFID & QR) matching Admin
  initSessionModals();

  // 7. Setup Inline Single-Student Modals (Override & Void)
  initOverrideModal();
  initVoidModal();
  initBatchAbsentModal();

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
  if (qrCountdownInterval) clearInterval(qrCountdownInterval);
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

    // Setup Live Section Switcher Picker
    const livePicker = document.getElementById('liveSectionPicker');
    if (livePicker) {
      livePicker.innerHTML = assignedSections.map(sec => `
        <option value="${sec.id}" ${sec.id === selectedSectionId ? 'selected' : ''}>
          ${sec.subject_code || sec.name} · ${sec.name}
        </option>
      `).join('');

      livePicker.addEventListener('change', async (e) => {
        if (activeSession) {
          // Revert the picker back to the active section — cannot switch while a session is live
          e.target.value = activeSession.section_id || selectedSectionId;
          toast.show('Cannot switch classes while an attendance session is active. Close the current session first.', 'warning');
          return;
        }
        await selectSubjectClass(e.target.value);
      });
    }

    // Handle autolaunch query parameter: automatically start attendance on page
    if (urlParams.get('autolaunch') === '1') {
      const currentSec = assignedSections.find(s => s.id === selectedSectionId);
      if (currentSec) {
        setTimeout(() => {
          startAttendanceForSection(currentSec);
        }, 350);
      }
    }
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
  const count = (currentRoster && currentRoster.length > 0) ? currentRoster.length : (currentSec.active_student_count || 0);

  const codeBadge = document.getElementById('activeClassCodeBadge');
  const title = document.getElementById('activeClassTitle');
  const secBadge = document.getElementById('activeClassSectionBadge');
  const schedText = document.getElementById('activeClassScheduleText');
  const roomText = document.getElementById('activeClassRoomText');
  const countText = document.getElementById('activeClassEnrolledText');

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
 * Calculates section roll call KPIs (Matching Admin Teacher Attendance)
 */
function updateKpiCounters() {
  let present = 0, late = 0, absent = 0, excused = 0;

  currentRoster.forEach(s => {
    if (s.is_voided) {
      absent++;
    } else if (s.status === 'present') {
      present++;
    } else if (s.status === 'late') {
      late++;
    } else if (s.status === 'excused') {
      excused++;
      absent++;
    } else {
      absent++;
    }
  });

  const total = currentRoster.length;
  const presentPct = total > 0 ? Math.round(((present + late) / total) * 100) : 0;

  const currentSec = assignedSections.find(s => s.id === selectedSectionId);

  const kpiTotal = document.getElementById('kpiTotalStudents');
  const kpiTotalChip = document.getElementById('kpiTotalChip');
  const kpiPresent = document.getElementById('kpiPresentStudents');
  const kpiPresentPct = document.getElementById('kpiPresentPct');
  const kpiLate = document.getElementById('kpiLateStudents');
  const kpiLateChip = document.getElementById('kpiLateChip');
  const kpiAbsent = document.getElementById('kpiAbsentStudents');
  const kpiAbsentChip = document.getElementById('kpiAbsentChip');

  if (kpiTotal) kpiTotal.textContent = total;
  if (kpiTotalChip && currentSec) kpiTotalChip.textContent = `${currentSec.name} Roster`;

  if (kpiPresent) kpiPresent.textContent = present;
  if (kpiPresentPct) kpiPresentPct.textContent = `${presentPct}% Checked In`;

  if (kpiLate) kpiLate.textContent = late;
  if (kpiAbsent) kpiAbsent.textContent = absent;

  if (kpiAbsentChip) {
    kpiAbsentChip.textContent = absent > 0 ? `${absent} Pending Ingress` : 'All Accounted';
  }

  if (kpiLateChip) {
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
        kpiLateChip.textContent = `After ${timeStr}`;
      } else {
        kpiLateChip.textContent = '20m Grace Period Exceeded';
      }
    } else {
      kpiLateChip.textContent = '20m Grace Period Exceeded';
    }
  }

  updateSessionArrivalsCount();
}

/**
 * Renders table rows for current roster (Matching Admin Teacher Attendance layout)
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

  const currentSec = assignedSections.find(s => s.id === selectedSectionId);
  const secName = currentSec?.name || 'Section';
  const subjectName = currentSec?.subject_name || currentSec?.subject || currentSec?.subject_code || 'Subject';
  const scheduleStr = currentSec?.schedule || 'Scheduled';

  tbody.innerHTML = roster.map(student => {
    const initials = `${(student.first_name || 'U')[0]}${(student.last_name || '')[0] || ''}`.toUpperCase();
    const fullName = `${student.first_name || ''} ${student.last_name || ''}`.trim();
    const studentNum = student.student_number || 's230110000';
    const status = student.is_voided ? 'absent' : (student.status || 'absent').toLowerCase();

    let statusStyle = 'background:var(--absent-soft); color:var(--absent); font-weight:700;';
    let statusLabel = 'ABSENT';

    if (student.is_voided) {
      statusStyle = 'background:rgba(239, 68, 68, 0.15); color:var(--absent); font-weight:700; border:1px solid rgba(239, 68, 68, 0.4);';
      statusLabel = 'VOIDED';
    } else if (status === 'present') {
      statusStyle = 'background:var(--present-soft); color:var(--present); font-weight:700;';
      statusLabel = 'PRESENT';
    } else if (status === 'late') {
      statusStyle = 'background:var(--late-soft); color:var(--late); font-weight:700;';
      statusLabel = 'LATE';
    } else if (status === 'excused') {
      statusStyle = 'background:var(--excused-soft); color:var(--excused); font-weight:700;';
      statusLabel = 'EXCUSED';
    }

    const timeInDisplay = student.scanned_at
      ? new Date(student.scanned_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })
      : '—';

    let methodLabel = '—';
    let methodBadgeClass = 'text-xs text-[var(--text-3)] font-mono';
    let methodStyle = '';

    if (student.is_voided) {
      methodLabel = 'VOID';
      methodBadgeClass = 'inline-block text-[10px] font-bold px-2 py-0.5 rounded tracking-wide';
      methodStyle = 'background:rgba(239, 68, 68, 0.12); color:var(--absent); border:1px solid rgba(239, 68, 68, 0.3);';
    } else if (student.is_manual) {
      methodLabel = 'MANUAL';
      methodBadgeClass = 'inline-block text-[10px] font-bold px-2 py-0.5 rounded tracking-wide';
      methodStyle = 'background:var(--raised); border:1px solid var(--border); color:var(--text-2);';
    } else if (student.scan_method) {
      const m = student.scan_method.toUpperCase();
      methodLabel = m === 'QR' ? 'QR PASS' : m;
      methodBadgeClass = 'inline-block text-[10px] font-bold px-2 py-0.5 rounded tracking-wide';
      if (m === 'QR') {
        methodStyle = 'background:rgba(33, 150, 243, 0.12); color:var(--ch-500); border:1px solid rgba(33, 150, 243, 0.25);';
      } else {
        methodStyle = 'background:var(--ch-100); color:var(--ch-900); border:1px solid rgba(13, 71, 161, 0.2);';
      }
    } else if (student.scanned_at || status !== 'absent') {
      methodLabel = 'RFID';
      methodBadgeClass = 'inline-block text-[10px] font-bold px-2 py-0.5 rounded tracking-wide';
      methodStyle = 'background:var(--ch-100); color:var(--ch-900); border:1px solid rgba(13, 71, 161, 0.2);';
    }

    const manualBadge = (student.is_manual && !student.is_voided)
      ? `<span class="ml-1 text-[9px] font-bold px-1.5 py-0.5 rounded tracking-wide" style="background:var(--ch-100); color:var(--ch-900);">MANUAL</span>`
      : '';

    // If student has a recorded tap and is not voided, teacher can void
    const canVoid = !!(student.scanned_at && !student.is_voided);

    return `
      <tr class="hover:bg-[var(--surface-hover)] transition-colors ${student.is_voided ? 'bg-rose-50/20 dark:bg-rose-950/20' : ''}" data-student-id="${student.id}" id="row-${student.id}">
        <!-- Student Member -->
        <td class="py-3 px-4">
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs shrink-0" style="background:var(--ch-100); color:var(--ch-900);">
              ${initials}
            </div>
            <div>
              <div class="font-semibold text-xs text-[var(--text-1)] student-name flex items-center gap-1.5">
                <span>${fullName}</span>
                ${manualBadge}
              </div>
              <div class="text-[11px] font-mono text-[var(--text-3)] student-num">${studentNum}</div>
            </div>
          </div>
        </td>

        <!-- Class Schedule -->
        <td class="py-3 px-4">
          <span class="text-xs tabular-nums text-[var(--text-2)] whitespace-nowrap">${scheduleStr}</span>
        </td>

        <!-- Time In -->
        <td class="py-3 px-4">
          <span class="font-mono text-xs tabular-nums ${student.scanned_at ? 'font-semibold text-[var(--text-1)]' : 'text-[var(--text-3)]'} time-cell">${timeInDisplay}</span>
        </td>

        <!-- Status -->
        <td class="py-3 px-4">
          <span class="badge status-pill text-[11px] font-bold" style="${statusStyle}">
            ${statusLabel}
          </span>
        </td>

        <!-- Method -->
        <td class="py-3 px-4">
          <span class="method-cell ${methodBadgeClass}" style="${methodStyle}">
            ${methodLabel}
          </span>
        </td>

        <!-- Actions -->
        <td class="py-3 px-4 text-center">
          <button type="button" class="btn-edit-attendance text-xs font-semibold py-1.5 px-3 rounded-lg inline-flex items-center gap-1.5 border transition-colors cursor-pointer" data-id="${student.id}" style="background:var(--raised); border-color:var(--border); color:var(--text-1);" title="Edit attendance record">
            <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color:var(--ch-500);"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
            <span>Edit</span>
          </button>
        </td>
      </tr>
    `;
  }).join('');

  // Attach Edit button click listener to open the edit modal
  tbody.querySelectorAll('.btn-edit-attendance').forEach(btn => {
    btn.addEventListener('click', () => {
      const studentId = btn.getAttribute('data-id');
      const student = currentRoster.find(s => s.id === studentId);
      if (student) {
        openOverrideModal(student);
      }
    });
  });

  // Populate Live Tap Stream with already scanned students for today
  renderLiveTapStreamFromRoster();
}

/**
 * Filter roster view based on search input, status filter, and scan method
 */
function filterRosterDisplay() {
  const query = (document.getElementById('studentSearchInput')?.value || '').trim().toLowerCase();
  const statusFilter = (document.getElementById('filterStudentStatus')?.value || '').toLowerCase();
  const methodFilter = (document.getElementById('filterStudentMethod')?.value || '').toLowerCase();

  const rows = document.querySelectorAll('#rosterTableBody tr[data-student-id]');
  rows.forEach(row => {
    const studentId = row.getAttribute('data-student-id');
    const student = currentRoster.find(s => s.id === studentId);
    if (!student) return;

    const fullName = `${student.first_name || ''} ${student.last_name || ''}`.toLowerCase();
    const studentNum = (student.student_number || '').toLowerCase();
    const status = (student.is_voided ? 'absent' : (student.status || 'absent')).toLowerCase();
    const method = (student.scan_method || (student.is_manual ? 'manual' : '')).toLowerCase();

    const matchesSearch = !query || fullName.includes(query) || studentNum.includes(query);
    const matchesStatus = !statusFilter || status === statusFilter;
    const matchesMethod = !methodFilter || method === methodFilter || (methodFilter === 'rfid' && !method && status !== 'absent');

    if (matchesSearch && matchesStatus && matchesMethod) {
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
    updateStudentRowUI(studentId, targetStatus, 'MANUAL');

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
    student.is_manual = true;
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
function updateStudentRowUI(studentId, status, methodText, scannedAt = null) {
  const row = document.getElementById(`row-${studentId}`);
  if (!row) return;

  const pill = row.querySelector('.status-pill');
  const methodCell = row.querySelector('.method-cell');
  const timeCell = row.querySelector('.time-cell');

  if (pill) {
    let style = 'background:var(--absent-soft); color:var(--absent); font-weight:700;';
    if (status === 'present') style = 'background:var(--present-soft); color:var(--present); font-weight:700;';
    else if (status === 'late') style = 'background:var(--late-soft); color:var(--late); font-weight:700;';
    else if (status === 'excused') style = 'background:var(--excused-soft); color:var(--excused); font-weight:700;';

    pill.setAttribute('style', style);
    pill.textContent = status.toUpperCase();
  }

  if (methodCell) {
    let raw = (methodText || 'MANUAL').toUpperCase();
    let clean = 'RFID';
    let style = 'background:var(--ch-100); color:var(--ch-900); border:1px solid rgba(13, 71, 161, 0.2);';

    if (raw.includes('MANUAL')) {
      clean = 'MANUAL';
      style = 'background:var(--raised); border:1px solid var(--border); color:var(--text-2);';
    } else if (raw.includes('QR')) {
      clean = 'QR PASS';
      style = 'background:rgba(33, 150, 243, 0.12); color:var(--ch-500); border:1px solid rgba(33, 150, 243, 0.25);';
    } else if (raw.includes('VOID')) {
      clean = 'VOID';
      style = 'background:rgba(239, 68, 68, 0.12); color:var(--absent); border:1px solid rgba(239, 68, 68, 0.3);';
    }

    methodCell.textContent = clean;
    methodCell.className = 'method-cell inline-block text-[10px] font-bold px-2 py-0.5 rounded tracking-wide';
    methodCell.setAttribute('style', style);
    methodCell.classList.remove('hidden');
  }

  if (timeCell) {
    if (scannedAt || timeCell.textContent.trim() === '—') {
      const timeDate = scannedAt ? new Date(scannedAt) : new Date();
      timeCell.textContent = timeDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
      timeCell.classList.remove('text-[var(--text-3)]');
      timeCell.classList.add('font-semibold', 'text-[var(--text-1)]');
    }
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
          (newLog.scan_method || 'rfid').toUpperCase(),
          newLog.scanned_at
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
        startAttendanceForSection(sec);
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
  const livePicker = document.getElementById('liveSectionPicker');
  if (livePicker && livePicker.value !== secId) livePicker.value = secId;

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
    } else {
      activeSession = null;
      hideSessionBanner();
    }
  } catch (err) {
    console.warn('[AMS Teacher Attendance] Error checking active session:', err);
  }
}

/**
 * Modal Initializations for starting Student RFID & Classroom QR sessions
 * (Mirrors the exact dual-mode flow from admin/teacher-attendance.js)
 */
function initSessionModals() {
  const btnRfid = document.getElementById('btnTeacherStartRfid');
  const btnQr = document.getElementById('btnTeacherStartQr');
  const btnCloseTopSession = document.getElementById('btnTeacherCloseSession');
  const btnReopenModal = document.getElementById('btnReopenTeacherModal');

  const rfidModal = document.getElementById('teacherRfidSessionModal');
  const qrModal = document.getElementById('teacherQrSessionModal');

  // RFID Modal close controls
  document.getElementById('closeRfidModalBtn')?.addEventListener('click', () => {
    rfidModal?.classList.add('hidden');
    if (activeSession && activeSession.scan_method === 'rfid') {
      showToast({
        title: 'Session Running in Background',
        message: 'Student RFID ingress is active. You can reopen the live view anytime.',
        type: 'info'
      });
    }
  });
  document.getElementById('cancelRfidModalBtn')?.addEventListener('click', () => rfidModal?.classList.add('hidden'));

  // QR Modal close controls
  document.getElementById('closeQrModalBtn')?.addEventListener('click', () => {
    qrModal?.classList.add('hidden');
    if (activeSession && activeSession.scan_method === 'qr') {
      showToast({
        title: 'QR Pass Running in Background',
        message: 'Classroom QR pass is active. You can reopen it anytime from "Classroom QR Pass".',
        type: 'info'
      });
    } else {
      document.getElementById('qrModalCard')?.classList.remove('is-active-session');
      document.getElementById('qrConfigSection')?.classList.remove('hidden');
      document.getElementById('qrActiveSection')?.classList.add('hidden');
    }
  });
  document.getElementById('cancelQrModalBtn')?.addEventListener('click', () => {
    document.getElementById('qrModalCard')?.classList.remove('is-active-session');
    qrModal?.classList.add('hidden');
  });

  // Open RFID modal
  btnRfid?.addEventListener('click', () => {
    openRfidSessionModal();
  });

  // Open QR modal
  btnQr?.addEventListener('click', () => {
    openQrSessionModal();
  });

  // Confirm start buttons
  document.getElementById('confirmStartRfidBtn')?.addEventListener('click', async () => {
    await handleStartStudentRfidSession();
  });

  document.getElementById('confirmStartQrBtn')?.addEventListener('click', async () => {
    await handleStartStudentQrSession();
  });

  // Close session buttons
  document.getElementById('btnCloseAndRecordRfidBtn')?.addEventListener('click', async () => {
    await closeAndRecordActiveSession();
  });
  document.getElementById('btnTeacherCloseQrSession')?.addEventListener('click', async () => {
    await closeAndRecordActiveSession();
  });
  btnCloseTopSession?.addEventListener('click', async () => {
    await closeAndRecordActiveSession();
  });

  // Reopen active modal from top page banner
  btnReopenModal?.addEventListener('click', () => {
    if (activeSession && activeSession.scan_method === 'qr') {
      openQrSessionModal();
    } else {
      openRfidSessionModal();
    }
  });

  // Simulation triggers
  document.getElementById('btnSimulateEsp32Tap')?.addEventListener('click', () => {
    simulateStudentEsp32Tap();
  });
  document.getElementById('btnSimulateInvalidTap')?.addEventListener('click', () => {
    simulateInvalidStudentTap();
  });
  document.getElementById('btnSimulateQrScan')?.addEventListener('click', () => {
    simulateStudentQrScan();
  });
  document.getElementById('btnSimulateInvalidQrScan')?.addEventListener('click', () => {
    simulateInvalidStudentQr();
  });
}

/**
 * Opens the RFID Session modal in the appropriate state (Time-In Only)
 */
function openRfidSessionModal() {
  const currentSec = assignedSections.find(s => s.id === selectedSectionId);
  if (!currentSec) {
    showToast({ title: 'Select Section', message: 'Please select an assigned section first.', type: 'warning' });
    return;
  }

  const rfidModal = document.getElementById('teacherRfidSessionModal');
  const configSec = document.getElementById('rfidConfigSection');
  const activeSec = document.getElementById('rfidActiveSection');
  const title = document.getElementById('rfidModalTitle');
  const readyLabel = document.getElementById('rfidReadyLabel');

  // Update Section Callout
  const callout = document.getElementById('rfidSectionCallout');
  const codeCallout = document.getElementById('rfidSectionCodeCallout');
  if (callout) callout.textContent = `Section: ${currentSec.name}`;
  if (codeCallout) codeCallout.textContent = currentSec.subject_code || currentSec.code || 'IT 301';

  // Guard against opening a new session while one is already active
  if (activeSession && activeSession.status === 'active' && new Date(activeSession.session_end) > new Date()) {
    if (activeSession.scan_method === 'rfid') {
      if (configSec) configSec.classList.add('hidden');
      if (activeSec) activeSec.classList.remove('hidden');
      if (readyLabel) readyLabel.classList.remove('hidden');
      if (title) title.textContent = 'ESP32 Student RFID Ingress Live — Time-In';
      const tapCountEl = document.getElementById('modalRfidTapCount');
      if (tapCountEl) tapCountEl.textContent = `${sessionTappedStudents.length} Tapped`;
      rfidModal?.classList.remove('hidden');
      return;
    } else {
      showToast({
        title: 'QR Pass Already Active',
        message: 'A classroom QR attendance pass is currently running. Please close the active QR session before opening or starting an RFID session.',
        type: 'warning'
      });
      openQrSessionModal();
      return;
    }
  }

  // No active session — show Time-In configuration
  if (configSec) configSec.classList.remove('hidden');
  if (activeSec) activeSec.classList.add('hidden');
  if (readyLabel) readyLabel.classList.add('hidden');
  if (title) title.textContent = 'Student RFID Attendance Session';
  const rfidInput = document.getElementById('rfidSessionType');
  if (rfidInput) rfidInput.value = 'time_in';

  rfidModal?.classList.remove('hidden');
}

/**
 * Opens the QR Session modal in the appropriate state (Time-In Only)
 */
function openQrSessionModal() {
  const currentSec = assignedSections.find(s => s.id === selectedSectionId);
  if (!currentSec) {
    showToast({ title: 'Select Section', message: 'Please select an assigned section first.', type: 'warning' });
    return;
  }

  const qrModal = document.getElementById('teacherQrSessionModal');
  const qrCard = document.getElementById('qrModalCard');
  const configSec = document.getElementById('qrConfigSection');
  const activeSec = document.getElementById('qrActiveSection');
  const readyLabel = document.getElementById('qrReadyLabel');
  const qrTitle = document.getElementById('qrModalTitle');
  const qrTapCount = document.getElementById('modalQrTapCount');

  // Update Section Callout
  const callout = document.getElementById('qrSectionCallout');
  const codeCallout = document.getElementById('qrSectionCodeCallout');
  if (callout) callout.textContent = `Section: ${currentSec.name}`;
  if (codeCallout) codeCallout.textContent = currentSec.subject_code || currentSec.code || 'IT 301';

  // Guard against opening a new session while one is already active
  if (activeSession && activeSession.status === 'active' && new Date(activeSession.session_end) > new Date()) {
    if (activeSession.scan_method === 'qr') {
      qrCard?.classList.add('is-active-session');
      configSec?.classList.add('hidden');
      activeSec?.classList.remove('hidden');
      readyLabel?.classList.remove('hidden');
      if (qrTitle) qrTitle.textContent = 'Classroom QR Pass — Time-In';
      if (qrTapCount) qrTapCount.textContent = `${sessionTappedStudents.length} Scanned`;
      qrModal?.classList.remove('hidden');
      return;
    } else {
      showToast({
        title: 'RFID Session Already Active',
        message: 'A student RFID attendance session is currently running on the terminal. Please close the active RFID session before opening or starting a QR pass.',
        type: 'warning'
      });
      openRfidSessionModal();
      return;
    }
  }

  // No active session — show Time-In configuration
  qrCard?.classList.remove('is-active-session');
  configSec?.classList.remove('hidden');
  activeSec?.classList.add('hidden');
  readyLabel?.classList.add('hidden');
  if (qrTitle) qrTitle.textContent = 'Classroom QR Attendance Session';
  const qrInput = document.getElementById('qrSessionType');
  if (qrInput) qrInput.value = 'time_in';

  qrModal?.classList.remove('hidden');
}

/**
 * Starts the Student RFID session and transitions the modal to live tap mode (Time-In Only)
 */
async function handleStartStudentRfidSession() {
  const currentSec = assignedSections.find(s => s.id === selectedSectionId);
  if (!currentSec) return;

  if (activeSession && activeSession.status === 'active' && new Date(activeSession.session_end) > new Date()) {
    const methodUpper = (activeSession.scan_method || 'attendance').toUpperCase();
    showToast({
      title: 'Session Already Active',
      message: `An active ${methodUpper} session is already running for this section.`,
      type: 'warning'
    });
    return;
  }

  const duration = 30;
  const sessionType = 'time_in';

  try {
    const session = await attendanceApi.startSession({
      sectionId: currentSec.id,
      scanMethod: 'rfid',
      durationMinutes: duration,
      sessionType: 'time_in'
    });

    activeSession = { ...session, session_type: 'time_in', scan_method: 'rfid', section_id: currentSec.id };
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
    if (title) title.textContent = `ESP32 Student RFID — Time-In (${currentSec.name})`;
    if (tapCount) tapCount.textContent = '0 Tapped';
    if (readyLabel) {
      readyLabel.textContent = 'Active';
      readyLabel.classList.remove('hidden');
    }
    if (feedLabel) feedLabel.textContent = 'Live Student Time-In Feed';

    if (feed) {
      feed.innerHTML = `
        <div id="modalRfidEmptyFeed" class="py-10 text-center text-xs" style="color:var(--text-3);">
          Waiting for student RFID card tap (Time-In ingress)...
        </div>
      `;
    }

    showSessionBanner(activeSession);
    startSessionCountdown(session.session_end);
    renderSubjectCards(assignedSections);

    showToast({
      title: 'ESP32 RFID — Time-In Session Active',
      message: `Student Time-In session open for Section ${currentSec.name} (30-min window). Ready for card taps.`,
      type: 'success'
    });
  } catch (err) {
    console.error('[AMS Teacher Attendance] Start RFID Session failed:', err);
    showToast({ title: 'Session Error', message: 'Failed to start RFID session.', type: 'danger' });
  }
}

/**
 * Handles starting a Classroom QR session with dynamic rotated QR (Time-In Only)
 */
async function handleStartStudentQrSession() {
  const currentSec = assignedSections.find(s => s.id === selectedSectionId);
  if (!currentSec) return;

  if (activeSession && activeSession.status === 'active' && new Date(activeSession.session_end) > new Date()) {
    const methodUpper = (activeSession.scan_method || 'attendance').toUpperCase();
    showToast({
      title: 'Session Already Active',
      message: `An active ${methodUpper} session is already running for this section.`,
      type: 'warning'
    });
    return;
  }

  const sessionType = 'time_in';

  try {
    const session = await attendanceApi.startSession({
      sectionId: currentSec.id,
      scanMethod: 'qr',
      durationMinutes: 30,
      sessionType: 'time_in'
    });

    activeSession = { ...session, session_type: 'time_in', scan_method: 'qr', section_id: currentSec.id };
    sessionTappedStudents = [];

    // Expand modal to split 2-column view
    document.getElementById('qrModalCard')?.classList.add('is-active-session');

    // Reset QR modal live feed
    const qrFeed = document.getElementById('modalQrTapFeed');
    if (qrFeed) {
      qrFeed.innerHTML = `
        <div id="modalQrEmptyFeed" class="py-12 text-center text-xs" style="color:var(--text-3);">
          Waiting for student QR scan on the terminal...
        </div>
      `;
    }

    const configSec = document.getElementById('qrConfigSection');
    const activeSec = document.getElementById('qrActiveSection');
    const readyLabel = document.getElementById('qrReadyLabel');
    const qrTitle = document.getElementById('qrModalTitle');
    const qrTapCount = document.getElementById('modalQrTapCount');
    const feedLabel = document.getElementById('qrFeedLabel');

    if (configSec) configSec.classList.add('hidden');
    if (activeSec) activeSec.classList.remove('hidden');
    if (readyLabel) {
      readyLabel.textContent = 'Active';
      readyLabel.classList.remove('hidden');
    }
    if (qrTitle) qrTitle.textContent = `Classroom QR Pass — Time-In (${currentSec.name})`;
    if (qrTapCount) qrTapCount.textContent = '0 Scanned';
    if (feedLabel) feedLabel.textContent = 'Live Student Time-In Feed';

    startStudentQrRotation();
    showSessionBanner(activeSession);
    startSessionCountdown(session.session_end);
    renderSubjectCards(assignedSections);

    showToast({
      title: 'QR Pass — Time-In Session Active',
      message: `Classroom QR Pass open for Section ${currentSec.name}. Dynamic token rotates every 30 seconds.`,
      type: 'success'
    });
  } catch (err) {
    console.error('[AMS Teacher Attendance] Start QR Session failed:', err);
    showToast({ title: 'Session Error', message: 'Failed to start QR session.', type: 'danger' });
  }
}

/**
 * Starts rotating the QR code every 30 seconds
 */
function startStudentQrRotation() {
  if (qrRotationInterval) clearInterval(qrRotationInterval);
  if (qrCountdownInterval) clearInterval(qrCountdownInterval);

  const container = document.getElementById('teacherQrCodeContainer');
  const tokenDisplay = document.getElementById('teacherQrTokenDisplay');
  const rotationCountdown = document.getElementById('teacherQrRotationCountdown');

  function generateAndRenderQr() {
    const rawToken = 'BCP-SEC-' + (selectedSectionId ? selectedSectionId.slice(-4).toUpperCase() : 'IT01') + '-' + Math.random().toString(36).substring(2, 8).toUpperCase();
    if (tokenDisplay) tokenDisplay.textContent = `Token: ${rawToken}`;

    if (container) {
      container.innerHTML = '';
      try {
        if (typeof QRCode !== 'undefined') {
          qrCodeInstance = new QRCode(container, {
            text: JSON.stringify({ token: rawToken, section_id: selectedSectionId, ts: Date.now() }),
            width: 160,
            height: 160,
            colorDark: '#0D47A1',
            colorLight: '#ffffff',
            correctLevel: QRCode.CorrectLevel.M
          });
        } else {
          container.innerHTML = `<div class="p-4 text-center font-mono font-bold text-xs" style="color:var(--ch-900);">${rawToken}</div>`;
        }
      } catch (err) {
        container.innerHTML = `<div class="p-4 text-center font-mono font-bold text-xs" style="color:var(--ch-900);">${rawToken}</div>`;
      }
    }
  }

  generateAndRenderQr();

  let secondsLeft = 30;
  if (rotationCountdown) rotationCountdown.textContent = `${secondsLeft}s`;

  qrCountdownInterval = setInterval(() => {
    secondsLeft--;
    if (secondsLeft <= 0) {
      secondsLeft = 30;
      generateAndRenderQr();
    }
    if (rotationCountdown) rotationCountdown.textContent = `${secondsLeft}s`;
  }, 1000);
}

/**
 * Closes the active session and finalizes attendance (Mirrors Admin Teacher Attendance)
 */
async function closeAndRecordActiveSession() {
  if (activeSession) {
    try {
      await attendanceApi.closeSession(activeSession.id);
    } catch (e) {
      console.warn('[AMS Teacher Attendance] Close session error:', e);
    }
  }

  const currentSec = assignedSections.find(s => s.id === (activeSession?.section_id || selectedSectionId));
  const secName = currentSec ? currentSec.name : 'this section';
  const count = sessionTappedStudents.length;
  const method = activeSession?.scan_method || 'rfid';
  const methodLabel = method === 'qr' ? 'QR Pass' : 'RFID';

  activeSession = null;
  sessionTappedStudents = [];
  hideSessionBanner();
  renderSubjectCards(assignedSections);

  // Reset RFID modal
  const rfidModal = document.getElementById('teacherRfidSessionModal');
  const configSec = document.getElementById('rfidConfigSection');
  const activeSec = document.getElementById('rfidActiveSection');
  const readyLabel = document.getElementById('rfidReadyLabel');
  if (configSec) configSec.classList.remove('hidden');
  if (activeSec) activeSec.classList.add('hidden');
  if (readyLabel) readyLabel.classList.add('hidden');
  if (rfidModal) rfidModal.classList.add('hidden');

  // Reset QR modal
  const qrModal = document.getElementById('teacherQrSessionModal');
  const qrCard = document.getElementById('qrModalCard');
  qrCard?.classList.remove('is-active-session');
  const qrConfigSec = document.getElementById('qrConfigSection');
  const qrActiveSec = document.getElementById('qrActiveSection');
  const qrReadyLabel = document.getElementById('qrReadyLabel');
  if (qrConfigSec) qrConfigSec.classList.remove('hidden');
  if (qrActiveSec) qrActiveSec.classList.add('hidden');
  if (qrReadyLabel) qrReadyLabel.classList.add('hidden');
  if (qrModal) qrModal.classList.add('hidden');
  if (qrRotationInterval) clearInterval(qrRotationInterval);
  if (qrCountdownInterval) clearInterval(qrCountdownInterval);

  updateKpiCounters();
  renderRosterRows(currentRoster);

  if (count > 0) {
    showToast({
      title: 'Session Closed & Recorded',
      message: `Attendance finalized for ${count} student${count > 1 ? 's' : ''} in Section ${secName} (Time-In).`,
      type: 'success'
    });
  } else {
    showToast({
      title: 'Session Closed',
      message: `Student ${methodLabel} Time-In session closed for Section ${secName}.`,
      type: 'info'
    });
  }
}

/**
 * Starts or connects to an attendance session for the selected section card
 */
async function startAttendanceForSection(targetSec) {
  if (!targetSec) {
    targetSec = assignedSections.find(s => s.id === selectedSectionId);
  }
  if (!targetSec) {
    showToast({ title: 'Select Section', message: 'Please select an assigned section first.', type: 'warning' });
    return;
  }

  if (targetSec.id !== selectedSectionId) {
    await selectSubjectClass(targetSec.id);
  }

  // Open RFID session modal directly for the section
  openRfidSessionModal();
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
 * Records a verified student card tap or QR scan into the active session
 */
function recordStudentCardTap(student, cardUid = null, method = 'rfid') {
  if (!student) return;

  const currentSec = assignedSections.find(s => s.id === selectedSectionId);

  // Strict Subject Enrollment Verification
  const isEnrolled = currentRoster && currentRoster.some(s => s.id === student.id || (cardUid && s.card_uid === cardUid));

  if (!isEnrolled) {
    playTapFeedback(false);

    const tapUid = cardUid || (method === 'qr' ? 'QR-INVALID' : 'CARD-INVALID');
    const studentName = student ? `${student.first_name || ''} ${student.last_name || ''}`.trim() : 'Unknown Student';
    const studentNum = student?.student_number || 'UNENROLLED';
    const subjectLabel = currentSec?.subject_code ? `${currentSec.subject_code} (${currentSec.name})` : 'this subject class';

    showToast({
      title: 'Access Denied · Not Enrolled',
      message: `${studentName} (${studentNum}) is NOT enrolled in ${subjectLabel}. Attendance rejected.`,
      type: 'error'
    });

    // Also push rejection to modal feed if open
    const modalFeed = method === 'qr' ? document.getElementById('modalQrTapFeed') : document.getElementById('modalRfidTapFeed');
    if (modalFeed) {
      const emptyPrompt = modalFeed.querySelector(method === 'qr' ? '#modalQrEmptyFeed' : '#modalRfidEmptyFeed');
      if (emptyPrompt) emptyPrompt.remove();

      const modalItem = document.createElement('div');
      modalItem.className = 'p-2 rounded-lg border flex items-center justify-between text-xs animate-fade-in';
      modalItem.style.background = 'rgba(239, 68, 68, 0.08)';
      modalItem.style.borderColor = 'rgba(239, 68, 68, 0.3)';
      modalItem.innerHTML = `
        <div class="flex items-center gap-2 min-w-0">
          <div class="w-6 h-6 rounded-full flex items-center justify-center font-bold text-[10px] shrink-0" style="background:rgba(239, 68, 68, 0.2); color:var(--absent);">
            !
          </div>
          <div class="truncate">
            <div class="font-semibold text-xs text-rose-600 truncate">${studentName}</div>
            <div class="text-[10px] text-[var(--text-3)] font-mono">${studentNum} · NOT ENROLLED</div>
          </div>
        </div>
        <span class="pill pill-absent text-[9px] uppercase font-bold tracking-wider">REJECTED</span>
      `;
      modalFeed.prepend(modalItem);
    }

    // Live Feed Stream Rejected Item on Main Page
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

    return;
  }

  const sessionType = activeSession?.session_type || 'time_in';
  const now = new Date();

  // Check anti-passback within current session
  const alreadyTapped = sessionTappedStudents.find(s => s.id === student.id);
  if (alreadyTapped) {
    playTapFeedback(false);
    showToast({
      title: 'Already Recorded',
      message: `${student.first_name} ${student.last_name} has already logged attendance for this session.`,
      type: 'warning'
    });
    return;
  }

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

  // 1. Update Student in Current Roster & Table
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

  // 2. Highlight Table Row
  const row = document.getElementById(`row-${student.id}`);
  if (row) {
    row.style.background = 'rgba(16, 185, 129, 0.12)';
    setTimeout(() => {
      row.style.background = '';
    }, 1800);
  }

  // 3. Update Modal Live Feed (RFID or QR)
  const modalFeed = method === 'qr' ? document.getElementById('modalQrTapFeed') : document.getElementById('modalRfidTapFeed');
  if (modalFeed) {
    const emptyPrompt = modalFeed.querySelector(method === 'qr' ? '#modalQrEmptyFeed' : '#modalRfidEmptyFeed');
    if (emptyPrompt) emptyPrompt.remove();

    const modalItem = document.createElement('div');
    modalItem.className = 'p-2 rounded-lg border flex items-center justify-between text-xs animate-fade-in';
    modalItem.style.background = 'var(--raised)';
    modalItem.style.borderColor = 'var(--border)';
    modalItem.innerHTML = `
      <div class="flex items-center gap-2 min-w-0">
        <div class="w-6 h-6 rounded-full flex items-center justify-center font-bold text-[10px] shrink-0" style="background:var(--ch-100); color:var(--ch-900);">
          ${initials}
        </div>
        <div class="truncate">
          <div class="font-semibold text-xs truncate">${student.first_name} ${student.last_name}</div>
          <div class="text-[10px] text-[var(--text-3)] font-mono">${record.student_number} · ${method.toUpperCase()}</div>
        </div>
      </div>
      <div class="text-right shrink-0">
        <div class="font-mono font-bold text-xs">${timeStr}</div>
        <span class="text-[9px] font-bold uppercase ${status === 'late' ? 'text-amber-500' : 'text-emerald-600 dark:text-emerald-400'}">${status}</span>
      </div>
    `;
    modalFeed.prepend(modalItem);
  }

  // Update Modal Tap Counters
  const rfidCount = document.getElementById('modalRfidTapCount');
  const qrCount = document.getElementById('modalQrTapCount');
  if (rfidCount) rfidCount.textContent = `${sessionTappedStudents.length} Tapped`;
  if (qrCount) qrCount.textContent = `${sessionTappedStudents.length} Scanned`;
  updateSessionArrivalsCount();

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
 * Updates UI session banner and header buttons (Matching Admin Teacher Attendance model)
 */
function showSessionBanner(session) {
  const card = document.getElementById('teacherSessionCard');
  const badge = document.getElementById('teacherSessionMethodBadge');
  const typeBadge = document.getElementById('teacherSessionTypeBadge');
  const details = document.getElementById('teacherSessionDetails');
  const rfidLabel = document.getElementById('btnTeacherRfidLabel');
  const qrLabel = document.getElementById('btnTeacherQrLabel');
  const reopenBtn = document.getElementById('btnReopenTeacherModal');
  const btnRfid = document.getElementById('btnTeacherStartRfid');
  const btnQr = document.getElementById('btnTeacherStartQr');

  const currentSec = assignedSections.find(s => s.id === (session?.section_id || selectedSectionId));
  const secName = currentSec ? currentSec.name : 'Selected Section';
  const subCode = currentSec ? (currentSec.subject_code || currentSec.code || 'Class') : 'Class';

  const isQr = session.scan_method === 'qr';

  if (card) card.style.display = 'block';
  const title = document.getElementById('teacherSessionTitle');
  if (title) title.textContent = `Active Attendance: Section ${secName} (${subCode})`;
  if (badge) badge.textContent = isQr ? 'QR PASS' : (session.scan_method || 'RFID').toUpperCase();
  if (typeBadge) {
    typeBadge.textContent = 'TIME-IN';
    typeBadge.style.background = 'var(--ch-100)';
    typeBadge.style.color = 'var(--ch-900)';
  }
  if (details) {
    details.textContent = isQr
      ? `Dynamic QR Pass is actively displayed for Section ${secName} time-in ingress.`
      : `ESP32 hardware reader is actively capturing Section ${secName} time-in taps.`;
  }
  if (reopenBtn) {
    reopenBtn.textContent = isQr ? 'View QR Pass & Live Feed' : 'View Live Tapping';
  }

  // Update top action buttons to reflect the running session and block starting the other
  if (isQr) {
    if (qrLabel) qrLabel.textContent = 'Live QR Pass (Time-In)';
    if (btnQr) {
      btnQr.style.opacity = '1';
      btnQr.title = 'Click to view active QR pass and live feed';
    }
    if (rfidLabel) rfidLabel.textContent = 'Student RFID (Blocked)';
    if (btnRfid) {
      btnRfid.style.opacity = '0.55';
      btnRfid.title = 'A QR session is currently active. Close it before starting RFID.';
    }
  } else {
    if (rfidLabel) rfidLabel.textContent = 'Live RFID (Time-In)';
    if (btnRfid) {
      btnRfid.style.opacity = '1';
      btnRfid.title = 'Click to view live RFID tapping feed';
    }
    if (qrLabel) qrLabel.textContent = 'Classroom QR (Blocked)';
    if (btnQr) {
      btnQr.style.opacity = '0.55';
      btnQr.title = 'An RFID session is currently active. Close it before starting QR.';
    }
  }

  // Lock the class picker while a session is live
  const livePicker = document.getElementById('liveSectionPicker');
  if (livePicker) {
    livePicker.disabled = true;
    livePicker.title = 'Cannot switch classes while an attendance session is active';
    livePicker.style.opacity = '0.5';
    livePicker.style.cursor = 'not-allowed';
  }

  updateSessionArrivalsCount();
  updateActiveClassBar();
}

function hideSessionBanner() {
  const card = document.getElementById('teacherSessionCard');
  const rfidLabel = document.getElementById('btnTeacherRfidLabel');
  const qrLabel = document.getElementById('btnTeacherQrLabel');
  const reopenBtn = document.getElementById('btnReopenTeacherModal');
  const btnRfid = document.getElementById('btnTeacherStartRfid');
  const btnQr = document.getElementById('btnTeacherStartQr');

  if (card) card.style.display = 'none';
  if (rfidLabel) rfidLabel.textContent = 'Student RFID Session';
  if (qrLabel) qrLabel.textContent = 'Classroom QR Pass';
  if (btnRfid) {
    btnRfid.style.opacity = '1';
    btnRfid.removeAttribute('title');
  }
  if (btnQr) {
    btnQr.style.opacity = '1';
    btnQr.removeAttribute('title');
  }

  if (sessionCountdownInterval) {
    clearInterval(sessionCountdownInterval);
    sessionCountdownInterval = null;
  }
  if (qrRotationInterval) {
    clearInterval(qrRotationInterval);
    qrRotationInterval = null;
  }
  if (qrCountdownInterval) {
    clearInterval(qrCountdownInterval);
    qrCountdownInterval = null;
  }
  // Unlock the class picker when session ends
  const livePicker = document.getElementById('liveSectionPicker');
  if (livePicker) {
    livePicker.disabled = false;
    livePicker.removeAttribute('title');
    livePicker.style.opacity = '';
    livePicker.style.cursor = '';
  }

  updateActiveClassBar();
}

/**
 * Updates the checked in / total enrolled counter in the active session banner
 */
function updateSessionArrivalsCount() {
  const arrivalsEl = document.getElementById('teacherSessionArrivalsCount');
  if (!arrivalsEl) return;

  const total = currentRoster ? currentRoster.length : 0;
  const checkedIn = currentRoster ? currentRoster.filter(s => (s.status === 'present' || s.status === 'late') && !s.is_voided).length : 0;

  arrivalsEl.textContent = `${checkedIn} / ${total}`;
}

/**
 * Starts 1-second countdown for the session window with On-Time vs Late Zone indicator
 */
function startSessionCountdown(sessionEndIso) {
  if (sessionCountdownInterval) clearInterval(sessionCountdownInterval);

  const countdownEl = document.getElementById('teacherSessionCountdown');
  const modalRfidCd = document.getElementById('modalRfidCountdown');
  const modalRfidBar = document.getElementById('modalRfidProgressBar');
  const qrSessionRem = document.getElementById('teacherQrSessionRemaining');
  const qrSessionBar = document.getElementById('teacherQrSessionProgressBar');
  const qrSessionPct = document.getElementById('teacherQrSessionPct');

  const totalDurationMs = 30 * 60 * 1000;
  const presentCutoffMs = 20 * 60 * 1000;
  const endMs = new Date(sessionEndIso).getTime();
  const startMs = endMs - totalDurationMs;

  function update() {
    const now = Date.now();
    const diff = endMs - now;

    if (diff <= 0) {
      if (countdownEl) {
        countdownEl.textContent = '00:00 (Closed)';
        countdownEl.style.color = 'var(--absent)';
      }
      if (modalRfidCd) modalRfidCd.textContent = '00:00';
      if (qrSessionRem) qrSessionRem.textContent = '00:00';

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
    const pctRemaining = Math.max(0, Math.min(100, Math.round((diff / totalDurationMs) * 100)));

    const elapsed = now - startMs;
    const isLateZone = elapsed > presentCutoffMs;

    if (countdownEl) {
      if (isLateZone) {
        countdownEl.innerHTML = `${formatted} <span class="text-[10px] font-semibold text-amber-500">(Late Zone)</span>`;
        countdownEl.style.color = 'var(--late)';
      } else {
        countdownEl.innerHTML = `${formatted} <span class="text-[10px] font-semibold text-emerald-500">(On Time)</span>`;
        countdownEl.style.color = 'var(--present)';
      }
    }

    if (modalRfidCd) modalRfidCd.textContent = formatted;
    if (modalRfidBar) modalRfidBar.style.width = `${pctRemaining}%`;

    if (qrSessionRem) qrSessionRem.textContent = formatted;
    if (qrSessionBar) qrSessionBar.style.width = `${pctRemaining}%`;
    if (qrSessionPct) qrSessionPct.textContent = `${pctRemaining}% remaining`;
  }

  update();
  sessionCountdownInterval = setInterval(update, 1000);
}

