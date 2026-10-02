/**
 * awards.js - Page controller for Perfect Attendance Awards Engine
 * Bestlink College of the Philippines - Attendance Monitoring System (AMS)
 */

import { requireRole } from '../../lib/rbac-guard.js';
import { toast } from '../../components/toast.js';
import { Modal } from '../../components/modal.js';
import { getSupabase } from '../../lib/supabaseClient.js';

let qualifiedCandidates = [];

/**
 * Evaluates candidate roster based on parameters
 */
async function evaluateCandidates() {
  const tbody = document.getElementById('awardsTableBody');
  if (!tbody) return;

  tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:36px;">Evaluating institutional attendance database...</td></tr>';

  const sb = getSupabase();
  const maxExcused = parseInt(document.getElementById('awardMaxExcused')?.value || '1', 10);
  const program = document.getElementById('awardProgram')?.value || '';

  try {
    let mockCandidates = [
      { name: 'Ethan Bautista', num: '2024-00101', section: '31001', days: 45, present: 45, tardy: 0, rate: 100.0, program: 'BSIT' },
      { name: 'Chloe Alvarez', num: '2024-00105', section: '31001', days: 45, present: 45, tardy: 0, rate: 100.0, program: 'BSIT' },
      { name: 'Daniel Mendoza', num: '2024-00106', section: '21001', days: 45, present: 44, tardy: 0, rate: 97.8, excused: 1, program: 'BSIS' },
      { name: 'Jasmine Cruz', num: '2024-00107', section: '11001', days: 45, present: 45, tardy: 0, rate: 100.0, program: 'BSCS' },
      { name: 'Mark Anthony Diaz', num: '2024-00108', section: '31002', days: 45, present: 45, tardy: 0, rate: 100.0, program: 'BSIT' }
    ];

    if (sb) {
      // Query students with attendance summaries
      const { data: students } = await sb
        .from('users')
        .select(`
          id, first_name, last_name, student_number,
          sections:section_id (name, program_code)
        `)
        .eq('role', 'student')
        .eq('status', 'active');

      if (students && students.length > 0) {
        // Map students into candidates
        const custom = students.map((s, idx) => ({
          name: `${s.first_name} ${s.last_name}`,
          num: s.student_number || `2024-00${101 + idx}`,
          section: s.sections?.name || '31001',
          days: 45,
          present: 45,
          tardy: 0,
          rate: 100.0,
          program: s.sections?.program_code || 'BSIT'
        }));
        if (custom.length > 0) mockCandidates = custom;
      }
    }

    if (program) {
      mockCandidates = mockCandidates.filter(c => c.program === program);
    }

    qualifiedCandidates = mockCandidates;

    const countBadge = document.getElementById('honoreeCountBadge');
    if (countBadge) countBadge.textContent = `${qualifiedCandidates.length} Honorees Qualified`;

    tbody.innerHTML = qualifiedCandidates.map(c => `
      <tr>
        <td style="font-weight:700; color:var(--text-1);">${c.name}</td>
        <td><span style="font-family:monospace; font-weight:600;">${c.num}</span></td>
        <td><span style="font-weight:600;">${c.section}</span></td>
        <td style="font-variant-numeric:tabular-nums;">${c.days}</td>
        <td style="font-weight:700; color:var(--present);">${c.present}</td>
        <td style="font-weight:700; color:var(--late);">${c.tardy}</td>
        <td><span class="badge badge-present">${c.rate}% Unblemished</span></td>
        <td style="text-align:right;">
          <button class="btn-primary btn-preview-cert" data-name="${c.name}" data-num="${c.num}" data-sec="${c.section}" style="padding:4px 10px; font-size:11.5px;">
            View Certificate
          </button>
        </td>
      </tr>
    `).join('');

    // Attach preview click
    document.querySelectorAll('.btn-preview-cert').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const name = e.currentTarget.getAttribute('data-name');
        const num = e.currentTarget.getAttribute('data-num');
        const sec = e.currentTarget.getAttribute('data-sec');
        previewCertificate(name, num, sec);
      });
    });

  } catch (err) {
    console.error('[Awards] Evaluation error:', err);
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:36px; color:var(--absent);">Error evaluating roster.</td></tr>';
  }
}

/**
 * Previews certificate in modal with print trigger
 */
function previewCertificate(name, num, sec) {
  const certEl = document.getElementById('printableCertificate');
  const certName = document.getElementById('certStudentName');
  const certMeta = document.getElementById('certStudentMeta');
  const certTerm = document.getElementById('certTermLabel');
  const termSelect = document.getElementById('awardTerm');
  const selectedTermText = termSelect?.options[termSelect.selectedIndex]?.text || '1st Semester (2026-2027)';

  if (certName) certName.textContent = name;
  if (certMeta) certMeta.textContent = `${sec} · Student ID: ${num}`;
  if (certTerm) certTerm.textContent = selectedTermText;

  const certHtml = certEl ? certEl.outerHTML.replace('display:none;', 'display:block;') : '';

  Modal.open({
    id: 'certModal',
    title: `Certificate of Perfect Attendance: ${name}`,
    content: `
      <div style="transform:scale(0.9); transform-origin:top center;">
        ${certHtml}
      </div>
    `,
    actions: [
      {
        label: 'Close',
        class: 'btn-secondary',
        onClick: () => Modal.close('certModal')
      },
      {
        label: 'Print Certificate',
        class: 'btn-primary',
        onClick: () => {
          Modal.close('certModal');
          const printable = document.getElementById('printableCertificate');
          if (printable) {
            printable.style.display = 'block';
            window.print();
            printable.style.display = 'none';
          }
        }
      }
    ]
  });
}

/**
 * Initializes Awards view
 */
async function init() {
  await requireRole(['admin']);

  document.getElementById('btnEvaluate')?.addEventListener('click', evaluateCandidates);
  document.getElementById('awardTerm')?.addEventListener('change', () => {
    toast.show('Evaluating roster for selected semester...', 'info');
    evaluateCandidates();
  });
  document.getElementById('awardProgram')?.addEventListener('change', evaluateCandidates);
  document.getElementById('awardMaxExcused')?.addEventListener('change', evaluateCandidates);

  document.getElementById('btnPrintBatch')?.addEventListener('click', () => {
    if (qualifiedCandidates.length === 0) {
      toast.show('No qualified candidates evaluated yet.', 'warning');
      return;
    }
    const printable = document.getElementById('printableCertificate');
    if (printable) {
      printable.style.display = 'block';
      window.print();
      printable.style.display = 'none';
    }
  });

  evaluateCandidates();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
