-- ============================================================================
-- Migration: 20260928000002_academic_schedules.sql
-- Bestlink College of the Philippines - Attendance Monitoring System (AMS)
-- Description: Creates academic_schedules table for multi-role calendar management
-- (Non-class days, legal holidays, school events, suspensions, and exam periods)
-- ============================================================================

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

-- Index for fast range lookups in monthly calendar views
create index if not exists idx_academic_schedules_dates 
  on public.academic_schedules(start_date, end_date);

create index if not exists idx_academic_schedules_type 
  on public.academic_schedules(schedule_type);

-- Enable Row-Level Security
alter table public.academic_schedules enable row level security;

-- RLS Policies
-- 1. All authenticated users (Admin, Teacher, Student) can read academic schedules
create policy "Authenticated users can view academic schedules"
  on public.academic_schedules
  for select
  to authenticated
  using (true);

-- 2. Only Admins can insert, update, or delete academic schedules
create policy "Admins can insert academic schedules"
  on public.academic_schedules
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.users
      where users.id = auth.uid()
      and users.role = 'admin'
    )
  );

create policy "Admins can update academic schedules"
  on public.academic_schedules
  for update
  to authenticated
  using (
    exists (
      select 1 from public.users
      where users.id = auth.uid()
      and users.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.users
      where users.id = auth.uid()
      and users.role = 'admin'
    )
  );

create policy "Admins can delete academic schedules"
  on public.academic_schedules
  for delete
  to authenticated
  using (
    exists (
      select 1 from public.users
      where users.id = auth.uid()
      and users.role = 'admin'
    )
  );

-- Seed Sample Institutional Academic Schedules for 1st Semester 2026-2027
insert into public.academic_schedules (title, schedule_type, start_date, end_date, description, affected_scope)
values
  ('National Heroes Day', 'holiday', '2026-08-31', '2026-08-31', 'Regular National Holiday - No classes across all campuses.', 'all'),
  ('BCP Foundation Week & Sportsfest', 'school_event', '2026-09-14', '2026-09-18', 'Annual institutional sportsfest, cultural festivities, and academic competitions.', 'all'),
  ('Faculty In-Service & Curriculum Development Day', 'no_classes', '2026-09-21', '2026-09-21', 'Faculty development workshop and syllabus planning. No student classes.', 'college'),
  ('Midterm Examination Week', 'exam_week', '2026-10-12', '2026-10-16', '1st Semester Midterm Assessment Period across all college programs.', 'college'),
  ('All Saints Day Special Non-Working Day', 'holiday', '2026-11-01', '2026-11-02', 'Special Non-Working Holiday.', 'all'),
  ('Bonifacio Day', 'holiday', '2026-11-30', '2026-11-30', 'Regular National Holiday - No classes.', 'all')
on conflict do nothing;
