/**
 * users.js - Page controller for User & Credential Directory
 * Bestlink College of the Philippines - Attendance Monitoring System (AMS)
 */

import { requireRole } from '../../lib/rbac-guard.js';
import { usersApi } from '../../api/usersApi.js';
import { sectionsApi } from '../../api/sectionsApi.js';
import { toast } from '../../components/toast.js';
import { Modal } from '../../components/modal.js';
import { renderNumberedPagination } from '../../components/pagination.js';

let currentPage = 0;
const pageSize = 15;
let totalUsers = 0;
let currentUsersList = [];
let sectionsList = [];

/**
 * Loads users according to current filters and pagination
 */
async function loadUsers() {
  const role = document.getElementById('filterRole')?.value || null;
  const sectionId = document.getElementById('filterSection')?.value || null;
  const status = document.getElementById('filterStatus')?.value || null;
  const search = document.getElementById('searchUser')?.value.trim() || '';

  const { data, count } = await usersApi.getUsers({
    role,
    sectionId,
    status,
    search,
    page: currentPage,
    pageSize
  });

  totalUsers = count;
  currentUsersList = data;

  renderUsersTable(currentUsersList);
  updatePaginationUI();
}

/**
 * Renders the users table body
 */
function renderUsersTable(users) {
  const tbody = document.getElementById('usersTableBody');
  if (!tbody) return;

  if (!users || users.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8">
          <div class="empty-state">
            <svg viewBox="0 0 24 24" fill="none" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6M9 9l6 6"/></svg>
            <h4>No users found</h4>
            <p>Try modifying your search or role filters.</p>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = users.map(user => {
    const fullName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'Unknown User';
    const email = user.email || '—';
    const idNumber = user.student_number || user.employee_number || '—';
    const sectionName = user.sections?.name || user.student_sections?.[0]?.sections?.name || '—';
    const roleCapitalized = user.role ? user.role.charAt(0).toUpperCase() + user.role.slice(1) : 'Student';
    const rfidCard = user.rfid_credentials?.find(c => c.is_active)?.card_uid || user.rfid_cards?.find(c => c.is_active)?.card_uid || null;
    const parent = user.parent_contacts?.[0];
    let parentPhone = 'No Contact';
    if (parent) {
      const hasPhone = Boolean(parent.mobile_number || parent.phone_number);
      const hasEmail = Boolean(parent.email);
      let badges = '';
      if (hasPhone) {
        badges += `<span class="badge" style="background:rgba(33, 150, 243, 0.12); color:#2196F3; font-size:10px; font-weight:700; padding:1px 5px; margin-left:4px;">SMS</span>`;
      }
      if (hasEmail) {
        badges += `<span class="badge" style="background:rgba(239, 68, 68, 0.12); color:#EF4444; font-size:10px; font-weight:700; padding:1px 5px; margin-left:4px;">Gmail</span>`;
      }
      const primaryDisplay = parent.mobile_number || parent.email || 'Registered';
      parentPhone = `<span>${primaryDisplay}</span> ${badges} <span style="color:var(--text-3); font-size:11px;">(${parent.relationship || 'Guardian'})</span>`;
    }
    const status = user.status || 'active';

    return `
      <tr>
        <td>
          <div style="font-weight:600; color:var(--text-1);">${fullName}</div>
          <div style="font-size:11.5px; color:var(--text-3);">${email}</div>
        </td>
        <td><span style="font-weight:600; font-family:monospace; color:var(--text-1);">${idNumber}</span></td>
        <td><span class="badge" style="background:var(--raised); color:var(--ch-900); font-weight:700;">${roleCapitalized}</span></td>
        <td><span style="font-weight:500;">${sectionName}</span></td>
        <td>
          ${rfidCard ? `
            <span style="font-family:monospace; font-size:12px; font-weight:700; color:var(--ch-500); padding:2px 6px; background:var(--accent-soft); border-radius:4px; border:1px solid var(--border-strong);">
              ${rfidCard}
            </span>
          ` : `
            <span class="badge" style="background:var(--raised); color:var(--text-3); font-size:11px; font-weight:600; padding:2px 8px; border:1px dashed var(--border);">
              Not Registered
            </span>
          `}
        </td>
        <td style="font-size:12px; color:var(--text-2);">${parentPhone}</td>
        <td><span class="badge badge-${status}">${status}</span></td>
        <td style="text-align:center;">
          <div style="display:inline-flex; justify-content:center; gap:6px;">
            <button class="btn-secondary btn-card-modal" data-id="${user.id}" data-name="${fullName}" data-rfid="${rfidCard || ''}" style="padding:4px 8px; font-size:11px; display:inline-flex; align-items:center; gap:4px;" title="Edit User & RFID">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
              Edit
            </button>
            ${status === 'active' ? `
              <button class="btn-danger btn-deactivate" data-id="${user.id}" data-name="${fullName}" style="padding:4px 8px; font-size:11px;">
                Deactivate
              </button>
            ` : `
              <button class="btn-secondary btn-activate" data-id="${user.id}" data-name="${fullName}" style="padding:4px 8px; font-size:11px; color:var(--present);">
                Activate
              </button>
            `}
          </div>
        </td>
      </tr>
    `;
  }).join('');

  // Attach action listeners
  document.querySelectorAll('.btn-card-modal').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const userId = e.currentTarget.getAttribute('data-id');
      const user = currentUsersList.find(u => u.id === userId);
      if (user) {
        openEditUserModal(user);
      }
    });
  });

  document.querySelectorAll('.btn-deactivate').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const userId = e.currentTarget.getAttribute('data-id');
      const userName = e.currentTarget.getAttribute('data-name');
      if (confirm(`Are you sure you want to soft-deactivate ${userName}? They will no longer be permitted gate ingress.`)) {
        await usersApi.deactivateUser(userId);
        toast.show(`${userName} deactivated successfully.`, 'info');
        loadUsers();
      }
    });
  });

  document.querySelectorAll('.btn-activate').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const userId = e.currentTarget.getAttribute('data-id');
      const userName = e.currentTarget.getAttribute('data-name');
      await usersApi.updateUser(userId, { status: 'active' });
      toast.show(`${userName} restored to active status.`, 'success');
      loadUsers();
    });
  });
}

