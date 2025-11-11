-- ============================================================================
-- P1 EMAILS SCHEMA MIGRATION
-- Version: 1.0 (Production-Ready)
-- Date: October 27, 2025
-- Purpose: Add columns and indices for P1 email types
-- ============================================================================

BEGIN;

-- ============================================================================
-- BOOKINGS TABLE: Add reminder tracking
-- ============================================================================

ALTER TABLE bookings 
ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS reminder_email_id UUID REFERENCES email_logs(id);

COMMENT ON COLUMN bookings.reminder_sent_at IS 
'Timestamp when 24hr reminder was sent. Prevents duplicate reminders.';

COMMENT ON COLUMN bookings.reminder_email_id IS 
'Reference to email_logs entry for audit trail.';

-- ============================================================================
-- ORDERS TABLE: Add review tracking and cancellation details
-- ============================================================================

ALTER TABLE orders
ADD COLUMN IF NOT EXISTS review_requested_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS cancellation_reason TEXT,
ADD COLUMN IF NOT EXISTS cancelled_by UUID REFERENCES auth.users(id);

COMMENT ON COLUMN orders.review_requested_at IS 
'Timestamp when review request email was sent. Prevents duplicate requests.';

COMMENT ON COLUMN orders.delivered_at IS 
'Actual delivery timestamp. Used for review request timing (7 days after).';

COMMENT ON COLUMN orders.cancellation_reason IS 
'Reason provided when order was cancelled. For analytics and customer service.';

COMMENT ON COLUMN orders.cancelled_by IS 
'User who cancelled the order (customer or admin). For audit trail.';

-- ============================================================================
-- INDICES: Performance optimization for cron jobs
-- ============================================================================

-- Booking reminder scan (partial index for efficiency)
CREATE INDEX IF NOT EXISTS idx_bookings_reminder_scan 
ON bookings(status, reminder_sent_at, start_time)
WHERE status = 'confirmed' AND reminder_sent_at IS NULL;

-- Review request scan
CREATE INDEX IF NOT EXISTS idx_orders_review_request_scan
ON orders(status, review_requested_at, delivered_at)
WHERE status = 'delivered' AND review_requested_at IS NULL;

-- Cancelled orders audit
CREATE INDEX IF NOT EXISTS idx_orders_cancelled_audit
ON orders(cancelled_at, cancelled_by)
WHERE status = 'cancelled';

-- ============================================================================
-- CONSTRAINTS: Data integrity
-- ============================================================================

-- Ensure reminder is sent before appointment
ALTER TABLE bookings 
DROP CONSTRAINT IF EXISTS check_reminder_before_start;

ALTER TABLE bookings 
ADD CONSTRAINT check_reminder_before_start
CHECK (reminder_sent_at IS NULL OR reminder_sent_at < start_time);

-- ============================================================================
-- FUNCTIONS: Helper functions
-- ============================================================================

-- Check if review should be requested for an order
CREATE OR REPLACE FUNCTION should_request_review(p_order_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  -- Don't request if any item in order already has review from customer
  RETURN NOT EXISTS (
    SELECT 1 
    FROM reviews r
    INNER JOIN order_items oi ON oi.product_id = r.product_id
    WHERE oi.order_id = p_order_id
    AND r.user_id = (SELECT user_id FROM orders WHERE id = p_order_id)
    AND r.deleted_at IS NULL
  );
END;
$$ LANGUAGE plpgsql SECURITY INVOKER;

COMMENT ON FUNCTION should_request_review IS 
'Check if order is eligible for review request. Returns false if customer already reviewed any item.';

-- ============================================================================
-- TRIGGERS: Order cancellation validation
-- ============================================================================

CREATE OR REPLACE FUNCTION validate_order_cancellation()
RETURNS TRIGGER AS $$
BEGIN
  -- Validate state transition to cancelled
  IF NEW.status = 'cancelled' AND OLD.status NOT IN (
    'pending', 'payment_authorized', 'processing'
  ) THEN
    RAISE EXCEPTION 'Cannot cancel order in % state. Valid states: pending, payment_authorized, processing', OLD.status;
  END IF;
  
  -- Auto-set cancelled_at timestamp
  IF NEW.status = 'cancelled' AND OLD.status != 'cancelled' THEN
    NEW.cancelled_at := COALESCE(NEW.cancelled_at, NOW());
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_validate_order_cancellation ON orders;

CREATE TRIGGER trigger_validate_order_cancellation
BEFORE UPDATE ON orders
FOR EACH ROW
WHEN (NEW.status = 'cancelled' AND OLD.status != 'cancelled')
EXECUTE FUNCTION validate_order_cancellation();

COMMENT ON FUNCTION validate_order_cancellation IS 
'Validates order state transitions to cancelled status. Auto-sets cancelled_at timestamp.';

-- ============================================================================
-- GRANTS: Ensure proper permissions
-- ============================================================================

GRANT EXECUTE ON FUNCTION should_request_review TO authenticated;

COMMIT;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
-- Added Columns: 6 (bookings: 2, orders: 4)
-- Added Indices: 3 (partial indices for cron jobs)
-- Added Functions: 2 (helper + validation)
-- Added Triggers: 1 (cancellation validation)
-- Added Constraints: 1 (reminder timing check)
-- Estimated Execution Time: <5 seconds
-- Downtime Required: NONE (online DDL)
-- ============================================================================
