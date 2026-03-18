-- Migration: Enable Public Support Ticket Submissions
-- Date: 2026-01-26
-- Purpose: Allow unauthenticated users to submit support tickets
-- Risk: LOW - Follows guest cart pattern, no breaking changes

BEGIN;

-- ============================================================================
-- STEP 1: Make user_id nullable
-- ============================================================================
-- This allows public submissions with NULL user_id
ALTER TABLE support_tickets 
ALTER COLUMN user_id DROP NOT NULL;

-- ============================================================================
-- STEP 2: Modify FK to SET NULL on user delete
-- ============================================================================
-- If a user is deleted, their tickets remain with NULL user_id
ALTER TABLE support_tickets
DROP CONSTRAINT IF EXISTS support_tickets_user_id_fkey,
ADD CONSTRAINT support_tickets_user_id_fkey
  FOREIGN KEY (user_id) 
  REFERENCES auth.users(id) 
  ON DELETE SET NULL;

-- ============================================================================
-- STEP 3: Add CHECK constraint for public tickets
-- ============================================================================
-- Ensures public tickets (NULL user_id) have email and name
ALTER TABLE support_tickets
ADD CONSTRAINT check_public_ticket_has_contact_info
CHECK (
  (user_id IS NOT NULL) OR 
  (user_id IS NULL AND customer_email IS NOT NULL AND customer_name IS NOT NULL)
);

-- ============================================================================
-- STEP 4: Add email validation constraint
-- ============================================================================
-- Validates email format for all tickets
ALTER TABLE support_tickets
ADD CONSTRAINT check_customer_email_format
CHECK (
  customer_email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'
);

-- ============================================================================
-- STEP 5: Drop existing RLS policies
-- ============================================================================
DROP POLICY IF EXISTS support_tickets_user_own ON support_tickets;

-- ============================================================================
-- STEP 6: Add RLS policy for public INSERT
-- ============================================================================
-- Allows public users to INSERT with NULL user_id
-- Allows authenticated users to INSERT with their user_id
CREATE POLICY support_tickets_public_insert
ON support_tickets
FOR INSERT
TO public
WITH CHECK (
  -- Public users: NULL user_id + email + name required
  (user_id IS NULL AND customer_email IS NOT NULL AND customer_name IS NOT NULL)
  OR
  -- Authenticated users: user_id must match auth.uid()
  (user_id = auth.uid())
);

-- ============================================================================
-- STEP 7: Add RLS policy for SELECT (read own tickets)
-- ============================================================================
-- Users can only read their own tickets
-- Admin/support can read all tickets
-- Public users CANNOT read any tickets (no auth.uid())
CREATE POLICY support_tickets_user_read
ON support_tickets
FOR SELECT
TO public
USING (
  user_id = auth.uid() 
  OR user_has_role(auth.uid(), 'admin') 
  OR user_has_role(auth.uid(), 'support')
);

-- ============================================================================
-- STEP 8: Add RLS policy for UPDATE (own tickets + admin)
-- ============================================================================
-- Users can update their own tickets
-- Admin/support can update all tickets (including public tickets with NULL user_id)
CREATE POLICY support_tickets_user_update
ON support_tickets
FOR UPDATE
TO public
USING (
  -- User can update their own tickets
  (user_id = auth.uid() AND user_id IS NOT NULL)
  OR
  -- Admin/support can update any ticket (including public tickets with NULL user_id)
  user_has_role(auth.uid(), 'admin') 
  OR 
  user_has_role(auth.uid(), 'support')
);

-- ============================================================================
-- STEP 8.5: Add RLS policy for DELETE (admin/support only)
-- ============================================================================
-- Only admin/support can delete tickets
CREATE POLICY support_tickets_admin_delete
ON support_tickets
FOR DELETE
TO public
USING (
  user_has_role(auth.uid(), 'admin') 
  OR 
  user_has_role(auth.uid(), 'support')
);

-- ============================================================================
-- STEP 9: Add indexes for performance
-- ============================================================================
-- Index for authenticated user queries (user_id + created_at)
CREATE INDEX IF NOT EXISTS idx_support_tickets_user_created 
ON support_tickets(user_id, created_at DESC) 
WHERE user_id IS NOT NULL;

-- Index for public ticket lookups (email + created_at)
CREATE INDEX IF NOT EXISTS idx_support_tickets_email 
ON support_tickets(customer_email, created_at DESC) 
WHERE user_id IS NULL;

-- Index for admin queries (status + created_at)
CREATE INDEX IF NOT EXISTS idx_support_tickets_status_created 
ON support_tickets(status, created_at DESC);

-- ============================================================================
-- STEP 10: Add columns for tracking public submissions (optional)
-- ============================================================================
-- Track IP and user agent for spam prevention
ALTER TABLE support_tickets
ADD COLUMN IF NOT EXISTS submitted_from_ip inet,
ADD COLUMN IF NOT EXISTS submitted_user_agent text;

