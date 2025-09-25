-- KB Stylish Authentication System - Custom JWT Claims Hook
-- Production-Grade Blueprint v2.1 Implementation
-- Created: 2025-09-14 23:08:00
-- CRITICAL COMPONENT: Custom Access Token Hook for Role-Based Claims

-- Create the custom access token hook function
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
    claims jsonb;
    user_roles text[];
    user_role_version integer;
    user_uuid uuid;
BEGIN
    -- Extract the user ID from the event
    user_uuid := (event->>'user_id')::uuid;
    
    -- Get the original claims
    claims := event->'claims';
    
    -- Query user roles and role version
    SELECT 
        COALESCE(array_agg(r.name), ARRAY[]::text[]),
        COALESCE(up.role_version, 1)
    INTO 
        user_roles,
        user_role_version
    FROM public.user_profiles up
    LEFT JOIN public.user_roles ur ON up.id = ur.user_id
    LEFT JOIN public.roles r ON ur.role_id = r.id
    WHERE up.id = user_uuid
    GROUP BY up.role_version;
    
    -- If no roles found, assign default customer role
    IF user_roles IS NULL OR array_length(user_roles, 1) IS NULL THEN
        user_roles := ARRAY['customer'];
        user_role_version := 1;
    END IF;
    
    -- Add custom claims to the JWT
    claims := jsonb_set(claims, '{user_roles}', to_jsonb(user_roles));
    claims := jsonb_set(claims, '{role_version}', to_jsonb(user_role_version));
    
    -- Return the modified claims
    RETURN jsonb_build_object('claims', claims);
EXCEPTION
    WHEN OTHERS THEN
        -- On any error, return original claims with default customer role
        claims := jsonb_set(claims, '{user_roles}', to_jsonb(ARRAY['customer']));
        claims := jsonb_set(claims, '{role_version}', to_jsonb(1));
        RETURN jsonb_build_object('claims', claims);
END;
$$;

-- Grant necessary permissions to supabase_auth_admin
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;

-- Revoke permissions from authenticated and anon roles for security
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM authenticated, anon;

-- Add documentation comment
COMMENT ON FUNCTION public.custom_access_token_hook IS 'Custom JWT claims hook that adds user_roles array and role_version to access tokens for KB Stylish role-based authentication system.';
