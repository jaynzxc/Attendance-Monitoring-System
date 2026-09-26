# System Security Specification (`Security.md`)

## Attendance Monitoring System (AMS) — Bestlink College of the Philippines
**Subsystem of SMS 1 (School Management System)**  
**Target Path:** `docs/Security.md`  
**Companion Documents:** `PRD.md`, `ARCHITECTURE.md`, `DATA.md`, `WORKFLOW.md`, `UI-UX_BackendSpec.md`  
**Version:** 2.1 (Merged Unified Security Specification)  
**Date:** September 26, 2026  
**Status:** Approved Security Architecture  

---

## 1. Threat Model & Risk Assessment

The Attendance Monitoring System handles institutional identity, gate physical security, academic records, and parent communications. Threats are evaluated using the **STRIDE** methodology (Spoofing, Tampering, Repudiation, Information Disclosure, Denial of Service, Elevation of Privilege) combined with application-layer threat analysis:

| Threat Category | Specific System Threat | Likelihood | Impact | Architectural Mitigation |
|---|---|---|---|---|
| **Spoofing** | Replaying or cloning RFID card UIDs at ESP32 scanners | Medium | High | Anti-passback 5-min cooldown window, physical security guard presence at gates, camera QR fallback with dynamic session tokens. |
| **Spoofing** | Spoofing ESP32 scan ingestion HTTP requests | High | Critical | Hardened API key authentication (`x-device-key`) verified via SHA-256 hashes against `scan_devices.api_key_hash`. |
| **Spoofing** | Brute force login & credential stuffing | Medium | High | Account rate limiting (5 failed attempts → 15-min lockout; 10 failed attempts → 1-hour lockout), generic error messaging, and Supabase GoTrue auth guards. |
| **Tampering** | Unauthorized modification of attendance logs or summary status | Medium | Critical | PostgreSQL Row-Level Security (RLS) enforcing read-only access for students and section-only access for teachers. |
| **Tampering** | SQL Injection via form fields, search boxes, or query params | Low | Critical | Automatic parameterization via PostgREST and typed PostgreSQL Stored Procedures (RPCs). Zero raw concatenated SQL execution. |
| **Tampering** | Cross-Site Scripting (XSS) via injected notes or student names | Medium | High | Strict DOM sanitization; output rendering restricted to `textContent` and sanitized nodes; defense-in-depth Content Security Policy (CSP). |
| **Repudiation** | User denies tapping card or teacher denies manual override | Medium | Medium | Immutable append-only `audit_log` records with timestamps, actor IDs, device codes, and original scan methods (`rfid`, `qr`, `manual`). |
| **Information Disclosure** | Exposure of student PII, card UIDs, or parent phone numbers | Medium | High | RLS column and row restrictions; public `anon` key permissions locked down; sensitive fields excluded from client queries. |
| **Information Disclosure** | Leaking Supabase `service_role` secret keys or SMS API keys | Low | Catastrophic | `service_role` and SMS provider keys strictly confined to server-side Edge Functions and Supabase Vault; frontend uses only public `anon` key subject to RLS. |
| **Denial of Service** | Card bouncing (rapid multiple taps) causing duplicate logs | High | Medium | Server-side 5-minute anti-passback cooldown window rejecting repeated scans with HTTP `429 Cooldown Active`. |
| **Denial of Service** | Gate Wi-Fi disconnection blocking ingress flow | Medium | High | Offline camera QR scanner with client-side `IndexedDB` caching that flushes automatically upon reconnection. |
| **Elevation of Privilege** | Student modifying client-side role in browser storage to access Admin | High | Critical | Zero-trust architecture: Client-side role checks (`rbac-guard.js`) are UX convenience only; Supabase RLS enforces `auth.uid()` at the database level. |
| **Data Exfiltration** | Bulk scraping of institutional attendance or student directories | Low | High | PostgREST pagination limits, RLS role isolation, and rate-limiting on bulk export endpoints. |

---

## 2. Authentication & Identity Lifecycle

The AMS authentication architecture is backed by **Supabase Auth (GoTrue)** issuing cryptographically signed JSON Web Tokens (JWT).

