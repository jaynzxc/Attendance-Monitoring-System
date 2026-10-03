-- Migration: 20261004000003_server_side_email_dispatch.sql
-- Description: Move Brevo transactional email dispatch (2FA OTP, account activation,
-- credentials delivery) from browser JavaScript into the database so the Brevo API key
-- never reaches the client. The key is stored in Supabase Vault (name: 'brevo_api_key')
-- and is inserted out-of-band, never committed to source control:
--   select vault.create_secret('<BREVO_API_KEY>', 'brevo_api_key');
-- Reference: docs/Security.md (no secrets in client code), AGENTS.md §15

create extension if not exists pg_net;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

insert into public.system_settings (setting_key, setting_value, description) values
  ('brevo_sender_email', 'jaynzxc.devs@gmail.com', 'Verified Brevo sender address for transactional emails')
on conflict (setting_key) do nothing;

-- 1. HTML escaping for user-supplied values interpolated into email templates
create or replace function private.fn_html_escape(p_text text)
returns text
language sql
immutable
as $$
  select replace(replace(replace(replace(replace(coalesce(p_text, ''),
    '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;'), '''', '&#39;');
$$;

-- 2. Low-level Brevo dispatcher (not exposed through PostgREST: lives in the private schema)
create or replace function private.fn_send_brevo_email(
  p_to_email text,
  p_to_name text,
  p_subject text,
  p_html text
)
returns bigint
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_api_key text;
  v_sender text;
  v_request_id bigint;
begin
  select decrypted_secret into v_api_key
  from vault.decrypted_secrets
  where name = 'brevo_api_key'
  limit 1;

  if v_api_key is null or v_api_key = '' then
    raise exception 'Email service is not configured (missing Vault secret brevo_api_key).';
  end if;

  select setting_value into v_sender
  from public.system_settings
  where setting_key = 'brevo_sender_email';

  select net.http_post(
    url := 'https://api.brevo.com/v3/smtp/email',
    headers := jsonb_build_object(
      'accept', 'application/json',
      'content-type', 'application/json',
      'api-key', v_api_key
    ),
    body := jsonb_build_object(
      'sender', jsonb_build_object('name', 'Bestlink Attendance Monitoring', 'email', coalesce(v_sender, 'jaynzxc.devs@gmail.com')),
      'to', jsonb_build_array(jsonb_build_object('email', p_to_email, 'name', coalesce(nullif(p_to_name, ''), 'User'))),
      'subject', p_subject,
      'htmlContent', p_html
    )
  ) into v_request_id;

  return v_request_id;
end;
$$;

revoke all on function private.fn_send_brevo_email(text, text, text, text) from public, anon, authenticated;

-- 3. Shared email shell (header, body, footer) using the Color Hunt palette
create or replace function private.fn_email_shell(p_header_title text, p_header_gradient text, p_body text)
returns text
language sql
immutable
as $$
  select format($html$
<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="font-family:'Segoe UI',Tahoma,Verdana,sans-serif;background:#F8FAFD;margin:0;padding:24px;color:#0D47A1;">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:14px;border:1px solid #DCE8F5;overflow:hidden;">
    <div style="background:%s;color:#ffffff;padding:28px 24px;text-align:center;">
      <h1 style="margin:0;font-size:20px;font-weight:700;">Bestlink College of the Philippines</h1>
      <p style="margin:6px 0 0 0;font-size:13px;opacity:0.92;">%s</p>
    </div>
    <div style="padding:32px 26px;">%s</div>
    <div style="background:#F8FAFD;border-top:1px solid #DCE8F5;padding:16px;text-align:center;font-size:11px;color:#829DB5;">
      &copy; 2026 Bestlink College of the Philippines. All rights reserved.
    </div>
  </div>
</body></html>$html$, p_header_gradient, p_header_title, p_body);
$$;

-- 4. 2FA: generate, store, and email the OTP for the currently authenticated user.
-- The OTP is generated server-side and is never returned to the browser.
create or replace function public.fn_request_login_otp()
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_user record;
  v_otp text;
  v_body text;
begin
  if v_uid is null then
    return jsonb_build_object('success', false, 'error', 'Authentication required.');
  end if;

  select id, email, first_name into v_user from public.users where id = v_uid;
  if not found or v_user.email is null then
    return jsonb_build_object('success', false, 'error', 'User profile not found.');
  end if;

  v_otp := lpad(((('x' || encode(gen_random_bytes(4), 'hex'))::bit(32)::bigint % 900000) + 100000)::text, 6, '0');

  update public.users
  set otp_code = v_otp,
      otp_expires_at = now() + interval '5 minutes'
  where id = v_uid;

  v_body := format($b$
    <p style="font-size:15px;color:#4A657E;">Hello, <strong>%s</strong>!</p>
    <p style="font-size:14px;color:#4A657E;">Use the 6-digit verification code below to complete your sign-in:</p>
    <div style="background:#E3F2FD;border:2px dashed #90CAF9;border-radius:12px;padding:20px;margin:24px 0;text-align:center;">
      <div style="font-family:'Courier New',monospace;font-size:38px;font-weight:800;letter-spacing:8px;color:#0D47A1;">%s</div>
      <div style="font-size:13px;color:#EF4444;font-weight:600;margin-top:10px;">Valid for 5 minutes only</div>
    </div>
    <p style="font-size:12.5px;line-height:1.6;color:#6282A8;border-top:1px solid #E3F2FD;padding-top:18px;">
      <strong>Security Notice:</strong> Never share this code. Bestlink College staff will never ask for it.
      If you did not request this sign-in, change your password immediately.
    </p>$b$,
    private.fn_html_escape(coalesce(v_user.first_name, 'User')), v_otp);

  perform private.fn_send_brevo_email(
    v_user.email,
    v_user.first_name,
    v_otp || ' is your AMS Login Verification Code',
    private.fn_email_shell('Attendance Monitoring System - Two-Factor Authentication',
      'linear-gradient(135deg,#0D47A1 0%,#2196F3 100%)', v_body)
  );

  return jsonb_build_object('success', true);
end;
$$;

revoke all on function public.fn_request_login_otp() from public, anon;
grant execute on function public.fn_request_login_otp() to authenticated;

-- 5. Account activation email (Admin only), sent after fn_admin_create_user
create or replace function public.fn_send_activation_email(p_user_id uuid, p_origin text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user record;
  v_link text;
  v_body text;
begin
  if not exists (select 1 from public.users where id = auth.uid() and role = 'admin') then
    return jsonb_build_object('success', false, 'error', 'Forbidden: administrators only.');
  end if;

  select id, email, first_name, last_name, role, activation_token, is_activated
  into v_user
  from public.users where id = p_user_id;

  if not found or v_user.activation_token is null or v_user.is_activated then
    return jsonb_build_object('success', false, 'error', 'No pending activation for this user.');
  end if;

  v_link := rtrim(coalesce(nullif(p_origin, ''), 'http://127.0.0.1:5500'), '/')
            || '/activate.html?token=' || v_user.activation_token;

  v_body := format($b$
    <p style="font-size:16px;color:#0D47A1;font-weight:700;">Hello, %s!</p>
    <p style="font-size:13.5px;line-height:1.6;color:#4A657E;">
      An account has been created for you in the <strong>Bestlink College Attendance Monitoring System</strong>
      as a <strong>%s</strong>. Activate your account to receive your official sign-in credentials.
    </p>
    <div style="text-align:center;margin:28px 0;">
      <a href="%s" target="_blank" style="display:inline-block;background:linear-gradient(135deg,#2196F3 0%%,#0D47A1 100%%);color:#ffffff;text-decoration:none;padding:13px 32px;border-radius:8px;font-size:14.5px;font-weight:700;">Activate My Account</a>
    </div>
    <div style="background:#E3F2FD;border:1px solid #90CAF9;border-radius:10px;padding:14px;font-size:12px;color:#0D47A1;line-height:1.5;">
      <strong>Important:</strong> You must activate your account first. Your Username/ID and temporary password will be sent after activation.
    </div>$b$,
    private.fn_html_escape(trim(coalesce(v_user.first_name, '') || ' ' || coalesce(v_user.last_name, ''))),
    upper(v_user.role),
    private.fn_html_escape(v_link));

  perform private.fn_send_brevo_email(
    v_user.email,
    trim(coalesce(v_user.first_name, '') || ' ' || coalesce(v_user.last_name, '')),
    'Action Required: Activate your BCP Attendance Monitoring Account',
    private.fn_email_shell('Attendance Monitoring System - Account Activation',
      'linear-gradient(135deg,#0D47A1 0%,#2196F3 100%)', v_body)
  );

  return jsonb_build_object('success', true);
end;
$$;

revoke all on function public.fn_send_activation_email(uuid, text) from public, anon;
grant execute on function public.fn_send_activation_email(uuid, text) to authenticated;

-- 6. Activation + credentials email in one server-side step.
-- Overload of fn_activate_user_account(p_token); the original 1-arg signature is kept intact.
create or replace function public.fn_activate_user_account(p_token text, p_origin text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_result jsonb;
  v_user jsonb;
  v_name text;
  v_identifier text;
  v_body text;
begin
  v_result := public.fn_activate_user_account(p_token);

  if coalesce((v_result->>'success')::boolean, false) is not true then
    return v_result;
  end if;

  v_user := v_result->'user';
  v_name := trim(coalesce(v_user->>'first_name', '') || ' ' || coalesce(v_user->>'last_name', ''));
  v_identifier := coalesce(v_user->>'student_number', v_user->>'employee_number', v_user->>'email');

  v_body := format($b$
    <p style="font-size:16px;color:#0D47A1;font-weight:700;">Congratulations, %s!</p>
    <p style="font-size:13.5px;line-height:1.6;color:#4A657E;">
      Your <strong>%s</strong> account has been activated. Below are your official credentials:
    </p>
    <table style="width:100%%;background:#E3F2FD;border:1.5px solid #90CAF9;border-radius:12px;padding:14px 18px;font-size:13px;">
      <tr><td style="color:#4A657E;font-weight:600;padding:6px 0;">Login Identifier</td><td style="font-family:monospace;font-weight:700;text-align:right;">%s</td></tr>
      <tr><td style="color:#4A657E;font-weight:600;padding:6px 0;">Registered Email</td><td style="font-family:monospace;font-weight:700;text-align:right;">%s</td></tr>
      <tr><td style="color:#4A657E;font-weight:600;padding:6px 0;">Initial Password</td><td style="font-family:monospace;font-weight:700;text-align:right;">%s</td></tr>
    </table>
    <div style="text-align:center;margin:28px 0;">
      <a href="%s" target="_blank" style="display:inline-block;background:linear-gradient(135deg,#2196F3 0%%,#0D47A1 100%%);color:#ffffff;text-decoration:none;padding:13px 32px;border-radius:8px;font-size:14.5px;font-weight:700;">Proceed to Sign In</a>
    </div>
    <p style="font-size:12px;color:#829DB5;line-height:1.5;border-top:1px solid #E3F2FD;padding-top:16px;">
      <strong>Security Reminder:</strong> A 2-Step Verification code will be sent to this email every time you sign in.
    </p>$b$,
    private.fn_html_escape(v_name),
    upper(coalesce(v_user->>'role', 'user')),
    private.fn_html_escape(v_identifier),
    private.fn_html_escape(v_user->>'email'),
    private.fn_html_escape(coalesce(v_user->>'initial_password', 'Provided by your Administrator')),
    private.fn_html_escape(rtrim(coalesce(nullif(p_origin, ''), 'http://127.0.0.1:5500'), '/') || '/index.html'));

  begin
    perform private.fn_send_brevo_email(
      v_user->>'email',
      v_name,
      'Your BCP AMS Account is Ready - Official Login Credentials',
      private.fn_email_shell('Account Successfully Activated',
        'linear-gradient(135deg,#10B981 0%,#0D47A1 100%)', v_body)
    );
  exception when others then
    v_result := v_result || jsonb_build_object('email_warning', sqlerrm);
  end;

  return v_result;
end;
$$;

grant execute on function public.fn_activate_user_account(text, text) to anon, authenticated, service_role;