/**
 * Updates pagination bar
 */
function updatePaginationUI() {
  renderNumberedPagination({
    containerId: 'pageNumbersContainer',
    prevBtnId: 'usersPrevBtn',
    nextBtnId: 'usersNextBtn',
    infoTextId: 'usersRecordCount',
    totalRecords: totalUsers,
    pageSize,
    currentPage,
    onPageChange: (newPage) => {
      currentPage = newPage;
      loadUsers();
    }
  });
}

/**
 * Opens Edit User & RFID Management Modal showing complete student/user details
 */
function openEditUserModal(user) {
  const fullName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'User';
  const role = user.role || 'student';
  const isStudent = role === 'student';
  const idNumber = isStudent ? (user.student_number || '—') : (user.employee_number || '—');
  const sectionName = user.sections?.name || user.student_sections?.[0]?.sections?.name || 'Unassigned';
  const currentSectionId = user.sections?.id || user.student_sections?.[0]?.sections?.id || user.student_sections?.[0]?.section_id || '';
  const currentRfid = user.rfid_credentials?.find(c => c.is_active)?.card_uid || user.rfid_cards?.find(c => c.is_active)?.card_uid || '';
  const parent = user.parent_contacts?.[0];
  const parentName = parent?.full_name || 'None listed';
  const parentPhone = parent?.mobile_number || parent?.phone_number || '';
  const parentEmail = parent?.email || '';
  const parentChannel = (parent?.alert_channel || 'sms').toLowerCase();
  const parentRel = parent?.relationship || 'Guardian';
  const status = user.status || 'active';

  const sectionOptions = sectionsList.map(s => 
    `<option value="${s.id}" ${s.id === currentSectionId ? 'selected' : ''}>${s.name} (${s.program_code})</option>`
  ).join('');

  const content = `
    <div style="display:flex; flex-direction:column; gap:16px;">
      <!-- Student Profile Header Card -->
      <div style="background:var(--raised); border:1px solid var(--border); border-radius:10px; padding:14px; display:flex; align-items:center; gap:14px;">
        <div style="width:48px; height:48px; border-radius:50%; background:var(--ch-100); color:var(--ch-900); font-weight:700; font-size:16px; display:flex; align-items:center; justify-content:center; flex-shrink:0;">
          ${(user.first_name?.[0] || 'U') + (user.last_name?.[0] || '')}
        </div>
        <div style="flex:1; min-width:0;">
          <div style="display:flex; align-items:center; gap:8px;">
            <h4 style="margin:0; font-size:15px; font-weight:700; color:var(--text-1);">${fullName}</h4>
            <span class="badge" style="background:var(--ch-100); color:var(--ch-900); font-size:10px; font-weight:700; text-transform:capitalize;">${role}</span>
            <span class="badge badge-${status}" style="font-size:10px;">${status}</span>
          </div>
          <div style="font-size:12px; color:var(--text-2); margin-top:2px;">${user.email || 'No email provided'}</div>
        </div>
      </div>

      <!-- Quick Details Overview Grid -->
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; font-size:12px; background:var(--surface); border:1px solid var(--border); border-radius:8px; padding:12px;">
        <div>
          <span style="color:var(--text-3); display:block; font-size:11px;">${isStudent ? 'Student Number' : 'Employee Number'}:</span>
          <strong style="font-family:monospace; color:var(--text-1);">${idNumber}</strong>
        </div>
        <div>
          <span style="color:var(--text-3); display:block; font-size:11px;">Current Section:</span>
          <strong style="color:var(--text-1);">${sectionName}</strong>
        </div>
        ${isStudent ? `
          <div style="grid-column: span 2; padding-top:6px; border-top:1px solid var(--border-soft);">
            <span style="color:var(--text-3); display:block; font-size:11px;">Parent / SMS Alert Contact:</span>
            <strong style="color:var(--text-1);">${parentName} (${parentRel}) · <span style="font-family:monospace;">${parentPhone}</span></strong>
          </div>
        ` : ''}
      </div>

      <!-- Editable User Information -->
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
        <div>
          <label style="display:block; font-size:12px; font-weight:600; margin-bottom:4px; color:var(--text-1);">First Name</label>
          <input type="text" id="editFirstName" class="input-field" style="width:100%;" value="${user.first_name || ''}">
        </div>
        <div>
          <label style="display:block; font-size:12px; font-weight:600; margin-bottom:4px; color:var(--text-1);">Last Name</label>
          <input type="text" id="editLastName" class="input-field" style="width:100%;" value="${user.last_name || ''}">
        </div>
      </div>

      <div>
        <label style="display:block; font-size:12px; font-weight:600; margin-bottom:4px; color:var(--text-1);">${isStudent ? 'Student Email (Gmail)' : 'Email Address'}</label>
        <input type="email" id="editEmail" class="input-field" style="width:100%;" placeholder="e.g. name@gmail.com" value="${user.email || ''}">
      </div>

      ${isStudent ? `
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
          <div>
            <label style="display:block; font-size:12px; font-weight:600; margin-bottom:4px; color:var(--text-1);">Assigned Section</label>
            <select id="editSection" class="select-field" style="width:100%;">
              <option value="">-- No Section Assigned --</option>
              ${sectionOptions}
            </select>
          </div>
          <div>
            <label style="display:block; font-size:12px; font-weight:600; margin-bottom:4px; color:var(--text-1);">Account Status</label>
            <select id="editStatus" class="select-field" style="width:100%;">
              <option value="active" ${status === 'active' ? 'selected' : ''}>Active</option>
              <option value="inactive" ${status === 'inactive' ? 'selected' : ''}>Inactive</option>
            </select>
          </div>
        </div>

        <!-- Parent / Alert Notification Contact -->
        <div style="border-top:1px solid var(--border); padding-top:14px;">
          <div style="font-size:12px; font-weight:700; color:var(--text-1); margin-bottom:10px; display:flex; align-items:center; gap:6px;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
            Parent / Guardian Alert Contact
          </div>

          <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:10px;">
            <div>
              <label style="display:block; font-size:11.5px; font-weight:600; margin-bottom:4px; color:var(--text-2);">Guardian Full Name</label>
              <input type="text" id="editParentName" class="input-field" style="width:100%;" placeholder="e.g. Maria Dela Cruz" value="${parent?.full_name || ''}">
            </div>
            <div>
              <label style="display:block; font-size:11.5px; font-weight:600; margin-bottom:4px; color:var(--text-2);">Relationship</label>
              <select id="editParentRel" class="select-field" style="width:100%;">
                <option value="Mother" ${parentRel === 'Mother' ? 'selected' : ''}>Mother</option>
                <option value="Father" ${parentRel === 'Father' ? 'selected' : ''}>Father</option>
                <option value="Guardian" ${parentRel === 'Guardian' ? 'selected' : ''}>Guardian</option>
                <option value="Grandparent" ${parentRel === 'Grandparent' ? 'selected' : ''}>Grandparent</option>
                <option value="Sibling" ${parentRel === 'Sibling' ? 'selected' : ''}>Sibling</option>
              </select>
            </div>
          </div>

          <!-- Direct Contact Fields: SMS & Gmail -->
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
            <div>
              <label style="display:block; font-size:11.5px; font-weight:600; margin-bottom:4px; color:var(--text-2);">
                Guardian Mobile (SMS)
              </label>
              <input type="text" id="editParentPhone" class="input-field" style="width:100%; font-family:monospace;" placeholder="e.g. +63 917 123 4567" value="${parent?.mobile_number || parent?.phone_number || ''}">
            </div>
            <div>
              <label style="display:block; font-size:11.5px; font-weight:600; margin-bottom:4px; color:var(--text-2);">
                Guardian Gmail (Email Alert)
              </label>
              <input type="email" id="editParentEmail" class="input-field" style="width:100%;" placeholder="e.g. guardian@gmail.com" value="${parentEmail}">
            </div>
          </div>
          <p style="font-size:11px; color:var(--text-3); margin-top:6px; line-height:1.4;">
            Automated student ingress, tardiness, and absence alerts will be sent to the registered mobile number and/or Gmail.
          </p>
        </div>
      ` : ''}

      <!-- RFID Hardware Card UID Section -->
      <div style="border-top:1px solid var(--border); padding-top:14px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
          <label style="font-size:12px; font-weight:600; color:var(--text-1); margin:0;">
            RFID Hardware Card UID
          </label>
          <button type="button" id="btnAutoGenerateRfid" class="btn-secondary" style="font-size:11px; padding:3px 8px; display:inline-flex; align-items:center; gap:4px;" title="Generate random 8-character HEX UID">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8M3 3v5h5M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16M21 21v-5h-5"/></svg>
            Auto-Generate UID
          </button>
        </div>
        <div style="display:flex; gap:8px;">
          <input type="text" id="cardUidInput" class="input-field" style="flex:1; font-family:monospace; text-transform:uppercase;" placeholder="e.g. A1B2C3D4" value="${currentRfid}">
          ${currentRfid ? `
            <button type="button" id="btnClearRfid" class="btn-secondary" style="font-size:11px; padding:3px 8px; color:var(--absent);" title="Clear RFID Card">
              Clear
            </button>
          ` : ''}
        </div>
        <p style="font-size:11.5px; color:var(--text-3); margin-top:5px; line-height:1.4;">
          Tap card on administrator USB reader, enter 8–14 character HEX UID, or click <strong>Auto-Generate UID</strong>.
        </p>
      </div>
    </div>
  `;

  Modal.open({
    id: 'editUserModal',
    title: `Edit Details: ${fullName}`,
    content,
    actions: [
      {
        label: 'Cancel',
        class: 'btn-secondary',
        onClick: () => Modal.close('editUserModal')
      },
      {
        label: 'Save Changes',
        class: 'btn-primary',
        onClick: async () => {
          const firstName = document.getElementById('editFirstName')?.value.trim();
          const lastName = document.getElementById('editLastName')?.value.trim();
          const email = document.getElementById('editEmail')?.value.trim();
          const cardUid = document.getElementById('cardUidInput')?.value.trim().toUpperCase();
          const selectedSec = document.getElementById('editSection')?.value || null;
          const selectedStatus = document.getElementById('editStatus')?.value || status;
          const parentNameInput = document.getElementById('editParentName')?.value.trim();
          const parentRelInput = document.getElementById('editParentRel')?.value || 'Guardian';
          const parentPhoneInput = document.getElementById('editParentPhone')?.value.trim();
          const parentEmailInput = document.getElementById('editParentEmail')?.value.trim();

          // Automatically derive channel: 'both', 'gmail', or 'sms' based on filled inputs
          let activeChannel = 'sms';
          if (parentPhoneInput && parentEmailInput) {
            activeChannel = 'both';
          } else if (parentEmailInput && !parentPhoneInput) {
            activeChannel = 'gmail';
          }

          if (!firstName || !lastName || !email) {
            toast.show('First name, last name, and email are required.', 'warning');
            return;
          }

          try {
            // 1. Update basic user details
            await usersApi.updateUser(user.id, {
              first_name: firstName,
              last_name: lastName,
              email: email,
              status: selectedStatus
            });

            // 2. Update RFID card if changed
            if (cardUid !== currentRfid) {
              if (cardUid) {
                await usersApi.assignRfidCard(user.id, cardUid);
              }
            }

            // 3. Update section assignment for students if changed
            if (isStudent && selectedSec && selectedSec !== currentSectionId) {
              await sectionsApi.bulkEnrollStudents(selectedSec, [user.id]);
            }

            // 4. Update Parent Contact if student
            if (isStudent && (parentPhoneInput || parentNameInput || parentEmailInput)) {
              let cleanPhone = (parentPhoneInput || '').replace(/[\s-]/g, '');
              if (cleanPhone.startsWith('09')) {
                cleanPhone = '+63' + cleanPhone.substring(1);
              }
              await usersApi.updateParentContact(user.id, {
                fullName: parentNameInput || 'Parent / Guardian',
                relationship: parentRelInput,
                mobileNumber: cleanPhone,
                alertChannel: activeChannel,
                email: parentEmailInput
              });
            }

            toast.show(`Details for ${firstName} ${lastName} updated successfully.`, 'success');
            Modal.close('editUserModal');
            loadUsers();
          } catch (err) {
            toast.show('Failed to save changes: ' + (err.message || 'Error'), 'error');
          }
        }
      }
    ]
  });

  // Wire up Auto-Generate and Clear RFID buttons inside modal
  document.getElementById('btnAutoGenerateRfid')?.addEventListener('click', () => {
    const input = document.getElementById('cardUidInput');
    if (input) {
      // Generate standard 8-character uppercase HEX UID (e.g. 4 bytes ISO14443A Mifare)
      const bytes = new Uint8Array(4);
      window.crypto.getRandomValues(bytes);
      const generatedUid = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
      input.value = generatedUid;
      toast.show(`Generated RFID UID: ${generatedUid}`, 'info');
    }
  });

  document.getElementById('btnClearRfid')?.addEventListener('click', () => {
    const input = document.getElementById('cardUidInput');
    if (input) {
      input.value = '';
      toast.show('RFID card cleared. Click "Save Changes" to commit.', 'info');
    }
  });
}

