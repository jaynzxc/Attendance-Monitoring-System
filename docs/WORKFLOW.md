# System Workflow Document

## Attendance Monitoring System (AMS) — Bestlink College of the Philippines

**Companion to:** PRD.md, ARCHITECTURE.md **Version:** 1.0 **Date:** September 25, 2026

---

## 1. Purpose

This document describes the operational workflows of the AMS — how data moves through the system for each core process, and how each RBAC role (Admin, Teacher, Student) interacts with it. Parents are included only as passive SMS recipients, consistent with the PRD.

---

## 2. Core Workflow: RFID/QR Scan → Attendance Record

This is the system's primary, highest-frequency workflow.

```mermaid
flowchart TD
    A[Student taps RFID card at ESP32 scanner] --> B{Card UID recognized?}
    B -- No --> B1[Reject scan / red LED + buzzer]
    B1 --> B2[Log unregistered_card event to audit_log]
    B -- Yes --> C{Within 5-min cooldown of last scan?}
    C -- Yes --> C1[Reject as duplicate / distinct beep]
    C -- No --> D[Resolve card_uid to user_id]
    D --> E{Existing time_in today?}
    E -- No --> F[Record as time_in]
    E -- Yes --> G[Record as time_out]
    F --> H{Scanned after cutoff time?}
    H -- Yes --> I[Status = Late]
    H -- No --> J[Status = Present]
    I --> K[Insert attendance_logs row]
    J --> K
    G --> K
    K --> L[Supabase Realtime broadcasts change]
    L --> M[Dashboards update live: Admin / Teacher / Student]
    I --> N[Queue SMS alert to parent: Tardy]
    N --> O[send-sms-alert function dispatches SMS]
    O --> P[Log result to alerts_log]
```

**Fallback path — QR scanning:** If RFID hardware is unavailable, the student opens the QR scan page (`/shared/qr-scan.html`) on any device with a camera, scans their personal QR code, and the same validation/cooldown/status logic applies, submitting to the same `scan-ingest` function with `scan_method = "qr"`.

**Fallback path — Manual marking:** If both RFID and QR are unavailable, the Teacher marks attendance manually from the Teacher Panel for their section. This bypasses `scan-ingest` and instead calls the `fn_manual_attendance_override` RPC directly (authenticated as the teacher, scoped by RLS to their own sections), which logs the override to `audit_log` with `created_by`.

---

## 3. Daily End-of-Day Workflow: Absence Classification & Alerts

Runs automatically every school night via the `compute-daily-status` cron function.

```mermaid
flowchart TD
    A[Cron triggers at 8:00 PM daily] --> B[Get list of active students/teachers]
    B --> C{Is today a holiday?}
    C -- Yes --> C1[Skip — no attendance required]
    C -- No --> D{Time_in recorded today?}
    D -- Yes --> D1[Status already set: Present/Late — no change]
    D -- No --> E{Approved excuse slip covers today?}
    E -- Yes --> F[Status = Excused]
    E -- No --> G[Status = Absent]
    G --> H[Upsert attendance_summary]
    F --> H
    H --> I{Status = Absent?}
    I -- Yes --> J[Queue SMS alert to parent: Absent]
    J --> K[send-sms-alert dispatches SMS]
    K --> L[Log to alerts_log]
    I -- No --> M[No alert needed]
```

---

## 4. Excuse Slip Workflow

```mermaid
flowchart TD
    A[Student opens Excuse Slip form in Student Panel] --> B[Fill reason, date range, optional attachment]
    B --> C[Submit → excuse_slips row created, status = Pending]
    C --> D[Teacher Panel: pending slip appears in queue for their section]
    D --> E{Teacher decision}
    E -- Approve --> F[status = Approved, reviewed_by, reviewed_at set]
    E -- Reject --> G[status = Rejected, reviewer notes optional]
    E -- Escalate --> H[Admin reviews / overrides decision]
    F --> I[Linked attendance_summary rows updated to Excused]
    G --> J[Attendance status remains Absent/Late]
    H --> F
    H --> G
```

---

## 5. Perfect Attendance Award Workflow

```mermaid
flowchart TD
    A[Admin defines Award Period: start/end date, max allowed excused] --> B[Admin triggers compute-awards, or scheduled at period end]
    B --> C[For each active user, aggregate attendance_summary within period]
    C --> D{Absences = 0 AND Tardies = 0<br/>within max_allowed_excused?}
    D -- Yes --> E[award_qualifications.qualified = true]
    D -- No --> F[award_qualifications.qualified = false]
    E --> G[Admin views/exports Perfect Attendance list]
    F --> G
    G --> H[List used for certificate generation / recognition event]
```

