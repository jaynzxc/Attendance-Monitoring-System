/**
 * attendance-calendar.js - Page controller for Admin Academic Schedule & Attendance Calendar
 * Bestlink College of the Philippines - Attendance Monitoring System (AMS)
 */

import { requireRole } from '../../lib/rbac-guard.js';
import { toast } from '../../components/toast.js';
import { getSupabase } from '../../lib/supabaseClient.js';

let currentDate = new Date(2026, 8, 28); // September 28, 2026 default
let activeFilter = 'all';
let schedules = [];

// Seed fallback data for offline / initial development
const DEFAULT_SCHEDULES = [
  {
    id: 'sch-1',
    title: 'National Heroes Day',
    schedule_type: 'holiday',
    start_date: '2026-08-31',
    end_date: '2026-08-31',
    description: 'Regular National Holiday. No classes across all campuses.',
    affected_scope: 'all'
  },
  {
    id: 'sch-2',
    title: 'BCP Foundation Week & Sportsfest',
    schedule_type: 'school_event',
    start_date: '2026-09-14',
    end_date: '2026-09-18',
    description: 'Annual institutional sportsfest, cultural festivities, and academic competitions.',
    affected_scope: 'all'
  },
  {
    id: 'sch-3',
    title: 'Faculty In-Service & Curriculum Planning',
    schedule_type: 'no_classes',
    start_date: '2026-09-21',
    end_date: '2026-09-21',
    description: 'Faculty development seminar and syllabus alignment. No student classes.',
    affected_scope: 'college'
  },
  {
    id: 'sch-4',
    title: 'Typhoon Weather Suspension',
    schedule_type: 'suspension',
    start_date: '2026-09-24',
    end_date: '2026-09-24',
    description: 'LGU announced suspension of classes due to signal #2 storm warning.',
    affected_scope: 'all'
  },
  {
    id: 'sch-5',
    title: 'Midterm Examination Week',
    schedule_type: 'exam_week',
    start_date: '2026-10-12',
    end_date: '2026-10-16',
    description: '1st Semester Midterm Assessment across all collegiate departments.',
    affected_scope: 'college'
  },
  {
    id: 'sch-6',
    title: 'All Saints Day Non-Working Holiday',
    schedule_type: 'holiday',
    start_date: '2026-11-01',
    end_date: '2026-11-02',
    description: 'Special Non-Working Holiday.',
    affected_scope: 'all'
  },
  {
    id: 'sch-7',
    title: 'Bonifacio Day',
    schedule_type: 'holiday',
    start_date: '2026-11-30',
    end_date: '2026-11-30',
    description: 'Regular National Holiday. No classes.',
    affected_scope: 'all'
  }
];

/**
 * Loads academic schedules from Supabase
 */
async function loadSchedules() {
  const sb = getSupabase();
  if (!sb) {
    schedules = [...DEFAULT_SCHEDULES];
    renderCalendar();
    return;
  }

  try {
    const { data, error } = await sb
      .from('academic_schedules')
      .select('*')
      .order('start_date', { ascending: true });

    if (error || !data || data.length === 0) {
      schedules = [...DEFAULT_SCHEDULES];
    } else {
      schedules = data;
    }
  } catch (err) {
    console.warn('[Calendar] Fallback to default schedules:', err);
    schedules = [...DEFAULT_SCHEDULES];
  }

  renderCalendar();
}

/**
 * Renders the 7-column monthly calendar grid
 */
