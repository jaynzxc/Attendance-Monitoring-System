# **BESTLINK COLLEGE OF THE PHILIPPINES**

# 1071 Bgy. Kaligayahan, Quirino Hi‑Way, Novaliches, Quezon City **CENTER FOR RESEARCH AND DEVELOPMENT**

**PROTOTYPE / SYSTEM TESTING FORM**

**Program:** Attendance Monitoring System – Capstone  
**Date:** 2026‑11‑11

**Research Adviser:** …  
**Research Title:** Design and Development of an Attendance Monitoring System for Bestlink College of the Philippines with Performance Analytics and RFID/QR Scanning  

**Members:** …  

## **1. System Test Cases & Results**

|**Test ID**|**Feature /<br>Function**|**Expected Outcome**|**Actual Outcome**|**Status**|**Remarks**|
|---|---|---|---|---|---|
|**01**|Student RFID<br>Check‑In|When a registered student taps a valid RFID card before the 08:00 cut‑off, the system records **Present** and creates a realtime entry in `attendance_logs`.|Present recorded, realtime feed updated for Admin/Teacher portals.|Passed|Device **GATE‑01‑ESP32** confirmed; LED green, short beep.|
|**02**|Student QR<br>Fallback Scan|When the student scans a QR code on the web camera fallback, the scan is accepted, mapped to the same student ID, and recorded as **Present**.|QR scan created a matching attendance row; no duplicate RFID entry.|Passed|QR token TTL = 30 s; works on Chrome, Edge.|
|**03**|Teacher RFID<br>Time‑In|Teacher taps RFID; system records **Present** for the teacher shift and makes the entry visible in Teacher dashboard.|Teacher time‑in logged, dashboard shows “In 09:02”.|Passed|Anti‑passback enforced (5 min cooldown).|
|**04**|Teacher RFID<br>Time‑Out|Teacher taps again at end of class; system records **Time‑Out** and computes duty hours.|Time‑Out logged, total hours = 7.5 h.|Passed|Only allowed after a minimum of 4 h on‑site.|
|**05**|Anti‑Passback<br>Cooldown|Attempt a second scan within 5 minutes on the same device; system must reject the scan.|Second scan rejected with error `429 Too Many Requests`; LED red, long beep.|Passed|Cooldown configurable via `attendance_plan`.|
|**06**|SMS Alert – Tardy|Student scans **Late** (after cut‑off). System should dispatch an SMS to the linked parent number.|SMS sent via Semaphore gateway; delivery status = `delivered`.|Passed|Template includes student name, time‑in, and class.|
|**07**|Excuse Slip – Submission|Student uploads an excuse slip (PDF) for an absent day; status changes to **Pending**.|Slip stored in Supabase storage, record created in `excuse_slips` with status `pending`.|Passed|File size limit = 5 MB; PDF preview works.|
|**08**|Excuse Slip – Approval|Teacher reviews pending slip and marks it **Approved**; attendance record updates to **Excused**.|Status updated to `approved`; attendance row status changes to `excused`.|Passed|Audit log entry created (`review_excuse_slip`).|
|**09**|Realtime Dashboard<br>KPIs|Admin dashboard should display live attendance rate, tardy count, and absent count with < 3 s latency.|KPIs refreshed instantly after each scan; latency measured ≈ 1.2 s.|Passed|Supabase Realtime channel active.|
|**10**|Daily Cron<br>Classification|Midnight cron (`compute-daily-status`) must classify all `attendance_logs` of the day into Present/Late/Absent/Excused.|All rows correctly classified; no `null` statuses.|Passed|Verified by querying `attendance_summary` view.|
|**11**|Perfect Attendance<br>Award Engine|Students with zero tardies/absences for the month should appear in the “Perfect Attendance” list.|Student #20230045 listed; award email generated.|Passed|Edge function `compute-awards` executed on the 1st of each month.|
|**12**|Export CSV<br>Attendance Log|Admin clicks “Export CSV”; system should generate a CSV file with all attendance records for a selected range.|CSV generated, download link provided; file contains correct headers and data.|Passed|Export size ≈ 12 KB for 1 day range.|
|**13**|Role‑Based Access<br>RBAC Enforcement|Student should **not** be able to access `/admin/` pages; Teacher can’t view other sections’ data.|Access denied (`403`) for student; teacher sees only assigned sections.|Passed|RLS policies validated with Supabase auth test suite.|
|**14**|Device Deactivation<br>Offline Device|Deactivate scanner `GATE‑02‑ESP32` via Admin UI; subsequent scans should be rejected.|Device returns `403 Device_deactivated`; LED red, long beep.|Passed|Heartbeat flag updated in `scan_devices`.|
|**15**|Session Timeout<br>Inactivity Logout|User idle > 15 min; session should expire and redirect to login page.|Session terminated, user redirected; subsequent API calls return `401`.|Passed|SessionGuard idle timer works.|
|---|---|---|---|---|---|

## **2. Defect / Issue Log**

|**Issue ID**|**Bug / Issue Description**|**Severity**|**Corrective Action**|**Status**|
|---|---|---|---|---|
|01|**Duplicate Scan Acceptance** – The anti‑passback cooldown was not enforced on the `scan‑ingest` Edge Function for certain `device_id`s.|High|Add a check in `scan‑ingest/index.ts` to query the last scan timestamp for the same `card_uid` and reject if within 5 min; return `429`.|Resolved|
|02|**QR Token Expiration** – QR session tokens sometimes remained valid beyond the 30‑second TTL, allowing reuse.|Medium|Implement a cleanup job that runs every minute to purge expired tokens from `attendance_sessions`.|Resolved|
|03|**SMS Gateway Rate‑Limit** – Burst of tardy alerts (≥ 200 in < 1 min) caused Semaphore API to return `429 Too Many Requests`.|Medium|Introduce a rate‑limiting buffer in `send-sms-alert` Edge Function (max 100 msgs/min) and retry logic.|In‑Progress|
|04|**Excuse Slip Upload Failure** – PDF files with embedded fonts > 2 MB caused Supabase storage upload to fail silently.|Low|Add client‑side file size validation and display an error toast before upload.|Resolved|
|05|**Incorrect Role Mapping** – Teachers could view attendance logs of sections they are not assigned to due to a missing join condition in the RLS policy.|High|Update `teacher_scoped_attendance` policy to include `section_id IN (SELECT section_id FROM teacher_sections WHERE teacher_id = auth.uid())`.|Resolved|
|06|**Realtime Feed Lag** – Occasionally the Admin live‑scan stream lagged by up to 10 seconds during peak load.|Medium|Optimize the `attendance_logs` subscription to use a materialized view (`attendance_live_view`) and lower the publish interval.|In‑Progress|
|07|**Incorrect Date Formatting** – Dates displayed in the Student attendance calendar used locale‑dependent format causing UI jitter.|Low|Force ISO‑8601 (`YYYY‑MM‑DD`) format with Tailwind `font-variant-numeric: tabular-nums`.|Resolved|
|---|---|---|---|---|

### **Overall System Status:**  
- [ ] Approved without Modifications  
- [ ] Approved subject to Minor Revisions  
- [ ] Major Revisions Required (Re‑test)  

### **Verified / Conformed by:**  

**_____________________________________ Technical Adviser**
