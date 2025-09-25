-- Secure the secret in a private table and harden RPC signatures
-- Created: 2025-09-19 13:01:23

BEGIN;

-- 0) Ensure required extensions
CREATE EXTENSION IF NOT EXISTS pgjwt;

-- 1) Private config storage
CREATE SCHEMA IF NOT EXISTS private;

CREATE TABLE IF NOT EXISTS private.app_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Enable RLS and provide no policies, so only table owner (function owner) can read
ALTER TABLE private.app_config ENABLE ROW LEVEL SECURITY;
-- Deny-all policy (table owner and SECURITY DEFINER functions can still access unless FORCE RLS is set)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'private' AND tablename = 'app_config' AND policyname = 'deny_all_app_config'
  ) THEN
    CREATE POLICY deny_all_app_config ON private.app_config FOR ALL TO PUBLIC USING (false) WITH CHECK (false);
  END IF;
END$$;

-- 2) Seed the HMAC secret (replace with a strong high-entropy secret matching EDGE_FUNCTION_SECRET)
-- IMPORTANT: Replace the placeholder below with the exact same secret used for signing in the Edge Function.
INSERT INTO private.app_config (key, value)
VALUES ('hmac_secret', '[A_NEW_HIGH_ENTROPY_SECRET]')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- 3) Drop flawed functions with p_secret signatures
DROP FUNCTION IF EXISTS public.verify_guest_session(TEXT, TEXT);
DROP FUNCTION IF EXISTS public.get_or_create_cart_secure(UUID, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.get_cart_details_secure(UUID, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.add_to_cart_secure(UUID, TEXT, TEXT, UUID, INT);
DROP FUNCTION IF EXISTS public.update_cart_item_secure(UUID, TEXT, TEXT, UUID, INT);
DROP FUNCTION IF EXISTS public.remove_item_secure(UUID, TEXT, TEXT, UUID);
DROP FUNCTION IF EXISTS public.clear_cart_secure(UUID, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.merge_carts_secure(UUID, TEXT, TEXT);

-- 4) Hardened verify_guest_session: reads secret from private.app_config
CREATE OR REPLACE FUNCTION public.verify_guest_session(p_token TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_secret TEXT;
  v_payload JSONB;
  v_sid TEXT;
  v_exp BIGINT;
BEGIN
  SELECT value INTO v_secret FROM private.app_config WHERE key = 'hmac_secret' LIMIT 1;
  IF v_secret IS NULL OR v_secret = '' THEN
    RAISE EXCEPTION 'HMAC secret not configured';
  END IF;

  v_payload := extensions.verify(p_token, v_secret);

  v_sid := v_payload->>'sid';
  v_exp := (v_payload->>'exp')::BIGINT;

  IF v_sid IS NULL OR v_sid NOT LIKE 'guest_%' THEN
    RAISE EXCEPTION 'Invalid guest session id';
  END IF;

  IF to_timestamp(v_exp) < now() THEN
    RAISE EXCEPTION 'Guest token expired';
  END IF;

  RETURN v_sid;
EXCEPTION WHEN others THEN
  RAISE EXCEPTION 'Invalid guest token';
END;
$$;

-- 5) Recreate secure RPCs without p_secret
CREATE OR REPLACE FUNCTION public.get_or_create_cart_secure(
  p_user_id UUID DEFAULT NULL,
  p_guest_token TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sid TEXT;
  v_cart_id UUID;
BEGIN
  IF p_user_id IS NULL AND p_guest_token IS NULL THEN
    RAISE EXCEPTION 'Either p_user_id or p_guest_token is required';
  END IF;
  IF p_user_id IS NOT NULL AND p_guest_token IS NOT NULL THEN
    RAISE EXCEPTION 'Provide either p_user_id or p_guest_token, not both';
  END IF;

  IF p_guest_token IS NOT NULL THEN
    v_sid := public.verify_guest_session(p_guest_token);
    SELECT id INTO v_cart_id FROM carts WHERE session_id = v_sid;
    IF v_cart_id IS NULL THEN
      INSERT INTO carts (session_id) VALUES (v_sid) RETURNING id INTO v_cart_id;
    END IF;
    RETURN v_cart_id;
  END IF;

  -- Authenticated user path (Edge Function has already validated p_user_id)
  SELECT id INTO v_cart_id FROM carts WHERE user_id = p_user_id;
  IF v_cart_id IS NULL THEN
    INSERT INTO carts (user_id) VALUES (p_user_id) RETURNING id INTO v_cart_id;
  END IF;
  RETURN v_cart_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_cart_details_secure(
  p_user_id UUID DEFAULT NULL,
  p_guest_token TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
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
      SELECT jsonb_agg(jsonb_build_object(
        'variant_id', ci.variant_id,
        'quantity', ci.quantity,
        'price_snapshot', ci.price_snapshot,
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
        'current_price', pv.price
      ))
      FROM cart_items ci
      JOIN product_variants pv ON pv.id = ci.variant_id
      JOIN products p ON p.id = pv.product_id
      LEFT JOIN inventory inv ON inv.variant_id = pv.id
      WHERE ci.cart_id = c.id
    ), '[]'::jsonb),
    'subtotal', COALESCE((
      SELECT SUM(ci.quantity * COALESCE(ci.price_snapshot, pv.price))
      FROM cart_items ci JOIN product_variants pv ON pv.id = ci.variant_id
      WHERE ci.cart_id = c.id
    ), 0),
    'item_count', COALESCE((
      SELECT SUM(ci.quantity) FROM cart_items ci WHERE ci.cart_id = c.id
    ), 0)
  )
  INTO v_result
  FROM carts c
  WHERE c.id = v_cart_id;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.add_to_cart_secure(
  p_user_id UUID DEFAULT NULL,
  p_guest_token TEXT DEFAULT NULL,
  p_variant_id UUID,
  p_quantity INT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cart_id UUID;
  v_available INT;
  v_new_qty INT;
  v_item_id UUID;
  v_variant_price NUMERIC;
BEGIN
  v_cart_id := public.get_or_create_cart_secure(p_user_id, p_guest_token);

  SELECT COALESCE(SUM(quantity_available),0) INTO v_available FROM inventory WHERE variant_id = p_variant_id;
  IF v_available <= 0 THEN
    RETURN jsonb_build_object('success', false, 'message', 'Out of stock');
  END IF;

  SELECT price INTO v_variant_price FROM product_variants WHERE id = p_variant_id; 

  INSERT INTO cart_items (cart_id, variant_id, quantity, price_snapshot)
  VALUES (v_cart_id, p_variant_id, LEAST(p_quantity, v_available, 99), v_variant_price)
  ON CONFLICT (cart_id, variant_id)
  DO UPDATE SET quantity = LEAST(cart_items.quantity + EXCLUDED.quantity, v_available, 99), price_snapshot = EXCLUDED.price_snapshot, updated_at = now()
  RETURNING id INTO v_item_id;

  RETURN jsonb_build_object('success', true, 'message', 'Item added/updated');
END;
$$;

CREATE OR REPLACE FUNCTION public.update_cart_item_secure(
  p_user_id UUID DEFAULT NULL,
  p_guest_token TEXT DEFAULT NULL,
  p_variant_id UUID,
  p_quantity INT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cart_id UUID;
  v_available INT;
  v_final INT;
BEGIN
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

CREATE OR REPLACE FUNCTION public.remove_item_secure(
  p_user_id UUID DEFAULT NULL,
  p_guest_token TEXT DEFAULT NULL,
  p_variant_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cart_id UUID;
BEGIN
  v_cart_id := public.get_or_create_cart_secure(p_user_id, p_guest_token);
  DELETE FROM cart_items WHERE cart_id = v_cart_id AND variant_id = p_variant_id;
  RETURN jsonb_build_object('success', true, 'message', 'Item removed');
END;
$$;

CREATE OR REPLACE FUNCTION public.clear_cart_secure(
  p_user_id UUID DEFAULT NULL,
  p_guest_token TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cart_id UUID;
BEGIN
  v_cart_id := public.get_or_create_cart_secure(p_user_id, p_guest_token);
  DELETE FROM cart_items WHERE cart_id = v_cart_id;
  RETURN jsonb_build_object('success', true, 'message', 'Cart cleared');
END;
$$;

CREATE OR REPLACE FUNCTION public.merge_carts_secure(
  p_user_id UUID,
  p_guest_token TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_cart_id UUID;
  v_guest_sid TEXT;
  v_guest_cart_id UUID;
  v_merged_count INT := 0;
  v_clamped_count INT := 0;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'p_user_id is required';
  END IF;

  v_guest_sid := public.verify_guest_session(p_guest_token);

  -- Lock carts deterministically
  SELECT id INTO v_user_cart_id FROM carts WHERE user_id = p_user_id FOR UPDATE;
  SELECT id INTO v_guest_cart_id FROM carts WHERE session_id = v_guest_sid FOR UPDATE;

  IF v_guest_cart_id IS NULL THEN
    RETURN jsonb_build_object('success', true, 'merged_items', 0, 'clamped_items', 0);
  END IF;

  IF v_user_cart_id IS NULL THEN
    INSERT INTO carts (user_id) VALUES (p_user_id) RETURNING id INTO v_user_cart_id;
  END IF;

  WITH guest_items AS (
    SELECT ci.variant_id, ci.quantity FROM cart_items ci WHERE ci.cart_id = v_guest_cart_id
  ),
  stock AS (
    SELECT gi.variant_id,
           gi.quantity AS guest_qty,
           COALESCE(SUM(inv.quantity_available),0) AS available,
           COALESCE(uci.quantity,0) AS existing
    FROM guest_items gi
    LEFT JOIN inventory inv ON inv.variant_id = gi.variant_id
    LEFT JOIN cart_items uci ON uci.cart_id = v_user_cart_id AND uci.variant_id = gi.variant_id
    GROUP BY gi.variant_id, gi.quantity, uci.quantity
  ),
  applied AS (
    INSERT INTO cart_items (cart_id, variant_id, quantity)
    SELECT v_user_cart_id,
           s.variant_id,
           LEAST(s.guest_qty + s.existing, s.available, 99)
    FROM stock s
    WHERE s.available > 0
    ON CONFLICT (cart_id, variant_id)
    DO UPDATE SET quantity = LEAST(cart_items.quantity + EXCLUDED.quantity, EXCLUDED.quantity, 99), updated_at = now()
    RETURNING variant_id, quantity
  )
  SELECT COUNT(*), 0 INTO v_merged_count, v_clamped_count FROM applied;

  DELETE FROM cart_items WHERE cart_id = v_guest_cart_id;
  DELETE FROM carts WHERE id = v_guest_cart_id;

  UPDATE carts SET updated_at = now() WHERE id = v_user_cart_id;

  RETURN jsonb_build_object('success', true, 'merged_items', v_merged_count, 'clamped_items', v_clamped_count, 'user_cart_id', v_user_cart_id);
END;
$$;

COMMIT;
