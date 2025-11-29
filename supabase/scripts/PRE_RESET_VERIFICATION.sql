-- ============================================================================
-- KB STYLISH PRE-RESET VERIFICATION SCRIPT
-- ============================================================================
-- Run this BEFORE the hard reset to verify current state
-- and ensure all preserved entities exist
-- ============================================================================

-- 1. Verify Admin Users Exist
SELECT '=== ADMIN USERS TO PRESERVE ===' as section;
SELECT 
    up.id,
    up.username,
    up.display_name,
    r.name as role
FROM user_profiles up
JOIN user_roles ur ON ur.user_id = up.id
JOIN roles r ON r.id = ur.role_id
WHERE r.name = 'admin' AND ur.is_active = true;

-- 2. Verify Real Vendor Exists
SELECT '=== REAL VENDOR TO PRESERVE ===' as section;
SELECT 
    vp.user_id,
    vp.business_name,
    up.display_name,
    up.username,
    vp.verification_status,
    vp.application_state
FROM vendor_profiles vp
JOIN user_profiles up ON up.id = vp.user_id
WHERE vp.user_id = '05adc70a-c06c-48e6-beb3-7a9f7ae14353';

-- 3. Current Data Counts (What will be deleted)
SELECT '=== CURRENT DATA COUNTS (TO BE DELETED) ===' as section;
SELECT 'user_profiles' as table_name, COUNT(*) as count FROM user_profiles
UNION ALL SELECT 'vendor_profiles', COUNT(*) FROM vendor_profiles
UNION ALL SELECT 'stylist_profiles', COUNT(*) FROM stylist_profiles
UNION ALL SELECT 'products', COUNT(*) FROM products
UNION ALL SELECT 'product_variants', COUNT(*) FROM product_variants
UNION ALL SELECT 'orders', COUNT(*) FROM orders
UNION ALL SELECT 'order_items', COUNT(*) FROM order_items
UNION ALL SELECT 'bookings', COUNT(*) FROM bookings
UNION ALL SELECT 'booking_reservations', COUNT(*) FROM booking_reservations
UNION ALL SELECT 'reviews', COUNT(*) FROM reviews
UNION ALL SELECT 'carts', COUNT(*) FROM carts
UNION ALL SELECT 'cart_items', COUNT(*) FROM cart_items
UNION ALL SELECT 'payment_intents', COUNT(*) FROM payment_intents
UNION ALL SELECT 'metrics.vendor_daily', COUNT(*) FROM metrics.vendor_daily
UNION ALL SELECT 'metrics.platform_daily', COUNT(*) FROM metrics.platform_daily
ORDER BY table_name;

-- 4. Reference Data Counts (Will be PRESERVED)
SELECT '=== REFERENCE DATA (TO BE PRESERVED) ===' as section;
SELECT 'categories' as table_name, COUNT(*) as count FROM categories
UNION ALL SELECT 'brands', COUNT(*) FROM brands
UNION ALL SELECT 'services', COUNT(*) FROM services
UNION ALL SELECT 'roles', COUNT(*) FROM roles
UNION ALL SELECT 'kb_branches', COUNT(*) FROM kb_branches
UNION ALL SELECT 'specialty_types', COUNT(*) FROM specialty_types
UNION ALL SELECT 'support_categories', COUNT(*) FROM support_categories
UNION ALL SELECT 'product_attributes', COUNT(*) FROM product_attributes
UNION ALL SELECT 'attribute_values', COUNT(*) FROM attribute_values
ORDER BY table_name;

-- 5. Verify No Critical FK Issues
SELECT '=== FK CONSTRAINT CHECK ===' as section;
SELECT 
    'Orders referencing payment_intents' as check_name,
    COUNT(*) as count
FROM orders WHERE payment_intent_id IS NOT NULL
UNION ALL
SELECT 
    'Order_items referencing products',
    COUNT(*)
FROM order_items
UNION ALL
SELECT 
    'Reviews referencing orders',
    COUNT(*)
FROM reviews WHERE order_id IS NOT NULL;

-- 6. Final Confirmation
SELECT '=== READY FOR RESET ===' as section;
SELECT 
    CASE 
        WHEN EXISTS(SELECT 1 FROM user_profiles WHERE id = 'eb853984-7380-4ada-a79d-09f5f8ca479c')
         AND EXISTS(SELECT 1 FROM user_profiles WHERE id = '0f634462-e79a-4947-a177-ad3d6f673783')
         AND EXISTS(SELECT 1 FROM vendor_profiles WHERE user_id = '05adc70a-c06c-48e6-beb3-7a9f7ae14353')
        THEN '✅ ALL PRESERVED ENTITIES VERIFIED - SAFE TO PROCEED'
        ELSE '❌ MISSING PRESERVED ENTITIES - DO NOT PROCEED'
    END as status;
