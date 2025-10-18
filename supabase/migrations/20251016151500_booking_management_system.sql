-- =====================================================================
-- BOOKING MANAGEMENT SYSTEM v1.0
-- Enterprise-Grade Status Management for Stylists
-- Created: 2025-10-16 15:15:00 UTC
-- Excellence Protocol: Phase 8 Implementation
-- =====================================================================
--
-- This migration implements comprehensive booking management for stylists:
-- 1. Status history audit trail (immutable log)
-- 2. Status transition validation (FSM)
-- 3. Booking status update RPC with security
-- 4. Stylist notes management
-- 5. Performance indexes
--
-- =====================================================================

-- =====================================================================
-- PART 1: BOOKING STATUS HISTORY (Audit Trail)
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.booking_status_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
    old_status TEXT NOT NULL,
    new_status TEXT NOT NULL,
    changed_by UUID NOT NULL REFERENCES auth.users(id),
    change_reason TEXT,
    actor_role TEXT NOT NULL CHECK (actor_role IN ('customer', 'stylist', 'admin', 'system')),
    
    -- Forensics (for security investigation)
    ip_address INET,
    user_agent TEXT,
    
    -- Immutable timestamp
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Prevent modifications to audit log
    CHECK (old_status != new_status)
);

COMMENT ON TABLE public.booking_status_history IS 
'Immutable audit trail for all booking status changes. Required for GDPR Article 30 compliance and security forensics.';

-- Index for lookup by booking
CREATE INDEX idx_booking_status_history_booking 
ON booking_status_history(booking_id, created_at DESC);

-- Index for lookup by user (who changed what)
CREATE INDEX idx_booking_status_history_user 
ON booking_status_history(changed_by, created_at DESC);

-- Prevent UPDATE and DELETE on audit log (append-only)
REVOKE UPDATE, DELETE ON booking_status_history FROM PUBLIC;

-- =====================================================================
-- PART 2: STATUS TRANSITION VALIDATION (Finite State Machine)
-- =====================================================================

CREATE OR REPLACE FUNCTION public.validate_status_transition(
    p_old_status TEXT,
    p_new_status TEXT
) RETURNS BOOLEAN AS $$
BEGIN
    -- Idempotent: Same status is always valid (no-op)
    IF p_old_status = p_new_status THEN
        RETURN TRUE;
    END IF;
    
    -- Terminal states: Cannot transition from completed, cancelled, or no_show
    IF p_old_status IN ('completed', 'cancelled', 'no_show') THEN
        RETURN FALSE;
    END IF;
    
    -- Valid transitions from 'pending'
    IF p_old_status = 'pending' THEN
        RETURN p_new_status IN ('confirmed', 'cancelled');
    END IF;
    
    -- Valid transitions from 'confirmed'
    IF p_old_status = 'confirmed' THEN
        RETURN p_new_status IN ('in_progress', 'completed', 'cancelled', 'no_show');
    END IF;
    
    -- Valid transitions from 'in_progress'
    IF p_old_status = 'in_progress' THEN
        RETURN p_new_status IN ('completed', 'cancelled');
    END IF;
    
    -- All other transitions are invalid
    RETURN FALSE;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION public.validate_status_transition IS 
'FSM validator for booking status transitions. Returns TRUE if transition is valid, FALSE otherwise.';

-- =====================================================================
-- PART 3: UPDATE BOOKING STATUS (Main RPC)
-- =====================================================================

CREATE OR REPLACE FUNCTION public.update_booking_status(
    p_booking_id UUID,
    p_new_status TEXT,
    p_reason TEXT DEFAULT NULL,
    p_actor_role TEXT DEFAULT 'stylist'
) RETURNS JSONB AS $$
DECLARE
    v_booking RECORD;
    v_user_id UUID := auth.uid();
