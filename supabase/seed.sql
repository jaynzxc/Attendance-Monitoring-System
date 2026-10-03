-- Bestlink College of the Philippines Attendance Monitoring System (AMS)
-- Subsystem of SMS 1 (School Management System)
-- Development Seed Data: Realistic Users, Sections, Scanners, Logs & Summaries
-- Authoritative Reference: docs/DATA.md, docs/UI-UX_Architecture.md

-- 1. SECTIONS
insert into sections (id, name, grade_level, school_year) values
  ('11111111-1111-1111-1111-111111111111', '31001', '3rd Year', '2026-2027'),
  ('22222222-2222-2222-2222-222222222222', '31002', '3rd Year', '2026-2027'),
  ('33333333-3333-3333-3333-333333333333', '21001', '2nd Year', '2026-2027'),
  ('44444444-4444-4444-4444-444444444444', '11001', '1st Year', '2026-2027'),
  ('55555555-5555-5555-5555-555555555555', '41001', '4th Year', '2026-2027')
on conflict (id) do update set
  name = excluded.name,
  grade_level = excluded.grade_level,
  school_year = excluded.school_year;

-- 2. AUTH USERS (Supabase Auth - Default Password: Bestlink@2026)
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
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'jaynzxc.devs@gmail.com', crypt('#Admin123', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{"role":"admin"}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'b0000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'jayncanicon0722@gmail.com', crypt('#Sa8080', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{"role":"teacher"}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'prof.reyes@bestlink.edu.ph', crypt('#Re8080', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{"role":"teacher"}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'jayncanicon03@gmail.com', crypt('#De8080', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{"role":"student"}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'maria.clara@gmail.com', crypt('#Cl8080', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{"role":"student"}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'jose.rizal@gmail.com', crypt('#Ri8080', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{"role":"student"}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'andres.bonifacio@gmail.com', crypt('#Bo8080', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{"role":"student"}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'gabriela.silang@gmail.com', crypt('#Si8080', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{"role":"student"}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-000000000006', 'authenticated', 'authenticated', 'emilio.aguinaldo@gmail.com', crypt('#Ag8080', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{"role":"student"}', now(), now(), '', '', '', '')
on conflict (id) do nothing;

-- 3. USERS (Public Profiles & Roles)
-- Fixed UUIDs for consistent development testing
insert into users (id, role, first_name, last_name, email, student_number, employee_number, status) values
  -- Admin
  ('a0000000-0000-0000-0000-000000000001', 'admin', 'Administrator', '', 'jaynzxc.devs@gmail.com', null, 'EMP-2020-001', 'active'),
  -- Teachers
  ('b0000000-0000-0000-0000-000000000001', 'teacher', 'Ricardo', 'Santos', 'jayncanicon0722@gmail.com', null, 't230110001', 'active'),
  ('b0000000-0000-0000-0000-000000000002', 'teacher', 'Carmen', 'Reyes', 'prof.reyes@bestlink.edu.ph', null, 't230110002', 'active'),
  -- Students (Section 31001)
  ('c0000000-0000-0000-0000-000000000001', 'student', 'Juan', 'Dela Cruz', 'jayncanicon03@gmail.com', 's230110001', null, 'active'),
  ('c0000000-0000-0000-0000-000000000002', 'student', 'Maria', 'Clara', 'maria.clara@student.bestlink.edu.ph', 's230110002', null, 'active'),
  ('c0000000-0000-0000-0000-000000000003', 'student', 'Jose', 'Rizal', 'jose.rizal@student.bestlink.edu.ph', 's230110003', null, 'active'),
  -- Students (Section 31002)
  ('c0000000-0000-0000-0000-000000000004', 'student', 'Andres', 'Bonifacio', 'andres.bonifacio@student.bestlink.edu.ph', 's230110004', null, 'active'),
  ('c0000000-0000-0000-0000-000000000005', 'student', 'Gabriela', 'Silang', 'gabriela.silang@student.bestlink.edu.ph', 's230110005', null, 'active'),
  -- Student (Section 21001)
  ('c0000000-0000-0000-0000-000000000006', 'student', 'Emilio', 'Aguinaldo', 'emilio.aguinaldo@student.bestlink.edu.ph', 's230110006', null, 'active')
on conflict (id) do update set
  student_number = excluded.student_number,
  first_name = excluded.first_name,
  last_name = excluded.last_name,
  email = excluded.email,
  role = excluded.role,
  status = excluded.status;

-- 3. PARENT CONTACTS
insert into parent_contacts (id, student_id, full_name, relationship, mobile_number, is_primary) values
  ('d0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'Teresa Dela Cruz', 'Mother', '+639171234567', true),
  ('d0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000002', 'Alfonso Clara', 'Father', '+639189876543', true),
  ('d0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000004', 'Catalina Bonifacio', 'Mother', '+639205551234', true)
on conflict (id) do nothing;

-- 4. SECTION ASSIGNMENTS
-- Student Section enrollment
insert into student_sections (student_id, section_id) values
  ('c0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111'),
  ('c0000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111'),
  ('c0000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111'),
  ('c0000000-0000-0000-0000-000000000004', '22222222-2222-2222-2222-222222222222'),
  ('c0000000-0000-0000-0000-000000000005', '22222222-2222-2222-2222-222222222222'),
  ('c0000000-0000-0000-0000-000000000006', '33333333-3333-3333-3333-333333333333')
on conflict (student_id, section_id) do nothing;

-- Teacher Section advisory / assignments
insert into teacher_sections (teacher_id, section_id, subject) values
  ('b0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Systems Architecture'),
  ('b0000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'Database Systems'),
  ('b0000000-0000-0000-0000-000000000002', '33333333-3333-3333-3333-333333333333', 'Information Management')
on conflict (teacher_id, section_id, subject) do nothing;

-- 5. RFID CARDS & QR CODES
insert into rfid_cards (id, card_uid, user_id, is_active) values
  ('e0000000-0000-0000-0000-000000000001', 'E2806894', 'c0000000-0000-0000-0000-000000000001', true),
  ('e0000000-0000-0000-0000-000000000002', 'A1B2C3D4', 'c0000000-0000-0000-0000-000000000002', true),
  ('e0000000-0000-0000-0000-000000000003', '99887766', 'b0000000-0000-0000-0000-000000000001', true)
on conflict (id) do nothing;

insert into qr_codes (id, code_value, user_id, is_active) values
  ('f0000000-0000-0000-0000-000000000001', 'bcp_qr_sec_tok_delacruz_01', 'c0000000-0000-0000-0000-000000000001', true),
  ('f0000000-0000-0000-0000-000000000002', 'bcp_qr_sec_tok_clara_02', 'c0000000-0000-0000-0000-000000000002', true),
  ('f0000000-0000-0000-0000-000000000003', 'bcp_qr_sec_tok_santos_01', 'b0000000-0000-0000-0000-000000000001', true)
on conflict (id) do nothing;

-- 6. SCAN DEVICES (ESP32 Gate Ingress)
insert into scan_devices (id, device_code, location, api_key_hash, status, last_heartbeat) values
  ('70000000-0000-0000-0000-000000000001', 'GATE-01-ESP32', 'Main Gate Turnstile A', encode(digest('esp32_dev_secret_gate01', 'sha256'), 'hex'), 'online', now()),
  ('70000000-0000-0000-0000-000000000002', 'GATE-02-ESP32', 'East Annex Gate Turnstile B', encode(digest('esp32_dev_secret_gate02', 'sha256'), 'hex'), 'online', now())
on conflict (id) do nothing;

-- 7. HOLIDAYS
insert into holidays (id, holiday_date, description) values
  ('80000000-0000-0000-0000-000000000001', '2026-11-01', 'All Saints Day'),
  ('80000000-0000-0000-0000-000000000002', '2026-11-30', 'Bonifacio Day'),
  ('80000000-0000-0000-0000-000000000003', '2026-12-25', 'Christmas Day'),
  ('80000000-0000-0000-0000-000000000004', '2026-12-30', 'Rizal Day')
on conflict (id) do nothing;

-- 8. AWARD PERIODS
insert into award_periods (id, name, start_date, end_date, max_allowed_excused) values
  ('90000000-0000-0000-0000-000000000001', '1st Semester 2026-2027', '2026-08-15', '2026-12-20', 1)
on conflict (id) do nothing;

-- 9. ATTENDANCE LOGS & DAILY SUMMARIES
-- Today's live logs
insert into attendance_logs (student_id, section_id, device_id, scan_method, event_type, status, scanned_at, is_voided, voided_by, voided_at, void_reason) values
  ('c0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', '70000000-0000-0000-0000-000000000001', 'rfid', 'time_in', 'present', now() - interval '3 hours', false, null, null, null),
  ('c0000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', '70000000-0000-0000-0000-000000000001', 'rfid', 'time_in', 'late', now() - interval '2 hours 15 minutes', false, null, null, null),
  ('c0000000-0000-0000-0000-000000000004', '22222222-2222-2222-2222-222222222222', '70000000-0000-0000-0000-000000000002', 'qr', 'time_in', 'present', now() - interval '3 hours 10 minutes', false, null, null, null),
  -- 1 EXAMPLE OF VOIDED STUDENT: Jose Rizal scanned in, but was VOIDED by teacher Prof. Ricardo Santos due to buddy punching / proxy tap
  ('c0000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', '70000000-0000-0000-0000-000000000001', 'rfid', 'time_in', 'absent', now() - interval '1 hour 45 minutes', true, 'b0000000-0000-0000-0000-000000000001', now() - interval '1 hour 30 minutes', 'Proxy badge tap detected / student absent in room');

-- Teacher check-in
insert into attendance_logs (teacher_id, device_id, scan_method, event_type, status, scanned_at) values
  ('b0000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001', 'rfid', 'time_in', 'present', now() - interval '3 hours 30 minutes');

-- Today's attendance summary
insert into attendance_summary (user_id, summary_date, status, minutes_late, time_in, time_out, scan_method, device_id) values
  ('c0000000-0000-0000-0000-000000000001', current_date, 'present', 0, now() - interval '3 hours', null, 'rfid', '70000000-0000-0000-0000-000000000001'),
  ('c0000000-0000-0000-0000-000000000002', current_date, 'late', 15, now() - interval '2 hours 15 minutes', null, 'rfid', '70000000-0000-0000-0000-000000000001'),
  ('c0000000-0000-0000-0000-000000000003', current_date, 'absent', 0, null, null, 'rfid', null),
  ('c0000000-0000-0000-0000-000000000004', current_date, 'present', 0, now() - interval '3 hours 10 minutes', null, 'qr', '70000000-0000-0000-0000-000000000002'),
  ('c0000000-0000-0000-0000-000000000005', current_date, 'excused', 0, null, null, 'rfid', null),
  ('c0000000-0000-0000-0000-000000000006', current_date, 'present', 0, null, null, 'rfid', null),
  ('b0000000-0000-0000-0000-000000000001', current_date, 'present', 0, now() - interval '3 hours 30 minutes', null, 'rfid', '70000000-0000-0000-0000-000000000001')
on conflict (user_id, summary_date) do nothing;

-- 10. SAMPLE EXCUSE SLIP (Pending review)
insert into excuse_slips (id, student_id, section_id, date_from, date_to, reason, status) values
  ('f5000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000005', '22222222-2222-2222-2222-222222222222', current_date, current_date, 'Severe migraine accompanied by high fever. Medical certificate attached.', 'approved'),
  ('f5000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', current_date, current_date, 'Attended official inter-collegiate programming hackathon representing BCP.', 'pending')
on conflict (id) do nothing;
