-- =====================================================================
-- KB STYLISH BLUEPRINT V3.1 - PHASE 4: STYLIST PORTAL
-- Migration 4: Audit-Logged Safety Details RPC
-- =====================================================================
--
-- Purpose: Provide access to customer PII (allergies) with full audit trail
-- GDPR Article 30: Every access logged with reason
-- Used only when stylist clicks "View Safety Details" button
--
-- =====================================================================

CREATE OR REPLACE FUNCTION public.get_customer_safety_details(
  p_stylist_id UUID,
  p_booking_id UUID,
  p_reason TEXT
)
RETURNS JSONB
SECURITY DEFINER  -- Audit logging requires elevated access to private schema
SET search_path = 'public', 'private', 'auth', 'pg_temp'
LANGUAGE plpgsql
AS $$
DECLARE
  v_booking RECORD;
BEGIN
  -- ========================================================================
  -- SECURITY LAYER 1: Verify stylist role
  -- ========================================================================
  
  IF NOT public.user_has_role(p_stylist_id, 'stylist') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Unauthorized: Stylist role required',
      'code', 'UNAUTHORIZED'
    );
  END IF;

  -- ========================================================================
  -- SECURITY LAYER 2: Verify stylist owns this booking
  -- ========================================================================
  
  SELECT 
    b.id,
    b.customer_user_id,
    b.stylist_user_id,
    b.metadata,
    b.start_time
  INTO v_booking
  FROM public.bookings b
  WHERE b.id = p_booking_id
    AND b.stylist_user_id = p_stylist_id;  -- CRITICAL: Ownership check
  
  IF v_booking IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Booking not found or access denied',
      'code', 'NOT_FOUND'
    );
  END IF;

  -- ========================================================================
  -- VALIDATION: Require access reason
  -- ========================================================================
  
  IF p_reason IS NULL OR LENGTH(TRIM(p_reason)) < 10 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Access reason required (minimum 10 characters)',
      'code', 'INVALID_REASON'
    );
  END IF;

  -- ========================================================================
  -- AUDIT LOG: Record PII access (GDPR Article 30)
  -- ========================================================================
  
  INSERT INTO private.customer_data_access_log (
    stylist_user_id,
    booking_id,
    customer_user_id,
    data_type,
    access_reason,
    accessed_at,
    ip_address,
    user_agent
  ) VALUES (
    p_stylist_id,
    p_booking_id,
    v_booking.customer_user_id,
    'allergy_details',
    p_reason,
    NOW(),
    inet_client_addr(),  -- Capture IP for accountability
    current_setting('request.headers', true)::json->>'user-agent'
  );

  -- ========================================================================
  -- RETURN: Safety-critical data only
  -- ========================================================================
  
  RETURN jsonb_build_object(
    'success', true,
    'data', jsonb_build_object(
      'allergies', v_booking.metadata->>'allergies',
      'safetyNotes', v_booking.metadata->>'safety_notes',
      'bookingDate', v_booking.start_time
    ),
    'auditLogged', true,
    'message', 'Access logged for compliance'
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM,
    'code', 'INTERNAL_ERROR'
  );
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.get_customer_safety_details TO authenticated;

COMMENT ON FUNCTION public.get_customer_safety_details IS 
'Provides access to customer PII (allergies, safety notes) with full audit trail. Every access logged to customer_data_access_log per GDPR Article 30. Requires reason for access. SECURITY DEFINER with role verification and ownership checks. Used when stylist clicks "View Safety Details" button.';

-- =====================================================================
-- VERIFICATION
-- =====================================================================

-- Test query (as authenticated stylist):
-- SELECT public.get_customer_safety_details(
--   p_stylist_id := auth.uid(),
--   p_booking_id := 'booking-uuid',
--   p_reason := 'Preparing for service, need to review allergy information'
-- );
--
-- Verify audit log entry was created:
-- SELECT * FROM private.customer_data_access_log 
-- WHERE booking_id = 'booking-uuid'
-- ORDER BY accessed_at DESC LIMIT 1;
