---
name: manual-qa
description: Execute structured manual functional testing and smoke verification on the development/staging environment for the Bestlink College Attendance Monitoring System. Use before oral defense rehearsals, demo sessions, feature PR merges, or production deployments to verify core user journeys, role boundaries, ingress logic, and realtime data synchronization.
---

# Manual QA & Smoke Verification Skill

This skill defines the authoritative, repeatable manual functional verification protocol for the **Bestlink College of the Philippines Attendance Monitoring System (AMS)**. It enables a solo developer or QA tester to validate end-to-end user flows, attendance classification, anti-passback protection, and role guards in under 10 minutes on the `development` (staging) environment.

---

## Instructions

### Step 1: Pre-Flight Verification & Environment Preparation
1. Ensure the application is pointing to the `development` / staging Supabase instance (verify `assets/js/lib/supabase-client.js` or environment configuration).
2. Confirm that the staging database contains baseline seed data from `supabase/seed.sql` (at least 1 Admin, 1 Teacher with assigned section, 2 active Students, 1 active ESP32 device entry).
3. Open two browser windows side-by-side:
   - **Window A:** Admin or Teacher Portal.
   - **Window B:** Incognito window for Student Portal or QR Scanner (`/shared/qr-scan.html`).
4. Open Developer Tools (F12) in both windows to monitor:
   - **Console:** Confirm zero uncaught JavaScript errors or unhandled promise rejections.
   - **Network:** Watch for 2xx responses and inspect HTTP 4xx/5xx errors.

---

### Step 2: Role-Based Access Control (RBAC) & Route Guards
Verify that unauthorized access attempts are redirected to `/shared/unauthorized.html` or `/index.html`:

| Test Action | Expected Result | Pass Criteria |
|---|---|---|
| Navigate to `/admin/dashboard.html` without active session | Redirects to `/index.html` (Login page) | URL changes; no dashboard UI flashed |
| Log in as **Student**, then manually enter `/admin/dashboard.html` in address bar | Redirects to `/shared/unauthorized.html` (HTTP 403 screen) | Access denied; student cannot see admin navigation |
| Log in as **Teacher**, then manually enter `/admin/settings.html` | Redirects to `/shared/unauthorized.html` | Access denied; settings reserved strictly for Registrar/Admin |
| Log in as **Admin**, click "Sign Out" | Session cleared; redirects to `/index.html`; browser Back button cannot restore session state | Back button redirects back to login |

---

### Step 3: Student Ingress & Cutoff Classification
Verify that student RFID or QR scans correctly classify status based on the section schedule cutoff (e.g., 08:00 AM):

1. **On-Time (Present) Scan:**
   - Scan a student credential prior to or at the cutoff time (e.g., 07:45 AM).
   - In **Window A (Admin Dashboard)**: Verify the live stream updates within 1 second via Realtime listener (`attendance_logs:INSERT`).
   - Check status badge: Displays **Present** with green status token (`#10B981`).
   - In **Window B (Student Portal)**: Refresh `/student/dashboard.html`; today's status displays **Present** with exact scan timestamp.

2. **Late (Tardy) Scan:**
   - Scan a student credential past the cutoff time (e.g., 08:15 AM).
   - Verify status badge displays **Late** with amber status token (`#F59E0B`).
   - Verify tardiness calculation reflects correct minutes past cutoff.

---

### Step 4: 5-Minute Anti-Passback Cooldown Enforcement
Verify that rapid duplicate taps are strictly blocked to prevent attendance fraud:

1. Immediately tap the same student credential again within 5 minutes of the initial scan.
2. In the Network tab or scanner response:
   - Endpoint `/functions/v1/scan-ingest` must return **HTTP 429 Too Many Requests**.
   - JSON payload must contain: `{"error": "cooldown_active"}`.
3. In the UI (if using camera QR scanner `/shared/qr-scan.html`):
   - A warning toast or badge must appear indicating cooldown active (wait 5 minutes).
   - The live feed on Admin dashboard must **not** duplicate the log entry.

---

### Step 5: Teacher Ingress (Check-In & Time-Out)
Verify faculty attendance tracking and payroll integration records:

1. Scan a teacher credential at the physical scanner or QR fallback.
2. If first scan of the shift:
   - Registers as **Time-In**.
   - Admin view `/admin/teacher-attendance.html` displays teacher name, time-in timestamp, and Present/Late badge based on teacher shift schedule.
   - Teacher portal `/teacher/my-logs.html` displays the new Time-In record.
3. Scan the same teacher credential after the 5-minute cooldown has elapsed:
   - Registers as **Time-Out**.
   - Total hours rendered updates in the teacher attendance summary.

---

### Step 6: Excuse Slip Lifecycle (Student Submission to Admin Review)
Verify the digital excuse slip workflow and audit trail:

1. **Student Submission (`/student/excuse-slip-submit.html`):**
   - Fill out date of absence, select reason category (e.g., Illness), and provide explanation text.
   - Attach a proof document (`.pdf`, `.jpg`, or `.png`, < 5 MB).
   - Click "Submit Excuse Slip".
   - Confirm slip appears in the student's history table with status **Pending**.
2. **Review & Approval (`/teacher/excuse-slips.html` or `/admin/excuse-slips.html`):**
   - Log in as the assigned section Teacher or Admin.
   - Open the pending excuse slip.
   - Click the attachment link: verify proof document opens via a signed URL (confirm short TTL, expires in 300s).
   - Click **Approve** and provide review notes.
3. **Status Propagation & Summary Rewrite:**
   - Verify slip status changes to **Approved**.
   - Verify the student's `attendance_summary` record for the affected date transitions from **Absent** to **Excused** (blue token `#0288D1`).
   - Confirm a corresponding record is written to `audit_log`.

---

### Step 7: Realtime Synchronization & Tabular UI Polish
1. Keep Admin Dashboard open on a secondary monitor or split window during a scan.
2. Verify that KPI counter increments dynamically (Present count +1) with animated count-up.
3. Confirm tabular numerals (`font-variant-numeric: tabular-nums`) prevent KPI card and timestamp layout shifts during updates.
4. Verify that no Unicode emojis appear anywhere in toasts, badges, tables, or buttons (clean SVG icons only).

---

## Manual QA Verification Scorecard

Use this template to record verification results before oral defense or staging promotion:

```markdown
### AMS Manual QA Run
- **Environment:** `development` (Staging)
- **Tester:** Full Stack Lead
- **Commit SHA / Branch:** [SHA] on `development`
- **Date / Time:** [YYYY-MM-DD HH:MM]

| Module / Flow | Status | Notes / Observations |
|---|---|---|
| 1. Route Guards (RBAC 403 / Login Redirects) | [PASS / FAIL] | |
| 2. Student Scan (Present on-time) | [PASS / FAIL] | |
| 3. Student Scan (Late tardy) | [PASS / FAIL] | |
| 4. Anti-Passback Cooldown (HTTP 429) | [PASS / FAIL] | |
| 5. Teacher Ingress (Time-In / Time-Out) | [PASS / FAIL] | |
| 6. Excuse Slip Submission & Storage Upload | [PASS / FAIL] | |
| 7. Excuse Slip Approval & Status Rewrite | [PASS / FAIL] | |
| 8. Realtime Feed & Animated KPIs | [PASS / FAIL] | |
| 9. Design System Compliance (No Emojis, SVGs) | [PASS / FAIL] | |

**Overall Gate Status:** [APPROVED FOR DEMO / BLOCKED]
```

