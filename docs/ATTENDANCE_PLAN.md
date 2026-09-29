# Attendance Workflow & Implementation Plan
## Bestlink College of the Philippines — Attendance Monitoring System (AMS)

**Version:** 2.0 — Final Consolidated Plan (All Four Flows)
**Date:** September 29, 2026
**Status:** Approved for Implementation
**Companion Docs:** PRD.md · DATA.md · WORKFLOW.md · Security.md · UI-UX_Architecture.md

---

## 1. Institutional Deployment Context

The BCP Attendance Monitoring System uses a **portable ESP32 RFID scanner** and a **Dynamic QR Code fallback** — no fixed turnstiles or kiosks. Sections meet **once per week** on a scheduled day.

Attendance operates on **explicit, administrator- or teacher-initiated sessions** — not passive schedule matching:

```
Session opens (Admin or Teacher initiates)
│
│← 0 min ──────────── 20 min ──── 30 min →│
│                        │                 │
│  [ PRESENT ZONE ]      │  [ LATE ZONE ]  │  [WINDOW CLOSED]
│  Tap/scan = Present    │  = Late         │  Auto-mark Absent
│
Active window = 30 min (configurable)
Present cutoff = 20 min (configurable)
```

---

## 2. All Four Attendance Flows — Overview

| Flow | Session Initiator | Student Time-Out? | Primary Security |
|---|---|---|---|
| **Teacher RFID** | Admin | Yes (duty tracking) | Anti-passback (5 min) |
| **Teacher QR** | Admin | Yes (duty tracking) | Ephemeral session token |
| **Student RFID** | Teacher | No | Anti-passback (5 min) + Teacher Void |
| **Student QR** | Teacher | No | Rotating 30s token + GPS proximity + Teacher Void |

---

## 3. Flow 1 — Teacher RFID Attendance

### 3.1 Actors
- **Admin** — Starts the session for a section and device.
- **Teacher** — Taps RFID card for Time-In and Time-Out.
- **ESP32 Scanner** — Portable device reads card UID, posts to scan-ingest.

### 3.2 Step-by-Step
1. Admin opens Admin Panel → Attendance Sessions → selects section + device → clicks **"Start Attendance"**.
2. System creates attendance_sessions (scan_method = rfid, status = active).
3. Teacher taps RFID card (Time-In):
   - scan-ingest verifies active session on device.
   - Anti-passback: 5-minute cooldown.
   - No existing time_in for this session → classify status.
   - scanned_at ≤ present_cutoff → **Present** (Green LED + 1 beep).
   - scanned_at > present_cutoff → **Late** (Amber LED + 2 beeps).
   - Inserts attendance_logs (event_type = time_in), upserts attendance_summary.
   - Realtime broadcast → Admin Dashboard updates.
4. Teacher taps again (Time-Out):
   - System detects existing time_in → identifies as time_out.
   - Inserts attendance_logs (event_type = time_out). No status change.
   - Duty duration calculable: time_out − time_in.
5. Session closes at 30 min → any teacher with no time_in → attendance_summary.status = absent.

### 3.3 Status Matrix

| Scenario | Status |
|---|---|
| Tap within 0–20 min | Present |
| Tap within 20–30 min | Late |
| No tap within 30 min | Absent |
| Second tap (after time_in) | Time-Out (status unchanged) |
| Tap outside any active session | Rejected (Red LED + audit_log) |
| Tap within 5-min cooldown | Rejected (anti-passback) |

---

## 4. Flow 2 — Teacher QR Attendance (Fallback)

### 4.1 When Used
QR is the fallback method — activated when the ESP32 scanner is unavailable. Not a concurrent method; Admin picks one method per session.

### 4.2 Step-by-Step
1. Admin clicks **"Start QR Code"** for a section.
2. System creates attendance_sessions (scan_method = qr) and generates a cryptographic session_token.
3. QR code is rendered live on the Admin Panel screen from the session token.
4. Teacher opens their phone camera → scans Admin screen → submits session_token + user_auth to scan-ingest.
5. scan-ingest resolves session token → active session; resolves authenticated identity → teacher.
6. Status: ≤ 20 min = Present, 20–30 min = Late.
7. Second scan = Time-Out (same as RFID).
8. QR invalidates at session_end — screenshots taken after 30 min are useless.

### 4.3 Dynamic QR Security

| Property | Detail |
|---|---|
| Payload | Opaque session_token (UUID) tied to attendance_sessions.id |
| Validity | Expires with the session (30 min max) |
| Reuse | One token per session — non-reusable |
| Screenshot protection | Token invalidated at session close |
| Rendering | Client-side via qrcode.js |

---

