/**
 * my-classes.js - Teacher Assigned Classes & Student Roster Controller
 * Bestlink College of the Philippines - Attendance Monitoring System (AMS)
 * Authoritative Reference: docs/UI-UX_Architecture.md, docs/DATA.md, docs/WORKFLOW.md
 */

import { requireRole } from '../../lib/rbac-guard.js';
import { getCurrentUser } from '../../lib/auth.js';
import { sectionsApi } from '../../api/sectionsApi.js';
import { usersApi } from '../../api/usersApi.js';
import { showToast } from '../../components/toast.js';

let currentTeacher = null;
let assignedSections = [];
let activeRosterStudents = [];
let activeModalSection = null;
let candidateStudents = [];
let searchDebounceTimeout = null;

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

  // 3. Update Header Profile Info
  const headerName = document.getElementById('headerTeacherName');
  const headerAvatar = document.getElementById('headerTeacherAvatar');
  if (headerName && currentTeacher) {
    headerName.textContent = `Prof. ${currentTeacher.first_name || ''} ${currentTeacher.last_name || ''}`.trim();
  }
  if (headerAvatar && currentTeacher) {
    const fn = (currentTeacher.first_name || 'T')[0];
    const ln = (currentTeacher.last_name || 'C')[0];
    headerAvatar.textContent = `${fn}${ln}`.toUpperCase();
  }

  // 4. Setup Roster & Enrollment Modal Listeners
  initRosterModal();

  // 5. Load Assigned Classes & Populate Filters
  await loadAssignedClasses();
});

/**
 * Loads sections assigned to the logged-in teacher
 */
async function loadAssignedClasses() {
  const grid = document.getElementById('subjectScheduleGrid');
  const countBadge = document.getElementById('activeScheduleCountBadge');

  try {
    assignedSections = await sectionsApi.getSectionsByTeacher(currentTeacher.id);

    if (!assignedSections || assignedSections.length === 0) {
      if (grid) {
        grid.innerHTML = `
          <div class="col-span-3 p-10 text-center text-xs card" style="color:var(--text-3);">
            No assigned classes found for your faculty account. Please contact the Registrar / Attendance Officer.
          </div>
        `;
      }
      if (countBadge) countBadge.textContent = '0 Classes';
      return;
    }

    if (countBadge) {
      countBadge.textContent = `${assignedSections.length} ${assignedSections.length === 1 ? 'Class' : 'Classes'}`;
    }

    populateFilterDropdowns();
    initFilters();
    renderClassCards(assignedSections);
  } catch (err) {
    console.error('[AMS Teacher My Classes] Error loading assigned classes:', err);
    if (grid) {
      grid.innerHTML = `
        <div class="col-span-3 p-10 text-center text-xs text-rose-500 card">
          Failed to load assigned classes. Please refresh the page.
        </div>
      `;
    }
  }
}

/**
 * Populates Section and Subject filter dropdowns
 */
function populateFilterDropdowns() {
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
 * Initializes filter listeners (Search, Section, Subject, Reset)
 */
function initFilters() {
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
      const matchesSubj = !subjVal || (sec.subject_code === subjVal || sec.code === subjVal);

      return matchesQuery && matchesSec && matchesSubj;
    });

    renderClassCards(filtered);
  }

  searchInput?.addEventListener('input', applyFilters);
  secFilter?.addEventListener('change', applyFilters);
  subjFilter?.addEventListener('change', applyFilters);

  resetBtn?.addEventListener('click', () => {
    if (searchInput) searchInput.value = '';
    if (secFilter) secFilter.value = '';
    if (subjFilter) subjFilter.value = '';
    renderClassCards(assignedSections);
  });
}

/**
 * Renders subject class cards into the grid
 */
