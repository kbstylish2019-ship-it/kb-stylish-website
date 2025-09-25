-- KB Stylish Authentication System - JWT Refresh Function
-- Production-Grade Blueprint v2.2 Implementation
-- Created: 2025-09-15 07:00:00
-- PURPOSE: Update JWT custom claims when role_version changes

-- Create function to refresh JWT custom claims
CREATE OR REPLACE FUNCTION public.refresh_user_jwt_claims(user_uuid uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    user_profile_record public.user_profiles%ROWTYPE;
    user_roles_array text[];
    result json;
BEGIN
    -- Get user profile
    SELECT * INTO user_profile_record
    FROM public.user_profiles
    WHERE id = user_uuid;

    IF NOT FOUND THEN
        RETURN json_build_object('error', 'User profile not found');
    END IF;

    -- Get user roles
    SELECT array_agg(r.name) INTO user_roles_array
    FROM public.user_roles ur
    JOIN public.roles r ON ur.role_id = r.id
    WHERE ur.user_id = user_uuid AND ur.is_active = true;

    -- Default to customer if no roles found
    IF user_roles_array IS NULL OR array_length(user_roles_array, 1) IS NULL THEN
        user_roles_array := ARRAY['customer'];
    END IF;

    -- Build the custom claims
    result := json_build_object(
        'user_roles', user_roles_array,
        'role_version', user_profile_record.role_version,
        'updated_at', extract(epoch from now())
    );

    -- Update the auth.users metadata
    UPDATE auth.users
    SET 
        raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || result::jsonb,
        updated_at = now()
    WHERE id = user_uuid;

    RETURN result;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.refresh_user_jwt_claims(uuid) TO authenticated;

-- Create trigger function to auto-refresh JWT when role_version changes
CREATE OR REPLACE FUNCTION public.trigger_refresh_jwt_on_role_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Only refresh if role_version actually changed
    IF OLD.role_version IS DISTINCT FROM NEW.role_version THEN
        PERFORM public.refresh_user_jwt_claims(NEW.id);
        
        -- Log the refresh for debugging
        RAISE NOTICE 'JWT claims refreshed for user % - role_version: % -> %', 
                     NEW.id, OLD.role_version, NEW.role_version;
    END IF;
    
    RETURN NEW;
END;
$$;

-- Create trigger on user_profiles table
DROP TRIGGER IF EXISTS refresh_jwt_on_role_version_change ON public.user_profiles;
CREATE TRIGGER refresh_jwt_on_role_version_change
    AFTER UPDATE ON public.user_profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.trigger_refresh_jwt_on_role_change();

-- Add comment for documentation
COMMENT ON FUNCTION public.refresh_user_jwt_claims(uuid) IS 'Refreshes JWT custom claims when user roles or role_version changes. Called automatically by trigger.';
COMMENT ON FUNCTION public.trigger_refresh_jwt_on_role_change() IS 'Trigger function that automatically refreshes JWT claims when role_version changes.';
