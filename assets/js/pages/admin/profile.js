/**
 * profile.js - Administrator Account & Operations Controller
 * Bestlink College of the Philippines - Attendance Monitoring System (AMS)
 * 
 * Enforces institutional boundaries:
 * - Admin account is an institutional role/service account, not a personal account.
 * - System-provided fields (Role, security clearance, account ID, master RFID, official email) are strictly READ-ONLY.
 * - Configurable fields (Account title, office unit, support hotline, alert email, desk location, duty window, escalation unit, directives) are editable.
 */

import { requireRole } from '../../lib/rbac-guard.js';
import { getCurrentUser } from '../../lib/auth.js';
import { getSupabase } from '../../lib/supabaseClient.js';
import { usersApi } from '../../api/usersApi.js';
import { showToast } from '../../components/toast.js';

let currentAdmin = null;
let initialFormData = {};

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Enforce admin role guard
  await requireRole(['admin']);

  // 2. Fetch authenticated admin profile
  currentAdmin = await getCurrentUser() || {
    id: 'a0000000-0000-0000-0000-000000000001',
    first_name: 'Administrator',
    last_name: '',
    employee_number: 'ADM-2024-001',
    email: 'admin@bcp.edu.ph',
    role: 'admin'
  };

  // 3. Load profile data from database and local preferences
  await loadAdminProfileData();

  // 4. Setup form listeners
  setupFormListeners();
});

/**
 * Loads admin record, security tokens, and operational parameters
 */
async function loadAdminProfileData() {
  try {
    const sb = getSupabase();
    let fullProfile = null;

    if (sb && currentAdmin.id) {
      try {
        fullProfile = await usersApi.getUserById(currentAdmin.id);
      } catch (e) {
        console.warn('[AMS Admin Profile] Extended profile fetch failed, using session profile:', e);
      }
    }

    const profile = fullProfile || currentAdmin;
    const savedCustom = JSON.parse(localStorage.getItem(`ams_admin_custom_${currentAdmin.id}`) || '{}');

    // Title resolution (defaults to Administrator)
    const rawFirst = profile.first_name || '';
    const isGenericOrOld = !rawFirst || rawFirst === 'Elena' || rawFirst === 'Rosario';
    const defaultTitle = isGenericOrOld ? 'Administrator' : rawFirst;
    const accountTitle = savedCustom.adminAccountTitle !== undefined ? savedCustom.adminAccountTitle : defaultTitle;
    const officeName = savedCustom.adminOfficeName || 'Office of the College Registrar';

    const empNo = profile.employee_number || 'ADM-2024-001';
    const activeRfid = profile.rfid_cards?.find(c => c.is_active)?.card_uid || 'ADM-RF-9021';
    const email = profile.email || 'admin@bcp.edu.ph';
    const initials = 'AD';

    // Populate Banner Elements
    const bannerName = document.getElementById('bannerAdminName');
    const bannerEmp = document.getElementById('bannerAdminNo');
    const bannerStation = document.getElementById('bannerStation');
    const bannerRfid = document.getElementById('bannerRfid');
    const bannerAvatar = document.getElementById('bannerAvatar');

    if (bannerName) bannerName.textContent = accountTitle || 'Administrator';
    if (bannerEmp) bannerEmp.textContent = empNo;
    if (bannerStation) bannerStation.textContent = officeName;
    if (bannerRfid) bannerRfid.textContent = activeRfid;
    if (bannerAvatar) bannerAvatar.textContent = initials;

    // Populate Locked Institutional Fields
    const adminEmp = document.getElementById('adminEmpNo');
    const adminMail = document.getElementById('adminEmail');
    const adminRfid = document.getElementById('adminRfidUid');

    if (adminEmp) adminEmp.value = empNo;
    if (adminMail) adminMail.value = email;
    if (adminRfid) adminRfid.value = activeRfid;

    // Populate Configurable Account Fields
    const titleInput = document.getElementById('adminAccountTitle');
    const officeInput = document.getElementById('adminOfficeName');
    const hotlineInput = document.getElementById('adminSupportHotline');
    const alertEmailInput = document.getElementById('adminAlertEmail');
    const roomInput = document.getElementById('officeRoom');
    const extInput = document.getElementById('officeExtension');
    const dutyInput = document.getElementById('dutyHours');
    const escalationUnitInput = document.getElementById('escalationUnit');
    const escalationHotlineInput = document.getElementById('escalationHotline');
    const directivesInput = document.getElementById('adminDirectives');

    if (titleInput) titleInput.value = accountTitle || 'Administrator';
    if (officeInput) officeInput.value = officeName;
    if (hotlineInput) hotlineInput.value = savedCustom.adminSupportHotline || '+639175559876';
    if (alertEmailInput) alertEmailInput.value = savedCustom.adminAlertEmail || 'admin.ams@bcp.edu.ph';
    if (roomInput) roomInput.value = savedCustom.officeRoom || 'Admin Wing Room 102';
    if (extInput) extInput.value = savedCustom.officeExtension || 'Ext. 104';
    if (dutyInput) dutyInput.value = savedCustom.dutyHours || 'Monday to Saturday, 7:00 AM – 6:00 PM';
    if (escalationUnitInput) escalationUnitInput.value = savedCustom.escalationUnit || 'BCP IT Infrastructure & Security';
    if (escalationHotlineInput) escalationHotlineInput.value = savedCustom.escalationHotline || '+639180001122';
    if (directivesInput) directivesInput.value = savedCustom.adminDirectives || 'Primary administrative oversight for ESP32 gate scanners, faculty/student attendance ledger, digital excuse slip approvals, and automated SMS alert dispatching.';

    // Store baseline for Discard / Reset functionality
    captureInitialFormData();
  } catch (err) {
    console.error('[AMS Admin Profile] Error loading account profile:', err);
    showToast({ title: 'Error', message: 'Failed to load administrator account details.', type: 'error' });
  }
}

