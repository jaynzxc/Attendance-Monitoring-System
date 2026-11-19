/**
 * users.js - Page controller for Super Admin User Role Hierarchy & Promotion
 * Bestlink College of the Philippines - Attendance Monitoring System (AMS)
 */

import { requireRole } from '../../lib/rbac-guard.js';
import { getSupabase } from '../../lib/supabaseClient.js';
import { toast } from '../../components/toast.js';
import { Modal } from '../../components/modal.js';

let allUsers = [];

function getRoleBadge(role) {
  const norm = role === 'teacher' ? 'faculty' : role;
  const badges = {
    super_admin: 'bg-blue-900 text-white font-bold',
    admin: 'bg-blue-100 text-blue-800',
    staff: 'bg-purple-100 text-purple-800',
    acad_official: 'bg-amber-100 text-amber-800',
    monitoring: 'bg-emerald-100 text-emerald-800',
    faculty: 'bg-indigo-100 text-indigo-800',
    student: 'bg-slate-100 text-slate-700'
  };
  const labels = {
    super_admin: 'Super Admin',
    admin: 'Admin',
    staff: 'Staff',
    acad_official: 'Acad Official',
    monitoring: 'Monitoring',
    faculty: 'Faculty',
    student: 'Student'
  };

  const cls = badges[norm] || 'bg-slate-100 text-slate-600';
  const lbl = labels[norm] || norm;
  return `<span class="inline-block px-2 py-0.5 rounded text-[11px] font-semibold ${cls}">${lbl}</span>`;
}

async function loadUsers() {
  const sb = getSupabase();
  if (!sb) return;

  const { data, error } = await sb
    .from('users')
    .select('id, first_name, last_name, email, role, status, student_number, employee_number, created_at')
    .order('created_at', { ascending: false });

  if (error) {
    toast.show('Failed to load users: ' + error.message, 'error');
    return;
  }

  allUsers = data || [];
  renderUsersTable();
}