## 5. Flow 3 — Student RFID Attendance

### 5.1 Key Differences from Teacher RFID
- **Teacher initiates** the session (not Admin) for their assigned section only.
- **Enrollment validation required** — student must be enrolled in the section.
- **Time-In only** — no Time-Out for students (Octoberian/Irregular student policy).
- **Buddy punch void** available — teacher can void a record, triggering alerts.
- **System blocks concurrent sessions** on the same device/section.

### 5.2 Step-by-Step
1. Teacher opens Teacher Portal → Attendance → selects section → clicks **"Start Attendance"**.
2. System validates: teacher is assigned to section (RLS). No active session open on this device → blocks if conflict.
3. System creates attendance_sessions (created_by = teacher_uid).
4. Teacher screen shows Live Roll Call — all enrolled students listed as Pending.
5. Student taps RFID card:
   - scan-ingest validates: device → active session → card UID → enrolled student identity.
   - Enrollment check (not enrolled → Red LED + 1 long beep + modal + audit_log unenrolled_tap).
   - Anti-passback: 5-min cooldown.
   - Status: ≤ 20 min → Present, 20–30 min → Late.
   - Inserts attendance_logs, upserts attendance_summary.
   - Teacher Roll Call: student row updates Pending → Present/Late with timestamp.
6. Session closes at 30 min → enrolled students with no tap → absent.

### 5.3 Buddy Punch Void Protocol
1. Teacher clicks [Void] on student row in Live Roll Call.
2. Confirmation modal displayed.
3. On confirm:
   - attendance_logs.is_voided = true, voided_by = teacher_uid, voided_at = NOW().
   - attendance_summary.status = absent.
   - audit_log: action = buddy_punch_void.
4. Async alerts: Parent SMS (immediate) + Prefect System Webhook (immediate).

> Pre-oral scope: Prefect system is external. AMS only fires the outbound webhook. Full integration at Final Defense stage.

### 5.4 Non-Enrolled Student Tap — Fallback
- Red LED + long beep + "Not Enrolled" modal on teacher screen.
- Unenrolled tap logged to audit_log.
- Teacher may record Manual Attendance as temporary measure (scan_method = manual).
- Student reports to Admin/Registrar for proper enrollment.
- Admin is the only authority for enrollment management.

---

## 6. Flow 4 — Student QR Attendance (Fallback)

### 6.1 Dual Anti-Buddy-Punch Security

**Layer 1 — Rotating Ephemeral Token (30 seconds)**
- QR session token rotates every 30 seconds. Old token immediately invalidated.
- Photographed QR codes expire before a remote student can use them.

**Layer 2 — Geolocation Proximity Check (50 meter radius)**
- Teacher GPS coordinates captured at session start → stored in attendance_sessions.
- Student GPS coordinates captured at scan time → submitted with scan payload.
- Backend validates: distance(teacher_coords, student_coords) ≤ geo_radius_meters.
- GPS unavailable (no fix / permission denied) → **hard reject** — student falls back to RFID or manual.

### 6.2 Step-by-Step
1. Teacher clicks **"Start QR Session"** → browser requests location permission.
2. System creates attendance_sessions with teacher_lat, teacher_lng, session_token, qr_last_rotated_at.
3. Dynamic QR rendered on teacher screen. Rotation countdown visible. Supabase Realtime auto-refreshes QR every 30s.
4. Student opens Student Portal → "Scan QR Attendance" → browser requests Camera + Location.
5. Student scans QR → portal submits: { session_token, scan_method: qr, student_lat, student_lng }.
6. scan-ingest validation pipeline:
   - session_token valid → session active → GPS provided → distance ≤ radius → enrolled → anti-passback → Present/Late classification.
7. Inserts attendance_logs (with student_lat, student_lng), upserts attendance_summary.
8. Student Portal: confirmation toast. Teacher Roll Call updates live.

### 6.3 Rejection Responses

| Rejection Reason | HTTP | audit_log Event |
|---|---|---|
| Invalid/expired QR token | 401 | invalid_qr_token |
| Session window expired | 403 | — |
| GPS unavailable | 422 | gps_unavailable |
| Outside geo radius | 403 | geolocation_mismatch |
| Not enrolled | 403 | unenrolled_tap |
| Anti-passback | 429 | — |

---

## 7. Database Schema — All Changes Required

### 7.1 New Table: attendance_sessions

