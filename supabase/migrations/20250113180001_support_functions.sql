-- ============================================================================
-- SUPPORT SYSTEM DATABASE FUNCTIONS
-- Following KB Stylish patterns: SECURITY INVOKER/DEFINER, self-defense, audit logging
-- ============================================================================

-- ============================================================================
-- CUSTOMER FUNCTIONS (SECURITY INVOKER - inherit user permissions)
-- ============================================================================

-- Create support ticket (customers)
CREATE OR REPLACE FUNCTION public.create_support_ticket(
  p_category_id uuid,
  p_subject text,
  p_message_text text,
  p_priority text DEFAULT 'medium',
  p_order_reference text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid;
  v_user_profile record;
  v_ticket_id uuid;
  v_message_id uuid;
BEGIN
  -- Get authenticated user
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Authentication required',
      'code', 'AUTH_REQUIRED'
    );
  END IF;
  
  -- Get user profile for email/name
  SELECT up.display_name, upd.email
  INTO v_user_profile
  FROM public.user_profiles up
  LEFT JOIN public.user_private_data upd ON up.id = upd.user_id
  WHERE up.id = v_user_id;
  
  -- Validate inputs
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
    v_user_id,
    p_category_id,
    trim(p_subject),
    p_priority,
    'open',
    COALESCE(v_user_profile.email, 'unknown@example.com'),
    COALESCE(v_user_profile.display_name, 'Unknown User'),
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
    v_user_id,
    trim(p_message_text),
    false,
    false
  )
  RETURNING id INTO v_message_id;
  
  -- Create system message for ticket creation
  INSERT INTO public.support_messages (
    ticket_id,
    user_id,
    message_text,
    is_internal,
    is_system
  ) VALUES (
    v_ticket_id,
    NULL,
    'Support ticket created. Our team will respond within 24 hours.',
    false,
    true
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'ticket_id', v_ticket_id,
    'message', 'Support ticket created successfully'
  );
  
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', 'Failed to create ticket: ' || SQLERRM,
    'code', 'INTERNAL_ERROR'
  );
END;
$$;

-- Get user's support tickets
CREATE OR REPLACE FUNCTION public.get_user_support_tickets(
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid;
  v_tickets jsonb;
  v_total integer;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Authentication required'
    );
  END IF;
  
  -- Get total count
  SELECT COUNT(*) INTO v_total
  FROM public.support_tickets
  WHERE user_id = v_user_id;
  
  -- Get tickets with category and message count
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', st.id,
        'subject', st.subject,
        'priority', st.priority,
        'status', st.status,
        'category', COALESCE(sc.name, 'General'),
        'created_at', st.created_at,
        'updated_at', st.updated_at,
        'resolved_at', st.resolved_at,
        'message_count', COALESCE(msg_count.count, 0)
      ) ORDER BY st.created_at DESC
    ),
    '[]'::jsonb
  ) INTO v_tickets
  FROM public.support_tickets st
  LEFT JOIN public.support_categories sc ON st.category_id = sc.id
  LEFT JOIN (
    SELECT ticket_id, COUNT(*) as count
    FROM public.support_messages
    WHERE is_system = false
    GROUP BY ticket_id
  ) msg_count ON st.id = msg_count.ticket_id
  WHERE st.user_id = v_user_id
  ORDER BY st.created_at DESC
  LIMIT p_limit OFFSET p_offset;
  
  RETURN jsonb_build_object(
    'success', true,
    'tickets', v_tickets,
    'total', v_total,
    'limit', p_limit,
    'offset', p_offset
  );
END;
$$;

-- Get ticket details with messages
CREATE OR REPLACE FUNCTION public.get_support_ticket_details(
  p_ticket_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid;
  v_ticket record;
  v_messages jsonb;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Authentication required'
    );
  END IF;
  
  -- Get ticket (RLS will ensure user can only see their own)
  SELECT st.*, sc.name as category_name, sc.color as category_color
  INTO v_ticket
  FROM public.support_tickets st
  LEFT JOIN public.support_categories sc ON st.category_id = sc.id
  WHERE st.id = p_ticket_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Ticket not found or access denied'
    );
  END IF;
  
  -- Get messages (excluding internal messages for customers)
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', sm.id,
        'message_text', sm.message_text,
        'is_system', sm.is_system,
        'created_at', sm.created_at,
        'user_name', COALESCE(up.display_name, 'System'),
        'user_avatar', up.avatar_url
      ) ORDER BY sm.created_at
    ),
    '[]'::jsonb
  ) INTO v_messages
  FROM public.support_messages sm
  LEFT JOIN public.user_profiles up ON sm.user_id = up.id
  WHERE sm.ticket_id = p_ticket_id
  AND (
    sm.is_internal = false OR 
    public.user_has_role(auth.uid(), 'admin') OR 
    public.user_has_role(auth.uid(), 'support')
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'ticket', jsonb_build_object(
      'id', v_ticket.id,
      'subject', v_ticket.subject,
      'priority', v_ticket.priority,
      'status', v_ticket.status,
      'category_name', v_ticket.category_name,
      'category_color', v_ticket.category_color,
      'customer_email', v_ticket.customer_email,
      'customer_name', v_ticket.customer_name,
      'order_reference', v_ticket.order_reference,
      'created_at', v_ticket.created_at,
      'updated_at', v_ticket.updated_at,
      'resolved_at', v_ticket.resolved_at,
      'closed_at', v_ticket.closed_at
    ),
    'messages', v_messages
  );
