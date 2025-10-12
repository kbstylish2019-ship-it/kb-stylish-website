-- Migration: Fix RLS Policy Drift for job_queue and webhook_events
-- Issue: Security Advisory - RLS enabled but no policies defined
-- Resolution: Apply restrictive admin-only policies for both tables

-- ============================================================================
-- FIX 1: job_queue RLS Policies (Admin-Only Access)
-- ============================================================================

-- Drop any existing policies to ensure clean state
DROP POLICY IF EXISTS job_queue_admin_all ON public.job_queue;

-- Create comprehensive admin-only policy for job_queue
CREATE POLICY job_queue_admin_all ON public.job_queue
FOR ALL 
TO authenticated
USING (
    EXISTS (
        SELECT 1 
        FROM public.user_roles ur 
        JOIN public.roles r ON r.id = ur.role_id 
        WHERE ur.user_id = auth.uid() 
        AND r.name = 'admin' 
        AND ur.is_active = true
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 
        FROM public.user_roles ur 
        JOIN public.roles r ON r.id = ur.role_id 
        WHERE ur.user_id = auth.uid() 
        AND r.name = 'admin' 
        AND ur.is_active = true
    )
);

-- Add comment for documentation
COMMENT ON POLICY job_queue_admin_all ON public.job_queue IS 
'Admin-only access to job_queue table. Required for async processing governance.';

-- ============================================================================
-- FIX 2: webhook_events RLS Policies (Admin-Only Access)
-- ============================================================================

-- Drop any existing policies to ensure clean state
DROP POLICY IF EXISTS webhook_events_admin_all ON public.webhook_events;

-- Create comprehensive admin-only policy for webhook_events
CREATE POLICY webhook_events_admin_all ON public.webhook_events
FOR ALL 
TO authenticated
USING (
    EXISTS (
        SELECT 1 
        FROM public.user_roles ur 
        JOIN public.roles r ON r.id = ur.role_id 
        WHERE ur.user_id = auth.uid() 
        AND r.name = 'admin' 
        AND ur.is_active = true
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 
        FROM public.user_roles ur 
        JOIN public.roles r ON r.id = ur.role_id 
        WHERE ur.user_id = auth.uid() 
        AND r.name = 'admin' 
        AND ur.is_active = true
    )
);

-- Add comment for documentation
COMMENT ON POLICY webhook_events_admin_all ON public.webhook_events IS 
'Admin-only access to webhook_events table. Critical for security audit trail.';

-- ============================================================================
-- VERIFICATION: Ensure RLS is enabled on both tables
-- ============================================================================

-- These should already be enabled, but ensure consistency
ALTER TABLE public.job_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- MIGRATION COMPLETE: Security Advisory Remediation
-- ============================================================================
-- Tables Secured: job_queue, webhook_events
-- Policy Type: Admin-only access (using user_roles + roles tables)
-- Reason: Security advisory compliance - RLS enabled without policies
-- Applied: Phase 1 - Critical Security Fixes
