---
name: ingress-testing
description: Simulate and verify ESP32 RFID and camera QR attendance ingress endpoints, device authentication headers, anti-passback cooldowns, and optical/audio feedback contracts without physical hardware. Use when developing or testing the Supabase scan-ingest Edge Function, debugging ingress payloads, or validating scanner latency.
---

# Ingress Testing & Hardware Simulation Skill

This skill defines the testing protocols and headless simulation procedures for the **Bestlink College of the Philippines Attendance Monitoring System (AMS)** ingress subsystem. It allows developers to validate RFID card taps, camera QR scans, device authentication, and anti-passback constraints via direct API requests (`curl`, PowerShell, or Node scripts) without requiring physical ESP32 microcontroller hardware.

---

## Instructions

### Step 1: Ingress Endpoint & Authentication Contract
The primary ingestion gateway is the Supabase Edge Function `/functions/v1/scan-ingest`.

* **Endpoint URL:** `https://<supabase-project-ref>.supabase.co/functions/v1/scan-ingest`
* **Method:** `POST`
* **Content-Type:** `application/json`
* **Authentication Header:** `x-device-key: <RAW_DEVICE_API_KEY>` (the server validates this key against `scan_devices.api_key_hash` using SHA-256).

Verify device rejection when sending invalid or missing keys:
```bash
# Expect HTTP 401 Unauthorized
curl -X POST "https://<supabase-project-ref>.supabase.co/functions/v1/scan-ingest" \
  -H "Content-Type: application/json" \
  -H "x-device-key: invalid-dummy-key" \
  -d '{"device_id": "gate-scanner-01", "card_id": "RFID_001", "scan_method": "rfid"}'
```

---

### Step 2: Simulating On-Time Student RFID Ingress (Present)
Submit a valid RFID card ID registered to an active student prior to or at the schedule cutoff (e.g., 08:00 AM):

```bash
curl -X POST "https://<supabase-project-ref>.supabase.co/functions/v1/scan-ingest" \
  -H "Content-Type: application/json" \
  -H "x-device-key: <VALID_DEVICE_KEY>" \
  -d '{
    "device_id": "gate-scanner-01",
    "card_id": "STU_RFID_1001",
    "scan_method": "rfid"
  }'
```

**Expected Response (HTTP 200 OK):**
```json
{
  "status": "success",
  "user_type": "student",
  "attendance_status": "present",
  "student_id": "uuid-here",
  "student_name": "Juan Dela Cruz",
  "section_name": "BSIT-4A",
  "feedback": {
    "led": "green",
    "beeps": 1
  }
}
```
* **Verification:** Confirm that an `attendance_logs` record is inserted with `status = 'present'`, and the Admin Realtime listener fires.

---

### Step 3: Simulating Tardy Student RFID Ingress (Late)
Submit a valid RFID card ID registered to an active student past the schedule cutoff:

**Expected Response (HTTP 200 OK):**
```json
{
  "status": "success",
  "user_type": "student",
  "attendance_status": "late",
  "student_id": "uuid-here",
  "student_name": "Maria Santos",
  "section_name": "BSIT-4A",
  "minutes_late": 15,
  "feedback": {
    "led": "amber",
    "beeps": 2
  }
}
```
* **Verification:** Confirm that `attendance_logs` status is `'late'` and that an automated SMS dispatch job is queued in `alerts_log` for parent notification.

---

### Step 4: Simulating Anti-Passback Cooldown Violation
Submit the exact same `card_id` within 5 minutes of the previous tap:

```bash
# Execute within 5 minutes of the prior scan
curl -X POST "https://<supabase-project-ref>.supabase.co/functions/v1/scan-ingest" \
  -H "Content-Type: application/json" \
  -H "x-device-key: <VALID_DEVICE_KEY>" \
  -d '{
    "device_id": "gate-scanner-01",
    "card_id": "STU_RFID_1001",
    "scan_method": "rfid"
  }'
```

**Expected Response (HTTP 429 Too Many Requests):**
```json
{
  "status": "error",
  "error": "cooldown_active",
  "message": "Scan rejected. 5-minute anti-passback cooldown is active.",
  "feedback": {
    "led": "yellow",
    "beeps": 3
  }
}
```
* **Verification:** Confirm that **no duplicate row** is inserted into `attendance_logs`.

---

### Step 5: Simulating Teacher Time-In & Time-Out Lifecycle
Submit an RFID or QR tap for a registered faculty member:

1. **First Tap of Shift (Time-In):**
   ```json
   {
     "status": "success",
     "user_type": "teacher",
     "action": "time_in",
     "attendance_status": "present",
     "teacher_name": "Prof. Alan Turing",
     "feedback": {
       "led": "green",
       "beeps": 1
     }
   }
   ```
2. **Second Tap (Time-Out, after 5-minute cooldown):**
   ```json
   {
     "status": "success",
     "user_type": "teacher",
     "action": "time_out",
     "hours_rendered": 8.0,
     "teacher_name": "Prof. Alan Turing",
     "feedback": {
       "led": "blue",
       "beeps": 1
     }
   }
   ```
* **Verification:** Check `/admin/teacher-attendance.html` and `/teacher/my-logs.html` to confirm both timestamps are recorded for payroll duty calculations.

---

### Step 6: Simulating Camera QR Fallback Ingress
When physical RFID fails or the camera scanner (`/shared/qr-scan.html`) is used:

```bash
curl -X POST "https://<supabase-project-ref>.supabase.co/functions/v1/scan-ingest" \
  -H "Content-Type: application/json" \
  -H "x-device-key: <VALID_DEVICE_KEY>" \
  -d '{
    "device_id": "kiosk-camera-01",
    "card_id": "QR_ENCRYPTED_OR_BASE64_TOKEN",
    "scan_method": "qr"
  }'
```
* **Verification:** Confirm that `attendance_logs` specifies `scan_method = 'qr'` rather than `'rfid'`.

---

### Step 7: Edge Case & Security Rejections Matrix

| Test Scenario | Request Payload Characteristic | Expected HTTP Status | Expected JSON / Feedback |
|---|---|---|---|
| **Unregistered Card** | `card_id: "UNKNOWN_CARD_999"` | `404 Not Found` | `{"error": "card_not_found"}`, Red LED + Continuous Buzzer |
| **Inactive / Suspended User** | `card_id` belonging to `status = 'inactive'` user | `403 Forbidden` | `{"error": "user_inactive"}`, Red LED + Buzzer |
| **Missing Required Field** | Payload missing `card_id` or `device_id` | `400 Bad Request` | `{"error": "invalid_payload"}` |
| **Deactivated Device** | `device_id` where `scan_devices.status = 'inactive'` | `403 Forbidden` | `{"error": "device_disabled"}` |
| **Ingress Latency Benchmark** | Measure total round-trip time (RTT) | `< 300 ms` | Fast optical/sound confirmation at gate |