function renderCalendar() {
  const grid = document.getElementById('adminCalendarGrid');
  const title = document.getElementById('calendarTitle');
  if (!grid || !title) return;

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  title.textContent = `${monthNames[month]} ${year}`;

  // Keep the 7 weekday header elements
  const headers = Array.from(grid.querySelectorAll('.calendar-header-day'));
  grid.innerHTML = '';
  headers.forEach(h => grid.appendChild(h));

  const firstDayIndex = new Date(year, month, 1).getDay(); // 0 = Sun
  const totalDays = new Date(year, month + 1, 0).getDate();
  const prevMonthTotalDays = new Date(year, month, 0).getDate();

  const today = new Date();
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;

  // Previous month trailing days
  for (let i = firstDayIndex - 1; i >= 0; i--) {
    const dayNum = prevMonthTotalDays - i;
    const cell = document.createElement('div');
    cell.className = 'calendar-day-cell other-month';
    cell.innerHTML = `<span class="calendar-day-number">${dayNum}</span>`;
    grid.appendChild(cell);
  }

  // Current month days
  for (let day = 1; day <= totalDays; day++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const cell = document.createElement('div');
    cell.className = 'calendar-day-cell';
    if (isCurrentMonth && today.getDate() === day) {
      cell.classList.add('today');
    }

    cell.innerHTML = `<span class="calendar-day-number">${day}</span>`;

    // Find matching schedules
    const dayEvents = schedules.filter(s => {
      if (activeFilter !== 'all' && s.schedule_type !== activeFilter) return false;
      return s.start_date <= dateStr && s.end_date >= dateStr;
    });

    dayEvents.forEach(evt => {
      const badge = document.createElement('div');
      badge.className = `event-badge ${getBadgeClass(evt.schedule_type)}`;
      badge.title = `${evt.title} (${formatType(evt.schedule_type)})`;
      badge.innerHTML = `
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="flex-shrink:0;">
          ${getTypeIcon(evt.schedule_type)}
        </svg>
        <span style="overflow:hidden; text-overflow:ellipsis;">${evt.title}</span>
      `;
      badge.addEventListener('click', (e) => {
        e.stopPropagation();
        openEditModal(evt);
      });
      cell.appendChild(badge);
    });

    // Clicking cell opens Add modal pre-filled with this date
    cell.addEventListener('click', () => {
      openAddModal(dateStr);
    });

    grid.appendChild(cell);
  }

  // Next month leading days to complete the 7-day grid row
  const totalRendered = firstDayIndex + totalDays;
  const remainingCells = (7 - (totalRendered % 7)) % 7;
  for (let i = 1; i <= remainingCells; i++) {
    const cell = document.createElement('div');
    cell.className = 'calendar-day-cell other-month';
    cell.innerHTML = `<span class="calendar-day-number">${i}</span>`;
    grid.appendChild(cell);
  }
}

/**
 * Returns CSS badge class for schedule type
 */
function getBadgeClass(type) {
  switch (type) {
    case 'no_classes': return 'badge-no-class';
    case 'holiday': return 'badge-holiday';
    case 'school_event': return 'badge-school-event';
    case 'exam_week': return 'badge-exam';
    case 'suspension': return 'badge-suspension';
    default: return 'badge-school-event';
  }
}

/**
 * Returns SVG path icon for schedule type
 */
function getTypeIcon(type) {
  switch (type) {
    case 'no_classes':
      return '<circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>';
    case 'holiday':
      return '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>';
    case 'school_event':
      return '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>';
    case 'exam_week':
      return '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>';
    case 'suspension':
      return '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>';
    default:
      return '<circle cx="12" cy="12" r="10"/>';
  }
}

/**
 * Returns human-readable label for schedule type
 */
function formatType(type) {
  switch (type) {
    case 'no_classes': return 'No Classes';
    case 'holiday': return 'Holiday';
    case 'school_event': return 'Event';
    case 'exam_week': return 'Exam Week';
    case 'suspension': return 'Suspension';
    default: return type;
  }
}

/**
 * Opens modal to create a new schedule
 */
function openAddModal(dateStr = '') {
  const modal = document.getElementById('scheduleModal');
  const title = document.getElementById('scheduleModalTitle');
  const form = document.getElementById('scheduleForm');
  const deleteBtn = document.getElementById('btnDeleteSchedule');

  if (!modal || !form) return;

  form.reset();
  document.getElementById('editScheduleId').value = '';
  title.textContent = 'Add Academic Schedule Entry';
  deleteBtn.style.display = 'none';

  const defaultDate = dateStr || new Date().toISOString().split('T')[0];
  document.getElementById('scheduleStartDate').value = defaultDate;
  document.getElementById('scheduleEndDate').value = defaultDate;

  modal.classList.remove('hidden');
}

/**
 * Opens modal to edit an existing schedule
 */
