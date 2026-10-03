// Bestlink College of the Philippines — Attendance Monitoring System (AMS)
// Edge Function: send-otp-email
// Dispatches 2FA Login OTP via Brevo Transactional Email API with Dev Fallback
// Reference: docs/Security.md, docs/UI-UX_Architecture.md

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
    const brevoApiKey = Deno.env.get("BREVO_API_KEY") ?? "";
    const senderEmail = Deno.env.get("BREVO_SENDER_EMAIL") ?? "ams-noreply@bestlink.edu.ph";
    const senderName = Deno.env.get("BREVO_SENDER_NAME") ?? "BCP Attendance Monitoring";

    const body = await req.json();
    const { user_id, email, user_name = "User" } = body;

    if (!user_id || !email) {
      return new Response(
        JSON.stringify({ error: "user_id and email are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1. Generate secure 6-digit numeric OTP
    const array = new Uint32Array(1);
    crypto.getRandomValues(array);
    const otpCode = String(100000 + (array[0] % 900000));

    // 2. Store OTP in database (inside users table)
    if (supabaseUrl && supabaseServiceKey) {
      const supabase = createClient(supabaseUrl, supabaseServiceKey);
      
      const { error: dbError } = await supabase.rpc("fn_store_user_otp", {
        p_user_id: user_id,
        p_otp_code: otpCode,
        p_validity_minutes: 5,
      });

      if (dbError) {
        console.error("[send-otp-email] Database RPC error:", dbError);
        // Fallback direct table update if RPC not applied yet
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
        const { error: directErr } = await supabase
          .from("users")
          .update({ otp_code: otpCode, otp_expires_at: expiresAt })
          .eq("id", user_id);

        if (directErr) {
          console.error("[send-otp-email] Direct update error:", directErr);
        }
      }
    }

    // 3. Dispatch Email via Brevo API
    const isBrevoConfigured = Boolean(brevoApiKey && !brevoApiKey.includes("your-brevo-api-key"));

    if (isBrevoConfigured) {
      const emailHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #F8FAFD; margin: 0; padding: 24px; color: #0D47A1; }
            .card { max-width: 500px; margin: 0 auto; background: #ffffff; border-radius: 14px; border: 1px solid #DCE8F5; overflow: hidden; box-shadow: 0 4px 20px rgba(13, 71, 161, 0.08); }
            .header { background: linear-gradient(135deg, #0D47A1 0%, #2196F3 100%); color: #ffffff; padding: 28px 24px; text-align: center; }
            .header h1 { margin: 0; font-size: 20px; font-weight: 700; letter-spacing: 0.5px; }
            .header p { margin: 6px 0 0 0; font-size: 13px; opacity: 0.9; }
            .content { padding: 32px 24px; text-align: center; }
            .greeting { font-size: 15px; color: #4A657E; margin-bottom: 20px; text-align: left; }
            .otp-container { background: #E3F2FD; border: 2px dashed #90CAF9; border-radius: 12px; padding: 20px; margin: 24px 0; }
            .otp-code { font-family: 'Courier New', Courier, monospace; font-size: 38px; font-weight: 800; letter-spacing: 8px; color: #0D47A1; }
            .expiry-note { font-size: 13px; color: #EF4444; font-weight: 600; margin-top: 10px; }
            .security-text { font-size: 12.5px; line-height: 1.6; color: #6282A8; text-align: left; border-top: 1px solid #E3F2FD; padding-top: 18px; margin-top: 24px; }
            .footer { background: #F8FAFD; border-top: 1px solid #DCE8F5; padding: 16px; text-align: center; font-size: 11px; color: #829DB5; }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="header">
              <h1>Bestlink College of the Philippines</h1>
              <p>Attendance Monitoring System — Two-Factor Authentication</p>
            </div>
            <div class="content">
              <div class="greeting">Hello, <strong>${user_name}</strong>!</div>
              <p style="font-size: 14px; color: #4A657E; margin: 0;">Use the 6-digit verification code below to complete your login sign-in:</p>
              
              <div class="otp-container">
                <div class="otp-code">${otpCode}</div>
                <div class="expiry-note">Valid for 5 minutes only</div>
              </div>

              <div class="security-text">
                <strong>Security Alert:</strong> Do not share this OTP with anyone. Bestlink College of the Philippines staff will never ask for your verification code. If you did not request this login attempt, please change your password immediately.
              </div>
            </div>
            <div class="footer">
              © 2026 Bestlink College of the Philippines. All rights reserved.
            </div>
          </div>
        </body>
        </html>
      `;

      const brevoResponse = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          "accept": "application/json",
          "api-key": brevoApiKey,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          sender: { name: senderName, email: senderEmail },
          to: [{ email, name: user_name }],
          subject: `${otpCode} is your AMS Login Verification Code`,
          htmlContent: emailHtml,
        }),
      });

      if (!brevoResponse.ok) {
        const errorDetails = await brevoResponse.text();
        console.error("[send-otp-email] Brevo API Error:", errorDetails);
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: "Failed to dispatch email via Brevo", 
            details: errorDetails 
          }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, message: "Verification code sent to your email." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } else {
      // Development mode: Brevo API key not supplied yet
      console.log(`[send-otp-email:DEV] Generated 2FA OTP for ${email}: ${otpCode}`);
      return new Response(
        JSON.stringify({
          success: true,
          dev_mode: true,
          dev_otp: otpCode,
          message: "Dev Mode: Verification code generated (Brevo API key not yet set).",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  } catch (err: any) {
    console.error("[send-otp-email] Internal exception:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
