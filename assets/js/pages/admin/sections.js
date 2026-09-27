/**
 * sections.js - Page controller for Section & Curriculum Management
 * Bestlink College of the Philippines - Attendance Monitoring System (AMS)
 */

import { requireRole } from '../../lib/rbac-guard.js';
import { sectionsApi } from '../../api/sectionsApi.js';
import { usersApi } from '../../api/usersApi.js';
import { toast } from '../../components/toast.js';
import { Modal } from '../../components/modal.js';

let sectionsList = [];
let teachersList = [];

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

  // Render rows
  tbody.innerHTML = sectionsList.map(sec => {
    const advisorName = sec.advisor ? `${sec.advisor.first_name || ''} ${sec.advisor.last_name || ''}`.trim() : 'Unassigned';
    const advisorEmail = sec.advisor?.email || '';

    return `
      <tr>
        <td>
          <div style="font-weight:700; color:var(--text-1); font-size:14px;">${sec.name}</div>
        </td>
        <td>
          <span style="font-size:11px; font-weight:700; padding:3px 8px; border-radius:4px; background:var(--raised); color:var(--text-1); border:1px solid var(--border);">
            ${sec.program_code}
          </span>
        </td>
        <td style="font-weight:500;">Year ${sec.year_level}</td>
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
  document.querySelectorAll('.btn-roster').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const secId = e.currentTarget.getAttribute('data-id');
      viewSectionRoster(secId);
    });
  });

  document.querySelectorAll('.btn-edit-section').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const secId = e.currentTarget.getAttribute('data-id');
      openEditSectionModal(secId);
    });
  });
}

/**
 * Views enrolled roster for a section
 */
async function viewSectionRoster(secId) {
  const section = sectionsList.find(s => s.id === secId);
  if (!section) return;

  const { data: students } = await usersApi.getUsers({
    role: 'student',
    sectionId: secId,
    pageSize: 50
  });

  let rosterHtml = '';
  if (!students || students.length === 0) {
    rosterHtml = '<p style="text-align:center; padding:20px; color:var(--text-3);">No students currently enrolled in this section.</p>';
  } else {
    rosterHtml = `
      <div style="max-height:360px; overflow-y:auto;">
        <table class="data-table" style="width:100%;">
          <thead>
            <tr>
              <th>Student #</th>
              <th>Name</th>
              <th>Status</th>
              <th>RFID Tag</th>
            </tr>
          </thead>
          <tbody>
            ${students.map(st => `
              <tr>
                <td style="font-weight:600;">${st.student_number || '—'}</td>
                <td style="font-weight:600;">${st.first_name} ${st.last_name}</td>
                <td><span class="badge badge-${st.status}">${st.status}</span></td>
                <td><span style="font-size:11.5px; color:var(--text-2);">${st.rfid_credentials?.[0]?.card_uid || 'No Card'}</span></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  Modal.open({
    id: 'rosterModal',
    title: `Section Roster: ${section.name} (${students?.length || 0} Students)`,
    content: rosterHtml,
    actions: [
      {
        label: 'Close',
        class: 'btn-secondary',
        onClick: () => Modal.close('rosterModal')
      }
    ]
  });
}

/**
 * Opens Add or Edit Section Modal
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

  const content = `
    <div style="display:flex; flex-direction:column; gap:14px;">
      <div>
        <label style="display:block; font-size:12px; font-weight:600; margin-bottom:4px; color:var(--text-1);">Section Name</label>
        <input type="text" id="secName" class="input-field" style="width:100%;" placeholder="e.g. BSIT 3-1" value="${sec ? sec.name : ''}">
      </div>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
        <div>
          <label style="display:block; font-size:12px; font-weight:600; margin-bottom:4px; color:var(--text-1);">Program Code</label>
          <input type="text" id="secProgram" class="input-field" style="width:100%;" placeholder="e.g. BSIT" value="${sec ? sec.program_code : 'BSIT'}">
        </div>
        <div>
          <label style="display:block; font-size:12px; font-weight:600; margin-bottom:4px; color:var(--text-1);">Year Level</label>
          <select id="secYear" class="select-field" style="width:100%;">
            <option value="1" ${sec && sec.year_level === 1 ? 'selected' : ''}>Year 1</option>
            <option value="2" ${sec && sec.year_level === 2 ? 'selected' : ''}>Year 2</option>
            <option value="3" ${sec && sec.year_level === 3 ? 'selected' : ''}>Year 3</option>
            <option value="4" ${sec && sec.year_level === 4 ? 'selected' : ''}>Year 4</option>
          </select>
        </div>
      </div>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
        <div>
          <label style="display:block; font-size:12px; font-weight:600; margin-bottom:4px; color:var(--text-1);">Academic Year</label>
          <input type="text" id="secAy" class="input-field" style="width:100%;" value="${sec ? (sec.academic_year || '2026-2027') : '2026-2027'}">
        </div>
        <div>
          <label style="display:block; font-size:12px; font-weight:600; margin-bottom:4px; color:var(--text-1);">Semester</label>
          <select id="secSem" class="select-field" style="width:100%;">
            <option value="1st Sem" ${sec && sec.semester === '1st Sem' ? 'selected' : ''}>1st Semester</option>
            <option value="2nd Sem" ${sec && sec.semester === '2nd Sem' ? 'selected' : ''}>2nd Semester</option>
            <option value="Summer" ${sec && sec.semester === 'Summer' ? 'selected' : ''}>Summer</option>
          </select>
        </div>
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
          const name = document.getElementById('secName')?.value.trim();
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
                academic_year,
                semester,
                advisor_teacher_id
              });
              toast.show(`Section "${name}" updated successfully.`, 'success');
            } else {
              await sectionsApi.createSection({
                name,
                program_code,
                year_level,
                academic_year,
                semester,
                advisor_teacher_id
              });
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
