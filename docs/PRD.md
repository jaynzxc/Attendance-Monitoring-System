# Product Requirements Document (PRD)

## Attendance Monitoring System with Performance Analytics and RFID/QR Scanning

**Capstone Title:** Design and Development of an Attendance Monitoring System for Bestlink College of the Philippines with Performance Analytics and RFID/QR Scanning

**Document Version:** 1.0
**Date:** September 25, 2026
**Status:** Draft

---

## 1. Introduction

### 1.1 Purpose
This document defines the requirements for the Attendance Monitoring System (AMS), a subsystem of the larger School Management System (SMS 1) being developed for Bestlink College of the Philippines. The AMS is the capstone focus module and is designed to operate as a standalone web-based system that can later be integrated with the other SMS 1 subsystems (Library, Clinic, Property Custodian, School Event, OSAS, PREFECT, HR, Financial, Alumni).

### 1.2 Project Background
Bestlink College currently relies on manual or semi-manual methods for tracking student and teacher attendance, tardiness, and absences. This results in delayed reporting, inaccurate records, difficulty tracking attendance trends, and slow communication with parents/guardians regarding student attendance status. The proposed AMS automates attendance capture using RFID/QR scanning hardware and provides real-time analytics to administrators, teachers, and parents.

### 1.3 Main Feature
The system's core differentiator is **Performance Analytics and RFID/QR Scanning** — automated, hardware-based attendance capture combined with a real-time analytics dashboard that surfaces attendance trends, patterns, and at-risk students.

### 1.4 Scope
This PRD covers only the **Attendance Monitoring System** subsystem. Other SMS 1 subsystems are out of scope but the AMS will be designed with integration points (shared student/teacher IDs, shared auth, exportable data) to allow future integration.

---

## 2. Goals and Objectives

| # | Objective |
|---|-----------|
| 1 | Automate daily attendance marking for students and teachers using RFID/QR scanning. |
| 2 | Reduce manual record-keeping errors and administrative workload. |
| 3 | Provide real-time analytics on attendance trends (per student, per section, per department, institution-wide). |
| 4 | Notify parents/guardians automatically of tardiness or absence. |
| 5 | Allow students/parents to submit and track excuse slips digitally. |
| 6 | Recognize students with perfect attendance automatically. |
| 7 | Enable export of attendance data (CSV/Excel) for reporting and compliance. |
| 8 | Build a foundation (shared schema/auth) for integration with other SMS 1 subsystems. |

---

## 3. Target Users / Stakeholders

The system uses **Role-Based Access Control (RBAC)** with three authenticated panels: **Admin**, **Teacher**, and **Student**. Parents/guardians are **not** system users — they are notified passively via **SMS notifications** only and do not have a login or panel.

| Role | Panel Access | Description | Key Needs |
|------|--------------|-------------|-----------|
| **Admin** | Admin Panel | System administrator / registrar / attendance officer (single top-level role covering all administrative functions) | Manage users (students/teachers), RFID/QR device configuration, system settings, section/schedule setup, review & approve/reject excuse slips (or delegate to teacher), monitor institution-wide analytics, manage Perfect Attendance Award rules, generate/export reports, configure SMS alert templates, view audit logs |
| **Teacher** | Teacher Panel | Subject/advisory teacher | Log own attendance (time-in/out), view/manage attendance for own sections, mark manual attendance as fallback, review/approve excuse slips for their students, view section-level analytics |
| **Student** | Student Panel | Enrolled student, owns an RFID card/QR ID | Tap/scan to log attendance (via ESP32/RFID or QR fallback), view own attendance record/calendar, submit excuse slips, view own attendance analytics |
| **Parent/Guardian** | No panel (SMS only) | Linked to a student's profile via mobile number | Receives automatic SMS notifications for tardiness, absence, and (optionally) time-in confirmation — no login, no dashboard access |

**Note on OSAS/Guidance integration:** In the initial RBAC model, any future read-access for OSAS or other SMS 1 subsystems will be handled as an **Admin-delegated** permission or a separate service-level integration, not as a distinct end-user role in this phase.

---

## 4. System Modules & Functional Requirements

