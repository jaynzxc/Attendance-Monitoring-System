-- ==============================================================================
-- Bestlink College of the Philippines — Attendance Monitoring System (AMS)
-- COMPLETE DATABASE MIGRATION & SEED SCRIPT
-- Subsystem of SMS 1 (School Management System)
-- ==============================================================================
-- Paste this entire script into your Supabase SQL Editor:
-- https://supabase.com/dashboard/project/lbgrhbayadehorjixibx/sql/new
-- Then click "Run" (or Ctrl + Enter).
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- PART 1: EXTENSIONS
-- ------------------------------------------------------------------------------
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ------------------------------------------------------------------------------
-- PART 2: CORE TABLES DDL
-- ------------------------------------------------------------------------------

-- 1. USERS
create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'teacher', 'student')),
  first_name text not null,
  last_name text not null,
  email text unique,
  student_number text unique,
  employee_number text unique,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now()
);

-- 2. PARENT CONTACTS
create table if not exists public.parent_contacts (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.users(id) on delete cascade,
  full_name text not null,
  relationship text,
  mobile_number text not null check (mobile_number ~ '^\+639\d{9}$'),
  is_primary boolean not null default true,
  created_at timestamptz not null default now()
);

-- 3. SECTIONS
create table if not exists public.sections (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  grade_level text,
  school_year text not null,
  created_at timestamptz not null default now()
);

-- 4. STUDENT_SECTIONS (Junction)
create table if not exists public.student_sections (
  student_id uuid not null references public.users(id) on delete cascade,
  section_id uuid not null references public.sections(id) on delete cascade,
  primary key (student_id, section_id)
);

-- 5. TEACHER_SECTIONS (Junction)
create table if not exists public.teacher_sections (
  teacher_id uuid not null references public.users(id) on delete cascade,
  section_id uuid not null references public.sections(id) on delete cascade,
  subject text not null default 'General',
  primary key (teacher_id, section_id, subject)
);

-- 6. RFID CARDS
create table if not exists public.rfid_cards (
  id uuid primary key default gen_random_uuid(),
  card_uid text unique not null,
  user_id uuid not null references public.users(id) on delete cascade,
  issued_at timestamptz not null default now(),
  is_active boolean not null default true
);

-- 7. QR CODES
create table if not exists public.qr_codes (
  id uuid primary key default gen_random_uuid(),
  code_value text unique not null,
  user_id uuid not null references public.users(id) on delete cascade,
  generated_at timestamptz not null default now(),
  expires_at timestamptz,
  is_active boolean not null default true
);

-- 8. SCAN DEVICES (ESP32)
create table if not exists public.scan_devices (
  id uuid primary key default gen_random_uuid(),
  device_code text unique not null,
  location text not null,
  api_key_hash text not null,
  status text not null default 'online' check (status in ('online', 'offline', 'maintenance')),
  last_heartbeat timestamptz,
  created_at timestamptz not null default now()
);

-- 8b. ATTENDANCE SESSIONS
create table if not exists public.attendance_sessions (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references public.sections(id) on delete cascade,
  device_id uuid references public.scan_devices(id) on delete set null,
  created_by uuid not null references public.users(id),
  scan_method text not null default 'rfid' check (scan_method in ('rfid', 'qr')),
  session_token text unique,
  session_start timestamptz not null default now(),
  present_cutoff timestamptz not null,
  session_end timestamptz not null,
  status text not null default 'active' check (status in ('active', 'closed')),
  teacher_lat float8,
  teacher_lng float8,
  geo_radius_meters int not null default 50,
  qr_token_rotation_sec int not null default 30,
  qr_last_rotated_at timestamptz,
  created_at timestamptz not null default now(),
  constraint chk_session_cutoffs check (session_end >= present_cutoff and present_cutoff >= session_start)
);

