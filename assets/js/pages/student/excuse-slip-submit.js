/**
 * excuse-slip-submit.js - Student Excuse Slip Submission & History Controller
 * Bestlink College of the Philippines - Attendance Monitoring System (AMS)
 * Authoritative Reference: docs/UI-UX_Architecture.md, docs/WORKFLOW.md, docs/Security.md
 */

import { requireRole } from '../../lib/rbac-guard.js';
import { getCurrentUser } from '../../lib/auth.js';
import { excuseSlipsApi } from '../../api/excuseSlipsApi.js';
import { getSupabase } from '../../lib/supabaseClient.js';
import { showToast } from '../../components/toast.js';
import { renderNumberedPagination } from '../../components/pagination.js';

let currentStudent = null;
let studentSectionId = '11111111-1111-1111-1111-111111111111'; // Default Section 31001
let allSlips = [];
let currentPage = 0;
const pageSize = 15;

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Enforce Student Role Guard
  await requireRole(['student']);

  // 2. Fetch authenticated student profile
  currentStudent = await getCurrentUser() || {
    id: 'c0000000-0000-0000-0000-000000000001',
    first_name: 'Juan',
    last_name: 'Dela Cruz',
    student_number: '2024-IT-00101',
    role: 'student'
  };

  // 3. Resolve student's enrolled section
  await resolveStudentSection(currentStudent.id);

  // 4. Initialize Date Pickers (Check URL param ?date=)
  initDateInputs();

  // 5. Setup Form Submit Listener
  initFormSubmit();

  // 6. Load Past Submitted Slips History
  await loadSubmittedSlips();
});

async function resolveStudentSection(studentId) {
  const sb = getSupabase();
  if (!sb) return;

  try {
    const { data } = await sb
      .from('student_sections')
      .select('section_id')
      .eq('student_id', studentId)
      .limit(1)
      .maybeSingle();

    if (data?.section_id) {
      studentSectionId = data.section_id;
    }
  } catch (err) {
    console.warn('[AMS Student Excuse] Error resolving section:', err);
  }
}

function initDateInputs() {
  const urlParams = new URLSearchParams(window.location.search);
  const prefillDate = urlParams.get('date');

  const dateFromInput = document.getElementById('dateFrom');
  const dateToInput = document.getElementById('dateTo');
  const today = new Date().toISOString().split('T')[0];

  if (dateFromInput && dateToInput) {
    dateFromInput.value = prefillDate || today;
    dateToInput.value = prefillDate || today;
  }
}

function initFormSubmit() {
  const form = document.getElementById('excuseSlipForm');
  const submitBtn = document.getElementById('submitSlipBtn');

  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const category = document.getElementById('reasonCategory')?.value;
    const dateFrom = document.getElementById('dateFrom')?.value;
    const dateTo = document.getElementById('dateTo')?.value;
    const reason = document.getElementById('reasonText')?.value.trim();
    const fileInput = document.getElementById('proofFileInput');
    const file = fileInput?.files?.[0] || null;

    if (!category || !dateFrom || !dateTo || !reason) {
      showToast({ title: 'Incomplete Form', message: 'Please complete all required fields.', type: 'error' });
      return;
    }

    if (new Date(dateTo) < new Date(dateFrom)) {
      showToast({ title: 'Invalid Dates', message: 'End date cannot precede start date.', type: 'error' });
      return;
    }

    if (reason.length < 10) {
      showToast({ title: 'Explanation Too Short', message: 'Please provide at least 10 characters explaining your absence.', type: 'error' });
      return;
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = `
        <svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        Submitting Excuse Slip...
      `;
    }

    try {
      await excuseSlipsApi.submitExcuseSlip({
        studentId: currentStudent.id,
        sectionId: studentSectionId,
        reasonCategory: category,
        reason,
        dateFrom,
        dateTo,
        file
      });

      showToast({
        title: 'Excuse Slip Submitted',
        message: 'Your request has been forwarded to your section teacher for evaluation.',
        type: 'success'
      });

      // Reset form
      form.reset();
      initDateInputs();

      // Reload history list
      await loadSubmittedSlips();
    } catch (err) {
      console.error('[AMS Student Excuse] Submission error:', err);
      showToast({
        title: 'Submission Failed',
        message: 'An error occurred while uploading. Please try again.',
        type: 'error'
      });
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = `
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
          Submit for Teacher Review
        `;
      }
    }
  });
}

