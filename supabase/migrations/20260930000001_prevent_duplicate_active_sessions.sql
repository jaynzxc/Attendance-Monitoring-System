-- Migration: 20260930000001_prevent_duplicate_active_sessions.sql
-- Description: Enforce single active session rule for sections and faculty attendance in fn_start_attendance_session

create or replace function public.fn_start_attendance_session(
  p_section_id uuid default null,
  p_scan_method text default 'rfid',
  p_device_id uuid default null,
  p_teacher_lat numeric default null,
  p_teacher_lng numeric default null,
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
    where device_id = p_device_id and status = 'active' and session_end > now();

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
    'start_attendance_session',
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
    'id', v_session_id,
    'section_id', p_section_id,
    'section_name', v_section_name,
    'scan_method', p_scan_method,
    'device_id', p_device_id,
    'session_token', v_session_token,
    'session_start', v_start,
    'present_cutoff', v_cutoff,
    'session_end', v_end,
    'status', 'active',
    'geo_radius_meters', v_geo_radius_meters,
    'qr_token_rotation_sec', v_qr_rotation_sec
  );
end;
$$;
