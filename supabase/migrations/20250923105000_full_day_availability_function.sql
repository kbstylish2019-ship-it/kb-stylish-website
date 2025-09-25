-- ============================================================================
-- WORLD-CLASS BOOKING ENGINE: Full Day Availability Function
-- ============================================================================
-- This function returns EVERY slot for a stylist's workday with precise status
-- Status: 'available' | 'booked' | 'in_break' | 'unavailable'
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_available_slots(
    p_stylist_id UUID,
    p_service_id UUID,
    p_target_date DATE,
    p_customer_timezone TEXT DEFAULT 'Asia/Kathmandu'
) RETURNS TABLE(
    slot_start_utc TIMESTAMPTZ,
    slot_end_utc TIMESTAMPTZ,
    slot_start_local TIMESTAMPTZ,
    slot_end_local TIMESTAMPTZ,
    slot_display TEXT,
    status TEXT,
    price_cents INTEGER
) AS $$
DECLARE
    v_service_duration INTEGER;
    v_service_price INTEGER;
    v_buffer_minutes INTEGER;
    v_stylist_timezone TEXT;
    v_day_of_week INTEGER;
    v_schedule RECORD;
    v_min_advance_time TIMESTAMPTZ;
    v_max_advance_time TIMESTAMPTZ;
    v_start_timestamp TIMESTAMPTZ;
    v_end_timestamp TIMESTAMPTZ;
    v_break_start TIMESTAMPTZ;
    v_break_end TIMESTAMPTZ;
