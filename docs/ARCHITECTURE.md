# System Architecture Document

## Attendance Monitoring System (AMS) — Bestlink College of the Philippines

**Companion to:** PRD.md
**Version:** 1.0
**Date:** September 25, 2026
**Audience:** Development team (implementation reference)

---

## 1. Overview

This document translates the PRD into a concrete technical architecture for implementation: folder structure, database schema (DDL-level), API/RPC contracts, RBAC/RLS enforcement, ESP32 hardware integration, real-time data flow, and deployment topology.

**Stack recap:**
- Frontend: HTML5, Tailwind CSS, Vanilla JavaScript (no framework)
- Backend: Supabase (PostgreSQL, Auth, Realtime, Storage, Edge Functions)
- Hardware: ESP32 + MFRC522 RFID reader + RFID cards; QR scan via device camera as fallback
- Hosting: Static frontend on Vercel/Netlify (or Supabase Storage static hosting); Supabase Cloud for backend

---

## 2. High-Level System Diagram (Textual)

```
┌─────────────┐      RFID tap        ┌──────────────┐
│  RFID Card  │ ───────────────────► │   ESP32 +    │
└─────────────┘                      │   MFRC522    │
                                      └──────┬───────┘
                                             │ HTTPS POST (API key)
                                             ▼
                              ┌───────────────────────────┐
                              │  Supabase Edge Function     │
                              │  /scan-ingest               │
                              │  - validate device + token   │
                              │  - resolve card_uid → user_id│
                              │  - apply attendance rules    │
                              │  - insert attendance_logs    │
                              └───────────┬───────────────┘
                                          │
                    ┌─────────────────────┼─────────────────────┐
                    ▼                     ▼                     ▼
          ┌──────────────┐     ┌──────────────────┐   ┌──────────────────┐
          │ PostgreSQL DB │     │ Supabase Realtime │   │ SMS Gateway Edge  │
          │ (RLS enforced)│     │ (broadcast change) │   │ Function (async)  │
          └──────┬────────┘     └─────────┬─────────┘   └─────────┬────────┘
                 │                        │                       │
                 ▼                        ▼                       ▼
       ┌───────────────────┐   ┌────────────────────┐   ┌──────────────────┐
       │ Admin / Teacher /  │   │ Live dashboard      │   │ Parent's phone    │
       │ Student Web Panels │   │ updates (charts)    │   │ (SMS notification)│
       │ (HTML/Tailwind/JS) │   └────────────────────┘   └──────────────────┘
       └───────────────────┘
```

---

## 3. Frontend Architecture

### 3.1 Principle
Since the stack is Vanilla JS (no framework/bundler required), the project uses a **multi-page, module-per-feature** structure with shared utility modules, rather than a single-page app framework. Each RBAC panel is a separate route/folder to keep authorization boundaries physically obvious in the codebase.

### 3.2 Recommended Folder Structure

```
ams-web/
├── public/
│   ├── index.html                 # Login page
│   ├── admin/
│   │   ├── dashboard.html
│   │   ├── users.html             # manage students/teachers
│   │   ├── devices.html           # RFID/QR device registry
│   │   ├── sections.html
│   │   ├── excuse-slips.html
│   │   ├── awards.html            # Perfect Attendance Award tool
│   │   ├── reports.html           # CSV/Excel export
│   │   └── settings.html          # SMS templates, thresholds, holidays
│   ├── teacher/
│   │   ├── dashboard.html
│   │   ├── attendance.html        # manual marking / section view
│   │   ├── excuse-slips.html      # approve/reject
│   │   └── analytics.html
│   ├── student/
│   │   ├── dashboard.html
│   │   ├── attendance-calendar.html
│   │   ├── excuse-slip-submit.html
│   │   └── analytics.html
│   └── shared/
│       ├── qr-scan.html           # camera-based QR fallback scan page
│       └── unauthorized.html
├── src/
│   ├── js/
│   │   ├── lib/
│   │   │   ├── supabaseClient.js  # Supabase JS client init
│   │   │   ├── auth.js            # login, logout, session, role check
│   │   │   ├── rbac-guard.js      # route protection per panel
│   │   │   └── realtime.js        # Supabase Realtime subscription helpers
│   │   ├── api/
│   │   │   ├── attendance.js      # attendance CRUD/query wrappers
│   │   │   ├── excuseSlips.js
│   │   │   ├── users.js
│   │   │   ├── devices.js
│   │   │   ├── analytics.js
│   │   │   ├── awards.js
│   │   │   └── exports.js         # CSV/XLSX generation
│   │   ├── components/            # reusable JS UI builders (non-framework)
│   │   │   ├── calendar.js
│   │   │   ├── charts.js          # Chart.js wrappers
│   │   │   ├── table.js
│   │   │   └── toast.js
│   │   └── pages/                 # page-specific controller scripts
│   │       ├── admin/*.js
│   │       ├── teacher/*.js
│   │       └── student/*.js
│   └── css/
│       └── tailwind.css           # compiled Tailwind output
├── supabase/
│   ├── migrations/                # SQL migration files (schema + RLS)
│   ├── functions/
│   │   ├── scan-ingest/           # ESP32 scan endpoint
│   │   ├── send-sms-alert/        # SMS dispatch
│   │   ├── compute-daily-status/  # cron: tardy/absent classification
│   │   └── compute-awards/        # cron: perfect attendance evaluation
│   └── seed.sql
├── esp32-firmware/
│   ├── ams_scanner.ino
│   └── config.h.example
├── tailwind.config.js
├── package.json
└── README.md
```

