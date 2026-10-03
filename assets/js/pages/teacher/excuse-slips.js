/**
 * excuse-slips.js - Teacher Section Excuse Slip Approval Controller
 * Bestlink College of the Philippines - Attendance Monitoring System (AMS)
 * Authoritative Reference: docs/UI-UX_Architecture.md, docs/WORKFLOW.md, docs/Security.md
 */

import { requireRole } from '../../lib/rbac-guard.js';
import { getCurrentUser } from '../../lib/auth.js';
import { sectionsApi } from '../../api/sectionsApi.js';
import { excuseSlipsApi } from '../../api/excuseSlipsApi.js';
import { showToast } from '../../components/toast.js';
import { renderNumberedPagination } from '../../components/pagination.js';

let currentTeacher = null;
let assignedSections = [];
let assignedSectionIds = new Set();
let activeStatusTab = 'all';
let selectedSectionFilter = '';
let currentSlips = [];
let activeReviewSlip = null;
let currentPage = 0;
const pageSize = 15;

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Enforce Teacher Role Guard
  await requireRole(['teacher']);

  // 2. Fetch authenticated teacher profile
  currentTeacher = await getCurrentUser() || {
    id: 'b0000000-0000-0000-0000-000000000001',
    first_name: 'Ricardo',
    last_name: 'Santos',
    role: 'teacher'
  };

  // 3. Load assigned sections
  await loadAssignedSections();

  // 4. Setup Tab Buttons & Section Select
  initFilters();

  // 5. Setup Review Modal
  initReviewModal();

  // 6. Load Excuse Slips
  await loadExcuseSlips();
});

async function loadAssignedSections() {
  const select = document.getElementById('filterSectionSelect');
  if (!select) return;

  try {
    assignedSections = await sectionsApi.getSectionsByTeacher(currentTeacher.id);
    assignedSectionIds = new Set(assignedSections.map(s => s.id));

    select.innerHTML = '<option value="">All My Sections</option>' + assignedSections.map(sec => `
      <option value="${sec.id}">${sec.name} (${sec.subject || 'Class'})</option>
    `).join('');
  } catch (err) {
    console.error('[AMS Teacher ExcuseSlips] Error loading sections:', err);
  }
}

function initFilters() {
  const tabButtons = document.querySelectorAll('.tab-btn');
  const sectionSelect = document.getElementById('filterSectionSelect');

  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      tabButtons.forEach(b => {
        b.style.background = 'var(--surface)';
        b.style.borderColor = 'var(--border)';
        b.style.color = 'var(--text-2)';
      });

      btn.style.background = 'var(--raised)';
      btn.style.borderColor = 'var(--border-strong)';
      btn.style.color = 'var(--accent)';

      activeStatusTab = btn.getAttribute('data-status');
      currentPage = 0;
      renderSlipsTable();
    });
  });

  if (sectionSelect) {
    sectionSelect.addEventListener('change', (e) => {
      selectedSectionFilter = e.target.value;
      currentPage = 0;
      loadExcuseSlips();
    });
  }
}

async function loadExcuseSlips() {
  const tbody = document.getElementById('slipsTableBody');
  const badge = document.getElementById('slipsCountBadge');
  const pendingBadge = document.getElementById('pendingAlertBadge');

  if (tbody) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="py-12 text-center text-sm" style="color: var(--text-3);">
          Loading excuse slips for your sections...
        </td>
      </tr>
    `;
  }

  try {
    const rawSlips = await excuseSlipsApi.getExcuseSlips({
      sectionId: selectedSectionFilter || undefined
    });

    // Filter to sections belonging to teacher
    currentSlips = rawSlips.filter(slip => {
      if (!slip.section_id) return false;
      return assignedSectionIds.has(slip.section_id) || assignedSectionIds.size === 0;
    });

    // Update pending alert counter
    const pendingCount = currentSlips.filter(s => s.status === 'pending').length;
    if (pendingBadge) {
      pendingBadge.textContent = `${pendingCount} Pending Review`;
      pendingBadge.className = pendingCount > 0 ? 'pill pill-pending text-xs' : 'pill pill-present text-xs';
    }

    if (badge) {
      badge.textContent = `${currentSlips.length} Slips`;
    }

    renderSlipsTable();
  } catch (err) {
    console.error('[AMS Teacher ExcuseSlips] Error loading slips:', err);
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" class="py-12 text-center text-sm text-red-500">
            Failed to load excuse slips. Please try again.
          </td>
        </tr>
      `;
    }
  }
}