BEGIN
    -- Get service details
    v_service_duration := get_service_duration(p_stylist_id, p_service_id);
    v_service_price := get_service_price(p_stylist_id, p_service_id);
    
    -- Get stylist settings
    SELECT 
        sp.booking_buffer_minutes,
        sp.timezone
    INTO 
        v_buffer_minutes,
        v_stylist_timezone
    FROM stylist_profiles sp
    WHERE sp.user_id = p_stylist_id
        AND sp.is_active = TRUE;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Stylist % not found or inactive', p_stylist_id;
    END IF;
    
    -- Calculate day of week (0=Sunday, 6=Saturday)
    v_day_of_week := EXTRACT(DOW FROM p_target_date);
    
    -- Get advance booking constraints from service
    SELECT 
        NOW() + (s.min_advance_hours || ' hours')::INTERVAL,
        NOW() + (s.max_advance_days || ' days')::INTERVAL
    INTO 
        v_min_advance_time,
        v_max_advance_time
    FROM services s
    WHERE s.id = p_service_id;
    
    -- Get the schedule for this day
    SELECT * INTO v_schedule
    FROM stylist_schedules ss
    WHERE ss.stylist_user_id = p_stylist_id
        AND ss.day_of_week = v_day_of_week
        AND ss.is_active = TRUE
        AND (ss.effective_from IS NULL OR ss.effective_from <= p_target_date)
        AND (ss.effective_until IS NULL OR ss.effective_until >= p_target_date)
    ORDER BY ss.effective_from DESC NULLS LAST
    LIMIT 1;
    
    IF NOT FOUND THEN
        -- No schedule for this day, return empty
        RETURN;
    END IF;
    
    -- Convert TIME to TIMESTAMPTZ for the target date in stylist's timezone
    v_start_timestamp := (p_target_date || ' ' || v_schedule.start_time_local)::TIMESTAMP AT TIME ZONE v_stylist_timezone;
    v_end_timestamp := (p_target_date || ' ' || v_schedule.end_time_local)::TIMESTAMP AT TIME ZONE v_stylist_timezone;
    
    -- Convert break times if they exist
    IF v_schedule.break_start_time_utc IS NOT NULL THEN
        v_break_start := (p_target_date || ' ' || v_schedule.break_start_time_utc)::TIMESTAMP AT TIME ZONE 'UTC';
        v_break_end := (p_target_date || ' ' || v_schedule.break_end_time_utc)::TIMESTAMP AT TIME ZONE 'UTC';
    END IF;
    
    -- Generate COMPLETE slot series with status determination
    RETURN QUERY
    WITH all_slots AS (
        -- Generate ALL time slots for the entire workday
        SELECT 
            slot_time AS slot_start,
            slot_time + (v_service_duration || ' minutes')::INTERVAL AS slot_end
        FROM generate_series(
            v_start_timestamp,
            v_end_timestamp - (v_service_duration || ' minutes')::INTERVAL,
            '30 minutes'::INTERVAL
        ) AS slot_time
    ),
    slot_status AS (
        SELECT 
            s.slot_start,
            s.slot_end,
            -- Determine comprehensive status for each slot
            CASE 
                -- Past slots
                WHEN s.slot_start < NOW() THEN 'unavailable'
                
                -- Outside advance booking window
                WHEN s.slot_start < v_min_advance_time THEN 'unavailable'
                WHEN s.slot_start > v_max_advance_time THEN 'unavailable'
                
                -- Break time check
                WHEN v_break_start IS NOT NULL 
                    AND s.slot_start >= v_break_start 
                    AND s.slot_start < v_break_end THEN 'in_break'
                    
                -- Check if slot overlaps with confirmed bookings
                WHEN EXISTS (
                    SELECT 1 
                    FROM bookings b
                    WHERE b.stylist_user_id = p_stylist_id
                        AND b.status NOT IN ('cancelled', 'no_show')
                        AND tstzrange(
                            b.start_time - (COALESCE(v_buffer_minutes, 0) || ' minutes')::INTERVAL,
                            b.end_time + (COALESCE(v_buffer_minutes, 0) || ' minutes')::INTERVAL
                        ) && tstzrange(s.slot_start, s.slot_end)
                ) THEN 'booked'
                
                -- Check if slot overlaps with active reservations
                WHEN EXISTS (
                    SELECT 1 
                    FROM booking_reservations br
                    WHERE br.stylist_user_id = p_stylist_id
                        AND br.status = 'reserved'
                        AND br.expires_at > NOW()
                        AND tstzrange(
                            br.start_time - (COALESCE(v_buffer_minutes, 0) || ' minutes')::INTERVAL,
                            br.end_time + (COALESCE(v_buffer_minutes, 0) || ' minutes')::INTERVAL
                        ) && tstzrange(s.slot_start, s.slot_end)
                ) THEN 'booked'
                
                -- Check if service would extend beyond work hours
                WHEN s.slot_end > v_end_timestamp THEN 'unavailable'
                
                -- Check if service would cross into break time
                WHEN v_break_start IS NOT NULL 
                    AND s.slot_start < v_break_start 
                    AND s.slot_end > v_break_start THEN 'unavailable'
                
                -- All checks passed - slot is available
                ELSE 'available'
            END AS status
        FROM all_slots s
    )
    SELECT 
        ss.slot_start::TIMESTAMPTZ AS slot_start_utc,
        ss.slot_end::TIMESTAMPTZ AS slot_end_utc,
        timezone(p_customer_timezone, ss.slot_start)::TIMESTAMPTZ AS slot_start_local,
        timezone(p_customer_timezone, ss.slot_end)::TIMESTAMPTZ AS slot_end_local,
        to_char(timezone(p_customer_timezone, ss.slot_start), 'HH24:MI') AS slot_display,
        ss.status AS status,
        v_service_price AS price_cents
    FROM slot_status ss
    ORDER BY ss.slot_start;
END;
$$ LANGUAGE plpgsql;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.get_available_slots TO service_role;
GRANT EXECUTE ON FUNCTION public.get_available_slots TO authenticated;

-- Add helpful comment
COMMENT ON FUNCTION public.get_available_slots IS 
'Returns ALL slots for a stylist workday with precise status: available, booked, in_break, or unavailable. 
This provides complete visibility for the frontend to render a clear, unambiguous booking interface.';