function renderClassCards(sections) {
  const grid = document.getElementById('subjectScheduleGrid');
  const countBadge = document.getElementById('activeScheduleCountBadge');

  if (countBadge) {
    countBadge.textContent = `${sections.length} ${sections.length === 1 ? 'Class' : 'Classes'}`;
  }

  if (!grid) return;

  if (!sections || sections.length === 0) {
    grid.innerHTML = `
      <div class="col-span-3 p-8 text-center text-xs card" style="color:var(--text-3);">
        No matching classes found. Try adjusting your filters.
      </div>
    `;
    return;
  }

  grid.innerHTML = sections.map((sec, idx) => {
    const subCode = sec.subject_code || (sec.code ? sec.code : `IT 30${idx + 1}`);
    const subName = sec.subject_name || sec.subject || 'Information Technology Core';
    const scheduleStr = sec.schedule || '08:00 AM – 10:00 AM';
    const roomStr = sec.room || `Lab ${idx + 2}`;
    const studentCount = sec.active_student_count || 0;

    return `
      <div class="card p-4 flex flex-col justify-between transition-all hover:border-[var(--ch-200)] relative overflow-hidden" 
           data-sec-id="${sec.id}"
           style="background:var(--surface); border:1px solid var(--border);">
        <div>
          <!-- Header: Subject Code & Headcount -->
          <div class="flex items-center justify-between gap-2 mb-2">
            <span class="badge font-mono text-xs font-bold px-2 py-0.5 rounded" style="background:var(--ch-100); color:var(--ch-900);">
              ${subCode}
            </span>
            <span class="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
              <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              <span class="card-enrolled-count" data-count-for="${sec.id}">${studentCount} Enrolled</span>
            </span>
          </div>

          <!-- Subject Name & Section -->
          <h4 class="font-bold text-sm text-[var(--text-1)] line-clamp-1" title="${subName}">
            ${subName}
          </h4>
          <div class="text-xs font-semibold mt-0.5" style="color:var(--ch-500);">
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

        <!-- Action Buttons (View Roster & Start Live Session) -->
        <div class="mt-4 pt-3 border-t flex items-center gap-2" style="border-color:var(--border);">
          <button type="button" class="btn-view-roster flex-1 pillbtn text-xs font-semibold py-2 px-2.5 rounded-lg flex items-center justify-center gap-1.5 cursor-pointer" data-id="${sec.id}">
            <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            <span>View Roster</span>
          </button>
          <a href="live-session.html?section=${sec.id}" class="btn-start-session flex-1 btn-primary text-xs font-semibold py-2 px-2.5 rounded-lg flex items-center justify-center gap-1.5 cursor-pointer" style="background:var(--ch-900); color:#fff;">
            <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8"/></svg>
            <span>Live Session</span>
          </a>
        </div>
      </div>
    `;
  }).join('');

  // Attach "View Roster" button click handlers
  grid.querySelectorAll('.btn-view-roster').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const secId = btn.getAttribute('data-id');
      const sec = sections.find(s => s.id === secId);
      if (sec) openRosterModal(sec);
    });
  });
}

/**
 * Initializes Roster Modal controls
 */
function initRosterModal() {
  const modal = document.getElementById('rosterModal');
  const closeBtn = document.getElementById('closeRosterModalBtn');
  const closeFooterBtn = document.getElementById('closeRosterModalFooterBtn');
  const searchInput = document.getElementById('rosterSearchInput');
  const startSessionBtn = document.getElementById('rosterModalStartSessionBtn');

  function closeModal() {
    if (modal) modal.classList.add('hidden');
    activeModalSection = null;
    activeRosterStudents = [];
  }

  closeBtn?.addEventListener('click', closeModal);
  closeFooterBtn?.addEventListener('click', closeModal);

  modal?.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });

  searchInput?.addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    filterModalRoster(q);
  });

  startSessionBtn?.addEventListener('click', () => {
    if (activeModalSection) {
      window.location.href = `live-session.html?section=${activeModalSection.id}`;
    }
  });
}

/**
 * Opens Roster Modal and loads enrolled students for the chosen class
 */