### 4.1 Daily Attendance Marking
- FR-1.1: System shall record time-in and time-out for each student per school day.
- FR-1.2: System shall support manual attendance marking by teachers as a fallback when RFID/QR scanning is unavailable.
- FR-1.3: System shall timestamp every attendance record with date/time (Asia/Manila timezone).
- FR-1.4: System shall prevent duplicate time-in entries within a configurable cooldown window (e.g., 5 minutes) to avoid double-taps.
- FR-1.5: System shall associate each attendance record with a specific class/section/subject period where applicable.

### 4.2 RFID/QR Scanning
- FR-2.1: System shall accept attendance scan events from ESP32-based RFID scanner hardware via a defined API endpoint (HTTP POST over Wi-Fi, or MQTT as an alternative).
- FR-2.2: System shall support QR code scanning as an alternative method (e.g., via a web camera/mobile browser scan) for students without RFID cards or during device downtime.
- FR-2.3: Each RFID card/QR code shall be mapped to a unique student or teacher ID in the database.
- FR-2.4: System shall validate scanned IDs against active/enrolled users and reject unregistered cards with a logged error.
- FR-2.5: System shall support multiple scanner devices (per gate/room) each identified by a unique `device_id`.
- FR-2.6: System shall log scanner device status (online/offline/last heartbeat) for admin monitoring.
- FR-2.7: ESP32 devices shall securely transmit scan data using an API key/token to prevent spoofed submissions.

### 4.3 Tardy & Absence Logs
- FR-3.1: System shall automatically classify a student as "Present," "Late/Tardy," "Absent," or "Excused" based on configurable time thresholds (e.g., late cutoff time per grade level/section).
- FR-3.2: System shall maintain a historical, filterable log of tardiness and absences per student.
- FR-3.3: System shall flag students exceeding a configurable absence/tardy threshold for administrator review.

### 4.4 Teacher Attendance
- FR-4.1: System shall allow teachers to log their own time-in/time-out via RFID/QR or manual login-based check-in.
- FR-4.2: System shall track teacher tardiness/absence separately from student records.
- FR-4.3: System shall generate teacher attendance summaries for HR reporting (future integration point with Academic HR Management module).

### 4.5 Excuse Slip Submission
- FR-5.1: Students/parents shall be able to submit a digital excuse slip (reason, date(s), optional file/document attachment) for an absence or tardy.
- FR-5.2: Teachers/registrar shall be able to approve, reject, or request more information on submitted excuse slips.
- FR-5.3: Approved excuse slips shall automatically update the corresponding attendance record status to "Excused."
- FR-5.4: System shall maintain a status history (Pending, Approved, Rejected) with timestamps and reviewer identity.

### 4.6 Attendance Calendar
- FR-6.1: System shall display a calendar view of attendance per student/section, color-coded by status (Present/Late/Absent/Excused).
- FR-6.2: System shall allow filtering the calendar by student, section, subject, or date range.
- FR-6.3: Admins shall be able to mark school holidays/no-class days, which the system excludes from absence calculations.

### 4.7 Alerts to Parents (SMS Notifications)
- FR-7.1: System shall automatically send an **SMS notification** to the parent/guardian's registered mobile number when a student is marked late or absent. Parents have no login/panel — SMS is the sole notification channel.
- FR-7.2: System shall send an SMS confirmation to parents when a time-in scan is successfully recorded (optional/configurable, to limit SMS costs).
- FR-7.3: System shall log all sent SMS alerts (recipient number, message content, timestamp, delivery status) in `alerts_log`.
- FR-7.4: SMS alert templates shall be configurable by Admin.
- FR-7.5: Each student profile shall store one or more parent/guardian mobile numbers (managed by Admin, editable via Student/Admin panel).
- FR-7.6: System shall integrate with a third-party SMS gateway/API (e.g., Semaphore, Movider, or similar Philippine SMS provider) via Supabase Edge Function to dispatch messages.

