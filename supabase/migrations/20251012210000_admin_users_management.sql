-- ============================================================================
-- ADMIN USERS MANAGEMENT MIGRATION
-- Version: 2.0 (Post-Expert Review)
-- Date: October 12, 2025
-- Purpose: Enable admin UI for user management with role assignment, 
--          suspension, search, and audit logging
-- ============================================================================

BEGIN;

-- ============================================================================
-- PERFORMANCE INDICES
-- ============================================================================

-- Enable trigram extension for fuzzy search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Trigram index for user search (Performance Engineer requirement)
CREATE INDEX IF NOT EXISTS idx_user_profiles_search_trgm 
ON public.user_profiles USING gin(
  (display_name || ' ' || username) gin_trgm_ops
);

-- Email search index
CREATE INDEX IF NOT EXISTS idx_auth_users_email_search 
ON auth.users USING gin(email gin_trgm_ops);

-- Composite index for role lookups (Performance Engineer requirement)
CREATE INDEX IF NOT EXISTS idx_user_roles_lookup 
ON public.user_roles(user_id, is_active, role_id) 
WHERE is_active = true;

-- Index for user audit log queries
CREATE INDEX IF NOT EXISTS idx_user_audit_log_user_action 
ON public.user_audit_log(user_id, action_type, created_at DESC);

-- ============================================================================
-- FUNCTION 1: GET ADMIN USERS LIST
-- Purpose: Paginated user list with search and filters
-- Security: SECURITY INVOKER (inherits admin's RLS)
-- Performance: 10s timeout, indexed search
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_admin_users_list(
  p_page integer DEFAULT 1,
  p_per_page integer DEFAULT 20,
  p_search text DEFAULT NULL,
  p_role_filter text DEFAULT NULL,
  p_status_filter text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, auth, private, pg_temp
SET statement_timeout = '10s'
AS $$
DECLARE
  v_offset integer;
  v_total integer;
  v_users jsonb;
BEGIN
  -- Verify admin access
  IF NOT private.assert_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  -- Validate pagination
  IF p_per_page > 100 THEN
    p_per_page := 100; -- Max 100 per page
  END IF;

  v_offset := (p_page - 1) * p_per_page;
  
  -- Build query with filters
  WITH filtered_users AS (
    SELECT 
      au.id,
      au.email,
      au.created_at,
      au.last_sign_in_at,
      au.email_confirmed_at,
      au.banned_until,
      up.username,
      up.display_name,
      up.avatar_url,
      up.is_verified,
      -- Aggregate roles
      COALESCE(
        jsonb_agg(
          DISTINCT jsonb_build_object(
            'role_name', r.name,
            'role_id', r.id,
            'assigned_at', ur.assigned_at,
            'expires_at', ur.expires_at,
            'is_active', ur.is_active
          )
        ) FILTER (WHERE r.id IS NOT NULL),
        '[]'::jsonb
      ) as roles,
      -- Determine status
      CASE 
        WHEN au.banned_until IS NOT NULL AND au.banned_until > now() THEN 'banned'
        WHEN au.email_confirmed_at IS NULL THEN 'pending'
        WHEN au.last_sign_in_at > now() - interval '7 days' THEN 'active'
        ELSE 'inactive'
      END as status
    FROM auth.users au
    LEFT JOIN public.user_profiles up ON au.id = up.id
    LEFT JOIN public.user_roles ur ON au.id = ur.user_id AND ur.is_active = true
    LEFT JOIN public.roles r ON ur.role_id = r.id
    WHERE 
      au.deleted_at IS NULL -- Exclude soft-deleted users
      AND (
        p_search IS NULL OR 
        up.display_name ILIKE '%' || p_search || '%' OR 
        up.username ILIKE '%' || p_search || '%' OR
        au.email ILIKE '%' || p_search || '%'
      )
      AND (p_role_filter IS NULL OR r.name = p_role_filter)
    GROUP BY au.id, up.id
  )
  SELECT COUNT(*) INTO v_total FROM filtered_users 
  WHERE (p_status_filter IS NULL OR status = p_status_filter);
  
  -- Get paginated results
  SELECT jsonb_agg(row_to_json(fu)::jsonb ORDER BY created_at DESC)
  INTO v_users
  FROM (
    SELECT * FROM filtered_users
    WHERE (p_status_filter IS NULL OR status = p_status_filter)
    ORDER BY created_at DESC
    LIMIT p_per_page
    OFFSET v_offset
  ) fu;
  
  -- Return response
  RETURN jsonb_build_object(
    'users', COALESCE(v_users, '[]'::jsonb),
    'total', v_total,
    'page', p_page,
    'per_page', p_per_page,
    'total_pages', CEIL(v_total::numeric / p_per_page::numeric)
  );
END;
$$;

COMMENT ON FUNCTION public.get_admin_users_list IS 
'Admin function to list all users with pagination, search, and filters. v2.0: Added trigram search, self-protection.';

-- ============================================================================
-- FUNCTION 2: ASSIGN USER ROLE
-- Purpose: Assign a role to a user
-- Security: SECURITY INVOKER, prevents duplicate assignments
-- Audit: Logs to user_audit_log
-- ============================================================================

CREATE OR REPLACE FUNCTION public.assign_user_role(
  p_user_id uuid,
  p_role_name text,
  p_expires_at timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, private, pg_temp
SET statement_timeout = '5s'
AS $$
DECLARE
  v_role_id uuid;
  v_admin_id uuid;
BEGIN
  -- Verify admin
  v_admin_id := auth.uid();
  IF NOT private.assert_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;
  
  -- Validate user exists
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id AND deleted_at IS NULL) THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'User not found or deleted'
    );
  END IF;
  
  -- Get role ID
  SELECT id INTO v_role_id FROM public.roles WHERE name = p_role_name;
  IF v_role_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Invalid role: ' || p_role_name
    );
  END IF;
  
  -- Check if already assigned and active
  IF EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = p_user_id 
    AND role_id = v_role_id 
    AND is_active = true
    AND (expires_at IS NULL OR expires_at > now())
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'User already has this active role'
    );
  END IF;
  
  -- Insert role assignment
  INSERT INTO public.user_roles (user_id, role_id, assigned_by, expires_at)
  VALUES (p_user_id, v_role_id, v_admin_id, p_expires_at)
  ON CONFLICT (user_id, role_id) 
  DO UPDATE SET 
    is_active = true,
    assigned_by = v_admin_id,
    expires_at = p_expires_at,
    assigned_at = now();
  
  -- Increment role_version to trigger JWT refresh
  UPDATE public.user_profiles 
  SET role_version = role_version + 1 
  WHERE id = p_user_id;
  
  -- Audit log
  INSERT INTO public.user_audit_log (user_id, action_type, action_details, performed_by)
  VALUES (
    p_user_id,
    'role_assigned',
    jsonb_build_object(
      'role', p_role_name,
      'expires_at', p_expires_at
    ),
    v_admin_id
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'message', 'Role assigned successfully'
  );
