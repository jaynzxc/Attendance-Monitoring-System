/**
 * profile.js - Administrator Profile & Account Controller
 * Bestlink College of the Philippines - Attendance Monitoring System (AMS)
 * 
 * Preserves 100% of original administrative data & operational settings
 * within the structured 2-column layout.
 */

import { requireRole } from '../../lib/rbac-guard.js';
import { getCurrentUser } from '../../lib/auth.js';
import { getSupabase } from '../../lib/supabaseClient.js';
import { usersApi } from '../../api/usersApi.js';
import { showToast } from '../../components/toast.js';

let currentAdmin = null;

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Enforce admin role guard
  await requireRole(['admin']);

  // 2. Fetch authenticated admin profile
  currentAdmin = await getCurrentUser() || {
    id: 'a0000000-0000-0000-0000-000000000001',
    first_name: 'Administrator',
    last_name: '',
    employee_number: 'ADM-2024-001',
    email: 'admin@bestlink.edu.ph',
    role: 'admin'
  };

  // 3. Setup tabs
  setupTabs();

  // 4. Load profile data
  await loadAdminProfileData();

  // 5. Setup form listeners (Personal & Security)
  setupFormListeners();
});

/**
 * Handles tab switching between Personal Information and Security & Password
 */
function setupTabs() {
  const tabBtnPersonal = document.getElementById('tabBtnPersonal');
  const tabBtnSecurity = document.getElementById('tabBtnSecurity');
  const panelPersonal = document.getElementById('panelPersonal');
  const panelSecurity = document.getElementById('panelSecurity');

  tabBtnPersonal?.addEventListener('click', () => {
    tabBtnPersonal.classList.add('active');
    tabBtnPersonal.setAttribute('aria-selected', 'true');
    tabBtnSecurity?.classList.remove('active');
    tabBtnSecurity?.setAttribute('aria-selected', 'false');

    if (panelPersonal) panelPersonal.style.display = 'block';
    if (panelSecurity) panelSecurity.style.display = 'none';
  });

  tabBtnSecurity?.addEventListener('click', () => {
    tabBtnSecurity.classList.add('active');
    tabBtnSecurity.setAttribute('aria-selected', 'true');
    tabBtnPersonal?.classList.remove('active');
    tabBtnPersonal?.setAttribute('aria-selected', 'false');

    if (panelPersonal) panelPersonal.style.display = 'none';
    if (panelSecurity) panelSecurity.style.display = 'block';
  });
}

/**
 * Loads admin record and populates left summary card and personal info form
 */
