-- KB Stylish Authentication System - Role Version Enhancement
-- Production-Grade Blueprint v2.1 Implementation
-- Created: 2025-09-14 23:05:27
-- CRITICAL ENHANCEMENT: Adding role_version for hybrid session architecture

-- Add role_version column to user_profiles table
ALTER TABLE public.user_profiles 
ADD COLUMN role_version INTEGER NOT NULL DEFAULT 1;

-- Create index for efficient role version queries
CREATE INDEX idx_user_profiles_role_version ON public.user_profiles (id, role_version);

-- Create function to increment role version when roles change
CREATE OR REPLACE FUNCTION public.increment_user_role_version()
RETURNS TRIGGER AS $$
BEGIN
    -- Increment role_version in user_profiles when user_roles changes
    UPDATE public.user_profiles 
    SET role_version = role_version + 1,
        updated_at = NOW()
    WHERE id = COALESCE(NEW.user_id, OLD.user_id);
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to automatically increment role_version on role changes
CREATE TRIGGER trigger_increment_role_version
    AFTER INSERT OR UPDATE OR DELETE ON public.user_roles
    FOR EACH ROW
    EXECUTE FUNCTION public.increment_user_role_version();

-- Add comment for documentation
COMMENT ON COLUMN public.user_profiles.role_version IS 'Version number that increments when user roles change. Used for real-time role validation in JWT claims.';
