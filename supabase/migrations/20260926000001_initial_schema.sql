-- Bestlink College of the Philippines Attendance Monitoring System (AMS)
-- Subsystem of SMS 1 (School Management System)
-- Migration 01: Core Relational Database DDL Schema
-- Authoritative Reference: docs/DATA.md, docs/ARCHITECTURE.md, docs/DB_E2E_WORKFLOW.md

-- Extensions
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- 1. USERS
-- Central identity table extending auth.users
create table if not exists users (
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
-- Guardian mobile numbers linked to student profiles (SMS notifications only, no web credentials)
create table if not exists parent_contacts (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references users(id) on delete cascade,
  full_name text not null,
  relationship text,
  mobile_number text not null check (mobile_number ~ '^\+639\d{9}$'),
  is_primary boolean not null default true,
  created_at timestamptz not null default now()
);

-- 3. SECTIONS
-- Curriculum class sections
create table if not exists sections (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  grade_level text,
  school_year text not null,
  created_at timestamptz not null default now()
);

-- 4. STUDENT_SECTIONS (Junction)
create table if not exists student_sections (
  student_id uuid not null references users(id) on delete cascade,
  section_id uuid not null references sections(id) on delete cascade,
  primary key (student_id, section_id)
);

-- 5. TEACHER_SECTIONS (Junction)
create table if not exists teacher_sections (
  teacher_id uuid not null references users(id) on delete cascade,
  section_id uuid not null references sections(id) on delete cascade,
  subject text not null default 'General',
  primary key (teacher_id, section_id, subject)
);

-- 6. RFID CARDS
-- Hardware RFID credential registry
create table if not exists rfid_cards (
  id uuid primary key default gen_random_uuid(),
  card_uid text unique not null,
  user_id uuid not null references users(id) on delete cascade,
  is_active boolean not null default true,
  issued_at timestamptz not null default now()
);

-- 7. QR CODES
-- Fallback QR credential registry
create table if not exists qr_codes (
  id uuid primary key default gen_random_uuid(),
  code_value text unique not null,
  user_id uuid not null references users(id) on delete cascade,
  is_active boolean not null default true,
  issued_at timestamptz not null default now()
);

-- 8. SCAN DEVICES
-- ESP32 microcontrollers registry and gateway telemetry
create table if not exists scan_devices (
  id uuid primary key default gen_random_uuid(),
  device_code text unique not null,
  location text,
  api_key_hash text not null,
  last_heartbeat timestamptz,
  status text not null default 'offline' check (status in ('online', 'offline')),
  created_at timestamptz not null default now()
);

-- 9. ATTENDANCE LOGS
-- Immutable system of record for all scan and manual events
create table if not exists attendance_logs (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references users(id) on delete cascade,
  teacher_id uuid references users(id) on delete cascade,
  section_id uuid references sections(id),
  device_id uuid references scan_devices(id),
  scan_method text not null check (scan_method in ('rfid', 'qr', 'manual')),
  event_type text not null check (event_type in ('time_in', 'time_out')),
  status text not null check (status in ('present', 'late', 'absent', 'excused')),
  scanned_at timestamptz not null default now(),
  created_by uuid references users(id),
  check (student_id is not null or teacher_id is not null)
);

-- 10. ATTENDANCE SUMMARY
-- Daily pre-aggregated records for calendar grids, analytics KPIs, and award evaluation
create table if not exists attendance_summary (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  summary_date date not null,
  status text not null check (status in ('present', 'late', 'absent', 'excused', 'holiday')),
  minutes_late int not null default 0,
  unique (user_id, summary_date)
);

-- 11. HOLIDAYS
create table if not exists holidays (
  id uuid primary key default gen_random_uuid(),
  holiday_date date unique not null,
  description text
);

-- 12. EXCUSE SLIPS
create table if not exists excuse_slips (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references users(id) on delete cascade,
  section_id uuid references sections(id),
  date_from date not null,
  date_to date not null,
  reason text not null,
  attachment_url text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

-- 13. ALERTS LOG
-- Audit trail of parent SMS notifications
create table if not exists alerts_log (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references users(id) on delete cascade,
  parent_contact_id uuid references parent_contacts(id),
  channel text not null default 'sms' check (channel in ('sms')),
  message text not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

-- 14. AWARD PERIODS
create table if not exists award_periods (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  start_date date not null,
  end_date date not null,
  max_allowed_excused int not null default 0
);

-- 15. AWARD QUALIFICATIONS
create table if not exists award_qualifications (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null references award_periods(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  qualified boolean not null default true,
  evaluated_at timestamptz not null default now(),
  unique (period_id, user_id)
);

-- 16. AUDIT LOG
-- Append-only institutional security and compliance audit trail
create table if not exists audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references users(id),
  action text not null,
  table_name text,
  record_id uuid,
  details jsonb,
  created_at timestamptz not null default now()
);

-- Performance Indexes
create index if not exists idx_attendance_student_date on attendance_logs (student_id, scanned_at desc);
create index if not exists idx_attendance_teacher_date on attendance_logs (teacher_id, scanned_at desc);
create index if not exists idx_attendance_summary_user_date on attendance_summary (user_id, summary_date desc);
create index if not exists idx_excuse_slips_student on excuse_slips (student_id, status);
create index if not exists idx_excuse_slips_section on excuse_slips (section_id, status);
create index if not exists idx_rfid_cards_uid on rfid_cards (card_uid);
create index if not exists idx_qr_codes_val on qr_codes (code_value);
create index if not exists idx_alerts_log_student on alerts_log (student_id, created_at desc);
create index if not exists idx_audit_log_actor on audit_log (actor_id, created_at desc);