### 4.8 Analytics Dashboard (Core Feature)
- FR-8.1: System shall provide a real-time dashboard showing daily attendance rate (institution-wide, per department, per section).
- FR-8.2: System shall visualize attendance trends over time (weekly/monthly/quarterly) using charts (line, bar).
- FR-8.3: System shall identify and list at-risk students (frequent tardiness/absences) based on configurable thresholds.
- FR-8.4: System shall provide comparative analytics (e.g., section vs. section, this month vs. last month).
- FR-8.5: System shall provide role-based dashboard views per RBAC panel (Admin: institution-wide; Teacher: own sections; Student: own personal attendance analytics). Parents do not have dashboard access; they receive summarized info via SMS only.
- FR-8.6: Dashboard data shall update in near real-time as new scan events are recorded (via Supabase real-time subscriptions).

### 4.9 Perfect Attendance Award Tool
- FR-9.1: System shall automatically compute students/teachers with zero absences and zero tardies within a defined period (grading period, semester, school year).
- FR-9.2: System shall generate a qualification report/list for the Perfect Attendance Award, exportable for certificate generation.
- FR-9.3: Administrators shall be able to configure award qualification rules (e.g., allow N excused absences and still qualify).

### 4.10 CSV/Excel Export
- FR-10.1: System shall allow export of attendance logs, tardy/absence reports, and analytics summaries to CSV and Excel (.xlsx) formats.
- FR-10.2: Exports shall support filtering (date range, section, student, status) prior to generation.
- FR-10.3: Exported files shall include a generation timestamp and the filters applied, for audit purposes.

---

## 5. Non-Functional Requirements

| Category | Requirement |
|----------|-------------|
| **Performance** | Attendance scan-to-record latency should be under 2 seconds under normal network conditions. |
| **Scalability** | System should support at least 5,000 concurrent student records and multiple simultaneous scanner devices. |
| **Availability** | Web application should target 99% uptime during school operating hours. |
| **Security** | All API endpoints (especially the ESP32 scan-ingestion endpoint) must be authenticated. Passwords/tokens stored via Supabase Auth with hashing; Row Level Security (RLS) enforced on all tables. |
| **Data Privacy** | Compliance with the Philippine Data Privacy Act of 2012 (RA 10173) for handling student personal data. |
| **Usability** | Interface must be responsive (mobile/tablet/desktop) using Tailwind CSS, accessible to non-technical staff. |
| **Reliability** | System must gracefully handle scanner disconnection (offline queuing on ESP32 side, retry on reconnect). |
| **Maintainability** | Codebase organized modularly (vanilla JS with clear separation of concerns) to support future integration with other SMS 1 subsystems. |
| **Auditability** | All record changes (manual overrides, excuse slip approvals) must be logged with user ID and timestamp. |

---

## 6. Technical Architecture

### 6.1 Tech Stack
- **Frontend:** HTML5, Tailwind CSS, Vanilla JavaScript
- **Backend/Database:** Supabase (PostgreSQL, Auth, Realtime, Storage, Edge Functions/RPC)
- **Hardware:** ESP32 microcontroller + RFID reader module (e.g., MFRC522) + RFID cards; QR scanning via device camera as fallback
- **Hosting:** Static frontend (e.g., Vercel/Netlify or Supabase-hosted) + Supabase backend

### 6.2 High-Level Architecture Flow
1. Student/Teacher taps RFID card on ESP32 scanner (or scans QR via web camera).
2. ESP32 reads the card UID and sends an authenticated HTTP POST request (or MQTT message relayed to a Supabase Edge Function) containing `device_id`, `card_uid`, and `timestamp`.
3. Supabase Edge Function/API validates the request, resolves `card_uid` to a `user_id`, applies attendance business logic (on-time/late/duplicate check), and inserts a record into the `attendance_logs` table.
4. Supabase Realtime pushes the update to connected dashboard clients (Admin/Teacher/Parent views) via subscriptions.
5. A scheduled function (Supabase Cron/Edge Function) evaluates thresholds daily to trigger parent alerts and update absence/tardy aggregates.
6. Analytics dashboard queries pre-aggregated views/materialized views for fast chart rendering.

### 6.3 Core Database Entities (Preliminary)
- `users` (students, teachers, parents, admins — role-based)
- `rfid_cards` (card_uid ↔ user_id mapping)
- `sections` / `subjects` / `schedules`
- `scan_devices` (ESP32 device registry, status, location)
- `attendance_logs` (raw scan events: time-in/time-out, status, device_id)
- `attendance_summary` (daily/period aggregates per student for fast analytics)
- `excuse_slips` (student_id, dates, reason, attachment, status, reviewer)
- `alerts_log` (recipient, channel, message, status, timestamp)
- `award_qualifications` (computed perfect attendance records per period)
- `holidays` (non-attendance dates)

