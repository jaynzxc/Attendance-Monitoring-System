# System Context Document

## Attendance Monitoring System (AMS) — Bestlink College of the Philippines

**Companion to:** PRD.md, ARCHITECTURE.md, WORKFLOW.md
**Version:** 1.0
**Date:** September 25, 2026

---

## 1. Purpose

This document defines the **system context (C4 "Level 1")** for the AMS: what sits inside the system boundary, which people and external systems interact with it, and how those interactions flow. It answers "what is this system, who touches it, and what does it talk to?" before ARCHITECTURE.md goes into how it's built internally.

---

## 2. System Boundary Statement

The **Attendance Monitoring System (AMS)** is a web-based subsystem of the larger SMS 1 (School Management System) being developed for Bestlink College of the Philippines. It is responsible for capturing, classifying, storing, and reporting student and teacher attendance, and for notifying parents/guardians of attendance events. It is developed and scoped as a **standalone capstone module** with defined integration points for future SMS 1 subsystems, but those other subsystems are **outside** the AMS system boundary for this project.

---

## 3. System Context Diagram (C4 Level 1)

```mermaid
flowchart TB
    subgraph Users["People (Actors)"]
        SuperAdmin["Super Admin<br/>(MIS / IT Administrator)"]
        Admin["Admin<br/>(Registrar / Attendance Officer)"]
        Staff["Staff<br/>(Clerical / Inquiry Assistant)"]
        AcadOfficial["Acad Official<br/>(Deans / Program Heads)"]
        Monitoring["Monitoring Officer<br/>(Classroom Headcount Inspector)"]
        Faculty["Faculty Member<br/>(Classroom Teacher)"]
        Student["Student"]
        Parent["Parent / Guardian<br/>(no login — SMS & Gmail alerts)"]
    end

    subgraph AMS["Attendance Monitoring System (AMS)<br/>[Software System — this project]"]
    end

    subgraph External["External Systems"]
        SMSGW["SMS Gateway API<br/>(Semaphore / Movider)"]
        EmailGW["Email Gateway (Gmail / SMTP / Resend)"]
        SupabaseAuth["Supabase Auth<br/>(Identity Provider)"]
    end

    subgraph Hardware["Hardware Devices"]
        ESP32["ESP32 + RFID Reader<br/>(Scanner at gate/room)"]
        RFIDCard["RFID Card<br/>(carried by Student/Faculty)"]
        Cam["Device Camera<br/>(QR fallback scan)"]
    end

    subgraph Future["Future Integration (Out of Scope)"]
        SMS1["Other SMS 1 Subsystems<br/>(Academic HR, OSAS, PREFECT, etc.)"]
    end

    SuperAdmin -- "Manages hardware keys, audit logs,<br/>system settings, API secrets" --> AMS
    Admin -- "Manages users, sections,<br/>excuse slips, exports" --> AMS
    Staff -- "Verifies daily logs,<br/>handles student inquiries" --> AMS
    AcadOfficial -- "Views executive KPIs,<br/>accreditation reports" --> AMS
    Monitoring -- "Checks room headcounts,<br/>verifies faculty in charge" --> AMS
    Faculty -- "Duty check-in/out, live roll call,<br/>approves section excuse slips" --> AMS
    Student -- "Taps card / scans QR,<br/>submits excuse slips, views calendar" --> AMS
    RFIDCard -- "tap" --> ESP32
    ESP32 -- "POSTs scan events (HTTPS)" --> AMS
    Cam -- "QR scan (browser)" --> AMS
    AMS -- "Authenticates users via" --> SupabaseAuth
    AMS -- "Dispatches SMS alerts via" --> SMSGW
    AMS -- "Dispatches Gmail alerts via" --> EmailGW
    SMSGW -- "Delivers SMS" --> Parent
    EmailGW -- "Delivers Email" --> Parent
    AMS -. "Exposes attendance data<br/>(future integration hooks)" .-> SMS1
```

---

## 4. Actors

