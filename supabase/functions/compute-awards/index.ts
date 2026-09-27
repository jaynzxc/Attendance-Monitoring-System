// Bestlink College of the Philippines — Attendance Monitoring System (AMS)
// Edge Function: compute-awards
// Automated Perfect Attendance Qualification Engine
// Authoritative Reference: docs/WORKFLOW.md §5, docs/PRD.md §4.7

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

    let targetPeriodId: string | null = null;
    if (req.method === "POST") {
      try {
        const body = await req.json();
        if (body.period_id) targetPeriodId = body.period_id;
      } catch {
        // Fallback to active period
      }
    }

    // 1. Resolve Target Award Period
    let awardPeriod = null;
    if (targetPeriodId) {
      const { data } = await supabase
        .from("award_periods")
        .select("*")
        .eq("id", targetPeriodId)
        .single();
      awardPeriod = data;
    } else {
      const { data } = await supabase
        .from("award_periods")
        .select("*")
        .order("start_date", { ascending: false })
        .limit(1)
        .maybeSingle();
      awardPeriod = data;
    }

    if (!awardPeriod) {
      return new Response(
        JSON.stringify({ error: "no_award_period", message: "No active award period found in database." }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { id: periodId, name: periodName, start_date, end_date, max_allowed_excused = 1 } = awardPeriod;
    console.log(`[AMS Awards] Evaluating Perfect Attendance for: ${periodName} (${start_date} to ${end_date})...`);

    // 2. Fetch Active Students
    const { data: students, error: stErr } = await supabase
      .from("users")
      .select("id, first_name, last_name, student_number, section_id")
      .eq("role", "student")
      .eq("status", "active");

    if (stErr || !students) {
      throw new Error(`Failed to load students: ${stErr?.message}`);
    }

    // 3. Fetch All Attendance Summaries within Period
    const { data: summaries, error: sumErr } = await supabase
      .from("attendance_summary")
      .select("user_id, status")
      .gte("summary_date", start_date)
      .lte("summary_date", end_date);

    if (sumErr) {
      throw new Error(`Failed to load attendance summaries: ${sumErr.message}`);
    }

    // Group by student
    const studentSummaryMap = new Map<string, { present: number; late: number; absent: number; excused: number }>();
    (summaries || []).forEach((row) => {
      if (!studentSummaryMap.has(row.user_id)) {
        studentSummaryMap.set(row.user_id, { present: 0, late: 0, absent: 0, excused: 0 });
      }
      const entry = studentSummaryMap.get(row.user_id)!;
      if (row.status === "present") entry.present++;
      else if (row.status === "late") entry.late++;
      else if (row.status === "absent") entry.absent++;
      else if (row.status === "excused") entry.excused++;
    });

    // 4. Evaluate Criteria
    let qualifiedCount = 0;
    const qualificationsToUpsert = [];
    const honorees = [];

    for (const student of students) {
      const counts = studentSummaryMap.get(student.id) || { present: 0, late: 0, absent: 0, excused: 0 };
      const totalRecorded = counts.present + counts.late + counts.absent + counts.excused;

      // Perfect Attendance Criteria:
      // - Must have recorded days in period
      // - Unexcused absences = 0
      // - Tardiness count = 0
      // - Excused absences <= max_allowed_excused
      const isQualified =
        totalRecorded > 0 &&
        counts.absent === 0 &&
        counts.late === 0 &&
        counts.excused <= max_allowed_excused;

      if (isQualified) {
        qualifiedCount++;
        honorees.push({
          id: student.id,
          name: `${student.first_name} ${student.last_name}`,
          student_number: student.student_number,
          present_days: counts.present,
          excused_days: counts.excused,
        });
      }

      qualificationsToUpsert.push({
        award_period_id: periodId,
        student_id: student.id,
        is_qualified: isQualified,
        evaluation_date: new Date().toISOString().split("T")[0],
      });
    }

    // Upsert into award_qualifications
    const { error: upsertErr } = await supabase
      .from("award_qualifications")
      .upsert(qualificationsToUpsert, { onConflict: "award_period_id,student_id" });

    if (upsertErr) {
      console.warn("[AMS Awards] award_qualifications upsert warning:", upsertErr);
    }

    console.log(`[AMS Awards] Evaluation complete: ${qualifiedCount} of ${students.length} students qualified.`);

    return new Response(
      JSON.stringify({
        success: true,
        period_id: periodId,
        period_name: periodName,
        total_students_evaluated: students.length,
        qualified_count: qualifiedCount,
        honorees: honorees.slice(0, 50),
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("[AMS Awards] Unhandled exception:", err);
    return new Response(
      JSON.stringify({ error: "internal_server_error", message: errorMsg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
