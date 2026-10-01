/**
 * pagination.js - Standardized Interactive Numbered Pagination Component
 * Bestlink College of the Philippines — Attendance Monitoring System (AMS)
 * Subsystem of SMS 1
 *
 * Provides responsive, accessible, dual-theme numbered pagination (< 1 2 3 ... >)
 * for tables across Admin, Teacher, and Student portals.
 */

/**
 * Calculates page numbers to display with smart ellipsis for large page counts
 * @param {number} totalPages Total number of pages
 * @param {number} current Current active page index (0-indexed)
 * @returns {Array<number|string>} Array of page indices and '...' strings
 */
export function getPaginationItems(totalPages, current) {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i);
  }
  const items = [];
  const c = current;
  items.push(0); // Page 1

  let start = Math.max(1, c - 1);
  let end = Math.min(totalPages - 2, c + 1);

  if (c <= 2) {
    end = 3;
  } else if (c >= totalPages - 3) {
    start = totalPages - 4;
  }

  if (start > 1) items.push('...');
  for (let i = start; i <= end; i++) items.push(i);
  if (end < totalPages - 2) items.push('...');
  items.push(totalPages - 1);
  return items;
}

/**
 * Renders interactive page number buttons and updates previous/next states
 * @param {Object} options Configuration options
 * @param {string} [options.containerId='pageNumbersContainer'] Element ID for numbered buttons container
 * @param {string} [options.prevBtnId='prevPageBtn'] Element ID for '<' button
 * @param {string} [options.nextBtnId='nextPageBtn'] Element ID for '>' button
 * @param {string} [options.infoTextId='pageInfoText'] Element ID for info text
 * @param {number} options.totalRecords Total number of filtered records
 * @param {number} [options.pageSize=15] Records per page (default 15)
 * @param {number} [options.currentPage=0] Current active page (0-indexed)
 * @param {Function} options.onPageChange Callback when a page is clicked: (newPage) => {}
 */
export function renderNumberedPagination({
  containerId = 'pageNumbersContainer',
  prevBtnId = 'prevPageBtn',
  nextBtnId = 'nextPageBtn',
  infoTextId = 'pageInfoText',
  totalRecords = 0,
  pageSize = 15,
  currentPage = 0,
  onPageChange = () => {}
}) {
  const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));
  const prevBtn = document.getElementById(prevBtnId);
  const nextBtn = document.getElementById(nextBtnId);
  const numbersContainer = document.getElementById(containerId);
  const infoEl = document.getElementById(infoTextId);

  // Update info text
  if (infoEl) {
    if (totalRecords === 0) {
      infoEl.textContent = 'Showing 0 records';
    } else {
      const startIdx = currentPage * pageSize + 1;
      const endIdx = Math.min((currentPage + 1) * pageSize, totalRecords);
      infoEl.textContent = `Showing ${startIdx} to ${endIdx} of ${totalRecords} records`;
    }
  }

  // Update Previous (<) button
  if (prevBtn) {
    prevBtn.disabled = currentPage <= 0;
    prevBtn.textContent = '<';
    prevBtn.setAttribute('aria-label', 'Previous Page');
    prevBtn.onclick = () => {
      if (currentPage > 0) {
        onPageChange(currentPage - 1);
      }
    };
  }

  // Update Next (>) button
  if (nextBtn) {
    nextBtn.disabled = currentPage >= totalPages - 1;
    nextBtn.textContent = '>';
    nextBtn.setAttribute('aria-label', 'Next Page');
    nextBtn.onclick = () => {
      if (currentPage + 1 < totalPages) {
        onPageChange(currentPage + 1);
      }
    };
  }

  // Render Numbered Page Buttons
  if (!numbersContainer) return;
  numbersContainer.innerHTML = '';

  const items = getPaginationItems(totalPages, currentPage);

  items.forEach(item => {
    if (item === '...') {
      const ellipsis = document.createElement('span');
      ellipsis.className = 'px-1 text-xs font-bold select-none';
      ellipsis.style.color = 'var(--text-3)';
      ellipsis.textContent = '...';
      numbersContainer.appendChild(ellipsis);
    } else {
      const pageIndex = item; // 0-indexed
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `page-num-btn ${pageIndex === currentPage ? 'active' : ''}`;
      btn.textContent = String(pageIndex + 1);
      btn.setAttribute('aria-label', `Page ${pageIndex + 1}`);
      if (pageIndex === currentPage) {
        btn.setAttribute('aria-current', 'page');
      }

      btn.addEventListener('click', () => {
        if (currentPage !== pageIndex) {
          onPageChange(pageIndex);
        }
      });

      numbersContainer.appendChild(btn);
    }
  });
}
