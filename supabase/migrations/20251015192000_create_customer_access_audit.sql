-- =====================================================================
-- KB STYLISH BLUEPRINT V3.1 - PHASE 4: STYLIST PORTAL
-- Migration 2: Customer Data Access Audit Log (GDPR Article 30)
-- =====================================================================
--
-- Purpose: Track all access to customer PII for compliance
-- GDPR Article 30: Record of processing activities
-- Privacy-by-Design: Audit trail prevents misuse of sensitive data
--
-- =====================================================================

CREATE TABLE private.customer_data_access_log (
  id BIGSERIAL PRIMARY KEY,
  stylist_user_id UUID NOT NULL REFERENCES public.stylist_profiles(user_id),
  booking_id UUID NOT NULL REFERENCES public.bookings(id),
  customer_user_id UUID NOT NULL REFERENCES auth.users(id),
  data_type TEXT NOT NULL CHECK (data_type IN ('allergy_details', 'contact_info', 'medical_notes')),
  access_reason TEXT NOT NULL,
  accessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_address INET,
  user_agent TEXT
);

-- Index for customer privacy queries ("who accessed my data?")
CREATE INDEX idx_access_log_customer 
  ON private.customer_data_access_log(customer_user_id, accessed_at DESC);

-- Index for stylist accountability queries
CREATE INDEX idx_access_log_stylist 
  ON private.customer_data_access_log(stylist_user_id, accessed_at DESC);

-- Index for booking-specific access history
CREATE INDEX idx_access_log_booking 
  ON private.customer_data_access_log(booking_id, accessed_at DESC);

COMMENT ON TABLE private.customer_data_access_log IS 
'GDPR Article 30: Record of processing activities. Tracks who accessed customer PII (allergies, medical info) and why. Critical for compliance and accountability.';

COMMENT ON COLUMN private.customer_data_access_log.data_type IS 
'Type of PII accessed: allergy_details, contact_info, or medical_notes.';

COMMENT ON COLUMN private.customer_data_access_log.access_reason IS 
'Why the stylist accessed this data (e.g., "Preparing for service", "Customer inquiry"). Required for GDPR compliance.';

-- =====================================================================
-- VERIFICATION
-- =====================================================================

-- Test query:
-- SELECT * FROM private.customer_data_access_log 
-- ORDER BY accessed_at DESC LIMIT 10;
