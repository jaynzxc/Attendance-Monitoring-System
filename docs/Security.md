# System Security Specification (`Security.md`)

## Attendance Monitoring System (AMS) — Bestlink College of the Philippines
**Subsystem of SMS 1 (School Management System)**  
**Target Path:** `docs/Security.md`  
**Companion Documents:** `PRD.md`, `ARCHITECTURE.md`, `DATA.md`, `WORKFLOW.md`, `UI-UX_BackendSpec.md`  
**Version:** 2.0  
**Date:** September 26, 2026  
**Status:** Approved Security Architecture  

---

## 1. Threat Model & Risk Assessment

The Attendance Monitoring System handles institutional identity, gate physical security, academic records, and parent communications. Threats are classified using the **STRIDE** methodology (Spoofing, Tampering, Repudiation, Information Disclosure, Denial of Service, Elevation of Privilege):

| Threat Category | Specific System Threat | Likelihood | Impact | Architectural Mitigation |
|---|---|---|---|---|
| **Spoofing** | Replaying or cloning RFID card UIDs at ESP32 scanners | Medium | High | Anti-passback 5-min cooldown, physical security presence at gates, camera QR fallback with dynamic session tokens. |
| **Spoofing** | Spoofing ESP32 scan ingestion HTTP requests | High | Critical | Hardened API key authentication (`x-device-key`) verified via SHA-256 hashes against `scan_devices.api_key_hash`. |
| **Tampering** | Unauthorized modification of attendance logs or summary status | Medium | Critical | PostgreSQL Row-Level Security (RLS) enforcing read-only access for students and section-only access for teachers. |
| **Tampering** | SQL Injection via form fields or query parameters | Low | Critical | Automatic parameterization via PostgREST and typed PostgreSQL Stored Procedures (RPCs). No raw concatenated SQL. |
| **Repudiation** | User denies tapping card or teacher denies manual override | Medium | Medium | Immutable `audit_log` records with timestamps, reviewer user IDs, device codes, and original scan methods (`rfid`, `qr`, `manual`). |
| **Information Disclosure** | Exposure of student PII, card UIDs, or parent phone numbers | Medium | High | RLS column and row restrictions; public `anon` key permissions locked down; sensitive fields excluded from client queries. |
| **Information Disclosure** | Leaking Supabase `service_role` secret keys | Low | Catastrophic | `service_role` keys strictly confined to server-side Edge Functions; frontend uses only public `anon` key subject to RLS. |
| **Denial of Service** | Card bouncing (rapid multiple taps) causing duplicate logs | High | Medium | Server-side 5-minute anti-passback cooldown window rejecting repeated scans with HTTP `429 Cooldown Active`. |
| **Denial of Service** | Gate Wi-Fi disconnection blocking ingress flow | Medium | High | Offline camera QR scanner with client-side `IndexedDB` caching that flushes automatically upon reconnection. |
| **Elevation of Privilege** | Student modifying client-side role in browser storage to access Admin | High | Critical | Zero-trust architecture: Client-side role checks (`rbac-guard.js`) are UX only; Supabase RLS enforces `auth.uid()` at DB level. |

---

## 2. Authentication & Identity Lifecycle

The AMS authentication architecture is backed by **Supabase Auth (GoTrue)** issuing cryptographically signed JSON Web Tokens (JWT).

```
┌─────────────────────────────────┐
│ Client (Browser / Mobile)       │
└────────────────┬────────────────┘
                 │ 1. POST /auth/v1/token {email, password}
┌────────────────▼────────────────┐
│ Supabase Auth (GoTrue)          │ ──► Validates bcrypt hash
└────────────────┬────────────────┘
                 │ 2. Issues JWT (Access Token 1hr) + Refresh Token
┌────────────────▼────────────────┐
│ Postgres Database (PostgREST)   │ ──► Extracts auth.uid() & evaluates RLS policies
└─────────────────────────────────┘
```

### 2.1 Password Security Policy
* Minimum 8 characters; at least one uppercase letter, one lowercase letter, one numeric digit, and one special character.
* Hashed using **bcrypt** (cost factor 10+) or **Argon2id** managed natively by Supabase Auth.
* Password reset requests trigger secure time-limited email magic links with token expiration within 15 minutes.
* Administrative password reset forces password change on initial login.

### 2.2 Token Management & Session Invalidation
* **Access Tokens (JWT):** Short-lived (3,600 seconds / 1 hour) containing `sub` (`auth.uid()`), `email`, `role`, and expiration timestamps.
* **Refresh Tokens:** Stored in secure `localStorage` or `HttpOnly` cookies, automatically rotated on every refresh request.
* **Session Termination:** Logging out invalidates the current session token family. Password changes immediately invalidate all active sessions across all devices.

### 2.3 Hardware Scanner Authentication (ESP32)
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

