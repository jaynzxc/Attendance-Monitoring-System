-- Migration: 20261004000002_resolve_login_email_rpc.sql
-- Description: Allow unauthenticated users to resolve student/employee ID or admin alias to login email

CREATE OR REPLACE FUNCTION public.fn_resolve_login_email(p_identifier text)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT email
  FROM public.users
  WHERE student_number ILIKE trim(p_identifier)
     OR employee_number ILIKE trim(p_identifier)
     OR (role = 'admin' AND lower(trim(p_identifier)) IN ('admin', 'administrator', 'registrar'))
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.fn_resolve_login_email(text) TO anon, authenticated, service_role;