---

## 6. Analytics Dashboard Data Refresh Workflow

```mermaid
flowchart TD
    A[New attendance_logs row inserted] --> B[Postgres trigger / incremental refresh]
    B --> C[attendance_summary updated]
    C --> D[Supabase Realtime pushes change]
    D --> E1[Admin Dashboard: institution-wide charts update]
    D --> E2[Teacher Dashboard: section charts update]
    D --> E3[Student Dashboard: personal history updates]
    F[Nightly cron: compute-daily-status] --> C
    G[Admin/Teacher opens Analytics page] --> H[Query attendance_summary directly for historical trends]
```

---

## 7. CSV/Excel Export Workflow

```mermaid
flowchart TD
    A[User (Admin/Teacher) opens Reports page] --> B[Select filters: date range, section, status]
    B --> C[Query Supabase directly from browser, scoped by RLS]
    C --> D{Export format?}
    D -- CSV --> E[Generate CSV client-side]
    D -- Excel --> F[Generate .xlsx via SheetJS client-side]
    E --> G[Trigger browser download]
    F --> G
    G --> H[Log export_generated event to audit_log with filters used]
```

---

## 8. Role-Based Login & Panel Access Workflow

```mermaid
flowchart TD
    A[User visits login page] --> B[Submit email + password]
    B --> C[Supabase Auth verifies credentials]
    C -- Invalid --> C1[Show error, remain on login]
    C -- Valid --> D[JWT session issued]
    D --> E[Frontend queries users table for role]
    E --> F{Role?}
    F -- admin --> G[Redirect to /admin/dashboard]
    F -- teacher --> H[Redirect to /teacher/dashboard]
    F -- student --> I[Redirect to /student/dashboard]
    G --> J[Every data request enforced by RLS server-side]
    H --> J
    I --> J
```

---

## 9. End-to-End Daily Operational Timeline (Narrative Summary)

| Time | Event |
| --- | --- |
| Before school starts | Admin/Teacher confirm scanner devices show `online` status on Admin Panel |
| Morning gate hours | Students tap RFID (or scan QR) at entrance → `time_in` recorded → Present/Late determined instantly → dashboards update in real time |
| Throughout the day | Teachers may manually mark attendance per period if needed; students may submit excuse slips for prior absences |
| Dismissal | Students tap out (`time_out`) if time-out tracking is enabled for the school |
| Ongoing | Teachers/Admin review and act on pending excuse slips |
| 8:00 PM (nightly cron) | System finalizes the day: any student/teacher with no time-in and no approved excuse slip is marked Absent; SMS alerts sent to parents for new Late/Absent statuses |
| Periodic (Admin-triggered or cron) | `compute-awards` runs at the end of a grading period/semester to update Perfect Attendance qualification list |
| As needed | Admin/Teacher generate CSV/Excel exports for reporting or compliance |

---

## 10. Error / Exception Handling Workflows

| Scenario | Handling |
| --- | --- |
| ESP32 loses Wi-Fi mid-day | Firmware buffers scans locally (LittleFS) and flushes queue on reconnect; device shows `offline` on Admin Panel until heartbeat resumes |
| Card UID not registered | Scan rejected, logged to `audit_log` as `unregistered_card`; Admin can review and link the card to a user from the Devices/Users page |
| Duplicate rapid scans | Rejected within the 5-minute cooldown window; no duplicate log created |
| SMS gateway failure | `alerts_log.status = failed`; Admin can view failed alerts and manually retry or resend from the Admin Panel |
| Teacher disputes an auto-marked Absence | Student/Parent-initiated excuse slip (submitted by student) reviewed by teacher; if approved, `attendance_summary` is corrected to Excused |
| Conflicting manual override vs. scan record | Manual overrides are logged with `created_by` in `audit_log`; the most recent authorized entry for that day/user takes precedence, and history remains visible to Admin for audit purposes |

---

## 11. Notes for Implementation

- All Mermaid diagrams above can be rendered directly in any Markdown viewer that supports Mermaid (e.g., GitHub, GitLab, most capstone documentation tools) or pasted into a diagramming tool for the capstone manuscript.
- These workflows map directly to the functional requirements in PRD.md (Section 4) and the technical contracts in ARCHITECTURE.md (Sections 5–8); use this document as the process-level reference during development and for the capstone's System Design/Methodology chapter.