```
┌─────────────────────────────────┐
│ Client (Browser / Mobile)       │
└────────────────┬────────────────┘
                 │ 1. POST /auth/v1/token {email, password}
┌────────────────▼────────────────┐
│ Supabase Auth (GoTrue)          │ ──► Validates bcrypt / Argon2id hash
└────────────────┬────────────────┘
                 │ 2. Issues JWT (Access Token 1hr) + Refresh Token
┌────────────────▼────────────────┐
│ Postgres Database (PostgREST)   │ ──► Extracts auth.uid() & evaluates RLS policies
└─────────────────────────────────┘
```

### 2.1 Password Security Policy
* **Complexity:** Minimum 8 characters; at least one uppercase letter, one lowercase letter, one numeric digit, and one special character.
* **Hashing Standard:** Hashed using **bcrypt** (cost factor 10+) or **Argon2id** managed natively by Supabase Auth engine.
* **Self-Service Reset:** Password reset requests trigger secure time-limited email magic links with token expiration within 15 minutes.
* **Administrative Reset:** Registrars/Admins can trigger administrative password resets generating a secure temporary password; requires immediate password change upon initial login.
* **Audit Trail:** All password changes and reset events are recorded in `audit_log`.

### 2.2 Token Management & Session Invalidation
* **Access Tokens (JWT):** Short-lived (3,600 seconds / 1 hour) containing `sub` (`auth.uid()`), `email`, `role`, and expiration timestamps (`exp`).
* **Refresh Tokens:** Stored in secure client storage (`localStorage` or `HttpOnly` cookie), automatically rotated on every refresh exchange.
* **Session Termination:** Logging out invalidates the current session token family. Password changes immediately revoke all active refresh tokens across all devices.

### 2.3 Login Rate Limiting & Brute Force Defense
* Failed login attempts are throttled by IP address and target account identifier:
  * **Threshold 1:** 5 failed attempts within 15 minutes initiates a 15-minute temporary lockout.
* **Information Leakage Prevention:** Responses to failed authentication return generic error messaging (*"Invalid email or password"*) to prevent user enumeration.

### 2.4 Hardware Scanner Authentication (ESP32)
* Microcontrollers cannot maintain interactive user login sessions. ESP32 devices authenticate via an HTTP header:
  ```http
  POST /functions/v1/scan-ingest HTTP/1.1
  Host: <project-ref>.supabase.co
  Content-Type: application/json
  x-device-key: 9f8a3c4e7b1a2d5f8e6c4b2a1d0f...
  ```
* The Edge Function hashes the incoming `x-device-key` with SHA-256 and validates it against `scan_devices.api_key_hash`.
* Deactivating a device in the Admin panel sets `status = 'offline'` and revokes ingestion privileges instantly.

---

## 3. Authorization & Row-Level Security (RLS)

Authoritative security is enforced inside PostgreSQL via **Row-Level Security (RLS)**. Even if an attacker compromises client-side JavaScript or issues raw HTTP requests directly to PostgREST, RLS policies discard unauthorized queries.

### 3.1 Role Hierarchy & Permissions Matrix

| Resource / Table | Student Permissions | Teacher Permissions | Admin Permissions |
|---|---|---|---|
| `users` | Read self (`id = auth.uid()`) | Read self + students in assigned sections | Full read/write; deactivation via `status = 'inactive'` |
| `parent_contacts` | Read linked parents (`student_id = auth.uid()`) | Read contacts for assigned sections | Full read/write |
| `sections` | Read enrolled sections | Read assigned sections | Full read/write |
| `attendance_logs` | Read self (`student_id = auth.uid()`) | Read assigned sections; manual override insert | Full read/write/audit |
| `attendance_summary`| Read self (`user_id = auth.uid()`) | Read assigned sections | Full read/write |
| `excuse_slips` | Insert own; Read own slips | Read assigned sections; Approve/Reject | Full read/write/escalate |
| `scan_devices` | No access (403) | No access (403) | Full read/write/telemetry |
| `audit_log` | No access (403) | No access (403) | Read-only (immutable append) |

### 3.2 Authoritative PostgreSQL RLS Policies

