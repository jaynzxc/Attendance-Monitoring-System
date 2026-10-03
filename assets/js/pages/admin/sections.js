/**
 * sections.js - Page controller for Section & Curriculum Management
 * Bestlink College of the Philippines - Attendance Monitoring System (AMS)
 */

import { requireRole } from '../../lib/rbac-guard.js';
import { sectionsApi, parseBcpSectionCode } from '../../api/sectionsApi.js';
import { usersApi } from '../../api/usersApi.js';
import { toast } from '../../components/toast.js';
import { Modal } from '../../components/modal.js';
import { renderNumberedPagination } from '../../components/pagination.js';

let sectionsList = [];
let teachersList = [];
let currentPage = 0;
const pageSize = 15;

/**
 * Loads sections and metrics
 */
async function loadSections() {
  sectionsList = await sectionsApi.getSections();

  const tbody = document.getElementById('sectionsTableBody');
  if (!tbody) return;

  if (sectionsList.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7">
          <div class="empty-state">
            <h4>No sections registered yet</h4>
            <p>Click "Add New Section" above to establish institutional class sections.</p>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  // Update summary numbers
  let totalEnrolled = 0;
  let assignedAdvisors = 0;
  const programs = new Set();

  sectionsList.forEach(sec => {
    totalEnrolled += (sec.active_student_count || 0);
    if (sec.advisor_teacher_id) assignedAdvisors++;
    if (sec.program_code) programs.add(sec.program_code);
  });

  const secCount = document.getElementById('totalSectionsCount');
  const stuCount = document.getElementById('totalStudentsCount');
  const advCount = document.getElementById('totalAdvisorsCount');
  const prgCount = document.getElementById('totalProgramsCount');

  if (secCount) secCount.textContent = sectionsList.length;
  if (stuCount) stuCount.textContent = totalEnrolled.toLocaleString();
  if (advCount) advCount.textContent = assignedAdvisors;
  if (prgCount) prgCount.textContent = programs.size || 3;

  renderSectionsTable();
}

function renderSectionsTable() {
  const tbody = document.getElementById('sectionsTableBody');
  if (!tbody) return;

  renderNumberedPagination({
    containerId: 'sectionsPageNumbersContainer',
    prevBtnId: 'sectionsPrevBtn',
    nextBtnId: 'sectionsNextBtn',
    infoTextId: 'sectionsPageInfoText',
    totalRecords: sectionsList.length,
    pageSize,
    currentPage,
    onPageChange: (newPage) => {
      currentPage = newPage;
      renderSectionsTable();
    }
  });

  const pagedSections = sectionsList.slice(currentPage * pageSize, (currentPage + 1) * pageSize);

  // Render rows
  tbody.innerHTML = pagedSections.map(sec => {
    const advisorName = sec.advisor ? `${sec.advisor.first_name || ''} ${sec.advisor.last_name || ''}`.trim() : 'Unassigned';
    const advisorEmail = sec.advisor?.email || '';

    return `
      <tr>
        <td>
          <div style="font-weight:700; color:var(--text-1); font-size:14px; font-family:monospace;">${sec.name}</div>
        </td>
        <td>
          <span style="font-size:11px; font-weight:700; padding:3px 8px; border-radius:4px; background:var(--raised); color:var(--text-1); border:1px solid var(--border);">
            ${sec.program_code}
          </span>
        </td>
        <td style="font-weight:600; color:var(--text-1);">${sec.grade_level || `${sec.year_level}${sec.year_level === 1 ? 'st' : sec.year_level === 2 ? 'nd' : sec.year_level === 3 ? 'rd' : 'th'} Year`}</td>
        <td style="color:var(--text-2); font-size:12.5px;">${sec.academic_year || '2026-2027'} · ${sec.semester || '1st Sem'}</td>
        <td>
          <div style="font-weight:600; color:var(--text-1);">${advisorName}</div>
          <div style="font-size:11px; color:var(--text-3);">${advisorEmail}</div>
        </td>
        <td>
          <span style="font-weight:700; color:var(--ch-500);">${sec.active_student_count || 0}</span>
          <span style="font-size:12px; color:var(--text-2);"> active students</span>
        </td>
        <td style="text-align:right;">
          <div style="display:inline-flex; gap:6px;">
            <button class="btn-secondary btn-roster" data-id="${sec.id}" style="padding:5px 10px; font-size:11.5px;">
              Roster
            </button>
            <button class="btn-secondary btn-edit-section" data-id="${sec.id}" style="padding:5px 10px; font-size:11.5px;">
              Edit
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  // Attach click listeners to row buttons
  tbody.querySelectorAll('.btn-roster').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const secId = e.currentTarget.getAttribute('data-id');
      viewSectionRoster(secId);
    });
  });

  tbody.querySelectorAll('.btn-edit-section').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const secId = e.currentTarget.getAttribute('data-id');
      openEditSectionModal(secId);
    });
  });
}

/**
 * Helper to identify student year level from enrolled section or student number
 */
function getStudentYearInfo(student) {
  // 1. From enrolled section if available
  const secName = student.sections?.name || student.student_sections?.[0]?.sections?.name;
  if (secName) {
    const parsed = parseBcpSectionCode(secName);
    if (parsed.yearLevel) {
      return {
        yearLevel: parsed.yearLevel,
        yearLevelName: parsed.yearLevelName,
        source: `Section: ${secName}`
      };
    }
  }

  // 2. From BCP student number (e.g. s230110001 or 230110001 -> Batch 23/2023, 2024 -> Batch 2024)
  const cleanNum = String(student.student_number || '').trim().replace(/^s/i, '');
  const bcpMatch = cleanNum.match(/^(\d{2})(\d{3})(\d{4})$/);
  if (bcpMatch) {
    const entryYear2Digits = parseInt(bcpMatch[1], 10);
    const fullEntryYear = entryYear2Digits < 50 ? 2000 + entryYear2Digits : 1900 + entryYear2Digits;
    const yearLevel = Math.max(1, Math.min(4, 2026 - fullEntryYear + 1));
    return {
      yearLevel,
      yearLevelName: `${yearLevel}${yearLevel === 1 ? 'st' : yearLevel === 2 ? 'nd' : yearLevel === 3 ? 'rd' : 'th'} Year`,
      source: `Batch 20${entryYear2Digits}`
    };
  }

  // 3. Fallback for legacy 4-digit year prefix (e.g. 2024-00101)
  const legacyMatch = cleanNum.match(/^(\d{4})/);
  if (legacyMatch) {
    const entryYear = parseInt(legacyMatch[1], 10);
    const yearLevel = Math.max(1, Math.min(4, 2026 - entryYear + 1));
    return {
      yearLevel,
      yearLevelName: `${yearLevel}${yearLevel === 1 ? 'st' : yearLevel === 2 ? 'nd' : yearLevel === 3 ? 'rd' : 'th'} Year`,
      source: `Batch ${entryYear}`
    };
  }

  return { yearLevel: 1, yearLevelName: '1st Year', source: 'Default' };
}

/**
 * Views enrolled roster for a section with student enrollment and removal
 */
async function viewSectionRoster(secId) {
  const section = sectionsList.find(s => s.id === secId);
  if (!section) return;

  const bcp = parseBcpSectionCode(section.name);
  const sectionBcpCode = bcp.rawCode || section.name;

  // 1. Fetch current enrolled students in this section
  let enrolledStudents = await sectionsApi.getSectionRoster(secId);
  if (!enrolledStudents || enrolledStudents.length === 0) {
    const { data: usersData } = await usersApi.getUsers({ role: 'student', sectionId: secId, pageSize: 100 });
    enrolledStudents = usersData || [];
  }

  // 2. Fetch all active students in the institution to allow enrolling new ones
  const { data: allStudents } = await usersApi.getUsers({ role: 'student', pageSize: 100 });
  const allActiveStudents = allStudents || [];

  function getEligibleStudents() {
    const enrolledIds = new Set(enrolledStudents.map(s => s.id));
    return allActiveStudents.filter(s => !enrolledIds.has(s.id));
  }

  let selectedCandidateIds = new Set();
  let matchedCsvStudentIds = [];
  let activeEnrollTab = 'checklist'; // 'checklist' | 'csv'

  function renderRosterContent() {
    const advisorName = section.advisor ? `${section.advisor.first_name || ''} ${section.advisor.last_name || ''}`.trim() : 'Unassigned';
    const eligibleStudents = getEligibleStudents();
    const matchingEligibleStudents = eligibleStudents.filter(st => getStudentYearInfo(st).yearLevel === bcp.yearLevel);

    return `
      <div style="display:flex; flex-direction:column; gap:16px;">
        <!-- Bestlink Meta Summary Header -->
        <div style="display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:10px; padding:12px 16px; background:var(--raised); border-radius:10px; border:1px solid var(--border);">
          <div>
            <div style="display:flex; align-items:center; gap:8px;">
              <span style="font-size:16px; font-weight:700; color:var(--text-1); font-family:monospace;">${section.name}</span>
            </div>
            <div style="font-size:12px; color:var(--text-2); margin-top:2px;">
              Academic Standing: <strong style="color:var(--ch-500);">${bcp.yearLevelName} · ${bcp.semester}</strong> (AY ${section.school_year || '2026-2027'})
            </div>
          </div>
          <div>
            <div style="font-size:11px; text-transform:uppercase; letter-spacing:0.05em; color:var(--text-3); font-weight:700;">Advisory Teacher</div>
            <div style="font-size:13px; font-weight:600; color:var(--text-1);">${advisorName}</div>
          </div>
          <div>
            <div style="font-size:11px; text-transform:uppercase; letter-spacing:0.05em; color:var(--text-3); font-weight:700;">Enrolled Headcount</div>
            <div style="font-size:13px; font-weight:700; color:var(--text-1);">
              <span id="rosterCountBadge" style="color:var(--ch-500);">${enrolledStudents.length}</span> Students
            </div>
          </div>
        </div>

        <!-- Action / Search Toolbar -->
        <div style="display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:10px;">
          <div style="position:relative; flex:1; min-width:220px;">
            <input type="text" id="rosterSearchInput" class="input-field" placeholder="Search enrolled students by name or ID..." style="width:100%; font-size:12.5px; padding:7px 10px;">
          </div>
          <button type="button" id="btnToggleEnrollBox" class="btn-primary" style="padding:7px 14px; font-size:12px;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
            <span>+ Bulk Enroll Students</span>
          </button>
        </div>

        <!-- Bulk Enrollment Container (Tabs for Method A & Method B) -->
        <div id="enrollStudentBox" style="display:none; padding:16px; background:var(--surface); border:1px solid var(--border-strong); border-radius:10px; box-shadow:0 6px 16px rgba(0,0,0,0.06);">
          <div style="display:flex; align-items:center; justify-content:space-between; border-bottom:1px solid var(--border); padding-bottom:10px; margin-bottom:12px;">
            <div style="font-weight:700; font-size:13px; color:var(--text-1);">
              Bulk Enroll Students to Section ${section.name} (${bcp.yearLevelName})
            </div>
            <!-- Method Tabs -->
            <div style="display:flex; gap:6px;">
              <button type="button" id="tabChecklistBtn" class="pillbtn text-xs font-semibold py-1 px-3 rounded ${activeEnrollTab === 'checklist' ? 'bg-[var(--ch-500)] text-white' : 'bg-[var(--raised)] text-[var(--text-2)]'}">
                Method A: Checklist Selector
              </button>
              <button type="button" id="tabCsvBtn" class="pillbtn text-xs font-semibold py-1 px-3 rounded ${activeEnrollTab === 'csv' ? 'bg-[var(--ch-500)] text-white' : 'bg-[var(--raised)] text-[var(--text-2)]'}">
                Method B: CSV / Excel Upload
              </button>
            </div>
          </div>

          <!-- TAB A: Multi-Select Checklist -->
          <div id="tabChecklistPanel" style="${activeEnrollTab === 'checklist' ? 'display:block;' : 'display:none;'}">
            <!-- Filter by Year Level & Search -->
            <div style="display:flex; flex-wrap:wrap; gap:10px; align-items:center; margin-bottom:12px;">
              <div style="flex:1; min-width:180px;">
                <input type="text" id="candidateSearchInput" class="input-field" placeholder="Search candidate students..." style="width:100%; font-size:12px; padding:6px 10px;">
              </div>
              <div style="min-width:180px;">
                <select id="candidateYearFilter" class="select-field" style="width:100%; font-size:12px; padding:6px 10px;">
                  <option value="all" selected>All Eligible Students (${matchingEligibleStudents.length})</option>
                  <option value="1">1st Year Students</option>
                  <option value="2">2nd Year Students</option>
                  <option value="3">3rd Year Students</option>
                  <option value="4">4th Year Students</option>
                </select>
              </div>
            </div>

            <!-- Candidate Checklist Container -->
            <div style="border:1px solid var(--border); border-radius:8px; overflow:hidden;">
              <div style="display:flex; align-items:center; justify-content:space-between; padding:8px 12px; background:var(--raised); border-bottom:1px solid var(--border); font-size:12px; font-weight:600; color:var(--text-1);">
                <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
                  <input type="checkbox" id="selectAllCandidatesCheckbox" style="cursor:pointer;">
                  <span>Select All Visible Students</span>
                </label>
                <span id="selectedCountText" style="color:var(--ch-500); font-size:11.5px;">0 selected</span>
              </div>
              <div id="candidateListContainer" style="max-height:220px; overflow-y:auto; padding:6px 0;">
                <!-- Populated dynamically -->
              </div>
            </div>

            <!-- Action buttons for Checklist -->
            <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:12px;">
              <button type="button" id="btnCancelEnrollChecklist" class="btn-secondary" style="padding:6px 14px; font-size:12px;">
                Cancel
              </button>
              <button type="button" id="btnSubmitBulkEnrollChecklist" class="btn-primary" style="padding:6px 16px; font-size:12px;" disabled>
                Enroll Selected (0 Students)
              </button>
            </div>
          </div>

          <!-- TAB B: CSV / Excel Upload & Batch Import -->
          <div id="tabCsvPanel" style="${activeEnrollTab === 'csv' ? 'display:block;' : 'display:none;'}">
            <p style="font-size:12px; color:var(--text-2); margin-bottom:10px;">
              Upload an institutional CSV / Excel file containing a <strong>Student ID</strong> column, or paste student ID numbers below:
            </p>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:12px;">
              <div>
                <label style="display:block; font-size:11.5px; font-weight:600; margin-bottom:4px; color:var(--text-1);">Upload Spreadsheet File (.csv, .xlsx, .txt)</label>
                <input type="file" id="csvFileInput" accept=".csv, .xlsx, .xls, .txt" class="input-field" style="width:100%; font-size:12px; padding:6px 8px;">
              </div>
              <div>
                <label style="display:block; font-size:11.5px; font-weight:600; margin-bottom:4px; color:var(--text-1);">Or Paste Student Numbers (comma or newline separated)</label>
                <textarea id="csvPasteTextarea" class="input-field" rows="3" placeholder="e.g.&#10;230110001&#10;s230110002&#10;230110003" style="width:100%; font-size:12px; font-family:monospace; resize:none;"></textarea>
              </div>
            </div>

            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px;">
              <button type="button" id="btnParseCsvList" class="btn-secondary" style="padding:6px 12px; font-size:12px;">
                Parse & Match Directory
              </button>
              <div id="csvMatchStatus" style="font-size:12px; font-weight:600; color:var(--text-2);"></div>
            </div>

            <div id="csvPreviewContainer" style="display:none; max-height:160px; overflow-y:auto; border:1px solid var(--border); border-radius:6px; padding:8px; margin-bottom:12px; font-size:12px; background:var(--raised);">
              <!-- Populated after parsing -->
            </div>

            <div style="display:flex; justify-content:flex-end; gap:8px;">
              <button type="button" id="btnCancelEnrollCsv" class="btn-secondary" style="padding:6px 14px; font-size:12px;">
                Cancel
              </button>
              <button type="button" id="btnSubmitBulkEnrollCsv" class="btn-primary" style="padding:6px 16px; font-size:12px;" disabled>
                Confirm & Enroll Matched Students
              </button>
            </div>
          </div>
        </div>

        <!-- Enrolled Students Table -->
        <div style="max-height:360px; overflow-y:auto; overflow-x:hidden; border:1px solid var(--border); border-radius:8px;">
          <table class="data-table" style="width:100%; margin:0; table-layout:auto;">
            <thead>
              <tr>
                <th style="font-size:11px; white-space:nowrap; width:130px;">Student #</th>
                <th style="font-size:11px;">Name & Email</th>
                <th style="font-size:11px; white-space:nowrap; width:110px;">Year Standing</th>
                <th style="font-size:11px; white-space:nowrap; width:90px;">Status</th>
                <th style="font-size:11px; white-space:nowrap; width:120px;">RFID Card</th>
                <th style="text-align:right; font-size:11px; white-space:nowrap; width:95px;">Action</th>
              </tr>
            </thead>
            <tbody id="rosterTableBody">
              ${renderTableRows(enrolledStudents)}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  function renderTableRows(students) {
    if (!students || students.length === 0) {
      return `
        <tr>
          <td colspan="6" style="text-align:center; padding:28px; color:var(--text-3); font-size:12.5px;">
            No students currently enrolled in this section. Click "+ Bulk Enroll Students" above to add students.
          </td>
        </tr>
      `;
    }

    return students.map(st => {
      const studentNum = st.student_number || '—';
      const fullName = `${st.first_name || ''} ${st.last_name || ''}`.trim() || 'Unknown';
      const email = st.email || '—';
      const status = st.status || 'active';
      const rfidCard = st.card_uid || st.rfid_credentials?.[0]?.card_uid || st.rfid_cards?.[0]?.card_uid || 'No Card';
      const yrInfo = getStudentYearInfo(st);

      return `
        <tr data-student-id="${st.id}">
          <td>
            <span style="font-family:monospace; font-weight:700; color:var(--text-1); font-size:12px;">${studentNum}</span>
          </td>
          <td>
            <div style="font-weight:600; color:var(--text-1); font-size:13px;">${fullName}</div>
            <div style="font-size:11px; color:var(--text-3);">${email}</div>
          </td>
          <td>
            <span style="font-size:11px; font-weight:600; padding:2px 7px; border-radius:4px; background:var(--raised); color:var(--ch-900); border:1px solid var(--border);">
              ${yrInfo.yearLevelName}
            </span>
          </td>
          <td>
            <span class="badge badge-${status}" style="font-size:10.5px; text-transform:capitalize;">${status}</span>
          </td>
          <td>
            <span style="font-family:monospace; font-size:11.5px; color:${rfidCard !== 'No Card' ? 'var(--ch-500)' : 'var(--text-3)'};">
              ${rfidCard}
            </span>
          </td>
          <td style="text-align:right;">
            <button type="button" class="btn-danger btn-unenroll-student" data-id="${st.id}" data-name="${fullName}" style="padding:4px 9px; font-size:11px; display:inline-flex; align-items:center; gap:4px;" title="Remove student from section">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
              <span>Remove</span>
            </button>
          </td>
        </tr>
      `;
    }).join('');
  }

  function bindRosterEvents() {
    const modalEl = document.getElementById('rosterModal');
    if (!modalEl) return;

    const toggleBtn = modalEl.querySelector('#btnToggleEnrollBox');
    const enrollBox = modalEl.querySelector('#enrollStudentBox');
    const tabChecklistBtn = modalEl.querySelector('#tabChecklistBtn');
    const tabCsvBtn = modalEl.querySelector('#tabCsvBtn');
    const tabChecklistPanel = modalEl.querySelector('#tabChecklistPanel');
    const tabCsvPanel = modalEl.querySelector('#tabCsvPanel');

    // Toggle box open/close
    toggleBtn?.addEventListener('click', () => {
      if (enrollBox) {
        const isHidden = enrollBox.style.display === 'none';
        enrollBox.style.display = isHidden ? 'block' : 'none';
        if (isHidden) {
          renderCandidateChecklist();
        }
      }
    });

    modalEl.querySelector('#btnCancelEnrollChecklist')?.addEventListener('click', () => {
      if (enrollBox) enrollBox.style.display = 'none';
    });

    modalEl.querySelector('#btnCancelEnrollCsv')?.addEventListener('click', () => {
      if (enrollBox) enrollBox.style.display = 'none';
    });

    // Switch tabs
    tabChecklistBtn?.addEventListener('click', () => {
      activeEnrollTab = 'checklist';
      if (tabChecklistPanel) tabChecklistPanel.style.display = 'block';
      if (tabCsvPanel) tabCsvPanel.style.display = 'none';
      tabChecklistBtn.className = 'pillbtn text-xs font-semibold py-1 px-3 rounded bg-[var(--ch-500)] text-white';
      tabCsvBtn.className = 'pillbtn text-xs font-semibold py-1 px-3 rounded bg-[var(--raised)] text-[var(--text-2)]';
      renderCandidateChecklist();
    });

    tabCsvBtn?.addEventListener('click', () => {
      activeEnrollTab = 'csv';
      if (tabChecklistPanel) tabChecklistPanel.style.display = 'none';
      if (tabCsvPanel) tabCsvPanel.style.display = 'block';
      tabCsvBtn.className = 'pillbtn text-xs font-semibold py-1 px-3 rounded bg-[var(--ch-500)] text-white';
      tabChecklistBtn.className = 'pillbtn text-xs font-semibold py-1 px-3 rounded bg-[var(--raised)] text-[var(--text-2)]';
    });

    // Search filter for enrolled roster
    const searchInput = modalEl.querySelector('#rosterSearchInput');
    const tbody = modalEl.querySelector('#rosterTableBody');
    searchInput?.addEventListener('input', (e) => {
      const q = e.target.value.trim().toLowerCase();
      const filtered = enrolledStudents.filter(st => {
        const full = `${st.first_name || ''} ${st.last_name || ''}`.toLowerCase();
        const num = (st.student_number || '').toLowerCase();
        const em = (st.email || '').toLowerCase();
        return full.includes(q) || num.includes(q) || em.includes(q);
      });
      if (tbody) {
        tbody.innerHTML = renderTableRows(filtered);
        bindRowUnenrollEvents();
      }
    });

    // -------------------------------------------------------------
    // METHOD A: Checklist Logic
    // -------------------------------------------------------------
    const candidateSearch = modalEl.querySelector('#candidateSearchInput');
    const candidateYearFilter = modalEl.querySelector('#candidateYearFilter');
    const selectAllCheckbox = modalEl.querySelector('#selectAllCandidatesCheckbox');
    const candidateListContainer = modalEl.querySelector('#candidateListContainer');
    const selectedCountText = modalEl.querySelector('#selectedCountText');
    const submitChecklistBtn = modalEl.querySelector('#btnSubmitBulkEnrollChecklist');

    function getFilteredCandidates() {
      const eligible = getEligibleStudents();
      const q = candidateSearch?.value.trim().toLowerCase() || '';
      const yrVal = candidateYearFilter?.value || 'all';

      return eligible.filter(st => {
        const yrInfo = getStudentYearInfo(st);

        // Filter by Year: 'all' automatically detects and displays students matching this section's year level!
        if (yrVal === 'all') {
          if (yrInfo.yearLevel !== bcp.yearLevel) return false;
        } else {
          if (yrInfo.yearLevel !== parseInt(yrVal, 10)) return false;
        }

        // Filter by Search Query
        if (q) {
          const full = `${st.first_name || ''} ${st.last_name || ''}`.toLowerCase();
          const num = (st.student_number || '').toLowerCase();
          const em = (st.email || '').toLowerCase();
          return full.includes(q) || num.includes(q) || em.includes(q);
        }

        return true;
      });
    }

    function renderCandidateChecklist() {
      if (!candidateListContainer) return;
      const candidates = getFilteredCandidates();

      if (candidates.length === 0) {
        candidateListContainer.innerHTML = `
          <div style="padding:16px; text-align:center; color:var(--text-3); font-size:12px;">
            No candidate students found matching your filters.
          </div>
        `;
        updateChecklistState();
        return;
      }

      candidateListContainer.innerHTML = candidates.map(st => {
        const yrInfo = getStudentYearInfo(st);
        const isChecked = selectedCandidateIds.has(st.id);
        const fullName = `${st.first_name || ''} ${st.last_name || ''}`.trim() || 'Unknown';
        const num = st.student_number || 'No ID';

        return `
          <div style="display:flex; align-items:center; justify-content:space-between; padding:7px 12px; border-bottom:1px solid var(--border); font-size:12px; hover:bg-[var(--surface-hover)];" class="candidate-row">
            <label style="display:flex; align-items:center; gap:10px; cursor:pointer; flex:1; min-width:0;">
              <input type="checkbox" class="candidate-check" data-id="${st.id}" ${isChecked ? 'checked' : ''} style="cursor:pointer;">
              <div style="min-width:0;">
                <span style="font-family:monospace; font-weight:700; color:var(--text-1);">${num}</span>
                <span style="margin-left:6px; font-weight:600; color:var(--text-1);">${fullName}</span>
                <span style="margin-left:4px; font-size:11px; color:var(--text-3);">(${st.email})</span>
              </div>
            </label>
            <span style="font-size:10.5px; font-weight:700; padding:2px 6px; border-radius:4px; background:var(--raised); color:var(--ch-500); border:1px solid var(--border); flex-shrink:0;">
              ${yrInfo.yearLevelName}
            </span>
          </div>
        `;
      }).join('');

      candidateListContainer.querySelectorAll('.candidate-check').forEach(chk => {
        chk.addEventListener('change', (e) => {
          const sid = e.target.getAttribute('data-id');
          if (e.target.checked) {
            selectedCandidateIds.add(sid);
          } else {
            selectedCandidateIds.delete(sid);
          }
          updateChecklistState();
        });
      });

      updateChecklistState();
    }

    function updateChecklistState() {
      const candidates = getFilteredCandidates();
      const allSelected = candidates.length > 0 && candidates.every(c => selectedCandidateIds.has(c.id));
      if (selectAllCheckbox) selectAllCheckbox.checked = allSelected;

      const count = selectedCandidateIds.size;
      if (selectedCountText) selectedCountText.textContent = `${count} selected`;
      if (submitChecklistBtn) {
        submitChecklistBtn.disabled = count === 0;
        submitChecklistBtn.textContent = `Enroll Selected (${count} ${count === 1 ? 'Student' : 'Students'})`;
      }
    }

    selectAllCheckbox?.addEventListener('change', (e) => {
      const candidates = getFilteredCandidates();
      if (e.target.checked) {
        candidates.forEach(c => selectedCandidateIds.add(c.id));
      } else {
        candidates.forEach(c => selectedCandidateIds.delete(c.id));
      }
      renderCandidateChecklist();
    });

    candidateSearch?.addEventListener('input', renderCandidateChecklist);
    candidateYearFilter?.addEventListener('change', renderCandidateChecklist);

    submitChecklistBtn?.addEventListener('click', async () => {
      if (selectedCandidateIds.size === 0) return;
      const idsToEnroll = Array.from(selectedCandidateIds);

      submitChecklistBtn.disabled = true;
      submitChecklistBtn.textContent = 'Enrolling...';

      try {
        await sectionsApi.bulkEnrollStudents(secId, idsToEnroll);
        toast.show(`Successfully enrolled ${idsToEnroll.length} students into ${section.name}.`, 'success');

        // Add newly enrolled to local enrolled list
        idsToEnroll.forEach(id => {
          const st = allActiveStudents.find(s => s.id === id);
          if (st && !enrolledStudents.some(e => e.id === id)) {
            enrolledStudents.push(st);
          }
        });

        // Reset candidate selection
        selectedCandidateIds.clear();

        // Update counts
        section.active_student_count = enrolledStudents.length;
        updateMainTableCounts();

        // Re-render modal
        Modal.updateContent('rosterModal', renderRosterContent());
        bindRosterEvents();
      } catch (err) {
        toast.show('Failed to enroll students: ' + (err.message || 'Error'), 'error');
        submitChecklistBtn.disabled = false;
        submitChecklistBtn.textContent = `Enroll Selected (${idsToEnroll.length} Students)`;
      }
    });

    // -------------------------------------------------------------
    // METHOD B: CSV / Excel Upload & Batch Paste Logic
    // -------------------------------------------------------------
    const csvFileInput = modalEl.querySelector('#csvFileInput');
    const csvPasteTextarea = modalEl.querySelector('#csvPasteTextarea');
    const parseCsvBtn = modalEl.querySelector('#btnParseCsvList');
    const csvMatchStatus = modalEl.querySelector('#csvMatchStatus');
    const csvPreviewContainer = modalEl.querySelector('#csvPreviewContainer');
    const submitCsvBtn = modalEl.querySelector('#btnSubmitBulkEnrollCsv');

    parseCsvBtn?.addEventListener('click', () => {
      let rawText = csvPasteTextarea?.value || '';

      // If user uploaded a file, read it
      if (csvFileInput?.files?.length > 0) {
        const file = csvFileInput.files[0];
        const reader = new FileReader();
        reader.onload = (e) => {
          rawText = e.target.result + '\n' + rawText;
          processCsvTokens(rawText);
        };
        reader.readAsText(file);
      } else {
        processCsvTokens(rawText);
      }
    });

    function processCsvTokens(text) {
      if (!text || !text.trim()) {
        toast.show('Please provide a file or paste student numbers.', 'warning');
        return;
      }

      // Extract all potential student numbers using regex tokens
      const lines = text.split(/[\r\n,;\t]+/).map(t => t.trim()).filter(Boolean);
      const eligible = getEligibleStudents();

      const matchedStudents = [];
      const validUnregisteredTokens = [];
      const unrecognizedTokens = [];

      // The leading "s" in BCP student numbers only marks the account as a student,
      // so "s230110001" and "230110001" must resolve to the same record.
      const normalizeStudentNo = (value) => value.toLowerCase().replace(/^s(?=\d+$)/, '');

      // Check if a token matches the BCP Student Number format:
      // Optional leading "s" followed by 5-digit prefix + 4-digit numeric sequence (e.g., 23011XXXX or s23011XXXX)
      const isBcpFormat = (str) => /^s?\d{5}\d{4}$/i.test(str) || /^s?\d{2}\d{7}$/i.test(str);

      lines.forEach(token => {
        const cleanToken = token.replace(/["']/g, '').trim().toLowerCase();
        if (!cleanToken) return;

        // Ignore standard table header rows from CSV exports
        if (cleanToken === 'student_id' || cleanToken === 'student_number' || cleanToken === 'id' || cleanToken === 'email' || cleanToken === 'student number') {
          return;
        }

        const tokenNo = normalizeStudentNo(cleanToken);

        const found = eligible.find(st => {
          const num = normalizeStudentNo(st.student_number || '');
          const email = (st.email || '').toLowerCase();
          return (num !== '' && num === tokenNo) || email === cleanToken;
        });

        if (found) {
          if (!matchedStudents.some(m => m.id === found.id)) {
            matchedStudents.push(found);
          }
        } else {
          // Check if it's already enrolled in this section
          const alreadyEnrolled = enrolledStudents.some(st => {
            const num = normalizeStudentNo(st.student_number || '');
            const email = (st.email || '').toLowerCase();
            return (num !== '' && num === tokenNo) || email === cleanToken;
          });

          if (alreadyEnrolled) {
            // Already enrolled in this section, skip silently or note
            return;
          }

          // Check if token follows valid BCP student number structure (e.g. 23011XXXX)
          if (isBcpFormat(cleanToken)) {
            if (!validUnregisteredTokens.includes(token)) {
              validUnregisteredTokens.push(token);
            }
          } else {
            if (!unrecognizedTokens.includes(token)) {
              unrecognizedTokens.push(token);
            }
          }
        }
      });

      matchedCsvStudentIds = matchedStudents.map(s => s.id);

      if (csvMatchStatus) {
        let statusHtml = `<span style="color:var(--present); font-weight:600;">${matchedStudents.length} Matched</span>`;
        if (validUnregisteredTokens.length > 0) {
          statusHtml += `<span style="color:var(--late); margin-left:8px; font-weight:600;">(${validUnregisteredTokens.length} not in directory)</span>`;
        }
        if (unrecognizedTokens.length > 0) {
          statusHtml += `<span style="color:var(--absent); margin-left:8px;">(${unrecognizedTokens.length} invalid format)</span>`;
        }
        csvMatchStatus.innerHTML = statusHtml;
      }

      if (csvPreviewContainer) {
        csvPreviewContainer.style.display = 'block';

        let html = '';
        if (matchedStudents.length > 0) {
          html += `
            <div style="font-weight:700; margin-bottom:6px; color:var(--text-1);">Matched Students Ready for Enrollment (${matchedStudents.length}):</div>
            <ul style="margin:0 0 10px 0; padding-left:16px; color:var(--text-1);">
              ${matchedStudents.map(s => `<li><strong>${s.student_number}</strong> — ${s.first_name} ${s.last_name} (${getStudentYearInfo(s).yearLevelName})</li>`).join('')}
            </ul>
          `;
        } else {
          html += `
            <div style="color:var(--text-3); font-style:italic; margin-bottom:8px;">
              No registered students matched from the directory.
            </div>
          `;
        }

        if (validUnregisteredTokens.length > 0) {
          html += `
            <div style="padding:8px 10px; background:rgba(245, 158, 11, 0.08); border:1px solid rgba(245, 158, 11, 0.25); border-radius:6px; margin-bottom:8px; font-size:11.5px;">
              <div style="font-weight:700; color:var(--late); margin-bottom:4px;">Valid BCP Student Numbers Not Yet Registered (${validUnregisteredTokens.length}):</div>
              <div style="color:var(--text-2); font-family:monospace; word-break:break-all;">
                ${validUnregisteredTokens.join(', ')}
              </div>
              <div style="margin-top:4px; color:var(--text-3); font-size:11px;">
                Note: Register these students first in the Student Directory before adding them to a section.
              </div>
            </div>
          `;
        }

        if (unrecognizedTokens.length > 0) {
          html += `
            <div style="padding:6px 10px; background:rgba(239, 68, 68, 0.06); border:1px solid rgba(239, 68, 68, 0.2); border-radius:6px; font-size:11px; color:var(--absent);">
              <strong>Invalid / Unrecognized Tokens (${unrecognizedTokens.length}):</strong> ${unrecognizedTokens.slice(0, 8).join(', ')}${unrecognizedTokens.length > 8 ? '...' : ''}
            </div>
          `;
        }

        csvPreviewContainer.innerHTML = html;
      }

      if (submitCsvBtn) {
        submitCsvBtn.disabled = matchedCsvStudentIds.length === 0;
        submitCsvBtn.textContent = `Confirm & Enroll (${matchedCsvStudentIds.length} Students)`;
      }
    }

    submitCsvBtn?.addEventListener('click', async () => {
      if (matchedCsvStudentIds.length === 0) return;

      submitCsvBtn.disabled = true;
      submitCsvBtn.textContent = 'Enrolling...';

      try {
        await sectionsApi.bulkEnrollStudents(secId, matchedCsvStudentIds);
        toast.show(`Successfully enrolled ${matchedCsvStudentIds.length} students via batch import into ${section.name}.`, 'success');

        matchedCsvStudentIds.forEach(id => {
          const st = allActiveStudents.find(s => s.id === id);
          if (st && !enrolledStudents.some(e => e.id === id)) {
            enrolledStudents.push(st);
          }
        });

        matchedCsvStudentIds = [];

        section.active_student_count = enrolledStudents.length;
        updateMainTableCounts();

        Modal.updateContent('rosterModal', renderRosterContent());
        bindRosterEvents();
      } catch (err) {
        toast.show('Failed to bulk enroll: ' + (err.message || 'Error'), 'error');
        submitCsvBtn.disabled = false;
        submitCsvBtn.textContent = 'Confirm & Enroll Matched Students';
      }
    });

    // -------------------------------------------------------------
    // Unenroll Student Handler
    // -------------------------------------------------------------
    function bindRowUnenrollEvents() {
      modalEl.querySelectorAll('.btn-unenroll-student').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const studentId = e.currentTarget.getAttribute('data-id');
          const studentName = e.currentTarget.getAttribute('data-name');

          if (!confirm(`Are you sure you want to remove ${studentName} from ${section.name}?`)) {
            return;
          }

          try {
            await sectionsApi.unenrollStudent(secId, studentId);
            toast.show(`${studentName} removed from ${section.name}.`, 'success');

            enrolledStudents = enrolledStudents.filter(s => s.id !== studentId);
            section.active_student_count = enrolledStudents.length;
            updateMainTableCounts();

            Modal.updateContent('rosterModal', renderRosterContent());
            bindRosterEvents();
          } catch (err) {
            toast.show('Failed to remove student: ' + (err.message || 'Error'), 'error');
          }
        });
      });
    }

    bindRowUnenrollEvents();
  }

  function updateMainTableCounts() {
    renderSectionsTable();
    let totalEnrolled = 0;
    sectionsList.forEach(sec => totalEnrolled += (sec.active_student_count || 0));
    const stuCount = document.getElementById('totalStudentsCount');
    if (stuCount) stuCount.textContent = totalEnrolled.toLocaleString();
  }

  Modal.open({
    id: 'rosterModal',
    title: `Section Roster: ${section.name}`,
    maxWidth: '920px',
    content: renderRosterContent(),
    actions: [
      {
        label: 'Close',
        class: 'btn-secondary',
        onClick: () => Modal.close('rosterModal')
      }
    ]
  });

  bindRosterEvents();
}

/**
 * Opens Add or Edit Section Modal with Bestlink 5-digit auto-numbering
 */
async function openEditSectionModal(secId = null) {
  const sec = secId ? sectionsList.find(s => s.id === secId) : null;
  const isEditing = !!sec;

  // Load teachers for advisor select
  if (teachersList.length === 0) {
    const { data: teachers } = await usersApi.getUsers({ role: 'teacher', pageSize: 100 });
    teachersList = teachers || [];
  }

  const teacherOptions = teachersList.map(t => `
    <option value="${t.id}" ${sec && sec.advisor_teacher_id === t.id ? 'selected' : ''}>
      ${t.first_name} ${t.last_name} (${t.email})
    </option>
  `).join('');

  const initialYear = sec ? (sec.year_level || 1) : 1;
  const initialSem = sec ? (sec.semester || '1st Sem') : '1st Sem';
  const initialProg = sec ? (sec.program_code || 'BSIT') : 'BSIT';

  const content = `
    <div style="display:flex; flex-direction:column; gap:14px;">
      <!-- Bestlink BCP Explainer Box -->
      <div style="padding:10px 14px; background:var(--raised); border-radius:8px; border:1px solid var(--border); font-size:12px; color:var(--text-2); line-height:1.5;">
        <strong style="color:var(--text-1);">Bestlink Section Numbering Rule:</strong><br>
        • <strong>Section Code:</strong> Pure 5-digit number <code>[Year][Sem][Sequence]</code> (e.g. <code>11001</code>, <code>21001</code>, <code>31001</code>, <code>41001</code>).<br>
        • <strong>Combined Program &amp; Section:</strong> Formats as <strong><code>${initialProg || 'BSIT'} - 41001</code></strong>.<br>
        • <strong>Year Level:</strong> Independent academic standing (e.g. 4th Year) distinct from section code.
      </div>

      <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
        <div>
          <label style="display:block; font-size:12px; font-weight:600; margin-bottom:4px; color:var(--text-1);">Program Code</label>
          <input type="text" id="secProgram" class="input-field" style="width:100%;" placeholder="e.g. BSIT, BSIS" value="${initialProg}">
        </div>
        <div>
          <label style="display:block; font-size:12px; font-weight:600; margin-bottom:4px; color:var(--text-1);">Year Level</label>
          <select id="secYear" class="select-field" style="width:100%;">
            <option value="1" ${initialYear === 1 ? 'selected' : ''}>1st Year (Starts with 1)</option>
            <option value="2" ${initialYear === 2 ? 'selected' : ''}>2nd Year (Starts with 2)</option>
            <option value="3" ${initialYear === 3 ? 'selected' : ''}>3rd Year (Starts with 3)</option>
            <option value="4" ${initialYear === 4 ? 'selected' : ''}>4th Year (Starts with 4)</option>
          </select>
        </div>
      </div>

      <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
        <div>
          <label style="display:block; font-size:12px; font-weight:600; margin-bottom:4px; color:var(--text-1);">Semester</label>
          <select id="secSem" class="select-field" style="width:100%;">
            <option value="1st Sem" ${initialSem === '1st Sem' ? 'selected' : ''}>1st Semester (2nd digit: 1)</option>
            <option value="2nd Sem" ${initialSem === '2nd Sem' ? 'selected' : ''}>2nd Semester (2nd digit: 2)</option>
            <option value="Summer" ${initialSem === 'Summer' ? 'selected' : ''}>Summer</option>
          </select>
        </div>
        <div>
          <label style="display:block; font-size:12px; font-weight:600; margin-bottom:4px; color:var(--text-1);">Academic Year</label>
          <input type="text" id="secAy" class="input-field" style="width:100%;" value="${sec ? (sec.academic_year || '2026-2027') : '2026-2027'}">
        </div>
      </div>

      <div>
        <label style="display:block; font-size:12px; font-weight:600; margin-bottom:4px; color:var(--text-1);">Section Code (5-Digit Format)</label>
        <input type="text" id="secName" class="input-field" style="width:100%; font-family:monospace; font-weight:700;" placeholder="e.g. 11001, 21001, 31001, 41001" value="${sec ? sec.name : '11001'}">
        <div id="bcpLiveHelper" style="font-size:11px; color:var(--ch-500); margin-top:4px; font-weight:600;"></div>
      </div>

      <div>
        <label style="display:block; font-size:12px; font-weight:600; margin-bottom:4px; color:var(--text-1);">Assigned Advisory Teacher</label>
        <select id="secAdvisor" class="select-field" style="width:100%;">
          <option value="">None / Unassigned</option>
          ${teacherOptions}
        </select>
      </div>
    </div>
  `;

  Modal.open({
    id: 'sectionModal',
    title: isEditing ? `Edit Section: ${sec.name}` : 'Add New Section',
    content,
    actions: [
      {
        label: 'Cancel',
        class: 'btn-secondary',
        onClick: () => Modal.close('sectionModal')
      },
      {
        label: isEditing ? 'Save Changes' : 'Create Section',
        class: 'btn-primary',
        onClick: async () => {
          const rawName = document.getElementById('secName')?.value.trim() || '';
          const name = rawName.replace(/^[A-Za-z\s_-]+(\d{5})$/, '$1').trim();
          const program_code = document.getElementById('secProgram')?.value.trim();
          const year_level = parseInt(document.getElementById('secYear')?.value, 10) || 1;
          const academic_year = document.getElementById('secAy')?.value.trim();
          const semester = document.getElementById('secSem')?.value;
          const advisor_teacher_id = document.getElementById('secAdvisor')?.value || null;

          if (!name || !program_code) {
            toast.show('Please provide both Section Name and Program Code.', 'warning');
            return;
          }

          try {
            if (isEditing) {
              await sectionsApi.updateSection(sec.id, {
                name,
                program_code,
                year_level,
                grade_level: `Year ${year_level}`,
                academic_year,
                school_year: academic_year,
                semester,
                advisor_teacher_id
              });
              await sectionsApi.assignTeacherToSection(sec.id, advisor_teacher_id);
              toast.show(`Section "${name}" updated successfully.`, 'success');
            } else {
              const newSec = await sectionsApi.createSection({
                name,
                program_code,
                year_level,
                grade_level: `Year ${year_level}`,
                academic_year,
                school_year: academic_year,
                semester,
                advisor_teacher_id
              });
              if (newSec?.id && advisor_teacher_id) {
                await sectionsApi.assignTeacherToSection(newSec.id, advisor_teacher_id);
              }
              toast.show(`Section "${name}" created successfully.`, 'success');
            }
            Modal.close('sectionModal');
            loadSections();
          } catch (err) {
            toast.show('Failed to save section: ' + (err.message || 'Error'), 'error');
          }
        }
      }
    ]
  });

  // Dynamic helper sync for Bestlink 5-digit format in modal
  const nameInput = document.getElementById('secName');
  const progInput = document.getElementById('secProgram');
  const yrSelect = document.getElementById('secYear');
  const semSelect = document.getElementById('secSem');
  const helperDiv = document.getElementById('bcpLiveHelper');

  function updateBcpHelper() {
    const val = nameInput?.value.trim() || '';
    const parsed = parseBcpSectionCode(val);
    if (parsed.rawCode) {
      if (helperDiv) helperDiv.textContent = `Valid Bestlink Code: ${parsed.rawCode} (${parsed.yearLevelName} · ${parsed.semester} · Sec ${parsed.sequence})`;
    } else {
      if (helperDiv) helperDiv.textContent = `Tip: Use 5-digit BCP format (e.g. ${yrSelect?.value}${semSelect?.value === '1st Sem' ? '1' : '2'}001)`;
    }
  }

  nameInput?.addEventListener('input', () => {
    const parsed = parseBcpSectionCode(nameInput.value);
    if (parsed.rawCode) {
      if (yrSelect) yrSelect.value = String(parsed.yearLevel);
      if (semSelect) semSelect.value = parsed.semester;
    }
    updateBcpHelper();
  });

  yrSelect?.addEventListener('change', () => {
    const y = yrSelect.value;
    const s = semSelect?.value === '2nd Sem' ? '2' : '1';
    if (nameInput) nameInput.value = `${y}${s}001`;
    updateBcpHelper();
  });

  semSelect?.addEventListener('change', () => {
    const y = yrSelect?.value || '1';
    const s = semSelect.value === '2nd Sem' ? '2' : '1';
    if (nameInput) nameInput.value = `${y}${s}001`;
    updateBcpHelper();
  });

  updateBcpHelper();
}

/**
 * Initializes Sections view
 */
async function init() {
  await requireRole(['admin']);

  document.getElementById('btnCreateSection')?.addEventListener('click', () => openEditSectionModal());
  loadSections();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
