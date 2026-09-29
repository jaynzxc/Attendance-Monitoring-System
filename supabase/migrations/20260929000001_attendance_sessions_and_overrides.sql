-- Bestlink College of the Philippines Attendance Monitoring System (AMS)
-- Subsystem of SMS 1 (School Management System)
-- Migration: 20260929000001_attendance_sessions_and_overrides.sql
-- Description: Core Attendance Sessions, Geo-QR tokens, Buddy-Punch Voiding, and Manual Attendance Overrides
-- Authoritative Reference: docs/ATTENDANCE_PLAN.md, docs/DATA.md, docs/Security.md

-- ============================================================================
-- 1. SYSTEM SETTINGS TABLE (Defensive Creation & Default Parameters)
-- ============================================================================

create table if not exists public.system_settings (
  setting_key text primary key,
  setting_value text not null,
  description text,
  updated_at timestamptz not null default now()
);

alter table public.system_settings enable row level security;

-- Default Settings for Attendance Sessions & Anti-Buddy-Punch
insert into public.system_settings (setting_key, setting_value, description) values
  ('attendance_present_window_min', '20', 'Threshold minutes from session start to mark attendance as Present (vs Late)'),
  ('attendance_session_duration_min', '30', 'Total duration in minutes an attendance session remains open'),
  ('anti_passback_cooldown_sec', '300', 'Anti-passback cooldown window in seconds (5 minutes) to prevent duplicate card taps'),
  ('qr_geo_radius_meters', '50', 'Maximum allowable student-to-teacher geolocation distance in meters for QR scans'),
  ('qr_token_rotation_sec', '30', 'Dynamic ephemeral QR token rotation interval in seconds')
on conflict (setting_key) do update set
  description = excluded.description;

-- Ensure RLS on system_settings
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'system_settings' and policyname = 'system_settings_read_all'
  ) then
    create policy "system_settings_read_all" on public.system_settings
      for select to authenticated using (true);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'system_settings' and policyname = 'system_settings_admin_all'
  ) then
    create policy "system_settings_admin_all" on public.system_settings
      for all using (
        exists (
          select 1 from public.users
          where users.id = auth.uid() and users.role = 'admin'
        )
      );
  end if;
end $$;

-- ============================================================================
-- 2. ATTENDANCE SESSIONS TABLE
-- ============================================================================

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

-- Performance Indexes
create index if not exists idx_sessions_device_active
  on public.attendance_sessions(device_id, status, session_end)
  where status = 'active';

create index if not exists idx_sessions_token_active
  on public.attendance_sessions(session_token)
  where status = 'active';

create unique index if not exists idx_sessions_section_active
  on public.attendance_sessions(section_id)
  where status = 'active';

create index if not exists idx_sessions_created_by
  on public.attendance_sessions(created_by, session_start desc);

create index if not exists idx_sessions_section_date
  on public.attendance_sessions(section_id, session_start desc);

-- ============================================================================
-- 3. ALTER ATTENDANCE_LOGS TABLE
-- ============================================================================

alter table public.attendance_logs
  add column if not exists session_id uuid references public.attendance_sessions(id) on delete set null,
  add column if not exists is_voided boolean not null default false,
  add column if not exists voided_by uuid references public.users(id) on delete set null,
  add column if not exists voided_at timestamptz,
  add column if not exists is_manual boolean not null default false,
  add column if not exists student_lat float8,
  add column if not exists student_lng float8;

create index if not exists idx_attendance_logs_session
  on public.attendance_logs(session_id);

create index if not exists idx_attendance_logs_voided
  on public.attendance_logs(is_voided)
  where is_voided = true;

-- ============================================================================
-- 4. ROW-LEVEL SECURITY (RLS) FOR ATTENDANCE_SESSIONS
-- ============================================================================

alter table public.attendance_sessions enable row level security;

-- Select Policy:
-- - Admins can read all sessions
-- - Teachers can read sessions for their assigned sections or created by them
-- - Students can read active sessions for sections they are enrolled in
create policy "sessions_select_policy" on public.attendance_sessions
  for select using (
    exists (
      select 1 from public.users u
      where u.id = auth.uid() and u.role = 'admin'
    )
    or
    (
      exists (
        select 1 from public.users u
        where u.id = auth.uid() and u.role = 'teacher'
      )
      and (
        created_by = auth.uid()
        or section_id in (
          select section_id from public.teacher_sections
          where teacher_id = auth.uid()
        )
      )
    )
    or
    (
      exists (
        select 1 from public.users u
        where u.id = auth.uid() and u.role = 'student'
      )
      and status = 'active'
      and section_id in (
        select section_id from public.student_sections
        where student_id = auth.uid()
      )
    )
  );

-- Insert Policy:
-- - Admins can start sessions for any section
-- - Teachers can start sessions for their assigned sections
create policy "sessions_insert_policy" on public.attendance_sessions
  for insert with check (
    exists (
      select 1 from public.users u
      where u.id = auth.uid() and u.role = 'admin'
    )
    or
    (
      exists (
        select 1 from public.users u
        where u.id = auth.uid() and u.role = 'teacher'
      )
      and created_by = auth.uid()
      and section_id in (
        select section_id from public.teacher_sections
        where teacher_id = auth.uid()
      )
    )
  );

-- Update Policy:
-- - Admins can update any session
-- - Teachers can update sessions they created (e.g., close session early or rotate QR token)
create policy "sessions_update_policy" on public.attendance_sessions
  for update using (
    exists (
      select 1 from public.users u
      where u.id = auth.uid() and u.role = 'admin'
    )
    or
    (
      exists (
        select 1 from public.users u
        where u.id = auth.uid() and u.role = 'teacher'
      )
      and created_by = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.users u
      where u.id = auth.uid() and u.role = 'admin'
    )
    or
    (
      exists (
        select 1 from public.users u
        where u.id = auth.uid() and u.role = 'teacher'
      )
      and created_by = auth.uid()
    )
  );

