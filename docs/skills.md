# System Skills & Development Procedures Specification (`skills.md`)

## Attendance Monitoring System (AMS) — Bestlink College of the Philippines
**Subsystem of SMS 1 (School Management System)**  
**Target Path:** `docs/skills.md` (Main Skills Document)  
**Companion Documents:** `PRD.md`, `ARCHITECTURE.md`, `DATA.md`, `WORKFLOW.md`, `UI-UX_Architecture.md`, `UI-UX_BackendSpec.md`, `Security.md`, `planning.md`  
**Version:** 2.0  
**Date:** September 26, 2026  
**Status:** Authoritative Single Source of Truth for Engineering Skills & Development Procedures  

---

## 1. Overview & Operational Purpose

This document is the **authoritative single source of truth** for all domain skills, engineering workflows, debugging methodologies, database patterns, and testing protocols for the **Bestlink College of the Philippines Attendance Monitoring System (AMS)**.

It combines all high-level agent capability specifications with concrete, step-by-step development and debugging procedures. AI agents (in Google Antigravity, OpenCode, VS Code, Claude) and software engineers must adhere to these directives for all development, maintenance, and deployment tasks.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              DEVELOPER / AGENT WORKSPACE                               │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            │ Discovers & Executes Skill
         ┌──────────────────┬───────────────┼───────────────┬──────────────────┐
         ▼                  ▼               ▼               ▼                  ▼