END;
$$;

-- Add message to ticket
CREATE OR REPLACE FUNCTION public.add_support_message(
  p_ticket_id uuid,
  p_message_text text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid;
  v_ticket_owner uuid;
  v_message_id uuid;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Authentication required'
    );
  END IF;
  
  -- Validate message
  IF p_message_text IS NULL OR length(trim(p_message_text)) < 1 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Message cannot be empty'
    );
  END IF;
  
  -- Check if user can access this ticket (RLS will handle this)
  SELECT user_id INTO v_ticket_owner
  FROM public.support_tickets
  WHERE id = p_ticket_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Ticket not found or access denied'
    );
  END IF;
  
  -- Add message
  INSERT INTO public.support_messages (
    ticket_id,
    user_id,
    message_text,
    is_internal,
    is_system
  ) VALUES (
    p_ticket_id,
    v_user_id,
    trim(p_message_text),
    false,
    false
  )
  RETURNING id INTO v_message_id;
  
  -- Update ticket status if it was resolved/closed
  UPDATE public.support_tickets
  SET status = CASE 
    WHEN status IN ('resolved', 'closed') THEN 'open'
    ELSE status
  END
  WHERE id = p_ticket_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'message_id', v_message_id,
    'message', 'Message added successfully'
  );
  
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', 'Failed to add message: ' || SQLERRM
  );
END;
$$;

-- ============================================================================
-- ADMIN/SUPPORT FUNCTIONS (SECURITY DEFINER - elevated permissions)
-- ============================================================================

-- Get all support tickets (admin/support only)
CREATE OR REPLACE FUNCTION private.get_admin_support_tickets(
  p_status text DEFAULT NULL,
  p_priority text DEFAULT NULL,
  p_assigned_to uuid DEFAULT NULL,
  p_category_id uuid DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public, pg_temp
AS $$
DECLARE
  v_tickets jsonb;
  v_total integer;
BEGIN
  -- Security check
  PERFORM private.assert_admin_or_support();
  
  -- Build dynamic query for total count
  SELECT COUNT(*) INTO v_total
  FROM public.support_tickets st
  LEFT JOIN public.support_categories sc ON st.category_id = sc.id
  LEFT JOIN public.user_profiles up ON st.user_id = up.id
  WHERE 
    (p_status IS NULL OR st.status = p_status)
    AND (p_priority IS NULL OR st.priority = p_priority)
    AND (p_assigned_to IS NULL OR st.assigned_to = p_assigned_to)
    AND (p_category_id IS NULL OR st.category_id = p_category_id)
    AND (
      p_search IS NULL OR 
      st.subject ILIKE '%' || p_search || '%' OR
      up.display_name ILIKE '%' || p_search || '%' OR
      st.customer_email ILIKE '%' || p_search || '%'
    );
  
  -- Get tickets with details
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', st.id,
        'subject', st.subject,
        'priority', st.priority,
        'status', st.status,
        'customer_name', st.customer_name,
        'customer_email', st.customer_email,
        'category', COALESCE(sc.name, 'General'),
        'category_color', sc.color,
        'assigned_to', assigned_user.display_name,
        'created_at', st.created_at,
        'updated_at', st.updated_at,
        'resolved_at', st.resolved_at,
        'message_count', COALESCE(msg_count.count, 0),
        'last_message_at', msg_count.last_message_at
      ) ORDER BY st.created_at DESC
    ),
    '[]'::jsonb
  ) INTO v_tickets
  FROM public.support_tickets st
  LEFT JOIN public.support_categories sc ON st.category_id = sc.id
  LEFT JOIN public.user_profiles up ON st.user_id = up.id
  LEFT JOIN public.user_profiles assigned_user ON st.assigned_to = assigned_user.id
  LEFT JOIN (
    SELECT 
      ticket_id, 
      COUNT(*) as count,
      MAX(created_at) as last_message_at
    FROM public.support_messages
    GROUP BY ticket_id
  ) msg_count ON st.id = msg_count.ticket_id
  WHERE 
    (p_status IS NULL OR st.status = p_status)
    AND (p_priority IS NULL OR st.priority = p_priority)
    AND (p_assigned_to IS NULL OR st.assigned_to = p_assigned_to)
    AND (p_category_id IS NULL OR st.category_id = p_category_id)
    AND (
      p_search IS NULL OR 
      st.subject ILIKE '%' || p_search || '%' OR
      up.display_name ILIKE '%' || p_search || '%' OR
      st.customer_email ILIKE '%' || p_search || '%'
    )
  ORDER BY st.created_at DESC
  LIMIT p_limit OFFSET p_offset;
  
  RETURN jsonb_build_object(
    'success', true,
    'tickets', v_tickets,
    'total', v_total,
    'limit', p_limit,
    'offset', p_offset
  );