-- 9. ATTENDANCE LOGS
create table if not exists public.attendance_logs (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references public.users(id) on delete set null,
  teacher_id uuid references public.users(id) on delete set null,
  section_id uuid references public.sections(id) on delete set null,
  device_id uuid references public.scan_devices(id) on delete set null,
  session_id uuid references public.attendance_sessions(id) on delete set null,
  scan_method text not null check (scan_method in ('rfid', 'qr', 'manual')),
  event_type text not null default 'time_in' check (event_type in ('time_in', 'time_out')),
  status text not null check (status in ('present', 'late', 'absent', 'excused')),
  is_voided boolean not null default false,
  voided_by uuid references public.users(id) on delete set null,
  voided_at timestamptz,
  is_manual boolean not null default false,
  student_lat float8,
  student_lng float8,
  scanned_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- 10. ATTENDANCE SUMMARY
create table if not exists public.attendance_summary (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  summary_date date not null,
  status text not null check (status in ('present', 'late', 'absent', 'excused')),
  minutes_late int not null default 0,
  time_in timestamptz,
  time_out timestamptz,
  scan_method text default 'rfid',
  device_id uuid references public.scan_devices(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (user_id, summary_date)
);

-- 11. HOLIDAYS
create table if not exists public.holidays (
  id uuid primary key default gen_random_uuid(),
  holiday_date date unique not null,
  description text not null,
  created_at timestamptz not null default now()
);

-- 12. ACADEMIC SCHEDULES (Multi-Role Calendar)
create table if not exists public.academic_schedules (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  schedule_type text not null check (schedule_type in ('holiday', 'no_classes', 'school_event', 'suspension', 'exam_week')),
  start_date date not null,
  end_date date not null,
  description text,
  affected_scope text not null default 'all' check (affected_scope in ('all', 'college', 'shs', 'faculty_only')),
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint chk_academic_dates check (end_date >= start_date)
);

-- 13. EXCUSE SLIPS
create table if not exists public.excuse_slips (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.users(id) on delete cascade,
  section_id uuid not null references public.sections(id) on delete cascade,
  date_from date not null,
  date_to date not null,
  reason text not null,
  attachment_url text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references public.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint chk_slip_dates check (date_to >= date_from)
);

-- 14. ALERTS LOG (SMS Parent Notifications)
create table if not exists public.alerts_log (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.users(id) on delete cascade,
  parent_contact_id uuid not null references public.parent_contacts(id) on delete cascade,
  alert_type text not null check (alert_type in ('tardy', 'absent')),
  recipient_number text not null,
  message_body text not null,
  sent_at timestamptz not null default now(),
  status text not null default 'sent' check (status in ('sent', 'delivered', 'failed')),
  gateway_response jsonb
);

-- 15. AWARD PERIODS & QUALIFICATIONS
create table if not exists public.award_periods (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  start_date date not null,
  end_date date not null,
  max_allowed_excused int not null default 0,
  created_at timestamptz not null default now(),
  constraint chk_award_dates check (end_date >= start_date)
);

create table if not exists public.award_qualifications (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null references public.award_periods(id) on delete cascade,
  student_id uuid not null references public.users(id) on delete cascade,
  total_present int not null default 0,
  total_late int not null default 0,
  total_absent int not null default 0,
  total_excused int not null default 0,
  qualified boolean not null default false,
  evaluated_at timestamptz not null default now(),
  unique (period_id, student_id)
);

-- 16. SYSTEM SETTINGS
create table if not exists public.system_settings (
  setting_key text primary key,
  setting_value text not null,
  description text,
  updated_at timestamptz not null default now()
);

-- 17. AUDIT LOG
create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  actor_id uuid references public.users(id) on delete set null,
  table_name text not null,
  record_id uuid,
  details jsonb,
  created_at timestamptz not null default now()
);

-- Indexes for High-Traffic Lookups
create index if not exists idx_attendance_logs_student on public.attendance_logs(student_id, scanned_at desc);
create index if not exists idx_attendance_logs_teacher on public.attendance_logs(teacher_id, scanned_at desc);
create index if not exists idx_attendance_logs_section on public.attendance_logs(section_id, scanned_at desc);
create index if not exists idx_attendance_logs_session on public.attendance_logs(session_id);
create index if not exists idx_attendance_logs_voided on public.attendance_logs(is_voided) where is_voided = true;
create index if not exists idx_sessions_device_active on public.attendance_sessions(device_id, status, session_end) where status = 'active';
create index if not exists idx_sessions_token_active on public.attendance_sessions(session_token) where status = 'active';
create unique index if not exists idx_sessions_section_active on public.attendance_sessions(section_id) where status = 'active';
create index if not exists idx_sessions_created_by on public.attendance_sessions(created_by, session_start desc);
create index if not exists idx_attendance_summary_user_date on public.attendance_summary (user_id, summary_date desc);
create index if not exists idx_academic_schedules_dates on public.academic_schedules(start_date, end_date);
create index if not exists idx_academic_schedules_type on public.academic_schedules(schedule_type);

-- ------------------------------------------------------------------------------
-- PART 3: ROW-LEVEL SECURITY (RLS) POLICIES
-- ------------------------------------------------------------------------------
alter table public.users enable row level security;
alter table public.parent_contacts enable row level security;
alter table public.sections enable row level security;
alter table public.student_sections enable row level security;
alter table public.teacher_sections enable row level security;
alter table public.rfid_cards enable row level security;
alter table public.qr_codes enable row level security;
alter table public.scan_devices enable row level security;
alter table public.attendance_sessions enable row level security;
alter table public.attendance_logs enable row level security;
alter table public.attendance_summary enable row level security;
alter table public.holidays enable row level security;
alter table public.academic_schedules enable row level security;
alter table public.excuse_slips enable row level security;
alter table public.alerts_log enable row level security;
alter table public.award_periods enable row level security;
alter table public.award_qualifications enable row level security;
alter table public.system_settings enable row level security;
alter table public.audit_log enable row level security;

-- Helper function: Check role of current authenticated user
create or replace function auth_role()
returns text
language sql
stable
security definer
as $$
  select role from public.users where id = auth.uid();
$$;

-- Users policies
create policy "users_select_policy" on public.users
for select using (
  auth.uid() = id or
  auth_role() = 'admin' or
  (
    auth_role() = 'teacher' and
    id in (
      select ss.student_id from public.student_sections ss
      join public.teacher_sections ts on ts.section_id = ss.section_id
      where ts.teacher_id = auth.uid()
    )
  )
);

create policy "users_admin_write_policy" on public.users
for all using (auth_role() = 'admin');

-- Parent contacts policies
create policy "parent_contacts_student_read" on public.parent_contacts
for select using (student_id = auth.uid());

create policy "parent_contacts_teacher_read" on public.parent_contacts
for select using (
  auth_role() = 'teacher' and
  student_id in (
    select ss.student_id from public.student_sections ss
    join public.teacher_sections ts on ts.section_id = ss.section_id
    where ts.teacher_id = auth.uid()
  )
);

create policy "parent_contacts_admin_all" on public.parent_contacts
for all using (auth_role() = 'admin');

-- Sections policies
create policy "sections_read_all_authenticated" on public.sections
for select using (auth.role() = 'authenticated');

create policy "sections_admin_all" on public.sections
for all using (auth_role() = 'admin');

-- Student sections policies
create policy "student_sections_read_policy" on public.student_sections
for select using (
  student_id = auth.uid() or
  auth_role() = 'admin' or
  section_id in (
    select section_id from public.teacher_sections where teacher_id = auth.uid()
  )
);

create policy "student_sections_admin_all" on public.student_sections
for all using (auth_role() = 'admin');

-- Teacher sections policies
create policy "teacher_sections_read_policy" on public.teacher_sections
for select using (
  teacher_id = auth.uid() or
  auth_role() = 'admin'
);

create policy "teacher_sections_admin_all" on public.teacher_sections
for all using (auth_role() = 'admin');

-- Attendance logs policies
create policy "attendance_logs_student_read" on public.attendance_logs
for select using (student_id = auth.uid());

create policy "attendance_logs_teacher_read" on public.attendance_logs
for select using (
  teacher_id = auth.uid() or
  auth_role() = 'teacher' and section_id in (
    select section_id from public.teacher_sections where teacher_id = auth.uid()
  )
);

create policy "attendance_logs_admin_all" on public.attendance_logs
for all using (auth_role() = 'admin');

-- Attendance sessions policies
create policy "sessions_select_policy" on public.attendance_sessions
  for select using (
    auth_role() = 'admin' or
    (
      auth_role() = 'teacher' and (
        created_by = auth.uid() or
        section_id in (select section_id from public.teacher_sections where teacher_id = auth.uid())
      )
    ) or
    (
      auth_role() = 'student' and
      status = 'active' and
      section_id in (select section_id from public.student_sections where student_id = auth.uid())
    )
  );

create policy "sessions_insert_policy" on public.attendance_sessions
  for insert with check (
    auth_role() = 'admin' or
    (
      auth_role() = 'teacher' and
      created_by = auth.uid() and
      section_id in (select section_id from public.teacher_sections where teacher_id = auth.uid())
    )
  );

create policy "sessions_update_policy" on public.attendance_sessions
  for update using (
    auth_role() = 'admin' or
    (auth_role() = 'teacher' and created_by = auth.uid())
  )
  with check (
    auth_role() = 'admin' or
    (auth_role() = 'teacher' and created_by = auth.uid())
  );

create policy "sessions_delete_admin" on public.attendance_sessions
  for delete using (auth_role() = 'admin');

-- Attendance summary policies
create policy "attendance_summary_student_read" on public.attendance_summary
for select using (user_id = auth.uid());

create policy "attendance_summary_teacher_read" on public.attendance_summary
for select using (
  user_id = auth.uid() or
  auth_role() = 'teacher' and user_id in (
    select ss.student_id from public.student_sections ss
    join public.teacher_sections ts on ts.section_id = ss.section_id
    where ts.teacher_id = auth.uid()
  )
);

create policy "attendance_summary_admin_all" on public.attendance_summary
for all using (auth_role() = 'admin');

-- Academic schedules policies
create policy "academic_schedules_read_all" on public.academic_schedules
for select using (auth.role() = 'authenticated');

create policy "academic_schedules_admin_all" on public.academic_schedules
for all using (auth_role() = 'admin');

-- Holidays policies
create policy "holidays_read_all" on public.holidays
for select using (auth.role() = 'authenticated');

create policy "holidays_admin_all" on public.holidays
for all using (auth_role() = 'admin');

-- Excuse slips policies
create policy "excuse_slips_student_policy" on public.excuse_slips
for all using (student_id = auth.uid());

create policy "excuse_slips_teacher_policy" on public.excuse_slips
for all using (
  auth_role() = 'teacher' and section_id in (
    select section_id from public.teacher_sections where teacher_id = auth.uid()
  )
);

create policy "excuse_slips_admin_all" on public.excuse_slips
for all using (auth_role() = 'admin');

-- Scan devices, Alerts, Awards, Settings, Audit policies
create policy "scan_devices_admin_all" on public.scan_devices
for all using (auth_role() = 'admin');

create policy "alerts_log_student_read" on public.alerts_log
for select using (student_id = auth.uid());

create policy "alerts_log_admin_all" on public.alerts_log
for all using (auth_role() = 'admin');

create policy "award_periods_read_all" on public.award_periods
for select using (auth.role() = 'authenticated');

create policy "award_periods_admin_all" on public.award_periods
for all using (auth_role() = 'admin');

create policy "award_qualifications_read_policy" on public.award_qualifications
for select using (student_id = auth.uid() or auth_role() in ('admin', 'teacher'));

create policy "award_qualifications_admin_all" on public.award_qualifications
for all using (auth_role() = 'admin');

create policy "system_settings_read_all" on public.system_settings
for select using (auth.role() = 'authenticated');

create policy "system_settings_admin_all" on public.system_settings
for all using (auth_role() = 'admin');

create policy "audit_log_admin_read" on public.audit_log
for select using (auth_role() = 'admin');

-- ------------------------------------------------------------------------------
-- PART 4: STORED PROCEDURES (RPCs)
-- ------------------------------------------------------------------------------

-- 1. fn_get_daily_kpis
create or replace function fn_get_daily_kpis(
  p_date date default current_date,
  p_section_id uuid default null
)
returns json
language plpgsql
security definer
as $$
declare
  v_total int := 0;
  v_present int := 0;
  v_late int := 0;
  v_absent int := 0;
  v_excused int := 0;
  v_rate numeric := 0.0;
begin
  if p_section_id is not null then
    select
      count(*),
      count(*) filter (where s.status = 'present'),
      count(*) filter (where s.status = 'late'),
      count(*) filter (where s.status = 'absent'),
      count(*) filter (where s.status = 'excused')
    into v_total, v_present, v_late, v_absent, v_excused
    from public.student_sections ss
    join public.users u on u.id = ss.student_id and u.status = 'active'
    left join public.attendance_summary s on s.user_id = u.id and s.summary_date = p_date
    where ss.section_id = p_section_id;
  else
    select
      count(*),
      count(*) filter (where s.status = 'present'),
      count(*) filter (where s.status = 'late'),
      count(*) filter (where s.status = 'absent'),
      count(*) filter (where s.status = 'excused')
    into v_total, v_present, v_late, v_absent, v_excused
    from public.users u
    left join public.attendance_summary s on s.user_id = u.id and s.summary_date = p_date
    where u.role = 'student' and u.status = 'active';
  end if;

  if v_total > 0 then
    v_rate := round(((v_present + v_late)::numeric / v_total::numeric) * 100, 1);
  else
    v_rate := 0.0;
  end if;

  return json_build_object(
    'date', p_date,
    'total_students', v_total,
    'present_today', v_present,
    'late_today', v_late,
    'absent_today', v_absent,
    'excused_today', v_excused,
    'attendance_rate', v_rate
  );
end;
$$;

-- 2. fn_get_5week_trend
create or replace function fn_get_5week_trend()
returns json
language plpgsql
security definer
as $$
declare
  v_results json;
begin
  with weeks as (
    select
      generate_series(
        date_trunc('week', current_date - interval '4 weeks')::date,
        date_trunc('week', current_date)::date,
        interval '1 week'
      )::date as week_start
  ),
  weekly_stats as (
    select
      w.week_start,
      'W' || to_char(w.week_start, 'IW') as week_label,
      count(s.id) as total_records,
      count(s.id) filter (where s.status in ('present', 'late')) as attended
    from weeks w
    left join public.attendance_summary s
      on s.summary_date >= w.week_start
      and s.summary_date < (w.week_start + interval '7 days')::date
    group by w.week_start
    order by w.week_start asc
  )
  select json_agg(
    json_build_object(
      'week', week_label,
      'rate', case when total_records > 0 then round((attended::numeric / total_records::numeric) * 100, 1) else 90.0 end
    )
  )
  into v_results
  from weekly_stats;

  return coalesce(v_results, '[]'::json);
end;
$$;

-- 3. fn_get_teacher_daily_records
create or replace function fn_get_teacher_daily_records(
  p_teacher_id uuid,
  p_date_from date default null,
  p_date_to date default null,
  p_status text default null
)
returns table (
  id uuid,
  summary_date date,
  time_in timestamptz,
  time_out timestamptz,
  status text,
  minutes_late int,
  scan_method text,
  device_code text,
  device_location text,
  duration_minutes int
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select 
    s.id,
    s.summary_date,
    s.time_in,
    s.time_out,
    s.status,
    s.minutes_late,
    s.scan_method,
    coalesce(d.device_code, 'GATE-01-ESP32') as device_code,
    coalesce(d.location, 'Main Campus Gate') as device_location,
    case 
      when s.time_in is not null and s.time_out is not null then
        extract(epoch from (s.time_out - s.time_in))::int / 60
      else null
    end as duration_minutes
  from public.attendance_summary s
  left join public.scan_devices d on d.id = s.device_id
  where s.user_id = p_teacher_id
    and (p_date_from is null or s.summary_date >= p_date_from)
    and (p_date_to is null or s.summary_date <= p_date_to)
    and (p_status is null or s.status = p_status)
  order by s.summary_date desc;
end;
$$;

-- 4. fn_review_excuse_slip
create or replace function fn_review_excuse_slip(
  p_slip_id uuid,
  p_action text,
  p_reviewer_id uuid
)
returns json
language plpgsql
security definer
as $$
declare
  v_slip public.excuse_slips%rowtype;
begin
  if p_action not in ('approved', 'rejected') then
    return json_build_object('success', false, 'error', 'Action must be approved or rejected.');
  end if;

  update public.excuse_slips
  set
    status = p_action,
    reviewed_by = p_reviewer_id,
    reviewed_at = now()
  where id = p_slip_id
  returning * into v_slip;

  if not found then
    return json_build_object('success', false, 'error', 'Excuse slip not found.');
  end if;

  -- If approved, update attendance_summary records in that date range to excused
  if p_action = 'approved' then
    update public.attendance_summary
    set status = 'excused'
    where user_id = v_slip.student_id
      and summary_date >= v_slip.date_from
      and summary_date <= v_slip.date_to;
  end if;

  return json_build_object('success', true, 'status', p_action, 'id', p_slip_id);
end;
$$;

-- 8. fn_start_attendance_session
create or replace function fn_start_attendance_session(
  p_section_id uuid,
  p_scan_method text default 'rfid',
  p_device_id uuid default null,
  p_teacher_lat float8 default null,
  p_teacher_lng float8 default null,
  p_actor_id uuid default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid;
  v_actor_role text;
  v_present_window_min int := 20;
  v_session_duration_min int := 30;
  v_geo_radius_meters int := 50;
  v_qr_rotation_sec int := 30;
  v_existing_id uuid;
  v_session_id uuid;
  v_session_token text := null;
  v_start timestamptz := now();
  v_cutoff timestamptz;
  v_end timestamptz;
  v_section_name text;
begin
  v_actor_id := coalesce(p_actor_id, auth.uid());
  if v_actor_id is null then
    raise exception 'Authentication required to start an attendance session.';
  end if;

  select role into v_actor_role from public.users where id = v_actor_id;
  if v_actor_role not in ('admin', 'teacher') then
    raise exception 'Unauthorized: Only administrators or teachers may start attendance sessions.';
  end if;

  if p_section_id is not null then
    select name into v_section_name from public.sections where id = p_section_id;
    if not found then
      raise exception 'Section with ID % does not exist.', p_section_id;
    end if;

    if v_actor_role = 'teacher' then
      if not exists (
        select 1 from public.teacher_sections
        where teacher_id = v_actor_id and section_id = p_section_id
      ) then
        raise exception 'Forbidden: Teacher is not assigned to section %.', v_section_name;
      end if;
    end if;
  else
    if v_actor_role != 'admin' then
      raise exception 'Forbidden: Only administrators can start faculty attendance sessions.';
    end if;
    v_section_name := 'Faculty Attendance';
  end if;

  -- Block concurrent active sessions for the same section or concurrent faculty sessions
  if p_section_id is not null then
    select id into v_existing_id
    from public.attendance_sessions
    where section_id = p_section_id and status = 'active' and session_end > now();

    if v_existing_id is not null then
      raise exception 'An active attendance session is already open for section %.', v_section_name;
    end if;
  else
    select id into v_existing_id
    from public.attendance_sessions
    where section_id is null and status = 'active' and session_end > now();

    if v_existing_id is not null then
      raise exception 'An active faculty attendance session is already running. Please close the active session before opening another one.';
    end if;
  end if;

  if p_scan_method = 'rfid' and p_device_id is not null then
    select id into v_existing_id
    from public.attendance_sessions
    where device_id = p_device_id and status = 'active';

    if v_existing_id is not null then
      raise exception 'The selected scanner device is currently in use by another active session.';
    end if;
  end if;

  select coalesce(nullif(setting_value, '')::int, 20) into v_present_window_min
  from public.system_settings where setting_key = 'attendance_present_window_min';
  v_present_window_min := coalesce(v_present_window_min, 20);

  select coalesce(nullif(setting_value, '')::int, 30) into v_session_duration_min
  from public.system_settings where setting_key = 'attendance_session_duration_min';
  v_session_duration_min := coalesce(v_session_duration_min, 30);

  select coalesce(nullif(setting_value, '')::int, 50) into v_geo_radius_meters
  from public.system_settings where setting_key = 'qr_geo_radius_meters';
  v_geo_radius_meters := coalesce(v_geo_radius_meters, 50);

  select coalesce(nullif(setting_value, '')::int, 30) into v_qr_rotation_sec
  from public.system_settings where setting_key = 'qr_token_rotation_sec';
  v_qr_rotation_sec := coalesce(v_qr_rotation_sec, 30);

  v_cutoff := v_start + (v_present_window_min || ' minutes')::interval;
  v_end := v_start + (v_session_duration_min || ' minutes')::interval;

  if p_scan_method = 'qr' then
    v_session_token := gen_random_uuid()::text;
  end if;

  insert into public.attendance_sessions (
    section_id,
    device_id,
    created_by,
    scan_method,
    session_token,
    session_start,
    present_cutoff,
    session_end,
    status,
    teacher_lat,
    teacher_lng,
    geo_radius_meters,
    qr_token_rotation_sec,
    qr_last_rotated_at
  ) values (
    p_section_id,
    p_device_id,
    v_actor_id,
    p_scan_method,
    v_session_token,
    v_start,
    v_cutoff,
    v_end,
    'active',
    p_teacher_lat,
    p_teacher_lng,
    v_geo_radius_meters,
    v_qr_rotation_sec,
    case when p_scan_method = 'qr' then v_start else null end
  )
  returning id into v_session_id;

  insert into public.audit_log (
    actor_id,
    action,
    table_name,
    record_id,
    details
  ) values (
    v_actor_id,
    'session_start',
    'attendance_sessions',
    v_session_id,
    jsonb_build_object(
      'section_id', p_section_id,
      'section_name', v_section_name,
      'scan_method', p_scan_method,
      'device_id', p_device_id,
      'session_start', v_start,
      'present_cutoff', v_cutoff,
      'session_end', v_end
    )
  );

  return json_build_object(
    'success', true,
    'session_id', v_session_id,
    'section_id', p_section_id,
    'section_name', v_section_name,
    'scan_method', p_scan_method,
    'session_token', v_session_token,
    'session_start', v_start,
    'present_cutoff', v_cutoff,
    'session_end', v_end,
    'geo_radius_meters', v_geo_radius_meters,
    'qr_token_rotation_sec', v_qr_rotation_sec
  );
end;
$$;

-- 9. fn_close_attendance_session
create or replace function fn_close_attendance_session(
  p_session_id uuid,
  p_actor_id uuid default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid;
  v_actor_role text;
  v_session record;
  v_absent_count int := 0;
  v_student record;
begin
  v_actor_id := coalesce(p_actor_id, auth.uid());

  select * into v_session
  from public.attendance_sessions
  where id = p_session_id;

  if not found then
    raise exception 'Attendance session not found.';
  end if;

  if v_session.status = 'closed' then
    return json_build_object('success', true, 'message', 'Session is already closed.');
  end if;

  select role into v_actor_role from public.users where id = v_actor_id;

  if v_actor_role <> 'admin' and v_session.created_by <> v_actor_id then
    raise exception 'Unauthorized: Only the session initiator or an administrator can close this session.';
  end if;

  update public.attendance_sessions
  set status = 'closed',
      session_end = least(session_end, now())
  where id = p_session_id;

  for v_student in
    select ss.student_id
    from public.student_sections ss
    where ss.section_id = v_session.section_id
      and not exists (
        select 1 from public.attendance_logs l
        where l.session_id = p_session_id
          and l.student_id = ss.student_id
          and l.is_voided = false
      )
  loop
    insert into public.attendance_summary (
      user_id,
      summary_date,
      status,
      minutes_late,
      scan_method
    ) values (
      v_student.student_id,
      v_session.session_start::date,
      'absent',
      0,
      v_session.scan_method
    )
    on conflict (user_id, summary_date) do update set
      status = case 
        when attendance_summary.status in ('present', 'late', 'excused') then attendance_summary.status
        else 'absent'
      end;

    v_absent_count := v_absent_count + 1;
  end loop;

  insert into public.audit_log (
    actor_id,
    action,
    table_name,
    record_id,
    details
  ) values (
    v_actor_id,
    'session_close',
    'attendance_sessions',
    p_session_id,
    jsonb_build_object(
      'section_id', v_session.section_id,
      'closed_at', now(),
      'absent_marked_count', v_absent_count
    )
  );

  return json_build_object(
    'success', true,
    'session_id', p_session_id,
    'status', 'closed',
    'absent_marked_count', v_absent_count,
    'closed_at', now()
  );
end;
$$;

-- 10. fn_rotate_session_qr_token
create or replace function fn_rotate_session_qr_token(
  p_session_id uuid,
  p_new_token text default gen_random_uuid()::text,
  p_actor_id uuid default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid;
  v_session record;
begin
  v_actor_id := coalesce(p_actor_id, auth.uid());

  select * into v_session from public.attendance_sessions
  where id = p_session_id and status = 'active' and scan_method = 'qr';

  if not found then
    return json_build_object('success', false, 'error', 'Active QR session not found or already closed.');
  end if;

  if now() > v_session.session_end then
    update public.attendance_sessions set status = 'closed' where id = p_session_id;
    return json_build_object('success', false, 'error', 'Session window has expired.');
  end if;

  update public.attendance_sessions
  set session_token = p_new_token,
      qr_last_rotated_at = now()
  where id = p_session_id;

  return json_build_object(
    'success', true,
    'session_id', p_session_id,
    'session_token', p_new_token,
    'rotated_at', now()
  );
end;
$$;

-- 11. fn_manual_attendance_override
create or replace function fn_manual_attendance_override(
  p_user_id uuid,
  p_section_id uuid default null,
  p_session_id uuid default null,
  p_status text default 'present',
  p_reason text default 'Manual correction',
  p_actor_id uuid default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid;
  v_actor_role text;
  v_user_role text;
  v_user_name text;
  v_section_id uuid;
  v_log_id uuid;
  v_minutes_late int := 0;
begin
  v_actor_id := coalesce(p_actor_id, auth.uid());

  if v_actor_id is null then
    raise exception 'Authentication required for manual attendance override.';
  end if;

  select role into v_actor_role from public.users where id = v_actor_id;

  if v_actor_role not in ('admin', 'teacher') then
    raise exception 'Unauthorized: Only administrators or teachers may perform manual attendance overrides.';
  end if;

  select role, first_name || ' ' || last_name into v_user_role, v_user_name
  from public.users where id = p_user_id;

  if not found then
    raise exception 'Target user not found.';
  end if;

  if p_status not in ('present', 'late', 'absent', 'excused') then
    raise exception 'Invalid status: %. Must be present, late, absent, or excused.', p_status;
  end if;

  if p_status = 'late' then
    v_minutes_late := 15;
  end if;

  v_section_id := p_section_id;
  if v_section_id is null and p_session_id is not null then
    select section_id into v_section_id from public.attendance_sessions where id = p_session_id;
  end if;

  if v_actor_role = 'teacher' then
    if v_user_role <> 'student' then
      raise exception 'Teachers may only record manual attendance for students.';
    end if;

    if v_section_id is null then
      raise exception 'Section ID is required for teacher manual attendance override.';
    end if;

    if not exists (
      select 1 from public.teacher_sections
      where teacher_id = v_actor_id and section_id = v_section_id
    ) then
      raise exception 'Teacher is not assigned to this section.';
    end if;

    if not exists (
      select 1 from public.student_sections
      where student_id = p_user_id and section_id = v_section_id
    ) then
      raise exception 'Student is not enrolled in this section.';
    end if;
  end if;

  insert into public.attendance_logs (
    student_id,
    teacher_id,
    section_id,
    session_id,
    scan_method,
    event_type,
    status,
    is_manual,
    is_voided,
    scanned_at,
    created_by
  ) values (
    case when v_user_role = 'student' then p_user_id else null end,
    case when v_user_role = 'teacher' then p_user_id else null end,
    v_section_id,
    p_session_id,
    'manual',
    'time_in',
    p_status,
    true,
    false,
    now(),
    v_actor_id
  )
  returning id into v_log_id;

  insert into public.attendance_summary (
    user_id,
    summary_date,
    status,
    minutes_late,
    scan_method,
    time_in
  ) values (
    p_user_id,
    current_date,
    p_status,
    v_minutes_late,
    'manual',
    case when p_status in ('present', 'late') then now() else null end
  )
  on conflict (user_id, summary_date) do update set
    status = excluded.status,
    minutes_late = excluded.minutes_late,
    scan_method = 'manual',
    time_in = coalesce(attendance_summary.time_in, excluded.time_in);

  insert into public.audit_log (
    actor_id,
    action,
    table_name,
    record_id,
    details
  ) values (
    v_actor_id,
    'manual_override',
    'attendance_logs',
    v_log_id,
    jsonb_build_object(
      'reason', p_reason,
      'status', p_status,
      'target_user_id', p_user_id,
      'target_user_name', v_user_name,
      'target_role', v_user_role,
      'section_id', v_section_id,
      'session_id', p_session_id
    )
  );

  return json_build_object(
    'success', true,
    'log_id', v_log_id,
    'user_id', p_user_id,
    'user_name', v_user_name,
    'status', p_status,
    'actor_id', v_actor_id,
    'timestamp', now()
  );
end;
$$;

-- 12. fn_void_attendance_record
create or replace function fn_void_attendance_record(
  p_log_id uuid,
  p_reason text default 'Buddy punch violation',
  p_actor_id uuid default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid;
  v_actor_role text;
  v_log record;
  v_target_user_id uuid;
  v_student_name text;
  v_section_name text;
begin
  v_actor_id := coalesce(p_actor_id, auth.uid());

  if v_actor_id is null then
    raise exception 'Authentication required to void an attendance record.';
  end if;

  select role into v_actor_role from public.users where id = v_actor_id;

  select 
    l.id, l.student_id, l.teacher_id, l.section_id, l.session_id, 
    l.scanned_at, l.is_voided,
    u.first_name || ' ' || u.last_name as user_name,
    s.name as section_name
  into v_log
  from public.attendance_logs l
  left join public.users u on u.id = coalesce(l.student_id, l.teacher_id)
  left join public.sections s on s.id = l.section_id
  where l.id = p_log_id;

  if not found then
    raise exception 'Attendance log record not found.';
  end if;

  if v_log.is_voided then
    raise exception 'Attendance record is already marked as voided.';
  end if;

  if v_actor_role <> 'admin' then
    if v_actor_role <> 'teacher' then
      raise exception 'Unauthorized: Only teachers or administrators can void attendance records.';
    end if;

    if not exists (
      select 1 from public.teacher_sections
      where teacher_id = v_actor_id and section_id = v_log.section_id
    ) and not exists (
      select 1 from public.attendance_sessions
      where id = v_log.session_id and created_by = v_actor_id
    ) then
      raise exception 'Forbidden: Teacher is not authorized to void attendance for this section/session.';
    end if;
  end if;

  v_target_user_id := coalesce(v_log.student_id, v_log.teacher_id);
  v_student_name := coalesce(v_log.user_name, 'Unknown User');
  v_section_name := coalesce(v_log.section_name, 'General Session');

  update public.attendance_logs
  set 
    is_voided = true,
    voided_by = v_actor_id,
    voided_at = now()
  where id = p_log_id;

  update public.attendance_summary
  set 
    status = 'absent',
    minutes_late = 0
  where user_id = v_target_user_id 
    and summary_date = v_log.scanned_at::date;

  insert into public.audit_log (
    actor_id,
    action,
    table_name,
    record_id,
    details
  ) values (
    v_actor_id,
    'buddy_punch_void',
    'attendance_logs',
    p_log_id,
    jsonb_build_object(
      'reason', p_reason,
      'target_user_id', v_target_user_id,
      'student_name', v_student_name,
      'section_id', v_log.section_id,
      'section_name', v_section_name,
      'session_id', v_log.session_id,
      'scanned_at', v_log.scanned_at,
      'voided_by', v_actor_id,
      'voided_at', now()
    )
  );

  return json_build_object(
    'success', true,
    'event', 'buddy_punch_violation',
    'log_id', p_log_id,
    'student_id', v_target_user_id,
    'student_name', v_student_name,
    'section_id', v_log.section_id,
    'section_name', v_section_name,
    'session_id', v_log.session_id,
    'session_date', v_log.scanned_at::date,
    'voided_by', v_actor_id,
    'reason', p_reason,
    'timestamp', now()
  );
end;
$$;

-- ------------------------------------------------------------------------------
-- PART 5: SEED DATA & AUTH TEST USERS (Default Password: Bestlink@2026)
-- ------------------------------------------------------------------------------

-- Insert into auth.users so Supabase Auth recognizes these logins
insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  recovery_sent_at,
  last_sign_in_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  email_change,
  email_change_token_new,
  recovery_token
) values
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'admin@bestlink.edu.ph', crypt('Bestlink@2026', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{"role":"admin"}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'b0000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'prof.santos@bestlink.edu.ph', crypt('Bestlink@2026', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{"role":"teacher"}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'b0000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'prof.reyes@bestlink.edu.ph', crypt('Bestlink@2026', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{"role":"teacher"}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'juan.delacruz@student.bestlink.edu.ph', crypt('Bestlink@2026', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{"role":"student"}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'maria.clara@student.bestlink.edu.ph', crypt('Bestlink@2026', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{"role":"student"}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'jose.rizal@student.bestlink.edu.ph', crypt('Bestlink@2026', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{"role":"student"}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'andres.bonifacio@student.bestlink.edu.ph', crypt('Bestlink@2026', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{"role":"student"}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'gabriela.silang@student.bestlink.edu.ph', crypt('Bestlink@2026', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{"role":"student"}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-000000000006', 'authenticated', 'authenticated', 'emilio.aguinaldo@student.bestlink.edu.ph', crypt('Bestlink@2026', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{"role":"student"}', now(), now(), '', '', '', '')
on conflict (id) do nothing;

-- 1. SECTIONS
insert into public.sections (id, name, grade_level, school_year) values
  ('11111111-1111-1111-1111-111111111111', 'BSIT 3-1', '3rd Year', '2026-2027'),
  ('22222222-2222-2222-2222-222222222222', 'BSIT 3-2', '3rd Year', '2026-2027'),
  ('33333333-3333-3333-3333-333333333333', 'BSIS 2-1', '2nd Year', '2026-2027')
on conflict (id) do nothing;

-- 2. USERS
insert into public.users (id, role, first_name, last_name, email, student_number, employee_number, status) values
  ('a0000000-0000-0000-0000-000000000001', 'admin', 'Administrator', '', 'admin@bestlink.edu.ph', null, 'EMP-2020-001', 'active'),
  ('b0000000-0000-0000-0000-000000000001', 'teacher', 'Ricardo', 'Santos', 'prof.santos@bestlink.edu.ph', null, 'EMP-2018-042', 'active'),
  ('b0000000-0000-0000-0000-000000000002', 'teacher', 'Carmen', 'Reyes', 'prof.reyes@bestlink.edu.ph', null, 'EMP-2019-088', 'active'),
  ('c0000000-0000-0000-0000-000000000001', 'student', 'Juan', 'Dela Cruz', 'juan.delacruz@student.bestlink.edu.ph', '2024-IT-00101', null, 'active'),
  ('c0000000-0000-0000-0000-000000000002', 'student', 'Maria', 'Clara', 'maria.clara@student.bestlink.edu.ph', '2024-IT-00102', null, 'active'),
  ('c0000000-0000-0000-0000-000000000003', 'student', 'Jose', 'Rizal', 'jose.rizal@student.bestlink.edu.ph', '2024-IT-00103', null, 'active'),
  ('c0000000-0000-0000-0000-000000000004', 'student', 'Andres', 'Bonifacio', 'andres.bonifacio@student.bestlink.edu.ph', '2024-IT-00201', null, 'active'),
  ('c0000000-0000-0000-0000-000000000005', 'student', 'Gabriela', 'Silang', 'gabriela.silang@student.bestlink.edu.ph', '2024-IT-00202', null, 'active'),
  ('c0000000-0000-0000-0000-000000000006', 'student', 'Emilio', 'Aguinaldo', 'emilio.aguinaldo@student.bestlink.edu.ph', '2025-IS-00012', null, 'active')
on conflict (id) do nothing;

-- 3. PARENT CONTACTS
insert into public.parent_contacts (id, student_id, full_name, relationship, mobile_number, is_primary) values
  ('d0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'Teresa Dela Cruz', 'Mother', '+639171234567', true),
  ('d0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000002', 'Alfonso Clara', 'Father', '+639189876543', true),
  ('d0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000004', 'Catalina Bonifacio', 'Mother', '+639205551234', true)
on conflict (id) do nothing;

-- 4. SECTION ASSIGNMENTS
insert into public.student_sections (student_id, section_id) values
  ('c0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111'),
  ('c0000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111'),
  ('c0000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111'),
  ('c0000000-0000-0000-0000-000000000004', '22222222-2222-2222-2222-222222222222'),
  ('c0000000-0000-0000-0000-000000000005', '22222222-2222-2222-2222-222222222222'),
  ('c0000000-0000-0000-0000-000000000006', '33333333-3333-3333-3333-333333333333')
on conflict (student_id, section_id) do nothing;

insert into public.teacher_sections (teacher_id, section_id, subject) values
  ('b0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Systems Architecture'),
  ('b0000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'Database Systems'),
  ('b0000000-0000-0000-0000-000000000002', '33333333-3333-3333-3333-333333333333', 'Information Management')
on conflict (teacher_id, section_id, subject) do nothing;

-- 5. RFID & QR CODES
insert into public.rfid_cards (id, card_uid, user_id, is_active) values
  ('e0000000-0000-0000-0000-000000000001', 'E2806894', 'c0000000-0000-0000-0000-000000000001', true),
  ('e0000000-0000-0000-0000-000000000002', 'A1B2C3D4', 'c0000000-0000-0000-0000-000000000002', true),
  ('e0000000-0000-0000-0000-000000000003', '99887766', 'b0000000-0000-0000-0000-000000000001', true)
on conflict (id) do nothing;

insert into public.qr_codes (id, code_value, user_id, is_active) values
  ('f0000000-0000-0000-0000-000000000001', 'bcp_qr_sec_tok_delacruz_01', 'c0000000-0000-0000-0000-000000000001', true),
  ('f0000000-0000-0000-0000-000000000002', 'bcp_qr_sec_tok_clara_02', 'c0000000-0000-0000-0000-000000000002', true),
  ('f0000000-0000-0000-0000-000000000003', 'bcp_qr_sec_tok_santos_01', 'b0000000-0000-0000-0000-000000000001', true)
on conflict (id) do nothing;

-- 6. SCAN DEVICES (ESP32 Gate Ingress)
insert into public.scan_devices (id, device_code, location, api_key_hash, status, last_heartbeat) values
  ('70000000-0000-0000-0000-000000000001', 'GATE-01-ESP32', 'Main Gate Turnstile A', encode(digest('esp32_dev_secret_gate01', 'sha256'), 'hex'), 'online', now()),
  ('70000000-0000-0000-0000-000000000002', 'GATE-02-ESP32', 'East Annex Gate Turnstile B', encode(digest('esp32_dev_secret_gate02', 'sha256'), 'hex'), 'online', now())
on conflict (id) do nothing;

-- 7. HOLIDAYS
insert into public.holidays (id, holiday_date, description) values
  ('80000000-0000-0000-0000-000000000001', '2026-11-01', 'All Saints Day'),
  ('80000000-0000-0000-0000-000000000002', '2026-11-30', 'Bonifacio Day'),
  ('80000000-0000-0000-0000-000000000003', '2026-12-25', 'Christmas Day'),
  ('80000000-0000-0000-0000-000000000004', '2026-12-30', 'Rizal Day')
on conflict (id) do nothing;

-- 8. ACADEMIC SCHEDULES (Calendar Events)
insert into public.academic_schedules (id, title, schedule_type, start_date, end_date, description, affected_scope, created_by) values
  ('7a000000-0000-0000-0000-000000000001', 'Institutional Midterm Examination Week', 'exam_week', '2026-10-12', '2026-10-17', 'Formal exam week across all departments. Scan check-in strictly enforced.', 'all', 'a0000000-0000-0000-0000-000000000001'),
  ('7a000000-0000-0000-0000-000000000002', 'BCP Foundation Anniversary Celebration', 'school_event', '2026-10-23', '2026-10-24', 'Annual College Foundation celebrations and campus festivities.', 'all', 'a0000000-0000-0000-0000-000000000001'),
  ('7a000000-0000-0000-0000-000000000003', 'Faculty Development Conference', 'school_event', '2026-11-06', '2026-11-06', 'Faculty pedagogy seminar. Asynchronous online student study day.', 'faculty_only', 'a0000000-0000-0000-0000-000000000001'),
  ('7a000000-0000-0000-0000-000000000004', 'Bonifacio Day (Legal Holiday)', 'holiday', '2026-11-30', '2026-11-30', 'National Regular Holiday. No classes and offices closed.', 'all', 'a0000000-0000-0000-0000-000000000001')
on conflict (id) do nothing;

-- 9. AWARD PERIODS
insert into public.award_periods (id, name, start_date, end_date, max_allowed_excused) values
  ('90000000-0000-0000-0000-000000000001', '1st Semester (2026-2027)', '2026-08-15', '2026-12-20', 1)
on conflict (id) do nothing;

-- 10. SYSTEM SETTINGS
insert into public.system_settings (setting_key, setting_value, description) values
  ('student_cutoff_time', '08:00', 'Standard morning cutoff time for student on-time status'),
  ('tardiness_grace_period', '15', 'Grace period in minutes before student is marked Tardy'),
  ('teacher_morning_cutoff', '07:30', 'Morning faculty shift cutoff time'),
  ('anti_passback_minutes', '5', 'Cooldown threshold preventing duplicate RFID taps'),
  ('sms_template_tardy', 'BCP AMS Alert: Your child {student_name} arrived LATE on {date} at {time}. Bestlink College of the Philippines', 'Parent SMS alert template for tardiness'),
  ('sms_template_absent', 'BCP AMS Notice: Your child {student_name} was marked ABSENT on {date}. Please submit an official excuse slip upon return. Bestlink College', 'Parent SMS notice template for unexcused absence'),
  ('attendance_present_window_min', '20', 'Threshold minutes from session start to mark attendance as Present (vs Late)'),
  ('attendance_session_duration_min', '30', 'Total duration in minutes an attendance session remains open'),
  ('anti_passback_cooldown_sec', '300', 'Anti-passback cooldown window in seconds (5 minutes) to prevent duplicate card taps'),
  ('qr_geo_radius_meters', '50', 'Maximum allowable student-to-teacher geolocation distance in meters for QR scans'),
  ('qr_token_rotation_sec', '30', 'Dynamic ephemeral QR token rotation interval in seconds')
on conflict (setting_key) do update set
  description = excluded.description;

-- 11. ATTENDANCE LOGS & SUMMARIES
insert into public.attendance_logs (student_id, section_id, device_id, scan_method, event_type, status, scanned_at) values
  ('c0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', '70000000-0000-0000-0000-000000000001', 'rfid', 'time_in', 'present', now() - interval '3 hours'),
  ('c0000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', '70000000-0000-0000-0000-000000000001', 'rfid', 'time_in', 'late', now() - interval '2 hours 15 minutes'),
  ('c0000000-0000-0000-0000-000000000004', '22222222-2222-2222-2222-222222222222', '70000000-0000-0000-0000-000000000002', 'qr', 'time_in', 'present', now() - interval '3 hours 10 minutes');

insert into public.attendance_logs (teacher_id, device_id, scan_method, event_type, status, scanned_at) values
  ('b0000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001', 'rfid', 'time_in', 'present', now() - interval '3 hours 30 minutes');

insert into public.attendance_summary (user_id, summary_date, status, minutes_late, time_in, time_out, scan_method, device_id) values
  ('c0000000-0000-0000-0000-000000000001', current_date, 'present', 0, now() - interval '3 hours', null, 'rfid', '70000000-0000-0000-0000-000000000001'),
  ('c0000000-0000-0000-0000-000000000002', current_date, 'late', 15, now() - interval '2 hours 15 minutes', null, 'rfid', '70000000-0000-0000-0000-000000000001'),
  ('c0000000-0000-0000-0000-000000000003', current_date, 'absent', 0, null, null, 'rfid', null),
  ('c0000000-0000-0000-0000-000000000004', current_date, 'present', 0, now() - interval '3 hours 10 minutes', null, 'qr', '70000000-0000-0000-0000-000000000002'),
  ('c0000000-0000-0000-0000-000000000005', current_date, 'excused', 0, null, null, 'rfid', null),
  ('c0000000-0000-0000-0000-000000000006', current_date, 'present', 0, null, null, 'rfid', null),
  ('b0000000-0000-0000-0000-000000000001', current_date, 'present', 0, now() - interval '3 hours 30 minutes', now() - interval '30 minutes', 'rfid', '70000000-0000-0000-0000-000000000001')
on conflict (user_id, summary_date) do nothing;

-- 12. SAMPLE EXCUSE SLIPS
insert into public.excuse_slips (id, student_id, section_id, date_from, date_to, reason, status) values
  ('f5000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000005', '22222222-2222-2222-2222-222222222222', current_date, current_date, 'Severe migraine accompanied by high fever. Medical certificate attached.', 'approved'),
  ('f5000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', current_date, current_date, 'Attended official inter-collegiate programming hackathon representing BCP.', 'pending')
on conflict (id) do nothing;
