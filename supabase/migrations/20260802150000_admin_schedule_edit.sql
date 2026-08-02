-- Admin schedule editing
--
-- Adds the missing backend for editing an existing stylist schedule. Until now the
-- admin UI could only create: ScheduleManagementClient rendered a disabled
-- "Edit (Coming Soon)" button because nothing existed to call.
--
-- Why a new replace RPC rather than reusing admin_update_stylist_schedule:
-- that function takes a single schedule_id and only rewrites start/end time. It
-- cannot add a working day, and it cannot remove one. Editing a week through it
-- would mean N non-atomic round trips plus a delete path that does not exist.
--
-- admin_replace_stylist_schedule swaps the whole active week in one transaction,
-- which also closes a live hazard in admin_create_stylist_schedule: that function
-- only INSERTs, so invoking it twice for the same stylist appends duplicate rows
-- until it collides with the UNIQUE (stylist_user_id, day_of_week, effective_from)
-- constraint and surfaces a raw SQL error.
--
-- Rollback: DROP FUNCTION public.admin_replace_stylist_schedule(uuid, jsonb, date, date);
-- and re-apply the previous admin_get_all_schedules body (this migration only adds
-- two keys to its jsonb payload, so the old body remains compatible with older clients).

BEGIN;

CREATE OR REPLACE FUNCTION public.admin_replace_stylist_schedule(
  p_stylist_id uuid,
  p_schedules jsonb,
  p_effective_from date DEFAULT NULL::date,
  p_effective_until date DEFAULT NULL::date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
DECLARE
  v_day_schedule JSONB;
  v_created_count INTEGER := 0;
  v_removed_count INTEGER := 0;
  v_effective_from_date DATE;
  v_old_schedule JSONB;
  v_seen_days INTEGER[] := ARRAY[]::INTEGER[];
  v_day INTEGER;
BEGIN
  PERFORM private.assert_admin();

  IF NOT EXISTS (
    SELECT 1 FROM public.stylist_profiles WHERE user_id = p_stylist_id AND is_active = true
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Stylist not found or inactive',
      'code', 'NOT_FOUND'
    );
  END IF;

  IF p_schedules IS NULL OR jsonb_array_length(p_schedules) = 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'At least one working day is required',
      'code', 'VALIDATION_ERROR'
    );
  END IF;

  v_effective_from_date := COALESCE(p_effective_from, CURRENT_DATE);

  -- stylist_schedules carries two contradictory constraints on this pair:
  --   check_effective_date_range  allows effective_from <= effective_until
  --   stylist_schedules_check2    demands effective_until >  effective_from
  -- The stricter one wins, so reject equality here with a readable message rather
  -- than letting the INSERT raise a bare 23514.
  IF p_effective_until IS NOT NULL AND p_effective_until <= v_effective_from_date THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'End date must be later than the start date',
      'code', 'INVALID_DATE_RANGE'
    );
  END IF;

  -- Validate every day before mutating anything, so a bad payload cannot leave a
  -- stylist with their old schedule deleted and no replacement.
  FOR v_day_schedule IN SELECT * FROM jsonb_array_elements(p_schedules)
  LOOP
    v_day := (v_day_schedule->>'day_of_week')::INTEGER;

    IF v_day IS NULL OR v_day < 0 OR v_day > 6 THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', format('Invalid day_of_week: %s', v_day_schedule->>'day_of_week'),
        'code', 'VALIDATION_ERROR'
      );
    END IF;

    IF v_day = ANY(v_seen_days) THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', format('Duplicate entry for day %s', v_day),
        'code', 'VALIDATION_ERROR'
      );
    END IF;
    v_seen_days := array_append(v_seen_days, v_day);

    IF (v_day_schedule->>'start_time') IS NULL OR (v_day_schedule->>'end_time') IS NULL THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', format('Missing start or end time for day %s', v_day),
        'code', 'VALIDATION_ERROR'
      );
    END IF;

    IF (v_day_schedule->>'start_time')::TIME >= (v_day_schedule->>'end_time')::TIME THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', format('Invalid time range for day %s', v_day),
        'code', 'INVALID_TIME'
      );
    END IF;
  END LOOP;

  -- Snapshot the outgoing week for the audit trail before it is removed.
  SELECT COALESCE(jsonb_agg(
           jsonb_build_object(
             'day_of_week', day_of_week,
             'start_time', start_time_local,
             'end_time', end_time_local,
             'effective_from', effective_from,
             'effective_until', effective_until
           ) ORDER BY day_of_week
         ), '[]'::jsonb)
    INTO v_old_schedule
    FROM public.stylist_schedules
   WHERE stylist_user_id = p_stylist_id AND is_active = true;

  DELETE FROM public.stylist_schedules
   WHERE stylist_user_id = p_stylist_id AND is_active = true;
  GET DIAGNOSTICS v_removed_count = ROW_COUNT;

  -- start_time_utc / end_time_utc intentionally mirror the local values. The slot
  -- engine (get_effective_schedule) reads only the _local columns; the _utc pair is
  -- vestigial. Writing a genuine Asia/Kathmandu offset here would make this function
  -- inconsistent with every existing row for no behavioural gain.
  FOR v_day_schedule IN SELECT * FROM jsonb_array_elements(p_schedules)
  LOOP
    INSERT INTO public.stylist_schedules (
      stylist_user_id, day_of_week,
      start_time_local, end_time_local,
      start_time_utc, end_time_utc,
      effective_from, effective_until, is_active
    ) VALUES (
      p_stylist_id,
      (v_day_schedule->>'day_of_week')::INTEGER,
      (v_day_schedule->>'start_time')::TIME,
      (v_day_schedule->>'end_time')::TIME,
      (v_day_schedule->>'start_time')::TIME,
      (v_day_schedule->>'end_time')::TIME,
      v_effective_from_date,
      p_effective_until,
      true
    );
    v_created_count := v_created_count + 1;
  END LOOP;

  INSERT INTO public.schedule_change_log (
    stylist_user_id, changed_by, change_type, old_value, new_value
  ) VALUES (
    p_stylist_id,
    auth.uid(),
    'update',
    jsonb_build_object('schedules', v_old_schedule),
    jsonb_build_object(
      'schedules', p_schedules,
      'effective_from', v_effective_from_date,
      'effective_until', p_effective_until
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'created_count', v_created_count,
    'removed_count', v_removed_count,
    'message', 'Schedule updated successfully',
    'effective_from', v_effective_from_date,
    'effective_until', p_effective_until
  );

EXCEPTION
  -- assert_admin() raises 42501. Without this branch the catch-all below would
  -- relabel an authorisation failure as INTERNAL_ERROR, which callers map to 500
  -- instead of 403. Sibling admin RPCs have that flaw; this one does not.
  WHEN insufficient_privilege THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM,
      'code', 'FORBIDDEN'
    );
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM,
      'code', 'INTERNAL_ERROR'
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_replace_stylist_schedule(uuid, jsonb, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_replace_stylist_schedule(uuid, jsonb, date, date) TO authenticated;

COMMENT ON FUNCTION public.admin_replace_stylist_schedule(uuid, jsonb, date, date) IS
'Atomically replaces a stylist''s active weekly schedule. Validates the full payload before deleting anything. Admin only.';


-- Extend the admin listing so the edit modal can prefill effective dates. Purely
-- additive: existing keys are unchanged, so older clients keep working.
CREATE OR REPLACE FUNCTION public.admin_get_all_schedules()
RETURNS TABLE(stylist_user_id uuid, display_name text, has_schedule boolean, schedules jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
BEGIN
  IF NOT public.user_has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Unauthorized: Admin role required' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    sp.user_id AS stylist_user_id,
    sp.display_name,
    COUNT(ss.id) > 0 AS has_schedule,
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', ss.id,
          'day_of_week', ss.day_of_week,
          'start_time_local', ss.start_time_local,
          'end_time_local', ss.end_time_local,
          'is_active', ss.is_active,
          'effective_from', ss.effective_from,
          'effective_until', ss.effective_until
        ) ORDER BY ss.day_of_week
      ) FILTER (WHERE ss.id IS NOT NULL),
      '[]'::jsonb
    ) AS schedules
  FROM stylist_profiles sp
  LEFT JOIN stylist_schedules ss ON ss.stylist_user_id = sp.user_id AND ss.is_active = true
  WHERE sp.is_active = true
  GROUP BY sp.user_id, sp.display_name
  ORDER BY has_schedule, sp.display_name;
END;
$function$;

COMMIT;