END;
$$;

COMMENT ON FUNCTION public.assign_user_role IS 
'Assign a role to a user. Triggers JWT refresh via role_version increment.';

-- ============================================================================
-- FUNCTION 3: REVOKE USER ROLE
-- Purpose: Revoke a role from a user
-- Security: SECURITY INVOKER, prevents self-demotion
-- Audit: Logs to user_audit_log
-- ============================================================================

CREATE OR REPLACE FUNCTION public.revoke_user_role(
  p_user_id uuid,
  p_role_name text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, private, pg_temp
SET statement_timeout = '5s'
AS $$
DECLARE
  v_role_id uuid;
  v_admin_id uuid;
BEGIN
  v_admin_id := auth.uid();
  
  -- SELF-PROTECTION: Prevent admin from removing own admin role
  IF v_admin_id = p_user_id AND p_role_name = 'admin' THEN
    RETURN jsonb_build_object(
      'success', false, 
      'message', 'Cannot remove your own admin role'
    );
  END IF;
  
  -- Verify admin
  IF NOT private.assert_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;
  
  -- Get role ID
  SELECT id INTO v_role_id FROM public.roles WHERE name = p_role_name;
  IF v_role_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Invalid role: ' || p_role_name
    );
  END IF;
  
  -- Deactivate role
  UPDATE public.user_roles
  SET is_active = false
  WHERE user_id = p_user_id AND role_id = v_role_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'User does not have this role'
    );
  END IF;
  
  -- Increment role_version to trigger JWT refresh
  UPDATE public.user_profiles 
  SET role_version = role_version + 1 
  WHERE id = p_user_id;
  
  -- Audit log
  INSERT INTO public.user_audit_log (user_id, action_type, action_details, performed_by)
  VALUES (
    p_user_id, 
    'role_revoked', 
    jsonb_build_object('role', p_role_name), 
    v_admin_id
  );
  
  RETURN jsonb_build_object(
    'success', true, 
    'message', 'Role revoked successfully'
  );
