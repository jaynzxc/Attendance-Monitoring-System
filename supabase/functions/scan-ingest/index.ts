// Bestlink College of the Philippines — Attendance Monitoring System (AMS)
// Edge Function: scan-ingest
// Unified RFID & QR Ingress Ingestion Pipeline for Teachers & Students
// Authoritative Reference: docs/ATTENDANCE_PLAN.md, docs/Security.md, docs/WORKFLOW.md

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

// Helper: Haversine distance between two coordinates in meters
function computeHaversineDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371e3; // Earth's radius in meters
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function parseIsoTimestamp(rawTime: string | undefined): string {
  if (!rawTime) return new Date().toISOString();
  try {
    return new Date(rawTime).toISOString();
  } catch {
    return new Date().toISOString();
  }
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

    // Service-role client for hardware ingestion & authorization enforcement
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 2. Parse Scan Payload
    const payload = await req.json();
    const {
      device_code = "GATE-01-ESP32",
      scan_method = "rfid", // 'rfid' or 'qr'
      card_uid,
      session_token,
      session_id,
      student_lat,
      student_lng,
      scanned_at = new Date().toISOString(),
      is_offline_sync = false,
    } = payload;

    const normalizedScanMethod = (scan_method || "rfid").toLowerCase();
    const scanDateObj = new Date(scanned_at);
    const dateOnly = scanDateObj.toISOString().split("T")[0];

    // 3. Hardware Authentication / Staff Auth
    const deviceKeyHeader = req.headers.get("x-device-key");
    const authHeader = req.headers.get("authorization");
    let authenticatedDeviceId: string | null = null;
    let deviceLocation = "Campus Attendance Station";
    let authenticatedCallerId: string | null = null;

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
          JSON.stringify({
            error: "unauthorized_device",
            message: "Invalid or unregistered device key.",
            feedback: { led: "red", buzzer: "long_beep" },
          }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (device.status === "offline") {
        return new Response(
          JSON.stringify({
            error: "device_deactivated",
            message: "Scanner device has been set offline by administration.",
            feedback: { led: "red", buzzer: "long_beep" },
          }),
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
    } else if (authHeader) {
      // User scanning QR or authenticated web portal ingress
      const jwtToken = authHeader.replace("Bearer ", "");
      const { data: { user: callerUser }, error: userErr } = await supabase.auth.getUser(jwtToken);
      if (!userErr && callerUser) {
        authenticatedCallerId = callerUser.id;
      }
    }

    // 4. Resolve Active Attendance Session
    let activeSession: any = null;

    if (normalizedScanMethod === "qr") {
      if (!session_token) {
        return new Response(
          JSON.stringify({
            error: "missing_session_token",
            message: "QR session token is required for QR attendance.",
            feedback: { led: "red", buzzer: "long_beep" },
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Lookup active session by session_token
      const { data: sessionByToken, error: tokenErr } = await supabase
        .from("attendance_sessions")
        .select("*, sections(id, name)")
        .eq("session_token", session_token.trim())
        .eq("status", "active")
        .maybeSingle();

      if (tokenErr || !sessionByToken) {
        // Log invalid QR scan attempt
        await supabase.from("audit_log").insert([
          {
            actor_id: authenticatedCallerId,
            action: "invalid_qr_token",
            table_name: "attendance_sessions",
            details: { token: session_token, timestamp: new Date().toISOString() },
          },
        ]);

        return new Response(
          JSON.stringify({
            error: "invalid_qr_token",
            message: "QR code is expired or invalid. Please refresh the QR code on the instructor's screen.",
            feedback: { led: "red", buzzer: "long_beep" },
          }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      activeSession = sessionByToken;
    } else {
      // RFID Scan Method
      if (session_id) {
        // Direct session specified
        const { data: directSession } = await supabase
          .from("attendance_sessions")
          .select("*, sections(id, name)")
          .eq("id", session_id)
          .eq("status", "active")
          .maybeSingle();
        activeSession = directSession;
      } else if (authenticatedDeviceId) {
        // Lookup session tied to this device
        const { data: deviceSession } = await supabase
          .from("attendance_sessions")
          .select("*, sections(id, name)")
          .eq("device_id", authenticatedDeviceId)
          .eq("status", "active")
          .order("session_start", { ascending: false })
          .limit(1)
          .maybeSingle();
        activeSession = deviceSession;
      }

      // If no session found for this device or session_id
      if (!activeSession) {
        await supabase.from("audit_log").insert([
          {
            actor_id: authenticatedCallerId,
            action: "scan_without_active_session",
            table_name: "scan_devices",
            details: {
              device_id: authenticatedDeviceId,
              card_uid: card_uid ? `${card_uid.slice(0, 4)}***` : null,
              timestamp: new Date().toISOString(),
            },
          },
        ]);

        return new Response(
          JSON.stringify({
            error: "no_active_session",
            message: "No active attendance session is currently open for this scanner.",
            feedback: { led: "red", buzzer: "long_beep" },
          }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Verify Session Has Not Expired
    const sessionEndTime = new Date(activeSession.session_end).getTime();
    if (Date.now() > sessionEndTime) {
      // Automatically mark session closed if past end window
      await supabase
        .from("attendance_sessions")
        .update({ status: "closed" })
        .eq("id", activeSession.id);

      return new Response(
        JSON.stringify({
          error: "session_closed",
          message: "Attendance session window has officially closed.",
          feedback: { led: "red", buzzer: "long_beep" },
        }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 5. Identity Resolution
    let targetUserId: string | null = null;

    if (normalizedScanMethod === "rfid") {
      if (!card_uid) {
        return new Response(
          JSON.stringify({
            error: "missing_card_uid",
            message: "card_uid is required for RFID attendance.",
            feedback: { led: "red", buzzer: "long_beep" },
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const cleanUid = card_uid.trim().toUpperCase();
      const { data: cardRow, error: cardErr } = await supabase
        .from("rfid_cards")
        .select("user_id, is_active")
        .eq("card_uid", cleanUid)
        .eq("is_active", true)
        .maybeSingle();

      if (cardErr || !cardRow) {
        console.warn(`[AMS Scan Ingest] Unregistered RFID card tapped: ${cleanUid}`);
        await supabase.from("audit_log").insert([
          {
            actor_id: null,
            action: "unregistered_card_tap",
            table_name: "rfid_cards",
            details: { card_uid: cleanUid, session_id: activeSession.id, timestamp: new Date().toISOString() },
          },
        ]);

        return new Response(
          JSON.stringify({
            error: "unregistered_card",
            card_uid: cleanUid,
            message: "RFID card not recognized or inactive in AMS.",
            feedback: { led: "red", buzzer: "long_beep" },
          }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      targetUserId = cardRow.user_id;
    } else {
      // QR Scan: Resolved via authenticated user
      targetUserId = authenticatedCallerId;
      if (!targetUserId) {
        return new Response(
          JSON.stringify({
            error: "unauthorized_qr_user",
            message: "Authentication required to scan QR code.",
            feedback: { led: "red", buzzer: "long_beep" },
          }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // 6. Fetch Target User Profile
    const { data: userProfile, error: profileErr } = await supabase
      .from("users")
      .select("id, role, first_name, last_name, email, student_number, employee_number, status")
      .eq("id", targetUserId)
      .single();

    if (profileErr || !userProfile) {
      return new Response(
        JSON.stringify({
          error: "profile_not_found",
          message: "User account does not exist.",
          feedback: { led: "red", buzzer: "long_beep" },
        }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (userProfile.status === "inactive") {
      return new Response(
        JSON.stringify({
          error: "account_inactive",
          message: "Account has been deactivated.",
          feedback: { led: "red", buzzer: "long_beep" },
        }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 7. Geolocation Proximity Check for Dynamic QR (Dual Anti-Buddy-Punch Layer 2)
    if (normalizedScanMethod === "qr") {
      if (student_lat == null || student_lng == null) {
        await supabase.from("audit_log").insert([
          {
            actor_id: targetUserId,
            action: "gps_unavailable",
            table_name: "attendance_logs",
            details: { session_id: activeSession.id, reason: "Missing GPS coordinates" },
          },
        ]);

        return new Response(
          JSON.stringify({
            error: "gps_unavailable",
            message: "GPS location is strictly required for QR attendance verification. Please enable device location.",
            feedback: { led: "red", buzzer: "long_beep" },
          }),
          { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Check distance against instructor coordinates if configured on session
      if (activeSession.teacher_lat != null && activeSession.teacher_lng != null) {
        const geoDistanceMeters = computeHaversineDistanceMeters(
          activeSession.teacher_lat,
          activeSession.teacher_lng,
          student_lat,
          student_lng
        );

        const maxAllowedRadius = activeSession.geo_radius_meters || 50;
        if (geoDistanceMeters > maxAllowedRadius) {
          await supabase.from("audit_log").insert([
            {
              actor_id: targetUserId,
              action: "geolocation_mismatch",
              table_name: "attendance_logs",
              details: {
                distance_meters: Math.round(geoDistanceMeters),
                max_radius: maxAllowedRadius,
                session_id: activeSession.id,
                student_coords: [student_lat, student_lng],
                teacher_coords: [activeSession.teacher_lat, activeSession.teacher_lng],
              },
            },
          ]);

          return new Response(
            JSON.stringify({
              error: "geolocation_mismatch",
              message: `You are ${Math.round(geoDistanceMeters)}m away from the classroom. You must be within ${maxAllowedRadius}m to record QR attendance.`,
              feedback: { led: "red", buzzer: "long_beep" },
            }),
            { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }
    }

    // 8. Enrollment Validation (For Students)
    if (userProfile.role === "student") {
      const { data: enrollment, error: enrollErr } = await supabase
        .from("student_sections")
        .select("student_id")
        .eq("student_id", targetUserId)
        .eq("section_id", activeSession.section_id)
        .maybeSingle();

      if (enrollErr || !enrollment) {
        await supabase.from("audit_log").insert([
          {
            actor_id: targetUserId,
            action: "unenrolled_tap",
            table_name: "student_sections",
            details: {
              student_id: targetUserId,
              student_name: `${userProfile.first_name} ${userProfile.last_name}`,
              section_id: activeSession.section_id,
              session_id: activeSession.id,
              timestamp: new Date().toISOString(),
            },
          },
        ]);

        return new Response(
          JSON.stringify({
            error: "not_enrolled",
            message: `Student is not enrolled in section "${activeSession.sections?.name || 'this class'}".`,
            user: {
              name: `${userProfile.first_name} ${userProfile.last_name}`,
              identifier: userProfile.student_number,
              role: userProfile.role,
            },
            feedback: { led: "red", buzzer: "long_beep" },
          }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // 9. Strict 5-Minute Anti-Passback Cooldown Enforcement
    const cooldownSeconds = 300;
    const cooldownCutoff = new Date(Date.now() - cooldownSeconds * 1000).toISOString();

    const { data: recentLogs } = await supabase
      .from("attendance_logs")
      .select("id, scanned_at, event_type")
      .or(`student_id.eq.${targetUserId},teacher_id.eq.${targetUserId}`)
      .gte("scanned_at", cooldownCutoff)
      .eq("is_voided", false)
      .order("scanned_at", { ascending: false })
      .limit(1);

    if (recentLogs && recentLogs.length > 0) {
      const lastTap = recentLogs[0];
      const elapsedSeconds = Math.floor((Date.now() - new Date(lastTap.scanned_at).getTime()) / 1000);
      const remainingSeconds = Math.max(0, cooldownSeconds - elapsedSeconds);

      console.warn(`[AMS Scan Ingest] Anti-Passback cooldown active for ${userProfile.first_name} ${userProfile.last_name}. Remaining: ${remainingSeconds}s`);

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

    // 10. Event Type Determination & Punctuality Classification
    let eventType: "time_in" | "time_out" = "time_in";
    let attendanceStatus: "present" | "late" = "present";
    let minutesLate = 0;

    const presentCutoffTime = new Date(activeSession.present_cutoff).getTime();
    const scanTimestampMs = scanDateObj.getTime();

    if (userProfile.role === "teacher") {
      // Check if teacher already has a Time-In for this session
      const { data: existingTeacherLog } = await supabase
        .from("attendance_logs")
        .select("id, status, scanned_at")
        .eq("teacher_id", targetUserId)
        .eq("session_id", activeSession.id)
        .eq("event_type", "time_in")
        .eq("is_voided", false)
        .maybeSingle();

      if (existingTeacherLog) {
        // Teacher second tap = Time-Out
        eventType = "time_out";
        attendanceStatus = existingTeacherLog.status as "present" | "late";
      } else {
        // Teacher first tap = Time-In
        eventType = "time_in";
        if (scanTimestampMs > presentCutoffTime) {
          attendanceStatus = "late";
          minutesLate = Math.max(0, Math.floor((scanTimestampMs - presentCutoffTime) / 60000));
        } else {
          attendanceStatus = "present";
          minutesLate = 0;
        }
      }
    } else {
      // Students have Time-In only (Octoberian/irregular policy)
      eventType = "time_in";
      if (scanTimestampMs > presentCutoffTime) {
        attendanceStatus = "late";
        minutesLate = Math.max(0, Math.floor((scanTimestampMs - presentCutoffTime) / 60000));
      } else {
        attendanceStatus = "present";
        minutesLate = 0;
      }
    }

    // 11. Database Write: Insert into attendance_logs
    const logInsertData: Record<string, unknown> = {
      section_id: activeSession.section_id,
      session_id: activeSession.id,
      device_id: authenticatedDeviceId || activeSession.device_id,
      scan_method: normalizedScanMethod,
      event_type: eventType,
      status: attendanceStatus,
      scanned_at: parseIsoTimestamp(scanned_at),
      is_manual: false,
      is_voided: false,
      student_lat: student_lat || null,
      student_lng: student_lng || null,
    };

    if (userProfile.role === "teacher") {
      logInsertData.teacher_id = targetUserId;
    } else {
      logInsertData.student_id = targetUserId;
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

    // 12. Upsert Daily attendance_summary
    if (eventType === "time_in") {
      await supabase
        .from("attendance_summary")
        .upsert(
          {
            user_id: targetUserId,
            summary_date: dateOnly,
            status: attendanceStatus,
            minutes_late: minutesLate,
            time_in: parseIsoTimestamp(scanned_at),
            time_out: null,
            scan_method: normalizedScanMethod,
            device_id: authenticatedDeviceId || activeSession.device_id,
          },
          { onConflict: "user_id,summary_date" }
        );
    } else {
      // Time-Out update
      await supabase
        .from("attendance_summary")
        .update({
          time_out: parseIsoTimestamp(scanned_at),
        })
        .eq("user_id", targetUserId)
        .eq("summary_date", dateOnly);
    }

    // 13. Side Effect: Asynchronous Parent SMS Alert for Student Tardiness
    if (userProfile.role === "student" && eventType === "time_in" && attendanceStatus === "late") {
      dispatchParentSmsAlert(supabaseUrl, supabaseServiceKey, {
        student_id: targetUserId,
        alert_type: "tardy",
        details: {
          student_name: `${userProfile.first_name} ${userProfile.last_name}`,
          time: scanDateObj.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true }),
          date: dateOnly,
          section_id: activeSession.section_id,
        },
      }).catch((e) => console.warn("[AMS Scan Ingest] SMS async dispatch warning:", e));
    }

    const durationMs = Date.now() - startTime;
    const identifier = userProfile.role === "teacher" ? userProfile.employee_number : userProfile.student_number;

    return new Response(
      JSON.stringify({
        success: true,
        log_id: newLog.id,
        session_id: activeSession.id,
        section_name: activeSession.sections?.name || "Class Session",
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

// Fire-and-forget helper invoking send-sms-alert Edge function
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
