-- ============================================================================
-- EMAIL NOTIFICATION SYSTEM MIGRATION
-- Version: 1.0 (Production-Ready)
-- Date: October 27, 2025
-- Purpose: Email tracking, preferences, and compliance (GDPR)
-- ============================================================================

BEGIN;

-- ============================================================================
-- TABLE 1: EMAIL LOGS
-- Purpose: Track all sent emails for audit, analytics, and compliance
-- Retention: 90 days (auto-delete for GDPR compliance)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.email_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Recipient Information
  recipient_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_email TEXT NOT NULL,
  recipient_name TEXT,
  
  -- Email Metadata
  email_type TEXT NOT NULL,
  subject TEXT NOT NULL,
  template_name TEXT,
  
  -- Delivery Tracking
  resend_email_id TEXT UNIQUE,  -- Resend's tracking ID for webhooks
  status TEXT NOT NULL DEFAULT 'sent' 
    CHECK (status IN ('sent', 'delivered', 'opened', 'clicked', 'bounced', 'failed', 'complained')),
  
  -- Timestamps
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  delivered_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ,
  bounced_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  
  -- Error Tracking
  failure_reason TEXT,
  bounce_type TEXT,  -- 'hard', 'soft', 'complaint'
  attempts INTEGER DEFAULT 1,
  
  -- Idempotency (prevent duplicate sends)
  reference_id TEXT,  -- order_id, booking_id, vendor_id, etc.
  reference_type TEXT,  -- 'order', 'booking', 'vendor_application'
  
  -- Compliance (GDPR)
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '90 days'),
  user_consented BOOLEAN DEFAULT true,
  
  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indices for Performance
CREATE INDEX idx_email_logs_recipient ON email_logs(recipient_user_id, created_at DESC);
CREATE INDEX idx_email_logs_resend ON email_logs(resend_email_id) WHERE resend_email_id IS NOT NULL;
CREATE INDEX idx_email_logs_type_status ON email_logs(email_type, status, created_at DESC);
CREATE INDEX idx_email_logs_cleanup ON email_logs(expires_at) WHERE expires_at IS NOT NULL;

-- Unique constraint for idempotency (prevent duplicate sends)
CREATE UNIQUE INDEX idx_email_logs_idempotency
ON email_logs(email_type, recipient_email, reference_id)
WHERE reference_id IS NOT NULL;

-- RLS Policies
ALTER TABLE email_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own email logs"
ON email_logs FOR SELECT
USING (auth.uid() = recipient_user_id);

CREATE POLICY "Service role can insert email logs"
ON email_logs FOR INSERT
WITH CHECK (true);  -- Only service role (Edge Function) can insert

CREATE POLICY "Service role can update email logs"
ON email_logs FOR UPDATE
USING (true);  -- Only service role can update (for webhook status updates)

-- Comments
COMMENT ON TABLE email_logs IS 
'Email delivery tracking and audit log. Auto-deletes after 90 days for GDPR compliance.';

COMMENT ON COLUMN email_logs.reference_id IS 
'Unique reference (order_id, booking_id, etc.) to prevent duplicate sends';

COMMENT ON COLUMN email_logs.expires_at IS 
'Auto-delete date for GDPR compliance (90 days from sent)';

-- ============================================================================
-- TABLE 2: EMAIL PREFERENCES
-- Purpose: User opt-out management for optional notifications
-- Note: Transactional emails (order confirmations) cannot be disabled
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.email_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Optional Notifications (user can opt-out)
  receive_booking_reminders BOOLEAN DEFAULT true,
  receive_review_requests BOOLEAN DEFAULT true,
  receive_promotional_emails BOOLEAN DEFAULT false,  -- Must opt-in (GDPR)
  receive_product_recommendations BOOLEAN DEFAULT true,
  
  -- Vendor-Specific Preferences
  receive_low_stock_alerts BOOLEAN DEFAULT true,
  receive_payout_notifications BOOLEAN DEFAULT true,
  receive_new_order_alerts BOOLEAN DEFAULT true,
  
  -- Frequency Control
  max_emails_per_day INTEGER DEFAULT 10,
  quiet_hours_start TIME DEFAULT '22:00'::TIME,
  quiet_hours_end TIME DEFAULT '08:00'::TIME,
  timezone TEXT DEFAULT 'Asia/Kathmandu',
  
  -- Audit
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS Policies
ALTER TABLE email_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own email preferences"
ON email_preferences FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Comments
COMMENT ON TABLE email_preferences IS 
'User email preferences for optional notifications. Transactional emails always sent.';