/**
 * Opens Add New User Modal
 */
function openCreateUserModal() {
  const sectionOptions = sectionsList.map(s => `<option value="${s.id}">${s.name} (${s.program_code})</option>`).join('');

  const content = `
    <div style="display:flex; flex-direction:column; gap:16px;">
      <!-- Role Toggle Tabs at the Top -->
      <div style="background:var(--raised); border:1px solid var(--border); border-radius:10px; padding:4px; display:grid; grid-template-columns:1fr 1fr; gap:4px;">
        <button type="button" id="toggleRoleStudent" class="btn-role-toggle active" style="padding:9px 12px; border-radius:8px; border:none; font-size:13px; font-weight:700; cursor:pointer; display:inline-flex; align-items:center; justify-content:center; gap:8px; transition:all 0.15s ease; background:var(--ch-900); color:#ffffff; box-shadow:0 2px 4px rgba(13,71,161,0.25);">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>
          Student Account
        </button>
        <button type="button" id="toggleRoleTeacher" class="btn-role-toggle" style="padding:9px 12px; border-radius:8px; border:none; font-size:13px; font-weight:600; cursor:pointer; display:inline-flex; align-items:center; justify-content:center; gap:8px; transition:all 0.15s ease; background:transparent; color:var(--text-2);">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"/><path d="M6 6h10M6 10h10"/></svg>
          Teacher / Faculty
        </button>
      </div>

      <!-- Hidden input to store chosen role -->
      <input type="hidden" id="newRole" value="student">

      <!-- Name Fields -->
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
        <div>
          <label style="display:block; font-size:12px; font-weight:600; margin-bottom:4px; color:var(--text-1);">First Name <span style="color:#ef4444;">*</span></label>
          <input type="text" id="newFirstName" class="input-field" style="width:100%;" placeholder="e.g. John">
        </div>
        <div>
          <label style="display:block; font-size:12px; font-weight:600; margin-bottom:4px; color:var(--text-1);">Last Name <span style="color:#ef4444;">*</span></label>
          <input type="text" id="newLastName" class="input-field" style="width:100%;" placeholder="e.g. Reyes">
        </div>
      </div>

      <!-- Email & ID Number -->
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
        <div>
          <label style="display:block; font-size:12px; font-weight:600; margin-bottom:4px; color:var(--text-1);">Email Address <span style="color:#ef4444;">*</span></label>
          <input type="email" id="newEmail" class="input-field" style="width:100%;" placeholder="e.g. juandelacruz@gmail.com">
        </div>
        <div>
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
            <label id="lblIdNumber" style="font-size:12px; font-weight:600; color:var(--text-1); margin:0;">Student Number <span style="color:#ef4444;">*</span></label>
            <button type="button" id="btnAutoGenerateId" class="btn-secondary" style="font-size:11px; padding:2px 7px; display:inline-flex; align-items:center; gap:4px;" title="Generate ID number">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8M3 3v5h5M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16M21 21v-5h-5"/></svg>
              Auto-Generate
            </button>
          </div>
          <input type="text" id="newStudentNum" class="input-field" style="width:100%; font-family:monospace;" placeholder="e.g. s230110001">
        </div>
      </div>

      <!-- Assigned Section (Student Only) -->
      <div id="sectionSelectGroup">
        <label style="display:block; font-size:12px; font-weight:600; margin-bottom:4px; color:var(--text-1);">Assigned Section</label>
        <select id="newSection" class="select-field" style="width:100%;">
          <option value="">None / Not Applicable</option>
          ${sectionOptions}
        </select>
      </div>

      <!-- Parent / Guardian Alert Contact (for Students) -->
      <div id="parentContactGroup" style="border-top:1px solid var(--border); padding-top:14px;">
        <div style="font-size:12px; font-weight:700; color:var(--text-1); margin-bottom:10px; display:flex; align-items:center; gap:6px;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
          Parent / Guardian Alert Contact
        </div>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:10px;">
          <div>
            <label style="display:block; font-size:11.5px; font-weight:600; margin-bottom:4px; color:var(--text-2);">Guardian Full Name</label>
            <input type="text" id="newParentName" class="input-field" style="width:100%;" placeholder="e.g. Maria Dela Cruz">
          </div>
          <div>
            <label style="display:block; font-size:11.5px; font-weight:600; margin-bottom:4px; color:var(--text-2);">Relationship</label>
            <select id="newParentRel" class="select-field" style="width:100%;">
              <option value="Mother" selected>Mother</option>
              <option value="Father">Father</option>
              <option value="Guardian">Guardian</option>
              <option value="Grandparent">Grandparent</option>
              <option value="Sibling">Sibling</option>
            </select>
          </div>
        </div>

        <!-- Direct Contact Fields: SMS & Gmail -->
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
          <div>
            <label style="display:block; font-size:11.5px; font-weight:600; margin-bottom:4px; color:var(--text-2);">
              Guardian Mobile (SMS)
            </label>
            <input type="text" id="newParentPhone" class="input-field" style="width:100%; font-family:monospace;" placeholder="e.g. +63 917 123 4567">
          </div>
          <div>
            <label style="display:block; font-size:11.5px; font-weight:600; margin-bottom:4px; color:var(--text-2);">
              Guardian Gmail (Email Alert)
            </label>
            <input type="email" id="newParentEmail" class="input-field" style="width:100%;" placeholder="e.g. guardian@gmail.com">
          </div>
        </div>
        <p style="font-size:11px; color:var(--text-3); margin-top:6px; line-height:1.4;">
          Automated student ingress, tardiness, and absence alerts will be dispatched to the mobile number and/or Gmail address.
        </p>
      </div>

      <!-- Hardware RFID UID Section -->
      <div style="border-top:1px solid var(--border); padding-top:14px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
          <label style="font-size:12px; font-weight:600; color:var(--text-1); margin:0;">
            RFID Hardware Card UID (Optional)
          </label>
          <button type="button" id="btnAutoGenerateNewRfid" class="btn-secondary" style="font-size:11px; padding:3px 8px; display:inline-flex; align-items:center; gap:4px;" title="Generate random 8-character HEX UID">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8M3 3v5h5M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16M21 21v-5h-5"/></svg>
            Auto-Generate UID
          </button>
        </div>
        <div style="display:flex; gap:8px;">
          <input type="text" id="newCardUid" class="input-field" style="flex:1; font-family:monospace; text-transform:uppercase;" placeholder="e.g. A1B2C3D4">
        </div>
      </div>
    </div>
  `;

  Modal.open({
    id: 'createUserModal',
    title: 'Add New User',
    content,
    actions: [
      {
        label: 'Cancel',
        class: 'btn-secondary',
        onClick: () => Modal.close('createUserModal')
      },
      {
        label: 'Create Account',
        class: 'btn-primary',
        onClick: async () => {
          const first_name = document.getElementById('newFirstName')?.value.trim();
          const last_name = document.getElementById('newLastName')?.value.trim();
          const email = document.getElementById('newEmail')?.value.trim();
          const role = document.getElementById('newRole')?.value;
          const student_number = document.getElementById('newStudentNum')?.value.trim() || null;
          const section_id = document.getElementById('newSection')?.value || null;
          const card_uid = document.getElementById('newCardUid')?.value.trim().toUpperCase() || null;

          const parentName = document.getElementById('newParentName')?.value.trim();
          const parentRel = document.getElementById('newParentRel')?.value || 'Guardian';
          const parentPhone = document.getElementById('newParentPhone')?.value.trim();
          const parentEmail = document.getElementById('newParentEmail')?.value.trim();

          if (!first_name || !last_name || !email) {
            toast.show('Please provide First Name, Last Name, and Email.', 'warning');
            return;
          }

          try {
            const newUser = await usersApi.createUser({
              first_name,
              last_name,
              email,
              role,
              student_number: role === 'student' ? student_number : student_number,
              employee_number: role === 'teacher' ? student_number : null,
              section_id: role === 'student' ? section_id : null,
              status: 'active'
            });

            if (card_uid && newUser?.id) {
              await usersApi.assignRfidCard(newUser.id, card_uid);
            }

            // Save parent contact details if user is student and contact details provided
            if (role === 'student' && newUser?.id && (parentPhone || parentEmail || parentName)) {
              let cleanPhone = (parentPhone || '').replace(/[\s-]/g, '');
              if (cleanPhone.startsWith('09')) {
                cleanPhone = '+63' + cleanPhone.substring(1);
              }

              let activeChannel = 'sms';
              if (cleanPhone && parentEmail) {
                activeChannel = 'both';
              } else if (parentEmail && !cleanPhone) {
                activeChannel = 'gmail';
              }

              await usersApi.updateParentContact(newUser.id, {
                fullName: parentName || 'Parent / Guardian',
                relationship: parentRel,
                mobileNumber: cleanPhone,
                alertChannel: activeChannel,
                email: parentEmail
              });
            }

            toast.show(`User ${first_name} ${last_name} created successfully.`, 'success');
            Modal.close('createUserModal');
            loadUsers();
          } catch (err) {
            toast.show('Failed to create user: ' + (err.message || 'Error'), 'error');
          }
        }
      }
    ]
  });

  // Segmented role toggle handler (Student vs Teacher)
  const roleInput = document.getElementById('newRole');
  const btnStudent = document.getElementById('toggleRoleStudent');
  const btnTeacher = document.getElementById('toggleRoleTeacher');
  const sectionGroup = document.getElementById('sectionSelectGroup');
  const parentGroup = document.getElementById('parentContactGroup');
  const lblIdNumber = document.getElementById('lblIdNumber');
  const inputStudentNum = document.getElementById('newStudentNum');
  const inputEmail = document.getElementById('newEmail');

  function setRole(role) {
    if (!roleInput) return;
    roleInput.value = role;

    if (role === 'student') {
      btnStudent.style.background = 'var(--ch-900)';
      btnStudent.style.color = '#ffffff';
      btnStudent.style.boxShadow = '0 2px 4px rgba(13,71,161,0.25)';
      btnStudent.style.fontWeight = '700';

      btnTeacher.style.background = 'transparent';
      btnTeacher.style.color = 'var(--text-2)';
      btnTeacher.style.boxShadow = 'none';
      btnTeacher.style.fontWeight = '600';

      if (sectionGroup) sectionGroup.style.display = 'block';
      if (parentGroup) parentGroup.style.display = 'block';
      if (lblIdNumber) lblIdNumber.innerHTML = 'Student Number <span style="color:#ef4444;">*</span>';
      if (inputStudentNum) inputStudentNum.placeholder = 'e.g. s230110001';
      if (inputEmail) inputEmail.placeholder = 'e.g. juandelacruz@gmail.com';
    } else {
      btnTeacher.style.background = 'var(--ch-900)';
      btnTeacher.style.color = '#ffffff';
      btnTeacher.style.boxShadow = '0 2px 4px rgba(13,71,161,0.25)';
      btnTeacher.style.fontWeight = '700';

      btnStudent.style.background = 'transparent';
      btnStudent.style.color = 'var(--text-2)';
      btnStudent.style.boxShadow = 'none';
      btnStudent.style.fontWeight = '600';

      if (sectionGroup) sectionGroup.style.display = 'none';
      if (parentGroup) parentGroup.style.display = 'none';
      if (lblIdNumber) lblIdNumber.innerHTML = 'Teacher ID <span style="color:#ef4444;">*</span>';
      if (inputStudentNum) inputStudentNum.placeholder = 'e.g. t230110001';
      if (inputEmail) inputEmail.placeholder = 'e.g. teacher.reyes@gmail.com';
    }
  }

  btnStudent?.addEventListener('click', () => setRole('student'));
  btnTeacher?.addEventListener('click', () => setRole('teacher'));

  document.getElementById('btnAutoGenerateId')?.addEventListener('click', () => {
    const input = document.getElementById('newStudentNum');
    const currentRole = roleInput?.value || 'student';
    if (!input) return;

    const currentYear = new Date().getFullYear().toString().slice(-2); // e.g. "24"
    const randSeq = Math.floor(1000 + Math.random() * 9000); // 4-digit random sequence

    if (currentRole === 'student') {
      // BCP Student Number format: s{year}011{seq}, e.g. s240114829
      const generated = `s${currentYear}011${randSeq}`;
      input.value = generated;
      toast.show(`Generated Student Number: ${generated}`, 'info');
    } else {
      // BCP Teacher ID format: t{year}011{seq}, e.g. t240114829
      const generated = `t${currentYear}011${randSeq}`;
      input.value = generated;
      toast.show(`Generated Teacher ID: ${generated}`, 'info');
    }
  });

  document.getElementById('btnAutoGenerateNewRfid')?.addEventListener('click', () => {
    const input = document.getElementById('newCardUid');
    if (input) {
      const bytes = new Uint8Array(4);
      window.crypto.getRandomValues(bytes);
      const generatedUid = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
      input.value = generatedUid;
      toast.show(`Generated RFID UID: ${generatedUid}`, 'info');
    }
  });
}

/**
 * Initializes Users view
 */
async function init() {
  await requireRole(['admin']);

  // Load sections for filter dropdown
  sectionsList = await sectionsApi.getSections();
  const filterSec = document.getElementById('filterSection');
  if (filterSec) {
    sectionsList.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = `${s.name} (${s.program_code})`;
      filterSec.appendChild(opt);
    });
  }

  // Filter bindings
  document.getElementById('filterRole')?.addEventListener('change', () => { currentPage = 0; loadUsers(); });
  document.getElementById('filterSection')?.addEventListener('change', () => { currentPage = 0; loadUsers(); });
  document.getElementById('filterStatus')?.addEventListener('change', () => { currentPage = 0; loadUsers(); });

  let searchTimeout = null;
  document.getElementById('searchUser')?.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      currentPage = 0;
      loadUsers();
    }, 280);
  });

  document.getElementById('btnCreateUser')?.addEventListener('click', openCreateUserModal);

  // Initial load
  loadUsers();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
