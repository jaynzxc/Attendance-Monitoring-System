/**
 * attendance-calendar.js - Student Monthly Attendance Calendar Controller
 * Bestlink College of the Philippines - Attendance Monitoring System (AMS)
 * Authoritative Reference: docs/UI-UX_Architecture.md, docs/WORKFLOW.md
 * Matches Admin Academic Schedule & Ingress Protocol 100%
 */

import { requireRole } from '../../lib/rbac-guard.js';
import { getCurrentUser } from '../../lib/auth.js';
import { attendanceApi } from '../../api/attendanceApi.js';
import { getSupabase } from '../../lib/supabaseClient.js';
import { showToast } from '../../components/toast.js';

let currentStudent = null;
let currentYear = new Date().getFullYear();
let currentMonth = new Date().getMonth(); // 0-indexed (0 = Jan)
let monthlySummaries = new Map();
let monthlyLogs = new Map();
let schedules = [];

// Official Philippine Regular & Special Non-Working Holidays + Academic Milestones (matching Admin Calendar)
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
 * Normalizes any Date or string to YYYY-MM-DD
 */
function toDateStr(d) {
  if (!d) return '';
  if (typeof d === 'string') {
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
    const dt = new Date(d);
    if (!isNaN(dt.getTime())) {
      const year = dt.getFullYear();
      const month = String(dt.getMonth() + 1).padStart(2, '0');
      const day = String(dt.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
    return d.split('T')[0];
  }
  if (d instanceof Date) {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  return String(d).slice(0, 10);
}

function fmtTime(date) {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Enforce Student Role Guard
  await requireRole(['student']);

  // 2. Fetch authenticated student profile
  currentStudent = await getCurrentUser() || {
    id: 'c0000000-0000-0000-0000-000000000001',
    first_name: 'Juan',
    last_name: 'Dela Cruz',
    student_number: 's230110001',
    role: 'student'
  };

  // 3. Setup Navigation Buttons
  initNavigation();

  // 4. Setup Day Detail Modal
  initDayModal();

  // 5. Render Initial Calendar
  await loadAndRenderCalendar();
});

function initNavigation() {
  const prevBtn = document.getElementById('prevMonthBtn');
  const nextBtn = document.getElementById('nextMonthBtn');
  const todayBtn = document.getElementById('currentMonthBtn');

  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      currentMonth--;
      if (currentMonth < 0) {
        currentMonth = 11;
        currentYear--;
      }
      loadAndRenderCalendar();
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      currentMonth++;
      if (currentMonth > 11) {
        currentMonth = 0;
        currentYear++;
      }
      loadAndRenderCalendar();
    });
  }

  if (todayBtn) {
    todayBtn.addEventListener('click', () => {
      currentYear = new Date().getFullYear();
      currentMonth = new Date().getMonth();
      loadAndRenderCalendar();
    });
  }
}

