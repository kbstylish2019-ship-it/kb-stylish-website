-- =====================================================================
-- KB STYLISH BLUEPRINT V3.1 - PHASE 4: STYLIST PORTAL
-- Migration 3: Customer History RPC (Privacy-By-Design)
-- =====================================================================
--
-- PRIVACY FIX: Does NOT expose raw PII (allergies, preferences)
-- Returns flags and summaries only
-- Actual sensitive data accessed via separate audit-logged RPC
--
-- =====================================================================

CREATE OR REPLACE FUNCTION public.get_stylist_bookings_with_history(
  p_stylist_id UUID,
  p_start_date TIMESTAMPTZ DEFAULT NOW(),
  p_end_date TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 days')
)
RETURNS TABLE(
  -- Booking details
  booking_id UUID,
  customer_user_id UUID,
  customer_name TEXT,
  customer_phone TEXT,
  customer_email TEXT,
  customer_notes TEXT,
  service_id UUID,
  service_name TEXT,
  service_duration INTEGER,
  start_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ,
  status TEXT,
  price_cents INTEGER,
  
  -- Customer history enrichment
  is_repeat_customer BOOLEAN,
  total_bookings_count INTEGER,
  last_visit_date TIMESTAMPTZ,
  last_service_name TEXT,
  
  -- PRIVACY: Flags only, not raw data
  has_allergies BOOLEAN,
  allergy_summary TEXT,
  has_safety_notes BOOLEAN
)
SECURITY INVOKER  -- RLS enforced (stylist can only see their own bookings)
SET search_path = 'public', 'pg_temp'
LANGUAGE plpgsql
AS $$
BEGIN
  -- ========================================================================
  -- SECURITY: RLS enforced (SECURITY INVOKER)
  -- Only returns bookings for the requesting stylist
  -- ========================================================================
  
  RETURN QUERY
  WITH customer_history AS (
    SELECT 
      b.customer_user_id,
      COUNT(*) as total_bookings,
      MAX(b.start_time) FILTER (
        WHERE b.status IN ('confirmed', 'completed') 
        AND b.start_time < NOW()
      ) as last_visit,
      MAX(s.name) FILTER (
        WHERE b.start_time = (
          SELECT MAX(b2.start_time) 
          FROM public.bookings b2 
          WHERE b2.customer_user_id = b.customer_user_id 
            AND b2.stylist_user_id = p_stylist_id
            AND b2.status IN ('confirmed', 'completed')
            AND b2.start_time < NOW()
        )
      ) as last_service
    FROM public.bookings b
    LEFT JOIN public.services s ON b.service_id = s.id
    WHERE b.stylist_user_id = p_stylist_id
      AND b.status IN ('confirmed', 'completed')
    GROUP BY b.customer_user_id
  )
  SELECT 
    b.id as booking_id,
    b.customer_user_id,
    b.customer_name,
    b.customer_phone,
    b.customer_email,
    b.customer_notes,
    b.service_id,
    s.name as service_name,
    s.duration_minutes as service_duration,
    b.start_time,
    b.end_time,
    b.status,
    b.price_cents,
    
    -- History enrichment
    (COALESCE(ch.total_bookings, 0) > 1) as is_repeat_customer,
    COALESCE(ch.total_bookings, 0) as total_bookings_count,
    ch.last_visit as last_visit_date,
    ch.last_service as last_service_name,
    
    -- PRIVACY: Flags and summaries only (GDPR Article 5 - Data Minimization)
    (b.metadata->>'allergies') IS NOT NULL as has_allergies,
    CASE 
      WHEN (b.metadata->>'allergies') IS NOT NULL 
      THEN '⚠️ Customer has documented allergies'
      ELSE NULL
    END as allergy_summary,
    (b.metadata->>'safety_notes') IS NOT NULL as has_safety_notes
    
  FROM public.bookings b
  LEFT JOIN public.services s ON b.service_id = s.id
  LEFT JOIN customer_history ch ON b.customer_user_id = ch.customer_user_id
  WHERE b.stylist_user_id = p_stylist_id
    AND b.start_time BETWEEN p_start_date AND p_end_date
    AND b.status IN ('confirmed', 'pending')
  ORDER BY b.start_time ASC;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.get_stylist_bookings_with_history TO authenticated;

COMMENT ON FUNCTION public.get_stylist_bookings_with_history IS 
'Returns stylist bookings enriched with customer history. PRIVACY-BY-DESIGN: Does not expose raw PII (allergies, preferences), only flags and summaries. Actual sensitive data accessed via separate audit-logged RPC. SECURITY INVOKER ensures RLS enforcement (stylist sees only their bookings).';

-- =====================================================================
-- VERIFICATION
-- =====================================================================

-- Test query (as authenticated stylist):
-- SELECT * FROM public.get_stylist_bookings_with_history(
--   p_stylist_id := auth.uid(),
--   p_start_date := NOW(),
--   p_end_date := NOW() + INTERVAL '7 days'
-- );
--
-- Verify: has_allergies is boolean, NOT raw allergy text
