-- ============================================================================
-- CRITICAL FIX: create_booking_reservation price_cents bug
-- ============================================================================
-- BUG: Function tried to SELECT price_cents from services table
-- FIX: Column is actually named base_price_cents
-- IMPACT: Booking reservation creation was completely broken
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_booking_reservation(
  p_customer_id UUID,
  p_stylist_id UUID,
  p_service_id UUID,
  p_start_time TIMESTAMPTZ,
  p_customer_name TEXT,
  p_customer_phone TEXT DEFAULT NULL,
  p_customer_email TEXT DEFAULT NULL,
  p_customer_address_line1 TEXT DEFAULT NULL,
  p_customer_city TEXT DEFAULT NULL,
  p_customer_state TEXT DEFAULT 'Bagmati Province',
  p_customer_postal_code TEXT DEFAULT NULL,
  p_customer_country TEXT DEFAULT 'Nepal',
  p_customer_notes TEXT DEFAULT NULL,
  p_ttl_minutes INT DEFAULT 15
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'private', 'pg_temp'
AS $$
DECLARE
  v_reservation_id UUID;
  v_end_time TIMESTAMPTZ;
  v_price_cents INT;
  v_service_name TEXT;
  v_stylist_name TEXT;
  v_duration_minutes INT;
BEGIN
  -- Validation: Check if customer is trying to book themselves
  IF p_customer_id = p_stylist_id THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Stylists cannot book appointments with themselves',
      'code', 'SELF_BOOKING'
    );
  END IF;

  -- Get service details (FIX: use base_price_cents, not price_cents)
  SELECT 
    name, 
    duration_minutes,
    base_price_cents  -- ✅ FIXED: was price_cents
  INTO 
    v_service_name,
    v_duration_minutes,
    v_price_cents
  FROM services
  WHERE id = p_service_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Service not found',
      'code', 'SERVICE_NOT_FOUND'
    );
  END IF;

  -- Calculate end time
  v_end_time := p_start_time + (v_duration_minutes || ' minutes')::INTERVAL;

  -- Get stylist display name
  SELECT display_name INTO v_stylist_name
  FROM stylist_profiles
  WHERE user_id = p_stylist_id;

  -- Check if slot is available
  IF EXISTS (
    SELECT 1 FROM bookings
    WHERE stylist_user_id = p_stylist_id
      AND status IN ('confirmed', 'pending', 'in_progress')
      AND (start_time, end_time) OVERLAPS (p_start_time, v_end_time)
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'This time slot is no longer available',
      'code', 'SLOT_UNAVAILABLE'
    );
  END IF;

  -- Check for overlapping reservations
  IF EXISTS (
    SELECT 1 FROM booking_reservations
    WHERE stylist_user_id = p_stylist_id
      AND status = 'reserved'
      AND expires_at > NOW()
      AND (start_time, end_time) OVERLAPS (p_start_time, v_end_time)
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'This time slot is currently reserved',
      'code', 'SLOT_RESERVED'
    );
  END IF;

  -- Create reservation WITH address fields
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
    customer_address_line1,
    customer_city,
    customer_state,
    customer_postal_code,
    customer_country,
    customer_notes,
    status,
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
    p_customer_address_line1,
    p_customer_city,
    p_customer_state,
    p_customer_postal_code,
    p_customer_country,
    p_customer_notes,
    'reserved',
    NOW() + (p_ttl_minutes || ' minutes')::INTERVAL
  )
  RETURNING id INTO v_reservation_id;

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
$$;

-- Ensure proper permissions
GRANT EXECUTE ON FUNCTION public.create_booking_reservation TO service_role;
GRANT EXECUTE ON FUNCTION public.create_booking_reservation TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_booking_reservation TO anon;

COMMENT ON FUNCTION public.create_booking_reservation IS 
'Creates a temporary booking reservation with 15-minute TTL. 
FIXED: Now correctly uses base_price_cents from services table.';