┌─────────────────┐ ┌───────────────┐ ┌───────────┐ ┌───────────────┐ ┌──────────────────┐
│ ams-planning    │ │ ams-ui-ux     │ │ ams-rls   │ │ ams-ingress   │ │ ams-backend      │
│ SOP & Impact    │ │ Color Hunt UI │ │ Security  │ │ ESP32 & QR    │ │ Supabase & RPCs  │
└─────────────────┘ └───────────────┘ └───────────┘ └───────────────┘ └──────────────────┘
```

---

## 2. Master Skills Matrix

| Skill Slug | Domain | Primary Documentation Authority | Primary Responsibility |
|---|---|---|---|
| **`ams-planning`** | Architecture & SOP | [`docs/planning.md`](file:///c:/Users/jaync/Desktop/Attendance%20Monitoring%20System/docs/planning.md) | Multi-role impact analysis, 5-phase planning protocol, milestone roadmap. |
| **`ams-ui-ux`** | Design System & Styling | [`docs/UI-UX_Architecture.md`](file:///c:/Users/jaync/Desktop/Attendance%20Monitoring%20System/docs/UI-UX_Architecture.md) | Color Hunt palette enforcement, dual-theme switching, tabular numerals, KPI animations. |
| **`ams-backend-contracts`** | Data Layer & APIs | [`docs/UI-UX_BackendSpec.md`](file:///c:/Users/jaync/Desktop/Attendance%20Monitoring%20System/docs/UI-UX_BackendSpec.md) | PostgREST queries, Stored Procedures (RPCs), Realtime WebSocket listeners, Storage buckets. |
| **`ams-security-rls`** | Authorization & Defense | [`docs/Security.md`](file:///c:/Users/jaync/Desktop/Attendance%20Monitoring%20System/docs/Security.md) | PostgreSQL Row-Level Security policies, RBAC enforcement, credential protection. |
| **`ams-hardware-ingress`** | Hardware & Fallbacks | [`docs/WORKFLOW.md`](file:///c:/Users/jaync/Desktop/Attendance%20Monitoring%20System/docs/WORKFLOW.md) (§2) | ESP32 MFRC522 firmware, 5-min anti-passback cooldown, camera QR fallback scanner. |
| **`ams-crons-sms`** | Background Automations | [`docs/WORKFLOW.md`](file:///c:/Users/jaync/Desktop/Attendance%20Monitoring%20System/docs/WORKFLOW.md) (§3) | Nightly 8:00 PM absence cron, holiday filtering, Semaphore/Movider SMS parent alerts. |
| **`ams-analytics-awards`** | BI & Award Engine | [`docs/PRD.md`](file:///c:/Users/jaync/Desktop/Attendance%20Monitoring%20System/docs/PRD.md) (§4.8) | 5-week rolling trend charts, section watchlists, Perfect Attendance qualification engine. |

---

## 3. Core Domain Skills

### 3.1 Skill: `ams-planning` (System Planning & Impact Protocol)
* **Trigger Conditions:** Triggered on any non-trivial user request, new feature proposal, architectural refactoring, or multi-component bug fix.
* **Input Context:** [`docs/planning.md`](file:///c:/Users/jaync/Desktop/Attendance%20Monitoring%20System/docs/planning.md), [`docs/PRD.md`](file:///c:/Users/jaync/Desktop/Attendance%20Monitoring%20System/docs/PRD.md), [`docs/CONTEXT.md`](file:///c:/Users/jaync/Desktop/Attendance%20Monitoring%20System/docs/CONTEXT.md).
* **Execution Rules:**
  1. Execute the 5-phase protocol (Context Ingestion → Impact Mapping → Technical Blueprint → Edge Case Audit → Execution).
  2. Map changes across all 4 stakeholder tiers: Admin (`/admin/`), Teacher (`/teacher/`), Student (`/student/`), Parent (SMS Gateway).
  3. Enforce the lightweight Vanilla JS + Tailwind CSS + Supabase stack. Never introduce React, Vue, Angular, PHP, or Laravel.

---

### 3.2 Skill: `ams-ui-ux` (Design System & Color Hunt Aesthetics)
* **Trigger Conditions:** Triggered when creating or modifying HTML templates, CSS stylesheets, Tailwind utility classes, or Chart.js visualizations.
* **Input Context:** [`docs/UI-UX_Architecture.md`](file:///c:/Users/jaync/Desktop/Attendance%20Monitoring%20System/docs/UI-UX_Architecture.md), [`AMS — Admin Overview Dashboard.html`](file:///c:/Users/jaync/Desktop/Attendance%20Monitoring%20System/AMS%20%E2%80%94%20Admin%20Overview%20Dashboard.html).
* **Design System Tokens:**
  ```css
  /* Color Hunt Blue Palette: https://colorhunt.co/palette/e3f2fd90caf92196f30d47a1 */
  --ch-900: #0D47A1; /* Deep Royal Navy: Headings, brand mark, dark surface foundations */
  --ch-500: #2196F3; /* Vibrant Primary Blue: Interactive CTAs, active nav, trend line */
  --ch-200: #90CAF9; /* Pastel Sky Blue: Card borders, chart target line, focus rings */
  --ch-100: #E3F2FD; /* Soft Ice Blue: Light canvas background, badge backdrops, pill highlights */

  /* Semantic Attendance Status Tokens */
  --present: #10B981; --present-soft: rgba(16, 185, 129, 0.12);
  --late:    #F59E0B; --late-soft:    rgba(245, 158, 11, 0.12);
  --absent:  #EF4444; --absent-soft:  rgba(239, 68, 68, 0.12);
  --excused: #0288D1; --excused-soft: rgba(2, 136, 209, 0.12);
  ```
* **Execution Rules:**
  1. Enforce `font-variant-numeric: tabular-nums` on all numerical counters, timestamps, and percentages.
  2. Implement dual-theme support: Light Mode (`[data-theme="light"]`, default) and Midnight Navy (`[data-theme="dark"]`).
  3. Re-render Chart.js gradients and grid lines dynamically on theme toggle without page reload.
  4. Ensure minimum **WCAG 2.1 AA** contrast (`4.5:1` body text, `3.0:1` interactive elements).
  5. Include pulsing live indicator (`@keyframes pulse-dot`) on active gate scanner feeds.

---

### 3.3 Skill: `ams-backend-contracts` (PostgREST, RPC & Realtime Synchronization)
* **Trigger Conditions:** Triggered when developing database queries, stored procedures, client-side Supabase data fetching, or WebSocket listeners.
* **Input Context:** [`docs/UI-UX_BackendSpec.md`](file:///c:/Users/jaync/Desktop/Attendance%20Monitoring%20System/docs/UI-UX_BackendSpec.md), [`docs/DATA.md`](file:///c:/Users/jaync/Desktop/Attendance%20Monitoring%20System/docs/DATA.md).
* **Execution Rules:**
  1. Separate UI rendering from Supabase data operations (`assets/js/api/` vs. `assets/js/pages/`).
  2. Always use transactional Stored Procedures (RPCs) for multi-row or atomic operations:
     * `fn_get_daily_kpis(p_date)` → Aggregates present, late, absent, excused counts and rate in one roundtrip.
     * `fn_get_5week_trend()` → Aggregates rolling 5-week weekly averages for Chart.js.
     * `fn_review_excuse_slip(p_slip_id, p_action, p_notes)` → Atomically updates excuse slip, rewrites `attendance_summary` to `excused`, and inserts audit log.
  3. Subscribe to Realtime WebSocket channels (`attendance_logs:INSERT`, `scan_devices:UPDATE`) for live dashboard updates.
  4. Implement optimistic UI state updates with defensive rollback on network failure.

---

### 3.4 Skill: `ams-security-rls` (Zero-Trust Authorization & RLS Enforcement)
* **Trigger Conditions:** Triggered when defining table schemas, writing Supabase policies, adding authentication checks, or handling user roles.
* **Input Context:** [`docs/Security.md`](file:///c:/Users/jaync/Desktop/Attendance%20Monitoring%20System/docs/Security.md), [`docs/DATA.md`](file:///c:/Users/jaync/Desktop/Attendance%20Monitoring%20System/docs/DATA.md).
* **Strict Security Mandates:**
  1. **Postgres RLS is Mandatory:** Client-side role checks in `rbac-guard.js` are for UI/UX convenience only. Database RLS policies using `auth.uid()` are the sole authoritative security boundary.
  2. **Zero Service-Role Leaks:** NEVER expose `SUPABASE_SERVICE_ROLE_KEY` in client-side HTML, JavaScript, or public repositories.
  3. **Role Scoping:**
     * `student`: Restricted to own records (`student_id = auth.uid()`).
     * `teacher`: Scoped strictly to assigned sections via `teacher_sections`.
     * `admin`: Global administrative access.
  4. **Preserve Historical Integrity:** Never hard-delete student or teacher records (`DELETE FROM users`). Deactivation must set `status = 'inactive'` to preserve historical attendance logs and audit integrity.

---

### 3.5 Skill: `ams-hardware-ingress` (ESP32 RFID & Camera QR Ingress Protocol)
* **Trigger Conditions:** Triggered when modifying ESP32 firmware, scanner ingestion Edge functions, or camera QR fallback scanning views.
* **Input Context:** [`docs/WORKFLOW.md`](file:///c:/Users/jaync/Desktop/Attendance%20Monitoring%20System/docs/WORKFLOW.md) (§2), [`docs/UI-UX_BackendSpec.md`](file:///c:/Users/jaync/Desktop/Attendance%20Monitoring%20System/docs/UI-UX_BackendSpec.md) (§4), `esp32-firmware/`.
* **Execution Rules:**
  1. **Hashed Device Authentication:** ESP32 devices must authenticate to `/functions/v1/scan-ingest` via the `x-device-key` header, verified against `scan_devices.api_key_hash`.
  2. **Strict 5-Minute Anti-Passback Cooldown:** Scans for the same student within 5 minutes of their last tap must be rejected with HTTP `429 Too Many Requests` (`error: cooldown_active`) to prevent duplicate attendance logs.
  3. **Low-Latency Feedback (<300ms):**
     * Green LED + Single Beep: Present / On-Time.
     * Amber LED + Double Beep: Late / Tardy.
     * Yellow LED + Triple Beep: Cooldown active (already recorded).
     * Red LED + Alarm Buzzer: Unregistered / Inactive card.
  4. **Camera QR Fallback (`/shared/qr-scan.html`):** Uses client-side `jsQR` to decode student QR tokens and submits to `/scan-ingest` with `scan_method = "qr"`. Supports offline `IndexedDB` caching during network dropouts.

---

### 3.6 Skill: `ams-crons-sms` (Automated Absence Classification & Parent SMS Alerting)
* **Trigger Conditions:** Triggered when configuring end-of-day scheduled tasks, parent communication pipelines, or SMS gateway integrations.
* **Input Context:** [`docs/WORKFLOW.md`](file:///c:/Users/jaync/Desktop/Attendance%20Monitoring%20System/docs/WORKFLOW.md) (§3), [`docs/PRD.md`](file:///c:/Users/jaync/Desktop/Attendance%20Monitoring%20System/docs/PRD.md) (§4.7).
* **Execution Rules:**
  1. **Nightly 8:00 PM Absence Cron (`compute-daily-status`):**
     * Checks if current date is marked in `school_holidays`; if so, skips absence evaluation.
     * For active students without a `time_in` record: Checks for an approved excuse slip covering the date. If approved → `status = 'excused'`; otherwise → `status = 'absent'`.
     * Upserts daily records into `attendance_summary`.
  2. **Asynchronous Parent SMS Alerts (`send-sms-alert`):**
     * Triggers real-time SMS for tardiness (scanned past section cutoff).
     * Triggers end-of-day SMS for unexcused absences.
     * Dispatches payloads to SMS Gateway API (Semaphore / Movider) using parent phone numbers registered in `parent_contacts`.
     * Parents are **unidirectional SMS recipients only** (no web portal login, no dashboard credentials).
     * Every dispatch is logged in `alerts_log` with status, timestamp, and carrier message ID.

---

### 3.7 Skill: `ams-analytics-awards` (Executive Analytics & Awards Engine)
* **Trigger Conditions:** Triggered when developing institutional analytics, section attendance watchlists, or Perfect Attendance awards generation.
* **Input Context:** [`docs/PRD.md`](file:///c:/Users/jaync/Desktop/Attendance%20Monitoring%20System/docs/PRD.md) (§4.8), [`docs/WORKFLOW.md`](file:///c:/Users/jaync/Desktop/Attendance%20Monitoring%20System/docs/WORKFLOW.md) (§5).
* **Execution Rules:**
  1. **Institutional Analytics:** Compute institution-wide and section-level attendance percentages across configurable date ranges (last 7 days, 30 days, semester).
  2. **Risk Radar (Sections to Watch):** Query sections with highest absence/tardiness rates over the past 5 days to highlight intervention priorities on the Admin dashboard.
  3. **Perfect Attendance Award Engine (`compute-awards`):**
     * Filters active students with zero absences and zero tardies within a specified `award_periods` window.
     * Permits a configurable threshold of excused absences (e.g., maximum 1 approved medical slip).
     * Populates `award_qualifications` and renders printable vector certificates.
  4. **Data Exports:** Generates standard CSV and Excel exports of attendance logs for administrative compliance and DepEd/CHED reporting.

---

## 4. Development Procedures & Workflows

### 4.1 Frontend Build & Tailwind CSS Workflow
AMS uses Tailwind CSS utility classes with CSS custom properties defined in `:root`.

```bash
# Development: Watch for CSS changes
npx tailwindcss -i ./assets/css/input.css -o ./assets/css/tailwind.css --watch

