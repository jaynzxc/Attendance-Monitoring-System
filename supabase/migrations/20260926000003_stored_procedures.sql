-- Bestlink College of the Philippines Attendance Monitoring System (AMS)
-- Subsystem of SMS 1 (School Management System)
-- Migration 03: Transactional Stored Procedures (RPCs) & Triggers
-- Authoritative Reference: docs/UI-UX_BackendSpec.md §2, docs/skills.md §3.3

-- 1. fn_get_daily_kpis
-- Computes daily institutional or section KPIs in a single roundtrip
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
  -- Scope calculation by section if requested, otherwise institutional
  if p_section_id is not null then
    select
      count(*),
      count(*) filter (where s.status = 'present'),
      count(*) filter (where s.status = 'late'),
      count(*) filter (where s.status = 'absent'),
      count(*) filter (where s.status = 'excused')
    into v_total, v_present, v_late, v_absent, v_excused
    from student_sections ss
    join users u on u.id = ss.student_id and u.status = 'active'
    left join attendance_summary s on s.user_id = u.id and s.summary_date = p_date
    where ss.section_id = p_section_id;
  else
    select
      count(*),
      count(*) filter (where s.status = 'present'),
      count(*) filter (where s.status = 'late'),
      count(*) filter (where s.status = 'absent'),
      count(*) filter (where s.status = 'excused')
    into v_total, v_present, v_late, v_absent, v_excused
    from users u
    left join attendance_summary s on s.user_id = u.id and s.summary_date = p_date
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
    'present', v_present,
    'late', v_late,
    'absent', v_absent,
    'excused', v_excused,
    'attendance_rate', v_rate
  );
end;
$$;

-- 2. fn_get_5week_trend
-- Rolling 5-week weekly average rate for Chart.js trendline
create or replace function fn_get_5week_trend(p_section_id uuid default null)
returns json
language plpgsql
security definer
as $$
declare
  v_result json;
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
      (w.week_start + interval '4 days')::date as week_end,
      to_char(w.week_start, '"Wk " W (Mon)') as label,
      count(s.id) as total_days,
      count(s.id) filter (where s.status in ('present', 'late')) as attended_days
    from weeks w
    left join attendance_summary s on s.summary_date >= w.week_start and s.summary_date <= (w.week_start + interval '4 days')::date
    left join student_sections ss on ss.student_id = s.user_id
    where (p_section_id is null or ss.section_id = p_section_id)
    group by w.week_start
    order by w.week_start asc
  )
  select json_agg(
    json_build_object(
      'week_label', label,
      'start_date', week_start,
      'end_date', week_end,
      'attendance_rate', case when total_days > 0 then round((attended_days::numeric / total_days::numeric) * 100, 1) else 90.0 end
    )
  ) into v_result
  from weekly_stats;

  return coalesce(v_result, '[]'::json);
end;
$$;

-- 3. fn_review_excuse_slip
-- Atomically reviews slip, updates attendance_summary, and writes audit trail
create or replace function fn_review_excuse_slip(
  p_slip_id uuid,
  p_action text, -- 'approved' or 'rejected'
  p_notes text default null
)
returns json
language plpgsql
security definer
as $$
declare
  v_slip record;
  v_actor_role text;
begin
  select role into v_actor_role from public.users where id = auth.uid();
  if v_actor_role not in ('admin', 'teacher') then
    raise exception 'Unauthorized to review excuse slips';
  end if;

  if p_action not in ('approved', 'rejected') then
    raise exception 'Invalid action. Must be approved or rejected.';
  end if;

  select * into v_slip from excuse_slips where id = p_slip_id;
  if not found then
    raise exception 'Excuse slip not found.';
  end if;

  -- Update excuse slip
  update excuse_slips
  set status = p_action,
      reviewed_by = auth.uid(),
      reviewed_at = now()
  where id = p_slip_id;

  -- If approved, update attendance_summary across the date range to excused
  if p_action = 'approved' then
    update attendance_summary
    set status = 'excused'
    where user_id = v_slip.student_id
      and summary_date >= v_slip.date_from
      and summary_date <= v_slip.date_to;
  end if;

  -- Append to audit_log
  insert into audit_log (actor_id, action, table_name, record_id, details)
  values (
    auth.uid(),
    'review_excuse_slip',
    'excuse_slips',
    p_slip_id,
    json_build_object(
      'student_id', v_slip.student_id,
      'decision', p_action,
      'notes', p_notes,
      'date_from', v_slip.date_from,
      'date_to', v_slip.date_to
    )
  );

  return json_build_object('success', true, 'status', p_action);
end;
$$;

-- 4. fn_manual_attendance_override
-- Manual fallback attendance marking by teachers/admins with audit trail
create or replace function fn_manual_attendance_override(
  p_student_id uuid,
  p_section_id uuid,
  p_status text, -- 'present', 'late', 'absent', 'excused'
  p_reason text default null,
  p_date date default current_date
)
returns json
language plpgsql
security definer
as $$
declare
  v_actor_role text;
  v_log_id uuid;
begin
  select role into v_actor_role from public.users where id = auth.uid();
  if v_actor_role not in ('admin', 'teacher') then
    raise exception 'Unauthorized to perform attendance override';
  end if;

  if p_status not in ('present', 'late', 'absent', 'excused') then
    raise exception 'Invalid status value';
  end if;

  -- Insert into attendance_logs
  insert into attendance_logs (
    student_id,
    section_id,
    scan_method,
    event_type,
    status,
    scanned_at,
    created_by
  ) values (
    p_student_id,
    p_section_id,
    'manual',
    'time_in',
    p_status,
    (p_date::text || ' 08:00:00')::timestamptz,
    auth.uid()
  ) returning id into v_log_id;

  -- Upsert into attendance_summary
  insert into attendance_summary (user_id, summary_date, status, minutes_late)
  values (
    p_student_id,
    p_date,
    p_status,
    case when p_status = 'late' then 15 else 0 end
  )
  on conflict (user_id, summary_date)
  do update set status = excluded.status, minutes_late = excluded.minutes_late;

  -- Write to audit_log
  insert into audit_log (actor_id, action, table_name, record_id, details)
  values (
    auth.uid(),
    'manual_override',
    'attendance_logs',
    v_log_id,
    json_build_object(
      'student_id', p_student_id,
      'section_id', p_section_id,
      'override_status', p_status,
      'reason', p_reason,
      'date', p_date
    )
  );

  return json_build_object('success', true, 'log_id', v_log_id);
end;
$$;

-- 5. handle_new_user
-- Automatically populates public.users when a user signs up via Supabase Auth
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.users (
    id,
    email,
    role,
    first_name,
    last_name,
    student_number,
    employee_number,
    status
  ) values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'role', 'student'),
    coalesce(new.raw_user_meta_data->>'first_name', 'Student'),
    coalesce(new.raw_user_meta_data->>'last_name', 'User'),
    new.raw_user_meta_data->>'student_number',
    new.raw_user_meta_data->>'employee_number',
    'active'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Trigger on auth.users
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
