-- ============================================================================
-- KB STYLISH POST-RESET VERIFICATION SCRIPT
-- ============================================================================
-- Run this AFTER the hard reset to verify everything is correct
-- ============================================================================

-- 1. Verify Preserved Users
SELECT '=== PRESERVED USERS ===' as section;
SELECT 
    up.id,
    up.username,
    up.display_name,
    COALESCE(r.name, 'no role') as role
FROM user_profiles up
LEFT JOIN user_roles ur ON ur.user_id = up.id AND ur.is_active = true
LEFT JOIN roles r ON r.id = ur.role_id
ORDER BY up.display_name;

-- 2. Verify Preserved Vendor
SELECT '=== PRESERVED VENDOR ===' as section;
SELECT 
    vp.user_id,
    vp.business_name,
    up.display_name,
    vp.verification_status
FROM vendor_profiles vp
JOIN user_profiles up ON up.id = vp.user_id;

-- 3. Verify Reference Data Intact
SELECT '=== REFERENCE DATA STATUS ===' as section;
SELECT 'categories' as table_name, COUNT(*) as count, 
    CASE WHEN COUNT(*) > 0 THEN '✅' ELSE '❌' END as status 
FROM categories
UNION ALL SELECT 'brands', COUNT(*), CASE WHEN COUNT(*) > 0 THEN '✅' ELSE '❌' END FROM brands
UNION ALL SELECT 'services', COUNT(*), CASE WHEN COUNT(*) > 0 THEN '✅' ELSE '❌' END FROM services
UNION ALL SELECT 'roles', COUNT(*), CASE WHEN COUNT(*) > 0 THEN '✅' ELSE '❌' END FROM roles
UNION ALL SELECT 'kb_branches', COUNT(*), CASE WHEN COUNT(*) > 0 THEN '✅' ELSE '❌' END FROM kb_branches
UNION ALL SELECT 'specialty_types', COUNT(*), CASE WHEN COUNT(*) > 0 THEN '✅' ELSE '❌' END FROM specialty_types
UNION ALL SELECT 'support_categories', COUNT(*), CASE WHEN COUNT(*) > 0 THEN '✅' ELSE '❌' END FROM support_categories
UNION ALL SELECT 'product_attributes', COUNT(*), CASE WHEN COUNT(*) > 0 THEN '✅' ELSE '❌' END FROM product_attributes
UNION ALL SELECT 'attribute_values', COUNT(*), CASE WHEN COUNT(*) > 0 THEN '✅' ELSE '❌' END FROM attribute_values
ORDER BY table_name;

-- 4. Verify Transactional Data Cleared
SELECT '=== TRANSACTIONAL DATA (SHOULD BE 0) ===' as section;
SELECT 'products' as table_name, COUNT(*) as count,
    CASE WHEN COUNT(*) = 0 THEN '✅' ELSE '⚠️' END as status
FROM products
UNION ALL SELECT 'product_variants', COUNT(*), CASE WHEN COUNT(*) = 0 THEN '✅' ELSE '⚠️' END FROM product_variants
UNION ALL SELECT 'orders', COUNT(*), CASE WHEN COUNT(*) = 0 THEN '✅' ELSE '⚠️' END FROM orders
UNION ALL SELECT 'order_items', COUNT(*), CASE WHEN COUNT(*) = 0 THEN '✅' ELSE '⚠️' END FROM order_items
UNION ALL SELECT 'bookings', COUNT(*), CASE WHEN COUNT(*) = 0 THEN '✅' ELSE '⚠️' END FROM bookings
UNION ALL SELECT 'reviews', COUNT(*), CASE WHEN COUNT(*) = 0 THEN '✅' ELSE '⚠️' END FROM reviews
UNION ALL SELECT 'carts', COUNT(*), CASE WHEN COUNT(*) = 0 THEN '✅' ELSE '⚠️' END FROM carts
UNION ALL SELECT 'payment_intents', COUNT(*), CASE WHEN COUNT(*) = 0 THEN '✅' ELSE '⚠️' END FROM payment_intents
UNION ALL SELECT 'stylist_profiles', COUNT(*), CASE WHEN COUNT(*) = 0 THEN '✅' ELSE '⚠️' END FROM stylist_profiles
ORDER BY table_name;

-- 5. Verify Metrics Reset
SELECT '=== METRICS (SHOULD BE 0) ===' as section;
SELECT 'metrics.vendor_daily' as table_name, COUNT(*) as count,
    CASE WHEN COUNT(*) = 0 THEN '✅' ELSE '⚠️' END as status
FROM metrics.vendor_daily
UNION ALL SELECT 'metrics.platform_daily', COUNT(*), CASE WHEN COUNT(*) = 0 THEN '✅' ELSE '⚠️' END FROM metrics.platform_daily
UNION ALL SELECT 'metrics.vendor_realtime_cache', COUNT(*), CASE WHEN COUNT(*) = 0 THEN '✅' ELSE '⚠️' END FROM metrics.vendor_realtime_cache
ORDER BY table_name;

-- 6. Final Status
SELECT '=== FINAL STATUS ===' as section;
SELECT 
    CASE 
        WHEN (SELECT COUNT(*) FROM user_profiles) >= 2
         AND (SELECT COUNT(*) FROM vendor_profiles) >= 1
         AND (SELECT COUNT(*) FROM categories) > 0
         AND (SELECT COUNT(*) FROM brands) > 0
         AND (SELECT COUNT(*) FROM services) > 0
         AND (SELECT COUNT(*) FROM products) = 0
         AND (SELECT COUNT(*) FROM orders) = 0
        THEN '✅ HARD RESET SUCCESSFUL - READY FOR PRODUCTION LAUNCH!'
        ELSE '⚠️ VERIFICATION FAILED - CHECK ABOVE RESULTS'
    END as final_status;