# Production: Compile and minify bundle
npx tailwindcss -i ./assets/css/input.css -o ./assets/css/tailwind.css --minify
```

**Conventions:**
* Use utility classes directly in HTML; encapsulate theme variables in `:root` and `[data-theme="dark"]`.
* Ensure card border radius is consistently `14px`, button radius `8px`, and pill radius `20px`.
* Use tabular numerals (`tabular-nums`) for all timestamps, student IDs, and KPI values.

---

### 4.2 Modular JavaScript Development Pattern
Frontend JavaScript uses clean, native ES6+ modules without bundling overhead:

```
assets/js/
├── lib/
│   ├── supabaseClient.js      # Supabase client singleton initialization
│   ├── auth.js                # Login, logout, session management
│   ├── rbac-guard.js          # UX route protection (redirects unauthorized users)
│   └── realtime.js            # WebSocket subscription helper
├── api/
│   ├── attendance.js          # Ingress & log queries
│   ├── excuseSlips.js         # Excuse slip CRUD & approvals
│   ├── users.js               # Student & teacher directory queries
│   └── devices.js             # Scanner registry queries
├── components/
│   ├── charts.js              # Chart.js initialization & dynamic theme switcher
│   ├── calendar.js            # Monthly color-coded attendance grid builder
│   └── toast.js               # Non-blocking notification toasts
└── pages/
    ├── admin/dashboard.js     # Admin dashboard controller
    ├── teacher/attendance.js  # Teacher roll call controller
    └── student/calendar.js    # Student attendance calendar controller