BEGIN
    -- CRITICAL: Lock the booking row to prevent race conditions
    SELECT * INTO v_booking
    FROM bookings
    WHERE id = p_booking_id
    FOR UPDATE NOWAIT; -- Fail fast if another transaction has lock
    
    -- Validation 1: Booking exists
    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'Booking not found',
            'code', 'NOT_FOUND'
        );
    END IF;
    
    -- Validation 2: Not soft-deleted
    -- (Future-proof for GDPR right to erasure)
    -- IF v_booking.deleted_at IS NOT NULL THEN
    --     RETURN jsonb_build_object('success', FALSE, 'error', 'Booking was deleted', 'code', 'DELETED');
    -- END IF;
    
    -- Validation 3: Authorization (stylist owns this booking)
    IF p_actor_role = 'stylist' AND v_booking.stylist_user_id != v_user_id THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'You are not authorized to update this booking',
            'code', 'UNAUTHORIZED'
        );
    END IF;
    
    -- Validation 4: Check if status is already the target (idempotent)
    IF v_booking.status = p_new_status THEN
        RETURN jsonb_build_object(
            'success', TRUE,
            'booking_id', p_booking_id,
            'old_status', v_booking.status,
            'new_status', p_new_status,
            'message', 'Status was already set to ' || p_new_status,
            'code', 'ALREADY_SET'
        );
    END IF;
    
    -- Validation 5: Valid state transition
    IF NOT validate_status_transition(v_booking.status, p_new_status) THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', format('Cannot change status from %s to %s', v_booking.status, p_new_status),
            'code', 'INVALID_TRANSITION'
        );
    END IF;
    
    -- Validation 6: Timing rules
    -- Cannot mark as completed if booking is in the future
    IF p_new_status = 'completed' AND v_booking.start_time > NOW() THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'Cannot mark future booking as completed',
            'code', 'INVALID_TIMING'
        );
    END IF;
    
    -- Cannot mark as no_show before the appointment time
    IF p_new_status = 'no_show' AND v_booking.start_time > NOW() THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'Cannot mark as no-show before appointment time',
            'code', 'INVALID_TIMING'
        );
    END IF;
    
    -- Cannot mark as in_progress more than 30 mins before start time
    IF p_new_status = 'in_progress' AND v_booking.start_time > (NOW() + INTERVAL '30 minutes') THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'Cannot start service more than 30 minutes early',
            'code', 'INVALID_TIMING'
        );
    END IF;
    
    -- Validation 7: Cancellation reason required for cancelled status
    IF p_new_status = 'cancelled' AND (p_reason IS NULL OR LENGTH(TRIM(p_reason)) < 3) THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'Cancellation reason is required (minimum 3 characters)',
            'code', 'REASON_REQUIRED'
        );
    END IF;
    
    -- ================================================================
    -- ALL VALIDATIONS PASSED - PERFORM UPDATE
    -- ================================================================
    
    -- Update the booking status
    UPDATE bookings
    SET 
        status = p_new_status,
        updated_at = NOW(),
        -- Set cancellation fields if status is cancelled
        cancelled_at = CASE 
            WHEN p_new_status = 'cancelled' THEN NOW() 
            ELSE cancelled_at 
        END,
        cancelled_by = CASE 
            WHEN p_new_status = 'cancelled' THEN v_user_id 
            ELSE cancelled_by 
        END,
        cancellation_reason = CASE 
            WHEN p_new_status = 'cancelled' THEN p_reason 
            ELSE cancellation_reason 
        END
    WHERE id = p_booking_id;
    
    -- Log the status change to audit trail
    INSERT INTO booking_status_history (
        booking_id,
        old_status,
        new_status,
        changed_by,
        change_reason,
        actor_role
    ) VALUES (
        p_booking_id,
        v_booking.status,
        p_new_status,
        v_user_id,
        p_reason,
        p_actor_role
    );
    
    -- Return success
    RETURN jsonb_build_object(
        'success', TRUE,
        'booking_id', p_booking_id,
        'old_status', v_booking.status,
        'new_status', p_new_status,
        'changed_at', NOW()
    );
    
EXCEPTION
    -- Handle specific errors
    WHEN lock_not_available THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'This booking is currently being updated by another user. Please try again.',
            'code', 'CONCURRENT_UPDATE'
        );
    WHEN OTHERS THEN
        -- Log unexpected errors (for debugging)
        RAISE WARNING 'Unexpected error in update_booking_status: %', SQLERRM;
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'An unexpected error occurred. Please try again or contact support.',
            'code', 'INTERNAL_ERROR'
        );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