### 6.4 RBAC Authentication & Panel Routing Flow
1. User navigates to the login page and submits credentials (email/username + password) via Supabase Auth.
2. Supabase Auth verifies credentials and returns a JWT session containing the user's `id`.
3. On successful login, the frontend queries the `users` table (`SELECT role FROM users WHERE id = auth.uid()`) to retrieve the user's `role` (`admin`, `teacher`, or `student`).
4. The application router redirects the user to the panel matching their role:
   - `role = admin` → `/admin/dashboard`
   - `role = teacher` → `/teacher/dashboard`
   - `role = student` → `/student/dashboard`
5. Each panel's UI components and API/RPC calls are scoped to that role; the frontend does not expose admin/teacher-only UI elements to lower-privileged roles (defense in depth — the real enforcement is at the database level via RLS, step 6).
6. Every subsequent data request is authenticated with the user's JWT; Supabase RLS policies (see 6.6) evaluate `auth.uid()` and the caller's role on every query, so even a direct/forged API call cannot bypass access control.
7. On logout or session expiry, the JWT is invalidated and the user is redirected to the login page.
8. Parents are not part of this flow — they never authenticate. Their mobile number is stored as an attribute on the linked `students` record and is used exclusively as the destination for outbound SMS from the notification service (see 4.7).

### 6.5 Row Level Security (RLS) Policy Design (Pseudocode)

RLS is enabled on every table containing student/attendance data. Policies reference a `role` column on `users` and a helper function to fetch the current user's role.

```sql
-- Helper function: get the role of the currently authenticated user
create or replace function current_role_name()
returns text as $$
  select role from users where id = auth.uid();
$$ language sql stable;

-- Helper function: get the section(s) a teacher is assigned to
create or replace function teacher_section_ids()
returns setof uuid as $$
  select section_id from teacher_sections where teacher_id = auth.uid();
$$ language sql stable;
```

**`users` table**
```sql
-- Admin: full access
create policy "admin_full_access_users"
on users for all
using (current_role_name() = 'admin');

-- Everyone can read their own profile
create policy "self_read_users"
on users for select
using (id = auth.uid());
```

**`attendance_logs` table**
```sql
-- Admin: full access
create policy "admin_full_access_attendance"
on attendance_logs for all
using (current_role_name() = 'admin');

-- Teacher: read/update access limited to their assigned sections
create policy "teacher_scoped_attendance"
on attendance_logs for select, update
using (
  current_role_name() = 'teacher'
  and section_id in (select teacher_section_ids())
);

-- Student: read-only access to their own attendance rows
create policy "student_own_attendance"
on attendance_logs for select
using (
  current_role_name() = 'student'
  and student_id = auth.uid()
);

-- Insert restricted to the scan-ingestion service role (ESP32 edge function),
-- not to end-user roles directly.
create policy "service_insert_attendance"
on attendance_logs for insert
using (auth.role() = 'service_role');
```

**`excuse_slips` table**
```sql
-- Student: can create and view their own excuse slips
create policy "student_own_excuse_slips"
on excuse_slips for select, insert
using (
  current_role_name() = 'student'
  and student_id = auth.uid()
);

-- Teacher: can view/update (approve/reject) slips for their sections
create policy "teacher_review_excuse_slips"
on excuse_slips for select, update
using (
  current_role_name() = 'teacher'
  and section_id in (select teacher_section_ids())
);

-- Admin: full access (override/delegate approval)
create policy "admin_full_access_excuse_slips"
on excuse_slips for all
using (current_role_name() = 'admin');
```

**`scan_devices` table**
```sql
-- Only Admin can manage RFID/QR scanner device registry
create policy "admin_manage_devices"
on scan_devices for all
using (current_role_name() = 'admin');
```

This policy pattern (Admin: `all`; Teacher: scoped by `teacher_sections`; Student: scoped to `auth.uid()`; inserts from hardware via `service_role`) is applied consistently across `attendance_summary`, `alerts_log`, and `award_qualifications`, adjusting read/write scope per table as needed.