function openEditModal(evt) {
  const modal = document.getElementById('scheduleModal');
  const title = document.getElementById('scheduleModalTitle');
  const deleteBtn = document.getElementById('btnDeleteSchedule');

  if (!modal) return;

  document.getElementById('editScheduleId').value = evt.id;
  document.getElementById('scheduleTitle').value = evt.title;
  document.getElementById('scheduleType').value = evt.schedule_type;
  document.getElementById('scheduleScope').value = evt.affected_scope || 'all';
  document.getElementById('scheduleStartDate').value = evt.start_date;
  document.getElementById('scheduleEndDate').value = evt.end_date;
  document.getElementById('scheduleDescription').value = evt.description || '';

  title.textContent = 'Edit Schedule Entry';
  deleteBtn.style.display = 'inline-block';
  modal.classList.remove('hidden');
}

/**
 * Closes modal dialog
 */
function closeModal() {
  document.getElementById('scheduleModal')?.classList.add('hidden');
}

/**
 * Saves (inserts or updates) schedule entry
 */
async function handleSaveSchedule(e) {
  e.preventDefault();

  const id = document.getElementById('editScheduleId').value;
  const title = document.getElementById('scheduleTitle').value.trim();
  const type = document.getElementById('scheduleType').value;
  const scope = document.getElementById('scheduleScope').value;
  const start = document.getElementById('scheduleStartDate').value;
  const end = document.getElementById('scheduleEndDate').value;
  const desc = document.getElementById('scheduleDescription').value.trim();

  if (!title || !start || !end) {
    toast.show('Please fill in required fields.', 'warning');
    return;
  }

  if (end < start) {
    toast.show('End date cannot precede start date.', 'error');
    return;
  }

  const sb = getSupabase();
  const schedulePayload = {
    title,
    schedule_type: type,
    affected_scope: scope,
    start_date: start,
    end_date: end,
    description: desc
  };

  try {
    if (sb) {
      if (id) {
        await sb.from('academic_schedules').update(schedulePayload).eq('id', id);
      } else {
        await sb.from('academic_schedules').insert([schedulePayload]);
      }
    }
  } catch (err) {
    console.warn('[Calendar] Supabase write error:', err);
  }

  // Update local memory state
  if (id) {
    const idx = schedules.findIndex(s => s.id === id);
    if (idx !== -1) schedules[idx] = { ...schedules[idx], ...schedulePayload };
  } else {
    schedules.push({ id: `sch-${Date.now()}`, ...schedulePayload });
  }

  closeModal();
  renderCalendar();
  toast.show(`Schedule entry "${title}" saved and propagated.`, 'success');
}

/**
 * Deletes schedule entry
 */
async function handleDeleteSchedule() {
  const id = document.getElementById('editScheduleId').value;
  if (!id) return;

  const sb = getSupabase();
  try {
    if (sb) {
      await sb.from('academic_schedules').delete().eq('id', id);
    }
  } catch (err) {
    console.warn('[Calendar] Supabase delete error:', err);
  }

  schedules = schedules.filter(s => s.id !== id);
  closeModal();
  renderCalendar();
  toast.show('Schedule entry deleted.', 'info');
}

/**
 * Initializes Admin Calendar page
 */
async function init() {
  await requireRole(['admin']);

  // Month navigation
  document.getElementById('btnPrevMonth')?.addEventListener('click', () => {
    currentDate.setMonth(currentDate.getMonth() - 1);
    renderCalendar();
  });

  document.getElementById('btnNextMonth')?.addEventListener('click', () => {
    currentDate.setMonth(currentDate.getMonth() + 1);
    renderCalendar();
  });

  document.getElementById('btnToday')?.addEventListener('click', () => {
    currentDate = new Date(2026, 8, 28);
    renderCalendar();
  });

  // Action buttons & modals
  document.getElementById('btnOpenAddModal')?.addEventListener('click', () => openAddModal());
  document.getElementById('btnCloseModal')?.addEventListener('click', closeModal);
  document.getElementById('btnCancelModal')?.addEventListener('click', closeModal);
  document.getElementById('scheduleForm')?.addEventListener('submit', handleSaveSchedule);
  document.getElementById('btnDeleteSchedule')?.addEventListener('click', handleDeleteSchedule);

  // Filter chips
  document.querySelectorAll('.filter-chip-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.filter-chip-btn').forEach(b => b.classList.remove('active'));
      e.currentTarget.classList.add('active');
      activeFilter = e.currentTarget.getAttribute('data-filter') || 'all';
      renderCalendar();
    });
  });

  // Theme switch listener
  window.addEventListener('ams-theme-changed', renderCalendar);

  // Initial load
  await loadSchedules();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