```sql
-- Enable RLS across all tables
alter table users enable row level security;
alter table attendance_logs enable row level security;
alter table attendance_summary enable row level security;
alter table excuse_slips enable row level security;
alter table scan_devices enable row level security;
alter table audit_log enable row level security;

-- 1. USERS POLICIES
create policy "users_read_policy" on users
for select using (
  auth.uid() = id or 
  (select role from users where id = auth.uid()) = 'admin' or
  (
    (select role from users where id = auth.uid()) = 'teacher' and
    id in (
      select ss.student_id from student_sections ss
      join teacher_sections ts on ts.section_id = ss.section_id
      where ts.teacher_id = auth.uid()
    )
  )
);

create policy "users_admin_write" on users
for all using (
  (select role from users where id = auth.uid()) = 'admin'
);

-- 2. ATTENDANCE LOGS POLICIES
create policy "logs_student_read" on attendance_logs
for select using (student_id = auth.uid());

create policy "logs_teacher_read" on attendance_logs
for select using (
  section_id in (
    select section_id from teacher_sections where teacher_id = auth.uid()
  )
);

create policy "logs_teacher_manual_insert" on attendance_logs
for insert with check (
  (select role from users where id = auth.uid()) = 'teacher' and
  scan_method = 'manual' and
  created_by = auth.uid() and
  section_id in (
    select section_id from teacher_sections where teacher_id = auth.uid()
  )
);

create policy "logs_admin_all" on attendance_logs
for all using (
  (select role from users where id = auth.uid()) = 'admin'
);

-- 3. EXCUSE SLIPS POLICIES
create policy "slips_student_insert" on excuse_slips
for insert with check (
  student_id = auth.uid() and
  status = 'pending'
);

create policy "slips_student_read" on excuse_slips
for select using (student_id = auth.uid());

create policy "slips_teacher_review" on excuse_slips
for all using (
  section_id in (
    select section_id from teacher_sections where teacher_id = auth.uid()
  ) or (select role from users where id = auth.uid()) = 'admin'
);

-- 4. SCAN DEVICES POLICIES (Admin Only)
create policy "devices_admin_only" on scan_devices
for all using (
  (select role from users where id = auth.uid()) = 'admin'
);

-- 5. AUDIT LOG POLICIES (Admin Read-Only, System Append)
create policy "audit_log_admin_read" on audit_log
for select using (
  (select role from users where id = auth.uid()) = 'admin'
);
```

### 3.3 Ownership & Deletion Guardrails
* **No Client-Side Authority:** Role values in `sessionStorage` or `localStorage` are purely for frontend routing ergonomics (`rbac-guard.js`). All DB queries evaluate `auth.uid()`.
* **Soft Deletion Only:** Direct SQL `DELETE` operations on core entities (`users`, `attendance_logs`) are prohibited. Administrative deactivation sets `status = 'inactive'`, preserving audit trails.

---

## 4. Hardware Security & Anti-Passback Protocol

```
┌─────────────────────────────────┐
│ Student Taps RFID Card          │
└────────────────┬────────────────┘
                 │ 1. Transmits UID: "E2806894"
┌────────────────▼────────────────┐
│ ESP32 Hardware Scanner          │ ──► Bundles device_code + x-device-key
└────────────────┬────────────────┘
                 │ 2. HTTPS POST /scan-ingest
┌────────────────▼────────────────┐
│ Supabase Edge Function          │
│   • Validates x-device-key      │
│   • Resolves UID -> student_id  │
│   • Checks 5-Min Cooldown       │
└────────────────┬────────────────┘
                 ├─── If < 5 mins ──► Returns 429 Cooldown (Yellow LED + Double Beep)
                 └─── If >= 5 mins ─► Inserts attendance_logs (Green LED + Single Beep)
```

### 4.1 Strict 5-Minute Anti-Passback Cooldown Window
* **The Vulnerability:** Students tapping the same card multiple times within seconds (card bouncing) or passing their card back to a classmate behind them in line.
* **The Enforcement:**
  Before recording an entry, `/scan-ingest` checks `attendance_logs`:
  ```sql
  select id from attendance_logs 
  where student_id = v_student_id 
    and scanned_at >= now() - interval '5 minutes'
  limit 1;
  ```
  If a row exists:
  * Ingestion terminates with HTTP `429 Too Many Requests`.
  * Response body: `{"error": "cooldown_active", "retry_after": 180}`.
  * ESP32 triggers optical yellow LED strobe and distinct double chirp.

### 4.2 Scanner Feedback Latency Requirement
* Ingress scanning must provide audio/visual feedback in **under 300ms**.
* ESP32 firmware executes a non-blocking HTTPS client, lighting feedback indicators immediately upon response packet receipt.

---

## 5. Storage & File Upload Security

Student medical certificates and excuse slip proofs are uploaded to Supabase Storage.