### 3.3 RBAC Route Protection (Frontend)
- `rbac-guard.js` runs on every panel page load: verifies an active Supabase session exists, fetches `role` from `users`, and redirects to `/index.html` (login) or `/shared/unauthorized.html` if the role doesn't match the folder (`/admin/*` requires `admin`, etc.).
- This is a **UX convenience only** — the authoritative enforcement is Postgres RLS (Section 5). Never trust the frontend check alone.

---

## 4. Database Schema (DDL-Level)

```sql
-- ============================
-- USERS & ROLES
-- ============================
create table users (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin','teacher','student')),
  first_name text not null,
  last_name text not null,
  email text unique,
  student_number text unique,        -- null for teachers/admins
  employee_number text unique,       -- null for students
  status text not null default 'active' check (status in ('active','inactive')),
  created_at timestamptz not null default now()
);

create table parent_contacts (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references users(id) on delete cascade,
  full_name text not null,
  relationship text,                  -- e.g. 'Mother', 'Guardian'
  mobile_number text not null,
  is_primary boolean not null default true,
  created_at timestamptz not null default now()
);

-- ============================
-- SECTIONS / SCHEDULES
-- ============================
create table sections (
  id uuid primary key default gen_random_uuid(),
  name text not null,                 -- e.g. "BSIT 3-1"
  grade_level text,
  school_year text not null,
  created_at timestamptz not null default now()
);

create table student_sections (
  student_id uuid references users(id) on delete cascade,
  section_id uuid references sections(id) on delete cascade,
  primary key (student_id, section_id)
);

create table teacher_sections (
  teacher_id uuid references users(id) on delete cascade,
  section_id uuid references sections(id) on delete cascade,
  subject text,
  primary key (teacher_id, section_id, subject)
);

-- ============================
-- RFID / QR CREDENTIALS
-- ============================
create table rfid_cards (
  id uuid primary key default gen_random_uuid(),
  card_uid text unique not null,
  user_id uuid not null references users(id) on delete cascade,
  is_active boolean not null default true,
  issued_at timestamptz not null default now()
);

create table qr_codes (
  id uuid primary key default gen_random_uuid(),
  code_value text unique not null,    -- encoded token, not raw user id
  user_id uuid not null references users(id) on delete cascade,
  is_active boolean not null default true,
  issued_at timestamptz not null default now()
);

-- ============================
-- SCANNER DEVICES
-- ============================
create table scan_devices (
  id uuid primary key default gen_random_uuid(),
  device_code text unique not null,   -- e.g. "GATE-01-ESP32"
  location text,
  api_key_hash text not null,         -- hashed device token
  last_heartbeat timestamptz,
  status text not null default 'offline' check (status in ('online','offline')),
  created_at timestamptz not null default now()
);

-- ============================
-- ATTENDANCE
-- ============================
create table attendance_logs (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references users(id) on delete cascade,   -- null for teacher logs
  teacher_id uuid references users(id) on delete cascade,   -- null for student logs
  section_id uuid references sections(id),
  device_id uuid references scan_devices(id),
  scan_method text not null check (scan_method in ('rfid','qr','manual')),
  event_type text not null check (event_type in ('time_in','time_out')),
  status text check (status in ('present','late','absent','excused')),
  scanned_at timestamptz not null default now(),
  created_by uuid references users(id),   -- for manual entries
  check (student_id is not null or teacher_id is not null)
);
create index idx_attendance_student_date on attendance_logs (student_id, scanned_at);
create index idx_attendance_teacher_date on attendance_logs (teacher_id, scanned_at);

create table attendance_summary (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  summary_date date not null,
  status text not null check (status in ('present','late','absent','excused','holiday')),
  minutes_late int default 0,
  unique (user_id, summary_date)
);

create table holidays (
  id uuid primary key default gen_random_uuid(),
  holiday_date date not null unique,
  description text
);

-- ============================
-- EXCUSE SLIPS
-- ============================
create table excuse_slips (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references users(id) on delete cascade,
  section_id uuid references sections(id),
  date_from date not null,
  date_to date not null,
  reason text not null,
  attachment_url text,               -- Supabase Storage path
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  reviewed_by uuid references users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

-- ============================
-- ALERTS (SMS)
-- ============================
create table alerts_log (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references users(id) on delete cascade,
  parent_contact_id uuid references parent_contacts(id),
  channel text not null default 'sms',
  message text not null,
  status text not null default 'pending' check (status in ('pending','sent','failed')),
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

-- ============================
-- AWARDS
-- ============================
create table award_periods (
  id uuid primary key default gen_random_uuid(),
  name text not null,                 -- e.g. "1st Semester 2026-2027"
  start_date date not null,
  end_date date not null,
  max_allowed_excused int not null default 0
);

create table award_qualifications (
  id uuid primary key default gen_random_uuid(),
  period_id uuid references award_periods(id) on delete cascade,
  user_id uuid references users(id) on delete cascade,
  qualified boolean not null,
  computed_at timestamptz not null default now(),
  unique (period_id, user_id)
);

-- ============================
-- AUDIT LOG
-- ============================
create table audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references users(id),
  action text not null,
  table_name text,
  record_id uuid,
  details jsonb,
  created_at timestamptz not null default now()
);
```