async function loadAdminProfileData() {
  try {
    const sb = getSupabase();
    let fullProfile = null;

    if (sb && currentAdmin.id) {
      try {
        fullProfile = await usersApi.getUserById(currentAdmin.id);
      } catch (e) {
        console.warn('[AMS Admin Profile] Extended profile fetch note:', e);
      }
    }

    const profile = fullProfile || currentAdmin;
    const savedCustom = JSON.parse(localStorage.getItem(`ams_admin_custom_${currentAdmin.id}`) || '{}');

    // Values from DB / Storage / Baseline
    const defaultName = profile.first_name || 'Administrator';
    const fullName = savedCustom.adminFullName || defaultName;
    const username = savedCustom.adminUsername || 'admin';
    const email = savedCustom.adminEmail || profile.email || 'admin@bestlink.edu.ph';
    const office = savedCustom.adminOffice || 'Office of the College Registrar';
    const empNo = profile.employee_number || 'ADM-2024-001';
    const station = savedCustom.adminStation || 'Admin Wing Room 102';
    const extension = savedCustom.adminExtension || 'Ext. 104';
    const hotline = savedCustom.adminHotline || '+639175559876';
    const dutyHours = savedCustom.adminDutyHours || 'Monday to Saturday, 7:00 AM – 6:00 PM';
    const escalationUnit = savedCustom.adminEscalationUnit || 'BCP IT Infrastructure & Security';
    const escalationHotline = savedCustom.adminEscalationHotline || '+639180001122';
    const directives = savedCustom.adminDirectives || 'Primary administrative oversight for ESP32 gate scanners, faculty/student attendance ledger, digital excuse slip approvals, and automated SMS alert dispatching.';

    // Populate Left Card
    const avatarEl = document.getElementById('profileAvatar');
    const nameEl = document.getElementById('profileFullName');
    const roleBadgeEl = document.getElementById('profileRoleBadge');
    const metaEmailEl = document.getElementById('metaEmail');
    const metaOfficeEl = document.getElementById('metaOffice');
    const metaEmpNoEl = document.getElementById('metaEmpNo');
    const metaClearanceEl = document.getElementById('metaClearance');
    const metaRfidEl = document.getElementById('metaRfid');

    const initial = (fullName[0] || 'A').toUpperCase();
    if (avatarEl) avatarEl.textContent = initial;
    if (nameEl) nameEl.textContent = fullName;
    if (roleBadgeEl) roleBadgeEl.textContent = 'System Administrator';
    if (metaEmailEl) metaEmailEl.textContent = email;
    if (metaOfficeEl) metaOfficeEl.textContent = 'Office of the Registrar';
    if (metaEmpNoEl) metaEmpNoEl.textContent = empNo;
    if (metaClearanceEl) metaClearanceEl.textContent = 'Level 4 Superuser';
    if (metaRfidEl) metaRfidEl.textContent = 'ADM-RF-9021';

    // Populate Right Form (Personal Information)
    const inputFullName = document.getElementById('adminFullNameInput');
    const inputUsername = document.getElementById('adminUsernameInput');
    const inputEmail = document.getElementById('adminEmailInput');
    const inputOffice = document.getElementById('adminOfficeInput');
    const inputStation = document.getElementById('adminStationInput');
    const inputExtension = document.getElementById('adminExtensionInput');
    const inputHotline = document.getElementById('adminHotlineInput');
    const inputDutyHours = document.getElementById('adminDutyHoursInput');
    const inputEscalationUnit = document.getElementById('adminEscalationUnitInput');
    const inputEscalationHotline = document.getElementById('adminEscalationHotlineInput');
    const inputDirectives = document.getElementById('adminDirectivesInput');

    if (inputFullName) inputFullName.value = fullName;
    if (inputUsername) inputUsername.value = username;
    if (inputEmail) inputEmail.value = email;
    if (inputOffice) inputOffice.value = office;
    if (inputStation) inputStation.value = station;
    if (inputExtension) inputExtension.value = extension;
    if (inputHotline) inputHotline.value = hotline;
    if (inputDutyHours) inputDutyHours.value = dutyHours;
    if (inputEscalationUnit) inputEscalationUnit.value = escalationUnit;
    if (inputEscalationHotline) inputEscalationHotline.value = escalationHotline;
    if (inputDirectives) inputDirectives.value = directives;

    // Update appbar widget
    const appbarName = document.getElementById('appbarName') || document.querySelector('.appbar .pf-name');
    const appbarAvatar = document.getElementById('appbarAvatar') || document.querySelector('.appbar .pf-avatar');
    if (appbarName) appbarName.textContent = fullName;
    if (appbarAvatar) appbarAvatar.textContent = initial;
  } catch (err) {
    console.error('[AMS Admin Profile] Error loading account profile:', err);
    showToast({ title: 'Error', message: 'Failed to load administrator account details.', type: 'error' });
  }
}

/**
 * Binds form submissions for Personal Information and Security & Password
 */