| Actor | Type | Description | Interaction with AMS |
|-------|------|--------------|-----------------------|
| **Super Admin** | Primary (Human, authenticated) | Head of IT / MIS Administrator | Full system administration, API keys, ESP32 device registry, audit log inspection via `/super-admin/` |
| **Admin** | Primary (Human, authenticated) | College Registrar / Head Attendance Officer | Daily attendance management, student/teacher directory, sections, excuse slips, reporting via `/admin/` |
| **Staff** | Primary (Human, authenticated) | Clerical / Office Assistant | Daily scan log inquiries, physical slip intake assistance, front-desk inquiries via `/staff/` |
| **Acad Official** | Primary (Human, authenticated) | Academic Executives (Deans, Program Heads) | Executive analytics, department attendance trends, section risk watchlists via `/acad-official/` |
| **Monitoring** | Primary (Human, authenticated) | Classroom Roving Inspector | Room-by-room headcount verification, verifying assigned professor-in-charge via `/monitoring/` |
| **Faculty Member** | Primary (Human, authenticated) | Subject / Advisory Classroom Instructor | Duty check-in/out, live section roll call, manual fallback marking, excuse slip review via `/teacher/` |
| **Student** | Primary (Human, authenticated) | Enrolled Student | RFID card / QR code holder, personal calendar, excuse slip submission via `/student/` |
| **Parent / Guardian** | Secondary (Human, unauthenticated) | Non-teaching stakeholder linked to student | Receives automated, asynchronous SMS and Gmail notifications; zero web login or portal access |

---

## 5. External Systems & Dependencies

| External System | Direction | Purpose | Notes |
|------------------|-----------|---------|-------|
| **Supabase Auth** | AMS → depends on | User authentication, session/JWT issuance | Also backs RBAC role checks and RLS via `auth.uid()` |
| **SMS Gateway API** (Semaphore / Movider) | AMS → external | Sends SMS alerts to parents | Dispatches real-time tardiness and nightly absence notices |
| **Email Gateway (Gmail / SMTP / Resend)** | AMS → external | Sends automated Gmail alerts to parents | Dispatches email alerts for unexcused absences and tardiness |
| **Supabase Realtime** | Internal to backend, treated as a platform capability | Live dashboard updates | Part of the Supabase platform, not a separate external system |
| **Supabase Storage** | Internal to backend | Stores excuse slip attachments | Part of the Supabase platform |
| **Other SMS 1 Subsystems** (Library, Clinic, Property Custodian, School Event, OSAS, PREFECT, Academic HR, Financial, Alumni) | Future — AMS exposes data | Long-term integration (e.g., Academic HR consuming teacher attendance; OSAS/PREFECT correlating incidents with attendance) | **Out of scope** for this capstone; represented only as an integration boundary |

---

## 6. Hardware Devices in Context

| Device | Role | Boundary |
|--------|------|----------|
| **ESP32 + RFID Reader (MFRC522)** | Primary attendance capture device, installed at gates/entrances/rooms | Outside the web system boundary, but tightly coupled via the `scan-ingest` API; treated as a first-class client of AMS |
| **RFID Card** | Physical credential carried by student/teacher | Passive — read by the ESP32, not a networked actor |
| **Device Camera (student's phone/laptop/kiosk)** | QR scan fallback | Uses the AMS web app itself (`/shared/qr-scan.html`), not a separate system |

---

## 7. In Scope vs. Out of Scope

### In Scope (AMS system boundary)
- Admin, Teacher, and Student web panels
- RFID/QR scan ingestion and classification logic
- Attendance logs, summaries, and calendar views
- Excuse slip submission/approval workflow
- SMS alert dispatch (via external gateway)
- Analytics dashboard and Perfect Attendance Award computation
- CSV/Excel export
- RBAC/RLS-based authorization

### Out of Scope
- Full functionality of the other nine SMS 1 subsystems
- Payroll processing (future Academic HR Management concern)
- Native mobile applications
- Parent-facing login/dashboard (SMS-only by design)
- SMS gateway's internal delivery infrastructure (treated as a black-box external dependency)

---

## 8. Assumptions Affecting Context

- Each ESP32 scanner has reliable Wi-Fi at its installation point.
- The school provides/maintains the physical network infrastructure for scanner devices.
- An SMS gateway account/API credentials will be provisioned by the school or project team before the alerting workflow can go live.
- Supabase Cloud (or a self-hosted equivalent) is the assumed backend platform for both development and production.