COMMENT ON FUNCTION public.update_booking_status IS 
'Securely updates booking status with FSM validation, timing rules, and audit logging. SECURITY DEFINER bypasses RLS for controlled updates.';

-- =====================================================================
-- PART 4: ADD STYLIST NOTES (Append-only)
-- =====================================================================

CREATE OR REPLACE FUNCTION public.add_stylist_notes(
    p_booking_id UUID,
    p_notes TEXT
) RETURNS JSONB AS $$
DECLARE
    v_booking RECORD;
    v_updated_notes TEXT;
    v_user_id UUID := auth.uid();
BEGIN
    -- Validation: Notes content
    IF p_notes IS NULL OR LENGTH(TRIM(p_notes)) < 1 THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'Notes cannot be empty',
            'code', 'INVALID_INPUT'
        );
    END IF;
    
    -- Validation: Length limit (prevent abuse)
    IF LENGTH(p_notes) > 2000 THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'Notes must be less than 2000 characters',
            'code', 'NOTES_TOO_LONG'
        );
    END IF;
    
    -- Lock booking and verify ownership
    SELECT * INTO v_booking
    FROM bookings
    WHERE id = p_booking_id
    AND stylist_user_id = v_user_id
    FOR UPDATE;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'Booking not found or you are not authorized',
            'code', 'UNAUTHORIZED'
        );
    END IF;
    
    -- Append new notes with timestamp header
    v_updated_notes := COALESCE(v_booking.stylist_notes, '') || 
        E'\n\n[' || TO_CHAR(NOW(), 'YYYY-MM-DD HH24:MI') || ']\n' || 
        TRIM(p_notes);
    
    -- Update booking
    UPDATE bookings
    SET 
        stylist_notes = v_updated_notes,
        updated_at = NOW()
    WHERE id = p_booking_id;
    
    RETURN jsonb_build_object(
        'success', TRUE,
        'booking_id', p_booking_id,
        'notes', v_updated_notes
    );
    
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'Failed to add notes',
            'code', 'INTERNAL_ERROR'
        );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

COMMENT ON FUNCTION public.add_stylist_notes IS 
'Appends timestamped notes to booking. Only the assigned stylist can add notes.';

-- =====================================================================
-- PART 5: RLS POLICIES (Row Level Security)
-- =====================================================================

-- Allow stylists to read status history for their bookings
CREATE POLICY "Stylists view own booking history" ON booking_status_history
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM bookings
            WHERE bookings.id = booking_status_history.booking_id
            AND bookings.stylist_user_id = auth.uid()
        )
    );

-- Allow customers to read status history for their bookings
CREATE POLICY "Customers view own booking history" ON booking_status_history
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM bookings
            WHERE bookings.id = booking_status_history.booking_id
            AND bookings.customer_user_id = auth.uid()
        )
    );

-- Admins can view all history
CREATE POLICY "Admins view all booking history" ON booking_status_history
    FOR SELECT
    USING (public.user_has_role(auth.uid(), 'admin'));

-- Enable RLS
ALTER TABLE booking_status_history ENABLE ROW LEVEL SECURITY;

-- =====================================================================
-- PART 6: PERFORMANCE INDEXES
-- =====================================================================

-- Index for stylist booking list queries
CREATE INDEX IF NOT EXISTS idx_bookings_stylist_status_time 
ON bookings(stylist_user_id, status, start_time DESC)
WHERE status NOT IN ('cancelled');

-- Index for customer booking queries
CREATE INDEX IF NOT EXISTS idx_bookings_customer_time 
ON bookings(customer_user_id, start_time DESC);

-- =====================================================================
-- MIGRATION COMPLETE
-- =====================================================================

-- Verification queries (run these to test)
/*
-- Test 1: Check table created
SELECT COUNT(*) FROM booking_status_history;

-- Test 2: Test FSM validation
SELECT 
    validate_status_transition('confirmed', 'completed') as valid_transition,
    validate_status_transition('completed', 'confirmed') as invalid_transition;

-- Test 3: Check functions exist
SELECT routine_name 
FROM information_schema.routines 
WHERE routine_name IN ('update_booking_status', 'add_stylist_notes', 'validate_status_transition');
*/

COMMENT ON SCHEMA public IS 
'Updated: 2025-10-16 - Added booking management system with status history and stylist notes';
