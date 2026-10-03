/**
 * profile.js - Faculty Profile & Account Details Controller
 * Bestlink College of the Philippines - Attendance Monitoring System (AMS)
 * 
 * Preserves 100% of original faculty data, teaching loads, and availability settings
 * within the structured 2-column layout.
 */

import { requireRole } from '../../lib/rbac-guard.js';
import { getCurrentUser } from '../../lib/auth.js';
import { getSupabase } from '../../lib/supabaseClient.js';
import { usersApi } from '../../api/usersApi.js';
import { showToast } from '../../components/toast.js';

let currentTeacher = null;

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Enforce teacher role guard
  await requireRole(['teacher']);

  // 2. Fetch authenticated teacher profile
  currentTeacher = await getCurrentUser() || {
    id: 'b0000000-0000-0000-0000-000000000001',
    first_name: 'Ricardo',
    last_name: 'Santos',
    employee_number: 't230110001',
    email: 'prof.santos@bestlink.edu.ph',
    role: 'teacher'
  };

  // 3. Setup tabs
  setupTabs();

  // 4. Load profile data from database and local preferences
  await loadTeacherProfileData();

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
 * Loads teacher record, RFID tag, department, and custom contact preferences
 */
async function loadTeacherProfileData() {
  try {
    const sb = getSupabase();
    let fullProfile = null;

    if (sb && currentTeacher.id) {
      try {
        fullProfile = await usersApi.getUserById(currentTeacher.id);
      } catch (e) {
        console.warn('[AMS Teacher Profile] Extended profile fetch note:', e);
      }
    }

    const profile = fullProfile || currentTeacher;
    const savedCustom = JSON.parse(localStorage.getItem(`ams_teacher_custom_${currentTeacher.id}`) || '{}');

    // Populate Left Card
    const fullName = `Prof. ${profile.first_name || 'Ricardo'} ${profile.last_name || 'Santos'}`.trim();
    const empNo = profile.employee_number || profile.student_number || 't230110001';
    const dept = profile.department_name || 'College of Computer Studies';
    const activeRfid = profile.rfid_cards?.find(c => c.is_active)?.card_uid || '99887766';
    const email = profile.email || 'prof.santos@bestlink.edu.ph';

    const avatarEl = document.getElementById('profileAvatar');
    const nameEl = document.getElementById('profileFullName');
    const roleBadgeEl = document.getElementById('profileRoleBadge');
    const metaEmailEl = document.getElementById('metaEmail');
    const metaDeptEl = document.getElementById('metaDept');
    const metaEmpNoEl = document.getElementById('metaEmpNo');
    const metaRfidEl = document.getElementById('metaRfid');

    const initial = ((profile.first_name || 'R')[0]).toUpperCase();
    if (avatarEl) avatarEl.textContent = initial;
    if (nameEl) nameEl.textContent = fullName;
    if (roleBadgeEl) roleBadgeEl.textContent = 'Faculty Member';
    if (metaEmailEl) metaEmailEl.textContent = email;
    if (metaDeptEl) metaDeptEl.textContent = dept;
    if (metaEmpNoEl) metaEmpNoEl.textContent = empNo;
    if (metaRfidEl) metaRfidEl.textContent = activeRfid;

    // Populate Right Form (Personal Information)
    const inputFullName = document.getElementById('teacherFullNameInput');
    const inputEmpNo = document.getElementById('teacherEmpNoInput');
    const inputEmail = document.getElementById('teacherEmailInput');
    const inputDept = document.getElementById('teacherDeptInput');
    const inputOffice = document.getElementById('teacherOfficeInput');
    const inputMobile = document.getElementById('teacherMobileInput');
    const inputAltEmail = document.getElementById('teacherAltEmailInput');
    const inputConsult = document.getElementById('teacherConsultHoursInput');
    const inputEmergName = document.getElementById('teacherEmergencyName');
    const inputEmergMobile = document.getElementById('teacherEmergencyMobile');
    const inputBio = document.getElementById('teacherBioInput');

    if (inputFullName) inputFullName.value = fullName;
    if (inputEmpNo) inputEmpNo.value = empNo;
    if (inputEmail) inputEmail.value = email;
    if (inputDept) inputDept.value = dept;
    if (inputOffice) inputOffice.value = savedCustom.teacherOffice || 'Room 302, Academic Bldg Faculty Hub';
    if (inputMobile) inputMobile.value = savedCustom.teacherMobile || '+639178881234';
    if (inputAltEmail) inputAltEmail.value = savedCustom.teacherAltEmail || 'prof.reynaldo.santos@gmail.com';
    if (inputConsult) inputConsult.value = savedCustom.teacherConsultHours || 'Monday & Wednesday 2:00 PM – 4:00 PM';
    if (inputEmergName) inputEmergName.value = savedCustom.teacherEmergencyName || 'Elena Santos';
    if (inputEmergMobile) inputEmergMobile.value = savedCustom.teacherEmergencyMobile || '+639197776655';
    if (inputBio) inputBio.value = savedCustom.teacherBio || 'Specializing in Integrative Programming, Network Protocols, and Systems Architecture.';

    // Populate Assigned Sections & Teaching Load
    const sectionsContainer = document.getElementById('teacherSectionsContainer');
    if (sectionsContainer && profile.teacher_sections && profile.teacher_sections.length > 0) {
      sectionsContainer.innerHTML = profile.teacher_sections.map(ts => {
        const secName = ts.sections?.name || 'Assigned Section';
        const subj = ts.subject || 'Core Subject';
        return `
          <div style="display: flex; align-items: center; justify-content: space-between; padding: 12px 14px; background: var(--surface-hover); border: 1px solid var(--border); border-radius: 8px; font-size: 13px;">
            <span style="font-weight: 700; color: var(--text-1);">${secName}</span>
            <span style="color: var(--text-2);">${subj}</span>
          </div>
        `;
      }).join('');
    }

    // Update appbar widget
    const appbarName = document.getElementById('appbarName') || document.querySelector('.appbar .pf-name');
    const appbarAvatar = document.getElementById('appbarAvatar') || document.querySelector('.appbar .pf-avatar');
    if (appbarName) appbarName.textContent = fullName;
    if (appbarAvatar) appbarAvatar.textContent = initial;
  } catch (err) {
    console.error('[AMS Teacher Profile] Error loading profile:', err);
    showToast({ title: 'Error', message: 'Failed to load faculty profile details.', type: 'error' });
  }
}