function renderSlipsTable() {
  const tbody = document.getElementById('slipsTableBody');
  if (!tbody) return;

  const filtered = currentSlips.filter(s => {
    if (activeStatusTab === 'all') return true;
    return s.status === activeStatusTab;
  });

  renderNumberedPagination({
    containerId: 'slipsPageNumbersContainer',
    prevBtnId: 'slipsPrevBtn',
    nextBtnId: 'slipsNextBtn',
    infoTextId: 'slipsPageInfoText',
    totalRecords: filtered.length,
    pageSize,
    currentPage,
    onPageChange: (newPage) => {
      currentPage = newPage;
      renderSlipsTable();
    }
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="py-12 text-center text-sm" style="color: var(--text-3);">
          No excuse slips found matching this status.
        </td>
      </tr>
    `;
    return;
  }

  const pagedSlips = filtered.slice(currentPage * pageSize, (currentPage + 1) * pageSize);

  tbody.innerHTML = pagedSlips.map(slip => {
    const studentName = slip.student ? `${slip.student.first_name} ${slip.student.last_name}` : 'Student';
    const studentNum = slip.student?.student_number || 's230110000';
    const sectionName = slip.section?.name || 'Assigned Section';

    const startDate = new Date(slip.start_date || slip.date_from).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const endDate = new Date(slip.end_date || slip.date_to).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const dateRange = `${startDate} - ${endDate}`;

    const reasonCategory = slip.reason_category || 'Medical / Illness';
    const reasonExcerpt = (slip.reason || '').length > 45 ? `${slip.reason.substring(0, 45)}...` : (slip.reason || '—');

    const status = slip.status || 'pending';
    let statusClass = 'pill-pending';
    if (status === 'approved') statusClass = 'pill-present';
    else if (status === 'rejected') statusClass = 'pill-absent';

    return `
      <tr class="hover:bg-[var(--surface-hover)] transition-colors" id="slip-row-${slip.id}">
        <!-- Student -->
        <td class="py-3 px-4">
          <div class="font-semibold text-sm">${studentName}</div>
          <div class="font-mono text-xs tabular-nums" style="color: var(--text-3);">${studentNum}</div>
        </td>

        <!-- Section -->
        <td class="py-3 px-4 text-xs font-semibold" style="color: var(--accent);">
          ${sectionName}
        </td>

        <!-- Dates -->
        <td class="py-3 px-4 text-xs tabular-nums" style="color: var(--text-2);">
          ${dateRange}
        </td>

        <!-- Reason -->
        <td class="py-3 px-4 text-xs max-w-xs">
          <div class="font-semibold text-[11px]" style="color: var(--text-1);">${reasonCategory}</div>
          <div class="truncate" style="color: var(--text-2);">${reasonExcerpt}</div>
        </td>

        <!-- Proof File -->
        <td class="py-3 px-4 text-center">
          ${slip.attachment_url ? `
            <button type="button" class="view-proof-btn text-xs font-medium inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 dark:text-blue-400" data-url="${slip.attachment_url}">
              <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              View Proof
            </button>
          ` : `
            <span class="text-xs" style="color: var(--text-3);">None</span>
          `}
        </td>

        <!-- Status -->
        <td class="py-3 px-4">
          <span class="pill ${statusClass} text-[11px] uppercase font-bold tracking-wider">
            ${status}
          </span>
        </td>

        <!-- Action -->
        <td class="py-3 px-4 text-right">
          <button type="button" class="review-slip-btn pillbtn text-xs font-semibold" data-id="${slip.id}">
            Review
          </button>
        </td>
      </tr>
    `;
  }).join('');

  // Attach Listeners
  tbody.querySelectorAll('.review-slip-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      const slip = currentSlips.find(s => s.id === id);
      if (slip) openReviewModal(slip);
    });
  });

  tbody.querySelectorAll('.view-proof-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const url = btn.getAttribute('data-url');
      const signedUrl = await excuseSlipsApi.getAttachmentSignedUrl(url);
      if (signedUrl) {
        window.open(signedUrl, '_blank');
      } else {
        showToast({ title: 'Preview Unavailable', message: 'Could not generate signed preview URL.', type: 'error' });
      }
    });
  });
}

function initReviewModal() {
  const modal = document.getElementById('reviewModal');
  const closeBtn = document.getElementById('closeReviewModalBtn');
  const approveBtn = document.getElementById('approveSlipBtn');
  const rejectBtn = document.getElementById('rejectSlipBtn');

  if (closeBtn) closeBtn.addEventListener('click', closeReviewModal);

  if (approveBtn) {
    approveBtn.addEventListener('click', () => handleReviewAction('approved'));
  }

  if (rejectBtn) {
    rejectBtn.addEventListener('click', () => handleReviewAction('rejected'));
  }
}

async function openReviewModal(slip) {
  activeReviewSlip = slip;

  const modal = document.getElementById('reviewModal');
  const studentNameEl = document.getElementById('modalStudentName');
  const studentNumEl = document.getElementById('modalStudentNumber');
  const sectionNameEl = document.getElementById('modalSectionName');
  const dateRangeEl = document.getElementById('modalDateRange');
  const reasonTextEl = document.getElementById('modalReasonText');
  const statusBadgeEl = document.getElementById('modalStatusBadge');
  const attachContainer = document.getElementById('modalAttachmentContainer');
  const notesInput = document.getElementById('reviewerNotesInput');

  const studentName = slip.student ? `${slip.student.first_name} ${slip.student.last_name}` : 'Student';
  const studentNum = slip.student?.student_number || 's230110000';
  const sectionName = slip.section?.name || 'Section';

  const startDate = new Date(slip.start_date || slip.date_from).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const endDate = new Date(slip.end_date || slip.date_to).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  if (studentNameEl) studentNameEl.textContent = studentName;
  if (studentNumEl) studentNumEl.textContent = studentNum;
  if (sectionNameEl) sectionNameEl.textContent = sectionName;
  if (dateRangeEl) dateRangeEl.textContent = `${startDate} — ${endDate}`;
  if (reasonTextEl) reasonTextEl.textContent = slip.reason || 'No explanation provided.';

  if (statusBadgeEl) {
    statusBadgeEl.textContent = (slip.status || 'pending').toUpperCase();
    statusBadgeEl.className = `pill ${slip.status === 'approved' ? 'pill-present' : slip.status === 'rejected' ? 'pill-absent' : 'pill-pending'}`;
  }

  if (notesInput) {
    notesInput.value = slip.reviewer_notes || '';
  }

  if (attachContainer) {
    if (slip.attachment_url) {
      attachContainer.innerHTML = '<span class="text-xs" style="color: var(--text-3);">Generating secure preview link...</span>';
      const signedUrl = await excuseSlipsApi.getAttachmentSignedUrl(slip.attachment_url);
      if (signedUrl) {
        attachContainer.innerHTML = `
          <div class="flex items-center justify-between gap-3 p-2 rounded bg-blue-50/50 dark:bg-blue-950/30">
            <span class="truncate font-mono text-[11px] text-blue-600 dark:text-blue-400">Proof Document Attached</span>
            <a href="${signedUrl}" target="_blank" class="pillbtn text-[11px] font-semibold shrink-0">Open In New Tab</a>
          </div>
        `;
      } else {
        attachContainer.innerHTML = '<span class="text-xs text-rose-500">Could not load proof file.</span>';
      }
    } else {
      attachContainer.innerHTML = '<span class="text-xs" style="color: var(--text-3);">No document uploaded by student.</span>';
    }
  }

  modal.classList.remove('hidden');
}

function closeReviewModal() {
  const modal = document.getElementById('reviewModal');
  if (modal) modal.classList.add('hidden');
  activeReviewSlip = null;
}

async function handleReviewAction(action) {
  if (!activeReviewSlip) return;

  const notesInput = document.getElementById('reviewerNotesInput');
  const reviewerNotes = notesInput ? notesInput.value.trim() : '';

  try {
    await excuseSlipsApi.reviewExcuseSlip(activeReviewSlip.id, action, reviewerNotes);

    activeReviewSlip.status = action;
    activeReviewSlip.reviewer_notes = reviewerNotes;

    closeReviewModal();
    renderSlipsTable();

    // Update pending counter
    const pendingCount = currentSlips.filter(s => s.status === 'pending').length;
    const pendingBadge = document.getElementById('pendingAlertBadge');
    if (pendingBadge) {
      pendingBadge.textContent = `${pendingCount} Pending Review`;
    }

    showToast({
      title: `Excuse Slip ${action === 'approved' ? 'Approved' : 'Rejected'}`,
      message: `Student absence record has been ${action === 'approved' ? 'marked as Excused' : 'rejected'}.`,
      type: action === 'approved' ? 'success' : 'info'
    });
  } catch (err) {
    console.error('[AMS Teacher ExcuseSlips] Review error:', err);
    showToast({
      title: 'Review Error',
      message: 'Failed to update excuse slip. Please try again.',
      type: 'error'
    });
  }
}