```

**Client API Wrapper Example (`assets/js/api/attendance.js`):**
```javascript
import { supabase } from '../lib/supabaseClient.js';

export async function fetchDailyKpis(targetDate = null) {
  const { data, error } = await supabase.rpc('fn_get_daily_kpis', {
    p_date: targetDate || new Date().toISOString().split('T')[0]
  });
  if (error) throw error;
  return data;
}

export async function subscribeToRecentScans(onNewScan) {
  return supabase
    .channel('gate-scans-feed')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'attendance_logs' }, async (payload) => {
      const { data: fullLog } = await supabase
        .from('attendance_logs')
        .select('*, users(first_name, last_name, student_number), sections(name)')
        .eq('id', payload.new.id)
        .single();
      if (fullLog) onNewScan(fullLog);
    })
    .subscribe();
}
```

---

### 4.3 Camera QR Scanner Integration Pattern (`/shared/qr-scan.html`)
The camera QR scanner serves as the instant zero-hardware fallback:

```javascript
// assets/js/pages/shared/qr-scan.js
import { supabase } from '../../lib/supabaseClient.js';

const video = document.getElementById('cameraPreview');
const canvas = document.createElement('canvas');
const ctx = canvas.getContext('2d');

navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
  .then(stream => {
    video.srcObject = stream;
    video.play();
    requestAnimationFrame(tick);
  })
  .catch(err => console.error("Camera access denied:", err));

