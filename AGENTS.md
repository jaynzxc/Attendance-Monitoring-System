# Bestlink College of the Philippines Attendance Monitoring System (AMS)
## AI Agent Behavior Rules & Architectural Guidelines

---

## 1. Project Identity & System Scope

* **Capstone Title:** Design and Development of an Attendance Monitoring System for Bestlink College of the Philippines with Performance Analytics and RFID/QR Scanning.  
* **System Scope:** Subsystem of the SMS 1 (School Management System) enterprise ecosystem.

This repository contains the complete frontend, backend, and hardware integration contracts for the Bestlink College attendance monitoring platform.

The system automates daily attendance tracking for students and teachers, hardware RFID scanning (ESP32), camera-based QR fallback scanning, tardiness/absence detection, digital excuse slip processing, executive performance analytics, parent SMS notifications, and role-based access control.

---

## 2. Core Directive & Engineering Philosophy

Your primary mandate is to keep the project **CONSISTENT, SECURE, TESTABLE, MAINTAINABLE, UNDERSTANDABLE, and STABLE**.

You are NOT merely a code generator. You are a disciplined software engineer who verifies before acting:
1. **Understand Before Modifying:** Always inspect existing code and database schemas before writing code.
2. **Defend System Integrity:** Never sacrifice security, data integrity, or accessibility for implementation speed.
3. **Respect Established Patterns:** Adhere strictly to the existing Vanilla JS + Tailwind + Supabase architecture.
4. **Academic Rigor:** Ensure all code, comments, and documentation reflect institutional capstone standards.
5. **Anti AI Slop:** Produce clean, purposeful, human-engineered code. Never generate trivial filler comments, speculative boilerplate, fake ungrounded abstractions, or half-baked stubs.

---

## 3. Stakeholder Roles & Access Model

The system enforces strict **Role-Based Access Control (RBAC)** across three authenticated user portals, with parents receiving asynchronous SMS notifications:

| Role | Portal / Route | Description & Privileges |
|---|---|---|
| **Admin** | `/admin/` | Registrar / Attendance Officer. Full system configuration, user management (students/teachers), RFID/QR device hub, section scheduling, excuse slip escalation, institution-wide analytics, awards tool, report export, and SMS alert templates. Real-time monitoring of all teacher and student RFID ingress. |
| **Teacher** | `/teacher/` | Subject / Advisory Teacher. Physical RFID card check-in/time-out automatically registered in Admin; personal attendance log tracking; live section roll call, manual fallback attendance marking, excuse slip review/approval for assigned sections, and section performance analytics. |
| **Student** | `/student/` | Enrolled Student. Personal RFID/QR credential owner. Taps RFID card on scanner to generate real-time Present/Late records; tracks daily scan timeline and monthly attendance calendar in portal; submits digital excuse slips with proof attachments. |
| **Parent / Guardian** | *No Portal (SMS Only)* | Linked via student profile mobile number. Receives automated, real-time SMS notifications for tardiness and absences. No login or dashboard credentials. |

---

## 4. Technology Stack & Architectural Constraints

* **Frontend:** HTML5, Tailwind CSS, Vanilla JavaScript (ES6+ modular, no-framework).
* **Backend:** Supabase (PostgreSQL 15+, Auth, Realtime, Storage, Edge Functions Deno/TypeScript).
* **Ingress Hardware:** ESP32 Microcontroller + MFRC522 RFID Reader (gate & room scanners).
* **Ingress Fallback:** Camera-based QR code scanning (`/shared/qr-scan.html`) with clientside `jsQR`.
* **Messaging Gateway:** SMS API Gateway (Semaphore / Movider) for parent alerts.
* **Hosting:** Static hosting (Vercel, Netlify, or Supabase Storage) with Supabase Cloud backend.

> **Strict Rule:** Do NOT introduce React, Vue, Angular, Svelte, PHP, Laravel, or other full-stack/SSR frameworks unless explicitly requested by the user. Preserve the lightweight Vanilla JS + Tailwind + Supabase architecture.

---

## 5. Mandatory Pre-Action Protocol

Before writing or modifying ANY code, you MUST execute the following checks:

### 5.1 Read Authoritative Documentation
Always consult the relevant specifications in `docs/`:
- Read [`docs/PRD.md`](docs/PRD.md) to understand WHAT the feature should do.
- Read [`docs/DATA.md`](docs/DATA.md) to understand table schemas, types, and constraints.
- Read [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) to understand system architecture and deployment.
- Read [`docs/CONTEXT.md`](docs/CONTEXT.md) to understand system boundaries and external integrations.
- Read [`docs/WORKFLOW.md`](docs/WORKFLOW.md) to understand high-level operational workflows.
- Read [`docs/MODULE_WORKFLOWS.md`](docs/MODULE_WORKFLOWS.md) to follow the step-by-step module-by-module flow.
- Read [`docs/DB_E2E_WORKFLOW.md`](docs/DB_E2E_WORKFLOW.md) to trace the end-to-end database lifecycle for scans.
- Read [`docs/UI-UX_Architecture.md`](docs/UI-UX_Architecture.md) to follow the Color Hunt design system.
- Read [`docs/UI-UX_BackendSpec.md`](docs/UI-UX_BackendSpec.md) to follow REST, RPC, and Realtime contracts.
- Read [`docs/Security.md`](docs/Security.md) to understand RLS, anti-passback, and token rules.
- Read [`docs/planning.md`](docs/planning.md) to execute the 5-phase planning protocol.
- Read [`docs/skills.md`](docs/skills.md) to follow established domain skill protocols.

### 5.2 Inspect Existing Code
- Locate all files related to the feature or bug fix.
- Understand the current implementation and caller relationships.
- Note existing patterns (naming, modular functions, error handling).

### 5.3 Inspect Database Schema
- Verify table structures and column names match `docs/DATA.md`.
- Check for existing indexes and foreign key constraints.
- If the database schema differs from documentation, **REPORT THE CONFLICT** (do not silently fix).

### 5.4 Understand Dependencies
- Check `package.json` for frontend and Supabase client dependencies.
- Do not introduce external libraries or heavy dependencies without clear justification.

---

## 6. Authoritative Documentation Suite (`docs/`)

All architectural, data, security, and planning specifications reside in the `docs/` directory:

* [`docs/PRD.md`](docs/PRD.md) — Product Requirements Document (Goals, functional requirements FR-1 to FR-10, constraints).
* [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — System Architecture (C4 model, DDL database schema, deployment topology, security).
* [`docs/CONTEXT.md`](docs/CONTEXT.md) — System Context (C4 Level 1 diagram, boundary statements, external system integrations).
* [`docs/WORKFLOW.md`](docs/WORKFLOW.md) — Operational Workflows (Ingress sequence, absence cron, excuse slips, awards engine).
* [`docs/MODULE_WORKFLOWS.md`](docs/MODULE_WORKFLOWS.md) — Module-by-Module Workflows (10 PRD modules step-by-step, triggers, table impacts, exit states).
* [`docs/DB_E2E_WORKFLOW.md`](docs/DB_E2E_WORKFLOW.md) — End-to-End Database Lifecycle (Single scan transaction flow, table lifecycle matrix, consistency rules).
* [`docs/DATA.md`](docs/DATA.md) — Authoritative Data Dictionary (Table schemas, foreign keys, enumerations, ERD).
* [`docs/UI-UX_Architecture.md`](docs/UI-UX_Architecture.md) — UI/UX Architecture & Design System (Color Hunt palette, tokens, sitemap, screen specs).
* [`docs/UI-UX_BackendSpec.md`](docs/UI-UX_BackendSpec.md) — UI-to-Backend Technical Specification (REST queries, RPCs, Edge functions, Realtime channels, RLS).
* [`docs/planning.md`](docs/planning.md) — Planning Skill Specification (5-phase planning protocol, impact checklists, milestones roadmap).
* [`docs/skills.md`](docs/skills.md) — System Skills Specification (Master skills matrix, operational protocols, constraints).
* [`docs/Security.md`](docs/Security.md) — Security Architecture & Threat Model (RLS policies, ESP32 API auth, anti-passback cooldown).

---

## 7. Folder Structure & Organization

```
Attendance Monitoring System/
├── docs/                             # Authoritative system documentation & specs
│   ├── PRD.md
│   ├── ARCHITECTURE.md
│   ├── CONTEXT.md
│   ├── WORKFLOW.md
│   ├── MODULE_WORKFLOWS.md
│   ├── DB_E2E_WORKFLOW.md
│   ├── DATA.md
│   ├── UI-UX_Architecture.md
│   ├── UI-UX_BackendSpec.md
│   ├── planning.md
│   ├── skills.md
│   └── Security.md
├── admin/                            # Administrator portal pages
│   ├── dashboard.html                # Executive overview & live scan stream
│   ├── attendance-logs.html          # Filterable attendance logs & audit trail
│   ├── sections.html                 # Section & curriculum management
│   ├── users.html                    # Student & teacher directory
│   ├── devices.html                  # ESP32 scanner device registry & telemetry
│   ├── excuse-slips.html             # Excuse slip escalation & review
│   ├── analytics.html                # Institutional attendance analytics
│   ├── awards.html                   # Perfect Attendance Award engine
│   ├── reports.html                  # CSV & Excel data export
│   └── settings.html                 # Schedule cutoffs, SMS templates, holidays
├── teacher/                          # Teacher portal pages
│   ├── dashboard.html                # Assigned sections & today's schedule
│   ├── attendance.html               # Live section roll call & manual override
│   ├── excuse-slips.html             # Section excuse slip approval workbench
│   └── analytics.html                # Section-level attendance performance
├── student/                          # Student portal pages
│   ├── dashboard.html                # Personal summary & daily status
│   ├── attendance-calendar.html      # Monthly color-coded attendance grid
│   ├── excuse-slip-submit.html       # Digital excuse slip form with file upload
│   └── analytics.html                # Personal attendance rate & warnings
├── shared/                           # Shared utility views
│   ├── qr-scan.html                  # Camera QR code fallback scanner
│   └── unauthorized.html             # RBAC 403 access denial screen
├── assets/
│   ├── css/                          # Compiled Tailwind CSS and custom styles
│   ├── js/                           # Modular Vanilla JS
│   │   ├── lib/                      # Supabase client, auth, realtime helpers
│   │   ├── api/                      # Service API wrappers (attendance, slips, etc.)
│   │   ├── components/               # Reusable UI widgets (charts, tables, toasts)
│   │   └── pages/                    # Page controller scripts
│   └── images/                       # System logos and branding assets
├── supabase/
│   ├── migrations/                   # PostgreSQL DDL migrations & RLS policies
│   ├── functions/                    # Supabase Edge Functions (Deno/TypeScript)
│   │   ├── scan-ingest/              # ESP32 & QR scan ingestion endpoint
│   │   ├── send-sms-alert/           # Asynchronous parent SMS notification
│   │   ├── compute-daily-status/     # Daily cron: tardy/absent classification
│   │   └── compute-awards/           # Automated Perfect Attendance evaluation
│   └── seed.sql                      # Development seed data
├── esp32-firmware/                   # Microcontroller C++ code (Arduino IDE / PlatformIO)
│   ├── ams_scanner.ino               # MFRC522 scanning, buzzer, LED, HTTPS client
│   └── config.h.example              # Wi-Fi credentials & device API key template
├── skills/                           # Reusable agent skills
│   └── security/                     # Security skill specifications
│       └── SKILL.md
├── index.html                        # Authentication & login entry point
└── AGENTS.md                         # Agent instructions & workspace guidelines
```

---

## 8. Design System & Styling Rules

All user interfaces adhere strictly to the **Color Hunt Blue Palette** ([Palette Reference](https://colorhunt.co/palette/e3f2fd90caf92196f30d47a1)):

### 8.1 Palette Tokens

| Variable | Hex Value | Semantic Role |
|---|---|---|
| `--ch-900` | `#0D47A1` | **Deep Royal Navy:** Primary brand mark, authoritative headings, high-contrast text, dark foundations |
| `--ch-500` | `#2196F3` | **Vibrant Primary Blue:** Interactive elements, CTA buttons, active navigation, trend lines |
| `--ch-200` | `#90CAF9` | **Pastel Sky Blue:** Card borders, chart target lines, focus rings, subtle tags |
| `--ch-100` | `#E3F2FD` | **Soft Ice Blue:** Light canvas backgrounds, badge backdrops, avatar containers, pill highlights |

### 8.2 Semantic Attendance Status Tokens

* **Present:** `#10B981` (soft: `rgba(16, 185, 129, 0.12)`)
* **Late / Tardy:** `#F59E0B` (soft: `rgba(245, 158, 11, 0.12)`)
* **Absent:** `#EF4444` (soft: `rgba(239, 68, 68, 0.12)`)
* **Excused:** `#0288D1` (soft: `rgba(2, 136, 209, 0.12)`)

### 8.3 Dual-Theme Support
Every view supports an authoritative **Light Mode** (`data-theme="light"`, default) and a low-glare **Midnight Navy Dark Mode** (`data-theme="dark"`). Theme switching must dynamically update Chart.js axis, grid, and gradient colors without page reloads.

### 8.4 Visual Polish Requirements
* Use tabular numerals (`font-variant-numeric: tabular-nums`) for all timestamps, student IDs, and KPI values to eliminate layout jitter.
* Implement animated count-up numerical transitions on dashboard KPIs.
* Use pulsing live indicators (`@keyframes pulse-dot`) on active gate scanner feeds.
* Maintain **WCAG 2.1 AA** contrast ratios (minimum `4.5:1` for body text, `3.0:1` for UI components).

### 8.5 Iconography Rule: No Emoji, Just Use an Icon Instead
* **Strict Emoji Ban:** NEVER use Unicode emojis (e.g., 📊, 🚀, 🔔, ⚠️, ❌, ✅, 📅, 👤) anywhere in the user interface, buttons, navigation links, cards, tables, badges, toasts, or console logs.
* **Crisp Vector Icons:** Always use clean, scalable SVG vector icons (or standardized icon libraries like Lucide / Heroicons / FontAwesome) styled via Tailwind CSS classes. Emojis degrade institutional professionalism, render inconsistently across platforms, and clash with the institutional Color Hunt design system.

---

## 9. Engineering & Code Quality Standards

### 9.1 HTML
* Use semantic HTML5 elements (`<aside>`, `<header>`, `<main>`, `<nav>`, `<section>`).
* Use meaningful IDs, classes, and `aria-live="polite"` regions for real-time WebSocket feeds.
* Maintain clean formatting, proper indentation, and accessible form inputs with associated `<label>` tags.

### 9.2 CSS & Tailwind
* Favor Tailwind utility classes; encapsulate design tokens using CSS custom properties (`:root`).
* Avoid ad-hoc inline styles. Use predefined design system variables.
* Preserve consistent card border radius (`border-radius: 14px`), button radius (`8px`), and pill radius (`20px`).

### 9.3 JavaScript
* Write clean, modular ES6+ functions using `const` and `let` (never `var`).
* Separate UI rendering logic from Supabase data operations (`assets/js/api/` vs. `assets/js/pages/`).
* Implement optimistic UI updates with defensive rollback on network failure.
* Avoid redundant polling; leverage Supabase Realtime WebSocket listeners.
* Never use `innerHTML` with untrusted data; use `textContent` or sanitized DOM node creation.

### 9.4 Supabase & PostgreSQL
* **Row-Level Security (RLS) is mandatory:** Client-side role checks (`rbac-guard.js`) are for UX convenience only. Authorization must be enforced at the database level using `auth.uid()` and RLS policies.
* **Never expose service-role keys** in frontend client code.
* Use Stored Procedures (RPCs) for complex or multi-row aggregations (`fn_get_daily_kpis`, `fn_get_5week_trend`, `fn_review_excuse_slip`).
* Deactivating a student or teacher must set `status = 'inactive'` rather than deleting rows to preserve historical attendance integrity.

### 9.5 Hardware & Ingress Protocol
* ESP32 devices authenticate to `/functions/v1/scan-ingest` using a hashed secret key (`x-device-key`).
* **Unified Ingress for Teachers & Students:**
  * When a **teacher** scans in, their attendance status (Present or Late against the teacher shift cutoff) automatically registers in the Admin system in real time. Teachers track their own history in their dedicated **Personal Attendance Log** in `/teacher/`.
  * When a **student** scans in, a real-time record is generated (Present or Late against the cutoff e.g. 08:00 AM), updating Admin live streams, Teacher live section roll calls, and the student's personal calendar in `/student/`.
  * Both teachers and students have continuous access to logs in their respective portal panels to keep track of their attendance.
* Enforce a strict **5-minute anti-passback cooldown window** to prevent duplicate time-in taps for both students and teachers.
* Gate hardware triggers optical (Green/Amber/Red LED) and auditory (piezo beeps) feedback within <300ms.

---

## 10. Planning Before Complex Changes & Change Size Principle

### 10.1 Planning Protocol
For any change involving:
- More than 2 files
- Database schema / DDL migrations
- Authentication or Row-Level Security policies
- New API endpoints or Edge Functions
- Core attendance classification rules

You MUST execute the 5-phase planning protocol defined in [`docs/planning.md`](docs/planning.md):
1. **Context Ingestion:** Read relevant docs.
2. **Impact Mapping:** Map changes across Admin, Teacher, Student, Parent, and Hardware.
3. **Technical Blueprint:** Draft DDL, RPCs, tokens, and endpoints.
4. **Edge Case Audit:** Test anti-passback, offline sync, and role boundaries.
5. **Incremental Execution:** Build with atomic diffs and verification steps.

### 10.2 Change Size Principle
**Prefer small, focused changes:**
- One feature or bug fix per change set.
- Refactor only when necessary for the current task.
- Never rewrite an entire working file from scratch for a small change.
- Maintain backward compatibility for all API and RPC signatures.

---

## 11. Destructive Change Protocol

The following actions require **EXPLICIT user confirmation** before execution:

* Hard-deleting records (students, teachers, attendance logs, settings).
* Dropping database tables, columns, or changing existing constraints.
* Altering authentication or Row-Level Security logic that reduces security.
* Deleting or moving existing project files.
* Bulk mutations to attendance records or user directories.

**When proposing a destructive change, state:**
1. What will be changed.
2. Why it is necessary.
3. The impact on existing data and audit trails.
4. The rollback or recovery plan.

---

## 12. Conflict Resolution Hierarchy

Documentation is not automatically correct. Existing code is not automatically correct.

When project sources conflict, reconcile using this strict hierarchy:

```
1. Actual Working Implementation (Active DB schema, working Edge functions, production code)
                             │
                             ▼
2. Product Requirements Document (docs/PRD.md)
                             │
                             ▼
3. Authoritative Data Model (docs/DATA.md)
                             │
                             ▼
4. Architecture & Technical Specifications (docs/ARCHITECTURE.md, docs/UI-UX_BackendSpec.md)
                             │
                             ▼
5. Security Requirements (docs/Security.md)
                             │
                             ▼
6. Migration & Compatibility Impact
```

**Resolution Process:**
1. Identify the specific conflict.
2. Show the conflicting definitions and file locations.
3. Inspect the actual working implementation.
4. Determine systemic impact.
5. Recommend the canonical definition.
6. Ask for clarification if the decision carries breaking risks.
7. **NEVER silently pick whichever source was read last.**

---

## 13. Testing & Verification Standards

After implementing any feature or fix, verify logic using these criteria:

1. **Describe Test Scenarios:** Outline exact verification steps.
2. **Success Cases:** Test expected successful path (e.g., valid RFID tap records on-time attendance and updates Realtime feed).
3. **Failure Cases:** Test rejection paths (e.g., card tapped within 5 minutes returns HTTP 429; student attempting to modify another's excuse slip blocked by RLS).
4. **Hardware/Network Edge Cases:** Test offline kiosk buffering, invalid credentials, and reconnection sync.
5. **No Visual Jitter:** Confirm tabular numerals prevent layout jumping during live updates.

---

## 14. Git Commit Guidelines

When preparing commit messages or summarizing changes:
* Use the format: `[Area] Brief imperative description`
* Examples:
  * `[Auth] Enforce session token rotation and RLS authorization`
  * `[Ingress] Implement 5-minute anti-passback cooldown in scan-ingest`
  * `[UI] Apply Color Hunt palette and theme toggle to Admin Overview`
  * `[Excuse] Add fn_review_excuse_slip RPC with atomic status update`
  * `[DB] Add composite index on attendance_logs(student_id, scanned_at)`
  * `[SMS] Integrate Semaphore gateway for tardiness alert dispatch`

---

## 15. The "Never Do" List

* **NEVER** introduce React, Vue, Angular, Svelte, PHP, Laravel, or full-stack SSR frameworks.
* **NEVER** hardcode credentials, database passwords, or Supabase `service_role` keys in client-side code.
* **NEVER** execute hard deletes (`DELETE FROM users`); always perform soft deactivation (`status = 'inactive'`).
* **NEVER** bypass the 5-minute anti-passback cooldown window for attendance scans.
* **NEVER** create web login credentials or dashboard interfaces for parents (parents are passive SMS recipients only).
* **NEVER** rely on frontend role checks (`rbac-guard.js`) alone for security; PostgreSQL RLS is the single source of truth.
* **NEVER** rewrite an entire working file from scratch when an incremental modification suffices.
* **NEVER** invent ungrounded institutional policies or business rules; verify against `docs/` or ask for clarification.
* **NEVER** leave `TODO`, `FIXME`, or unhandled promise rejections in production code.
* **NEVER** use emojis anywhere in the user interface, buttons, tables, badges, toasts, or system alerts (always use crisp vector SVGs/icon sets).
* **NEVER** generate AI slop (bloated boilerplate, trivial obvious comments, fake speculative features, or ungrounded logic).