---

## 5. RBAC & RLS Enforcement

All tables above have RLS **enabled**. Enforcement pattern:

```sql
alter table attendance_logs enable row level security;
alter table excuse_slips enable row level security;
alter table users enable row level security;
alter table scan_devices enable row level security;
-- ... (repeat for every table listed in Section 4)
```

Policies follow the pattern documented in the PRD (Section 6.5): `admin` → unrestricted; `teacher` → scoped via `teacher_sections`; `student` → scoped to `auth.uid()`; hardware inserts → `service_role` only via Edge Function (never directly from the frontend). See PRD.md §6.5 for full policy SQL — do not duplicate divergent policies here; this doc references that as the source of truth for policy logic.

**Key rule for developers:** the frontend (anon/public key) must never be able to `INSERT` into `attendance_logs`. Only the `scan-ingest` Edge Function (using the `service_role` key, server-side only) can write scan-originated records. Manual teacher/admin overrides go through a dedicated RPC (`fn_manual_attendance_override`) that logs to `audit_log`.

---

## 6. API / Edge Function Contracts

### 6.1 `POST /functions/v1/scan-ingest`
Called by the ESP32 device on every successful RFID tap (or by the QR fallback page).

**Headers:** `x-device-key: <device API key>`

**Request body:**
```json
{
  "device_code": "GATE-01-ESP32",
  "card_uid": "04A3B2C1",
  "scanned_at": "2026-09-25T07:15:32+08:00"
}
```

**Behavior:**
1. Validate `device_code` + `x-device-key` against `scan_devices`.
2. Resolve `card_uid` → `user_id` via `rfid_cards`. If not found, log to `audit_log` as `unregistered_card` and return `404`.
3. Determine `event_type` (`time_in`/`time_out`) based on whether a `time_in` already exists for that user today.
4. Apply cooldown check (reject duplicate scans within 5 minutes) → return `409` if duplicate.
5. Determine `status` (`present`/`late`) by comparing `scanned_at` against the section's/school's cutoff time.
6. Insert into `attendance_logs` using `service_role`.
7. If `status = 'late'` or the event later resolves to `absent` (via the daily cron), enqueue an SMS via `send-sms-alert`.
8. Return `201` with the created record summary.

**Response (success):**
```json
{ "status": "ok", "attendance_status": "late", "event_type": "time_in" }
```

### 6.2 `POST /functions/v1/send-sms-alert`
Internal function, invoked by `scan-ingest` or the daily cron job. Looks up `parent_contacts` for the student, formats the message from the configurable template, calls the external SMS gateway API, and writes the result to `alerts_log`.

### 6.3 `POST /functions/v1/compute-daily-status` (Cron — runs once nightly, e.g. 8:00 PM)
- For every enrolled student/teacher with no `time_in` today and no approved excuse slip, and where today is not a holiday, insert/update `attendance_summary` with `status = 'absent'`.
- Triggers SMS alerts for newly-marked absences.

