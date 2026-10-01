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
    const idNumber = user.student_number || '—';
    const sectionName = user.sections?.name || '—';
    const roleCapitalized = user.role ? user.role.charAt(0).toUpperCase() + user.role.slice(1) : 'Student';
    const rfidCard = user.rfid_credentials?.find(c => c.is_active)?.card_uid || null;
    const parent = user.parent_contacts?.[0];
    const parentPhone = parent ? `${parent.phone_number} (${parent.relationship || 'Guardian'})` : 'No SMS Contact';
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
            <button class="btn-secondary btn-assign-rfid" data-id="${user.id}" data-name="${fullName}" style="padding:3px 8px; font-size:11px;">
              + Assign RFID
            </button>
          `}
        </td>
        <td style="font-size:12px; color:var(--text-2);">${parentPhone}</td>
        <td><span class="badge badge-${status}">${status}</span></td>
        <td style="text-align:right;">
          <div style="display:inline-flex; gap:6px;">
            <button class="btn-secondary btn-card-modal" data-id="${user.id}" data-name="${fullName}" data-rfid="${rfidCard || ''}" style="padding:4px 8px; font-size:11px;" title="Manage Credentials">
              Card/QR
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
  document.querySelectorAll('.btn-assign-rfid, .btn-card-modal').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const userId = e.currentTarget.getAttribute('data-id');
      const userName = e.currentTarget.getAttribute('data-name');
      const currentRfid = e.currentTarget.getAttribute('data-rfid') || '';
      openCredentialModal(userId, userName, currentRfid);
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
 * Opens Credential Management Modal (RFID assignment & QR token preview)
 */
function openCredentialModal(userId, userName, currentRfid) {
  const content = `
    <div style="display:flex; flex-direction:column; gap:16px;">
      <div>
        <label style="display:block; font-size:12px; font-weight:600; margin-bottom:4px; color:var(--text-1);">
          RFID Hardware Card UID
        </label>
        <div style="display:flex; gap:8px;">
          <input type="text" id="cardUidInput" class="input-field" style="flex:1; font-family:monospace; text-transform:uppercase;" placeholder="e.g. A1B2C3D4" value="${currentRfid}">
          <button type="button" id="btnSaveRfid" class="btn-primary" style="padding:8px 14px;">Save Tag</button>
        </div>
        <p style="font-size:11.5px; color:var(--text-3); margin-top:4px;">
          Tap card on administrator USB reader or enter 8–14 character HEX UID.
        </p>
      </div>

      <div style="border-top:1px solid var(--border); padding-top:14px;">
        <label style="display:block; font-size:12px; font-weight:600; margin-bottom:4px; color:var(--text-1);">
          Digital Camera QR Fallback Token
        </label>
        <div style="display:flex; gap:8px; margin-bottom:8px;">
          <button type="button" id="btnRotateQr" class="btn-secondary" style="font-size:12px;">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8M3 3v5h5M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16M21 21v-5h-5"/></svg>
            Generate / Rotate QR Token
          </button>
        </div>
        <div id="qrTokenDisplay" style="font-size:12px; font-family:monospace; color:var(--ch-500); word-break:break-all;"></div>
      </div>
    </div>
  `;

  Modal.open({
    id: 'credentialModal',
    title: `Credentials: ${userName}`,
    content,
    actions: [
      {
        label: 'Close',
        class: 'btn-secondary',
        onClick: () => Modal.close('credentialModal')
      }
    ]
  });

  // Wire buttons inside modal
  document.getElementById('btnSaveRfid')?.addEventListener('click', async () => {
    const cardUid = document.getElementById('cardUidInput')?.value.trim();
    if (!cardUid) {
      toast.show('Please enter a valid card UID.', 'warning');
      return;
    }
    try {
      await usersApi.assignRfidCard(userId, cardUid);
      toast.show(`RFID card "${cardUid.toUpperCase()}" assigned to ${userName}.`, 'success');
      Modal.close('credentialModal');
      loadUsers();
    } catch (err) {
      toast.show('Failed to assign card: ' + (err.message || 'Error'), 'error');
    }
  });

  document.getElementById('btnRotateQr')?.addEventListener('click', async () => {
    try {
      const res = await usersApi.rotateQrToken(userId);
      const display = document.getElementById('qrTokenDisplay');
      if (display) {
        display.textContent = `Active Token: ${res.token} (Expires in 30 days)`;
      }
      toast.show('Digital QR token regenerated successfully.', 'success');
    } catch (err) {
      toast.show('Failed to rotate QR token: ' + (err.message || 'Error'), 'error');
    }
  });
}

/**
 * Opens Add New User Modal
 */
function openCreateUserModal() {
  const sectionOptions = sectionsList.map(s => `<option value="${s.id}">${s.name} (${s.program_code})</option>`).join('');

  const content = `
    <div style="display:flex; flex-direction:column; gap:14px;">
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
        <div>
          <label style="display:block; font-size:12px; font-weight:600; margin-bottom:4px; color:var(--text-1);">First Name</label>
          <input type="text" id="newFirstName" class="input-field" style="width:100%;" placeholder="e.g. John">
        </div>
        <div>
          <label style="display:block; font-size:12px; font-weight:600; margin-bottom:4px; color:var(--text-1);">Last Name</label>
          <input type="text" id="newLastName" class="input-field" style="width:100%;" placeholder="e.g. Reyes">
        </div>
      </div>

      <div>
        <label style="display:block; font-size:12px; font-weight:600; margin-bottom:4px; color:var(--text-1);">Institutional Email</label>
        <input type="email" id="newEmail" class="input-field" style="width:100%;" placeholder="e.g. jreyes@bcp.edu.ph">
      </div>

      <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
        <div>
          <label style="display:block; font-size:12px; font-weight:600; margin-bottom:4px; color:var(--text-1);">Role</label>
          <select id="newRole" class="select-field" style="width:100%;">
            <option value="student">Student</option>
            <option value="teacher">Teacher</option>
            <option value="admin">Administrator</option>
          </select>
        </div>
        <div>
          <label style="display:block; font-size:12px; font-weight:600; margin-bottom:4px; color:var(--text-1);">Student / Employee #</label>
          <input type="text" id="newStudentNum" class="input-field" style="width:100%;" placeholder="e.g. 2024-00109">
        </div>
      </div>

      <div id="sectionSelectGroup">
        <label style="display:block; font-size:12px; font-weight:600; margin-bottom:4px; color:var(--text-1);">Assigned Section</label>
        <select id="newSection" class="select-field" style="width:100%;">
          <option value="">None / Not Applicable</option>
          ${sectionOptions}
        </select>
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

          if (!first_name || !last_name || !email) {
            toast.show('Please provide First Name, Last Name, and Email.', 'warning');
            return;
          }

          try {
            await usersApi.createUser({
              first_name,
              last_name,
              email,
              role,
              student_number,
              section_id: role === 'student' ? section_id : null,
              status: 'active'
            });

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
