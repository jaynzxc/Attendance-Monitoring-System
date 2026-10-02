/**
 * attendance-calendar.js - Page controller for Admin Academic Schedule & Attendance Calendar
 * Bestlink College of the Philippines - Attendance Monitoring System (AMS)
 */

import { requireRole } from '../../lib/rbac-guard.js';
import { toast } from '../../components/toast.js';
import { getSupabase } from '../../lib/supabaseClient.js';

let currentDate = new Date(); // Defaults to actual current date
let activeFilter = 'all';
let schedules = [];

// Official Philippine Regular & Special Non-Working Holidays (Academic Calendar)
const DEFAULT_SCHEDULES = [
  // January
  {
    id: 'ph-hol-1',
    title: "New Year's Day",
    schedule_type: 'holiday',
    start_date: '2026-01-01',
    end_date: '2026-01-01',
    description: 'Regular National Holiday. No classes.',
    affected_scope: 'all'
  },
  // February
  {
    id: 'ph-hol-2',
    title: 'Chinese New Year',
    schedule_type: 'holiday',
    start_date: '2026-02-17',
    end_date: '2026-02-17',
    description: 'Special Non-Working Holiday.',
    affected_scope: 'all'
  },
  {
    id: 'ph-hol-3',
    title: 'EDSA People Power Revolution',
    schedule_type: 'holiday',
    start_date: '2026-02-25',
    end_date: '2026-02-25',
    description: 'Special National Observance.',
    affected_scope: 'all'
  },
  // April (Holy Week & Day of Valor)
  {
    id: 'ph-hol-4',
    title: 'Maundy Thursday',
    schedule_type: 'holiday',
    start_date: '2026-04-02',
    end_date: '2026-04-02',
    description: 'Regular National Holiday. Holy Week observance.',
    affected_scope: 'all'
  },
  {
    id: 'ph-hol-5',
    title: 'Good Friday',
    schedule_type: 'holiday',
    start_date: '2026-04-03',
    end_date: '2026-04-03',
    description: 'Regular National Holiday. Holy Week observance.',
    affected_scope: 'all'
  },
  {
    id: 'ph-hol-6',
    title: 'Black Saturday',
    schedule_type: 'holiday',
    start_date: '2026-04-04',
    end_date: '2026-04-04',
    description: 'Special Non-Working Holiday.',
    affected_scope: 'all'
  },
  {
    id: 'ph-hol-7',
    title: 'Araw ng Kagitingan (Day of Valor)',
    schedule_type: 'holiday',
    start_date: '2026-04-09',
    end_date: '2026-04-09',
    description: 'Regular National Holiday.',
    affected_scope: 'all'
  },
  // May
  {
    id: 'ph-hol-8',
    title: 'Labor Day',
    schedule_type: 'holiday',
    start_date: '2026-05-01',
    end_date: '2026-05-01',
    description: 'Regular National Holiday. No classes.',
    affected_scope: 'all'
  },
  // June
  {
    id: 'ph-hol-9',
    title: 'Philippine Independence Day',
    schedule_type: 'holiday',
    start_date: '2026-06-12',
    end_date: '2026-06-12',
    description: 'Regular National Holiday.',
    affected_scope: 'all'
  },
  // August
  {
    id: 'ph-hol-10',
    title: 'Ninoy Aquino Day',
    schedule_type: 'holiday',
    start_date: '2026-08-21',
    end_date: '2026-08-21',
    description: 'Special Non-Working Holiday.',
    affected_scope: 'all'
  },
  {
    id: 'ph-hol-11',
    title: 'National Heroes Day',
    schedule_type: 'holiday',
    start_date: '2026-08-31',
    end_date: '2026-08-31',
    description: 'Regular National Holiday. No classes across all campuses.',
    affected_scope: 'all'
  },
  // September
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
  // October
  {
    id: 'sch-5',
    title: 'Midterm Examination Week',
    schedule_type: 'exam_week',
    start_date: '2026-10-12',
    end_date: '2026-10-16',
    description: '1st Semester Midterm Assessment across all collegiate departments.',
    affected_scope: 'college'
  },
  // November
  {
    id: 'ph-hol-12',
    title: "All Saints' Day",
    schedule_type: 'holiday',
    start_date: '2026-11-01',
    end_date: '2026-11-01',
    description: 'Special Non-Working Holiday.',
    affected_scope: 'all'
  },
  {
    id: 'ph-hol-13',
    title: "All Souls' Day",
    schedule_type: 'holiday',
    start_date: '2026-11-02',
    end_date: '2026-11-02',
    description: 'Special Non-Working Holiday.',
    affected_scope: 'all'
  },
  {
    id: 'ph-hol-14',
    title: 'Bonifacio Day',
    schedule_type: 'holiday',
    start_date: '2026-11-30',
    end_date: '2026-11-30',
    description: 'Regular National Holiday. No classes.',
    affected_scope: 'all'
  },
  // December
  {
    id: 'ph-hol-15',
    title: 'Feast of the Immaculate Conception',
    schedule_type: 'holiday',
    start_date: '2026-12-08',
    end_date: '2026-12-08',
    description: 'Special Non-Working Holiday.',
    affected_scope: 'all'
  },
  {
    id: 'ph-hol-16',
    title: 'Christmas Eve',
    schedule_type: 'holiday',
    start_date: '2026-12-24',
    end_date: '2026-12-24',
    description: 'Special Non-Working Holiday.',
    affected_scope: 'all'
  },
  {
    id: 'ph-hol-17',
    title: 'Christmas Day',
    schedule_type: 'holiday',
    start_date: '2026-12-25',
    end_date: '2026-12-25',
    description: 'Regular National Holiday. Maligayang Pasko!',
    affected_scope: 'all'
  },
  {
    id: 'ph-hol-18',
    title: 'Rizal Day',
    schedule_type: 'holiday',
    start_date: '2026-12-30',
    end_date: '2026-12-30',
    description: 'Regular National Holiday in honor of Dr. Jose Rizal.',
    affected_scope: 'all'
  },
  {
    id: 'ph-hol-19',
    title: 'Last Day of the Year',
    schedule_type: 'holiday',
    start_date: '2026-12-31',
    end_date: '2026-12-31',
    description: 'Special Non-Working Holiday.',
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
      // Merge official Philippine holidays into schedules so they always appear
      const existingTitles = new Set(data.map(d => d.title.toLowerCase()));
      const missingDefaults = DEFAULT_SCHEDULES.filter(d => !existingTitles.has(d.title.toLowerCase()));
      schedules = [...data, ...missingDefaults];
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
    const dayDate = new Date(year, month, day);
    const dayOfWeek = dayDate.getDay(); // 0 = Sunday
    const isSunday = dayOfWeek === 0;
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const cell = document.createElement('div');
    cell.className = 'calendar-day-cell';
    if (isSunday) {
      cell.classList.add('sunday-no-class');
    }
    if (isCurrentMonth && today.getDate() === day) {
      cell.classList.add('today');
    }

    cell.innerHTML = `<span class="calendar-day-number">${day}</span>`;

    // 1. If Sunday, automatically render "No Classes" badge
    if (isSunday) {
      const sundayBadge = document.createElement('div');
      sundayBadge.className = 'event-badge badge-no-class';
      sundayBadge.title = 'Sunday — Non-instructional day (No Classes)';
      sundayBadge.innerHTML = `
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="flex-shrink:0;">
          <circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
        </svg>
        <span>No Classes</span>
      `;
      cell.appendChild(sundayBadge);
    }

    // 2. Find matching schedules / holidays
    const dayEvents = schedules.filter(s => {
      return s.start_date <= dateStr && s.end_date >= dateStr;
    });

    dayEvents.forEach(evt => {
      const badge = document.createElement('div');
      badge.className = `event-badge ${getBadgeClass(evt.schedule_type)}`;
      badge.title = `${evt.title} (${formatType(evt.schedule_type)}) — Click to view details`;
      badge.innerHTML = `
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="flex-shrink:0;">
          ${getTypeIcon(evt.schedule_type)}
        </svg>
        <span style="overflow:hidden; text-overflow:ellipsis;">${evt.title}</span>
      `;
      badge.addEventListener('click', (e) => {
        e.stopPropagation();
        openDateDetailsModal(dateStr, isSunday, dayEvents);
      });
      cell.appendChild(badge);
    });

    // Clicking calendar cell opens Date & Schedule Details modal
    cell.title = `View schedule and attendance details for ${dateStr}`;
    cell.addEventListener('click', () => {
      openDateDetailsModal(dateStr, isSunday, dayEvents);
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
 * Escapes HTML characters defensively
 */
function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/[&<>"']/g, (m) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[m]);
}

/**
 * Formats YYYY-MM-DD into a human-readable full date string
 */
function formatFullDate(dateStr) {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length < 3) return dateStr;
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  const d = new Date(year, month, day);
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });
}

/**
 * Returns human-readable label for affected scope
 */
function formatScope(scope) {
  switch (scope) {
    case 'all': return 'All Campuses & Departments';
    case 'college': return 'College Department Only';
    case 'shs': return 'Senior High School Only';
    case 'faculty_only': return 'Faculty In-Service Only';
    default: return scope || 'All Campuses & Departments';
  }
}

let selectedDateForDetails = '';

/**
 * Opens Date & Schedule Details modal to inspect policies and events for a date
 */
function openDateDetailsModal(dateStr, isSunday, dayEvents = []) {
  selectedDateForDetails = dateStr;
  const modal = document.getElementById('dateDetailsModal');
  const title = document.getElementById('dateDetailsTitle');
  const banner = document.getElementById('dateDetailsStatusBanner');
  const eventsList = document.getElementById('dateDetailsEventsList');

  if (!modal) return;

  const formattedDate = formatFullDate(dateStr);
  if (title) title.textContent = formattedDate;

  // Determine policy banner
  const hasHoliday = dayEvents.some(e => e.schedule_type === 'holiday');
  const hasSuspension = dayEvents.some(e => e.schedule_type === 'suspension');
  const hasNoClass = dayEvents.some(e => e.schedule_type === 'no_classes');
  const hasExam = dayEvents.some(e => e.schedule_type === 'exam_week');

  if (banner) {
    if (isSunday) {
      banner.innerHTML = `
        <div style="background:rgba(239, 68, 68, 0.08); border:1px solid rgba(239, 68, 68, 0.25); border-radius:10px; padding:12px 14px; display:flex; align-items:flex-start; gap:12px;">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" style="flex-shrink:0; margin-top:2px;">
            <circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
          </svg>
          <div>
            <div style="font-size:13.5px; font-weight:700; color:#ef4444;">Sunday — Weekly Non-Instructional Day</div>
            <div style="font-size:12px; color:var(--text-2); margin-top:3px; line-height:1.4;">
              Campus gates and turnstiles do not monitor compulsory attendance. Automated absence processing is suspended.
            </div>
          </div>
        </div>
      `;
    } else if (hasHoliday || hasSuspension || hasNoClass) {
      const label = hasHoliday ? 'Legal / National Holiday' : (hasSuspension ? 'Weather / Calamity Suspension' : 'No Classes (Break / In-Service)');
      const color = hasHoliday ? '#10b981' : (hasSuspension ? '#ea580c' : '#ef4444');
      banner.innerHTML = `
        <div style="background:rgba(16, 185, 129, 0.08); border:1px solid rgba(16, 185, 129, 0.25); border-radius:10px; padding:12px 14px; display:flex; align-items:flex-start; gap:12px;">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" style="flex-shrink:0; margin-top:2px;">
            <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
          </svg>
          <div>
            <div style="font-size:13.5px; font-weight:700; color:${color};">${label}</div>
            <div style="font-size:12px; color:var(--text-2); margin-top:3px; line-height:1.4;">
              Institutional class schedule is suspended. Students and faculty are excused from standard ingress time cutoffs.
            </div>
          </div>
        </div>
      `;
    } else if (hasExam) {
      banner.innerHTML = `
        <div style="background:rgba(147, 51, 234, 0.08); border:1px solid rgba(147, 51, 234, 0.25); border-radius:10px; padding:12px 14px; display:flex; align-items:flex-start; gap:12px;">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#9333ea" stroke-width="2" style="flex-shrink:0; margin-top:2px;">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
          </svg>
          <div>
            <div style="font-size:13.5px; font-weight:700; color:#9333ea;">Examination Period Active</div>
            <div style="font-size:12px; color:var(--text-2); margin-top:3px; line-height:1.4;">
              Major assessment period across collegiate departments. Standard gate turnstile check-ins and proctored examination rules apply.
            </div>
          </div>
        </div>
      `;
    } else {
      banner.innerHTML = `
        <div style="background:rgba(33, 150, 243, 0.08); border:1px solid rgba(33, 150, 243, 0.25); border-radius:10px; padding:12px 14px; display:flex; align-items:flex-start; gap:12px;">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2196f3" stroke-width="2" style="flex-shrink:0; margin-top:2px;">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
          </svg>
          <div>
            <div style="font-size:13.5px; font-weight:700; color:var(--primary);">Regular Class Day</div>
            <div style="font-size:12px; color:var(--text-2); margin-top:3px; line-height:1.4;">
              Standard instructional day. Morning gate cutoff 08:00 AM. RFID and QR check-ins actively record on-time and tardy attendance.
            </div>
          </div>
        </div>
      `;
    }
  }

  // Populate events list
  if (eventsList) {
    if (dayEvents.length === 0) {
      eventsList.innerHTML = `
        <div style="text-align:center; padding:22px 16px; background:var(--raised); border-radius:10px; border:1px dashed var(--border); color:var(--text-3); font-size:12px;">
          No special events, exam periods, or class suspensions scheduled on this date.
        </div>
      `;
    } else {
      eventsList.innerHTML = '';
      dayEvents.forEach(evt => {
        const card = document.createElement('div');
        card.style.cssText = 'background:var(--raised); border:1px solid var(--border); border-radius:10px; padding:12px 14px; display:flex; flex-direction:column; gap:8px;';

        const isMultiDay = evt.start_date !== evt.end_date;
        const durationText = isMultiDay 
          ? `${evt.start_date} to ${evt.end_date} (Multi-Day Period)`
          : `Single Date (${evt.start_date})`;

        card.innerHTML = `
          <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:10px;">
            <div>
              <div style="font-size:13.5px; font-weight:700; color:var(--text-1);">${escapeHtml(evt.title)}</div>
              <div style="display:flex; align-items:center; gap:8px; margin-top:4px; flex-wrap:wrap;">
                <span class="event-badge ${getBadgeClass(evt.schedule_type)}" style="display:inline-flex; align-items:center; gap:4px; font-size:11px; padding:2px 8px;">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    ${getTypeIcon(evt.schedule_type)}
                  </svg>
                  <span>${formatType(evt.schedule_type)}</span>
                </span>
                <span style="font-size:11.5px; color:var(--text-3); font-weight:500;">
                  Scope: ${formatScope(evt.affected_scope)}
                </span>
              </div>
            </div>
            <div style="display:flex; align-items:center; gap:6px; flex-shrink:0;">
              <button type="button" class="pillbtn btn-edit-entry" style="padding:4px 8px; font-size:11px; display:inline-flex; align-items:center; gap:4px;" title="Edit this entry">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                Edit
              </button>
            </div>
          </div>
          <div style="font-size:12px; color:var(--text-2); display:flex; align-items:center; gap:6px;">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            <span>${durationText}</span>
          </div>
          ${evt.description ? `
            <div style="font-size:12px; color:var(--text-2); background:var(--surface); border:1px solid var(--border); border-radius:6px; padding:8px 10px; line-height:1.4;">
              ${escapeHtml(evt.description)}
            </div>
          ` : ''}
        `;

        card.querySelector('.btn-edit-entry')?.addEventListener('click', () => {
          closeDateDetailsModal();
          openEditModal(evt);
        });

        eventsList.appendChild(card);
      });
    }
  }

  modal.classList.remove('hidden');
}

/**
 * Closes Date Details modal
 */
function closeDateDetailsModal() {
  document.getElementById('dateDetailsModal')?.classList.add('hidden');
}

let currentDateMode = 'single';

/**
 * Switches date mode between 'single' (1 date picker) and 'range' (2 date pickers)
 */
function setDateMode(mode) {
  currentDateMode = mode;
  const btnSingle = document.getElementById('btnDateModeSingle');
  const btnRange = document.getElementById('btnDateModeRange');
  const container = document.getElementById('datePickersContainer');
  const lblStart = document.getElementById('lblStartDate');
  const endGroup = document.getElementById('endDateGroup');
  const startInput = document.getElementById('scheduleStartDate');
  const endInput = document.getElementById('scheduleEndDate');

  if (mode === 'single') {
    btnSingle?.classList.add('active');
    btnRange?.classList.remove('active');
    if (container) container.style.gridTemplateColumns = '1fr';
    if (lblStart) lblStart.textContent = 'Date *';
    if (endGroup) endGroup.style.display = 'none';
    if (endInput) {
      endInput.removeAttribute('required');
      if (startInput) endInput.value = startInput.value;
    }
  } else {
    btnSingle?.classList.remove('active');
    btnRange?.classList.add('active');
    if (container) container.style.gridTemplateColumns = '1fr 1fr';
    if (lblStart) lblStart.textContent = 'Start Date *';
    if (endGroup) endGroup.style.display = 'block';
    if (endInput) {
      endInput.setAttribute('required', 'required');
      if (!endInput.value && startInput) {
        endInput.value = startInput.value;
      }
    }
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

  // Default to single date mode for single-day schedule entries
  setDateMode('single');

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

  // Detect mode based on whether start_date equals end_date
  if (evt.start_date && evt.end_date && evt.start_date !== evt.end_date) {
    setDateMode('range');
  } else {
    setDateMode('single');
  }

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
  let end = document.getElementById('scheduleEndDate').value;
  const desc = document.getElementById('scheduleDescription').value.trim();

  // If single date mode, end date matches start date automatically
  if (currentDateMode === 'single') {
    end = start;
  }

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
    currentDate = new Date();
    renderCalendar();
  });

  // Action buttons & modals
  document.getElementById('btnOpenAddModal')?.addEventListener('click', () => openAddModal());
  document.getElementById('btnCloseModal')?.addEventListener('click', closeModal);
  document.getElementById('btnCancelModal')?.addEventListener('click', closeModal);
  document.getElementById('scheduleForm')?.addEventListener('submit', handleSaveSchedule);
  document.getElementById('btnDeleteSchedule')?.addEventListener('click', handleDeleteSchedule);

  // Date details modal controls
  document.getElementById('btnCloseDateDetails')?.addEventListener('click', closeDateDetailsModal);
  document.getElementById('btnCloseDetailsBtn')?.addEventListener('click', closeDateDetailsModal);
  document.getElementById('btnAddScheduleFromDetails')?.addEventListener('click', () => {
    const targetDate = selectedDateForDetails;
    closeDateDetailsModal();
    openAddModal(targetDate);
  });

  // Backdrop clicks to close modals
  document.getElementById('dateDetailsModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'dateDetailsModal') {
      closeDateDetailsModal();
    }
  });
  document.getElementById('scheduleModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'scheduleModal') {
      closeModal();
    }
  });

  // Date duration mode toggle buttons (Single Date vs Date Range)
  document.getElementById('btnDateModeSingle')?.addEventListener('click', () => setDateMode('single'));
  document.getElementById('btnDateModeRange')?.addEventListener('click', () => setDateMode('range'));

  // Sync date input in single mode
  document.getElementById('scheduleStartDate')?.addEventListener('input', (e) => {
    if (currentDateMode === 'single') {
      const endInput = document.getElementById('scheduleEndDate');
      if (endInput) endInput.value = e.target.value;
    }
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