### 5.1 Bucket Specifications
* **Bucket Identifier:** `excuse-attachments`
* **Access Mode:** Private (Public read access permanently disabled).
* **Storage Limit:** Maximum 5 MB per excuse slip attachment; 2 MB for profile avatars.
* **Allowed MIME Types:** Strictly whitelisted:
  * `application/pdf` (`.pdf`)
  * `image/jpeg` (`.jpg`, `.jpeg`)
  * `image/png` (`.png`)
* Executable and script file types (`.exe`, `.bat`, `.sh`, `.php`, `.js`, `.html`, `.svg`) are rejected at the bucket configuration and Edge Function validation layers.

### 5.2 Filename Sanitization & Path Structure
* Files are renamed upon ingestion to cryptographically random UUIDs to prevent directory traversal and filename collisions:
  * Path schema: `excuse-attachments/{auth.uid()}/{random_uuid}.{ext}`
  * Original user filenames are stripped before storage.

### 5.3 Storage Access Policies (RLS)
```sql
-- Students can only upload to their own folder: <auth.uid()>/<filename>
create policy "student_upload_proof" on storage.objects
for insert with check (
  bucket_id = 'excuse-attachments' and
  auth.uid()::text = (storage.foldername(name))[1]
);

-- Students can read their own uploaded proofs
create policy "student_read_proof" on storage.objects
for select using (
  bucket_id = 'excuse-attachments' and
  auth.uid()::text = (storage.foldername(name))[1]
);

-- Teachers and Admins can view proofs for evaluation
create policy "staff_read_proof" on storage.objects
for select using (
  bucket_id = 'excuse-attachments' and
  (select role from users where id = auth.uid()) in ('teacher', 'admin')
);
```

### 5.4 Signed URL Generation
When an admin or teacher opens an excuse slip for review, the client requests a short-lived **Signed URL** with a 5-minute Time-To-Live (TTL):
```javascript
const { data, error } = await supabase.storage
  .from('excuse-attachments')
  .createSignedUrl(slip.attachment_url, 300); // 300 seconds TTL
```
This ensures private document URLs cannot be harvested, indexed, or shared externally.

---

## 6. Input Validation, Sanitization & Injection Defense

### 6.1 Server-Side Validation Matrix
Never trust client input. All data accepted by Supabase RPCs and Edge Functions undergo strict typing and range validation:

| Data Type | Validation Rule | Enforcement Layer |
|---|---|---|
| **UUIDs** | Standard RFC 4122 UUID v4 regex | PostgreSQL `uuid` type & Edge Functions |
| **Email Addresses** | Valid RFC 5322 format, lowercase sanitized | Supabase Auth & PostgreSQL Check Constraint |
| **Phone Numbers** | Philippine E.164 pattern (`^\+639\d{9}$`) | PostgreSQL Check Constraint & Form Validator |
| **Timestamps** | ISO 8601 UTC string (`timestamptz`) | PostgreSQL `timestamptz` |
| **Enum Fields** | Whitelisted enum string (`role`, `status`, `scan_method`) | PostgreSQL ENUM / Check Constraints |
| **Text Notes** | Stripped of control chars, max length 500 chars | Client validation & Edge Function sanitization |

### 6.2 SQL Injection Prevention
* **Zero Raw SQL:** The frontend communicates strictly via the PostgREST client library and typed PostgreSQL Stored Procedures (RPCs).
* **Automatic Parameterization:** PostgREST automatically binds all query parameters, preventing SQL injection vulnerabilities by design.
* **Least Privilege DB User:** The public `anon` and `authenticated` roles possess only table-level CRUD permissions gated by RLS; DDL privileges (`DROP`, `ALTER`, `CREATE`) are restricted to the administrative migration runner.

### 6.3 Cross-Site Scripting (XSS) Prevention
* **DOM Rendering Rule:** User-supplied data (such as student names, section codes, or excuse notes) must **never** be injected using `innerHTML`.
* **Safe DOM APIs:** Frontend controllers must render text exclusively via `element.textContent`, `element.setAttribute()`, or sanitized DOM node creation routines.
* **Content-Type Enforcement:** All API endpoints and Edge Functions return strict `Content-Type: application/json; charset=utf-8` headers.

---

## 7. SMS Gateway & Parent Privacy Security

Parents and guardians are passive recipients of automated SMS alerts for student tardiness and unexcused absences.

