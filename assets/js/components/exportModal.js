/**
 * exportModal.js - Multi-Format Data Export Modal & Generation Engine
 * Bestlink College of the Philippines — Attendance Monitoring System (AMS)
 * 
 * Provides an institutional modal dialog offering CSV, Excel, PDF, and Word export options.
 * Adheres to Color Hunt Blue Palette, dual-theme support, WCAG AA compliance, and strict no-emoji standards.
 */

import { toast, showToast } from './toast.js';

/**
 * Downloads a Blob as a file in the browser
 */
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Clean data value for tabular display
 */
function cleanValue(val) {
  if (val === null || val === undefined) return '';
  return String(val).replace(/^"|"$/g, '').trim();
}

/**
 * Generates and downloads a CSV file
 */
export function generateCsv(filename, headers, rows) {
  const sanitize = (cell) => {
    const str = cleanValue(cell);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const csvRows = [
    headers.map(sanitize).join(','),
    ...rows.map(r => r.map(sanitize).join(','))
  ];

  // UTF-8 BOM (\uFEFF) ensures proper rendering of accented/special characters in Excel
  const blob = new Blob(['\uFEFF' + csvRows.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const finalName = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  downloadBlob(blob, finalName);
}

/**
 * Generates an Excel-compatible (.xls) spreadsheet with institutional styling
 */
export function generateExcel(filename, headers, rows, title = 'Attendance Report', metadata = {}) {
  const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  
  let metaHtml = '';
  for (const [k, v] of Object.entries(metadata)) {
    metaHtml += `<tr><td style="font-weight:bold; color:#475569; padding:4px 8px;">${k}:</td><td style="padding:4px 8px; color:#0f172a;">${v}</td></tr>`;
  }

  const tableHeaders = headers.map(h => 
    `<th style="background-color:#0D47A1; color:#FFFFFF; font-weight:bold; font-size:11pt; padding:8px 12px; border:1px solid #90CAF9; text-align:left;">${cleanValue(h)}</th>`
  ).join('');

  const tableRows = rows.map((r, idx) => {
    const bg = idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC';
    const cells = r.map(cell => 
      `<td style="padding:7px 12px; border:1px solid #CBD5E1; font-size:10pt; color:#1E293B; background-color:${bg};">${cleanValue(cell)}</td>`
    ).join('');
    return `<tr>${cells}</tr>`;
  }).join('');

  const excelTemplate = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
      <head>
        <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
        <!--[if gte mso 9]>
        <xml>
          <x:ExcelWorkbook>
            <x:ExcelWorksheets>
              <x:ExcelWorksheet>
                <x:Name>${title.replace(/[^a-zA-Z0-9 ]/g, '').substring(0, 31) || 'Attendance'}</x:Name>
                <x:WorksheetOptions>
                  <x:DisplayGridlines/>
                </x:WorksheetOptions>
              </x:ExcelWorksheet>
            </x:ExcelWorksheets>
          </x:ExcelWorkbook>
        </xml>
        <![endif]-->
        <style>
          body { font-family: 'Segoe UI', Calibri, Arial, sans-serif; }
          table { border-collapse: collapse; width: 100%; }
        </style>
      </head>
      <body>
        <div style="margin-bottom:16px;">
          <h2 style="color:#0D47A1; margin:0 0 4px 0; font-size:16pt;">Bestlink College of the Philippines</h2>
          <div style="font-size:12pt; font-weight:bold; color:#1E293B; margin-bottom:4px;">${title}</div>
          <div style="font-size:9.5pt; color:#64748B;">Generated on: ${dateStr} · Attendance Monitoring System (SMS 1)</div>
        </div>
        ${metaHtml ? `<table style="margin-bottom:16px; border:none;">${metaHtml}</table>` : ''}
        <table>
          <thead><tr>${tableHeaders}</tr></thead>
          <tbody>${tableRows}</tbody>
        </table>
      </body>
    </html>
  `;

  const blob = new Blob([excelTemplate], { type: 'application/vnd.ms-excel;charset=utf-8' });
  const finalName = filename.endsWith('.xls') || filename.endsWith('.xlsx') ? filename : `${filename}.xls`;
  downloadBlob(blob, finalName);
}

/**
 * Generates a Word-compatible (.doc) formatted document
 */
export function generateWord(filename, headers, rows, title = 'Attendance Report', metadata = {}) {
  const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  let metaHtml = '';
  for (const [k, v] of Object.entries(metadata)) {
    metaHtml += `<tr><td style="width:180px; font-weight:bold; color:#334155; padding:3px 6px;">${k}:</td><td style="padding:3px 6px; color:#0f172a;">${v}</td></tr>`;
  }

  const tableHeaders = headers.map(h => 
    `<th style="background-color:#0D47A1; color:#ffffff; font-weight:bold; font-size:10pt; padding:6px 10px; border:1px solid #cbd5e1; text-align:left;">${cleanValue(h)}</th>`
  ).join('');

  const tableRows = rows.map((r, idx) => {
    const bg = idx % 2 === 0 ? '#ffffff' : '#f1f5f9';
    const cells = r.map(cell => 
      `<td style="padding:6px 10px; border:1px solid #cbd5e1; font-size:9.5pt; color:#0f172a; background-color:${bg};">${cleanValue(cell)}</td>`
    ).join('');
    return `<tr>${cells}</tr>`;
  }).join('');

  const wordTemplate = `
    <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
      <head>
        <meta charset="utf-8">
        <title>${title}</title>
        <style>
          @page { size: letter portrait; margin: 1in; }
          body { font-family: 'Calibri', 'Inter', Arial, sans-serif; color: #0f172a; line-height: 1.4; }
          table { border-collapse: collapse; width: 100%; margin-top: 12px; }
          .header-box { border-bottom: 2px solid #0D47A1; padding-bottom: 10px; margin-bottom: 16px; }
          .inst-name { font-size: 15pt; font-weight: bold; color: #0D47A1; margin: 0; }
          .inst-sub { font-size: 9.5pt; color: #475569; margin: 2px 0 0 0; }
          .doc-title { font-size: 13pt; font-weight: bold; color: #0f172a; margin-top: 10px; }
          .sig-row { margin-top: 40px; display: flex; justify-content: space-between; }
        </style>
      </head>
      <body>
        <div class="header-box">
          <div class="inst-name">Bestlink College of the Philippines</div>
          <div class="inst-sub">Office of Academic Affairs & Registrar · Attendance Monitoring Division (SMS 1)</div>
          <div class="doc-title">${title}</div>
          <div style="font-size:9pt; color:#64748b; margin-top:3px;">Date Generated: ${dateStr}</div>
        </div>

        ${metaHtml ? `<table style="margin-bottom:14px; border:none; width:auto;">${metaHtml}</table>` : ''}

        <table>
          <thead><tr>${tableHeaders}</tr></thead>
          <tbody>${tableRows}</tbody>
        </table>

        <div style="margin-top:40px; padding-top:16px; border-top:1px dashed #cbd5e1; font-size:8.5pt; color:#64748b; display:flex; justify-content:space-between;">
          <span>Digitally compiled via BCP AMS Enterprise System</span>
          <span>Official Record · Confidential</span>
        </div>
      </body>
    </html>
  `;

  const blob = new Blob([wordTemplate], { type: 'application/msword;charset=utf-8' });
  const finalName = filename.endsWith('.doc') || filename.endsWith('.docx') ? filename : `${filename}.doc`;
  downloadBlob(blob, finalName);
}

/**
 * Opens an institutional PDF printable document
 */
export function generatePdf(filename, headers, rows, title = 'Attendance Report', metadata = {}) {
  const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  let metaHtml = '';
  for (const [k, v] of Object.entries(metadata)) {
    metaHtml += `<div class="meta-item"><span class="meta-label">${k}:</span> <span class="meta-val">${v}</span></div>`;
  }

  const tableHeaders = headers.map(h => `<th>${cleanValue(h)}</th>`).join('');
  const tableRows = rows.map((r, idx) => {
    const cells = r.map(c => `<td>${cleanValue(c)}</td>`).join('');
    return `<tr>${cells}</tr>`;
  }).join('');

  const printWindow = window.open('', '_blank', 'width=950,height=750');
  if (!printWindow) {
    alert('Please allow popups to generate and print PDF reports.');
    return;
  }

  printWindow.document.write(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>${title} — BCP AMS</title>
      <link rel="preconnect" href="https://fonts.googleapis.com">
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
      <style>
        * { box-sizing: border-box; }
        body {
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
          margin: 0;
          padding: 32px 40px;
          color: #0f172a;
          background: #ffffff;
          font-size: 11px;
          line-height: 1.45;
        }
        @media print {
          body { padding: 16px 20px; }
          .no-print { display: none !important; }
          @page { size: letter landscape; margin: 0.5in; }
          table { page-break-inside: auto; }
          tr { page-break-inside: avoid; page-break-after: auto; }
          thead { display: table-header-group; }
        }
        .header-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-bottom: 2.5px solid #0D47A1;
          padding-bottom: 12px;
          margin-bottom: 16px;
        }
        .inst-title {
          font-size: 15px;
          font-weight: 800;
          color: #0D47A1;
          letter-spacing: -0.01em;
          text-transform: uppercase;
        }
        .inst-sub {
          font-size: 9.5px;
          color: #475569;
          font-weight: 500;
          margin-top: 2px;
        }
        .report-title {
          font-size: 14px;
          font-weight: 700;
          color: #0f172a;
          margin-top: 6px;
        }
        .meta-strip {
          display: flex;
          flex-wrap: wrap;
          gap: 16px;
          background: #F1F5F9;
          border: 1px solid #E2E8F0;
          border-radius: 8px;
          padding: 8px 14px;
          margin-bottom: 16px;
          font-size: 10px;
        }
        .meta-item {
          display: inline-flex;
          gap: 4px;
        }
        .meta-label {
          font-weight: 700;
          color: #475569;
        }
        .meta-val {
          font-weight: 600;
          color: #0f172a;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 8px;
          font-size: 10px;
        }
        th {
          background-color: #0D47A1;
          color: #ffffff;
          font-weight: 700;
          text-align: left;
          padding: 8px 10px;
          border: 1px solid #CBD5E1;
          letter-spacing: 0.02em;
        }
        td {
          padding: 6px 10px;
          border: 1px solid #E2E8F0;
          color: #1e293b;
        }
        tr:nth-child(even) td {
          background-color: #F8FAFC;
        }
        .footer-audit {
          margin-top: 24px;
          padding-top: 12px;
          border-top: 1px solid #E2E8F0;
          display: flex;
          justify-content: space-between;
          font-size: 9px;
          color: #64748B;
        }
        .print-btn-bar {
          display: flex;
          gap: 10px;
          justify-content: flex-end;
          margin-bottom: 16px;
        }
        .btn-print {
          background: #0D47A1;
          color: #ffffff;
          border: none;
          padding: 8px 18px;
          border-radius: 6px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
        }
      </style>
    </head>
    <body>
      <div class="print-btn-bar no-print">
        <button class="btn-print" onclick="window.print()">Print / Save as PDF</button>
      </div>

      <div class="header-bar">
        <div>
          <div class="inst-title">Bestlink College of the Philippines</div>
          <div class="inst-sub">Office of the Registrar · Student Attendance Monitoring System (SMS 1)</div>
          <div class="report-title">${title}</div>
        </div>
        <div style="text-align:right; font-size:9.5px; color:#475569;">
          <div>Generated: <strong>${dateStr}</strong></div>
          <div>Total Records: <strong>${rows.length}</strong></div>
        </div>
      </div>

      ${metaHtml ? `<div class="meta-strip">${metaHtml}</div>` : ''}

      <table>
        <thead><tr>${tableHeaders}</tr></thead>
        <tbody>${tableRows}</tbody>
      </table>

      <div class="footer-audit">
        <span>Digitally Certified by Bestlink College AMS Enterprise Framework</span>
        <span>Confidential Institutional Document · For Academic & Administrative Use Only</span>
      </div>

      <script>
        window.onload = function() {
          // Auto trigger print dialog after rendering styles
          setTimeout(function() {
            window.print();
          }, 350);
        };
      </script>
    </body>
    </html>
  `);
  printWindow.document.close();
}

/**
 * Opens the interactive Multi-Format Export Modal
 * 
 * @param {Object} options
 * @param {string} options.title - Header title of the report (e.g., 'Attendance Records Export')
 * @param {string} options.filename - Base filename without extension
 * @param {Array<string>} options.headers - Column header names
 * @param {Array<Array<string|number>>} options.rows - Matrix of rows
 * @param {Object} [options.metadata] - Key-value metadata
 * @param {Function} [options.onExport] - Optional hook
 */
export function openExportModal({
  title = 'Attendance Records Export',
  filename = 'AMS_Attendance_Export',
  headers = [],
  rows = [],
  metadata = {},
  onExport = null
} = {}) {
  // If no rows, inform user immediately
  if (!rows || rows.length === 0) {
    if (typeof showToast === 'function') {
      showToast({ title: 'No Data to Export', message: 'There are no records matching your current criteria.', type: 'warning' });
    } else if (toast) {
      toast.show('No records available to export.', 'warning');
    }
    return;
  }

  // Remove existing modal if any
  const existing = document.getElementById('amsExportModalOverlay');
  if (existing) existing.remove();

  let selectedFormat = 'csv'; // default selection

  const overlay = document.createElement('div');
  overlay.id = 'amsExportModalOverlay';
  overlay.className = 'ams-export-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'exportModalTitle');

  overlay.style.cssText = `
    position: fixed;
    inset: 0;
    z-index: 99999;
    background: rgba(7, 19, 36, 0.72);
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
    opacity: 0;
    transition: opacity 0.2s ease-out;
  `;

  overlay.innerHTML = `
    <style>
      .export-card-opt {
        border: 1.5px solid var(--border);
        border-radius: 12px;
        padding: 14px 12px;
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        cursor: pointer;
        background: var(--surface);
        transition: all 0.18s ease;
        position: relative;
        user-select: none;
      }
      .export-card-opt:hover {
        border-color: var(--accent);
        transform: translateY(-2px);
        box-shadow: 0 6px 16px -4px rgba(33, 150, 243, 0.2);
      }
      .export-card-opt.active {
        border-color: var(--accent);
        background: rgba(33, 150, 243, 0.08);
        box-shadow: 0 0 0 1px var(--accent);
      }
      .export-card-opt .check-badge {
        position: absolute;
        top: 8px;
        right: 8px;
        width: 18px;
        height: 18px;
        border-radius: 50%;
        background: var(--accent);
        color: #ffffff;
        display: none;
        align-items: center;
        justify-content: center;
      }
      .export-card-opt.active .check-badge {
        display: flex;
      }
      .export-modal-dialog {
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: 16px;
        box-shadow: 0 24px 50px -12px rgba(13, 71, 161, 0.25);
        width: 100%;
        max-width: 480px;
        overflow: hidden;
        transform: scale(0.96) translateY(6px);
        transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);
      }
    </style>

    <div class="export-modal-dialog">
      <!-- Modal Header -->
      <div style="display:flex; align-items:center; justify-content:space-between; padding:18px 22px; border-bottom:1px solid var(--border);">
        <div style="display:flex; align-items:center; gap:12px;">
          <div style="width:36px; height:36px; border-radius:10px; background:rgba(33, 150, 243, 0.12); color:var(--accent); display:flex; align-items:center; justify-content:center; flex-shrink:0;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
          </div>
          <div>
            <h2 id="exportModalTitle" style="margin:0; font-size:16px; font-weight:700; color:var(--text-1); letter-spacing:-0.01em;">
              Export Records
            </h2>
            <p style="margin:2px 0 0; font-size:12px; color:var(--text-3);">
              Choose file format to export ${rows.length} record${rows.length === 1 ? '' : 's'}
            </p>
          </div>
        </div>

        <button type="button" id="btnExportModalClose" aria-label="Close" style="background:none; border:none; color:var(--text-3); cursor:pointer; padding:6px; border-radius:8px; display:flex; align-items:center; justify-content:center; transition:background 0.15s;">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      <!-- Format Selection Grid -->
      <div style="padding:20px 22px;">
        <label style="display:block; font-size:11.5px; font-weight:700; color:var(--text-2); text-transform:uppercase; letter-spacing:0.06em; margin-bottom:12px;">
          Select Export Format
        </label>

        <div style="display:grid; grid-template-columns: repeat(2, 1fr); gap:12px; margin-bottom:18px;">
          <!-- 1. CSV Option -->
          <div class="export-card-opt active" data-format="csv">
            <div class="check-badge">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <div style="width:38px; height:38px; border-radius:8px; background:rgba(16, 185, 129, 0.12); color:#10B981; display:flex; align-items:center; justify-content:center; margin-bottom:8px;">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/></svg>
            </div>
            <span style="font-size:13px; font-weight:700; color:var(--text-1);">CSV</span>
            <span style="font-size:11px; color:var(--text-3); margin-top:2px;">Raw Data (.csv)</span>
          </div>

          <!-- 2. Excel Option -->
          <div class="export-card-opt" data-format="excel">
            <div class="check-badge">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <div style="width:38px; height:38px; border-radius:8px; background:rgba(5, 150, 105, 0.12); color:#059669; display:flex; align-items:center; justify-content:center; margin-bottom:8px;">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/></svg>
            </div>
            <span style="font-size:13px; font-weight:700; color:var(--text-1);">Excel</span>
            <span style="font-size:11px; color:var(--text-3); margin-top:2px;">Workbook (.xls)</span>
          </div>

          <!-- 3. PDF Option -->
          <div class="export-card-opt" data-format="pdf">
            <div class="check-badge">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <div style="width:38px; height:38px; border-radius:8px; background:rgba(239, 68, 68, 0.12); color:#EF4444; display:flex; align-items:center; justify-content:center; margin-bottom:8px;">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M10 12h4"/><path d="M10 16h4"/></svg>
            </div>
            <span style="font-size:13px; font-weight:700; color:var(--text-1);">PDF</span>
            <span style="font-size:11px; color:var(--text-3); margin-top:2px;">Printable (.pdf)</span>
          </div>

          <!-- 4. Word Option -->
          <div class="export-card-opt" data-format="word">
            <div class="check-badge">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <div style="width:38px; height:38px; border-radius:8px; background:rgba(37, 99, 235, 0.12); color:#2563EB; display:flex; align-items:center; justify-content:center; margin-bottom:8px;">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
            </div>
            <span style="font-size:13px; font-weight:700; color:var(--text-1);">Word</span>
            <span style="font-size:11px; color:var(--text-3); margin-top:2px;">Document (.doc)</span>
          </div>
        </div>

        <!-- File Details Preview -->
        <div style="background:var(--raised); border:1px solid var(--border); border-radius:10px; padding:10px 14px; display:flex; align-items:center; justify-content:space-between; font-size:11.5px;">
          <div style="display:flex; align-items:center; gap:8px;">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" stroke-width="2"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>
            <span style="color:var(--text-2);">Target File:</span>
            <strong id="exportFilenamePreview" style="color:var(--text-1); font-family:monospace;">${filename}.csv</strong>
          </div>
          <span style="color:var(--accent); font-weight:600;">${rows.length} rows</span>
        </div>
      </div>

      <!-- Modal Footer -->
      <div style="display:flex; align-items:center; justify-content:flex-end; gap:10px; padding:16px 22px; border-top:1px solid var(--border); background:var(--surface-hover);">
        <button type="button" id="btnExportModalCancel" style="background:none; border:1px solid var(--border); color:var(--text-2); font-size:13px; font-weight:600; padding:8px 16px; border-radius:8px; cursor:pointer; transition:all 0.15s;">
          Cancel
        </button>
        <button type="button" id="btnExportModalProceed" style="background:linear-gradient(135deg, var(--ch-900) 0%, var(--ch-500) 100%); border:none; color:#ffffff; font-size:13px; font-weight:600; padding:8px 22px; border-radius:8px; cursor:pointer; display:inline-flex; align-items:center; gap:8px; box-shadow:0 2px 8px rgba(33,150,243,0.3); transition:all 0.15s;">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          <span id="btnExportModalProceedText">Export CSV</span>
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const card = overlay.querySelector('.export-modal-dialog');
  const closeBtn = overlay.querySelector('#btnExportModalClose');
  const cancelBtn = overlay.querySelector('#btnExportModalCancel');
  const proceedBtn = overlay.querySelector('#btnExportModalProceed');
  const proceedText = overlay.querySelector('#btnExportModalProceedText');
  const filenamePreview = overlay.querySelector('#exportFilenamePreview');
  const optionCards = overlay.querySelectorAll('.export-card-opt');

  // Entrance animation
  requestAnimationFrame(() => {
    overlay.style.opacity = '1';
    if (card) card.style.transform = 'scale(1) translateY(0)';
  });

  const closeModal = () => {
    overlay.style.opacity = '0';
    if (card) card.style.transform = 'scale(0.96) translateY(6px)';
    window.removeEventListener('keydown', handleKey);
    setTimeout(() => overlay.remove(), 200);
  };

  const handleKey = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeModal();
    }
  };
  window.addEventListener('keydown', handleKey);

  closeBtn?.addEventListener('click', closeModal);
  cancelBtn?.addEventListener('click', closeModal);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal();
  });

  // Format selection logic
  const updateFormatUI = (fmt) => {
    selectedFormat = fmt;
    optionCards.forEach(c => {
      c.classList.toggle('active', c.getAttribute('data-format') === fmt);
    });

    const extMap = { csv: '.csv', excel: '.xls', pdf: '.pdf', word: '.doc' };
    const labelMap = { csv: 'Export CSV', excel: 'Export Excel', pdf: 'Generate PDF', word: 'Export Word' };

    if (filenamePreview) {
      filenamePreview.textContent = `${filename}${extMap[fmt] || '.csv'}`;
    }
    if (proceedText) {
      proceedText.textContent = labelMap[fmt] || 'Export';
    }
  };

  optionCards.forEach(opt => {
    opt.addEventListener('click', () => {
      const fmt = opt.getAttribute('data-format');
      updateFormatUI(fmt);
    });
  });

  // Proceed button execution
  proceedBtn?.addEventListener('click', () => {
    closeModal();

    if (onExport && typeof onExport === 'function') {
      onExport(selectedFormat);
      return;
    }

    try {
      if (selectedFormat === 'csv') {
        generateCsv(filename, headers, rows);
        toastNotify(`CSV export downloaded successfully (${rows.length} rows).`, 'success');
      } else if (selectedFormat === 'excel') {
        generateExcel(filename, headers, rows, title, metadata);
        toastNotify(`Excel workbook downloaded successfully (${rows.length} rows).`, 'success');
      } else if (selectedFormat === 'word') {
        generateWord(filename, headers, rows, title, metadata);
        toastNotify(`Word document downloaded successfully (${rows.length} rows).`, 'success');
      } else if (selectedFormat === 'pdf') {
        generatePdf(filename, headers, rows, title, metadata);
        toastNotify(`PDF preview generated (${rows.length} rows).`, 'info');
      }
    } catch (err) {
      console.error('[AMS Export Engine] Export failed:', err);
      toastNotify('Export failed: ' + (err.message || 'Unknown error'), 'error');
    }
  });

  function toastNotify(msg, type = 'info') {
    if (typeof showToast === 'function') {
      showToast({ title: 'Export', message: msg, type });
    } else if (toast) {
      toast.show(msg, type);
    }
  }
}
