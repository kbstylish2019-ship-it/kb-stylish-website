-- DEBUG: Check Payment Intents
-- Run this in Supabase SQL Editor after placing an order

-- 1. Get all recent payment intents
SELECT 
  payment_intent_id,
  external_transaction_id,
  amount_cents,
  (amount_cents / 100.0) as amount_npr,
  status,
  provider,
  created_at,
  expires_at
FROM payment_intents
ORDER BY created_at DESC
LIMIT 5;

-- 2. Check if external_transaction_id exists
-- Replace 'YOUR_TRANSACTION_UUID' with the UUID from console log
SELECT *
FROM payment_intents
WHERE external_transaction_id = '551d8af2-ba09-41ff-ba5e-f10370074058';

-- 3. Check payment gateway verifications
SELECT 
  provider,
  external_transaction_id,
  payment_intent_id,
  status,
  amount_verified,
  (amount_verified / 100.0) as amount_npr,
  verification_response->>'status' as gateway_status,
  created_at
FROM payment_gateway_verifications
ORDER BY created_at DESC
LIMIT 5;

-- 4. Check if there are any pending payment intents for your user
SELECT 
  pi.payment_intent_id,
  pi.external_transaction_id,
  pi.amount_cents,
  pi.status,
  pi.provider,
  pi.created_at,
  u.email
FROM payment_intents pi
JOIN auth.users u ON u.id = pi.user_id
WHERE u.id = '8e80ead5-ce95-4bad-ab30-d4f54555584b'  -- Your user ID from logs
ORDER BY pi.created_at DESC
LIMIT 10;

-- 5. Check if inventory reservation happened
SELECT 
  cart_id,
  payment_intent_id,
  variant_id,
  quantity_reserved,
  created_at
FROM inventory_reservations
ORDER BY created_at DESC
LIMIT 10;