Authoritative security is enforced inside PostgreSQL via **Row-Level Security (RLS)**. Even if an attacker compromises client-side JavaScript or issues raw HTTP requests to PostgREST, RLS policies discard unauthorized queries.

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
  status = 'Pending'
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
```

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
* **Access Mode:** Private (Public read access disabled).
* **Storage Limit:** Maximum 5 MB per file.
* **Allowed MIME Types:** Strictly whitelisted:
  * `application/pdf` (`.pdf`)
  * `image/jpeg` (`.jpg`, `.jpeg`)
  * `image/png` (`.png`)
* Executable file types (`.exe`, `.bat`, `.sh`, `.php`, `.js`, `.html`) are rejected by bucket configuration.

### 5.2 Storage Access Policies (RLS)
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

### 5.3 Signed URL Generation
When an admin or teacher opens an excuse slip for review, the client requests a short-lived **Signed URL** with a 5-minute Time-To-Live (TTL):
```javascript
const { data, error } = await supabase.storage
  .from('excuse-attachments')
  .createSignedUrl(slip.attachment_url, 300); // 300 seconds TTL
```
This ensures private document URLs cannot be harvested or shared externally.

---

## 6. SMS Gateway & Parent Privacy Security

Parents and guardians are passive recipients of automated SMS alerts for student tardiness and unexcused absences.

### 6.1 Data Isolation & Parent Channel Security
* **No Web Credentials:** Parents have **no portal accounts, no passwords, and no login access**. They cannot query or modify database records.
* **Mobile Number Privacy:** Parent phone numbers stored in `parent_contacts` are accessible only by authorized registrars and advisory teachers.
* **E.164 Number Validation:** Phone numbers are strictly validated against Philippine cellular patterns (`+639XXXXXXXXX`) before persistence.

### 6.2 SMS Gateway Key Protection
* API keys for SMS providers (Semaphore / Movider) are stored as secure Supabase Vault Secrets / Edge Function environment variables:
  ```bash
  SMS_GATEWAY_API_KEY=smsp_sec_live_9f83b2...
  SMS_GATEWAY_SENDER_NAME=BCP-AMS
  ```
* Keys are **never bundled in client-side JavaScript or public repositories**.
* The outbound SMS dispatcher (`/functions/v1/send-sms-alert`) is called only by internal database webhooks or secure service-role Edge Functions.

### 6.3 Anti-Spam & Cost Control Limits
* Daily SMS throttling: No student profile may trigger more than two automated SMS alerts in a single 24-hour period (one morning tardiness alert + one evening absence alert).
* All dispatched messages are audited in `alerts_log` with status, recipient mobile, message payload, and carrier transaction ID.

---

## 7. Transport Security & Network Hardening

### 7.1 Mandatory HTTPS & HSTS
* All browser traffic, camera QR scanning sessions, and ESP32 REST communications are encrypted in transit using **TLS 1.2 / TLS 1.3**.
* HTTP Strict Transport Security (HSTS) enforced on static hosting:
  ```http
  Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
  ```

### 7.2 Content Security Policy (CSP)
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

---

## 8. Audit Logging & Non-Repudiation

Administrative modifications, manual attendance overrides, and credential assignments are permanently recorded in the append-only `audit_log` table:

```sql
create table audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references users(id),
  action text not null,               -- e.g. 'manual_override', 'approve_excuse_slip'
  target_table text not null,         -- e.g. 'attendance_logs', 'excuse_slips'
  target_id uuid,
  details jsonb,                      -- metadata snapshot
  ip_address text,
  created_at timestamptz not null default now()
);

-- Audit log is append-only: No updates or deletes permitted
create policy "audit_log_immutable" on audit_log
for select using ((select role from users where id = auth.uid()) = 'admin');
```

---

## 9. Pre-Deployment Security Verification Checklist

Before deploying changes to staging or production environments, verify the following:

- [ ] **Row-Level Security:** RLS enabled and tested on all tables; student cannot query other students' data.
- [ ] **Service Role Key:** Verified that `SUPABASE_SERVICE_ROLE_KEY` is not present in frontend code or Git history.
- [ ] **Hardware Ingress:** ESP32 `x-device-key` header checked against SHA-256 hash in database.
- [ ] **Anti-Passback:** 5-minute cooldown active; repeated card taps return HTTP 429.
- [ ] **Storage Security:** `excuse-attachments` bucket is private; file uploads restricted to PDF/JPG/PNG under 5MB.
- [ ] **Signed URLs:** Excuse proof attachments viewed exclusively via short-lived signed URLs (TTL <= 300s).
- [ ] **Parent Privacy:** Parent phone numbers stored in E.164 format; SMS gateway credentials stored in Supabase secrets.
- [ ] **Soft Deactivation:** User deactivation sets `status = 'inactive'`; zero hard-deletes of attendance history.
- [ ] **Audit Trail:** Manual overrides and excuse slip reviews write structured entries to `audit_log`.
