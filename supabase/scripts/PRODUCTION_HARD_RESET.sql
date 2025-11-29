-- ============================================================================
-- KB STYLISH PRODUCTION HARD RESET SCRIPT
-- ============================================================================
-- Version: 1.0
-- Date: November 29, 2025
-- Purpose: Clean all test data for production launch
-- Author: AI Assistant following UNIVERSAL_AI_EXCELLENCE_PROMPT
-- 
-- ⚠️  CRITICAL: CREATE A DATABASE BACKUP BEFORE RUNNING THIS SCRIPT!
--     Supabase Dashboard → Database → Backups → Create backup
--
-- ============================================================================
-- PRESERVED ENTITIES (DO NOT DELETE):
-- ============================================================================
-- Admin Users:
--   - eb853984-7380-4ada-a79d-09f5f8ca479c (shishir bhusal - Real Admin)
--   - 0f634462-e79a-4947-a177-ad3d6f673783 (Admin Test)
-- 
-- Real Vendor:
--   - 05adc70a-c06c-48e6-beb3-7a9f7ae14353 (Buddi Raj Bhattarai - B.R.B. Salon)
--
-- Reference Data (KEPT):
--   - roles (5 rows)
--   - categories (7 rows)
--   - brands (6 rows)
--   - services (5 rows)
--   - specialty_types (16 rows)
--   - support_categories (8 rows)
--   - kb_branches (4 rows)
--   - product_attributes (3 rows)
--   - attribute_values (14 rows)
-- ============================================================================

-- Define preserved IDs as variables for clarity
DO $$
DECLARE
    v_admin_1 UUID := 'eb853984-7380-4ada-a79d-09f5f8ca479c';  -- shishir bhusal
    v_admin_2 UUID := '0f634462-e79a-4947-a177-ad3d6f673783';  -- Admin Test
    v_real_vendor UUID := '05adc70a-c06c-48e6-beb3-7a9f7ae14353';  -- Buddi Raj
    v_preserved_users UUID[] := ARRAY[
        'eb853984-7380-4ada-a79d-09f5f8ca479c',
        '0f634462-e79a-4947-a177-ad3d6f673783',
        '05adc70a-c06c-48e6-beb3-7a9f7ae14353'
    ];