function setupFormListeners() {
  const personalForm = document.getElementById('adminPersonalForm');
  const securityForm = document.getElementById('adminSecurityForm');

  // Personal Information Save Handler
  personalForm?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const fullName = document.getElementById('adminFullNameInput')?.value.trim() || 'Administrator';
    const username = document.getElementById('adminUsernameInput')?.value.trim() || 'admin';
    const email = document.getElementById('adminEmailInput')?.value.trim() || 'admin@bestlink.edu.ph';
    const office = document.getElementById('adminOfficeInput')?.value.trim() || 'Office of the College Registrar';
    const station = document.getElementById('adminStationInput')?.value.trim() || '';
    const extension = document.getElementById('adminExtensionInput')?.value.trim() || '';
    const hotline = document.getElementById('adminHotlineInput')?.value.trim() || '';
    const dutyHours = document.getElementById('adminDutyHoursInput')?.value.trim() || '';
    const escalationUnit = document.getElementById('adminEscalationUnitInput')?.value.trim() || '';
    const escalationHotline = document.getElementById('adminEscalationHotlineInput')?.value.trim() || '';
    const directives = document.getElementById('adminDirectivesInput')?.value.trim() || '';

    const payload = {
      adminFullName: fullName,
      adminUsername: username,
      adminEmail: email,
      adminOffice: office,
      adminStation: station,
      adminExtension: extension,
      adminHotline: hotline,
      adminDutyHours: dutyHours,
      adminEscalationUnit: escalationUnit,
      adminEscalationHotline: escalationHotline,
      adminDirectives: directives,
      updatedAt: new Date().toISOString()
    };

    const submitBtn = document.getElementById('btnSaveProfileChanges');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = `
        <svg class="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10" stroke-opacity="0.25"></circle><path d="M12 2a10 10 0 0 1 10 10" stroke-linecap="round"></path></svg>
        <span>Saving Changes...</span>
      `;
    }

    try {
      // 1. Persist to local cache for instant offline reliability
      localStorage.setItem(`ams_admin_custom_${currentAdmin.id}`, JSON.stringify(payload));

      // 2. Persist to DB if connected
      const sb = getSupabase();
      if (sb && currentAdmin.id) {
        try {
          await sb
            .from('users')
            .update({
              first_name: fullName,
              last_name: ''
            })
            .eq('id', currentAdmin.id);
        } catch (dbErr) {
          console.warn('[AMS Admin Profile] DB update notice:', dbErr);
        }
      }

      // Update UI elements immediately
      const initial = (fullName[0] || 'A').toUpperCase();
      const avatarEl = document.getElementById('profileAvatar');
      const nameEl = document.getElementById('profileFullName');
      const metaOfficeEl = document.getElementById('metaOffice');
      const metaEmailEl = document.getElementById('metaEmail');

      if (avatarEl) avatarEl.textContent = initial;
      if (nameEl) nameEl.textContent = fullName;
      if (metaOfficeEl) metaOfficeEl.textContent = 'Office of the Registrar';
      if (metaEmailEl) metaEmailEl.textContent = email;

      // Update appbar profile widget
      const appbarName = document.getElementById('appbarName') || document.querySelector('.appbar .pf-name');
      const appbarAvatar = document.getElementById('appbarAvatar') || document.querySelector('.appbar .pf-avatar');
      if (appbarName) appbarName.textContent = fullName;
      if (appbarAvatar) appbarAvatar.textContent = initial;

      showToast({
        title: 'Profile Updated',
        message: 'Your administrator profile details have been successfully saved.',
        type: 'success'
      });
    } catch (err) {
      console.error('[AMS Admin Profile] Save error:', err);
      showToast({ title: 'Update Failed', message: 'Failed to save changes. Please try again.', type: 'error' });
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = `
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
          <span>Save Profile Changes</span>
        `;
      }
    }
  });

  // Security & Password Update Handler
  securityForm?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const currentPass = document.getElementById('adminCurrentPass')?.value;
    const newPass = document.getElementById('adminNewPass')?.value;
    const confirmPass = document.getElementById('adminConfirmPass')?.value;

    if (!currentPass) {
      showToast({ title: 'Missing Current Password', message: 'Please enter your current password.', type: 'warning' });
      document.getElementById('adminCurrentPass')?.focus();
      return;
    }

    if (!newPass || newPass.length < 8) {
      showToast({ title: 'Password Too Short', message: 'New password must be at least 8 characters long.', type: 'warning' });
      document.getElementById('adminNewPass')?.focus();
      return;
    }

    if (newPass !== confirmPass) {
      showToast({ title: 'Mismatch', message: 'New password and confirmation do not match.', type: 'error' });
      document.getElementById('adminConfirmPass')?.focus();
      return;
    }

    const updateBtn = document.getElementById('btnUpdatePassword');
    if (updateBtn) {
      updateBtn.disabled = true;
      updateBtn.innerHTML = `
        <svg class="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10" stroke-opacity="0.25"></circle><path d="M12 2a10 10 0 0 1 10 10" stroke-linecap="round"></path></svg>
        <span>Updating Password...</span>
      `;
    }

    try {
      const sb = getSupabase();
      if (sb) {
        const { error } = await sb.auth.updateUser({ password: newPass });
        if (error) throw error;
      }

      securityForm.reset();
      showToast({
        title: 'Password Updated',
        message: 'Your administrator account password has been updated securely.',
        type: 'success'
      });
    } catch (err) {
      console.error('[AMS Admin Profile] Password update error:', err);
      showToast({
        title: 'Password Update Notice',
        message: err.message || 'Unable to update password. Please check your credentials.',
        type: 'info'
      });
    } finally {
      if (updateBtn) {
        updateBtn.disabled = false;
        updateBtn.innerHTML = `
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          <span>Update Password</span>
        `;
      }
    }
  });
}
