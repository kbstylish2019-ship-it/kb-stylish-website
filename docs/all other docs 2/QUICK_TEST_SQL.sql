-- QUICK TEST: Approve the pending nail polish review
-- Run this in Supabase SQL Editor to test the vendor dashboard immediately

-- 1. Approve the review
UPDATE reviews
SET 
  is_approved = true,
  moderation_status = 'approved',
  moderated_at = NOW(),
  moderated_by = '7bc72b99-4125-4b27-8464-5519fb2aaab3'  -- swostika's vendor ID
WHERE id = '76192d32-1361-4519-ada4-08d857da37ed'
RETURNING id, title, rating, is_approved, moderation_status;

-- 2. Verify the product stats were auto-updated by trigger
SELECT 
  name,
  average_rating,
  review_count,
  rating_distribution
FROM products
WHERE slug = 'nail-polish';

-- Expected Result:
-- average_rating: 3.00 (was 0.00)
-- review_count: 1 (was 0)
-- rating_distribution: {"1":0,"2":0,"3":1,"4":0,"5":0,"total":1,"average":3}

-- 3. Verify review is now visible in vendor dashboard
SELECT 
  r.id,
  r.title,
  r.rating,
  r.is_approved,
  r.moderation_status,
  p.name as product_name,
  u.display_name as author
FROM reviews r
JOIN products p ON p.id = r.product_id
JOIN user_profiles u ON u.id = r.user_id
WHERE p.vendor_id = '7bc72b99-4125-4b27-8464-5519fb2aaab3'
AND r.deleted_at IS NULL;

-- Expected: 1 row, is_approved=true

------------------------------------------
-- TO UNDO (Reset to pending for testing):
------------------------------------------
-- UPDATE reviews
-- SET 
--   is_approved = false,
--   moderation_status = 'pending',
--   moderated_at = NULL,
--   moderated_by = NULL
-- WHERE id = '76192d32-1361-4519-ada4-08d857da37ed';
