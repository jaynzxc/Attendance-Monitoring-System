# End-to-End Database Workflow

## Attendance Monitoring System (AMS) — Bestlink College of the Philippines

**Companion to:** PRD.md, ARCHITECTURE.md, DATA.md, MODULE_WORKFLOWS.md
**Version:** 1.0
**Date:** September 25, 2026

---

## 1. Purpose

This document traces a **single scan event end-to-end through every table it touches**, from the physical RFID tap to the final exported report — the full lifecycle of one piece of attendance data across the entire database. Use it to validate that migrations, triggers, and cron jobs are wired correctly, and as the reference when writing integration tests.

---

## 2. Full End-to-End Flow (One Scan's Life)

```mermaid
flowchart TD
    subgraph Hardware
        H1[Student taps RFID card]
    end

    subgraph Ingestion["Edge Function: scan-ingest (service_role)"]
        I1[Validate device_code + api_key_hash<br/>against scan_devices]
        I2[Resolve card_uid → user_id<br/>via rfid_cards]
        I3[Check last scan for user<br/>in attendance_logs — cooldown/time_in vs time_out]
        I4[Compare scanned_at to section cutoff<br/>read from sections]
        I5[Compute status: present / late]
    end

    subgraph Core["Core Write: attendance_logs"]
        W1[(INSERT attendance_logs<br/>student_id OR teacher_id, section_id, device_id,<br/>scan_method, event_type, status, scanned_at)]
    end

    subgraph Derived["Derived Write: attendance_summary"]
        D1[(UPSERT attendance_summary<br/>user_id, summary_date, status, minutes_late)]
    end

    subgraph Realtime["Supabase Realtime"]
        R1[Broadcast postgres_changes event<br/>on attendance_logs INSERT]
    end

    subgraph Dashboards["Frontend (RLS-scoped reads)"]
        F1[Admin Dashboard: live scan feed & teacher/student arrival registered]
        F2[Teacher Dashboard: live section roll call + personal attendance log]
        F3[Student Dashboard: personal attendance calendar & daily log timeline]
    end

    subgraph Nightly["Nightly Cron: compute-daily-status"]
        N1{Did a time_in exist today?}
        N2[If no + no approved excuse_slips row<br/>→ attendance_summary.status = absent]
        N3[If no + approved excuse_slips row<br/>→ attendance_summary.status = excused]
    end

    subgraph Alerting["Edge Function: send-sms-alert"]
        A1[Look up parent_contacts by student_id]
        A2[Render message from template]
        A3[(INSERT alerts_log, status=pending)]
        A4[Call external SMS Gateway]
        A5[(UPDATE alerts_log.status = sent/failed)]
    end

    subgraph Period["Period-End: compute-awards"]
        P1[Aggregate attendance_summary<br/>over award_periods range]
        P2[(UPSERT award_qualifications)]
    end

    subgraph Reporting["On-Demand: Reports Page"]
        E1[Query attendance_logs / attendance_summary /<br/>excuse_slips / award_qualifications, RLS-scoped]
        E2[Generate CSV/XLSX client-side]
        E3[(INSERT audit_log: export_generated)]
    end

    H1 --> I1 --> I2 --> I3 --> I4 --> I5 --> W1
    W1 --> D1
    W1 --> R1 --> F1
    R1 --> F2
    R1 --> F3
    D1 -.status=late.-> A1
    D1 --> N1
    N1 -- Yes --> D1
    N1 -- No --> N2
    N1 -- No --> N3
    N2 --> A1
    N3 -.no alert.-> Reporting
    A1 --> A2 --> A3 --> A4 --> A5
    D1 --> P1 --> P2
    W1 --> E1
    D1 --> E1
    P2 --> E1
    E1 --> E2 --> E3
```

---

## 3. Table Lifecycle Reference

The table below shows, for **every table in the schema**, which process writes to it, which reads from it, and where it sits in the end-to-end flow above.

| Table | Written by | Read by | Stage in E2E flow |
|---|---|---|---|
| `scan_devices` | Admin (registration), device heartbeat ping | `scan-ingest` (validation) | Pre-flight — validates the hardware source |
| `rfid_cards` / `qr_codes` | Admin (issuance) | `scan-ingest` (identity resolution) | Ingestion step I2 |
| `sections` | Admin (setup) | `scan-ingest` (cutoff time), dashboards, exports | Ingestion step I4; read throughout |
| `attendance_logs` | `scan-ingest` (INSERT), manual override RPC | Dashboards, calendar drill-down, exports, Realtime source | **Core write** — system of record |
| `attendance_summary` | `scan-ingest` path (UPSERT), `compute-daily-status` cron | Dashboards, calendar, awards, exports | **Derived write** — fast-read aggregate |
| `holidays` | Admin (setup) | `compute-daily-status` (skip logic) | Nightly cron decision input |
| `excuse_slips` | Student (INSERT), Teacher/Admin (UPDATE status) | `compute-daily-status` (excused check), calendar | Feeds nightly classification |
| `parent_contacts` | Admin/Student profile management | `send-sms-alert` | Alerting step A1 |
| `alerts_log` | `send-sms-alert` (INSERT/UPDATE) | Admin (delivery monitoring) | Alerting steps A3–A5 |
| `award_periods` | Admin (setup) | `compute-awards` | Period-end input |
| `award_qualifications` | `compute-awards` (UPSERT) | Admin (award list), exports | Period-end output |
| `audit_log` | `scan-ingest` (rejections), manual overrides, exports | Admin (audit review) | Cross-cutting — written at multiple stages |
| `users` | Admin (provisioning), Supabase Auth (identity) | Every table via FK / RLS role checks | Cross-cutting — identity backbone |

---

## 4. End-to-End Timing Model

| Stage | Typical latency | Trigger type |
|---|---|---|
| Tap → `attendance_logs` insert | < 2 seconds | Synchronous (Edge Function) |
| Insert → Realtime dashboard update | < 1 second | Event-driven (Supabase Realtime) |
| Late scan → SMS queued | Near-immediate (same request or async follow-up) | Event-driven |
| SMS queued → delivered | Seconds to ~1 minute | Dependent on external SMS gateway |
| Absence classification | Once nightly (e.g., 8:00 PM) | Scheduled (cron) |
| Award qualification | End of grading period/semester, or on-demand | Scheduled or Admin-triggered |
| Export generation | On-demand, sub-second to a few seconds depending on row count | User-initiated |

---

## 5. Consistency & Recovery Notes

- **`attendance_summary` is fully derivable** from `attendance_logs` + `excuse_slips` + `holidays`. If it ever drifts out of sync (e.g., after a bulk manual correction), it can be safely truncated and rebuilt by re-running the nightly classification logic across the affected date range — no data loss, since `attendance_logs` remains the immutable source of truth.
- **`award_qualifications` is fully derivable** from `attendance_summary` for a given `award_periods` range — safe to recompute at any time via `compute-awards`.
- **`alerts_log` is append/update-only** and never recomputed — it is the permanent record of what was actually attempted/sent, independent of later data corrections (e.g., an approved excuse slip after the fact does not retroactively delete the "Absent" SMS that was already sent that night — this is intentional, matching real-world notification behavior).
- **A single scan event can fan out to multiple tables** (`attendance_logs` → `attendance_summary` → `alerts_log` → eventually `award_qualifications` and `audit_log` at export time), but only `attendance_logs` is the append-only source; everything downstream is either derived or a log of an external action.
