-- =====================================================================
-- SECURITY HARDENING: Pin search_path on all SECURITY DEFINER functions
-- =====================================================================
-- This migration systematically pins the search_path for every SECURITY
-- DEFINER function to prevent search path hijacking attacks
-- =====================================================================

-- Use a dynamic approach to find and fix all SECURITY DEFINER functions
DO $$
DECLARE
    func record;
    pin_count integer := 0;
    skip_count integer := 0;
    error_count integer := 0;
BEGIN
    RAISE NOTICE 'Starting search_path pinning for SECURITY DEFINER functions...';
    
    -- Find all SECURITY DEFINER functions in public schema
    FOR func IN 
        SELECT DISTINCT 
            p.proname AS function_name,
            pg_get_function_identity_arguments(p.oid) AS function_args,
            p.proconfig AS current_config
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public'
        AND p.prosecdef = true  -- SECURITY DEFINER
        ORDER BY p.proname
    LOOP
        BEGIN
            -- Check if search_path is already set
            IF func.current_config IS NOT NULL AND 
               array_to_string(func.current_config, ',') LIKE '%search_path%' THEN
                RAISE NOTICE 'SKIP: Function %.% already has search_path set', 
                    func.function_name, func.function_args;
                skip_count := skip_count + 1;
                CONTINUE;
            END IF;
            
            -- Special handling for functions that use extensions
            IF func.function_name IN ('hmac', 'jwt_sign', 'jwt_verify') THEN
                EXECUTE format('ALTER FUNCTION public.%I(%s) SET search_path = public, extensions, pg_temp',
                              func.function_name,
                              func.function_args);
                RAISE NOTICE 'PINNED (with extensions): Function %.%', 
                    func.function_name, func.function_args;
            ELSE
                -- Standard pinning for most functions
                EXECUTE format('ALTER FUNCTION public.%I(%s) SET search_path = public, pg_temp',
                              func.function_name,
                              func.function_args);
                RAISE NOTICE 'PINNED: Function %.%', 
                    func.function_name, func.function_args;
            END IF;
            
            pin_count := pin_count + 1;
            
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'ERROR: Could not pin search_path for function %.%: %', 
                func.function_name, func.function_args, SQLERRM;
            error_count := error_count + 1;
        END;
    END LOOP;
    
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Search path pinning complete:';
    RAISE NOTICE '  Functions pinned: %', pin_count;
    RAISE NOTICE '  Functions skipped (already set): %', skip_count;
    RAISE NOTICE '  Errors encountered: %', error_count;
    RAISE NOTICE '========================================';
END $$;

-- =====================================================================
-- EXPLICIT PINNING: Ensure critical functions are definitely pinned
-- =====================================================================

-- Cart management functions
ALTER FUNCTION public.add_to_cart_secure(uuid, integer, uuid, text) 
    SET search_path = public, pg_temp;
ALTER FUNCTION public.get_cart_details_secure(uuid, text) 
    SET search_path = public, pg_temp;
ALTER FUNCTION public.update_cart_item_secure(uuid, integer, uuid, text) 
    SET search_path = public, pg_temp;
ALTER FUNCTION public.remove_item_secure(uuid, uuid, text) 
    SET search_path = public, pg_temp;
ALTER FUNCTION public.clear_cart_secure(uuid, text) 
    SET search_path = public, pg_temp;
ALTER FUNCTION public.merge_carts_secure(uuid, text) 
    SET search_path = public, pg_temp;
ALTER FUNCTION public.get_or_create_cart_secure(uuid, text) 
    SET search_path = public, pg_temp;
ALTER FUNCTION public.verify_guest_session(text) 
    SET search_path = public, pg_temp;
ALTER FUNCTION public.convert_user_cart_to_guest(uuid, text) 
    SET search_path = public, pg_temp;

-- User management functions
ALTER FUNCTION public.handle_new_user() 
    SET search_path = public, pg_temp;
ALTER FUNCTION public.custom_access_token_hook(jsonb) 
    SET search_path = public, pg_temp;