/**
 * Captures initial form data for dirty-check and reset
 */
function captureInitialFormData() {
  initialFormData = {
    adminAccountTitle: document.getElementById('adminAccountTitle')?.value || '',
    adminOfficeName: document.getElementById('adminOfficeName')?.value || '',
    adminSupportHotline: document.getElementById('adminSupportHotline')?.value || '',
    adminAlertEmail: document.getElementById('adminAlertEmail')?.value || '',
    officeRoom: document.getElementById('officeRoom')?.value || '',
    officeExtension: document.getElementById('officeExtension')?.value || '',
    dutyHours: document.getElementById('dutyHours')?.value || '',
    escalationUnit: document.getElementById('escalationUnit')?.value || '',
    escalationHotline: document.getElementById('escalationHotline')?.value || '',
    adminDirectives: document.getElementById('adminDirectives')?.value || ''
  };
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
 * Binds submission and reset actions
 */
function setupFormListeners() {
  const form = document.getElementById('adminProfileForm');
  const btnReset = document.getElementById('btnResetProfile');

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const adminAccountTitle = document.getElementById('adminAccountTitle')?.value.trim() || 'Administrator';
    const adminOfficeName = document.getElementById('adminOfficeName')?.value.trim();
    const adminSupportHotline = document.getElementById('adminSupportHotline')?.value.trim();
    const adminAlertEmail = document.getElementById('adminAlertEmail')?.value.trim();
    const officeRoom = document.getElementById('officeRoom')?.value.trim();
    const officeExtension = document.getElementById('officeExtension')?.value.trim();
    const dutyHours = document.getElementById('dutyHours')?.value.trim();
    const escalationUnit = document.getElementById('escalationUnit')?.value.trim();
    const escalationHotline = document.getElementById('escalationHotline')?.value.trim();
    const adminDirectives = document.getElementById('adminDirectives')?.value.trim();

    // Validation
    if (!adminAccountTitle) {
      showToast({ title: 'Title Required', message: 'Please specify an administrator account title.', type: 'warning' });
      document.getElementById('adminAccountTitle')?.focus();
      return;
    }

    if (adminSupportHotline && !isValidPhone(adminSupportHotline)) {
      showToast({ title: 'Invalid Phone Number', message: 'Please enter a valid support phone number (e.g. +63 917 555 9876).', type: 'warning' });
      document.getElementById('adminSupportHotline')?.focus();
      return;
    }

    if (escalationHotline && !isValidPhone(escalationHotline)) {
      showToast({ title: 'Invalid Escalation Phone', message: 'Please enter a valid phone number for technical escalation (e.g. +63 918 000 1122).', type: 'warning' });
      document.getElementById('escalationHotline')?.focus();
      return;
    }

    const payload = {
      adminAccountTitle,
      adminOfficeName,
      adminSupportHotline: adminSupportHotline ? normalizePhone(adminSupportHotline) : '',
      adminAlertEmail,
      officeRoom,
      officeExtension,
      dutyHours,
      escalationUnit,
      escalationHotline: escalationHotline ? normalizePhone(escalationHotline) : '',
      adminDirectives,
      updatedAt: new Date().toISOString()
    };

    const submitBtn = document.getElementById('btnSaveProfile');
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
              first_name: adminAccountTitle,
              last_name: ''
            })
            .eq('id', currentAdmin.id);
        } catch (dbErr) {
          console.warn('[AMS Admin Profile] DB update non-fatal notice:', dbErr);
        }
      }

      // Update banner immediately
      const bannerName = document.getElementById('bannerAdminName');
      const bannerStation = document.getElementById('bannerStation');
      const bannerAvatar = document.getElementById('bannerAvatar');
      const initials = 'AD';

      if (bannerName) bannerName.textContent = adminAccountTitle;
      if (bannerStation && adminOfficeName) bannerStation.textContent = adminOfficeName;
      if (bannerAvatar) bannerAvatar.textContent = initials;

      // Update appbar profile widget
      const appbarName = document.querySelector('.appbar .pf-name');
      const appbarAvatar = document.querySelector('.appbar .pf-avatar');
      if (appbarName) appbarName.textContent = adminAccountTitle;
      if (appbarAvatar) appbarAvatar.textContent = initials;

      captureInitialFormData();

      showToast({
        title: 'Account Settings Saved',
        message: 'Administrator operational parameters, support contacts, and desk details have been updated.',
        type: 'success'
      });
    } catch (err) {
      console.error('[AMS Admin Profile] Save error:', err);
      showToast({ title: 'Update Failed', message: 'Failed to save changes. Please try again.', type: 'error' });
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = `
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
            <polyline points="17 21 17 13 7 13 7 21"/>
            <polyline points="7 3 7 8 15 8"/>
          </svg>
          <span>Save Account Details</span>
        `;
      }
    }
  });

  // Discard / Reset handler
  btnReset?.addEventListener('click', () => {
    if (document.getElementById('adminAccountTitle')) document.getElementById('adminAccountTitle').value = initialFormData.adminAccountTitle || 'Administrator';
    if (document.getElementById('adminOfficeName')) document.getElementById('adminOfficeName').value = initialFormData.adminOfficeName || 'Office of the College Registrar';
    if (document.getElementById('adminSupportHotline')) document.getElementById('adminSupportHotline').value = initialFormData.adminSupportHotline || '';
    if (document.getElementById('adminAlertEmail')) document.getElementById('adminAlertEmail').value = initialFormData.adminAlertEmail || '';
    if (document.getElementById('officeRoom')) document.getElementById('officeRoom').value = initialFormData.officeRoom || '';
    if (document.getElementById('officeExtension')) document.getElementById('officeExtension').value = initialFormData.officeExtension || '';
    if (document.getElementById('dutyHours')) document.getElementById('dutyHours').value = initialFormData.dutyHours || '';
    if (document.getElementById('escalationUnit')) document.getElementById('escalationUnit').value = initialFormData.escalationUnit || '';
    if (document.getElementById('escalationHotline')) document.getElementById('escalationHotline').value = initialFormData.escalationHotline || '';
    if (document.getElementById('adminDirectives')) document.getElementById('adminDirectives').value = initialFormData.adminDirectives || '';

    showToast({ title: 'Changes Discarded', message: 'Form values restored to previous settings.', type: 'info', duration: 2500 });
  });
}
