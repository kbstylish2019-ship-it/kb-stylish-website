-- KB Stylish Authentication System - Auto-Create User Profile Trigger
-- Production-Grade Blueprint v2.1 Implementation
-- Created: 2025-09-14 23:42:00
-- CRITICAL FIX: Automatically create user_profiles record when user signs up

-- Create function to handle new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    customer_role_id uuid;
BEGIN
    -- Get the customer role ID
    SELECT id INTO customer_role_id 
    FROM public.roles 
    WHERE name = 'customer' 
    LIMIT 1;

    -- Create user profile record
    INSERT INTO public.user_profiles (
        id,
        email,
        full_name,
        role_version,
        created_at,
        updated_at
    ) VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
        1,
        NOW(),
        NOW()
    );

    -- Assign default customer role if customer role exists
    IF customer_role_id IS NOT NULL THEN
        INSERT INTO public.user_roles (user_id, role_id)
        VALUES (NEW.id, customer_role_id);
    END IF;

    RETURN NEW;
EXCEPTION
    WHEN OTHERS THEN
        -- Log error but don't fail the user creation
        RAISE WARNING 'Error creating user profile for user %: %', NEW.id, SQLERRM;
        RETURN NEW;
END;
$$;

-- Create trigger to automatically create user profile on signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO supabase_auth_admin;

-- Add comment for documentation
COMMENT ON FUNCTION public.handle_new_user() IS 'Automatically creates user_profiles record and assigns customer role when a new user signs up via Supabase Auth.';
