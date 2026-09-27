-- Bestlink College of the Philippines - Attendance Monitoring System (AMS)
-- Migration: 20260928000001_teacher_daily_attendance.sql
-- Description: Enhances attendance_summary for paired Time-In/Time-Out daily records
-- Authoritative Reference: docs/WORKFLOW.md, docs/DATA.md, docs/DB_E2E_WORKFLOW.md

-- 1. Add paired time columns to attendance_summary
alter table attendance_summary
  add column if not exists time_in timestamptz,
  add column if not exists time_out timestamptz,
  add column if not exists scan_method text default 'rfid',
  add column if not exists device_id uuid references scan_devices(id);

-- 2. Create index for fast user and date lookups on attendance_summary
create index if not exists idx_attendance_summary_user_date on attendance_summary (user_id, summary_date desc);

-- 3. Stored Procedure: fn_get_teacher_daily_records
-- Retrieves teacher daily attendance records with paired Time-In, Time-Out, and computed duration
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
  from attendance_summary s
  left join scan_devices d on d.id = s.device_id
  where s.user_id = p_teacher_id
    and (p_date_from is null or s.summary_date >= p_date_from)
    and (p_date_to is null or s.summary_date <= p_date_to)
    and (p_status is null or s.status = p_status)
  order by s.summary_date desc;
end;
$$;