BEGIN
    RAISE NOTICE '============================================';
    RAISE NOTICE 'KB STYLISH PRODUCTION HARD RESET';
    RAISE NOTICE 'Starting at: %', NOW();
    RAISE NOTICE '============================================';
    
    -- ========================================================================
    -- PHASE 1: METRICS SCHEMA (Independent - Safe to truncate)
    -- ========================================================================
    RAISE NOTICE 'PHASE 1: Clearing metrics schema...';
    
    TRUNCATE TABLE metrics.vendor_realtime_cache;
    RAISE NOTICE '  ✓ metrics.vendor_realtime_cache truncated';
    
    TRUNCATE TABLE metrics.vendor_daily;
    RAISE NOTICE '  ✓ metrics.vendor_daily truncated';
    
    TRUNCATE TABLE metrics.platform_daily;
    RAISE NOTICE '  ✓ metrics.platform_daily truncated';
    
    TRUNCATE TABLE metrics.product_trending_scores;
    RAISE NOTICE '  ✓ metrics.product_trending_scores truncated';
    
    -- ========================================================================
    -- PHASE 2: PRIVATE SCHEMA (Audit/Cache tables)
    -- ========================================================================
    RAISE NOTICE 'PHASE 2: Clearing private schema...';
    
    TRUNCATE TABLE private.availability_cache;
    RAISE NOTICE '  ✓ private.availability_cache truncated';
    
    DELETE FROM private.schedule_change_log;
    RAISE NOTICE '  ✓ private.schedule_change_log cleared';
    
    DELETE FROM private.service_management_log;
    RAISE NOTICE '  ✓ private.service_management_log cleared';
    
    DELETE FROM private.customer_data_access_log;
    RAISE NOTICE '  ✓ private.customer_data_access_log cleared';
    
    DELETE FROM private.payment_gateway_verifications;
    RAISE NOTICE '  ✓ private.payment_gateway_verifications cleared';
    
    DELETE FROM private.audit_log;
    RAISE NOTICE '  ✓ private.audit_log cleared';
    
    DELETE FROM private.metrics_update_queue;
    RAISE NOTICE '  ✓ private.metrics_update_queue cleared';
    
    -- NOTE: private.app_config is KEPT (system configuration)
    
    -- ========================================================================
    -- PHASE 3: REVIEW SYSTEM (Leaf tables first)
    -- ========================================================================
    RAISE NOTICE 'PHASE 3: Clearing review system...';
    
    DELETE FROM public.review_vote_shards;
    RAISE NOTICE '  ✓ review_vote_shards cleared';
    
    DELETE FROM public.review_votes;
    RAISE NOTICE '  ✓ review_votes cleared';
    
    DELETE FROM public.review_flags;
    RAISE NOTICE '  ✓ review_flags cleared';
    
    DELETE FROM public.review_media;
    RAISE NOTICE '  ✓ review_media cleared';
    
    DELETE FROM public.review_replies;
    RAISE NOTICE '  ✓ review_replies cleared';
    
    DELETE FROM public.reviews;
    RAISE NOTICE '  ✓ reviews cleared';
    
    DELETE FROM public.moderation_queue;
    RAISE NOTICE '  ✓ moderation_queue cleared';
    
    DELETE FROM public.user_reputation;
    RAISE NOTICE '  ✓ user_reputation cleared';
    
    -- ========================================================================
    -- PHASE 4: BOOKING SYSTEM
    -- ========================================================================
    RAISE NOTICE 'PHASE 4: Clearing booking system...';
    
    DELETE FROM public.stylist_ratings;
    RAISE NOTICE '  ✓ stylist_ratings cleared';
    
    DELETE FROM public.booking_status_history;
    RAISE NOTICE '  ✓ booking_status_history cleared';
    
    -- Clear FK references before deleting bookings
    UPDATE public.bookings SET order_item_id = NULL, reminder_email_id = NULL;
    RAISE NOTICE '  ✓ bookings FK references nullified';
    
    DELETE FROM public.bookings;
    RAISE NOTICE '  ✓ bookings cleared';
    
    DELETE FROM public.booking_reservations;
    RAISE NOTICE '  ✓ booking_reservations cleared';
    
    -- ========================================================================
    -- PHASE 5: ORDER SYSTEM (Complex FK dependencies)
    -- ========================================================================
    RAISE NOTICE 'PHASE 5: Clearing order system...';
    
    DELETE FROM public.order_items;
    RAISE NOTICE '  ✓ order_items cleared';
    
    DELETE FROM public.orders;
    RAISE NOTICE '  ✓ orders cleared';
    
    -- ========================================================================
    -- PHASE 6: PAYMENT SYSTEM
    -- ========================================================================
    RAISE NOTICE 'PHASE 6: Clearing payment system...';
    
    DELETE FROM public.payment_gateway_verifications;
    RAISE NOTICE '  ✓ payment_gateway_verifications cleared';
    
    DELETE FROM public.payment_intents;
    RAISE NOTICE '  ✓ payment_intents cleared';
    
    DELETE FROM public.payout_requests;
    RAISE NOTICE '  ✓ payout_requests cleared';
    
    DELETE FROM public.payouts;
    RAISE NOTICE '  ✓ payouts cleared';
    
    -- ========================================================================
    -- PHASE 7: CART SYSTEM
    -- ========================================================================
    RAISE NOTICE 'PHASE 7: Clearing cart system...';
    
    DELETE FROM public.cart_items;
    RAISE NOTICE '  ✓ cart_items cleared';
    
    DELETE FROM public.carts;
    RAISE NOTICE '  ✓ carts cleared';
    
    -- ========================================================================
    -- PHASE 8: PRODUCT SYSTEM
    -- ========================================================================
    RAISE NOTICE 'PHASE 8: Clearing product system...';
    
    DELETE FROM public.product_change_log;
    RAISE NOTICE '  ✓ product_change_log cleared';
    
    DELETE FROM public.product_images;
    RAISE NOTICE '  ✓ product_images cleared';
    
    DELETE FROM public.product_tag_assignments;
    RAISE NOTICE '  ✓ product_tag_assignments cleared';
    
    DELETE FROM public.product_recommendations;
    RAISE NOTICE '  ✓ product_recommendations cleared';
    
    DELETE FROM public.variant_attribute_values;
    RAISE NOTICE '  ✓ variant_attribute_values cleared';
    
    DELETE FROM public.inventory_movements;
    RAISE NOTICE '  ✓ inventory_movements cleared';
    
    DELETE FROM public.inventory;
    RAISE NOTICE '  ✓ inventory cleared';
    
    DELETE FROM public.product_variants;
    RAISE NOTICE '  ✓ product_variants cleared';
    
    DELETE FROM public.products;
    RAISE NOTICE '  ✓ products cleared';
    
    DELETE FROM public.inventory_locations;
    RAISE NOTICE '  ✓ inventory_locations cleared';
    
    -- Keep product_tags (reference data)
    -- Keep product_attributes (reference data)
    -- Keep attribute_values (reference data)
    
    -- ========================================================================
    -- PHASE 9: SUPPORT SYSTEM
    -- ========================================================================
    RAISE NOTICE 'PHASE 9: Clearing support system...';
    
    DELETE FROM public.support_attachments;
    RAISE NOTICE '  ✓ support_attachments cleared';
    
    DELETE FROM public.support_messages;
    RAISE NOTICE '  ✓ support_messages cleared';
    
    DELETE FROM public.support_tickets;
    RAISE NOTICE '  ✓ support_tickets cleared';
    
    -- Keep support_categories (reference data)
    
    -- ========================================================================
    -- PHASE 10: STYLIST SYSTEM
    -- ========================================================================
    RAISE NOTICE 'PHASE 10: Clearing stylist system...';
    
    DELETE FROM public.schedule_change_log;
    RAISE NOTICE '  ✓ schedule_change_log cleared';
    
    DELETE FROM public.schedule_overrides;
    RAISE NOTICE '  ✓ schedule_overrides cleared';
    
    DELETE FROM public.stylist_override_budgets;
    RAISE NOTICE '  ✓ stylist_override_budgets cleared';
    
    DELETE FROM public.stylist_specialties;
    RAISE NOTICE '  ✓ stylist_specialties cleared';
    
    DELETE FROM public.stylist_services;
    RAISE NOTICE '  ✓ stylist_services cleared';
    
    DELETE FROM public.stylist_schedules;
    RAISE NOTICE '  ✓ stylist_schedules cleared';
    
    DELETE FROM public.stylist_promotions;
    RAISE NOTICE '  ✓ stylist_promotions cleared';
    
    -- Clear branch_id FK before deleting stylist_profiles
    UPDATE public.stylist_profiles SET branch_id = NULL;
    RAISE NOTICE '  ✓ stylist_profiles branch_id nullified';
    
    DELETE FROM public.stylist_profiles;
    RAISE NOTICE '  ✓ stylist_profiles cleared';
    
    -- ========================================================================
    -- PHASE 11: VENDOR SYSTEM (Preserve real vendor)
    -- ========================================================================
    RAISE NOTICE 'PHASE 11: Clearing vendor system (preserving Buddi Raj)...';
    
    -- Clear business_address_id FK before deleting
    UPDATE public.vendor_profiles 
    SET business_address_id = NULL 
    WHERE user_id != v_real_vendor;
    RAISE NOTICE '  ✓ vendor_profiles business_address_id nullified';
    
    DELETE FROM public.vendor_profiles 
    WHERE user_id != v_real_vendor;
    RAISE NOTICE '  ✓ vendor_profiles cleared (preserved Buddi Raj)';
    
    -- ========================================================================
    -- PHASE 12: USER SYSTEM (Preserve admins + real vendor)
    -- ========================================================================
    RAISE NOTICE 'PHASE 12: Clearing user system (preserving admins)...';
    
    DELETE FROM public.curation_events;
    RAISE NOTICE '  ✓ curation_events cleared';
    
    DELETE FROM public.email_logs;
    RAISE NOTICE '  ✓ email_logs cleared';
    
    DELETE FROM public.email_preferences 
    WHERE user_id NOT IN (SELECT unnest(v_preserved_users));
    RAISE NOTICE '  ✓ email_preferences cleared (preserved admins)';
    
    DELETE FROM public.user_audit_log;
    RAISE NOTICE '  ✓ user_audit_log cleared';
    
    DELETE FROM public.user_addresses 
    WHERE user_id NOT IN (SELECT unnest(v_preserved_users));
    RAISE NOTICE '  ✓ user_addresses cleared (preserved admins)';
    
    DELETE FROM public.user_private_data 
    WHERE user_id NOT IN (SELECT unnest(v_preserved_users));
    RAISE NOTICE '  ✓ user_private_data cleared (preserved admins)';
    
    -- Delete user_roles for non-preserved users (keep admin roles)
    DELETE FROM public.user_roles 
    WHERE user_id NOT IN (SELECT unnest(v_preserved_users));
    RAISE NOTICE '  ✓ user_roles cleared (preserved admin roles)';
    
    -- Delete user_profiles for non-preserved users
    DELETE FROM public.user_profiles 
    WHERE id NOT IN (SELECT unnest(v_preserved_users));
    RAISE NOTICE '  ✓ user_profiles cleared (preserved admins + vendor)';
    
    -- ========================================================================
    -- PHASE 13: QUEUE/EVENT TABLES
    -- ========================================================================
    RAISE NOTICE 'PHASE 13: Clearing queue/event tables...';
    
    DELETE FROM public.job_queue;
    RAISE NOTICE '  ✓ job_queue cleared';
    
    DELETE FROM public.webhook_events;
    RAISE NOTICE '  ✓ webhook_events cleared';
    
    -- ========================================================================
    -- VERIFICATION
    -- ========================================================================
    RAISE NOTICE '============================================';
    RAISE NOTICE 'VERIFICATION';
    RAISE NOTICE '============================================';
    
    -- Verify preserved entities
    IF NOT EXISTS (SELECT 1 FROM user_profiles WHERE id = v_admin_1) THEN
        RAISE EXCEPTION 'CRITICAL: Admin 1 (shishir bhusal) was deleted!';
    END IF;
    RAISE NOTICE '  ✓ Admin 1 (shishir bhusal) preserved';
    
    IF NOT EXISTS (SELECT 1 FROM user_profiles WHERE id = v_admin_2) THEN
        RAISE EXCEPTION 'CRITICAL: Admin 2 was deleted!';
    END IF;
    RAISE NOTICE '  ✓ Admin 2 preserved';
    
    IF NOT EXISTS (SELECT 1 FROM vendor_profiles WHERE user_id = v_real_vendor) THEN
        RAISE EXCEPTION 'CRITICAL: Real vendor (Buddi Raj) was deleted!';
    END IF;
    RAISE NOTICE '  ✓ Real vendor (Buddi Raj) preserved';
    
    -- Verify reference data preserved
    IF (SELECT COUNT(*) FROM categories) = 0 THEN
        RAISE EXCEPTION 'CRITICAL: Categories were deleted!';
    END IF;
    RAISE NOTICE '  ✓ Categories preserved: %', (SELECT COUNT(*) FROM categories);
    
    IF (SELECT COUNT(*) FROM brands) = 0 THEN
        RAISE EXCEPTION 'CRITICAL: Brands were deleted!';
    END IF;
    RAISE NOTICE '  ✓ Brands preserved: %', (SELECT COUNT(*) FROM brands);
    
    IF (SELECT COUNT(*) FROM services) = 0 THEN
        RAISE EXCEPTION 'CRITICAL: Services were deleted!';
    END IF;
    RAISE NOTICE '  ✓ Services preserved: %', (SELECT COUNT(*) FROM services);
    
    IF (SELECT COUNT(*) FROM roles) = 0 THEN
        RAISE EXCEPTION 'CRITICAL: Roles were deleted!';
    END IF;
    RAISE NOTICE '  ✓ Roles preserved: %', (SELECT COUNT(*) FROM roles);
    
    IF (SELECT COUNT(*) FROM kb_branches) = 0 THEN
        RAISE EXCEPTION 'CRITICAL: KB Branches were deleted!';
    END IF;
    RAISE NOTICE '  ✓ KB Branches preserved: %', (SELECT COUNT(*) FROM kb_branches);
    
    RAISE NOTICE '============================================';
    RAISE NOTICE 'HARD RESET COMPLETED SUCCESSFULLY';
    RAISE NOTICE 'Completed at: %', NOW();
    RAISE NOTICE '============================================';
    
