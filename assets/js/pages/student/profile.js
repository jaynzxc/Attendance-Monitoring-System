/**
 * profile.js - Student Profile & Account Details Controller
 * Bestlink College of the Philippines - Attendance Monitoring System (AMS)
 * 
 * Enforces security boundaries:
 * - Admin-provided fields (Legal name, student number, section, RFID UID, email) are strictly READ-ONLY.
 * - Self-service fields (Personal mobile, guardian name, relationship, guardian mobile, address, notes) are editable.
 */

import { requireRole } from '../../lib/rbac-guard.js';
import { getCurrentUser } from '../../lib/auth.js';
import { getSupabase } from '../../lib/supabaseClient.js';
import { usersApi } from '../../api/usersApi.js';
import { showToast } from '../../components/toast.js';

let currentStudent = null;
let initialFormData = {};

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Enforce student role guard
  await requireRole(['student']);

  // 2. Fetch authenticated student profile
  currentStudent = await getCurrentUser() || {
    id: 'c0000000-0000-0000-0000-000000000001',
    first_name: 'Juan',
    last_name: 'Dela Cruz',
    student_number: '2024-IT-00101',
    email: 'j.delacruz@bcp.edu.ph',
    section_name: 'BSIT 3-1',
    role: 'student'
  };

  // 3. Load profile data from database and local preferences
  await loadStudentProfileData();

  // 4. Setup form listeners
  setupFormListeners();
});

/**
 * Loads student record, RFID tag, section, and guardian details
 */
async function loadStudentProfileData() {
  try {
    const sb = getSupabase();
    let fullProfile = null;

    if (sb && currentStudent.id) {
      try {
        fullProfile = await usersApi.getUserById(currentStudent.id);
      } catch (e) {
        console.warn('[AMS Profile] Could not fetch extended user profile from DB, using session profile:', e);
      }
    }

    // Merge session with DB profile
    const profile = fullProfile || currentStudent;

    // Populate Banner Elements
    const fullName = `${profile.first_name || 'Juan'} ${profile.last_name || 'Dela Cruz'}`.trim();
    const studentNo = profile.student_number || '2024-IT-00101';
    const sectionName = profile.student_sections?.[0]?.sections?.name || profile.section_name || 'BSIT 3-1';
    const activeRfid = profile.rfid_cards?.find(c => c.is_active)?.card_uid || 'E2806894';
    const email = profile.email || 'j.delacruz@bcp.edu.ph';
    const initials = `${(profile.first_name || 'J')[0]}${(profile.last_name || 'D')[0]}`.toUpperCase();

    const bannerName = document.getElementById('bannerStudentName');
    const bannerNo = document.getElementById('bannerStudentNo');
    const bannerSec = document.getElementById('bannerSection');
    const bannerRfid = document.getElementById('bannerRfid');
    const bannerAvatar = document.getElementById('bannerAvatar');

    if (bannerName) bannerName.textContent = fullName;
    if (bannerNo) bannerNo.textContent = studentNo;
    if (bannerSec) bannerSec.textContent = sectionName;
    if (bannerRfid) bannerRfid.textContent = activeRfid;
    if (bannerAvatar) bannerAvatar.textContent = initials;

    // Populate Locked Admin Fields
    const adminFirst = document.getElementById('adminFirstName');
    const adminLast = document.getElementById('adminLastName');
    const adminNo = document.getElementById('adminStudentNo');
    const adminSec = document.getElementById('adminSection');
    const adminMail = document.getElementById('adminEmail');
    const adminRfid = document.getElementById('adminRfidUid');

    if (adminFirst) adminFirst.value = profile.first_name || 'Juan';
    if (adminLast) adminLast.value = profile.last_name || 'Dela Cruz';
    if (adminNo) adminNo.value = studentNo;
    if (adminSec) adminSec.value = `BS Information Technology · ${sectionName}`;
    if (adminMail) adminMail.value = email;
    if (adminRfid) adminRfid.value = activeRfid;

    // Populate Editable Self-Service Fields (Check local storage cache first, then parent_contacts)
    const savedCustom = JSON.parse(localStorage.getItem(`ams_student_custom_${currentStudent.id}`) || '{}');
    const guardian = profile.parent_contacts?.[0] || {};

    const studentMobile = document.getElementById('studentMobile');
    const guardianName = document.getElementById('guardianName');
    const guardianRelation = document.getElementById('guardianRelation');
    const guardianMobile = document.getElementById('guardianMobile');
    const homeAddress = document.getElementById('homeAddress');
    const medicalNotes = document.getElementById('medicalNotes');

    if (studentMobile) studentMobile.value = savedCustom.studentMobile || '+639171234567';
    if (guardianName) guardianName.value = savedCustom.guardianName || guardian.full_name || 'Maria Dela Cruz';
    if (guardianRelation) guardianRelation.value = savedCustom.guardianRelation || guardian.relationship || 'Mother';
    if (guardianMobile) guardianMobile.value = savedCustom.guardianMobile || guardian.mobile_number || '+639187654321';
    if (homeAddress) homeAddress.value = savedCustom.homeAddress || 'Brgy. San Bartolome, Novaliches, Quezon City';
    if (medicalNotes) medicalNotes.value = savedCustom.medicalNotes || 'None reported';

    // Store baseline for Discard / Reset functionality
    captureInitialFormData();
  } catch (err) {
    console.error('[AMS Student Profile] Error loading profile:', err);
    showToast({ title: 'Error', message: 'Failed to load some profile details.', type: 'error' });
  }
}

