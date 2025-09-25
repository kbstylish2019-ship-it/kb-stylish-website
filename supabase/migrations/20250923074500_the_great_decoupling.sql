-- =====================================================================
-- THE GREAT DECOUPLING - Database Schema Migration
-- =====================================================================
-- Architect: Principal Full-Stack Architect
-- Mission: Separate Products and Bookings into distinct entities
-- Date: 2025-09-23
-- =====================================================================

-- PART 1: Create the new booking_reservations table
-- This holds temporary, unconfirmed bookings with TTL
CREATE TABLE IF NOT EXISTS public.booking_reservations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_user_id UUID NOT NULL REFERENCES public.user_profiles(id),
    stylist_user_id UUID NOT NULL REFERENCES public.user_profiles(id),
    service_id UUID NOT NULL REFERENCES public.services(id),
    
    -- Scheduling
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    
    -- Pricing
    price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
    
    -- Customer info
    customer_name TEXT NOT NULL,
    customer_phone TEXT,
    customer_email TEXT,
    customer_notes TEXT,
    
    -- Status tracking
    status TEXT NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved', 'confirmed', 'expired', 'cancelled')),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '15 minutes'),
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes for performance
CREATE INDEX idx_booking_reservations_customer ON booking_reservations(customer_user_id);
CREATE INDEX idx_booking_reservations_stylist ON booking_reservations(stylist_user_id);
CREATE INDEX idx_booking_reservations_status ON booking_reservations(status);
CREATE INDEX idx_booking_reservations_expires ON booking_reservations(expires_at) WHERE status = 'reserved';

-- PART 2: Remove failed booking-variant logic
-- Drop the broken function that tried to create product variants for bookings
DROP FUNCTION IF EXISTS public.create_booking_with_variant CASCADE;
DROP FUNCTION IF EXISTS public.create_booking_variant CASCADE;

-- PART 3: Create new clean function for booking reservations
CREATE OR REPLACE FUNCTION public.create_booking_reservation(
    p_customer_id UUID,
    p_stylist_id UUID,
    p_service_id UUID,
    p_start_time TIMESTAMPTZ,
    p_customer_name TEXT,
    p_customer_phone TEXT DEFAULT NULL,
    p_customer_email TEXT DEFAULT NULL,
    p_customer_notes TEXT DEFAULT NULL,
    p_ttl_minutes INTEGER DEFAULT 15
) RETURNS JSONB AS $$
DECLARE
    v_reservation_id UUID;
    v_end_time TIMESTAMPTZ;
    v_duration_minutes INTEGER;
    v_price_cents INTEGER;
    v_service_name TEXT;
    v_stylist_name TEXT;
    v_conflicts INTEGER;
BEGIN
    -- Get service details
    SELECT 
        name,
        COALESCE(ss.duration_override_minutes, s.duration_minutes) as duration,
        COALESCE(ss.price_override_cents, s.price_cents) as price
    INTO v_service_name, v_duration_minutes, v_price_cents
    FROM public.services s
    LEFT JOIN public.stylist_services ss ON ss.service_id = s.id AND ss.stylist_user_id = p_stylist_id
    WHERE s.id = p_service_id;
    
    IF v_service_name IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Service not found',
            'code', 'SERVICE_NOT_FOUND'
        );
    END IF;
    
    -- Calculate end time
    v_end_time := p_start_time + (v_duration_minutes || ' minutes')::INTERVAL;
    
    -- Check for conflicts with existing bookings
    SELECT COUNT(*) INTO v_conflicts
    FROM public.bookings
    WHERE stylist_user_id = p_stylist_id
    AND status IN ('pending', 'confirmed')
    AND (
        (start_time, end_time) OVERLAPS (p_start_time, v_end_time)
    );
    
    -- Check for conflicts with other reservations
    SELECT COUNT(*) INTO v_conflicts
    FROM public.booking_reservations
    WHERE stylist_user_id = p_stylist_id
    AND status = 'reserved'
    AND expires_at > NOW()
    AND (
        (start_time, end_time) OVERLAPS (p_start_time, v_end_time)
    );
    
    IF v_conflicts > 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Time slot is no longer available',
            'code', 'SLOT_UNAVAILABLE'
        );
    END IF;
    
    -- Get stylist name
    SELECT display_name INTO v_stylist_name
    FROM public.stylist_profiles
    WHERE user_id = p_stylist_id;
    
    -- Create the reservation
    INSERT INTO public.booking_reservations (
        customer_user_id,
        stylist_user_id,
        service_id,
        start_time,
        end_time,
        price_cents,
        customer_name,
        customer_phone,
        customer_email,
        customer_notes,
        expires_at
    )
    VALUES (
        p_customer_id,
        p_stylist_id,
        p_service_id,
        p_start_time,
        v_end_time,
        v_price_cents,
        p_customer_name,
        p_customer_phone,
        p_customer_email,
        p_customer_notes,
        NOW() + (p_ttl_minutes || ' minutes')::INTERVAL
    )
    RETURNING id INTO v_reservation_id;
    
    -- Return success with reservation details
    RETURN jsonb_build_object(
        'success', true,
        'reservation_id', v_reservation_id,
        'service_name', v_service_name,
        'stylist_name', v_stylist_name,
        'start_time', p_start_time,
        'end_time', v_end_time,
        'price_cents', v_price_cents,
        'expires_at', NOW() + (p_ttl_minutes || ' minutes')::INTERVAL
    );
    
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', SQLERRM,
            'code', 'DATABASE_ERROR'
        );