END $$;

-- ============================================================================
-- POST-RESET SUMMARY QUERY
-- Run this after the reset to verify the state
-- ============================================================================
SELECT 'POST-RESET SUMMARY' as section;

SELECT 'Preserved Users' as category, COUNT(*) as count FROM user_profiles
UNION ALL SELECT 'Preserved Vendors', COUNT(*) FROM vendor_profiles
UNION ALL SELECT 'Categories', COUNT(*) FROM categories
UNION ALL SELECT 'Brands', COUNT(*) FROM brands
UNION ALL SELECT 'Services', COUNT(*) FROM services
UNION ALL SELECT 'KB Branches', COUNT(*) FROM kb_branches
UNION ALL SELECT 'Roles', COUNT(*) FROM roles
UNION ALL SELECT 'Specialty Types', COUNT(*) FROM specialty_types
UNION ALL SELECT 'Support Categories', COUNT(*) FROM support_categories
UNION ALL SELECT 'Products (should be 0)', COUNT(*) FROM products
UNION ALL SELECT 'Orders (should be 0)', COUNT(*) FROM orders
UNION ALL SELECT 'Bookings (should be 0)', COUNT(*) FROM bookings
UNION ALL SELECT 'Reviews (should be 0)', COUNT(*) FROM reviews
ORDER BY category;