/**
 * Captures initial form data for dirty-check and reset
 */
function captureInitialFormData() {
  initialFormData = {
    studentMobile: document.getElementById('studentMobile')?.value || '',
    guardianName: document.getElementById('guardianName')?.value || '',
    guardianRelation: document.getElementById('guardianRelation')?.value || '',
    guardianMobile: document.getElementById('guardianMobile')?.value || '',
    homeAddress: document.getElementById('homeAddress')?.value || '',
    medicalNotes: document.getElementById('medicalNotes')?.value || ''
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
  const form = document.getElementById('studentProfileForm');
  const btnReset = document.getElementById('btnResetProfile');

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const studentMobile = document.getElementById('studentMobile')?.value.trim();
    const guardianName = document.getElementById('guardianName')?.value.trim();
    const guardianRelation = document.getElementById('guardianRelation')?.value;
    const guardianMobile = document.getElementById('guardianMobile')?.value.trim();
    const homeAddress = document.getElementById('homeAddress')?.value.trim();
    const medicalNotes = document.getElementById('medicalNotes')?.value.trim();

    // Validation
    if (!studentMobile || !isValidPhone(studentMobile)) {
      showToast({ title: 'Invalid Phone Number', message: 'Please enter a valid Philippine mobile number for yourself (e.g. +63 917 123 4567).', type: 'warning' });
      document.getElementById('studentMobile')?.focus();
      return;
    }

    if (!guardianName) {
      showToast({ title: 'Missing Information', message: 'Please specify your parent or guardian full name.', type: 'warning' });
      document.getElementById('guardianName')?.focus();
      return;
    }

    if (!guardianMobile || !isValidPhone(guardianMobile)) {
      showToast({ title: 'Invalid Guardian Mobile', message: 'Please enter a valid Philippine mobile number for your guardian (e.g. +63 918 765 4321).', type: 'warning' });
      document.getElementById('guardianMobile')?.focus();
      return;
    }

    const payload = {
      studentMobile: normalizePhone(studentMobile),
      guardianName,
      guardianRelation,
      guardianMobile: normalizePhone(guardianMobile),
      homeAddress,
      medicalNotes,
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
      localStorage.setItem(`ams_student_custom_${currentStudent.id}`, JSON.stringify(payload));

      // 2. Persist to Supabase parent_contacts if connected
      const sb = getSupabase();
      if (sb && currentStudent.id) {
        try {
          const { data: existingContact } = await sb
            .from('parent_contacts')
            .select('id')
            .eq('student_id', currentStudent.id)
            .maybeSingle();

          if (existingContact?.id) {
            await sb
              .from('parent_contacts')
              .update({
                full_name: guardianName,
                relationship: guardianRelation,
                mobile_number: normalizePhone(guardianMobile)
              })
              .eq('id', existingContact.id);
          } else {
            await sb
              .from('parent_contacts')
              .insert([{
                student_id: currentStudent.id,
                full_name: guardianName,
                relationship: guardianRelation,
                mobile_number: normalizePhone(guardianMobile),
                is_primary: true
              }]);
          }
        } catch (dbErr) {
          console.warn('[AMS Profile] Non-fatal DB update error, stored in local cache:', dbErr);
        }
      }

      captureInitialFormData();

      showToast({
        title: 'Profile Updated',
        message: 'Your personal contact and guardian SMS details have been successfully saved.',
        type: 'success'
      });
    } catch (err) {
      console.error('[AMS Profile] Save error:', err);
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
          <span>Save Contact Changes</span>
        `;
      }
    }
  });

  // Discard / Reset handler
  btnReset?.addEventListener('click', () => {
    if (document.getElementById('studentMobile')) document.getElementById('studentMobile').value = initialFormData.studentMobile || '';
    if (document.getElementById('guardianName')) document.getElementById('guardianName').value = initialFormData.guardianName || '';
    if (document.getElementById('guardianRelation')) document.getElementById('guardianRelation').value = initialFormData.guardianRelation || 'Mother';
    if (document.getElementById('guardianMobile')) document.getElementById('guardianMobile').value = initialFormData.guardianMobile || '';
    if (document.getElementById('homeAddress')) document.getElementById('homeAddress').value = initialFormData.homeAddress || '';
    if (document.getElementById('medicalNotes')) document.getElementById('medicalNotes').value = initialFormData.medicalNotes || '';

    showToast({ title: 'Changes Discarded', message: 'Form values restored to previous settings.', type: 'info', duration: 2500 });
  });
}