END;
$$;

-- Update ticket status/assignment (admin/support only)
CREATE OR REPLACE FUNCTION private.update_support_ticket(
  p_ticket_id uuid,
  p_status text DEFAULT NULL,
  p_priority text DEFAULT NULL,
  p_assigned_to uuid DEFAULT NULL,
  p_internal_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public, pg_temp
AS $$
DECLARE
  v_admin_id uuid;
  v_old_values record;
  v_changes jsonb := '{}';
BEGIN
  -- Security check
  PERFORM private.assert_admin_or_support();
  v_admin_id := auth.uid();
  
  -- Get current values
  SELECT status, priority, assigned_to
  INTO v_old_values
  FROM public.support_tickets
  WHERE id = p_ticket_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Ticket not found'
    );
  END IF;
  
  -- Update ticket
  UPDATE public.support_tickets
  SET 
    status = COALESCE(p_status, status),
    priority = COALESCE(p_priority, priority),
    assigned_to = COALESCE(p_assigned_to, assigned_to),
    updated_at = now()
  WHERE id = p_ticket_id;
  
  -- Track changes
  IF p_status IS NOT NULL AND p_status != v_old_values.status THEN
    v_changes := v_changes || jsonb_build_object('status', jsonb_build_object('from', v_old_values.status, 'to', p_status));
  END IF;
  
  IF p_priority IS NOT NULL AND p_priority != v_old_values.priority THEN
    v_changes := v_changes || jsonb_build_object('priority', jsonb_build_object('from', v_old_values.priority, 'to', p_priority));
  END IF;
  
  IF p_assigned_to IS NOT NULL AND p_assigned_to != v_old_values.assigned_to THEN
    v_changes := v_changes || jsonb_build_object('assigned_to', jsonb_build_object('from', v_old_values.assigned_to, 'to', p_assigned_to));
  END IF;
  
  -- Add system message for changes
  IF v_changes != '{}' THEN
    INSERT INTO public.support_messages (
      ticket_id,
      user_id,
      message_text,
      is_internal,
      is_system
    ) VALUES (
      p_ticket_id,
      v_admin_id,
      'Ticket updated: ' || v_changes::text,
      true,
      true
    );
  END IF;
  
  -- Add internal note if provided
  IF p_internal_note IS NOT NULL AND length(trim(p_internal_note)) > 0 THEN
    INSERT INTO public.support_messages (
      ticket_id,
      user_id,
      message_text,
      is_internal,
      is_system
    ) VALUES (
      p_ticket_id,
      v_admin_id,
      trim(p_internal_note),
      true,
      false
    );
  END IF;
  
  -- Audit log
  INSERT INTO public.user_audit_log (
    user_id,
    action,
    resource_type,
    resource_id,
    old_values,
    new_values
  ) VALUES (
    v_admin_id,
    'support_ticket_updated',
    'support_ticket',
    p_ticket_id,
    to_jsonb(v_old_values),
    v_changes
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'message', 'Ticket updated successfully'
  );
END;
$$;

-- Helper function for admin/support role check
CREATE OR REPLACE FUNCTION private.assert_admin_or_support()
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = private, public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT (
    public.user_has_role(auth.uid(), 'admin') OR 
    public.user_has_role(auth.uid(), 'support')
  ) THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
  END IF;
END;
$$;

-- ============================================================================
-- GRANT PERMISSIONS
-- ============================================================================

-- Public functions for authenticated users
GRANT EXECUTE ON FUNCTION public.create_support_ticket TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_support_tickets TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_support_ticket_details TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_support_message TO authenticated;

-- Private functions for admin/support only
REVOKE ALL ON FUNCTION private.get_admin_support_tickets FROM PUBLIC;
REVOKE ALL ON FUNCTION private.update_support_ticket FROM PUBLIC;
REVOKE ALL ON FUNCTION private.assert_admin_or_support FROM PUBLIC;

GRANT EXECUTE ON FUNCTION private.get_admin_support_tickets TO authenticated;
GRANT EXECUTE ON FUNCTION private.update_support_ticket TO authenticated;
GRANT EXECUTE ON FUNCTION private.assert_admin_or_support TO authenticated;
