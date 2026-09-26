---
name: ams-planning
description: Enforce the 5-phase planning protocol, multi-role impact mapping, Anti AI Slop standards, and framework-free architectural boundaries for the Bestlink College Attendance Monitoring System. Use before making architectural changes, modifying database schemas, refactoring components, or implementing complex multi-file features.
---

# AMS Planning Skill

This skill governs the pre-execution planning protocol for the **Bestlink College of the Philippines Attendance Monitoring System (AMS)**. It enforces rigorous architectural validation, stakeholder impact mapping, and zero-slop engineering.

## Instructions

### Step 1: Context Ingestion & Specification Discovery
- Read the authoritative specifications in `docs/` before proposing any changes:
  - `docs/PRD.md` — Functional goals and requirements.
  - `docs/DATA.md` — Table schemas, constraints, and enums.
  - `docs/ARCHITECTURE.md` & `docs/CONTEXT.md` — C4 model and boundaries.
  - `docs/Security.md` — RLS policies and threat mitigations.
  - `docs/UI-UX_Architecture.md` — Color Hunt design tokens and styling rules.

### Step 2: Multi-Role Impact Mapping
- Map the ripple effects across all 5 system boundaries:
  - **Admin (`/admin/`):** Full auditability, reports, device hub, user directory.
  - **Teacher (`/teacher/`):** Live roll call, manual overrides, section-scoped excuse slip approvals.
  - **Student (`/student/`):** Personal calendar, scan timeline, slip submissions.
  - **Parent (SMS):** Automated asynchronous SMS alerts only (no web portal accounts).
  - **Hardware (ESP32):** Ingress scanning, 5-minute anti-passback cooldown, buzzer/LED feedback.

### Step 3: Anti AI Slop Mandates
- **No Hallucinated or Speculative Logic:** Reject ungrounded columns, fake endpoints, and fabricated business rules.
- **No Filler Comments:** Do not write obvious explanatory comments (e.g. `// return response`). Code must be self-documenting.
- **No Placeholder Stubs:** Never leave incomplete code, mock fake data, or `TODO` markers in production.
- **No Bloated Abstractions:** Favor lean, modular ES6+ and PostgreSQL functions over speculative classes or unnecessary wrappers.
- **Change Size Principle:** Prefer small, atomic, surgically targeted diffs. Never rewrite working files from scratch.

### Step 4: Visual Polish & Iconography Standard (No Emoji, Just Use an Icon Instead)
- **Zero Emojis:** Strictly ban Unicode emojis (e.g., 📊, 🚀, 🔔, ⚠️, ❌, ✅, 📅, 👤) across UI elements, buttons, badges, notifications, and plans.
- **Crisp SVG Icons:** Require crisp, scalable SVG vector icons (or standardized icon libraries like Lucide / Heroicons / FontAwesome) styled via Tailwind CSS classes.

### Step 5: Incremental Execution Blueprint
- Document exact file targets, line ranges, DDL migrations, and test verification scenarios before touching code.
