---
name: ams-security
description: Enforce zero-trust security, PostgreSQL Row-Level Security (RLS) policies, ESP32 hardware authentication, anti-passback cooldowns, credential isolation, and input sanitization for the Bestlink College Attendance Monitoring System. Use when writing database queries, creating migrations, defining authentication flows, configuring storage buckets, implementing scan ingestion endpoints, or rendering user-facing DOM nodes.
---

# AMS Security Skill

This skill enforces zero-trust security and defense-in-depth for the **Bestlink College of the Philippines Attendance Monitoring System (AMS)** across Supabase, PostgreSQL, ESP32 hardware, and frontend panels.

## Instructions

### Step 1: Enforce Row-Level Security (RLS) as Authoritative Boundary
- Never rely solely on client-side role checks (`rbac-guard.js`) for authorization.
- Verify that every PostgreSQL table has RLS explicitly enabled:
  ```sql
  alter table <table_name> enable row level security;
  ```
- Use `auth.uid()` and strict role checks in policies:
  - **Students:** Restricted to own records (`student_id = auth.uid()`).
  - **Teachers:** Scoped strictly to assigned sections via `teacher_sections`.
  - **Admins:** Global administrative access.
- Consult [`docs/Security.md`](file:///c:/Users/ADMIN/OneDrive/Desktop/Attendance%20Monitoring%20System%20%28SMS%201%29/Attendance-Monitoring-System/docs/Security.md) §3 for authoritative policy definitions.

### Step 2: Protect Secrets & Prevent Key Leaks
- **Zero Service-Role Leaks:** NEVER expose `SUPABASE_SERVICE_ROLE_KEY` in frontend HTML, JavaScript, or public repositories.
- Frontend clients must only use the public `anon` key, relying on RLS for data protection.
- SMS API keys (Semaphore / Movider) and database service credentials must reside exclusively in Supabase Vault / Edge Function environment variables.

### Step 3: Enforce Hardware Ingress & Anti-Passback Defense
- Validate incoming ESP32 requests using SHA-256 hashed API keys (`x-device-key`) checked against `scan_devices.api_key_hash`.
- Enforce the **5-minute anti-passback cooldown window** in `/functions/v1/scan-ingest`:
  ```sql
  -- Reject duplicate tap within 5 minutes
  if exists (
    select 1 from attendance_logs 
    where student_id = v_student_id 
      and scanned_at >= now() - interval '5 minutes'
  ) then
    return http_response(429, '{"error": "cooldown_active"}');
  end if;
  ```
- Ensure hardware optical/piezo feedback completes in **<300ms**.

### Step 4: Secure File Uploads in Supabase Storage
- Bucket `excuse-attachments` must be set to **Private** (no public access).
- Whitelist file extensions to `.pdf`, `.jpg`, `.jpeg`, and `.png` with a 5 MB maximum size limit.
- Store proofs under `<student_id>/<uuid_or_timestamp>.<ext>`.
- View proofs exclusively via short-lived signed URLs with a maximum 300-second TTL:
  ```javascript
  supabase.storage.from('excuse-attachments').createSignedUrl(path, 300);
  ```

### Step 5: Preserve Historical Data Integrity
- Deactivating students or teachers must execute soft deactivation:
  ```sql
  update users set status = 'inactive' where id = p_user_id;
  ```
- NEVER execute hard deletes (`DELETE FROM users`) to preserve historical attendance integrity.

### Step 6: Verify Immutable Audit Trails
- Log all manual overrides, excuse slip approvals/rejections, and settings modifications to the `audit_log` table (`table_name`, `record_id`, `actor_id`, `action`, `details`).
- Verify `audit_log` is strictly append-only (no `UPDATE` or `DELETE` policies permitted).
- Adhere to the retention rule: audit logs are retained for at least 2 years.

### Step 7: Enforce DOM Sanitization & XSS Prevention
- Never inject user-supplied strings (student names, excuse reasons, section names) via `innerHTML`.
- Render dynamic text exclusively through `element.textContent`, `element.setAttribute()`, or sanitized DOM node creation routines.
- Strictly adhere to Content Security Policy (CSP) guidelines defined in [`docs/Security.md`](file:///c:/Users/ADMIN/OneDrive/Desktop/Attendance%20Monitoring%20System%20%28SMS%201%29/Attendance-Monitoring-System/docs/Security.md) §8.2.

### Step 8: Apply Rate Limiting & Abuse Prevention
- Enforce the rate limiting matrix from [`docs/Security.md`](file:///c:/Users/ADMIN/OneDrive/Desktop/Attendance%20Monitoring%20System%20%28SMS%201%29/Attendance-Monitoring-System/docs/Security.md) §8.4:
  - **Login:** 5 failed attempts &rarr; 15-minute lockout.
  - **Scan Ingest:** 5-minute cooldown (HTTP 429).
  - **QR Camera Scans:** 60 scans/min throttle.
  - **Excuse Slips:** 10 submissions/hour limit.
  - **Report Exports:** 5 export requests/10 minutes limit.
