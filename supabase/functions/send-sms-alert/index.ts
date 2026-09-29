// Bestlink College of the Philippines — Attendance Monitoring System (AMS)
// Edge Function: send-sms-alert
// Asynchronous Parent SMS Alert Dispatch via Semaphore Gateway with Audit Trail
// Authoritative Reference: docs/Security.md §8, docs/WORKFLOW.md §2, §3, docs/DATA.md §13

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

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const semaphoreApiKey = Deno.env.get("SEMAPHORE_API_KEY") ?? "";
    const semaphoreSenderName = Deno.env.get("SEMAPHORE_SENDER_NAME") ?? "BCP_AMS";

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({ error: "Missing Supabase configuration" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const body = await req.json();
    const { student_id, alert_type = "tardy", details = {} } = body;

    if (!student_id) {
      return new Response(
        JSON.stringify({ error: "missing_student_id", message: "student_id is required." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1. Fetch Primary Parent Contact
    const { data: parent, error: parentErr } = await supabase
      .from("parent_contacts")
      .select("id, full_name, mobile_number, relationship")
      .eq("student_id", student_id)
      .eq("is_primary", true)
      .limit(1)
      .maybeSingle();

    if (parentErr || !parent || !parent.mobile_number) {
      console.warn(`[AMS SMS] No primary parent contact found for student ID: ${student_id}`);
      return new Response(
        JSON.stringify({
          warning: "no_parent_contact",
          message: "No active parent mobile number registered for this student.",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Fetch or Generate Message Content from Templates
    const studentName = details.student_name || "your student";
    const eventTime = details.time || new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });
    const eventDate = details.date || new Date().toISOString().split("T")[0];

    let messageText = "";

    // Check system_settings for custom template
    let templateKey = "sms_template_tardy";
    if (alert_type === "absent") {
      templateKey = "sms_template_absent";
    } else if (alert_type === "buddy_punch_void") {
      templateKey = "sms_template_buddy_punch";
    }

    const { data: templateRow } = await supabase
      .from("system_settings")
      .select("setting_value")
      .eq("setting_key", templateKey)
      .maybeSingle();

    if (templateRow?.setting_value) {
      messageText = templateRow.setting_value
        .replace("{student_name}", studentName)
        .replace("{date}", eventDate)
        .replace("{time}", eventTime);
    } else {
      if (alert_type === "absent") {
        messageText = `BCP AMS Notice: Your child ${studentName} was marked ABSENT on ${eventDate}. Please submit an official excuse slip upon return. Bestlink College`;
      } else if (alert_type === "buddy_punch_void") {
        messageText = `BCP AMS Security Notice: Attendance for ${studentName} on ${eventDate} was VOIDED due to buddy punching. Please report to the Prefect Office. Bestlink College`;
      } else {
        messageText = `BCP AMS Alert: Your child ${studentName} arrived LATE at campus on ${eventDate} at ${eventTime}. Bestlink College of the Philippines`;
      }
    }

    // 3. Dispatch to Semaphore SMS Gateway
    let gatewayStatus = "sent";
    let gatewayResponse: Record<string, unknown> = {};

    if (semaphoreApiKey) {
      try {
        const smsRes = await fetch("https://api.semaphore.co/api/v4/messages", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            apikey: semaphoreApiKey,
            number: parent.mobile_number,
            message: messageText,
            sendername: semaphoreSenderName,
          }),
        });

        gatewayResponse = await smsRes.json();
        if (!smsRes.ok) {
          gatewayStatus = "failed";
          console.error("[AMS SMS] Semaphore Gateway API error:", gatewayResponse);
        } else {
          gatewayStatus = "delivered";
          console.log(`[AMS SMS] SMS delivered to ${parent.mobile_number} via Semaphore.`);
        }
      } catch (smsEx) {
        gatewayStatus = "failed";
        gatewayResponse = { error: String(smsEx) };
        console.error("[AMS SMS] Semaphore connection exception:", smsEx);
      }
    } else {
      // Local/Development Simulation Mode
      console.log(`[AMS SMS Simulator] [${parent.mobile_number}]: ${messageText}`);
      gatewayStatus = "delivered";
      gatewayResponse = { mode: "simulated_development", timestamp: new Date().toISOString() };
    }

    // 4. Outbound Prefect Webhook Dispatch on Disciplinary / Void Events
    const prefectWebhookUrl = Deno.env.get("PREFECT_WEBHOOK_URL") || "";
    let prefectWebhookStatus = "skipped";

    if (alert_type === "buddy_punch_void" && prefectWebhookUrl) {
      try {
        const pRes = await fetch(prefectWebhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            event: "buddy_punch_violation",
            student_id,
            student_name: studentName,
            section_id: details.section_id,
            section_name: details.section_name,
            session_date: eventDate,
            voided_by: details.voided_by,
            timestamp: new Date().toISOString(),
          }),
        });
        prefectWebhookStatus = pRes.ok ? "delivered" : "failed";
      } catch (pErr) {
        console.warn("[AMS SMS] Prefect webhook dispatch failed:", pErr);
        prefectWebhookStatus = "error";
      }
    }

    // 5. Log to alerts_log Audit Trail
    const { data: alertLog, error: logErr } = await supabase
      .from("alerts_log")
      .insert([
        {
          student_id,
          parent_contact_id: parent.id,
          channel: "sms",
          message: messageText,
          status: gatewayStatus === "delivered" ? "sent" : "failed",
          sent_at: new Date().toISOString(),
        },
      ])
      .select()
      .single();

    if (logErr) {
      console.warn("[AMS SMS] Failed to persist alerts_log:", logErr);
    }

    return new Response(
      JSON.stringify({
        success: gatewayStatus === "delivered" || gatewayStatus === "sent",
        alert_id: alertLog?.id,
        recipient: parent.mobile_number,
        alert_type,
        status: gatewayStatus,
        prefect_webhook: prefectWebhookStatus,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("[AMS SMS] Unhandled exception:", err);
    return new Response(
      JSON.stringify({ error: "internal_server_error", message: errorMsg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
