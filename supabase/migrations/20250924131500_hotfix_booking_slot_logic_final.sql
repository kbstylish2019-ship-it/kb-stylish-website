-- =====================================================================
-- FINAL HOTFIX: Codify corrected booking slot logic (production-parity)
-- =====================================================================
-- This migration replaces get_available_slots with the schema-accurate
-- implementation verified in production. It removes all incorrect column
-- references and ensures deterministic slot discovery.
-- =====================================================================

DROP FUNCTION IF EXISTS public.get_available_slots(uuid, uuid, date, text);

CREATE OR REPLACE FUNCTION public.get_available_slots(
    p_stylist_id uuid,
    p_service_id uuid,
    p_target_date date,
    p_customer_timezone text DEFAULT 'Asia/Kathmandu'
)
RETURNS TABLE (
    slot_start_utc timestamptz,
    slot_end_utc timestamptz,
    slot_start_local timestamptz,
    slot_end_local timestamptz,
    slot_display text,
    status text,
    price_cents integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_stylist_timezone text;
    v_service_duration integer;
    v_service_price integer;
    v_day_of_week integer;
    v_schedule record;
    v_slot_start_local time;
    v_slot_start_utc timestamptz;
    v_slot_end_utc timestamptz;
    v_break_start_utc timestamptz;
    v_break_end_utc timestamptz;
BEGIN
    -- Default timezone (no timezone column in user_profiles)
    v_stylist_timezone := 'Asia/Kathmandu';

    -- Service details: prefer stylist custom overrides, else base service
    SELECT 
        COALESCE(ss.custom_duration_minutes, s.duration_minutes, 60) AS duration,
        COALESCE(ss.custom_price_cents, s.base_price_cents, 0) AS price
    INTO 
        v_service_duration,
        v_service_price
    FROM public.stylist_services ss
    JOIN public.services s ON s.id = ss.service_id
    WHERE ss.stylist_user_id = p_stylist_id
      AND ss.service_id = p_service_id
      AND ss.is_available = true;

    IF NOT FOUND THEN
        RETURN; -- Stylist does not offer this service (or not available)
    END IF;

    v_day_of_week := EXTRACT(DOW FROM p_target_date);

    -- Active schedule for the day
    SELECT * INTO v_schedule
    FROM public.stylist_schedules
    WHERE stylist_user_id = p_stylist_id
      AND day_of_week = v_day_of_week
      AND is_active = true;

    IF NOT FOUND THEN
        RETURN; -- No working hours this day
    END IF;

    -- Generate candidate slots in local schedule window
    v_slot_start_local := v_schedule.start_time_utc; -- column naming uses _utc but stores local time

    WHILE v_slot_start_local <= v_schedule.end_time_utc - (v_service_duration || ' minutes')::interval LOOP
        -- Convert to UTC using stylist timezone
        v_slot_start_utc := (p_target_date::text || ' ' || v_slot_start_local::text)::timestamp 
            AT TIME ZONE v_stylist_timezone;
        v_slot_end_utc := v_slot_start_utc + (v_service_duration || ' minutes')::interval;

        -- Respect break times when present
        IF v_schedule.break_start_time_utc IS NOT NULL AND v_schedule.break_end_time_utc IS NOT NULL THEN
            v_break_start_utc := (p_target_date::text || ' ' || v_schedule.break_start_time_utc::text)::timestamp 
                AT TIME ZONE v_stylist_timezone;
            v_break_end_utc := (p_target_date::text || ' ' || v_schedule.break_end_time_utc::text)::timestamp 
                AT TIME ZONE v_stylist_timezone;

            IF (v_slot_start_utc < v_break_end_utc AND v_slot_end_utc > v_break_start_utc) THEN
                v_slot_start_local := v_slot_start_local + interval '30 minutes';
                CONTINUE;
            END IF;
        END IF;

        -- Skip slots in the past
        IF v_slot_start_utc <= now() THEN
            v_slot_start_local := v_slot_start_local + interval '30 minutes';
            CONTINUE;
        END IF;

        RETURN QUERY
        SELECT
            v_slot_start_utc,
            v_slot_end_utc,
            -- Convert to customer timezone for display but keep timestamptz
            v_slot_start_utc AT TIME ZONE 'UTC' AT TIME ZONE p_customer_timezone,
            v_slot_end_utc AT TIME ZONE 'UTC' AT TIME ZONE p_customer_timezone,
            to_char(v_slot_start_utc AT TIME ZONE 'UTC' AT TIME ZONE p_customer_timezone, 'HH12:MI AM') AS slot_display,
            CASE
                WHEN EXISTS (
                    SELECT 1 FROM public.bookings b
                    WHERE b.stylist_user_id = p_stylist_id
                      AND b.status IN ('confirmed', 'in_progress')
                      AND tstzrange(b.start_time, b.end_time, '[)') && 
                          tstzrange(v_slot_start_utc, v_slot_end_utc, '[)')
                ) THEN 'booked'
                WHEN EXISTS (
                    SELECT 1 FROM public.booking_reservations br
                    WHERE br.stylist_user_id = p_stylist_id
                      AND br.status = 'active'
                      AND br.expires_at > now()
                      AND tstzrange(br.start_time, br.end_time, '[)') && 
                          tstzrange(v_slot_start_utc, v_slot_end_utc, '[)')
                ) THEN 'reserved'
                ELSE 'available'
            END AS status,
            v_service_price;

        v_slot_start_local := v_slot_start_local + interval '30 minutes';
    END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_available_slots(uuid, uuid, date, text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_available_slots(uuid, uuid, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_available_slots(uuid, uuid, date, text) TO service_role;

COMMENT ON FUNCTION public.get_available_slots IS 'FINAL: Schema-accurate booking slot availability. Uses stylist_user_id/is_available and correct reservations/bookings columns. Returns status and price.';