```sql
CREATE TABLE public.attendance_sessions (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id            uuid        NOT NULL REFERENCES public.sections(id) ON DELETE CASCADE,
  device_id             uuid        REFERENCES public.scan_devices(id) ON DELETE SET NULL,
  created_by            uuid        NOT NULL REFERENCES public.users(id),
  scan_method           text        NOT NULL DEFAULT 'rfid'
                                      CHECK (scan_method IN ('rfid', 'qr')),
  session_token         text        UNIQUE,
  session_start         timestamptz NOT NULL DEFAULT now(),
  present_cutoff        timestamptz NOT NULL,
  session_end           timestamptz NOT NULL,
  status                text        NOT NULL DEFAULT 'active'
                                      CHECK (status IN ('active', 'closed')),
  teacher_lat           float8,
  teacher_lng           float8,
  geo_radius_meters     int         NOT NULL DEFAULT 50,
  qr_token_rotation_sec int         NOT NULL DEFAULT 30,
  qr_last_rotated_at    timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_sessions_device_active
  ON public.attendance_sessions(device_id, status, session_end)
  WHERE status = 'active';

CREATE INDEX idx_sessions_token_active
  ON public.attendance_sessions(session_token)
  WHERE status = 'active';

CREATE UNIQUE INDEX idx_sessions_section_active
  ON public.attendance_sessions(section_id)
  WHERE status = 'active';
```

### 7.2 Alterations to attendance_logs

```sql
ALTER TABLE public.attendance_logs
  ADD COLUMN session_id   uuid    REFERENCES public.attendance_sessions(id) ON DELETE SET NULL,
  ADD COLUMN is_voided    boolean NOT NULL DEFAULT false,
  ADD COLUMN voided_by    uuid    REFERENCES public.users(id),
  ADD COLUMN voided_at    timestamptz,
  ADD COLUMN is_manual    boolean NOT NULL DEFAULT false,
  ADD COLUMN student_lat  float8,
  ADD COLUMN student_lng  float8;
```

### 7.3 New system_settings Entries

| Setting Key | Default | Description |
|---|---|---|
| attendance_present_window_min | 20 | Minutes for Present threshold |
| attendance_session_duration_min | 30 | Total session window |
| anti_passback_cooldown_sec | 300 | 5-minute anti-passback |
| qr_geo_radius_meters | 50 | Max student-to-teacher distance (meters) |
| qr_token_rotation_sec | 30 | QR token rotation interval |

### 7.4 New Stored Procedure: fn_manual_attendance_override

Allows Admin (for teacher sessions) or Teacher (for student sessions) to record manual attendance with full audit trail.

Parameters: p_user_id, p_section_id, p_session_id, p_status, p_reason, p_actor_id

Actions:
1. INSERT into attendance_logs (scan_method = manual, is_manual = true, created_by = p_actor_id).
2. UPSERT attendance_summary.
3. INSERT audit_log (action = manual_override, details = { reason, status }).

### 7.5 New Stored Procedure: fn_void_attendance_record

Allows Teacher to void a buddy-punch record.

Parameters: p_log_id, p_teacher_id

Actions:
1. UPDATE attendance_logs SET is_voided = true, voided_by, voided_at.
2. UPSERT attendance_summary status = absent.
3. INSERT audit_log (action = buddy_punch_void).

---

## 8. scan-ingest Edge Function — Unified Pipeline

```
POST /functions/v1/scan-ingest
{
  device_code?   : string   -- RFID sessions
  card_uid?      : string   -- RFID scans
  session_token? : string   -- QR scans
  scan_method    : rfid | qr
  student_lat?   : float    -- QR scans only
  student_lng?   : float    -- QR scans only
}
```

Validation chain (in order):
1. Device / Token auth — verify x-device-key (RFID) or session_token (QR).
2. Session active — status = active AND now() < session_end.
3. Identity resolution — card UID → rfid_cards (RFID) or authenticated session (QR).
4. Geolocation check — QR only: GPS provided? Distance ≤ radius?
5. Enrollment check — Student only: enrolled in session.section_id?
6. Anti-passback — no tap within 5 minutes?
7. Event type — Teacher: time_in vs time_out toggle. Student: always time_in.
8. Status classification — scanned_at ≤ present_cutoff → present, else late.
9. DB write — INSERT attendance_logs, UPSERT attendance_summary.
10. Realtime broadcast — push update to subscribed clients.
11. Async side effects — SMS alerts, Prefect webhook on void events.

---

## 9. Alert & Notification Architecture

| Trigger | Recipient | Method | Timing |
|---|---|---|---|
| Student Late | Parent/Guardian | SMS | Immediate |
| Student Absent | Parent/Guardian | SMS | Immediate / 8 PM cron |
| Buddy punch void | Parent/Guardian | SMS | Immediate |
| Buddy punch void | Prefect System | Outbound API webhook | Immediate |
| Teacher Late/Absent | Admin Dashboard | Realtime UI | Immediate |