async function loadAndRenderCalendar() {
  const monthTitle = document.getElementById('calendarMonthTitle');
  const grid = document.getElementById('calendarGrid');

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  if (monthTitle) {
    monthTitle.textContent = `${monthNames[currentMonth]} ${currentYear}`;
  }

  // Calculate Date Boundaries
  const firstDayOfMonth = new Date(currentYear, currentMonth, 1);
  const lastDayOfMonth = new Date(currentYear, currentMonth + 1, 0);
  const startDateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-01`;
  const endDateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(lastDayOfMonth.getDate()).padStart(2, '0')}`;

  try {
    const sb = getSupabase();

    // 1. Load Academic Schedules (Holidays, Exam Week, Events) matching Admin Panel
    if (sb) {
      try {
        const { data: dbSchedules, error: schedError } = await sb
          .from('academic_schedules')
          .select('*')
          .order('start_date', { ascending: true });

        if (!schedError && dbSchedules && dbSchedules.length > 0) {
          const isCovered = (def) => {
            const defStart = toDateStr(def.start_date);
            const defEnd = toDateStr(def.end_date || def.start_date);
            const defTitle = (def.title || '').toLowerCase().trim();
            return dbSchedules.some(db => {
              const dbStart = toDateStr(db.start_date);
              const dbEnd = toDateStr(db.end_date || db.start_date);
              const dbTitle = (db.title || '').toLowerCase().trim();
              if (dbTitle === defTitle) return true;
              if (dbTitle.includes('midterm') && defTitle.includes('midterm')) return true;
              if (dbTitle.includes('foundation') && defTitle.includes('foundation')) return true;
              if (dbTitle.includes('bonifacio') && defTitle.includes('bonifacio')) return true;
              if (db.schedule_type === def.schedule_type && dbStart <= defEnd && dbEnd >= defStart) return true;
              return false;
            });
          };
          const missingDefaults = DEFAULT_SCHEDULES.filter(d => !isCovered(d));
          schedules = [...dbSchedules, ...missingDefaults];
        } else {
          schedules = [...DEFAULT_SCHEDULES];
        }
      } catch (err) {
        console.warn('[Calendar] Fallback to default schedules:', err);
        schedules = [...DEFAULT_SCHEDULES];
      }
    } else {
      schedules = [...DEFAULT_SCHEDULES];
    }

    // 2. Fetch student specific attendance logs for current month
    monthlyLogs.clear();
    monthlySummaries.clear();

    if (sb && currentStudent?.id) {
      try {
        const { data: logs } = await sb
          .from('attendance_logs')
          .select('id, scanned_at, status, scan_method, event_type, entrance_device_id')
          .eq('student_id', currentStudent.id)
          .gte('scanned_at', `${startDateStr}T00:00:00.000Z`)
          .lte('scanned_at', `${endDateStr}T23:59:59.999Z`)
          .order('scanned_at', { ascending: true });

        (logs || []).forEach(l => {
          const d = toDateStr(l.scanned_at);
          // Keep the primary daily record
          if (!monthlyLogs.has(d) || l.status === 'present') {
            monthlyLogs.set(d, l);
          }
        });

        // 3. Fetch summary records if any
        const { data: sumData } = await sb
          .from('attendance_summary')
          .select('*')
          .eq('user_id', currentStudent.id)
          .gte('summary_date', startDateStr)
          .lte('summary_date', endDateStr);

        (sumData || []).forEach(s => {
          const d = toDateStr(s.summary_date);
          monthlySummaries.set(d, s);
        });
      } catch (e) {
        console.debug('[Calendar] Log query notice:', e);
      }
    }

    renderCalendarGrid(firstDayOfMonth, lastDayOfMonth);
    updateMonthlySummaryCounters();
  } catch (err) {
    console.error('[AMS Student Calendar] Error loading records:', err);
  }
}

