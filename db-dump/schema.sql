


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "pg_catalog";






CREATE SCHEMA IF NOT EXISTS "metrics";


ALTER SCHEMA "metrics" OWNER TO "postgres";


COMMENT ON SCHEMA "metrics" IS 'Event-driven aggregation layer for vendor and platform dashboards. Updated incrementally by order-worker pipeline.';



CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "extensions";






CREATE SCHEMA IF NOT EXISTS "private";


ALTER SCHEMA "private" OWNER TO "postgres";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "btree_gist" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pg_trgm" WITH SCHEMA "public";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgjwt" WITH SCHEMA "public";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "metrics"."refresh_platform_cache_on_order"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_order_date date;
  v_platform_stats record;
BEGIN
  -- Only process confirmed orders
  IF NEW.status != 'confirmed' THEN
    RETURN NEW;
  END IF;

  v_order_date := NEW.created_at::date;

  -- Calculate platform-wide stats for this day
  SELECT 
    COUNT(*) as order_count,
    COALESCE(SUM(total_cents), 0) as total_gmv,
    COALESCE(SUM(total_cents) * 0.15, 0) as total_fees
  INTO v_platform_stats
  FROM orders
  WHERE created_at::date = v_order_date
    AND status = 'confirmed';

  -- Update platform_daily metrics
  INSERT INTO metrics.platform_daily (
    day, orders, gmv_cents, platform_fees_cents, 
    refunds_cents, payouts_cents
  ) VALUES (
    v_order_date,
    v_platform_stats.order_count,
    v_platform_stats.total_gmv,
    v_platform_stats.total_fees,
    0, 0
  )
  ON CONFLICT (day)
  DO UPDATE SET
    orders = v_platform_stats.order_count,
    gmv_cents = v_platform_stats.total_gmv,
    platform_fees_cents = v_platform_stats.total_fees,
    updated_at = NOW();

  RETURN NEW;
END;
$$;


ALTER FUNCTION "metrics"."refresh_platform_cache_on_order"() OWNER TO "postgres";


COMMENT ON FUNCTION "metrics"."refresh_platform_cache_on_order"() IS 'Automatically updates platform metrics when orders are confirmed. Ensures admin dashboard shows real-time data.';



CREATE OR REPLACE FUNCTION "metrics"."refresh_vendor_cache_on_order"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_vendor_id uuid;
  v_order_date date;
  v_vendor_stats record;
BEGIN
  -- Only process confirmed orders
  IF NEW.status != 'confirmed' THEN
    RETURN NEW;
  END IF;

  v_order_date := NEW.created_at::date;

  -- Get all vendors from this order's items and update their cache
  FOR v_vendor_id IN 
    SELECT DISTINCT vendor_id 
    FROM order_items 
    WHERE order_id = NEW.id
  LOOP
    -- Calculate stats for this vendor for this day
    SELECT 
      COUNT(DISTINCT oi.order_id) as order_count,
      COALESCE(SUM(oi.total_price_cents), 0) as total_gmv,
      COALESCE(SUM(oi.total_price_cents) * 0.15, 0) as total_fees
    INTO v_vendor_stats
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    WHERE oi.vendor_id = v_vendor_id
      AND o.created_at::date = v_order_date
      AND o.status = 'confirmed';

    -- Update realtime cache
    INSERT INTO metrics.vendor_realtime_cache (
      vendor_id, cache_date, orders, gmv_cents, platform_fees_cents, refunds_cents, updated_at
    ) VALUES (
      v_vendor_id, v_order_date, 
      v_vendor_stats.order_count,
      v_vendor_stats.total_gmv,
      v_vendor_stats.total_fees,
      0, NOW()
    )
    ON CONFLICT (vendor_id, cache_date) 
    DO UPDATE SET
      orders = v_vendor_stats.order_count,
      gmv_cents = v_vendor_stats.total_gmv,
      platform_fees_cents = v_vendor_stats.total_fees,
      updated_at = NOW();

    -- Update daily metrics
    INSERT INTO metrics.vendor_daily (
      vendor_id, day, orders, gmv_cents, platform_fees_cents, 
      pending_payout_cents, payouts_cents, refunds_cents
    ) VALUES (
      v_vendor_id, v_order_date,
      v_vendor_stats.order_count,
      v_vendor_stats.total_gmv,
      v_vendor_stats.total_fees,
      v_vendor_stats.total_gmv - v_vendor_stats.total_fees,
      0, 0
    )
    ON CONFLICT (vendor_id, day)
    DO UPDATE SET
      orders = v_vendor_stats.order_count,
      gmv_cents = v_vendor_stats.total_gmv,
      platform_fees_cents = v_vendor_stats.total_fees,
      pending_payout_cents = v_vendor_stats.total_gmv - v_vendor_stats.total_fees;
  END LOOP;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "metrics"."refresh_vendor_cache_on_order"() OWNER TO "postgres";


COMMENT ON FUNCTION "metrics"."refresh_vendor_cache_on_order"() IS 'Automatically updates vendor metrics cache when orders are confirmed. Ensures real-time dashboard data.';



CREATE OR REPLACE FUNCTION "private"."assert_admin"() RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'private', 'public', 'pg_temp'
    AS $$
DECLARE
  calling_uid uuid;
BEGIN
  calling_uid := auth.uid();
  
  IF calling_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  
  IF NOT public.user_has_role(calling_uid, 'admin') THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501';
  END IF;
END;
$$;


ALTER FUNCTION "private"."assert_admin"() OWNER TO "postgres";


COMMENT ON FUNCTION "private"."assert_admin"() IS 'Validates that the calling user has admin role. FAANG-audited with defense-in-depth.';



CREATE OR REPLACE FUNCTION "private"."complete_stylist_promotion"("p_promotion_id" "uuid", "p_admin_id" "uuid", "p_profile_data" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'private', 'pg_temp'
    AS $$
DECLARE
  v_promotion RECORD;
  v_admin_name TEXT;
  v_stylist_user_id UUID;
  v_services_assigned INTEGER;
BEGIN
  -- Validate: Admin has admin role
  IF NOT public.user_has_role(p_admin_id, 'admin') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Unauthorized: Admin role required',
      'code', 'UNAUTHORIZED'
    );
  END IF;

  -- Get promotion record with lock (CRITICAL: prevents race conditions)
  SELECT * INTO v_promotion
  FROM public.stylist_promotions
  WHERE id = p_promotion_id
  FOR UPDATE;

  IF v_promotion IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Promotion not found',
      'code', 'PROMOTION_NOT_FOUND'
    );
  END IF;

  -- Validate: All checks must be passed
  IF v_promotion.background_check_status != 'passed' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Background check not passed',
      'code', 'CHECKS_INCOMPLETE',
      'missing', 'background_check'
    );
  END IF;

  IF v_promotion.id_verification_status != 'verified' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'ID verification not completed',
      'code', 'CHECKS_INCOMPLETE',
      'missing', 'id_verification'
    );
  END IF;

  IF v_promotion.training_completed != TRUE THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Training not completed',
      'code', 'CHECKS_INCOMPLETE',
      'missing', 'training'
    );
  END IF;

  IF v_promotion.mfa_enabled != TRUE THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'MFA not enabled',
      'code', 'CHECKS_INCOMPLETE',
      'missing', 'mfa'
    );
  END IF;

  -- Validate: Not already approved
  IF v_promotion.status = 'approved' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Promotion already completed',
      'code', 'ALREADY_APPROVED'
    );
  END IF;

  -- Validate: Not rejected or revoked
  IF v_promotion.status IN ('rejected', 'revoked') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Cannot complete rejected or revoked promotion',
      'code', 'PROMOTION_FINALIZED'
    );
  END IF;

  -- Get admin name
  SELECT display_name INTO v_admin_name
  FROM public.user_profiles
  WHERE id = p_admin_id;

  -- Create stylist_profile
  INSERT INTO public.stylist_profiles (
    user_id,
    display_name,
    title,
    bio,
    years_experience,
    specialties,
    timezone,
    is_active
  )
  VALUES (
    v_promotion.user_id,
    p_profile_data->>'display_name',
    p_profile_data->>'title',
    p_profile_data->>'bio',
    (p_profile_data->>'years_experience')::INTEGER,
    ARRAY(SELECT jsonb_array_elements_text(p_profile_data->'specialties')),
    COALESCE(p_profile_data->>'timezone', 'Asia/Kathmandu'),
    TRUE
  )
  RETURNING user_id INTO v_stylist_user_id;

  -- ✨ NEW: Automatically assign all active services to the new stylist
  -- This makes them immediately bookable in the book-a-stylist page
  INSERT INTO public.stylist_services (
    stylist_user_id,
    service_id,
    is_available
  )
  SELECT
    v_stylist_user_id,
    id,
    true
  FROM public.services
  WHERE is_active = true
  ON CONFLICT (stylist_user_id, service_id) DO NOTHING;
  
  GET DIAGNOSTICS v_services_assigned = ROW_COUNT;

  -- Assign stylist role
  PERFORM public.assign_user_role(v_promotion.user_id, 'stylist', NULL);

  -- Update promotion status to approved
  UPDATE public.stylist_promotions
  SET status = 'approved',
      approved_by = p_admin_id,
      approved_at = NOW(),
      notes = notes || jsonb_build_array(
        jsonb_build_object(
          'timestamp', NOW(),
          'admin_id', p_admin_id,
          'admin_name', v_admin_name,
          'action', 'promotion_approved',
          'note', format('Stylist profile created with %s services assigned', v_services_assigned)
        )
      )
  WHERE id = p_promotion_id;

  -- Log to service_management_log
  INSERT INTO private.service_management_log (
    admin_user_id,
    action,
    target_id,
    target_type,
    severity,
    category,
    details
  )
  VALUES (
    p_admin_id,
    'complete_stylist_promotion',
    p_promotion_id,
    'stylist_promotion',
    'warning',
    'governance',
    jsonb_build_object(
      'user_id', v_promotion.user_id,
      'stylist_user_id', v_stylist_user_id,
      'promotion_id', p_promotion_id,
      'services_assigned', v_services_assigned,
      'profile_data', p_profile_data
    )
  );

  -- Return success
  RETURN jsonb_build_object(
    'success', true,
    'promotion_id', p_promotion_id,
    'stylist_user_id', v_stylist_user_id,
    'services_assigned', v_services_assigned,
    'status', 'approved',
    'message', format('Promotion completed successfully. Stylist profile created with %s services.', v_services_assigned)
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM,
    'code', 'INTERNAL_ERROR'
  );
END;
$$;


ALTER FUNCTION "private"."complete_stylist_promotion"("p_promotion_id" "uuid", "p_admin_id" "uuid", "p_profile_data" "jsonb") OWNER TO "postgres";


COMMENT ON FUNCTION "private"."complete_stylist_promotion"("p_promotion_id" "uuid", "p_admin_id" "uuid", "p_profile_data" "jsonb") IS 'Step 3 (final) of stylist promotion workflow. Creates stylist_profile and assigns role after all checks pass. Uses FOR UPDATE lock to prevent race conditions.';



CREATE OR REPLACE FUNCTION "private"."deactivate_stylist_schedules"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'private', 'pg_temp'
    AS $$
BEGIN
  -- Only act when stylist is being deactivated
  IF NEW.is_active = FALSE AND OLD.is_active = TRUE THEN
    
    -- Set all active schedules to end today
    UPDATE public.stylist_schedules
    SET 
      effective_until = CURRENT_DATE,
      updated_at = NOW()
    WHERE stylist_user_id = NEW.user_id
      AND is_active = TRUE
      AND (effective_until IS NULL OR effective_until > CURRENT_DATE);
      
    -- Clear availability cache for this stylist (force recompute)
    DELETE FROM private.availability_cache
    WHERE stylist_user_id = NEW.user_id;
    
    -- Log the action for audit trail
    RAISE NOTICE 'Deactivated schedules for stylist %: Set effective_until = %', NEW.user_id, CURRENT_DATE;
    
  END IF;
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION "private"."deactivate_stylist_schedules"() OWNER TO "postgres";


COMMENT ON FUNCTION "private"."deactivate_stylist_schedules"() IS 'Automatically sets effective_until = today for all schedules when stylist is deactivated. Prevents orphaned schedules and bookings for inactive users.';



CREATE OR REPLACE FUNCTION "private"."enqueue_metrics_update"("p_day" "date", "p_vendor_id" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'private', 'public', 'pg_temp'
    AS $$
DECLARE
    v_queue_id uuid;
    v_dedup_vendor_id uuid;
BEGIN
    -- Normalize NULL vendor_id to sentinel for deduplication
    v_dedup_vendor_id := COALESCE(p_vendor_id, '00000000-0000-0000-0000-000000000000'::uuid);
    
    -- Try to insert, but ignore if already pending/processing (deduplication)
    BEGIN
        INSERT INTO private.metrics_update_queue (day, vendor_id, status, created_at, updated_at)
        VALUES (p_day, p_vendor_id, 'pending', now(), now())
        RETURNING id INTO v_queue_id;
        
        RETURN jsonb_build_object(
            'success', true,
            'queue_id', v_queue_id,
            'day', p_day,
            'vendor_id', p_vendor_id,
            'message', 'Metrics update enqueued'
        );
    EXCEPTION
        WHEN unique_violation THEN
            -- Task already queued (deduplication worked)
            RETURN jsonb_build_object(
                'success', true,
                'queue_id', NULL,
                'day', p_day,
                'vendor_id', p_vendor_id,
                'message', 'Metrics update already queued (deduplicated)'
            );
    END;
    
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', SQLERRM,
            'message', 'Failed to enqueue metrics update'
        );
END;
$$;


ALTER FUNCTION "private"."enqueue_metrics_update"("p_day" "date", "p_vendor_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "private"."enqueue_metrics_update"("p_day" "date", "p_vendor_id" "uuid") IS 'Enqueues a metrics update task with automatic deduplication by (day, vendor_id).';



CREATE OR REPLACE FUNCTION "private"."generate_product_slug"("p_name" "text", "p_vendor_id" "uuid") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_base_slug text;
  v_slug text;
  v_counter integer := 0;
BEGIN
  -- Sanitize name to slug format
  v_base_slug := lower(regexp_replace(p_name, '[^a-zA-Z0-9\s-]', '', 'g'));
  v_base_slug := regexp_replace(v_base_slug, '\s+', '-', 'g');
  v_base_slug := regexp_replace(v_base_slug, '-+', '-', 'g');
  v_base_slug := trim(both '-' from v_base_slug);
  
  -- Limit length
  v_base_slug := substr(v_base_slug, 1, 180);
  
  -- Ensure uniqueness for this vendor
  v_slug := v_base_slug;
  WHILE EXISTS (SELECT 1 FROM products WHERE vendor_id = p_vendor_id AND slug = v_slug) LOOP
    v_counter := v_counter + 1;
    v_slug := v_base_slug || '-' || v_counter;
  END LOOP;
  
  RETURN v_slug;
END;
$$;


ALTER FUNCTION "private"."generate_product_slug"("p_name" "text", "p_vendor_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "private"."generate_product_slug"("p_name" "text", "p_vendor_id" "uuid") IS 'Generate unique URL-safe slug for product. Server-side to prevent collisions.';



CREATE OR REPLACE FUNCTION "private"."get_admin_dashboard_stats_v2_1"("p_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'private', 'metrics', 'public', 'pg_temp'
    AS $$
DECLARE
  stats jsonb;
  total_users bigint;
  total_vendors bigint;
  platform_30d record;
  platform_today record;
BEGIN
  -- Validate that the calling user is an admin
  IF p_user_id IS NULL THEN
    RAISE WARNING 'Admin function called with NULL user_id';
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  
  IF NOT public.user_has_role(p_user_id, 'admin') THEN
    RAISE EXCEPTION 'Access denied - admin role required' USING ERRCODE = '42501';
  END IF;
  
  -- Get platform stats (requires SECURITY DEFINER for auth.users access)
  SELECT COUNT(*) INTO total_users FROM auth.users;
  SELECT COUNT(*) INTO total_vendors FROM public.vendor_profiles;
  
  SELECT
    COALESCE(SUM(pd.orders), 0) as orders_30d,
    COALESCE(SUM(pd.gmv_cents), 0) as gmv_30d_cents,
    COALESCE(SUM(pd.platform_fees_cents), 0) as fees_30d_cents,
    COALESCE(SUM(pd.pending_payout_cents), 0) as pending_payout_cents,
    COALESCE(SUM(pd.refunds_cents), 0) as refunds_30d_cents
  INTO platform_30d
  FROM metrics.platform_daily pd
  WHERE pd.day >= CURRENT_DATE - INTERVAL '30 days';
  
  SELECT
    COALESCE(pd.orders, 0) as orders_today,
    COALESCE(pd.gmv_cents, 0) as gmv_today_cents,
    COALESCE(pd.platform_fees_cents, 0) as fees_today_cents
  INTO platform_today
  FROM metrics.platform_daily pd
  WHERE pd.day = CURRENT_DATE;
  
  stats := jsonb_build_object(
    'platform_overview', jsonb_build_object(
      'total_users', total_users,
      'total_vendors', total_vendors
    ),
    'today', jsonb_build_object(
      'orders', COALESCE(platform_today.orders_today, 0),
      'gmv_cents', COALESCE(platform_today.gmv_today_cents, 0),
      'platform_fees_cents', COALESCE(platform_today.fees_today_cents, 0)
    ),
    'last_30_days', jsonb_build_object(
      'orders', COALESCE(platform_30d.orders_30d, 0),
      'gmv_cents', COALESCE(platform_30d.gmv_30d_cents, 0),
      'platform_fees_cents', COALESCE(platform_30d.fees_30d_cents, 0),
      'pending_payouts_cents', COALESCE(platform_30d.pending_payout_cents, 0),
      'refunds_cents', COALESCE(platform_30d.refunds_30d_cents, 0)
    ),
    'generated_at', now(),
    'generated_by', p_user_id
  );
  
  RETURN stats;
END;
$$;


ALTER FUNCTION "private"."get_admin_dashboard_stats_v2_1"("p_user_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "private"."get_admin_dashboard_stats_v2_1"("p_user_id" "uuid") IS 'SECURITY DEFINER function that aggregates platform-wide stats. Requires user_id parameter for admin verification.';



CREATE OR REPLACE FUNCTION "private"."get_encryption_key"() RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_key TEXT;
BEGIN
  -- Read from Supabase Vault
  SELECT decrypted_secret INTO v_key
  FROM vault.decrypted_secrets
  WHERE name = 'vendor_pii_encryption_key';
  
  -- If not found in vault, raise error
  IF v_key IS NULL OR v_key = '' THEN
    RAISE EXCEPTION 'Encryption key not found in Vault. Please create secret: vendor_pii_encryption_key';
  END IF;
  
  RETURN v_key;
END;
$$;


ALTER FUNCTION "private"."get_encryption_key"() OWNER TO "postgres";


COMMENT ON FUNCTION "private"."get_encryption_key"() IS 'Retrieves encryption key from Supabase Vault (vendor_pii_encryption_key). Used by encrypt/decrypt helper functions.';



CREATE OR REPLACE FUNCTION "private"."get_promotion_by_user"("p_user_id" "uuid", "p_admin_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'private', 'pg_temp'
    AS $$
DECLARE
  v_promotion stylist_promotions%ROWTYPE;
  v_user_name TEXT;
  v_current_step INTEGER;
BEGIN
  -- Verify admin has admin role
  IF NOT public.user_has_role(p_admin_id, 'admin') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Unauthorized: Admin role required',
      'code', 'UNAUTHORIZED'
    );
  END IF;

  -- Find existing pending promotion
  SELECT * INTO v_promotion
  FROM public.stylist_promotions
  WHERE user_id = p_user_id
    AND status IN ('draft', 'pending_checks', 'pending_training', 'pending_approval')
  ORDER BY created_at DESC
  LIMIT 1;

  -- If no pending promotion found
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'No pending promotion found for this user',
      'code', 'NOT_FOUND'
    );
  END IF;

  -- Get user display name
  SELECT display_name INTO v_user_name
  FROM public.user_profiles
  WHERE id = p_user_id;

  -- Calculate current step based on status
  CASE v_promotion.status
    WHEN 'draft' THEN v_current_step := 2;
    WHEN 'pending_checks' THEN v_current_step := 2;
    WHEN 'pending_training' THEN v_current_step := 3;
    WHEN 'pending_approval' THEN v_current_step := 4;
    ELSE v_current_step := 1;
  END CASE;

  -- Return full promotion data with correct column names
  RETURN jsonb_build_object(
    'success', true,
    'promotion_id', v_promotion.id,
    'user_id', v_promotion.user_id,
    'user_name', v_user_name,
    'status', v_promotion.status,
    'current_step', v_current_step,
    'checks', jsonb_build_object(
      'background_check', v_promotion.background_check_status,
      'id_verification', v_promotion.id_verification_status,
      'training', v_promotion.training_completed,
      'mfa', v_promotion.mfa_enabled
    ),
    'stylist_profile_data', jsonb_build_object(
      'display_name', '',
      'title', '',
      'bio', '',
      'years_experience', 0,
      'specialties', '[]'::jsonb,
      'timezone', 'Asia/Kathmandu'
    ),
    'created_at', v_promotion.created_at,
    'updated_at', v_promotion.updated_at,
    'requested_by', v_promotion.requested_by,
    'notes', COALESCE(v_promotion.notes, '[]'::jsonb)
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM,
    'code', 'INTERNAL_ERROR'
  );
END;
$$;


ALTER FUNCTION "private"."get_promotion_by_user"("p_user_id" "uuid", "p_admin_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "private"."get_promotion_by_user"("p_user_id" "uuid", "p_admin_id" "uuid") IS 'Fetches existing pending promotion for a user to enable resume functionality in onboarding wizard';



CREATE OR REPLACE FUNCTION "private"."initialize_stylist_budget"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  INSERT INTO public.stylist_override_budgets (
    stylist_user_id, monthly_override_limit, current_month_overrides,
    emergency_overrides_remaining, budget_reset_at
  )
  VALUES (NEW.user_id, 10, 0, 3, date_trunc('month', NOW() + INTERVAL '1 month'))
  ON CONFLICT (stylist_user_id) DO NOTHING;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "private"."initialize_stylist_budget"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."initiate_stylist_promotion"("p_user_id" "uuid", "p_admin_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'private', 'pg_temp'
    AS $$
DECLARE
  v_promotion_id UUID;
  v_user_display_name TEXT;
  v_admin_display_name TEXT;
BEGIN
  -- Validate: Admin has admin role
  IF NOT public.user_has_role(p_admin_id, 'admin') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Unauthorized: Admin role required',
      'code', 'UNAUTHORIZED'
    );
  END IF;

  -- Validate: User exists in user_profiles
  SELECT display_name INTO v_user_display_name
  FROM public.user_profiles
  WHERE id = p_user_id;

  IF v_user_display_name IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'User not found',
      'code', 'USER_NOT_FOUND'
    );
  END IF;

  -- Validate: User is not already a stylist
  IF EXISTS (SELECT 1 FROM public.stylist_profiles WHERE user_id = p_user_id) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'User is already a stylist',
      'code', 'ALREADY_STYLIST'
    );
  END IF;

  -- Validate: No pending promotion exists
  IF EXISTS (
    SELECT 1 FROM public.stylist_promotions 
    WHERE user_id = p_user_id 
      AND status IN ('draft', 'pending_checks', 'pending_training', 'pending_approval')
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'User already has a pending promotion',
      'code', 'PROMOTION_EXISTS'
    );
  END IF;

  -- Get admin display name for initial note
  SELECT display_name INTO v_admin_display_name
  FROM public.user_profiles
  WHERE id = p_admin_id;

  -- Create promotion record
  INSERT INTO public.stylist_promotions (
    user_id,
    requested_by,
    status,
    notes
  )
  VALUES (
    p_user_id,
    p_admin_id,
    'draft',
    jsonb_build_array(
      jsonb_build_object(
        'timestamp', NOW(),
        'admin_id', p_admin_id,
        'admin_name', v_admin_display_name,
        'action', 'promotion_initiated',
        'note', 'Promotion workflow started'
      )
    )
  )
  RETURNING id INTO v_promotion_id;

  -- Log to service_management_log
  INSERT INTO private.service_management_log (
    admin_user_id,
    action,
    target_id,
    target_type,
    severity,
    category,
    details
  )
  VALUES (
    p_admin_id,
    'initiate_stylist_promotion',
    v_promotion_id,
    'stylist_promotion',
    'info',
    'governance',
    jsonb_build_object(
      'user_id', p_user_id,
      'user_name', v_user_display_name,
      'promotion_id', v_promotion_id
    )
  );

  -- Return success
  RETURN jsonb_build_object(
    'success', true,
    'promotion_id', v_promotion_id,
    'user_id', p_user_id,
    'user_name', v_user_display_name,
    'status', 'draft',
    'message', 'Promotion initiated successfully'
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM,
    'code', 'INTERNAL_ERROR'
  );
END;
$$;


ALTER FUNCTION "private"."initiate_stylist_promotion"("p_user_id" "uuid", "p_admin_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "private"."initiate_stylist_promotion"("p_user_id" "uuid", "p_admin_id" "uuid") IS 'Step 1 of stylist promotion workflow. Creates draft promotion request with validation.';



CREATE OR REPLACE FUNCTION "private"."invalidate_availability_cache"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  DELETE FROM private.availability_cache
  WHERE stylist_user_id = COALESCE(NEW.stylist_user_id, OLD.stylist_user_id)
    AND cache_date >= CURRENT_DATE;
  RETURN COALESCE(NEW, OLD);
END;
$$;


ALTER FUNCTION "private"."invalidate_availability_cache"() OWNER TO "postgres";


COMMENT ON FUNCTION "private"."invalidate_availability_cache"() IS 'Legacy synchronous cache invalidation. Use invalidate_availability_cache_async() for triggers. This can be called manually for immediate cleanup.';



CREATE OR REPLACE FUNCTION "private"."invalidate_availability_cache_async"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  -- Use pg_notify instead of DELETE for async processing
  -- Payload: JSON with stylist_id and current date
  PERFORM pg_notify(
    'cache_invalidate',
    json_build_object(
      'stylist_id', COALESCE(NEW.stylist_user_id, OLD.stylist_user_id),
      'cache_date', CURRENT_DATE,
      'table', TG_TABLE_NAME,
      'operation', TG_OP
    )::text
  );
  
  RETURN COALESCE(NEW, OLD);
END;
$$;


ALTER FUNCTION "private"."invalidate_availability_cache_async"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."process_metrics_update_queue"("p_batch_size" integer DEFAULT 10) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'private', 'metrics', 'public', 'pg_temp'
    AS $$
DECLARE
    v_task record;
    v_processed integer := 0;
    v_failed integer := 0;
BEGIN
    FOR v_task IN 
        SELECT id, day, vendor_id
        FROM private.metrics_update_queue
        WHERE status = 'pending'
        ORDER BY created_at ASC
        LIMIT p_batch_size
        FOR UPDATE SKIP LOCKED
    LOOP
        BEGIN
            UPDATE private.metrics_update_queue
            SET status = 'processing', updated_at = now()
            WHERE id = v_task.id;
            
            IF v_task.vendor_id IS NOT NULL THEN
                PERFORM private.update_vendor_metrics_for_day(v_task.day, v_task.vendor_id);
            ELSE
                PERFORM private.update_platform_metrics_for_day(v_task.day);
            END IF;
            
            UPDATE private.metrics_update_queue
            SET status = 'completed', completed_at = now(), updated_at = now(), last_error = NULL
            WHERE id = v_task.id;
            
            v_processed := v_processed + 1;
        EXCEPTION
            WHEN OTHERS THEN
                UPDATE private.metrics_update_queue
                SET status = 'failed', attempts = attempts + 1, last_error = SQLERRM, updated_at = now()
                WHERE id = v_task.id;
                v_failed := v_failed + 1;
                RAISE WARNING 'Metrics update failed for task %: %', v_task.id, SQLERRM;
        END;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'processed', v_processed,
        'failed', v_failed,
        'message', format('Processed %s tasks (%s failed)', v_processed + v_failed, v_failed)
    );
END;
$$;


ALTER FUNCTION "private"."process_metrics_update_queue"("p_batch_size" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."reconcile_metrics_last_48h"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'private', 'metrics', 'public', 'pg_temp'
    AS $$
DECLARE
    v_start_date date;
    v_day date;
    v_vendor record;
    v_days_reconciled integer := 0;
    v_vendors_reconciled integer := 0;
    v_result jsonb;
BEGIN
    v_start_date := CURRENT_DATE - INTERVAL '2 days';
    RAISE NOTICE '[reconcile_metrics] Starting reconciliation from % to %', v_start_date, CURRENT_DATE;
    v_day := v_start_date;
    WHILE v_day <= CURRENT_DATE LOOP
        PERFORM private.update_platform_metrics_for_day(v_day);
        v_days_reconciled := v_days_reconciled + 1;
        v_day := v_day + INTERVAL '1 day';
    END LOOP;
    FOR v_vendor IN SELECT user_id FROM public.vendor_profiles
    LOOP
        v_day := v_start_date;
        WHILE v_day <= CURRENT_DATE LOOP
            PERFORM private.update_vendor_metrics_for_day(v_day, v_vendor.user_id);
            v_day := v_day + INTERVAL '1 day';
        END LOOP;
        v_vendors_reconciled := v_vendors_reconciled + 1;
    END LOOP;
    FOR v_vendor IN SELECT user_id FROM public.vendor_profiles
    LOOP
        PERFORM private.update_vendor_realtime_cache(v_vendor.user_id);
    END LOOP;
    v_result := jsonb_build_object(
        'success', true,
        'reconciliation_window', jsonb_build_object('start_date', v_start_date, 'end_date', CURRENT_DATE),
        'stats', jsonb_build_object('days_reconciled', v_days_reconciled, 'vendors_reconciled', v_vendors_reconciled),
        'timestamp', now()
    );
    RAISE NOTICE '[reconcile_metrics] Complete: % days × % vendors reconciled', v_days_reconciled, v_vendors_reconciled;
    RETURN v_result;
END;
$$;


ALTER FUNCTION "private"."reconcile_metrics_last_48h"() OWNER TO "postgres";


COMMENT ON FUNCTION "private"."reconcile_metrics_last_48h"() IS 'Reconciliation function that re-derives metrics for the last 48 hours to fix drift from late-arriving events or failed updates. Safe to run multiple times (idempotent). Scheduled to run nightly at 2 AM UTC.';



CREATE OR REPLACE FUNCTION "private"."update_metrics_on_order_completion"("p_order_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'private', 'metrics', 'public', 'pg_temp'
    AS $$
DECLARE
    v_order_day date;
    v_affected_vendors uuid[];
    v_vendor_id uuid;
BEGIN
    -- Get the order's day for metrics aggregation
    SELECT DATE(created_at)
    INTO v_order_day
    FROM public.orders
    WHERE id = p_order_id;
    
    IF v_order_day IS NULL THEN
        RAISE EXCEPTION 'Order % not found', p_order_id;
    END IF;
    
    -- Get all vendors affected by this order
    SELECT ARRAY_AGG(DISTINCT vendor_id)
    INTO v_affected_vendors
    FROM public.order_items
    WHERE order_id = p_order_id;
    
    -- Enqueue vendor-specific metrics updates (deduplicated)
    IF v_affected_vendors IS NOT NULL THEN
        FOREACH v_vendor_id IN ARRAY v_affected_vendors
        LOOP
            PERFORM private.enqueue_metrics_update(v_order_day, v_vendor_id);
        END LOOP;
    END IF;
    
    -- Enqueue platform-wide metrics update (deduplicated)
    PERFORM private.enqueue_metrics_update(v_order_day, NULL);
    
    RETURN jsonb_build_object(
        'success', true,
        'order_id', p_order_id,
        'order_day', v_order_day,
        'vendors_affected', COALESCE(array_length(v_affected_vendors, 1), 0),
        'message', 'Metrics updates enqueued (deduplicated)'
    );
    
EXCEPTION
    WHEN OTHERS THEN
        RAISE WARNING 'Metrics enqueue failed for order %: %', p_order_id, SQLERRM;
        RETURN jsonb_build_object(
            'success', false,
            'order_id', p_order_id,
            'error', SQLERRM,
            'message', 'Metrics enqueue failed - will be reconciled in next backfill'
        );
END;
$$;


ALTER FUNCTION "private"."update_metrics_on_order_completion"("p_order_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "private"."update_metrics_on_order_completion"("p_order_id" "uuid") IS 'Updates real-time analytics metrics for a completed order. IDEMPOTENT via re-aggregation approach. FAANG-audited for double-counting prevention.';



CREATE OR REPLACE FUNCTION "private"."update_platform_metrics_for_day"("p_day" "date") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'private', 'metrics', 'public', 'pg_temp'
    AS $$
BEGIN
    -- Use COALESCE at the outer level to ensure we always have a row
    INSERT INTO metrics.platform_daily (
        day,
        orders,
        gmv_cents,
        refunds_cents,
        platform_fees_cents,
        payouts_cents,
        pending_payout_cents,
        updated_at
    )
    SELECT 
        p_day as day,
        COALESCE(stats.orders, 0) as orders,
        COALESCE(stats.gmv_cents, 0) as gmv_cents,
        COALESCE(stats.refunds_cents, 0) as refunds_cents,
        COALESCE(stats.platform_fees_cents, 0) as platform_fees_cents,
        COALESCE(stats.payouts_cents, 0) as payouts_cents,
        COALESCE(stats.pending_payout_cents, 0) as pending_payout_cents,
        now() as updated_at
    FROM (
        -- This subquery might return no rows
        SELECT 
            COUNT(DISTINCT o.id)::integer as orders,
            COALESCE(SUM(o.total_cents::bigint), 0) as gmv_cents,
            0 as refunds_cents,
            COALESCE(SUM(
                ROUND(COALESCE(vp.commission_rate, 0.15) * oi.total_price_cents::bigint)
            )::bigint, 0) as platform_fees_cents,
            0 as payouts_cents,
            COALESCE(SUM(o.total_cents::bigint), 0) - 
            COALESCE(SUM(
                ROUND(COALESCE(vp.commission_rate, 0.15) * oi.total_price_cents::bigint)
            )::bigint, 0) as pending_payout_cents
        FROM public.orders o
        LEFT JOIN public.order_items oi ON oi.order_id = o.id
        LEFT JOIN public.vendor_profiles vp ON vp.user_id = oi.vendor_id
        WHERE o.status IN ('confirmed', 'shipped', 'delivered')
          AND DATE(o.created_at) = p_day
    ) AS stats
    -- RIGHT JOIN ensures we always have a row, even if stats is empty
    RIGHT JOIN (SELECT 1) AS dummy ON true
    ON CONFLICT (day) DO UPDATE SET
        orders = EXCLUDED.orders,
        gmv_cents = EXCLUDED.gmv_cents,
        refunds_cents = EXCLUDED.refunds_cents,
        platform_fees_cents = EXCLUDED.platform_fees_cents,
        payouts_cents = EXCLUDED.payouts_cents,
        pending_payout_cents = EXCLUDED.pending_payout_cents,
        updated_at = now();
END;
$$;


ALTER FUNCTION "private"."update_platform_metrics_for_day"("p_day" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."update_product_trending_score"("p_product_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'private', 'metrics', 'public', 'pg_temp'
    AS $$
DECLARE
    v_order_count_1d INTEGER;
    v_order_count_3d INTEGER;
    v_order_count_7d INTEGER;
    v_order_count_14d INTEGER;
    v_avg_rating NUMERIC;
    v_review_count INTEGER;
    v_score NUMERIC;
BEGIN
    -- Count orders in different time windows
    -- ✅ CRITICAL FIX: JOIN through product_variants (order_items has variant_id, NOT product_id)
    SELECT 
        COUNT(DISTINCT CASE WHEN o.created_at > NOW() - INTERVAL '1 day' THEN o.id END),
        COUNT(DISTINCT CASE WHEN o.created_at > NOW() - INTERVAL '3 days' THEN o.id END),
        COUNT(DISTINCT CASE WHEN o.created_at > NOW() - INTERVAL '7 days' THEN o.id END),
        COUNT(DISTINCT CASE WHEN o.created_at > NOW() - INTERVAL '14 days' THEN o.id END)
    INTO v_order_count_1d, v_order_count_3d, v_order_count_7d, v_order_count_14d
    FROM public.order_items oi
    JOIN public.product_variants pv ON oi.variant_id = pv.id  -- ✅ CRITICAL JOIN
    JOIN public.orders o ON oi.order_id = o.id
    WHERE pv.product_id = p_product_id  -- ✅ Filter by product_id from variant
      AND o.status IN ('confirmed', 'processing', 'shipped', 'delivered');
    
    -- Get average rating and review count from products table
    SELECT COALESCE(average_rating, 0), COALESCE(review_count, 0)
    INTO v_avg_rating, v_review_count
    FROM public.products
    WHERE id = p_product_id;
    
    -- Calculate time-decay weighted score
    -- Recent orders (1-3 days) weighted 10x more than old orders (14 days)
    v_score := (v_order_count_1d * 5.0) +      -- Last 24h: 5x weight
               (v_order_count_3d * 3.0) +      -- Last 3d: 3x weight
               (v_order_count_7d * 1.5) +      -- Last 7d: 1.5x weight
               (v_order_count_14d * 0.5) +     -- Last 14d: 0.5x weight
               (v_avg_rating * 0.3);            -- Rating boost
    
    -- Idempotent upsert (safe for retries)
    INSERT INTO metrics.product_trending_scores (
        product_id, score_date, 
        order_count_1d, order_count_3d, order_count_7d, order_count_14d,
        trend_score, weighted_rating, review_count, updated_at
    )
    VALUES (
        p_product_id, CURRENT_DATE,
        v_order_count_1d, v_order_count_3d, v_order_count_7d, v_order_count_14d,
        v_score, v_avg_rating, v_review_count, NOW()
    )
    ON CONFLICT (product_id, score_date) DO UPDATE SET
        order_count_1d = EXCLUDED.order_count_1d,
        order_count_3d = EXCLUDED.order_count_3d,
        order_count_7d = EXCLUDED.order_count_7d,
        order_count_14d = EXCLUDED.order_count_14d,
        trend_score = EXCLUDED.trend_score,
        weighted_rating = EXCLUDED.weighted_rating,
        review_count = EXCLUDED.review_count,
        updated_at = NOW();
END;
$$;


ALTER FUNCTION "private"."update_product_trending_score"("p_product_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "private"."update_product_trending_score"("p_product_id" "uuid") IS 'Event-driven trending score update. Called by order worker. CRITICAL: Joins through product_variants since order_items has variant_id (NOT product_id).';



CREATE OR REPLACE FUNCTION "private"."update_promotion_checks"("p_promotion_id" "uuid", "p_check_type" "text", "p_status" "text", "p_admin_id" "uuid", "p_note" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'private', 'pg_temp'
    AS $$
DECLARE
  v_promotion RECORD;
  v_admin_name TEXT;
  v_new_status TEXT;
  v_all_checks_passed BOOLEAN;
BEGIN
  -- Validate: Admin has admin role
  IF NOT public.user_has_role(p_admin_id, 'admin') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Unauthorized: Admin role required',
      'code', 'UNAUTHORIZED'
    );
  END IF;

  -- Get promotion record
  SELECT * INTO v_promotion
  FROM public.stylist_promotions
  WHERE id = p_promotion_id;

  IF v_promotion IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Promotion not found',
      'code', 'PROMOTION_NOT_FOUND'
    );
  END IF;

  -- Validate: Promotion is not already finalized
  IF v_promotion.status IN ('approved', 'rejected', 'revoked') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Cannot update checks on finalized promotion',
      'code', 'PROMOTION_FINALIZED'
    );
  END IF;

  -- Get admin name
  SELECT display_name INTO v_admin_name
  FROM public.user_profiles
  WHERE id = p_admin_id;

  -- Update the appropriate check field
  CASE p_check_type
    WHEN 'background_check' THEN
      IF p_status NOT IN ('pending', 'in_progress', 'passed', 'failed') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid status for background_check', 'code', 'INVALID_STATUS');
      END IF;
      UPDATE public.stylist_promotions
      SET background_check_status = p_status,
          notes = notes || jsonb_build_array(
            jsonb_build_object(
              'timestamp', NOW(),
              'admin_id', p_admin_id,
              'admin_name', v_admin_name,
              'action', 'background_check_updated',
              'status', p_status,
              'note', COALESCE(p_note, 'Background check status updated')
            )
          )
      WHERE id = p_promotion_id;

    WHEN 'id_verification' THEN
      IF p_status NOT IN ('pending', 'submitted', 'verified', 'rejected') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid status for id_verification', 'code', 'INVALID_STATUS');
      END IF;
      UPDATE public.stylist_promotions
      SET id_verification_status = p_status,
          notes = notes || jsonb_build_array(
            jsonb_build_object(
              'timestamp', NOW(),
              'admin_id', p_admin_id,
              'admin_name', v_admin_name,
              'action', 'id_verification_updated',
              'status', p_status,
              'note', COALESCE(p_note, 'ID verification status updated')
            )
          )
      WHERE id = p_promotion_id;

    WHEN 'training' THEN
      IF p_status NOT IN ('completed', 'true', 'false') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid status for training', 'code', 'INVALID_STATUS');
      END IF;
      UPDATE public.stylist_promotions
      SET training_completed = (p_status IN ('completed', 'true')),
          notes = notes || jsonb_build_array(
            jsonb_build_object(
              'timestamp', NOW(),
              'admin_id', p_admin_id,
              'admin_name', v_admin_name,
              'action', 'training_updated',
              'completed', (p_status IN ('completed', 'true')),
              'note', COALESCE(p_note, 'Training status updated')
            )
          )
      WHERE id = p_promotion_id;

    WHEN 'mfa' THEN
      IF p_status NOT IN ('enabled', 'true', 'false') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid status for mfa', 'code', 'INVALID_STATUS');
      END IF;
      UPDATE public.stylist_promotions
      SET mfa_enabled = (p_status IN ('enabled', 'true')),
          notes = notes || jsonb_build_array(
            jsonb_build_object(
              'timestamp', NOW(),
              'admin_id', p_admin_id,
              'admin_name', v_admin_name,
              'action', 'mfa_updated',
              'enabled', (p_status IN ('enabled', 'true')),
              'note', COALESCE(p_note, 'MFA status updated')
            )
          )
      WHERE id = p_promotion_id;

    ELSE
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Invalid check_type. Must be: background_check, id_verification, training, or mfa',
        'code', 'INVALID_CHECK_TYPE'
      );
  END CASE;

  -- Refresh promotion record
  SELECT * INTO v_promotion
  FROM public.stylist_promotions
  WHERE id = p_promotion_id;

  -- Determine new workflow status based on check completion
  v_all_checks_passed := (
    v_promotion.background_check_status = 'passed' AND
    v_promotion.id_verification_status = 'verified' AND
    v_promotion.training_completed = TRUE AND
    v_promotion.mfa_enabled = TRUE
  );

  -- Auto-advance status if all checks passed
  IF v_all_checks_passed AND v_promotion.status != 'pending_approval' THEN
    UPDATE public.stylist_promotions
    SET status = 'pending_approval',
        notes = notes || jsonb_build_array(
          jsonb_build_object(
            'timestamp', NOW(),
            'admin_id', p_admin_id,
            'admin_name', v_admin_name,
            'action', 'auto_status_update',
            'new_status', 'pending_approval',
            'note', 'All verification checks passed. Ready for final approval.'
          )
        )
    WHERE id = p_promotion_id;
    v_new_status := 'pending_approval';
  ELSE
    v_new_status := v_promotion.status;
  END IF;

  -- Log to service_management_log
  INSERT INTO private.service_management_log (
    admin_user_id,
    action,
    target_id,
    target_type,
    severity,
    category,
    details
  )
  VALUES (
    p_admin_id,
    'update_promotion_checks',
    p_promotion_id,
    'stylist_promotion',
    'info',
    'governance',
    jsonb_build_object(
      'check_type', p_check_type,
      'new_status', p_status,
      'all_checks_passed', v_all_checks_passed,
      'workflow_status', v_new_status
    )
  );

  -- Return success
  RETURN jsonb_build_object(
    'success', true,
    'promotion_id', p_promotion_id,
    'check_type', p_check_type,
    'check_status', p_status,
    'workflow_status', v_new_status,
    'all_checks_passed', v_all_checks_passed,
    'message', 'Check status updated successfully'
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM,
    'code', 'INTERNAL_ERROR'
  );
END;
$$;


ALTER FUNCTION "private"."update_promotion_checks"("p_promotion_id" "uuid", "p_check_type" "text", "p_status" "text", "p_admin_id" "uuid", "p_note" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "private"."update_promotion_checks"("p_promotion_id" "uuid", "p_check_type" "text", "p_status" "text", "p_admin_id" "uuid", "p_note" "text") IS 'Step 2 of stylist promotion workflow. Updates verification checks and auto-advances status when all checks pass.';



CREATE OR REPLACE FUNCTION "private"."update_vendor_metrics_for_day"("p_day" "date", "p_vendor_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'private', 'metrics', 'public', 'pg_temp'
    AS $$
BEGIN
    -- Ensure we always insert/update a row, even with zeros
    INSERT INTO metrics.vendor_daily (
        vendor_id,
        day,
        orders,
        gmv_cents,
        refunds_cents,
        platform_fees_cents,
        payouts_cents,
        pending_payout_cents,
        updated_at
    )
    SELECT 
        p_vendor_id as vendor_id,
        p_day as day,
        COALESCE(stats.orders, 0) as orders,
        COALESCE(stats.gmv_cents, 0) as gmv_cents,
        COALESCE(stats.refunds_cents, 0) as refunds_cents,
        COALESCE(stats.platform_fees_cents, 0) as platform_fees_cents,
        COALESCE(stats.payouts_cents, 0) as payouts_cents,
        COALESCE(stats.pending_payout_cents, 0) as pending_payout_cents,
        now() as updated_at
    FROM (
        -- This subquery might return no rows for a vendor with no orders
        SELECT 
            COUNT(DISTINCT o.id)::integer as orders,
            COALESCE(SUM(oi.total_price_cents::bigint), 0) as gmv_cents,
            0 as refunds_cents,
            ROUND(MAX(COALESCE(vp.commission_rate, 0.15)) * COALESCE(SUM(oi.total_price_cents::bigint), 0))::bigint as platform_fees_cents,
            0 as payouts_cents,
            COALESCE(SUM(oi.total_price_cents::bigint), 0) - 
            ROUND(MAX(COALESCE(vp.commission_rate, 0.15)) * COALESCE(SUM(oi.total_price_cents::bigint), 0))::bigint as pending_payout_cents
        FROM public.order_items oi
        JOIN public.orders o ON o.id = oi.order_id
        LEFT JOIN public.vendor_profiles vp ON vp.user_id = p_vendor_id
        WHERE oi.vendor_id = p_vendor_id
          AND o.status IN ('confirmed', 'shipped', 'delivered')
          AND DATE(o.created_at) = p_day
    ) AS stats
    -- RIGHT JOIN ensures we always have a row
    RIGHT JOIN (SELECT 1) AS dummy ON true
    ON CONFLICT (vendor_id, day) DO UPDATE SET
        orders = EXCLUDED.orders,
        gmv_cents = EXCLUDED.gmv_cents,
        refunds_cents = EXCLUDED.refunds_cents,
        platform_fees_cents = EXCLUDED.platform_fees_cents,
        payouts_cents = EXCLUDED.payouts_cents,
        pending_payout_cents = EXCLUDED.pending_payout_cents,
        updated_at = now();
END;
$$;


ALTER FUNCTION "private"."update_vendor_metrics_for_day"("p_day" "date", "p_vendor_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."update_vendor_realtime_cache"("p_vendor_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'private', 'metrics', 'public', 'pg_temp'
    AS $$
BEGIN
    -- Always upsert a row for today, even with zeros
    INSERT INTO metrics.vendor_realtime_cache (
        vendor_id,
        cache_date,
        orders,
        gmv_cents,
        refunds_cents,
        platform_fees_cents,
        updated_at
    )
    SELECT 
        p_vendor_id,
        CURRENT_DATE,
        COALESCE(stats.orders, 0),
        COALESCE(stats.gmv_cents, 0),
        COALESCE(stats.refunds_cents, 0),
        COALESCE(stats.platform_fees_cents, 0),
        now()
    FROM (
        SELECT 
            COUNT(DISTINCT o.id)::integer as orders,
            COALESCE(SUM(oi.total_price_cents::bigint), 0) as gmv_cents,
            0 as refunds_cents,
            ROUND(MAX(COALESCE(vp.commission_rate, 0.15)) * COALESCE(SUM(oi.total_price_cents::bigint), 0))::bigint as platform_fees_cents
        FROM public.order_items oi
        JOIN public.orders o ON o.id = oi.order_id
        LEFT JOIN public.vendor_profiles vp ON vp.user_id = p_vendor_id
        WHERE oi.vendor_id = p_vendor_id
          AND o.status IN ('confirmed', 'shipped', 'delivered')
          AND DATE(o.created_at) = CURRENT_DATE
    ) AS stats
    RIGHT JOIN (SELECT 1) AS dummy ON true
    ON CONFLICT (vendor_id, cache_date) DO UPDATE SET
        orders = EXCLUDED.orders,
        gmv_cents = EXCLUDED.gmv_cents,
        refunds_cents = EXCLUDED.refunds_cents,
        platform_fees_cents = EXCLUDED.platform_fees_cents,
        updated_at = now();
END;
$$;


ALTER FUNCTION "private"."update_vendor_realtime_cache"("p_vendor_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."acquire_next_job"("p_worker_id" "text", "p_lock_timeout_seconds" integer DEFAULT 30) RETURNS TABLE("id" "uuid", "job_type" "text", "payload" "jsonb", "attempts" integer, "max_attempts" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
    RETURN QUERY
    UPDATE job_queue jq
    SET 
        status = 'processing',
        locked_by = p_worker_id,
        locked_until = NOW() + (p_lock_timeout_seconds || ' seconds')::INTERVAL,
        started_at = NOW()
    WHERE jq.id = (
        SELECT jq2.id 
        FROM job_queue jq2
        WHERE jq2.status = 'pending'
            AND (jq2.locked_until IS NULL OR jq2.locked_until < NOW())
        ORDER BY jq2.priority, jq2.created_at
        FOR UPDATE SKIP LOCKED
        LIMIT 1
    )
    RETURNING 
        jq.id,
        jq.job_type,
        jq.payload,
        jq.attempts,
        jq.max_attempts;
END;
$$;


ALTER FUNCTION "public"."acquire_next_job"("p_worker_id" "text", "p_lock_timeout_seconds" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."activate_user"("p_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth', 'private', 'pg_temp'
    SET "statement_timeout" TO '5s'
    AS $$
DECLARE
  v_admin_id uuid;
BEGIN
  v_admin_id := auth.uid();
  
  -- Verify admin (FIXED)
  PERFORM private.assert_admin();
  
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
  INSERT INTO public.user_audit_log (user_id, action, resource_type, resource_id, new_values)
  VALUES (
    v_admin_id,
    'user_activated',
    'user',
    p_user_id,
    jsonb_build_object('target_user_id', p_user_id)
  );
  
  RETURN jsonb_build_object(
    'success', true, 
    'message', 'User activated successfully'
  );
END;
$$;


ALTER FUNCTION "public"."activate_user"("p_user_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."activate_user"("p_user_id" "uuid") IS 'Fixed: IF NOT assert_admin() → PERFORM assert_admin()';



CREATE OR REPLACE FUNCTION "public"."activate_vendor"("p_vendor_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth', 'private', 'pg_temp'
    SET "statement_timeout" TO '5s'
    AS $$
DECLARE
  v_admin_id uuid;
BEGIN
  v_admin_id := auth.uid();
  
  -- FIXED: Removed IF NOT, use PERFORM
  PERFORM private.assert_admin();
  
  UPDATE auth.users
  SET banned_until = NULL
  WHERE id = p_vendor_id AND deleted_at IS NULL;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Vendor not found'
    );
  END IF;
  
  INSERT INTO user_audit_log (user_id, action, resource_type, resource_id, new_values)
  VALUES (
    v_admin_id,
    'vendor_activated',
    'vendor_profile',
    p_vendor_id,
    jsonb_build_object('vendor_id', p_vendor_id)
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'message', 'Vendor activated successfully (products remain inactive)'
  );
END;
$$;


ALTER FUNCTION "public"."activate_vendor"("p_vendor_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."activate_vendor"("p_vendor_id" "uuid") IS 'Fixed: IF NOT assert_admin() → PERFORM assert_admin()';



CREATE OR REPLACE FUNCTION "public"."add_combo_to_cart_secure"("p_combo_id" "uuid", "p_user_id" "uuid" DEFAULT NULL::"uuid", "p_guest_token" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_cart_id UUID;
  v_combo RECORD;
  v_item RECORD;
  v_combo_group_id UUID;
  v_existing_combo_group_id UUID;
  v_total_original_price NUMERIC := 0;
  v_discount_ratio NUMERIC;
  v_discounted_price NUMERIC;
  v_available_qty INTEGER;
  v_combo_remaining INTEGER;
  v_base_quantity INTEGER;
BEGIN
  -- Validate auth
  IF p_user_id IS NULL AND p_guest_token IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'User ID or guest token required');
  END IF;

  -- Get combo details
  SELECT * INTO v_combo FROM products 
  WHERE id = p_combo_id AND is_combo = true AND is_active = true;
  
  IF v_combo IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Combo not found or inactive');
  END IF;
  
  -- Check combo quantity limit
  IF v_combo.combo_quantity_limit IS NOT NULL THEN
    v_combo_remaining := v_combo.combo_quantity_limit - COALESCE(v_combo.combo_quantity_sold, 0);
    IF v_combo_remaining <= 0 THEN
      RETURN jsonb_build_object('success', false, 'message', 'Combo sold out');
    END IF;
  END IF;
  
  -- Calculate total original price IN RUPEES
  FOR v_item IN 
    SELECT ci.*, pv.price, COALESCE(i.quantity_available, 0) as quantity_available, p.name as product_name
    FROM combo_items ci
    JOIN product_variants pv ON ci.constituent_variant_id = pv.id
    JOIN products p ON ci.constituent_product_id = p.id
    LEFT JOIN inventory i ON i.variant_id = pv.id
    WHERE ci.combo_product_id = p_combo_id
  LOOP
    -- Check inventory
    IF v_item.quantity_available < v_item.quantity THEN
      RETURN jsonb_build_object(
        'success', false, 
        'message', 'Insufficient inventory for ' || v_item.product_name
      );
    END IF;
    
    -- Sum original prices (variant price is in RUPEES)
    v_total_original_price := v_total_original_price + (v_item.price * v_item.quantity);
  END LOOP;
  
  -- CRITICAL FIX: Convert combo_price_cents to rupees before calculation
  IF v_total_original_price > 0 THEN
    v_discount_ratio := (v_combo.combo_price_cents::NUMERIC / 100) / v_total_original_price;
  ELSE
    RETURN jsonb_build_object('success', false, 'message', 'Invalid combo configuration');
  END IF;
  
  -- Get or create cart
  IF p_user_id IS NOT NULL THEN
    SELECT id INTO v_cart_id FROM carts WHERE user_id = p_user_id;
    IF v_cart_id IS NULL THEN
      INSERT INTO carts (user_id) VALUES (p_user_id) RETURNING id INTO v_cart_id;
    END IF;
  ELSE
    SELECT id INTO v_cart_id FROM carts WHERE session_id = p_guest_token;
    IF v_cart_id IS NULL THEN
      INSERT INTO carts (session_id) VALUES (p_guest_token) RETURNING id INTO v_cart_id;
    END IF;
  END IF;
  
  -- 🔥 NEW: Check if this combo already exists in cart
  SELECT combo_group_id, quantity INTO v_existing_combo_group_id, v_base_quantity
  FROM cart_items
  WHERE cart_id = v_cart_id
    AND combo_id = p_combo_id
    AND combo_group_id IS NOT NULL
  ORDER BY created_at DESC
  LIMIT 1;
  
  -- If combo already exists, increment its quantity instead of creating new group
  IF v_existing_combo_group_id IS NOT NULL THEN
    -- Call update_combo_quantity_secure to increment by 1
    RETURN public.update_combo_quantity_secure(
      v_existing_combo_group_id,
      v_base_quantity + 1,
      p_user_id,
      p_guest_token
    );
  END IF;
  
  -- Generate unique group ID (only if combo doesn't exist)
  v_combo_group_id := gen_random_uuid();
  
  -- Add items with CORRECT discounted prices
  FOR v_item IN 
    SELECT ci.*, pv.price
    FROM combo_items ci
    JOIN product_variants pv ON ci.constituent_variant_id = pv.id
    WHERE ci.combo_product_id = p_combo_id
    ORDER BY ci.display_order
  LOOP
    -- Apply discount ratio (now correct!)
    v_discounted_price := ROUND(v_item.price * v_discount_ratio, 2);
    
    INSERT INTO cart_items (cart_id, variant_id, quantity, price_snapshot, combo_id, combo_group_id)
    VALUES (v_cart_id, v_item.constituent_variant_id, v_item.quantity, v_discounted_price, p_combo_id, v_combo_group_id);
  END LOOP;
  
  -- Update cart timestamp
  UPDATE carts SET updated_at = now() WHERE id = v_cart_id;
  
  RETURN jsonb_build_object(
    'success', true, 
    'combo_group_id', v_combo_group_id,
    'combo_name', v_combo.name,
    'combo_price_cents', v_combo.combo_price_cents,
    'savings_cents', v_combo.combo_savings_cents,
    'merged', false
  );
END;
$$;


ALTER FUNCTION "public"."add_combo_to_cart_secure"("p_combo_id" "uuid", "p_user_id" "uuid", "p_guest_token" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."add_combo_to_cart_secure"("p_combo_id" "uuid", "p_user_id" "uuid", "p_guest_token" "text") IS 'Adds a combo to cart. If the same combo already exists, increments its quantity instead of creating a duplicate group. Only callable by service_role via Edge Functions.';



CREATE OR REPLACE FUNCTION "public"."add_product_recommendation"("p_source_product_id" "uuid", "p_recommended_product_id" "uuid", "p_display_order" integer DEFAULT 0) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'private', 'pg_temp'
    AS $$
DECLARE
    v_recommendation_id UUID;
BEGIN
    -- Self-defense: Only admins can add recommendations
    PERFORM private.assert_admin();
    
    -- Verify both products exist
    IF NOT EXISTS (SELECT 1 FROM public.products WHERE id = p_source_product_id) THEN
        RAISE EXCEPTION 'Source product not found: %', p_source_product_id USING ERRCODE = '22023';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM public.products WHERE id = p_recommended_product_id) THEN
        RAISE EXCEPTION 'Recommended product not found: %', p_recommended_product_id USING ERRCODE = '22023';
    END IF;
    
    -- Insert recommendation
    INSERT INTO public.product_recommendations (
        source_product_id,
        recommended_product_id,
        display_order,
        recommendation_type,
        created_by
    ) VALUES (
        p_source_product_id,
        p_recommended_product_id,
        p_display_order,
        'manual',
        auth.uid()
    )
    RETURNING id INTO v_recommendation_id;
    
    RETURN v_recommendation_id;
EXCEPTION
    WHEN unique_violation THEN
        RAISE EXCEPTION 'Recommendation already exists for these products' USING ERRCODE = '23505';
    WHEN check_violation THEN
        RAISE EXCEPTION 'Cannot recommend a product to itself' USING ERRCODE = '23514';
END;
$$;


ALTER FUNCTION "public"."add_product_recommendation"("p_source_product_id" "uuid", "p_recommended_product_id" "uuid", "p_display_order" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."add_product_recommendation"("p_source_product_id" "uuid", "p_recommended_product_id" "uuid", "p_display_order" integer) IS 'Admin-only function to add product recommendations. Self-defending with assert_admin(). Returns recommendation ID.';



CREATE OR REPLACE FUNCTION "public"."add_product_variant"("p_product_id" "uuid", "p_sku" character varying, "p_price" numeric, "p_compare_at_price" numeric DEFAULT NULL::numeric, "p_cost_price" numeric DEFAULT NULL::numeric, "p_quantity" integer DEFAULT 0, "p_attribute_value_ids" "uuid"[] DEFAULT '{}'::"uuid"[]) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'private', 'pg_temp'
    SET "statement_timeout" TO '30s'
    AS $_$
DECLARE
  v_vendor_id uuid;
  v_product_vendor_id uuid;
  v_variant_id uuid;
  v_location_id uuid;
  v_variant_count integer;
  v_attr_value_id uuid;
BEGIN
  -- 1. Authentication check
  v_vendor_id := auth.uid();
  IF v_vendor_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: Must be authenticated';
  END IF;
  
  -- 2. Role check
  IF NOT public.user_has_role(v_vendor_id, 'vendor') THEN
    RAISE EXCEPTION 'Unauthorized: Must be a vendor';
  END IF;
  
  -- 3. Verify product ownership
  SELECT vendor_id INTO v_product_vendor_id
  FROM products WHERE id = p_product_id;
  
  IF v_product_vendor_id IS NULL THEN
    RAISE EXCEPTION 'Product not found';
  END IF;
  
  IF v_product_vendor_id != v_vendor_id THEN
    RAISE EXCEPTION 'Unauthorized: Cannot add variants to products you do not own';
  END IF;
  
  -- 4. Validate SKU format
  IF p_sku !~ '^[A-Z0-9][A-Z0-9\-_]{0,49}$' THEN
    RAISE EXCEPTION 'Invalid SKU format: must be alphanumeric with hyphens/underscores, max 50 chars';
  END IF;
  
  -- 5. Check variant limit (max 100 per product)
  SELECT COUNT(*) INTO v_variant_count
  FROM product_variants WHERE product_id = p_product_id;
  
  IF v_variant_count >= 100 THEN
    RAISE EXCEPTION 'Maximum 100 variants per product';
  END IF;
  
  -- 6. Validate price
  IF p_price < 0 THEN
    RAISE EXCEPTION 'Price cannot be negative';
  END IF;
  
  -- 7. Get default inventory location
  SELECT id INTO v_location_id
  FROM inventory_locations
  WHERE vendor_id = v_vendor_id AND is_default = true
  LIMIT 1;
  
  IF v_location_id IS NULL THEN
    -- Create default location if not exists
    INSERT INTO inventory_locations (vendor_id, name, is_default)
    VALUES (v_vendor_id, 'Default Warehouse', true)
    RETURNING id INTO v_location_id;
  END IF;
  
  -- 8. Create variant
  INSERT INTO product_variants (
    product_id, sku, price, compare_at_price, cost_price, is_active
  ) VALUES (
    p_product_id, p_sku, p_price, p_compare_at_price, p_cost_price, true
  )
  RETURNING id INTO v_variant_id;
  
  -- 9. Link attribute values
  FOREACH v_attr_value_id IN ARRAY p_attribute_value_ids
  LOOP
    INSERT INTO variant_attribute_values (variant_id, attribute_value_id)
    VALUES (v_variant_id, v_attr_value_id);
  END LOOP;
  
  -- 10. Create inventory record
  INSERT INTO inventory (variant_id, location_id, quantity_available)
  VALUES (v_variant_id, v_location_id, p_quantity);
  
  -- 11. Audit log
  INSERT INTO product_change_log (
    product_id, changed_by, change_type, new_values
  ) VALUES (
    p_product_id, v_vendor_id, 'variant_added',
    jsonb_build_object('variant_id', v_variant_id, 'sku', p_sku)
  );
  
  -- 12. Notify cache
  PERFORM pg_notify('product_changed', json_build_object(
    'product_id', p_product_id,
    'action', 'variant_added'
  )::text);
  
  -- 13. Return result
  RETURN jsonb_build_object(
    'success', true,
    'variant_id', v_variant_id,
    'message', 'Variant added successfully'
  );

EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'SKU already exists';
  WHEN foreign_key_violation THEN
    RAISE EXCEPTION 'Invalid attribute value reference';
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Failed to add variant: %', SQLERRM;
END;
$_$;


ALTER FUNCTION "public"."add_product_variant"("p_product_id" "uuid", "p_sku" character varying, "p_price" numeric, "p_compare_at_price" numeric, "p_cost_price" numeric, "p_quantity" integer, "p_attribute_value_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."add_stylist_notes"("p_booking_id" "uuid", "p_notes" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
    v_booking RECORD;
    v_updated_notes TEXT;
    v_user_id UUID := auth.uid();
BEGIN
    IF p_notes IS NULL OR LENGTH(TRIM(p_notes)) < 1 THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'Notes cannot be empty',
            'code', 'INVALID_INPUT'
        );
    END IF;
    
    IF LENGTH(p_notes) > 2000 THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'Notes must be less than 2000 characters',
            'code', 'NOTES_TOO_LONG'
        );
    END IF;
    
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
    
    v_updated_notes := COALESCE(v_booking.stylist_notes, '') || 
        E'\n\n[' || TO_CHAR(NOW(), 'YYYY-MM-DD HH24:MI') || ']\n' || 
        TRIM(p_notes);
    
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
$$;


ALTER FUNCTION "public"."add_stylist_notes"("p_booking_id" "uuid", "p_notes" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."add_support_message"("p_ticket_id" "uuid", "p_message_text" "text", "p_is_internal" boolean DEFAULT false) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_user_id uuid;
  v_ticket_owner uuid;
  v_message_id uuid;
  v_is_admin_or_support boolean;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Authentication required'
    );
  END IF;
  
  -- Check if user is admin or support
  v_is_admin_or_support := (
    public.user_has_role(v_user_id, 'admin') OR 
    public.user_has_role(v_user_id, 'support')
  );
  
  -- Only admins/support can create internal notes
  IF p_is_internal AND NOT v_is_admin_or_support THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Only support staff can create internal notes'
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
    p_is_internal,
    false
  )
  RETURNING id INTO v_message_id;
  
  -- Update ticket status if customer responds to a resolved/closed ticket
  IF NOT v_is_admin_or_support THEN
    UPDATE public.support_tickets
    SET status = CASE 
      WHEN status IN ('resolved', 'closed') THEN 'open'
      ELSE status
    END,
    updated_at = now()
    WHERE id = p_ticket_id;
  ELSE
    -- Just update the timestamp for admin/support replies
    UPDATE public.support_tickets
    SET updated_at = now()
    WHERE id = p_ticket_id;
  END IF;
  
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


ALTER FUNCTION "public"."add_support_message"("p_ticket_id" "uuid", "p_message_text" "text", "p_is_internal" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."add_to_cart_secure"("p_variant_id" "uuid", "p_quantity" integer, "p_user_id" "uuid" DEFAULT NULL::"uuid", "p_guest_token" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_cart_id UUID;
  v_available INT;
  v_item_id UUID;
  v_variant_price NUMERIC;
  v_final_qty INT;
  v_existing_qty INT;
  v_existing_item_id UUID;
BEGIN
  -- Note: NO auth.uid() check here because edge function uses service_role
  -- Edge function already verified the user's JWT before calling this RPC
  -- This RPC trusts the parameters passed by the edge function
  
  v_cart_id := public.get_or_create_cart_secure(p_user_id, p_guest_token);

  -- Check stock availability
  SELECT COALESCE(SUM(quantity_available), 0) 
  INTO v_available 
  FROM inventory 
  WHERE variant_id = p_variant_id;
  
  IF v_available <= 0 THEN
    RETURN jsonb_build_object('success', false, 'message', 'Out of stock');
  END IF;

  -- Get current price
  SELECT price 
  INTO v_variant_price 
  FROM product_variants 
  WHERE id = p_variant_id;
  
  IF v_variant_price IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Invalid product variant');
  END IF;

  -- 🔥 NEW: Manual check for existing item (since we removed UNIQUE constraint)
  -- Only check for NON-COMBO items (combo_group_id IS NULL)
  SELECT id, quantity 
  INTO v_existing_item_id, v_existing_qty 
  FROM cart_items 
  WHERE cart_id = v_cart_id 
    AND variant_id = p_variant_id
    AND combo_group_id IS NULL  -- Only merge regular items, not combo items
  LIMIT 1;

  -- Calculate final quantity
  v_final_qty := LEAST(
    COALESCE(v_existing_qty, 0) + p_quantity,
    v_available,
    99
  );

  -- 🔥 NEW: Manual INSERT or UPDATE (no ON CONFLICT)
  IF v_existing_item_id IS NOT NULL THEN
    -- Item exists, update quantity
    UPDATE cart_items 
    SET 
      quantity = v_final_qty,
      price_snapshot = v_variant_price,
      updated_at = NOW()
    WHERE id = v_existing_item_id
    RETURNING id INTO v_item_id;
  ELSE
    -- Item doesn't exist, insert new
    INSERT INTO cart_items (cart_id, variant_id, quantity, price_snapshot)
    VALUES (v_cart_id, p_variant_id, LEAST(p_quantity, v_available, 99), v_variant_price)
    RETURNING id INTO v_item_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true, 
    'message', 'Item added to cart',
    'cart_id', v_cart_id,
    'item_id', v_item_id,
    'final_quantity', v_final_qty
  );
END;
$$;


ALTER FUNCTION "public"."add_to_cart_secure"("p_variant_id" "uuid", "p_quantity" integer, "p_user_id" "uuid", "p_guest_token" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."add_to_cart_secure"("p_variant_id" "uuid", "p_quantity" integer, "p_user_id" "uuid", "p_guest_token" "text") IS 'Adds a regular product to cart. Merges with existing non-combo items. Only callable by service_role via Edge Functions.';



CREATE OR REPLACE FUNCTION "public"."add_vendor_attribute"("p_name" character varying, "p_display_name" character varying, "p_attribute_type" character varying, "p_is_variant_defining" boolean DEFAULT true, "p_values" "jsonb" DEFAULT '[]'::"jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'private', 'pg_temp'
    SET "statement_timeout" TO '30s'
    AS $_$
DECLARE
  v_vendor_id uuid;
  v_attribute_id uuid;
  v_value_record jsonb;
  v_value_id uuid;
  v_result jsonb;
BEGIN
  -- 1. Authentication check
  v_vendor_id := auth.uid();
  IF v_vendor_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: Must be authenticated';
  END IF;
  
  -- 2. Role check
  IF NOT public.user_has_role(v_vendor_id, 'vendor') THEN
    RAISE EXCEPTION 'Unauthorized: Must be a vendor';
  END IF;
  
  -- 3. Input validation
  IF p_name !~ '^[a-zA-Z][a-zA-Z0-9_]{0,49}$' THEN
    RAISE EXCEPTION 'Invalid attribute name: must start with letter, alphanumeric/underscore only, max 50 chars';
  END IF;
  
  IF p_attribute_type NOT IN ('text', 'color', 'number', 'select') THEN
    RAISE EXCEPTION 'Invalid attribute type: must be text, color, number, or select';
  END IF;
  
  -- 4. Check vendor attribute limit (max 10 custom attributes per vendor)
  IF (SELECT COUNT(*) FROM product_attributes WHERE vendor_id = v_vendor_id) >= 10 THEN
    RAISE EXCEPTION 'Maximum 10 custom attributes per vendor';
  END IF;
  
  -- 5. Check for duplicate name
  IF EXISTS (
    SELECT 1 FROM product_attributes 
    WHERE vendor_id = v_vendor_id AND lower(name) = lower(p_name)
  ) THEN
    RAISE EXCEPTION 'Attribute with this name already exists';
  END IF;
  
  -- 6. Create attribute
  INSERT INTO product_attributes (
    name, display_name, attribute_type, is_variant_defining, vendor_id, is_active, sort_order
  ) VALUES (
    lower(p_name), p_display_name, p_attribute_type, p_is_variant_defining, v_vendor_id, true,
    (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM product_attributes WHERE vendor_id = v_vendor_id)
  )
  RETURNING id INTO v_attribute_id;
  
  -- 7. Create attribute values if provided
  FOR v_value_record IN SELECT * FROM jsonb_array_elements(p_values)
  LOOP
    INSERT INTO attribute_values (
      attribute_id, value, display_value, color_hex, vendor_id, is_active, sort_order
    ) VALUES (
      v_attribute_id,
      lower(v_value_record->>'value'),
      v_value_record->>'display_value',
      v_value_record->>'color_hex',
      v_vendor_id,
      true,
      COALESCE((v_value_record->>'sort_order')::integer, 0)
    );
  END LOOP;
  
  -- NOTE: Removed product_change_log insert - attributes are not product-specific
  -- The attribute creation is tracked via the product_attributes table with created_at timestamp
  
  -- 8. Return result
  RETURN jsonb_build_object(
    'success', true,
    'attribute_id', v_attribute_id,
    'message', 'Attribute created successfully'
  );

EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'Attribute or value already exists';
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Failed to create attribute: %', SQLERRM;
END;
$_$;


ALTER FUNCTION "public"."add_vendor_attribute"("p_name" character varying, "p_display_name" character varying, "p_attribute_type" character varying, "p_is_variant_defining" boolean, "p_values" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_create_category"("p_name" "text", "p_slug" "text", "p_parent_id" "uuid" DEFAULT NULL::"uuid", "p_description" "text" DEFAULT NULL::"text", "p_image_url" "text" DEFAULT NULL::"text", "p_sort_order" integer DEFAULT 0) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'private', 'pg_temp'
    SET "statement_timeout" TO '5s'
    AS $$
DECLARE
  v_admin_id uuid;
  v_category_id uuid;
  v_slug_exists boolean;
BEGIN
  v_admin_id := auth.uid();
  
  -- Security: Verify admin access
  PERFORM private.assert_admin();
  
  -- Validation: Check required fields
  IF p_name IS NULL OR trim(p_name) = '' THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Category name is required'
    );
  END IF;
  
  IF p_slug IS NULL OR trim(p_slug) = '' THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Category slug is required'
    );
  END IF;
  
  -- Validation: Check slug uniqueness
  SELECT EXISTS(
    SELECT 1 FROM categories WHERE slug = p_slug
  ) INTO v_slug_exists;
  
  IF v_slug_exists THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Category slug already exists. Please choose a different slug.'
    );
  END IF;
  
  -- Validation: If parent_id provided, verify it exists
  IF p_parent_id IS NOT NULL THEN
    IF NOT EXISTS(SELECT 1 FROM categories WHERE id = p_parent_id) THEN
      RETURN jsonb_build_object(
        'success', false,
        'message', 'Parent category not found'
      );
    END IF;
  END IF;
  
  -- Create category
  INSERT INTO categories (
    name,
    slug,
    parent_id,
    description,
    image_url,
    sort_order,
    is_active
  ) VALUES (
    trim(p_name),
    trim(p_slug),
    p_parent_id,
    trim(p_description),
    trim(p_image_url),
    COALESCE(p_sort_order, 0),
    true
  )
  RETURNING id INTO v_category_id;
  
  -- Audit log
  INSERT INTO user_audit_log (
    user_id,
    action,
    resource_type,
    resource_id,
    new_values
  ) VALUES (
    v_admin_id,
    'category_created',
    'category',
    v_category_id,
    jsonb_build_object(
      'name', p_name,
      'slug', p_slug,
      'parent_id', p_parent_id
    )
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'message', 'Category created successfully',
    'category_id', v_category_id
  );
END;
$$;


ALTER FUNCTION "public"."admin_create_category"("p_name" "text", "p_slug" "text", "p_parent_id" "uuid", "p_description" "text", "p_image_url" "text", "p_sort_order" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_create_stylist_schedule"("p_stylist_id" "uuid", "p_schedules" "jsonb", "p_effective_from" "date" DEFAULT NULL::"date", "p_effective_until" "date" DEFAULT NULL::"date") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'private', 'pg_temp'
    AS $$
DECLARE
  v_day_schedule JSONB;
  v_created_count INTEGER := 0;
  v_schedule_id UUID;
  v_effective_from_date DATE;
BEGIN
  -- ✅ FIX: Use assert_admin() for consistent error handling
  PERFORM private.assert_admin();
  
  -- Verify stylist exists
  IF NOT EXISTS (
    SELECT 1 FROM public.stylist_profiles WHERE user_id = p_stylist_id AND is_active = true
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Stylist not found or inactive',
      'code', 'NOT_FOUND'
    );
  END IF;
  
  -- Validate effective date range if both provided
  IF p_effective_from IS NOT NULL AND p_effective_until IS NOT NULL THEN
    IF p_effective_from > p_effective_until THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'End date must be after start date',
        'code', 'INVALID_DATE_RANGE'
      );
    END IF;
  END IF;
  
  -- Set default effective_from to today if not provided
  v_effective_from_date := COALESCE(p_effective_from, CURRENT_DATE);
  
  -- Loop through each day schedule
  FOR v_day_schedule IN SELECT * FROM jsonb_array_elements(p_schedules)
  LOOP
    -- Validate time range
    IF (v_day_schedule->>'start_time')::TIME >= (v_day_schedule->>'end_time')::TIME THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', format('Invalid time range for day %s', v_day_schedule->>'day_of_week'),
        'code', 'INVALID_TIME'
      );
    END IF;
    
    -- Insert schedule with effective dates
    INSERT INTO public.stylist_schedules (
      stylist_user_id,
      day_of_week,
      start_time_local,
      end_time_local,
      start_time_utc,
      end_time_utc,
      effective_from,
      effective_until,
      is_active
    ) VALUES (
      p_stylist_id,
      (v_day_schedule->>'day_of_week')::INTEGER,
      (v_day_schedule->>'start_time')::TIME,
      (v_day_schedule->>'end_time')::TIME,
      (v_day_schedule->>'start_time')::TIME,
      (v_day_schedule->>'end_time')::TIME,
      v_effective_from_date,
      p_effective_until,
      true
    )
    RETURNING id INTO v_schedule_id;
    
    v_created_count := v_created_count + 1;
  END LOOP;
  
  -- Audit log
  INSERT INTO public.schedule_change_log (
    stylist_user_id,
    changed_by,
    change_type,
    new_value
  ) VALUES (
    p_stylist_id,
    auth.uid(),
    'create',
    jsonb_build_object(
      'schedules', p_schedules,
      'effective_from', v_effective_from_date,
      'effective_until', p_effective_until
    )
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'created_count', v_created_count,
    'message', 'Schedule created successfully',
    'effective_from', v_effective_from_date,
    'effective_until', p_effective_until
  );
  
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM,
    'code', 'INTERNAL_ERROR'
  );
END;
$$;


ALTER FUNCTION "public"."admin_create_stylist_schedule"("p_stylist_id" "uuid", "p_schedules" "jsonb", "p_effective_from" "date", "p_effective_until" "date") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."admin_create_stylist_schedule"("p_stylist_id" "uuid", "p_schedules" "jsonb", "p_effective_from" "date", "p_effective_until" "date") IS 'Admin-only function to create stylist schedules';



CREATE OR REPLACE FUNCTION "public"."admin_delete_category"("p_category_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'private', 'pg_temp'
    SET "statement_timeout" TO '5s'
    AS $$
DECLARE
  v_admin_id uuid;
  v_product_count integer;
BEGIN
  v_admin_id := auth.uid();
  PERFORM private.assert_admin();
  
  IF NOT EXISTS(SELECT 1 FROM categories WHERE id = p_category_id) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Category not found');
  END IF;
  
  SELECT COUNT(*)::int INTO v_product_count FROM products WHERE category_id = p_category_id AND is_active = true;
  
  IF v_product_count > 0 THEN
    RETURN jsonb_build_object('success', false, 'message', format('Cannot delete category with %s active product(s).', v_product_count));
  END IF;
  
  UPDATE categories SET is_active = false, updated_at = now() WHERE id = p_category_id;
  
  INSERT INTO user_audit_log (user_id, action, resource_type, resource_id)
  VALUES (v_admin_id, 'category_deleted', 'category', p_category_id);
  
  RETURN jsonb_build_object('success', true, 'message', 'Category deactivated successfully');
END;
$$;


ALTER FUNCTION "public"."admin_delete_category"("p_category_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_get_all_schedules"() RETURNS TABLE("stylist_user_id" "uuid", "display_name" "text", "has_schedule" boolean, "schedules" "jsonb")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'private', 'pg_temp'
    AS $$
BEGIN
  -- Auth check
  IF NOT public.user_has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Unauthorized: Admin role required' USING ERRCODE = '42501';
  END IF;
  
  RETURN QUERY
  SELECT 
    sp.user_id AS stylist_user_id,
    sp.display_name,
    COUNT(ss.id) > 0 AS has_schedule,
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', ss.id,
          'day_of_week', ss.day_of_week,
          'start_time_local', ss.start_time_local,
          'end_time_local', ss.end_time_local,
          'is_active', ss.is_active
        ) ORDER BY ss.day_of_week
      ) FILTER (WHERE ss.id IS NOT NULL),
      '[]'::jsonb
    ) AS schedules
  FROM stylist_profiles sp
  LEFT JOIN stylist_schedules ss ON ss.stylist_user_id = sp.user_id AND ss.is_active = true
  WHERE sp.is_active = true
  GROUP BY sp.user_id, sp.display_name
  ORDER BY has_schedule, sp.display_name;
END;
$$;


ALTER FUNCTION "public"."admin_get_all_schedules"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."admin_get_all_schedules"() IS 'Admin-only function to list all stylist schedules';



CREATE OR REPLACE FUNCTION "public"."admin_list_categories"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'private', 'pg_temp'
    SET "statement_timeout" TO '5s'
    AS $$
DECLARE
  v_categories jsonb;
BEGIN
  -- Security: Verify admin access
  PERFORM private.assert_admin();
  
  -- Fetch all categories with parent relationship
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', c.id,
        'name', c.name,
        'slug', c.slug,
        'parent_id', c.parent_id,
        'description', c.description,
        'image_url', c.image_url,
        'sort_order', c.sort_order,
        'is_active', c.is_active,
        'created_at', c.created_at,
        'updated_at', c.updated_at,
        'product_count', COALESCE(pc.product_count, 0)
      ) ORDER BY c.sort_order, c.name
    ),
    '[]'::jsonb
  ) INTO v_categories
  FROM categories c
  LEFT JOIN (
    SELECT category_id, COUNT(*)::int as product_count
    FROM products
    WHERE is_active = true
    GROUP BY category_id
  ) pc ON pc.category_id = c.id;
  
  RETURN jsonb_build_object(
    'success', true,
    'categories', v_categories
  );
END;
$$;


ALTER FUNCTION "public"."admin_list_categories"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."admin_list_categories"() IS 'List all categories with product counts. Admin-only access.';



CREATE OR REPLACE FUNCTION "public"."admin_update_category"("p_category_id" "uuid", "p_name" "text" DEFAULT NULL::"text", "p_slug" "text" DEFAULT NULL::"text", "p_parent_id" "uuid" DEFAULT NULL::"uuid", "p_description" "text" DEFAULT NULL::"text", "p_image_url" "text" DEFAULT NULL::"text", "p_sort_order" integer DEFAULT NULL::integer, "p_is_active" boolean DEFAULT NULL::boolean) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'private', 'pg_temp'
    SET "statement_timeout" TO '5s'
    AS $$
DECLARE
  v_admin_id uuid;
  v_old_values jsonb;
  v_slug_exists boolean;
BEGIN
  v_admin_id := auth.uid();
  PERFORM private.assert_admin();
  
  IF NOT EXISTS(SELECT 1 FROM categories WHERE id = p_category_id) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Category not found');
  END IF;
  
  IF p_slug IS NOT NULL AND trim(p_slug) != '' THEN
    SELECT EXISTS(SELECT 1 FROM categories WHERE slug = p_slug AND id != p_category_id) INTO v_slug_exists;
    IF v_slug_exists THEN
      RETURN jsonb_build_object('success', false, 'message', 'Category slug already exists');
    END IF;
  END IF;
  
  IF p_parent_id IS NOT NULL AND p_parent_id = p_category_id THEN
    RETURN jsonb_build_object('success', false, 'message', 'Category cannot be its own parent');
  END IF;
  
  SELECT to_jsonb(categories.*) INTO v_old_values FROM categories WHERE id = p_category_id;
  
  UPDATE categories
  SET
    name = COALESCE(trim(p_name), name),
    slug = COALESCE(trim(p_slug), slug),
    parent_id = CASE WHEN p_parent_id = '00000000-0000-0000-0000-000000000000'::uuid THEN NULL ELSE COALESCE(p_parent_id, parent_id) END,
    description = CASE WHEN p_description = '' THEN NULL ELSE COALESCE(trim(p_description), description) END,
    image_url = CASE WHEN p_image_url = '' THEN NULL ELSE COALESCE(trim(p_image_url), image_url) END,
    sort_order = COALESCE(p_sort_order, sort_order),
    is_active = COALESCE(p_is_active, is_active),
    updated_at = now()
  WHERE id = p_category_id;
  
  INSERT INTO user_audit_log (user_id, action, resource_type, resource_id, old_values, new_values)
  VALUES (v_admin_id, 'category_updated', 'category', p_category_id, v_old_values, 
          jsonb_build_object('name', p_name, 'slug', p_slug, 'parent_id', p_parent_id, 'is_active', p_is_active));
  
  RETURN jsonb_build_object('success', true, 'message', 'Category updated successfully');
END;
$$;


ALTER FUNCTION "public"."admin_update_category"("p_category_id" "uuid", "p_name" "text", "p_slug" "text", "p_parent_id" "uuid", "p_description" "text", "p_image_url" "text", "p_sort_order" integer, "p_is_active" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_update_stylist_schedule"("p_schedule_id" "uuid", "p_start_time" time without time zone, "p_end_time" time without time zone) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'private', 'pg_temp'
    AS $$
DECLARE
  v_old_record stylist_schedules%ROWTYPE;
BEGIN
  -- ✅ FIX: Use assert_admin() for consistent error handling
  PERFORM private.assert_admin();
  
  -- Validate time range
  IF p_end_time <= p_start_time THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'End time must be after start time',
      'code', 'INVALID_TIME'
    );
  END IF;
  
  -- Get old record for audit
  SELECT * INTO v_old_record FROM public.stylist_schedules WHERE id = p_schedule_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Schedule not found',
      'code', 'NOT_FOUND'
    );
  END IF;
  
  -- Update
  UPDATE public.stylist_schedules
  SET 
    start_time_local = p_start_time,
    end_time_local = p_end_time,
    start_time_utc = p_start_time,
    end_time_utc = p_end_time,
    updated_at = NOW()
  WHERE id = p_schedule_id;
  
  -- Audit log
  INSERT INTO public.schedule_change_log (
    schedule_id,
    stylist_user_id,
    changed_by,
    change_type,
    old_value,
    new_value
  ) VALUES (
    p_schedule_id,
    v_old_record.stylist_user_id,
    auth.uid(),
    'update',
    jsonb_build_object('start_time', v_old_record.start_time_local, 'end_time', v_old_record.end_time_local),
    jsonb_build_object('start_time', p_start_time, 'end_time', p_end_time)
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'message', 'Schedule updated successfully'
  );
  
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM,
    'code', 'INTERNAL_ERROR'
  );
END;
$$;


ALTER FUNCTION "public"."admin_update_stylist_schedule"("p_schedule_id" "uuid", "p_start_time" time without time zone, "p_end_time" time without time zone) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."admin_update_stylist_schedule"("p_schedule_id" "uuid", "p_start_time" time without time zone, "p_end_time" time without time zone) IS 'Admin-only function to update stylist schedule times';



CREATE OR REPLACE FUNCTION "public"."approve_payout_request"("p_request_id" "uuid", "p_payment_reference" "text" DEFAULT NULL::"text", "p_payment_proof_url" "text" DEFAULT NULL::"text", "p_admin_notes" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'private', 'pg_temp'
    AS $$
DECLARE
  v_admin_id uuid;
  -- REMOVED: v_is_admin boolean;
  v_request payout_requests%ROWTYPE;
  v_payout_id uuid;
  v_available_balance bigint;
  v_platform_fee_cents bigint;
  v_net_amount_cents bigint;
  v_lock_acquired boolean;
BEGIN
  v_admin_id := auth.uid();

  -- ✅ FIX 1: Standardized admin check (replaces manual check)
  PERFORM private.assert_admin();

  -- ✅ FIX 2: Fetch request first (need vendor_id for lock)
  SELECT * INTO v_request
  FROM payout_requests
  WHERE id = p_request_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Payout request not found'
    );
  END IF;

  -- ✅ FIX 3: Advisory lock on VENDOR_ID (not request_id)
  -- This prevents concurrent approvals for same vendor
  SELECT pg_try_advisory_xact_lock(hashtext(v_request.vendor_id::text)) 
  INTO v_lock_acquired;
  
  IF NOT v_lock_acquired THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Another payout for this vendor is being processed. Please wait and try again.'
    );
  END IF;

  -- ✅ Re-query with FOR UPDATE after lock acquired
  SELECT * INTO v_request
  FROM payout_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Payout request not found'
    );
  END IF;

  -- Verify status is pending
  IF v_request.status != 'pending' THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Only pending requests can be approved',
      'current_status', v_request.status
    );
  END IF;

  -- Verify vendor still has enough balance
  SELECT (calculate_vendor_pending_payout(v_request.vendor_id)->>'pending_payout_cents')::bigint 
  INTO v_available_balance;

  IF v_available_balance < v_request.requested_amount_cents THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Insufficient available balance',
      'available', v_available_balance,
      'requested', v_request.requested_amount_cents
    );
  END IF;

  -- Calculate platform fees and net amount
  v_net_amount_cents := v_request.requested_amount_cents;
  v_platform_fee_cents := 0;

  -- Create payout record
  INSERT INTO payouts (
    vendor_id,
    amount_cents,
    platform_fees_cents,
    net_amount_cents,
    payment_method,
    payment_reference,
    payment_proof_url,
    status,
    processed_by,
    processed_at,
    admin_notes
  ) VALUES (
    v_request.vendor_id,
    v_request.requested_amount_cents,
    v_platform_fee_cents,
    v_net_amount_cents,
    v_request.payment_method,
    p_payment_reference,
    p_payment_proof_url,
    'completed',
    v_admin_id,
    NOW(),
    p_admin_notes
  ) RETURNING id INTO v_payout_id;

  -- Update request status
  UPDATE payout_requests
  SET 
    status = 'approved',
    reviewed_by = v_admin_id,
    reviewed_at = NOW(),
    admin_notes = p_admin_notes,
    payout_id = v_payout_id,
    updated_at = NOW()
  WHERE id = p_request_id;

  -- Audit log
  INSERT INTO private.audit_log (
    table_name, record_id, action, old_values, new_values, user_id
  ) VALUES (
    'payout_requests', p_request_id, 'UPDATE',
    jsonb_build_object(
      'status', 'pending',
      'action_type', 'payout_approval',
      'available_balance_before', v_available_balance
    ),
    jsonb_build_object(
      'status', 'approved',
      'payout_id', v_payout_id,
      'approved_by', v_admin_id,
      'amount_cents', v_request.requested_amount_cents,
      'action_type', 'payout_approval',
      'available_balance_after', v_available_balance - v_request.requested_amount_cents
    ),
    v_admin_id
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'message', 'Payout request approved successfully',
    'payout_id', v_payout_id,
    'request_id', p_request_id
  );
END;
$$;


ALTER FUNCTION "public"."approve_payout_request"("p_request_id" "uuid", "p_payment_reference" "text", "p_payment_proof_url" "text", "p_admin_notes" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."approve_payout_request"("p_request_id" "uuid", "p_payment_reference" "text", "p_payment_proof_url" "text", "p_admin_notes" "text") IS 'Admin-only function to approve payout requests with vendor-level locking';



CREATE OR REPLACE FUNCTION "public"."approve_vendor"("p_vendor_id" "uuid", "p_notes" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'private', 'pg_temp'
    SET "statement_timeout" TO '5s'
    AS $$
DECLARE
  v_admin_id uuid;
BEGIN
  v_admin_id := auth.uid();
  
  -- FIXED: Removed IF NOT, use PERFORM
  PERFORM private.assert_admin();
  
  IF NOT EXISTS (
    SELECT 1 FROM vendor_profiles 
    WHERE user_id = p_vendor_id 
    AND verification_status = 'pending'
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Vendor not found or already processed'
    );
  END IF;
  
  UPDATE vendor_profiles
  SET 
    verification_status = 'verified',
    updated_at = now()
  WHERE user_id = p_vendor_id;
  
  INSERT INTO user_roles (user_id, role_id, assigned_by)
  SELECT 
    p_vendor_id,
    r.id,
    v_admin_id
  FROM roles r
  WHERE r.name = 'vendor'
  ON CONFLICT (user_id, role_id) DO UPDATE
  SET is_active = true, assigned_by = v_admin_id, assigned_at = now();
  
  UPDATE user_profiles 
  SET role_version = role_version + 1 
  WHERE id = p_vendor_id;
  
  INSERT INTO user_audit_log (user_id, action, resource_type, resource_id, new_values)
  VALUES (
    v_admin_id,
    'vendor_approved',
    'vendor_profile',
    p_vendor_id,
    jsonb_build_object(
      'vendor_id', p_vendor_id,
      'notes', p_notes
    )
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'message', 'Vendor approved successfully'
  );
END;
$$;


ALTER FUNCTION "public"."approve_vendor"("p_vendor_id" "uuid", "p_notes" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."approve_vendor"("p_vendor_id" "uuid", "p_notes" "text") IS 'Fixed: IF NOT assert_admin() → PERFORM assert_admin()';



CREATE OR REPLACE FUNCTION "public"."approve_vendor_enhanced"("p_vendor_id" "uuid", "p_notes" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth', 'private', 'pg_temp'
    SET "statement_timeout" TO '10s'
    AS $$
DECLARE v_admin_id UUID; v_current_state TEXT; v_business_name TEXT;
BEGIN
    v_admin_id := auth.uid();
    IF NOT private.assert_admin() THEN RAISE EXCEPTION 'Unauthorized'; END IF;
    SELECT application_state, business_name INTO v_current_state, v_business_name
    FROM vendor_profiles WHERE user_id = p_vendor_id FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Vendor not found'); END IF;
    IF v_current_state NOT IN ('submitted', 'under_review', 'info_requested') THEN
        RETURN jsonb_build_object('success', false, 'error', format('Cannot approve in state: %s', v_current_state));
    END IF;
    UPDATE vendor_profiles SET application_state = 'approved', verification_status = 'verified',
        application_reviewed_at = NOW(), application_reviewed_by = v_admin_id,
        application_notes = p_notes, updated_at = NOW() WHERE user_id = p_vendor_id;
    INSERT INTO user_roles (user_id, role_id, assigned_by)
    SELECT p_vendor_id, r.id, v_admin_id FROM roles r WHERE r.name = 'vendor'
    ON CONFLICT (user_id, role_id) DO UPDATE SET is_active = true, assigned_by = v_admin_id, assigned_at = NOW();
    UPDATE user_profiles SET role_version = role_version + 1 WHERE id = p_vendor_id;
    INSERT INTO user_audit_log (user_id, action, resource_type, resource_id, new_values)
    VALUES (v_admin_id, 'vendor_approved', 'vendor_profile', p_vendor_id,
        jsonb_build_object('vendor_id', p_vendor_id, 'business_name', v_business_name, 'notes', p_notes));
    INSERT INTO job_queue (job_type, priority, payload, idempotency_key) VALUES
    ('send_vendor_welcome_email', 5, jsonb_build_object('vendor_id', p_vendor_id, 'business_name', v_business_name),
        'vendor_welcome_' || p_vendor_id::text) ON CONFLICT (idempotency_key) DO NOTHING;
    RETURN jsonb_build_object('success', true, 'message', 'Vendor approved successfully');
END;
$$;


ALTER FUNCTION "public"."approve_vendor_enhanced"("p_vendor_id" "uuid", "p_notes" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."assert_admin_or_support"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
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


ALTER FUNCTION "public"."assert_admin_or_support"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."assign_user_role"("p_user_id" "uuid", "p_role_name" "text", "p_expires_at" timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth', 'private', 'pg_temp'
    SET "statement_timeout" TO '5s'
    AS $$
DECLARE
  v_role_id uuid;
  v_admin_id uuid;
BEGIN
  -- Verify admin (protected by assert_admin first)
  v_admin_id := auth.uid();
  PERFORM private.assert_admin();
  
  -- Validate user exists (NOW CAN ACCESS auth.users with SECURITY DEFINER)
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
  INSERT INTO public.user_audit_log (user_id, action, resource_type, resource_id, new_values)
  VALUES (
    v_admin_id,
    'role_assigned',
    'user_role',
    p_user_id,
    jsonb_build_object(
      'role', p_role_name,
      'expires_at', p_expires_at,
      'target_user_id', p_user_id
    )
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'message', 'Role assigned successfully'
  );
END;
$$;


ALTER FUNCTION "public"."assign_user_role"("p_user_id" "uuid", "p_role_name" "text", "p_expires_at" timestamp with time zone) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."assign_user_role"("p_user_id" "uuid", "p_role_name" "text", "p_expires_at" timestamp with time zone) IS 'Fixed: Added SECURITY DEFINER to access auth.users. Protected by assert_admin().';



CREATE OR REPLACE FUNCTION "public"."auto_complete_past_bookings"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE bookings
  SET 
    status = 'completed',
    updated_at = NOW()
  WHERE status = 'confirmed'
    AND end_time < NOW() - INTERVAL '1 hour';
  
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;


ALTER FUNCTION "public"."auto_complete_past_bookings"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."calculate_vendor_pending_payout"("p_vendor_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth', 'pg_temp'
    AS $$
DECLARE
  v_delivered_gmv_cents bigint := 0;
  v_cancelled_gmv_cents bigint := 0;
  v_platform_fee_rate numeric := 0.15;
  v_platform_fees_cents bigint := 0;
  v_net_earnings_cents bigint := 0;
  v_already_paid_cents bigint := 0;
  v_pending_payout_cents bigint := 0;
  v_pending_requests_cents bigint := 0;
  v_can_request_payout boolean := false;
BEGIN
  -- Calculate delivered GMV
  SELECT COALESCE(SUM(total_price_cents), 0)
  INTO v_delivered_gmv_cents
  FROM order_items
  WHERE vendor_id = p_vendor_id
    AND fulfillment_status = 'delivered';

  -- Calculate cancelled GMV (for reference)
  SELECT COALESCE(SUM(total_price_cents), 0)
  INTO v_cancelled_gmv_cents
  FROM order_items
  WHERE vendor_id = p_vendor_id
    AND fulfillment_status = 'cancelled';

  -- Calculate platform fees (15% of delivered GMV)
  v_platform_fees_cents := ROUND(v_delivered_gmv_cents * v_platform_fee_rate);

  -- Calculate net earnings (85% of delivered GMV)
  v_net_earnings_cents := v_delivered_gmv_cents - v_platform_fees_cents;

  -- Calculate already paid amount
  SELECT COALESCE(SUM(net_amount_cents), 0)
  INTO v_already_paid_cents
  FROM payouts
  WHERE vendor_id = p_vendor_id
    AND status IN ('completed', 'processing');

  -- ✅ FIX MEDIUM-2: Calculate pending request amounts
  SELECT COALESCE(SUM(requested_amount_cents), 0)
  INTO v_pending_requests_cents
  FROM payout_requests
  WHERE vendor_id = p_vendor_id
    AND status = 'pending';

  -- Calculate pending payout (available to withdraw)
  -- Subtract both paid amounts AND pending requests
  v_pending_payout_cents := v_net_earnings_cents - v_already_paid_cents - v_pending_requests_cents;

  -- Ensure non-negative
  IF v_pending_payout_cents < 0 THEN
    v_pending_payout_cents := 0;
  END IF;

  -- Check if vendor can request payout (min NPR 1,000 and no pending requests)
  v_can_request_payout := (
    v_pending_payout_cents >= 100000
    AND NOT EXISTS (
      SELECT 1 FROM payout_requests
      WHERE vendor_id = p_vendor_id
        AND status = 'pending'
    )
  );

  RETURN jsonb_build_object(
    'vendor_id', p_vendor_id,
    'delivered_gmv_cents', v_delivered_gmv_cents,
    'cancelled_gmv_cents', v_cancelled_gmv_cents,
    'platform_fees_cents', v_platform_fees_cents,
    'net_earnings_cents', v_net_earnings_cents,
    'already_paid_cents', v_already_paid_cents,
    'pending_requests_cents', v_pending_requests_cents,
    'pending_payout_cents', v_pending_payout_cents,
    'can_request_payout', v_can_request_payout
  );
END;
$$;


ALTER FUNCTION "public"."calculate_vendor_pending_payout"("p_vendor_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."calculate_vendor_pending_payout"("p_vendor_id" "uuid") IS 'Calculate available balance excluding pending requests';



CREATE OR REPLACE FUNCTION "public"."can_rate_booking"("p_booking_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM bookings
    WHERE id = p_booking_id
      AND customer_user_id = auth.uid()
      AND status = 'completed'
      AND id NOT IN (
        SELECT booking_id 
        FROM stylist_ratings 
        WHERE booking_id IS NOT NULL
      )
  );
$$;


ALTER FUNCTION "public"."can_rate_booking"("p_booking_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."can_rate_booking"("p_booking_id" "uuid") IS 'Validates if authenticated user can rate a booking.';



CREATE OR REPLACE FUNCTION "public"."can_send_optional_email"("p_user_id" "uuid", "p_email_type" "text") RETURNS boolean
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_can_send BOOLEAN := true;
BEGIN
  -- Transactional emails always sent (cannot opt-out)
  IF p_email_type IN (
    'order_confirmation',
    'order_shipped',
    'order_delivered',
    'booking_confirmation',
    'vendor_approved',
    'vendor_rejected'
  ) THEN
    RETURN true;
  END IF;
  
  -- Check preferences for optional emails
  SELECT 
    CASE p_email_type
      WHEN 'booking_reminder' THEN receive_booking_reminders
      WHEN 'review_request' THEN receive_review_requests
      WHEN 'promotional' THEN receive_promotional_emails
      WHEN 'product_recommendation' THEN receive_product_recommendations
      WHEN 'low_stock_alert' THEN receive_low_stock_alerts
      WHEN 'payout_notification' THEN receive_payout_notifications
      WHEN 'new_order_alert' THEN receive_new_order_alerts
      ELSE true
    END INTO v_can_send
  FROM public.email_preferences
  WHERE user_id = p_user_id;
  
  RETURN COALESCE(v_can_send, true);
END;
$$;


ALTER FUNCTION "public"."can_send_optional_email"("p_user_id" "uuid", "p_email_type" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."can_send_optional_email"("p_user_id" "uuid", "p_email_type" "text") IS 'Check if user wants to receive optional email. Transactional emails always return true.';



CREATE OR REPLACE FUNCTION "public"."cancel_booking"("p_booking_id" "uuid", "p_cancelled_by" "uuid", "p_reason" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
    v_booking RECORD;
    v_refund_amount INTEGER;
BEGIN
    -- CRITICAL FIX: Acquire advisory lock FIRST to prevent race conditions
    PERFORM pg_advisory_xact_lock(hashtext('cancel_booking_' || p_booking_id::TEXT));
    
    -- Get booking details
    SELECT * INTO v_booking
    FROM bookings
    WHERE id = p_booking_id
    FOR UPDATE;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'Booking not found',
            'code', 'BOOKING_NOT_FOUND'
        );
    END IF;
    
    IF v_booking.status IN ('cancelled', 'completed') THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'Booking cannot be cancelled',
            'code', 'INVALID_STATUS',
            'current_status', v_booking.status
        );
    END IF;
    
    -- Calculate refund based on cancellation policy
    v_refund_amount := CASE 
        WHEN v_booking.start_time - NOW() > INTERVAL '24 hours' THEN v_booking.price_cents
        WHEN v_booking.start_time - NOW() > INTERVAL '12 hours' THEN v_booking.price_cents / 2
        ELSE 0
    END;
    
    -- Update booking status
    UPDATE bookings
    SET status = 'cancelled',
        cancelled_at = NOW(),
        cancelled_by = p_cancelled_by,
        cancellation_reason = p_reason,
        updated_at = NOW()
    WHERE id = p_booking_id;
    
    -- Decrement stylist's booking count
    UPDATE stylist_profiles
    SET total_bookings = GREATEST(0, total_bookings - 1),
        updated_at = NOW()
    WHERE user_id = v_booking.stylist_user_id;
    
    RETURN jsonb_build_object(
        'success', TRUE,
        'booking_id', p_booking_id,
        'refund_amount', v_refund_amount,
        'cancelled_at', NOW()
    );
END;
$$;


ALTER FUNCTION "public"."cancel_booking"("p_booking_id" "uuid", "p_cancelled_by" "uuid", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cast_review_vote"("p_review_id" "uuid", "p_vote_type" "text", "p_ip_address" "inet" DEFAULT NULL::"inet", "p_user_agent_hash" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_user_id UUID;
    v_review RECORD;
    v_existing_vote TEXT;
    v_shard SMALLINT;
    v_helpful_delta INTEGER := 0;
    v_unhelpful_delta INTEGER := 0;
    v_vote_velocity INTEGER;
BEGIN
    -- DEFENSIVE LAYER 1: Authentication
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Authentication required',
            'error_code', 'AUTH_REQUIRED'
        );
    END IF;

    -- DEFENSIVE LAYER 2: Input Validation
    IF p_vote_type NOT IN ('helpful', 'unhelpful') THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Invalid vote type',
            'error_code', 'INVALID_VOTE_TYPE'
        );
    END IF;

    -- DEFENSIVE LAYER 3: Review Validation (single atomic query)
    SELECT 
        r.user_id,
        r.is_approved,
        r.deleted_at,
        p.is_active AS product_active
    INTO v_review
    FROM reviews r
    INNER JOIN products p ON p.id = r.product_id
    WHERE r.id = p_review_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Review not found',
            'error_code', 'REVIEW_NOT_FOUND'
        );
    END IF;

    -- Check review is voteable
    IF v_review.deleted_at IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Review no longer available',
            'error_code', 'REVIEW_DELETED'
        );
    END IF;

    IF NOT v_review.is_approved THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Cannot vote on pending reviews',
            'error_code', 'REVIEW_NOT_APPROVED'
        );
    END IF;

    IF NOT v_review.product_active THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Product no longer available',
            'error_code', 'PRODUCT_INACTIVE'
        );
    END IF;

    -- Prevent self-voting
    IF v_review.user_id = v_user_id THEN
        -- Log potential abuse attempt
        RAISE LOG 'Self-vote attempt by user % on review %', v_user_id, p_review_id;
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Cannot vote on your own review',
            'error_code', 'SELF_VOTE_PROHIBITED'
        );
    END IF;

    -- DEFENSIVE LAYER 4: Rate Limiting Check
    SELECT COUNT(*) INTO v_vote_velocity
    FROM review_votes
    WHERE user_id = v_user_id
        AND created_at > NOW() - INTERVAL '1 minute';

    IF v_vote_velocity > 10 THEN
        -- Potential bot/abuse behavior
        RAISE LOG 'Vote velocity limit exceeded for user %: % votes/minute', 
            v_user_id, v_vote_velocity;
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Please slow down your voting',
            'error_code', 'RATE_LIMIT_EXCEEDED'
        );
    END IF;

    -- DEFENSIVE LAYER 5: Check Existing Vote
    SELECT vote_type INTO v_existing_vote
    FROM review_votes
    WHERE review_id = p_review_id 
        AND user_id = v_user_id;

    -- If vote unchanged, return success without processing
    IF v_existing_vote = p_vote_type THEN
        RETURN jsonb_build_object(
            'success', true,
            'vote_type', p_vote_type,
            'changed', false,
            'message', 'Vote already recorded'
        );
    END IF;

    -- DEFENSIVE LAYER 6: Calculate Shard and Deltas
    v_shard := public.get_vote_shard(v_user_id);

    -- Calculate vote deltas for atomic update
    IF v_existing_vote IS NULL THEN
        -- New vote
        IF p_vote_type = 'helpful' THEN
            v_helpful_delta := 1;
        ELSE
            v_unhelpful_delta := 1;
        END IF;
    ELSE
        -- Changing vote
        IF v_existing_vote = 'helpful' THEN
            v_helpful_delta := -1;
            v_unhelpful_delta := 1;
        ELSE
            v_helpful_delta := 1;
            v_unhelpful_delta := -1;
        END IF;
    END IF;

    -- DEFENSIVE LAYER 7: Atomic Vote Recording
    INSERT INTO review_votes (
        review_id,
        user_id,
        vote_type,
        ip_address,
        user_agent_hash
    ) VALUES (
        p_review_id,
        v_user_id,
        p_vote_type,
        p_ip_address,
        LEFT(p_user_agent_hash, 64)  -- Enforce length limit
    )
    ON CONFLICT (review_id, user_id)
    DO UPDATE SET
        vote_type = EXCLUDED.vote_type,
        ip_address = EXCLUDED.ip_address,
        user_agent_hash = EXCLUDED.user_agent_hash,
        updated_at = NOW();

    -- DEFENSIVE LAYER 8: Atomic Shard Update (prevents lost updates)
    INSERT INTO review_vote_shards (
        review_id,
        shard,
        helpful_count,
        unhelpful_count
    ) VALUES (
        p_review_id,
        v_shard,
        GREATEST(0, v_helpful_delta),
        GREATEST(0, v_unhelpful_delta)
    )
    ON CONFLICT (review_id, shard)
    DO UPDATE SET
        helpful_count = GREATEST(0, review_vote_shards.helpful_count + v_helpful_delta),
        unhelpful_count = GREATEST(0, review_vote_shards.unhelpful_count + v_unhelpful_delta),
        updated_at = NOW();

    -- DEFENSIVE LAYER 9: Update Denormalized Counts (best effort)
    UPDATE reviews
    SET 
        helpful_votes = GREATEST(0, helpful_votes + v_helpful_delta),
        unhelpful_votes = GREATEST(0, unhelpful_votes + v_unhelpful_delta),
        updated_at = NOW()
    WHERE id = p_review_id;

    -- Queue reputation update for review author (deduplicated)
    INSERT INTO job_queue (
        job_type,
        priority,
        payload,
        idempotency_key,
        max_attempts
    ) VALUES (
        'update_user_reputation',
        9,  -- Low priority background job
        jsonb_build_object(
            'user_id', v_review.user_id,
            'trigger', 'vote_received',
            'helpful_delta', v_helpful_delta,
            'unhelpful_delta', v_unhelpful_delta
        ),
        'reputation_' || v_review.user_id::text || '_' || date_trunc('hour', NOW())::text,
        3
    ) ON CONFLICT (idempotency_key) DO NOTHING;

    RETURN jsonb_build_object(
        'success', true,
        'vote_type', p_vote_type,
        'changed', true,
        'previous_vote', v_existing_vote,
        'message', CASE
            WHEN v_existing_vote IS NULL THEN 'Vote recorded'
            ELSE 'Vote updated'
        END
    );

EXCEPTION
    WHEN OTHERS THEN
        RAISE LOG 'Vote casting error for user % review %: % %', 
            v_user_id, p_review_id, SQLERRM, SQLSTATE;
        
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Unable to process vote at this time',
            'error_code', 'INTERNAL_ERROR'
        );
END;
$$;


ALTER FUNCTION "public"."cast_review_vote"("p_review_id" "uuid", "p_vote_type" "text", "p_ip_address" "inet", "p_user_agent_hash" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."cast_review_vote"("p_review_id" "uuid", "p_vote_type" "text", "p_ip_address" "inet", "p_user_agent_hash" "text") IS 'Records helpful/unhelpful votes with enterprise-grade features:
- Sharded counting prevents hotspots under viral load
- Rate limiting blocks vote manipulation (10/minute)
- Self-voting prevention with security logging
- Vote changes handled gracefully with delta tracking
- Atomic operations prevent lost updates
Returns structured JSON with vote status and change tracking.';



CREATE OR REPLACE FUNCTION "public"."check_slot_availability"("p_stylist_id" "uuid", "p_start_time" timestamp with time zone, "p_end_time" timestamp with time zone) RETURNS boolean
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
    v_is_available BOOLEAN;
    v_buffer_minutes INTEGER;
BEGIN
    -- Get buffer time
    SELECT booking_buffer_minutes INTO v_buffer_minutes
    FROM stylist_profiles
    WHERE user_id = p_stylist_id;
    
    -- Check for conflicts
    SELECT NOT EXISTS (
        SELECT 1 
        FROM bookings b
        WHERE b.stylist_user_id = p_stylist_id
            AND b.status NOT IN ('cancelled', 'no_show')
            AND tstzrange(
                b.start_time - (COALESCE(v_buffer_minutes, 0) || ' minutes')::INTERVAL,
                b.end_time + (COALESCE(v_buffer_minutes, 0) || ' minutes')::INTERVAL
            ) && tstzrange(p_start_time, p_end_time)
    ) INTO v_is_available;
    
    RETURN v_is_available;
END;
$$;


ALTER FUNCTION "public"."check_slot_availability"("p_stylist_id" "uuid", "p_start_time" timestamp with time zone, "p_end_time" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cleanup_expired_email_logs"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM public.email_logs 
  WHERE expires_at < NOW();
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  RAISE NOTICE 'Deleted % expired email logs', deleted_count;
  RETURN deleted_count;
END;
$$;


ALTER FUNCTION "public"."cleanup_expired_email_logs"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."cleanup_expired_email_logs"() IS 'Delete email logs older than 90 days for GDPR compliance. Run daily via cron.';



CREATE OR REPLACE FUNCTION "public"."cleanup_expired_reservations"() RETURNS integer
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
    v_cleaned_count INTEGER;
BEGIN
    -- Update expired reservations to 'expired' status
    UPDATE booking_reservations
    SET 
        status = 'expired',
        updated_at = NOW()
    WHERE 
        status = 'reserved'
        AND expires_at < NOW();
    
    GET DIAGNOSTICS v_cleaned_count = ROW_COUNT;
    
    -- Log the cleanup
    IF v_cleaned_count > 0 THEN
        RAISE NOTICE 'Cleaned up % expired reservations', v_cleaned_count;
    END IF;
    
    RETURN v_cleaned_count;
END;
$$;


ALTER FUNCTION "public"."cleanup_expired_reservations"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."cleanup_expired_reservations"() IS 'Automatically marks expired reservations as expired so slots become available again after TTL';



CREATE OR REPLACE FUNCTION "public"."cleanup_stale_locks"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
    v_count INTEGER;
BEGIN
    UPDATE job_queue
    SET 
        status = 'pending',
        locked_by = NULL,
        locked_until = NULL
    WHERE status = 'processing'
        AND locked_until < NOW();
    
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;


ALTER FUNCTION "public"."cleanup_stale_locks"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."clear_cart_secure"("p_user_id" "uuid" DEFAULT NULL::"uuid", "p_guest_token" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_cart_id UUID;
BEGIN
  v_cart_id := public.get_or_create_cart_secure(p_user_id, p_guest_token);
  DELETE FROM cart_items WHERE cart_id = v_cart_id;
  RETURN jsonb_build_object('success', true, 'message', 'Cart cleared');
END;
$$;


ALTER FUNCTION "public"."clear_cart_secure"("p_user_id" "uuid", "p_guest_token" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."complete_stylist_promotion"("p_promotion_id" "uuid", "p_admin_id" "uuid", "p_profile_data" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'private', 'pg_temp'
    AS $$
BEGIN
  RETURN private.complete_stylist_promotion(p_promotion_id, p_admin_id, p_profile_data);
END;
$$;


ALTER FUNCTION "public"."complete_stylist_promotion"("p_promotion_id" "uuid", "p_admin_id" "uuid", "p_profile_data" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."confirm_booking_reservation"("p_reservation_id" "uuid", "p_payment_intent_id" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'private', 'metrics', 'pg_temp'
    AS $$
DECLARE
  v_reservation RECORD;
  v_booking_id UUID;
BEGIN
  SELECT * INTO v_reservation
  FROM public.booking_reservations
  WHERE id = p_reservation_id
    AND status = 'reserved'
    AND expires_at > NOW()
  FOR UPDATE;
  
  IF v_reservation IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Reservation not found or expired',
      'code', 'RESERVATION_INVALID'
    );
  END IF;
  
  -- Insert booking with ALL fields including address
  INSERT INTO public.bookings (
    customer_user_id,
    stylist_user_id,
    service_id,
    start_time,
    end_time,
    price_cents,
    customer_name,
    customer_phone,
    customer_email,
    customer_address_line1,
    customer_city,
    customer_state,
    customer_postal_code,
    customer_country,
    customer_notes,
    payment_intent_id,
    status
  )
  VALUES (
    v_reservation.customer_user_id,
    v_reservation.stylist_user_id,
    v_reservation.service_id,
    v_reservation.start_time,
    v_reservation.end_time,
    v_reservation.price_cents,
    v_reservation.customer_name,
    v_reservation.customer_phone,
    v_reservation.customer_email,
    v_reservation.customer_address_line1,
    v_reservation.customer_city,
    v_reservation.customer_state,
    v_reservation.customer_postal_code,
    v_reservation.customer_country,
    v_reservation.customer_notes,
    p_payment_intent_id,
    'confirmed'
  )
  RETURNING id INTO v_booking_id;
  
  -- Mark reservation as confirmed
  UPDATE public.booking_reservations
  SET status = 'confirmed', updated_at = NOW()
  WHERE id = p_reservation_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'booking_id', v_booking_id,
    'reservation_id', p_reservation_id
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM,
      'code', 'DATABASE_ERROR'
    );
END;
$$;


ALTER FUNCTION "public"."confirm_booking_reservation"("p_reservation_id" "uuid", "p_payment_intent_id" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."confirm_booking_reservation"("p_reservation_id" "uuid", "p_payment_intent_id" "text") IS 'Converts reservation to confirmed booking, copying all customer data including address';



CREATE OR REPLACE FUNCTION "public"."convert_user_cart_to_guest"("p_user_id" "uuid", "p_new_guest_token" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_cart_id UUID;
  v_cart_count INT;
BEGIN
  -- Find the user's cart
  SELECT id INTO v_cart_id 
  FROM carts 
  WHERE user_id = p_user_id;
  
  IF v_cart_id IS NULL THEN
    -- No cart to convert
    RETURN jsonb_build_object('success', true, 'message', 'No cart to convert');
  END IF;
  
  -- Count items in cart
  SELECT COUNT(*) INTO v_cart_count
  FROM cart_items
  WHERE cart_id = v_cart_id;
  
  IF v_cart_count = 0 THEN
    -- Empty cart, just delete it
    DELETE FROM carts WHERE id = v_cart_id;
    RETURN jsonb_build_object('success', true, 'message', 'Empty cart removed');
  END IF;
  
  -- Convert to guest cart by updating the cart record
  UPDATE carts 
  SET 
    user_id = NULL,
    session_id = p_new_guest_token,
    updated_at = now()
  WHERE id = v_cart_id;
  
  RETURN jsonb_build_object(
    'success', true, 
    'message', 'Cart converted to guest',
    'cart_id', v_cart_id,
    'item_count', v_cart_count
  );
  
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Failed to convert cart: ' || SQLERRM
    );
END;
$$;


ALTER FUNCTION "public"."convert_user_cart_to_guest"("p_user_id" "uuid", "p_new_guest_token" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_booking"("p_customer_id" "uuid", "p_stylist_id" "uuid", "p_service_id" "uuid", "p_start_time" timestamp with time zone, "p_customer_name" "text", "p_customer_phone" "text" DEFAULT NULL::"text", "p_customer_email" "text" DEFAULT NULL::"text", "p_customer_notes" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
    v_booking_id UUID;
    v_end_time TIMESTAMPTZ;
    v_duration INTEGER;
    v_price INTEGER;
    v_conflicts INTEGER;
    v_buffer_minutes INTEGER;
BEGIN
    -- 🔒 SECURITY FIX: Prevent self-booking
    IF p_customer_id = p_stylist_id THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'You cannot book your own services. Please select a different stylist.',
            'code', 'SELF_BOOKING_NOT_ALLOWED'
        );
    END IF;

    v_duration := get_service_duration(p_stylist_id, p_service_id);
    v_price := get_service_price(p_stylist_id, p_service_id);
    v_end_time := p_start_time + (v_duration || ' minutes')::INTERVAL;
    
    SELECT booking_buffer_minutes INTO v_buffer_minutes
    FROM stylist_profiles
    WHERE user_id = p_stylist_id;
    
    PERFORM pg_advisory_xact_lock(hashtext('booking_' || p_stylist_id::TEXT));
    
    SELECT COUNT(*) INTO v_conflicts
    FROM bookings b
    WHERE b.stylist_user_id = p_stylist_id
        AND b.status NOT IN ('cancelled', 'no_show')
        AND tstzrange(
            b.start_time - (v_buffer_minutes || ' minutes')::INTERVAL,
            b.end_time + (v_buffer_minutes || ' minutes')::INTERVAL
        ) && tstzrange(
            p_start_time - (v_buffer_minutes || ' minutes')::INTERVAL,
            v_end_time + (v_buffer_minutes || ' minutes')::INTERVAL
        );
    
    IF v_conflicts > 0 THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'Time slot is no longer available',
            'code', 'SLOT_UNAVAILABLE'
        );
    END IF;
    
    INSERT INTO bookings (
        customer_user_id,
        stylist_user_id,
        service_id,
        start_time,
        end_time,
        price_cents,
        status,
        customer_name,
        customer_phone,
        customer_email,
        customer_notes,
        booking_source
    ) VALUES (
        p_customer_id,
        p_stylist_id,
        p_service_id,
        p_start_time,
        v_end_time,
        v_price,
        'pending',
        p_customer_name,
        p_customer_phone,
        p_customer_email,
        p_customer_notes,
        'web'
    ) RETURNING id INTO v_booking_id;
    
    UPDATE stylist_profiles
    SET total_bookings = total_bookings + 1,
        updated_at = NOW()
    WHERE user_id = p_stylist_id;
    
    RETURN jsonb_build_object(
        'success', TRUE,
        'booking_id', v_booking_id,
        'start_time', p_start_time,
        'end_time', v_end_time,
        'price_cents', v_price
    );
    
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', SQLERRM,
            'code', 'BOOKING_ERROR'
        );
END;
$$;


ALTER FUNCTION "public"."create_booking"("p_customer_id" "uuid", "p_stylist_id" "uuid", "p_service_id" "uuid", "p_start_time" timestamp with time zone, "p_customer_name" "text", "p_customer_phone" "text", "p_customer_email" "text", "p_customer_notes" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_booking_reservation"("p_customer_id" "uuid", "p_stylist_id" "uuid", "p_service_id" "uuid", "p_start_time" timestamp with time zone, "p_customer_name" "text", "p_customer_phone" "text" DEFAULT NULL::"text", "p_customer_email" "text" DEFAULT NULL::"text", "p_customer_address_line1" "text" DEFAULT NULL::"text", "p_customer_city" "text" DEFAULT NULL::"text", "p_customer_state" "text" DEFAULT 'Bagmati Province'::"text", "p_customer_postal_code" "text" DEFAULT NULL::"text", "p_customer_country" "text" DEFAULT 'Nepal'::"text", "p_customer_notes" "text" DEFAULT NULL::"text", "p_ttl_minutes" integer DEFAULT 15) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'private', 'pg_temp'
    AS $$
DECLARE
  v_reservation_id UUID;
  v_end_time TIMESTAMPTZ;
  v_price_cents INT;
  v_service_name TEXT;
  v_stylist_name TEXT;
  v_duration_minutes INT;
BEGIN
  -- Validation: Check if customer is trying to book themselves
  IF p_customer_id = p_stylist_id THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Stylists cannot book appointments with themselves',
      'code', 'SELF_BOOKING'
    );
  END IF;

  -- Get service details (FIX: use base_price_cents, not price_cents)
  SELECT 
    name, 
    duration_minutes,
    base_price_cents  -- ✅ FIXED: was price_cents
  INTO 
    v_service_name,
    v_duration_minutes,
    v_price_cents
  FROM services
  WHERE id = p_service_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Service not found',
      'code', 'SERVICE_NOT_FOUND'
    );
  END IF;

  -- Calculate end time
  v_end_time := p_start_time + (v_duration_minutes || ' minutes')::INTERVAL;

  -- Get stylist display name
  SELECT display_name INTO v_stylist_name
  FROM stylist_profiles
  WHERE user_id = p_stylist_id;

  -- Check if slot is available
  IF EXISTS (
    SELECT 1 FROM bookings
    WHERE stylist_user_id = p_stylist_id
      AND status IN ('confirmed', 'pending', 'in_progress')
      AND (start_time, end_time) OVERLAPS (p_start_time, v_end_time)
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'This time slot is no longer available',
      'code', 'SLOT_UNAVAILABLE'
    );
  END IF;

  -- Check for overlapping reservations
  IF EXISTS (
    SELECT 1 FROM booking_reservations
    WHERE stylist_user_id = p_stylist_id
      AND status = 'reserved'
      AND expires_at > NOW()
      AND (start_time, end_time) OVERLAPS (p_start_time, v_end_time)
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'This time slot is currently reserved',
      'code', 'SLOT_RESERVED'
    );
  END IF;

  -- Create reservation WITH address fields
  INSERT INTO public.booking_reservations (
    customer_user_id,
    stylist_user_id,
    service_id,
    start_time,
    end_time,
    price_cents,
    customer_name,
    customer_phone,
    customer_email,
    customer_address_line1,
    customer_city,
    customer_state,
    customer_postal_code,
    customer_country,
    customer_notes,
    status,
    expires_at
  )
  VALUES (
    p_customer_id,
    p_stylist_id,
    p_service_id,
    p_start_time,
    v_end_time,
    v_price_cents,
    p_customer_name,
    p_customer_phone,
    p_customer_email,
    p_customer_address_line1,
    p_customer_city,
    p_customer_state,
    p_customer_postal_code,
    p_customer_country,
    p_customer_notes,
    'reserved',
    NOW() + (p_ttl_minutes || ' minutes')::INTERVAL
  )
  RETURNING id INTO v_reservation_id;

  RETURN jsonb_build_object(
    'success', true,
    'reservation_id', v_reservation_id,
    'service_name', v_service_name,
    'stylist_name', v_stylist_name,
    'start_time', p_start_time,
    'end_time', v_end_time,
    'price_cents', v_price_cents,
    'expires_at', NOW() + (p_ttl_minutes || ' minutes')::INTERVAL
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM,
      'code', 'DATABASE_ERROR'
    );
END;
$$;


ALTER FUNCTION "public"."create_booking_reservation"("p_customer_id" "uuid", "p_stylist_id" "uuid", "p_service_id" "uuid", "p_start_time" timestamp with time zone, "p_customer_name" "text", "p_customer_phone" "text", "p_customer_email" "text", "p_customer_address_line1" "text", "p_customer_city" "text", "p_customer_state" "text", "p_customer_postal_code" "text", "p_customer_country" "text", "p_customer_notes" "text", "p_ttl_minutes" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."create_booking_reservation"("p_customer_id" "uuid", "p_stylist_id" "uuid", "p_service_id" "uuid", "p_start_time" timestamp with time zone, "p_customer_name" "text", "p_customer_phone" "text", "p_customer_email" "text", "p_customer_address_line1" "text", "p_customer_city" "text", "p_customer_state" "text", "p_customer_postal_code" "text", "p_customer_country" "text", "p_customer_notes" "text", "p_ttl_minutes" integer) IS 'Creates a temporary booking reservation with 15-minute TTL. 
FIXED: Now correctly uses base_price_cents from services table.';



CREATE OR REPLACE FUNCTION "public"."create_combo_product"("p_name" "text", "p_description" "text", "p_category_id" "uuid", "p_combo_price_cents" integer, "p_constituent_items" "jsonb", "p_quantity_limit" integer DEFAULT NULL::integer, "p_images" "jsonb" DEFAULT '[]'::"jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $_$
DECLARE
  v_vendor_id UUID;
  v_combo_product_id UUID;
  v_total_original_price_cents INTEGER := 0;
  v_item JSONB;
  v_variant RECORD;
  v_slug TEXT;
  v_image JSONB;
  v_image_order INTEGER := 0;
  v_first_category_id UUID := NULL;  -- Category from first constituent
  v_final_category_id UUID;
  -- Authorized vendor IDs for combo creation
  v_authorized_vendors UUID[] := ARRAY[
    '365bd0ab-e135-45c5-bd24-a907de036287'::UUID,  -- KB Stylish
    'b40f741d-b1ce-45ae-a5c6-5703a3e9d182'::UUID   -- rabindra1816@gmail.com (testing)
  ];
BEGIN
  -- Get current user
  v_vendor_id := auth.uid();
  
  -- Authorization check: Only authorized vendors can create combos
  IF v_vendor_id IS NULL OR NOT (v_vendor_id = ANY(v_authorized_vendors)) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Only authorized vendors can create combo products');
  END IF;
  
  -- Validate minimum products (at least 2)
  IF p_constituent_items IS NULL OR jsonb_array_length(p_constituent_items) < 2 THEN
    RETURN jsonb_build_object('success', false, 'message', 'Combo must have at least 2 products');
  END IF;
  
  -- Validate maximum products (max 10)
  IF jsonb_array_length(p_constituent_items) > 10 THEN
    RETURN jsonb_build_object('success', false, 'message', 'Combo cannot have more than 10 products');
  END IF;
  
  -- Calculate total original price IN CENTS and validate all variants belong to this vendor
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_constituent_items)
  LOOP
    SELECT pv.*, p.vendor_id, p.is_active as product_active, p.category_id INTO v_variant
    FROM product_variants pv
    JOIN products p ON pv.product_id = p.id
    WHERE pv.id = (v_item->>'variant_id')::UUID;
    
    IF v_variant IS NULL THEN
      RETURN jsonb_build_object('success', false, 'message', 'Invalid variant ID: ' || (v_item->>'variant_id'));
    END IF;
    
    IF v_variant.vendor_id != v_vendor_id THEN
      RETURN jsonb_build_object('success', false, 'message', 'Can only include your own products in combo');
    END IF;
    
    IF NOT v_variant.product_active OR NOT v_variant.is_active THEN
      RETURN jsonb_build_object('success', false, 'message', 'Cannot include inactive products in combo');
    END IF;
    
    -- Capture category from first constituent product
    IF v_first_category_id IS NULL THEN
      v_first_category_id := v_variant.category_id;
    END IF;
    
    -- Convert price from rupees to cents (multiply by 100) and add to total
    v_total_original_price_cents := v_total_original_price_cents + 
      (ROUND(v_variant.price * 100)::INTEGER * COALESCE((v_item->>'quantity')::INTEGER, 1));
  END LOOP;
  
  -- Determine final category: use provided category or fall back to first constituent's category
  v_final_category_id := COALESCE(p_category_id, v_first_category_id);
  
  -- Validate we have a category
  IF v_final_category_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Category is required for combo products');
  END IF;
  
  -- Validate combo price is less than original (must have savings)
  IF p_combo_price_cents >= v_total_original_price_cents THEN
    RETURN jsonb_build_object('success', false, 'message', 'Combo price must be less than total of individual prices');
  END IF;
  
  -- Generate slug from name
  v_slug := lower(regexp_replace(p_name, '[^a-zA-Z0-9]+', '-', 'g'));
  v_slug := regexp_replace(v_slug, '^-|-$', '', 'g');
  
  -- Ensure slug is unique
  IF EXISTS (SELECT 1 FROM products WHERE slug = v_slug) THEN
    v_slug := v_slug || '-' || extract(epoch from now())::integer;
  END IF;
  
  -- Create the combo product with the determined category
  INSERT INTO products (
    vendor_id, name, description, category_id, slug,
    is_combo, combo_price_cents, combo_savings_cents,
    combo_quantity_limit, combo_quantity_sold, is_active
  ) VALUES (
    v_vendor_id, p_name, p_description, v_final_category_id, v_slug,
    true, p_combo_price_cents, v_total_original_price_cents - p_combo_price_cents,
    p_quantity_limit, 0, true
  ) RETURNING id INTO v_combo_product_id;
  
  -- Create combo items
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_constituent_items)
  LOOP
    INSERT INTO combo_items (combo_product_id, constituent_variant_id, constituent_product_id, quantity, display_order)
    SELECT 
      v_combo_product_id,
      (v_item->>'variant_id')::UUID,
      pv.product_id,
      COALESCE((v_item->>'quantity')::INTEGER, 1),
      COALESCE((v_item->>'display_order')::INTEGER, 0)
    FROM product_variants pv
    WHERE pv.id = (v_item->>'variant_id')::UUID;
  END LOOP;
  
  -- Add images if provided
  FOR v_image IN SELECT * FROM jsonb_array_elements(p_images)
  LOOP
    INSERT INTO product_images (product_id, image_url, alt_text, sort_order, is_primary)
    VALUES (
      v_combo_product_id,
      v_image->>'url',
      COALESCE(v_image->>'alt_text', p_name),
      v_image_order,
      v_image_order = 0
    );
    v_image_order := v_image_order + 1;
  END LOOP;
  
  -- Log the creation
  INSERT INTO product_change_log (product_id, change_type, new_values, changed_by)
  VALUES (
    v_combo_product_id,
    'created',
    jsonb_build_object(
      'name', p_name,
      'is_combo', true,
      'combo_price_cents', p_combo_price_cents,
      'combo_savings_cents', v_total_original_price_cents - p_combo_price_cents,
      'quantity_limit', p_quantity_limit,
      'constituent_count', jsonb_array_length(p_constituent_items),
      'category_id', v_final_category_id
    ),
    v_vendor_id
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'combo_id', v_combo_product_id,
    'slug', v_slug,
    'original_price_cents', v_total_original_price_cents,
    'savings_cents', v_total_original_price_cents - p_combo_price_cents,
    'quantity_limit', p_quantity_limit,
    'category_id', v_final_category_id
  );
END;
$_$;


ALTER FUNCTION "public"."create_combo_product"("p_name" "text", "p_description" "text", "p_category_id" "uuid", "p_combo_price_cents" integer, "p_constituent_items" "jsonb", "p_quantity_limit" integer, "p_images" "jsonb") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."create_combo_product"("p_name" "text", "p_description" "text", "p_category_id" "uuid", "p_combo_price_cents" integer, "p_constituent_items" "jsonb", "p_quantity_limit" integer, "p_images" "jsonb") IS 'Creates a combo product with constituent items. Only KB Stylish vendor can call this.';



CREATE OR REPLACE FUNCTION "public"."create_default_email_preferences"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  INSERT INTO public.email_preferences (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."create_default_email_preferences"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."create_default_email_preferences"() IS 'Auto-create email preferences with default settings when user signs up';



CREATE OR REPLACE FUNCTION "public"."create_support_ticket"("p_category_id" "uuid", "p_subject" "text", "p_message_text" "text", "p_priority" "text" DEFAULT 'medium'::"text", "p_order_reference" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_user_id uuid;
  v_user_email text;
  v_user_name text;
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
  
  -- Get user email from auth.users (primary source) and name from profile
  SELECT 
    COALESCE(au.email, upd.email, 'unknown@example.com'),
    COALESCE(up.display_name, 'Unknown User')
  INTO v_user_email, v_user_name
  FROM auth.users au
  LEFT JOIN public.user_profiles up ON au.id = up.id
  LEFT JOIN public.user_private_data upd ON au.id = upd.user_id
  WHERE au.id = v_user_id;
  
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
  
  -- Create ticket with proper email
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


ALTER FUNCTION "public"."create_support_ticket"("p_category_id" "uuid", "p_subject" "text", "p_message_text" "text", "p_priority" "text", "p_order_reference" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_support_ticket"("p_category_id" "uuid", "p_subject" "text", "p_message_text" "text", "p_priority" "text" DEFAULT 'medium'::"text", "p_order_reference" "text" DEFAULT NULL::"text", "p_customer_email" "text" DEFAULT NULL::"text", "p_customer_name" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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
    v_user_id,
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
    v_user_id,
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
$$;


ALTER FUNCTION "public"."create_support_ticket"("p_category_id" "uuid", "p_subject" "text", "p_message_text" "text", "p_priority" "text", "p_order_reference" "text", "p_customer_email" "text", "p_customer_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_vendor_product"("p_product_data" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'private', 'pg_temp'
    SET "statement_timeout" TO '30s'
    AS $$
DECLARE
  v_vendor_id uuid;
  v_product_id uuid;
  v_variant_id uuid;
  v_location_id uuid;
  v_variant jsonb;
  v_image jsonb;
  v_slug text;
  v_seo_title text;
  v_seo_description text;
  v_image_counter integer := 0;
  v_attr_value_id uuid;
BEGIN
  -- Authentication check
  v_vendor_id := auth.uid();
  IF v_vendor_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: Must be authenticated';
  END IF;
  
  -- Role check
  IF NOT public.user_has_role(v_vendor_id, 'vendor') THEN
    RAISE EXCEPTION 'Unauthorized: Must be a vendor';
  END IF;
  
  -- Validate product name
  IF p_product_data->>'name' IS NULL OR LENGTH(TRIM(p_product_data->>'name')) = 0 THEN
    RAISE EXCEPTION 'Product name is required';
  END IF;
  
  IF LENGTH(p_product_data->>'name') > 200 THEN
    RAISE EXCEPTION 'Product name too long (max 200 characters)';
  END IF;
  
  -- Validate description length
  IF LENGTH(COALESCE(p_product_data->>'description', '')) > 5000 THEN
    RAISE EXCEPTION 'Description too long (max 5000 characters)';
  END IF;
  
  -- Validate category
  IF p_product_data->>'category_id' IS NULL THEN
    RAISE EXCEPTION 'Category is required';
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM categories 
    WHERE id = (p_product_data->>'category_id')::uuid 
      AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Invalid or inactive category';
  END IF;
  
  -- Validate variants exist
  IF NOT (p_product_data ? 'variants') OR jsonb_array_length(p_product_data->'variants') = 0 THEN
    RAISE EXCEPTION 'Product must have at least one variant';
  END IF;
  
  -- Generate slug and SEO metadata
  v_slug := private.generate_product_slug(p_product_data->>'name', v_vendor_id);
  v_seo_title := LEFT(p_product_data->>'name', 60);
  v_seo_description := LEFT(
    COALESCE(p_product_data->>'short_description', p_product_data->>'description', ''), 
    155
  );
  
  -- Create product record
  INSERT INTO products (
    vendor_id, category_id, brand_id, name, slug, description, short_description,
    material, care_instructions, country_of_origin, is_active, is_featured,
    seo_title, seo_description
  ) VALUES (
    v_vendor_id,
    (p_product_data->>'category_id')::uuid,
    NULLIF(p_product_data->>'brand_id', '')::uuid,
    TRIM(p_product_data->>'name'),
    v_slug,
    p_product_data->>'description',
    p_product_data->>'short_description',
    p_product_data->>'material',
    p_product_data->>'care_instructions',
    p_product_data->>'country_of_origin',
    COALESCE((p_product_data->>'is_active')::boolean, true),
    COALESCE((p_product_data->>'is_featured')::boolean, false),
    v_seo_title,
    v_seo_description
  ) RETURNING id INTO v_product_id;
  
  -- Get or create default inventory location
  SELECT id INTO v_location_id
  FROM inventory_locations
  WHERE vendor_id = v_vendor_id AND is_default = true AND is_active = true
  LIMIT 1;
  
  IF v_location_id IS NULL THEN
    INSERT INTO inventory_locations (vendor_id, name, is_default, is_active)
    VALUES (v_vendor_id, 'Default Warehouse', true, true)
    RETURNING id INTO v_location_id;
  END IF;
  
  -- Create variants with attribute assignments
  FOR v_variant IN SELECT * FROM jsonb_array_elements(p_product_data->'variants')
  LOOP
    -- Validate variant price
    IF COALESCE((v_variant->>'price')::decimal, 0) <= 0 THEN
      RAISE EXCEPTION 'Variant price must be greater than 0';
    END IF;
    
    -- Validate SKU
    IF v_variant->>'sku' IS NULL OR LENGTH(TRIM(v_variant->>'sku')) = 0 THEN
      RAISE EXCEPTION 'Variant SKU is required';
    END IF;
    
    -- Create variant
    INSERT INTO product_variants (
      product_id, sku, price, compare_at_price, cost_price, weight_grams, is_active
    ) VALUES (
      v_product_id,
      TRIM(v_variant->>'sku'),
      (v_variant->>'price')::decimal,
      NULLIF(v_variant->>'compare_at_price', '')::decimal,
      NULLIF(v_variant->>'cost_price', '')::decimal,
      NULLIF(v_variant->>'weight_grams', '')::integer,
      COALESCE((v_variant->>'is_active')::boolean, true)
    ) RETURNING id INTO v_variant_id;
    
    -- ⭐ NEW: Link variant to attribute values
    IF v_variant ? 'attribute_value_ids' AND 
       jsonb_array_length(v_variant->'attribute_value_ids') > 0 THEN
      
      -- Iterate through attribute value IDs and create junction records
      FOR v_attr_value_id IN 
        SELECT (value::text)::uuid 
        FROM jsonb_array_elements_text(v_variant->'attribute_value_ids')
      LOOP
        -- Validate attribute value exists
        IF NOT EXISTS (
          SELECT 1 FROM attribute_values WHERE id = v_attr_value_id AND is_active = true
        ) THEN
          RAISE EXCEPTION 'Invalid attribute value ID: %', v_attr_value_id;
        END IF;
        
        -- Create junction record
        INSERT INTO variant_attribute_values (variant_id, attribute_value_id)
        VALUES (v_variant_id, v_attr_value_id)
        ON CONFLICT DO NOTHING;
      END LOOP;
    END IF;
    
    -- Create inventory record
    INSERT INTO inventory (variant_id, location_id, quantity_available, reorder_point, reorder_quantity)
    VALUES (
      v_variant_id,
      v_location_id,
      COALESCE((v_variant->>'quantity')::integer, 0),
      COALESCE((v_variant->>'reorder_point')::integer, 5),
      COALESCE((v_variant->>'reorder_quantity')::integer, 20)
    );
  END LOOP;
  
  -- Insert product images
  IF p_product_data ? 'images' AND jsonb_array_length(p_product_data->'images') > 0 THEN
    FOR v_image IN SELECT * FROM jsonb_array_elements(p_product_data->'images')
    LOOP
      -- Validate image URL (ensure it's from product-images bucket)
      IF (v_image->>'image_url') NOT LIKE '%/storage/v1/object/public/product-images/%' THEN
        RAISE WARNING 'Image URL does not match expected pattern: %', (v_image->>'image_url');
        -- Continue anyway for flexibility (e.g., external CDN in future)
      END IF;
      
      INSERT INTO product_images (product_id, image_url, alt_text, sort_order, is_primary)
      VALUES (
        v_product_id,
        v_image->>'image_url',
        COALESCE(v_image->>'alt_text', v_seo_title),
        COALESCE((v_image->>'sort_order')::integer, v_image_counter),
        COALESCE((v_image->>'is_primary')::boolean, v_image_counter = 0)
      );
      v_image_counter := v_image_counter + 1;
    END LOOP;
  END IF;
  
  -- Log change
  INSERT INTO product_change_log (product_id, changed_by, change_type, new_values)
  VALUES (v_product_id, v_vendor_id, 'created', p_product_data);
  
  -- Notify cache invalidation system
  PERFORM pg_notify('product_changed', json_build_object(
    'product_id', v_product_id,
    'vendor_id', v_vendor_id,
    'action', 'created',
    'slug', v_slug
  )::text);
  
  -- Return success with product details
  RETURN jsonb_build_object(
    'success', true,
    'product_id', v_product_id,
    'slug', v_slug,
    'message', 'Product created successfully'
  );
  
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'Duplicate SKU detected. Each variant must have a unique SKU.';
  WHEN foreign_key_violation THEN
    RAISE EXCEPTION 'Invalid reference: Category, brand, or attribute not found.';
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Product creation failed: %', SQLERRM;
END;
$$;


ALTER FUNCTION "public"."create_vendor_product"("p_product_data" "jsonb") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."create_vendor_product"("p_product_data" "jsonb") IS 'Creates a new product with variants, attributes, images, and inventory. 
Enhanced version supports variant-attribute linking via attribute_value_ids array.
Example payload: {"variants": [{"sku": "...", "price": 2999, "attribute_value_ids": ["uuid1", "uuid2"]}]}';



CREATE OR REPLACE FUNCTION "public"."custom_access_token_hook"("event" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
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


ALTER FUNCTION "public"."custom_access_token_hook"("event" "jsonb") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."custom_access_token_hook"("event" "jsonb") IS 'Custom JWT claims hook that adds user_roles array and role_version to access tokens for KB Stylish role-based authentication system.';



CREATE OR REPLACE FUNCTION "public"."debug_cart_state"("p_user_id" "uuid" DEFAULT NULL::"uuid", "p_guest_token" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_cart_id UUID;
  v_result JSONB;
BEGIN
  -- Get cart ID
  v_cart_id := public.get_or_create_cart_secure(p_user_id, p_guest_token);
  
  -- Build debug info
  SELECT jsonb_build_object(
    'cart_id', v_cart_id,
    'user_id', c.user_id,
    'session_id', c.session_id,
    'created_at', c.created_at,
    'updated_at', c.updated_at,
    'items', (
      SELECT jsonb_agg(jsonb_build_object(
        'id', ci.id,
        'variant_id', ci.variant_id,
        'quantity', ci.quantity,
        'price_snapshot', ci.price_snapshot,
        'product_name', p.name,
        'variant_sku', pv.sku,
        'created_at', ci.created_at,
        'updated_at', ci.updated_at
      ) ORDER BY ci.created_at)
      FROM cart_items ci
      JOIN product_variants pv ON pv.id = ci.variant_id
      JOIN products p ON p.id = pv.product_id
      WHERE ci.cart_id = c.id
    ),
    'total_items', (
      SELECT COALESCE(SUM(quantity), 0) 
      FROM cart_items 
      WHERE cart_id = c.id
    ),
    'total_value', (
      SELECT COALESCE(SUM(quantity * price_snapshot), 0)
      FROM cart_items
      WHERE cart_id = c.id
    )
  ) INTO v_result
  FROM carts c
  WHERE c.id = v_cart_id;
  
  RETURN v_result;
END;
$$;


ALTER FUNCTION "public"."debug_cart_state"("p_user_id" "uuid", "p_guest_token" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."debug_review_fetch"("p_product_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_result JSONB;
  v_error TEXT;
BEGIN
  -- Simulate the exact query structure from review-manager
  SELECT jsonb_agg(row_to_json(t))
  INTO v_result
  FROM (
    SELECT 
      r.*,
      jsonb_build_object(
        'display_name', up.display_name,
        'avatar_url', up.avatar_url
      ) as "user",
      jsonb_build_object(
        'vendor_id', p.vendor_id
      ) as product,
      (
        SELECT jsonb_agg(jsonb_build_object(
          'id', rr.id,
          'comment', rr.comment,
          'reply_type', rr.reply_type,
          'is_visible', rr.is_visible,
          'is_approved', rr.is_approved,
          'deleted_at', rr.deleted_at,
          'created_at', rr.created_at
        ))
        FROM review_replies rr
        WHERE rr.review_id = r.id
      ) as vendor_reply,
      (
        SELECT jsonb_agg(jsonb_build_object(
          'helpful_count', rvs.helpful_count,
          'unhelpful_count', rvs.unhelpful_count
        ))
        FROM review_vote_shards rvs
        WHERE rvs.review_id = r.id
      ) as review_vote_shards
    FROM reviews r
    LEFT JOIN user_profiles up ON up.id = r.user_id
    INNER JOIN products p ON p.id = r.product_id
    WHERE r.product_id = p_product_id
      AND r.is_approved = true
      AND r.deleted_at IS NULL
    ORDER BY r.created_at DESC
    LIMIT 20
  ) t;
  
  RETURN jsonb_build_object(
    'success', true,
    'data', COALESCE(v_result, '[]'::jsonb),
    'count', jsonb_array_length(COALESCE(v_result, '[]'::jsonb))
  );
  
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM,
    'detail', SQLSTATE
  );
END;
$$;


ALTER FUNCTION "public"."debug_review_fetch"("p_product_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."decrypt_bank_account"("p_vendor_id" "uuid") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'private', 'pg_temp'
    AS $$
DECLARE
  v_encrypted BYTEA;
  v_key TEXT;
  v_decrypted TEXT;
BEGIN
  -- SECURITY: Only admins can decrypt
  IF NOT public.user_has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Unauthorized: Admin role required to decrypt bank account';
  END IF;
  
  -- Get encrypted data
  SELECT bank_account_number_enc INTO v_encrypted
  FROM public.vendor_profiles
  WHERE user_id = p_vendor_id;
  
  IF v_encrypted IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Decrypt
  v_key := private.get_encryption_key();
  v_decrypted := pgp_sym_decrypt(v_encrypted, v_key);
  
  -- Audit log (for compliance)
  INSERT INTO private.audit_log (
    user_id,
    action,
    table_name,
    record_id,
    details
  )
  VALUES (
    auth.uid(),
    'decrypt_bank_account',
    'vendor_profiles',
    p_vendor_id,
    jsonb_build_object('timestamp', NOW(), 'reason', 'payout_processing')
  );
  
  RETURN v_decrypted;
END;
$$;


ALTER FUNCTION "public"."decrypt_bank_account"("p_vendor_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."decrypt_bank_account"("p_vendor_id" "uuid") IS 'Decrypts vendor bank account number. ADMIN ONLY. Logs all access for audit compliance.';



CREATE OR REPLACE FUNCTION "public"."delete_vendor_attribute"("p_attribute_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'private', 'pg_temp'
    SET "statement_timeout" TO '30s'
    AS $$
DECLARE
  v_vendor_id uuid;
  v_attr_vendor_id uuid;
  v_has_variants boolean;
BEGIN
  -- 1. Authentication check
  v_vendor_id := auth.uid();
  IF v_vendor_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: Must be authenticated';
  END IF;
  
  -- 2. Role check
  IF NOT public.user_has_role(v_vendor_id, 'vendor') THEN
    RAISE EXCEPTION 'Unauthorized: Must be a vendor';
  END IF;
  
  -- 3. Verify ownership
  SELECT vendor_id INTO v_attr_vendor_id
  FROM product_attributes WHERE id = p_attribute_id;
  
  IF v_attr_vendor_id IS NULL THEN
    RAISE EXCEPTION 'Attribute not found';
  END IF;
  
  IF v_attr_vendor_id != v_vendor_id THEN
    RAISE EXCEPTION 'Unauthorized: Cannot delete attributes you do not own';
  END IF;
  
  -- 4. Check if attribute is in use by any variants
  SELECT EXISTS (
    SELECT 1 FROM variant_attribute_values vav
    JOIN attribute_values av ON av.id = vav.attribute_value_id
    WHERE av.attribute_id = p_attribute_id
  ) INTO v_has_variants;
  
  IF v_has_variants THEN
    -- Soft delete - mark as inactive
    UPDATE product_attributes SET is_active = false WHERE id = p_attribute_id;
    UPDATE attribute_values SET is_active = false WHERE attribute_id = p_attribute_id;
    
    -- Audit log
    INSERT INTO product_change_log (
      product_id, changed_by, change_type, old_values, new_values
    ) VALUES (
      NULL, v_vendor_id, 'attribute_deactivated',
      jsonb_build_object('attribute_id', p_attribute_id),
      jsonb_build_object('reason', 'in use by existing variants')
    );
    
    RETURN jsonb_build_object(
      'success', true,
      'message', 'Attribute deactivated (in use by existing variants)'
    );
  ELSE
    -- Hard delete - no variants using it
    DELETE FROM attribute_values WHERE attribute_id = p_attribute_id;
    DELETE FROM product_attributes WHERE id = p_attribute_id;
    
    -- Audit log
    INSERT INTO product_change_log (
      product_id, changed_by, change_type, old_values, new_values
    ) VALUES (
      NULL, v_vendor_id, 'attribute_deleted',
      jsonb_build_object('attribute_id', p_attribute_id),
      NULL
    );
    
    RETURN jsonb_build_object(
      'success', true,
      'message', 'Attribute deleted'
    );
  END IF;

EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Failed to delete attribute: %', SQLERRM;
END;
$$;


ALTER FUNCTION "public"."delete_vendor_attribute"("p_attribute_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_vendor_product"("p_product_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth', 'pg_temp'
    AS $$
DECLARE
  v_vendor_id uuid;
  v_product_vendor_id uuid;
  v_slug text;
  v_product_name text;
  v_variant_count int;
  v_active_order_count int;
BEGIN
  v_vendor_id := auth.uid();
  
  IF v_vendor_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Unauthorized: Must be authenticated'
    );
  END IF;
  
  SELECT vendor_id, slug, name
  INTO v_product_vendor_id, v_slug, v_product_name
  FROM products 
  WHERE id = p_product_id;
  
  IF v_product_vendor_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Product not found'
    );
  END IF;
  
  IF v_product_vendor_id != v_vendor_id AND NOT EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN roles r ON r.id = ur.role_id
    WHERE ur.user_id = v_vendor_id
      AND r.name = 'admin'
      AND ur.is_active = true
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Unauthorized: Can only delete own products'
    );
  END IF;
  
  SELECT COUNT(DISTINCT oi.order_id)
  INTO v_active_order_count
  FROM order_items oi
  JOIN orders o ON o.id = oi.order_id
  WHERE oi.product_id = p_product_id
    AND o.status IN ('pending', 'confirmed', 'processing', 'shipped');
  
  IF v_active_order_count > 0 THEN
    UPDATE products SET is_active = false, updated_at = NOW() WHERE id = p_product_id;
    
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Cannot delete product with active orders. Product has been deactivated instead.',
      'active_orders', v_active_order_count
    );
  END IF;
  
  SELECT COUNT(*) INTO v_variant_count
  FROM product_variants
  WHERE product_id = p_product_id;
  
  UPDATE products 
  SET 
    is_active = false,
    updated_at = NOW()
  WHERE id = p_product_id;
  
  UPDATE product_variants 
  SET 
    is_active = false,
    updated_at = NOW()
  WHERE product_id = p_product_id;
  
  -- ✅ CORRECT: Use 'deleted' (matches CHECK constraint!)
  INSERT INTO product_change_log (
    product_id,
    changed_by,
    change_type,
    new_values
  ) VALUES (
    p_product_id,
    v_vendor_id,
    'deleted',
    jsonb_build_object(
      'soft_delete', true,
      'product_name', v_product_name,
      'variants_deactivated', v_variant_count,
      'timestamp', NOW()
    )
  );
  
  PERFORM pg_notify(
    'product_changed',
    json_build_object(
      'product_id', p_product_id,
      'vendor_id', v_vendor_id,
      'action', 'deleted',
      'slug', v_slug,
      'product_name', v_product_name
    )::text
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'product_id', p_product_id,
    'message', 'Product "' || v_product_name || '" deleted successfully (deactivated)',
    'variants_deactivated', v_variant_count
  );
END;
$$;


ALTER FUNCTION "public"."delete_vendor_product"("p_product_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."delete_vendor_product"("p_product_id" "uuid") IS 'Soft delete product. Uses change_type=deleted to match CHECK constraint.';



CREATE OR REPLACE FUNCTION "public"."generate_guest_token"() RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_token TEXT;
  v_exists BOOLEAN;
  v_attempts INT := 0;
BEGIN
  LOOP
    -- Generate cryptographically secure 256-bit token
    -- Format: guest_<base64-encoded-32-bytes>
    v_token := 'guest_' || encode(gen_random_bytes(32), 'base64');
    
    -- Remove problematic characters from base64 for URL safety
    v_token := replace(replace(replace(v_token, '/', '_'), '+', '-'), '=', '');
    
    -- Check uniqueness in carts table
    SELECT EXISTS(
      SELECT 1 FROM carts WHERE session_id = v_token
    ) INTO v_exists;
    
    -- Exit if unique token found
    EXIT WHEN NOT v_exists;
    
    -- Safety: Prevent infinite loop (extremely unlikely with 256-bit entropy)
    v_attempts := v_attempts + 1;
    IF v_attempts > 10 THEN
      RAISE EXCEPTION 'Failed to generate unique guest token after % attempts', v_attempts;
    END IF;
  END LOOP;
  
  RETURN v_token;
END;
$$;


ALTER FUNCTION "public"."generate_guest_token"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."generate_guest_token"() IS 'Security Fix (2025-10-18): Generates cryptographically secure guest tokens using gen_random_bytes(32). 
Token format: guest_<base64> with 256-bit entropy. CJ-SEC-001 resolved.';



CREATE OR REPLACE FUNCTION "public"."get_active_combos"("p_limit" integer DEFAULT 8) RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_agg(combo_data ORDER BY (combo_data->>'created_at')::timestamptz DESC)
  INTO result
  FROM (
    SELECT json_build_object(
      'id', p.id,
      'name', p.name,
      'slug', p.slug,
      'description', p.description,
      'combo_price_cents', p.combo_price_cents,
      'combo_savings_cents', p.combo_savings_cents,
      'combo_quantity_limit', p.combo_quantity_limit,
      'combo_quantity_sold', p.combo_quantity_sold,
      'item_count', (SELECT COUNT(*) FROM combo_items ci WHERE ci.combo_product_id = p.id),
      'image_url', COALESCE(
        (SELECT pi.image_url FROM product_images pi WHERE pi.product_id = p.id ORDER BY pi.sort_order LIMIT 1),
        (SELECT pi.image_url FROM combo_items ci 
         JOIN product_images pi ON pi.product_id = ci.constituent_product_id 
         WHERE ci.combo_product_id = p.id ORDER BY ci.display_order, pi.sort_order LIMIT 1)
      ),
      'created_at', p.created_at
    ) as combo_data
    FROM products p
    WHERE p.is_combo = true AND p.is_active = true
    LIMIT p_limit
  ) subq;
  
  RETURN COALESCE(result, '[]'::json);
END;
$$;


ALTER FUNCTION "public"."get_active_combos"("p_limit" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_active_combos"("p_limit" integer) IS 'Fetches active combo products for homepage display with images and item counts';



CREATE OR REPLACE FUNCTION "public"."get_admin_dashboard_stats_v2_1"() RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'private', 'public', 'pg_temp'
    AS $$
DECLARE
  calling_user_id uuid;
BEGIN
  -- Get the authenticated user's ID (works because this is SECURITY INVOKER)
  calling_user_id := auth.uid();
  
  IF calling_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  
  -- Pass user_id to the SECURITY DEFINER function
  RETURN private.get_admin_dashboard_stats_v2_1(calling_user_id);
END;
$$;


ALTER FUNCTION "public"."get_admin_dashboard_stats_v2_1"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_admin_dashboard_stats_v2_1"() IS 'SECURITY INVOKER wrapper that captures auth.uid() and passes to SECURITY DEFINER function.';



CREATE OR REPLACE FUNCTION "public"."get_admin_payout_requests"("p_status" "text" DEFAULT 'pending'::"text", "p_limit" integer DEFAULT 50) RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'private', 'pg_temp'
    AS $$
DECLARE
  v_user_id uuid;
  -- REMOVED: v_is_admin boolean;
BEGIN
  v_user_id := auth.uid();

  -- ✅ FIX: Standardized admin check (replaces manual check)
  PERFORM private.assert_admin();

  -- Return payout requests with vendor details
  RETURN (
    SELECT json_agg(json_build_object(
      'request_id', pr.id,
      'vendor_id', pr.vendor_id,
      'vendor_name', vp.business_name,
      'requested_amount_cents', pr.requested_amount_cents,
      'payment_method', pr.payment_method,
      'payment_details', pr.payment_details,
      'status', pr.status,
      'created_at', pr.created_at,
      'reviewed_by', pr.reviewed_by,
      'reviewed_at', pr.reviewed_at,
      'rejection_reason', pr.rejection_reason,
      'available_balance', calculate_vendor_pending_payout(pr.vendor_id)
    ) ORDER BY pr.created_at DESC)
    FROM payout_requests pr
    LEFT JOIN vendor_profiles vp ON vp.user_id = pr.vendor_id
    WHERE pr.status = p_status
    LIMIT p_limit
  );
END;
$$;


ALTER FUNCTION "public"."get_admin_payout_requests"("p_status" "text", "p_limit" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_admin_payout_requests"("p_status" "text", "p_limit" integer) IS 'Admin-only function to list payout requests';



CREATE OR REPLACE FUNCTION "public"."get_admin_support_tickets"("p_status" "text" DEFAULT NULL::"text", "p_priority" "text" DEFAULT NULL::"text", "p_assigned_to" "uuid" DEFAULT NULL::"uuid", "p_category_id" "uuid" DEFAULT NULL::"uuid", "p_search" "text" DEFAULT NULL::"text", "p_limit" integer DEFAULT 50, "p_offset" integer DEFAULT 0) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_tickets jsonb;
  v_total integer;
BEGIN
  -- Security check
  PERFORM public.assert_admin_or_support();
  
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
  
  -- Get tickets with details - FIXED: Use subquery before jsonb_agg
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', ticket_data.id,
        'subject', ticket_data.subject,
        'priority', ticket_data.priority,
        'status', ticket_data.status,
        'customer_name', ticket_data.customer_name,
        'customer_email', ticket_data.customer_email,
        'category', ticket_data.category,
        'category_color', ticket_data.category_color,
        'assigned_to', ticket_data.assigned_to,
        'created_at', ticket_data.created_at,
        'updated_at', ticket_data.updated_at,
        'resolved_at', ticket_data.resolved_at,
        'message_count', ticket_data.message_count,
        'last_message_at', ticket_data.last_message_at
      ) ORDER BY ticket_data.created_at DESC
    ),
    '[]'::jsonb
  ) INTO v_tickets
  FROM (
    SELECT 
      st.id,
      st.subject,
      st.priority,
      st.status,
      st.customer_name,
      st.customer_email,
      COALESCE(sc.name, 'General') as category,
      sc.color as category_color,
      assigned_user.display_name as assigned_to,
      st.created_at,
      st.updated_at,
      st.resolved_at,
      COALESCE(msg_count.count, 0) as message_count,
      msg_count.last_message_at
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
    LIMIT p_limit OFFSET p_offset
  ) ticket_data;
  
  RETURN jsonb_build_object(
    'success', true,
    'tickets', v_tickets,
    'total', v_total,
    'limit', p_limit,
    'offset', p_offset
  );
END;
$$;


ALTER FUNCTION "public"."get_admin_support_tickets"("p_status" "text", "p_priority" "text", "p_assigned_to" "uuid", "p_category_id" "uuid", "p_search" "text", "p_limit" integer, "p_offset" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_admin_users_list"("p_page" integer DEFAULT 1, "p_per_page" integer DEFAULT 20, "p_search" "text" DEFAULT NULL::"text", "p_role_filter" "text" DEFAULT NULL::"text", "p_status_filter" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth', 'private', 'pg_temp'
    SET "statement_timeout" TO '10s'
    AS $$
DECLARE
  v_offset integer;
  v_total integer;
  v_users jsonb;
BEGIN
  -- SECURITY: Verify admin access FIRST
  PERFORM private.assert_admin();

  -- Validate pagination
  IF p_per_page > 100 THEN
    p_per_page := 100;
  END IF;

  v_offset := (p_page - 1) * p_per_page;
  
  -- FIXED: Single CTE chain to maintain scope
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
      au.deleted_at IS NULL
      AND (
        p_search IS NULL OR 
        up.display_name ILIKE '%' || p_search || '%' OR 
        up.username ILIKE '%' || p_search || '%' OR
        au.email ILIKE '%' || p_search || '%'
      )
      AND (p_role_filter IS NULL OR r.name = p_role_filter)
    GROUP BY au.id, up.id
  ),
  status_filtered AS (
    SELECT * FROM filtered_users
    WHERE (p_status_filter IS NULL OR status = p_status_filter)
  ),
  paginated AS (
    SELECT * FROM status_filtered
    ORDER BY created_at DESC
    LIMIT p_per_page
    OFFSET v_offset
  )
  SELECT 
    (SELECT COUNT(*) FROM status_filtered) as total,
    COALESCE(jsonb_agg(to_jsonb(paginated) ORDER BY created_at DESC), '[]'::jsonb) as users
  INTO v_total, v_users
  FROM paginated;
  
  RETURN jsonb_build_object(
    'users', v_users,
    'total', v_total,
    'page', p_page,
    'per_page', p_per_page,
    'total_pages', CEIL(v_total::numeric / p_per_page::numeric)
  );
END;
$$;


ALTER FUNCTION "public"."get_admin_users_list"("p_page" integer, "p_per_page" integer, "p_search" "text", "p_role_filter" "text", "p_status_filter" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_admin_users_list"("p_page" integer, "p_per_page" integer, "p_search" "text", "p_role_filter" "text", "p_status_filter" "text") IS 'Admin-only user management. Fixed CTE scoping issue. Uses SECURITY DEFINER to access auth.users.';



CREATE OR REPLACE FUNCTION "public"."get_admin_vendors_list"("p_page" integer DEFAULT 1, "p_per_page" integer DEFAULT 20, "p_search" "text" DEFAULT NULL::"text", "p_status_filter" "text" DEFAULT NULL::"text", "p_business_type_filter" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth', 'private', 'pg_temp'
    SET "statement_timeout" TO '10s'
    AS $$
DECLARE
  v_result jsonb;
BEGIN
  -- Verify admin access
  PERFORM private.assert_admin();

  -- Validate pagination
  IF p_per_page > 100 THEN
    p_per_page := 100;
  END IF;
  
  -- DEFINITIVE FIX: Check item-level fulfillment_status, not order status
  WITH filtered_vendors AS (
    SELECT 
      vp.user_id,
      vp.business_name,
      vp.business_type,
      vp.verification_status,
      vp.commission_rate,
      vp.created_at,
      vp.updated_at,
      up.display_name,
      up.username,
      up.avatar_url,
      up.is_verified,
      au.email,
      au.last_sign_in_at,
      au.banned_until,
      -- Get vendor metrics
      (SELECT COUNT(*) FROM products WHERE vendor_id = vp.user_id) as total_products,
      (SELECT COUNT(*) FROM products WHERE vendor_id = vp.user_id AND is_active = true) as active_products,
      -- Total revenue from DELIVERED items (item-level fulfillment)
      -- FIXED: Check oi.fulfillment_status = 'delivered' not o.status
      COALESCE(
        (SELECT SUM(oi.total_price_cents)
         FROM order_items oi
         WHERE oi.vendor_id = vp.user_id
         AND oi.fulfillment_status = 'delivered'),
        0
      ) as total_revenue_cents,
      -- Total delivered items (fulfilled orders)
      -- FIXED: Count distinct orders with delivered items
      (SELECT COUNT(DISTINCT oi.order_id)
       FROM order_items oi
       WHERE oi.vendor_id = vp.user_id
       AND oi.fulfillment_status = 'delivered') as total_orders,
      -- Pending items (not yet fulfilled)
      (SELECT COUNT(DISTINCT oi.order_id)
       FROM order_items oi
       WHERE oi.vendor_id = vp.user_id
       AND oi.fulfillment_status IN ('pending', 'processing', 'confirmed')) as pending_orders
    FROM vendor_profiles vp
    LEFT JOIN user_profiles up ON vp.user_id = up.id
    LEFT JOIN auth.users au ON vp.user_id = au.id
    WHERE 
      au.deleted_at IS NULL
      AND (
        p_search IS NULL OR 
        vp.business_name ILIKE '%' || p_search || '%' OR
        up.display_name ILIKE '%' || p_search || '%' OR
        au.email ILIKE '%' || p_search || '%'
      )
      AND (p_status_filter IS NULL OR vp.verification_status = p_status_filter)
      AND (p_business_type_filter IS NULL OR vp.business_type = p_business_type_filter)
  ),
  total_count AS (
    SELECT COUNT(*) as total FROM filtered_vendors
  ),
  paginated_vendors AS (
    SELECT * FROM filtered_vendors
    ORDER BY created_at DESC
    LIMIT p_per_page
    OFFSET (p_page - 1) * p_per_page
  )
  SELECT jsonb_build_object(
    'vendors', COALESCE(jsonb_agg(row_to_json(pv)::jsonb ORDER BY pv.created_at DESC), '[]'::jsonb),
    'total', (SELECT total FROM total_count),
    'page', p_page,
    'per_page', p_per_page,
    'total_pages', CEIL((SELECT total FROM total_count)::numeric / p_per_page::numeric)
  )
  INTO v_result
  FROM paginated_vendors pv;
  
  RETURN v_result;
END;
$$;


ALTER FUNCTION "public"."get_admin_vendors_list"("p_page" integer, "p_per_page" integer, "p_search" "text", "p_status_filter" "text", "p_business_type_filter" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_admin_vendors_list"("p_page" integer, "p_per_page" integer, "p_search" "text", "p_status_filter" "text", "p_business_type_filter" "text") IS 'Admin function to list all vendors with metrics. v4.0: DEFINITIVE FIX - Uses order_items.fulfillment_status for multi-vendor fulfillment tracking.';



CREATE OR REPLACE FUNCTION "public"."get_audit_logs"("p_requesting_user_id" "uuid", "p_category" "text" DEFAULT NULL::"text", "p_severity" "text" DEFAULT NULL::"text", "p_start_date" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_end_date" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_limit" integer DEFAULT 50, "p_offset" integer DEFAULT 0) RETURNS TABLE("id" bigint, "admin_user_id" "uuid", "admin_email" "text", "admin_display_name" "text", "action" "text", "target_id" "uuid", "target_type" "text", "severity" "text", "category" "text", "details" "jsonb", "ip_address" "inet", "user_agent" "text", "created_at" timestamp with time zone, "total_count" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'private', 'public', 'auth', 'pg_temp'
    AS $$
DECLARE
  v_is_admin BOOLEAN;
  v_is_auditor BOOLEAN;
  v_is_super_auditor BOOLEAN;
BEGIN
  v_is_admin := public.user_has_role(p_requesting_user_id, 'admin');
  v_is_auditor := public.user_has_role(p_requesting_user_id, 'auditor');
  v_is_super_auditor := public.user_has_role(p_requesting_user_id, 'super_auditor');
  
  IF NOT (v_is_admin OR v_is_auditor OR v_is_super_auditor) THEN
    RAISE EXCEPTION 'Unauthorized: Admin, Auditor, or Super Auditor role required'
      USING ERRCODE = '42501';
  END IF;

  IF p_category IS NOT NULL AND p_category NOT IN ('governance', 'security', 'data_access', 'configuration') THEN
    RAISE EXCEPTION 'Invalid category. Must be: governance, security, data_access, or configuration'
      USING ERRCODE = '22023';
  END IF;
  
  IF p_severity IS NOT NULL AND p_severity NOT IN ('info', 'warning', 'critical') THEN
    RAISE EXCEPTION 'Invalid severity. Must be: info, warning, or critical'
      USING ERRCODE = '22023';
  END IF;
  
  IF p_limit < 1 OR p_limit > 200 THEN
    RAISE EXCEPTION 'Limit must be between 1 and 200'
      USING ERRCODE = '22003';
  END IF;
  
  IF p_offset < 0 THEN
    RAISE EXCEPTION 'Offset must be >= 0'
      USING ERRCODE = '22003';
  END IF;

  RETURN QUERY
  WITH log_data AS (
    SELECT 
      sml.id,
      sml.admin_user_id,
      sml.action,
      sml.target_id,
      sml.target_type,
      sml.severity,
      sml.category,
      CASE
        WHEN v_is_super_auditor THEN sml.details
        WHEN v_is_auditor THEN sml.details
        WHEN v_is_admin AND sml.category IN ('governance', 'configuration') THEN sml.details
        ELSE NULL
      END as details,
      sml.ip_address,
      sml.user_agent,
      sml.created_at
    FROM private.service_management_log sml
    WHERE 
      (p_category IS NULL OR sml.category = p_category)
      AND (p_severity IS NULL OR sml.severity = p_severity)
      AND (p_start_date IS NULL OR sml.created_at >= p_start_date)
      AND (p_end_date IS NULL OR sml.created_at <= p_end_date)
      AND (
        v_is_super_auditor
        OR (v_is_auditor AND sml.admin_user_id != p_requesting_user_id)
        OR (
          v_is_admin 
          AND sml.admin_user_id != p_requesting_user_id 
          AND sml.category IN ('governance', 'configuration')
        )
      )
    ORDER BY sml.created_at DESC
    LIMIT p_limit
    OFFSET p_offset
  ),
  total AS (
    SELECT COUNT(*) as count
    FROM private.service_management_log sml
    WHERE 
      (p_category IS NULL OR sml.category = p_category)
      AND (p_severity IS NULL OR sml.severity = p_severity)
      AND (p_start_date IS NULL OR sml.created_at >= p_start_date)
      AND (p_end_date IS NULL OR sml.created_at <= p_end_date)
      AND (
        v_is_super_auditor
        OR (v_is_auditor AND sml.admin_user_id != p_requesting_user_id)
        OR (v_is_admin AND sml.admin_user_id != p_requesting_user_id AND sml.category IN ('governance', 'configuration'))
      )
  )
  SELECT 
    ld.id,
    ld.admin_user_id,
    au.email::TEXT as admin_email,  -- CAST to TEXT to match return type
    up.display_name as admin_display_name,
    ld.action,
    ld.target_id,
    ld.target_type,
    ld.severity,
    ld.category,
    ld.details,
    ld.ip_address,
    ld.user_agent,
    ld.created_at,
    t.count as total_count
  FROM log_data ld
  CROSS JOIN total t
  LEFT JOIN auth.users au ON ld.admin_user_id = au.id
  LEFT JOIN public.user_profiles up ON au.id = up.id;
END;
$$;


ALTER FUNCTION "public"."get_audit_logs"("p_requesting_user_id" "uuid", "p_category" "text", "p_severity" "text", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone, "p_limit" integer, "p_offset" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_audit_logs"("p_requesting_user_id" "uuid", "p_category" "text", "p_severity" "text", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone, "p_limit" integer, "p_offset" integer) IS 'Multi-role function (admin/auditor/super_auditor) to query audit logs with role-based filtering';



CREATE OR REPLACE FUNCTION "public"."get_available_slots"("p_stylist_id" "uuid", "p_service_id" "uuid", "p_target_date" "date", "p_customer_timezone" "text" DEFAULT 'Asia/Kathmandu'::"text") RETURNS TABLE("slot_start_utc" timestamp with time zone, "slot_end_utc" timestamp with time zone, "slot_start_local" timestamp with time zone, "slot_end_local" timestamp with time zone, "slot_display" "text", "status" "text", "price_cents" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
    v_stylist_timezone text;
    v_service_duration integer;
    v_service_price integer;
    v_day_of_week integer;
    v_schedule record;
    v_slot_start_local time;
    v_slot_start_utc timestamptz;
    v_slot_end_utc timestamptz;
    v_slot_start_customer_tz timestamptz;
    v_slot_end_customer_tz timestamptz;
    v_break_start_utc timestamptz;
    v_break_end_utc timestamptz;
    v_override_found boolean := FALSE;
    v_override_is_closed boolean;
    v_override_start_time time;
    v_override_end_time time;
BEGIN
    v_stylist_timezone := 'Asia/Kathmandu';

    SELECT 
        COALESCE(ss.custom_duration_minutes, s.duration_minutes, 60) AS duration,
        COALESCE(ss.custom_price_cents, s.base_price_cents, 0) AS price
    INTO 
        v_service_duration,
        v_service_price
    FROM public.stylist_services ss
    JOIN public.services s ON s.id = ss.service_id
    WHERE ss.stylist_user_id = p_stylist_id
      AND ss.service_id = p_service_id
      AND ss.is_available = true;

    IF NOT FOUND THEN
        RETURN;
    END IF;

    SELECT 
        so.is_closed,
        so.override_start_time,
        so.override_end_time
    INTO 
        v_override_is_closed,
        v_override_start_time,
        v_override_end_time
    FROM public.schedule_overrides so
    WHERE (
        so.stylist_user_id = p_stylist_id 
        OR so.applies_to_all_stylists = TRUE
    )
    AND p_target_date BETWEEN so.start_date AND so.end_date
    ORDER BY 
        so.priority DESC,
        (so.is_closed = FALSE) DESC,
        so.stylist_user_id IS NOT NULL DESC
    LIMIT 1;

    v_override_found := FOUND;

    IF v_override_found AND v_override_is_closed = TRUE THEN
        RETURN;
    END IF;

    v_day_of_week := EXTRACT(DOW FROM p_target_date);

    SELECT * INTO v_schedule
    FROM public.stylist_schedules
    WHERE stylist_user_id = p_stylist_id
      AND day_of_week = v_day_of_week
      AND is_active = true
      AND p_target_date >= effective_from
      AND (effective_until IS NULL OR p_target_date <= effective_until);

    IF NOT FOUND THEN
        RETURN;
    END IF;

    v_slot_start_local := v_schedule.start_time_utc;

    WHILE v_slot_start_local <= v_schedule.end_time_utc - (v_service_duration || ' minutes')::interval LOOP
        v_slot_start_utc := (p_target_date::text || ' ' || v_slot_start_local::text)::timestamp 
            AT TIME ZONE v_stylist_timezone;
        v_slot_end_utc := v_slot_start_utc + (v_service_duration || ' minutes')::interval;

        IF v_schedule.break_start_time_utc IS NOT NULL AND v_schedule.break_end_time_utc IS NOT NULL THEN
            v_break_start_utc := (p_target_date::text || ' ' || v_schedule.break_start_time_utc::text)::timestamp 
                AT TIME ZONE v_stylist_timezone;
            v_break_end_utc := (p_target_date::text || ' ' || v_schedule.break_end_time_utc::text)::timestamp 
                AT TIME ZONE v_stylist_timezone;

            IF (v_slot_start_utc < v_break_end_utc AND v_slot_end_utc > v_break_start_utc) THEN
                v_slot_start_local := v_slot_start_local + interval '30 minutes';
                CONTINUE;
            END IF;
        END IF;

        IF v_slot_start_utc <= now() THEN
            v_slot_start_local := v_slot_start_local + interval '30 minutes';
            CONTINUE;
        END IF;

        IF v_override_found 
           AND v_override_start_time IS NOT NULL 
           AND v_override_end_time IS NOT NULL THEN
            
            IF NOT (
                (v_slot_start_local + (v_service_duration || ' minutes')::interval)::time <= v_override_start_time
                OR v_slot_start_local::time >= v_override_end_time
            ) THEN
                v_slot_start_local := v_slot_start_local + interval '30 minutes';
                CONTINUE;
            END IF;
        END IF;

        v_slot_start_customer_tz := v_slot_start_utc;
        v_slot_end_customer_tz := v_slot_end_utc;

        RETURN QUERY
        SELECT
            v_slot_start_utc,
            v_slot_end_utc,
            v_slot_start_customer_tz,
            v_slot_end_customer_tz,
            to_char(v_slot_start_utc AT TIME ZONE p_customer_timezone, 'HH12:MI AM') AS slot_display,
            CASE
                -- Check confirmed bookings (any service)
                WHEN EXISTS (
                    SELECT 1 FROM public.bookings b
                    WHERE b.stylist_user_id = p_stylist_id
                      AND b.status IN ('confirmed', 'in_progress', 'pending')
                      AND tstzrange(
                        b.start_time - interval '30 minutes',
                        b.end_time + interval '30 minutes',
                        '[)'
                      ) && tstzrange(v_slot_start_utc, v_slot_end_utc, '[)')
                ) THEN 'booked'
                -- 🔒 CRITICAL FIX: Check reservations for ANY service (stylist is busy!)
                -- Removed: AND br.service_id = p_service_id
                WHEN EXISTS (
                    SELECT 1 FROM public.booking_reservations br
                    WHERE br.stylist_user_id = p_stylist_id
                      -- DO NOT filter by service_id! Stylist busy = all services blocked
                      AND br.status = 'reserved'
                      AND br.expires_at > now()
                      AND tstzrange(
                        br.start_time - interval '30 minutes',
                        br.end_time + interval '30 minutes',
                        '[)'
                      ) && tstzrange(v_slot_start_utc, v_slot_end_utc, '[)')
                ) THEN 'reserved'
                ELSE 'available'
            END AS status,
            v_service_price;

        v_slot_start_local := v_slot_start_local + interval '30 minutes';
    END LOOP;
END;
$$;


ALTER FUNCTION "public"."get_available_slots"("p_stylist_id" "uuid", "p_service_id" "uuid", "p_target_date" "date", "p_customer_timezone" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_available_slots"("p_stylist_id" "uuid", "p_service_id" "uuid", "p_target_date" "date", "p_customer_timezone" "text") IS 'V8: Fixed critical bug - reservation check now applies to ALL services (stylist busy = all services blocked), not just the specific service being checked.';



CREATE OR REPLACE FUNCTION "public"."get_available_slots_v2"("p_stylist_id" "uuid", "p_service_id" "uuid", "p_target_date" "date", "p_customer_timezone" "text" DEFAULT 'Asia/Kathmandu'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'private', 'pg_temp'
    AS $$
DECLARE
  v_cached_slots JSONB;
  v_cached_at TIMESTAMPTZ;
  v_computed_slots JSONB;
BEGIN
  -- Step 1: Check cache (only if not expired)
  SELECT 
    available_slots,
    computed_at
  INTO 
    v_cached_slots,
    v_cached_at
  FROM private.availability_cache
  WHERE stylist_user_id = p_stylist_id
    AND service_id = p_service_id
    AND cache_date = p_target_date
    AND expires_at > NOW();

  -- Step 2: Cache hit - return cached data
  IF v_cached_slots IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'slots', v_cached_slots,
      'cached', true,
      'computed_at', v_cached_at,
      'cache_hit', true
    );
  END IF;

  -- Step 3: Cache miss - compute fresh data using existing function
  SELECT jsonb_agg(
    jsonb_build_object(
      'slot_start_utc', slot_start_utc,
      'slot_end_utc', slot_end_utc,
      'slot_start_local', slot_start_local,
      'slot_end_local', slot_end_local,
      'slot_display', slot_display,
      'status', status,
      'price_cents', price_cents
    )
  )
  INTO v_computed_slots
  FROM public.get_available_slots(
    p_stylist_id,
    p_service_id,
    p_target_date,
    p_customer_timezone
  );

  -- Step 4: Store in cache with 5-minute TTL
  -- CRITICAL: Use ON CONFLICT to handle race conditions
  INSERT INTO private.availability_cache (
    stylist_user_id,
    service_id,
    cache_date,
    available_slots,
    computed_at,
    expires_at
  )
  VALUES (
    p_stylist_id,
    p_service_id,
    p_target_date,
    COALESCE(v_computed_slots, '[]'::jsonb),
    NOW(),
    NOW() + INTERVAL '5 minutes'
  )
  ON CONFLICT (stylist_user_id, service_id, cache_date)
  DO UPDATE SET
    available_slots = COALESCE(v_computed_slots, '[]'::jsonb),
    computed_at = NOW(),
    expires_at = NOW() + INTERVAL '5 minutes';

  -- Step 5: Return computed data
  RETURN jsonb_build_object(
    'success', true,
    'slots', COALESCE(v_computed_slots, '[]'::jsonb),
    'cached', false,
    'computed_at', NOW(),
    'cache_hit', false
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM,
    'code', 'INTERNAL_ERROR'
  );
END;
$$;


ALTER FUNCTION "public"."get_available_slots_v2"("p_stylist_id" "uuid", "p_service_id" "uuid", "p_target_date" "date", "p_customer_timezone" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_available_slots_v2"("p_stylist_id" "uuid", "p_service_id" "uuid", "p_target_date" "date", "p_customer_timezone" "text") IS 'Cache-first availability lookup. Returns cached slots if available (2ms), otherwise computes fresh (145ms) and caches for 5 minutes. 72x performance improvement. ON CONFLICT handles race conditions.';



CREATE OR REPLACE FUNCTION "public"."get_cart_details_secure"("p_user_id" "uuid" DEFAULT NULL::"uuid", "p_guest_token" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_cart_id UUID;
  v_result JSONB;
BEGIN
  v_cart_id := public.get_or_create_cart_secure(p_user_id, p_guest_token);

  SELECT jsonb_build_object(
    'id', c.id,
    'user_id', c.user_id,
    'session_id', c.session_id,
    'items', COALESCE((
      SELECT jsonb_agg(item_data ORDER BY item_created_at DESC)
      FROM (
        SELECT 
          jsonb_build_object(
            'id', ci.id,
            'variant_id', ci.variant_id,
            'quantity', ci.quantity,
            'price_snapshot', ci.price_snapshot,
            'variant_sku', pv.sku,
            'product_name', p.name,
            'product_image', (
              SELECT pi.image_url 
              FROM product_images pi 
              WHERE pi.product_id = p.id 
                AND pi.is_primary = true 
              LIMIT 1
            ),
            'variant_attributes', (
              SELECT jsonb_agg(jsonb_build_object(
                'name', pa.name,
                'value', pav.value,
                'color_hex', pav.color_hex,
                'display_order', pa.sort_order
              ) ORDER BY pa.sort_order)
              FROM variant_attribute_values vav
              JOIN attribute_values pav ON vav.attribute_value_id = pav.id
              JOIN product_attributes pa ON pav.attribute_id = pa.id
              WHERE vav.variant_id = pv.id
            ),
            'product', jsonb_build_object(
              'id', p.id,
              'name', p.name,
              'slug', p.slug,
              'vendor_id', p.vendor_id
            ),
            'inventory', jsonb_build_object(
              'quantity_available', COALESCE(inv.quantity_available, 0),
              'quantity_reserved', COALESCE(inv.quantity_reserved, 0)
            ),
            'current_price', pv.price,
            'combo_group_id', ci.combo_group_id,
            'combo_id', ci.combo_id,
            'combo_name', (SELECT comb.name FROM products comb WHERE comb.id = ci.combo_id),
            'combo', CASE 
              WHEN ci.combo_id IS NOT NULL THEN (
                SELECT jsonb_build_object(
                  'id', comb.id,
                  'name', comb.name,
                  'combo_price_cents', comb.combo_price_cents,
                  'combo_savings_cents', comb.combo_savings_cents,
                  'combo_quantity_limit', comb.combo_quantity_limit,
                  'combo_quantity_sold', comb.combo_quantity_sold
                )
                FROM products comb
                WHERE comb.id = ci.combo_id
              )
              ELSE NULL
            END
          ) as item_data,
          ci.created_at as item_created_at
        FROM cart_items ci
        JOIN product_variants pv ON pv.id = ci.variant_id
        JOIN products p ON p.id = pv.product_id
        LEFT JOIN (
          SELECT 
            variant_id,
            SUM(quantity_available) as quantity_available,
            SUM(quantity_reserved) as quantity_reserved
          FROM inventory
          GROUP BY variant_id
        ) inv ON inv.variant_id = pv.id
        WHERE ci.cart_id = c.id
      ) AS item_rows
    ), '[]'::jsonb),
    'subtotal', COALESCE((
      SELECT SUM(ci.quantity * COALESCE(ci.price_snapshot, pv.price))
      FROM cart_items ci JOIN product_variants pv ON pv.id = ci.variant_id
      WHERE ci.cart_id = c.id
    ), 0),
    'item_count', COALESCE((
      SELECT SUM(ci.quantity) FROM cart_items ci WHERE ci.cart_id = c.id
    ), 0),
    'combo_groups', COALESCE((
      SELECT jsonb_agg(combo_data)
      FROM (
        SELECT DISTINCT ON (ci.combo_group_id)
          jsonb_build_object(
            'combo_group_id', ci.combo_group_id,
            'combo_id', ci.combo_id,
            'combo_name', (SELECT name FROM products WHERE id = ci.combo_id),
            'item_count', (
              SELECT COUNT(*) 
              FROM cart_items ci2
              WHERE ci2.combo_group_id = ci.combo_group_id AND ci2.cart_id = c.id
            ),
            'combo_price_cents', (
              SELECT combo_price_cents FROM products WHERE id = ci.combo_id
            ),
            'combo_savings_cents', (
              SELECT combo_savings_cents FROM products WHERE id = ci.combo_id
            )
          ) as combo_data
        FROM cart_items ci
        WHERE ci.cart_id = c.id AND ci.combo_group_id IS NOT NULL
      ) AS combo_rows
    ), '[]'::jsonb)
  )
  INTO v_result
  FROM carts c
  WHERE c.id = v_cart_id;

  RETURN v_result;
END;
$$;


ALTER FUNCTION "public"."get_cart_details_secure"("p_user_id" "uuid", "p_guest_token" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_cart_details_secure"("p_user_id" "uuid", "p_guest_token" "text") IS 'Returns cart details with cart_items.id field for precise removal, variant attributes, product images, and combo information.';



CREATE OR REPLACE FUNCTION "public"."get_combo_availability"("p_combo_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_combo RECORD;
  v_min_available INTEGER := 999999;
  v_combo_remaining INTEGER;
  v_item RECORD;
  v_limiting_factor TEXT := 'none';
BEGIN
  -- Get combo details
  SELECT * INTO v_combo FROM products WHERE id = p_combo_id AND is_combo = true;
  
  IF v_combo IS NULL THEN
    RETURN jsonb_build_object(
      'available', false, 
      'max_quantity', 0, 
      'reason', 'Combo not found'
    );
  END IF;
  
  IF NOT v_combo.is_active THEN
    RETURN jsonb_build_object(
      'available', false, 
      'max_quantity', 0, 
      'reason', 'Combo is inactive'
    );
  END IF;
  
  -- Check combo-specific limit first
  IF v_combo.combo_quantity_limit IS NOT NULL THEN
    v_combo_remaining := v_combo.combo_quantity_limit - COALESCE(v_combo.combo_quantity_sold, 0);
    IF v_combo_remaining <= 0 THEN
      RETURN jsonb_build_object(
        'available', false, 
        'max_quantity', 0, 
        'reason', 'Combo sold out',
        'combo_limit', v_combo.combo_quantity_limit,
        'combo_sold', v_combo.combo_quantity_sold
      );
    END IF;
    v_min_available := v_combo_remaining;
    v_limiting_factor := 'combo_limit';
  END IF;
  
  -- Check constituent inventory
  FOR v_item IN 
    SELECT 
      ci.quantity as required_qty, 
      COALESCE(i.quantity_available, 0) as available_qty,
      p.name as product_name
    FROM combo_items ci
    JOIN products p ON ci.constituent_product_id = p.id
    LEFT JOIN inventory i ON i.variant_id = ci.constituent_variant_id
    WHERE ci.combo_product_id = p_combo_id
  LOOP
    IF v_item.available_qty < v_item.required_qty THEN
      RETURN jsonb_build_object(
        'available', false, 
        'max_quantity', 0, 
        'reason', 'Insufficient inventory for ' || v_item.product_name,
        'combo_limit', v_combo.combo_quantity_limit,
        'combo_sold', v_combo.combo_quantity_sold
      );
    END IF;
    
    -- Calculate how many combos can be made from this item's inventory
    IF FLOOR(v_item.available_qty::NUMERIC / v_item.required_qty) < v_min_available THEN
      v_min_available := FLOOR(v_item.available_qty::NUMERIC / v_item.required_qty);
      v_limiting_factor := 'inventory:' || v_item.product_name;
    END IF;
  END LOOP;
  
  RETURN jsonb_build_object(
    'available', v_min_available > 0,
    'max_quantity', GREATEST(0, v_min_available),
    'combo_limit', v_combo.combo_quantity_limit,
    'combo_sold', v_combo.combo_quantity_sold,
    'limiting_factor', v_limiting_factor
  );
END;
$$;


ALTER FUNCTION "public"."get_combo_availability"("p_combo_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_combo_availability"("p_combo_id" "uuid") IS 'Returns combo availability based on combo limit and constituent inventory';



CREATE OR REPLACE FUNCTION "public"."get_customer_safety_details"("p_stylist_id" "uuid", "p_booking_id" "uuid", "p_reason" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'private', 'auth', 'pg_temp'
    AS $$
DECLARE
  v_booking RECORD;
BEGIN
  IF NOT public.user_has_role(p_stylist_id, 'stylist') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Unauthorized: Stylist role required',
      'code', 'UNAUTHORIZED'
    );
  END IF;

  SELECT 
    b.id,
    b.customer_user_id,
    b.stylist_user_id,
    b.metadata,
    b.start_time
  INTO v_booking
  FROM public.bookings b
  WHERE b.id = p_booking_id
    AND b.stylist_user_id = p_stylist_id;
  
  IF v_booking IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Booking not found or access denied',
      'code', 'NOT_FOUND'
    );
  END IF;

  IF p_reason IS NULL OR LENGTH(TRIM(p_reason)) < 10 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Access reason required (minimum 10 characters)',
      'code', 'INVALID_REASON'
    );
  END IF;

  INSERT INTO private.customer_data_access_log (
    stylist_user_id,
    booking_id,
    customer_user_id,
    data_type,
    access_reason,
    accessed_at,
    ip_address,
    user_agent
  ) VALUES (
    p_stylist_id,
    p_booking_id,
    v_booking.customer_user_id,
    'allergy_details',
    p_reason,
    NOW(),
    inet_client_addr(),
    current_setting('request.headers', true)::json->>'user-agent'
  );

  RETURN jsonb_build_object(
    'success', true,
    'data', jsonb_build_object(
      'allergies', v_booking.metadata->>'allergies',
      'safetyNotes', v_booking.metadata->>'safety_notes',
      'bookingDate', v_booking.start_time
    ),
    'auditLogged', true,
    'message', 'Access logged for compliance'
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM,
    'code', 'INTERNAL_ERROR'
  );
END;
$$;


ALTER FUNCTION "public"."get_customer_safety_details"("p_stylist_id" "uuid", "p_booking_id" "uuid", "p_reason" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_customer_safety_details"("p_stylist_id" "uuid", "p_booking_id" "uuid", "p_reason" "text") IS 'Provides access to customer PII (allergies, safety notes) with full audit trail. Every access logged to customer_data_access_log per GDPR Article 30. Requires reason for access. SECURITY DEFINER with role verification and ownership checks.';



CREATE OR REPLACE FUNCTION "public"."get_effective_schedule"("p_stylist_id" "uuid", "p_target_date" "date") RETURNS TABLE("schedule_source" "text", "start_time" time without time zone, "end_time" time without time zone, "is_closed" boolean, "priority" integer, "reason" "text")
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'public', 'private', 'pg_temp'
    AS $$
DECLARE
  v_day_of_week INTEGER;
  v_highest_priority_override RECORD;
BEGIN
  -- Calculate day of week (0 = Sunday, 6 = Saturday)
  v_day_of_week := EXTRACT(DOW FROM p_target_date)::INTEGER;

  -- Step 1: Check for overrides (business closures and stylist-specific)
  -- Priority order: business_closure (highest) > stylist_vacation > seasonal_hours > special_event
  SELECT 
    override_type,
    override_start_time,
    override_end_time,
    is_closed,
    priority,
    reason
  INTO v_highest_priority_override
  FROM public.schedule_overrides
  WHERE (
    (applies_to_all_stylists = TRUE) OR 
    (applies_to_all_stylists = FALSE AND stylist_user_id = p_stylist_id)
  )
  AND p_target_date BETWEEN start_date AND end_date
  ORDER BY 
    -- Business closures take precedence
    CASE 
      WHEN override_type = 'business_closure' THEN 1000
      WHEN override_type = 'stylist_vacation' THEN 900
      WHEN override_type = 'seasonal_hours' THEN 800
      WHEN override_type = 'special_event' THEN 700
      ELSE priority
    END DESC,
    priority DESC,
    created_at DESC -- CRITICAL: Tiebreaker for deterministic ordering
  LIMIT 1;

  -- Step 2: If override exists, return it
  IF v_highest_priority_override IS NOT NULL THEN
    RETURN QUERY SELECT
      v_highest_priority_override.override_type::TEXT AS schedule_source,
      v_highest_priority_override.override_start_time AS start_time,
      v_highest_priority_override.override_end_time AS end_time,
      v_highest_priority_override.is_closed AS is_closed,
      CASE 
        WHEN v_highest_priority_override.override_type = 'business_closure' THEN 1000
        WHEN v_highest_priority_override.override_type = 'stylist_vacation' THEN 900
        WHEN v_highest_priority_override.override_type = 'seasonal_hours' THEN 800
        WHEN v_highest_priority_override.override_type = 'special_event' THEN 700
        ELSE v_highest_priority_override.priority
      END AS priority,
      v_highest_priority_override.reason AS reason;
    RETURN;
  END IF;

  -- Step 3: No override - return base schedule
  RETURN QUERY
  SELECT
    'base_schedule'::TEXT AS schedule_source,
    s.start_time_local AS start_time,
    s.end_time_local AS end_time,
    FALSE AS is_closed,
    0 AS priority,
    NULL::TEXT AS reason
  FROM public.stylist_schedules s
  WHERE s.stylist_user_id = p_stylist_id
    AND s.day_of_week = v_day_of_week
    AND s.is_active = TRUE
    AND (s.effective_from IS NULL OR s.effective_from <= p_target_date)
    AND (s.effective_until IS NULL OR s.effective_until >= p_target_date)
  ORDER BY s.created_at DESC
  LIMIT 1;

  -- If no base schedule found, return closed
  IF NOT FOUND THEN
    RETURN QUERY SELECT
      'no_schedule'::TEXT AS schedule_source,
      NULL::TIME AS start_time,
      NULL::TIME AS end_time,
      TRUE AS is_closed,
      -1 AS priority,
      'No schedule defined for this day'::TEXT AS reason;
  END IF;

  RETURN;
END;
$$;


ALTER FUNCTION "public"."get_effective_schedule"("p_stylist_id" "uuid", "p_target_date" "date") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_effective_schedule"("p_stylist_id" "uuid", "p_target_date" "date") IS 'Resolves effective schedule for a stylist on a target date. Priority: business_closure (1000) > stylist_vacation (900) > seasonal_hours (800) > special_event (700) > base_schedule (0). Tiebreaker: created_at DESC.';



CREATE OR REPLACE FUNCTION "public"."get_featured_brands"("p_limit" integer DEFAULT 6) RETURNS TABLE("brand_id" "uuid", "brand_name" "text", "brand_slug" "text", "logo_url" "text", "product_count" bigint)
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
    RETURN QUERY
    SELECT 
        b.id as brand_id,
        b.name::TEXT as brand_name,
        b.slug::TEXT as brand_slug,
        b.logo_url::TEXT,
        COUNT(p.id) as product_count
    FROM public.brands b
    LEFT JOIN public.products p ON b.id = p.brand_id AND p.is_active = TRUE
    WHERE b.is_featured = TRUE
      AND b.is_active = TRUE
    GROUP BY b.id, b.name, b.slug, b.logo_url
    HAVING COUNT(p.id) > 0
    ORDER BY COUNT(p.id) DESC
    LIMIT p_limit;
END;
$$;


ALTER FUNCTION "public"."get_featured_brands"("p_limit" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_featured_brands"("p_limit" integer) IS 'Fetch featured brands with active product counts. Only brands with at least 1 active product are shown.';



CREATE OR REPLACE FUNCTION "public"."get_featured_stylists"("p_limit" integer DEFAULT 6) RETURNS TABLE("stylist_id" "uuid", "display_name" "text", "title" "text", "bio" "text", "years_experience" integer, "specialties" "text"[], "rating_average" numeric, "total_bookings" integer, "avatar_url" "text", "featured_at" timestamp with time zone)
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
    RETURN QUERY
    SELECT 
        sp.user_id as stylist_id,
        sp.display_name,
        sp.title,
        sp.bio,
        sp.years_experience,
        sp.specialties,
        sp.rating_average,
        sp.total_bookings,
        up.avatar_url,
        sp.featured_at
    FROM public.stylist_profiles sp
    LEFT JOIN public.user_profiles up ON sp.user_id = up.id
    WHERE sp.is_featured = TRUE
      AND sp.is_active = TRUE
    ORDER BY 
        sp.total_bookings DESC NULLS LAST, 
        sp.rating_average DESC NULLS LAST,
        sp.featured_at DESC NULLS LAST
    LIMIT p_limit;
END;
$$;


ALTER FUNCTION "public"."get_featured_stylists"("p_limit" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_featured_stylists"("p_limit" integer) IS 'Returns featured stylists for homepage display. Uses SECURITY INVOKER (respects RLS if enabled). Joins with user_profiles for avatar_url.';



CREATE OR REPLACE FUNCTION "public"."get_guest_token_secure"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_token TEXT;
BEGIN
  -- Generate a new cryptographically secure token
  v_token := generate_guest_token();
  
  RETURN jsonb_build_object(
    'success', true,
    'guest_token', v_token,
    'expires_at', (NOW() + INTERVAL '30 days'),
    'token_format', 'guest_<base64>'
  );
END;
$$;


ALTER FUNCTION "public"."get_guest_token_secure"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_guest_token_secure"() IS 'Security Fix (2025-10-18): Public RPC to issue server-generated guest tokens. 
Replaces client-side UUID generation. CJ-SEC-001 resolved.';



CREATE OR REPLACE FUNCTION "public"."get_or_create_cart_secure"("p_user_id" "uuid" DEFAULT NULL::"uuid", "p_guest_token" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_cart_id UUID;
  v_sid TEXT;
BEGIN
  -- Priority 1: Authenticated user cart
  IF p_user_id IS NOT NULL THEN
    SELECT id INTO v_cart_id FROM carts WHERE user_id = p_user_id;
    IF v_cart_id IS NOT NULL THEN
      RETURN v_cart_id;
    END IF;
    
    -- Create new user cart
    INSERT INTO carts (user_id) VALUES (p_user_id)
    RETURNING id INTO v_cart_id;
    RETURN v_cart_id;
  END IF;
  
  -- Priority 2: Guest cart with token
  IF p_guest_token IS NOT NULL THEN
    -- Support both old (UUID) and new (guest_*) token formats
    IF p_guest_token LIKE 'guest_%' THEN
      -- New secure format - use directly
      v_sid := p_guest_token;
    ELSE
      -- Old UUID format - still supported for backwards compatibility
      -- But we should encourage migration to new format
      v_sid := p_guest_token;
    END IF;
    
    SELECT id INTO v_cart_id FROM carts WHERE session_id = v_sid;
    IF v_cart_id IS NOT NULL THEN
      RETURN v_cart_id;
    END IF;
    
    -- Create new guest cart with provided token
    INSERT INTO carts (session_id) VALUES (v_sid)
    RETURNING id INTO v_cart_id;
    RETURN v_cart_id;
  END IF;
  
  -- Fallback: No user_id and no guest_token
  -- This should not happen in normal flow
  RAISE EXCEPTION 'Cannot create cart without user_id or guest_token';
END;
$$;


ALTER FUNCTION "public"."get_or_create_cart_secure"("p_user_id" "uuid", "p_guest_token" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_or_create_cart_secure"("p_user_id" "uuid", "p_guest_token" "text") IS 'Security Fix (2025-10-18): Updated to support both old UUID and new guest_ token formats for backwards compatibility during migration.';



CREATE OR REPLACE FUNCTION "public"."get_order_items_with_vendor"("p_order_id" "uuid") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN (
    SELECT json_agg(
      json_build_object(
        'quantity', oi.quantity,
        'unit_price_cents', oi.unit_price_cents,
        'total_price_cents', oi.total_price_cents,
        'product_name', oi.product_name,
        'variant_sku', oi.variant_sku,
        'fulfillment_status', oi.fulfillment_status,
        'tracking_number', oi.tracking_number,
        'shipping_carrier', oi.shipping_carrier,
        'vendor', json_build_object(
          'business_name', vp.business_name,
          'user', json_build_object(
            'email', COALESCE(vp.contact_email, u.email),
            'phone', COALESCE(vp.contact_phone, u.phone)
          )
        )
      )
    )
    FROM order_items oi
    LEFT JOIN vendor_profiles vp ON vp.user_id = oi.vendor_id
    LEFT JOIN auth.users u ON u.id = oi.vendor_id
    WHERE oi.order_id = p_order_id
  );
END;
$$;


ALTER FUNCTION "public"."get_order_items_with_vendor"("p_order_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_order_items_with_vendor"("p_order_id" "uuid") IS 'Get order items with vendor contact information. Prefers contact_email/contact_phone from vendor_profiles (application data) over auth.users data.';



CREATE OR REPLACE FUNCTION "public"."get_product_recommendations"("p_source_product_id" "uuid", "p_limit" integer DEFAULT 4) RETURNS TABLE("recommendation_id" "uuid", "product_id" "uuid", "product_name" "text", "product_slug" "text", "min_price" integer, "display_order" integer, "in_stock" boolean)
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
    RETURN QUERY
    SELECT 
        r.id,
        p.id,
        CAST(p.name AS TEXT),
        CAST(p.slug AS TEXT),
        CAST(MIN(pv.price) AS INTEGER),
        r.display_order,
        CASE 
            WHEN SUM(inv.quantity_available) > 0 THEN TRUE 
            ELSE FALSE 
        END
    FROM public.product_recommendations r
    JOIN public.products p ON r.recommended_product_id = p.id
    JOIN public.product_variants pv ON p.id = pv.product_id AND pv.is_active = TRUE
    LEFT JOIN public.inventory inv ON pv.id = inv.variant_id
    WHERE r.source_product_id = p_source_product_id
      AND p.is_active = TRUE
      AND EXISTS (
          SELECT 1 FROM public.inventory i
          JOIN public.product_variants v ON i.variant_id = v.id
          WHERE v.product_id = p.id AND i.quantity_available > 0
      )
    GROUP BY r.id, p.id, p.name, p.slug, r.display_order
    ORDER BY r.display_order, r.click_count DESC
    LIMIT p_limit;
END;
$$;


ALTER FUNCTION "public"."get_product_recommendations"("p_source_product_id" "uuid", "p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_product_with_variants"("product_slug" "text") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  product_data JSON;
  variants_data JSON;
  images_data JSON;
  inventory_data JSON;
  combo_items_data JSON;
  v_product_id UUID;
  v_is_combo BOOLEAN;
BEGIN
  -- Get main product data with vendor and category info (including combo fields)
  SELECT 
    (p.id)::text,
    p.is_combo,
    json_build_object(
      'id', p.id,
      'slug', p.slug,
      'name', p.name,
      'description', p.description,
      'short_description', p.short_description,
      'material', p.material,
      'care_instructions', p.care_instructions,
      'country_of_origin', p.country_of_origin,
      'is_active', p.is_active,
      'is_featured', p.is_featured,
      'vendor_id', p.vendor_id,
      'category_id', p.category_id,
      'created_at', p.created_at,
      'updated_at', p.updated_at,
      -- Combo-specific fields
      'is_combo', p.is_combo,
      'combo_price_cents', p.combo_price_cents,
      'combo_savings_cents', p.combo_savings_cents,
      'combo_quantity_limit', p.combo_quantity_limit,
      'combo_quantity_sold', p.combo_quantity_sold,
      'vendor', json_build_object(
        'id', up.id,
        'display_name', up.display_name,
        'username', up.username,
        'is_verified', up.is_verified
      ),
      'category', json_build_object(
        'id', c.id,
        'name', c.name,
        'slug', c.slug
      )
    )
  INTO v_product_id, v_is_combo, product_data
  FROM products p
  LEFT JOIN user_profiles up ON p.vendor_id = up.id
  LEFT JOIN categories c ON p.category_id = c.id
  WHERE p.slug = product_slug AND p.is_active = true;

  -- Return null if product not found
  IF product_data IS NULL THEN
    RETURN NULL;
  END IF;

  -- Get all variants with their attributes
  SELECT json_agg(
    json_build_object(
      'id', pv.id,
      'sku', pv.sku,
      'barcode', pv.barcode,
      'price', pv.price,
      'compare_at_price', pv.compare_at_price,
      'cost_price', pv.cost_price,
      'weight_grams', pv.weight_grams,
      'dimensions_cm', pv.dimensions_cm,
      'is_active', pv.is_active,
      'attributes', COALESCE(variant_attrs.attributes, '{}'::json),
      'created_at', pv.created_at,
      'updated_at', pv.updated_at
    )
  ) INTO variants_data
  FROM product_variants pv
  LEFT JOIN (
    SELECT 
      vav.variant_id,
      json_object_agg(pa.display_name, av.display_value) as attributes
    FROM variant_attribute_values vav
    JOIN attribute_values av ON vav.attribute_value_id = av.id
    JOIN product_attributes pa ON av.attribute_id = pa.id
    GROUP BY vav.variant_id
  ) variant_attrs ON pv.id = variant_attrs.variant_id
  WHERE pv.product_id = v_product_id::uuid 
    AND pv.is_active = true;

  -- Get all product images (both product-level and variant-level)
  SELECT json_agg(
    json_build_object(
      'id', pi.id,
      'image_url', pi.image_url,
      'alt_text', pi.alt_text,
      'sort_order', pi.sort_order,
      'is_primary', pi.is_primary,
      'variant_id', pi.variant_id,
      'created_at', pi.created_at
    ) ORDER BY pi.sort_order, pi.created_at
  ) INTO images_data
  FROM product_images pi
  WHERE pi.product_id = v_product_id::uuid;

  -- Get inventory data for all variants
  SELECT json_object_agg(
    pv.id::text,
    json_build_object(
      'quantity_available', COALESCE(i.quantity_available, 0),
      'quantity_reserved', COALESCE(i.quantity_reserved, 0),
      'quantity_incoming', COALESCE(i.quantity_incoming, 0),
      'location_id', i.location_id
    )
  ) INTO inventory_data
  FROM product_variants pv
  LEFT JOIN inventory i ON pv.id = i.variant_id
  WHERE pv.product_id = v_product_id::uuid;

  -- If this is a combo, get combo items with constituent product/variant data
  IF v_is_combo THEN
    SELECT json_agg(
      json_build_object(
        'id', ci.id,
        'combo_product_id', ci.combo_product_id,
        'constituent_product_id', ci.constituent_product_id,
        'constituent_variant_id', ci.constituent_variant_id,
        'quantity', ci.quantity,
        'display_order', ci.display_order,
        'product', json_build_object(
          'id', cp.id,
          'name', cp.name,
          'slug', cp.slug,
          'description', cp.description,
          'images', (
            SELECT json_agg(
              json_build_object(
                'url', cpi.image_url,
                'alt', cpi.alt_text
              ) ORDER BY cpi.sort_order
            )
            FROM product_images cpi
            WHERE cpi.product_id = cp.id
          )
        ),
        'variant', json_build_object(
          'id', cpv.id,
          'sku', cpv.sku,
          'price', cpv.price,
          'options', COALESCE(
            (SELECT json_object_agg(pa.display_name, av.display_value)
             FROM variant_attribute_values vav
             JOIN attribute_values av ON vav.attribute_value_id = av.id
             JOIN product_attributes pa ON av.attribute_id = pa.id
             WHERE vav.variant_id = cpv.id),
            '{}'::json
          )
        )
      ) ORDER BY ci.display_order
    ) INTO combo_items_data
    FROM combo_items ci
    JOIN products cp ON ci.constituent_product_id = cp.id
    JOIN product_variants cpv ON ci.constituent_variant_id = cpv.id
    WHERE ci.combo_product_id = v_product_id::uuid;
  END IF;

  -- Return the complete product data structure
  RETURN json_build_object(
    'product', product_data,
    'variants', COALESCE(variants_data, '[]'::json),
    'images', COALESCE(images_data, '[]'::json),
    'inventory', COALESCE(inventory_data, '{}'::json),
    'combo_items', COALESCE(combo_items_data, '[]'::json)
  );
END;
$$;


ALTER FUNCTION "public"."get_product_with_variants"("product_slug" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_product_with_variants"("product_slug" "text") IS 'Fetches product with variants, images, inventory, and combo items (if combo)';



CREATE OR REPLACE FUNCTION "public"."get_promotion_by_user"("p_user_id" "uuid", "p_admin_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  RETURN private.get_promotion_by_user(p_user_id, p_admin_id);
END;
$$;


ALTER FUNCTION "public"."get_promotion_by_user"("p_user_id" "uuid", "p_admin_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_promotion_by_user"("p_user_id" "uuid", "p_admin_id" "uuid") IS 'Public wrapper for private.get_promotion_by_user. Allows admin to fetch existing promotion for resume.';



CREATE OR REPLACE FUNCTION "public"."get_review_vote_counts"("p_review_id" "uuid") RETURNS TABLE("helpful_count" bigint, "unhelpful_count" bigint)
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'public'
    AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COALESCE(SUM(rvs.helpful_count), 0) AS helpful_count,
        COALESCE(SUM(rvs.unhelpful_count), 0) AS unhelpful_count
    FROM public.review_vote_shards rvs
    WHERE rvs.review_id = p_review_id;
END;
$$;


ALTER FUNCTION "public"."get_review_vote_counts"("p_review_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_service_duration"("p_stylist_id" "uuid", "p_service_id" "uuid") RETURNS integer
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
    v_duration INTEGER;
BEGIN
    -- First check for custom duration in stylist_services
    SELECT 
        COALESCE(ss.custom_duration_minutes, s.duration_minutes)
    INTO v_duration
    FROM services s
    LEFT JOIN stylist_services ss ON 
        ss.service_id = s.id AND 
        ss.stylist_user_id = p_stylist_id AND
        ss.is_available = TRUE
    WHERE s.id = p_service_id
        AND s.is_active = TRUE;
    
    IF v_duration IS NULL THEN
        RAISE EXCEPTION 'Service % not found or not available', p_service_id;
    END IF;
    
    RETURN v_duration;
END;
$$;


ALTER FUNCTION "public"."get_service_duration"("p_stylist_id" "uuid", "p_service_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_service_price"("p_stylist_id" "uuid", "p_service_id" "uuid") RETURNS integer
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
    v_price INTEGER;
BEGIN
    -- Get base price from services table
    SELECT base_price_cents INTO v_price
    FROM services
    WHERE id = p_service_id AND is_active = TRUE;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Service not found or inactive';
    END IF;
    
    -- TODO: In future, check stylist-specific pricing overrides
    -- For now, just return the base price
    RETURN v_price;
END;
$$;


ALTER FUNCTION "public"."get_service_price"("p_stylist_id" "uuid", "p_service_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_stylist_bookings"("p_stylist_id" "uuid", "p_start_date" timestamp with time zone DEFAULT "now"(), "p_end_date" timestamp with time zone DEFAULT ("now"() + '30 days'::interval)) RETURNS TABLE("booking_id" "uuid", "customer_name" "text", "service_name" "text", "start_time" timestamp with time zone, "end_time" timestamp with time zone, "status" "text", "price_cents" integer)
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
    RETURN QUERY
    SELECT 
        b.id AS booking_id,
        b.customer_name,
        s.name AS service_name,
        b.start_time,
        b.end_time,
        b.status,
        b.price_cents
    FROM bookings b
    JOIN services s ON s.id = b.service_id
    WHERE b.stylist_user_id = p_stylist_id
        AND b.start_time >= p_start_date
        AND b.start_time <= p_end_date
        AND b.status NOT IN ('cancelled')
    ORDER BY b.start_time;
END;
$$;


ALTER FUNCTION "public"."get_stylist_bookings"("p_stylist_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_stylist_bookings_with_history"("p_stylist_id" "uuid", "p_start_date" timestamp with time zone DEFAULT "now"(), "p_end_date" timestamp with time zone DEFAULT ("now"() + '30 days'::interval)) RETURNS TABLE("booking_id" "uuid", "customer_user_id" "uuid", "customer_name" "text", "customer_phone" "text", "customer_email" "text", "customer_notes" "text", "service_id" "uuid", "service_name" "text", "service_duration" integer, "start_time" timestamp with time zone, "end_time" timestamp with time zone, "status" "text", "price_cents" integer, "is_repeat_customer" boolean, "total_bookings_count" bigint, "last_visit_date" timestamp with time zone, "last_service_name" "text", "has_allergies" boolean, "allergy_summary" "text", "has_safety_notes" boolean)
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  RETURN QUERY
  WITH customer_history AS (
    SELECT 
      b.customer_user_id,
      COUNT(*) as total_bookings,
      MAX(b.start_time) FILTER (
        WHERE b.status IN ('confirmed', 'completed') 
        AND b.start_time < NOW()
      ) as last_visit,
      MAX(s.name) FILTER (
        WHERE b.start_time = (
          SELECT MAX(b2.start_time) 
          FROM public.bookings b2 
          WHERE b2.customer_user_id = b.customer_user_id 
            AND b2.stylist_user_id = p_stylist_id
            AND b2.status IN ('confirmed', 'completed')
            AND b2.start_time < NOW()
        )
      ) as last_service
    FROM public.bookings b
    LEFT JOIN public.services s ON b.service_id = s.id
    WHERE b.stylist_user_id = p_stylist_id
      AND b.status IN ('confirmed', 'completed')
    GROUP BY b.customer_user_id
  )
  SELECT 
    b.id as booking_id,
    b.customer_user_id,
    b.customer_name,
    b.customer_phone,
    b.customer_email,
    b.customer_notes,
    b.service_id,
    s.name as service_name,
    s.duration_minutes as service_duration,
    b.start_time,
    b.end_time,
    b.status,
    b.price_cents,
    (COALESCE(ch.total_bookings, 0) > 1) as is_repeat_customer,
    COALESCE(ch.total_bookings, 0) as total_bookings_count,
    ch.last_visit as last_visit_date,
    ch.last_service as last_service_name,
    (b.metadata->>'allergies') IS NOT NULL as has_allergies,
    CASE 
      WHEN (b.metadata->>'allergies') IS NOT NULL 
      THEN '⚠️ Customer has documented allergies'
      ELSE NULL
    END as allergy_summary,
    (b.metadata->>'safety_notes') IS NOT NULL as has_safety_notes
  FROM public.bookings b
  LEFT JOIN public.services s ON b.service_id = s.id
  LEFT JOIN customer_history ch ON b.customer_user_id = ch.customer_user_id
  WHERE b.stylist_user_id = p_stylist_id
    AND b.start_time BETWEEN p_start_date AND p_end_date
    AND b.status IN ('confirmed', 'pending')
  ORDER BY b.start_time ASC;
END;
$$;


ALTER FUNCTION "public"."get_stylist_bookings_with_history"("p_stylist_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_stylist_ratings"("p_stylist_user_id" "uuid", "p_limit" integer DEFAULT 10, "p_offset" integer DEFAULT 0) RETURNS TABLE("id" "uuid", "rating" integer, "review_text" "text", "customer_name" "text", "customer_avatar" "text", "created_at" timestamp with time zone, "is_edited" boolean, "helpful_votes" integer, "unhelpful_votes" integer)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    sr.id,
    sr.rating,
    sr.review_text,
    up.display_name as customer_name,
    up.avatar_url as customer_avatar,
    sr.created_at,
    sr.is_edited,
    sr.helpful_votes,
    sr.unhelpful_votes
  FROM stylist_ratings sr
  JOIN user_profiles up ON up.id = sr.customer_user_id
  WHERE sr.stylist_user_id = p_stylist_user_id
    AND sr.is_approved = true
  ORDER BY sr.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;


ALTER FUNCTION "public"."get_stylist_ratings"("p_stylist_user_id" "uuid", "p_limit" integer, "p_offset" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_stylist_schedule"("p_stylist_id" "uuid", "p_start_date" "date", "p_end_date" "date") RETURNS TABLE("schedule_date" "date", "day_of_week" integer, "start_time_local" time without time zone, "end_time_local" time without time zone, "break_start" time without time zone, "break_end" time without time zone, "is_available" boolean)
    LANGUAGE "plpgsql" STABLE
    AS $$
BEGIN
    RETURN QUERY
    WITH date_series AS (
        SELECT generate_series(p_start_date, p_end_date, '1 day'::INTERVAL)::DATE AS schedule_date
    ),
    schedules AS (
        SELECT 
            ds.schedule_date,
            EXTRACT(DOW FROM ds.schedule_date)::INTEGER AS day_of_week,
            ss.start_time_local,
            ss.end_time_local,
            -- FIX: Use actual column names from table
            ss.break_start_time_utc AS break_start,
            ss.break_end_time_utc AS break_end,
            TRUE AS is_available
        FROM date_series ds
        LEFT JOIN stylist_schedules ss ON 
            ss.stylist_user_id = p_stylist_id AND
            ss.day_of_week = EXTRACT(DOW FROM ds.schedule_date) AND
            ss.is_active = TRUE AND
            (ss.effective_from IS NULL OR ss.effective_from <= ds.schedule_date) AND
            (ss.effective_until IS NULL OR ss.effective_until >= ds.schedule_date)
    )
    SELECT * FROM schedules
    ORDER BY schedule_date;
END;
$$;


ALTER FUNCTION "public"."get_stylist_schedule"("p_stylist_id" "uuid", "p_start_date" "date", "p_end_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_stylist_specialties"("p_stylist_user_id" "uuid") RETURNS TABLE("specialty_id" "uuid", "specialty_name" "text", "specialty_slug" "text", "specialty_category" "text", "specialty_icon" "text", "is_primary" boolean)
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
    RETURN QUERY
    SELECT
        st.id as specialty_id,
        st.name as specialty_name,
        st.slug as specialty_slug,
        st.category as specialty_category,
        st.icon as specialty_icon,
        ss.is_primary
    FROM public.stylist_specialties ss
    JOIN public.specialty_types st ON ss.specialty_type_id = st.id
    WHERE ss.stylist_user_id = p_stylist_user_id
      AND st.is_active = TRUE
    ORDER BY ss.is_primary DESC, ss.display_order ASC, st.name ASC;
END;
$$;


ALTER FUNCTION "public"."get_stylist_specialties"("p_stylist_user_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_stylist_specialties"("p_stylist_user_id" "uuid") IS 'Returns all active specialties for a given stylist, ordered by primary flag and display order';



CREATE OR REPLACE FUNCTION "public"."get_support_ticket_details"("p_ticket_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_user_id uuid;
  v_ticket record;
  v_messages jsonb;
  v_is_internal boolean;
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
        'is_internal', sm.is_internal,
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
      'category', v_ticket.category_name,
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


ALTER FUNCTION "public"."get_support_ticket_details"("p_ticket_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_top_stylists"("p_limit" integer DEFAULT 10) RETURNS TABLE("stylist_id" "uuid", "display_name" "text", "title" "text", "bio" "text", "years_experience" integer, "specialties" "text"[], "rating_average" numeric, "total_bookings" integer, "avatar_url" "text")
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
    RETURN QUERY
    SELECT 
        sp.user_id as stylist_id,
        sp.display_name,
        sp.title,
        sp.bio,
        sp.years_experience,
        sp.specialties,
        sp.rating_average,
        sp.total_bookings,
        up.avatar_url
    FROM public.stylist_profiles sp
    LEFT JOIN public.user_profiles up ON sp.user_id = up.id
    WHERE sp.is_active = TRUE
    ORDER BY 
        sp.total_bookings DESC NULLS LAST, 
        sp.rating_average DESC NULLS LAST,
        sp.created_at ASC
    LIMIT p_limit;
END;
$$;


ALTER FUNCTION "public"."get_top_stylists"("p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_trending_products"("p_limit" integer DEFAULT 20) RETURNS TABLE("product_id" "uuid", "name" "text", "slug" "text", "trend_score" numeric, "source" "text", "min_price" integer, "image_url" "text", "average_rating" numeric, "is_featured" boolean)
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'metrics', 'pg_temp'
    AS $$
BEGIN
    RETURN QUERY
    WITH recent_trending_dates AS (
        -- Get the most recent 7 days that have trending data (for smaller websites)
        SELECT DISTINCT score_date 
        FROM metrics.product_trending_scores 
        ORDER BY score_date DESC 
        LIMIT 7
    ),
    product_images_primary AS (
        -- Pre-calculate primary images to avoid subquery in GROUP BY
        SELECT DISTINCT ON (pi.product_id) 
            pi.product_id as prod_id,
            COALESCE(pi.image_url, '/placeholder-product.jpg') as primary_image_url
        FROM public.product_images pi
        ORDER BY pi.product_id, pi.sort_order ASC, pi.created_at ASC
    ),
    trending AS (
        SELECT 
            pts.product_id AS prod_id,
            p.name::TEXT AS prod_name,
            p.slug::TEXT AS prod_slug,
            pts.trend_score AS prod_trend_score,
            'trending'::TEXT as prod_source,
            MIN(pv.price)::INTEGER as prod_min_price,
            -- ✅ FIX #1: Include primary image with proper fallback
            COALESCE(pimg.primary_image_url, '/placeholder-product.jpg')::TEXT as prod_image_url,
            p.average_rating AS prod_average_rating,
            p.is_featured AS prod_is_featured
        FROM metrics.product_trending_scores pts
        JOIN public.products p ON pts.product_id = p.id
        JOIN public.product_variants pv ON p.id = pv.product_id AND pv.is_active = TRUE
        LEFT JOIN product_images_primary pimg ON p.id = pimg.prod_id
        -- ✅ FIX #2: Use historical data (last 7 days) instead of just today
        WHERE pts.score_date IN (SELECT score_date FROM recent_trending_dates)
          AND pts.trend_score > 0.5  -- Lower threshold for smaller websites
          AND p.is_active = TRUE
        GROUP BY pts.product_id, p.name, p.slug, pts.trend_score, p.average_rating, p.is_featured, pts.score_date, pimg.primary_image_url
        ORDER BY pts.trend_score DESC, pts.score_date DESC
        LIMIT p_limit
    ),
    trending_count AS (
        SELECT COUNT(*) as cnt FROM trending
    ),
    new_arrivals AS (
        SELECT 
            p.id AS prod_id,
            p.name::TEXT AS prod_name,
            p.slug::TEXT AS prod_slug,
            0::NUMERIC as prod_trend_score,
            'new'::TEXT as prod_source,
            MIN(pv.price)::INTEGER as prod_min_price,
            -- ✅ FIX #1: Include primary image for new arrivals too
            COALESCE(pimg.primary_image_url, '/placeholder-product.jpg')::TEXT as prod_image_url,
            p.average_rating AS prod_average_rating,
            p.is_featured AS prod_is_featured
        FROM public.products p
        JOIN public.product_variants pv ON p.id = pv.product_id AND pv.is_active = TRUE
        LEFT JOIN product_images_primary pimg ON p.id = pimg.prod_id
        WHERE p.is_active = TRUE
          AND p.created_at >= NOW() - INTERVAL '30 days'
          AND p.id NOT IN (SELECT t.prod_id FROM trending t)
        GROUP BY p.id, p.name, p.slug, p.average_rating, p.is_featured, pimg.primary_image_url
        ORDER BY p.created_at DESC
        LIMIT p_limit - (SELECT cnt FROM trending_count)
    ),
    top_rated AS (
        SELECT 
            p.id AS prod_id,
            p.name::TEXT AS prod_name,
            p.slug::TEXT AS prod_slug,
            0::NUMERIC as prod_trend_score,
            'rated'::TEXT as prod_source,
            MIN(pv.price)::INTEGER as prod_min_price,
            -- ✅ FIX #1: Include primary image for top rated too
            COALESCE(pimg.primary_image_url, '/placeholder-product.jpg')::TEXT as prod_image_url,
            p.average_rating AS prod_average_rating,
            p.is_featured AS prod_is_featured
        FROM public.products p
        JOIN public.product_variants pv ON p.id = pv.product_id AND pv.is_active = TRUE
        LEFT JOIN product_images_primary pimg ON p.id = pimg.prod_id
        WHERE p.is_active = TRUE
          AND p.review_count >= 2  -- Lower threshold for smaller websites
          AND p.id NOT IN (SELECT t.prod_id FROM trending t)
          AND p.id NOT IN (SELECT n.prod_id FROM new_arrivals n)
        GROUP BY p.id, p.name, p.slug, p.average_rating, p.is_featured, pimg.primary_image_url
        ORDER BY p.average_rating DESC, p.review_count DESC
        LIMIT p_limit - (SELECT cnt FROM trending_count) - (SELECT COUNT(*) FROM new_arrivals)
    ),
    fallback_active AS (
        SELECT 
            p.id AS prod_id,
            p.name::TEXT AS prod_name,
            p.slug::TEXT AS prod_slug,
            0::NUMERIC as prod_trend_score,
            'active'::TEXT as prod_source,
            MIN(pv.price)::INTEGER as prod_min_price,
            -- ✅ FIX #1: Include primary image for fallback too
            COALESCE(pimg.primary_image_url, '/placeholder-product.jpg')::TEXT as prod_image_url,
            p.average_rating AS prod_average_rating,
            p.is_featured AS prod_is_featured
        FROM public.products p
        JOIN public.product_variants pv ON p.id = pv.product_id AND pv.is_active = TRUE
        LEFT JOIN product_images_primary pimg ON p.id = pimg.prod_id
        WHERE p.is_active = TRUE
          AND p.id NOT IN (SELECT t.prod_id FROM trending t)
          AND p.id NOT IN (SELECT n.prod_id FROM new_arrivals n)
          AND p.id NOT IN (SELECT r.prod_id FROM top_rated r)
        GROUP BY p.id, p.name, p.slug, p.average_rating, p.is_featured, pimg.primary_image_url
        ORDER BY p.created_at DESC
        LIMIT p_limit - (SELECT cnt FROM trending_count) - (SELECT COUNT(*) FROM new_arrivals) - (SELECT COUNT(*) FROM top_rated)
    )
    SELECT 
        t.prod_id as product_id,
        t.prod_name as name,
        t.prod_slug as slug,
        t.prod_trend_score as trend_score,
        t.prod_source as source,
        t.prod_min_price as min_price,
        t.prod_image_url as image_url,
        t.prod_average_rating as average_rating,
        t.prod_is_featured as is_featured
    FROM (
        SELECT * FROM trending
        UNION ALL
        SELECT * FROM new_arrivals
        UNION ALL
        SELECT * FROM top_rated
        UNION ALL
        SELECT * FROM fallback_active
    ) t
    LIMIT p_limit;
END;
$$;


ALTER FUNCTION "public"."get_trending_products"("p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_support_tickets"("p_limit" integer DEFAULT 20, "p_offset" integer DEFAULT 0) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
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
  -- Fix: Properly group all columns when using aggregate subquery
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', ticket_data.id,
        'subject', ticket_data.subject,
        'priority', ticket_data.priority,
        'status', ticket_data.status,
        'category', ticket_data.category,
        'created_at', ticket_data.created_at,
        'updated_at', ticket_data.updated_at,
        'resolved_at', ticket_data.resolved_at,
        'message_count', ticket_data.message_count
      ) ORDER BY ticket_data.created_at DESC
    ),
    '[]'::jsonb
  ) INTO v_tickets
  FROM (
    SELECT 
      st.id,
      st.subject,
      st.priority,
      st.status,
      COALESCE(sc.name, 'General') as category,
      st.created_at,
      st.updated_at,
      st.resolved_at,
      COALESCE(msg_count.count, 0) as message_count
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
    LIMIT p_limit OFFSET p_offset
  ) ticket_data;
  
  RETURN jsonb_build_object(
    'success', true,
    'tickets', v_tickets,
    'total', v_total,
    'limit', p_limit,
    'offset', p_offset
  );
END;
$$;


ALTER FUNCTION "public"."get_user_support_tickets"("p_limit" integer, "p_offset" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_vendor_dashboard_stats_v2_1"("v_id" "uuid" DEFAULT "auth"."uid"()) RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'public', 'metrics', 'pg_temp'
    AS $$
DECLARE
  calling_uid uuid;
  result jsonb;
  today_stats record;
  historical_stats record;
BEGIN
  calling_uid := auth.uid();
  
  IF v_id != calling_uid AND NOT public.user_has_role(calling_uid, 'admin') THEN
    RAISE EXCEPTION 'Access denied: cannot query other vendor data' USING ERRCODE = '42501';
  END IF;
  
  IF v_id IS NULL THEN
    v_id := calling_uid;
  END IF;
  
  SELECT
    COALESCE(rc.orders, 0) as orders,
    COALESCE(rc.gmv_cents, 0) as gmv_cents,
    COALESCE(rc.platform_fees_cents, 0) as platform_fees_cents,
    COALESCE(rc.refunds_cents, 0) as refunds_cents
  INTO today_stats
  FROM metrics.vendor_realtime_cache rc
  WHERE rc.vendor_id = v_id
    AND rc.cache_date = CURRENT_DATE;
  
  SELECT
    COALESCE(SUM(vd.orders), 0) as orders_30d,
    COALESCE(SUM(vd.gmv_cents), 0) as gmv_30d_cents,
    COALESCE(SUM(vd.platform_fees_cents), 0) as fees_30d_cents,
    COALESCE(SUM(vd.pending_payout_cents), 0) as pending_payout_cents,
    COALESCE(SUM(vd.refunds_cents), 0) as refunds_30d_cents,
    COALESCE(SUM(vd.payouts_cents), 0) as payouts_30d_cents
  INTO historical_stats
  FROM metrics.vendor_daily vd
  WHERE vd.vendor_id = v_id
    AND vd.day >= CURRENT_DATE - INTERVAL '30 days';
  
  result := jsonb_build_object(
    'vendor_id', v_id,
    'today', jsonb_build_object(
      'orders', COALESCE(today_stats.orders, 0),
      'gmv_cents', COALESCE(today_stats.gmv_cents, 0),
      'platform_fees_cents', COALESCE(today_stats.platform_fees_cents, 0),
      'refunds_cents', COALESCE(today_stats.refunds_cents, 0)
    ),
    'last_30_days', jsonb_build_object(
      'orders', COALESCE(historical_stats.orders_30d, 0),
      'gmv_cents', COALESCE(historical_stats.gmv_30d_cents, 0),
      'platform_fees_cents', COALESCE(historical_stats.fees_30d_cents, 0),
      'pending_payout_cents', COALESCE(historical_stats.pending_payout_cents, 0),
      'refunds_cents', COALESCE(historical_stats.refunds_30d_cents, 0),
      'payouts_cents', COALESCE(historical_stats.payouts_30d_cents, 0)
    ),
    'generated_at', now()
  );
  
  RETURN result;
END;
$$;


ALTER FUNCTION "public"."get_vendor_dashboard_stats_v2_1"("v_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_vendor_dashboard_stats_v2_1"("v_id" "uuid") IS 'Returns vendor dashboard statistics. SECURITY INVOKER with RLS enforcement. FAANG-audited.';



CREATE OR REPLACE FUNCTION "public"."get_vendor_documents_for_review"("p_vendor_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth', 'private', 'pg_temp'
    AS $$
DECLARE
    v_result JSONB;
BEGIN
    IF NOT public.user_has_role(auth.uid(), 'admin') THEN
        RAISE EXCEPTION 'Unauthorized: Admin access required';
    END IF;
    
    SELECT jsonb_agg(
        jsonb_build_object(
            'id', d.id,
            'document_type', d.document_type,
            'file_name', d.file_name,
            'file_size', d.file_size,
            'mime_type', d.mime_type,
            'storage_path', d.storage_path,
            'status', d.status,
            'document_number', d.document_number,
            'created_at', d.created_at,
            'verified_at', d.verified_at,
            'rejection_reason', d.rejection_reason
        ) ORDER BY d.created_at DESC
    )
    INTO v_result
    FROM vendor_documents d
    WHERE d.vendor_id = p_vendor_id;
    
    RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;


ALTER FUNCTION "public"."get_vendor_documents_for_review"("p_vendor_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_vendor_payment_methods"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'private', 'extensions', 'pg_temp'
    AS $$
DECLARE
  v_user_id UUID;
  v_key TEXT;
  v_profile RECORD;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;
  
  IF NOT public.user_has_role(v_user_id, 'vendor') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;
  
  v_key := private.get_encryption_key();
  
  SELECT
    user_id,
    bank_account_name,
    bank_name,
    bank_branch,
    CASE 
      WHEN bank_account_number_enc IS NOT NULL 
      THEN extensions.pgp_sym_decrypt(bank_account_number_enc, v_key)
      ELSE NULL
    END as bank_account_number,
    CASE 
      WHEN esewa_number_enc IS NOT NULL 
      THEN extensions.pgp_sym_decrypt(esewa_number_enc, v_key)
      ELSE NULL
    END as esewa_number,
    CASE 
      WHEN khalti_number_enc IS NOT NULL 
      THEN extensions.pgp_sym_decrypt(khalti_number_enc, v_key)
      ELSE NULL
    END as khalti_number,
    CASE 
      WHEN tax_id_enc IS NOT NULL 
      THEN extensions.pgp_sym_decrypt(tax_id_enc, v_key)
      ELSE NULL
    END as tax_id
  INTO v_profile
  FROM public.vendor_profiles
  WHERE user_id = v_user_id;
  
  IF v_profile.user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Vendor profile not found');
  END IF;
  
  RETURN jsonb_build_object(
    'success', true,
    'data', jsonb_build_object(
      'user_id', v_profile.user_id,
      'bank_account_name', v_profile.bank_account_name,
      'bank_account_number', v_profile.bank_account_number,
      'bank_name', v_profile.bank_name,
      'bank_branch', v_profile.bank_branch,
      'esewa_number', v_profile.esewa_number,
      'khalti_number', v_profile.khalti_number,
      'tax_id', v_profile.tax_id
    )
  );
  
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;


ALTER FUNCTION "public"."get_vendor_payment_methods"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_vendor_payment_methods"() IS 'Allows vendors to retrieve their own payment methods with decrypted sensitive data. Only the vendor can access their own data.';



CREATE OR REPLACE FUNCTION "public"."get_vendor_payouts"("p_vendor_id" "uuid" DEFAULT NULL::"uuid", "p_limit" integer DEFAULT 50) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth', 'pg_temp'
    AS $$
DECLARE
  v_vendor_id uuid;
  v_payouts jsonb;
  v_requests jsonb;
  v_summary jsonb;
  v_balance jsonb;
BEGIN
  v_vendor_id := COALESCE(p_vendor_id, auth.uid());

  IF v_vendor_id != auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'message', 'Unauthorized access');
  END IF;

  -- Get completed payouts
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', id,
      'amount_cents', amount_cents,
      'net_amount_cents', net_amount_cents,
      'payment_method', payment_method,
      'payment_reference', payment_reference,
      'status', status,
      'created_at', created_at,
      'processed_at', processed_at
    ) ORDER BY created_at DESC
  ), '[]'::jsonb)
  INTO v_payouts
  FROM payouts
  WHERE vendor_id = v_vendor_id
  LIMIT p_limit;

  -- Get payout requests
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', id,
      'requested_amount_cents', requested_amount_cents,
      'payment_method', payment_method,
      'status', status,
      'created_at', created_at,
      'reviewed_at', reviewed_at,
      'rejection_reason', rejection_reason
    ) ORDER BY created_at DESC
  ), '[]'::jsonb)
  INTO v_requests
  FROM payout_requests
  WHERE vendor_id = v_vendor_id
  LIMIT p_limit;

  -- Calculate summary
  SELECT jsonb_build_object(
    'total_paid_cents', COALESCE(SUM(CASE WHEN status = 'completed' THEN net_amount_cents ELSE 0 END), 0),
    'pending_payout_cents', COALESCE(SUM(CASE WHEN status = 'pending' THEN net_amount_cents ELSE 0 END), 0),
    'this_month_cents', COALESCE(SUM(CASE WHEN status = 'completed' AND DATE_TRUNC('month', created_at) = DATE_TRUNC('month', CURRENT_DATE) THEN net_amount_cents ELSE 0 END), 0)
  )
  INTO v_summary
  FROM payouts
  WHERE vendor_id = v_vendor_id;
  
  -- Get available balance (now includes cancelled info)
  v_balance := calculate_vendor_pending_payout(v_vendor_id);

  RETURN jsonb_build_object(
    'success', true,
    'payouts', v_payouts,
    'requests', v_requests,
    'summary', v_summary,
    'available_balance', v_balance
  );
END;
$$;


ALTER FUNCTION "public"."get_vendor_payouts"("p_vendor_id" "uuid", "p_limit" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_vendor_payouts"("p_vendor_id" "uuid", "p_limit" integer) IS 'Returns complete payout history, pending requests, and summary statistics for a vendor.';



CREATE OR REPLACE FUNCTION "public"."get_vendor_products_list"("p_vendor_id" "uuid" DEFAULT NULL::"uuid", "p_page" integer DEFAULT 1, "p_per_page" integer DEFAULT 20, "p_search" "text" DEFAULT NULL::"text", "p_is_active" boolean DEFAULT NULL::boolean) RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    SET "statement_timeout" TO '10s'
    AS $$
DECLARE
  v_offset integer;
  v_total_count integer;
  v_result jsonb;
  v_actual_vendor_id uuid;
BEGIN
  -- Validate inputs
  IF p_per_page > 100 THEN
    RAISE EXCEPTION 'per_page cannot exceed 100';
  END IF;
  
  IF p_search IS NOT NULL AND LENGTH(p_search) > 100 THEN
    RAISE EXCEPTION 'Search term too long (max 100 characters)';
  END IF;
  
  -- Use provided vendor_id or default to authenticated user
  v_actual_vendor_id := COALESCE(p_vendor_id, auth.uid());
  
  -- Verify user can only see their own products (unless admin)
  IF v_actual_vendor_id != auth.uid() AND NOT public.user_has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Unauthorized: Cannot view other vendor products';
  END IF;
  
  -- Calculate offset
  v_offset := (p_page - 1) * p_per_page;
  
  -- Get total count
  SELECT COUNT(*) INTO v_total_count
  FROM products p
  WHERE p.vendor_id = v_actual_vendor_id
    AND (p_is_active IS NULL OR p.is_active = p_is_active)
    AND (p_search IS NULL OR p.name ILIKE '%' || p_search || '%');
  
  -- Get paginated products with FIXED inventory calculation
  WITH product_data AS (
    SELECT 
      p.id,
      p.name,
      p.slug,
      p.description,
      p.short_description,
      p.is_active,
      p.is_featured,
      p.created_at,
      p.updated_at,
      c.name as category_name,
      c.slug as category_slug,
      b.name as brand_name,
      -- Aggregate variants (using subquery to avoid multiplication)
      (
        SELECT COALESCE(
          jsonb_agg(jsonb_build_object(
            'id', pv.id,
            'sku', pv.sku,
            'price', pv.price,
            'compare_at_price', pv.compare_at_price,
            'is_active', pv.is_active
          )),
          '[]'::jsonb
        )
        FROM product_variants pv
        WHERE pv.product_id = p.id
      ) as variants,
      -- Aggregate images (using subquery to avoid multiplication)
      (
        SELECT COALESCE(
          jsonb_agg(jsonb_build_object(
            'id', pi.id,
            'image_url', pi.image_url,
            'sort_order', pi.sort_order,
            'is_primary', pi.is_primary
          ) ORDER BY pi.sort_order),
          '[]'::jsonb
        )
        FROM product_images pi
        WHERE pi.product_id = p.id
      ) as images,
      -- FIXED: Calculate total inventory using subquery to avoid row multiplication
      (
        SELECT COALESCE(SUM(i.quantity_available), 0)
        FROM product_variants pv
        JOIN inventory i ON i.variant_id = pv.id
        WHERE pv.product_id = p.id
      ) as total_inventory
    FROM products p
    LEFT JOIN categories c ON c.id = p.category_id
    LEFT JOIN brands b ON b.id = p.brand_id
    WHERE p.vendor_id = v_actual_vendor_id
      AND (p_is_active IS NULL OR p.is_active = p_is_active)
      AND (p_search IS NULL OR p.name ILIKE '%' || p_search || '%')
    ORDER BY p.created_at DESC, p.id
    LIMIT p_per_page
    OFFSET v_offset
  )
  SELECT jsonb_build_object(
    'products', COALESCE(jsonb_agg(to_jsonb(product_data)), '[]'::jsonb),
    'total_count', v_total_count,
    'page', p_page,
    'per_page', p_per_page,
    'total_pages', CEIL(v_total_count::float / p_per_page),
    'has_more', v_total_count > (p_page * p_per_page)
  ) INTO v_result
  FROM product_data;
  
  RETURN v_result;
END;
$$;


ALTER FUNCTION "public"."get_vendor_products_list"("p_vendor_id" "uuid", "p_page" integer, "p_per_page" integer, "p_search" "text", "p_is_active" boolean) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_vendor_products_list"("p_vendor_id" "uuid", "p_page" integer, "p_per_page" integer, "p_search" "text", "p_is_active" boolean) IS 'Fetches vendor products with pagination. Fixed in Jan 2026 to use subqueries for variants, images, and inventory to avoid row multiplication from JOINs.';



CREATE OR REPLACE FUNCTION "public"."get_vote_shard"("p_user_id" "uuid") RETURNS smallint
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO 'public'
    AS $$
BEGIN
    -- Use hash of user_id to determine shard (0-63)
    RETURN abs(hashtext(p_user_id::text)) % 64;
END;
$$;


ALTER FUNCTION "public"."get_vote_shard"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
    customer_role_id uuid;
    v_username text;
    v_display_name text;
BEGIN
    -- Extract user data from raw_user_meta_data
    v_display_name := COALESCE(
        NEW.raw_user_meta_data->>'full_name',
        NEW.raw_user_meta_data->>'name',
        split_part(NEW.email, '@', 1)  -- Use email prefix as fallback
    );
    
    -- Generate unique username from email
    v_username := lower(regexp_replace(split_part(NEW.email, '@', 1), '[^a-z0-9]', '', 'g'));
    
    -- Ensure username is unique by appending random suffix if needed
    IF EXISTS (SELECT 1 FROM user_profiles WHERE username = v_username) THEN
        v_username := v_username || '_' || substring(NEW.id::text from 1 for 8);
    END IF;

    -- Get the customer role ID
    SELECT id INTO customer_role_id 
    FROM public.roles 
    WHERE name = 'customer' 
    LIMIT 1;

    -- Create user profile record with CORRECT column names
    INSERT INTO public.user_profiles (
        id,
        username,
        display_name,
        role_version,
        is_verified,
        created_at,
        updated_at
    ) VALUES (
        NEW.id,
        v_username,
        v_display_name,
        1,
        false,
        NOW(),
        NOW()
    );

    -- Assign default customer role if customer role exists
    IF customer_role_id IS NOT NULL THEN
        INSERT INTO public.user_roles (user_id, role_id)
        VALUES (NEW.id, customer_role_id)
        ON CONFLICT (user_id, role_id) DO NOTHING;
    END IF;

    RETURN NEW;
EXCEPTION
    WHEN OTHERS THEN
        -- Log error but don't fail the user creation
        RAISE WARNING 'Error creating user profile for user % (email: %): % - %', 
            NEW.id, NEW.email, SQLSTATE, SQLERRM;
        RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."handle_new_user"() IS 'BUGFIX (2025-10-18): Fixed to use correct column names (username, display_name) instead of (email, full_name). Automatically creates user_profiles record and assigns customer role when a new user signs up.';



CREATE OR REPLACE FUNCTION "public"."handle_order_item_cancellation"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'metrics', 'auth', 'private', 'pg_temp'
    AS $$
DECLARE
  v_vendor_id uuid;
  v_order_date date;
  v_refund_amount bigint;
  v_all_items_cancelled boolean;
BEGIN
  -- Only process when changing TO cancelled status
  IF NEW.fulfillment_status = 'cancelled' AND OLD.fulfillment_status != 'cancelled' THEN
    
    v_vendor_id := NEW.vendor_id;
    v_refund_amount := NEW.total_price_cents;
    
    -- Get order date
    SELECT created_at::date INTO v_order_date
    FROM orders WHERE id = NEW.order_id;
    
    -- Set cancelled_at timestamp
    NEW.cancelled_at := NOW();
    
    -- Update vendor realtime cache (add to refunds)
    INSERT INTO metrics.vendor_realtime_cache (
      vendor_id, cache_date, orders, gmv_cents, platform_fees_cents, refunds_cents, updated_at
    ) VALUES (
      v_vendor_id, v_order_date, 0, 0, 0, v_refund_amount, NOW()
    )
    ON CONFLICT (vendor_id, cache_date)
    DO UPDATE SET
      refunds_cents = metrics.vendor_realtime_cache.refunds_cents + v_refund_amount,
      updated_at = NOW();
    
    -- Update vendor daily metrics (add to refunds)
    INSERT INTO metrics.vendor_daily (
      vendor_id, day, orders, gmv_cents, platform_fees_cents, 
      pending_payout_cents, payouts_cents, refunds_cents
    ) VALUES (
      v_vendor_id, v_order_date, 0, 0, 0, 0, 0, v_refund_amount
    )
    ON CONFLICT (vendor_id, day)
    DO UPDATE SET
      refunds_cents = metrics.vendor_daily.refunds_cents + v_refund_amount,
      updated_at = NOW();
    
    -- Update platform daily metrics (add to refunds)
    INSERT INTO metrics.platform_daily (
      day, orders, gmv_cents, platform_fees_cents, refunds_cents, updated_at
    ) VALUES (
      v_order_date, 0, 0, 0, v_refund_amount, NOW()
    )
    ON CONFLICT (day)
    DO UPDATE SET
      refunds_cents = metrics.platform_daily.refunds_cents + v_refund_amount,
      updated_at = NOW();
    
    -- Check if ALL items in the order are now cancelled
    SELECT NOT EXISTS (
      SELECT 1 FROM order_items
      WHERE order_id = NEW.order_id
        AND fulfillment_status != 'cancelled'
    ) INTO v_all_items_cancelled;
    
    -- If all items cancelled, mark the entire order as cancelled
    IF v_all_items_cancelled THEN
      UPDATE orders
      SET 
        status = 'cancelled',
        canceled_at = NOW()
      WHERE id = NEW.order_id
        AND status != 'cancelled';
    END IF;
    
    -- Log to audit trail
    -- ✅ FIXED: Use 'UPDATE' instead of 'CANCEL' (audit_log only allows INSERT/UPDATE/DELETE)
    INSERT INTO private.audit_log (
      table_name, record_id, action, old_values, new_values, user_id
    ) VALUES (
      'order_items', NEW.id, 'UPDATE',
      jsonb_build_object(
        'fulfillment_status', OLD.fulfillment_status,
        'total_price_cents', OLD.total_price_cents,
        'action_type', 'cancellation'
      ),
      jsonb_build_object(
        'fulfillment_status', 'cancelled',
        'refund_amount', v_refund_amount,
        'all_items_cancelled', v_all_items_cancelled,
        'action_type', 'cancellation'
      ),
      auth.uid()
    );
    
  END IF;
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_order_item_cancellation"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."handle_order_item_cancellation"() IS 'Trigger function that handles all cascading effects when an order item is cancelled.
   Fixed: Uses action=UPDATE with action_type=cancellation in audit log.';



CREATE OR REPLACE FUNCTION "public"."hmac"("data" "text", "key" "text", "algorithm" "text") RETURNS "bytea"
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO 'public', 'extensions', 'pg_temp'
    AS $$
BEGIN
  RETURN extensions.hmac(data::bytea, key::bytea, algorithm);
END;
$$;


ALTER FUNCTION "public"."hmac"("data" "text", "key" "text", "algorithm" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."increment_combo_sold"("p_combo_id" "uuid", "p_quantity" integer DEFAULT 1) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_new_sold INTEGER;
  v_limit INTEGER;
BEGIN
  -- Validate quantity
  IF p_quantity <= 0 THEN
    RETURN jsonb_build_object('success', false, 'message', 'Quantity must be positive');
  END IF;

  -- Atomically increment and get new value
  UPDATE products 
  SET combo_quantity_sold = COALESCE(combo_quantity_sold, 0) + p_quantity,
      updated_at = now()
  WHERE id = p_combo_id AND is_combo = true
  RETURNING combo_quantity_sold, combo_quantity_limit INTO v_new_sold, v_limit;
  
  IF v_new_sold IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Combo not found');
  END IF;
  
  RETURN jsonb_build_object(
    'success', true,
    'combo_quantity_sold', v_new_sold,
    'combo_quantity_limit', v_limit,
    'remaining', CASE WHEN v_limit IS NOT NULL THEN v_limit - v_new_sold ELSE NULL END
  );
END;
$$;


ALTER FUNCTION "public"."increment_combo_sold"("p_combo_id" "uuid", "p_quantity" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."increment_combo_sold"("p_combo_id" "uuid", "p_quantity" integer) IS 'Atomically increments combo_quantity_sold after successful purchase';



CREATE OR REPLACE FUNCTION "public"."increment_user_role_version"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
    -- Increment role_version in user_profiles when user_roles changes
    UPDATE public.user_profiles 
    SET role_version = role_version + 1,
        updated_at = NOW()
    WHERE id = COALESCE(NEW.user_id, OLD.user_id);
    
    RETURN COALESCE(NEW, OLD);
END;
$$;


ALTER FUNCTION "public"."increment_user_role_version"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."initialize_review_vote_shards"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  -- Initialize 8 shards (0-7) for the new review
  INSERT INTO review_vote_shards (review_id, shard, helpful_count, unhelpful_count)
  SELECT NEW.id, generate_series(0, 7), 0, 0
  ON CONFLICT (review_id, shard) DO NOTHING;
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."initialize_review_vote_shards"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."initiate_stylist_promotion"("p_user_id" "uuid", "p_admin_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'private', 'pg_temp'
    AS $$
BEGIN
  RETURN private.initiate_stylist_promotion(p_user_id, p_admin_id);
END;
$$;


ALTER FUNCTION "public"."initiate_stylist_promotion"("p_user_id" "uuid", "p_admin_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."merge_carts_secure"("p_user_id" "uuid", "p_guest_token" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_guest_cart_id UUID;
  v_user_cart_id UUID;
  v_sid TEXT;
  v_merged_count INT := 0;
  v_clamped_count INT := 0;
  v_combo_count INT := 0;
  v_variant RECORD;
  v_available INT;
  v_existing_qty INT;
  v_new_qty INT;
  v_final_qty INT;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'User ID is required for cart merge';
  END IF;

  IF p_guest_token IS NOT NULL THEN
    v_sid := public.verify_guest_session(p_guest_token);
    SELECT id INTO v_guest_cart_id FROM carts WHERE session_id = v_sid;
  END IF;

  IF v_guest_cart_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'message', 'No guest cart to merge',
      'merged_items', 0,
      'clamped_items', 0,
      'combo_items', 0
    );
  END IF;

  SELECT id INTO v_user_cart_id FROM carts WHERE user_id = p_user_id;
  IF v_user_cart_id IS NULL THEN
    -- Convert guest cart to user cart (preserves all fields including combo)
    UPDATE carts 
    SET user_id = p_user_id, session_id = NULL 
    WHERE id = v_guest_cart_id;
    
    -- Count combo items
    SELECT COUNT(*) INTO v_combo_count 
    FROM cart_items 
    WHERE cart_id = v_guest_cart_id AND combo_id IS NOT NULL;
    
    RETURN jsonb_build_object(
      'success', true,
      'message', 'Guest cart converted to user cart',
      'merged_items', (SELECT COUNT(*) FROM cart_items WHERE cart_id = v_guest_cart_id),
      'clamped_items', 0,
      'combo_items', v_combo_count
    );
  END IF;

  -- Process non-combo items (merge quantities)
  FOR v_variant IN 
    SELECT variant_id, quantity, price_snapshot
    FROM cart_items 
    WHERE cart_id = v_guest_cart_id AND combo_id IS NULL
  LOOP
    SELECT COALESCE(SUM(quantity_available), 0) INTO v_available
    FROM inventory 
    WHERE variant_id = v_variant.variant_id;
    
    SELECT COALESCE(quantity, 0) INTO v_existing_qty
    FROM cart_items 
    WHERE cart_id = v_user_cart_id AND variant_id = v_variant.variant_id AND combo_id IS NULL;
    
    IF v_existing_qty > 0 THEN
      v_new_qty := v_existing_qty + v_variant.quantity;
    ELSE
      v_new_qty := v_variant.quantity;
    END IF;
    
    v_final_qty := LEAST(v_new_qty, v_available, 99);
    
    IF v_final_qty < v_new_qty THEN
      v_clamped_count := v_clamped_count + 1;
    END IF;
    
    INSERT INTO cart_items (cart_id, variant_id, quantity, price_snapshot)
    VALUES (v_user_cart_id, v_variant.variant_id, v_final_qty, v_variant.price_snapshot)
    ON CONFLICT (cart_id, variant_id) WHERE combo_id IS NULL
    DO UPDATE SET 
      quantity = EXCLUDED.quantity,
      price_snapshot = EXCLUDED.price_snapshot,
      updated_at = now();
    
    v_merged_count := v_merged_count + 1;
  END LOOP;

  -- Process combo items (preserve combo_id and combo_group_id, don't merge)
  -- Combo items are moved as-is to preserve grouping
  UPDATE cart_items 
  SET cart_id = v_user_cart_id
  WHERE cart_id = v_guest_cart_id AND combo_id IS NOT NULL;
  
  GET DIAGNOSTICS v_combo_count = ROW_COUNT;

  -- Delete the guest cart
  DELETE FROM carts WHERE id = v_guest_cart_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Carts merged successfully',
    'merged_items', v_merged_count,
    'clamped_items', v_clamped_count,
    'combo_items', v_combo_count
  );
END;
$$;


ALTER FUNCTION "public"."merge_carts_secure"("p_user_id" "uuid", "p_guest_token" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."merge_carts_secure"("p_user_id" "uuid", "p_guest_token" "text") IS 'Merges guest cart into user cart, preserving combo groupings';



CREATE OR REPLACE FUNCTION "public"."notify_product_change"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
    -- Simple notification without complex logic
    PERFORM pg_notify(
        'product_changes',
        json_build_object(
            'table', TG_TABLE_NAME,
            'operation', TG_OP,
            'timestamp', NOW()
        )::text
    );
    
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$;


ALTER FUNCTION "public"."notify_product_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prevent_booking_inactive_stylist"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM stylist_profiles 
    WHERE user_id = NEW.stylist_user_id 
    AND is_active = false
  ) THEN
    RAISE EXCEPTION 'Cannot create booking for inactive stylist';
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."prevent_booking_inactive_stylist"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."process_order_with_occ"("p_payment_intent_id" "text", "p_webhook_event_id" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_order_id UUID;
    v_payment_intent RECORD;
    v_total_amount DECIMAL(12,2);
    v_product_items_needed INT;
    v_booking_items_needed INT;
    v_items_needed INT;
    v_product_items_processed INT;
    v_booking_items_processed INT;
    v_items_processed INT;
    v_cart_id UUID;
    v_user_id UUID;
    v_product_total_cents INT;
    v_booking_total_cents INT;
    v_booking_reservation RECORD;
    v_order_number TEXT;
    v_subtotal_cents INT;
    v_tax_cents INT;
    v_shipping_cents INT;
    v_shipping_address JSONB;
BEGIN
    -- Idempotency check: Does order already exist?
    SELECT id INTO v_order_id FROM orders WHERE payment_intent_id = p_payment_intent_id;
    IF v_order_id IS NOT NULL THEN
        IF p_webhook_event_id IS NOT NULL THEN
            UPDATE webhook_events SET status = 'completed', processed_at = NOW(), updated_at = NOW() WHERE id = p_webhook_event_id;
        END IF;
        RETURN jsonb_build_object('success', true, 'order_id', v_order_id, 'message', 'Order already exists (idempotent)', 'idempotent', true);
    END IF;
    
    -- Get payment intent details
    SELECT * INTO v_payment_intent FROM payment_intents WHERE payment_intent_id = p_payment_intent_id AND status = 'succeeded';
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Payment intent not found or not succeeded');
    END IF;
    
    v_cart_id := v_payment_intent.cart_id;
    v_user_id := v_payment_intent.user_id;
    
    -- Extract values from metadata
    v_subtotal_cents := COALESCE((v_payment_intent.metadata->>'subtotal_cents')::INTEGER, 0);
    v_tax_cents := COALESCE((v_payment_intent.metadata->>'tax_cents')::INTEGER, 0);
    v_shipping_cents := COALESCE((v_payment_intent.metadata->>'shipping_cents')::INTEGER, 0);
    v_shipping_address := v_payment_intent.metadata->'shipping_address';
    
    v_order_number := 'ORD-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(FLOOR(RANDOM() * 99999)::TEXT, 5, '0');
    
    SELECT COUNT(*) INTO v_product_items_needed FROM cart_items WHERE cart_id = v_cart_id;
    SELECT COUNT(*) INTO v_booking_items_needed FROM booking_reservations WHERE customer_user_id = v_user_id AND status = 'reserved' AND expires_at > NOW();
    v_items_needed := v_product_items_needed + v_booking_items_needed;
    
    -- Final total from payment intent
    v_total_amount := v_payment_intent.amount_cents;
    
    IF v_total_amount <= 0 THEN
        RAISE EXCEPTION 'Order total must be greater than zero. Calculated amount: %', v_total_amount;
    END IF;

    -- Create order record with 'confirmed' status (matching constraints)
    INSERT INTO orders (
        order_number, user_id, status, subtotal_cents, tax_cents, shipping_cents, discount_cents, total_cents, 
        payment_intent_id, payment_method,
        shipping_name, shipping_phone, shipping_address_line1, shipping_address_line2, 
        shipping_city, shipping_state, shipping_postal_code, shipping_country, 
        notes, metadata, created_at, confirmed_at
    ) VALUES (
        v_order_number, v_user_id, 'confirmed', 
        v_subtotal_cents, v_tax_cents, v_shipping_cents, 0, v_total_amount::INTEGER, p_payment_intent_id,
        v_payment_intent.provider,
        COALESCE(v_shipping_address->>'name', 'N/A'), COALESCE(v_shipping_address->>'phone', 'N/A'), 
        COALESCE(v_shipping_address->>'address_line1', 'N/A'), v_shipping_address->>'address_line2', 
        COALESCE(v_shipping_address->>'city', 'N/A'), COALESCE(v_shipping_address->>'state', 'N/A'),
        COALESCE(v_shipping_address->>'postal_code', 'N/A'), COALESCE(v_shipping_address->>'country', 'Nepal'),
        COALESCE(v_payment_intent.metadata->>'notes', ''),
        jsonb_build_object(
            'payment_provider', v_payment_intent.provider,
            'processed_at', NOW()
        ),
        NOW(), NOW()
    ) RETURNING id INTO v_order_id;
    
    -- Process products with all required columns including vendor_id, product_slug, combo_id, combo_group_id
    v_product_items_processed := 0;
    IF v_product_items_needed > 0 THEN
        WITH product_insert AS (
            INSERT INTO order_items (
                order_id, product_id, variant_id, vendor_id, product_name, product_slug,
                variant_sku, quantity, unit_price_cents, total_price_cents, fulfillment_status,
                combo_id, combo_group_id
            )
            SELECT 
                v_order_id, 
                pv.product_id, 
                ci.variant_id, 
                p.vendor_id,           -- FIX: Include vendor_id (required NOT NULL)
                p.name, 
                p.slug,                -- FIX: Include product_slug (required NOT NULL)
                pv.sku, 
                ci.quantity,
                (pv.price * 100)::INTEGER, 
                (ci.quantity * pv.price * 100)::INTEGER, 
                'pending',
                ci.combo_id,           -- FIX: Include combo tracking
                ci.combo_group_id      -- FIX: Include combo group tracking
            FROM cart_items ci
            JOIN product_variants pv ON pv.id = ci.variant_id
            JOIN products p ON p.id = pv.product_id
            WHERE ci.cart_id = v_cart_id
            RETURNING id
        )
        SELECT COUNT(*) INTO v_product_items_processed FROM product_insert;
    END IF;
    
    -- Process bookings
    v_booking_items_processed := 0;
    IF v_booking_items_needed > 0 THEN
        FOR v_booking_reservation IN 
            SELECT * FROM booking_reservations 
            WHERE customer_user_id = v_user_id AND status = 'reserved' AND expires_at > NOW()
        LOOP
            INSERT INTO order_items (
                order_id, product_id, variant_id, vendor_id, product_name, product_slug, quantity, 
                unit_price_cents, total_price_cents, fulfillment_status, 
                metadata
            ) VALUES (
                v_order_id, NULL, NULL, v_booking_reservation.stylist_user_id, 
                v_booking_reservation.service_name, 'booking-service', 1,
                v_booking_reservation.price_cents, v_booking_reservation.price_cents, 'fulfilled',
                jsonb_build_object('booking_id', v_booking_reservation.id)
            );
            
            UPDATE booking_reservations SET status = 'confirmed', updated_at = NOW() WHERE id = v_booking_reservation.id;
            v_booking_items_processed := v_booking_items_processed + 1;
        END LOOP;
    END IF;
    
    v_items_processed := v_product_items_processed + v_booking_items_processed;
    
    IF v_items_processed != v_items_needed THEN
        RAISE EXCEPTION 'Item processing mismatch: Expected %, Processed %', v_items_needed, v_items_processed;
    END IF;
    
    -- Clear cart items after successful order creation
    DELETE FROM cart_items WHERE cart_id = v_cart_id;
    
    -- Record inventory movements
    IF v_product_items_processed > 0 THEN
        INSERT INTO inventory_movements (variant_id, location_id, movement_type, quantity_change, quantity_after, reference_id, reference_type, notes, created_by)
        SELECT oi.variant_id, (SELECT location_id FROM inventory WHERE variant_id = oi.variant_id LIMIT 1), 'sale', -oi.quantity,
            (SELECT quantity_available FROM inventory WHERE variant_id = oi.variant_id), v_order_id, 'order', 'Order #' || v_order_id::TEXT, v_user_id
        FROM order_items oi WHERE oi.order_id = v_order_id AND oi.variant_id IS NOT NULL;
    END IF;
    
    -- Update webhook event status if provided
    IF p_webhook_event_id IS NOT NULL THEN
        UPDATE webhook_events SET status = 'completed', processed_at = NOW(), updated_at = NOW() WHERE id = p_webhook_event_id;
    END IF;
    
    -- Update payment intent status
    UPDATE payment_intents SET status = 'succeeded', updated_at = NOW() WHERE payment_intent_id = p_payment_intent_id;
    
    RETURN jsonb_build_object(
        'success', true, 
        'order_id', v_order_id, 
        'order_number', v_order_number, 
        'items_processed', v_items_processed,
        'total_cents', v_total_amount::INTEGER, 
        'user_id', v_user_id
    );
EXCEPTION
    WHEN OTHERS THEN
        IF v_order_id IS NOT NULL THEN
            UPDATE orders SET status = 'canceled', metadata = jsonb_build_object('error', SQLERRM, 'error_detail', SQLSTATE, 'original_metadata', metadata) WHERE id = v_order_id;
        END IF;
        IF p_webhook_event_id IS NOT NULL THEN
            UPDATE webhook_events SET status = 'failed', error_message = SQLERRM, updated_at = NOW() WHERE id = p_webhook_event_id;
        END IF;
        RAISE;
END;
$$;


ALTER FUNCTION "public"."process_order_with_occ"("p_payment_intent_id" "text", "p_webhook_event_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."process_order_with_occ"("p_payment_intent_id" "text", "p_webhook_event_id" "uuid") IS 'Creates order from payment intent, handling both products and booking reservations.
Products: cart_items → order_items
Bookings: booking_reservations → bookings
Clears both after successful order creation.';



CREATE OR REPLACE FUNCTION "public"."process_rating_update_job"("p_job_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_job RECORD;
    v_result jsonb;
BEGIN
    -- Lock and validate job
    SELECT * INTO v_job
    FROM job_queue
    WHERE id = p_job_id
        AND job_type = 'update_product_rating'
        AND status IN ('pending', 'processing')
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Job not found or already processed'
        );
    END IF;

    -- Update job status to processing
    UPDATE job_queue
    SET 
        status = 'processing',
        started_at = NOW(),
        locked_until = NOW() + INTERVAL '5 minutes',
        locked_by = 'rating_processor'
    WHERE id = p_job_id;

    -- Execute the rating update
    v_result := public.update_product_rating_stats(
        (v_job.payload->>'product_id')::UUID
    );

    -- Update job based on result
    IF v_result->>'success' = 'true' THEN
        UPDATE job_queue
        SET 
            status = 'completed',
            completed_at = NOW(),
            locked_until = NULL,
            locked_by = NULL
        WHERE id = p_job_id;
    ELSE
        UPDATE job_queue
        SET 
            status = CASE
                WHEN attempts >= max_attempts THEN 'failed'
                ELSE 'pending'
            END,
            attempts = attempts + 1,
            last_error = v_result->>'error',
            failed_at = CASE
                WHEN attempts >= max_attempts THEN NOW()
                ELSE NULL
            END,
            locked_until = NULL,
            locked_by = NULL
        WHERE id = p_job_id;
    END IF;

    RETURN v_result;
END;
$$;


ALTER FUNCTION "public"."process_rating_update_job"("p_job_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."process_rating_update_job"("p_job_id" "uuid") IS 'Processes rating update jobs from the queue with proper locking.
Manages job lifecycle: pending -> processing -> completed/failed.
Implements retry logic with exponential backoff.
Safe for concurrent execution by multiple workers.';



CREATE OR REPLACE FUNCTION "public"."reactivate_vendor"("p_vendor_id" "uuid", "p_notes" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'private', 'pg_temp'
    SET "statement_timeout" TO '5s'
    AS $$
DECLARE
  v_admin_id uuid;
  v_products_reactivated integer;
BEGIN
  v_admin_id := auth.uid();
  
  -- Verify admin
  PERFORM private.assert_admin();
  
  -- Check if vendor exists
  IF NOT EXISTS (SELECT 1 FROM vendor_profiles WHERE user_id = p_vendor_id) THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Vendor not found'
    );
  END IF;
  
  -- Update vendor status to verified
  UPDATE vendor_profiles
  SET 
    verification_status = 'verified',
    updated_at = now()
  WHERE user_id = p_vendor_id;
  
  -- Reactivate vendor role
  UPDATE user_roles
  SET is_active = true
  WHERE user_id = p_vendor_id
  AND role_id = (SELECT id FROM roles WHERE name = 'vendor');
  
  -- Increment role version to trigger JWT refresh
  UPDATE user_profiles 
  SET role_version = role_version + 1 
  WHERE id = p_vendor_id;
  
  -- Reactivate all vendor products
  UPDATE products
  SET is_active = true
  WHERE vendor_id = p_vendor_id AND is_active = false;
  
  GET DIAGNOSTICS v_products_reactivated = ROW_COUNT;
  
  -- Audit log
  INSERT INTO user_audit_log (user_id, action, resource_type, resource_id, new_values)
  VALUES (
    v_admin_id,
    'vendor_reactivated',
    'vendor_profile',
    p_vendor_id,
    jsonb_build_object(
      'vendor_id', p_vendor_id,
      'notes', p_notes,
      'products_reactivated', v_products_reactivated
    )
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'message', 'Vendor reactivated successfully',
    'products_reactivated', v_products_reactivated
  );
END;
$$;


ALTER FUNCTION "public"."reactivate_vendor"("p_vendor_id" "uuid", "p_notes" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."reactivate_vendor"("p_vendor_id" "uuid", "p_notes" "text") IS 'Allows admin to reverse vendor rejection and reactivate all products';



CREATE OR REPLACE FUNCTION "public"."reconcile_review_vote_counts"("p_review_id" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_reconciled_count INTEGER := 0;
    v_review RECORD;
BEGIN
    -- Reconcile specific review or batch process
    FOR v_review IN
        SELECT 
            r.id,
            r.helpful_votes AS denorm_helpful,
            r.unhelpful_votes AS denorm_unhelpful,
            COALESCE(SUM(s.helpful_count), 0) AS shard_helpful,
            COALESCE(SUM(s.unhelpful_count), 0) AS shard_unhelpful
        FROM reviews r
        LEFT JOIN review_vote_shards s ON s.review_id = r.id
        WHERE (p_review_id IS NULL OR r.id = p_review_id)
            AND r.deleted_at IS NULL
        GROUP BY r.id, r.helpful_votes, r.unhelpful_votes
        HAVING r.helpful_votes != COALESCE(SUM(s.helpful_count), 0)
            OR r.unhelpful_votes != COALESCE(SUM(s.unhelpful_count), 0)
        LIMIT 100  -- Process in batches to avoid long transactions
    LOOP
        UPDATE reviews
        SET 
            helpful_votes = v_review.shard_helpful,
            unhelpful_votes = v_review.shard_unhelpful
        WHERE id = v_review.id;
        
        v_reconciled_count := v_reconciled_count + 1;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'reconciled_count', v_reconciled_count,
        'message', CASE
            WHEN v_reconciled_count = 0 THEN 'All counts already synchronized'
            ELSE 'Reconciled ' || v_reconciled_count || ' review vote counts'
        END
    );
END;
$$;


ALTER FUNCTION "public"."reconcile_review_vote_counts"("p_review_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."reconcile_review_vote_counts"("p_review_id" "uuid") IS 'Reconciles denormalized vote counts with source of truth in shards.
Processes in batches of 100 to avoid long-running transactions.
Should be run periodically (e.g., hourly) to maintain consistency.
Safe to run concurrently - uses non-blocking updates.';



CREATE OR REPLACE FUNCTION "public"."refresh_user_jwt_claims"("user_uuid" "uuid") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
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


ALTER FUNCTION "public"."refresh_user_jwt_claims"("user_uuid" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."refresh_user_jwt_claims"("user_uuid" "uuid") IS 'Refreshes JWT custom claims when user roles or role_version changes. Called automatically by trigger.';



CREATE OR REPLACE FUNCTION "public"."reject_payout_request"("p_request_id" "uuid", "p_rejection_reason" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'private', 'pg_temp'
    AS $$
DECLARE
  v_admin_id uuid;
  -- REMOVED: v_is_admin boolean;
  v_request payout_requests%ROWTYPE;
BEGIN
  v_admin_id := auth.uid();

  -- ✅ FIX: Standardized admin check (replaces manual check)
  PERFORM private.assert_admin();

  -- Get request details
  SELECT * INTO v_request
  FROM payout_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Payout request not found'
    );
  END IF;

  -- Verify status is pending
  IF v_request.status != 'pending' THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Only pending requests can be rejected',
      'current_status', v_request.status
    );
  END IF;

  -- Validate rejection reason
  IF p_rejection_reason IS NULL OR length(trim(p_rejection_reason)) < 10 THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Rejection reason must be at least 10 characters'
    );
  END IF;

  -- Update request status
  UPDATE payout_requests
  SET 
    status = 'rejected',
    reviewed_by = v_admin_id,
    reviewed_at = NOW(),
    rejection_reason = p_rejection_reason,
    updated_at = NOW()
  WHERE id = p_request_id;

  -- Audit log
  INSERT INTO private.audit_log (
    table_name, record_id, action, old_values, new_values, user_id
  ) VALUES (
    'payout_requests', p_request_id, 'UPDATE',
    jsonb_build_object(
      'status', 'pending',
      'action_type', 'payout_rejection'
    ),
    jsonb_build_object(
      'status', 'rejected',
      'rejected_by', v_admin_id,
      'rejection_reason', p_rejection_reason,
      'action_type', 'payout_rejection'
    ),
    v_admin_id
  );

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Payout request rejected',
    'request_id', p_request_id
  );
END;
$$;


ALTER FUNCTION "public"."reject_payout_request"("p_request_id" "uuid", "p_rejection_reason" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."reject_payout_request"("p_request_id" "uuid", "p_rejection_reason" "text") IS 'Admin-only function to reject payout requests with reason';



CREATE OR REPLACE FUNCTION "public"."reject_vendor"("p_vendor_id" "uuid", "p_reason" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'private', 'pg_temp'
    SET "statement_timeout" TO '5s'
    AS $$
DECLARE
  v_admin_id uuid;
  v_products_deactivated integer;
BEGIN
  v_admin_id := auth.uid();
  
  -- Verify admin
  PERFORM private.assert_admin();
  
  IF NOT EXISTS (SELECT 1 FROM vendor_profiles WHERE user_id = p_vendor_id) THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Vendor not found'
    );
  END IF;
  
  UPDATE vendor_profiles
  SET 
    verification_status = 'rejected',
    updated_at = now()
  WHERE user_id = p_vendor_id;
  
  UPDATE user_roles
  SET is_active = false
  WHERE user_id = p_vendor_id
  AND role_id = (SELECT id FROM roles WHERE name = 'vendor');
  
  UPDATE user_profiles 
  SET role_version = role_version + 1 
  WHERE id = p_vendor_id;
  
  -- ADDED: Deactivate all vendor products when rejected
  UPDATE products
  SET is_active = false
  WHERE vendor_id = p_vendor_id AND is_active = true;
  
  GET DIAGNOSTICS v_products_deactivated = ROW_COUNT;
  
  INSERT INTO user_audit_log (user_id, action, resource_type, resource_id, old_values)
  VALUES (
    v_admin_id,
    'vendor_rejected',
    'vendor_profile',
    p_vendor_id,
    jsonb_build_object(
      'vendor_id', p_vendor_id,
      'reason', p_reason,
      'products_deactivated', v_products_deactivated
    )
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'message', 'Vendor application rejected',
    'products_deactivated', v_products_deactivated
  );
END;
$$;


ALTER FUNCTION "public"."reject_vendor"("p_vendor_id" "uuid", "p_reason" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."reject_vendor"("p_vendor_id" "uuid", "p_reason" "text") IS 'Fixed: Now deactivates all vendor products when rejected';



CREATE OR REPLACE FUNCTION "public"."reject_vendor_document"("p_document_id" "uuid", "p_reason" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth', 'private', 'pg_temp'
    AS $$
DECLARE
    v_admin_id UUID;
BEGIN
    v_admin_id := auth.uid();
    
    IF NOT public.user_has_role(v_admin_id, 'admin') THEN
        RAISE EXCEPTION 'Unauthorized: Admin access required';
    END IF;
    
    IF p_reason IS NULL OR LENGTH(TRIM(p_reason)) < 5 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Rejection reason required');
    END IF;
    
    UPDATE vendor_documents
    SET 
        status = 'rejected',
        verified_by = v_admin_id,
        rejection_reason = p_reason,
        updated_at = NOW()
    WHERE id = p_document_id;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Document not found');
    END IF;
    
    RETURN jsonb_build_object('success', true, 'message', 'Document rejected');
END;
$$;


ALTER FUNCTION "public"."reject_vendor_document"("p_document_id" "uuid", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reject_vendor_enhanced"("p_vendor_id" "uuid", "p_reason" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth', 'private', 'pg_temp'
    SET "statement_timeout" TO '5s'
    AS $$
DECLARE v_admin_id UUID; v_business_name TEXT; v_current_state TEXT;
BEGIN
    v_admin_id := auth.uid();
    IF NOT private.assert_admin() THEN RAISE EXCEPTION 'Unauthorized'; END IF;
    IF p_reason IS NULL OR LENGTH(TRIM(p_reason)) < 10 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Reason must be at least 10 characters');
    END IF;
    SELECT application_state, business_name INTO v_current_state, v_business_name
    FROM vendor_profiles WHERE user_id = p_vendor_id FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Vendor not found'); END IF;
    IF v_current_state NOT IN ('submitted', 'under_review', 'info_requested') THEN
        RETURN jsonb_build_object('success', false, 'error', format('Cannot reject in state: %s', v_current_state));
    END IF;
    UPDATE vendor_profiles SET application_state = 'rejected', verification_status = 'rejected',
        application_reviewed_at = NOW(), application_reviewed_by = v_admin_id,
        application_notes = p_reason, updated_at = NOW() WHERE user_id = p_vendor_id;
    UPDATE user_roles SET is_active = false WHERE user_id = p_vendor_id
        AND role_id = (SELECT id FROM roles WHERE name = 'vendor');
    UPDATE user_profiles SET role_version = role_version + 1 WHERE id = p_vendor_id;
    INSERT INTO user_audit_log (user_id, action, resource_type, resource_id, old_values)
    VALUES (v_admin_id, 'vendor_rejected', 'vendor_profile', p_vendor_id, jsonb_build_object('reason', p_reason));
    RETURN jsonb_build_object('success', true, 'message', 'Vendor rejected');
END;
$$;


ALTER FUNCTION "public"."reject_vendor_enhanced"("p_vendor_id" "uuid", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."release_inventory_reservation"("p_payment_intent_id" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
    v_payment_intent RECORD;
    v_released_count INT := 0;
BEGIN
    -- Get payment intent details
    SELECT * INTO v_payment_intent
    FROM payment_intents
    WHERE payment_intent_id = p_payment_intent_id
        AND inventory_reserved = true;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'No active reservation found'
        );
    END IF;
    
    -- Release all reserved inventory for this cart
    WITH released AS (
        UPDATE inventory i
        SET 
            quantity_reserved = GREATEST(i.quantity_reserved - ci.quantity, 0),
            updated_at = NOW()
        FROM cart_items ci
        WHERE ci.cart_id = v_payment_intent.cart_id
            AND i.variant_id = ci.variant_id
        RETURNING i.variant_id
    )
    SELECT COUNT(*) INTO v_released_count FROM released;
    
    -- Mark reservation as released
    UPDATE payment_intents
    SET 
        inventory_reserved = false,
        updated_at = NOW()
    WHERE payment_intent_id = p_payment_intent_id;
    
    RETURN jsonb_build_object(
        'success', true,
        'message', 'Inventory reservation released',
        'released_items', v_released_count
    );
END;
$$;


ALTER FUNCTION "public"."release_inventory_reservation"("p_payment_intent_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."remove_cart_item_by_id_secure"("p_cart_item_id" "uuid", "p_user_id" "uuid" DEFAULT NULL::"uuid", "p_guest_token" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_cart_id UUID;
BEGIN
  -- Get the cart ID
  v_cart_id := public.get_or_create_cart_secure(p_user_id, p_guest_token);
  
  -- Delete the specific cart item (only if it belongs to this cart)
  DELETE FROM cart_items
  WHERE id = p_cart_item_id
    AND cart_id = v_cart_id;
  
  -- Return success
  RETURN jsonb_build_object(
    'success', true,
    'message', 'Item removed successfully'
  );
END;
$$;


ALTER FUNCTION "public"."remove_cart_item_by_id_secure"("p_cart_item_id" "uuid", "p_user_id" "uuid", "p_guest_token" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."remove_cart_item_by_id_secure"("p_cart_item_id" "uuid", "p_user_id" "uuid", "p_guest_token" "text") IS 'Removes a specific cart item by its cart_items.id. This is more precise than removing by variant_id, especially for combo items where multiple cart items may have the same variant_id.';



CREATE OR REPLACE FUNCTION "public"."remove_combo_from_cart_secure"("p_combo_group_id" "uuid", "p_user_id" "uuid" DEFAULT NULL::"uuid", "p_guest_token" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_cart_id UUID;
  v_deleted_count INTEGER;
  v_combo_name TEXT;
BEGIN
  -- Validate we have either user_id or guest_token
  IF p_user_id IS NULL AND p_guest_token IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'User ID or guest token required');
  END IF;

  -- Get cart
  IF p_user_id IS NOT NULL THEN
    SELECT id INTO v_cart_id FROM carts WHERE user_id = p_user_id;
  ELSE
    SELECT id INTO v_cart_id FROM carts WHERE session_id = p_guest_token;
  END IF;
  
  IF v_cart_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Cart not found');
  END IF;
  
  -- Get combo name for response
  SELECT p.name INTO v_combo_name
  FROM cart_items ci
  JOIN products p ON ci.combo_id = p.id
  WHERE ci.cart_id = v_cart_id AND ci.combo_group_id = p_combo_group_id
  LIMIT 1;
  
  -- Remove all items in the combo group
  WITH deleted AS (
    DELETE FROM cart_items 
    WHERE cart_id = v_cart_id AND combo_group_id = p_combo_group_id
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_deleted_count FROM deleted;
  
  IF v_deleted_count = 0 THEN
    RETURN jsonb_build_object('success', false, 'message', 'Combo group not found in cart');
  END IF;
  
  -- Update cart timestamp
  UPDATE carts SET updated_at = now() WHERE id = v_cart_id;
  
  RETURN jsonb_build_object(
    'success', true, 
    'items_removed', v_deleted_count,
    'combo_name', v_combo_name
  );
END;
$$;


ALTER FUNCTION "public"."remove_combo_from_cart_secure"("p_combo_group_id" "uuid", "p_user_id" "uuid", "p_guest_token" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."remove_combo_from_cart_secure"("p_combo_group_id" "uuid", "p_user_id" "uuid", "p_guest_token" "text") IS 'Removes all items belonging to a combo group from the cart';



CREATE OR REPLACE FUNCTION "public"."remove_item_secure"("p_variant_id" "uuid", "p_user_id" "uuid" DEFAULT NULL::"uuid", "p_guest_token" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_cart_id UUID;
BEGIN
  v_cart_id := public.get_or_create_cart_secure(p_user_id, p_guest_token);
  DELETE FROM cart_items WHERE cart_id = v_cart_id AND variant_id = p_variant_id;
  RETURN jsonb_build_object('success', true, 'message', 'Item removed');
END;
$$;


ALTER FUNCTION "public"."remove_item_secure"("p_variant_id" "uuid", "p_user_id" "uuid", "p_guest_token" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."request_availability_override"("p_stylist_id" "uuid", "p_target_date" "date", "p_is_closed" boolean DEFAULT true, "p_reason" "text" DEFAULT NULL::"text", "p_is_emergency" boolean DEFAULT false) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'private', 'pg_temp'
    AS $$
DECLARE
  v_budget_record RECORD;
  v_override_id UUID;
  v_lock_acquired BOOLEAN;
  v_lock_key BIGINT;
BEGIN
  -- CONCURRENCY FIX: Acquire advisory lock
  v_lock_key := hashtext(p_stylist_id::text || '_override_budget');
  SELECT pg_try_advisory_xact_lock(v_lock_key) INTO v_lock_acquired;
  
  IF NOT v_lock_acquired THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Another override request is currently being processed. Please try again in a moment.',
      'code', 'CONCURRENT_REQUEST_IN_PROGRESS'
    );
  END IF;
  
  -- SECURITY: Verify stylist role
  IF NOT public.user_has_role(p_stylist_id, 'stylist') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: Stylist role required', 'code', 'UNAUTHORIZED');
  END IF;

  -- SECURITY: Verify active stylist profile
  IF NOT EXISTS (SELECT 1 FROM public.stylist_profiles WHERE user_id = p_stylist_id AND is_active = true) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Stylist profile not found or inactive', 'code', 'NOT_FOUND');
  END IF;

  -- VALIDATION: Date must be in future
  IF p_target_date < CURRENT_DATE THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot request override for past dates', 'code', 'INVALID_DATE');
  END IF;

  -- BUDGET CHECK: Get or initialize budget (with FOR UPDATE lock)
  SELECT monthly_override_limit, current_month_overrides, emergency_overrides_remaining, budget_reset_at
  INTO v_budget_record FROM public.stylist_override_budgets WHERE stylist_user_id = p_stylist_id FOR UPDATE;

  IF v_budget_record IS NULL THEN
    INSERT INTO public.stylist_override_budgets (stylist_user_id)
    VALUES (p_stylist_id)
    RETURNING monthly_override_limit, current_month_overrides, emergency_overrides_remaining, budget_reset_at
    INTO v_budget_record;
  END IF;

  -- Check if monthly budget reset is needed
  IF v_budget_record.budget_reset_at <= NOW() THEN
    UPDATE public.stylist_override_budgets
    SET current_month_overrides = 0, budget_reset_at = date_trunc('month', NOW() + INTERVAL '1 month'), updated_at = NOW()
    WHERE stylist_user_id = p_stylist_id;
    
    SELECT monthly_override_limit, current_month_overrides, emergency_overrides_remaining, budget_reset_at
    INTO v_budget_record FROM public.stylist_override_budgets WHERE stylist_user_id = p_stylist_id;
  END IF;

  -- BUDGET ENFORCEMENT: Check availability
  IF p_is_emergency THEN
    IF v_budget_record.emergency_overrides_remaining <= 0 THEN
      RETURN jsonb_build_object('success', false, 'error', 'Emergency override budget exhausted', 'code', 'BUDGET_EXHAUSTED',
        'budget', jsonb_build_object('monthlyRemaining', v_budget_record.monthly_override_limit - v_budget_record.current_month_overrides,
          'emergencyRemaining', 0, 'resetsAt', v_budget_record.budget_reset_at));
    END IF;
  ELSE
    IF v_budget_record.current_month_overrides >= v_budget_record.monthly_override_limit THEN
      RETURN jsonb_build_object('success', false, 
        'error', format('Monthly override budget exhausted (%s/%s used)', v_budget_record.current_month_overrides, v_budget_record.monthly_override_limit),
        'code', 'BUDGET_EXHAUSTED',
        'budget', jsonb_build_object('monthlyRemaining', 0, 'emergencyRemaining', v_budget_record.emergency_overrides_remaining,
          'resetsAt', v_budget_record.budget_reset_at));
    END IF;
  END IF;

  -- CREATE OVERRIDE REQUEST
  -- BUG FIX: Priority was 900/950 but constraint allows 0-100
  -- Corrected: emergency=100 (max), regular=50 (medium)
  INSERT INTO public.schedule_overrides (
    override_type,
    applies_to_all_stylists,
    stylist_user_id,
    start_date,
    end_date,
    is_closed,
    priority,
    reason,
    created_by
  )
  VALUES (
    'stylist_vacation'::TEXT,
    FALSE,
    p_stylist_id,
    p_target_date,
    p_target_date,
    p_is_closed,
    CASE WHEN p_is_emergency THEN 100 ELSE 50 END,  -- FIX: Was 950/900, now 100/50
    COALESCE(p_reason, 'Stylist requested override'),
    p_stylist_id
  )
  RETURNING id INTO v_override_id;

  -- UPDATE BUDGET
  IF p_is_emergency THEN
    UPDATE public.stylist_override_budgets
    SET emergency_overrides_remaining = emergency_overrides_remaining - 1, last_override_at = NOW(), updated_at = NOW()
    WHERE stylist_user_id = p_stylist_id;
  ELSE
    UPDATE public.stylist_override_budgets
    SET current_month_overrides = current_month_overrides + 1, last_override_at = NOW(), updated_at = NOW()
    WHERE stylist_user_id = p_stylist_id;
  END IF;

  -- LOG CHANGE
  INSERT INTO private.schedule_change_log (
    stylist_user_id,
    change_date,
    change_type,
    reason,
    is_emergency,
    ip_address,
    user_agent
  )
  VALUES (
    p_stylist_id,
    p_target_date,
    'availability_override',
    p_reason,
    p_is_emergency,
    inet_client_addr(),
    current_setting('request.headers', true)::json->>'user-agent'
  );

  -- RETURN SUCCESS
  RETURN jsonb_build_object(
    'success', true,
    'overrideId', v_override_id,
    'budget', jsonb_build_object(
      'monthlyUsed', v_budget_record.current_month_overrides + CASE WHEN NOT p_is_emergency THEN 1 ELSE 0 END,
      'monthlyLimit', v_budget_record.monthly_override_limit,
      'monthlyRemaining', v_budget_record.monthly_override_limit - (v_budget_record.current_month_overrides + CASE WHEN NOT p_is_emergency THEN 1 ELSE 0 END),
      'emergencyRemaining', v_budget_record.emergency_overrides_remaining - CASE WHEN p_is_emergency THEN 1 ELSE 0 END,
      'resetsAt', v_budget_record.budget_reset_at
    ),
    'message', 'Override request created successfully'
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM, 'code', 'INTERNAL_ERROR');
END;
$$;


ALTER FUNCTION "public"."request_availability_override"("p_stylist_id" "uuid", "p_target_date" "date", "p_is_closed" boolean, "p_reason" "text", "p_is_emergency" boolean) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."request_availability_override"("p_stylist_id" "uuid", "p_target_date" "date", "p_is_closed" boolean, "p_reason" "text", "p_is_emergency" boolean) IS 'Allows stylists to request schedule overrides with budget tracking. RACE CONDITION FIX: Uses advisory lock to prevent concurrent budget bypasses. Normal: 10/month, Emergency: 3/lifetime.';



CREATE OR REPLACE FUNCTION "public"."request_payout"("p_amount_cents" bigint, "p_payment_method" "text", "p_payment_details" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth', 'pg_temp'
    AS $$
DECLARE
  v_vendor_id uuid;
  v_pending_balance jsonb;
  v_available_amount bigint;
  v_request_id uuid;
  v_recent_request_count int;
BEGIN
  v_vendor_id := auth.uid();

  -- Verify vendor role
  IF NOT EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN roles r ON r.id = ur.role_id
    WHERE ur.user_id = v_vendor_id
      AND r.name = 'vendor'
      AND ur.is_active = true
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Only vendors can request payouts'
    );
  END IF;

  -- ✅ FIX CRITICAL-1: Rate Limiting (max 5 requests per 24 hours)
  SELECT COUNT(*)
  INTO v_recent_request_count
  FROM payout_requests
  WHERE vendor_id = v_vendor_id
    AND created_at > NOW() - INTERVAL '24 hours';

  IF v_recent_request_count >= 5 THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Maximum 5 payout requests per 24 hours. Please wait and try again later.'
    );
  END IF;

  -- Calculate available balance
  v_pending_balance := calculate_vendor_pending_payout(v_vendor_id);
  v_available_amount := (v_pending_balance->>'pending_payout_cents')::bigint;

  -- Validate amount
  IF p_amount_cents > v_available_amount THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Requested amount exceeds available balance',
      'requested', p_amount_cents,
      'available', v_available_amount
    );
  END IF;

  IF p_amount_cents < 100000 THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Minimum payout amount is NPR 1,000'
    );
  END IF;

  -- ✅ FIX HIGH-1: Validate amount is whole cents (no fractional cents)
  IF p_amount_cents != FLOOR(p_amount_cents) THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Invalid amount: cannot have fractional cents'
    );
  END IF;

  -- Validate payment method
  IF p_payment_method NOT IN ('bank_transfer', 'esewa', 'khalti') THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Invalid payment method'
    );
  END IF;

  -- Check for pending requests
  IF EXISTS (
    SELECT 1 FROM payout_requests
    WHERE vendor_id = v_vendor_id
      AND status = 'pending'
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'You already have a pending payout request. Please wait for it to be processed.'
    );
  END IF;

  -- Create payout request
  INSERT INTO payout_requests (
    vendor_id,
    requested_amount_cents,
    payment_method,
    payment_details,
    status
  ) VALUES (
    v_vendor_id,
    p_amount_cents,
    p_payment_method,
    p_payment_details,
    'pending'
  ) RETURNING id INTO v_request_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Payout request submitted successfully',
    'request_id', v_request_id,
    'amount_cents', p_amount_cents,
    'status', 'pending'
  );
END;
$$;


ALTER FUNCTION "public"."request_payout"("p_amount_cents" bigint, "p_payment_method" "text", "p_payment_details" "jsonb") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."request_payout"("p_amount_cents" bigint, "p_payment_method" "text", "p_payment_details" "jsonb") IS 'Vendor payout request with rate limiting (max 5/24h) and validation';



CREATE OR REPLACE FUNCTION "public"."request_vendor_info"("p_vendor_id" "uuid", "p_requested_info" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth', 'private', 'pg_temp'
    SET "statement_timeout" TO '5s'
    AS $$
DECLARE v_admin_id UUID; v_business_name TEXT;
BEGIN
    v_admin_id := auth.uid();
    IF NOT private.assert_admin() THEN RAISE EXCEPTION 'Unauthorized'; END IF;
    IF p_requested_info IS NULL OR LENGTH(TRIM(p_requested_info)) < 10 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Info must be at least 10 characters');
    END IF;
    UPDATE vendor_profiles SET application_state = 'info_requested', application_notes = p_requested_info, updated_at = NOW()
    WHERE user_id = p_vendor_id AND application_state IN ('submitted', 'under_review')
    RETURNING business_name INTO v_business_name;
    IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Invalid state'); END IF;
    INSERT INTO job_queue (job_type, priority, payload, idempotency_key) VALUES
    ('send_vendor_info_request', 3, jsonb_build_object('vendor_id', p_vendor_id, 'requested_info', p_requested_info),
        'info_request_' || p_vendor_id::text || '_' || EXTRACT(EPOCH FROM NOW())::text);
    INSERT INTO user_audit_log (user_id, action, resource_type, resource_id, new_values)
    VALUES (v_admin_id, 'vendor_info_requested', 'vendor_profile', p_vendor_id, jsonb_build_object('requested_info', p_requested_info));
    RETURN jsonb_build_object('success', true, 'message', 'Info request sent');
END;
$$;


ALTER FUNCTION "public"."request_vendor_info"("p_vendor_id" "uuid", "p_requested_info" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."requeue_stale_jobs"() RETURNS TABLE("job_id" "uuid", "job_type" "text", "action" "text", "reason" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'private', 'metrics', 'pg_temp'
    AS $$
DECLARE
    v_job RECORD;
    v_action TEXT;
    v_reason TEXT;
BEGIN
    -- Find all jobs with expired locks
    -- Use jq alias to avoid ambiguity with RETURNS TABLE columns
    FOR v_job IN 
        SELECT 
            jq.id,
            jq.job_type,
            jq.attempts,
            jq.max_attempts,
            jq.locked_by,
            jq.locked_until,
            jq.created_at
        FROM job_queue jq
        WHERE jq.status = 'processing'
            AND jq.locked_until < NOW()
        ORDER BY jq.created_at ASC
    LOOP
        -- Decide whether to retry or fail
        IF v_job.attempts < v_job.max_attempts THEN
            -- Requeue for retry
            UPDATE job_queue
            SET 
                status = 'pending',
                attempts = v_job.attempts + 1,
                last_error = format('Stale lock timeout (locked_by: %s, expired: %s)', 
                    v_job.locked_by, v_job.locked_until),
                locked_by = NULL,
                locked_until = NULL
            WHERE id = v_job.id;
            
            v_action := 'requeued';
            v_reason := format('Lock expired, attempt %s/%s', 
                v_job.attempts + 1, v_job.max_attempts);
        ELSE
            -- Mark as failed (exhausted retries)
            UPDATE job_queue
            SET 
                status = 'failed',
                failed_at = NOW(),
                last_error = format('Max attempts exceeded after stale lock (locked_by: %s)', 
                    v_job.locked_by),
                locked_by = NULL,
                locked_until = NULL
            WHERE id = v_job.id;
            
            v_action := 'failed';
            v_reason := format('Max attempts exceeded (%s/%s)', 
                v_job.attempts, v_job.max_attempts);
        END IF;
        
        -- Return the action taken
        job_id := v_job.id;
        job_type := v_job.job_type;
        action := v_action;
        reason := v_reason;
        RETURN NEXT;
        
        -- Log for observability
        RAISE NOTICE 'Job % (%) %: %', 
            v_job.id, v_job.job_type, v_action, v_reason;
    END LOOP;
    
    RETURN;
END;
$$;


ALTER FUNCTION "public"."requeue_stale_jobs"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."requeue_stale_jobs"() IS 'Auto-healing function that detects and requeues jobs with expired locks.
Prevents jobs from being permanently stuck in processing state.
Safe to run concurrently - uses row-level locking.
Returns a table of actions taken for observability.';



CREATE OR REPLACE FUNCTION "public"."reserve_inventory_for_payment"("p_cart_id" "uuid", "p_payment_intent_id" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'private', 'metrics', 'pg_temp'
    AS $$
DECLARE
    v_reserved_items INT := 0;
    v_total_items INT := 0;
    v_insufficiency_details JSONB := '[]'::JSONB;
    v_item RECORD;
    v_variant_id_result UUID;
BEGIN
    -- Count total items in cart
    SELECT COUNT(*) INTO v_total_items
    FROM cart_items
    WHERE cart_id = p_cart_id;
    
    -- CRITICAL FIX: If no products, return success (booking-only checkout is valid)
    -- The create-order-intent function validates cart is not completely empty
    IF v_total_items = 0 THEN
        RETURN jsonb_build_object(
            'success', true,  -- ← FIXED: Was false, now true
            'message', 'No products to reserve (bookings-only cart)',
            'reserved_items', 0
        );
    END IF;
    
    -- Process each cart item in deterministic order (prevent deadlocks)
    FOR v_item IN 
        SELECT ci.variant_id, ci.quantity, pv.sku
        FROM cart_items ci
        JOIN product_variants pv ON pv.id = ci.variant_id
        WHERE ci.cart_id = p_cart_id
        ORDER BY ci.variant_id  -- Deterministic order
    LOOP
        -- Attempt to reserve inventory
        UPDATE inventory
        SET 
            quantity_reserved = quantity_reserved + v_item.quantity,
            updated_at = NOW()
        WHERE variant_id = v_item.variant_id
            AND quantity_available >= v_item.quantity
        RETURNING variant_id INTO v_variant_id_result;
        
        -- Check if reservation succeeded
        IF v_variant_id_result IS NOT NULL THEN
            v_reserved_items := v_reserved_items + 1;
        ELSE
            -- Build insufficiency details for error reporting
            v_insufficiency_details := v_insufficiency_details || 
                jsonb_build_object(
                    'variant_id', v_item.variant_id,
                    'sku', v_item.sku,
                    'requested', v_item.quantity
                );
        END IF;
    END LOOP;
    
    -- CRITICAL: Check if all items were reserved
    IF v_reserved_items < v_total_items THEN
        -- ATOMICITY FIX: Raise exception to rollback all reservations
        RAISE EXCEPTION 'Insufficient inventory for % item(s): %', 
            v_total_items - v_reserved_items,
            v_insufficiency_details::TEXT;
    END IF;
    
    -- Mark payment intent as having reserved inventory (only if we actually reserved something)
    IF v_total_items > 0 THEN
        UPDATE payment_intents
        SET 
            inventory_reserved = true,
            reserved_at = NOW(),
            reservation_expires_at = NOW() + INTERVAL '15 minutes',
            updated_at = NOW()
        WHERE payment_intent_id = p_payment_intent_id;
    END IF;
    
    RETURN jsonb_build_object(
        'success', true,
        'message', 'Inventory reserved successfully',
        'reserved_items', v_reserved_items,
        'payment_intent_id', p_payment_intent_id
    );
    
EXCEPTION
    WHEN OTHERS THEN
        -- Any exception will automatically rollback the transaction
        -- This ensures atomicity - all or nothing
        RAISE;  -- Re-raise the exception for proper error handling
END;
$$;


ALTER FUNCTION "public"."reserve_inventory_for_payment"("p_cart_id" "uuid", "p_payment_intent_id" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."reserve_inventory_for_payment"("p_cart_id" "uuid", "p_payment_intent_id" "text") IS 'ENTERPRISE GRADE: Atomically reserves inventory for payment.
CRITICAL FIX: Uses RAISE EXCEPTION for automatic rollback instead of manual loop.
If ANY item cannot be reserved, PostgreSQL automatically rolls back ALL changes.
This guarantees true atomicity - either all items reserved or none.';



CREATE OR REPLACE FUNCTION "public"."revoke_user_role"("p_user_id" "uuid", "p_role_name" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'private', 'pg_temp'
    SET "statement_timeout" TO '5s'
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
  
  -- Verify admin (FIXED)
  PERFORM private.assert_admin();
  
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
  INSERT INTO public.user_audit_log (user_id, action, resource_type, resource_id, old_values)
  VALUES (
    v_admin_id,
    'role_revoked',
    'user_role',
    p_user_id,
    jsonb_build_object('role', p_role_name, 'target_user_id', p_user_id)
  );
  
  RETURN jsonb_build_object(
    'success', true, 
    'message', 'Role revoked successfully'
  );
END;
$$;


ALTER FUNCTION "public"."revoke_user_role"("p_user_id" "uuid", "p_role_name" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."revoke_user_role"("p_user_id" "uuid", "p_role_name" "text") IS 'Fixed: IF NOT assert_admin() → PERFORM assert_admin()';



CREATE OR REPLACE FUNCTION "public"."save_stylist_services"("p_stylist_user_id" "uuid", "p_service_ids" "uuid"[], "p_admin_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_service_id UUID;
  v_inserted_count INTEGER := 0;
BEGIN
  -- Verify admin has admin role
  IF NOT public.user_has_role(p_admin_id, 'admin') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Unauthorized: Admin role required',
      'code', 'UNAUTHORIZED'
    );
  END IF;

  -- Verify stylist profile exists
  IF NOT EXISTS (SELECT 1 FROM public.stylist_profiles WHERE user_id = p_stylist_user_id) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Stylist profile not found',
      'code', 'NOT_FOUND'
    );
  END IF;

  -- Delete existing service assignments (clean slate approach)
  DELETE FROM public.stylist_services
  WHERE stylist_user_id = p_stylist_user_id;

  -- Insert new service assignments
  FOREACH v_service_id IN ARRAY p_service_ids
  LOOP
    INSERT INTO public.stylist_services (
      stylist_user_id,
      service_id,
      is_available
    )
    VALUES (
      p_stylist_user_id,
      v_service_id,
      TRUE
    )
    ON CONFLICT (stylist_user_id, service_id) DO UPDATE
    SET is_available = TRUE;
    
    v_inserted_count := v_inserted_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'services_count', v_inserted_count,
    'message', format('%s services assigned to stylist', v_inserted_count)
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM,
    'code', 'INTERNAL_ERROR'
  );
END;
$$;


ALTER FUNCTION "public"."save_stylist_services"("p_stylist_user_id" "uuid", "p_service_ids" "uuid"[], "p_admin_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."save_stylist_services"("p_stylist_user_id" "uuid", "p_service_ids" "uuid"[], "p_admin_id" "uuid") IS 'Saves service selections for a stylist during onboarding. Admin-only function.';



CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."should_request_review"("p_order_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  RETURN NOT EXISTS (
    SELECT 1 
    FROM reviews r
    INNER JOIN order_items oi ON oi.product_id = r.product_id
    WHERE oi.order_id = p_order_id
    AND r.user_id = (SELECT user_id FROM orders WHERE id = p_order_id)
    AND r.deleted_at IS NULL
  );
END;
$$;


ALTER FUNCTION "public"."should_request_review"("p_order_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."should_request_review"("p_order_id" "uuid") IS 'Check if order is eligible for review request. Returns false if customer already reviewed any item.';



CREATE OR REPLACE FUNCTION "public"."submit_rating_atomic"("p_booking_id" "uuid", "p_rating" integer, "p_review_text" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_rating_id UUID;
  v_stylist_id UUID;
  v_customer_id UUID;
BEGIN
  v_customer_id := auth.uid();
  
  IF v_customer_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  
  SELECT stylist_user_id INTO v_stylist_id
  FROM bookings
  WHERE id = p_booking_id
    AND customer_user_id = v_customer_id
    AND status = 'completed';
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found, not yours, or not completed';
  END IF;
  
  IF EXISTS (SELECT 1 FROM stylist_ratings WHERE booking_id = p_booking_id) THEN
    RAISE EXCEPTION 'You have already rated this booking';
  END IF;
  
  IF p_rating < 1 OR p_rating > 5 THEN
    RAISE EXCEPTION 'Rating must be between 1 and 5';
  END IF;
  
  IF p_review_text IS NOT NULL AND LENGTH(p_review_text) > 1000 THEN
    RAISE EXCEPTION 'Review text must be 1000 characters or less';
  END IF;
  
  INSERT INTO stylist_ratings (
    booking_id,
    customer_user_id,
    stylist_user_id,
    rating,
    review_text,
    is_approved,
    moderation_status
  ) VALUES (
    p_booking_id,
    v_customer_id,
    v_stylist_id,
    p_rating,
    p_review_text,
    true,
    'approved'
  )
  RETURNING id INTO v_rating_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'rating_id', v_rating_id,
    'message', 'Rating submitted successfully'
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$;


ALTER FUNCTION "public"."submit_rating_atomic"("p_booking_id" "uuid", "p_rating" integer, "p_review_text" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."submit_review_secure"("p_product_id" "uuid", "p_order_id" "uuid", "p_rating" integer, "p_title" "text" DEFAULT NULL::"text", "p_comment" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_user_id UUID;
    v_order_item_id UUID;
    v_review_id UUID;
    v_user_reputation RECORD;
    v_item_status TEXT;
    v_item_delivered_at TIMESTAMPTZ;
    v_days_since_delivery INTEGER;
    v_is_update BOOLEAN := false;
BEGIN
    -- DEFENSIVE LAYER 1: Authentication
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE LOG 'Unauthenticated review submission attempt for product %', p_product_id;
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Authentication required',
            'error_code', 'AUTH_REQUIRED'
        );
    END IF;

    -- DEFENSIVE LAYER 2: Input Validation
    IF p_rating IS NULL OR p_rating < 1 OR p_rating > 5 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Rating must be between 1 and 5',
            'error_code', 'INVALID_RATING'
        );
    END IF;

    -- Sanitize text inputs
    p_title := NULLIF(TRIM(p_title), '');
    p_comment := NULLIF(TRIM(p_comment), '');

    -- DEFENSIVE LAYER 3: Comprehensive Order Validation
    -- CRITICAL FIX: Check order_items.fulfillment_status instead of order.status
    WITH order_validation AS (
        SELECT 
            oi.id AS order_item_id,
            oi.fulfillment_status,
            oi.delivered_at,
            EXTRACT(days FROM NOW() - COALESCE(oi.delivered_at, o.delivered_at))::INTEGER AS days_since_delivery,
            EXISTS (
                SELECT 1 FROM reviews r 
                WHERE r.product_id = p_product_id 
                AND r.user_id = v_user_id 
                AND r.deleted_at IS NULL
            ) AS has_existing_review
        FROM orders o
        INNER JOIN order_items oi ON oi.order_id = o.id
        WHERE o.id = p_order_id
            AND o.user_id = v_user_id  -- CRITICAL: Verify ownership
            AND oi.product_id = p_product_id
        LIMIT 1
    )
    SELECT 
        order_item_id, 
        fulfillment_status,
        delivered_at,
        days_since_delivery,
        has_existing_review
    INTO 
        v_order_item_id, 
        v_item_status,
        v_item_delivered_at,
        v_days_since_delivery,
        v_is_update
    FROM order_validation;

    -- Validate order exists and is owned by user
    IF v_order_item_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Unable to verify purchase',
            'error_code', 'PURCHASE_NOT_VERIFIED'
        );
    END IF;

    -- CRITICAL FIX: Check item fulfillment status (not order status)
    IF v_item_status != 'delivered' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Review can only be submitted for delivered items',
            'error_code', 'ITEM_NOT_DELIVERED'
        );
    END IF;

    -- Check review window (90 days from item delivery)
    IF v_days_since_delivery > 90 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Review period has expired',
            'error_code', 'REVIEW_PERIOD_EXPIRED'
        );
    END IF;

    -- DEFENSIVE LAYER 4: Get User Reputation
    SELECT 
        overall_score,
        warnings_count,
        consecutive_approved
    INTO v_user_reputation
    FROM user_reputation
    WHERE user_id = v_user_id;

    -- Create default reputation if not exists
    IF NOT FOUND THEN
        INSERT INTO user_reputation (user_id, overall_score)
        VALUES (v_user_id, 50.00)
        RETURNING overall_score, warnings_count, consecutive_approved
        INTO v_user_reputation;
    END IF;

    -- DEFENSIVE LAYER 5: Upsert with Race Condition Protection
    BEGIN
        IF v_is_update THEN
            -- Update existing review
            UPDATE reviews 
            SET 
                rating = p_rating,
                title = COALESCE(SUBSTRING(p_title FROM 1 FOR 200), title),
                comment = COALESCE(p_comment, comment),
                is_edited = true,
                edit_count = edit_count + 1,
                last_edited_at = NOW(),
                updated_at = NOW(),
                is_approved = CASE 
                    WHEN v_user_reputation.overall_score >= 80 THEN true
                    ELSE false 
                END,
                moderation_status = CASE
                    WHEN v_user_reputation.overall_score >= 80 THEN 'approved'
                    ELSE 'edited'
                END,
                moderated_at = CASE
                    WHEN v_user_reputation.overall_score >= 80 THEN NOW()
                    ELSE NULL
                END
            WHERE product_id = p_product_id 
                AND user_id = v_user_id
                AND deleted_at IS NULL
            RETURNING id INTO v_review_id;

            IF v_review_id IS NULL THEN
                RAISE EXCEPTION 'Review no longer exists';
            END IF;
        ELSE
            -- Insert new review
            INSERT INTO reviews (
                product_id,
                user_id,
                order_id,
                order_item_id,
                rating,
                title,
                comment,
                is_approved,
                moderation_status,
                moderated_at,
                moderated_by
            ) VALUES (
                p_product_id,
                v_user_id,
                p_order_id,
                v_order_item_id,
                p_rating,
                SUBSTRING(p_title FROM 1 FOR 200),
                p_comment,
                CASE 
                    WHEN v_user_reputation.overall_score >= 80 
                     AND v_user_reputation.consecutive_approved >= 5 THEN true
                    ELSE false 
                END,
                CASE 
                    WHEN v_user_reputation.overall_score >= 80 
                     AND v_user_reputation.consecutive_approved >= 5 THEN 'approved'
                    ELSE 'pending' 
                END,
                CASE 
                    WHEN v_user_reputation.overall_score >= 80 
                     AND v_user_reputation.consecutive_approved >= 5 THEN NOW()
                    ELSE NULL 
                END,
                CASE 
                    WHEN v_user_reputation.overall_score >= 80 
                     AND v_user_reputation.consecutive_approved >= 5 THEN v_user_id
                    ELSE NULL 
                END
            )
            RETURNING id INTO v_review_id;
        END IF;
    EXCEPTION
        WHEN unique_violation THEN
            UPDATE reviews 
            SET 
                rating = p_rating,
                title = COALESCE(SUBSTRING(p_title FROM 1 FOR 200), title),
                comment = COALESCE(p_comment, comment),
                is_edited = true,
                edit_count = edit_count + 1,
                last_edited_at = NOW(),
                updated_at = NOW()
            WHERE product_id = p_product_id 
                AND user_id = v_user_id
                AND deleted_at IS NULL
            RETURNING id INTO v_review_id;
            
            v_is_update := true;
    END;

    -- DEFENSIVE LAYER 6: Intelligent Job Queueing
    IF v_user_reputation.overall_score < 80 OR v_user_reputation.consecutive_approved < 5 THEN
        INSERT INTO job_queue (
            job_type,
            priority,
            payload,
            idempotency_key,
            max_attempts
        ) VALUES (
            'moderate_review',
            CASE 
                WHEN v_user_reputation.warnings_count > 2 THEN 8
                WHEN v_user_reputation.overall_score >= 70 THEN 3
                ELSE 5
            END,
            jsonb_build_object(
                'review_id', v_review_id,
                'user_reputation_score', v_user_reputation.overall_score,
                'is_edit', v_is_update
            ),
            'moderate_' || v_review_id::text || '_' || date_trunc('hour', NOW())::text,
            3
        ) ON CONFLICT (idempotency_key) DO NOTHING;
    END IF;

    INSERT INTO job_queue (
        job_type,
        priority,
        payload,
        idempotency_key,
        max_attempts
    ) VALUES (
        'update_product_rating',
        7,
        jsonb_build_object(
            'product_id', p_product_id,
            'trigger', 'new_review',
            'review_id', v_review_id
        ),
        'rating_' || p_product_id::text || '_' || date_trunc('minute', NOW())::text,
        5
    ) ON CONFLICT (idempotency_key) DO NOTHING;

    RETURN jsonb_build_object(
        'success', true,
        'review_id', v_review_id,
        'is_update', v_is_update,
        'status', CASE 
            WHEN v_user_reputation.overall_score >= 80 
             AND v_user_reputation.consecutive_approved >= 5 THEN 'approved'
            ELSE 'pending_moderation' 
        END,
        'message', CASE
            WHEN v_is_update THEN 'Review updated successfully'
            ELSE 'Review submitted successfully'
        END
    );

EXCEPTION
    WHEN OTHERS THEN
        RAISE LOG 'Review submission error for user % product %: % %', 
            v_user_id, p_product_id, SQLERRM, SQLSTATE;
        
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Unable to process review at this time',
            'error_code', 'INTERNAL_ERROR'
        );
END;
$$;


ALTER FUNCTION "public"."submit_review_secure"("p_product_id" "uuid", "p_order_id" "uuid", "p_rating" integer, "p_title" "text", "p_comment" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."submit_review_secure"("p_product_id" "uuid", "p_order_id" "uuid", "p_rating" integer, "p_title" "text", "p_comment" "text") IS 'Securely submits or updates a product review with comprehensive validation:
- Verifies purchase ownership (prevents fake reviews)
- Enforces review period limits (90 days after delivery)
- Handles race conditions gracefully (upsert pattern)
- Auto-approves trusted users based on reputation
- Queues moderation and rating update jobs
Returns structured JSON with success status and review details.';



CREATE OR REPLACE FUNCTION "public"."submit_vendor_application_secure"("p_user_id" "uuid", "p_application_data" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'private', 'extensions', 'pg_temp'
    AS $$
DECLARE
    v_user_id UUID;
    v_business_name TEXT;
    v_business_type TEXT;
    v_contact_name TEXT;
    v_contact_email TEXT;
    v_contact_phone TEXT;
    v_bank_account_name TEXT;
    v_bank_account_number TEXT;
    v_bank_name TEXT;
    v_bank_branch TEXT;
    v_esewa_number TEXT;
    v_khalti_number TEXT;
    v_existing_state TEXT;
    v_encryption_key TEXT;
BEGIN
    -- ========================================================================
    -- AUTHENTICATION
    -- ========================================================================
    IF current_setting('request.jwt.claims', true)::jsonb->>'role' = 'service_role' THEN
        IF p_user_id IS NULL THEN
            RETURN jsonb_build_object('success', false, 'error', 'User ID is required', 'error_code', 'MISSING_USER_ID');
        END IF;
        v_user_id := p_user_id;
    ELSE
        IF p_user_id != auth.uid() OR auth.uid() IS NULL THEN
            RETURN jsonb_build_object('success', false, 'error', 'Unauthorized access', 'error_code', 'UNAUTHORIZED');
        END IF;
        v_user_id := auth.uid();
    END IF;
    
    -- ========================================================================
    -- EXTRACT DATA (INCLUDING CONTACT INFO!)
    -- ========================================================================
    v_business_name := p_application_data->>'business_name';
    v_business_type := p_application_data->>'business_type';
    v_contact_name := p_application_data->>'contact_name';
    v_contact_email := p_application_data->>'email';
    v_contact_phone := p_application_data->>'phone';
    v_bank_account_name := p_application_data->>'bank_account_name';
    v_bank_account_number := p_application_data->>'bank_account_number';
    v_bank_name := p_application_data->>'bank_name';
    v_bank_branch := p_application_data->>'bank_branch';
    v_esewa_number := p_application_data->>'esewa_number';
    v_khalti_number := p_application_data->>'khalti_number';
    
    -- ========================================================================
    -- VALIDATE
    -- ========================================================================
    IF v_business_name IS NULL OR v_business_name = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Business name is required', 'error_code', 'MISSING_BUSINESS_NAME');
    END IF;
    
    IF v_business_type IS NULL OR v_business_type = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Business type is required', 'error_code', 'MISSING_BUSINESS_TYPE');
    END IF;
    
    IF v_contact_email IS NULL OR v_contact_email = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Contact email is required', 'error_code', 'MISSING_EMAIL');
    END IF;
    
    IF v_contact_phone IS NULL OR v_contact_phone = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Contact phone is required', 'error_code', 'MISSING_PHONE');
    END IF;
    
    IF (v_bank_account_number IS NULL OR v_bank_account_number = '') AND
       (v_esewa_number IS NULL OR v_esewa_number = '') AND
       (v_khalti_number IS NULL OR v_khalti_number = '') THEN
        RETURN jsonb_build_object('success', false, 'error', 'At least one payment method is required', 'error_code', 'MISSING_PAYMENT_METHOD');
    END IF;
    
    v_encryption_key := private.get_encryption_key();
    
    -- ========================================================================
    -- CHECK EXISTING APPLICATION
    -- ========================================================================
    SELECT application_state INTO v_existing_state FROM vendor_profiles WHERE user_id = v_user_id;
    
    IF FOUND THEN
        IF v_existing_state IN ('submitted', 'under_review', 'info_requested') THEN
            RETURN jsonb_build_object('success', false, 'error', 'You already have a pending application', 'error_code', 'APPLICATION_PENDING', 'current_state', v_existing_state);
        ELSIF v_existing_state = 'approved' THEN
            RETURN jsonb_build_object('success', false, 'error', 'You are already an approved vendor', 'error_code', 'ALREADY_VENDOR');
        ELSIF v_existing_state = 'rejected' THEN
            -- Re-submission (with contact info)
            UPDATE vendor_profiles
            SET 
                application_state = 'submitted',
                business_name = v_business_name,
                business_type = v_business_type,
                contact_name = v_contact_name,
                contact_email = v_contact_email,
                contact_phone = v_contact_phone,
                bank_account_name = v_bank_account_name,
                bank_name = v_bank_name,
                bank_branch = v_bank_branch,
                bank_account_number_enc = CASE WHEN v_bank_account_number IS NOT NULL AND v_bank_account_number <> '' 
                    THEN extensions.pgp_sym_encrypt(v_bank_account_number, v_encryption_key) ELSE NULL END,
                esewa_number_enc = CASE WHEN v_esewa_number IS NOT NULL AND v_esewa_number <> '' 
                    THEN extensions.pgp_sym_encrypt(v_esewa_number, v_encryption_key) ELSE NULL END,
                khalti_number_enc = CASE WHEN v_khalti_number IS NOT NULL AND v_khalti_number <> '' 
                    THEN extensions.pgp_sym_encrypt(v_khalti_number, v_encryption_key) ELSE NULL END,
                application_submitted_at = NOW(),
                application_notes = NULL,
                updated_at = NOW()
            WHERE user_id = v_user_id;
            
            RETURN jsonb_build_object('success', true, 'message', 'Application re-submitted successfully!', 'application_state', 'submitted');
        END IF;
    END IF;
    
    -- ========================================================================
    -- INSERT NEW APPLICATION (with contact info)
    -- ========================================================================
    INSERT INTO vendor_profiles (
        user_id,
        business_name,
        business_type,
        contact_name,
        contact_email,
        contact_phone,
        application_state,
        application_submitted_at,
        bank_account_name,
        bank_name,
        bank_branch,
        bank_account_number_enc,
        esewa_number_enc,
        khalti_number_enc,
        verification_status,
        created_at,
        updated_at
    )
    VALUES (
        v_user_id,
        v_business_name,
        v_business_type,
        v_contact_name,
        v_contact_email,
        v_contact_phone,
        'submitted',
        NOW(),
        v_bank_account_name,
        v_bank_name,
        v_bank_branch,
        CASE WHEN v_bank_account_number IS NOT NULL AND v_bank_account_number <> '' 
            THEN extensions.pgp_sym_encrypt(v_bank_account_number, v_encryption_key) ELSE NULL END,
        CASE WHEN v_esewa_number IS NOT NULL AND v_esewa_number <> '' 
            THEN extensions.pgp_sym_encrypt(v_esewa_number, v_encryption_key) ELSE NULL END,
        CASE WHEN v_khalti_number IS NOT NULL AND v_khalti_number <> '' 
            THEN extensions.pgp_sym_encrypt(v_khalti_number, v_encryption_key) ELSE NULL END,
        'pending',
        NOW(),
        NOW()
    )
    ON CONFLICT (user_id) DO UPDATE
    SET 
        business_name = EXCLUDED.business_name,
        business_type = EXCLUDED.business_type,
        contact_name = EXCLUDED.contact_name,
        contact_email = EXCLUDED.contact_email,
        contact_phone = EXCLUDED.contact_phone,
        application_state = CASE WHEN vendor_profiles.application_state IN ('rejected', 'draft') 
            THEN 'submitted' ELSE vendor_profiles.application_state END,
        bank_account_name = EXCLUDED.bank_account_name,
        bank_name = EXCLUDED.bank_name,
        bank_branch = EXCLUDED.bank_branch,
        bank_account_number_enc = EXCLUDED.bank_account_number_enc,
        esewa_number_enc = EXCLUDED.esewa_number_enc,
        khalti_number_enc = EXCLUDED.khalti_number_enc,
        application_submitted_at = NOW(),
        updated_at = NOW()
    WHERE vendor_profiles.application_state NOT IN ('submitted', 'under_review', 'info_requested', 'approved');
    
    RETURN jsonb_build_object('success', true, 'message', 'Application submitted successfully!', 'application_state', 'submitted');
    
EXCEPTION
    WHEN OTHERS THEN
        RAISE LOG 'submit_vendor_application_secure: Error for user %: %', v_user_id, SQLERRM;
        RETURN jsonb_build_object('success', false, 'error', 'An unexpected error occurred', 'error_code', 'INTERNAL_ERROR');
END;
$$;


ALTER FUNCTION "public"."submit_vendor_application_secure"("p_user_id" "uuid", "p_application_data" "jsonb") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."submit_vendor_application_secure"("p_user_id" "uuid", "p_application_data" "jsonb") IS 'Submit vendor application with contact information (email, phone, contact_name) and encrypted payment data';



CREATE OR REPLACE FUNCTION "public"."submit_vendor_reply_secure"("p_review_id" "uuid", "p_comment" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_vendor_id UUID;
    v_review RECORD;
    v_reply_id UUID;
    v_comment TEXT;
BEGIN
    -- Authentication
    v_vendor_id := auth.uid();
    IF v_vendor_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Authentication required',
            'error_code', 'AUTH_REQUIRED'
        );
    END IF;

    -- Validate input
    v_comment := NULLIF(TRIM(p_comment), '');
    IF v_comment IS NULL OR length(v_comment) < 10 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Reply must be at least 10 characters',
            'error_code', 'COMMENT_TOO_SHORT'
        );
    END IF;
    IF length(v_comment) > 2000 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Reply must be less than 2000 characters',
            'error_code', 'COMMENT_TOO_LONG'
        );
    END IF;

    -- Validate review exists and vendor owns the product
    SELECT r.id, p.vendor_id
    INTO v_review
    FROM public.reviews r
    JOIN public.products p ON p.id = r.product_id
    WHERE r.id = p_review_id
      AND r.deleted_at IS NULL;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Review not found',
            'error_code', 'REVIEW_NOT_FOUND'
        );
    END IF;

    IF v_review.vendor_id != v_vendor_id THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'You can only reply to reviews of your own products',
            'error_code', 'NOT_PRODUCT_VENDOR'
        );
    END IF;

    -- Insert reply (one vendor reply per review enforced by unique index)
    BEGIN
        INSERT INTO public.review_replies (
            review_id,
            user_id,
            comment,
            reply_type,
            is_visible,
            is_approved
        ) VALUES (
            p_review_id,
            v_vendor_id,
            v_comment,
            'vendor',
            true,
            true
        ) RETURNING id INTO v_reply_id;
    EXCEPTION
        WHEN unique_violation THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'You have already replied to this review',
                'error_code', 'REPLY_EXISTS'
            );
    END;

    -- Increment reply_count best-effort
    UPDATE public.reviews
    SET reply_count = reply_count + 1
    WHERE id = p_review_id;

    RETURN jsonb_build_object(
        'success', true,
        'reply_id', v_reply_id,
        'message', 'Reply submitted successfully'
    );

EXCEPTION
    WHEN OTHERS THEN
        RAISE LOG 'Vendor reply error for vendor % review %: % %', v_vendor_id, p_review_id, SQLERRM, SQLSTATE;
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Unable to submit reply at this time',
            'error_code', 'INTERNAL_ERROR'
        );
END;
$$;


ALTER FUNCTION "public"."submit_vendor_reply_secure"("p_review_id" "uuid", "p_comment" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."submit_vendor_reply_secure"("p_review_id" "uuid", "p_comment" "text") IS 'Creates a vendor reply for a review with strict ownership verification.\n- Uses unified review_replies table with reply_type=vendor\n- Enforces one reply per review with unique index\n- Increments reply_count on reviews best-effort';



CREATE OR REPLACE FUNCTION "public"."suspend_user"("p_user_id" "uuid", "p_duration_days" integer DEFAULT NULL::integer, "p_reason" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth', 'private', 'pg_temp'
    SET "statement_timeout" TO '5s'
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
  
  -- Verify admin (FIXED)
  PERFORM private.assert_admin();
  
  -- Calculate ban duration
  IF p_duration_days IS NOT NULL THEN
    v_banned_until := now() + (p_duration_days || ' days')::interval;
  ELSE
    v_banned_until := 'infinity'::timestamptz;
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
  INSERT INTO public.user_audit_log (user_id, action, resource_type, resource_id, new_values)
  VALUES (
    v_admin_id,
    'user_suspended',
    'user',
    p_user_id,
    jsonb_build_object(
      'duration_days', p_duration_days,
      'reason', p_reason,
      'banned_until', v_banned_until,
      'target_user_id', p_user_id
    )
  );
  
  RETURN jsonb_build_object(
    'success', true, 
    'message', 'User suspended successfully',
    'banned_until', v_banned_until
  );
END;
$$;


ALTER FUNCTION "public"."suspend_user"("p_user_id" "uuid", "p_duration_days" integer, "p_reason" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."suspend_user"("p_user_id" "uuid", "p_duration_days" integer, "p_reason" "text") IS 'Fixed: IF NOT assert_admin() → PERFORM assert_admin()';



CREATE OR REPLACE FUNCTION "public"."suspend_vendor"("p_vendor_id" "uuid", "p_reason" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth', 'private', 'pg_temp'
    SET "statement_timeout" TO '5s'
    AS $$
DECLARE
  v_admin_id uuid;
  v_products_deactivated integer;
BEGIN
  v_admin_id := auth.uid();
  
  -- FIXED: Removed IF NOT, use PERFORM
  PERFORM private.assert_admin();
  
  IF NOT EXISTS (SELECT 1 FROM vendor_profiles WHERE user_id = p_vendor_id) THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Vendor not found'
    );
  END IF;
  
  UPDATE auth.users
  SET banned_until = 'infinity'::timestamptz
  WHERE id = p_vendor_id AND deleted_at IS NULL;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'User not found'
    );
  END IF;
  
  UPDATE products
  SET is_active = false
  WHERE vendor_id = p_vendor_id AND is_active = true;
  
  GET DIAGNOSTICS v_products_deactivated = ROW_COUNT;
  
  INSERT INTO user_audit_log (user_id, action, resource_type, resource_id, new_values)
  VALUES (
    v_admin_id,
    'vendor_suspended',
    'vendor_profile',
    p_vendor_id,
    jsonb_build_object(
      'vendor_id', p_vendor_id,
      'reason', p_reason,
      'products_deactivated', v_products_deactivated
    )
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'message', 'Vendor suspended successfully',
    'products_deactivated', v_products_deactivated
  );
END;
$$;


ALTER FUNCTION "public"."suspend_vendor"("p_vendor_id" "uuid", "p_reason" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."suspend_vendor"("p_vendor_id" "uuid", "p_reason" "text") IS 'Fixed: IF NOT assert_admin() → PERFORM assert_admin()';



CREATE OR REPLACE FUNCTION "public"."sync_order_payment_method"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    SELECT provider INTO NEW.payment_method 
    FROM payment_intents 
    WHERE payment_intent_id = NEW.payment_intent_id
    LIMIT 1;
    
    -- Fallback if not found (unexpected)
    IF NEW.payment_method IS NULL AND NEW.payment_intent_id LIKE 'pi_cod_%' THEN
        NEW.payment_method := 'cod';
    END IF;
    
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."sync_order_payment_method"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."test_postgrest_client_query"("p_product_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_result JSONB;
  v_error_msg TEXT;
BEGIN
  -- Try to execute using the service role (bypassing RLS like the Edge Function does)
  
  -- This simulates: supabase.from('reviews').select(...)
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  
  RETURN jsonb_build_object(
    'success', true,
    'message', 'If you see this, PostgREST query would work',
    'test', 'Direct SQL works, but PostgREST client might have issues'
  );
  
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM,
    'detail', SQLSTATE
  );
END;
$$;


ALTER FUNCTION "public"."test_postgrest_client_query"("p_product_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."test_postgrest_review_query"("p_product_id" "uuid") RETURNS TABLE("review_data" json, "error_message" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  -- Test if we can query reviews with embedded relationships
  RETURN QUERY
  SELECT 
    row_to_json(combined) as review_data,
    NULL::TEXT as error_message
  FROM (
    SELECT 
      r.*,
      json_build_object(
        'display_name', up.display_name,
        'avatar_url', up.avatar_url
      ) as user_profile,
      json_build_object(
        'vendor_id', p.vendor_id
      ) as product_info,
      (
        SELECT json_agg(json_build_object(
          'helpful_count', rvs.helpful_count,
          'unhelpful_count', rvs.unhelpful_count
        ))
        FROM review_vote_shards rvs
        WHERE rvs.review_id = r.id
      ) as vote_shards
    FROM reviews r
    LEFT JOIN user_profiles up ON up.id = r.user_id
    INNER JOIN products p ON p.id = r.product_id
    WHERE r.product_id = p_product_id
      AND r.is_approved = true
      AND r.deleted_at IS NULL
    LIMIT 1
  ) combined;
  
EXCEPTION WHEN OTHERS THEN
  RETURN QUERY
  SELECT 
    NULL::JSON,
    SQLERRM::TEXT;
END;
$$;


ALTER FUNCTION "public"."test_postgrest_review_query"("p_product_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."toggle_brand_featured"("p_brand_id" "uuid", "p_is_featured" boolean) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'private', 'pg_temp'
    AS $$
BEGIN
    -- Self-defense: Only admins can feature brands
    PERFORM private.assert_admin();
    
    -- Update brand with audit trail
    UPDATE public.brands
    SET 
        is_featured = p_is_featured,
        featured_at = CASE WHEN p_is_featured THEN NOW() ELSE NULL END,
        featured_by = CASE WHEN p_is_featured THEN auth.uid() ELSE NULL END,
        updated_at = NOW()
    WHERE id = p_brand_id;
    
    -- Verify brand exists
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Brand not found: %', p_brand_id USING ERRCODE = '22023';
    END IF;
END;
$$;


ALTER FUNCTION "public"."toggle_brand_featured"("p_brand_id" "uuid", "p_is_featured" boolean) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."toggle_brand_featured"("p_brand_id" "uuid", "p_is_featured" boolean) IS 'Admin-only function to toggle brand featured status. Self-defending with assert_admin(). Creates audit trail.';



CREATE OR REPLACE FUNCTION "public"."toggle_product_active"("p_product_id" "uuid", "p_is_active" boolean) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth', 'pg_temp'
    AS $$
DECLARE
  v_vendor_id uuid;
  v_product_vendor_id uuid;
  v_slug text;
  v_product_name text;
BEGIN
  v_vendor_id := auth.uid();
  
  IF v_vendor_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Unauthorized: Must be authenticated'
    );
  END IF;
  
  SELECT vendor_id, slug, name 
  INTO v_product_vendor_id, v_slug, v_product_name
  FROM products 
  WHERE id = p_product_id;
  
  IF v_product_vendor_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Product not found'
    );
  END IF;
  
  IF v_product_vendor_id != v_vendor_id AND NOT EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN roles r ON r.id = ur.role_id
    WHERE ur.user_id = v_vendor_id
      AND r.name = 'admin'
      AND ur.is_active = true
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Unauthorized: Can only modify own products'
    );
  END IF;
  
  UPDATE products 
  SET 
    is_active = p_is_active,
    updated_at = NOW()
  WHERE id = p_product_id;
  
  -- ✅ CORRECT: Use 'toggled_active' (matches CHECK constraint!)
  INSERT INTO product_change_log (
    product_id,
    changed_by,
    change_type,
    new_values
  ) VALUES (
    p_product_id,
    v_vendor_id,
    'toggled_active',
    jsonb_build_object('is_active', p_is_active)
  );
  
  PERFORM pg_notify(
    'product_changed',
    json_build_object(
      'product_id', p_product_id,
      'vendor_id', v_vendor_id,
      'action', 'toggled_active',
      'slug', v_slug
    )::text
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'product_id', p_product_id,
    'is_active', p_is_active,
    'message', CASE 
      WHEN p_is_active THEN 'Product "' || v_product_name || '" activated successfully'
      ELSE 'Product "' || v_product_name || '" deactivated successfully'
    END
  );
END;
$$;


ALTER FUNCTION "public"."toggle_product_active"("p_product_id" "uuid", "p_is_active" boolean) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."toggle_product_active"("p_product_id" "uuid", "p_is_active" boolean) IS 'Toggle product active/inactive. Uses change_type=toggled_active to match CHECK constraint.';



CREATE OR REPLACE FUNCTION "public"."toggle_stylist_active"("p_user_id" "uuid", "p_is_active" boolean) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_admin_id UUID;
BEGIN
  -- Get caller's user ID
  v_admin_id := auth.uid();
  
  -- Check admin permission
  IF NOT user_has_role(v_admin_id, 'admin') THEN
    RAISE EXCEPTION 'Permission denied: admin role required';
  END IF;
  
  -- Update stylist profile
  IF p_is_active = false THEN
    -- Deactivating
    UPDATE stylist_profiles
    SET 
      is_active = false,
      deactivated_at = NOW(),
      deactivated_by = v_admin_id,
      updated_at = NOW()
    WHERE user_id = p_user_id;
  ELSE
    -- Reactivating
    UPDATE stylist_profiles
    SET 
      is_active = true,
      deactivated_at = NULL,
      deactivated_by = NULL,
      updated_at = NOW()
    WHERE user_id = p_user_id;
  END IF;
  
  -- Return success
  RETURN jsonb_build_object(
    'success', true,
    'user_id', p_user_id,
    'is_active', p_is_active
  );
END;
$$;


ALTER FUNCTION "public"."toggle_stylist_active"("p_user_id" "uuid", "p_is_active" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."toggle_stylist_featured"("p_user_id" "uuid", "p_is_featured" boolean) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'private', 'pg_temp'
    AS $$
BEGIN
    -- Self-defense: Only admins can feature stylists
    -- This function requires private.assert_admin() from existing governance
    PERFORM private.assert_admin();
    
    -- Update stylist profile
    UPDATE public.stylist_profiles
    SET 
        is_featured = p_is_featured,
        featured_at = CASE WHEN p_is_featured THEN NOW() ELSE NULL END,
        featured_by = CASE WHEN p_is_featured THEN auth.uid() ELSE NULL END,
        updated_at = NOW()
    WHERE user_id = p_user_id;
    
    -- Verify stylist exists (FOUND is true if UPDATE affected >= 1 row)
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Stylist not found with user_id: %', p_user_id;
    END IF;
    
    -- Log action (optional - could add to audit_log if exists)
    RAISE NOTICE 'Stylist featured status changed: user_id=%, is_featured=%, by=%', 
                 p_user_id, p_is_featured, auth.uid();
END;
$$;


ALTER FUNCTION "public"."toggle_stylist_featured"("p_user_id" "uuid", "p_is_featured" boolean) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."toggle_stylist_featured"("p_user_id" "uuid", "p_is_featured" boolean) IS 'Admin-only function to toggle stylist featured status. Uses SECURITY DEFINER + assert_admin() for security. Updates featured_at and featured_by audit fields.';



CREATE OR REPLACE FUNCTION "public"."trigger_order_worker"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'private', 'metrics', 'pg_temp'
    AS $$
DECLARE
    v_request_id bigint;
BEGIN
    -- Use pg_net to call the order-worker Edge Function
    -- We'll use a simple POST without auth since it's internal
    SELECT net.http_post(
        url := 'https://poxjcaogjupsplrcliau.supabase.co/functions/v1/order-worker?max_jobs=20',
        headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBveGpjYW9nanVwc3BscmNsaWF1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc1NjQ1MDUsImV4cCI6MjA3MzE0MDUwNX0.5gcfRhvo4PbfSXVPRsJhbmSn046-yjwaDiC92VGo62w"}'::jsonb
    ) INTO v_request_id;
    
    RAISE NOTICE 'Triggered order-worker (request_id: %)', v_request_id;
EXCEPTION
    WHEN OTHERS THEN
        RAISE WARNING 'Failed to trigger order-worker: %', SQLERRM;
END;
$$;


ALTER FUNCTION "public"."trigger_order_worker"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."trigger_order_worker"() IS 'Automatically triggers the order-worker Edge Function via pg_net to process pending payment jobs';



CREATE OR REPLACE FUNCTION "public"."trigger_refresh_jwt_on_role_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
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


ALTER FUNCTION "public"."trigger_refresh_jwt_on_role_change"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."trigger_refresh_jwt_on_role_change"() IS 'Trigger function that automatically refreshes JWT claims when role_version changes.';



CREATE OR REPLACE FUNCTION "public"."trigger_user_onboarding"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  request_id bigint;
  payload jsonb;
BEGIN
  -- Construct the webhook payload
  payload := jsonb_build_object(
    'type', 'INSERT',
    'table', 'users',
    'schema', 'auth',
    'record', row_to_json(NEW)::jsonb,
    'old_record', NULL
  );

  -- Make async HTTP request using correct net.http_post signature:
  -- net.http_post(url, headers, body_params, body, timeout_milliseconds)
  SELECT net.http_post(
    url := 'https://poxjcaogjupsplrcliau.supabase.co/functions/v1/user-onboarding',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body_params := '{}'::jsonb,
    body := payload::jsonb,
    timeout_milliseconds := 5000
  ) INTO request_id;

  -- Log the request for debugging
  RAISE NOTICE 'User onboarding webhook triggered for user %, request_id: %', NEW.id, request_id;
  
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log the error but don't fail the user creation
    RAISE WARNING 'Failed to trigger onboarding webhook for user %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."trigger_user_onboarding"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."trigger_user_onboarding"() IS 'Triggers user onboarding Edge Function when a new user signs up (fixed pg_net signature)';



CREATE OR REPLACE FUNCTION "public"."unvote_review"("p_review_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_user_id UUID;
    v_review_owner UUID;
    v_existing_vote TEXT;
    v_shard SMALLINT;
    v_helpful_delta INTEGER := 0;
    v_unhelpful_delta INTEGER := 0;
BEGIN
    -- Authentication
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Authentication required',
            'error_code', 'AUTH_REQUIRED'
        );
    END IF;

    -- Validate review and prevent self-vote removal on own review (consistent with cast)
    SELECT user_id INTO v_review_owner
    FROM public.reviews
    WHERE id = p_review_id AND deleted_at IS NULL;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Review not found',
            'error_code', 'REVIEW_NOT_FOUND'
        );
    END IF;

    IF v_review_owner = v_user_id THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Cannot vote on your own review',
            'error_code', 'SELF_VOTE_PROHIBITED'
        );
    END IF;

    -- Check existing vote
    SELECT vote_type INTO v_existing_vote
    FROM public.review_votes
    WHERE review_id = p_review_id AND user_id = v_user_id;

    IF v_existing_vote IS NULL THEN
        RETURN jsonb_build_object(
            'success', true,
            'changed', false,
            'message', 'No existing vote'
        );
    END IF;

    -- Remove the vote
    DELETE FROM public.review_votes
    WHERE review_id = p_review_id AND user_id = v_user_id;

    -- Compute shard and deltas
    v_shard := public.get_vote_shard(v_user_id);
    IF v_existing_vote = 'helpful' THEN
        v_helpful_delta := -1;
    ELSE
        v_unhelpful_delta := -1;
    END IF;

    -- Best-effort shard decrement
    UPDATE public.review_vote_shards
    SET helpful_count = GREATEST(0, helpful_count + v_helpful_delta),
        unhelpful_count = GREATEST(0, unhelpful_count + v_unhelpful_delta),
        updated_at = NOW()
    WHERE review_id = p_review_id AND shard = v_shard;

    -- Best-effort denormalized decrement
    UPDATE public.reviews
    SET helpful_votes = GREATEST(0, helpful_votes + v_helpful_delta),
        unhelpful_votes = GREATEST(0, unhelpful_votes + v_unhelpful_delta),
        updated_at = NOW()
    WHERE id = p_review_id;

    RETURN jsonb_build_object(
        'success', true,
        'changed', true,
        'previous_vote', v_existing_vote,
        'message', 'Vote removed'
    );

EXCEPTION
    WHEN OTHERS THEN
        RAISE LOG 'Unvote error for user % review %: % %', v_user_id, p_review_id, SQLERRM, SQLSTATE;
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Unable to remove vote at this time',
            'error_code', 'INTERNAL_ERROR'
        );
END;
$$;


ALTER FUNCTION "public"."unvote_review"("p_review_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_booking_reservation"("p_reservation_id" "uuid", "p_customer_id" "uuid", "p_service_id" "uuid" DEFAULT NULL::"uuid", "p_start_time" timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
    v_reservation RECORD;
    v_end_time TIMESTAMPTZ;
    v_duration_minutes INTEGER;
    v_price_cents INTEGER;
    v_service_name TEXT;
    v_stylist_name TEXT;
    v_conflicts INTEGER;
    v_new_service_id UUID;
    v_new_start_time TIMESTAMPTZ;
BEGIN
    -- Get existing reservation and verify ownership
    SELECT * INTO v_reservation
    FROM public.booking_reservations
    WHERE id = p_reservation_id 
    AND customer_user_id = p_customer_id
    AND status = 'reserved'
    AND expires_at > NOW();
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Reservation not found or expired',
            'code', 'RESERVATION_NOT_FOUND'
        );
    END IF;
    
    -- Use provided values or keep existing ones
    v_new_service_id := COALESCE(p_service_id, v_reservation.service_id);
    v_new_start_time := COALESCE(p_start_time, v_reservation.start_time);
    
    -- Get service details (for new service if changed)
    SELECT 
        s.name,
        COALESCE(ss.custom_duration_minutes, s.duration_minutes) as duration,
        COALESCE(ss.custom_price_cents, s.base_price_cents) as price
    INTO v_service_name, v_duration_minutes, v_price_cents
    FROM public.services s
    LEFT JOIN public.stylist_services ss 
        ON ss.service_id = s.id 
        AND ss.stylist_user_id = v_reservation.stylist_user_id
    WHERE s.id = v_new_service_id;
    
    IF v_service_name IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Service not found',
            'code', 'SERVICE_NOT_FOUND'
        );
    END IF;
    
    -- Calculate new end time
    v_end_time := v_new_start_time + (v_duration_minutes || ' minutes')::INTERVAL;
    
    -- Check for conflicts with existing bookings (exclude our current reservation)
    SELECT COUNT(*) INTO v_conflicts
    FROM public.bookings
    WHERE stylist_user_id = v_reservation.stylist_user_id
    AND status IN ('pending', 'confirmed')
    AND (
        (start_time, end_time) OVERLAPS (v_new_start_time, v_end_time)
    );
    
    IF v_conflicts > 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Time slot is no longer available',
            'code', 'SLOT_UNAVAILABLE'
        );
    END IF;
    
    -- Check for conflicts with other reservations (exclude our current reservation)
    SELECT COUNT(*) INTO v_conflicts
    FROM public.booking_reservations
    WHERE stylist_user_id = v_reservation.stylist_user_id
    AND status = 'reserved'
    AND expires_at > NOW()
    AND id != p_reservation_id  -- Exclude current reservation
    AND (
        (start_time, end_time) OVERLAPS (v_new_start_time, v_end_time)
    );
    
    IF v_conflicts > 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Time slot is no longer available',
            'code', 'SLOT_UNAVAILABLE'
        );
    END IF;
    
    -- Get stylist name
    SELECT display_name INTO v_stylist_name
    FROM public.stylist_profiles
    WHERE user_id = v_reservation.stylist_user_id;
    
    -- Update the reservation
    UPDATE public.booking_reservations
    SET 
        service_id = v_new_service_id,
        start_time = v_new_start_time,
        end_time = v_end_time,
        price_cents = v_price_cents,
        updated_at = NOW(),
        expires_at = NOW() + INTERVAL '15 minutes'  -- Reset TTL
    WHERE id = p_reservation_id;
    
    -- Return success with updated reservation details
    RETURN jsonb_build_object(
        'success', true,
        'reservation_id', p_reservation_id,
        'service_name', v_service_name,
        'stylist_name', v_stylist_name,
        'start_time', v_new_start_time,
        'end_time', v_end_time,
        'price_cents', v_price_cents,
        'expires_at', NOW() + INTERVAL '15 minutes'
    );
    
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', SQLERRM,
            'code', 'DATABASE_ERROR'
        );
END;
$$;


ALTER FUNCTION "public"."update_booking_reservation"("p_reservation_id" "uuid", "p_customer_id" "uuid", "p_service_id" "uuid", "p_start_time" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_booking_status"("p_booking_id" "uuid", "p_new_status" "text", "p_reason" "text" DEFAULT NULL::"text", "p_actor_role" "text" DEFAULT 'stylist'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
    v_booking RECORD;
    v_user_id UUID := auth.uid();
BEGIN
    SELECT * INTO v_booking
    FROM bookings
    WHERE id = p_booking_id
    FOR UPDATE NOWAIT;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'Booking not found',
            'code', 'NOT_FOUND'
        );
    END IF;
    
    IF p_actor_role = 'stylist' AND v_booking.stylist_user_id != v_user_id THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'You are not authorized to update this booking',
            'code', 'UNAUTHORIZED'
        );
    END IF;
    
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
    
    IF NOT validate_status_transition(v_booking.status, p_new_status) THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', format('Cannot change status from %s to %s', v_booking.status, p_new_status),
            'code', 'INVALID_TRANSITION'
        );
    END IF;
    
    IF p_new_status = 'completed' AND v_booking.start_time > NOW() THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'Cannot mark future booking as completed',
            'code', 'INVALID_TIMING'
        );
    END IF;
    
    IF p_new_status = 'no_show' AND v_booking.start_time > NOW() THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'Cannot mark as no-show before appointment time',
            'code', 'INVALID_TIMING'
        );
    END IF;
    
    IF p_new_status = 'in_progress' AND v_booking.start_time > (NOW() + INTERVAL '30 minutes') THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'Cannot start service more than 30 minutes early',
            'code', 'INVALID_TIMING'
        );
    END IF;
    
    IF p_new_status = 'cancelled' AND (p_reason IS NULL OR LENGTH(TRIM(p_reason)) < 3) THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'Cancellation reason is required (minimum 3 characters)',
            'code', 'REASON_REQUIRED'
        );
    END IF;
    
    UPDATE bookings
    SET 
        status = p_new_status,
        updated_at = NOW(),
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
    
    RETURN jsonb_build_object(
        'success', TRUE,
        'booking_id', p_booking_id,
        'old_status', v_booking.status,
        'new_status', p_new_status,
        'changed_at', NOW()
    );
    
EXCEPTION
    WHEN lock_not_available THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'This booking is currently being updated by another user. Please try again.',
            'code', 'CONCURRENT_UPDATE'
        );
    WHEN OTHERS THEN
        RAISE WARNING 'Unexpected error in update_booking_status: %', SQLERRM;
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'An unexpected error occurred. Please try again or contact support.',
            'code', 'INTERNAL_ERROR'
        );
END;
$$;


ALTER FUNCTION "public"."update_booking_status"("p_booking_id" "uuid", "p_new_status" "text", "p_reason" "text", "p_actor_role" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_cart_item_secure"("p_variant_id" "uuid", "p_quantity" integer, "p_user_id" "uuid" DEFAULT NULL::"uuid", "p_guest_token" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_cart_id UUID;
  v_available INT;
  v_final INT;
BEGIN
  -- No auth.uid() check - edge function already verified user
  v_cart_id := public.get_or_create_cart_secure(p_user_id, p_guest_token);

  IF p_quantity = 0 THEN
    DELETE FROM cart_items WHERE cart_id = v_cart_id AND variant_id = p_variant_id;
    RETURN jsonb_build_object('success', true, 'message', 'Item removed');
  END IF;

  SELECT COALESCE(SUM(quantity_available),0) INTO v_available FROM inventory WHERE variant_id = p_variant_id;
  v_final := LEAST(p_quantity, v_available, 99);

  UPDATE cart_items SET quantity = v_final, updated_at = now()
  WHERE cart_id = v_cart_id AND variant_id = p_variant_id;

  RETURN jsonb_build_object('success', true, 'message', 'Quantity updated', 'final_quantity', v_final);
END;
$$;


ALTER FUNCTION "public"."update_cart_item_secure"("p_variant_id" "uuid", "p_quantity" integer, "p_user_id" "uuid", "p_guest_token" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."update_cart_item_secure"("p_variant_id" "uuid", "p_quantity" integer, "p_user_id" "uuid", "p_guest_token" "text") IS 'Security model: Edge function verifies JWT, RPCs trust parameters. Called via service_role only.';



CREATE OR REPLACE FUNCTION "public"."update_combo_quantity_secure"("p_combo_group_id" "uuid", "p_new_quantity" integer, "p_user_id" "uuid" DEFAULT NULL::"uuid", "p_guest_token" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_cart_id UUID;
  v_item RECORD;
  v_base_quantity INTEGER;
  v_multiplier NUMERIC;
  v_new_item_quantity INTEGER;
  v_available_stock INTEGER;
  v_updated_count INTEGER := 0;
BEGIN
  -- Get or create cart
  v_cart_id := public.get_or_create_cart_secure(p_user_id, p_guest_token);
  
  -- Validate new quantity
  IF p_new_quantity < 1 THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Quantity must be at least 1'
    );
  END IF;
  
  -- Get the first item to determine base quantity (the combo's "unit")
  SELECT quantity INTO v_base_quantity
  FROM cart_items
  WHERE cart_id = v_cart_id
    AND combo_group_id = p_combo_group_id
  ORDER BY created_at
  LIMIT 1;
  
  IF v_base_quantity IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Combo not found in cart'
    );
  END IF;
  
  -- Calculate multiplier (how many times to multiply each item's base quantity)
  -- If base quantity is 1 and new quantity is 2, multiplier is 2
  -- If base quantity is 2 and new quantity is 4, multiplier is 2
  v_multiplier := p_new_quantity::NUMERIC / v_base_quantity::NUMERIC;
  
  -- Update each item in the combo proportionally
  FOR v_item IN
    SELECT 
      ci.id,
      ci.variant_id,
      ci.quantity as current_quantity,
      COALESCE(inv.quantity_available, 0) as available_stock
    FROM cart_items ci
    LEFT JOIN (
      SELECT variant_id, SUM(quantity_available) as quantity_available
      FROM inventory
      GROUP BY variant_id
    ) inv ON inv.variant_id = ci.variant_id
    WHERE ci.cart_id = v_cart_id
      AND ci.combo_group_id = p_combo_group_id
  LOOP
    -- Calculate new quantity for this item (proportional to its original quantity)
    v_new_item_quantity := CEIL(v_item.current_quantity * v_multiplier)::INTEGER;
    
    -- Check inventory
    IF v_new_item_quantity > v_item.available_stock THEN
      RETURN jsonb_build_object(
        'success', false,
        'message', format('Insufficient stock for one or more items. Only %s available.', v_item.available_stock)
      );
    END IF;
    
    -- Update the item
    UPDATE cart_items
    SET 
      quantity = v_new_item_quantity,
      updated_at = NOW()
    WHERE id = v_item.id;
    
    v_updated_count := v_updated_count + 1;
  END LOOP;
  
  -- Return success
  RETURN jsonb_build_object(
    'success', true,
    'message', format('Updated %s items in combo', v_updated_count),
    'updated_count', v_updated_count
  );
END;
$$;


ALTER FUNCTION "public"."update_combo_quantity_secure"("p_combo_group_id" "uuid", "p_new_quantity" integer, "p_user_id" "uuid", "p_guest_token" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."update_combo_quantity_secure"("p_combo_group_id" "uuid", "p_new_quantity" integer, "p_user_id" "uuid", "p_guest_token" "text") IS 'Updates all items in a combo group proportionally. Checks inventory before updating. Only callable by service_role via Edge Functions.';



CREATE OR REPLACE FUNCTION "public"."update_fulfillment_status"("p_order_item_id" "uuid", "p_new_status" "text", "p_tracking_number" "text" DEFAULT NULL::"text", "p_shipping_carrier" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth', 'private', 'pg_temp'
    AS $$
DECLARE
  v_vendor_id uuid;
  v_current_status text;
  v_order_id uuid;
BEGIN
  -- Get current item details
  SELECT vendor_id, fulfillment_status, order_id
  INTO v_vendor_id, v_current_status, v_order_id
  FROM order_items
  WHERE id = p_order_item_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Order item not found'
    );
  END IF;

  -- Verify vendor owns this item
  IF v_vendor_id != auth.uid() THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Unauthorized: You can only update your own orders'
    );
  END IF;

  -- Validate status value
  IF p_new_status NOT IN ('pending', 'processing', 'shipped', 'delivered', 'cancelled') THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Invalid status value'
    );
  END IF;

  -- ✅ NEW: Validate status transitions (enforce logical flow)
  -- Allowed transitions:
  -- pending → processing, shipped, cancelled
  -- processing → shipped, cancelled
  -- shipped → delivered, cancelled
  -- delivered → (final state, no changes allowed)
  -- cancelled → (final state, no changes allowed)
  
  IF v_current_status = 'delivered' THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Cannot change status of delivered items'
    );
  END IF;

  IF v_current_status = 'cancelled' THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Cannot change status of cancelled items'
    );
  END IF;

  -- Validate specific transitions
  IF v_current_status = 'pending' AND p_new_status NOT IN ('processing', 'shipped', 'cancelled') THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'From pending, you can only move to: processing, shipped, or cancelled'
    );
  END IF;

  IF v_current_status = 'processing' AND p_new_status NOT IN ('shipped', 'cancelled') THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'From processing, you can only move to: shipped or cancelled'
    );
  END IF;

  IF v_current_status = 'shipped' AND p_new_status NOT IN ('delivered', 'cancelled') THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'From shipped, you can only move to: delivered or cancelled'
    );
  END IF;

  -- Require tracking info for shipped status
  IF p_new_status = 'shipped' AND (p_tracking_number IS NULL OR p_shipping_carrier IS NULL) THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Tracking number and carrier are required when marking as shipped'
    );
  END IF;

  -- Update the order item
  UPDATE order_items
  SET 
    fulfillment_status = p_new_status,
    tracking_number = COALESCE(p_tracking_number, tracking_number),
    shipping_carrier = COALESCE(p_shipping_carrier, shipping_carrier),
    shipped_at = CASE 
      WHEN p_new_status = 'shipped' AND v_current_status != 'shipped' THEN now()
      ELSE shipped_at
    END,
    delivered_at = CASE 
      WHEN p_new_status = 'delivered' AND v_current_status != 'delivered' THEN now()
      ELSE delivered_at
    END,
    updated_at = now()
  WHERE id = p_order_item_id;

  -- Log the status change (now works with audit_log table)
  INSERT INTO private.audit_log (
    table_name,
    record_id,
    action,
    old_values,
    new_values,
    user_id
  ) VALUES (
    'order_items',
    p_order_item_id,
    'UPDATE',
    jsonb_build_object('fulfillment_status', v_current_status),
    jsonb_build_object(
      'fulfillment_status', p_new_status, 
      'tracking_number', p_tracking_number,
      'shipping_carrier', p_shipping_carrier
    ),
    auth.uid()
  );

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Fulfillment status updated successfully',
    'order_item_id', p_order_item_id,
    'new_status', p_new_status
  );
END;
$$;


ALTER FUNCTION "public"."update_fulfillment_status"("p_order_item_id" "uuid", "p_new_status" "text", "p_tracking_number" "text", "p_shipping_carrier" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."update_fulfillment_status"("p_order_item_id" "uuid", "p_new_status" "text", "p_tracking_number" "text", "p_shipping_carrier" "text") IS 'Updates order item fulfillment status with strict transition validation. 
   Flow: pending → processing → shipped → delivered. 
   Cancelled can be set from any non-final state.
   Requires tracking info for shipped status.';



CREATE OR REPLACE FUNCTION "public"."update_inventory_quantity"("p_variant_id" "uuid", "p_quantity_change" integer, "p_movement_type" character varying, "p_notes" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'private', 'pg_temp'
    SET "statement_timeout" TO '30s'
    AS $$
DECLARE
  v_vendor_id uuid;
  v_product_id uuid;
  v_product_vendor_id uuid;
  v_inventory_id uuid;
  v_location_id uuid;
  v_old_quantity integer;
  v_new_quantity integer;
BEGIN
  -- 1. Authentication check
  v_vendor_id := auth.uid();
  IF v_vendor_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: Must be authenticated';
  END IF;
  
  -- 2. Role check
  IF NOT public.user_has_role(v_vendor_id, 'vendor') 
     AND NOT public.user_has_role(v_vendor_id, 'admin') THEN
    RAISE EXCEPTION 'Unauthorized: Must be a vendor or admin';
  END IF;
  
  -- 3. Validate movement type
  IF p_movement_type NOT IN ('purchase', 'sale', 'adjustment', 'transfer', 'return', 'damage') THEN
    RAISE EXCEPTION 'Invalid movement type';
  END IF;
  
  -- 4. Get variant's product and verify ownership
  SELECT pv.product_id, p.vendor_id 
  INTO v_product_id, v_product_vendor_id
  FROM product_variants pv
  JOIN products p ON p.id = pv.product_id
  WHERE pv.id = p_variant_id;
  
  IF v_product_id IS NULL THEN
    RAISE EXCEPTION 'Variant not found';
  END IF;
  
  -- 5. Ownership check (vendors can only update their own products)
  IF NOT public.user_has_role(v_vendor_id, 'admin') 
     AND v_product_vendor_id != v_vendor_id THEN
    RAISE EXCEPTION 'Unauthorized: Cannot update inventory for products you do not own';
  END IF;
  
  -- 6. Get current inventory record
  SELECT i.id, i.location_id, i.quantity_available
  INTO v_inventory_id, v_location_id, v_old_quantity
  FROM inventory i
  WHERE i.variant_id = p_variant_id
  LIMIT 1;
  
  IF v_inventory_id IS NULL THEN
    RAISE EXCEPTION 'Inventory record not found for variant';
  END IF;
  
  -- 7. Calculate new quantity and validate
  v_new_quantity := v_old_quantity + p_quantity_change;
  
  IF v_new_quantity < 0 THEN
    -- Log the violation attempt
    INSERT INTO inventory_violation_logs (
      variant_id, attempted_change, current_quantity, error_message, user_id
    ) VALUES (
      p_variant_id, p_quantity_change, v_old_quantity,
      format('Attempted to reduce inventory below 0: current=%s, change=%s', 
             v_old_quantity, p_quantity_change),
      v_vendor_id
    );
    
    RAISE EXCEPTION 'Insufficient inventory: cannot reduce below 0 (current: %, change: %)', 
      v_old_quantity, p_quantity_change;
  END IF;
  
  -- 8. Update inventory
  UPDATE inventory
  SET quantity_available = v_new_quantity,
      updated_at = now()
  WHERE id = v_inventory_id;
  
  -- 9. Create movement record (audit trail)
  INSERT INTO inventory_movements (
    variant_id, location_id, movement_type, quantity_change, 
    quantity_after, notes, created_by
  ) VALUES (
    p_variant_id, v_location_id, p_movement_type, p_quantity_change,
    v_new_quantity, p_notes, v_vendor_id
  );
  
  -- 10. Notify cache invalidation
  PERFORM pg_notify('product_changed', json_build_object(
    'product_id', v_product_id,
    'action', 'inventory_updated'
  )::text);
  
  -- 11. Return result
  RETURN jsonb_build_object(
    'success', true,
    'old_quantity', v_old_quantity,
    'new_quantity', v_new_quantity,
    'message', 'Inventory updated successfully'
  );

EXCEPTION
  WHEN check_violation THEN
    RAISE EXCEPTION 'Inventory cannot be negative';
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Failed to update inventory: %', SQLERRM;
END;
$$;


ALTER FUNCTION "public"."update_inventory_quantity"("p_variant_id" "uuid", "p_quantity_change" integer, "p_movement_type" character varying, "p_notes" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_job_status"("p_job_id" "uuid", "p_success" boolean, "p_message" "text", "p_should_retry" boolean DEFAULT false) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
    IF p_success THEN
        -- Mark as completed
        UPDATE job_queue
        SET 
            status = 'completed',
            completed_at = NOW(),
            locked_by = NULL,
            locked_until = NULL
        WHERE id = p_job_id;
    ELSIF p_should_retry THEN
        -- Reset to pending for retry (if under max attempts)
        UPDATE job_queue
        SET 
            status = CASE 
                WHEN attempts < max_attempts THEN 'pending'
                ELSE 'failed'
            END,
            last_error = p_message,
            failed_at = CASE 
                WHEN attempts >= max_attempts THEN NOW()
                ELSE NULL
            END,
            locked_by = NULL,
            locked_until = NULL
        WHERE id = p_job_id;
    ELSE
        -- Mark as failed
        UPDATE job_queue
        SET 
            status = 'failed',
            last_error = p_message,
            failed_at = NOW(),
            locked_by = NULL,
            locked_until = NULL
        WHERE id = p_job_id;
    END IF;
END;
$$;


ALTER FUNCTION "public"."update_job_status"("p_job_id" "uuid", "p_success" boolean, "p_message" "text", "p_should_retry" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_order_status_on_item_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_total_items INTEGER;
  v_delivered_items INTEGER;
  v_cancelled_items INTEGER;
  v_latest_delivery_date TIMESTAMPTZ;
  v_new_order_status TEXT;
  v_old_order_status TEXT;
BEGIN
  -- Get current order status
  SELECT status INTO v_old_order_status
  FROM orders
  WHERE id = NEW.order_id;

  -- Count items by status (using FOR UPDATE for concurrency safety)
  SELECT 
    COUNT(*) as total,
    COUNT(*) FILTER (WHERE fulfillment_status = 'delivered') as delivered,
    COUNT(*) FILTER (WHERE fulfillment_status = 'cancelled') as cancelled,
    MAX(delivered_at) as latest_delivery
  INTO v_total_items, v_delivered_items, v_cancelled_items, v_latest_delivery_date
  FROM order_items
  WHERE order_id = NEW.order_id
  FOR UPDATE;

  -- Determine new order status
  IF v_cancelled_items = v_total_items THEN
    v_new_order_status := 'canceled';  -- Note: American spelling matches constraint
    v_latest_delivery_date := NULL;
  ELSIF v_delivered_items + v_cancelled_items = v_total_items THEN
    v_new_order_status := 'delivered';
  ELSE
    v_new_order_status := 'confirmed';
    v_latest_delivery_date := NULL;
  END IF;

  -- Update only if status changed
  IF v_old_order_status != v_new_order_status THEN
    UPDATE orders
    SET 
      status = v_new_order_status,
      delivered_at = v_latest_delivery_date
    WHERE id = NEW.order_id;

    -- Audit log - FIX: Use 'UPDATE' instead of 'STATUS_AUTO_UPDATE'
    INSERT INTO private.audit_log (
      table_name,
      record_id,
      action,
      old_values,
      new_values,
      user_id,
      created_at
    ) VALUES (
      'orders',
      NEW.order_id,
      'UPDATE',  -- FIX: Changed from 'STATUS_AUTO_UPDATE' to 'UPDATE'
      jsonb_build_object(
        'status', v_old_order_status,
        'action_type', 'status_auto_update'  -- Store the specific action type here
      ),
      jsonb_build_object(
        'status', v_new_order_status,
        'delivered_at', v_latest_delivery_date,
        'total_items', v_total_items,
        'delivered_items', v_delivered_items,
        'cancelled_items', v_cancelled_items,
        'action_type', 'status_auto_update'  -- Store the specific action type here
      ),
      auth.uid(),
      NOW()
    );
  END IF;

  RETURN NEW;

EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't block item update
    -- FIX: Use 'UPDATE' instead of 'TRIGGER_ERROR'
    INSERT INTO private.audit_log (
      table_name,
      record_id,
      action,
      new_values,
      created_at
    ) VALUES (
      'orders',
      NEW.order_id,
      'UPDATE',  -- FIX: Changed from 'TRIGGER_ERROR' to 'UPDATE'
      jsonb_build_object(
        'error_message', SQLERRM,
        'triggered_by_item', NEW.id,
        'action_type', 'trigger_error'  -- Store the specific action type here
      ),
      NOW()
    );
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_order_status_on_item_change"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."update_order_status_on_item_change"() IS 'Automatically updates parent order status when order items are delivered or cancelled.';



CREATE OR REPLACE FUNCTION "public"."update_product_rating_stats"("p_product_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_stats RECORD;
    v_previous RECORD;
    v_distribution jsonb;
    v_significant_change BOOLEAN := false;
    v_retry_count INTEGER;
BEGIN
    -- DEFENSIVE LAYER 1: Product Validation with non-blocking lock
    SELECT 
        average_rating,
        review_count,
        updated_at,
        is_active
    INTO v_previous
    FROM products
    WHERE id = p_product_id
    FOR UPDATE SKIP LOCKED;  -- Non-blocking: skip if another process is updating

    IF NOT FOUND THEN
        -- Product doesn't exist or is locked
        SELECT COUNT(*) INTO v_retry_count
        FROM job_queue
        WHERE job_type = 'update_product_rating'
            AND (payload->>'product_id')::UUID = p_product_id
            AND status = 'pending';

        IF v_retry_count < 3 THEN
            -- Requeue for later if not too many retries
            INSERT INTO job_queue (
                job_type,
                priority,
                payload,
                idempotency_key
            ) VALUES (
                'update_product_rating',
                8,
                jsonb_build_object(
                    'product_id', p_product_id,
                    'retry_count', v_retry_count + 1
                ),
                'rating_retry_' || p_product_id::text || '_' || NOW()::text
            );
            
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Product locked, requeued for retry',
                'error_code', 'PRODUCT_LOCKED'
            );
        ELSE
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Product not found or permanently locked',
                'error_code', 'PRODUCT_NOT_FOUND'
            );
        END IF;
    END IF;

    -- DEFENSIVE LAYER 2: Calculate Aggregate Stats (only approved, non-deleted)
    WITH rating_stats AS (
        SELECT 
            COUNT(*) AS total_count,
            AVG(rating)::DECIMAL(3,2) AS avg_rating,
            STDDEV(rating)::DECIMAL(3,2) AS rating_stddev,
            COUNT(*) FILTER (WHERE rating = 1) AS one_star,
            COUNT(*) FILTER (WHERE rating = 2) AS two_star,
            COUNT(*) FILTER (WHERE rating = 3) AS three_star,
            COUNT(*) FILTER (WHERE rating = 4) AS four_star,
            COUNT(*) FILTER (WHERE rating = 5) AS five_star,
            MAX(created_at) AS last_review_at,
            -- Wilson score for better ranking (handles low review counts)
            CASE 
                WHEN COUNT(*) = 0 THEN 0
                ELSE (
                    (AVG(rating) + 1.96 * 1.96 / (2 * COUNT(*))) / 
                    (1 + 1.96 * 1.96 / COUNT(*))
                )::DECIMAL(3,2)
            END AS wilson_score
        FROM reviews
        WHERE product_id = p_product_id
            AND is_approved = true
            AND deleted_at IS NULL
    )
    SELECT * INTO v_stats FROM rating_stats;

    -- DEFENSIVE LAYER 3: Build Distribution JSON
    v_distribution := jsonb_build_object(
        '1', COALESCE(v_stats.one_star, 0),
        '2', COALESCE(v_stats.two_star, 0),
        '3', COALESCE(v_stats.three_star, 0),
        '4', COALESCE(v_stats.four_star, 0),
        '5', COALESCE(v_stats.five_star, 0),
        'total', COALESCE(v_stats.total_count, 0),
        'average', COALESCE(v_stats.avg_rating, 0),
        'stddev', COALESCE(v_stats.rating_stddev, 0),
        'wilson_score', COALESCE(v_stats.wilson_score, 0)
    );

    -- DEFENSIVE LAYER 4: Detect Significant Changes
    v_significant_change := (
        ABS(COALESCE(v_stats.avg_rating, 0) - COALESCE(v_previous.average_rating, 0)) >= 0.5
        OR ABS(COALESCE(v_stats.total_count, 0) - COALESCE(v_previous.review_count, 0)) >= 10
        OR (v_previous.review_count = 0 AND v_stats.total_count > 0)
    );

    -- DEFENSIVE LAYER 5: Update Product with Optimistic Concurrency
    UPDATE products
    SET 
        average_rating = COALESCE(v_stats.avg_rating, 0.00),
        review_count = COALESCE(v_stats.total_count, 0),
        rating_distribution = v_distribution,
        last_review_at = v_stats.last_review_at,
        updated_at = NOW()
    WHERE id = p_product_id
        -- Only update if data hasn't changed since we read it
        AND updated_at = v_previous.updated_at;

    IF NOT FOUND THEN
        -- Concurrent update detected
        RAISE LOG 'Concurrent rating update detected for product %', p_product_id;
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Concurrent update detected',
            'error_code', 'CONCURRENT_UPDATE'
        );
    END IF;

    -- DEFENSIVE LAYER 6: Queue Dependent Jobs
    
    -- Update trending if significant change
    IF v_significant_change THEN
        INSERT INTO job_queue (
            job_type,
            priority,
            payload,
            idempotency_key
        ) VALUES (
            'update_trending_products',
            6,
            jsonb_build_object(
                'trigger', 'rating_change',
                'product_id', p_product_id,
                'new_rating', v_stats.avg_rating,
                'new_count', v_stats.total_count,
                'wilson_score', v_stats.wilson_score
            ),
            'trending_' || p_product_id::text || '_' || date_trunc('hour', NOW())::text
        ) ON CONFLICT (idempotency_key) DO NOTHING;
    END IF;

    -- Invalidate caches if needed
    IF v_significant_change AND v_previous.is_active THEN
        INSERT INTO job_queue (
            job_type,
            priority,
            payload,
            idempotency_key
        ) VALUES (
            'invalidate_product_cache',
            5,
            jsonb_build_object(
                'product_id', p_product_id,
                'reason', 'rating_change'
            ),
            'cache_inv_' || p_product_id::text || '_' || date_trunc('minute', NOW())::text
        ) ON CONFLICT (idempotency_key) DO NOTHING;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'product_id', p_product_id,
        'stats', jsonb_build_object(
            'average_rating', COALESCE(v_stats.avg_rating, 0.00),
            'review_count', COALESCE(v_stats.total_count, 0),
            'distribution', v_distribution,
            'significant_change', v_significant_change,
            'wilson_score', COALESCE(v_stats.wilson_score, 0)
        ),
        'previous', jsonb_build_object(
            'average_rating', v_previous.average_rating,
            'review_count', v_previous.review_count
        )
    );

EXCEPTION
    WHEN OTHERS THEN
        RAISE LOG 'Rating update error for product %: % %', 
            p_product_id, SQLERRM, SQLSTATE;
        
        -- Requeue for retry on error
        INSERT INTO job_queue (
            job_type,
            priority,
            payload,
            idempotency_key
        ) VALUES (
            'update_product_rating',
            9,
            jsonb_build_object(
                'product_id', p_product_id,
                'error', SQLERRM,
                'retry_after_error', true
            ),
            'rating_error_' || p_product_id::text || '_' || NOW()::text
        ) ON CONFLICT DO NOTHING;
        
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Failed to update ratings',
            'error_code', 'UPDATE_FAILED'
        );
END;
$$;


ALTER FUNCTION "public"."update_product_rating_stats"("p_product_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."update_product_rating_stats"("p_product_id" "uuid") IS 'Aggregates review statistics with enterprise-grade reliability:
- FOR UPDATE SKIP LOCKED prevents contention under load
- Optimistic concurrency control prevents race conditions
- Wilson score provides better ranking for low review counts
- Detects significant changes for cache invalidation
- Automatic retry on failure via job queue
Returns comprehensive stats including distribution and Wilson score.';



CREATE OR REPLACE FUNCTION "public"."update_product_stats_on_review_change"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_product_id UUID;
BEGIN
  -- Get the affected product ID
  v_product_id := COALESCE(NEW.product_id, OLD.product_id);
  
  -- Recalculate all product stats atomically
  UPDATE products
  SET 
    average_rating = COALESCE((
      SELECT AVG(rating)
      FROM reviews
      WHERE product_id = v_product_id
        AND is_approved = true
        AND deleted_at IS NULL
    ), 0),
    review_count = (
      SELECT COUNT(*)
      FROM reviews
      WHERE product_id = v_product_id
        AND is_approved = true
        AND deleted_at IS NULL
    ),
    rating_distribution = (
      SELECT jsonb_build_object(
        '1', COALESCE(COUNT(*) FILTER (WHERE rating = 1), 0),
        '2', COALESCE(COUNT(*) FILTER (WHERE rating = 2), 0),
        '3', COALESCE(COUNT(*) FILTER (WHERE rating = 3), 0),
        '4', COALESCE(COUNT(*) FILTER (WHERE rating = 4), 0),
        '5', COALESCE(COUNT(*) FILTER (WHERE rating = 5), 0),
        'total', COALESCE(COUNT(*), 0),
        'average', COALESCE(AVG(rating), 0)
      )
      FROM reviews
      WHERE product_id = v_product_id
        AND is_approved = true
        AND deleted_at IS NULL
    ),
    updated_at = NOW()
  WHERE id = v_product_id;
  
  RETURN COALESCE(NEW, OLD);
END;
$$;


ALTER FUNCTION "public"."update_product_stats_on_review_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_product_variant"("p_variant_id" "uuid", "p_sku" character varying DEFAULT NULL::character varying, "p_price" numeric DEFAULT NULL::numeric, "p_compare_at_price" numeric DEFAULT NULL::numeric, "p_cost_price" numeric DEFAULT NULL::numeric, "p_is_active" boolean DEFAULT NULL::boolean) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'private', 'pg_temp'
    SET "statement_timeout" TO '30s'
    AS $_$
DECLARE
  v_vendor_id uuid;
  v_product_id uuid;
  v_product_vendor_id uuid;
  v_old_values jsonb;
BEGIN
  -- 1. Authentication check
  v_vendor_id := auth.uid();
  IF v_vendor_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: Must be authenticated';
  END IF;
  
  -- 2. Role check
  IF NOT public.user_has_role(v_vendor_id, 'vendor') THEN
    RAISE EXCEPTION 'Unauthorized: Must be a vendor';
  END IF;
  
  -- 3. Get variant's product and verify ownership
  SELECT pv.product_id, p.vendor_id,
    jsonb_build_object(
      'sku', pv.sku,
      'price', pv.price,
      'compare_at_price', pv.compare_at_price,
      'cost_price', pv.cost_price,
      'is_active', pv.is_active
    )
  INTO v_product_id, v_product_vendor_id, v_old_values
  FROM product_variants pv
  JOIN products p ON p.id = pv.product_id
  WHERE pv.id = p_variant_id;
  
  IF v_product_id IS NULL THEN
    RAISE EXCEPTION 'Variant not found';
  END IF;
  
  IF v_product_vendor_id != v_vendor_id THEN
    RAISE EXCEPTION 'Unauthorized: Cannot update variants for products you do not own';
  END IF;
  
  -- 4. Validate SKU if provided
  IF p_sku IS NOT NULL AND p_sku !~ '^[A-Z0-9][A-Z0-9\-_]{0,49}$' THEN
    RAISE EXCEPTION 'Invalid SKU format';
  END IF;
  
  -- 5. Validate price if provided
  IF p_price IS NOT NULL AND p_price < 0 THEN
    RAISE EXCEPTION 'Price cannot be negative';
  END IF;
  
  -- 6. Update variant (only non-null fields)
  UPDATE product_variants
  SET 
    sku = COALESCE(p_sku, sku),
    price = COALESCE(p_price, price),
    compare_at_price = CASE WHEN p_compare_at_price IS NOT NULL THEN p_compare_at_price ELSE compare_at_price END,
    cost_price = CASE WHEN p_cost_price IS NOT NULL THEN p_cost_price ELSE cost_price END,
    is_active = COALESCE(p_is_active, is_active)
  WHERE id = p_variant_id;
  
  -- 7. Audit log
  INSERT INTO product_change_log (
    product_id, changed_by, change_type, old_values, new_values
  ) VALUES (
    v_product_id, v_vendor_id, 'variant_updated',
    v_old_values,
    jsonb_build_object(
      'sku', p_sku,
      'price', p_price,
      'compare_at_price', p_compare_at_price,
      'cost_price', p_cost_price,
      'is_active', p_is_active
    )
  );
  
  -- 8. Notify cache
  PERFORM pg_notify('product_changed', json_build_object(
    'product_id', v_product_id,
    'action', 'variant_updated'
  )::text);
  
  -- 9. Return result
  RETURN jsonb_build_object(
    'success', true,
    'message', 'Variant updated successfully'
  );

EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'SKU already exists';
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Failed to update variant: %', SQLERRM;
END;
$_$;


ALTER FUNCTION "public"."update_product_variant"("p_variant_id" "uuid", "p_sku" character varying, "p_price" numeric, "p_compare_at_price" numeric, "p_cost_price" numeric, "p_is_active" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_promotion_checks"("p_promotion_id" "uuid", "p_check_type" "text", "p_status" "text", "p_admin_id" "uuid", "p_note" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'private', 'pg_temp'
    AS $$
BEGIN
  RETURN private.update_promotion_checks(p_promotion_id, p_check_type, p_status, p_admin_id, p_note);
END;
$$;


ALTER FUNCTION "public"."update_promotion_checks"("p_promotion_id" "uuid", "p_check_type" "text", "p_status" "text", "p_admin_id" "uuid", "p_note" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_stylist_rating_average"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_stylist_id UUID;
  v_avg_rating NUMERIC;
  v_total_ratings INT;
BEGIN
  -- Determine which stylist to update
  IF TG_OP = 'DELETE' THEN
    v_stylist_id := OLD.stylist_user_id;
  ELSE
    v_stylist_id := NEW.stylist_user_id;
  END IF;

  -- Calculate average rating for approved ratings only
  SELECT 
    ROUND(AVG(rating)::numeric, 2),
    COUNT(*)
  INTO v_avg_rating, v_total_ratings
  FROM stylist_ratings
  WHERE stylist_user_id = v_stylist_id
    AND is_approved = TRUE
    AND moderation_status = 'approved';

  -- Update stylist profile
  UPDATE stylist_profiles
  SET 
    rating_average = COALESCE(v_avg_rating, 0),
    updated_at = NOW()
  WHERE user_id = v_stylist_id;

  -- Log for debugging
  RAISE NOTICE 'Updated stylist % rating: avg=%, total=%', 
    v_stylist_id, v_avg_rating, v_total_ratings;

  RETURN COALESCE(NEW, OLD);
END;
$$;


ALTER FUNCTION "public"."update_stylist_rating_average"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."update_stylist_rating_average"() IS 'Automatically updates stylist average rating when ratings are created, updated, or deleted. Only counts approved ratings.';



CREATE OR REPLACE FUNCTION "public"."update_support_ticket"("p_ticket_id" "uuid", "p_status" "text" DEFAULT NULL::"text", "p_priority" "text" DEFAULT NULL::"text", "p_assigned_to" "uuid" DEFAULT NULL::"uuid", "p_internal_note" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_admin_id uuid;
  v_old_values record;
  v_changes jsonb := '{}';
BEGIN
  -- Security check
  PERFORM public.assert_admin_or_support();
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


ALTER FUNCTION "public"."update_support_ticket"("p_ticket_id" "uuid", "p_status" "text", "p_priority" "text", "p_assigned_to" "uuid", "p_internal_note" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_ticket_status_timestamps"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  -- Set resolved_at when status changes to resolved
  IF NEW.status = 'resolved' AND OLD.status != 'resolved' THEN
    NEW.resolved_at = now();
  END IF;
  
  -- Set closed_at when status changes to closed
  IF NEW.status = 'closed' AND OLD.status != 'closed' THEN
    NEW.closed_at = now();
  END IF;
  
  -- Clear timestamps if status changes back
  IF NEW.status != 'resolved' AND OLD.status = 'resolved' THEN
    NEW.resolved_at = NULL;
  END IF;
  
  IF NEW.status != 'closed' AND OLD.status = 'closed' THEN
    NEW.closed_at = NULL;
  END IF;
  
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_ticket_status_timestamps"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_ticket_timestamp"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  UPDATE public.support_tickets 
  SET updated_at = now() 
  WHERE id = NEW.ticket_id;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_ticket_timestamp"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_trust_engine_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_trust_engine_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_vendor_commission"("p_vendor_id" "uuid", "p_commission_rate" numeric) RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'private', 'pg_temp'
    SET "statement_timeout" TO '5s'
    AS $$
DECLARE
  v_admin_id uuid;
  v_old_rate numeric;
BEGIN
  v_admin_id := auth.uid();
  
  -- FIXED: Removed IF NOT, use PERFORM
  PERFORM private.assert_admin();
  
  IF p_commission_rate < 0 OR p_commission_rate > 1 THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Commission rate must be between 0 and 1 (0-100%)'
    );
  END IF;
  
  SELECT commission_rate INTO v_old_rate
  FROM vendor_profiles
  WHERE user_id = p_vendor_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Vendor not found'
    );
  END IF;
  
  UPDATE vendor_profiles
  SET 
    commission_rate = p_commission_rate,
    updated_at = now()
  WHERE user_id = p_vendor_id;
  
  INSERT INTO user_audit_log (user_id, action, resource_type, resource_id, old_values, new_values)
  VALUES (
    v_admin_id,
    'vendor_commission_updated',
    'vendor_profile',
    p_vendor_id,
    jsonb_build_object('commission_rate', v_old_rate),
    jsonb_build_object('commission_rate', p_commission_rate)
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'message', 'Commission rate updated successfully',
    'old_rate', v_old_rate,
    'new_rate', p_commission_rate
  );
END;
$$;


ALTER FUNCTION "public"."update_vendor_commission"("p_vendor_id" "uuid", "p_commission_rate" numeric) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."update_vendor_commission"("p_vendor_id" "uuid", "p_commission_rate" numeric) IS 'Fixed: IF NOT assert_admin() → PERFORM assert_admin()';



CREATE OR REPLACE FUNCTION "public"."update_vendor_payment_methods"("p_bank_account_name" "text" DEFAULT NULL::"text", "p_bank_account_number" "text" DEFAULT NULL::"text", "p_bank_name" "text" DEFAULT NULL::"text", "p_bank_branch" "text" DEFAULT NULL::"text", "p_esewa_number" "text" DEFAULT NULL::"text", "p_khalti_number" "text" DEFAULT NULL::"text", "p_tax_id" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'private', 'extensions', 'pg_temp'
    AS $$
DECLARE
  v_user_id UUID;
  v_key TEXT;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;
  
  IF NOT public.user_has_role(v_user_id, 'vendor') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;
  
  v_key := private.get_encryption_key();
  
  UPDATE public.vendor_profiles
  SET
    bank_account_name = COALESCE(p_bank_account_name, bank_account_name),
    bank_name = COALESCE(p_bank_name, bank_name),
    bank_branch = COALESCE(p_bank_branch, bank_branch),
    bank_account_number_enc = CASE 
      WHEN p_bank_account_number IS NOT NULL AND p_bank_account_number <> ''
      THEN extensions.pgp_sym_encrypt(p_bank_account_number, v_key)
      ELSE bank_account_number_enc
    END,
    esewa_number_enc = CASE 
      WHEN p_esewa_number IS NOT NULL AND p_esewa_number <> ''
      THEN extensions.pgp_sym_encrypt(p_esewa_number, v_key)
      ELSE esewa_number_enc
    END,
    khalti_number_enc = CASE 
      WHEN p_khalti_number IS NOT NULL AND p_khalti_number <> ''
      THEN extensions.pgp_sym_encrypt(p_khalti_number, v_key)
      ELSE khalti_number_enc
    END,
    tax_id_enc = CASE 
      WHEN p_tax_id IS NOT NULL AND p_tax_id <> ''
      THEN extensions.pgp_sym_encrypt(p_tax_id, v_key)
      ELSE tax_id_enc
    END,
    updated_at = NOW()
  WHERE user_id = v_user_id;
  
  RETURN jsonb_build_object('success', true, 'message', 'Payment methods updated successfully');
  
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;


ALTER FUNCTION "public"."update_vendor_payment_methods"("p_bank_account_name" "text", "p_bank_account_number" "text", "p_bank_name" "text", "p_bank_branch" "text", "p_esewa_number" "text", "p_khalti_number" "text", "p_tax_id" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."update_vendor_payment_methods"("p_bank_account_name" "text", "p_bank_account_number" "text", "p_bank_name" "text", "p_bank_branch" "text", "p_esewa_number" "text", "p_khalti_number" "text", "p_tax_id" "text") IS 'Allows vendors to update their payment methods. Encrypts sensitive data before storing. Only the vendor can update their own data.';



CREATE OR REPLACE FUNCTION "public"."update_vendor_product"("p_product_id" "uuid", "p_product_data" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    SET "statement_timeout" TO '10s'
    AS $$
DECLARE v_vendor_id uuid; v_product_vendor_id uuid; v_old_data jsonb; v_slug text;
BEGIN
  v_vendor_id := auth.uid();
  IF v_vendor_id IS NULL THEN RAISE EXCEPTION 'Unauthorized: Must be authenticated'; END IF;
  
  SELECT vendor_id, row_to_json(products.*)::jsonb INTO v_product_vendor_id, v_old_data FROM products WHERE id = p_product_id;
  IF v_product_vendor_id IS NULL THEN RAISE EXCEPTION 'Product not found'; END IF;
  IF v_product_vendor_id != v_vendor_id AND NOT public.user_has_role('admin') THEN RAISE EXCEPTION 'Unauthorized: Can only edit own products'; END IF;
  
  IF p_product_data ? 'name' AND LENGTH(p_product_data->>'name') > 200 THEN RAISE EXCEPTION 'Product name too long (max 200 characters)'; END IF;
  IF p_product_data ? 'description' AND LENGTH(p_product_data->>'description') > 5000 THEN RAISE EXCEPTION 'Description too long (max 5000 characters)'; END IF;
  
  SELECT slug INTO v_slug FROM products WHERE id = p_product_id;
  
  UPDATE products SET
    name = COALESCE(p_product_data->>'name', name),
    description = COALESCE(p_product_data->>'description', description),
    short_description = COALESCE(p_product_data->>'short_description', short_description),
    material = COALESCE(p_product_data->>'material', material),
    care_instructions = COALESCE(p_product_data->>'care_instructions', care_instructions),
    is_active = COALESCE((p_product_data->>'is_active')::boolean, is_active),
    is_featured = COALESCE((p_product_data->>'is_featured')::boolean, is_featured),
    updated_at = NOW()
  WHERE id = p_product_id;
  
  INSERT INTO product_change_log (product_id, changed_by, change_type, changes)
  VALUES (p_product_id, v_vendor_id, 'updated', jsonb_build_object('old', v_old_data, 'new', p_product_data));
  
  PERFORM pg_notify('product_changed', json_build_object('product_id', p_product_id, 'vendor_id', v_vendor_id, 'action', 'updated', 'slug', v_slug)::text);
  
  RETURN jsonb_build_object('success', true, 'product_id', p_product_id, 'message', 'Product updated successfully');
EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'Product update failed: %', SQLERRM;
END;
$$;


ALTER FUNCTION "public"."update_vendor_product"("p_product_id" "uuid", "p_product_data" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_vendor_product"("p_product_id" "uuid", "p_name" character varying DEFAULT NULL::character varying, "p_description" "text" DEFAULT NULL::"text", "p_short_description" "text" DEFAULT NULL::"text", "p_material" "text" DEFAULT NULL::"text", "p_care_instructions" "text" DEFAULT NULL::"text", "p_is_active" boolean DEFAULT NULL::boolean, "p_is_featured" boolean DEFAULT NULL::boolean) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'private', 'pg_temp'
    SET "statement_timeout" TO '30s'
    AS $$
DECLARE
  v_vendor_id uuid;
  v_product_vendor_id uuid;
  v_old_values jsonb;
BEGIN
  -- 1. Authentication check
  v_vendor_id := auth.uid();
  IF v_vendor_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: Must be authenticated';
  END IF;
  
  -- 2. Role check
  IF NOT public.user_has_role(v_vendor_id, 'vendor') THEN
    RAISE EXCEPTION 'Unauthorized: Must be a vendor';
  END IF;
  
  -- 3. Verify product ownership
  SELECT vendor_id,
    jsonb_build_object(
      'name', name,
      'description', description,
      'is_active', is_active
    )
  INTO v_product_vendor_id, v_old_values
  FROM products WHERE id = p_product_id;
  
  IF v_product_vendor_id IS NULL THEN
    RAISE EXCEPTION 'Product not found';
  END IF;
  
  IF v_product_vendor_id != v_vendor_id THEN
    RAISE EXCEPTION 'Unauthorized: Cannot update products you do not own';
  END IF;
  
  -- 4. Update product (only non-null fields)
  UPDATE products
  SET 
    name = COALESCE(p_name, name),
    description = COALESCE(p_description, description),
    short_description = COALESCE(p_short_description, short_description),
    material = COALESCE(p_material, material),
    care_instructions = COALESCE(p_care_instructions, care_instructions),
    is_active = COALESCE(p_is_active, is_active),
    is_featured = COALESCE(p_is_featured, is_featured),
    updated_at = now()
  WHERE id = p_product_id;
  
  -- 5. Audit log
  INSERT INTO product_change_log (
    product_id, changed_by, change_type, old_values, new_values
  ) VALUES (
    p_product_id, v_vendor_id, 'product_updated',
    v_old_values,
    jsonb_build_object(
      'name', p_name,
      'description', p_description,
      'is_active', p_is_active
    )
  );
  
  -- 6. Notify cache
  PERFORM pg_notify('product_changed', json_build_object(
    'product_id', p_product_id,
    'action', 'updated'
  )::text);
  
  -- 7. Return result
  RETURN jsonb_build_object(
    'success', true,
    'message', 'Product updated successfully'
  );

EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Failed to update product: %', SQLERRM;
END;
$$;


ALTER FUNCTION "public"."update_vendor_product"("p_product_id" "uuid", "p_name" character varying, "p_description" "text", "p_short_description" "text", "p_material" "text", "p_care_instructions" "text", "p_is_active" boolean, "p_is_featured" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_vendor_product_simple"("p_product_id" "uuid", "p_name" character varying DEFAULT NULL::character varying, "p_description" "text" DEFAULT NULL::"text", "p_category_id" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'private', 'pg_temp'
    SET "statement_timeout" TO '30s'
    AS $$
DECLARE
  v_vendor_id uuid;
  v_product_vendor_id uuid;
  v_old_values jsonb;
BEGIN
  -- 1. Authentication check
  v_vendor_id := auth.uid();
  IF v_vendor_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: Must be authenticated';
  END IF;
  
  -- 2. Role check
  IF NOT public.user_has_role(v_vendor_id, 'vendor') THEN
    RAISE EXCEPTION 'Unauthorized: Must be a vendor';
  END IF;
  
  -- 3. Verify product ownership
  SELECT vendor_id,
    jsonb_build_object(
      'name', name,
      'description', description,
      'category_id', category_id
    )
  INTO v_product_vendor_id, v_old_values
  FROM products WHERE id = p_product_id;
  
  IF v_product_vendor_id IS NULL THEN
    RAISE EXCEPTION 'Product not found';
  END IF;
  
  IF v_product_vendor_id != v_vendor_id THEN
    RAISE EXCEPTION 'Unauthorized: Cannot update products you do not own';
  END IF;
  
  -- 4. Update product (only non-null fields)
  UPDATE products
  SET 
    name = COALESCE(p_name, name),
    description = COALESCE(p_description, description),
    category_id = COALESCE(p_category_id, category_id),
    updated_at = now()
  WHERE id = p_product_id;
  
  -- 5. Audit log
  INSERT INTO product_change_log (
    product_id, changed_by, change_type, old_values, new_values
  ) VALUES (
    p_product_id, v_vendor_id, 'updated',
    v_old_values,
    jsonb_build_object(
      'name', p_name,
      'description', p_description,
      'category_id', p_category_id
    )
  );
  
  -- 6. Return result
  RETURN jsonb_build_object(
    'success', true,
    'message', 'Product updated successfully'
  );

EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Failed to update product: %', SQLERRM;
END;
$$;


ALTER FUNCTION "public"."update_vendor_product_simple"("p_product_id" "uuid", "p_name" character varying, "p_description" "text", "p_category_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."user_has_role"("user_uuid" "uuid", "role_name" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.user_roles ur
        JOIN public.roles r ON ur.role_id = r.id
        WHERE ur.user_id = user_uuid 
        AND r.name = role_name 
        AND ur.is_active = TRUE
        AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
    );
END;
$$;


ALTER FUNCTION "public"."user_has_role"("user_uuid" "uuid", "role_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_order_cancellation"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF NEW.status = 'cancelled' AND OLD.status NOT IN (
    'pending', 'payment_authorized', 'processing'
  ) THEN
    RAISE EXCEPTION 'Cannot cancel order in % state. Valid states: pending, payment_authorized, processing', OLD.status;
  END IF;
  
  IF NEW.status = 'cancelled' AND OLD.status != 'cancelled' THEN
    NEW.canceled_at := COALESCE(NEW.canceled_at, NOW());
  END IF;
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."validate_order_cancellation"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_status_transition"("p_old_status" "text", "p_new_status" "text") RETURNS boolean
    LANGUAGE "plpgsql" IMMUTABLE
    AS $$
BEGIN
    IF p_old_status = p_new_status THEN
        RETURN TRUE;
    END IF;
    
    IF p_old_status IN ('completed', 'cancelled', 'no_show') THEN
        RETURN FALSE;
    END IF;
    
    IF p_old_status = 'pending' THEN
        RETURN p_new_status IN ('confirmed', 'cancelled');
    END IF;
    
    IF p_old_status = 'confirmed' THEN
        RETURN p_new_status IN ('in_progress', 'completed', 'cancelled', 'no_show');
    END IF;
    
    IF p_old_status = 'in_progress' THEN
        RETURN p_new_status IN ('completed', 'cancelled');
    END IF;
    
    RETURN FALSE;
END;
$$;


ALTER FUNCTION "public"."validate_status_transition"("p_old_status" "text", "p_new_status" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."validate_status_transition"("p_old_status" "text", "p_new_status" "text") IS 'FSM validator for booking status transitions. Returns TRUE if transition is valid, FALSE otherwise.';



CREATE OR REPLACE FUNCTION "public"."validate_vendor_state_transition"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth', 'private', 'pg_temp'
    AS $$
DECLARE v_is_admin BOOLEAN;
BEGIN
    IF TG_OP = 'INSERT' THEN RETURN NEW; END IF;
    BEGIN
        v_is_admin := private.assert_admin();
    EXCEPTION WHEN OTHERS THEN v_is_admin := FALSE;
    END;
    CASE OLD.application_state
        WHEN 'approved' THEN
            IF NEW.application_state != 'approved' AND NOT v_is_admin THEN
                RAISE EXCEPTION 'Cannot change approved vendor state without admin privileges';
            END IF;
        WHEN 'rejected' THEN
            IF NEW.application_state NOT IN ('rejected', 'draft') THEN
                RAISE EXCEPTION 'Rejected vendor can only re-apply';
            END IF;
        WHEN 'submitted' THEN
            IF NEW.application_state NOT IN ('submitted', 'under_review', 'info_requested', 'approved', 'rejected') THEN
                RAISE EXCEPTION 'Invalid state transition';
            END IF;
            IF OLD.application_state != NEW.application_state AND NOT v_is_admin THEN
                RAISE EXCEPTION 'Only admins can change submitted application state';
            END IF;
        ELSE NULL;
    END CASE;
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."validate_vendor_state_transition"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."verify_guest_session"("p_token" "text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $_$
BEGIN
  -- Simple validation: token must be non-empty and valid format
  IF p_token IS NULL OR p_token = '' THEN
    RAISE EXCEPTION 'Invalid guest token';
  END IF;
  
  -- For UUID-based tokens, validate format
  IF LENGTH(p_token) = 36 AND p_token ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    -- Valid UUID format, use it as session ID
    RETURN p_token;
  END IF;
  
  -- For other formats, just accept them (backwards compatibility)
  RETURN p_token;
END;
$_$;


ALTER FUNCTION "public"."verify_guest_session"("p_token" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."verify_guest_session"("p_token" "text") IS 'Validates a guest token and returns it as session ID';



CREATE OR REPLACE FUNCTION "public"."verify_vendor_document"("p_document_id" "uuid", "p_document_number" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth', 'private', 'pg_temp'
    AS $$
DECLARE
    v_admin_id UUID;
BEGIN
    v_admin_id := auth.uid();
    
    IF NOT public.user_has_role(v_admin_id, 'admin') THEN
        RAISE EXCEPTION 'Unauthorized: Admin access required';
    END IF;
    
    UPDATE vendor_documents
    SET 
        status = 'verified',
        verified_at = NOW(),
        verified_by = v_admin_id,
        document_number = COALESCE(p_document_number, document_number),
        updated_at = NOW()
    WHERE id = p_document_id;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Document not found');
    END IF;
    
    RETURN jsonb_build_object('success', true, 'message', 'Document verified');
END;
$$;


ALTER FUNCTION "public"."verify_vendor_document"("p_document_id" "uuid", "p_document_number" "text") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "metrics"."platform_daily" (
    "day" "date" NOT NULL,
    "orders" integer DEFAULT 0 NOT NULL,
    "gmv_cents" bigint DEFAULT 0 NOT NULL,
    "refunds_cents" bigint DEFAULT 0 NOT NULL,
    "platform_fees_cents" bigint DEFAULT 0 NOT NULL,
    "payouts_cents" bigint DEFAULT 0 NOT NULL,
    "pending_payout_cents" bigint DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "platform_daily_day_not_future" CHECK (("day" <= CURRENT_DATE))
);


ALTER TABLE "metrics"."platform_daily" OWNER TO "postgres";


COMMENT ON TABLE "metrics"."platform_daily" IS 'Platform-wide daily aggregates. Rolled up from vendor_daily. Serves admin dashboard.';



COMMENT ON COLUMN "metrics"."platform_daily"."gmv_cents" IS 'Total platform GMV across all vendors for this day.';



COMMENT ON COLUMN "metrics"."platform_daily"."platform_fees_cents" IS 'Total platform commission revenue for this day.';



CREATE TABLE IF NOT EXISTS "metrics"."product_trending_scores" (
    "product_id" "uuid" NOT NULL,
    "score_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "order_count_1d" integer DEFAULT 0 NOT NULL,
    "order_count_3d" integer DEFAULT 0 NOT NULL,
    "order_count_7d" integer DEFAULT 0 NOT NULL,
    "order_count_14d" integer DEFAULT 0 NOT NULL,
    "trend_score" numeric DEFAULT 0 NOT NULL,
    "weighted_rating" numeric DEFAULT 0 NOT NULL,
    "review_count" integer DEFAULT 0 NOT NULL,
    "last_order_at" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "trending_scores_date_not_future" CHECK (("score_date" <= CURRENT_DATE))
);


ALTER TABLE "metrics"."product_trending_scores" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "metrics"."vendor_daily" (
    "vendor_id" "uuid" NOT NULL,
    "day" "date" NOT NULL,
    "orders" integer DEFAULT 0 NOT NULL,
    "gmv_cents" bigint DEFAULT 0 NOT NULL,
    "refunds_cents" bigint DEFAULT 0 NOT NULL,
    "platform_fees_cents" bigint DEFAULT 0 NOT NULL,
    "payouts_cents" bigint DEFAULT 0 NOT NULL,
    "pending_payout_cents" bigint DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "vendor_daily_day_not_future" CHECK (("day" <= CURRENT_DATE))
);


ALTER TABLE "metrics"."vendor_daily" OWNER TO "postgres";


COMMENT ON TABLE "metrics"."vendor_daily" IS 'Daily aggregated metrics per vendor. Updated incrementally by order lifecycle events. Primary key (vendor_id, day) enables idempotent UPSERT operations.';



COMMENT ON COLUMN "metrics"."vendor_daily"."gmv_cents" IS 'Gross Merchandise Value: sum(order_items.total_price_cents) for this vendor on this day.';



COMMENT ON COLUMN "metrics"."vendor_daily"."refunds_cents" IS 'Total refunded amount for this vendor on this day.';



COMMENT ON COLUMN "metrics"."vendor_daily"."platform_fees_cents" IS 'Platform commission calculated from vendor GMV.';



COMMENT ON COLUMN "metrics"."vendor_daily"."payouts_cents" IS 'Total amount paid out to vendor on this day.';



COMMENT ON COLUMN "metrics"."vendor_daily"."pending_payout_cents" IS 'GMV minus fees minus already paid out amounts. Updated when payout state changes.';



CREATE TABLE IF NOT EXISTS "metrics"."vendor_realtime_cache" (
    "vendor_id" "uuid" NOT NULL,
    "cache_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "orders" integer DEFAULT 0 NOT NULL,
    "gmv_cents" bigint DEFAULT 0 NOT NULL,
    "refunds_cents" bigint DEFAULT 0 NOT NULL,
    "platform_fees_cents" bigint DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "realtime_cache_today_only" CHECK (("cache_date" = CURRENT_DATE))
);


ALTER TABLE "metrics"."vendor_realtime_cache" OWNER TO "postgres";


COMMENT ON TABLE "metrics"."vendor_realtime_cache" IS 'Hot cache for today metrics. Merged with vendor_daily historical data for dashboard display. Lightweight, fast upserts.';



COMMENT ON COLUMN "metrics"."vendor_realtime_cache"."cache_date" IS 'Always CURRENT_DATE. Enforced by CHECK constraint for data integrity.';



CREATE TABLE IF NOT EXISTS "private"."app_config" (
    "key" "text" NOT NULL,
    "value" "text" NOT NULL
);


ALTER TABLE "private"."app_config" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "private"."audit_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "table_name" "text" NOT NULL,
    "record_id" "uuid" NOT NULL,
    "action" "text" NOT NULL,
    "old_values" "jsonb",
    "new_values" "jsonb",
    "user_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "audit_log_action_check" CHECK (("action" = ANY (ARRAY['INSERT'::"text", 'UPDATE'::"text", 'DELETE'::"text"])))
);


ALTER TABLE "private"."audit_log" OWNER TO "postgres";


COMMENT ON TABLE "private"."audit_log" IS 'System audit log for tracking all database changes. Accessible only via SECURITY DEFINER functions.';



COMMENT ON COLUMN "private"."audit_log"."table_name" IS 'Name of the table that was modified';



COMMENT ON COLUMN "private"."audit_log"."record_id" IS 'ID of the record that was modified';



COMMENT ON COLUMN "private"."audit_log"."action" IS 'Type of action: INSERT, UPDATE, or DELETE';



COMMENT ON COLUMN "private"."audit_log"."old_values" IS 'Previous values before the change (for UPDATE/DELETE)';



COMMENT ON COLUMN "private"."audit_log"."new_values" IS 'New values after the change (for INSERT/UPDATE)';



COMMENT ON COLUMN "private"."audit_log"."user_id" IS 'User who performed the action';



CREATE TABLE IF NOT EXISTS "private"."availability_cache" (
    "id" bigint NOT NULL,
    "stylist_user_id" "uuid" NOT NULL,
    "service_id" "uuid" NOT NULL,
    "cache_date" "date" NOT NULL,
    "available_slots" "jsonb" NOT NULL,
    "computed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone DEFAULT ("now"() + '00:05:00'::interval) NOT NULL
);


ALTER TABLE "private"."availability_cache" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "private"."availability_cache_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "private"."availability_cache_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "private"."availability_cache_id_seq" OWNED BY "private"."availability_cache"."id";



CREATE TABLE IF NOT EXISTS "private"."customer_data_access_log" (
    "id" bigint NOT NULL,
    "stylist_user_id" "uuid" NOT NULL,
    "booking_id" "uuid" NOT NULL,
    "customer_user_id" "uuid" NOT NULL,
    "data_type" "text" NOT NULL,
    "access_reason" "text" NOT NULL,
    "accessed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "ip_address" "inet",
    "user_agent" "text",
    CONSTRAINT "customer_data_access_log_data_type_check" CHECK (("data_type" = ANY (ARRAY['allergy_details'::"text", 'contact_info'::"text", 'medical_notes'::"text"])))
);


ALTER TABLE "private"."customer_data_access_log" OWNER TO "postgres";


COMMENT ON TABLE "private"."customer_data_access_log" IS 'GDPR Article 30: Record of processing activities. Tracks who accessed customer PII (allergies, medical info) and why. Critical for compliance and accountability.';



COMMENT ON COLUMN "private"."customer_data_access_log"."data_type" IS 'Type of PII accessed: allergy_details, contact_info, or medical_notes.';



COMMENT ON COLUMN "private"."customer_data_access_log"."access_reason" IS 'Why the stylist accessed this data (e.g., "Preparing for service", "Customer inquiry"). Required for GDPR compliance.';



CREATE SEQUENCE IF NOT EXISTS "private"."customer_data_access_log_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "private"."customer_data_access_log_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "private"."customer_data_access_log_id_seq" OWNED BY "private"."customer_data_access_log"."id";



CREATE TABLE IF NOT EXISTS "private"."metrics_update_queue" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "day" "date" NOT NULL,
    "vendor_id" "uuid",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "attempts" integer DEFAULT 0 NOT NULL,
    "last_error" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone,
    CONSTRAINT "metrics_update_queue_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'processing'::"text", 'completed'::"text", 'failed'::"text"])))
);


ALTER TABLE "private"."metrics_update_queue" OWNER TO "postgres";


COMMENT ON TABLE "private"."metrics_update_queue" IS 'Deduplication queue for metrics updates. Prevents re-aggregation thrashing under high load.';



CREATE TABLE IF NOT EXISTS "private"."payment_gateway_verifications" (
    "id" bigint NOT NULL,
    "provider" "text" NOT NULL,
    "external_transaction_id" "text" NOT NULL,
    "payment_intent_id" "text" NOT NULL,
    "verification_response" "jsonb" NOT NULL,
    "amount_verified" bigint NOT NULL,
    "status" "text" NOT NULL,
    "verified_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "payment_gateway_verifications_provider_check" CHECK (("provider" = ANY (ARRAY['esewa'::"text", 'khalti'::"text"]))),
    CONSTRAINT "payment_gateway_verifications_status_check" CHECK (("status" = ANY (ARRAY['success'::"text", 'failed'::"text", 'amount_mismatch'::"text"])))
);


ALTER TABLE "private"."payment_gateway_verifications" OWNER TO "postgres";


COMMENT ON TABLE "private"."payment_gateway_verifications" IS 'Server-side verification results from eSewa/Khalti APIs. The UNIQUE(provider, external_transaction_id) constraint prevents replay attacks. This table is in private schema and only accessible to service_role to prevent data leakage.';



COMMENT ON COLUMN "private"."payment_gateway_verifications"."external_transaction_id" IS 'eSewa transaction_uuid or Khalti pidx. Combined with provider in UNIQUE constraint, this prevents the same gateway transaction from being verified twice.';



COMMENT ON COLUMN "private"."payment_gateway_verifications"."verification_response" IS 'Complete JSON response from gateway verification API (eSewa /transaction/status or Khalti /lookup). Used for debugging, fraud investigation, and reconciliation.';



COMMENT ON COLUMN "private"."payment_gateway_verifications"."amount_verified" IS 'Amount in paisa (1 NPR = 100 paisa). Must match payment_intents.amount_cents to prevent amount tampering attacks. Amount mismatch triggers status=amount_mismatch.';



COMMENT ON COLUMN "private"."payment_gateway_verifications"."status" IS 'Verification outcome: success (payment confirmed), failed (gateway rejected), amount_mismatch (critical fraud indicator).';



CREATE SEQUENCE IF NOT EXISTS "private"."payment_gateway_verifications_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "private"."payment_gateway_verifications_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "private"."payment_gateway_verifications_id_seq" OWNED BY "private"."payment_gateway_verifications"."id";



CREATE TABLE IF NOT EXISTS "private"."schedule_change_log" (
    "id" bigint NOT NULL,
    "stylist_user_id" "uuid" NOT NULL,
    "change_date" "date" NOT NULL,
    "change_type" "text" NOT NULL,
    "old_values" "jsonb",
    "new_values" "jsonb",
    "reason" "text",
    "is_emergency" boolean DEFAULT false NOT NULL,
    "ip_address" "inet",
    "user_agent" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "schedule_change_log_change_type_check" CHECK (("change_type" = ANY (ARRAY['availability_override'::"text", 'schedule_update'::"text", 'emergency_block'::"text"])))
);


ALTER TABLE "private"."schedule_change_log" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "private"."schedule_change_log_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "private"."schedule_change_log_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "private"."schedule_change_log_id_seq" OWNED BY "private"."schedule_change_log"."id";



CREATE TABLE IF NOT EXISTS "private"."service_management_log" (
    "id" bigint NOT NULL,
    "admin_user_id" "uuid" NOT NULL,
    "action" "text" NOT NULL,
    "target_id" "uuid",
    "target_type" "text",
    "severity" "text" DEFAULT 'info'::"text" NOT NULL,
    "category" "text" NOT NULL,
    "details" "jsonb",
    "ip_address" "inet",
    "user_agent" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "service_management_log_category_check" CHECK (("category" = ANY (ARRAY['governance'::"text", 'security'::"text", 'data_access'::"text", 'configuration'::"text"]))),
    CONSTRAINT "service_management_log_severity_check" CHECK (("severity" = ANY (ARRAY['info'::"text", 'warning'::"text", 'critical'::"text"]))),
    CONSTRAINT "service_management_log_target_type_check" CHECK (("target_type" = ANY (ARRAY['service'::"text", 'stylist_profile'::"text", 'stylist_schedule'::"text", 'stylist_promotion'::"text", 'schedule_override'::"text", 'override_budget'::"text"])))
);


ALTER TABLE "private"."service_management_log" OWNER TO "postgres";


COMMENT ON TABLE "private"."service_management_log" IS 'Specialized audit log for service engine operations. Category-based filtering enables role-based access.';



CREATE SEQUENCE IF NOT EXISTS "private"."service_management_log_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "private"."service_management_log_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "private"."service_management_log_id_seq" OWNED BY "private"."service_management_log"."id";



CREATE TABLE IF NOT EXISTS "public"."attribute_values" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "attribute_id" "uuid" NOT NULL,
    "value" character varying(100) NOT NULL,
    "display_value" character varying(100) NOT NULL,
    "color_hex" character varying(7),
    "sort_order" integer DEFAULT 0,
    "is_active" boolean DEFAULT true,
    "vendor_id" "uuid"
);


ALTER TABLE "public"."attribute_values" OWNER TO "postgres";


COMMENT ON COLUMN "public"."attribute_values"."vendor_id" IS 'NULL = global value, NOT NULL = vendor-specific value';



CREATE TABLE IF NOT EXISTS "public"."booking_reservations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "customer_user_id" "uuid" NOT NULL,
    "stylist_user_id" "uuid" NOT NULL,
    "service_id" "uuid" NOT NULL,
    "start_time" timestamp with time zone NOT NULL,
    "end_time" timestamp with time zone NOT NULL,
    "price_cents" integer NOT NULL,
    "customer_name" "text" NOT NULL,
    "customer_phone" "text",
    "customer_email" "text",
    "customer_notes" "text",
    "status" "text" DEFAULT 'reserved'::"text" NOT NULL,
    "expires_at" timestamp with time zone DEFAULT ("now"() + '00:15:00'::interval) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "customer_address_line1" "text",
    "customer_city" "text",
    "customer_state" "text" DEFAULT 'Bagmati Province'::"text",
    "customer_postal_code" "text",
    "customer_country" "text" DEFAULT 'Nepal'::"text",
    CONSTRAINT "booking_reservations_price_cents_check" CHECK (("price_cents" >= 0)),
    CONSTRAINT "booking_reservations_status_check" CHECK (("status" = ANY (ARRAY['reserved'::"text", 'confirmed'::"text", 'expired'::"text", 'cancelled'::"text"]))),
    CONSTRAINT "prevent_self_booking_reservation" CHECK (("customer_user_id" <> "stylist_user_id"))
);


ALTER TABLE "public"."booking_reservations" OWNER TO "postgres";


COMMENT ON TABLE "public"."booking_reservations" IS 'Temporary booking reservations with TTL, separate from product cart';



COMMENT ON COLUMN "public"."booking_reservations"."customer_address_line1" IS 'Customer address for temporary reservation';



COMMENT ON CONSTRAINT "prevent_self_booking_reservation" ON "public"."booking_reservations" IS 'Prevents stylists from booking appointments with themselves. Business rule enforced.';



CREATE TABLE IF NOT EXISTS "public"."booking_status_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "booking_id" "uuid" NOT NULL,
    "old_status" "text" NOT NULL,
    "new_status" "text" NOT NULL,
    "changed_by" "uuid" NOT NULL,
    "change_reason" "text",
    "actor_role" "text" NOT NULL,
    "ip_address" "inet",
    "user_agent" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "booking_status_history_actor_role_check" CHECK (("actor_role" = ANY (ARRAY['customer'::"text", 'stylist'::"text", 'admin'::"text", 'system'::"text"]))),
    CONSTRAINT "booking_status_history_check" CHECK (("old_status" <> "new_status"))
);


ALTER TABLE "public"."booking_status_history" OWNER TO "postgres";


COMMENT ON TABLE "public"."booking_status_history" IS 'Immutable audit trail for all booking status changes. Required for GDPR Article 30 compliance and security forensics.';



CREATE TABLE IF NOT EXISTS "public"."bookings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "customer_user_id" "uuid" NOT NULL,
    "stylist_user_id" "uuid" NOT NULL,
    "service_id" "uuid" NOT NULL,
    "start_time" timestamp with time zone NOT NULL,
    "end_time" timestamp with time zone NOT NULL,
    "price_cents" integer NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "payment_intent_id" "text",
    "order_item_id" "uuid",
    "cancelled_at" timestamp with time zone,
    "cancelled_by" "uuid",
    "cancellation_reason" "text",
    "customer_name" "text" NOT NULL,
    "customer_phone" "text",
    "customer_email" "text",
    "customer_notes" "text",
    "stylist_notes" "text",
    "booking_source" "text" DEFAULT 'web'::"text",
    "reminder_sent_at" timestamp with time zone,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "customer_address_line1" "text",
    "customer_city" "text",
    "customer_state" "text" DEFAULT 'Bagmati Province'::"text",
    "customer_postal_code" "text",
    "customer_country" "text" DEFAULT 'Nepal'::"text",
    "reminder_email_id" "uuid",
    CONSTRAINT "bookings_booking_source_check" CHECK (("booking_source" = ANY (ARRAY['web'::"text", 'mobile'::"text", 'admin'::"text", 'phone'::"text"]))),
    CONSTRAINT "bookings_check" CHECK (("end_time" > "start_time")),
    CONSTRAINT "bookings_check1" CHECK ((("cancelled_at" IS NULL) OR ("cancelled_at" >= "created_at"))),
    CONSTRAINT "bookings_price_cents_check" CHECK (("price_cents" >= 0)),
    CONSTRAINT "bookings_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'confirmed'::"text", 'in_progress'::"text", 'completed'::"text", 'cancelled'::"text", 'no_show'::"text"]))),
    CONSTRAINT "check_reminder_before_start" CHECK ((("reminder_sent_at" IS NULL) OR ("reminder_sent_at" < "start_time"))),
    CONSTRAINT "prevent_self_booking" CHECK ((("customer_user_id" <> "stylist_user_id") OR ("status" = ANY (ARRAY['cancelled'::"text", 'no_show'::"text"]))))
);


ALTER TABLE "public"."bookings" OWNER TO "postgres";


COMMENT ON TABLE "public"."bookings" IS 'Customer bookings for stylist services. Multiple bookings can share the same payment_intent_id when purchased together.';



COMMENT ON COLUMN "public"."bookings"."payment_intent_id" IS 'Payment intent ID from payment gateway. NOT UNIQUE - one payment can include multiple bookings + products.';



COMMENT ON COLUMN "public"."bookings"."reminder_sent_at" IS 'Timestamp when 24hr reminder was sent. Prevents duplicate reminders.';



COMMENT ON COLUMN "public"."bookings"."customer_address_line1" IS 'Snapshot of customer address at booking time (immutable historical record)';



COMMENT ON COLUMN "public"."bookings"."customer_state" IS 'Province/state - defaults to Bagmati Province for Nepal';



COMMENT ON CONSTRAINT "prevent_self_booking" ON "public"."bookings" IS 'Prevents active self-booking vulnerability (CVSS 6.5). Allows cancelled/no-show self-bookings (harmless). Applied 2025-10-19.';



CREATE TABLE IF NOT EXISTS "public"."brands" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" character varying(100) NOT NULL,
    "slug" character varying(100) NOT NULL,
    "description" "text",
    "logo_url" "text",
    "website_url" "text",
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "is_featured" boolean DEFAULT false NOT NULL,
    "featured_at" timestamp with time zone,
    "featured_by" "uuid"
);


ALTER TABLE "public"."brands" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cart_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "cart_id" "uuid" NOT NULL,
    "variant_id" "uuid" NOT NULL,
    "quantity" integer NOT NULL,
    "price_snapshot" numeric,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "combo_id" "uuid",
    "combo_group_id" "uuid",
    CONSTRAINT "cart_items_quantity_check" CHECK (("quantity" > 0))
);


ALTER TABLE "public"."cart_items" OWNER TO "postgres";


COMMENT ON TABLE "public"."cart_items" IS 'Cart items can have duplicate variant_id entries to support:
1. Multiple instances of same combo product (each with unique combo_group_id)
2. Same product added multiple times as separate line items
3. Combo products that share constituent variants
Quantity aggregation is handled in application logic where needed.';



COMMENT ON COLUMN "public"."cart_items"."combo_id" IS 'Reference to the combo product this item belongs to (NULL if not part of combo)';



COMMENT ON COLUMN "public"."cart_items"."combo_group_id" IS 'Unique ID grouping all items from the same combo addition (for removal together)';



CREATE TABLE IF NOT EXISTS "public"."cart_items_backup_20260117" (
    "id" "uuid",
    "cart_id" "uuid",
    "variant_id" "uuid",
    "quantity" integer,
    "price_snapshot" numeric,
    "created_at" timestamp with time zone,
    "updated_at" timestamp with time zone,
    "combo_id" "uuid",
    "combo_group_id" "uuid"
);


ALTER TABLE "public"."cart_items_backup_20260117" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."carts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "session_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."carts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" character varying(100) NOT NULL,
    "slug" character varying(100) NOT NULL,
    "parent_id" "uuid",
    "description" "text",
    "image_url" "text",
    "sort_order" integer DEFAULT 0,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."categories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."combo_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "combo_product_id" "uuid" NOT NULL,
    "constituent_product_id" "uuid" NOT NULL,
    "constituent_variant_id" "uuid" NOT NULL,
    "quantity" integer DEFAULT 1 NOT NULL,
    "display_order" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "combo_items_quantity_check" CHECK (("quantity" > 0))
);


ALTER TABLE "public"."combo_items" OWNER TO "postgres";


COMMENT ON TABLE "public"."combo_items" IS 'Junction table linking combo products to their constituent products/variants';



CREATE TABLE IF NOT EXISTS "public"."curation_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "event_type" "text" NOT NULL,
    "curation_type" "text" NOT NULL,
    "source_id" "uuid",
    "target_id" "uuid",
    "user_id" "uuid",
    "session_id" "text",
    "utm_source" "text",
    "utm_medium" "text",
    "utm_campaign" "text",
    "referrer" "text",
    "user_agent" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "curation_events_curation_type_check" CHECK (("curation_type" = ANY (ARRAY['trending_products'::"text", 'featured_brands'::"text", 'product_recommendations'::"text", 'top_stylists'::"text"]))),
    CONSTRAINT "curation_events_event_type_check" CHECK (("event_type" = ANY (ARRAY['view'::"text", 'click'::"text", 'add_to_cart'::"text", 'purchase'::"text"])))
);


ALTER TABLE "public"."curation_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."email_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "recipient_user_id" "uuid",
    "recipient_email" "text" NOT NULL,
    "recipient_name" "text",
    "email_type" "text" NOT NULL,
    "subject" "text" NOT NULL,
    "template_name" "text",
    "resend_email_id" "text",
    "status" "text" DEFAULT 'sent'::"text" NOT NULL,
    "sent_at" timestamp with time zone DEFAULT "now"(),
    "delivered_at" timestamp with time zone,
    "opened_at" timestamp with time zone,
    "clicked_at" timestamp with time zone,
    "bounced_at" timestamp with time zone,
    "failed_at" timestamp with time zone,
    "failure_reason" "text",
    "bounce_type" "text",
    "attempts" integer DEFAULT 1,
    "reference_id" "text",
    "reference_type" "text",
    "expires_at" timestamp with time zone DEFAULT ("now"() + '90 days'::interval),
    "user_consented" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "email_logs_status_check" CHECK (("status" = ANY (ARRAY['sent'::"text", 'delivered'::"text", 'opened'::"text", 'clicked'::"text", 'bounced'::"text", 'failed'::"text", 'complained'::"text"])))
);


ALTER TABLE "public"."email_logs" OWNER TO "postgres";


COMMENT ON TABLE "public"."email_logs" IS 'Email delivery tracking and audit log. Auto-deletes after 90 days for GDPR compliance.';



COMMENT ON COLUMN "public"."email_logs"."reference_id" IS 'Unique reference (order_id, booking_id, etc.) to prevent duplicate sends';



COMMENT ON COLUMN "public"."email_logs"."expires_at" IS 'Auto-delete date for GDPR compliance (90 days from sent)';



CREATE TABLE IF NOT EXISTS "public"."email_preferences" (
    "user_id" "uuid" NOT NULL,
    "receive_booking_reminders" boolean DEFAULT true,
    "receive_review_requests" boolean DEFAULT true,
    "receive_promotional_emails" boolean DEFAULT false,
    "receive_product_recommendations" boolean DEFAULT true,
    "receive_low_stock_alerts" boolean DEFAULT true,
    "receive_payout_notifications" boolean DEFAULT true,
    "receive_new_order_alerts" boolean DEFAULT true,
    "max_emails_per_day" integer DEFAULT 10,
    "quiet_hours_start" time without time zone DEFAULT '22:00:00'::time without time zone,
    "quiet_hours_end" time without time zone DEFAULT '08:00:00'::time without time zone,
    "timezone" "text" DEFAULT 'Asia/Kathmandu'::"text",
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."email_preferences" OWNER TO "postgres";


COMMENT ON TABLE "public"."email_preferences" IS 'User email preferences for optional notifications. Transactional emails always sent.';



CREATE TABLE IF NOT EXISTS "public"."inventory" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "variant_id" "uuid" NOT NULL,
    "location_id" "uuid" NOT NULL,
    "quantity_available" integer DEFAULT 0 NOT NULL,
    "quantity_reserved" integer DEFAULT 0 NOT NULL,
    "quantity_incoming" integer DEFAULT 0 NOT NULL,
    "reorder_point" integer DEFAULT 5,
    "reorder_quantity" integer DEFAULT 20,
    "last_counted_at" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "inventory_quantity_available_check" CHECK (("quantity_available" >= 0)),
    CONSTRAINT "inventory_quantity_incoming_check" CHECK (("quantity_incoming" >= 0)),
    CONSTRAINT "inventory_quantity_reserved_check" CHECK (("quantity_reserved" >= 0))
);


ALTER TABLE "public"."inventory" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."inventory_locations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "vendor_id" "uuid" NOT NULL,
    "name" character varying(100) NOT NULL,
    "address" "text",
    "is_default" boolean DEFAULT false,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."inventory_locations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."inventory_movements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "variant_id" "uuid" NOT NULL,
    "location_id" "uuid" NOT NULL,
    "movement_type" character varying(20) NOT NULL,
    "quantity_change" integer NOT NULL,
    "quantity_after" integer NOT NULL,
    "reference_id" "uuid",
    "reference_type" character varying(50),
    "notes" "text",
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "inventory_movements_movement_type_check" CHECK ((("movement_type")::"text" = ANY ((ARRAY['purchase'::character varying, 'sale'::character varying, 'adjustment'::character varying, 'transfer'::character varying, 'return'::character varying, 'damage'::character varying])::"text"[])))
);


ALTER TABLE "public"."inventory_movements" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."inventory_violation_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "variant_id" "uuid",
    "attempted_change" integer NOT NULL,
    "current_quantity" integer NOT NULL,
    "error_message" "text" NOT NULL,
    "user_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."inventory_violation_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."job_queue" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "job_type" "text" NOT NULL,
    "priority" integer DEFAULT 5 NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "payload" "jsonb" NOT NULL,
    "idempotency_key" "text",
    "attempts" integer DEFAULT 0 NOT NULL,
    "max_attempts" integer DEFAULT 3 NOT NULL,
    "locked_until" timestamp with time zone,
    "locked_by" "text",
    "last_error" "text",
    "failed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "started_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    CONSTRAINT "job_queue_priority_check" CHECK ((("priority" >= 1) AND ("priority" <= 10))),
    CONSTRAINT "job_queue_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'processing'::"text", 'completed'::"text", 'failed'::"text", 'canceled'::"text"])))
);


ALTER TABLE "public"."job_queue" OWNER TO "postgres";


COMMENT ON TABLE "public"."job_queue" IS 'RESTORATION: Background job queue. RLS enabled, service_role access only.';



CREATE TABLE IF NOT EXISTS "public"."kb_branches" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" character varying(100) NOT NULL,
    "address" "text",
    "phone" character varying(20),
    "email" character varying(100),
    "manager_name" character varying(100),
    "operating_hours" "jsonb" DEFAULT '{}'::"jsonb",
    "is_active" boolean DEFAULT true NOT NULL,
    "display_order" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "kb_branches_display_order_check" CHECK (("display_order" >= 0))
);


ALTER TABLE "public"."kb_branches" OWNER TO "postgres";


COMMENT ON TABLE "public"."kb_branches" IS 'KB Stylish salon branches where stylists work. Separate from vendor inventory locations.';



CREATE TABLE IF NOT EXISTS "public"."moderation_queue" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "subject_type" "text" NOT NULL,
    "subject_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "priority" integer DEFAULT 5 NOT NULL,
    "auto_score" numeric(3,2),
    "toxicity_score" numeric(3,2),
    "spam_score" numeric(3,2),
    "detected_issues" "jsonb" DEFAULT '[]'::"jsonb",
    "contains_pii" boolean DEFAULT false,
    "contains_links" boolean DEFAULT false,
    "assigned_to" "uuid",
    "reviewed_by" "uuid",
    "reviewed_at" timestamp with time zone,
    "review_notes" "text",
    "resolution" "text",
    "due_by" timestamp with time zone,
    "escalated_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "moderation_queue_auto_score_check" CHECK ((("auto_score" >= (0)::numeric) AND ("auto_score" <= (1)::numeric))),
    CONSTRAINT "moderation_queue_priority_check" CHECK ((("priority" >= 1) AND ("priority" <= 10))),
    CONSTRAINT "moderation_queue_spam_score_check" CHECK ((("spam_score" >= (0)::numeric) AND ("spam_score" <= (1)::numeric))),
    CONSTRAINT "moderation_queue_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'in_review'::"text", 'approved'::"text", 'rejected'::"text", 'escalated'::"text"]))),
    CONSTRAINT "moderation_queue_subject_type_check" CHECK (("subject_type" = ANY (ARRAY['review'::"text", 'reply'::"text", 'flag'::"text", 'user'::"text"]))),
    CONSTRAINT "moderation_queue_toxicity_score_check" CHECK ((("toxicity_score" >= (0)::numeric) AND ("toxicity_score" <= (1)::numeric)))
);


ALTER TABLE "public"."moderation_queue" OWNER TO "postgres";


COMMENT ON TABLE "public"."moderation_queue" IS 'Content moderation pipeline for reviews and replies';



CREATE TABLE IF NOT EXISTS "public"."order_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_id" "uuid" NOT NULL,
    "variant_id" "uuid" NOT NULL,
    "product_id" "uuid" NOT NULL,
    "vendor_id" "uuid" NOT NULL,
    "product_name" "text" NOT NULL,
    "product_slug" "text" NOT NULL,
    "variant_sku" "text",
    "quantity" integer NOT NULL,
    "unit_price_cents" integer NOT NULL,
    "total_price_cents" integer NOT NULL,
    "fulfillment_status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "tracking_number" "text",
    "shipping_carrier" "text",
    "shipped_at" timestamp with time zone,
    "delivered_at" timestamp with time zone,
    "cancelled_at" timestamp with time zone,
    "cancellation_reason" "text",
    "combo_id" "uuid",
    "combo_group_id" "uuid",
    CONSTRAINT "order_items_fulfillment_status_check" CHECK (("fulfillment_status" = ANY (ARRAY['pending'::"text", 'processing'::"text", 'shipped'::"text", 'delivered'::"text", 'cancelled'::"text", 'returned'::"text", 'refunded'::"text"]))),
    CONSTRAINT "order_items_quantity_check" CHECK (("quantity" > 0)),
    CONSTRAINT "order_items_total_price_cents_check" CHECK (("total_price_cents" > 0)),
    CONSTRAINT "order_items_unit_price_cents_check" CHECK (("unit_price_cents" > 0))
);


ALTER TABLE "public"."order_items" OWNER TO "postgres";


COMMENT ON COLUMN "public"."order_items"."tracking_number" IS 'Shipment tracking number provided by carrier';



COMMENT ON COLUMN "public"."order_items"."shipping_carrier" IS 'Shipping carrier name (e.g., PathaoExpress, Aramex, Nepal Post)';



COMMENT ON COLUMN "public"."order_items"."shipped_at" IS 'Timestamp when item was marked as shipped';



COMMENT ON COLUMN "public"."order_items"."delivered_at" IS 'Timestamp when item was marked as delivered';



COMMENT ON COLUMN "public"."order_items"."cancelled_at" IS 'Timestamp when item was cancelled';



COMMENT ON COLUMN "public"."order_items"."cancellation_reason" IS 'Optional reason for cancellation';



COMMENT ON COLUMN "public"."order_items"."combo_id" IS 'Reference to the combo product this item came from (NULL if not part of combo)';



COMMENT ON COLUMN "public"."order_items"."combo_group_id" IS 'Unique ID grouping all items from the same combo purchase';



COMMENT ON CONSTRAINT "order_items_fulfillment_status_check" ON "public"."order_items" IS 'Validates fulfillment status. Updated to include cancelled status.';



CREATE SEQUENCE IF NOT EXISTS "public"."order_number_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."order_number_seq" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."orders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_number" "text" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "payment_intent_id" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "subtotal_cents" integer NOT NULL,
    "tax_cents" integer DEFAULT 0 NOT NULL,
    "shipping_cents" integer DEFAULT 0 NOT NULL,
    "discount_cents" integer DEFAULT 0 NOT NULL,
    "total_cents" integer NOT NULL,
    "currency" "text" DEFAULT 'NPR'::"text" NOT NULL,
    "shipping_name" "text" NOT NULL,
    "shipping_phone" "text" NOT NULL,
    "shipping_address_line1" "text" NOT NULL,
    "shipping_address_line2" "text",
    "shipping_city" "text" NOT NULL,
    "shipping_state" "text" NOT NULL,
    "shipping_postal_code" "text" NOT NULL,
    "shipping_country" "text" DEFAULT 'NP'::"text" NOT NULL,
    "tracking_number" "text",
    "notes" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "confirmed_at" timestamp with time zone,
    "shipped_at" timestamp with time zone,
    "delivered_at" timestamp with time zone,
    "canceled_at" timestamp with time zone,
    "review_requested_at" timestamp with time zone,
    "cancellation_reason" "text",
    "cancelled_by" "uuid",
    "payment_method" "text",
    CONSTRAINT "orders_discount_cents_check" CHECK (("discount_cents" >= 0)),
    CONSTRAINT "orders_shipping_cents_check" CHECK (("shipping_cents" >= 0)),
    CONSTRAINT "orders_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'confirmed'::"text", 'processing'::"text", 'shipped'::"text", 'delivered'::"text", 'canceled'::"text", 'refunded'::"text"]))),
    CONSTRAINT "orders_subtotal_cents_check" CHECK (("subtotal_cents" >= 0)),
    CONSTRAINT "orders_tax_cents_check" CHECK (("tax_cents" >= 0)),
    CONSTRAINT "orders_total_cents_check" CHECK (("total_cents" > 0))
);


ALTER TABLE "public"."orders" OWNER TO "postgres";


COMMENT ON TABLE "public"."orders" IS 'RLS Policy Security Fix (2025-10-18): Removed permissive "Allow viewing orders in joins" policy. 
Users can only view own orders via "Users can view own orders" policy.
Vendors can view orders for their products via "Vendors can view own product orders" policy on order_items.';



COMMENT ON COLUMN "public"."orders"."review_requested_at" IS 'Timestamp when review request email was sent. Prevents duplicate requests.';



COMMENT ON COLUMN "public"."orders"."cancellation_reason" IS 'Reason provided when order was cancelled. For analytics and customer service.';



COMMENT ON COLUMN "public"."orders"."cancelled_by" IS 'User who cancelled the order (customer or admin). For audit trail.';



COMMENT ON COLUMN "public"."orders"."payment_method" IS 'The payment method used: npx, khalti, esewa, or cod';



CREATE TABLE IF NOT EXISTS "public"."payment_gateway_verifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "provider" "text" NOT NULL,
    "external_transaction_id" "text" NOT NULL,
    "payment_intent_id" "text" NOT NULL,
    "verification_response" "jsonb" NOT NULL,
    "amount_verified" integer NOT NULL,
    "status" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."payment_gateway_verifications" OWNER TO "postgres";


COMMENT ON TABLE "public"."payment_gateway_verifications" IS 'Audit trail for payment gateway verifications. Provides idempotency and forensic evidence for payment disputes.';



CREATE TABLE IF NOT EXISTS "public"."payment_intents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "cart_id" "uuid" NOT NULL,
    "payment_intent_id" "text" NOT NULL,
    "amount_cents" integer NOT NULL,
    "currency" "text" DEFAULT 'NPR'::"text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "provider" "text" DEFAULT 'mock_provider'::"text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "expires_at" timestamp with time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "client_secret" "text",
    "provider_response" "jsonb",
    "inventory_reserved" boolean DEFAULT false,
    "reserved_at" timestamp with time zone,
    "reservation_expires_at" timestamp with time zone,
    "shipping_address" "jsonb",
    "billing_address" "jsonb",
    "external_transaction_id" "text",
    "gateway_payment_url" "text",
    CONSTRAINT "payment_intents_amount_cents_check" CHECK (("amount_cents" > 0)),
    CONSTRAINT "payment_intents_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'processing'::"text", 'succeeded'::"text", 'failed'::"text", 'canceled'::"text"])))
);


ALTER TABLE "public"."payment_intents" OWNER TO "postgres";


COMMENT ON COLUMN "public"."payment_intents"."external_transaction_id" IS 'Gateway-specific transaction identifier. eSewa: transaction_uuid, Khalti: pidx. UNIQUE constraint prevents same transaction from being used for multiple orders.';



COMMENT ON COLUMN "public"."payment_intents"."gateway_payment_url" IS 'The URL where user was redirected for payment. eSewa: form POST URL, Khalti: payment_url from initiate API. Used for debugging payment flow.';



CREATE TABLE IF NOT EXISTS "public"."payout_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "vendor_id" "uuid" NOT NULL,
    "requested_amount_cents" bigint NOT NULL,
    "payment_method" "text" NOT NULL,
    "payment_details" "jsonb" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "reviewed_by" "uuid",
    "reviewed_at" timestamp with time zone,
    "admin_notes" "text",
    "rejection_reason" "text",
    "payout_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "payout_requests_payment_method_check" CHECK (("payment_method" = ANY (ARRAY['bank_transfer'::"text", 'esewa'::"text", 'khalti'::"text"]))),
    CONSTRAINT "payout_requests_requested_amount_cents_check" CHECK (("requested_amount_cents" >= 100000)),
    CONSTRAINT "payout_requests_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."payout_requests" OWNER TO "postgres";


COMMENT ON TABLE "public"."payout_requests" IS 'Vendor-initiated payout requests requiring admin approval.';



CREATE TABLE IF NOT EXISTS "public"."payouts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "vendor_id" "uuid" NOT NULL,
    "amount_cents" bigint NOT NULL,
    "platform_fees_cents" bigint DEFAULT 0 NOT NULL,
    "net_amount_cents" bigint NOT NULL,
    "payment_method" "text" NOT NULL,
    "payment_reference" "text",
    "payment_proof_url" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "processed_by" "uuid",
    "processed_at" timestamp with time zone,
    "admin_notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "payouts_amount_cents_check" CHECK (("amount_cents" > 0)),
    CONSTRAINT "payouts_arithmetic_check" CHECK (("net_amount_cents" = ("amount_cents" - "platform_fees_cents"))),
    CONSTRAINT "payouts_net_amount_cents_check" CHECK (("net_amount_cents" > 0)),
    CONSTRAINT "payouts_payment_method_check" CHECK (("payment_method" = ANY (ARRAY['bank_transfer'::"text", 'esewa'::"text", 'khalti'::"text"]))),
    CONSTRAINT "payouts_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'processing'::"text", 'completed'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."payouts" OWNER TO "postgres";


COMMENT ON TABLE "public"."payouts" IS 'Completed or in-process payouts to vendors. Created by admin after approving payout_requests.';



COMMENT ON CONSTRAINT "payouts_arithmetic_check" ON "public"."payouts" IS 'Enforces payout arithmetic: net_amount_cents must equal amount_cents minus platform_fees_cents. Prevents financial calculation errors.';



CREATE TABLE IF NOT EXISTS "public"."product_attributes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" character varying(50) NOT NULL,
    "display_name" character varying(100) NOT NULL,
    "attribute_type" character varying(20) NOT NULL,
    "is_variant_defining" boolean DEFAULT true,
    "sort_order" integer DEFAULT 0,
    "is_active" boolean DEFAULT true,
    "vendor_id" "uuid",
    CONSTRAINT "product_attributes_attribute_type_check" CHECK ((("attribute_type")::"text" = ANY ((ARRAY['text'::character varying, 'color'::character varying, 'number'::character varying, 'select'::character varying])::"text"[])))
);


ALTER TABLE "public"."product_attributes" OWNER TO "postgres";


COMMENT ON COLUMN "public"."product_attributes"."vendor_id" IS 'NULL = global attribute (Color, Size), NOT NULL = vendor-specific attribute';



CREATE TABLE IF NOT EXISTS "public"."product_change_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "product_id" "uuid" NOT NULL,
    "variant_id" "uuid",
    "changed_at" timestamp with time zone DEFAULT "now"(),
    "change_type" character varying(20) NOT NULL,
    "changed_fields" "jsonb",
    "old_values" "jsonb",
    "new_values" "jsonb",
    "changed_by" "uuid",
    CONSTRAINT "product_change_log_change_type_check" CHECK ((("change_type")::"text" = ANY ((ARRAY['created'::character varying, 'updated'::character varying, 'deleted'::character varying, 'toggled_active'::character varying, 'price_changed'::character varying, 'inventory_changed'::character varying, 'variant_updated'::character varying, 'variant_added'::character varying, 'product_updated'::character varying, 'attribute_created'::character varying])::"text"[])))
);


ALTER TABLE "public"."product_change_log" OWNER TO "postgres";


COMMENT ON TABLE "public"."product_change_log" IS 'Audit log for product changes. Uses semantic action names. RLS enabled, SECURITY DEFINER function writes only.';



COMMENT ON COLUMN "public"."product_change_log"."change_type" IS 'Semantic action: created, updated, deleted, toggled_active, price_changed, inventory_changed';



CREATE TABLE IF NOT EXISTS "public"."product_images" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "product_id" "uuid",
    "variant_id" "uuid",
    "image_url" "text" NOT NULL,
    "alt_text" character varying(200),
    "sort_order" integer DEFAULT 0,
    "is_primary" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "product_images_check" CHECK (((("product_id" IS NOT NULL) AND ("variant_id" IS NULL)) OR (("product_id" IS NULL) AND ("variant_id" IS NOT NULL))))
);


ALTER TABLE "public"."product_images" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."product_recommendations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "source_product_id" "uuid" NOT NULL,
    "recommended_product_id" "uuid" NOT NULL,
    "display_order" integer DEFAULT 0 NOT NULL,
    "recommendation_type" "text" DEFAULT 'manual'::"text" NOT NULL,
    "recommendation_reason" "text",
    "click_count" integer DEFAULT 0 NOT NULL,
    "conversion_count" integer DEFAULT 0 NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "no_self_recommendation" CHECK (("source_product_id" <> "recommended_product_id")),
    CONSTRAINT "product_recommendations_recommendation_type_check" CHECK (("recommendation_type" = ANY (ARRAY['manual'::"text", 'algorithmic'::"text", 'purchased_together'::"text"])))
);


ALTER TABLE "public"."product_recommendations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."product_tag_assignments" (
    "product_id" "uuid" NOT NULL,
    "tag_id" "uuid" NOT NULL
);


ALTER TABLE "public"."product_tag_assignments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."product_tags" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" character varying(50) NOT NULL,
    "slug" character varying(50) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."product_tags" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."product_variants" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "product_id" "uuid" NOT NULL,
    "sku" character varying(100) NOT NULL,
    "barcode" character varying(50),
    "price" numeric(12,2) NOT NULL,
    "compare_at_price" numeric(12,2),
    "cost_price" numeric(12,2),
    "weight_grams" integer,
    "dimensions_cm" character varying(50),
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "product_variants_check" CHECK (("compare_at_price" >= "price")),
    CONSTRAINT "product_variants_cost_price_check" CHECK (("cost_price" >= (0)::numeric)),
    CONSTRAINT "product_variants_price_check" CHECK (("price" >= (0)::numeric))
);


ALTER TABLE "public"."product_variants" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."products" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "vendor_id" "uuid" NOT NULL,
    "brand_id" "uuid",
    "category_id" "uuid" NOT NULL,
    "name" character varying(200) NOT NULL,
    "slug" character varying(200) NOT NULL,
    "description" "text" NOT NULL,
    "short_description" character varying(500),
    "material" "text",
    "care_instructions" "text",
    "country_of_origin" character varying(100),
    "is_active" boolean DEFAULT true,
    "is_featured" boolean DEFAULT false,
    "seo_title" character varying(200),
    "seo_description" character varying(300),
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "average_rating" numeric(3,2) DEFAULT 0.00,
    "review_count" integer DEFAULT 0,
    "rating_distribution" "jsonb" DEFAULT '{"1": 0, "2": 0, "3": 0, "4": 0, "5": 0}'::"jsonb",
    "last_review_at" timestamp with time zone,
    "is_combo" boolean DEFAULT false,
    "combo_price_cents" integer,
    "combo_savings_cents" integer,
    "combo_quantity_limit" integer,
    "combo_quantity_sold" integer DEFAULT 0,
    CONSTRAINT "chk_combo_price_positive" CHECK ((("combo_price_cents" IS NULL) OR ("combo_price_cents" > 0))),
    CONSTRAINT "chk_combo_quantity_limit_positive" CHECK ((("combo_quantity_limit" IS NULL) OR ("combo_quantity_limit" > 0))),
    CONSTRAINT "chk_combo_quantity_sold_non_negative" CHECK (("combo_quantity_sold" >= 0)),
    CONSTRAINT "chk_combo_savings_non_negative" CHECK ((("combo_savings_cents" IS NULL) OR ("combo_savings_cents" >= 0))),
    CONSTRAINT "products_average_rating_check" CHECK ((("average_rating" >= (0)::numeric) AND ("average_rating" <= (5)::numeric))),
    CONSTRAINT "products_review_count_check" CHECK (("review_count" >= 0))
);


ALTER TABLE "public"."products" OWNER TO "postgres";


COMMENT ON COLUMN "public"."products"."is_combo" IS 'True if this product is a combo/bundle of other products';



COMMENT ON COLUMN "public"."products"."combo_price_cents" IS 'Total price of the combo in cents';



COMMENT ON COLUMN "public"."products"."combo_savings_cents" IS 'Amount saved compared to buying items individually';



COMMENT ON COLUMN "public"."products"."combo_quantity_limit" IS 'Maximum number of this combo that can be sold (NULL = unlimited)';



COMMENT ON COLUMN "public"."products"."combo_quantity_sold" IS 'Counter tracking how many combos have been purchased';



CREATE TABLE IF NOT EXISTS "public"."review_flags" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "review_id" "uuid" NOT NULL,
    "reporter_user_id" "uuid" NOT NULL,
    "reason" "text" NOT NULL,
    "description" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "resolved_by" "uuid",
    "resolved_at" timestamp with time zone,
    "resolution_notes" "text",
    "action_taken" "text",
    "ip_address" "inet",
    "user_agent_hash" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "review_flags_reason_check" CHECK (("reason" = ANY (ARRAY['inappropriate'::"text", 'spam'::"text", 'fake'::"text", 'offensive'::"text", 'off_topic'::"text", 'competitor'::"text", 'personal_info'::"text", 'other'::"text"]))),
    CONSTRAINT "review_flags_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'reviewing'::"text", 'valid'::"text", 'invalid'::"text", 'resolved'::"text"])))
);


ALTER TABLE "public"."review_flags" OWNER TO "postgres";


COMMENT ON TABLE "public"."review_flags" IS 'Community reporting of inappropriate reviews';



CREATE TABLE IF NOT EXISTS "public"."review_media" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "review_id" "uuid" NOT NULL,
    "media_type" "text" NOT NULL,
    "storage_path" "text" NOT NULL,
    "thumbnail_path" "text",
    "file_size_bytes" bigint,
    "mime_type" "text",
    "width" integer,
    "height" integer,
    "duration_seconds" integer,
    "is_approved" boolean DEFAULT false NOT NULL,
    "contains_faces" boolean DEFAULT false,
    "auto_tags" "jsonb" DEFAULT '[]'::"jsonb",
    "processing_status" "text" DEFAULT 'pending'::"text",
    "processed_at" timestamp with time zone,
    "sort_order" integer DEFAULT 0,
    "is_visible" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "review_media_media_type_check" CHECK (("media_type" = ANY (ARRAY['image'::"text", 'video'::"text"]))),
    CONSTRAINT "review_media_processing_status_check" CHECK (("processing_status" = ANY (ARRAY['pending'::"text", 'processing'::"text", 'completed'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."review_media" OWNER TO "postgres";


COMMENT ON TABLE "public"."review_media" IS 'Images and videos attached to reviews';



CREATE TABLE IF NOT EXISTS "public"."review_replies" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "review_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "comment" "text" NOT NULL,
    "reply_type" "text" NOT NULL,
    "is_visible" boolean DEFAULT true NOT NULL,
    "is_pinned" boolean DEFAULT false NOT NULL,
    "is_approved" boolean DEFAULT true NOT NULL,
    "moderated_at" timestamp with time zone,
    "moderated_by" "uuid",
    "is_edited" boolean DEFAULT false NOT NULL,
    "edit_count" integer DEFAULT 0 NOT NULL,
    "last_edited_at" timestamp with time zone,
    "deleted_at" timestamp with time zone,
    "deleted_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "review_replies_reply_type_check" CHECK (("reply_type" = ANY (ARRAY['vendor'::"text", 'admin'::"text", 'support'::"text"])))
);


ALTER TABLE "public"."review_replies" OWNER TO "postgres";


COMMENT ON TABLE "public"."review_replies" IS 'Vendor and admin replies to reviews';



CREATE TABLE IF NOT EXISTS "public"."review_vote_shards" (
    "review_id" "uuid" NOT NULL,
    "shard" smallint NOT NULL,
    "helpful_count" bigint DEFAULT 0 NOT NULL,
    "unhelpful_count" bigint DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "review_vote_shards_shard_check" CHECK ((("shard" >= 0) AND ("shard" < 64)))
);


ALTER TABLE "public"."review_vote_shards" OWNER TO "postgres";


COMMENT ON TABLE "public"."review_vote_shards" IS 'Sharded counters for scalable vote aggregation';



COMMENT ON COLUMN "public"."review_vote_shards"."shard" IS 'Shard number 0-63 for distributed counting';



CREATE TABLE IF NOT EXISTS "public"."review_votes" (
    "review_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "vote_type" "text" NOT NULL,
    "ip_address" "inet",
    "user_agent_hash" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "review_votes_vote_type_check" CHECK (("vote_type" = ANY (ARRAY['helpful'::"text", 'unhelpful'::"text"])))
);


ALTER TABLE "public"."review_votes" OWNER TO "postgres";


COMMENT ON TABLE "public"."review_votes" IS 'Helpful/unhelpful votes on reviews';



CREATE TABLE IF NOT EXISTS "public"."reviews" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "product_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "order_id" "uuid" NOT NULL,
    "order_item_id" "uuid",
    "rating" integer NOT NULL,
    "title" character varying(200),
    "comment" "text",
    "is_approved" boolean DEFAULT false NOT NULL,
    "is_featured" boolean DEFAULT false NOT NULL,
    "moderation_status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "moderated_at" timestamp with time zone,
    "moderated_by" "uuid",
    "moderation_notes" "text",
    "helpful_votes" integer DEFAULT 0 NOT NULL,
    "unhelpful_votes" integer DEFAULT 0 NOT NULL,
    "reply_count" integer DEFAULT 0 NOT NULL,
    "has_media" boolean DEFAULT false NOT NULL,
    "media_count" integer DEFAULT 0 NOT NULL,
    "is_edited" boolean DEFAULT false NOT NULL,
    "edit_count" integer DEFAULT 0 NOT NULL,
    "last_edited_at" timestamp with time zone,
    "deleted_at" timestamp with time zone,
    "deleted_by" "uuid",
    "deletion_reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "reviews_moderation_status_check" CHECK (("moderation_status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text", 'flagged'::"text", 'edited'::"text"]))),
    CONSTRAINT "reviews_rating_check" CHECK ((("rating" >= 1) AND ("rating" <= 5))),
    CONSTRAINT "valid_moderation_approval" CHECK (((("is_approved" = true) AND ("moderation_status" = 'approved'::"text")) OR ("is_approved" = false)))
);


ALTER TABLE "public"."reviews" OWNER TO "postgres";


COMMENT ON TABLE "public"."reviews" IS 'User reviews for products with purchase verification and moderation';



COMMENT ON COLUMN "public"."reviews"."order_id" IS 'Links review to verified purchase order';



COMMENT ON COLUMN "public"."reviews"."is_approved" IS 'Whether review has passed moderation and is publicly visible';



CREATE TABLE IF NOT EXISTS "public"."roles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "is_system_role" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."roles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."schedule_change_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "schedule_id" "uuid",
    "stylist_user_id" "uuid" NOT NULL,
    "changed_by" "uuid",
    "change_type" "text" NOT NULL,
    "old_value" "jsonb",
    "new_value" "jsonb",
    "ip_address" "inet",
    "user_agent" "text",
    "changed_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "schedule_change_log_change_type_check" CHECK (("change_type" = ANY (ARRAY['create'::"text", 'update'::"text", 'deactivate'::"text"])))
);


ALTER TABLE "public"."schedule_change_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."schedule_overrides" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "override_type" "text" NOT NULL,
    "applies_to_all_stylists" boolean DEFAULT false NOT NULL,
    "stylist_user_id" "uuid",
    "start_date" "date" NOT NULL,
    "end_date" "date" NOT NULL,
    "override_start_time" time without time zone,
    "override_end_time" time without time zone,
    "is_closed" boolean DEFAULT false NOT NULL,
    "priority" integer DEFAULT 0 NOT NULL,
    "reason" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "check_valid_date_range" CHECK (("end_date" >= "start_date")),
    CONSTRAINT "schedule_overrides_check" CHECK (("end_date" >= "start_date")),
    CONSTRAINT "schedule_overrides_check1" CHECK ((("is_closed" = true) OR (("override_start_time" IS NOT NULL) AND ("override_end_time" IS NOT NULL)))),
    CONSTRAINT "schedule_overrides_check2" CHECK (((("applies_to_all_stylists" = true) AND ("stylist_user_id" IS NULL)) OR (("applies_to_all_stylists" = false) AND ("stylist_user_id" IS NOT NULL)))),
    CONSTRAINT "schedule_overrides_check3" CHECK ((("override_end_time" IS NULL) OR ("override_end_time" > "override_start_time"))),
    CONSTRAINT "schedule_overrides_override_type_check" CHECK (("override_type" = ANY (ARRAY['business_closure'::"text", 'stylist_vacation'::"text", 'seasonal_hours'::"text", 'special_event'::"text"]))),
    CONSTRAINT "schedule_overrides_priority_check" CHECK ((("priority" >= 0) AND ("priority" <= 100)))
);


ALTER TABLE "public"."schedule_overrides" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."services" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "description" "text",
    "category" "text" NOT NULL,
    "duration_minutes" integer NOT NULL,
    "base_price_cents" integer NOT NULL,
    "requires_consultation" boolean DEFAULT false,
    "max_advance_days" integer DEFAULT 30,
    "min_advance_hours" integer DEFAULT 2,
    "is_active" boolean DEFAULT true,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "services_base_price_cents_check" CHECK (("base_price_cents" >= 0)),
    CONSTRAINT "services_category_check" CHECK (("category" = ANY (ARRAY['hair'::"text", 'makeup'::"text", 'nails'::"text", 'spa'::"text", 'consultation'::"text"]))),
    CONSTRAINT "services_duration_minutes_check" CHECK ((("duration_minutes" > 0) AND ("duration_minutes" <= 480))),
    CONSTRAINT "services_max_advance_days_check" CHECK (("max_advance_days" > 0)),
    CONSTRAINT "services_min_advance_hours_check" CHECK (("min_advance_hours" >= 0))
);


ALTER TABLE "public"."services" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."specialty_types" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "category" "text" NOT NULL,
    "description" "text",
    "icon" "text",
    "is_active" boolean DEFAULT true,
    "display_order" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "specialty_types_category_check" CHECK (("category" = ANY (ARRAY['hair'::"text", 'makeup'::"text", 'nails'::"text", 'spa'::"text", 'bridal'::"text", 'grooming'::"text"])))
);


ALTER TABLE "public"."specialty_types" OWNER TO "postgres";


COMMENT ON TABLE "public"."specialty_types" IS 'Admin-managed specialty vocabulary for stylist expertise areas';



COMMENT ON COLUMN "public"."specialty_types"."name" IS 'Display name shown in UI (e.g., "Bridal Specialist")';



COMMENT ON COLUMN "public"."specialty_types"."slug" IS 'URL-friendly identifier for routing and filtering';



COMMENT ON COLUMN "public"."specialty_types"."category" IS 'High-level category matching service categories';



COMMENT ON COLUMN "public"."specialty_types"."icon" IS 'Lucide icon name for visual representation';



CREATE TABLE IF NOT EXISTS "public"."stylist_override_budgets" (
    "stylist_user_id" "uuid" NOT NULL,
    "monthly_override_limit" integer DEFAULT 10 NOT NULL,
    "current_month_overrides" integer DEFAULT 0 NOT NULL,
    "emergency_overrides_remaining" integer DEFAULT 3 NOT NULL,
    "budget_reset_at" timestamp with time zone DEFAULT "date_trunc"('month'::"text", ("now"() + '1 mon'::interval)) NOT NULL,
    "last_override_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "stylist_override_budgets_check" CHECK (("current_month_overrides" <= ("monthly_override_limit" + "emergency_overrides_remaining"))),
    CONSTRAINT "stylist_override_budgets_current_month_overrides_check" CHECK (("current_month_overrides" >= 0)),
    CONSTRAINT "stylist_override_budgets_emergency_overrides_remaining_check" CHECK (("emergency_overrides_remaining" >= 0)),
    CONSTRAINT "stylist_override_budgets_monthly_override_limit_check" CHECK (("monthly_override_limit" > 0))
);


ALTER TABLE "public"."stylist_override_budgets" OWNER TO "postgres";


COMMENT ON TABLE "public"."stylist_override_budgets" IS 'Rate limiting for stylist schedule overrides. Prevents DoS attacks via unlimited availability changes. Default: 10 monthly + 3 emergency overrides.';



CREATE TABLE IF NOT EXISTS "public"."stylist_profiles" (
    "user_id" "uuid" NOT NULL,
    "display_name" "text" NOT NULL,
    "title" "text",
    "bio" "text",
    "years_experience" integer,
    "specialties" "text"[],
    "certifications" "jsonb" DEFAULT '[]'::"jsonb",
    "timezone" "text" DEFAULT 'Asia/Kathmandu'::"text" NOT NULL,
    "booking_buffer_minutes" integer DEFAULT 15,
    "max_daily_bookings" integer DEFAULT 8,
    "is_active" boolean DEFAULT true,
    "rating_average" numeric(2,1),
    "total_bookings" integer DEFAULT 0,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "is_featured" boolean DEFAULT false NOT NULL,
    "featured_at" timestamp with time zone,
    "featured_by" "uuid",
    "deactivated_at" timestamp with time zone,
    "deactivated_by" "uuid",
    "branch_id" "uuid",
    CONSTRAINT "check_deactivated_consistency" CHECK (((("is_active" = true) AND ("deactivated_at" IS NULL)) OR (("is_active" = false) AND ("deactivated_at" IS NOT NULL)))),
    CONSTRAINT "stylist_profiles_booking_buffer_minutes_check" CHECK (("booking_buffer_minutes" >= 0)),
    CONSTRAINT "stylist_profiles_max_daily_bookings_check" CHECK (("max_daily_bookings" > 0)),
    CONSTRAINT "stylist_profiles_rating_average_check" CHECK ((("rating_average" >= (0)::numeric) AND ("rating_average" <= (5)::numeric))),
    CONSTRAINT "stylist_profiles_years_experience_check" CHECK (("years_experience" >= 0))
);


ALTER TABLE "public"."stylist_profiles" OWNER TO "postgres";


COMMENT ON COLUMN "public"."stylist_profiles"."is_featured" IS 'Admin-controlled flag for homepage featured stylists';



COMMENT ON COLUMN "public"."stylist_profiles"."featured_at" IS 'Timestamp when stylist was featured';



COMMENT ON COLUMN "public"."stylist_profiles"."featured_by" IS 'Admin user who featured this stylist';



COMMENT ON COLUMN "public"."stylist_profiles"."branch_id" IS 'References the KB Stylish branch where this stylist works.';



CREATE TABLE IF NOT EXISTS "public"."stylist_promotions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "requested_by" "uuid" NOT NULL,
    "approved_by" "uuid",
    "background_check_status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "id_verification_status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "training_completed" boolean DEFAULT false NOT NULL,
    "mfa_enabled" boolean DEFAULT false NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "rejection_reason" "text",
    "revocation_reason" "text",
    "notes" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "approved_at" timestamp with time zone,
    "rejected_at" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "stylist_promotions_background_check_status_check" CHECK (("background_check_status" = ANY (ARRAY['pending'::"text", 'in_progress'::"text", 'passed'::"text", 'failed'::"text"]))),
    CONSTRAINT "stylist_promotions_check" CHECK ((("approved_at" IS NULL) OR ("status" = 'approved'::"text"))),
    CONSTRAINT "stylist_promotions_check1" CHECK ((("rejected_at" IS NULL) OR ("status" = 'rejected'::"text"))),
    CONSTRAINT "stylist_promotions_check2" CHECK ((("rejection_reason" IS NULL) OR ("status" = 'rejected'::"text"))),
    CONSTRAINT "stylist_promotions_check3" CHECK ((("revocation_reason" IS NULL) OR ("status" = 'revoked'::"text"))),
    CONSTRAINT "stylist_promotions_id_verification_status_check" CHECK (("id_verification_status" = ANY (ARRAY['pending'::"text", 'submitted'::"text", 'verified'::"text", 'rejected'::"text"]))),
    CONSTRAINT "stylist_promotions_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'pending_checks'::"text", 'pending_training'::"text", 'pending_approval'::"text", 'approved'::"text", 'rejected'::"text", 'revoked'::"text"])))
);


ALTER TABLE "public"."stylist_promotions" OWNER TO "postgres";


COMMENT ON TABLE "public"."stylist_promotions" IS 'Multi-step stylist promotion workflow with verification tracking. Replaces single-click promotion to prevent privilege escalation (CVSS 8.5 vulnerability mitigation).';



CREATE TABLE IF NOT EXISTS "public"."stylist_ratings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "booking_id" "uuid" NOT NULL,
    "customer_user_id" "uuid" NOT NULL,
    "stylist_user_id" "uuid" NOT NULL,
    "rating" integer NOT NULL,
    "review_text" "text",
    "is_approved" boolean DEFAULT true NOT NULL,
    "moderation_status" "text" DEFAULT 'approved'::"text" NOT NULL,
    "moderated_at" timestamp with time zone DEFAULT "now"(),
    "moderated_by" "uuid",
    "moderation_notes" "text",
    "helpful_votes" integer DEFAULT 0 NOT NULL,
    "unhelpful_votes" integer DEFAULT 0 NOT NULL,
    "is_edited" boolean DEFAULT false NOT NULL,
    "edit_count" integer DEFAULT 0 NOT NULL,
    "last_edited_at" timestamp with time zone,
    "stylist_response" "text",
    "responded_at" timestamp with time zone,
    "responded_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "rating_bounds" CHECK ((("rating" >= 1) AND ("rating" <= 5))),
    CONSTRAINT "review_length" CHECK ((("review_text" IS NULL) OR ("length"("review_text") <= 1000))),
    CONSTRAINT "stylist_ratings_helpful_votes_check" CHECK (("helpful_votes" >= 0)),
    CONSTRAINT "stylist_ratings_moderation_status_check" CHECK (("moderation_status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text"]))),
    CONSTRAINT "stylist_ratings_rating_check" CHECK ((("rating" >= 1) AND ("rating" <= 5))),
    CONSTRAINT "stylist_ratings_review_text_check" CHECK (("length"("review_text") <= 1000)),
    CONSTRAINT "stylist_ratings_stylist_response_check" CHECK (("length"("stylist_response") <= 500)),
    CONSTRAINT "stylist_ratings_unhelpful_votes_check" CHECK (("unhelpful_votes" >= 0))
);


ALTER TABLE "public"."stylist_ratings" OWNER TO "postgres";


COMMENT ON TABLE "public"."stylist_ratings" IS 'Customer ratings and reviews for stylists after service completion. One rating per booking. Auto-approved by default.';



CREATE TABLE IF NOT EXISTS "public"."stylist_schedules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "stylist_user_id" "uuid" NOT NULL,
    "day_of_week" integer NOT NULL,
    "start_time_utc" time without time zone NOT NULL,
    "end_time_utc" time without time zone NOT NULL,
    "start_time_local" time without time zone NOT NULL,
    "end_time_local" time without time zone NOT NULL,
    "break_start_time_utc" time without time zone,
    "break_end_time_utc" time without time zone,
    "break_duration_minutes" integer,
    "is_active" boolean DEFAULT true,
    "effective_from" "date" DEFAULT CURRENT_DATE,
    "effective_until" "date",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "check_break_within_hours" CHECK ((("break_start_time_utc" IS NULL) OR (("break_start_time_utc" >= "start_time_utc") AND ("break_end_time_utc" <= "end_time_utc")))),
    CONSTRAINT "check_effective_date_range" CHECK ((("effective_until" IS NULL) OR ("effective_from" <= "effective_until"))),
    CONSTRAINT "check_valid_day_of_week" CHECK ((("day_of_week" >= 0) AND ("day_of_week" <= 6))),
    CONSTRAINT "check_valid_work_hours" CHECK (("end_time_local" > "start_time_local")),
    CONSTRAINT "stylist_schedules_break_duration_minutes_check" CHECK (("break_duration_minutes" > 0)),
    CONSTRAINT "stylist_schedules_check" CHECK (("end_time_utc" > "start_time_utc")),
    CONSTRAINT "stylist_schedules_check1" CHECK (("end_time_local" > "start_time_local")),
    CONSTRAINT "stylist_schedules_check2" CHECK ((("effective_until" IS NULL) OR ("effective_until" > "effective_from"))),
    CONSTRAINT "stylist_schedules_check3" CHECK (((("break_start_time_utc" IS NULL) AND ("break_end_time_utc" IS NULL)) OR (("break_start_time_utc" IS NOT NULL) AND ("break_end_time_utc" IS NOT NULL) AND ("break_end_time_utc" > "break_start_time_utc")))),
    CONSTRAINT "stylist_schedules_day_of_week_check" CHECK ((("day_of_week" >= 0) AND ("day_of_week" <= 6)))
);


ALTER TABLE "public"."stylist_schedules" OWNER TO "postgres";


COMMENT ON TABLE "public"."stylist_schedules" IS 'LIMITATION: Uses TIME type which cannot handle DST transitions. Safe for Nepal market only (UTC+5:45 year-round, no DST). Before expanding to DST regions, migrate to INTERVAL type. See docs/certification/stylist journey/P0_DEFERRED_ISSUES_ANALYSIS.md';



COMMENT ON COLUMN "public"."stylist_schedules"."start_time_utc" IS 'TIME WITHOUT TIME ZONE - Sufficient for Nepal market (no DST). MUST migrate to INTERVAL type before international expansion.';



COMMENT ON COLUMN "public"."stylist_schedules"."end_time_utc" IS 'TIME WITHOUT TIME ZONE - Sufficient for Nepal market (no DST). MUST migrate to INTERVAL type before international expansion.';



COMMENT ON COLUMN "public"."stylist_schedules"."start_time_local" IS 'TIME WITHOUT TIME ZONE - Local time representation. Safe for Nepal (UTC+5:45 year-round).';



COMMENT ON COLUMN "public"."stylist_schedules"."end_time_local" IS 'TIME WITHOUT TIME ZONE - Local time representation. Safe for Nepal (UTC+5:45 year-round).';



COMMENT ON CONSTRAINT "check_effective_date_range" ON "public"."stylist_schedules" IS 'Ensures effective_until date is not before effective_from date. NULL effective_until means infinite schedule.';



CREATE TABLE IF NOT EXISTS "public"."stylist_services" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "stylist_user_id" "uuid" NOT NULL,
    "service_id" "uuid" NOT NULL,
    "custom_price_cents" integer,
    "custom_duration_minutes" integer,
    "is_available" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "stylist_services_custom_duration_minutes_check" CHECK (("custom_duration_minutes" > 0)),
    CONSTRAINT "stylist_services_custom_price_cents_check" CHECK (("custom_price_cents" >= 0))
);


ALTER TABLE "public"."stylist_services" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."stylist_specialties" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "stylist_user_id" "uuid" NOT NULL,
    "specialty_type_id" "uuid" NOT NULL,
    "is_primary" boolean DEFAULT false,
    "display_order" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."stylist_specialties" OWNER TO "postgres";


COMMENT ON TABLE "public"."stylist_specialties" IS 'Junction table linking stylists to their specialty types';



COMMENT ON COLUMN "public"."stylist_specialties"."is_primary" IS 'Mark as primary/featured specialty (max 1 per stylist)';



COMMENT ON COLUMN "public"."stylist_specialties"."display_order" IS 'Order for displaying specialties on profile (lower = higher priority)';



CREATE TABLE IF NOT EXISTS "public"."support_attachments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "ticket_id" "uuid",
    "message_id" "uuid",
    "file_name" "text" NOT NULL,
    "file_size" integer NOT NULL,
    "file_type" "text" NOT NULL,
    "storage_path" "text" NOT NULL,
    "uploaded_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "support_attachments_file_size_check" CHECK ((("file_size" > 0) AND ("file_size" <= 10485760)))
);


ALTER TABLE "public"."support_attachments" OWNER TO "postgres";


COMMENT ON TABLE "public"."support_attachments" IS 'File attachments for support tickets';



CREATE TABLE IF NOT EXISTS "public"."support_categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "color" "text" DEFAULT '#6B7280'::"text",
    "sort_order" integer DEFAULT 0,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."support_categories" OWNER TO "postgres";


COMMENT ON TABLE "public"."support_categories" IS 'Categories for organizing support tickets';



CREATE TABLE IF NOT EXISTS "public"."support_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "ticket_id" "uuid" NOT NULL,
    "user_id" "uuid",
    "message_text" "text" NOT NULL,
    "is_internal" boolean DEFAULT false,
    "is_system" boolean DEFAULT false,
    "email_message_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "support_messages_message_text_check" CHECK ((("length"("message_text") >= 1) AND ("length"("message_text") <= 5000)))
);


ALTER TABLE "public"."support_messages" OWNER TO "postgres";


COMMENT ON TABLE "public"."support_messages" IS 'Messages within support ticket conversations';



CREATE TABLE IF NOT EXISTS "public"."support_tickets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "category_id" "uuid",
    "subject" "text" NOT NULL,
    "priority" "text" DEFAULT 'medium'::"text" NOT NULL,
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "assigned_to" "uuid",
    "customer_email" "text" NOT NULL,
    "customer_name" "text",
    "order_reference" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "resolved_at" timestamp with time zone,
    "closed_at" timestamp with time zone,
    "submitted_from_ip" "inet",
    "submitted_user_agent" "text",
    CONSTRAINT "check_customer_email_format" CHECK (("customer_email" ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'::"text")),
    CONSTRAINT "check_public_ticket_has_contact_info" CHECK ((("user_id" IS NOT NULL) OR (("user_id" IS NULL) AND ("customer_email" IS NOT NULL) AND ("customer_name" IS NOT NULL)))),
    CONSTRAINT "support_tickets_priority_check" CHECK (("priority" = ANY (ARRAY['low'::"text", 'medium'::"text", 'high'::"text", 'urgent'::"text"]))),
    CONSTRAINT "support_tickets_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'in_progress'::"text", 'waiting_customer'::"text", 'resolved'::"text", 'closed'::"text"]))),
    CONSTRAINT "support_tickets_subject_check" CHECK ((("length"("subject") >= 5) AND ("length"("subject") <= 200)))
);


ALTER TABLE "public"."support_tickets" OWNER TO "postgres";


COMMENT ON TABLE "public"."support_tickets" IS 'Customer support tickets with status tracking';



CREATE TABLE IF NOT EXISTS "public"."user_addresses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "type" "text" NOT NULL,
    "is_default" boolean DEFAULT false,
    "street_address" "text" NOT NULL,
    "city" "text" NOT NULL,
    "state_province" "text",
    "postal_code" "text" NOT NULL,
    "country" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "user_addresses_type_check" CHECK (("type" = ANY (ARRAY['billing'::"text", 'shipping'::"text", 'both'::"text"])))
);


ALTER TABLE "public"."user_addresses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_audit_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "action" "text" NOT NULL,
    "resource_type" "text" NOT NULL,
    "resource_id" "uuid",
    "old_values" "jsonb",
    "new_values" "jsonb",
    "ip_address" "inet",
    "user_agent" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."user_audit_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_private_data" (
    "user_id" "uuid" NOT NULL,
    "email" "text",
    "phone" "text",
    "date_of_birth" "date",
    "preferred_language" "text" DEFAULT 'en'::"text",
    "timezone" "text",
    "marketing_consent" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."user_private_data" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_profiles" (
    "id" "uuid" NOT NULL,
    "username" "text" NOT NULL,
    "display_name" "text" NOT NULL,
    "avatar_url" "text",
    "bio" "text",
    "is_verified" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "role_version" integer DEFAULT 1 NOT NULL
);


ALTER TABLE "public"."user_profiles" OWNER TO "postgres";


COMMENT ON COLUMN "public"."user_profiles"."role_version" IS 'Version number that increments when user roles change. Used for real-time role validation in JWT claims.';



CREATE TABLE IF NOT EXISTS "public"."user_reputation" (
    "user_id" "uuid" NOT NULL,
    "overall_score" numeric(5,2) DEFAULT 50.00 NOT NULL,
    "review_quality_score" numeric(5,2) DEFAULT 50.00,
    "helpfulness_score" numeric(5,2) DEFAULT 50.00,
    "authenticity_score" numeric(5,2) DEFAULT 50.00,
    "total_reviews" integer DEFAULT 0 NOT NULL,
    "approved_reviews" integer DEFAULT 0 NOT NULL,
    "rejected_reviews" integer DEFAULT 0 NOT NULL,
    "flagged_reviews" integer DEFAULT 0 NOT NULL,
    "featured_reviews" integer DEFAULT 0 NOT NULL,
    "total_votes_cast" integer DEFAULT 0 NOT NULL,
    "helpful_votes_received" integer DEFAULT 0 NOT NULL,
    "unhelpful_votes_received" integer DEFAULT 0 NOT NULL,
    "verified_purchases" integer DEFAULT 0 NOT NULL,
    "account_age_days" integer DEFAULT 0 NOT NULL,
    "consecutive_approved" integer DEFAULT 0 NOT NULL,
    "warnings_count" integer DEFAULT 0 NOT NULL,
    "suspensions_count" integer DEFAULT 0 NOT NULL,
    "last_warning_at" timestamp with time zone,
    "last_suspension_at" timestamp with time zone,
    "weight_multiplier" numeric(3,2) DEFAULT 1.00 NOT NULL,
    "badges" "jsonb" DEFAULT '[]'::"jsonb",
    "achievements" "jsonb" DEFAULT '[]'::"jsonb",
    "last_calculated_at" timestamp with time zone,
    "calculation_version" integer DEFAULT 1,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "user_reputation_overall_score_check" CHECK ((("overall_score" >= (0)::numeric) AND ("overall_score" <= (100)::numeric))),
    CONSTRAINT "user_reputation_weight_multiplier_check" CHECK ((("weight_multiplier" >= (0)::numeric) AND ("weight_multiplier" <= (2)::numeric)))
);


ALTER TABLE "public"."user_reputation" OWNER TO "postgres";


COMMENT ON TABLE "public"."user_reputation" IS 'User trust scores based on review quality and behavior';



COMMENT ON COLUMN "public"."user_reputation"."overall_score" IS 'Composite trust score 0-100 used for ranking reviews';



COMMENT ON COLUMN "public"."user_reputation"."weight_multiplier" IS 'Applied to votes to combat manipulation';



CREATE TABLE IF NOT EXISTS "public"."user_roles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role_id" "uuid" NOT NULL,
    "assigned_by" "uuid",
    "assigned_at" timestamp with time zone DEFAULT "now"(),
    "expires_at" timestamp with time zone,
    "is_active" boolean DEFAULT true
);


ALTER TABLE "public"."user_roles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."variant_attribute_values" (
    "variant_id" "uuid" NOT NULL,
    "attribute_value_id" "uuid" NOT NULL
);


ALTER TABLE "public"."variant_attribute_values" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."vendor_documents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "vendor_id" "uuid" NOT NULL,
    "document_type" "text" NOT NULL,
    "file_name" "text" NOT NULL,
    "file_size" integer NOT NULL,
    "mime_type" "text" NOT NULL,
    "storage_path" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "verified_at" timestamp with time zone,
    "verified_by" "uuid",
    "rejection_reason" "text",
    "document_number" "text",
    "expiry_date" "date",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "vendor_documents_document_type_check" CHECK (("document_type" = ANY (ARRAY['pan_certificate'::"text", 'vat_certificate'::"text", 'business_registration'::"text", 'citizenship'::"text", 'other'::"text"]))),
    CONSTRAINT "vendor_documents_file_size_check" CHECK ((("file_size" > 0) AND ("file_size" <= 10485760))),
    CONSTRAINT "vendor_documents_mime_type_check" CHECK (("mime_type" = ANY (ARRAY['image/jpeg'::"text", 'image/png'::"text", 'image/webp'::"text", 'application/pdf'::"text"]))),
    CONSTRAINT "vendor_documents_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'verified'::"text", 'rejected'::"text", 'expired'::"text"])))
);


ALTER TABLE "public"."vendor_documents" OWNER TO "postgres";


COMMENT ON TABLE "public"."vendor_documents" IS 'Vendor verification documents (PAN, VAT, etc.)';



CREATE TABLE IF NOT EXISTS "public"."vendor_profiles" (
    "user_id" "uuid" NOT NULL,
    "business_name" "text" NOT NULL,
    "business_type" "text",
    "business_address_id" "uuid",
    "verification_status" "text" DEFAULT 'pending'::"text",
    "commission_rate" numeric(5,4) DEFAULT 0.15,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "bank_account_name" "text",
    "bank_name" "text",
    "bank_branch" "text",
    "application_state" "text",
    "application_submitted_at" timestamp with time zone,
    "application_reviewed_at" timestamp with time zone,
    "application_reviewed_by" "uuid",
    "application_notes" "text",
    "approval_notification_sent" boolean DEFAULT false,
    "onboarding_complete" boolean DEFAULT false,
    "onboarding_current_step" "text",
    "onboarding_started_at" timestamp with time zone,
    "onboarding_completed_at" timestamp with time zone,
    "bank_account_number_enc" "bytea",
    "tax_id_enc" "bytea",
    "esewa_number_enc" "bytea",
    "khalti_number_enc" "bytea",
    "contact_name" "text",
    "contact_email" "text",
    "contact_phone" "text",
    "documents_submitted" boolean DEFAULT false,
    "documents_verified" boolean DEFAULT false,
    CONSTRAINT "check_application_state" CHECK (("application_state" = ANY (ARRAY['draft'::"text", 'submitted'::"text", 'under_review'::"text", 'info_requested'::"text", 'approved'::"text", 'rejected'::"text", 'withdrawn'::"text"]))),
    CONSTRAINT "vendor_profiles_verification_status_check" CHECK (("verification_status" = ANY (ARRAY['pending'::"text", 'verified'::"text", 'rejected'::"text"])))
);


ALTER TABLE "public"."vendor_profiles" OWNER TO "postgres";


COMMENT ON COLUMN "public"."vendor_profiles"."bank_account_number_enc" IS 'Encrypted bank account number using pgp_sym_encrypt. Decrypt with: pgp_sym_decrypt(bank_account_number_enc, key)';



COMMENT ON COLUMN "public"."vendor_profiles"."tax_id_enc" IS 'Encrypted tax ID using pgp_sym_encrypt. Decrypt with: pgp_sym_decrypt(tax_id_enc, key)';



COMMENT ON COLUMN "public"."vendor_profiles"."esewa_number_enc" IS 'Encrypted eSewa mobile wallet number. Decrypt with: pgp_sym_decrypt(esewa_number_enc, key)';



COMMENT ON COLUMN "public"."vendor_profiles"."khalti_number_enc" IS 'Encrypted Khalti mobile wallet number. Decrypt with: pgp_sym_decrypt(khalti_number_enc, key)';



COMMENT ON COLUMN "public"."vendor_profiles"."contact_name" IS 'Contact person name from vendor application';



COMMENT ON COLUMN "public"."vendor_profiles"."contact_email" IS 'Business contact email from vendor application (may differ from auth.users.email)';



COMMENT ON COLUMN "public"."vendor_profiles"."contact_phone" IS 'Business contact phone from vendor application';



CREATE TABLE IF NOT EXISTS "public"."webhook_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "event_id" "text" NOT NULL,
    "provider" "text" NOT NULL,
    "event_type" "text" NOT NULL,
    "payload" "jsonb" NOT NULL,
    "signature" "text" NOT NULL,
    "verified" boolean DEFAULT false NOT NULL,
    "processed" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "processed_at" timestamp with time zone
);


ALTER TABLE "public"."webhook_events" OWNER TO "postgres";


COMMENT ON TABLE "public"."webhook_events" IS 'RESTORATION: Webhook event log. RLS enabled, service_role access only.';



ALTER TABLE ONLY "private"."availability_cache" ALTER COLUMN "id" SET DEFAULT "nextval"('"private"."availability_cache_id_seq"'::"regclass");



ALTER TABLE ONLY "private"."customer_data_access_log" ALTER COLUMN "id" SET DEFAULT "nextval"('"private"."customer_data_access_log_id_seq"'::"regclass");



ALTER TABLE ONLY "private"."payment_gateway_verifications" ALTER COLUMN "id" SET DEFAULT "nextval"('"private"."payment_gateway_verifications_id_seq"'::"regclass");



ALTER TABLE ONLY "private"."schedule_change_log" ALTER COLUMN "id" SET DEFAULT "nextval"('"private"."schedule_change_log_id_seq"'::"regclass");



ALTER TABLE ONLY "private"."service_management_log" ALTER COLUMN "id" SET DEFAULT "nextval"('"private"."service_management_log_id_seq"'::"regclass");



ALTER TABLE ONLY "metrics"."platform_daily"
    ADD CONSTRAINT "platform_daily_pkey" PRIMARY KEY ("day");



ALTER TABLE ONLY "metrics"."product_trending_scores"
    ADD CONSTRAINT "product_trending_scores_pkey" PRIMARY KEY ("product_id", "score_date");



ALTER TABLE ONLY "metrics"."vendor_daily"
    ADD CONSTRAINT "vendor_daily_pkey" PRIMARY KEY ("vendor_id", "day");



ALTER TABLE ONLY "metrics"."vendor_realtime_cache"
    ADD CONSTRAINT "vendor_realtime_cache_pkey" PRIMARY KEY ("vendor_id", "cache_date");



ALTER TABLE ONLY "private"."app_config"
    ADD CONSTRAINT "app_config_pkey" PRIMARY KEY ("key");



ALTER TABLE ONLY "private"."audit_log"
    ADD CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "private"."availability_cache"
    ADD CONSTRAINT "availability_cache_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "private"."availability_cache"
    ADD CONSTRAINT "availability_cache_stylist_user_id_service_id_cache_date_key" UNIQUE ("stylist_user_id", "service_id", "cache_date");



ALTER TABLE ONLY "private"."customer_data_access_log"
    ADD CONSTRAINT "customer_data_access_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "private"."metrics_update_queue"
    ADD CONSTRAINT "metrics_update_queue_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "private"."payment_gateway_verifications"
    ADD CONSTRAINT "payment_gateway_verifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "private"."payment_gateway_verifications"
    ADD CONSTRAINT "payment_gateway_verifications_provider_external_transaction_key" UNIQUE ("provider", "external_transaction_id");



ALTER TABLE ONLY "private"."schedule_change_log"
    ADD CONSTRAINT "schedule_change_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "private"."service_management_log"
    ADD CONSTRAINT "service_management_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."attribute_values"
    ADD CONSTRAINT "attribute_values_attribute_id_value_key" UNIQUE ("attribute_id", "value");



ALTER TABLE ONLY "public"."attribute_values"
    ADD CONSTRAINT "attribute_values_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."booking_reservations"
    ADD CONSTRAINT "booking_reservations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."booking_status_history"
    ADD CONSTRAINT "booking_status_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_order_item_id_key" UNIQUE ("order_item_id");



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."brands"
    ADD CONSTRAINT "brands_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."brands"
    ADD CONSTRAINT "brands_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."brands"
    ADD CONSTRAINT "brands_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."cart_items"
    ADD CONSTRAINT "cart_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."carts"
    ADD CONSTRAINT "carts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."carts"
    ADD CONSTRAINT "carts_session_id_key" UNIQUE ("session_id");



ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_slug_parent_id_key" UNIQUE ("slug", "parent_id");



ALTER TABLE ONLY "public"."combo_items"
    ADD CONSTRAINT "combo_items_combo_product_id_constituent_variant_id_key" UNIQUE ("combo_product_id", "constituent_variant_id");



ALTER TABLE ONLY "public"."combo_items"
    ADD CONSTRAINT "combo_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."curation_events"
    ADD CONSTRAINT "curation_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."email_logs"
    ADD CONSTRAINT "email_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."email_logs"
    ADD CONSTRAINT "email_logs_resend_email_id_key" UNIQUE ("resend_email_id");



ALTER TABLE ONLY "public"."email_preferences"
    ADD CONSTRAINT "email_preferences_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."inventory_locations"
    ADD CONSTRAINT "inventory_locations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inventory_movements"
    ADD CONSTRAINT "inventory_movements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inventory"
    ADD CONSTRAINT "inventory_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inventory"
    ADD CONSTRAINT "inventory_variant_id_location_id_key" UNIQUE ("variant_id", "location_id");



ALTER TABLE ONLY "public"."inventory_violation_logs"
    ADD CONSTRAINT "inventory_violation_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."job_queue"
    ADD CONSTRAINT "job_queue_idempotency_key_key" UNIQUE ("idempotency_key");



ALTER TABLE ONLY "public"."job_queue"
    ADD CONSTRAINT "job_queue_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."kb_branches"
    ADD CONSTRAINT "kb_branches_name_unique" UNIQUE ("name");



ALTER TABLE ONLY "public"."kb_branches"
    ADD CONSTRAINT "kb_branches_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."moderation_queue"
    ADD CONSTRAINT "moderation_queue_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."stylist_ratings"
    ADD CONSTRAINT "one_rating_per_booking" UNIQUE ("booking_id");



ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_order_number_key" UNIQUE ("order_number");



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payment_gateway_verifications"
    ADD CONSTRAINT "payment_gateway_verifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payment_intents"
    ADD CONSTRAINT "payment_intents_payment_intent_id_key" UNIQUE ("payment_intent_id");



ALTER TABLE ONLY "public"."payment_intents"
    ADD CONSTRAINT "payment_intents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payout_requests"
    ADD CONSTRAINT "payout_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payouts"
    ADD CONSTRAINT "payouts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."product_attributes"
    ADD CONSTRAINT "product_attributes_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."product_attributes"
    ADD CONSTRAINT "product_attributes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."product_change_log"
    ADD CONSTRAINT "product_change_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."product_images"
    ADD CONSTRAINT "product_images_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."product_recommendations"
    ADD CONSTRAINT "product_recommendations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."product_tag_assignments"
    ADD CONSTRAINT "product_tag_assignments_pkey" PRIMARY KEY ("product_id", "tag_id");



ALTER TABLE ONLY "public"."product_tags"
    ADD CONSTRAINT "product_tags_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."product_tags"
    ADD CONSTRAINT "product_tags_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."product_tags"
    ADD CONSTRAINT "product_tags_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."product_variants"
    ADD CONSTRAINT "product_variants_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."product_variants"
    ADD CONSTRAINT "product_variants_sku_key" UNIQUE ("sku");



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_vendor_id_slug_key" UNIQUE ("vendor_id", "slug");



ALTER TABLE ONLY "public"."review_flags"
    ADD CONSTRAINT "review_flags_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."review_media"
    ADD CONSTRAINT "review_media_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."review_replies"
    ADD CONSTRAINT "review_replies_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."review_vote_shards"
    ADD CONSTRAINT "review_vote_shards_pkey" PRIMARY KEY ("review_id", "shard");



ALTER TABLE ONLY "public"."review_votes"
    ADD CONSTRAINT "review_votes_pkey" PRIMARY KEY ("review_id", "user_id");



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."roles"
    ADD CONSTRAINT "roles_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."roles"
    ADD CONSTRAINT "roles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."schedule_change_log"
    ADD CONSTRAINT "schedule_change_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."schedule_overrides"
    ADD CONSTRAINT "schedule_overrides_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."services"
    ADD CONSTRAINT "services_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."services"
    ADD CONSTRAINT "services_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."services"
    ADD CONSTRAINT "services_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."specialty_types"
    ADD CONSTRAINT "specialty_types_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."specialty_types"
    ADD CONSTRAINT "specialty_types_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."specialty_types"
    ADD CONSTRAINT "specialty_types_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."stylist_override_budgets"
    ADD CONSTRAINT "stylist_override_budgets_pkey" PRIMARY KEY ("stylist_user_id");



ALTER TABLE ONLY "public"."stylist_profiles"
    ADD CONSTRAINT "stylist_profiles_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."stylist_promotions"
    ADD CONSTRAINT "stylist_promotions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."stylist_ratings"
    ADD CONSTRAINT "stylist_ratings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."stylist_schedules"
    ADD CONSTRAINT "stylist_schedules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."stylist_schedules"
    ADD CONSTRAINT "stylist_schedules_stylist_user_id_day_of_week_effective_fro_key" UNIQUE ("stylist_user_id", "day_of_week", "effective_from");



ALTER TABLE ONLY "public"."stylist_services"
    ADD CONSTRAINT "stylist_services_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."stylist_services"
    ADD CONSTRAINT "stylist_services_stylist_user_id_service_id_key" UNIQUE ("stylist_user_id", "service_id");



ALTER TABLE ONLY "public"."stylist_specialties"
    ADD CONSTRAINT "stylist_specialties_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."stylist_specialties"
    ADD CONSTRAINT "stylist_specialties_stylist_user_id_specialty_type_id_key" UNIQUE ("stylist_user_id", "specialty_type_id");



ALTER TABLE ONLY "public"."support_attachments"
    ADD CONSTRAINT "support_attachments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."support_categories"
    ADD CONSTRAINT "support_categories_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."support_categories"
    ADD CONSTRAINT "support_categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."support_messages"
    ADD CONSTRAINT "support_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."support_tickets"
    ADD CONSTRAINT "support_tickets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."review_flags"
    ADD CONSTRAINT "unique_flag_per_user" UNIQUE ("review_id", "reporter_user_id");



ALTER TABLE ONLY "public"."payment_intents"
    ADD CONSTRAINT "unique_payment_intent_provider" UNIQUE ("provider", "payment_intent_id");



ALTER TABLE ONLY "public"."product_recommendations"
    ADD CONSTRAINT "unique_recommendation" UNIQUE ("source_product_id", "recommended_product_id");



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "unique_review_per_product_user" UNIQUE ("product_id", "user_id", "deleted_at");



ALTER TABLE ONLY "public"."user_addresses"
    ADD CONSTRAINT "user_addresses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_audit_log"
    ADD CONSTRAINT "user_audit_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_private_data"
    ADD CONSTRAINT "user_private_data_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_username_key" UNIQUE ("username");



ALTER TABLE ONLY "public"."user_reputation"
    ADD CONSTRAINT "user_reputation_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_user_id_role_id_key" UNIQUE ("user_id", "role_id");



ALTER TABLE ONLY "public"."variant_attribute_values"
    ADD CONSTRAINT "variant_attribute_values_pkey" PRIMARY KEY ("variant_id", "attribute_value_id");



ALTER TABLE ONLY "public"."vendor_documents"
    ADD CONSTRAINT "vendor_documents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vendor_profiles"
    ADD CONSTRAINT "vendor_profiles_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."webhook_events"
    ADD CONSTRAINT "webhook_events_event_id_key" UNIQUE ("event_id");



ALTER TABLE ONLY "public"."webhook_events"
    ADD CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_platform_daily_day_brin" ON "metrics"."platform_daily" USING "brin" ("day");



CREATE INDEX "idx_realtime_cache_vendor" ON "metrics"."vendor_realtime_cache" USING "btree" ("vendor_id");



CREATE INDEX "idx_trending_scores_date_score" ON "metrics"."product_trending_scores" USING "btree" ("score_date", "trend_score" DESC);



CREATE INDEX "idx_trending_scores_product" ON "metrics"."product_trending_scores" USING "btree" ("product_id", "score_date" DESC);



CREATE INDEX "idx_vendor_daily_day_brin" ON "metrics"."vendor_daily" USING "brin" ("day");



CREATE INDEX "idx_vendor_daily_vendor_day" ON "metrics"."vendor_daily" USING "btree" ("vendor_id", "day" DESC);



CREATE INDEX "idx_access_log_booking" ON "private"."customer_data_access_log" USING "btree" ("booking_id", "accessed_at" DESC);



CREATE INDEX "idx_access_log_customer" ON "private"."customer_data_access_log" USING "btree" ("customer_user_id", "accessed_at" DESC);



CREATE INDEX "idx_access_log_stylist" ON "private"."customer_data_access_log" USING "btree" ("stylist_user_id", "accessed_at" DESC);



CREATE INDEX "idx_audit_log_created_at" ON "private"."audit_log" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_audit_log_table_record" ON "private"."audit_log" USING "btree" ("table_name", "record_id");



CREATE INDEX "idx_audit_log_user_id" ON "private"."audit_log" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "idx_availability_cache_expiry" ON "private"."availability_cache" USING "btree" ("expires_at");



CREATE INDEX "idx_availability_cache_lookup" ON "private"."availability_cache" USING "btree" ("stylist_user_id", "service_id", "cache_date", "expires_at");



CREATE INDEX "idx_gateway_verifications_payment_intent" ON "private"."payment_gateway_verifications" USING "btree" ("payment_intent_id");



CREATE INDEX "idx_gateway_verifications_provider_status" ON "private"."payment_gateway_verifications" USING "btree" ("provider", "status");



CREATE INDEX "idx_gateway_verifications_verified_at" ON "private"."payment_gateway_verifications" USING "btree" ("verified_at" DESC);



CREATE INDEX "idx_metrics_queue_completed" ON "private"."metrics_update_queue" USING "btree" ("completed_at") WHERE ("status" = 'completed'::"text");



CREATE UNIQUE INDEX "idx_metrics_queue_dedup" ON "private"."metrics_update_queue" USING "btree" ("day", COALESCE("vendor_id", '00000000-0000-0000-0000-000000000000'::"uuid"), "status") WHERE ("status" = ANY (ARRAY['pending'::"text", 'processing'::"text"]));



CREATE INDEX "idx_metrics_queue_pending" ON "private"."metrics_update_queue" USING "btree" ("status", "created_at") WHERE ("status" = 'pending'::"text");



CREATE INDEX "idx_schedule_change_log_created" ON "private"."schedule_change_log" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_schedule_change_log_stylist_date" ON "private"."schedule_change_log" USING "btree" ("stylist_user_id", "change_date" DESC);



CREATE INDEX "idx_schedule_change_log_type" ON "private"."schedule_change_log" USING "btree" ("change_type", "created_at" DESC);



CREATE INDEX "idx_service_mgmt_log_admin" ON "private"."service_management_log" USING "btree" ("admin_user_id", "created_at" DESC);



CREATE INDEX "idx_service_mgmt_log_category" ON "private"."service_management_log" USING "btree" ("category", "created_at" DESC);



CREATE INDEX "idx_service_mgmt_log_created" ON "private"."service_management_log" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_service_mgmt_log_severity" ON "private"."service_management_log" USING "btree" ("severity", "created_at" DESC) WHERE ("severity" = ANY (ARRAY['warning'::"text", 'critical'::"text"]));



CREATE INDEX "idx_attr_values_attr_active" ON "public"."attribute_values" USING "btree" ("attribute_id", "is_active") WHERE ("is_active" = true);



CREATE INDEX "idx_attribute_values_vendor" ON "public"."attribute_values" USING "btree" ("vendor_id") WHERE ("vendor_id" IS NOT NULL);



CREATE INDEX "idx_booking_reservations_customer" ON "public"."booking_reservations" USING "btree" ("customer_user_id");



CREATE INDEX "idx_booking_reservations_expires" ON "public"."booking_reservations" USING "btree" ("expires_at") WHERE ("status" = 'reserved'::"text");



CREATE INDEX "idx_booking_reservations_service_id" ON "public"."booking_reservations" USING "btree" ("service_id");



CREATE INDEX "idx_booking_reservations_status" ON "public"."booking_reservations" USING "btree" ("status");



CREATE INDEX "idx_booking_reservations_stylist" ON "public"."booking_reservations" USING "btree" ("stylist_user_id");



CREATE INDEX "idx_booking_status_history_booking" ON "public"."booking_status_history" USING "btree" ("booking_id", "created_at" DESC);



CREATE INDEX "idx_booking_status_history_user" ON "public"."booking_status_history" USING "btree" ("changed_by", "created_at" DESC);



CREATE INDEX "idx_bookings_cancelled_by" ON "public"."bookings" USING "btree" ("cancelled_by");



CREATE INDEX "idx_bookings_customer" ON "public"."bookings" USING "btree" ("customer_user_id", "start_time" DESC);



CREATE INDEX "idx_bookings_customer_time" ON "public"."bookings" USING "btree" ("customer_user_id", "start_time" DESC);



CREATE INDEX "idx_bookings_payment" ON "public"."bookings" USING "btree" ("payment_intent_id") WHERE ("payment_intent_id" IS NOT NULL);



CREATE INDEX "idx_bookings_reminder_scan" ON "public"."bookings" USING "btree" ("status", "reminder_sent_at", "start_time") WHERE (("status" = 'confirmed'::"text") AND ("reminder_sent_at" IS NULL));



CREATE INDEX "idx_bookings_service_id" ON "public"."bookings" USING "btree" ("service_id");



CREATE INDEX "idx_bookings_status" ON "public"."bookings" USING "btree" ("status") WHERE ("status" = ANY (ARRAY['pending'::"text", 'confirmed'::"text"]));



CREATE INDEX "idx_bookings_stylist_date" ON "public"."bookings" USING "btree" ("stylist_user_id", "start_time") WHERE ("status" <> ALL (ARRAY['cancelled'::"text", 'no_show'::"text"]));



CREATE INDEX "idx_bookings_stylist_status_time" ON "public"."bookings" USING "btree" ("stylist_user_id", "status", "start_time" DESC) WHERE ("status" <> 'cancelled'::"text");



CREATE INDEX "idx_bookings_stylist_timerange" ON "public"."bookings" USING "gist" ("stylist_user_id", "tstzrange"("start_time", "end_time")) WHERE ("status" <> ALL (ARRAY['cancelled'::"text", 'no_show'::"text"]));



CREATE INDEX "idx_bookings_upcoming" ON "public"."bookings" USING "btree" ("start_time") WHERE (("status" = 'confirmed'::"text") AND ("reminder_sent_at" IS NULL));



CREATE INDEX "idx_cart_items_cart_variant" ON "public"."cart_items" USING "btree" ("cart_id", "variant_id");



CREATE INDEX "idx_cart_items_combo_group" ON "public"."cart_items" USING "btree" ("combo_group_id") WHERE ("combo_group_id" IS NOT NULL);



CREATE INDEX "idx_cart_items_combo_group_id" ON "public"."cart_items" USING "btree" ("combo_group_id") WHERE ("combo_group_id" IS NOT NULL);



CREATE INDEX "idx_cart_items_combo_id" ON "public"."cart_items" USING "btree" ("combo_id") WHERE ("combo_id" IS NOT NULL);



CREATE INDEX "idx_cart_items_variant_id" ON "public"."cart_items" USING "btree" ("variant_id");



CREATE INDEX "idx_carts_session_id" ON "public"."carts" USING "btree" ("session_id") WHERE ("session_id" IS NOT NULL);



CREATE INDEX "idx_categories_parent_active" ON "public"."categories" USING "btree" ("parent_id", "is_active");



CREATE INDEX "idx_combo_items_combo_product_id" ON "public"."combo_items" USING "btree" ("combo_product_id");



CREATE INDEX "idx_combo_items_constituent_variant_id" ON "public"."combo_items" USING "btree" ("constituent_variant_id");



CREATE INDEX "idx_curation_events_date_only" ON "public"."curation_events" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_curation_events_source" ON "public"."curation_events" USING "btree" ("source_id", "target_id", "event_type") WHERE ("source_id" IS NOT NULL);



CREATE INDEX "idx_curation_events_target" ON "public"."curation_events" USING "btree" ("target_id", "event_type", "created_at" DESC) WHERE ("target_id" IS NOT NULL);



CREATE INDEX "idx_curation_events_type_date" ON "public"."curation_events" USING "btree" ("curation_type", "event_type", "created_at" DESC);



CREATE INDEX "idx_curation_events_user" ON "public"."curation_events" USING "btree" ("user_id", "curation_type", "created_at" DESC) WHERE ("user_id" IS NOT NULL);



CREATE INDEX "idx_email_logs_cleanup" ON "public"."email_logs" USING "btree" ("expires_at") WHERE ("expires_at" IS NOT NULL);



CREATE UNIQUE INDEX "idx_email_logs_idempotency" ON "public"."email_logs" USING "btree" ("email_type", "recipient_email", "reference_id") WHERE ("reference_id" IS NOT NULL);



CREATE INDEX "idx_email_logs_recipient" ON "public"."email_logs" USING "btree" ("recipient_user_id", "created_at" DESC);



CREATE INDEX "idx_email_logs_resend" ON "public"."email_logs" USING "btree" ("resend_email_id") WHERE ("resend_email_id" IS NOT NULL);



CREATE INDEX "idx_email_logs_type_status" ON "public"."email_logs" USING "btree" ("email_type", "status", "created_at" DESC);



CREATE INDEX "idx_inventory_location_id" ON "public"."inventory" USING "btree" ("location_id");



CREATE INDEX "idx_inventory_locations_vendor_id" ON "public"."inventory_locations" USING "btree" ("vendor_id");



CREATE INDEX "idx_inventory_low_stock" ON "public"."inventory" USING "btree" ("variant_id") WHERE ("quantity_available" <= "reorder_point");



CREATE INDEX "idx_inventory_movements_created_by" ON "public"."inventory_movements" USING "btree" ("created_by");



CREATE INDEX "idx_inventory_movements_location_id" ON "public"."inventory_movements" USING "btree" ("location_id");



CREATE INDEX "idx_inventory_movements_variant_id" ON "public"."inventory_movements" USING "btree" ("variant_id");



CREATE INDEX "idx_inventory_variant_location" ON "public"."inventory" USING "btree" ("variant_id", "location_id");



CREATE INDEX "idx_inventory_violations_created" ON "public"."inventory_violation_logs" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_job_queue_pending" ON "public"."job_queue" USING "btree" ("status", "priority" DESC, "created_at") WHERE ("status" = 'pending'::"text");



CREATE INDEX "idx_job_queue_pending_rating" ON "public"."job_queue" USING "btree" ("priority" DESC, "created_at") WHERE (("job_type" = 'update_product_rating'::"text") AND ("status" = 'pending'::"text"));



CREATE INDEX "idx_job_queue_processing" ON "public"."job_queue" USING "btree" ("status", "locked_until") WHERE ("status" = 'processing'::"text");



CREATE INDEX "idx_kb_branches_active" ON "public"."kb_branches" USING "btree" ("is_active", "display_order") WHERE ("is_active" = true);



CREATE INDEX "idx_kb_branches_name" ON "public"."kb_branches" USING "btree" ("name") WHERE ("is_active" = true);



CREATE INDEX "idx_moderation_queue_assigned" ON "public"."moderation_queue" USING "btree" ("assigned_to", "status") WHERE ("assigned_to" IS NOT NULL);



CREATE INDEX "idx_moderation_queue_pending" ON "public"."moderation_queue" USING "btree" ("priority" DESC, "created_at") WHERE ("status" = 'pending'::"text");



CREATE INDEX "idx_moderation_queue_reviewed_by" ON "public"."moderation_queue" USING "btree" ("reviewed_by");



CREATE INDEX "idx_moderation_queue_subject" ON "public"."moderation_queue" USING "btree" ("subject_type", "subject_id");



CREATE UNIQUE INDEX "idx_no_duplicate_override" ON "public"."schedule_overrides" USING "btree" ("stylist_user_id", "start_date") WHERE (("override_type" = 'stylist_vacation'::"text") AND ("applies_to_all_stylists" = false));



CREATE INDEX "idx_order_items_cancelled" ON "public"."order_items" USING "btree" ("vendor_id", "fulfillment_status") WHERE ("fulfillment_status" = 'cancelled'::"text");



CREATE INDEX "idx_order_items_combo_group_id" ON "public"."order_items" USING "btree" ("combo_group_id") WHERE ("combo_group_id" IS NOT NULL);



CREATE INDEX "idx_order_items_combo_id" ON "public"."order_items" USING "btree" ("combo_id") WHERE ("combo_id" IS NOT NULL);



CREATE INDEX "idx_order_items_delivered" ON "public"."order_items" USING "btree" ("vendor_id", "fulfillment_status") WHERE ("fulfillment_status" = 'delivered'::"text");



CREATE INDEX "idx_order_items_fulfillment_status" ON "public"."order_items" USING "btree" ("fulfillment_status", "vendor_id");



CREATE INDEX "idx_order_items_order" ON "public"."order_items" USING "btree" ("order_id");



CREATE INDEX "idx_order_items_order_status" ON "public"."order_items" USING "btree" ("order_id", "fulfillment_status");



COMMENT ON INDEX "public"."idx_order_items_order_status" IS 'Composite index for order status aggregation trigger.';



CREATE INDEX "idx_order_items_product_id" ON "public"."order_items" USING "btree" ("product_id");



CREATE INDEX "idx_order_items_variant_id" ON "public"."order_items" USING "btree" ("variant_id");



CREATE INDEX "idx_order_items_vendor" ON "public"."order_items" USING "btree" ("vendor_id");



CREATE INDEX "idx_orders_cancelled_audit" ON "public"."orders" USING "btree" ("canceled_at", "cancelled_by") WHERE ("status" = 'cancelled'::"text");



CREATE INDEX "idx_orders_number" ON "public"."orders" USING "btree" ("order_number");



CREATE INDEX "idx_orders_payment_intent_id" ON "public"."orders" USING "btree" ("payment_intent_id");



CREATE INDEX "idx_orders_review_request_scan" ON "public"."orders" USING "btree" ("status", "review_requested_at", "delivered_at") WHERE (("status" = 'delivered'::"text") AND ("review_requested_at" IS NULL));



CREATE INDEX "idx_orders_status" ON "public"."orders" USING "btree" ("status");



CREATE INDEX "idx_orders_user" ON "public"."orders" USING "btree" ("user_id");



CREATE INDEX "idx_payment_intents_cart" ON "public"."payment_intents" USING "btree" ("cart_id");



CREATE INDEX "idx_payment_intents_expires" ON "public"."payment_intents" USING "btree" ("expires_at") WHERE ("status" = 'pending'::"text");



CREATE UNIQUE INDEX "idx_payment_intents_external_txn_id" ON "public"."payment_intents" USING "btree" ("external_transaction_id") WHERE ("external_transaction_id" IS NOT NULL);



CREATE INDEX "idx_payment_intents_gateway_url" ON "public"."payment_intents" USING "btree" ("gateway_payment_url") WHERE ("gateway_payment_url" IS NOT NULL);



CREATE INDEX "idx_payment_intents_status" ON "public"."payment_intents" USING "btree" ("status") WHERE ("status" = ANY (ARRAY['pending'::"text", 'processing'::"text"]));



CREATE INDEX "idx_payment_intents_user" ON "public"."payment_intents" USING "btree" ("user_id");



CREATE INDEX "idx_payout_requests_status" ON "public"."payout_requests" USING "btree" ("status", "created_at" DESC);



CREATE INDEX "idx_payout_requests_vendor_created" ON "public"."payout_requests" USING "btree" ("vendor_id", "created_at" DESC);



CREATE INDEX "idx_payout_requests_vendor_id" ON "public"."payout_requests" USING "btree" ("vendor_id", "created_at" DESC);



CREATE INDEX "idx_payouts_status" ON "public"."payouts" USING "btree" ("status", "created_at" DESC);



CREATE INDEX "idx_payouts_vendor_id" ON "public"."payouts" USING "btree" ("vendor_id", "created_at" DESC);



CREATE INDEX "idx_product_attributes_vendor" ON "public"."product_attributes" USING "btree" ("vendor_id") WHERE ("vendor_id" IS NOT NULL);



CREATE UNIQUE INDEX "idx_product_attributes_vendor_name" ON "public"."product_attributes" USING "btree" ("vendor_id", "lower"(("name")::"text")) WHERE ("vendor_id" IS NOT NULL);



CREATE INDEX "idx_product_change_log_changed_by" ON "public"."product_change_log" USING "btree" ("changed_by");



CREATE INDEX "idx_product_change_log_variant_id" ON "public"."product_change_log" USING "btree" ("variant_id");



CREATE INDEX "idx_product_changes_product" ON "public"."product_change_log" USING "btree" ("product_id", "changed_at" DESC);



CREATE INDEX "idx_product_changes_time" ON "public"."product_change_log" USING "btree" ("changed_at" DESC);



CREATE INDEX "idx_product_images_product_id" ON "public"."product_images" USING "btree" ("product_id");



CREATE INDEX "idx_product_images_variant_id" ON "public"."product_images" USING "btree" ("variant_id");



CREATE INDEX "idx_product_tag_assignments_tag_id" ON "public"."product_tag_assignments" USING "btree" ("tag_id");



CREATE INDEX "idx_products_brand_id" ON "public"."products" USING "btree" ("brand_id");



CREATE INDEX "idx_products_category_active" ON "public"."products" USING "btree" ("category_id", "is_active");



CREATE INDEX "idx_products_featured" ON "public"."products" USING "btree" ("is_featured", "is_active") WHERE ("is_featured" = true);



CREATE INDEX "idx_products_is_combo" ON "public"."products" USING "btree" ("is_combo") WHERE ("is_combo" = true);



CREATE INDEX "idx_products_name_trgm" ON "public"."products" USING "gin" ("name" "public"."gin_trgm_ops");



CREATE INDEX "idx_products_rating" ON "public"."products" USING "btree" ("average_rating" DESC, "review_count" DESC) WHERE ("is_active" = true);



CREATE INDEX "idx_products_vendor_active" ON "public"."products" USING "btree" ("vendor_id", "is_active");



CREATE INDEX "idx_products_vendor_created" ON "public"."products" USING "btree" ("vendor_id", "created_at" DESC, "id");



CREATE INDEX "idx_recommendations_performance" ON "public"."product_recommendations" USING "btree" ("click_count" DESC, "conversion_count" DESC);



CREATE INDEX "idx_recommendations_recommended" ON "public"."product_recommendations" USING "btree" ("recommended_product_id");



CREATE INDEX "idx_recommendations_source" ON "public"."product_recommendations" USING "btree" ("source_product_id", "display_order");



CREATE INDEX "idx_review_flags_pending" ON "public"."review_flags" USING "btree" ("status", "created_at") WHERE ("status" = 'pending'::"text");



CREATE INDEX "idx_review_flags_reporter_user_id" ON "public"."review_flags" USING "btree" ("reporter_user_id");



CREATE INDEX "idx_review_flags_resolved_by" ON "public"."review_flags" USING "btree" ("resolved_by");



CREATE INDEX "idx_review_flags_review" ON "public"."review_flags" USING "btree" ("review_id", "status");



CREATE INDEX "idx_review_media_review" ON "public"."review_media" USING "btree" ("review_id", "sort_order") WHERE (("is_visible" = true) AND ("is_approved" = true));



CREATE INDEX "idx_review_replies_deleted_by" ON "public"."review_replies" USING "btree" ("deleted_by");



CREATE INDEX "idx_review_replies_moderated_by" ON "public"."review_replies" USING "btree" ("moderated_by");



CREATE INDEX "idx_review_replies_review" ON "public"."review_replies" USING "btree" ("review_id", "is_visible") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_review_replies_user" ON "public"."review_replies" USING "btree" ("user_id");



CREATE INDEX "idx_review_vote_shards_review" ON "public"."review_vote_shards" USING "btree" ("review_id");



CREATE INDEX "idx_review_votes_review" ON "public"."review_votes" USING "btree" ("review_id", "vote_type");



CREATE INDEX "idx_review_votes_user" ON "public"."review_votes" USING "btree" ("user_id");



CREATE INDEX "idx_reviews_deleted_by_fkey" ON "public"."reviews" USING "btree" ("deleted_by");



CREATE INDEX "idx_reviews_featured" ON "public"."reviews" USING "btree" ("product_id", "is_featured") WHERE (("is_featured" = true) AND ("deleted_at" IS NULL));



CREATE INDEX "idx_reviews_helpful" ON "public"."reviews" USING "btree" ("product_id", "helpful_votes" DESC) WHERE (("is_approved" = true) AND ("deleted_at" IS NULL));



CREATE INDEX "idx_reviews_moderated_by_fkey" ON "public"."reviews" USING "btree" ("moderated_by");



CREATE INDEX "idx_reviews_moderation" ON "public"."reviews" USING "btree" ("moderation_status", "created_at") WHERE ("moderation_status" = 'pending'::"text");



CREATE INDEX "idx_reviews_order" ON "public"."reviews" USING "btree" ("order_id");



CREATE INDEX "idx_reviews_order_item_id" ON "public"."reviews" USING "btree" ("order_item_id");



CREATE INDEX "idx_reviews_product_approved" ON "public"."reviews" USING "btree" ("product_id", "is_approved", "created_at" DESC) WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_reviews_user" ON "public"."reviews" USING "btree" ("user_id", "created_at" DESC) WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_schedule_log_date" ON "public"."schedule_change_log" USING "btree" ("changed_at" DESC);



CREATE INDEX "idx_schedule_log_stylist" ON "public"."schedule_change_log" USING "btree" ("stylist_user_id");



CREATE INDEX "idx_schedule_overrides_all_stylists" ON "public"."schedule_overrides" USING "btree" ("start_date", "end_date") WHERE ("applies_to_all_stylists" = true);



CREATE INDEX "idx_schedule_overrides_daterange" ON "public"."schedule_overrides" USING "gist" ("daterange"("start_date", "end_date", '[]'::"text"));



CREATE INDEX "idx_schedule_overrides_lookup" ON "public"."schedule_overrides" USING "btree" ("stylist_user_id", "start_date", "end_date");



CREATE INDEX "idx_schedule_overrides_priority" ON "public"."schedule_overrides" USING "btree" ("priority" DESC, "start_date");



CREATE UNIQUE INDEX "idx_schedule_overrides_unique_per_stylist" ON "public"."schedule_overrides" USING "btree" ("stylist_user_id", "start_date", "end_date") WHERE ("stylist_user_id" IS NOT NULL);



COMMENT ON INDEX "public"."idx_schedule_overrides_unique_per_stylist" IS 'Prevents duplicate override requests for same stylist and date range. Only applies to stylist-specific overrides (not business-wide closures).';



CREATE INDEX "idx_services_category" ON "public"."services" USING "btree" ("category") WHERE ("is_active" = true);



CREATE INDEX "idx_services_slug" ON "public"."services" USING "btree" ("slug") WHERE ("is_active" = true);



CREATE INDEX "idx_specialty_types_active" ON "public"."specialty_types" USING "btree" ("is_active") WHERE ("is_active" = true);



CREATE INDEX "idx_specialty_types_category" ON "public"."specialty_types" USING "btree" ("category") WHERE ("is_active" = true);



CREATE INDEX "idx_specialty_types_slug" ON "public"."specialty_types" USING "btree" ("slug") WHERE ("is_active" = true);



CREATE INDEX "idx_stylist_override_budgets_reset" ON "public"."stylist_override_budgets" USING "btree" ("budget_reset_at");



CREATE INDEX "idx_stylist_profiles_active" ON "public"."stylist_profiles" USING "btree" ("user_id") WHERE ("is_active" = true);



CREATE INDEX "idx_stylist_profiles_branch_id" ON "public"."stylist_profiles" USING "btree" ("branch_id");



CREATE INDEX "idx_stylist_profiles_featured" ON "public"."stylist_profiles" USING "btree" ("is_featured", "is_active", "total_bookings" DESC, "rating_average" DESC) WHERE (("is_featured" = true) AND ("is_active" = true));



CREATE INDEX "idx_stylist_profiles_featured_active" ON "public"."stylist_profiles" USING "btree" ("is_featured", "is_active") WHERE ("is_active" = true);



CREATE INDEX "idx_stylist_promotions_created" ON "public"."stylist_promotions" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_stylist_promotions_status" ON "public"."stylist_promotions" USING "btree" ("status") WHERE ("status" = ANY (ARRAY['pending_checks'::"text", 'pending_training'::"text", 'pending_approval'::"text"]));



CREATE INDEX "idx_stylist_promotions_user" ON "public"."stylist_promotions" USING "btree" ("user_id");



CREATE INDEX "idx_stylist_ratings_booking" ON "public"."stylist_ratings" USING "btree" ("booking_id");



CREATE INDEX "idx_stylist_ratings_customer" ON "public"."stylist_ratings" USING "btree" ("customer_user_id");



CREATE INDEX "idx_stylist_ratings_moderation" ON "public"."stylist_ratings" USING "btree" ("moderation_status", "created_at" DESC) WHERE ("moderation_status" = 'pending'::"text");



CREATE INDEX "idx_stylist_ratings_stylist_approved" ON "public"."stylist_ratings" USING "btree" ("stylist_user_id", "created_at" DESC) WHERE ("is_approved" = true);



CREATE UNIQUE INDEX "idx_stylist_schedule_unique" ON "public"."stylist_schedules" USING "btree" ("stylist_user_id", "day_of_week") WHERE ("is_active" = true);



CREATE INDEX "idx_stylist_schedules_active" ON "public"."stylist_schedules" USING "btree" ("stylist_user_id", "day_of_week") WHERE ("is_active" = true);



CREATE INDEX "idx_stylist_schedules_effective" ON "public"."stylist_schedules" USING "btree" ("stylist_user_id", "effective_from", "effective_until") WHERE ("is_active" = true);



CREATE INDEX "idx_stylist_schedules_lookup" ON "public"."stylist_schedules" USING "btree" ("stylist_user_id", "day_of_week", "is_active");



CREATE INDEX "idx_stylist_services_active" ON "public"."stylist_services" USING "btree" ("stylist_user_id", "service_id") WHERE ("is_available" = true);



CREATE INDEX "idx_stylist_services_service_id" ON "public"."stylist_services" USING "btree" ("service_id");



CREATE UNIQUE INDEX "idx_stylist_specialties_one_primary" ON "public"."stylist_specialties" USING "btree" ("stylist_user_id") WHERE ("is_primary" = true);



CREATE INDEX "idx_stylist_specialties_primary" ON "public"."stylist_specialties" USING "btree" ("stylist_user_id", "is_primary") WHERE ("is_primary" = true);



CREATE INDEX "idx_stylist_specialties_specialty" ON "public"."stylist_specialties" USING "btree" ("specialty_type_id");



CREATE INDEX "idx_stylist_specialties_stylist" ON "public"."stylist_specialties" USING "btree" ("stylist_user_id");



CREATE INDEX "idx_support_messages_text_search" ON "public"."support_messages" USING "gin" ("to_tsvector"('"english"'::"regconfig", "message_text"));



CREATE INDEX "idx_support_messages_ticket_created" ON "public"."support_messages" USING "btree" ("ticket_id", "created_at");



CREATE INDEX "idx_support_tickets_assigned_to" ON "public"."support_tickets" USING "btree" ("assigned_to") WHERE ("assigned_to" IS NOT NULL);



CREATE INDEX "idx_support_tickets_category" ON "public"."support_tickets" USING "btree" ("category_id") WHERE ("category_id" IS NOT NULL);



CREATE INDEX "idx_support_tickets_email" ON "public"."support_tickets" USING "btree" ("customer_email", "created_at" DESC) WHERE ("user_id" IS NULL);



CREATE INDEX "idx_support_tickets_status_created" ON "public"."support_tickets" USING "btree" ("status", "created_at" DESC);



CREATE INDEX "idx_support_tickets_status_priority_created" ON "public"."support_tickets" USING "btree" ("status", "priority", "created_at" DESC);



CREATE INDEX "idx_support_tickets_user_created" ON "public"."support_tickets" USING "btree" ("user_id", "created_at" DESC) WHERE ("user_id" IS NOT NULL);



CREATE INDEX "idx_support_tickets_user_id_created" ON "public"."support_tickets" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "idx_user_addresses_user_id" ON "public"."user_addresses" USING "btree" ("user_id");



CREATE INDEX "idx_user_audit_log_user_action" ON "public"."user_audit_log" USING "btree" ("user_id", "action", "created_at" DESC);



CREATE INDEX "idx_user_audit_log_user_id" ON "public"."user_audit_log" USING "btree" ("user_id");



CREATE INDEX "idx_user_profiles_role_version" ON "public"."user_profiles" USING "btree" ("id", "role_version");



CREATE INDEX "idx_user_profiles_search_trgm" ON "public"."user_profiles" USING "gin" (((("display_name" || ' '::"text") || "username")) "public"."gin_trgm_ops");



CREATE INDEX "idx_user_reputation_calculation" ON "public"."user_reputation" USING "btree" ("last_calculated_at") WHERE ("last_calculated_at" IS NOT NULL);



CREATE INDEX "idx_user_reputation_score" ON "public"."user_reputation" USING "btree" ("overall_score" DESC);



CREATE INDEX "idx_user_roles_assigned_by" ON "public"."user_roles" USING "btree" ("assigned_by");



CREATE INDEX "idx_user_roles_lookup" ON "public"."user_roles" USING "btree" ("user_id", "is_active", "role_id") WHERE ("is_active" = true);



CREATE INDEX "idx_user_roles_role_id" ON "public"."user_roles" USING "btree" ("role_id");



CREATE INDEX "idx_variant_attributes" ON "public"."variant_attribute_values" USING "btree" ("attribute_value_id", "variant_id");



CREATE INDEX "idx_variants_price_range" ON "public"."product_variants" USING "btree" ("price", "is_active");



CREATE INDEX "idx_variants_product_active" ON "public"."product_variants" USING "btree" ("product_id", "is_active");



CREATE INDEX "idx_variants_sku" ON "public"."product_variants" USING "btree" ("sku") WHERE ("is_active" = true);



CREATE INDEX "idx_vav_attr_value_id" ON "public"."variant_attribute_values" USING "btree" ("attribute_value_id");



CREATE INDEX "idx_vav_variant_id" ON "public"."variant_attribute_values" USING "btree" ("variant_id");



CREATE INDEX "idx_vendor_documents_status" ON "public"."vendor_documents" USING "btree" ("status");



CREATE INDEX "idx_vendor_documents_vendor_id" ON "public"."vendor_documents" USING "btree" ("vendor_id");



CREATE INDEX "idx_vendor_profiles_application_state" ON "public"."vendor_profiles" USING "btree" ("application_state") WHERE ("application_state" IS NOT NULL);



CREATE INDEX "idx_vendor_profiles_business_address_id" ON "public"."vendor_profiles" USING "btree" ("business_address_id");



CREATE INDEX "idx_vendor_profiles_contact_email" ON "public"."vendor_profiles" USING "btree" ("contact_email");



CREATE INDEX "idx_vendor_profiles_search_trgm" ON "public"."vendor_profiles" USING "gin" ("business_name" "public"."gin_trgm_ops");



CREATE INDEX "idx_vendor_profiles_status_created" ON "public"."vendor_profiles" USING "btree" ("verification_status", "created_at" DESC);



CREATE UNIQUE INDEX "idx_verification_idempotency" ON "public"."payment_gateway_verifications" USING "btree" ("provider", "external_transaction_id");



CREATE INDEX "idx_verification_payment_intent" ON "public"."payment_gateway_verifications" USING "btree" ("payment_intent_id");



CREATE INDEX "idx_verification_status" ON "public"."payment_gateway_verifications" USING "btree" ("status");



CREATE INDEX "idx_webhook_events_unprocessed" ON "public"."webhook_events" USING "btree" ("processed", "created_at") WHERE ("processed" = false);



CREATE UNIQUE INDEX "schedule_overrides_unique_per_stylist" ON "public"."schedule_overrides" USING "btree" ("stylist_user_id", "start_date", "end_date", "override_type") WHERE ("stylist_user_id" IS NOT NULL);



CREATE UNIQUE INDEX "unique_vendor_reply_per_review" ON "public"."review_replies" USING "btree" ("review_id", "reply_type") WHERE (("reply_type" = 'vendor'::"text") AND ("deleted_at" IS NULL));



CREATE UNIQUE INDEX "ux_carts_user_unique" ON "public"."carts" USING "btree" ("user_id") WHERE ("user_id" IS NOT NULL);



CREATE OR REPLACE TRIGGER "check_stylist_active_before_booking" BEFORE INSERT ON "public"."bookings" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_booking_inactive_stylist"();



CREATE OR REPLACE TRIGGER "enforce_vendor_state_transitions" BEFORE UPDATE ON "public"."vendor_profiles" FOR EACH ROW EXECUTE FUNCTION "public"."validate_vendor_state_transition"();



CREATE OR REPLACE TRIGGER "notify_product_change_trigger" AFTER INSERT OR DELETE OR UPDATE ON "public"."inventory" FOR EACH ROW EXECUTE FUNCTION "public"."notify_product_change"();



CREATE OR REPLACE TRIGGER "notify_product_change_trigger" AFTER INSERT OR DELETE OR UPDATE ON "public"."product_variants" FOR EACH ROW EXECUTE FUNCTION "public"."notify_product_change"();



CREATE OR REPLACE TRIGGER "notify_product_change_trigger" AFTER INSERT OR DELETE OR UPDATE ON "public"."products" FOR EACH ROW EXECUTE FUNCTION "public"."notify_product_change"();



CREATE OR REPLACE TRIGGER "refresh_jwt_on_role_version_change" AFTER UPDATE ON "public"."user_profiles" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_refresh_jwt_on_role_change"();



CREATE OR REPLACE TRIGGER "refresh_platform_metrics_on_order" AFTER INSERT OR UPDATE ON "public"."orders" FOR EACH ROW WHEN (("new"."status" = 'confirmed'::"text")) EXECUTE FUNCTION "metrics"."refresh_platform_cache_on_order"();



CREATE OR REPLACE TRIGGER "refresh_vendor_metrics_on_order" AFTER INSERT OR UPDATE ON "public"."orders" FOR EACH ROW WHEN (("new"."status" = 'confirmed'::"text")) EXECUTE FUNCTION "metrics"."refresh_vendor_cache_on_order"();



CREATE OR REPLACE TRIGGER "set_cart_items_updated_at" BEFORE UPDATE ON "public"."cart_items" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_carts_updated_at" BEFORE UPDATE ON "public"."carts" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "support_messages_update_ticket" AFTER INSERT ON "public"."support_messages" FOR EACH ROW EXECUTE FUNCTION "public"."update_ticket_timestamp"();



CREATE OR REPLACE TRIGGER "support_tickets_status_timestamps" BEFORE UPDATE ON "public"."support_tickets" FOR EACH ROW EXECUTE FUNCTION "public"."update_ticket_status_timestamps"();



CREATE OR REPLACE TRIGGER "tr_sync_payment_method" BEFORE INSERT ON "public"."orders" FOR EACH ROW EXECUTE FUNCTION "public"."sync_order_payment_method"();



CREATE OR REPLACE TRIGGER "trigger_deactivate_stylist_schedules" AFTER UPDATE OF "is_active" ON "public"."stylist_profiles" FOR EACH ROW WHEN ((("new"."is_active" = false) AND ("old"."is_active" = true))) EXECUTE FUNCTION "private"."deactivate_stylist_schedules"();



COMMENT ON TRIGGER "trigger_deactivate_stylist_schedules" ON "public"."stylist_profiles" IS 'Fires when stylist is deactivated. Sets effective_until = today on all schedules to prevent future bookings.';



CREATE OR REPLACE TRIGGER "trigger_handle_order_item_cancellation" BEFORE UPDATE ON "public"."order_items" FOR EACH ROW WHEN ((("new"."fulfillment_status" = 'cancelled'::"text") AND ("old"."fulfillment_status" IS DISTINCT FROM 'cancelled'::"text"))) EXECUTE FUNCTION "public"."handle_order_item_cancellation"();



CREATE OR REPLACE TRIGGER "trigger_increment_role_version" AFTER INSERT OR DELETE OR UPDATE ON "public"."user_roles" FOR EACH ROW EXECUTE FUNCTION "public"."increment_user_role_version"();



CREATE OR REPLACE TRIGGER "trigger_initialize_review_shards" AFTER INSERT ON "public"."reviews" FOR EACH ROW EXECUTE FUNCTION "public"."initialize_review_vote_shards"();



CREATE OR REPLACE TRIGGER "trigger_initialize_stylist_budget" AFTER INSERT ON "public"."stylist_profiles" FOR EACH ROW EXECUTE FUNCTION "private"."initialize_stylist_budget"();



CREATE OR REPLACE TRIGGER "trigger_invalidate_cache_on_booking" AFTER INSERT OR DELETE OR UPDATE ON "public"."bookings" FOR EACH ROW EXECUTE FUNCTION "private"."invalidate_availability_cache_async"();



CREATE OR REPLACE TRIGGER "trigger_invalidate_cache_on_override" AFTER INSERT OR DELETE OR UPDATE ON "public"."schedule_overrides" FOR EACH ROW EXECUTE FUNCTION "private"."invalidate_availability_cache"();



COMMENT ON TRIGGER "trigger_invalidate_cache_on_override" ON "public"."schedule_overrides" IS 'Immediately deletes cache when override is created/updated/deleted. Fixes 2-3 min delay bug.';



CREATE OR REPLACE TRIGGER "trigger_invalidate_cache_on_schedule" AFTER INSERT OR DELETE OR UPDATE ON "public"."stylist_schedules" FOR EACH ROW EXECUTE FUNCTION "private"."invalidate_availability_cache_async"();



CREATE OR REPLACE TRIGGER "trigger_update_product_stats" AFTER INSERT OR DELETE OR UPDATE OF "is_approved", "deleted_at" ON "public"."reviews" FOR EACH ROW EXECUTE FUNCTION "public"."update_product_stats_on_review_change"();



CREATE OR REPLACE TRIGGER "trigger_update_stylist_rating_average" AFTER INSERT OR DELETE OR UPDATE OF "rating", "is_approved" ON "public"."stylist_ratings" FOR EACH ROW EXECUTE FUNCTION "public"."update_stylist_rating_average"();



CREATE OR REPLACE TRIGGER "trigger_validate_order_cancellation" BEFORE UPDATE ON "public"."orders" FOR EACH ROW WHEN ((("new"."status" = 'cancelled'::"text") AND ("old"."status" <> 'cancelled'::"text"))) EXECUTE FUNCTION "public"."validate_order_cancellation"();



CREATE OR REPLACE TRIGGER "update_bookings_updated_at" BEFORE UPDATE ON "public"."bookings" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_moderation_queue_updated_at" BEFORE UPDATE ON "public"."moderation_queue" FOR EACH ROW EXECUTE FUNCTION "public"."update_trust_engine_updated_at"();



CREATE OR REPLACE TRIGGER "update_order_status_trigger" AFTER UPDATE OF "fulfillment_status" ON "public"."order_items" FOR EACH ROW WHEN (("old"."fulfillment_status" IS DISTINCT FROM "new"."fulfillment_status")) EXECUTE FUNCTION "public"."update_order_status_on_item_change"();



COMMENT ON TRIGGER "update_order_status_trigger" ON "public"."order_items" IS 'Auto-updates parent order status when item fulfillment status changes.';



CREATE OR REPLACE TRIGGER "update_payment_gateway_verifications_updated_at" BEFORE UPDATE ON "public"."payment_gateway_verifications" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_review_flags_updated_at" BEFORE UPDATE ON "public"."review_flags" FOR EACH ROW EXECUTE FUNCTION "public"."update_trust_engine_updated_at"();



CREATE OR REPLACE TRIGGER "update_review_media_updated_at" BEFORE UPDATE ON "public"."review_media" FOR EACH ROW EXECUTE FUNCTION "public"."update_trust_engine_updated_at"();



CREATE OR REPLACE TRIGGER "update_review_replies_updated_at" BEFORE UPDATE ON "public"."review_replies" FOR EACH ROW EXECUTE FUNCTION "public"."update_trust_engine_updated_at"();



CREATE OR REPLACE TRIGGER "update_review_vote_shards_updated_at" BEFORE UPDATE ON "public"."review_vote_shards" FOR EACH ROW EXECUTE FUNCTION "public"."update_trust_engine_updated_at"();



CREATE OR REPLACE TRIGGER "update_review_votes_updated_at" BEFORE UPDATE ON "public"."review_votes" FOR EACH ROW EXECUTE FUNCTION "public"."update_trust_engine_updated_at"();



CREATE OR REPLACE TRIGGER "update_reviews_updated_at" BEFORE UPDATE ON "public"."reviews" FOR EACH ROW EXECUTE FUNCTION "public"."update_trust_engine_updated_at"();



CREATE OR REPLACE TRIGGER "update_schedule_overrides_updated_at" BEFORE UPDATE ON "public"."schedule_overrides" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_services_updated_at" BEFORE UPDATE ON "public"."services" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_specialty_types_updated_at" BEFORE UPDATE ON "public"."specialty_types" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_stylist_override_budgets_updated_at" BEFORE UPDATE ON "public"."stylist_override_budgets" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_stylist_profiles_updated_at" BEFORE UPDATE ON "public"."stylist_profiles" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_stylist_promotions_updated_at" BEFORE UPDATE ON "public"."stylist_promotions" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_stylist_rating_average_trigger" AFTER INSERT OR DELETE OR UPDATE ON "public"."stylist_ratings" FOR EACH ROW EXECUTE FUNCTION "public"."update_stylist_rating_average"();



CREATE OR REPLACE TRIGGER "update_stylist_schedules_updated_at" BEFORE UPDATE ON "public"."stylist_schedules" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_user_reputation_updated_at" BEFORE UPDATE ON "public"."user_reputation" FOR EACH ROW EXECUTE FUNCTION "public"."update_trust_engine_updated_at"();



ALTER TABLE ONLY "metrics"."product_trending_scores"
    ADD CONSTRAINT "product_trending_scores_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "metrics"."vendor_daily"
    ADD CONSTRAINT "vendor_daily_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendor_profiles"("user_id") ON DELETE CASCADE;



ALTER TABLE ONLY "metrics"."vendor_realtime_cache"
    ADD CONSTRAINT "vendor_realtime_cache_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendor_profiles"("user_id") ON DELETE CASCADE;



ALTER TABLE ONLY "private"."audit_log"
    ADD CONSTRAINT "audit_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "private"."customer_data_access_log"
    ADD CONSTRAINT "customer_data_access_log_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id");



ALTER TABLE ONLY "private"."customer_data_access_log"
    ADD CONSTRAINT "customer_data_access_log_customer_user_id_fkey" FOREIGN KEY ("customer_user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "private"."customer_data_access_log"
    ADD CONSTRAINT "customer_data_access_log_stylist_user_id_fkey" FOREIGN KEY ("stylist_user_id") REFERENCES "public"."stylist_profiles"("user_id");



ALTER TABLE ONLY "private"."payment_gateway_verifications"
    ADD CONSTRAINT "payment_gateway_verifications_payment_intent_id_fkey" FOREIGN KEY ("payment_intent_id") REFERENCES "public"."payment_intents"("payment_intent_id") ON DELETE CASCADE;



ALTER TABLE ONLY "private"."schedule_change_log"
    ADD CONSTRAINT "schedule_change_log_stylist_user_id_fkey" FOREIGN KEY ("stylist_user_id") REFERENCES "public"."stylist_profiles"("user_id") ON DELETE CASCADE;



ALTER TABLE ONLY "private"."service_management_log"
    ADD CONSTRAINT "service_management_log_admin_user_id_fkey" FOREIGN KEY ("admin_user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."attribute_values"
    ADD CONSTRAINT "attribute_values_attribute_id_fkey" FOREIGN KEY ("attribute_id") REFERENCES "public"."product_attributes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."attribute_values"
    ADD CONSTRAINT "attribute_values_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "public"."user_profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."booking_reservations"
    ADD CONSTRAINT "booking_reservations_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id");



ALTER TABLE ONLY "public"."booking_reservations"
    ADD CONSTRAINT "booking_reservations_stylist_user_id_fkey" FOREIGN KEY ("stylist_user_id") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."booking_status_history"
    ADD CONSTRAINT "booking_status_history_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."booking_status_history"
    ADD CONSTRAINT "booking_status_history_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_cancelled_by_fkey" FOREIGN KEY ("cancelled_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_customer_user_id_fkey" FOREIGN KEY ("customer_user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id");



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_reminder_email_id_fkey" FOREIGN KEY ("reminder_email_id") REFERENCES "public"."email_logs"("id");



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id");



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_stylist_user_id_fkey" FOREIGN KEY ("stylist_user_id") REFERENCES "public"."stylist_profiles"("user_id");



ALTER TABLE ONLY "public"."brands"
    ADD CONSTRAINT "brands_featured_by_fkey" FOREIGN KEY ("featured_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."cart_items"
    ADD CONSTRAINT "cart_items_cart_id_fkey" FOREIGN KEY ("cart_id") REFERENCES "public"."carts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cart_items"
    ADD CONSTRAINT "cart_items_combo_id_fkey" FOREIGN KEY ("combo_id") REFERENCES "public"."products"("id");



ALTER TABLE ONLY "public"."cart_items"
    ADD CONSTRAINT "cart_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."carts"
    ADD CONSTRAINT "carts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."categories"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."combo_items"
    ADD CONSTRAINT "combo_items_combo_product_id_fkey" FOREIGN KEY ("combo_product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."combo_items"
    ADD CONSTRAINT "combo_items_constituent_product_id_fkey" FOREIGN KEY ("constituent_product_id") REFERENCES "public"."products"("id");



ALTER TABLE ONLY "public"."combo_items"
    ADD CONSTRAINT "combo_items_constituent_variant_id_fkey" FOREIGN KEY ("constituent_variant_id") REFERENCES "public"."product_variants"("id");



ALTER TABLE ONLY "public"."curation_events"
    ADD CONSTRAINT "curation_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."email_logs"
    ADD CONSTRAINT "email_logs_recipient_user_id_fkey" FOREIGN KEY ("recipient_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."email_preferences"
    ADD CONSTRAINT "email_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inventory"
    ADD CONSTRAINT "inventory_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."inventory_locations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inventory_locations"
    ADD CONSTRAINT "inventory_locations_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "public"."user_profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inventory_movements"
    ADD CONSTRAINT "inventory_movements_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."inventory_movements"
    ADD CONSTRAINT "inventory_movements_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."inventory_locations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inventory_movements"
    ADD CONSTRAINT "inventory_movements_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inventory"
    ADD CONSTRAINT "inventory_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inventory_violation_logs"
    ADD CONSTRAINT "inventory_violation_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."inventory_violation_logs"
    ADD CONSTRAINT "inventory_violation_logs_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id");



ALTER TABLE ONLY "public"."moderation_queue"
    ADD CONSTRAINT "moderation_queue_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."moderation_queue"
    ADD CONSTRAINT "moderation_queue_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_combo_id_fkey" FOREIGN KEY ("combo_id") REFERENCES "public"."products"("id");



ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendor_profiles"("user_id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_cancelled_by_fkey" FOREIGN KEY ("cancelled_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_payment_intent_id_fkey" FOREIGN KEY ("payment_intent_id") REFERENCES "public"."payment_intents"("payment_intent_id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."payment_intents"
    ADD CONSTRAINT "payment_intents_cart_id_fkey" FOREIGN KEY ("cart_id") REFERENCES "public"."carts"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."payment_intents"
    ADD CONSTRAINT "payment_intents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payout_requests"
    ADD CONSTRAINT "payout_requests_payout_id_fkey" FOREIGN KEY ("payout_id") REFERENCES "public"."payouts"("id");



ALTER TABLE ONLY "public"."payout_requests"
    ADD CONSTRAINT "payout_requests_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."payout_requests"
    ADD CONSTRAINT "payout_requests_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payouts"
    ADD CONSTRAINT "payouts_processed_by_fkey" FOREIGN KEY ("processed_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."payouts"
    ADD CONSTRAINT "payouts_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."product_attributes"
    ADD CONSTRAINT "product_attributes_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "public"."user_profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."product_change_log"
    ADD CONSTRAINT "product_change_log_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."product_change_log"
    ADD CONSTRAINT "product_change_log_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."product_change_log"
    ADD CONSTRAINT "product_change_log_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."product_images"
    ADD CONSTRAINT "product_images_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."product_images"
    ADD CONSTRAINT "product_images_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."product_recommendations"
    ADD CONSTRAINT "product_recommendations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."product_recommendations"
    ADD CONSTRAINT "product_recommendations_recommended_product_id_fkey" FOREIGN KEY ("recommended_product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."product_recommendations"
    ADD CONSTRAINT "product_recommendations_source_product_id_fkey" FOREIGN KEY ("source_product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."product_tag_assignments"
    ADD CONSTRAINT "product_tag_assignments_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."product_tag_assignments"
    ADD CONSTRAINT "product_tag_assignments_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "public"."product_tags"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."product_variants"
    ADD CONSTRAINT "product_variants_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "public"."user_profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."review_flags"
    ADD CONSTRAINT "review_flags_reporter_user_id_fkey" FOREIGN KEY ("reporter_user_id") REFERENCES "public"."user_profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."review_flags"
    ADD CONSTRAINT "review_flags_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."review_flags"
    ADD CONSTRAINT "review_flags_review_id_fkey" FOREIGN KEY ("review_id") REFERENCES "public"."reviews"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."review_media"
    ADD CONSTRAINT "review_media_review_id_fkey" FOREIGN KEY ("review_id") REFERENCES "public"."reviews"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."review_replies"
    ADD CONSTRAINT "review_replies_deleted_by_fkey" FOREIGN KEY ("deleted_by") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."review_replies"
    ADD CONSTRAINT "review_replies_moderated_by_fkey" FOREIGN KEY ("moderated_by") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."review_replies"
    ADD CONSTRAINT "review_replies_review_id_fkey" FOREIGN KEY ("review_id") REFERENCES "public"."reviews"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."review_replies"
    ADD CONSTRAINT "review_replies_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."user_profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."review_vote_shards"
    ADD CONSTRAINT "review_vote_shards_review_id_fkey" FOREIGN KEY ("review_id") REFERENCES "public"."reviews"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."review_votes"
    ADD CONSTRAINT "review_votes_review_id_fkey" FOREIGN KEY ("review_id") REFERENCES "public"."reviews"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."review_votes"
    ADD CONSTRAINT "review_votes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."user_profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_deleted_by_fkey" FOREIGN KEY ("deleted_by") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_moderated_by_fkey" FOREIGN KEY ("moderated_by") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."user_profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."schedule_change_log"
    ADD CONSTRAINT "schedule_change_log_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."schedule_change_log"
    ADD CONSTRAINT "schedule_change_log_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "public"."stylist_schedules"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."schedule_overrides"
    ADD CONSTRAINT "schedule_overrides_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."schedule_overrides"
    ADD CONSTRAINT "schedule_overrides_stylist_user_id_fkey" FOREIGN KEY ("stylist_user_id") REFERENCES "public"."stylist_profiles"("user_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."stylist_override_budgets"
    ADD CONSTRAINT "stylist_override_budgets_stylist_user_id_fkey" FOREIGN KEY ("stylist_user_id") REFERENCES "public"."stylist_profiles"("user_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."stylist_profiles"
    ADD CONSTRAINT "stylist_profiles_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "public"."kb_branches"("id");



ALTER TABLE ONLY "public"."stylist_profiles"
    ADD CONSTRAINT "stylist_profiles_deactivated_by_fkey" FOREIGN KEY ("deactivated_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."stylist_profiles"
    ADD CONSTRAINT "stylist_profiles_featured_by_fkey" FOREIGN KEY ("featured_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."stylist_profiles"
    ADD CONSTRAINT "stylist_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."user_profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."stylist_promotions"
    ADD CONSTRAINT "stylist_promotions_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."stylist_promotions"
    ADD CONSTRAINT "stylist_promotions_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."stylist_promotions"
    ADD CONSTRAINT "stylist_promotions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."user_profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."stylist_ratings"
    ADD CONSTRAINT "stylist_ratings_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."stylist_ratings"
    ADD CONSTRAINT "stylist_ratings_customer_user_id_fkey" FOREIGN KEY ("customer_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."stylist_ratings"
    ADD CONSTRAINT "stylist_ratings_moderated_by_fkey" FOREIGN KEY ("moderated_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."stylist_ratings"
    ADD CONSTRAINT "stylist_ratings_responded_by_fkey" FOREIGN KEY ("responded_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."stylist_ratings"
    ADD CONSTRAINT "stylist_ratings_stylist_user_id_fkey" FOREIGN KEY ("stylist_user_id") REFERENCES "public"."stylist_profiles"("user_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."stylist_schedules"
    ADD CONSTRAINT "stylist_schedules_stylist_user_id_fkey" FOREIGN KEY ("stylist_user_id") REFERENCES "public"."stylist_profiles"("user_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."stylist_services"
    ADD CONSTRAINT "stylist_services_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."stylist_services"
    ADD CONSTRAINT "stylist_services_stylist_user_id_fkey" FOREIGN KEY ("stylist_user_id") REFERENCES "public"."stylist_profiles"("user_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."stylist_specialties"
    ADD CONSTRAINT "stylist_specialties_specialty_type_id_fkey" FOREIGN KEY ("specialty_type_id") REFERENCES "public"."specialty_types"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."stylist_specialties"
    ADD CONSTRAINT "stylist_specialties_stylist_user_id_fkey" FOREIGN KEY ("stylist_user_id") REFERENCES "public"."stylist_profiles"("user_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."support_attachments"
    ADD CONSTRAINT "support_attachments_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "public"."support_messages"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."support_attachments"
    ADD CONSTRAINT "support_attachments_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "public"."support_tickets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."support_attachments"
    ADD CONSTRAINT "support_attachments_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."support_messages"
    ADD CONSTRAINT "support_messages_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "public"."support_tickets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."support_messages"
    ADD CONSTRAINT "support_messages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."support_tickets"
    ADD CONSTRAINT "support_tickets_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."support_tickets"
    ADD CONSTRAINT "support_tickets_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."support_categories"("id");



ALTER TABLE ONLY "public"."support_tickets"
    ADD CONSTRAINT "support_tickets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_addresses"
    ADD CONSTRAINT "user_addresses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_audit_log"
    ADD CONSTRAINT "user_audit_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."user_private_data"
    ADD CONSTRAINT "user_private_data_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_reputation"
    ADD CONSTRAINT "user_reputation_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."user_profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."variant_attribute_values"
    ADD CONSTRAINT "variant_attribute_values_attribute_value_id_fkey" FOREIGN KEY ("attribute_value_id") REFERENCES "public"."attribute_values"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."variant_attribute_values"
    ADD CONSTRAINT "variant_attribute_values_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."vendor_documents"
    ADD CONSTRAINT "vendor_documents_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."vendor_documents"
    ADD CONSTRAINT "vendor_documents_verified_by_fkey" FOREIGN KEY ("verified_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."vendor_profiles"
    ADD CONSTRAINT "vendor_profiles_application_reviewed_by_fkey" FOREIGN KEY ("application_reviewed_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."vendor_profiles"
    ADD CONSTRAINT "vendor_profiles_business_address_id_fkey" FOREIGN KEY ("business_address_id") REFERENCES "public"."user_addresses"("id");



ALTER TABLE ONLY "public"."vendor_profiles"
    ADD CONSTRAINT "vendor_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE "metrics"."platform_daily" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "platform_daily_admin_access" ON "metrics"."platform_daily" FOR SELECT TO "authenticated" USING ("public"."user_has_role"("auth"."uid"(), 'admin'::"text"));



COMMENT ON POLICY "platform_daily_admin_access" ON "metrics"."platform_daily" IS 'Only admins can view platform-wide aggregates. Self-defending via user_has_role check.';



CREATE POLICY "platform_daily_service_write" ON "metrics"."platform_daily" TO "service_role" USING (true) WITH CHECK (true);



COMMENT ON POLICY "platform_daily_service_write" ON "metrics"."platform_daily" IS 'Only service_role can write platform metrics via order-worker pipeline.';



ALTER TABLE "metrics"."product_trending_scores" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "trending_scores_public_read" ON "metrics"."product_trending_scores" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "trending_scores_service_write" ON "metrics"."product_trending_scores" TO "service_role" USING (true) WITH CHECK (true);



ALTER TABLE "metrics"."vendor_daily" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "vendor_daily_admin_access" ON "metrics"."vendor_daily" FOR SELECT TO "authenticated" USING ("public"."user_has_role"("auth"."uid"(), 'admin'::"text"));



COMMENT ON POLICY "vendor_daily_admin_access" ON "metrics"."vendor_daily" IS 'Admins with admin role can SELECT all vendor metrics for platform oversight.';



CREATE POLICY "vendor_daily_service_write" ON "metrics"."vendor_daily" TO "service_role" USING (true) WITH CHECK (true);



COMMENT ON POLICY "vendor_daily_service_write" ON "metrics"."vendor_daily" IS 'Only service_role (order-worker) can INSERT/UPDATE metrics. Prevents user tampering.';



CREATE POLICY "vendor_daily_vendor_access" ON "metrics"."vendor_daily" FOR SELECT TO "authenticated" USING (("vendor_id" = "auth"."uid"()));



COMMENT ON POLICY "vendor_daily_vendor_access" ON "metrics"."vendor_daily" IS 'Vendors can only SELECT their own daily metrics. Enforces data isolation at DB level.';



CREATE POLICY "vendor_realtime_admin_access" ON "metrics"."vendor_realtime_cache" FOR SELECT TO "authenticated" USING ("public"."user_has_role"("auth"."uid"(), 'admin'::"text"));



COMMENT ON POLICY "vendor_realtime_admin_access" ON "metrics"."vendor_realtime_cache" IS 'Admins can view all vendor realtime metrics for platform monitoring.';



ALTER TABLE "metrics"."vendor_realtime_cache" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "vendor_realtime_service_write" ON "metrics"."vendor_realtime_cache" TO "service_role" USING (true) WITH CHECK (true);



COMMENT ON POLICY "vendor_realtime_service_write" ON "metrics"."vendor_realtime_cache" IS 'Only service_role can update realtime cache. Maintains data integrity.';



CREATE POLICY "vendor_realtime_vendor_access" ON "metrics"."vendor_realtime_cache" FOR SELECT TO "authenticated" USING (("vendor_id" = "auth"."uid"()));



COMMENT ON POLICY "vendor_realtime_vendor_access" ON "metrics"."vendor_realtime_cache" IS 'Vendors can only SELECT their own realtime cache. Prevents cross-vendor data leakage.';



CREATE POLICY "Service role only" ON "private"."payment_gateway_verifications" USING (false);



ALTER TABLE "private"."app_config" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "deny_all_app_config" ON "private"."app_config" USING (false) WITH CHECK (false);



CREATE POLICY "metrics_queue_admin_all" ON "private"."metrics_update_queue" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."user_roles" "ur"
     JOIN "public"."roles" "r" ON (("r"."id" = "ur"."role_id")))
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("r"."name" = 'admin'::"text") AND ("ur"."is_active" = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."user_roles" "ur"
     JOIN "public"."roles" "r" ON (("r"."id" = "ur"."role_id")))
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("r"."name" = 'admin'::"text") AND ("ur"."is_active" = true)))));



ALTER TABLE "private"."metrics_update_queue" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "private"."payment_gateway_verifications" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "Admins can delete ratings" ON "public"."stylist_ratings" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM ("public"."user_roles" "ur"
     JOIN "public"."roles" "r" ON (("r"."id" = "ur"."role_id")))
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("r"."name" = 'admin'::"text") AND ("ur"."is_active" = true)))));



CREATE POLICY "Admins can manage all budgets" ON "public"."stylist_override_budgets" USING ("public"."user_has_role"("auth"."uid"(), 'admin'::"text"));



CREATE POLICY "Admins can manage all categories" ON "public"."categories" TO "authenticated" USING ("public"."user_has_role"("auth"."uid"(), 'admin'::"text")) WITH CHECK ("public"."user_has_role"("auth"."uid"(), 'admin'::"text"));



CREATE POLICY "Admins can manage all overrides" ON "public"."schedule_overrides" USING ("public"."user_has_role"("auth"."uid"(), 'admin'::"text"));



CREATE POLICY "Admins can manage all promotions" ON "public"."stylist_promotions" USING ("public"."user_has_role"("auth"."uid"(), 'admin'::"text"));



CREATE POLICY "Admins can manage all stylist profiles" ON "public"."stylist_profiles" USING ("public"."user_has_role"("auth"."uid"(), 'admin'::"text"));



CREATE POLICY "Admins can manage all vendor profiles" ON "public"."vendor_profiles" TO "authenticated" USING ("public"."user_has_role"("auth"."uid"(), 'admin'::"text")) WITH CHECK ("public"."user_has_role"("auth"."uid"(), 'admin'::"text"));



CREATE POLICY "Admins can manage role assignments" ON "public"."user_roles" TO "authenticated" USING ("public"."user_has_role"("auth"."uid"(), 'admin'::"text")) WITH CHECK ("public"."user_has_role"("auth"."uid"(), 'admin'::"text"));



CREATE POLICY "Admins can manage services" ON "public"."services" USING ("public"."user_has_role"("auth"."uid"(), 'admin'::"text"));



CREATE POLICY "Admins can moderate any review" ON "public"."reviews" FOR UPDATE USING ("public"."user_has_role"("auth"."uid"(), 'admin'::"text")) WITH CHECK ("public"."user_has_role"("auth"."uid"(), 'admin'::"text"));



CREATE POLICY "Admins can reply to any review" ON "public"."review_replies" FOR INSERT WITH CHECK (("public"."user_has_role"("auth"."uid"(), 'admin'::"text") OR "public"."user_has_role"("auth"."uid"(), 'support'::"text")));



CREATE POLICY "Admins can update any profile" ON "public"."user_profiles" FOR UPDATE TO "authenticated" USING ("public"."user_has_role"("auth"."uid"(), 'admin'::"text")) WITH CHECK ("public"."user_has_role"("auth"."uid"(), 'admin'::"text"));



CREATE POLICY "Admins can update documents" ON "public"."vendor_documents" FOR UPDATE TO "authenticated" USING ("public"."user_has_role"("auth"."uid"(), 'admin'::"text"));



CREATE POLICY "Admins can view all addresses" ON "public"."user_addresses" FOR SELECT TO "authenticated" USING ("public"."user_has_role"("auth"."uid"(), 'admin'::"text"));



CREATE POLICY "Admins can view all audit logs" ON "public"."user_audit_log" FOR SELECT TO "authenticated" USING ("public"."user_has_role"("auth"."uid"(), 'admin'::"text"));



CREATE POLICY "Admins can view all documents" ON "public"."vendor_documents" FOR SELECT TO "authenticated" USING ("public"."user_has_role"("auth"."uid"(), 'admin'::"text"));



CREATE POLICY "Admins can view all payout requests" ON "public"."payout_requests" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."user_roles" "ur"
     JOIN "public"."roles" "r" ON (("r"."id" = "ur"."role_id")))
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("r"."name" = 'admin'::"text") AND ("ur"."is_active" = true)))));



COMMENT ON POLICY "Admins can view all payout requests" ON "public"."payout_requests" IS 'Allows admins to query payout_requests table for stats and management';



CREATE POLICY "Admins can view all role assignments" ON "public"."user_roles" FOR SELECT TO "authenticated" USING ("public"."user_has_role"("auth"."uid"(), 'admin'::"text"));



CREATE POLICY "Admins can view private data for support" ON "public"."user_private_data" FOR SELECT TO "authenticated" USING (("public"."user_has_role"("auth"."uid"(), 'admin'::"text") OR "public"."user_has_role"("auth"."uid"(), 'support'::"text")));



CREATE POLICY "Admins can view verifications" ON "public"."payment_gateway_verifications" FOR SELECT USING ("public"."user_has_role"("auth"."uid"(), 'admin'::"text"));



CREATE POLICY "Admins have full access to bookings" ON "public"."bookings" USING ("public"."user_has_role"("auth"."uid"(), 'admin'::"text"));



CREATE POLICY "Admins view all booking history" ON "public"."booking_status_history" FOR SELECT USING ("public"."user_has_role"("auth"."uid"(), 'admin'::"text"));



CREATE POLICY "Admins view all schedule logs" ON "public"."schedule_change_log" USING ("public"."user_has_role"("auth"."uid"(), 'admin'::"text"));



CREATE POLICY "Anyone can view active schedules" ON "public"."stylist_schedules" FOR SELECT USING (("is_active" = true));



CREATE POLICY "Anyone can view active services" ON "public"."services" FOR SELECT USING (("is_active" = true));



CREATE POLICY "Anyone can view active stylists" ON "public"."stylist_profiles" FOR SELECT USING (("is_active" = true));



CREATE POLICY "Anyone can view approved media" ON "public"."review_media" FOR SELECT USING (((("is_approved" = true) AND ("is_visible" = true)) OR (EXISTS ( SELECT 1
   FROM "public"."reviews"
  WHERE (("reviews"."id" = "review_media"."review_id") AND ("reviews"."user_id" = "auth"."uid"())))) OR "public"."user_has_role"("auth"."uid"(), 'admin'::"text")));



CREATE POLICY "Anyone can view approved ratings" ON "public"."stylist_ratings" FOR SELECT USING (("is_approved" = true));



CREATE POLICY "Anyone can view available services" ON "public"."stylist_services" FOR SELECT USING (("is_available" = true));



CREATE POLICY "Anyone can view combo items for active combos" ON "public"."combo_items" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."products" "p"
  WHERE (("p"."id" = "combo_items"."combo_product_id") AND ("p"."is_active" = true)))));



CREATE POLICY "Anyone can view overrides" ON "public"."schedule_overrides" FOR SELECT USING (true);



CREATE POLICY "Anyone can view reputation scores" ON "public"."user_reputation" FOR SELECT USING (true);



CREATE POLICY "Anyone can view visible replies" ON "public"."review_replies" FOR SELECT USING ((("is_visible" = true) OR ("user_id" = "auth"."uid"()) OR "public"."user_has_role"("auth"."uid"(), 'admin'::"text")));



CREATE POLICY "Anyone can view vote counts" ON "public"."review_votes" FOR SELECT USING (true);



CREATE POLICY "Anyone can view vote shards" ON "public"."review_vote_shards" FOR SELECT USING (true);



CREATE POLICY "Authenticated users can create their own carts" ON "public"."carts" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "Authenticated users can delete their own carts" ON "public"."carts" FOR DELETE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Authenticated users can manage their cart items" ON "public"."cart_items" USING (("cart_id" IN ( SELECT "carts"."id"
   FROM "public"."carts"
  WHERE ("carts"."user_id" = "auth"."uid"()))));



CREATE POLICY "Authenticated users can update their own carts" ON "public"."carts" FOR UPDATE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Authenticated users can view their cart items" ON "public"."cart_items" FOR SELECT USING (("cart_id" IN ( SELECT "carts"."id"
   FROM "public"."carts"
  WHERE ("carts"."user_id" = "auth"."uid"()))));



CREATE POLICY "Authenticated users can view their own carts" ON "public"."carts" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Customers can create bookings" ON "public"."bookings" FOR INSERT WITH CHECK (("customer_user_id" = "auth"."uid"()));



CREATE POLICY "Customers can update own bookings" ON "public"."bookings" FOR UPDATE USING (("customer_user_id" = "auth"."uid"())) WITH CHECK (("customer_user_id" = "auth"."uid"()));



CREATE POLICY "Customers view own booking history" ON "public"."booking_status_history" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."bookings"
  WHERE (("bookings"."id" = "booking_status_history"."booking_id") AND ("bookings"."customer_user_id" = "auth"."uid"())))));



CREATE POLICY "Customers view own bookings" ON "public"."bookings" FOR SELECT USING (("customer_user_id" = "auth"."uid"()));



CREATE POLICY "Everyone can view roles" ON "public"."roles" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "KB Stylish vendor can delete combo items" ON "public"."combo_items" FOR DELETE USING (("auth"."uid"() = '365bd0ab-e135-45c5-bd24-a907de036287'::"uuid"));



CREATE POLICY "KB Stylish vendor can insert combo items" ON "public"."combo_items" FOR INSERT WITH CHECK (("auth"."uid"() = '365bd0ab-e135-45c5-bd24-a907de036287'::"uuid"));



CREATE POLICY "KB Stylish vendor can update combo items" ON "public"."combo_items" FOR UPDATE USING (("auth"."uid"() = '365bd0ab-e135-45c5-bd24-a907de036287'::"uuid"));



CREATE POLICY "Only admins can manage roles" ON "public"."roles" TO "authenticated" USING ("public"."user_has_role"("auth"."uid"(), 'admin'::"text")) WITH CHECK ("public"."user_has_role"("auth"."uid"(), 'admin'::"text"));



CREATE POLICY "Only moderators can update queue" ON "public"."moderation_queue" FOR UPDATE USING (("public"."user_has_role"("auth"."uid"(), 'admin'::"text") OR "public"."user_has_role"("auth"."uid"(), 'support'::"text")));



CREATE POLICY "Only moderators can view queue" ON "public"."moderation_queue" FOR SELECT USING (("public"."user_has_role"("auth"."uid"(), 'admin'::"text") OR "public"."user_has_role"("auth"."uid"(), 'support'::"text")));



CREATE POLICY "Only service role can manage verifications" ON "public"."payment_gateway_verifications" USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Public can view active categories" ON "public"."categories" FOR SELECT TO "authenticated", "anon" USING (("is_active" = true));



CREATE POLICY "Public can view verified vendor profiles" ON "public"."vendor_profiles" FOR SELECT TO "authenticated", "anon" USING (("verification_status" = 'verified'::"text"));



CREATE POLICY "Public profiles viewable by everyone" ON "public"."user_profiles" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "Service role can insert email logs" ON "public"."email_logs" FOR INSERT WITH CHECK (true);



CREATE POLICY "Service role can manage guest cart items" ON "public"."cart_items" USING (((("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text") AND ("cart_id" IN ( SELECT "carts"."id"
   FROM "public"."carts"
  WHERE (("carts"."user_id" IS NULL) AND ("carts"."session_id" IS NOT NULL))))));



CREATE POLICY "Service role can manage guest carts" ON "public"."carts" USING (((("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text") AND ("user_id" IS NULL) AND ("session_id" IS NOT NULL)));



CREATE POLICY "Service role can update email logs" ON "public"."email_logs" FOR UPDATE USING (true);



CREATE POLICY "Service role manages payment intents" ON "public"."payment_intents" USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Stylists can manage own schedules" ON "public"."stylist_schedules" USING ((("stylist_user_id" = "auth"."uid"()) OR "public"."user_has_role"("auth"."uid"(), 'admin'::"text")));



CREATE POLICY "Stylists can manage own services" ON "public"."stylist_services" USING ((("stylist_user_id" = "auth"."uid"()) OR "public"."user_has_role"("auth"."uid"(), 'admin'::"text")));



CREATE POLICY "Stylists can update own profile" ON "public"."stylist_profiles" FOR UPDATE USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "Stylists can update their bookings" ON "public"."bookings" FOR UPDATE USING (("stylist_user_id" = "auth"."uid"()));



CREATE POLICY "Stylists can view own budget" ON "public"."stylist_override_budgets" FOR SELECT USING (("stylist_user_id" = "auth"."uid"()));



CREATE POLICY "Stylists can view their overrides" ON "public"."schedule_overrides" FOR SELECT USING (("stylist_user_id" = "auth"."uid"()));



CREATE POLICY "Stylists view own booking history" ON "public"."booking_status_history" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."bookings"
  WHERE (("bookings"."id" = "booking_status_history"."booking_id") AND ("bookings"."stylist_user_id" = "auth"."uid"())))));



CREATE POLICY "Stylists view own schedule logs" ON "public"."schedule_change_log" FOR SELECT USING (("stylist_user_id" = "auth"."uid"()));



CREATE POLICY "Stylists view their bookings" ON "public"."bookings" FOR SELECT USING (("stylist_user_id" = "auth"."uid"()));



CREATE POLICY "System can insert audit logs" ON "public"."user_audit_log" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Users can create their own reviews" ON "public"."reviews" FOR INSERT WITH CHECK ((("user_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM ("public"."orders" "o"
     JOIN "public"."order_items" "oi" ON (("oi"."order_id" = "o"."id")))
  WHERE (("o"."user_id" = "auth"."uid"()) AND ("o"."id" = "reviews"."order_id") AND ("o"."status" = ANY (ARRAY['delivered'::"text", 'completed'::"text"])) AND ("oi"."product_id" = "reviews"."product_id"))))));



CREATE POLICY "Users can delete their own votes" ON "public"."review_votes" FOR DELETE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can flag reviews" ON "public"."review_flags" FOR INSERT WITH CHECK ((("reporter_user_id" = "auth"."uid"()) AND ("reporter_user_id" <> ( SELECT "reviews"."user_id"
   FROM "public"."reviews"
  WHERE ("reviews"."id" = "review_flags"."review_id")))));



CREATE POLICY "Users can manage own addresses" ON "public"."user_addresses" TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can rate their own completed bookings" ON "public"."stylist_ratings" FOR INSERT WITH CHECK ((("auth"."uid"() = "customer_user_id") AND "public"."can_rate_booking"("booking_id")));



CREATE POLICY "Users can soft delete their own reviews" ON "public"."reviews" FOR UPDATE USING ((("user_id" = "auth"."uid"()) AND ("deleted_at" IS NULL))) WITH CHECK ((("user_id" = "auth"."uid"()) AND ("deleted_at" IS NOT NULL)));



CREATE POLICY "Users can update own private data" ON "public"."user_private_data" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own profile" ON "public"."user_profiles" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "id")) WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Users can update ratings within 7 days" ON "public"."stylist_ratings" FOR UPDATE USING ((("auth"."uid"() = "customer_user_id") AND ("created_at" > ("now"() - '7 days'::interval)))) WITH CHECK ((("auth"."uid"() = "customer_user_id") AND ("rating" >= 1) AND ("rating" <= 5)));



CREATE POLICY "Users can update their own replies" ON "public"."review_replies" FOR UPDATE USING ((("user_id" = "auth"."uid"()) AND ("deleted_at" IS NULL)));



CREATE POLICY "Users can update their own reviews" ON "public"."reviews" FOR UPDATE USING ((("user_id" = "auth"."uid"()) AND ("deleted_at" IS NULL)));



CREATE POLICY "Users can update their own votes" ON "public"."review_votes" FOR UPDATE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can view own audit logs" ON "public"."user_audit_log" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own order items" ON "public"."order_items" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."orders"
  WHERE (("orders"."id" = "order_items"."order_id") AND ("orders"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can view own orders" ON "public"."orders" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own payment intents" ON "public"."payment_intents" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own private data" ON "public"."user_private_data" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own role assignments" ON "public"."user_roles" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view reviews based on role" ON "public"."reviews" FOR SELECT USING ((("is_approved" = true) OR ("user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."products" "p"
  WHERE (("p"."id" = "reviews"."product_id") AND ("p"."vendor_id" = "auth"."uid"()) AND "public"."user_has_role"("auth"."uid"(), 'vendor'::"text")))) OR "public"."user_has_role"("auth"."uid"(), 'admin'::"text") OR "public"."user_has_role"("auth"."uid"(), 'support'::"text")));



COMMENT ON POLICY "Users can view reviews based on role" ON "public"."reviews" IS 'Allows: (1) everyone to see approved reviews, (2) users to see their own reviews, (3) vendors to see ALL reviews on their products for moderation, (4) admin/support to see all reviews';



CREATE POLICY "Users can view their own email logs" ON "public"."email_logs" FOR SELECT USING (("auth"."uid"() = "recipient_user_id"));



CREATE POLICY "Users can view their own flags" ON "public"."review_flags" FOR SELECT USING ((("reporter_user_id" = "auth"."uid"()) OR "public"."user_has_role"("auth"."uid"(), 'admin'::"text") OR "public"."user_has_role"("auth"."uid"(), 'support'::"text")));



CREATE POLICY "Users can view their own promotion status" ON "public"."stylist_promotions" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can vote on others reviews" ON "public"."review_votes" FOR INSERT WITH CHECK ((("user_id" = "auth"."uid"()) AND ("user_id" <> ( SELECT "reviews"."user_id"
   FROM "public"."reviews"
  WHERE ("reviews"."id" = "review_votes"."review_id")))));



CREATE POLICY "Users manage their own email preferences" ON "public"."email_preferences" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Vendors can cancel own pending payout requests" ON "public"."payout_requests" FOR UPDATE USING ((("vendor_id" = "auth"."uid"()) AND ("status" = 'pending'::"text"))) WITH CHECK (("status" = ANY (ARRAY['pending'::"text", 'cancelled'::"text"])));



CREATE POLICY "Vendors can create payout requests" ON "public"."payout_requests" FOR INSERT WITH CHECK (("vendor_id" = "auth"."uid"()));



CREATE POLICY "Vendors can delete own pending documents" ON "public"."vendor_documents" FOR DELETE TO "authenticated" USING ((("vendor_id" = "auth"."uid"()) AND ("status" = 'pending'::"text")));



CREATE POLICY "Vendors can manage own vendor profile" ON "public"."vendor_profiles" TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Vendors can moderate reviews on their products" ON "public"."reviews" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."products" "p"
  WHERE (("p"."id" = "reviews"."product_id") AND ("p"."vendor_id" = "auth"."uid"()) AND "public"."user_has_role"("auth"."uid"(), 'vendor'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."products" "p"
  WHERE (("p"."id" = "reviews"."product_id") AND ("p"."vendor_id" = "auth"."uid"()) AND "public"."user_has_role"("auth"."uid"(), 'vendor'::"text")))));



COMMENT ON POLICY "Vendors can moderate reviews on their products" ON "public"."reviews" IS 'Allows vendors to approve/reject reviews on their own products by updating is_approved, moderation_status, moderated_at, and moderated_by fields';



CREATE POLICY "Vendors can reply to their product reviews" ON "public"."review_replies" FOR INSERT WITH CHECK ((("user_id" = "auth"."uid"()) AND ("reply_type" = 'vendor'::"text") AND (EXISTS ( SELECT 1
   FROM ("public"."reviews" "r"
     JOIN "public"."products" "p" ON (("p"."id" = "r"."product_id")))
  WHERE (("r"."id" = "review_replies"."review_id") AND ("p"."vendor_id" = "auth"."uid"()))))));



CREATE POLICY "Vendors can upload own documents" ON "public"."vendor_documents" FOR INSERT TO "authenticated" WITH CHECK (("vendor_id" = "auth"."uid"()));



CREATE POLICY "Vendors can view order details" ON "public"."orders" FOR SELECT TO "authenticated" USING ((("auth"."uid"() = "user_id") OR true));



COMMENT ON POLICY "Vendors can view order details" ON "public"."orders" IS 'Allows viewing order details for fulfillment. Security is enforced at order_items level via vendor_id filtering. Orders table only contains shipping info, not sensitive payment data.';



CREATE POLICY "Vendors can view own documents" ON "public"."vendor_documents" FOR SELECT TO "authenticated" USING (("vendor_id" = "auth"."uid"()));



CREATE POLICY "Vendors can view own payout requests" ON "public"."payout_requests" FOR SELECT USING (("vendor_id" = "auth"."uid"()));



CREATE POLICY "Vendors can view own payouts" ON "public"."payouts" FOR SELECT USING (("vendor_id" = "auth"."uid"()));



CREATE POLICY "Vendors can view own product orders" ON "public"."order_items" FOR SELECT USING (("vendor_id" = "auth"."uid"()));



COMMENT ON POLICY "Vendors can view own product orders" ON "public"."order_items" IS 'Allows vendors to see order items containing their products by matching vendor_id with auth.uid()';



CREATE POLICY "admins_read_violations" ON "public"."inventory_violation_logs" FOR SELECT USING ("public"."user_has_role"("auth"."uid"(), 'admin'::"text"));



ALTER TABLE "public"."attribute_values" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "attribute_values_insert_admin" ON "public"."attribute_values" FOR INSERT TO "authenticated" WITH CHECK ("public"."user_has_role"("auth"."uid"(), 'admin'::"text"));



CREATE POLICY "attribute_values_select_all" ON "public"."attribute_values" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "attribute_values_update_admin" ON "public"."attribute_values" FOR UPDATE TO "authenticated" USING ("public"."user_has_role"("auth"."uid"(), 'admin'::"text"));



ALTER TABLE "public"."booking_reservations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."booking_status_history" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."bookings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."brands" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "brands_delete_admin" ON "public"."brands" FOR DELETE TO "authenticated" USING ("public"."user_has_role"("auth"."uid"(), 'admin'::"text"));



CREATE POLICY "brands_insert_admin" ON "public"."brands" FOR INSERT TO "authenticated" WITH CHECK ("public"."user_has_role"("auth"."uid"(), 'admin'::"text"));



CREATE POLICY "brands_select_all" ON "public"."brands" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "brands_update_admin" ON "public"."brands" FOR UPDATE TO "authenticated" USING ("public"."user_has_role"("auth"."uid"(), 'admin'::"text"));



ALTER TABLE "public"."cart_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."carts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."categories" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "categories_insert_admin" ON "public"."categories" FOR INSERT TO "authenticated" WITH CHECK ("public"."user_has_role"("auth"."uid"(), 'admin'::"text"));



CREATE POLICY "categories_select_active" ON "public"."categories" FOR SELECT TO "authenticated" USING ((("is_active" = true) OR "public"."user_has_role"("auth"."uid"(), 'admin'::"text")));



CREATE POLICY "categories_update_admin" ON "public"."categories" FOR UPDATE TO "authenticated" USING ("public"."user_has_role"("auth"."uid"(), 'admin'::"text"));



ALTER TABLE "public"."combo_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."curation_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "curation_events_admin_read" ON "public"."curation_events" FOR SELECT TO "authenticated" USING ("public"."user_has_role"("auth"."uid"(), 'admin'::"text"));



CREATE POLICY "curation_events_insert" ON "public"."curation_events" FOR INSERT TO "authenticated", "anon" WITH CHECK (true);



ALTER TABLE "public"."email_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."email_preferences" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."inventory" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "inventory_delete_vendor" ON "public"."inventory" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."inventory_locations" "il"
  WHERE (("il"."id" = "inventory"."location_id") AND ((("il"."vendor_id" = "auth"."uid"()) AND "public"."user_has_role"("auth"."uid"(), 'vendor'::"text")) OR "public"."user_has_role"("auth"."uid"(), 'admin'::"text"))))));



CREATE POLICY "inventory_insert_vendor" ON "public"."inventory" FOR INSERT TO "authenticated" WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."inventory_locations" "il"
  WHERE (("il"."id" = "inventory"."location_id") AND ("il"."vendor_id" = "auth"."uid"())))) AND "public"."user_has_role"("auth"."uid"(), 'vendor'::"text")));



ALTER TABLE "public"."inventory_locations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."inventory_movements" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "inventory_movements_insert_vendor" ON "public"."inventory_movements" FOR INSERT TO "authenticated" WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."inventory_locations" "il"
  WHERE (("il"."id" = "inventory_movements"."location_id") AND ("il"."vendor_id" = "auth"."uid"())))) AND "public"."user_has_role"("auth"."uid"(), 'vendor'::"text") AND ("created_by" = "auth"."uid"())));



CREATE POLICY "inventory_movements_select_vendor" ON "public"."inventory_movements" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."inventory_locations" "il"
  WHERE (("il"."id" = "inventory_movements"."location_id") AND (("il"."vendor_id" = "auth"."uid"()) OR "public"."user_has_role"("auth"."uid"(), 'admin'::"text") OR "public"."user_has_role"("auth"."uid"(), 'support'::"text"))))));



CREATE POLICY "inventory_select_vendor" ON "public"."inventory" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."inventory_locations" "il"
  WHERE (("il"."id" = "inventory"."location_id") AND (("il"."vendor_id" = "auth"."uid"()) OR "public"."user_has_role"("auth"."uid"(), 'admin'::"text") OR "public"."user_has_role"("auth"."uid"(), 'support'::"text"))))));



CREATE POLICY "inventory_update_vendor" ON "public"."inventory" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."inventory_locations" "il"
  WHERE (("il"."id" = "inventory"."location_id") AND ((("il"."vendor_id" = "auth"."uid"()) AND "public"."user_has_role"("auth"."uid"(), 'vendor'::"text")) OR "public"."user_has_role"("auth"."uid"(), 'admin'::"text"))))));



ALTER TABLE "public"."inventory_violation_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."job_queue" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "job_queue_admin_all" ON "public"."job_queue" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."user_roles" "ur"
     JOIN "public"."roles" "r" ON (("r"."id" = "ur"."role_id")))
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("r"."name" = 'admin'::"text") AND ("ur"."is_active" = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."user_roles" "ur"
     JOIN "public"."roles" "r" ON (("r"."id" = "ur"."role_id")))
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("r"."name" = 'admin'::"text") AND ("ur"."is_active" = true)))));



COMMENT ON POLICY "job_queue_admin_all" ON "public"."job_queue" IS 'Admin-only access to job_queue table. Required for async processing governance.';



ALTER TABLE "public"."kb_branches" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "kb_branches_admin_all" ON "public"."kb_branches" USING ("public"."user_has_role"("auth"."uid"(), 'admin'::"text"));



CREATE POLICY "kb_branches_public_read" ON "public"."kb_branches" FOR SELECT USING (("is_active" = true));



CREATE POLICY "locations_delete_vendor" ON "public"."inventory_locations" FOR DELETE TO "authenticated" USING (((("vendor_id" = "auth"."uid"()) AND "public"."user_has_role"("auth"."uid"(), 'vendor'::"text")) OR "public"."user_has_role"("auth"."uid"(), 'admin'::"text")));



CREATE POLICY "locations_insert_vendor" ON "public"."inventory_locations" FOR INSERT TO "authenticated" WITH CHECK ((("vendor_id" = "auth"."uid"()) AND "public"."user_has_role"("auth"."uid"(), 'vendor'::"text")));



CREATE POLICY "locations_select_vendor" ON "public"."inventory_locations" FOR SELECT TO "authenticated" USING ((("vendor_id" = "auth"."uid"()) OR "public"."user_has_role"("auth"."uid"(), 'admin'::"text") OR "public"."user_has_role"("auth"."uid"(), 'support'::"text")));



CREATE POLICY "locations_update_vendor" ON "public"."inventory_locations" FOR UPDATE TO "authenticated" USING (((("vendor_id" = "auth"."uid"()) AND "public"."user_has_role"("auth"."uid"(), 'vendor'::"text")) OR "public"."user_has_role"("auth"."uid"(), 'admin'::"text")));



ALTER TABLE "public"."moderation_queue" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."order_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."orders" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."payment_gateway_verifications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."payment_intents" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."payout_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."payouts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."product_attributes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "product_attributes_insert_admin" ON "public"."product_attributes" FOR INSERT TO "authenticated" WITH CHECK ("public"."user_has_role"("auth"."uid"(), 'admin'::"text"));



CREATE POLICY "product_attributes_select_all" ON "public"."product_attributes" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "product_attributes_update_admin" ON "public"."product_attributes" FOR UPDATE TO "authenticated" USING ("public"."user_has_role"("auth"."uid"(), 'admin'::"text"));



ALTER TABLE "public"."product_change_log" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "product_change_log_admin_read" ON "public"."product_change_log" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."user_roles" "ur"
     JOIN "public"."roles" "r" ON (("ur"."role_id" = "r"."id")))
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("r"."name" = 'admin'::"text") AND ("ur"."is_active" = true)))));



CREATE POLICY "product_change_log_service_role_only" ON "public"."product_change_log" TO "service_role" USING (true) WITH CHECK (true);



ALTER TABLE "public"."product_images" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "product_images_delete_vendor" ON "public"."product_images" FOR DELETE TO "authenticated" USING (((("product_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."products" "p"
  WHERE (("p"."id" = "product_images"."product_id") AND ((("p"."vendor_id" = "auth"."uid"()) AND "public"."user_has_role"("auth"."uid"(), 'vendor'::"text")) OR "public"."user_has_role"("auth"."uid"(), 'admin'::"text")))))) OR (("variant_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM ("public"."product_variants" "pv"
     JOIN "public"."products" "p" ON (("pv"."product_id" = "p"."id")))
  WHERE (("pv"."id" = "product_images"."variant_id") AND ((("p"."vendor_id" = "auth"."uid"()) AND "public"."user_has_role"("auth"."uid"(), 'vendor'::"text")) OR "public"."user_has_role"("auth"."uid"(), 'admin'::"text"))))))));



CREATE POLICY "product_images_insert_vendor" ON "public"."product_images" FOR INSERT TO "authenticated" WITH CHECK ((((("product_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."products" "p"
  WHERE (("p"."id" = "product_images"."product_id") AND ("p"."vendor_id" = "auth"."uid"()))))) OR (("variant_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM ("public"."product_variants" "pv"
     JOIN "public"."products" "p" ON (("pv"."product_id" = "p"."id")))
  WHERE (("pv"."id" = "product_images"."variant_id") AND ("p"."vendor_id" = "auth"."uid"())))))) AND "public"."user_has_role"("auth"."uid"(), 'vendor'::"text")));



CREATE POLICY "product_images_select_by_product" ON "public"."product_images" FOR SELECT TO "authenticated" USING (((("product_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."products" "p"
  WHERE (("p"."id" = "product_images"."product_id") AND (("p"."is_active" = true) OR ("p"."vendor_id" = "auth"."uid"()) OR "public"."user_has_role"("auth"."uid"(), 'admin'::"text") OR "public"."user_has_role"("auth"."uid"(), 'support'::"text")))))) OR (("variant_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM ("public"."product_variants" "pv"
     JOIN "public"."products" "p" ON (("pv"."product_id" = "p"."id")))
  WHERE (("pv"."id" = "product_images"."variant_id") AND (("pv"."is_active" = true) OR ("p"."vendor_id" = "auth"."uid"()) OR "public"."user_has_role"("auth"."uid"(), 'admin'::"text") OR "public"."user_has_role"("auth"."uid"(), 'support'::"text"))))))));



CREATE POLICY "product_images_update_vendor" ON "public"."product_images" FOR UPDATE TO "authenticated" USING (((("product_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."products" "p"
  WHERE (("p"."id" = "product_images"."product_id") AND ((("p"."vendor_id" = "auth"."uid"()) AND "public"."user_has_role"("auth"."uid"(), 'vendor'::"text")) OR "public"."user_has_role"("auth"."uid"(), 'admin'::"text")))))) OR (("variant_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM ("public"."product_variants" "pv"
     JOIN "public"."products" "p" ON (("pv"."product_id" = "p"."id")))
  WHERE (("pv"."id" = "product_images"."variant_id") AND ((("p"."vendor_id" = "auth"."uid"()) AND "public"."user_has_role"("auth"."uid"(), 'vendor'::"text")) OR "public"."user_has_role"("auth"."uid"(), 'admin'::"text"))))))));



ALTER TABLE "public"."product_recommendations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."product_tag_assignments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "product_tag_assignments_delete_vendor" ON "public"."product_tag_assignments" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."products" "p"
  WHERE (("p"."id" = "product_tag_assignments"."product_id") AND ((("p"."vendor_id" = "auth"."uid"()) AND "public"."user_has_role"("auth"."uid"(), 'vendor'::"text")) OR "public"."user_has_role"("auth"."uid"(), 'admin'::"text"))))));



CREATE POLICY "product_tag_assignments_insert_vendor" ON "public"."product_tag_assignments" FOR INSERT TO "authenticated" WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."products" "p"
  WHERE (("p"."id" = "product_tag_assignments"."product_id") AND ("p"."vendor_id" = "auth"."uid"())))) AND "public"."user_has_role"("auth"."uid"(), 'vendor'::"text")));



CREATE POLICY "product_tag_assignments_select_by_product" ON "public"."product_tag_assignments" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."products" "p"
  WHERE (("p"."id" = "product_tag_assignments"."product_id") AND (("p"."is_active" = true) OR ("p"."vendor_id" = "auth"."uid"()) OR "public"."user_has_role"("auth"."uid"(), 'admin'::"text") OR "public"."user_has_role"("auth"."uid"(), 'support'::"text"))))));



ALTER TABLE "public"."product_tags" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "product_tags_delete_admin" ON "public"."product_tags" FOR DELETE TO "authenticated" USING ("public"."user_has_role"("auth"."uid"(), 'admin'::"text"));



CREATE POLICY "product_tags_insert_admin" ON "public"."product_tags" FOR INSERT TO "authenticated" WITH CHECK ("public"."user_has_role"("auth"."uid"(), 'admin'::"text"));



CREATE POLICY "product_tags_select_all" ON "public"."product_tags" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "product_tags_update_admin" ON "public"."product_tags" FOR UPDATE TO "authenticated" USING ("public"."user_has_role"("auth"."uid"(), 'admin'::"text"));



ALTER TABLE "public"."product_variants" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."products" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "products_delete_vendor" ON "public"."products" FOR DELETE TO "authenticated" USING (((("vendor_id" = "auth"."uid"()) AND "public"."user_has_role"("auth"."uid"(), 'vendor'::"text")) OR "public"."user_has_role"("auth"."uid"(), 'admin'::"text")));



CREATE POLICY "products_insert_vendor" ON "public"."products" FOR INSERT TO "authenticated" WITH CHECK (("public"."user_has_role"("auth"."uid"(), 'vendor'::"text") AND ("vendor_id" = "auth"."uid"())));



CREATE POLICY "products_select_active" ON "public"."products" FOR SELECT TO "authenticated" USING ((("is_active" = true) OR ("vendor_id" = "auth"."uid"()) OR "public"."user_has_role"("auth"."uid"(), 'admin'::"text") OR "public"."user_has_role"("auth"."uid"(), 'support'::"text")));



CREATE POLICY "products_update_vendor" ON "public"."products" FOR UPDATE TO "authenticated" USING (((("vendor_id" = "auth"."uid"()) AND "public"."user_has_role"("auth"."uid"(), 'vendor'::"text")) OR "public"."user_has_role"("auth"."uid"(), 'admin'::"text")));



CREATE POLICY "public_categories_read" ON "public"."categories" FOR SELECT TO "authenticated", "anon" USING (("is_active" = true));



CREATE POLICY "public_images_read" ON "public"."product_images" FOR SELECT TO "authenticated", "anon" USING (((("product_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."products" "p"
  WHERE (("p"."id" = "product_images"."product_id") AND ("p"."is_active" = true))))) OR (("variant_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM ("public"."product_variants" "pv"
     JOIN "public"."products" "p" ON (("pv"."product_id" = "p"."id")))
  WHERE (("pv"."id" = "product_images"."variant_id") AND ("p"."is_active" = true) AND ("pv"."is_active" = true)))))));



CREATE POLICY "public_inventory_read" ON "public"."inventory" FOR SELECT TO "authenticated", "anon" USING ((EXISTS ( SELECT 1
   FROM ("public"."product_variants" "pv"
     JOIN "public"."products" "p" ON (("pv"."product_id" = "p"."id")))
  WHERE (("pv"."id" = "inventory"."variant_id") AND ("p"."is_active" = true) AND ("pv"."is_active" = true)))));



CREATE POLICY "public_products_read" ON "public"."products" FOR SELECT TO "authenticated", "anon" USING (("is_active" = true));



CREATE POLICY "public_variants_read" ON "public"."product_variants" FOR SELECT TO "authenticated", "anon" USING ((("is_active" = true) AND (EXISTS ( SELECT 1
   FROM "public"."products" "p"
  WHERE (("p"."id" = "product_variants"."product_id") AND ("p"."is_active" = true))))));



CREATE POLICY "recommendations_admin_write" ON "public"."product_recommendations" TO "authenticated" USING ("public"."user_has_role"("auth"."uid"(), 'admin'::"text")) WITH CHECK ("public"."user_has_role"("auth"."uid"(), 'admin'::"text"));



CREATE POLICY "recommendations_public_read" ON "public"."product_recommendations" FOR SELECT TO "authenticated", "anon" USING (true);



ALTER TABLE "public"."review_flags" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."review_media" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."review_replies" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."review_vote_shards" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."review_votes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."reviews" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."roles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."schedule_change_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."schedule_overrides" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "service_role_all" ON "public"."booking_reservations" TO "service_role" USING (true) WITH CHECK (true);



ALTER TABLE "public"."services" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."specialty_types" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "specialty_types_admin_all" ON "public"."specialty_types" USING ("public"."user_has_role"("auth"."uid"(), 'admin'::"text")) WITH CHECK ("public"."user_has_role"("auth"."uid"(), 'admin'::"text"));



CREATE POLICY "specialty_types_public_read" ON "public"."specialty_types" FOR SELECT USING (("is_active" = true));



ALTER TABLE "public"."stylist_override_budgets" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."stylist_profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."stylist_promotions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."stylist_ratings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."stylist_schedules" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."stylist_services" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."stylist_specialties" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "stylist_specialties_admin_all" ON "public"."stylist_specialties" USING ("public"."user_has_role"("auth"."uid"(), 'admin'::"text")) WITH CHECK ("public"."user_has_role"("auth"."uid"(), 'admin'::"text"));



CREATE POLICY "stylist_specialties_owner_read" ON "public"."stylist_specialties" FOR SELECT USING (("stylist_user_id" = "auth"."uid"()));



CREATE POLICY "stylist_specialties_public_read" ON "public"."stylist_specialties" FOR SELECT USING (true);



ALTER TABLE "public"."support_attachments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "support_attachments_access" ON "public"."support_attachments" USING ((EXISTS ( SELECT 1
   FROM "public"."support_tickets" "st"
  WHERE (("st"."id" = "support_attachments"."ticket_id") AND (("st"."user_id" = "auth"."uid"()) OR "public"."user_has_role"("auth"."uid"(), 'admin'::"text") OR "public"."user_has_role"("auth"."uid"(), 'support'::"text"))))));



ALTER TABLE "public"."support_categories" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "support_categories_admin_all" ON "public"."support_categories" USING ("public"."user_has_role"("auth"."uid"(), 'admin'::"text"));



CREATE POLICY "support_categories_public_read" ON "public"."support_categories" FOR SELECT USING (("is_active" = true));



ALTER TABLE "public"."support_messages" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "support_messages_access" ON "public"."support_messages" USING ((EXISTS ( SELECT 1
   FROM "public"."support_tickets" "st"
  WHERE (("st"."id" = "support_messages"."ticket_id") AND (("st"."user_id" = "auth"."uid"()) OR "public"."user_has_role"("auth"."uid"(), 'admin'::"text") OR "public"."user_has_role"("auth"."uid"(), 'support'::"text"))))));



ALTER TABLE "public"."support_tickets" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "support_tickets_admin_delete" ON "public"."support_tickets" FOR DELETE USING (("public"."user_has_role"("auth"."uid"(), 'admin'::"text") OR "public"."user_has_role"("auth"."uid"(), 'support'::"text")));



CREATE POLICY "support_tickets_public_insert" ON "public"."support_tickets" FOR INSERT WITH CHECK (((("user_id" IS NULL) AND ("customer_email" IS NOT NULL) AND ("customer_name" IS NOT NULL)) OR ("user_id" = "auth"."uid"())));



CREATE POLICY "support_tickets_user_read" ON "public"."support_tickets" FOR SELECT USING ((("user_id" = "auth"."uid"()) OR "public"."user_has_role"("auth"."uid"(), 'admin'::"text") OR "public"."user_has_role"("auth"."uid"(), 'support'::"text")));



CREATE POLICY "support_tickets_user_update" ON "public"."support_tickets" FOR UPDATE USING (((("user_id" = "auth"."uid"()) AND ("user_id" IS NOT NULL)) OR "public"."user_has_role"("auth"."uid"(), 'admin'::"text") OR "public"."user_has_role"("auth"."uid"(), 'support'::"text")));



ALTER TABLE "public"."user_addresses" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_audit_log" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_insert_own_reservations" ON "public"."booking_reservations" FOR INSERT WITH CHECK (("auth"."uid"() = "customer_user_id"));



ALTER TABLE "public"."user_private_data" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_reputation" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_roles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_update_own_reservations" ON "public"."booking_reservations" FOR UPDATE USING (("auth"."uid"() = "customer_user_id")) WITH CHECK (("auth"."uid"() = "customer_user_id"));



CREATE POLICY "user_view_own_reservations" ON "public"."booking_reservations" FOR SELECT USING (("auth"."uid"() = "customer_user_id"));



ALTER TABLE "public"."variant_attribute_values" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "variant_attributes_delete_vendor" ON "public"."variant_attribute_values" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."product_variants" "pv"
     JOIN "public"."products" "p" ON (("pv"."product_id" = "p"."id")))
  WHERE (("pv"."id" = "variant_attribute_values"."variant_id") AND ((("p"."vendor_id" = "auth"."uid"()) AND "public"."user_has_role"("auth"."uid"(), 'vendor'::"text")) OR "public"."user_has_role"("auth"."uid"(), 'admin'::"text"))))));



CREATE POLICY "variant_attributes_insert_vendor" ON "public"."variant_attribute_values" FOR INSERT TO "authenticated" WITH CHECK (((EXISTS ( SELECT 1
   FROM ("public"."product_variants" "pv"
     JOIN "public"."products" "p" ON (("pv"."product_id" = "p"."id")))
  WHERE (("pv"."id" = "variant_attribute_values"."variant_id") AND ("p"."vendor_id" = "auth"."uid"())))) AND "public"."user_has_role"("auth"."uid"(), 'vendor'::"text")));



CREATE POLICY "variant_attributes_select_by_variant" ON "public"."variant_attribute_values" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."product_variants" "pv"
     JOIN "public"."products" "p" ON (("pv"."product_id" = "p"."id")))
  WHERE (("pv"."id" = "variant_attribute_values"."variant_id") AND (("pv"."is_active" = true) OR ("p"."vendor_id" = "auth"."uid"()) OR "public"."user_has_role"("auth"."uid"(), 'admin'::"text") OR "public"."user_has_role"("auth"."uid"(), 'support'::"text"))))));



CREATE POLICY "variant_attributes_update_vendor" ON "public"."variant_attribute_values" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."product_variants" "pv"
     JOIN "public"."products" "p" ON (("pv"."product_id" = "p"."id")))
  WHERE (("pv"."id" = "variant_attribute_values"."variant_id") AND ((("p"."vendor_id" = "auth"."uid"()) AND "public"."user_has_role"("auth"."uid"(), 'vendor'::"text")) OR "public"."user_has_role"("auth"."uid"(), 'admin'::"text"))))));



CREATE POLICY "variants_delete_vendor" ON "public"."product_variants" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."products" "p"
  WHERE (("p"."id" = "product_variants"."product_id") AND ((("p"."vendor_id" = "auth"."uid"()) AND "public"."user_has_role"("auth"."uid"(), 'vendor'::"text")) OR "public"."user_has_role"("auth"."uid"(), 'admin'::"text"))))));



CREATE POLICY "variants_insert_vendor" ON "public"."product_variants" FOR INSERT TO "authenticated" WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."products" "p"
  WHERE (("p"."id" = "product_variants"."product_id") AND ("p"."vendor_id" = "auth"."uid"())))) AND "public"."user_has_role"("auth"."uid"(), 'vendor'::"text")));



CREATE POLICY "variants_select_by_product" ON "public"."product_variants" FOR SELECT TO "authenticated" USING ((("is_active" = true) OR (EXISTS ( SELECT 1
   FROM "public"."products" "p"
  WHERE (("p"."id" = "product_variants"."product_id") AND (("p"."vendor_id" = "auth"."uid"()) OR "public"."user_has_role"("auth"."uid"(), 'admin'::"text") OR "public"."user_has_role"("auth"."uid"(), 'support'::"text")))))));



CREATE POLICY "variants_update_vendor" ON "public"."product_variants" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."products" "p"
  WHERE (("p"."id" = "product_variants"."product_id") AND ((("p"."vendor_id" = "auth"."uid"()) AND "public"."user_has_role"("auth"."uid"(), 'vendor'::"text")) OR "public"."user_has_role"("auth"."uid"(), 'admin'::"text"))))));



ALTER TABLE "public"."vendor_documents" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."vendor_profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "vendors_create_own_attribute_values" ON "public"."attribute_values" FOR INSERT WITH CHECK ((("vendor_id" = "auth"."uid"()) AND "public"."user_has_role"("auth"."uid"(), 'vendor'::"text")));



CREATE POLICY "vendors_create_own_attributes" ON "public"."product_attributes" FOR INSERT WITH CHECK ((("vendor_id" = "auth"."uid"()) AND "public"."user_has_role"("auth"."uid"(), 'vendor'::"text")));



CREATE POLICY "vendors_read_attribute_values" ON "public"."attribute_values" FOR SELECT USING ((("vendor_id" IS NULL) OR ("vendor_id" = "auth"."uid"()) OR "public"."user_has_role"("auth"."uid"(), 'admin'::"text")));



CREATE POLICY "vendors_read_attributes" ON "public"."product_attributes" FOR SELECT USING ((("vendor_id" IS NULL) OR ("vendor_id" = "auth"."uid"()) OR "public"."user_has_role"("auth"."uid"(), 'admin'::"text")));



CREATE POLICY "vendors_update_own_attribute_values" ON "public"."attribute_values" FOR UPDATE USING ((("vendor_id" = "auth"."uid"()) AND "public"."user_has_role"("auth"."uid"(), 'vendor'::"text")));



CREATE POLICY "vendors_update_own_attributes" ON "public"."product_attributes" FOR UPDATE USING ((("vendor_id" = "auth"."uid"()) AND "public"."user_has_role"("auth"."uid"(), 'vendor'::"text")));



ALTER TABLE "public"."webhook_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "webhook_events_admin_all" ON "public"."webhook_events" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."user_roles" "ur"
     JOIN "public"."roles" "r" ON (("r"."id" = "ur"."role_id")))
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("r"."name" = 'admin'::"text") AND ("ur"."is_active" = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."user_roles" "ur"
     JOIN "public"."roles" "r" ON (("r"."id" = "ur"."role_id")))
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("r"."name" = 'admin'::"text") AND ("ur"."is_active" = true)))));



COMMENT ON POLICY "webhook_events_admin_all" ON "public"."webhook_events" IS 'Admin-only access to webhook_events table. Critical for security audit trail.';





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






SET SESSION AUTHORIZATION "postgres";
RESET SESSION AUTHORIZATION;



GRANT USAGE ON SCHEMA "metrics" TO "authenticated";
GRANT USAGE ON SCHEMA "metrics" TO "anon";
GRANT USAGE ON SCHEMA "metrics" TO "service_role";






GRANT USAGE ON SCHEMA "private" TO "authenticated";



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";
GRANT USAGE ON SCHEMA "public" TO "supabase_auth_admin";







































GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "service_role";






























































































































































































































































































































































































































































































































































































































































































































REVOKE ALL ON FUNCTION "private"."enqueue_metrics_update"("p_day" "date", "p_vendor_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."enqueue_metrics_update"("p_day" "date", "p_vendor_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "private"."get_admin_dashboard_stats_v2_1"("p_user_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "private"."process_metrics_update_queue"("p_batch_size" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."process_metrics_update_queue"("p_batch_size" integer) TO "service_role";



GRANT ALL ON FUNCTION "private"."reconcile_metrics_last_48h"() TO "authenticated";



REVOKE ALL ON FUNCTION "private"."update_metrics_on_order_completion"("p_order_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."update_metrics_on_order_completion"("p_order_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "private"."update_platform_metrics_for_day"("p_day" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."update_platform_metrics_for_day"("p_day" "date") TO "service_role";



GRANT ALL ON FUNCTION "private"."update_product_trending_score"("p_product_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "private"."update_vendor_metrics_for_day"("p_day" "date", "p_vendor_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."update_vendor_metrics_for_day"("p_day" "date", "p_vendor_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."acquire_next_job"("p_worker_id" "text", "p_lock_timeout_seconds" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."acquire_next_job"("p_worker_id" "text", "p_lock_timeout_seconds" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."acquire_next_job"("p_worker_id" "text", "p_lock_timeout_seconds" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."activate_user"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."activate_user"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."activate_user"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."activate_vendor"("p_vendor_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."activate_vendor"("p_vendor_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."activate_vendor"("p_vendor_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."add_combo_to_cart_secure"("p_combo_id" "uuid", "p_user_id" "uuid", "p_guest_token" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."add_combo_to_cart_secure"("p_combo_id" "uuid", "p_user_id" "uuid", "p_guest_token" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."add_combo_to_cart_secure"("p_combo_id" "uuid", "p_user_id" "uuid", "p_guest_token" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."add_product_recommendation"("p_source_product_id" "uuid", "p_recommended_product_id" "uuid", "p_display_order" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."add_product_recommendation"("p_source_product_id" "uuid", "p_recommended_product_id" "uuid", "p_display_order" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."add_product_recommendation"("p_source_product_id" "uuid", "p_recommended_product_id" "uuid", "p_display_order" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."add_product_recommendation"("p_source_product_id" "uuid", "p_recommended_product_id" "uuid", "p_display_order" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."add_product_variant"("p_product_id" "uuid", "p_sku" character varying, "p_price" numeric, "p_compare_at_price" numeric, "p_cost_price" numeric, "p_quantity" integer, "p_attribute_value_ids" "uuid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."add_product_variant"("p_product_id" "uuid", "p_sku" character varying, "p_price" numeric, "p_compare_at_price" numeric, "p_cost_price" numeric, "p_quantity" integer, "p_attribute_value_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."add_product_variant"("p_product_id" "uuid", "p_sku" character varying, "p_price" numeric, "p_compare_at_price" numeric, "p_cost_price" numeric, "p_quantity" integer, "p_attribute_value_ids" "uuid"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."add_stylist_notes"("p_booking_id" "uuid", "p_notes" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."add_stylist_notes"("p_booking_id" "uuid", "p_notes" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."add_stylist_notes"("p_booking_id" "uuid", "p_notes" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."add_support_message"("p_ticket_id" "uuid", "p_message_text" "text", "p_is_internal" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."add_support_message"("p_ticket_id" "uuid", "p_message_text" "text", "p_is_internal" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."add_support_message"("p_ticket_id" "uuid", "p_message_text" "text", "p_is_internal" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."add_to_cart_secure"("p_variant_id" "uuid", "p_quantity" integer, "p_user_id" "uuid", "p_guest_token" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."add_to_cart_secure"("p_variant_id" "uuid", "p_quantity" integer, "p_user_id" "uuid", "p_guest_token" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."add_vendor_attribute"("p_name" character varying, "p_display_name" character varying, "p_attribute_type" character varying, "p_is_variant_defining" boolean, "p_values" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."add_vendor_attribute"("p_name" character varying, "p_display_name" character varying, "p_attribute_type" character varying, "p_is_variant_defining" boolean, "p_values" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."add_vendor_attribute"("p_name" character varying, "p_display_name" character varying, "p_attribute_type" character varying, "p_is_variant_defining" boolean, "p_values" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."admin_create_category"("p_name" "text", "p_slug" "text", "p_parent_id" "uuid", "p_description" "text", "p_image_url" "text", "p_sort_order" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."admin_create_category"("p_name" "text", "p_slug" "text", "p_parent_id" "uuid", "p_description" "text", "p_image_url" "text", "p_sort_order" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_create_category"("p_name" "text", "p_slug" "text", "p_parent_id" "uuid", "p_description" "text", "p_image_url" "text", "p_sort_order" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."admin_create_stylist_schedule"("p_stylist_id" "uuid", "p_schedules" "jsonb", "p_effective_from" "date", "p_effective_until" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."admin_create_stylist_schedule"("p_stylist_id" "uuid", "p_schedules" "jsonb", "p_effective_from" "date", "p_effective_until" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_create_stylist_schedule"("p_stylist_id" "uuid", "p_schedules" "jsonb", "p_effective_from" "date", "p_effective_until" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."admin_delete_category"("p_category_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."admin_delete_category"("p_category_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_delete_category"("p_category_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."admin_get_all_schedules"() TO "anon";
GRANT ALL ON FUNCTION "public"."admin_get_all_schedules"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_get_all_schedules"() TO "service_role";



GRANT ALL ON FUNCTION "public"."admin_list_categories"() TO "anon";
GRANT ALL ON FUNCTION "public"."admin_list_categories"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_list_categories"() TO "service_role";



GRANT ALL ON FUNCTION "public"."admin_update_category"("p_category_id" "uuid", "p_name" "text", "p_slug" "text", "p_parent_id" "uuid", "p_description" "text", "p_image_url" "text", "p_sort_order" integer, "p_is_active" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."admin_update_category"("p_category_id" "uuid", "p_name" "text", "p_slug" "text", "p_parent_id" "uuid", "p_description" "text", "p_image_url" "text", "p_sort_order" integer, "p_is_active" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_update_category"("p_category_id" "uuid", "p_name" "text", "p_slug" "text", "p_parent_id" "uuid", "p_description" "text", "p_image_url" "text", "p_sort_order" integer, "p_is_active" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."admin_update_stylist_schedule"("p_schedule_id" "uuid", "p_start_time" time without time zone, "p_end_time" time without time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."admin_update_stylist_schedule"("p_schedule_id" "uuid", "p_start_time" time without time zone, "p_end_time" time without time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_update_stylist_schedule"("p_schedule_id" "uuid", "p_start_time" time without time zone, "p_end_time" time without time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."algorithm_sign"("signables" "text", "secret" "text", "algorithm" "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."algorithm_sign"("signables" "text", "secret" "text", "algorithm" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."algorithm_sign"("signables" "text", "secret" "text", "algorithm" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."algorithm_sign"("signables" "text", "secret" "text", "algorithm" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."approve_payout_request"("p_request_id" "uuid", "p_payment_reference" "text", "p_payment_proof_url" "text", "p_admin_notes" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."approve_payout_request"("p_request_id" "uuid", "p_payment_reference" "text", "p_payment_proof_url" "text", "p_admin_notes" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."approve_payout_request"("p_request_id" "uuid", "p_payment_reference" "text", "p_payment_proof_url" "text", "p_admin_notes" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."approve_vendor"("p_vendor_id" "uuid", "p_notes" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."approve_vendor"("p_vendor_id" "uuid", "p_notes" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."approve_vendor"("p_vendor_id" "uuid", "p_notes" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."approve_vendor_enhanced"("p_vendor_id" "uuid", "p_notes" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."approve_vendor_enhanced"("p_vendor_id" "uuid", "p_notes" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."approve_vendor_enhanced"("p_vendor_id" "uuid", "p_notes" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."assert_admin_or_support"() TO "anon";
GRANT ALL ON FUNCTION "public"."assert_admin_or_support"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."assert_admin_or_support"() TO "service_role";



GRANT ALL ON FUNCTION "public"."assign_user_role"("p_user_id" "uuid", "p_role_name" "text", "p_expires_at" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."assign_user_role"("p_user_id" "uuid", "p_role_name" "text", "p_expires_at" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."assign_user_role"("p_user_id" "uuid", "p_role_name" "text", "p_expires_at" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."auto_complete_past_bookings"() TO "anon";
GRANT ALL ON FUNCTION "public"."auto_complete_past_bookings"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."auto_complete_past_bookings"() TO "service_role";



GRANT ALL ON FUNCTION "public"."calculate_vendor_pending_payout"("p_vendor_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."calculate_vendor_pending_payout"("p_vendor_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."calculate_vendor_pending_payout"("p_vendor_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."can_rate_booking"("p_booking_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_rate_booking"("p_booking_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_rate_booking"("p_booking_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."can_send_optional_email"("p_user_id" "uuid", "p_email_type" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."can_send_optional_email"("p_user_id" "uuid", "p_email_type" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_send_optional_email"("p_user_id" "uuid", "p_email_type" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."cancel_booking"("p_booking_id" "uuid", "p_cancelled_by" "uuid", "p_reason" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."cancel_booking"("p_booking_id" "uuid", "p_cancelled_by" "uuid", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cancel_booking"("p_booking_id" "uuid", "p_cancelled_by" "uuid", "p_reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."cast_review_vote"("p_review_id" "uuid", "p_vote_type" "text", "p_ip_address" "inet", "p_user_agent_hash" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cast_review_vote"("p_review_id" "uuid", "p_vote_type" "text", "p_ip_address" "inet", "p_user_agent_hash" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cast_review_vote"("p_review_id" "uuid", "p_vote_type" "text", "p_ip_address" "inet", "p_user_agent_hash" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."check_slot_availability"("p_stylist_id" "uuid", "p_start_time" timestamp with time zone, "p_end_time" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."check_slot_availability"("p_stylist_id" "uuid", "p_start_time" timestamp with time zone, "p_end_time" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_slot_availability"("p_stylist_id" "uuid", "p_start_time" timestamp with time zone, "p_end_time" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."cleanup_expired_email_logs"() TO "anon";
GRANT ALL ON FUNCTION "public"."cleanup_expired_email_logs"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_expired_email_logs"() TO "service_role";



GRANT ALL ON FUNCTION "public"."cleanup_expired_reservations"() TO "anon";
GRANT ALL ON FUNCTION "public"."cleanup_expired_reservations"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_expired_reservations"() TO "service_role";



GRANT ALL ON FUNCTION "public"."cleanup_stale_locks"() TO "anon";
GRANT ALL ON FUNCTION "public"."cleanup_stale_locks"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_stale_locks"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."clear_cart_secure"("p_user_id" "uuid", "p_guest_token" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."clear_cart_secure"("p_user_id" "uuid", "p_guest_token" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."complete_stylist_promotion"("p_promotion_id" "uuid", "p_admin_id" "uuid", "p_profile_data" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."complete_stylist_promotion"("p_promotion_id" "uuid", "p_admin_id" "uuid", "p_profile_data" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."complete_stylist_promotion"("p_promotion_id" "uuid", "p_admin_id" "uuid", "p_profile_data" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."confirm_booking_reservation"("p_reservation_id" "uuid", "p_payment_intent_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."confirm_booking_reservation"("p_reservation_id" "uuid", "p_payment_intent_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."confirm_booking_reservation"("p_reservation_id" "uuid", "p_payment_intent_id" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."convert_user_cart_to_guest"("p_user_id" "uuid", "p_new_guest_token" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."convert_user_cart_to_guest"("p_user_id" "uuid", "p_new_guest_token" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."convert_user_cart_to_guest"("p_user_id" "uuid", "p_new_guest_token" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."convert_user_cart_to_guest"("p_user_id" "uuid", "p_new_guest_token" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_booking"("p_customer_id" "uuid", "p_stylist_id" "uuid", "p_service_id" "uuid", "p_start_time" timestamp with time zone, "p_customer_name" "text", "p_customer_phone" "text", "p_customer_email" "text", "p_customer_notes" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_booking"("p_customer_id" "uuid", "p_stylist_id" "uuid", "p_service_id" "uuid", "p_start_time" timestamp with time zone, "p_customer_name" "text", "p_customer_phone" "text", "p_customer_email" "text", "p_customer_notes" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_booking"("p_customer_id" "uuid", "p_stylist_id" "uuid", "p_service_id" "uuid", "p_start_time" timestamp with time zone, "p_customer_name" "text", "p_customer_phone" "text", "p_customer_email" "text", "p_customer_notes" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_booking_reservation"("p_customer_id" "uuid", "p_stylist_id" "uuid", "p_service_id" "uuid", "p_start_time" timestamp with time zone, "p_customer_name" "text", "p_customer_phone" "text", "p_customer_email" "text", "p_customer_address_line1" "text", "p_customer_city" "text", "p_customer_state" "text", "p_customer_postal_code" "text", "p_customer_country" "text", "p_customer_notes" "text", "p_ttl_minutes" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."create_booking_reservation"("p_customer_id" "uuid", "p_stylist_id" "uuid", "p_service_id" "uuid", "p_start_time" timestamp with time zone, "p_customer_name" "text", "p_customer_phone" "text", "p_customer_email" "text", "p_customer_address_line1" "text", "p_customer_city" "text", "p_customer_state" "text", "p_customer_postal_code" "text", "p_customer_country" "text", "p_customer_notes" "text", "p_ttl_minutes" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_booking_reservation"("p_customer_id" "uuid", "p_stylist_id" "uuid", "p_service_id" "uuid", "p_start_time" timestamp with time zone, "p_customer_name" "text", "p_customer_phone" "text", "p_customer_email" "text", "p_customer_address_line1" "text", "p_customer_city" "text", "p_customer_state" "text", "p_customer_postal_code" "text", "p_customer_country" "text", "p_customer_notes" "text", "p_ttl_minutes" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."create_combo_product"("p_name" "text", "p_description" "text", "p_category_id" "uuid", "p_combo_price_cents" integer, "p_constituent_items" "jsonb", "p_quantity_limit" integer, "p_images" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."create_combo_product"("p_name" "text", "p_description" "text", "p_category_id" "uuid", "p_combo_price_cents" integer, "p_constituent_items" "jsonb", "p_quantity_limit" integer, "p_images" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_combo_product"("p_name" "text", "p_description" "text", "p_category_id" "uuid", "p_combo_price_cents" integer, "p_constituent_items" "jsonb", "p_quantity_limit" integer, "p_images" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_default_email_preferences"() TO "anon";
GRANT ALL ON FUNCTION "public"."create_default_email_preferences"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_default_email_preferences"() TO "service_role";



GRANT ALL ON FUNCTION "public"."create_support_ticket"("p_category_id" "uuid", "p_subject" "text", "p_message_text" "text", "p_priority" "text", "p_order_reference" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_support_ticket"("p_category_id" "uuid", "p_subject" "text", "p_message_text" "text", "p_priority" "text", "p_order_reference" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_support_ticket"("p_category_id" "uuid", "p_subject" "text", "p_message_text" "text", "p_priority" "text", "p_order_reference" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_support_ticket"("p_category_id" "uuid", "p_subject" "text", "p_message_text" "text", "p_priority" "text", "p_order_reference" "text", "p_customer_email" "text", "p_customer_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_support_ticket"("p_category_id" "uuid", "p_subject" "text", "p_message_text" "text", "p_priority" "text", "p_order_reference" "text", "p_customer_email" "text", "p_customer_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_support_ticket"("p_category_id" "uuid", "p_subject" "text", "p_message_text" "text", "p_priority" "text", "p_order_reference" "text", "p_customer_email" "text", "p_customer_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_vendor_product"("p_product_data" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."create_vendor_product"("p_product_data" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_vendor_product"("p_product_data" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."custom_access_token_hook"("event" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."custom_access_token_hook"("event" "jsonb") TO "service_role";
GRANT ALL ON FUNCTION "public"."custom_access_token_hook"("event" "jsonb") TO "supabase_auth_admin";



GRANT ALL ON FUNCTION "public"."debug_cart_state"("p_user_id" "uuid", "p_guest_token" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."debug_cart_state"("p_user_id" "uuid", "p_guest_token" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."debug_cart_state"("p_user_id" "uuid", "p_guest_token" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."debug_review_fetch"("p_product_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."debug_review_fetch"("p_product_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."debug_review_fetch"("p_product_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."decrypt_bank_account"("p_vendor_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."decrypt_bank_account"("p_vendor_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."decrypt_bank_account"("p_vendor_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."delete_vendor_attribute"("p_attribute_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."delete_vendor_attribute"("p_attribute_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_vendor_attribute"("p_attribute_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."delete_vendor_product"("p_product_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."delete_vendor_product"("p_product_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_vendor_product"("p_product_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_guest_token"() TO "anon";
GRANT ALL ON FUNCTION "public"."generate_guest_token"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_guest_token"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_active_combos"("p_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_active_combos"("p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_active_combos"("p_limit" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_admin_dashboard_stats_v2_1"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_admin_dashboard_stats_v2_1"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_admin_dashboard_stats_v2_1"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_admin_dashboard_stats_v2_1"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_admin_payout_requests"("p_status" "text", "p_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_admin_payout_requests"("p_status" "text", "p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_admin_payout_requests"("p_status" "text", "p_limit" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_admin_support_tickets"("p_status" "text", "p_priority" "text", "p_assigned_to" "uuid", "p_category_id" "uuid", "p_search" "text", "p_limit" integer, "p_offset" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_admin_support_tickets"("p_status" "text", "p_priority" "text", "p_assigned_to" "uuid", "p_category_id" "uuid", "p_search" "text", "p_limit" integer, "p_offset" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_admin_support_tickets"("p_status" "text", "p_priority" "text", "p_assigned_to" "uuid", "p_category_id" "uuid", "p_search" "text", "p_limit" integer, "p_offset" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_admin_users_list"("p_page" integer, "p_per_page" integer, "p_search" "text", "p_role_filter" "text", "p_status_filter" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_admin_users_list"("p_page" integer, "p_per_page" integer, "p_search" "text", "p_role_filter" "text", "p_status_filter" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_admin_users_list"("p_page" integer, "p_per_page" integer, "p_search" "text", "p_role_filter" "text", "p_status_filter" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_admin_vendors_list"("p_page" integer, "p_per_page" integer, "p_search" "text", "p_status_filter" "text", "p_business_type_filter" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_admin_vendors_list"("p_page" integer, "p_per_page" integer, "p_search" "text", "p_status_filter" "text", "p_business_type_filter" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_admin_vendors_list"("p_page" integer, "p_per_page" integer, "p_search" "text", "p_status_filter" "text", "p_business_type_filter" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_audit_logs"("p_requesting_user_id" "uuid", "p_category" "text", "p_severity" "text", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone, "p_limit" integer, "p_offset" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_audit_logs"("p_requesting_user_id" "uuid", "p_category" "text", "p_severity" "text", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone, "p_limit" integer, "p_offset" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_audit_logs"("p_requesting_user_id" "uuid", "p_category" "text", "p_severity" "text", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone, "p_limit" integer, "p_offset" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_available_slots"("p_stylist_id" "uuid", "p_service_id" "uuid", "p_target_date" "date", "p_customer_timezone" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_available_slots"("p_stylist_id" "uuid", "p_service_id" "uuid", "p_target_date" "date", "p_customer_timezone" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_available_slots"("p_stylist_id" "uuid", "p_service_id" "uuid", "p_target_date" "date", "p_customer_timezone" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_available_slots_v2"("p_stylist_id" "uuid", "p_service_id" "uuid", "p_target_date" "date", "p_customer_timezone" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_available_slots_v2"("p_stylist_id" "uuid", "p_service_id" "uuid", "p_target_date" "date", "p_customer_timezone" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_available_slots_v2"("p_stylist_id" "uuid", "p_service_id" "uuid", "p_target_date" "date", "p_customer_timezone" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_cart_details_secure"("p_user_id" "uuid", "p_guest_token" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_cart_details_secure"("p_user_id" "uuid", "p_guest_token" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_combo_availability"("p_combo_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_combo_availability"("p_combo_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_combo_availability"("p_combo_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_customer_safety_details"("p_stylist_id" "uuid", "p_booking_id" "uuid", "p_reason" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_customer_safety_details"("p_stylist_id" "uuid", "p_booking_id" "uuid", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_customer_safety_details"("p_stylist_id" "uuid", "p_booking_id" "uuid", "p_reason" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_effective_schedule"("p_stylist_id" "uuid", "p_target_date" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."get_effective_schedule"("p_stylist_id" "uuid", "p_target_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_effective_schedule"("p_stylist_id" "uuid", "p_target_date" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_featured_brands"("p_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_featured_brands"("p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_featured_brands"("p_limit" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_featured_stylists"("p_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_featured_stylists"("p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_featured_stylists"("p_limit" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_guest_token_secure"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_guest_token_secure"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_guest_token_secure"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_or_create_cart_secure"("p_user_id" "uuid", "p_guest_token" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_or_create_cart_secure"("p_user_id" "uuid", "p_guest_token" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_order_items_with_vendor"("p_order_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_order_items_with_vendor"("p_order_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_order_items_with_vendor"("p_order_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_product_recommendations"("p_source_product_id" "uuid", "p_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_product_recommendations"("p_source_product_id" "uuid", "p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_product_recommendations"("p_source_product_id" "uuid", "p_limit" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_product_with_variants"("product_slug" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_product_with_variants"("product_slug" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_product_with_variants"("product_slug" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_promotion_by_user"("p_user_id" "uuid", "p_admin_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_promotion_by_user"("p_user_id" "uuid", "p_admin_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_promotion_by_user"("p_user_id" "uuid", "p_admin_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_review_vote_counts"("p_review_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_review_vote_counts"("p_review_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_review_vote_counts"("p_review_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_service_duration"("p_stylist_id" "uuid", "p_service_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_service_duration"("p_stylist_id" "uuid", "p_service_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_service_duration"("p_stylist_id" "uuid", "p_service_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_service_price"("p_stylist_id" "uuid", "p_service_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_service_price"("p_stylist_id" "uuid", "p_service_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_service_price"("p_stylist_id" "uuid", "p_service_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_stylist_bookings"("p_stylist_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."get_stylist_bookings"("p_stylist_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_stylist_bookings"("p_stylist_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_stylist_bookings_with_history"("p_stylist_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."get_stylist_bookings_with_history"("p_stylist_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_stylist_bookings_with_history"("p_stylist_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_stylist_ratings"("p_stylist_user_id" "uuid", "p_limit" integer, "p_offset" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_stylist_ratings"("p_stylist_user_id" "uuid", "p_limit" integer, "p_offset" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_stylist_ratings"("p_stylist_user_id" "uuid", "p_limit" integer, "p_offset" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_stylist_schedule"("p_stylist_id" "uuid", "p_start_date" "date", "p_end_date" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."get_stylist_schedule"("p_stylist_id" "uuid", "p_start_date" "date", "p_end_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_stylist_schedule"("p_stylist_id" "uuid", "p_start_date" "date", "p_end_date" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_stylist_specialties"("p_stylist_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_stylist_specialties"("p_stylist_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_stylist_specialties"("p_stylist_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_support_ticket_details"("p_ticket_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_support_ticket_details"("p_ticket_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_support_ticket_details"("p_ticket_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_top_stylists"("p_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_top_stylists"("p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_top_stylists"("p_limit" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_trending_products"("p_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_trending_products"("p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_trending_products"("p_limit" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_support_tickets"("p_limit" integer, "p_offset" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_support_tickets"("p_limit" integer, "p_offset" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_support_tickets"("p_limit" integer, "p_offset" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_vendor_dashboard_stats_v2_1"("v_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_vendor_dashboard_stats_v2_1"("v_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_vendor_dashboard_stats_v2_1"("v_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_vendor_documents_for_review"("p_vendor_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_vendor_documents_for_review"("p_vendor_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_vendor_documents_for_review"("p_vendor_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_vendor_payment_methods"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_vendor_payment_methods"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_vendor_payment_methods"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_vendor_payouts"("p_vendor_id" "uuid", "p_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_vendor_payouts"("p_vendor_id" "uuid", "p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_vendor_payouts"("p_vendor_id" "uuid", "p_limit" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_vendor_products_list"("p_vendor_id" "uuid", "p_page" integer, "p_per_page" integer, "p_search" "text", "p_is_active" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."get_vendor_products_list"("p_vendor_id" "uuid", "p_page" integer, "p_per_page" integer, "p_search" "text", "p_is_active" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_vendor_products_list"("p_vendor_id" "uuid", "p_page" integer, "p_per_page" integer, "p_search" "text", "p_is_active" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_vote_shard"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_vote_shard"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_vote_shard"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "supabase_auth_admin";



GRANT ALL ON FUNCTION "public"."handle_order_item_cancellation"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_order_item_cancellation"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_order_item_cancellation"() TO "service_role";



GRANT ALL ON FUNCTION "public"."hmac"("data" "text", "key" "text", "algorithm" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."hmac"("data" "text", "key" "text", "algorithm" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hmac"("data" "text", "key" "text", "algorithm" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."increment_combo_sold"("p_combo_id" "uuid", "p_quantity" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."increment_combo_sold"("p_combo_id" "uuid", "p_quantity" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_combo_sold"("p_combo_id" "uuid", "p_quantity" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."increment_user_role_version"() TO "anon";
GRANT ALL ON FUNCTION "public"."increment_user_role_version"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_user_role_version"() TO "service_role";



GRANT ALL ON FUNCTION "public"."initialize_review_vote_shards"() TO "anon";
GRANT ALL ON FUNCTION "public"."initialize_review_vote_shards"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."initialize_review_vote_shards"() TO "service_role";



GRANT ALL ON FUNCTION "public"."initiate_stylist_promotion"("p_user_id" "uuid", "p_admin_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."initiate_stylist_promotion"("p_user_id" "uuid", "p_admin_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."initiate_stylist_promotion"("p_user_id" "uuid", "p_admin_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."merge_carts_secure"("p_user_id" "uuid", "p_guest_token" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."merge_carts_secure"("p_user_id" "uuid", "p_guest_token" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."notify_product_change"() TO "anon";
GRANT ALL ON FUNCTION "public"."notify_product_change"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_product_change"() TO "service_role";



GRANT ALL ON FUNCTION "public"."prevent_booking_inactive_stylist"() TO "anon";
GRANT ALL ON FUNCTION "public"."prevent_booking_inactive_stylist"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."prevent_booking_inactive_stylist"() TO "service_role";



GRANT ALL ON FUNCTION "public"."process_order_with_occ"("p_payment_intent_id" "text", "p_webhook_event_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."process_order_with_occ"("p_payment_intent_id" "text", "p_webhook_event_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."process_order_with_occ"("p_payment_intent_id" "text", "p_webhook_event_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."process_rating_update_job"("p_job_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."process_rating_update_job"("p_job_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."reactivate_vendor"("p_vendor_id" "uuid", "p_notes" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."reactivate_vendor"("p_vendor_id" "uuid", "p_notes" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."reactivate_vendor"("p_vendor_id" "uuid", "p_notes" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."reconcile_review_vote_counts"("p_review_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reconcile_review_vote_counts"("p_review_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."refresh_user_jwt_claims"("user_uuid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."refresh_user_jwt_claims"("user_uuid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."refresh_user_jwt_claims"("user_uuid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."reject_payout_request"("p_request_id" "uuid", "p_rejection_reason" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."reject_payout_request"("p_request_id" "uuid", "p_rejection_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."reject_payout_request"("p_request_id" "uuid", "p_rejection_reason" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."reject_vendor"("p_vendor_id" "uuid", "p_reason" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."reject_vendor"("p_vendor_id" "uuid", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."reject_vendor"("p_vendor_id" "uuid", "p_reason" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."reject_vendor_document"("p_document_id" "uuid", "p_reason" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."reject_vendor_document"("p_document_id" "uuid", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."reject_vendor_document"("p_document_id" "uuid", "p_reason" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."reject_vendor_enhanced"("p_vendor_id" "uuid", "p_reason" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."reject_vendor_enhanced"("p_vendor_id" "uuid", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."reject_vendor_enhanced"("p_vendor_id" "uuid", "p_reason" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."release_inventory_reservation"("p_payment_intent_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."release_inventory_reservation"("p_payment_intent_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."release_inventory_reservation"("p_payment_intent_id" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."remove_cart_item_by_id_secure"("p_cart_item_id" "uuid", "p_user_id" "uuid", "p_guest_token" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."remove_cart_item_by_id_secure"("p_cart_item_id" "uuid", "p_user_id" "uuid", "p_guest_token" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."remove_cart_item_by_id_secure"("p_cart_item_id" "uuid", "p_user_id" "uuid", "p_guest_token" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."remove_combo_from_cart_secure"("p_combo_group_id" "uuid", "p_user_id" "uuid", "p_guest_token" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."remove_combo_from_cart_secure"("p_combo_group_id" "uuid", "p_user_id" "uuid", "p_guest_token" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."remove_combo_from_cart_secure"("p_combo_group_id" "uuid", "p_user_id" "uuid", "p_guest_token" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."remove_item_secure"("p_variant_id" "uuid", "p_user_id" "uuid", "p_guest_token" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."remove_item_secure"("p_variant_id" "uuid", "p_user_id" "uuid", "p_guest_token" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."request_availability_override"("p_stylist_id" "uuid", "p_target_date" "date", "p_is_closed" boolean, "p_reason" "text", "p_is_emergency" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."request_availability_override"("p_stylist_id" "uuid", "p_target_date" "date", "p_is_closed" boolean, "p_reason" "text", "p_is_emergency" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."request_availability_override"("p_stylist_id" "uuid", "p_target_date" "date", "p_is_closed" boolean, "p_reason" "text", "p_is_emergency" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."request_payout"("p_amount_cents" bigint, "p_payment_method" "text", "p_payment_details" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."request_payout"("p_amount_cents" bigint, "p_payment_method" "text", "p_payment_details" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."request_payout"("p_amount_cents" bigint, "p_payment_method" "text", "p_payment_details" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."request_vendor_info"("p_vendor_id" "uuid", "p_requested_info" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."request_vendor_info"("p_vendor_id" "uuid", "p_requested_info" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."request_vendor_info"("p_vendor_id" "uuid", "p_requested_info" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."requeue_stale_jobs"() TO "anon";
GRANT ALL ON FUNCTION "public"."requeue_stale_jobs"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."requeue_stale_jobs"() TO "service_role";



GRANT ALL ON FUNCTION "public"."reserve_inventory_for_payment"("p_cart_id" "uuid", "p_payment_intent_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."reserve_inventory_for_payment"("p_cart_id" "uuid", "p_payment_intent_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."reserve_inventory_for_payment"("p_cart_id" "uuid", "p_payment_intent_id" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."revoke_user_role"("p_user_id" "uuid", "p_role_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."revoke_user_role"("p_user_id" "uuid", "p_role_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."revoke_user_role"("p_user_id" "uuid", "p_role_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."save_stylist_services"("p_stylist_user_id" "uuid", "p_service_ids" "uuid"[], "p_admin_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."save_stylist_services"("p_stylist_user_id" "uuid", "p_service_ids" "uuid"[], "p_admin_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."save_stylist_services"("p_stylist_user_id" "uuid", "p_service_ids" "uuid"[], "p_admin_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "postgres";
GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "anon";
GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."should_request_review"("p_order_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."should_request_review"("p_order_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."should_request_review"("p_order_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."show_limit"() TO "postgres";
GRANT ALL ON FUNCTION "public"."show_limit"() TO "anon";
GRANT ALL ON FUNCTION "public"."show_limit"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."show_limit"() TO "service_role";



GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."sign"("payload" json, "secret" "text", "algorithm" "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."sign"("payload" json, "secret" "text", "algorithm" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."sign"("payload" json, "secret" "text", "algorithm" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sign"("payload" json, "secret" "text", "algorithm" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."submit_rating_atomic"("p_booking_id" "uuid", "p_rating" integer, "p_review_text" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."submit_rating_atomic"("p_booking_id" "uuid", "p_rating" integer, "p_review_text" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."submit_rating_atomic"("p_booking_id" "uuid", "p_rating" integer, "p_review_text" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."submit_review_secure"("p_product_id" "uuid", "p_order_id" "uuid", "p_rating" integer, "p_title" "text", "p_comment" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."submit_review_secure"("p_product_id" "uuid", "p_order_id" "uuid", "p_rating" integer, "p_title" "text", "p_comment" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."submit_review_secure"("p_product_id" "uuid", "p_order_id" "uuid", "p_rating" integer, "p_title" "text", "p_comment" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."submit_vendor_application_secure"("p_user_id" "uuid", "p_application_data" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."submit_vendor_application_secure"("p_user_id" "uuid", "p_application_data" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."submit_vendor_application_secure"("p_user_id" "uuid", "p_application_data" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."submit_vendor_reply_secure"("p_review_id" "uuid", "p_comment" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."submit_vendor_reply_secure"("p_review_id" "uuid", "p_comment" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."submit_vendor_reply_secure"("p_review_id" "uuid", "p_comment" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."suspend_user"("p_user_id" "uuid", "p_duration_days" integer, "p_reason" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."suspend_user"("p_user_id" "uuid", "p_duration_days" integer, "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."suspend_user"("p_user_id" "uuid", "p_duration_days" integer, "p_reason" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."suspend_vendor"("p_vendor_id" "uuid", "p_reason" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."suspend_vendor"("p_vendor_id" "uuid", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."suspend_vendor"("p_vendor_id" "uuid", "p_reason" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_order_payment_method"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_order_payment_method"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_order_payment_method"() TO "service_role";



GRANT ALL ON FUNCTION "public"."test_postgrest_client_query"("p_product_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."test_postgrest_client_query"("p_product_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."test_postgrest_client_query"("p_product_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."test_postgrest_review_query"("p_product_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."test_postgrest_review_query"("p_product_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."test_postgrest_review_query"("p_product_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."toggle_brand_featured"("p_brand_id" "uuid", "p_is_featured" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."toggle_brand_featured"("p_brand_id" "uuid", "p_is_featured" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."toggle_brand_featured"("p_brand_id" "uuid", "p_is_featured" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."toggle_brand_featured"("p_brand_id" "uuid", "p_is_featured" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."toggle_product_active"("p_product_id" "uuid", "p_is_active" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."toggle_product_active"("p_product_id" "uuid", "p_is_active" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."toggle_product_active"("p_product_id" "uuid", "p_is_active" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."toggle_stylist_active"("p_user_id" "uuid", "p_is_active" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."toggle_stylist_active"("p_user_id" "uuid", "p_is_active" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."toggle_stylist_active"("p_user_id" "uuid", "p_is_active" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."toggle_stylist_featured"("p_user_id" "uuid", "p_is_featured" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."toggle_stylist_featured"("p_user_id" "uuid", "p_is_featured" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."toggle_stylist_featured"("p_user_id" "uuid", "p_is_featured" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."toggle_stylist_featured"("p_user_id" "uuid", "p_is_featured" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."trigger_order_worker"() TO "anon";
GRANT ALL ON FUNCTION "public"."trigger_order_worker"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trigger_order_worker"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trigger_refresh_jwt_on_role_change"() TO "anon";
GRANT ALL ON FUNCTION "public"."trigger_refresh_jwt_on_role_change"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trigger_refresh_jwt_on_role_change"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trigger_user_onboarding"() TO "anon";
GRANT ALL ON FUNCTION "public"."trigger_user_onboarding"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trigger_user_onboarding"() TO "service_role";



GRANT ALL ON FUNCTION "public"."try_cast_double"("inp" "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."try_cast_double"("inp" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."try_cast_double"("inp" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."try_cast_double"("inp" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."unvote_review"("p_review_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."unvote_review"("p_review_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."unvote_review"("p_review_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_booking_reservation"("p_reservation_id" "uuid", "p_customer_id" "uuid", "p_service_id" "uuid", "p_start_time" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."update_booking_reservation"("p_reservation_id" "uuid", "p_customer_id" "uuid", "p_service_id" "uuid", "p_start_time" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_booking_reservation"("p_reservation_id" "uuid", "p_customer_id" "uuid", "p_service_id" "uuid", "p_start_time" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."update_booking_status"("p_booking_id" "uuid", "p_new_status" "text", "p_reason" "text", "p_actor_role" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."update_booking_status"("p_booking_id" "uuid", "p_new_status" "text", "p_reason" "text", "p_actor_role" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_booking_status"("p_booking_id" "uuid", "p_new_status" "text", "p_reason" "text", "p_actor_role" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_cart_item_secure"("p_variant_id" "uuid", "p_quantity" integer, "p_user_id" "uuid", "p_guest_token" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_cart_item_secure"("p_variant_id" "uuid", "p_quantity" integer, "p_user_id" "uuid", "p_guest_token" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_combo_quantity_secure"("p_combo_group_id" "uuid", "p_new_quantity" integer, "p_user_id" "uuid", "p_guest_token" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."update_combo_quantity_secure"("p_combo_group_id" "uuid", "p_new_quantity" integer, "p_user_id" "uuid", "p_guest_token" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_combo_quantity_secure"("p_combo_group_id" "uuid", "p_new_quantity" integer, "p_user_id" "uuid", "p_guest_token" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_fulfillment_status"("p_order_item_id" "uuid", "p_new_status" "text", "p_tracking_number" "text", "p_shipping_carrier" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."update_fulfillment_status"("p_order_item_id" "uuid", "p_new_status" "text", "p_tracking_number" "text", "p_shipping_carrier" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_fulfillment_status"("p_order_item_id" "uuid", "p_new_status" "text", "p_tracking_number" "text", "p_shipping_carrier" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_inventory_quantity"("p_variant_id" "uuid", "p_quantity_change" integer, "p_movement_type" character varying, "p_notes" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."update_inventory_quantity"("p_variant_id" "uuid", "p_quantity_change" integer, "p_movement_type" character varying, "p_notes" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_inventory_quantity"("p_variant_id" "uuid", "p_quantity_change" integer, "p_movement_type" character varying, "p_notes" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_job_status"("p_job_id" "uuid", "p_success" boolean, "p_message" "text", "p_should_retry" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."update_job_status"("p_job_id" "uuid", "p_success" boolean, "p_message" "text", "p_should_retry" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_job_status"("p_job_id" "uuid", "p_success" boolean, "p_message" "text", "p_should_retry" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."update_order_status_on_item_change"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_order_status_on_item_change"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_order_status_on_item_change"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_product_rating_stats"("p_product_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_product_rating_stats"("p_product_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_product_stats_on_review_change"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_product_stats_on_review_change"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_product_stats_on_review_change"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_product_variant"("p_variant_id" "uuid", "p_sku" character varying, "p_price" numeric, "p_compare_at_price" numeric, "p_cost_price" numeric, "p_is_active" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."update_product_variant"("p_variant_id" "uuid", "p_sku" character varying, "p_price" numeric, "p_compare_at_price" numeric, "p_cost_price" numeric, "p_is_active" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_product_variant"("p_variant_id" "uuid", "p_sku" character varying, "p_price" numeric, "p_compare_at_price" numeric, "p_cost_price" numeric, "p_is_active" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."update_promotion_checks"("p_promotion_id" "uuid", "p_check_type" "text", "p_status" "text", "p_admin_id" "uuid", "p_note" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."update_promotion_checks"("p_promotion_id" "uuid", "p_check_type" "text", "p_status" "text", "p_admin_id" "uuid", "p_note" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_promotion_checks"("p_promotion_id" "uuid", "p_check_type" "text", "p_status" "text", "p_admin_id" "uuid", "p_note" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_stylist_rating_average"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_stylist_rating_average"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_stylist_rating_average"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_support_ticket"("p_ticket_id" "uuid", "p_status" "text", "p_priority" "text", "p_assigned_to" "uuid", "p_internal_note" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."update_support_ticket"("p_ticket_id" "uuid", "p_status" "text", "p_priority" "text", "p_assigned_to" "uuid", "p_internal_note" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_support_ticket"("p_ticket_id" "uuid", "p_status" "text", "p_priority" "text", "p_assigned_to" "uuid", "p_internal_note" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_ticket_status_timestamps"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_ticket_status_timestamps"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_ticket_status_timestamps"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_ticket_timestamp"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_ticket_timestamp"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_ticket_timestamp"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_trust_engine_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_trust_engine_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_trust_engine_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_vendor_commission"("p_vendor_id" "uuid", "p_commission_rate" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."update_vendor_commission"("p_vendor_id" "uuid", "p_commission_rate" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_vendor_commission"("p_vendor_id" "uuid", "p_commission_rate" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."update_vendor_payment_methods"("p_bank_account_name" "text", "p_bank_account_number" "text", "p_bank_name" "text", "p_bank_branch" "text", "p_esewa_number" "text", "p_khalti_number" "text", "p_tax_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."update_vendor_payment_methods"("p_bank_account_name" "text", "p_bank_account_number" "text", "p_bank_name" "text", "p_bank_branch" "text", "p_esewa_number" "text", "p_khalti_number" "text", "p_tax_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_vendor_payment_methods"("p_bank_account_name" "text", "p_bank_account_number" "text", "p_bank_name" "text", "p_bank_branch" "text", "p_esewa_number" "text", "p_khalti_number" "text", "p_tax_id" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_vendor_product"("p_product_id" "uuid", "p_product_data" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."update_vendor_product"("p_product_id" "uuid", "p_product_data" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_vendor_product"("p_product_id" "uuid", "p_product_data" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_vendor_product"("p_product_id" "uuid", "p_name" character varying, "p_description" "text", "p_short_description" "text", "p_material" "text", "p_care_instructions" "text", "p_is_active" boolean, "p_is_featured" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."update_vendor_product"("p_product_id" "uuid", "p_name" character varying, "p_description" "text", "p_short_description" "text", "p_material" "text", "p_care_instructions" "text", "p_is_active" boolean, "p_is_featured" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_vendor_product"("p_product_id" "uuid", "p_name" character varying, "p_description" "text", "p_short_description" "text", "p_material" "text", "p_care_instructions" "text", "p_is_active" boolean, "p_is_featured" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."update_vendor_product_simple"("p_product_id" "uuid", "p_name" character varying, "p_description" "text", "p_category_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."update_vendor_product_simple"("p_product_id" "uuid", "p_name" character varying, "p_description" "text", "p_category_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_vendor_product_simple"("p_product_id" "uuid", "p_name" character varying, "p_description" "text", "p_category_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."url_decode"("data" "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."url_decode"("data" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."url_decode"("data" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."url_decode"("data" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."url_encode"("data" "bytea") TO "postgres";
GRANT ALL ON FUNCTION "public"."url_encode"("data" "bytea") TO "anon";
GRANT ALL ON FUNCTION "public"."url_encode"("data" "bytea") TO "authenticated";
GRANT ALL ON FUNCTION "public"."url_encode"("data" "bytea") TO "service_role";



GRANT ALL ON FUNCTION "public"."user_has_role"("user_uuid" "uuid", "role_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."user_has_role"("user_uuid" "uuid", "role_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."user_has_role"("user_uuid" "uuid", "role_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."validate_order_cancellation"() TO "anon";
GRANT ALL ON FUNCTION "public"."validate_order_cancellation"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_order_cancellation"() TO "service_role";



GRANT ALL ON FUNCTION "public"."validate_status_transition"("p_old_status" "text", "p_new_status" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."validate_status_transition"("p_old_status" "text", "p_new_status" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_status_transition"("p_old_status" "text", "p_new_status" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."validate_vendor_state_transition"() TO "anon";
GRANT ALL ON FUNCTION "public"."validate_vendor_state_transition"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_vendor_state_transition"() TO "service_role";



GRANT ALL ON FUNCTION "public"."verify"("token" "text", "secret" "text", "algorithm" "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."verify"("token" "text", "secret" "text", "algorithm" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."verify"("token" "text", "secret" "text", "algorithm" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."verify"("token" "text", "secret" "text", "algorithm" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."verify_guest_session"("p_token" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."verify_guest_session"("p_token" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."verify_guest_session"("p_token" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."verify_vendor_document"("p_document_id" "uuid", "p_document_number" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."verify_vendor_document"("p_document_id" "uuid", "p_document_number" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."verify_vendor_document"("p_document_id" "uuid", "p_document_number" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "service_role";












SET SESSION AUTHORIZATION "postgres";
RESET SESSION AUTHORIZATION;



SET SESSION AUTHORIZATION "postgres";
RESET SESSION AUTHORIZATION;









GRANT SELECT ON TABLE "metrics"."platform_daily" TO "authenticated";
GRANT SELECT ON TABLE "metrics"."platform_daily" TO "anon";
GRANT SELECT ON TABLE "metrics"."platform_daily" TO "service_role";



GRANT SELECT ON TABLE "metrics"."product_trending_scores" TO "anon";
GRANT SELECT ON TABLE "metrics"."product_trending_scores" TO "authenticated";
GRANT SELECT ON TABLE "metrics"."product_trending_scores" TO "service_role";



GRANT SELECT ON TABLE "metrics"."vendor_daily" TO "authenticated";
GRANT SELECT ON TABLE "metrics"."vendor_daily" TO "anon";
GRANT SELECT ON TABLE "metrics"."vendor_daily" TO "service_role";



GRANT SELECT ON TABLE "metrics"."vendor_realtime_cache" TO "authenticated";
GRANT SELECT ON TABLE "metrics"."vendor_realtime_cache" TO "anon";
GRANT SELECT ON TABLE "metrics"."vendor_realtime_cache" TO "service_role";



GRANT SELECT,INSERT ON TABLE "private"."payment_gateway_verifications" TO "service_role";



GRANT SELECT,USAGE ON SEQUENCE "private"."payment_gateway_verifications_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."attribute_values" TO "anon";
GRANT ALL ON TABLE "public"."attribute_values" TO "authenticated";
GRANT ALL ON TABLE "public"."attribute_values" TO "service_role";



GRANT ALL ON TABLE "public"."booking_reservations" TO "anon";
GRANT ALL ON TABLE "public"."booking_reservations" TO "authenticated";
GRANT ALL ON TABLE "public"."booking_reservations" TO "service_role";



GRANT ALL ON TABLE "public"."booking_status_history" TO "anon";
GRANT ALL ON TABLE "public"."booking_status_history" TO "authenticated";
GRANT ALL ON TABLE "public"."booking_status_history" TO "service_role";



GRANT ALL ON TABLE "public"."bookings" TO "anon";
GRANT ALL ON TABLE "public"."bookings" TO "authenticated";
GRANT ALL ON TABLE "public"."bookings" TO "service_role";



GRANT ALL ON TABLE "public"."brands" TO "anon";
GRANT ALL ON TABLE "public"."brands" TO "authenticated";
GRANT ALL ON TABLE "public"."brands" TO "service_role";



GRANT ALL ON TABLE "public"."cart_items" TO "anon";
GRANT ALL ON TABLE "public"."cart_items" TO "authenticated";
GRANT ALL ON TABLE "public"."cart_items" TO "service_role";



GRANT ALL ON TABLE "public"."cart_items_backup_20260117" TO "anon";
GRANT ALL ON TABLE "public"."cart_items_backup_20260117" TO "authenticated";
GRANT ALL ON TABLE "public"."cart_items_backup_20260117" TO "service_role";



GRANT ALL ON TABLE "public"."carts" TO "anon";
GRANT ALL ON TABLE "public"."carts" TO "authenticated";
GRANT ALL ON TABLE "public"."carts" TO "service_role";



GRANT ALL ON TABLE "public"."categories" TO "anon";
GRANT ALL ON TABLE "public"."categories" TO "authenticated";
GRANT ALL ON TABLE "public"."categories" TO "service_role";



GRANT ALL ON TABLE "public"."combo_items" TO "anon";
GRANT ALL ON TABLE "public"."combo_items" TO "authenticated";
GRANT ALL ON TABLE "public"."combo_items" TO "service_role";



GRANT ALL ON TABLE "public"."curation_events" TO "anon";
GRANT ALL ON TABLE "public"."curation_events" TO "authenticated";
GRANT ALL ON TABLE "public"."curation_events" TO "service_role";



GRANT ALL ON TABLE "public"."email_logs" TO "anon";
GRANT ALL ON TABLE "public"."email_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."email_logs" TO "service_role";



GRANT ALL ON TABLE "public"."email_preferences" TO "anon";
GRANT ALL ON TABLE "public"."email_preferences" TO "authenticated";
GRANT ALL ON TABLE "public"."email_preferences" TO "service_role";



GRANT ALL ON TABLE "public"."inventory" TO "anon";
GRANT ALL ON TABLE "public"."inventory" TO "authenticated";
GRANT ALL ON TABLE "public"."inventory" TO "service_role";



GRANT ALL ON TABLE "public"."inventory_locations" TO "anon";
GRANT ALL ON TABLE "public"."inventory_locations" TO "authenticated";
GRANT ALL ON TABLE "public"."inventory_locations" TO "service_role";



GRANT ALL ON TABLE "public"."inventory_movements" TO "anon";
GRANT ALL ON TABLE "public"."inventory_movements" TO "authenticated";
GRANT ALL ON TABLE "public"."inventory_movements" TO "service_role";



GRANT ALL ON TABLE "public"."inventory_violation_logs" TO "anon";
GRANT ALL ON TABLE "public"."inventory_violation_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."inventory_violation_logs" TO "service_role";



GRANT ALL ON TABLE "public"."job_queue" TO "anon";
GRANT ALL ON TABLE "public"."job_queue" TO "authenticated";
GRANT ALL ON TABLE "public"."job_queue" TO "service_role";



GRANT ALL ON TABLE "public"."kb_branches" TO "anon";
GRANT ALL ON TABLE "public"."kb_branches" TO "authenticated";
GRANT ALL ON TABLE "public"."kb_branches" TO "service_role";



GRANT ALL ON TABLE "public"."moderation_queue" TO "anon";
GRANT ALL ON TABLE "public"."moderation_queue" TO "authenticated";
GRANT ALL ON TABLE "public"."moderation_queue" TO "service_role";



GRANT ALL ON TABLE "public"."order_items" TO "anon";
GRANT ALL ON TABLE "public"."order_items" TO "authenticated";
GRANT ALL ON TABLE "public"."order_items" TO "service_role";



GRANT ALL ON SEQUENCE "public"."order_number_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."order_number_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."order_number_seq" TO "service_role";



GRANT ALL ON TABLE "public"."orders" TO "anon";
GRANT ALL ON TABLE "public"."orders" TO "authenticated";
GRANT ALL ON TABLE "public"."orders" TO "service_role";



GRANT ALL ON TABLE "public"."payment_gateway_verifications" TO "anon";
GRANT ALL ON TABLE "public"."payment_gateway_verifications" TO "authenticated";
GRANT ALL ON TABLE "public"."payment_gateway_verifications" TO "service_role";



GRANT ALL ON TABLE "public"."payment_intents" TO "anon";
GRANT ALL ON TABLE "public"."payment_intents" TO "authenticated";
GRANT ALL ON TABLE "public"."payment_intents" TO "service_role";



GRANT ALL ON TABLE "public"."payout_requests" TO "anon";
GRANT ALL ON TABLE "public"."payout_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."payout_requests" TO "service_role";



GRANT ALL ON TABLE "public"."payouts" TO "anon";
GRANT ALL ON TABLE "public"."payouts" TO "authenticated";
GRANT ALL ON TABLE "public"."payouts" TO "service_role";



GRANT ALL ON TABLE "public"."product_attributes" TO "anon";
GRANT ALL ON TABLE "public"."product_attributes" TO "authenticated";
GRANT ALL ON TABLE "public"."product_attributes" TO "service_role";



GRANT ALL ON TABLE "public"."product_change_log" TO "anon";
GRANT ALL ON TABLE "public"."product_change_log" TO "authenticated";
GRANT ALL ON TABLE "public"."product_change_log" TO "service_role";



GRANT ALL ON TABLE "public"."product_images" TO "anon";
GRANT ALL ON TABLE "public"."product_images" TO "authenticated";
GRANT ALL ON TABLE "public"."product_images" TO "service_role";



GRANT ALL ON TABLE "public"."product_recommendations" TO "anon";
GRANT ALL ON TABLE "public"."product_recommendations" TO "authenticated";
GRANT ALL ON TABLE "public"."product_recommendations" TO "service_role";



GRANT ALL ON TABLE "public"."product_tag_assignments" TO "anon";
GRANT ALL ON TABLE "public"."product_tag_assignments" TO "authenticated";
GRANT ALL ON TABLE "public"."product_tag_assignments" TO "service_role";



GRANT ALL ON TABLE "public"."product_tags" TO "anon";
GRANT ALL ON TABLE "public"."product_tags" TO "authenticated";
GRANT ALL ON TABLE "public"."product_tags" TO "service_role";



GRANT ALL ON TABLE "public"."product_variants" TO "anon";
GRANT ALL ON TABLE "public"."product_variants" TO "authenticated";
GRANT ALL ON TABLE "public"."product_variants" TO "service_role";



GRANT ALL ON TABLE "public"."products" TO "anon";
GRANT ALL ON TABLE "public"."products" TO "authenticated";
GRANT ALL ON TABLE "public"."products" TO "service_role";



GRANT ALL ON TABLE "public"."review_flags" TO "anon";
GRANT ALL ON TABLE "public"."review_flags" TO "authenticated";
GRANT ALL ON TABLE "public"."review_flags" TO "service_role";



GRANT ALL ON TABLE "public"."review_media" TO "anon";
GRANT ALL ON TABLE "public"."review_media" TO "authenticated";
GRANT ALL ON TABLE "public"."review_media" TO "service_role";



GRANT ALL ON TABLE "public"."review_replies" TO "anon";
GRANT ALL ON TABLE "public"."review_replies" TO "authenticated";
GRANT ALL ON TABLE "public"."review_replies" TO "service_role";



GRANT ALL ON TABLE "public"."review_vote_shards" TO "anon";
GRANT ALL ON TABLE "public"."review_vote_shards" TO "authenticated";
GRANT ALL ON TABLE "public"."review_vote_shards" TO "service_role";



GRANT ALL ON TABLE "public"."review_votes" TO "anon";
GRANT ALL ON TABLE "public"."review_votes" TO "authenticated";
GRANT ALL ON TABLE "public"."review_votes" TO "service_role";



GRANT ALL ON TABLE "public"."reviews" TO "anon";
GRANT ALL ON TABLE "public"."reviews" TO "authenticated";
GRANT ALL ON TABLE "public"."reviews" TO "service_role";



GRANT ALL ON TABLE "public"."roles" TO "anon";
GRANT ALL ON TABLE "public"."roles" TO "authenticated";
GRANT ALL ON TABLE "public"."roles" TO "service_role";



GRANT ALL ON TABLE "public"."schedule_change_log" TO "anon";
GRANT ALL ON TABLE "public"."schedule_change_log" TO "authenticated";
GRANT ALL ON TABLE "public"."schedule_change_log" TO "service_role";



GRANT ALL ON TABLE "public"."schedule_overrides" TO "anon";
GRANT ALL ON TABLE "public"."schedule_overrides" TO "authenticated";
GRANT ALL ON TABLE "public"."schedule_overrides" TO "service_role";



GRANT ALL ON TABLE "public"."services" TO "anon";
GRANT ALL ON TABLE "public"."services" TO "authenticated";
GRANT ALL ON TABLE "public"."services" TO "service_role";



GRANT ALL ON TABLE "public"."specialty_types" TO "anon";
GRANT ALL ON TABLE "public"."specialty_types" TO "authenticated";
GRANT ALL ON TABLE "public"."specialty_types" TO "service_role";



GRANT ALL ON TABLE "public"."stylist_override_budgets" TO "anon";
GRANT ALL ON TABLE "public"."stylist_override_budgets" TO "authenticated";
GRANT ALL ON TABLE "public"."stylist_override_budgets" TO "service_role";



GRANT ALL ON TABLE "public"."stylist_profiles" TO "anon";
GRANT ALL ON TABLE "public"."stylist_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."stylist_profiles" TO "service_role";



GRANT ALL ON TABLE "public"."stylist_promotions" TO "anon";
GRANT ALL ON TABLE "public"."stylist_promotions" TO "authenticated";
GRANT ALL ON TABLE "public"."stylist_promotions" TO "service_role";



GRANT ALL ON TABLE "public"."stylist_ratings" TO "anon";
GRANT ALL ON TABLE "public"."stylist_ratings" TO "authenticated";
GRANT ALL ON TABLE "public"."stylist_ratings" TO "service_role";



GRANT ALL ON TABLE "public"."stylist_schedules" TO "anon";
GRANT ALL ON TABLE "public"."stylist_schedules" TO "authenticated";
GRANT ALL ON TABLE "public"."stylist_schedules" TO "service_role";



GRANT ALL ON TABLE "public"."stylist_services" TO "anon";
GRANT ALL ON TABLE "public"."stylist_services" TO "authenticated";
GRANT ALL ON TABLE "public"."stylist_services" TO "service_role";



GRANT ALL ON TABLE "public"."stylist_specialties" TO "anon";
GRANT ALL ON TABLE "public"."stylist_specialties" TO "authenticated";
GRANT ALL ON TABLE "public"."stylist_specialties" TO "service_role";



GRANT ALL ON TABLE "public"."support_attachments" TO "anon";
GRANT ALL ON TABLE "public"."support_attachments" TO "authenticated";
GRANT ALL ON TABLE "public"."support_attachments" TO "service_role";



GRANT ALL ON TABLE "public"."support_categories" TO "anon";
GRANT ALL ON TABLE "public"."support_categories" TO "authenticated";
GRANT ALL ON TABLE "public"."support_categories" TO "service_role";



GRANT ALL ON TABLE "public"."support_messages" TO "anon";
GRANT ALL ON TABLE "public"."support_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."support_messages" TO "service_role";



GRANT ALL ON TABLE "public"."support_tickets" TO "anon";
GRANT ALL ON TABLE "public"."support_tickets" TO "authenticated";
GRANT ALL ON TABLE "public"."support_tickets" TO "service_role";



GRANT ALL ON TABLE "public"."user_addresses" TO "anon";
GRANT ALL ON TABLE "public"."user_addresses" TO "authenticated";
GRANT ALL ON TABLE "public"."user_addresses" TO "service_role";



GRANT ALL ON TABLE "public"."user_audit_log" TO "anon";
GRANT ALL ON TABLE "public"."user_audit_log" TO "authenticated";
GRANT ALL ON TABLE "public"."user_audit_log" TO "service_role";



GRANT ALL ON TABLE "public"."user_private_data" TO "anon";
GRANT ALL ON TABLE "public"."user_private_data" TO "authenticated";
GRANT ALL ON TABLE "public"."user_private_data" TO "service_role";



GRANT ALL ON TABLE "public"."user_profiles" TO "anon";
GRANT ALL ON TABLE "public"."user_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."user_profiles" TO "service_role";



GRANT ALL ON TABLE "public"."user_reputation" TO "anon";
GRANT ALL ON TABLE "public"."user_reputation" TO "authenticated";
GRANT ALL ON TABLE "public"."user_reputation" TO "service_role";



GRANT ALL ON TABLE "public"."user_roles" TO "anon";
GRANT ALL ON TABLE "public"."user_roles" TO "authenticated";
GRANT ALL ON TABLE "public"."user_roles" TO "service_role";



GRANT ALL ON TABLE "public"."variant_attribute_values" TO "anon";
GRANT ALL ON TABLE "public"."variant_attribute_values" TO "authenticated";
GRANT ALL ON TABLE "public"."variant_attribute_values" TO "service_role";



GRANT ALL ON TABLE "public"."vendor_documents" TO "anon";
GRANT ALL ON TABLE "public"."vendor_documents" TO "authenticated";
GRANT ALL ON TABLE "public"."vendor_documents" TO "service_role";



GRANT ALL ON TABLE "public"."vendor_profiles" TO "anon";
GRANT ALL ON TABLE "public"."vendor_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."vendor_profiles" TO "service_role";



GRANT ALL ON TABLE "public"."webhook_events" TO "anon";
GRANT ALL ON TABLE "public"."webhook_events" TO "authenticated";
GRANT ALL ON TABLE "public"."webhook_events" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "metrics" GRANT SELECT ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "metrics" GRANT SELECT ON TABLES TO "authenticated";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































RESET ALL;