Prefect Webhook Payload:
```json
{
  "event": "buddy_punch_violation",
  "student_id": "uuid",
  "student_name": "Juan dela Cruz",
  "section": "BSIT 3-1 — Web Development",
  "session_date": "2026-09-29",
  "voided_by": "teacher_uid",
  "timestamp": "2026-09-29T08:12:00+08:00"
}
```

---

## 10. Nightly Cron — compute-daily-status

Runs at 8:00 PM daily as safety net:

For each enrolled student/assigned teacher per section with a session today:
- attendance_summary row already set → skip.
- Approved excuse_slip covers today → status = excused.
- Otherwise → status = absent → dispatch Parent SMS.

---

## 11. Attendance Visibility by Role

| Role | What They See | Where |
|---|---|---|
| Admin | All scans, all sections, voided records, manual entries, audit trail | /admin/attendance-logs.html |
| Teacher | Live Roll Call during session; post-session logs for their sections; own Time-In/Time-Out history | /teacher/attendance.html + /teacher/my-logs.html |
| Student | Personal Time-In + status per session; monthly calendar | /student/dashboard.html + /student/attendance-calendar.html |

---

## 12. Implementation Phases

### Phase 1 — Database Migrations
- [x] Create attendance_sessions table with all columns and indexes.
- [x] Add new columns to attendance_logs (session_id, is_voided, voided_by, voided_at, is_manual, student_lat, student_lng).
- [x] Create fn_manual_attendance_override stored procedure.
- [x] Create fn_void_attendance_record stored procedure.
- [x] Insert new system_settings keys with default values.
- [x] Add RLS policies for attendance_sessions.

### Phase 2 — Ingestion Engine
- [x] Refactor scan-ingest for session-based lookup (device_id or session_token).
- [x] Implement geolocation distance validation for QR scans.
- [x] Implement QR token rotation refresh (server-side every 30s).
- [x] Implement enrollment check for student taps.
- [x] Handle time_in vs time_out toggle for teacher scans.
- [x] Wire outbound Prefect webhook on void events.

### Phase 3 — Admin Portal UI
- [x] "Start Attendance" modal: section + device + method toggle (RFID/QR).
- [x] "Start QR Code" modal: dynamic QR display + countdown timer.
- [x] Active Session Monitor Card: live countdown + real-time arrivals + "Close Early" button.
- [x] Manual Correction Tool: user + section + date + status + reason → fn_manual_attendance_override.
- [x] Manual/Voided badge rendering in attendance logs table.

### Phase 4 — Teacher Portal UI
- [x] Session start flow: section picker → "Start Attendance" / "Start QR Session".
- [x] Live Roll Call View: Realtime subscription; Pending → Present/Late; [Void] + [Manual] buttons.
- [x] Buddy punch void confirmation modal.
- [x] Post-session log tab with Manual/Voided badges.
- [x] Personal attendance history (my-logs.html): Time-In + Time-Out per session.

### Phase 5 — Student Portal UI
- [x] "Scan QR Attendance" page: camera + geolocation → QR scan → scan-ingest → confirmation toast.
- [x] Dashboard daily status card: today's status + Time-In timestamp.
- [x] Monthly calendar grid: color-coded per session status.
- [x] GPS failure error state with RFID fallback instruction.

### Phase 6 — Background Jobs & Alerts
- [x] Update compute-daily-status for session-aware per-section absence classification.
- [x] Update send-sms-alert templates for buddy-punch void alert.
- [x] Implement Prefect System webhook dispatcher.
- [x] QR token auto-rotation job (Realtime update every 30s per active QR session).

---

## 13. Architecture Integrity Checklist

- [x] RFID is primary; QR is fallback; manual is last resort.
- [x] Teacher initiates student sessions; Admin initiates teacher sessions.
- [x] Enrollment management is Admin-only.
- [x] Students have Time-In only; Teachers have Time-In + Time-Out.
- [x] Buddy punch void = Absent + Parent SMS + Prefect webhook.
- [x] GPS failure = hard reject for QR (no pending review queue).
- [x] Anti-passback: 5-minute cooldown on all RFID taps.
- [x] QR anti-replay: rotating 30s token + 50m geofence.
- [x] All manual corrections logged to audit_log with actor + reason.
- [x] Teachers cannot self-correct; Admin corrects teacher sessions; Teacher corrects student sessions.
- [x] RLS enforced at DB level for all session and log access.
- [x] No emojis in any UI — vector SVG icons only.
- [x] Color Hunt Blue palette applied throughout.
- [x] Prefect integration scoped to outbound webhook only (pre-oral stage).