END;
$$ LANGUAGE plpgsql;

-- PART 4: Function to confirm reservations and create actual bookings
CREATE OR REPLACE FUNCTION public.confirm_booking_reservation(
    p_reservation_id UUID,
    p_payment_intent_id TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
    v_reservation RECORD;
    v_booking_id UUID;
BEGIN
    -- Get the reservation
    SELECT * INTO v_reservation
    FROM public.booking_reservations
    WHERE id = p_reservation_id
    AND status = 'reserved'
    AND expires_at > NOW()
    FOR UPDATE;
    
    IF v_reservation IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Reservation not found or expired',
            'code', 'RESERVATION_INVALID'
        );
    END IF;
    
    -- Create the actual booking
    INSERT INTO public.bookings (
        customer_user_id,
        stylist_user_id,
        service_id,
        start_time,
        end_time,
        price_cents,
        customer_name,
        customer_phone,
        customer_email,
        customer_notes,
        payment_intent_id,
        status
    )
    VALUES (
        v_reservation.customer_user_id,
        v_reservation.stylist_user_id,
        v_reservation.service_id,
        v_reservation.start_time,
        v_reservation.end_time,
        v_reservation.price_cents,
        v_reservation.customer_name,
        v_reservation.customer_phone,
        v_reservation.customer_email,
        v_reservation.customer_notes,
        p_payment_intent_id,
        'confirmed'
    )
    RETURNING id INTO v_booking_id;
    
    -- Mark reservation as confirmed
    UPDATE public.booking_reservations
    SET status = 'confirmed', updated_at = NOW()
    WHERE id = p_reservation_id;
    
    RETURN jsonb_build_object(
        'success', true,
        'booking_id', v_booking_id,
        'reservation_id', p_reservation_id
    );
    
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', SQLERRM,
            'code', 'DATABASE_ERROR'
        );
END;
$$ LANGUAGE plpgsql;

-- PART 5: Cleanup function for expired reservations
CREATE OR REPLACE FUNCTION public.cleanup_expired_reservations() RETURNS void AS $$
BEGIN
    UPDATE public.booking_reservations
    SET status = 'expired', updated_at = NOW()
    WHERE status = 'reserved'
    AND expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- PART 6: Grant permissions
GRANT EXECUTE ON FUNCTION public.create_booking_reservation TO service_role;
GRANT EXECUTE ON FUNCTION public.confirm_booking_reservation TO service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_reservations TO service_role;

-- PART 7: RLS Policies for booking_reservations
ALTER TABLE public.booking_reservations ENABLE ROW LEVEL SECURITY;

-- Users can see their own reservations
CREATE POLICY user_view_own_reservations ON public.booking_reservations
    FOR SELECT USING (auth.uid() = customer_user_id);

-- Service role can do everything
CREATE POLICY service_role_all ON public.booking_reservations
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- PART 8: Add helpful comments
COMMENT ON TABLE public.booking_reservations IS 'Temporary booking reservations with TTL, separate from product cart';
COMMENT ON FUNCTION public.create_booking_reservation IS 'Creates a temporary booking reservation that expires after TTL';
COMMENT ON FUNCTION public.confirm_booking_reservation IS 'Converts a reservation into an actual booking during checkout';