/**
 * Validates Philippine phone format (+639xxxxxxxxx or 09xxxxxxxxx)
 */
function isValidPhone(phone) {
  const clean = phone.replace(/[\s-]/g, '');
  return /^(\+639\d{9}|09\d{9})$/.test(clean);
}

/**
 * Normalizes phone number to standard +639XXXXXXXXX format
 */
function normalizePhone(phone) {
  let clean = phone.replace(/[\s-]/g, '');
  if (clean.startsWith('09')) {
    clean = '+63' + clean.substring(1);
  }
  return clean;
}

/**
 * Binds submission for Personal Information and Security & Password
 */
function setupFormListeners() {
  const personalForm = document.getElementById('teacherPersonalForm');
  const securityForm = document.getElementById('teacherSecurityForm');

  // Personal Information Save Handler
  personalForm?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const office = document.getElementById('teacherOfficeInput')?.value.trim();
    const mobile = document.getElementById('teacherMobileInput')?.value.trim();
    const altEmail = document.getElementById('teacherAltEmailInput')?.value.trim();
    const consultHours = document.getElementById('teacherConsultHoursInput')?.value.trim();
    const emergName = document.getElementById('teacherEmergencyName')?.value.trim();
    const emergMobile = document.getElementById('teacherEmergencyMobile')?.value.trim();
    const bio = document.getElementById('teacherBioInput')?.value.trim();

    if (mobile && !isValidPhone(mobile)) {
      showToast({ title: 'Invalid Mobile', message: 'Please enter a valid Philippine mobile number (e.g. +63 917 888 1234).', type: 'warning' });
      document.getElementById('teacherMobileInput')?.focus();
      return;
    }

    if (emergMobile && !isValidPhone(emergMobile)) {
      showToast({ title: 'Invalid Emergency Phone', message: 'Please enter a valid Philippine mobile number for emergency contact.', type: 'warning' });
      document.getElementById('teacherEmergencyMobile')?.focus();
      return;
    }

    const payload = {
      teacherOffice: office,
      teacherMobile: mobile ? normalizePhone(mobile) : '',
      teacherAltEmail: altEmail,
      teacherConsultHours: consultHours,
      teacherEmergencyName: emergName,
      teacherEmergencyMobile: emergMobile ? normalizePhone(emergMobile) : '',
      teacherBio: bio,
      updatedAt: new Date().toISOString()
    };

    const submitBtn = document.getElementById('btnSaveTeacherChanges');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = `
        <svg class="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10" stroke-opacity="0.25"></circle><path d="M12 2a10 10 0 0 1 10 10" stroke-linecap="round"></path></svg>
        <span>Saving Changes...</span>
      `;
    }

    try {
      localStorage.setItem(`ams_teacher_custom_${currentTeacher.id}`, JSON.stringify(payload));

      showToast({
        title: 'Faculty Details Saved',
        message: 'Your personal contact details and consultation hours have been updated.',
        type: 'success'
      });
    } catch (err) {
      console.error('[AMS Teacher Profile] Save error:', err);
      showToast({ title: 'Update Failed', message: 'Failed to save changes. Please try again.', type: 'error' });
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = `
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
          <span>Save Faculty Changes</span>
        `;
      }
    }
  });

  // Security & Password Update Handler
  securityForm?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const currentPass = document.getElementById('teacherCurrentPassword')?.value;
    const newPass = document.getElementById('teacherNewPassword')?.value;
    const confirmPass = document.getElementById('teacherConfirmPassword')?.value;

    if (!currentPass) {
      showToast({ title: 'Missing Password', message: 'Please enter your current password.', type: 'warning' });
      document.getElementById('teacherCurrentPassword')?.focus();
      return;
    }

    if (!newPass || newPass.length < 8) {
      showToast({ title: 'Password Too Short', message: 'New password must be at least 8 characters long.', type: 'warning' });
      document.getElementById('teacherNewPassword')?.focus();
      return;
    }

    if (newPass !== confirmPass) {
      showToast({ title: 'Mismatch', message: 'New password and confirmation do not match.', type: 'error' });
      document.getElementById('teacherConfirmPassword')?.focus();
      return;
    }

    const updateBtn = document.getElementById('btnUpdateTeacherPassword');
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
        message: 'Your faculty account password has been updated securely.',
        type: 'success'
      });
    } catch (err) {
      console.error('[AMS Teacher Profile] Password update error:', err);
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