function renderUsersTable() {
  const tbody = document.getElementById('usersTableBody');
  const search = document.getElementById('userSearchInput')?.value.toLowerCase().trim() || '';
  const roleFilter = document.getElementById('userRoleFilter')?.value || '';

  const filtered = allUsers.filter(u => {
    const normRole = u.role === 'teacher' ? 'faculty' : u.role;
    if (roleFilter && normRole !== roleFilter && u.role !== roleFilter) return false;

    if (search) {
      const fullName = `${u.first_name || ''} ${u.last_name || ''}`.toLowerCase();
      const email = (u.email || '').toLowerCase();
      const idNum = (u.student_number || u.employee_number || '').toLowerCase();
      return fullName.includes(search) || email.includes(search) || idNum.includes(search);
    }
    return true;
  });

  document.getElementById('userCountText').textContent = `Showing ${filtered.length} of ${allUsers.length} accounts`;

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="py-8 text-center text-slate-400">No users match your criteria.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(u => {
    const fullName = `${u.first_name || ''} ${u.last_name || ''}`.trim() || 'Unnamed';
    const idNum = u.student_number || u.employee_number || '--';
    const isActive = u.status === 'active';
    const dateStr = u.created_at ? new Date(u.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '--';

    return `
      <tr class="hover:bg-slate-50 transition-colors">
        <td class="py-3 px-4 font-medium text-slate-800">${fullName}</td>
        <td class="py-3 px-4 text-slate-600 font-mono text-[11px]">${u.email || '--'}</td>
        <td class="py-3 px-4 text-slate-600 font-mono tabular-nums">${idNum}</td>
        <td class="py-3 px-4">${getRoleBadge(u.role)}</td>
        <td class="py-3 px-4">
          <span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold ${isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}">
            <span class="w-1.5 h-1.5 rounded-full ${isActive ? 'bg-emerald-500' : 'bg-rose-500'}"></span>
            ${isActive ? 'Active' : 'Deactivated'}
          </span>
        </td>
        <td class="py-3 px-4 text-slate-500 text-[11px] tabular-nums">${dateStr}</td>
        <td class="py-3 px-4 text-right space-x-1.5">
          <button class="px-2 py-1 text-xs font-semibold rounded bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors" data-action="promote" data-id="${u.id}">
            Modify Role
          </button>
          <button class="px-2 py-1 text-xs font-semibold rounded ${isActive ? 'bg-rose-50 text-rose-700 hover:bg-rose-100' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'} transition-colors" data-action="toggle-status" data-id="${u.id}">
            ${isActive ? 'Deactivate' : 'Activate'}
          </button>
        </td>
      </tr>
    `;
  }).join('');

  // Bind actions
  tbody.querySelectorAll('button[data-action="promote"]').forEach(btn => {
    btn.addEventListener('click', () => openModifyRoleModal(btn.dataset.id));
  });

  tbody.querySelectorAll('button[data-action="toggle-status"]').forEach(btn => {
    btn.addEventListener('click', () => toggleUserStatus(btn.dataset.id));
  });
}

function openModifyRoleModal(userId) {
  const user = allUsers.find(u => u.id === userId);
  if (!user) return;

  const currentRole = user.role === 'teacher' ? 'faculty' : user.role;

  const content = `
    <div class="space-y-4">
      <div>
        <div class="text-xs text-slate-500">User Account</div>
        <div class="text-sm font-bold text-slate-800">${user.first_name} ${user.last_name} (${user.email})</div>
      </div>
      <div>
        <label class="block text-xs font-medium text-slate-700 mb-1">Assign Institutional Role</label>
        <select id="selectNewRole" class="w-full text-xs p-2.5 rounded-lg border border-slate-200">
          <option value="super_admin" ${currentRole === 'super_admin' ? 'selected' : ''}>Super Admin (System Owner)</option>
          <option value="admin" ${currentRole === 'admin' ? 'selected' : ''}>Admin (College Registrar)</option>
          <option value="staff" ${currentRole === 'staff' ? 'selected' : ''}>Staff (Clerical Workbench)</option>
          <option value="acad_official" ${currentRole === 'acad_official' ? 'selected' : ''}>Acad Official (Deans / Program Heads)</option>
          <option value="monitoring" ${currentRole === 'monitoring' ? 'selected' : ''}>Monitoring (Roving Room Checker)</option>
          <option value="faculty" ${currentRole === 'faculty' ? 'selected' : ''}>Faculty (Classroom Instructor)</option>
          <option value="student" ${currentRole === 'student' ? 'selected' : ''}>Student</option>
        </select>
        <p class="text-[11px] text-slate-500 mt-1.5">Changing the role updates database Row-Level Security permissions and portal routing immediately.</p>
      </div>
    </div>
  `;

  Modal.open({
    id: 'modifyRoleModal',
    title: 'Modify Institutional Role',
    content,
    actions: [
      { label: 'Cancel', class: 'btn-secondary', onClick: () => Modal.close('modifyRoleModal') },
      {
        label: 'Update Role',
        class: 'btn-primary',
        onClick: async () => {
          const newRole = document.getElementById('selectNewRole')?.value;
          if (!newRole) return;

          const sb = getSupabase();
          const { error } = await sb
            .from('users')
            .update({ role: newRole })
            .eq('id', user.id);

          if (error) {
            toast.show('Failed to update role: ' + error.message, 'error');
            return;
          }

          toast.show(`Role for ${user.first_name} updated to ${newRole}.`, 'success');
          Modal.close('modifyRoleModal');
          loadUsers();
        }
      }
    ]
  });
}

async function toggleUserStatus(userId) {
  const user = allUsers.find(u => u.id === userId);
  if (!user) return;

  const nextStatus = user.status === 'active' ? 'inactive' : 'active';
  const sb = getSupabase();

  const { error } = await sb
    .from('users')
    .update({ status: nextStatus })
    .eq('id', user.id);

  if (error) {
    toast.show('Failed to change status: ' + error.message, 'error');
    return;
  }

  toast.show(`User ${user.first_name} ${user.last_name} set to ${nextStatus}.`, 'success');
  loadUsers();
}

function openCreateUserModal() {
  const content = `
    <div class="space-y-3">
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="block text-xs font-medium text-slate-700 mb-1">First Name</label>
          <input type="text" id="newFirstName" class="w-full text-xs p-2 rounded-lg border border-slate-200" placeholder="e.g. Maria" />
        </div>
        <div>
          <label class="block text-xs font-medium text-slate-700 mb-1">Last Name</label>
          <input type="text" id="newLastName" class="w-full text-xs p-2 rounded-lg border border-slate-200" placeholder="e.g. Santos" />
        </div>
      </div>
      <div>
        <label class="block text-xs font-medium text-slate-700 mb-1">Login Email</label>
        <input type="email" id="newEmail" class="w-full text-xs p-2 rounded-lg border border-slate-200" placeholder="e.g. user@bcp.edu.ph" />
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="block text-xs font-medium text-slate-700 mb-1">Institutional Role</label>
          <select id="newRole" class="w-full text-xs p-2 rounded-lg border border-slate-200">
            <option value="super_admin">Super Admin</option>
            <option value="admin">Admin (Registrar)</option>
            <option value="staff">Staff (Clerical)</option>
            <option value="acad_official">Acad Official (Dean)</option>
            <option value="monitoring">Monitoring (Proctor)</option>
            <option value="faculty">Faculty (Teacher)</option>
            <option value="student">Student</option>
          </select>
        </div>
        <div>
          <label class="block text-xs font-medium text-slate-700 mb-1">ID / Employee No.</label>
          <input type="text" id="newIdNumber" class="w-full text-xs p-2 rounded-lg border border-slate-200 font-mono" placeholder="e.g. EMP-2026-001" />
        </div>
      </div>
    </div>
  `;

  Modal.open({
    id: 'createUserModal',
    title: 'Provision New Institutional User',
    content,
    actions: [
      { label: 'Cancel', class: 'btn-secondary', onClick: () => Modal.close('createUserModal') },
      {
        label: 'Create Account',
        class: 'btn-primary',
        onClick: async () => {
          const first_name = document.getElementById('newFirstName')?.value.trim();
          const last_name = document.getElementById('newLastName')?.value.trim();
          const email = document.getElementById('newEmail')?.value.trim();
          const role = document.getElementById('newRole')?.value;
          const idNum = document.getElementById('newIdNumber')?.value.trim();

          if (!first_name || !last_name || !email) {
            toast.show('Please fill in required fields.', 'warning');
            return;
          }

          try {
            const sb = getSupabase();
            const payload = {
              first_name,
              last_name,
              email,
              role,
              status: 'active',
              student_number: role === 'student' ? idNum : null,
              employee_number: role !== 'student' ? idNum : null
            };

            const { error } = await sb.from('users').insert(payload);
            if (error) throw error;

            toast.show(`Account for ${first_name} created successfully!`, 'success');
            Modal.close('createUserModal');
            loadUsers();
          } catch (err) {
            toast.show('Creation error: ' + err.message, 'error');
          }
        }
      }
    ]
  });
}

function initLayoutControls() {
  const sidebar = document.querySelector('.sidebar');
  const backdrop = document.getElementById('sidebarBackdrop');
  const toggleBtn = document.getElementById('sidebarToggle');

  toggleBtn?.addEventListener('click', () => {
    sidebar?.classList.toggle('open');
    backdrop?.classList.toggle('open');
  });

  backdrop?.addEventListener('click', () => {
    sidebar?.classList.remove('open');
    backdrop?.classList.remove('open');
  });

  const themeBtn = document.getElementById('themeToggleBtn');
  themeBtn?.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme') || 'light';
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('ams_theme', next);
  });
}

async function init() {
  await requireRole('super_admin');
  initLayoutControls();

  document.getElementById('userSearchInput')?.addEventListener('input', renderUsersTable);
  document.getElementById('userRoleFilter')?.addEventListener('change', renderUsersTable);
  document.getElementById('btnCreateUser')?.addEventListener('click', openCreateUserModal);

  loadUsers();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