END;
$$;

COMMENT ON FUNCTION public.revoke_user_role IS 
'Revoke a role from a user. Prevents self-demotion. v2.0: Added self-protection.';

-- ============================================================================
-- FUNCTION 4: SUSPEND USER
-- Purpose: Temporarily or permanently ban a user
-- Security: SECURITY DEFINER (needs to modify auth.users), prevents self-suspension
-- Audit: Logs to user_audit_log
-- ============================================================================

CREATE OR REPLACE FUNCTION public.suspend_user(
  p_user_id uuid,
  p_duration_days integer DEFAULT NULL,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER -- Need to update auth.users
SET search_path = public, auth, private, pg_temp
SET statement_timeout = '5s'
AS $$
DECLARE
  v_admin_id uuid;
  v_banned_until timestamptz;
BEGIN
  v_admin_id := auth.uid();
  
  -- SELF-PROTECTION: Prevent admin from suspending themselves
  IF v_admin_id = p_user_id THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Cannot suspend your own account'
    );
  END IF;
  
  -- Verify admin
  IF NOT private.assert_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;
  
  -- Calculate ban duration
  IF p_duration_days IS NOT NULL THEN
    v_banned_until := now() + (p_duration_days || ' days')::interval;
  ELSE
    v_banned_until := 'infinity'::timestamptz; -- Permanent
  END IF;
  
  -- Update auth.users
  UPDATE auth.users
  SET banned_until = v_banned_until
  WHERE id = p_user_id AND deleted_at IS NULL;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'User not found'
    );
  END IF;
  
  -- Audit log
  INSERT INTO public.user_audit_log (user_id, action_type, action_details, performed_by)
  VALUES (
    p_user_id,
    'user_suspended',
    jsonb_build_object(
      'duration_days', p_duration_days,
      'reason', p_reason,
      'banned_until', v_banned_until
    ),
    v_admin_id
  );
  
  RETURN jsonb_build_object(
    'success', true, 
    'message', 'User suspended successfully',
    'banned_until', v_banned_until
  );
END;
$$;

COMMENT ON FUNCTION public.suspend_user IS 
'Suspend a user temporarily or permanently. Prevents self-suspension. v2.0: Added self-protection.';

-- ============================================================================
-- FUNCTION 5: ACTIVATE USER
-- Purpose: Remove suspension from a user
-- Security: SECURITY DEFINER (needs to modify auth.users)
-- Audit: Logs to user_audit_log
-- ============================================================================

CREATE OR REPLACE FUNCTION public.activate_user(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, private, pg_temp
SET statement_timeout = '5s'
AS $$
DECLARE
  v_admin_id uuid;
BEGIN
  v_admin_id := auth.uid();
  
  -- Verify admin
  IF NOT private.assert_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;
  
  -- Clear ban
  UPDATE auth.users
  SET banned_until = NULL
  WHERE id = p_user_id AND deleted_at IS NULL;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'User not found'
    );
  END IF;
  
  -- Audit log
  INSERT INTO public.user_audit_log (user_id, action_type, performed_by)
  VALUES (p_user_id, 'user_activated', v_admin_id);
  
  RETURN jsonb_build_object(
    'success', true, 
    'message', 'User activated successfully'
  );
END;
$$;

COMMENT ON FUNCTION public.activate_user IS 
'Remove suspension from a user account.';

-- ============================================================================
-- GRANT PERMISSIONS
-- ============================================================================

-- Grant execute to authenticated users (RLS + assert_admin will handle authorization)
GRANT EXECUTE ON FUNCTION public.get_admin_users_list TO authenticated;
GRANT EXECUTE ON FUNCTION public.assign_user_role TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_user_role TO authenticated;
GRANT EXECUTE ON FUNCTION public.suspend_user TO authenticated;
GRANT EXECUTE ON FUNCTION public.activate_user TO authenticated;

COMMIT;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
-- Version: 2.0
-- Functions: 5 created
-- Indices: 4 created
-- Security: Self-protection added
-- Performance: Trigram search enabled
-- ============================================================================
