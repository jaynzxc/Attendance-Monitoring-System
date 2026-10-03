-- Migration: 20261004000005_student_qr_geolocation_geofence.sql
-- Enforces 15-meter classroom geolocation perimeter for student QR scans

-- 1. Helper function for Haversine distance in meters
CREATE OR REPLACE FUNCTION public.fn_haversine_distance_meters(
  lat1 float8,
  lon1 float8,
  lat2 float8,
  lon2 float8
)
RETURNS float8
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  R float8 := 6371000; -- Earth radius in meters
  dlat float8;
  dlon float8;
  a float8;
  c float8;
BEGIN
  IF lat1 IS NULL OR lon1 IS NULL OR lat2 IS NULL OR lon2 IS NULL THEN
    RETURN NULL;
  END IF;

  dlat := radians(lat2 - lat1);
  dlon := radians(lon2 - lon1);
  a := sin(dlat / 2.0)^2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon / 2.0)^2;
  c := 2.0 * atan2(sqrt(a), sqrt(1.0 - a));
  RETURN R * c;
END;
$$;

-- 2. Update fn_submit_student_qr_scan with 15m Geolocation Enforcement
CREATE OR REPLACE FUNCTION public.fn_submit_student_qr_scan(
  p_session_token text DEFAULT NULL,
  p_student_lat float8 DEFAULT NULL,
  p_student_lng float8 DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_id uuid;
  v_student record;
  v_session record;
  v_recent_scan timestamptz;
  v_status text := 'present';
  v_minutes_late int := 0;
  v_cutoff_time timestamptz;
  v_now timestamptz := now();
  v_today date := (now() AT TIME ZONE 'Asia/Manila')::date;
  v_section_id uuid;
  v_session_id uuid := NULL;
  v_new_log_id uuid;
  v_geo_distance float8 := NULL;
  v_max_radius float8 := 15.0; -- 15m default institutional perimeter
BEGIN
  -- Authenticate student caller
  v_student_id := auth.uid();
  IF v_student_id IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Authentication required. Please sign in.'
    );
  END IF;

  -- Verify student profile
  SELECT id, role, section_id, status, first_name, last_name, student_number
  INTO v_student
  FROM public.users
  WHERE id = v_student_id;

  IF NOT FOUND THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Student record not found.'
    );
  END IF;

  v_section_id := v_student.section_id;

  -- Check 5-minute anti-passback cooldown
  SELECT scanned_at INTO v_recent_scan
  FROM public.attendance_logs
  WHERE student_id = v_student_id
    AND scanned_at >= (v_now - interval '5 minutes')
    AND is_voided = false
  ORDER BY scanned_at DESC
  LIMIT 1;

  IF v_recent_scan IS NOT NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Anti-passback active: You have already checked in recently. Please wait 5 minutes between scans.',
      'cooldown', true
    );
  END IF;

  -- Validate active session if session token is provided
  IF p_session_token IS NOT NULL AND trim(p_session_token) <> '' THEN
    SELECT s.id, s.section_id, s.status, s.present_cutoff, s.session_end, s.geo_radius_meters, s.teacher_lat, s.teacher_lng
    INTO v_session
    FROM public.attendance_sessions s
    WHERE (s.session_token = trim(p_session_token) OR s.id::text = trim(p_session_token))
      AND s.status = 'active'
    LIMIT 1;

    IF FOUND THEN
      v_session_id := v_session.id;
      IF v_session.section_id IS NOT NULL THEN
        v_section_id := v_session.section_id;
      END IF;

      -- ── 15-METER GEOLOCATION GEOFENCE VERIFICATION ──
      IF v_session.teacher_lat IS NOT NULL AND v_session.teacher_lng IS NOT NULL THEN
        v_max_radius := COALESCE(v_session.geo_radius_meters, 15.0);

        IF p_student_lat IS NULL OR p_student_lng IS NULL THEN
          RETURN json_build_object(
            'success', false,
            'error', 'GPS location is required for classroom QR verification. Please enable device location.',
            'geo_error', true
          );
        END IF;

        v_geo_distance := fn_haversine_distance_meters(
          v_session.teacher_lat,
          v_session.teacher_lng,
          p_student_lat,
          p_student_lng
        );

        IF v_geo_distance > v_max_radius THEN
          RETURN json_build_object(
            'success', false,
            'error', 'Geolocation mismatch: You are ' || round(v_geo_distance::numeric, 1)::text || 'm away from the classroom. You must be within ' || round(v_max_radius::numeric)::text || 'm to record attendance.',
            'geo_error', true,
            'distance_meters', round(v_geo_distance::numeric, 1),
            'max_radius', v_max_radius
          );
        END IF;
      END IF;

      -- Check cutoff from session
      IF v_session.present_cutoff IS NOT NULL THEN
        IF v_now > v_session.present_cutoff THEN
          v_status := 'late';
          v_minutes_late := GREATEST(1, EXTRACT(EPOCH FROM (v_now - v_session.present_cutoff)) / 60)::int;
        ELSE
          v_status := 'present';
          v_minutes_late := 0;
        END IF;
      END IF;
    ELSE
      -- Standalone QR or unrecognized session token -> standard 08:00 AM Manila cutoff
      IF (EXTRACT(HOUR FROM (v_now AT TIME ZONE 'Asia/Manila')) > 8 OR 
         (EXTRACT(HOUR FROM (v_now AT TIME ZONE 'Asia/Manila')) = 8 AND EXTRACT(MINUTE FROM (v_now AT TIME ZONE 'Asia/Manila')) > 0)) THEN
        v_status := 'late';
        v_minutes_late := ((EXTRACT(HOUR FROM (v_now AT TIME ZONE 'Asia/Manila')) - 8) * 60 + EXTRACT(MINUTE FROM (v_now AT TIME ZONE 'Asia/Manila')))::int;
      ELSE
        v_status := 'present';
        v_minutes_late := 0;
      END IF;
    END IF;
  ELSE
    -- No session token -> standard 08:00 AM Manila cutoff
    IF (EXTRACT(HOUR FROM (v_now AT TIME ZONE 'Asia/Manila')) > 8 OR 
       (EXTRACT(HOUR FROM (v_now AT TIME ZONE 'Asia/Manila')) = 8 AND EXTRACT(MINUTE FROM (v_now AT TIME ZONE 'Asia/Manila')) > 0)) THEN
      v_status := 'late';
      v_minutes_late := ((EXTRACT(HOUR FROM (v_now AT TIME ZONE 'Asia/Manila')) - 8) * 60 + EXTRACT(MINUTE FROM (v_now AT TIME ZONE 'Asia/Manila')))::int;
    ELSE
      v_status := 'present';
      v_minutes_late := 0;
    END IF;
  END IF;

  -- Fallback section_id if student has none assigned yet
  IF v_section_id IS NULL THEN
    SELECT id INTO v_section_id FROM public.sections LIMIT 1;
  END IF;

  -- 1. Insert into attendance_logs
  INSERT INTO public.attendance_logs (
    student_id,
    section_id,
    session_id,
    scan_method,
    event_type,
    status,
    scanned_at,
    student_lat,
    student_lng,
    is_manual,
    is_voided
  ) VALUES (
    v_student_id,
    v_section_id,
    v_session_id,
    'qr',
    'time_in',
    v_status,
    v_now,
    p_student_lat,
    p_student_lng,
    false,
    false
  )
  RETURNING id INTO v_new_log_id;

  -- 2. Upsert into attendance_summary for today
  INSERT INTO public.attendance_summary (
    user_id,
    summary_date,
    status,
    minutes_late,
    time_in,
    scan_method
  ) VALUES (
    v_student_id,
    v_today,
    v_status,
    v_minutes_late,
    v_now,
    'qr'
  )
  ON CONFLICT (user_id, summary_date)
  DO UPDATE SET
    status = CASE 
      WHEN attendance_summary.status = 'present' THEN 'present' 
      ELSE EXCLUDED.status 
    END,
    time_in = COALESCE(attendance_summary.time_in, EXCLUDED.time_in),
    minutes_late = CASE 
      WHEN attendance_summary.status = 'present' THEN 0 
      ELSE EXCLUDED.minutes_late 
    END,
    scan_method = EXCLUDED.scan_method;

  RETURN json_build_object(
    'success', true,
    'log_id', v_new_log_id,
    'status', v_status,
    'minutes_late', v_minutes_late,
    'scanned_at', v_now,
    'time_formatted', to_char(v_now AT TIME ZONE 'Asia/Manila', 'HH12:MI AM'),
    'distance_meters', v_geo_distance
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_haversine_distance_meters(float8, float8, float8, float8) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.fn_submit_student_qr_scan(text, float8, float8) TO authenticated, anon;