async function loadSubmittedSlips() {
  const tbody = document.getElementById('studentSlipsHistoryBody');
  const badge = document.getElementById('slipsHistoryBadge');
  if (!tbody) return;

  try {
    allSlips = await excuseSlipsApi.getStudentSlips(currentStudent.id) || [];
    currentPage = 0;

    if (badge) {
      badge.textContent = `${allSlips.length} ${allSlips.length === 1 ? 'Request' : 'Requests'}`;
    }

    renderSlipsHistoryTable();
  } catch (err) {
    console.error('[AMS Student Excuse] Error loading slips:', err);
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="py-10 text-center text-xs text-red-500">
          Failed to load submitted excuse slips.
        </td>
      </tr>
    `;
  }
}

function renderSlipsHistoryTable() {
  const tbody = document.getElementById('studentSlipsHistoryBody');
  if (!tbody) return;

  renderNumberedPagination({
    containerId: 'slipsPageNumbersContainer',
    prevBtnId: 'slipsPrevBtn',
    nextBtnId: 'slipsNextBtn',
    infoTextId: 'slipsPageInfoText',
    totalRecords: allSlips.length,
    pageSize,
    currentPage,
    onPageChange: (newPage) => {
      currentPage = newPage;
      renderSlipsHistoryTable();
    }
  });

  if (!allSlips || allSlips.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="py-10 text-center text-xs" style="color: var(--text-3);">
          You have not submitted any excuse slips yet.
        </td>
      </tr>
    `;
    return;
  }

  const pagedSlips = allSlips.slice(currentPage * pageSize, (currentPage + 1) * pageSize);

  tbody.innerHTML = pagedSlips.map(slip => {
      const filedDate = new Date(slip.submitted_at || Date.now()).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric'
      });

      const startDate = new Date(slip.start_date || slip.date_from).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const endDate = new Date(slip.end_date || slip.date_to).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      const datesRange = `${startDate} - ${endDate}`;

      const status = slip.status || 'pending';
      const statusPillClass = status === 'approved' ? 'pill-present' : status === 'rejected' ? 'pill-absent' : 'pill-pending';
      const statusLabel = status.toUpperCase();

      const reviewerNotes = slip.reviewer_notes ? slip.reviewer_notes : (status === 'pending' ? 'Pending faculty review' : 'No remarks');

      return `
        <tr class="hover:bg-[var(--surface-hover)] transition-colors">
          <td class="py-3 px-4 font-mono text-xs tabular-nums" style="color: var(--text-2);">${filedDate}</td>
          <td class="py-3 px-4 font-medium text-xs tabular-nums" style="color: var(--text-1);">${datesRange}</td>
          <td class="py-3 px-4 text-xs">
            <span class="font-semibold text-xs" style="color: var(--accent);">${slip.reason_category || 'Medical'}</span>
            <div class="text-[11px] truncate max-w-xs" style="color: var(--text-2);">${slip.reason}</div>
          </td>
          <td class="py-3 px-4 text-xs">
            ${slip.attachment_url ? `
              <button type="button" class="view-file-btn text-xs text-blue-600 dark:text-blue-400 font-medium inline-flex items-center gap-1 hover:underline" data-url="${slip.attachment_url}">
                <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                View File
              </button>
            ` : `<span style="color: var(--text-3);">None</span>`}
          </td>
          <td class="py-3 px-4">
            <span class="pill ${statusPillClass} text-[10px] uppercase font-bold tracking-wider">
              ${statusLabel}
            </span>
          </td>
          <td class="py-3 px-4 text-xs" style="color: var(--text-2);">
            ${reviewerNotes}
          </td>
        </tr>
      `;
    }).join('');

    // Attach signed URL preview listeners
    tbody.querySelectorAll('.view-file-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const url = btn.getAttribute('data-url');
        const signedUrl = await excuseSlipsApi.getAttachmentSignedUrl(url);
        if (signedUrl) {
          window.open(signedUrl, '_blank');
        } else {
          showToast({ title: 'Preview Error', message: 'Could not open proof document.', type: 'error' });
        }
      });
    });
  } catch (err) {
    console.error('[AMS Student Excuse] Error loading slips:', err);
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="py-10 text-center text-xs text-red-500">
          Failed to load submitted excuse slips.
        </td>
      </tr>
    `;
  }
}
