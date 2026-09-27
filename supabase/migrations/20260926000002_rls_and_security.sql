-- Bestlink College of the Philippines Attendance Monitoring System (AMS)
-- Subsystem of SMS 1 (School Management System)
-- Migration 02: Row-Level Security (RLS) Policies & Defense-in-Depth
-- Authoritative Reference: docs/Security.md, docs/UI-UX_BackendSpec.md

-- 1. Enable RLS on all tables
alter table users enable row level security;
alter table parent_contacts enable row level security;
alter table sections enable row level security;
alter table student_sections enable row level security;
alter table teacher_sections enable row level security;
alter table rfid_cards enable row level security;
alter table qr_codes enable row level security;
alter table scan_devices enable row level security;
alter table attendance_logs enable row level security;
alter table attendance_summary enable row level security;
alter table holidays enable row level security;
alter table excuse_slips enable row level security;
alter table alerts_log enable row level security;
alter table award_periods enable row level security;
alter table award_qualifications enable row level security;
alter table audit_log enable row level security;

-- Helper security function: Check user role
create or replace function auth_role()
returns text
language sql
stable
security definer
as $$
  select role from public.users where id = auth.uid();
$$;

-- 2. USERS POLICIES
create policy "users_select_policy" on users
for select using (
  auth.uid() = id or
  auth_role() = 'admin' or
  (
    auth_role() = 'teacher' and
    id in (
      select ss.student_id from student_sections ss
      join teacher_sections ts on ts.section_id = ss.section_id
      where ts.teacher_id = auth.uid()
    )
  )
);

create policy "users_admin_write_policy" on users
for all using (auth_role() = 'admin');

-- 3. PARENT CONTACTS POLICIES
create policy "parent_contacts_student_read" on parent_contacts
for select using (student_id = auth.uid());

create policy "parent_contacts_teacher_read" on parent_contacts
for select using (
  auth_role() = 'teacher' and
  student_id in (
    select ss.student_id from student_sections ss
    join teacher_sections ts on ts.section_id = ss.section_id
    where ts.teacher_id = auth.uid()
  )
);

create policy "parent_contacts_admin_all" on parent_contacts
for all using (auth_role() = 'admin');

-- 4. SECTIONS & JUNCTIONS
create policy "sections_read_authenticated" on sections
for select using (auth.uid() is not null);

create policy "sections_admin_all" on sections
for all using (auth_role() = 'admin');

create policy "student_sections_read" on student_sections
for select using (
  student_id = auth.uid() or
  auth_role() in ('admin', 'teacher')
);

create policy "student_sections_admin_write" on student_sections
for all using (auth_role() = 'admin');

create policy "teacher_sections_read" on teacher_sections
for select using (
  teacher_id = auth.uid() or
  auth_role() in ('admin', 'teacher', 'student')
);

create policy "teacher_sections_admin_write" on teacher_sections
for all using (auth_role() = 'admin');

-- 5. CREDENTIALS (RFID & QR)
create policy "rfid_cards_owner_read" on rfid_cards
for select using (user_id = auth.uid());

create policy "rfid_cards_admin_all" on rfid_cards
for all using (auth_role() = 'admin');

create policy "qr_codes_owner_read" on qr_codes
for select using (user_id = auth.uid());

create policy "qr_codes_admin_all" on qr_codes
for all using (auth_role() = 'admin');

-- 6. SCAN DEVICES (Admin / Service Role only)
create policy "devices_admin_only" on scan_devices
for all using (auth_role() = 'admin');

-- 7. ATTENDANCE LOGS POLICIES
create policy "logs_student_read" on attendance_logs
for select using (student_id = auth.uid());

create policy "logs_teacher_read" on attendance_logs
for select using (
  teacher_id = auth.uid() or
  section_id in (
    select section_id from teacher_sections where teacher_id = auth.uid()
  )
);

create policy "logs_teacher_manual_insert" on attendance_logs
for insert with check (
  auth_role() = 'teacher' and
  scan_method = 'manual' and
  created_by = auth.uid() and
  section_id in (
    select section_id from teacher_sections where teacher_id = auth.uid()
  )
);

create policy "logs_admin_all" on attendance_logs
for all using (auth_role() = 'admin');

-- 8. ATTENDANCE SUMMARY POLICIES
create policy "summary_student_read" on attendance_summary
for select using (user_id = auth.uid());

create policy "summary_teacher_read" on attendance_summary
for select using (
  user_id = auth.uid() or
  user_id in (
    select ss.student_id from student_sections ss
    join teacher_sections ts on ts.section_id = ss.section_id
    where ts.teacher_id = auth.uid()
  )
);

create policy "summary_admin_all" on attendance_summary
for all using (auth_role() = 'admin');

-- 9. HOLIDAYS POLICIES
create policy "holidays_read_authenticated" on holidays
for select using (auth.uid() is not null);

create policy "holidays_admin_all" on holidays
for all using (auth_role() = 'admin');

-- 10. EXCUSE SLIPS POLICIES
create policy "slips_student_insert" on excuse_slips
for insert with check (
  student_id = auth.uid() and
  status = 'pending'
);

create policy "slips_student_read" on excuse_slips
for select using (student_id = auth.uid());

create policy "slips_teacher_review" on excuse_slips
for all using (
  section_id in (
    select section_id from teacher_sections where teacher_id = auth.uid()
  ) or auth_role() = 'admin'
);

-- 11. ALERTS LOG POLICIES
create policy "alerts_log_student_read" on alerts_log
for select using (student_id = auth.uid());

create policy "alerts_log_admin_all" on alerts_log
for all using (auth_role() = 'admin');

-- 12. AWARD PERIODS & QUALIFICATIONS
create policy "awards_read_authenticated" on award_periods
for select using (auth.uid() is not null);

create policy "awards_admin_all" on award_periods
for all using (auth_role() = 'admin');

create policy "qualifications_read_authenticated" on award_qualifications
for select using (
  user_id = auth.uid() or
  auth_role() in ('admin', 'teacher')
);

create policy "qualifications_admin_all" on award_qualifications
for all using (auth_role() = 'admin');

-- 13. AUDIT LOG (Immutable append-only, Admin read)
create policy "audit_log_admin_read" on audit_log
for select using (auth_role() = 'admin');
