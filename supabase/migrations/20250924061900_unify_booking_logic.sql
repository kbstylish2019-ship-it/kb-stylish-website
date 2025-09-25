-- =====================================================================
-- The Great Restoration: Phase 3 - Booking Engine Unification
-- =====================================================================
-- This migration establishes the single, definitive get_available_slots
-- function, eliminating redundancy and fixing schema inconsistencies
-- =====================================================================

-- Drop the existing function to ensure clean replacement
DROP FUNCTION IF EXISTS public.get_available_slots(uuid, uuid, date, text);

-- Create the definitive unified function
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
    status text,  -- RESTORATION: Unified status field (no redundant is_available)
    price_cents integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp  -- SECURITY: Pin search path
AS $$
DECLARE
    v_stylist_timezone text;
    v_service_duration integer;
    v_service_price integer;
    v_day_of_week integer;
    v_schedule record;
    v_target_date_utc date;
    v_slot_start_local time;
    v_slot_start_utc timestamptz;
    v_slot_end_utc timestamptz;
    v_break_start_utc timestamptz;
    v_break_end_utc timestamptz;
BEGIN
    -- Get stylist timezone
    SELECT u.timezone INTO v_stylist_timezone
    FROM public.user_profiles u
    WHERE u.user_id = p_stylist_id;
    
    IF v_stylist_timezone IS NULL THEN
        v_stylist_timezone := 'Asia/Kathmandu';
    END IF;
    
    -- Get service details
    SELECT 
        ss.duration_minutes,
        ss.price_cents
    INTO 
        v_service_duration,
        v_service_price
    FROM public.stylist_services ss
    WHERE ss.stylist_id = p_stylist_id 
      AND ss.service_id = p_service_id
      AND ss.is_active = true;
    
    -- Service not offered by stylist
    IF NOT FOUND THEN
        RETURN;
    END IF;
    
    -- Calculate day of week (0 = Sunday, 6 = Saturday)
    v_day_of_week := EXTRACT(DOW FROM p_target_date);
    
    -- Get schedule for this day
    SELECT * INTO v_schedule
    FROM public.stylist_schedules
    WHERE stylist_id = p_stylist_id
      AND day_of_week = v_day_of_week
      AND is_available = true;
    
    -- No schedule for this day
    IF NOT FOUND THEN
        RETURN;
    END IF;
    
    -- Convert target date to UTC for comparisons
    v_target_date_utc := (p_target_date::text || ' 00:00:00')::timestamp 
        AT TIME ZONE v_customer_timezone 
        AT TIME ZONE 'UTC';
    
    -- Generate slots
    v_slot_start_local := v_schedule.start_time_utc;  -- Note: Column named _utc but stores local time
    
    WHILE v_slot_start_local <= v_schedule.end_time_utc - (v_service_duration || ' minutes')::interval LOOP
        -- Convert slot to UTC timestamps
        v_slot_start_utc := (p_target_date::text || ' ' || v_slot_start_local::text)::timestamp 
            AT TIME ZONE v_stylist_timezone;
        v_slot_end_utc := v_slot_start_utc + (v_service_duration || ' minutes')::interval;
        
        -- Handle break times if configured
        IF v_schedule.break_start_time_utc IS NOT NULL AND v_schedule.break_end_time_utc IS NOT NULL THEN
            v_break_start_utc := (p_target_date::text || ' ' || v_schedule.break_start_time_utc::text)::timestamp 
                AT TIME ZONE v_stylist_timezone;
            v_break_end_utc := (p_target_date::text || ' ' || v_schedule.break_end_time_utc::text)::timestamp 
                AT TIME ZONE v_stylist_timezone;
            
            -- Skip slots that overlap with break
            IF (v_slot_start_utc < v_break_end_utc AND v_slot_end_utc > v_break_start_utc) THEN
                v_slot_start_local := v_slot_start_local + interval '30 minutes';
                CONTINUE;
            END IF;
        END IF;
        
        -- Skip past slots
        IF v_slot_start_utc <= now() THEN
            v_slot_start_local := v_slot_start_local + interval '30 minutes';
            CONTINUE;
        END IF;
        
        RETURN QUERY
        SELECT
            v_slot_start_utc,
            v_slot_end_utc,
            v_slot_start_utc AT TIME ZONE 'UTC' AT TIME ZONE v_customer_timezone,
            v_slot_end_utc AT TIME ZONE 'UTC' AT TIME ZONE v_customer_timezone,
            to_char(v_slot_start_utc AT TIME ZONE 'UTC' AT TIME ZONE v_customer_timezone, 'HH12:MI AM'),
            CASE
                -- Check for existing bookings
                WHEN EXISTS (
                    SELECT 1 FROM public.bookings b
                    WHERE b.stylist_id = p_stylist_id
                      AND b.status IN ('confirmed', 'in_progress')
                      AND tstzrange(b.start_time, b.end_time, '[)') && 
                          tstzrange(v_slot_start_utc, v_slot_end_utc, '[)')
                ) THEN 'booked'
                
                -- Check for active reservations
                WHEN EXISTS (
                    SELECT 1 FROM public.booking_reservations br
                    WHERE br.stylist_id = p_stylist_id
                      AND br.status = 'active'
                      AND br.expires_at > now()
                      AND tstzrange(br.slot_start_utc, br.slot_end_utc, '[)') && 
                          tstzrange(v_slot_start_utc, v_slot_end_utc, '[)')
                ) THEN 'reserved'
                
                -- Available
                ELSE 'available'
            END AS status,
            v_service_price;
        
        v_slot_start_local := v_slot_start_local + interval '30 minutes';
    END LOOP;
END;
$$;

-- Grant appropriate permissions for pre-login browsing
GRANT EXECUTE ON FUNCTION public.get_available_slots(uuid, uuid, date, text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_available_slots(uuid, uuid, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_available_slots(uuid, uuid, date, text) TO service_role;

-- Add helpful comment
COMMENT ON FUNCTION public.get_available_slots IS 'RESTORATION: Unified booking slot availability function. Returns slots with status (available/booked/reserved) for a stylist-service combination on a given date.';
