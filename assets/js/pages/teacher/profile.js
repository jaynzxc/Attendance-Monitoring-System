/**
 * profile.js - Faculty Profile & Account Details Controller
 * Bestlink College of the Philippines - Attendance Monitoring System (AMS)
 * 
 * Enforces security & institutional boundaries:
 * - Admin-provided fields (Legal name, employee number, department, RFID UID, official email) are strictly READ-ONLY.
 * - Self-service fields (Personal mobile, alternate email, consultation schedule, office location, emergency contact, bio) are editable.
 */

import { requireRole } from '../../lib/rbac-guard.js';
import { getCurrentUser } from '../../lib/auth.js';
import { getSupabase } from '../../lib/supabaseClient.js';
import { usersApi } from '../../api/usersApi.js';
import { showToast } from '../../components/toast.js';

let currentTeacher = null;
let initialFormData = {};

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Enforce teacher role guard
  await requireRole(['teacher']);

  // 2. Fetch authenticated teacher profile
  currentTeacher = await getCurrentUser() || {
    id: 'b0000000-0000-0000-0000-000000000001',
    first_name: 'Reynaldo',
    last_name: 'Santos',
    employee_number: 'EMP-2024-0089',
    email: 'r.santos@bcp.edu.ph',
    role: 'teacher'
  };

  // 3. Load profile data from database and local preferences
  await loadTeacherProfileData();

  // 4. Setup form listeners
  setupFormListeners();
});

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
        console.warn('[AMS Teacher Profile] Could not fetch extended user profile from DB, using session profile:', e);
      }
    }

    // Merge session with DB profile
    const profile = fullProfile || currentTeacher;

    // Populate Banner Elements
    const fullName = `Prof. ${profile.first_name || 'Reynaldo'} ${profile.last_name || 'Santos'}`.trim();
    const empNo = profile.employee_number || 'EMP-2024-0089';
    const dept = profile.department_name || 'College of Computer Studies';
    const activeRfid = profile.rfid_cards?.find(c => c.is_active)?.card_uid || 'A4B82194';
    const email = profile.email || 'r.santos@bcp.edu.ph';
    const initials = `${(profile.first_name || 'R')[0]}${(profile.last_name || 'S')[0]}`.toUpperCase();

    const bannerName = document.getElementById('bannerTeacherName');
    const bannerEmp = document.getElementById('bannerEmpNo');
    const bannerDept = document.getElementById('bannerDept');
    const bannerRfid = document.getElementById('bannerRfid');
    const bannerAvatar = document.getElementById('bannerAvatar');

    if (bannerName) bannerName.textContent = fullName;
    if (bannerEmp) bannerEmp.textContent = empNo;
    if (bannerDept) bannerDept.textContent = dept;
    if (bannerRfid) bannerRfid.textContent = activeRfid;
    if (bannerAvatar) bannerAvatar.textContent = initials;

    // Populate Locked Admin Fields
    const adminFirst = document.getElementById('adminFirstName');
    const adminLast = document.getElementById('adminLastName');
    const adminEmp = document.getElementById('adminEmpNo');
    const adminDepartment = document.getElementById('adminDept');
    const adminMail = document.getElementById('adminEmail');
    const adminRfid = document.getElementById('adminRfidUid');

    if (adminFirst) adminFirst.value = profile.first_name || 'Reynaldo';
    if (adminLast) adminLast.value = profile.last_name || 'Santos';
    if (adminEmp) adminEmp.value = empNo;
    if (adminDepartment) adminDepartment.value = `${dept} — IT Department`;
    if (adminMail) adminMail.value = email;
    if (adminRfid) adminRfid.value = activeRfid;

    // Populate Editable Self-Service Fields (Check local storage cache first)
    const savedCustom = JSON.parse(localStorage.getItem(`ams_teacher_custom_${currentTeacher.id}`) || '{}');

    const teacherMobile = document.getElementById('teacherMobile');
    const teacherAltEmail = document.getElementById('teacherAltEmail');
    const consultationHours = document.getElementById('consultationHours');
    const officeLocation = document.getElementById('officeLocation');
    const emergencyName = document.getElementById('emergencyName');
    const emergencyMobile = document.getElementById('emergencyMobile');
    const teachingBio = document.getElementById('teachingBio');

    if (teacherMobile) teacherMobile.value = savedCustom.teacherMobile || '+639178881234';
    if (teacherAltEmail) teacherAltEmail.value = savedCustom.teacherAltEmail || 'prof.reynaldo.santos@gmail.com';
    if (consultationHours) consultationHours.value = savedCustom.consultationHours || 'Monday & Wednesday 2:00 PM – 4:00 PM';
    if (officeLocation) officeLocation.value = savedCustom.officeLocation || 'Room 302, Academic Bldg Faculty Hub';
    if (emergencyName) emergencyName.value = savedCustom.emergencyName || 'Elena Santos';
    if (emergencyMobile) emergencyMobile.value = savedCustom.emergencyMobile || '+639197776655';
    if (teachingBio) teachingBio.value = savedCustom.teachingBio || 'Specializing in Integrative Programming, Network Protocols, and Systems Architecture.';

    // Store baseline for Discard / Reset functionality
    captureInitialFormData();
  } catch (err) {
    console.error('[AMS Teacher Profile] Error loading profile:', err);
    showToast({ title: 'Error', message: 'Failed to load some profile details.', type: 'error' });
  }
}

