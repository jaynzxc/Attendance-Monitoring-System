/**
 * excuse-slips.js - Page controller for Excuse Slip Review & Escalation Workbench
 * Bestlink College of the Philippines - Attendance Monitoring System (AMS)
 */

import { requireRole } from '../../lib/rbac-guard.js';
import { excuseSlipsApi } from '../../api/excuseSlipsApi.js';
import { sectionsApi } from '../../api/sectionsApi.js';
import { toast } from '../../components/toast.js';

let slipsQueue = [];
let selectedSlipId = null;

/**
 * Loads excuse slips queue
 */
async function loadQueue() {
  const status = document.getElementById('filterSlipStatus')?.value || null;
  const sectionId = document.getElementById('filterSlipSection')?.value || null;

  slipsQueue = await excuseSlipsApi.getExcuseSlips({ status, sectionId });
  renderQueueList();

  // If previous selected slip still in list, re-select; otherwise select first if available
  if (selectedSlipId && slipsQueue.some(s => s.id === selectedSlipId)) {
    renderWorkbench(selectedSlipId);
  } else if (slipsQueue.length > 0) {
    selectedSlipId = slipsQueue[0].id;
    renderWorkbench(selectedSlipId);
  } else {
    selectedSlipId = null;
    renderWorkbench(null);
  }
}

/**
 * Renders the queue cards list on the left pane
 */