### 6.6 Integration Considerations for Future SMS 1 Modules
- Shared `users` table/auth system designed to be reusable across Library, Clinic, PREFECT, HR, etc.
- Attendance data exposed via views/API for OSAS (safety/incident correlation) and PREFECT (behavior tracking) modules.
- Teacher attendance data structured for eventual handoff to Academic HR Management (Time and Attendance Monitoring).

---

## 7. Role-Based Access Control (RBAC) & Permissions (RLS Summary)

The system implements three authenticated roles, each with a dedicated panel, enforced at the database level via Supabase Row Level Security (RLS) policies keyed to the user's role.

| Role | Panel | Permissions |
|------|-------|-------------|
| **Student** | Student Panel | View own attendance record/calendar, trigger scan events (via card/QR), submit excuse slips, view own analytics |
| **Teacher** | Teacher Panel | Mark/view attendance for own sections, log own attendance, approve/reject excuse slips for their students, view section-level analytics, manual attendance override for their classes |
| **Admin** | Admin Panel | Full system access — user management (students/teachers/accounts), RFID/QR device management, section/schedule/holiday configuration, institution-wide analytics, Perfect Attendance Award rules & generation, CSV/Excel exports, SMS alert template configuration, parent contact number management, audit logs |
| **Parent/Guardian** | *No panel* | Not an authenticated system role. Receives SMS notifications only (tardiness, absence, optional time-in confirmation). Cannot log in or view a dashboard. |

**RLS Design Note:** A `role` field (`admin`, `teacher`, `student`) on the `users` table drives all RLS policies. Students can only `SELECT` their own attendance rows; teachers can `SELECT`/`UPDATE` rows scoped to their assigned sections; admins have unrestricted access. Parent mobile numbers are stored as attributes on the student record, not as separate authenticated accounts.

---

## 8. Assumptions and Constraints

- ESP32 devices will have stable Wi-Fi access at each designated scanning point (gates/entrances).
- Each student/teacher will be issued one RFID card; QR is a fallback, not the primary method.
- An SMS gateway for parent alerts (e.g., Semaphore, Movider, or another Philippine SMS API) will be selected and integrated separately; this PRD assumes an abstracted "notification service" reachable from a Supabase Edge Function. Parents are notified via SMS only and are not authenticated system users.
- The system's user interface is organized into three RBAC-based panels: Admin, Teacher, and Student.
- The system will initially operate as a standalone module and will not have live data from other SMS 1 subsystems during capstone development; mock/shared schema design is used to anticipate integration.
- School operating calendar, section lists, and grading periods will be configurable by admins, not hardcoded.

---

## 9. Out of Scope (for this subsystem)

- Full implementation of the other nine SMS 1 subsystems (Library, Clinic, Property Custodian, School Event, OSAS, PREFECT, Academic HR, Financial, Alumni) — only integration hooks are considered.
- Payroll processing tied to teacher attendance (handled by Academic HR Management in the future).
- Native mobile app (system is web-based/responsive only for this phase).

---

## 10. Success Metrics

| Metric | Target |
|--------|--------|
| Reduction in manual attendance recording time | ≥ 80% reduction vs. manual process |
| Scan-to-record accuracy | ≥ 99% correct classification (present/late/absent) |
| Parent alert delivery success rate | ≥ 95% |
| Dashboard load time for analytics views | < 3 seconds |
| Administrator satisfaction (survey-based, post-deployment) | ≥ 85% positive rating |

---

## 11. Appendix

### 11.1 Attendance Status Definitions
- **Present:** Time-in recorded before or at the configured cutoff time.
- **Late/Tardy:** Time-in recorded after the cutoff time but before the end of the grace period.
- **Absent:** No time-in recorded for the school day and no approved excuse slip.
- **Excused:** Absence or tardy with an approved excuse slip.

### 11.2 Glossary
- **RFID:** Radio-Frequency Identification
- **ESP32:** Low-cost Wi-Fi/Bluetooth microcontroller used here as the RFID scanning device
- **RLS:** Row Level Security (Supabase/PostgreSQL access control feature)
- **SMS 1:** School Management System 1 (the parent system this module belongs to)
