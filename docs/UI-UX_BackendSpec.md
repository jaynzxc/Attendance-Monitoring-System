# UI/UX Backend Specification Document

## Attendance Monitoring System (AMS) — Bestlink College of the Philippines
**Subsystem of SMS 1 (School Management System)**  
**Companion Documents:** `UI-UX_Architecture.md`, `ARCHITECTURE.md`, `PRD.md`, `DATA.md`, `WORKFLOW.md`  
**Version:** 1.0  
**Date:** September 26, 2026  
**Status:** Approved Technical Contract  

---

## 1. Overview & Interface Protocol Architecture

This document specifies the exact technical contracts connecting the **AMS Frontend Web Panels (HTML5, Tailwind CSS, Vanilla JS)** with the **Supabase Backend (PostgreSQL, PostgREST, Auth, Realtime, Storage, Edge Functions)** and **ESP32 Edge Hardware**.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                   FRONTEND UI LAYER                                    │
│   • Admin Dashboard (/admin/*)   • Teacher Panel (/teacher/*)  • Student Portal (/student/*) │
└───────────────▲───────────────────────────▲──────────────────────────────▲─────────────┘
                │                           │                              │
         Supabase REST (PostgREST)    Supabase Realtime (WS)       Supabase Storage SDK
                │                           │                              │
┌───────────────▼───────────────────────────▼──────────────────────────────▼─────────────┐
│                                SUPABASE PLATFORM                                       │
│   • PostgreSQL Database (RLS)    • Realtime Change Broadcast   • S3 Storage Buckets     │
│   • Stored Procedures (RPC)      • Edge Functions (Deno/TS)    • Supabase Auth (JWT)    │
└───────────────────────────────────────────▲────────────────────────────────────────────┘
                                            │ HTTPS Ingest (API Key)
                                 ┌──────────┴──────────┐
                                 │ ESP32 RFID Gate/Room │
                                 │ Hardware Scanners   │
                                 └─────────────────────┘
```

---

## 2. Screen-to-Backend State Mapping

### 2.1 Admin Overview Dashboard (`/admin/dashboard.html`)

| UI Component | Data Source | Method / Channel | Query / Function / Payload |
|---|---|---|---|
| **Present Today (KPI)** | `attendance_summary` | PostgREST / RPC | `rpc/fn_get_daily_kpis` → `present_count` |
| **Attendance Rate (KPI)** | Computed from summary | PostgREST / RPC | `rpc/fn_get_daily_kpis` → `attendance_percentage` |
| **Late Today (KPI)** | `attendance_summary` | PostgREST / RPC | `rpc/fn_get_daily_kpis` → `late_count` |
| **Absent Today (KPI)** | `attendance_summary` | PostgREST / RPC | `rpc/fn_get_daily_kpis` → `absent_count` |
| **Attendance Trend (Chart)** | `attendance_summary` | RPC | `rpc/fn_get_5week_trend` |
| **Status Distribution (Bars)**| `attendance_summary` | PostgREST | `select=status,count` grouped for `current_date` |
| **Live Recent Scans (Feed)** | `attendance_logs` | Realtime + Initial REST | Initial: `GET /rest/v1/attendance_logs?select=*,users(first_name,last_name,student_number),sections(name)&order=scanned_at.desc&limit=10`<br>Realtime: `channel('public:attendance_logs:INSERT')` |
| **Sections to Watch (Card)** | `attendance_summary` | RPC | `rpc/fn_get_sections_to_watch?limit=4` |
| **Live Sync Dot** | Realtime socket state | Client Event | `supabase.channel().subscribe((status) => ...)` |

---

### 2.2 Attendance Logs & Filtering Center (`/admin/attendance-logs.html`)

- **Primary Query:**
```javascript
const { data, count, error } = await supabase
  .from('attendance_logs')
  .select(`
    id,
    scanned_at,
    event_type,
    status,
    scan_method,
    users!student_id ( id, first_name, last_name, student_number ),
    sections ( id, name ),
    scan_devices ( id, device_code, location )
  `, { count: 'exact' })
  .eq('section_id', filterSectionId)          // Optional filter
  .eq('status', filterStatus)                  // Optional filter
  .gte('scanned_at', `${filterDate}T00:00:00`)
  .lte('scanned_at', `${filterDate}T23:59:59`)
  .order('scanned_at', { ascending: false })
  .range(page * pageSize, (page + 1) * pageSize - 1);
```

- **Exporting Data (CSV/Excel):**
Calls the Edge Function `/functions/v1/export-attendance` with query parameters. The function streams a MIME-typed `text/csv` or `application/vnd.openxmlformats` response directly to the browser.

---

### 2.3 Excuse Slip Review Center (`/teacher/excuse-slips.html` & `/admin/excuse-slips.html`)

| Operation | Endpoint / Target | Request Payload | Backend Action |
|---|---|---|---|
| **Fetch Queue** | `GET /rest/v1/excuse_slips` | `?status=eq.Pending&select=*,users(first_name,last_name,student_number),sections(name)&order=submitted_at.desc` | Populates pending review queue filtered by Teacher section via RLS |
| **View Attachment** | Supabase Storage Signed URL | `supabase.storage.from('excuse-attachments').createSignedUrl(file_path, 300)` | Generates time-limited (5-min) secure preview URL |
| **Approve Slip** | `POST /rest/v1/rpc/fn_review_excuse_slip` | `{"p_slip_id": "...", "p_action": "Approved", "p_notes": "..."}` | 1. Updates `excuse_slips` row<br>2. Mutates date range in `attendance_summary` to `status = 'excused'`<br>3. Logs to `audit_log` |
| **Reject Slip** | `POST /rest/v1/rpc/fn_review_excuse_slip` | `{"p_slip_id": "...", "p_action": "Rejected", "p_notes": "Insufficient proof"}` | Updates `excuse_slips` row; keeps `attendance_summary` as Absent/Late |

---

### 2.4 Student Submission Portal (`/student/excuse-slip-submit.html`)

```javascript
// Step 1: Upload Attachment to Supabase Storage
const file = fileInput.files[0];
const fileExt = file.name.split('.').pop();
const filePath = `${supabase.auth.user().id}/${Date.now()}.${fileExt}`;

const { error: uploadError } = await supabase.storage
  .from('excuse-attachments')
  .upload(filePath, file, { cacheControl: '3600', upsert: false });

if (uploadError) throw uploadError;

// Step 2: Insert Excuse Slip Record
const { data, error: insertError } = await supabase
  .from('excuse_slips')
  .insert([{
    student_id: supabase.auth.user().id,
    section_id: currentStudentSectionId,
    reason_category: document.getElementById('reasonCategory').value,
    reason: document.getElementById('reasonText').value,
    start_date: document.getElementById('startDate').value,
    end_date: document.getElementById('endDate').value,
    attachment_url: filePath,
    status: 'Pending'
  }]);
```

---

## 3. Remote Procedure Calls (RPC / Stored Procedures)

### 3.1 `fn_get_daily_kpis`
Calculates high-performance aggregated metrics for the overview dashboard in a single round-trip.

```sql
create or replace function fn_get_daily_kpis(p_date date default current_date)
returns json
language plpgsql
security definer
as $$
declare
  v_enrolled int;
  v_present int;
  v_late int;
  v_absent int;
  v_excused int;
  v_rate numeric;
begin
  select count(*) into v_enrolled from users where role = 'student' and status = 'active';

  select 
    count(*) filter (where status = 'present'),
    count(*) filter (where status = 'late'),
    count(*) filter (where status = 'absent'),
    count(*) filter (where status = 'excused')
  into v_present, v_late, v_absent, v_excused
  from attendance_summary
  where summary_date = p_date;

  if (v_present + v_late + v_absent + v_excused) > 0 then
    v_rate := round(((v_present + v_late)::numeric / nullif(v_enrolled, 0)::numeric) * 100, 1);
  else
    v_rate := 0.0;
  end if;

  return json_build_object(
    'total_enrolled', coalesce(v_enrolled, 0),
    'present_today', coalesce(v_present, 0),
    'late_today', coalesce(v_late, 0),
    'absent_today', coalesce(v_absent, 0),
    'excused_today', coalesce(v_excused, 0),
    'attendance_rate', coalesce(v_rate, 0.0)
  );
end;
$$;
```

---

### 3.2 `fn_get_5week_trend`
Produces rolling 5-week historical weekly attendance averages for the Chart.js visualizer.

```sql
create or replace function fn_get_5week_trend()
returns json
language plpgsql
security definer
as $$
declare
  v_result json;
begin
  with weekly_data as (
    select 
      to_char(date_trunc('week', summary_date), 'Mon DD') as week_label,
      date_trunc('week', summary_date) as week_start,
      round(
        (count(*) filter (where status in ('present', 'late'))::numeric / 
        nullif(count(*), 0)::numeric) * 100, 1
      ) as present_rate
    from attendance_summary
    where summary_date >= current_date - interval '35 days'
      and summary_date <= current_date
    group by date_trunc('week', summary_date)
    order by week_start asc
    limit 5
  )
  select json_agg(
    json_build_object(
      'week', week_label,
      'rate', coalesce(present_rate, 0.0)
    )
  ) into v_result
  from weekly_data;

  return coalesce(v_result, '[]'::json);
end;
$$;
```

---

### 3.3 `fn_review_excuse_slip`
Transactional approval/rejection routine with automatic cascading attendance summary updates.

```sql
create or replace function fn_review_excuse_slip(
  p_slip_id uuid,
  p_action text,          -- 'Approved' or 'Rejected'
  p_reviewer_notes text
)
returns json
language plpgsql
security definer
as $$
declare
  v_slip record;
begin
  -- Validate reviewer role
  if not exists (
    select 1 from users 
    where id = auth.uid() and role in ('admin', 'teacher')
  ) then
    raise exception 'Unauthorized to review excuse slips';
  end if;

  select * into v_slip from excuse_slips where id = p_slip_id for update;
  if not found then
    raise exception 'Excuse slip not found';
  end if;

  update excuse_slips
  set 
    status = p_action,
    reviewed_by = auth.uid(),
    reviewed_at = now(),
    reviewer_notes = p_reviewer_notes
  where id = p_slip_id;

  -- If approved, update historical attendance_summary records
  if p_action = 'Approved' then
    update attendance_summary
    set status = 'excused'
    where user_id = v_slip.student_id
      and summary_date between v_slip.start_date and v_slip.end_date
      and status in ('absent', 'late');
  end if;

  -- Record audit log
  insert into audit_log (actor_id, action, target_table, target_id, details)
  values (
    auth.uid(),
    'review_excuse_slip',
    'excuse_slips',
    p_slip_id,
    json_build_object('action', p_action, 'student_id', v_slip.student_id)
  );

  return json_build_object('success', true, 'status', p_action);
end;
$$;
```

---

## 4. Supabase Edge Functions & Hardware Ingress

### 4.1 Ingress API (`/functions/v1/scan-ingest`)
This endpoint receives scan events from ESP32 devices or web camera clients.

- **URL:** `POST https://<project-ref>.supabase.co/functions/v1/scan-ingest`
- **Headers:**
  - `Content-Type: application/json`
  - `x-device-key: <device_secret_token>` (for ESP32 hardware)
  - `Authorization: Bearer <user_jwt>` (if originating from `/shared/qr-scan.html`)

#### Request Payload
```json
{
  "scan_method": "rfid",              // "rfid" | "qr"
  "credential_token": "E2806894",     // RFID Card UID or decoded QR string
  "device_code": "GATE-01-ESP32",     // Device identifier
  "timestamp": "2026-09-26T08:14:22+08:00"
}
```

#### Ingestion Processing Logic
1. **Device Authentication:** Validates `x-device-key` against `scan_devices.api_key_hash`. Rejects with `401 Unauthorized` if invalid.
2. **Credential Resolution:**
   - For `scan_method = "rfid"`: Queries `rfid_cards` where `card_uid = credential_token` and `is_active = true`.
   - For `scan_method = "qr"`: Queries `qr_codes` where `code_value = credential_token` and `is_active = true`.
   - If not found: Inserts audit rejection log, returns `404 Not Found {"error": "unregistered_card"}`.
3. **Anti-Passback (5-Minute Cooldown):**
   - Checks `attendance_logs` for `student_id` within the last 5 minutes.
   - If found: Returns `429 Too Many Requests {"error": "cooldown_active", "retry_after": 180}`.
4. **Time Classification (Present vs. Late):**
   - Compares scan time against section schedule cutoff (e.g., 08:00 AM).
   - If after cutoff: `status = "late"`. Otherwise: `status = "present"`.
   - Determines `event_type`: If no log exists today for user, `event_type = "time_in"`; otherwise, `event_type = "time_out"`.
5. **Persistence:**
   - Inserts row into `attendance_logs`.
   - Updates/Upserts `attendance_summary`.
6. **Async Trigger:** If student is `late`, asynchronously invokes `/functions/v1/send-sms-alert`.

#### Successful Response (`200 OK`)
```json
{
  "success": true,
  "user": {
    "id": "7f13b2c4-3d91-4e89-a9a8-e1b9b1e779a1",
    "name": "Juan Dela Cruz",
    "student_number": "BCP-2024-0012",
    "section": "BSIT 3-1"
  },
  "event_type": "time_in",
  "status": "present",
  "scanned_at": "2026-09-26T07:54:11+08:00"
}
```

---

## 5. Realtime Channels & WebSocket Handlers

The frontend subscribes to PostgreSQL changes via the Supabase Realtime client.

```javascript
// Initialize realtime connection on Admin Overview Dashboard
const dashboardChannel = supabase
  .channel('admin-overview-live')
  .on(
    'postgres_changes',
    {
      event: 'INSERT',
      schema: 'public',
      table: 'attendance_logs'
    },
    async (payload) => {
      // 1. Fetch joined details for user and section
      const { data: logEntry } = await supabase
        .from('attendance_logs')
        .select('*, users(first_name, last_name), sections(name)')
        .eq('id', payload.new.id)
        .single();

      if (logEntry) {
        // 2. Prepend row to UI Recent Scans list
        prependRecentScanRow(logEntry);
        
        // 3. Dynamically increment KPI counter
        incrementKpi(logEntry.status);
        
        // 4. Trigger audio feedback on kiosk view
        playAudioChime(logEntry.status);
      }
    }
  )
  .on(
    'postgres_changes',
    {
      event: 'UPDATE',
      schema: 'public',
      table: 'scan_devices'
    },
    (payload) => {
      // Update hardware gateway status badge (online/offline)
      updateDeviceStatusBadge(payload.new.device_code, payload.new.status);
    }
  )
  .subscribe((status) => {
    const syncDot = document.querySelector('.live-dot');
    if (status === 'SUBSCRIBED') {
      syncDot.style.background = 'var(--present)';
    } else {
      syncDot.style.background = 'var(--absent)';
    }
  });
```

---

## 6. Row-Level Security (RLS) Policy Specifications

Authoritative security is enforced at the PostgreSQL database level using `auth.uid()` and user roles:

| Table | Policy Name | Role Scope | Condition (Using SQL) |
|---|---|---|---|
| `users` | `users_read_all` | Authenticated | `auth.uid() is not null` |
| `users` | `users_write_admin` | Admin | `(select role from users where id = auth.uid()) = 'admin'` |
| `attendance_logs` | `logs_read_admin` | Admin | `(select role from users where id = auth.uid()) = 'admin'` |
| `attendance_logs` | `logs_read_teacher` | Teacher | `section_id in (select section_id from teacher_sections where teacher_id = auth.uid())` |
| `attendance_logs` | `logs_read_student` | Student | `student_id = auth.uid()` |
| `attendance_logs` | `logs_insert_service` | Edge Function / Admin | `(select role from users where id = auth.uid()) = 'admin'` |
| `excuse_slips` | `slips_student_insert` | Student | `student_id = auth.uid()` |
| `excuse_slips` | `slips_teacher_review` | Teacher | `section_id in (select section_id from teacher_sections where teacher_id = auth.uid())` |
| `scan_devices` | `devices_admin_only` | Admin | `(select role from users where id = auth.uid()) = 'admin'` |

---

## 7. Client Error Handling & Graceful Degradation

### 7.1 Error Mapping Matrix

| HTTP Status | Supabase / Backend Code | Cause | Frontend UI Reaction |
|---|---|---|---|
| `401` | `PGRST301` / `JWT_EXPIRED` | Session expired | Display toast: "Session expired. Redirecting...", clear storage, redirect to `/index.html` |
| `403` | `42501` (RLS violation) | Unauthorized action | Block form action, log security warning, redirect to `/shared/unauthorized.html` |
| `404` | `UNREGISTERED_CARD` | Card UID not mapped | Shake input field, play error buzzer, toast: "Unrecognized RFID card. Please register at Registrar." |
| `422` | `23505` (Unique constraint) | Duplicate submission | Toast: "Duplicate entry already recorded." |
| `429` | `COOLDOWN_ACTIVE` | Card tapped within 5 min | Play double-chirp, yellow banner: "Cooldown active. Card already recorded (anti-passback)." |
| `503` | Network / Timeout | Internet drop at gate | Display offline caching warning; buffer scan locally via IndexedDB until reconnection |

### 7.2 Offline Ingress Fallback (IndexedDB Queue)
In the event of temporary campus Wi-Fi interruption, the web camera QR scanner (`/shared/qr-scan.html`) switches to offline queuing mode:
1. Scan events are stored in `IndexedDB: ams_offline_scans`.
2. A persistent top warning bar informs the operator: `"Offline Mode: 14 scans buffered"`.
3. A background service worker polls `navigator.onLine` every 5 seconds.
4. Upon reconnection, buffered records are flushed sequentially with original timestamps to `/scan-ingest`.