function tick() {
  if (video.readyState === video.HAVE_ENOUGH_DATA) {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(imageData.data, imageData.width, imageData.height);

    if (code && code.data) {
      handleQrDetected(code.data);
      return; // Pause scanning until processed
    }
  }
  requestAnimationFrame(tick);
}

async function handleQrDetected(token) {
  try {
    const response = await fetch('https://<project-ref>.supabase.co/functions/v1/scan-ingest', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`
      },
      body: JSON.stringify({
        scan_method: 'qr',
        credential_token: token,
        device_code: 'GATE-01-CAMERA',
        timestamp: new Date().toISOString()
      })
    });

    const result = await response.json();
    if (response.status === 429) {
      showCooldownWarning(result.retry_after);
    } else if (response.ok) {
      showSuccessBanner(result.user);
    } else {
      showErrorAlert(result.error);
    }
  } catch (err) {
    bufferScanOffline({ token, timestamp: new Date().toISOString() });
  }
}
```

---

### 4.4 Database Migrations & Indexing Patterns
All database modifications are stored as timestamped SQL migrations in `supabase/migrations/`:

```sql
-- Example: supabase/migrations/20260926_create_attendance_indexes.sql

-- 1. Index for rapid anti-passback cooldown checks
create index if not exists idx_attendance_cooldown 
on attendance_logs (student_id, scanned_at desc);

-- 2. Index for section attendance roll call filtering
create index if not exists idx_attendance_section_date 
on attendance_logs (section_id, scanned_at desc);

-- 3. Composite unique index for daily attendance summary upserts
create unique index if not exists idx_attendance_summary_user_date 
on attendance_summary (user_id, summary_date);
```

**Query Optimization Rules:**
* Avoid `SELECT *` in frontend queries. Explicitly request required columns:
  `supabase.from('attendance_logs').select('id, scanned_at, status, users(first_name, last_name)')`.
* Paginate tabular logs using `.range(start, end)` (standard page size: 25 rows).
* For aggregated KPI counters, always call `fn_get_daily_kpis()` rather than fetching thousands of rows to the client.

---

## 5. Universal Debugging & Troubleshooting Methodology

When debugging any issue across the web portals, Supabase Edge Functions, or ESP32 hardware:

```
REPRODUCE ───► ISOLATE ───► FIX ───► TEST ───► VERIFY
```

1. **REPRODUCE:** Document the exact role (Admin/Teacher/Student), device, and inputs that trigger the issue.
2. **ISOLATE:**
   * Browser Console & Network tab for client-side JavaScript and PostgREST responses.
   * Supabase Dashboard Logs for Postgres errors and Edge Function executions.
   * ESP32 Serial Monitor (`115200 baud`) for hardware Wi-Fi or RFID SPI communication errors.
3. **FIX:** Make the smallest surgical change addressing the root cause.
4. **TEST:** Re-test with valid credentials, expired credentials, and edge conditions.
5. **VERIFY:** Confirm the fix in staging with zero regressions in related modules.

### Troubleshooting Quick-Check Matrix

| Symptom | Probable Cause | Diagnostic Check & Resolution |
|---|---|---|
| **White screen / 403 on page load** | RLS policy rejection or role mismatch | Check browser console; verify `rbac-guard.js` matches `users.role` in database. |
| **Scan rejected with HTTP 429** | Anti-passback cooldown active | Expected behavior if tapped within 5 minutes. Check `attendance_logs.scanned_at`. |
| **ESP32 red LED / Ingestion 401** | Invalid or unhashed device key | Verify `x-device-key` header matches SHA-256 hash in `scan_devices.api_key_hash`. |
| **Card tapped but student unknown (404)** | Card UID not mapped in database | Check `rfid_cards` table; ensure card is registered and `is_active = true`. |
| **Chart not updating on theme toggle** | Canvas instance not destroyed | Ensure `trendChartInstance.destroy()` is invoked before re-instantiating Chart.js. |
| **Parent SMS not delivering** | Insufficient gateway balance or invalid phone format | Check `alerts_log`; ensure mobile number conforms to Philippine E.164 (`+639XXXXXXXXX`). |
| **Excuse proof file upload fails** | File exceeds 5MB or invalid MIME type | Check Supabase Storage bucket policy on `excuse-attachments`; verify file is PDF/JPG/PNG. |

---

## 6. Testing & QA Verification Protocols

### 6.1 Manual Testing Checklist
Before marking any feature complete:

- [ ] **Valid Tap:** Test RFID card tap; verifies optical green LED, single beep, and immediate presence on dashboard.
- [ ] **Duplicate Tap:** Test second tap within 5 minutes; verifies yellow LED, double chirp, and HTTP 429 rejection.
- [ ] **Unregistered Card:** Test unregistered card; verifies red LED, buzzer, and audit log error entry.
- [ ] **Role Isolation (RLS):** Log in as Student; verify cannot access `/admin/` or query another student's logs.
- [ ] **Teacher Scope:** Log in as Teacher; verify can only view attendance for sections assigned in `teacher_sections`.
- [ ] **Theme Switching:** Toggle Light and Dark themes; verify Chart.js axes and cards update cleanly without layout jump.
- [ ] **Tabular Numerals:** Verify timestamps and counters use `font-variant-numeric: tabular-nums` to eliminate jitter.
- [ ] **Mobile Responsiveness:** Verify layout stacks properly on mobile screens (<768px).

---

## 7. Deployment & Release Procedures

### 7.1 Pre-Deployment Verification Checklist
- [ ] All database migrations applied to target Supabase instance.
- [ ] Row-Level Security enabled and verified on all tables.
- [ ] `SUPABASE_SERVICE_ROLE_KEY` confirmed absent from frontend bundles and repository files.
- [ ] Tailwind CSS compiled and minified (`output.css`).
- [ ] Static hosting configured with strict Content Security Policy (CSP) and HSTS.
- [ ] Cron functions (`compute-daily-status`) scheduled in Supabase Cloud.
- [ ] SMS Gateway API balance funded and verified.
- [ ] ESP32 hardware units provisioned with unique device keys and tested at gate entrances.

### 7.2 Deployment Steps
1. Deploy database schema and RLS policies via `supabase db push` or Supabase Migration runner.
2. Deploy Edge Functions:
   ```bash
   supabase functions deploy scan-ingest
   supabase functions deploy send-sms-alert
   supabase functions deploy compute-daily-status
   supabase functions deploy compute-awards
   ```
3. Compile production CSS bundle:
   ```bash
   npx tailwindcss -i ./assets/css/input.css -o ./assets/css/tailwind.css --minify
   ```
4. Deploy static frontend assets to hosting platform (Vercel / Netlify / Supabase Storage).
5. Perform smoke tests across Admin, Teacher, Student, and Gate Ingress paths.