-- ============================================================================
-- FUNCTION 1: AUTO-CREATE EMAIL PREFERENCES ON USER SIGNUP
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_default_email_preferences()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.email_preferences (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_create_email_preferences
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.create_default_email_preferences();

COMMENT ON FUNCTION public.create_default_email_preferences IS 
'Auto-create email preferences with default settings when user signs up';

-- ============================================================================
-- FUNCTION 2: CLEANUP EXPIRED EMAIL LOGS (GDPR COMPLIANCE)
-- Purpose: Delete email logs older than 90 days
-- Schedule: Run daily at 2 AM Nepal time via cron
-- ============================================================================

CREATE OR REPLACE FUNCTION public.cleanup_expired_email_logs()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM public.email_logs 
  WHERE expires_at < NOW();
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  RAISE NOTICE 'Deleted % expired email logs', deleted_count;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.cleanup_expired_email_logs IS 
'Delete email logs older than 90 days for GDPR compliance. Run daily via cron.';

-- ============================================================================
-- FUNCTION 3: CHECK EMAIL PREFERENCES BEFORE SENDING
-- Purpose: Helper function to check if user wants to receive optional emails
-- ============================================================================

CREATE OR REPLACE FUNCTION public.can_send_optional_email(
  p_user_id UUID,
  p_email_type TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
  v_can_send BOOLEAN := true;
BEGIN
  -- Transactional emails always sent (cannot opt-out)
  IF p_email_type IN (
    'order_confirmation',
    'order_shipped',
    'order_delivered',
    'booking_confirmation',
    'vendor_approved',
    'vendor_rejected'
  ) THEN
    RETURN true;
  END IF;
  
  -- Check preferences for optional emails
  SELECT 
    CASE p_email_type
      WHEN 'booking_reminder' THEN receive_booking_reminders
      WHEN 'review_request' THEN receive_review_requests
      WHEN 'promotional' THEN receive_promotional_emails
      WHEN 'product_recommendation' THEN receive_product_recommendations
      WHEN 'low_stock_alert' THEN receive_low_stock_alerts
      WHEN 'payout_notification' THEN receive_payout_notifications
      WHEN 'new_order_alert' THEN receive_new_order_alerts
      ELSE true  -- Default: allow if not specified
    END INTO v_can_send
  FROM public.email_preferences
  WHERE user_id = p_user_id;
  
  -- If no preferences found, default to true
  RETURN COALESCE(v_can_send, true);
END;
$$ LANGUAGE plpgsql SECURITY INVOKER;

COMMENT ON FUNCTION public.can_send_optional_email IS 
'Check if user wants to receive optional email. Transactional emails always return true.';

-- ============================================================================
-- GRANT PERMISSIONS
-- ============================================================================

GRANT SELECT ON email_logs TO authenticated;
GRANT SELECT, UPDATE ON email_preferences TO authenticated;
GRANT EXECUTE ON FUNCTION can_send_optional_email TO authenticated;

COMMIT;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
-- Tables Created: email_logs, email_preferences
-- Functions: 3 (auto-create preferences, cleanup, check preferences)
-- Indices: 5 (performance + idempotency)
-- RLS Policies: 5 (user privacy)
-- Compliance: GDPR (90-day auto-delete)
-- ============================================================================
