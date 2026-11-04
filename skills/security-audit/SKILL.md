---
name: security-audit
description: Verify PostgreSQL Row-Level Security (RLS) policies, cross-role data isolation, secret isolation, private storage access, and immutable audit logging for the Bestlink College Attendance Monitoring System. Use when auditing the database, preparing answers for oral defense questions on security and privacy, or verifying that client-side credentials remain uncompromised.
---

# Security Audit & RLS Verification Skill

This skill defines the verification procedures to audit and prove zero-trust database security, role isolation, and secret protection for the **Bestlink College of the Philippines Attendance Monitoring System (AMS)**. It equips developers with concrete SQL queries and scripts to demonstrate compliance during faculty and panel evaluations.

---

## Instructions

### Step 1: PostgreSQL Row-Level Security (RLS) Status Verification
Ensure that every table in the public schema has Row-Level Security explicitly enabled. Run the following diagnostic query in the Supabase SQL Editor:

```sql
SELECT 
  tablename,
  rowsecurity AS rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename ASC;
```

**Pass Criteria:**
* Every application table (`attendance_logs`, `attendance_summary`, `excuse_slips`, `sections`, `users`, `scan_devices`, `school_holidays`, `audit_log`, `award_qualifications`, `parent_contacts`) must return `rls_enabled = true`.
* If any table displays `false`, immediately flag and execute:
  ```sql
  ALTER TABLE public.<table_name> ENABLE ROW LEVEL SECURITY;
  ```

---

### Step 2: Cross-User Data Isolation Verification (Student Scope)
Verify that a student authenticated with `auth.uid()` cannot read or modify records belonging to other students.

1. **Verify `attendance_logs` Policy:**
   ```sql
   -- Students may only read their own scan records
   CREATE POLICY "student_read_own_logs" ON public.attendance_logs
   FOR SELECT
   TO authenticated
   USING (student_id = auth.uid());
   ```
2. **Audit Check via Supabase Client (Simulated Student):**
   * Authenticate as `student_user_A`.
   * Attempt to query: `supabase.from('attendance_logs').select('*')`.
   * **Expected:** The returned array must only contain rows where `student_id == student_user_A.id`. No records from other students are returned.
   * Attempt to update an attendance row: `supabase.from('attendance_logs').update({ status: 'present' }).eq('id', 'some-other-id')`.
   * **Expected:** The update is rejected by RLS (0 rows affected or permission denied).

---

### Step 3: Teacher Section Scoping Verification
Verify that a teacher can only access attendance records and excuse slips for sections they are officially assigned to:

1. **Audit Check on `excuse_slips`:**
   * A teacher assigned to `BSIT-4A` must only see pending excuse slips where `students.section_id` belongs to `BSIT-4A`.
   * Attempting to query or approve an excuse slip for `BSIT-4B` must return an empty set or be rejected by PostgreSQL policy:
   ```sql
   CREATE POLICY "teacher_read_assigned_section_slips" ON public.excuse_slips
   FOR SELECT
   TO authenticated
   USING (
     EXISTS (
       SELECT 1 FROM public.teacher_sections ts
       JOIN public.users u ON u.section_id = ts.section_id
       WHERE ts.teacher_id = auth.uid()
         AND u.id = excuse_slips.student_id
     )
   );
   ```

---

### Step 4: Secret Isolation & Frontend Key Leak Audit
Scan the entire repository to confirm that no `SUPABASE_SERVICE_ROLE_KEY` or sensitive credentials exist in client-accessible frontend code:

1. Run a repository-wide text scan across frontend directories:
   ```powershell
   Get-ChildItem -Path ./assets, ./admin, ./teacher, ./student, ./shared, ./index.html -Recurse -File | 
     Select-String -Pattern "service_role", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.*"
   ```
2. **Pass Criteria:** Zero matches found in frontend files.
3. Confirm that frontend JavaScript (`assets/js/lib/supabase-client.js`) imports only the public `anon` key. All administrative mutations requiring elevated rights must be executed via authenticated RPCs or Edge functions with proper `auth.uid()` checks.

---

### Step 5: Private Storage Bucket Access Audit (`excuse-attachments`)
Verify that student medical certificates and excuse attachments are protected from public internet access:

1. In Supabase Dashboard $\rightarrow$ Storage: Confirm `excuse-attachments` bucket has **Public Bucket = false**.
2. Attempt to open a direct object URL without a signed token in a browser:
   - `https://<project-ref>.supabase.co/storage/v1/object/public/excuse-attachments/<student-id>/proof.pdf`
   - **Expected:** `HTTP 400 Bad Request` or `HTTP 403 AccessDenied`.
3. Verify that the frontend calls `createSignedUrl` with an expiration $\le$ 300 seconds (5 minutes):
   ```javascript
   const { data, error } = await supabase.storage
     .from('excuse-attachments')
     .createSignedUrl(attachmentPath, 300);
   ```

---

### Step 6: Immutable Audit Log Verification
Verify that the `audit_log` table cannot be tampered with or deleted by anyone, including administrators:

```sql
-- Check policies on audit_log
SELECT policyname, cmd FROM pg_policies WHERE tablename = 'audit_log';
```
* **Pass Criteria:**
  * Only `INSERT` (for recording actions) and `SELECT` (for viewing audit history) policies exist.
  * There must be **ZERO** `UPDATE` or `DELETE` policies for any role.
* Test execution in SQL Editor:
  ```sql
  -- Attempt delete
  DELETE FROM public.audit_log WHERE id IS NOT NULL;
  -- Expected: ERROR: new row violates row-level security policy OR permission denied
  ```

---

### Step 7: Soft Delete Integrity Verification
Confirm that student or teacher deactivation preserves historical attendance records:

1. Check user deactivation procedure:
   ```sql
   UPDATE public.users SET status = 'inactive' WHERE id = '<target_id>';
   ```
2. Confirm that past rows in `attendance_logs` and `attendance_summary` for that user remain intact and readable in historical reporting (`/admin/reports.html`).
3. Confirm that direct `DELETE FROM public.users` is blocked by database foreign key constraints (`ON DELETE RESTRICT`) or RLS policies.

