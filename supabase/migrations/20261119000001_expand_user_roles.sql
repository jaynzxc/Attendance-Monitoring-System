-- Bestlink College of the Philippines Attendance Monitoring System (AMS)
-- Subsystem of SMS 1 (School Management System)
-- Migration: Expand User Roles and Access Control Model
-- Authoritative Reference: docs/DATA.md §3, docs/Security.md §3, user_type_expansion_plan.md

-- 1. Expand users.role check constraint to include all 8 institutional roles
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE public.users ADD CONSTRAINT users_role_check 
  CHECK (role IN ('super_admin', 'admin', 'staff', 'acad_official', 'monitoring', 'faculty', 'student', 'teacher'));

-- 2. Add email column to parent_contacts for dual-channel alerts (SMS + Gmail)
ALTER TABLE public.parent_contacts ADD COLUMN IF NOT EXISTS email text;

-- 3. Create room_schedules table for Monitoring proctors if not exists
CREATE TABLE IF NOT EXISTS public.room_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_number text NOT NULL,
  building text NOT NULL DEFAULT 'Main',
  section_id uuid NOT NULL REFERENCES public.sections(id) ON DELETE CASCADE,
  faculty_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  day_of_week int NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
  start_time time NOT NULL,
  end_time time NOT NULL,
  subject text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS on room_schedules
ALTER TABLE public.room_schedules ENABLE ROW LEVEL SECURITY;

-- 4. Update auth_role / current_user_role helper function
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS text AS $$
  SELECT role FROM public.users WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- 5. RLS Policies for Super Admin (Full administrative access)
DROP POLICY IF EXISTS "super_admin_manage_users" ON public.users;
CREATE POLICY "super_admin_manage_users" ON public.users
FOR ALL TO authenticated
USING (current_user_role() = 'super_admin');

DROP POLICY IF EXISTS "super_admin_manage_devices" ON public.scan_devices;
CREATE POLICY "super_admin_manage_devices" ON public.scan_devices
FOR ALL TO authenticated
USING (current_user_role() = 'super_admin');

DROP POLICY IF EXISTS "super_admin_view_audit" ON public.audit_log;
CREATE POLICY "super_admin_view_audit" ON public.audit_log
FOR SELECT TO authenticated
USING (current_user_role() = 'super_admin');

DROP POLICY IF EXISTS "super_admin_manage_schedules" ON public.room_schedules;
CREATE POLICY "super_admin_manage_schedules" ON public.room_schedules
FOR ALL TO authenticated
USING (current_user_role() = 'super_admin');