/**
 * Captures initial form data for dirty-check and reset
 */
function captureInitialFormData() {
  initialFormData = {
    teacherMobile: document.getElementById('teacherMobile')?.value || '',
    teacherAltEmail: document.getElementById('teacherAltEmail')?.value || '',
    consultationHours: document.getElementById('consultationHours')?.value || '',
    officeLocation: document.getElementById('officeLocation')?.value || '',
    emergencyName: document.getElementById('emergencyName')?.value || '',
    emergencyMobile: document.getElementById('emergencyMobile')?.value || '',
    teachingBio: document.getElementById('teachingBio')?.value || ''
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
  const form = document.getElementById('teacherProfileForm');
  const btnReset = document.getElementById('btnResetProfile');

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const teacherMobile = document.getElementById('teacherMobile')?.value.trim();
    const teacherAltEmail = document.getElementById('teacherAltEmail')?.value.trim();
    const consultationHours = document.getElementById('consultationHours')?.value.trim();
    const officeLocation = document.getElementById('officeLocation')?.value.trim();
    const emergencyName = document.getElementById('emergencyName')?.value.trim();
    const emergencyMobile = document.getElementById('emergencyMobile')?.value.trim();
    const teachingBio = document.getElementById('teachingBio')?.value.trim();

    // Validation
    if (!teacherMobile || !isValidPhone(teacherMobile)) {
      showToast({ title: 'Invalid Phone Number', message: 'Please enter a valid Philippine mobile number (e.g. +63 917 888 1234).', type: 'warning' });
      document.getElementById('teacherMobile')?.focus();
      return;
    }

    if (!consultationHours) {
      showToast({ title: 'Missing Schedule', message: 'Please enter your student consultation schedule.', type: 'warning' });
      document.getElementById('consultationHours')?.focus();
      return;
    }

    if (emergencyMobile && !isValidPhone(emergencyMobile)) {
      showToast({ title: 'Invalid Emergency Phone', message: 'Please enter a valid Philippine mobile number for emergency contact (e.g. +63 919 777 6655).', type: 'warning' });
      document.getElementById('emergencyMobile')?.focus();
      return;
    }

    const payload = {
      teacherMobile: normalizePhone(teacherMobile),
      teacherAltEmail,
      consultationHours,
      officeLocation,
      emergencyName,
      emergencyMobile: emergencyMobile ? normalizePhone(emergencyMobile) : '',
      teachingBio,
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
      localStorage.setItem(`ams_teacher_custom_${currentTeacher.id}`, JSON.stringify(payload));

      captureInitialFormData();

      showToast({
        title: 'Profile Updated',
        message: 'Your faculty contact, consultation hours, and profile details have been successfully saved.',
        type: 'success'
      });
    } catch (err) {
      console.error('[AMS Teacher Profile] Save error:', err);
      showToast({ title: 'Update Failed', message: 'Failed to save changes. Please try again.', type: 'error' });
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = `
          <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
            <polyline points="17 21 17 13 7 13 7 21"/>
            <polyline points="7 3 7 8 15 8"/>
          </svg>
          <span>Save Faculty Changes</span>
        `;
      }
    }
  });

  // Discard / Reset handler
  btnReset?.addEventListener('click', () => {
    if (document.getElementById('teacherMobile')) document.getElementById('teacherMobile').value = initialFormData.teacherMobile || '';
    if (document.getElementById('teacherAltEmail')) document.getElementById('teacherAltEmail').value = initialFormData.teacherAltEmail || '';
    if (document.getElementById('consultationHours')) document.getElementById('consultationHours').value = initialFormData.consultationHours || '';
    if (document.getElementById('officeLocation')) document.getElementById('officeLocation').value = initialFormData.officeLocation || '';
    if (document.getElementById('emergencyName')) document.getElementById('emergencyName').value = initialFormData.emergencyName || '';
    if (document.getElementById('emergencyMobile')) document.getElementById('emergencyMobile').value = initialFormData.emergencyMobile || '';
    if (document.getElementById('teachingBio')) document.getElementById('teachingBio').value = initialFormData.teachingBio || '';

    showToast({ title: 'Changes Discarded', message: 'Form values restored to previous settings.', type: 'info', duration: 2500 });
  });
}