function renderCalendarGrid(firstDay, lastDay) {
  const grid = document.getElementById('calendarGrid');
  if (!grid) return;

  // Keep the 7 weekday headers
  const headers = Array.from(grid.querySelectorAll('.calendar-header-day'));
  grid.innerHTML = '';
  headers.forEach(h => grid.appendChild(h));

  const startingDayOfWeek = firstDay.getDay(); // 0 = Sunday
  const totalDaysInMonth = lastDay.getDate();
  const prevMonthLastDay = new Date(currentYear, currentMonth, 0).getDate();

  const today = new Date();
  const isCurrentMonth = today.getFullYear() === currentYear && today.getMonth() === currentMonth;
  const todayDate = today.getDate();

  // 1. Render preceding month trailing days
  for (let i = startingDayOfWeek - 1; i >= 0; i--) {
    const dayNum = prevMonthLastDay - i;
    const cell = document.createElement('div');
    cell.className = 'calendar-day-cell other-month';
    cell.innerHTML = `<span class="calendar-day-number">${dayNum}</span>`;
    grid.appendChild(cell);
  }

  // 2. Render current month days
  for (let d = 1; d <= totalDaysInMonth; d++) {
    const dayOfWeek = new Date(currentYear, currentMonth, d).getDay();
    const isSunday = dayOfWeek === 0;
    const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const isToday = isCurrentMonth && d === todayDate;
    const isPast = isCurrentMonth ? d < todayDate : (currentYear < today.getFullYear() || (currentYear === today.getFullYear() && currentMonth < today.getMonth()));

    const summary = monthlySummaries.get(dateStr);
    const log = monthlyLogs.get(dateStr);

    const cell = document.createElement('div');
    cell.className = 'calendar-day-cell';
    if (isSunday) cell.classList.add('sunday-no-class');
    if (isToday) cell.classList.add('today');

    cell.innerHTML = `<span class="calendar-day-number">${d}</span>`;

    // A. Sunday — Non-instructional day (No Classes) matching Admin Panel
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

    // B. Find matching academic schedules & holidays (exact date range)
    const dayEvents = schedules.filter(s => {
      const sStart = toDateStr(s.start_date);
      const sEnd = toDateStr(s.end_date);
      return sStart <= dateStr && sEnd >= dateStr;
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
      cell.appendChild(badge);
    });

    // C. Student Attendance Status (Strictly from real DB records)
    const attStatus = summary?.status || log?.status || null;
    if (attStatus) {
      const timeStr = log?.scanned_at ? fmtTime(log.scanned_at) : '';
      const attBadge = document.createElement('div');

      if (attStatus === 'present') {
        attBadge.className = 'event-badge badge-present';
        attBadge.title = `Present ${timeStr ? 'at ' + timeStr : ''}`;
        attBadge.innerHTML = `
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
          <span>Present${timeStr ? ' (' + timeStr + ')' : ''}</span>
        `;
      } else if (attStatus === 'late') {
        attBadge.className = 'event-badge badge-late';
        attBadge.title = `Tardy arrival ${timeStr ? 'at ' + timeStr : ''}`;
        attBadge.innerHTML = `
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          <span>Tardy${timeStr ? ' (' + timeStr + ')' : ''}</span>
        `;
      } else if (attStatus === 'excused') {
        attBadge.className = 'event-badge badge-excused';
        attBadge.title = 'Excused Absence (Approved Slip)';
        attBadge.innerHTML = `
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 3v5h5"/><path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2Z"/></svg>
          <span>Excused Slip</span>
        `;
      } else if (attStatus === 'absent') {
        attBadge.className = 'event-badge badge-absent';
        attBadge.title = 'Unexcused Absence';
        attBadge.innerHTML = `
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          <span>Absent</span>
        `;
      }
      cell.appendChild(attBadge);
    }

    // Click handler opens day inspection modal
    cell.addEventListener('click', () => {
      openDayModal({
        dateStr,
        dayNum: d,
        monthName: firstDay.toLocaleDateString('en-US', { month: 'long' }),
        year: currentYear,
        status: attStatus,
        isSunday,
        log,
        summary,
        dayEvents
      });
    });

    grid.appendChild(cell);
  }

  // 3. Render succeeding month trailing days
  const totalCellsRendered = startingDayOfWeek + totalDaysInMonth;
  const remainingCells = (7 - (totalCellsRendered % 7)) % 7;

  for (let nextDay = 1; nextDay <= remainingCells; nextDay++) {
    const cell = document.createElement('div');
    cell.className = 'calendar-day-cell other-month';
    cell.innerHTML = `<span class="calendar-day-number">${nextDay}</span>`;
    grid.appendChild(cell);
  }
}

function updateMonthlySummaryCounters() {
  let present = 0, late = 0, absent = 0, excused = 0;

  // Count from verified logs and summaries
  const seenDates = new Set();

  monthlyLogs.forEach((l, d) => {
    seenDates.add(d);
    if (l.status === 'present') present++;
    else if (l.status === 'late') late++;
    else if (l.status === 'excused') excused++;
    else if (l.status === 'absent') absent++;
  });

  monthlySummaries.forEach((s, d) => {
    if (!seenDates.has(d)) {
      seenDates.add(d);
      if (s.status === 'present') present++;
      else if (s.status === 'late') late++;
      else if (s.status === 'excused') excused++;
      else if (s.status === 'absent') absent++;
    }
  });

  const totalEvaluated = present + late + absent + excused;
  const rate = totalEvaluated > 0 ? Math.round(((present + late) / totalEvaluated) * 100) : 100;

  const presentEl = document.getElementById('monthPresentCount');
  const lateEl = document.getElementById('monthLateCount');
  const absentEl = document.getElementById('monthAbsentCount');
  const excusedEl = document.getElementById('monthExcusedCount');
  const rateBadge = document.getElementById('monthRateBadge');

  if (presentEl) presentEl.textContent = present;
  if (lateEl) lateEl.textContent = late;
  if (absentEl) absentEl.textContent = absent;
  if (excusedEl) excusedEl.textContent = excused;
  if (rateBadge) rateBadge.textContent = `${rate}% Monthly Rate`;
}

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

