// Bestlink College of the Philippines — Attendance Monitoring System (AMS)
// Edge Function: compute-daily-status
// Nightly Scheduled Cron: Daily Absence Classification, Holiday Checks & Parent Alerts
// Authoritative Reference: docs/WORKFLOW.md §3, docs/DB_E2E_WORKFLOW.md, docs/PRD.md §4.2

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({ error: "Missing Supabase configuration" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let targetDate = new Date().toISOString().split("T")[0];
    if (req.method === "POST") {
      try {
        const body = await req.json();
        if (body.target_date) targetDate = body.target_date;
      } catch {
        // Fallback to today
      }
    }

    console.log(`[AMS Cron compute-daily-status] Starting evaluation for date: ${targetDate}...`);

    // 1. Holiday Check
    const { data: holiday } = await supabase
      .from("holidays")
      .select("id, description")
      .eq("holiday_date", targetDate)
      .maybeSingle();

    if (holiday) {
      console.log(`[AMS Cron] Date ${targetDate} is an official holiday: ${holiday.description}. Skipping absence marks.`);
      return new Response(
        JSON.stringify({
          success: true,
          date: targetDate,
          is_holiday: true,
          description: holiday.description,
          message: "Holiday detected. Regular attendance evaluation waived.",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Fetch Active Students & Teachers
    const { data: activeUsers, error: usersErr } = await supabase
      .from("users")
      .select("id, role, first_name, last_name, status")
      .eq("status", "active")
      .in("role", ["student", "teacher"]);

    if (usersErr || !activeUsers) {
      throw new Error(`Failed to query active users: ${usersErr?.message}`);
    }

    // 3. Fetch Today's Attendance Logs (excluding voided records)
    const { data: dayLogs } = await supabase
      .from("attendance_logs")
      .select("student_id, teacher_id, status, event_type, scanned_at, is_voided")
      .gte("scanned_at", `${targetDate}T00:00:00`)
      .lte("scanned_at", `${targetDate}T23:59:59`)
      .or("is_voided.is.null,is_voided.eq.false");

    const logMap = new Map<string, { status: string; event_type: string }>();
    (dayLogs || []).forEach((l) => {
      const uId = l.student_id || l.teacher_id;
      if (uId && !logMap.has(uId)) {
        logMap.set(uId, { status: l.status, event_type: l.event_type });
      }
    });

    // 4. Fetch Approved Excuse Slips Covering Today
    const { data: approvedSlips } = await supabase
      .from("excuse_slips")
      .select("student_id")
      .eq("status", "approved")
      .lte("start_date", targetDate)
      .gte("end_date", targetDate);

    const excusedStudents = new Set<string>();
    (approvedSlips || []).forEach((s) => excusedStudents.add(s.student_id));

    // 5. Evaluate and Upsert Attendance Summaries
    let presentCount = 0;
    let lateCount = 0;
    let absentCount = 0;
    let excusedCount = 0;
    const absentStudentIds: string[] = [];

    const summaryUpserts = activeUsers.map((user) => {
      const log = logMap.get(user.id);

      let finalStatus: "present" | "late" | "absent" | "excused" = "absent";
      let minutesLate = 0;

      if (log) {
        if (log.status === "late") {
          finalStatus = "late";
          lateCount++;
          minutesLate = 15;
        } else {
          finalStatus = "present";
          presentCount++;
        }
      } else {
        // No log found for today
        if (user.role === "student" && excusedStudents.has(user.id)) {
          finalStatus = "excused";
          excusedCount++;
        } else {
          finalStatus = "absent";
          absentCount++;
          if (user.role === "student") {
            absentStudentIds.push(user.id);
          }
        }
      }

      return {
        user_id: user.id,
        summary_date: targetDate,
        status: finalStatus,
        minutes_late: minutesLate,
      };
    });

    // Batch upsert to attendance_summary
    const { error: upsertErr } = await supabase
      .from("attendance_summary")
      .upsert(summaryUpserts, { onConflict: "user_id,summary_date" });

    if (upsertErr) {
      console.error("[AMS Cron] Failed to upsert attendance summaries:", upsertErr);
    }

    // 6. Asynchronously trigger parent alerts for unexcused absences
    for (const stId of absentStudentIds) {
      const user = activeUsers.find((u) => u.id === stId);
      if (user) {
        dispatchAbsentSms(supabaseUrl, supabaseServiceKey, {
          student_id: user.id,
          alert_type: "absent",
          details: {
            student_name: `${user.first_name} ${user.last_name}`,
            date: targetDate,
          },
        }).catch((e) => console.warn(`[AMS Cron] Absent SMS dispatch error for ${user.id}:`, e));
      }
    }

    console.log(`[AMS Cron] Evaluation complete for ${targetDate}: ${presentCount} P, ${lateCount} L, ${absentCount} A, ${excusedCount} E.`);

    return new Response(
      JSON.stringify({
        success: true,
        date: targetDate,
        total_evaluated: activeUsers.length,
        present: presentCount,
        late: lateCount,
        absent: absentCount,
        excused: excusedCount,
        absent_alerts_queued: absentStudentIds.length,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("[AMS Cron compute-daily-status] Unhandled exception:", err);
    return new Response(
      JSON.stringify({ error: "internal_server_error", message: errorMsg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function dispatchAbsentSms(baseUrl: string, serviceKey: string, payload: Record<string, unknown>) {
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