### 7.1 Data Isolation & Parent Channel Security
* **No Web Credentials:** Parents have **no portal accounts, no passwords, and no login access**. They cannot query or modify database records.
* **Mobile Number Privacy:** Parent phone numbers stored in `parent_contacts` are accessible only by authorized registrars and advisory teachers.
* **E.164 Number Validation:** Phone numbers are strictly validated against Philippine cellular patterns (`+639XXXXXXXXX`) before persistence.

### 7.2 SMS Gateway Key Protection
* API keys for SMS providers (Semaphore / Movider) are stored as secure Supabase Vault Secrets / Edge Function environment variables:
  ```bash
  SMS_GATEWAY_API_KEY=smsp_sec_live_9f83b2...
  SMS_GATEWAY_SENDER_NAME=BCP-AMS
  ```
* Keys are **never bundled in client-side JavaScript or public repositories**.
* The outbound SMS dispatcher (`/functions/v1/send-sms-alert`) is called only by internal database webhooks or secure service-role Edge Functions.

### 7.3 Anti-Spam & Cost Control Limits
* **Daily SMS Throttling:** No student profile may trigger more than two automated SMS alerts in a single 24-hour period (one morning tardiness alert + one evening absence alert).
* **Audit Trail:** All dispatched messages are audited in `alerts_log` with status, recipient mobile, message payload, and carrier transaction ID.

---

## 8. Transport Security, Rate Limiting & Network Hardening

### 8.1 Mandatory HTTPS & HSTS
* All browser traffic, camera QR scanning sessions, and ESP32 REST communications are encrypted in transit using **TLS 1.2 / TLS 1.3**.
* HTTP Strict Transport Security (HSTS) enforced on static hosting:
  ```http
  Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
  ```

### 8.2 Content Security Policy (CSP)
Static frontend pages (`/admin/*`, `/teacher/*`, `/student/*`, `/shared/*`) implement a defense-in-depth CSP header:
```http
Content-Security-Policy: default-src 'self';
  script-src 'self' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net;
  style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
  font-src 'self' https://fonts.gstatic.com;
  img-src 'self' data: blob: https://*.supabase.co;
  connect-src 'self' https://*.supabase.co wss://*.supabase.co;
  frame-ancestors 'none';
  base-uri 'self';
  form-action 'self';
```

### 8.3 CORS & Origin Restriction
* Cross-Origin Resource Sharing (CORS) is locked down to authorized institution domains (e.g. `https://ams.bestlink.edu.ph`).
* Unrecognized origins attempting state-changing requests are rejected with HTTP 403 Forbidden.

### 8.4 Application & Ingress Rate Limiting Matrix

| Action / Endpoint | Rate Limit | Time Window | Action on Violation |
|---|---|---|---|
| **User Login** | 5 failed attempts | 15 minutes | Account lockout + IP cooling |
| **ESP32 RFID Tap** | 1 tap per card | 5 minutes | Anti-passback HTTP 429 |
| **Camera QR Fallback Scan** | 60 scans | 1 minute | Scanner UI rate throttle |
| **Excuse Slip Submit** | 10 submissions | 1 hour | Client & Edge Function rejection |
| **CSV / Excel Report Export** | 5 export requests | 10 minutes | Edge Function rate limit |
| **Parent SMS Notification** | 2 alerts / student | 24 hours | Edge Function alert suppression |

---

## 9. Audit Logging & Non-Repudiation

Administrative modifications, manual attendance overrides, credential assignments, and security events are permanently recorded in the append-only `audit_log` table:

```sql
create table audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references users(id),
  action text not null,               -- e.g. 'manual_override', 'approve_excuse_slip', 'export_generated'
  table_name text,                    -- Affected table: 'attendance_logs', 'excuse_slips', etc.
  record_id uuid,                     -- Affected record primary key
  details jsonb,                      -- Structured context snapshot
  created_at timestamptz not null default now()
);

-- Audit log is append-only: Updates and deletes are prohibited for all roles
create policy "audit_log_admin_read" on audit_log
for select using ((select role from users where id = auth.uid()) = 'admin');
```

### 9.1 Audited Event Taxonomy
* **Authentication Events:** Login failure bursts, password resets, forced credential revocations.
* **Attendance Modifications:** Manual teacher overrides, retroactive status corrections, administrator bulk updates.
* **Excuse Slip Workflow:** Slip submissions, approvals, rejections, escalation reviews.
* **Hardware & Registration:** ESP32 device provisioning, RFID card UID assignment or re-assignment.
* **Institutional Reporting:** Generation and export of CSV/Excel institutional attendance records.