-- ============================================================================
-- STEP 11: Update RPC function to support public submissions
-- ============================================================================
CREATE OR REPLACE FUNCTION public.create_support_ticket(
  p_category_id uuid,
  p_subject text,
  p_message_text text,
  p_priority text DEFAULT 'medium',
  p_order_reference text DEFAULT NULL,
  p_customer_email text DEFAULT NULL,  -- NEW: For public submissions
  p_customer_name text DEFAULT NULL    -- NEW: For public submissions
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_id uuid;
  v_user_email text;
  v_user_name text;
  v_ticket_id uuid;
  v_message_id uuid;
  v_is_public_submission boolean;
BEGIN
  -- Get authenticated user (may be NULL for public submissions)
  v_user_id := auth.uid();
  v_is_public_submission := (v_user_id IS NULL);
  
  -- For authenticated users, get email/name from profile
  IF v_user_id IS NOT NULL THEN
    SELECT 
      COALESCE(au.email, upd.email, 'unknown@example.com'),
      COALESCE(up.display_name, 'Unknown User')
    INTO v_user_email, v_user_name
    FROM auth.users au
    LEFT JOIN public.user_profiles up ON au.id = up.id
    LEFT JOIN public.user_private_data upd ON au.id = upd.user_id
    WHERE au.id = v_user_id;
  ELSE
    -- For public submissions, use provided email/name
    v_user_email := p_customer_email;
    v_user_name := p_customer_name;
  END IF;
  
  -- Validate inputs
  IF v_user_email IS NULL OR length(trim(v_user_email)) < 5 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Email is required',
      'code', 'EMAIL_REQUIRED'
    );
  END IF;
  
  IF v_user_name IS NULL OR length(trim(v_user_name)) < 2 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Name is required',
      'code', 'NAME_REQUIRED'
    );
  END IF;
  
  IF p_subject IS NULL OR length(trim(p_subject)) < 5 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Subject must be at least 5 characters',
      'code', 'INVALID_SUBJECT'
    );
  END IF;
  
  IF p_message_text IS NULL OR length(trim(p_message_text)) < 10 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Message must be at least 10 characters',
      'code', 'INVALID_MESSAGE'
    );
  END IF;
  
  IF p_priority NOT IN ('low', 'medium', 'high', 'urgent') THEN
    p_priority := 'medium';
  END IF;
  
  -- Validate category exists
  IF p_category_id IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM public.support_categories 
    WHERE id = p_category_id AND is_active = true
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Invalid category selected',
      'code', 'INVALID_CATEGORY'
    );
  END IF;
  
  -- Create ticket
  INSERT INTO public.support_tickets (
    user_id,
    category_id,
    subject,
    priority,
    status,
    customer_email,
    customer_name,
    order_reference
  ) VALUES (
    v_user_id,  -- NULL for public submissions
    p_category_id,
    trim(p_subject),
    p_priority,
    'open',
    v_user_email,
    v_user_name,
    p_order_reference
  )
  RETURNING id INTO v_ticket_id;
  
  -- Create initial message
  INSERT INTO public.support_messages (
    ticket_id,
    user_id,
    message_text,
    is_internal,
    is_system
  ) VALUES (
    v_ticket_id,
    v_user_id,  -- NULL for public submissions
    trim(p_message_text),
    false,
    false
  )
  RETURNING id INTO v_message_id;
  
  -- Create system message
  INSERT INTO public.support_messages (
    ticket_id,
    user_id,
    message_text,
    is_internal,
    is_system
  ) VALUES (
    v_ticket_id,
    NULL,
    CASE 
      WHEN v_is_public_submission THEN 
        'Thank you for contacting us! Our team will respond to your email within 24 hours.'
      ELSE
        'Support ticket created. Our team will respond within 24 hours.'
    END,
    false,
    true
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'ticket_id', v_ticket_id,
    'message', 'Support ticket created successfully',
    'is_public', v_is_public_submission
  );
  
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', 'Failed to create ticket: ' || SQLERRM,
    'code', 'INTERNAL_ERROR'
  );
END;
$function$;

-- ============================================================================
-- ROLLBACK INSTRUCTIONS (if needed)
-- ============================================================================
-- To rollback this migration (only if no public tickets exist):
--
-- BEGIN;
-- DROP INDEX IF EXISTS idx_support_tickets_email;
-- DROP INDEX IF EXISTS idx_support_tickets_status_created;
-- DROP INDEX IF EXISTS idx_support_tickets_user_created;
-- DROP POLICY IF EXISTS support_tickets_public_insert ON support_tickets;
-- DROP POLICY IF EXISTS support_tickets_user_read ON support_tickets;
-- DROP POLICY IF EXISTS support_tickets_user_update ON support_tickets;
-- ALTER TABLE support_tickets DROP CONSTRAINT IF EXISTS check_public_ticket_has_contact_info;
-- ALTER TABLE support_tickets DROP CONSTRAINT IF EXISTS check_customer_email_format;
-- ALTER TABLE support_tickets DROP COLUMN IF EXISTS submitted_from_ip;
-- ALTER TABLE support_tickets DROP COLUMN IF EXISTS submitted_user_agent;
-- -- WARNING: This will fail if public tickets exist (user_id IS NULL)
-- ALTER TABLE support_tickets ALTER COLUMN user_id SET NOT NULL;
-- -- Restore original RPC function (see previous migration)
-- COMMIT;

COMMIT;