function renderQueueList() {
  const container = document.getElementById('slipListContainer');
  if (!container) return;

  if (slipsQueue.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="padding:40px 10px;">
        <svg viewBox="0 0 24 24" fill="none" stroke-width="1.5"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
        <h4>No Slips in Queue</h4>
        <p>There are no excuse slips matching this filter.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = slipsQueue.map(slip => {
    const student = slip.student || {};
    const studentName = `${student.first_name || ''} ${student.last_name || ''}`.trim() || 'Unknown Student';
    const sectionName = slip.section?.name || '—';
    const status = (slip.status || 'pending').toLowerCase();
    const isActive = slip.id === selectedSlipId;

    return `
      <div class="slip-item ${isActive ? 'active' : ''}" data-id="${slip.id}">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:6px;">
          <div>
            <div style="font-weight:700; color:var(--text-1); font-size:13.5px;">${studentName}</div>
            <div style="font-size:11.5px; color:var(--text-3);">${sectionName} · ${student.student_number || ''}</div>
          </div>
          <span class="badge badge-${status}">${status}</span>
        </div>
        <div style="font-size:12px; color:var(--text-2); margin-bottom:6px;">
          <span style="font-weight:600; color:var(--ch-500);">${slip.reason_category}</span> · ${slip.start_date} ${slip.end_date ? 'to ' + slip.end_date : ''}
        </div>
        <div style="font-size:11.5px; color:var(--text-2); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
          "${slip.reason}"
        </div>
      </div>
    `;
  }).join('');

  // Attach card click handlers
  container.querySelectorAll('.slip-item').forEach(el => {
    el.addEventListener('click', () => {
      const id = el.getAttribute('data-id');
      selectedSlipId = id;
      renderQueueList();
      renderWorkbench(id);
    });
  });
}

/**
 * Renders the detailed inspection workbench on the right pane
 */
async function renderWorkbench(slipId) {
  const workbench = document.getElementById('slipWorkbench');
  if (!workbench) return;

  if (!slipId) {
    workbench.innerHTML = `
      <div class="empty-state" style="margin:auto;">
        <svg viewBox="0 0 24 24" fill="none" stroke-width="1.5"><path d="M14 3v5h5"/><path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2Z"/></svg>
        <h4>Select an Excuse Slip</h4>
        <p>Choose an item from the queue on the left to inspect medical proofs and record determination.</p>
      </div>
    `;
    return;
  }

  const slip = slipsQueue.find(s => s.id === slipId);
  if (!slip) return;

  const student = slip.student || {};
  const studentName = `${student.first_name || ''} ${student.last_name || ''}`.trim();
  const status = (slip.status || 'pending').toLowerCase();
  const isPending = status === 'pending';

  // Obtain signed URL for proof attachment if any
  let signedUrl = null;
  if (slip.attachment_url) {
    signedUrl = await excuseSlipsApi.getAttachmentSignedUrl(slip.attachment_url);
  }

  workbench.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:20px; border-bottom:1px solid var(--border); padding-bottom:16px;">
      <div>
        <h2 style="margin:0 0 4px; font-size:18px; font-weight:700; color:var(--text-1);">${studentName}</h2>
        <div style="font-size:12.5px; color:var(--text-2);">
          ${student.student_number || '—'} · ${slip.section?.name || 'Section'} · Submitted ${new Date(slip.submitted_at).toLocaleDateString()}
        </div>
      </div>
      <span class="badge badge-${status}" style="font-size:12px; padding:4px 12px;">${status}</span>
    </div>

    <!-- Date Range & Reason Category -->
    <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:16px;">
      <div style="background:var(--raised); padding:12px 14px; border-radius:10px; border:1px solid var(--border);">
        <div style="font-size:11px; font-weight:700; color:var(--text-3); text-transform:uppercase; margin-bottom:2px;">Requested Date Range</div>
        <div style="font-size:13.5px; font-weight:700; color:var(--text-1);">
          ${slip.start_date} ${slip.end_date && slip.end_date !== slip.start_date ? '→ ' + slip.end_date : '(Single Day)'}
        </div>
      </div>

      <div style="background:var(--raised); padding:12px 14px; border-radius:10px; border:1px solid var(--border);">
        <div style="font-size:11px; font-weight:700; color:var(--text-3); text-transform:uppercase; margin-bottom:2px;">Category</div>
        <div style="font-size:13.5px; font-weight:700; color:var(--ch-500);">${slip.reason_category}</div>
      </div>
    </div>

    <!-- Justification Statement -->
    <div style="margin-bottom:20px;">
      <div style="font-size:12px; font-weight:700; color:var(--text-1); margin-bottom:6px;">Student Justification Statement</div>
      <div style="background:var(--surface-hover); border:1px solid var(--border); border-radius:10px; padding:14px; font-size:13.5px; line-height:1.6; color:var(--text-1);">
        ${slip.reason}
      </div>
    </div>

    <!-- Proof Document Attachment -->
    <div style="margin-bottom:24px; flex:1;">
      <div style="font-size:12px; font-weight:700; color:var(--text-1); margin-bottom:6px;">Supporting Medical Certificate / Formal Letter</div>
      ${signedUrl ? `
        <div style="border:1px solid var(--border); border-radius:10px; padding:12px; background:var(--raised); display:flex; align-items:center; justify-content:space-between;">
          <div style="display:flex; align-items:center; gap:10px;">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--ch-500)" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>
            <div>
              <div style="font-size:13px; font-weight:600; color:var(--text-1);">Proof Attachment</div>
              <div style="font-size:11px; color:var(--text-3);">Time-limited secure preview link</div>
            </div>
          </div>
          <a href="${signedUrl}" target="_blank" rel="noopener noreferrer" class="btn-primary" style="padding:6px 12px; font-size:12px;">
            Open Document ↗
          </a>
        </div>
      ` : `
        <div style="padding:16px; border:1px dashed var(--border); border-radius:10px; text-align:center; color:var(--text-3); font-size:12.5px;">
          No file attachment was uploaded with this slip.
        </div>
      `}
    </div>

    <!-- Reviewer Action Section -->
    <div style="border-top:1px solid var(--border); padding-top:18px;">
      <div style="margin-bottom:12px;">
        <label style="display:block; font-size:12px; font-weight:600; margin-bottom:4px; color:var(--text-1);">Reviewer Determination Notes</label>
        <input type="text" id="reviewerNotesInput" class="input-field" style="width:100%;" placeholder="e.g. Verified with medical clinic / Approved by Registrar" value="${slip.reviewer_notes || ''}">
      </div>

      <div style="display:flex; gap:10px; justify-content:flex-end;">
        ${isPending ? `
          <button id="btnRejectSlip" class="btn-danger" style="padding:9px 18px;">
            Reject Excuse
          </button>
          <button id="btnApproveSlip" class="btn-primary" style="padding:9px 20px;">
            Approve & Cascade Status
          </button>
        ` : `
          <span style="font-size:12.5px; color:var(--text-2); margin-right:auto;">
            Reviewed on ${slip.reviewed_at ? new Date(slip.reviewed_at).toLocaleString() : 'Record'}
          </span>
          <button id="btnReopenSlip" class="btn-secondary">Re-evaluate Determination</button>
        `}
      </div>
    </div>
  `;

  // Wire action buttons
  document.getElementById('btnApproveSlip')?.addEventListener('click', async () => {
    const notes = document.getElementById('reviewerNotesInput')?.value.trim() || 'Approved by Registrar';
    try {
      await excuseSlipsApi.reviewExcuseSlip(slip.id, 'Approved', notes);
      toast.show(`Excuse slip approved. Daily attendance status for ${studentName} updated to Excused.`, 'success');
      loadQueue();
    } catch (err) {
      toast.show('Failed to approve slip: ' + (err.message || 'Error'), 'error');
    }
  });

  document.getElementById('btnRejectSlip')?.addEventListener('click', async () => {
    const notes = document.getElementById('reviewerNotesInput')?.value.trim() || 'Insufficient justification / Rejected';
    try {
      await excuseSlipsApi.reviewExcuseSlip(slip.id, 'Rejected', notes);
      toast.show('Excuse slip rejected.', 'info');
      loadQueue();
    } catch (err) {
      toast.show('Failed to reject slip: ' + (err.message || 'Error'), 'error');
    }
  });

  document.getElementById('btnReopenSlip')?.addEventListener('click', async () => {
    try {
      await excuseSlipsApi.reviewExcuseSlip(slip.id, 'Pending', 'Reopened for administrative re-evaluation');
      toast.show('Excuse slip reopened to Pending status.', 'info');
      loadQueue();
    } catch (err) {
      toast.show('Error reopening slip: ' + (err.message || 'Error'), 'error');
    }
  });
}

/**
 * Initializes Excuse Slips view
 */
async function init() {
  await requireRole(['admin']);

  // Populate sections dropdown
  const sections = await sectionsApi.getSections();
  const secSelect = document.getElementById('filterSlipSection');
  if (secSelect && sections) {
    sections.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = `${s.name} (${s.program_code})`;
      secSelect.appendChild(opt);
    });
  }

  // Filter bindings
  document.getElementById('filterSlipStatus')?.addEventListener('change', loadQueue);
  document.getElementById('filterSlipSection')?.addEventListener('change', loadQueue);

  loadQueue();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