### 9.2 Data Retention Policies
* **Audit Logs (`audit_log`):** Retained for a minimum of **2 years** for institutional compliance and capstone audit verification.
* **Attendance Logs (`attendance_logs`):** Retained indefinitely across academic terms; soft deactivation ensures continuous student attendance history.
* **Alert Logs (`alerts_log`):** Retained for **90 days** for carrier delivery verification and cost auditing.

---

## 10. Secrets Management & Key Rotation

### 10.1 Environment Variables & Vault Isolation
* All server-side secrets are stored exclusively in Supabase Vault Secrets and Edge Function environment configurations:
  * `SUPABASE_SERVICE_ROLE_KEY`
  * `SMS_GATEWAY_API_KEY`
  * `DATABASE_URL` / direct database credentials
* **Zero Secrets in Frontend:** The frontend bundle contains only `SUPABASE_URL` and `SUPABASE_ANON_KEY`, both of which are strictly bounded by PostgreSQL RLS.

### 10.2 Secret Rotation Schedule
* **Hardware Scanner Keys (`x-device-key`):** Rotated annually or immediately upon device replacement/loss.
* **SMS Gateway API Keys:** Rotated every 6 months or immediately upon provider security notifications.
* **Database & JWT Secrets:** Managed natively in Supabase Cloud with standard enterprise key rotation lifecycles.

---

## 11. Disaster Recovery & Business Continuity

### 11.1 Backup Architecture
* **Database Backups:** Automated daily PostgreSQL logical snapshots and continuous Point-in-Time Recovery (PITR) WAL archiving managed by Supabase infrastructure.
* **Storage Assets:** Multi-region encrypted object storage replication for uploaded excuse slip proof documents.
* **Source Code:** Version-controlled Git repository with signed commits.

### 11.2 Recovery Metrics
* **RTO (Recovery Time Objective):** Maximum **4 hours** to restore full operational services in the event of an infrastructure outage.
* **RPO (Recovery Point Objective):** Maximum **1 hour** of attendance data loss risk (mitigated to near-zero via WAL streaming).
* **Offline Kiosk Continuity:** In the event of campus WAN interruption, gate camera QR scanners buffer scan events in browser `IndexedDB` and synchronously flush to `/scan-ingest` once network connectivity is re-established.

---

## 12. Pre-Deployment Security Verification Checklist

Before deploying changes to staging or production environments, verify every item:

- [ ] **Row-Level Security:** RLS enabled and tested on all tables (`users`, `attendance_logs`, `excuse_slips`, `scan_devices`, `audit_log`); student cannot query other students' data.
- [ ] **Service Role Key:** Verified that `SUPABASE_SERVICE_ROLE_KEY` is not present in frontend client code or public Git history.
- [ ] **Hardware Ingress:** ESP32 `x-device-key` header verified against SHA-256 hash in `scan_devices.api_key_hash`.
- [ ] **Anti-Passback:** 5-minute cooldown active; repeated card taps within 5 minutes return HTTP `429 Cooldown Active`.
- [ ] **Storage Security:** `excuse-attachments` bucket is private; file uploads strictly restricted to PDF/JPG/PNG under 5MB.
- [ ] **Signed URLs:** Excuse proof attachments viewed exclusively via short-lived signed URLs (TTL <= 300s).
- [ ] **XSS Prevention:** All user-supplied text rendered via `textContent` or sanitized DOM nodes; zero `innerHTML` with untrusted data.
- [ ] **Parent Privacy:** Parent phone numbers stored in E.164 format (`+639XXXXXXXXX`); parents have no web portal or dashboard accounts.
- [ ] **Soft Deactivation:** User deactivation sets `status = 'inactive'`; zero hard-deletes of attendance history.
- [ ] **Audit Trail:** Manual overrides and excuse slip evaluations write structured entries to `audit_log`.
- [ ] **Rate Limiting:** Auth endpoints, QR camera scans, excuse submissions, and export generation enforce defined throttling limits.
- [ ] **HTTPS & Headers:** HSTS and Content Security Policy (CSP) headers active on production hosting.
- [ ] **Backup Verification:** Point-in-Time Recovery (PITR) and daily database snapshot procedures verified.