### 6.4 `POST /functions/v1/compute-awards` (Cron — runs at end of each award period, or on-demand from Admin panel)
- Aggregates `attendance_summary` per user for the given `award_periods` range.
- Marks `award_qualifications.qualified = true` where absences = 0 and tardies = 0 (or within `max_allowed_excused`).

### 6.5 Frontend-facing data access
All other reads/writes (dashboard queries, excuse slip submission, manual attendance marking, exports) go **directly from the frontend to Supabase** using the Supabase JS client with the **anon key**, relying entirely on RLS for authorization — no custom REST layer needed for these. Only hardware ingestion and SMS dispatch are Edge Functions, since those require the `service_role` key and third-party secrets that must never reach the browser.

---

## 7. ESP32 Firmware Architecture

- **Libraries:** `MFRC522` (RFID reader), `WiFi.h`, `HTTPClient.h`, `ArduinoJson`.
- **Flow:**
  1. On boot, connect to configured Wi-Fi SSID (stored in `config.h`, not committed to source control).
  2. On card tap, read UID, format as hex string.
  3. Send `POST /functions/v1/scan-ingest` with `device_code`, `card_uid`, ISO 8601 `scanned_at` (from NTP-synced RTC), and the device API key header.
  4. On success: brief green LED / buzzer beep. On failure (`404`/`409`): red LED / different beep tone.
  5. **Offline queueing:** if Wi-Fi/API call fails, buffer up to N scan events in local flash (e.g., LittleFS) with timestamps, and flush the queue on reconnect.
  6. Send a heartbeat ping (`device_code` + status) every 60 seconds to update `scan_devices.last_heartbeat`/`status`, so the Admin panel can show device health.
- **Security:** API key stored in firmware is unique per device and only grants access to `scan-ingest`; it is not a database credential and cannot read data.

---

## 8. Real-Time Dashboard Data Flow

1. Frontend subscribes to Supabase Realtime channels scoped to relevant tables/filters, e.g.:
   ```js
   supabase
     .channel('attendance-changes')
     .on('postgres_changes',
         { event: 'INSERT', schema: 'public', table: 'attendance_logs', filter: `section_id=eq.${sectionId}` },
         (payload) => updateDashboard(payload.new)
     )
     .subscribe();
   ```
2. RLS still applies to Realtime — a subscriber only receives rows they're authorized to see.
3. For heavier aggregate analytics (trends, comparisons), the dashboard queries `attendance_summary` (pre-aggregated) rather than raw `attendance_logs`, refreshed by the nightly cron plus incremental updates on each new log insert (via a Postgres trigger or a lightweight polling refresh every few minutes) to keep chart queries fast.

---

## 9. CSV/Excel Export Implementation Notes

- Client-side generation using a lightweight library (e.g., SheetJS/`xlsx` for `.xlsx`, plain JS for `.csv`) after fetching the filtered dataset from Supabase — no server-side export function needed for typical data volumes.
- Every export call is logged (`audit_log`, action = `export_generated`) with the filters used, for traceability.

---

## 10. Environment & Deployment

| Environment | Frontend | Backend |
|-------------|----------|---------|
| Local Dev | Static file server (e.g., `live-server`) against a local/dev Supabase project | Supabase CLI local stack or a dedicated dev project |
| Staging | Vercel/Netlify preview deploy | Supabase staging project |
| Production | Vercel/Netlify production deploy | Supabase production project |

**Secrets management:** Supabase `anon` key is safe for frontend use (RLS-protected). `service_role` key and SMS gateway credentials live **only** in Supabase Edge Function environment variables — never in frontend code or the ESP32 firmware repo.

---

## 11. Suggested Build Order (Development Roadmap)

1. Supabase project setup: schema migrations (Section 4) + RLS policies (Section 5).
2. Auth + RBAC routing (login, role redirect, `rbac-guard.js`).
3. Admin panel: user management, section setup, device registry (needed before scanning can work).
4. `scan-ingest` Edge Function + ESP32 firmware (core hardware loop).
5. Daily Attendance Marking + Tardy/Absence classification (`compute-daily-status`).
6. Teacher panel: manual marking fallback, section attendance view.
7. Student panel: attendance calendar, excuse slip submission.
8. Excuse slip approval workflow (Teacher/Admin).
9. SMS alert integration (`send-sms-alert` + gateway).
10. Analytics dashboard (charts, at-risk list).
11. Perfect Attendance Award tool (`compute-awards`).
12. CSV/Excel export.
13. QR fallback scanning page.
14. Polish, audit logging review, RLS penetration testing.