-- Delete Policy: Admins only
create policy "sessions_delete_admin" on public.attendance_sessions
  for delete using (
    exists (
      select 1 from public.users u
      where u.id = auth.uid() and u.role = 'admin'
    )
  );

-- ============================================================================
-- 5. STORED PROCEDURE: fn_start_attendance_session
-- ============================================================================

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

  -- Verify Section Exists
  select name into v_section_name from public.sections where id = p_section_id;
  if not found then
    raise exception 'Section with ID % does not exist.', p_section_id;
  end if;

  -- If Teacher, verify assigned to this section
  if v_actor_role = 'teacher' then
    if not exists (
      select 1 from public.teacher_sections
      where teacher_id = v_actor_id and section_id = p_section_id
    ) then
      raise exception 'Forbidden: Teacher is not assigned to section %.', v_section_name;
    end if;
  end if;

  -- Block concurrent active sessions for the same section
  select id into v_existing_id
  from public.attendance_sessions
  where section_id = p_section_id and status = 'active';

  if v_existing_id is not null then
    raise exception 'An active attendance session is already open for section %.', v_section_name;
  end if;

  -- If RFID method and device specified, verify device is not already tied to another active session
  if p_scan_method = 'rfid' and p_device_id is not null then
    select id into v_existing_id
    from public.attendance_sessions
    where device_id = p_device_id and status = 'active';

    if v_existing_id is not null then
      raise exception 'The selected scanner device is currently in use by another active session.';
    end if;
  end if;

  -- Fetch configured durations from system_settings
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

  -- Audit Log
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

-- ============================================================================
-- 6. STORED PROCEDURE: fn_close_attendance_session
-- ============================================================================

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

  -- Close the session
  update public.attendance_sessions
  set status = 'closed',
      session_end = least(session_end, now())
  where id = p_session_id;

  -- Safety Net / Automatic Absence Marking for Enrolled Students without Scans
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
    -- Check if student has an existing summary record for today
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

  -- Audit Log
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

-- ============================================================================
-- 7. STORED PROCEDURE: fn_rotate_session_qr_token
-- ============================================================================

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

  -- Check if session expired
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

-- ============================================================================
-- 8. STORED PROCEDURE: fn_manual_attendance_override
-- ============================================================================

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

  -- Validate target user
  select role, first_name || ' ' || last_name into v_user_role, v_user_name
  from public.users where id = p_user_id;

  if not found then
    raise exception 'Target user not found.';
  end if;

  -- Validate status
  if p_status not in ('present', 'late', 'absent', 'excused') then
    raise exception 'Invalid status: %. Must be present, late, absent, or excused.', p_status;
  end if;

  if p_status = 'late' then
    v_minutes_late := 15;
  end if;

  -- Resolve Section ID
  v_section_id := p_section_id;
  if v_section_id is null and p_session_id is not null then
    select section_id into v_section_id from public.attendance_sessions where id = p_session_id;
  end if;

  -- Role-based checks
  if v_actor_role = 'teacher' then
    if v_user_role <> 'student' then
      raise exception 'Teachers may only record manual attendance for students.';
    end if;

    if v_section_id is null then
      raise exception 'Section ID is required for teacher manual attendance override.';
    end if;

    -- Verify teacher assigned to section
    if not exists (
      select 1 from public.teacher_sections
      where teacher_id = v_actor_id and section_id = v_section_id
    ) then
      raise exception 'Teacher is not assigned to this section.';
    end if;

    -- Verify student enrolled in section
    if not exists (
      select 1 from public.student_sections
      where student_id = p_user_id and section_id = v_section_id
    ) then
      raise exception 'Student is not enrolled in this section.';
    end if;
  end if;

  -- Insert into attendance_logs
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

  -- Upsert into attendance_summary
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

  -- Append to audit_log
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

-- ============================================================================
-- 9. STORED PROCEDURE: fn_void_attendance_record (Buddy-Punch Voiding)
-- ============================================================================

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

  -- Fetch existing log
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

  -- Authorization check
  if v_actor_role <> 'admin' then
    if v_actor_role <> 'teacher' then
      raise exception 'Unauthorized: Only teachers or administrators can void attendance records.';
    end if;

    -- Verify teacher assigned to section or created the session
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

  -- 1. Update attendance_logs to voided
  update public.attendance_logs
  set 
    is_voided = true,
    voided_by = v_actor_id,
    voided_at = now()
  where id = p_log_id;

  -- 2. Update attendance_summary to absent
  update public.attendance_summary
  set 
    status = 'absent',
    minutes_late = 0
  where user_id = v_target_user_id 
    and summary_date = v_log.scanned_at::date;

  -- 3. Append to audit_log
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

  -- Return complete payload ready for Realtime notification, Prefect webhook, and Parent SMS
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

-- ============================================================================
-- 10. REALTIME PUBLICATION SUBSCRIPTION
-- ============================================================================

do $$
begin
  if not exists (
    select 1 from pg_publication_tables 
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'attendance_sessions'
  ) then
    alter publication supabase_realtime add table public.attendance_sessions;
  end if;

  if not exists (
    select 1 from pg_publication_tables 
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'attendance_logs'
  ) then
    alter publication supabase_realtime add table public.attendance_logs;
  end if;
exception
  when others then
    -- Ignore gracefully in environments where publication is unmanaged
    null;
end $$;