function initDayModal() {
  const modal = document.getElementById('dayDetailModal');
  const closeBtn = document.getElementById('closeDayModalBtn');
  if (closeBtn && modal) {
    closeBtn.addEventListener('click', () => modal.classList.add('hidden'));
  }
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.add('hidden');
    });
  }
}

function openDayModal({ dateStr, dayNum, monthName, year, status, isSunday, log, summary, dayEvents }) {
  const modal = document.getElementById('dayDetailModal');
  if (!modal) return;

  const dateTitle = document.getElementById('modalDayDate');
  const statusPill = document.getElementById('modalDayStatusPill');
  const eventBox = document.getElementById('modalDayEventBox');
  const eventTitle = document.getElementById('modalDayEventTitle');
  const eventDesc = document.getElementById('modalDayEventDesc');
  const methodEl = document.getElementById('modalDayMethod');
  const deviceEl = document.getElementById('modalDayDevice');
  const excusePrompt = document.getElementById('modalDayExcusePrompt');

  if (dateTitle) {
    dateTitle.textContent = `${monthName} ${dayNum}, ${year}`;
  }

  // Academic Schedules on this day
  if (eventBox && eventTitle && eventDesc) {
    if (dayEvents && dayEvents.length > 0) {
      eventBox.classList.remove('hidden');
      eventTitle.textContent = dayEvents.map(e => e.title).join(' • ');
      eventDesc.textContent = dayEvents.map(e => e.description || formatType(e.schedule_type)).join(' — ');
    } else if (isSunday) {
      eventBox.classList.remove('hidden');
      eventTitle.textContent = 'Sunday (No Classes)';
      eventDesc.textContent = 'Official non-instructional day across all Bestlink College departments.';
    } else {
      eventBox.classList.add('hidden');
    }
  }

  // Attendance Status
  if (statusPill) {
    if (status === 'present') {
      statusPill.className = 'pill pill-present';
      statusPill.textContent = 'Present';
    } else if (status === 'late') {
      statusPill.className = 'pill pill-late';
      statusPill.textContent = 'Late / Tardy';
    } else if (status === 'excused') {
      statusPill.className = 'pill pill-excused';
      statusPill.textContent = 'Excused';
    } else if (status === 'absent') {
      statusPill.className = 'pill pill-absent';
      statusPill.textContent = 'Absent';
    } else if (isSunday) {
      statusPill.className = 'pill';
      statusPill.style.background = 'var(--raised)';
      statusPill.style.color = 'var(--text-2)';
      statusPill.textContent = 'Non-Class Day';
    } else {
      statusPill.className = 'pill';
      statusPill.style.background = 'var(--raised)';
      statusPill.style.color = 'var(--text-3)';
      statusPill.textContent = 'No Ingress Recorded';
    }
  }

  if (methodEl) {
    methodEl.textContent = log?.scan_method ? log.scan_method.toUpperCase() : (status ? 'Verified' : 'None');
  }

  if (deviceEl) {
    deviceEl.textContent = log?.entrance_device_id || (status ? 'Campus Terminal' : 'No Record');
  }

  if (excusePrompt) {
    if (status === 'absent') {
      excusePrompt.classList.remove('hidden');
    } else {
      excusePrompt.classList.add('hidden');
    }
  }

  modal.classList.remove('hidden');
}
