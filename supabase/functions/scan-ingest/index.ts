// Bestlink College of the Philippines — Attendance Monitoring System (AMS)
// Edge Function: scan-ingest
// Unified RFID & QR Ingress Ingestion Endpoint with Anti-Passback & Device Auth
// Authoritative Reference: docs/Security.md §4, docs/WORKFLOW.md §2, docs/DB_E2E_WORKFLOW.md

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-device-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Helper: Compute SHA-256 hash as hexadecimal string
async function sha256Hex(str: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

serve(async (req: Request) => {
  // 1. Handle CORS Preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const startTime = Date.now();

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error("[AMS Scan Ingest] Missing Supabase environment configuration.");
      return new Response(
        JSON.stringify({ error: "Server configuration error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Elevated client using service-role key for hardware ingestion & RLS bypass
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 2. Parse Scan Payload
    const payload = await req.json();
    const {
      device_code = "GATE-01-ESP32",
      scan_method = "rfid", // 'rfid' or 'qr'
      card_uid,
      qr_code,
      scanned_at = new Date().toISOString(),
      is_offline_sync = false,
    } = payload;

    if (!card_uid && !qr_code) {
      return new Response(
        JSON.stringify({ error: "missing_credential", message: "Either card_uid or qr_code is required." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Hardware Device Authentication
    const deviceKeyHeader = req.headers.get("x-device-key");
    let authenticatedDeviceId: string | null = null;
    let deviceLocation = "Main Campus Gate";

    if (deviceKeyHeader) {
      const hashedKey = await sha256Hex(deviceKeyHeader.trim());
      const { data: device, error: devErr } = await supabase
        .from("scan_devices")
        .select("id, device_code, location, status")
        .eq("api_key_hash", hashedKey)
        .single();

      if (devErr || !device) {
        console.warn(`[AMS Scan Ingest] Unauthorized device access attempt with key hash: ${hashedKey.slice(0, 10)}...`);
        return new Response(
          JSON.stringify({ error: "unauthorized_device", message: "Invalid or unregistered device key." }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (device.status === "offline") {
        return new Response(
          JSON.stringify({ error: "device_deactivated", message: "Scanner has been set offline by administration." }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      authenticatedDeviceId = device.id;
      deviceLocation = device.location;

      // Update heartbeat asynchronously
      supabase
        .from("scan_devices")
        .update({ last_heartbeat: new Date().toISOString() })
        .eq("id", device.id)
        .then();
    } else {
      // Check for authenticated staff bearer token (e.g., QR fallback camera scanned by teacher)
      const authHeader = req.headers.get("authorization");
      if (!authHeader) {
        return new Response(
          JSON.stringify({ error: "missing_auth", message: "Missing x-device-key or Authorization Bearer header." }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      // If authorization header provided, verify staff session
      const { data: { user: staffUser }, error: userErr } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
      if (userErr || !staffUser) {
        return new Response(
          JSON.stringify({ error: "invalid_token", message: "Invalid authorization token." }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // 4. Resolve Credential to User Identity (Student or Teacher)
    let targetUserId: string | null = null;

    if (scan_method === "rfid" && card_uid) {
      const cleanUid = card_uid.trim().toUpperCase();
      const { data: cardRow, error: cardErr } = await supabase
        .from("rfid_cards")
        .select("user_id, is_active")
        .eq("card_uid", cleanUid)
        .eq("is_active", true)
        .maybeSingle();

      if (cardErr || !cardRow) {
        console.warn(`[AMS Scan Ingest] Unregistered RFID card tapped: ${cleanUid}`);
        return new Response(
          JSON.stringify({
            error: "unregistered_card",
            card_uid: cleanUid,
            message: "RFID card not recognized or inactive in AMS.",
          }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      targetUserId = cardRow.user_id;
    } else if (scan_method === "qr" && qr_code) {
      const cleanQr = qr_code.trim();
      const { data: qrRow, error: qrErr } = await supabase
        .from("qr_codes")
        .select("user_id, is_active")
        .eq("code_value", cleanQr)
        .eq("is_active", true)
        .maybeSingle();

      if (qrErr || !qrRow) {
        return new Response(
          JSON.stringify({
            error: "unregistered_qr",
            message: "QR code token not recognized or expired.",
          }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      targetUserId = qrRow.user_id;
    }

    if (!targetUserId) {
      return new Response(
        JSON.stringify({ error: "user_not_resolved", message: "Could not link credential to user." }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 5. Fetch Full User Profile & Role
    const { data: userProfile, error: profileErr } = await supabase
      .from("users")
      .select("id, role, first_name, last_name, email, student_number, employee_number, section_id, status")
      .eq("id", targetUserId)
      .single();

    if (profileErr || !userProfile) {
      return new Response(
        JSON.stringify({ error: "profile_not_found", message: "User account does not exist." }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (userProfile.status === "inactive") {
      return new Response(
        JSON.stringify({ error: "account_inactive", message: "Account has been deactivated." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 6. Strict 5-Minute Anti-Passback Cooldown Enforcement
    // Check if user has already tapped within the last 5 minutes
    const cooldownIntervalSeconds = 300; // 5 minutes
    const fiveMinutesAgo = new Date(Date.now() - cooldownIntervalSeconds * 1000).toISOString();

    const { data: recentLogs, error: cooldownErr } = await supabase
      .from("attendance_logs")
      .select("id, scanned_at, event_type")
      .or(`student_id.eq.${targetUserId},teacher_id.eq.${targetUserId}`)
      .gte("scanned_at", fiveMinutesAgo)
      .order("scanned_at", { ascending: false })
      .limit(1);

    if (!cooldownErr && recentLogs && recentLogs.length > 0) {
      const lastTap = recentLogs[0];
      const elapsedSeconds = Math.floor((Date.now() - new Date(lastTap.scanned_at).getTime()) / 1000);
      const remainingSeconds = Math.max(0, cooldownIntervalSeconds - elapsedSeconds);

      console.warn(`[AMS Scan Ingest] Anti-Passback cooldown triggered for ${userProfile.first_name} ${userProfile.last_name}. Remaining: ${remainingSeconds}s`);

      return new Response(
        JSON.stringify({
          error: "cooldown_active",
          message: "Anti-Passback active. Duplicate tap rejected.",
          retry_after: remainingSeconds,
          last_scanned_at: lastTap.scanned_at,
          feedback: {
            led: "yellow",
            buzzer: "double_beep",
          },
        }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 7. Resolve Section for Students
    let enrolledSectionId: string | null = userProfile.section_id || null;
    if (userProfile.role === "student" && !enrolledSectionId) {
      const { data: secJunction } = await supabase
        .from("student_sections")
        .select("section_id")
        .eq("student_id", targetUserId)
        .limit(1)
        .maybeSingle();

      if (secJunction?.section_id) {
        enrolledSectionId = secJunction.section_id;
      }
    }

    // 8. Determine Event Type (time_in vs time_out) & Punctuality Classification
    const scanDateObj = new Date(scanned_at);
    const dateOnly = scanDateObj.toISOString().split("T")[0];

    // Check if there is an existing time_in for today
    const { data: todayLogs } = await supabase
      .from("attendance_logs")
      .select("id, event_type, status, scanned_at")
      .or(`student_id.eq.${targetUserId},teacher_id.eq.${targetUserId}`)
      .gte("scanned_at", `${dateOnly}T00:00:00`)
      .lte("scanned_at", `${dateOnly}T23:59:59`)
      .eq("event_type", "time_in")
      .limit(1);

    let eventType: "time_in" | "time_out" = "time_in";
    let attendanceStatus: "present" | "late" = "present";
    let minutesLate = 0;

    if (todayLogs && todayLogs.length > 0) {
      // Existing time_in found -> this tap is a time_out
      eventType = "time_out";
      attendanceStatus = (todayLogs[0].status as "present" | "late") || "present";
    } else {
      // First scan of the day -> time_in
      eventType = "time_in";

      // Evaluate Cutoff Time (Philippine Standard Time UTC+8: 08:00 AM)
      // Convert to UTC+8 hours and minutes
      const utcHours = scanDateObj.getUTCHours();
      const utcMinutes = scanDateObj.getUTCMinutes();
      const phtHours = (utcHours + 8) % 24;

      const cutoffHour = 8;
      const cutoffMinute = 0;

      const totalScanMinutes = phtHours * 60 + utcMinutes;
      const totalCutoffMinutes = cutoffHour * 60 + cutoffMinute;

      if (totalScanMinutes > totalCutoffMinutes) {
        attendanceStatus = "late";
        minutesLate = totalScanMinutes - totalCutoffMinutes;
      } else {
        attendanceStatus = "present";
        minutesLate = 0;
      }
    }

    // 9. Insert Record into attendance_logs (immutable raw audit trail)
    const logInsertData: Record<string, unknown> = {
      scan_method: scan_method.toLowerCase(),
      event_type: eventType,
      status: attendanceStatus,
      scanned_at: scannedAtIso(scanned_at),
      device_id: authenticatedDeviceId,
      is_offline_sync: Boolean(is_offline_sync),
    };

    if (userProfile.role === "teacher") {
      logInsertData.teacher_id = targetUserId;
    } else {
      logInsertData.student_id = targetUserId;
      logInsertData.section_id = enrolledSectionId;
    }

    const { data: newLog, error: logInsertErr } = await supabase
      .from("attendance_logs")
      .insert([logInsertData])
      .select()
      .single();

    if (logInsertErr) {
      console.error("[AMS Scan Ingest] Failed to insert attendance log:", logInsertErr);
      return new Response(
        JSON.stringify({ error: "db_insert_failed", message: "Failed to persist attendance log." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 10. Upsert / Update attendance_summary for Today
    // Time-In initializes the daily record; Time-Out adds departure timestamp while preserving status
    if (eventType === "time_in") {
      await supabase
        .from("attendance_summary")
        .upsert(
          {
            user_id: targetUserId,
            summary_date: dateOnly,
            status: attendanceStatus,
            minutes_late: minutesLate,
            time_in: scannedAtIso(scanned_at),
            time_out: null,
            scan_method: scan_method.toLowerCase(),
            device_id: authenticatedDeviceId,
          },
          { onConflict: "user_id,summary_date" }
        );
    } else {
      // Time-Out: Add time_out timestamp to existing morning record without overwriting morning punctuality
      await supabase
        .from("attendance_summary")
        .update({
          time_out: scannedAtIso(scanned_at),
        })
        .eq("user_id", targetUserId)
        .eq("summary_date", dateOnly);
    }

    // 11. Trigger Asynchronous Parent SMS Alert if Student is Late
    if (userProfile.role === "student" && eventType === "time_in" && attendanceStatus === "late") {
      dispatchParentSmsAlert(supabaseUrl, supabaseServiceKey, {
        student_id: targetUserId,
        alert_type: "tardy",
        details: {
          student_name: `${userProfile.first_name} ${userProfile.last_name}`,
          time: scanDateObj.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true }),
          date: dateOnly,
          section_id: enrolledSectionId,
        },
      }).catch((e) => console.warn("[AMS Scan Ingest] SMS async dispatch warning:", e));
    }

    const durationMs = Date.now() - startTime;
    const identifier = userProfile.role === "teacher" ? userProfile.employee_number : userProfile.student_number;

    return new Response(
      JSON.stringify({
        success: true,
        log_id: newLog.id,
        role: userProfile.role,
        event_type: eventType,
        status: attendanceStatus,
        minutes_late: minutesLate,
        user: {
          name: `${userProfile.first_name} ${userProfile.last_name}`,
          identifier: identifier,
          role: userProfile.role,
        },
        device: {
          code: device_code,
          location: deviceLocation,
        },
        feedback: {
          led: attendanceStatus === "present" ? "green" : "amber",
          buzzer: attendanceStatus === "present" ? "single_beep" : "double_beep",
        },
        latency_ms: durationMs,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("[AMS Scan Ingest] Unhandled exception:", err);
    return new Response(
      JSON.stringify({ error: "internal_server_error", message: errorMsg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function scannedAtIso(rawTime: string | undefined): string {
  if (!rawTime) return new Date().toISOString();
  try {
    return new Date(rawTime).toISOString();
  } catch {
    return new Date().toISOString();
  }
}

// Background fire-and-forget invoke to send-sms-alert function
async function dispatchParentSmsAlert(baseUrl: string, serviceKey: string, payload: Record<string, unknown>) {
  const url = `${baseUrl}/functions/v1/send-sms-alert`;
  await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${serviceKey}`,
    },
    body: JSON.stringify(payload),
  });
}