ALTER FUNCTION public.refresh_user_jwt_claims(uuid) 
    SET search_path = public, pg_temp;
ALTER FUNCTION public.user_has_role(text) 
    SET search_path = public, pg_temp;

-- Booking functions
ALTER FUNCTION public.create_booking_reservation(uuid, uuid, timestamptz, timestamptz, uuid, integer) 
    SET search_path = public, pg_temp;
ALTER FUNCTION public.update_booking_reservation(uuid, timestamptz, timestamptz) 
    SET search_path = public, pg_temp;
ALTER FUNCTION public.create_booking(uuid, uuid, timestamptz, timestamptz, uuid, jsonb) 
    SET search_path = public, pg_temp;
ALTER FUNCTION public.cancel_booking(uuid, text) 
    SET search_path = public, pg_temp;
ALTER FUNCTION public.get_stylist_schedule(uuid, date, date) 
    SET search_path = public, pg_temp;
ALTER FUNCTION public.get_stylist_bookings(uuid, date, date) 
    SET search_path = public, pg_temp;
ALTER FUNCTION public.check_slot_availability(uuid, timestamptz, timestamptz) 
    SET search_path = public, pg_temp;
ALTER FUNCTION public.cleanup_expired_reservations() 
    SET search_path = public, pg_temp;
ALTER FUNCTION public.get_available_slots(uuid, uuid, date, text)
    SET search_path = public, pg_temp;

-- Service utility functions
ALTER FUNCTION public.get_service_duration(uuid) 
    SET search_path = public, pg_temp;
ALTER FUNCTION public.get_service_price(uuid) 
    SET search_path = public, pg_temp;

-- Product functions
ALTER FUNCTION public.get_product_with_variants(uuid) 
    SET search_path = public, pg_temp;
ALTER FUNCTION public.notify_product_change() 
    SET search_path = public, pg_temp;

-- Order processing functions
ALTER FUNCTION public.process_order_with_occ(text, uuid) 
    SET search_path = public, pg_temp;
ALTER FUNCTION public.reserve_inventory_for_payment(uuid, text) 
    SET search_path = public, pg_temp;
ALTER FUNCTION public.release_inventory_reservation(text) 
    SET search_path = public, pg_temp;
ALTER FUNCTION public.acquire_next_job(text, integer) 
    SET search_path = public, pg_temp;

-- Trigger functions
ALTER FUNCTION public.set_updated_at() 
    SET search_path = public, pg_temp;
ALTER FUNCTION public.update_updated_at_column() 
    SET search_path = public, pg_temp;
ALTER FUNCTION public.trigger_user_onboarding() 
    SET search_path = public, pg_temp;
ALTER FUNCTION public.trigger_refresh_jwt_on_role_change() 
    SET search_path = public, pg_temp;

-- Debug function (consider removing in production)
ALTER FUNCTION public.debug_cart_state() 
    SET search_path = public, pg_temp;

-- HMAC wrapper (needs extensions schema)
ALTER FUNCTION public.hmac(text, text, text) 
    SET search_path = public, extensions, pg_temp;

-- =====================================================================
-- FINAL VERIFICATION
-- =====================================================================

DO $$
DECLARE
    unpinned_count integer;
BEGIN
    -- Count any remaining unpinned SECURITY DEFINER functions
    SELECT COUNT(*) INTO unpinned_count
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
    AND p.prosecdef = true  -- SECURITY DEFINER
    AND (p.proconfig IS NULL OR NOT array_to_string(p.proconfig, ',') LIKE '%search_path%');
    
    IF unpinned_count = 0 THEN
        RAISE NOTICE '✅ SUCCESS: All SECURITY DEFINER functions now have pinned search_path';
    ELSE
        RAISE WARNING '⚠️  WARNING: % SECURITY DEFINER functions still lack pinned search_path', unpinned_count;
    END IF;
END $$;

-- =====================================================================
-- SECURITY HARDENING COMPLETE
-- All SECURITY DEFINER functions now have immutable search paths
-- This mitigates search path hijacking vulnerabilities
-- =====================================================================