async function openRosterModal(section) {
  activeModalSection = section;
  const modal = document.getElementById('rosterModal');
  const codeBadge = document.getElementById('rosterModalCodeBadge');
  const secBadge = document.getElementById('rosterModalSectionBadge');
  const title = document.getElementById('rosterModalTitle');
  const subtitle = document.getElementById('rosterModalSubtitle');
  const tbody = document.getElementById('rosterModalTableBody');
  const countLabel = document.getElementById('rosterModalCountLabel');
  const searchInput = document.getElementById('rosterSearchInput');

  // Reset search filter input
  if (searchInput) searchInput.value = '';

  if (codeBadge) {
    codeBadge.textContent = section.subject_code || section.code || 'IT 301';
  }
  if (secBadge) {
    secBadge.textContent = section.name || 'BSIT';
  }
  if (title) {
    title.textContent = section.subject_name || section.subject || 'Class Roster';
  }
  if (subtitle) {
    subtitle.textContent = `Schedule: ${section.schedule || 'TBA'} · ${section.room || 'Computer Lab'}`;
  }

  if (tbody) {
    tbody.innerHTML = `
      <tr>
        <td colspan="4" class="py-8 text-center text-xs" style="color:var(--text-3);">
          Loading student roster...
        </td>
      </tr>
    `;
  }

  if (modal) modal.classList.remove('hidden');

  try {
    const roster = await sectionsApi.getSectionRosterWithAttendance(section.id);
    activeRosterStudents = roster || [];

    if (countLabel) {
      countLabel.textContent = `${activeRosterStudents.length} Students Enrolled`;
    }

    renderModalRosterRows(activeRosterStudents);
  } catch (err) {
    console.error('[AMS Teacher My Classes] Error loading class roster:', err);
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="4" class="py-8 text-center text-xs text-rose-500">
            Failed to load roster. Please try again.
          </td>
        </tr>
      `;
    }
  }
}
/**
 * Filters the displayed roster inside the modal
 */
function filterModalRoster(query) {
  if (!query) {
    renderModalRosterRows(activeRosterStudents);
    return;
  }

  const filtered = activeRosterStudents.filter(s => {
    const fullName = `${s.first_name || ''} ${s.last_name || ''}`.toLowerCase();
    const studentNum = (s.student_number || '').toLowerCase();
    const email = (s.email || '').toLowerCase();
    return fullName.includes(query) || studentNum.includes(query) || email.includes(query);
  });

  renderModalRosterRows(filtered);
}

/**
 * Renders student rows in the roster modal table
 * Columns: Student Name, Student ID, Status, Method
 */
function renderModalRosterRows(students) {
  const tbody = document.getElementById('rosterModalTableBody');
  if (!tbody) return;

  if (students.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="4" class="py-8 text-center text-xs" style="color:var(--text-3);">
          No enrolled students match your search.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = students.map(student => {
    const initials = `${(student.first_name || 'U')[0]}${(student.last_name || '')[0] || ''}`.toUpperCase();
    const fullName = `${student.first_name || ''} ${student.last_name || ''}`.trim();
    const studentNum = student.student_number || 's230110000';

    // 1. Status Badge (Present, Late, Absent, Excused)
    const rawStatus = (student.status || 'absent').toLowerCase();
    let statusBadge = '';
    if (rawStatus === 'present') {
      statusBadge = `
        <span class="inline-flex items-center justify-center px-2.5 py-1 rounded-full text-xs font-semibold" style="background:rgba(16, 185, 129, 0.12); color:var(--present); border:1px solid rgba(16, 185, 129, 0.25);">
          Present
        </span>
      `;
    } else if (rawStatus === 'late') {
      statusBadge = `
        <span class="inline-flex items-center justify-center px-2.5 py-1 rounded-full text-xs font-semibold" style="background:rgba(245, 158, 11, 0.12); color:var(--late); border:1px solid rgba(245, 158, 11, 0.25);">
          Late
        </span>
      `;
    } else if (rawStatus === 'excused') {
      statusBadge = `
        <span class="inline-flex items-center justify-center px-2.5 py-1 rounded-full text-xs font-semibold" style="background:rgba(2, 136, 209, 0.12); color:var(--excused); border:1px solid rgba(2, 136, 209, 0.25);">
          Excused
        </span>
      `;
    } else {
      statusBadge = `
        <span class="inline-flex items-center justify-center px-2.5 py-1 rounded-full text-xs font-semibold" style="background:rgba(239, 68, 68, 0.12); color:var(--absent); border:1px solid rgba(239, 68, 68, 0.25);">
          Absent
        </span>
      `;
    }

    // 2. Method Badge (RFID, QR, Manual, or —)
    const rawMethod = (student.scan_method || '').toLowerCase();
    let methodBadge = '';
    if (rawStatus === 'absent' && !rawMethod) {
      methodBadge = `<span class="text-xs font-mono" style="color:var(--text-3);">—</span>`;
    } else if (rawMethod === 'rfid') {
      methodBadge = `
        <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded font-mono text-[11px] font-semibold" style="background:var(--raised); color:var(--text-1); border:1px solid var(--border);">
          <svg class="w-3.5 h-3.5 text-[var(--ch-500)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
          <span>RFID</span>
        </span>
      `;
    } else if (rawMethod === 'qr') {
      methodBadge = `
        <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded font-mono text-[11px] font-semibold" style="background:var(--raised); color:var(--text-1); border:1px solid var(--border);">
          <svg class="w-3.5 h-3.5 text-[var(--ch-500)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
          <span>QR</span>
        </span>
      `;
    } else if (rawMethod === 'manual' || student.is_manual) {
      methodBadge = `
        <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded font-mono text-[11px] font-semibold" style="background:var(--raised); color:var(--text-1); border:1px solid var(--border);">
          <svg class="w-3.5 h-3.5 text-[var(--ch-500)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
          <span>Manual</span>
        </span>
      `;
    } else {
      methodBadge = `<span class="text-xs font-mono" style="color:var(--text-3);">—</span>`;
    }

    return `
      <tr class="hover:bg-[var(--surface-hover)] transition-colors" data-student-row="${student.id}">
        <!-- 1. Student Name -->
        <td class="py-3 px-4">
          <div class="flex items-center gap-3 min-w-0">
            <div class="w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs shrink-0" style="background:var(--ch-100); color:var(--ch-900);">
              ${initials}
            </div>
            <div class="min-w-0">
              <div class="font-semibold text-xs sm:text-sm text-[var(--text-1)] truncate">${fullName}</div>
              <div class="text-xs text-[var(--text-3)] truncate mt-0.5">${student.email || 'student@bcp.edu.ph'}</div>
            </div>
          </div>
        </td>

        <!-- 2. Student ID -->
        <td class="py-3 px-4 font-mono text-xs tabular-nums whitespace-nowrap" style="color:var(--text-2);">
          <span class="px-2.5 py-1 rounded bg-[var(--raised)] border border-[var(--border)]">${studentNum}</span>
        </td>

        <!-- 3. Status -->
        <td class="py-3 px-4 whitespace-nowrap">
          ${statusBadge}
        </td>

        <!-- 4. Method -->
        <td class="py-3 px-4 whitespace-nowrap">
          ${methodBadge}
        </td>
      </tr>
    `;
  }).join('');
}
