-- Secure Guest Sessions and Merge Hardening
-- Created: 2025-09-19 12:05:17

-- 1) Dependencies
CREATE EXTENSION IF NOT EXISTS pgjwt;

-- 2) Drop insecure helpers
DROP FUNCTION IF EXISTS public.validate_guest_session(TEXT);

-- 3) Verify signed guest token and return sid (guest session id)
--    Token must be HS256-signed with the secret provided by the Edge Function
CREATE OR REPLACE FUNCTION public.verify_guest_session(p_token TEXT, p_secret TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_payload JSONB;
  v_sid TEXT;
  v_exp BIGINT;
BEGIN
  -- Verify signature and decode payload using pgjwt (installed in extensions schema)
  v_payload := extensions.verify(p_token, p_secret);

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

-- 5) Secure cart acquisition using signed token
CREATE OR REPLACE FUNCTION public.get_or_create_cart_secure(
  p_user_id UUID DEFAULT NULL,
  p_guest_token TEXT DEFAULT NULL,
  p_secret TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
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
    v_sid := public.verify_guest_session(p_guest_token, p_secret);
    SELECT id INTO v_cart_id FROM carts WHERE session_id = v_sid;
    IF v_cart_id IS NULL THEN
      INSERT INTO carts (session_id) VALUES (v_sid) RETURNING id INTO v_cart_id;
    END IF;
    RETURN v_cart_id;
  END IF;

  -- Authenticated user path
  IF p_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Cannot access another user''s cart';
  END IF;

  SELECT id INTO v_cart_id FROM carts WHERE user_id = p_user_id;
  IF v_cart_id IS NULL THEN
    INSERT INTO carts (user_id) VALUES (p_user_id) RETURNING id INTO v_cart_id;
  END IF;
  RETURN v_cart_id;
END;
$$;

-- 6) Secure cart details aggregator (returns JSONB)
CREATE OR REPLACE FUNCTION public.get_cart_details_secure(
  p_user_id UUID DEFAULT NULL,
  p_guest_token TEXT DEFAULT NULL,
  p_secret TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_cart_id UUID;
  v_result JSONB;
BEGIN
  v_cart_id := public.get_or_create_cart_secure(p_user_id, p_guest_token, p_secret);

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

-- 7) Secure cart mutations
CREATE OR REPLACE FUNCTION public.add_to_cart_secure(
  p_user_id UUID DEFAULT NULL,
  p_guest_token TEXT DEFAULT NULL,
  p_secret TEXT DEFAULT NULL,
  p_variant_id UUID,
  p_quantity INT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_cart_id UUID;
  v_available INT;
  v_new_qty INT;
  v_item_id UUID;
  v_variant_price NUMERIC;
BEGIN
  v_cart_id := public.get_or_create_cart_secure(p_user_id, p_guest_token, p_secret);

  SELECT COALESCE(SUM(quantity_available),0) INTO v_available FROM inventory WHERE variant_id = p_variant_id;
  IF v_available <= 0 THEN
    RETURN jsonb_build_object('success', false, 'message', 'Out of stock');
  END IF;

  SELECT price INTO v_variant_price FROM product_variants WHERE id = p_variant_id; 

  -- Upsert with clamp (max 99)
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
  p_secret TEXT DEFAULT NULL,
  p_variant_id UUID,
  p_quantity INT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_cart_id UUID;
  v_available INT;
  v_final INT;
BEGIN
  v_cart_id := public.get_or_create_cart_secure(p_user_id, p_guest_token, p_secret);

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
  p_secret TEXT DEFAULT NULL,
  p_variant_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_cart_id UUID;
BEGIN
  v_cart_id := public.get_or_create_cart_secure(p_user_id, p_guest_token, p_secret);
  DELETE FROM cart_items WHERE cart_id = v_cart_id AND variant_id = p_variant_id;
  RETURN jsonb_build_object('success', true, 'message', 'Item removed');
END;
$$;

CREATE OR REPLACE FUNCTION public.clear_cart_secure(
  p_user_id UUID DEFAULT NULL,
  p_guest_token TEXT DEFAULT NULL,
  p_secret TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_cart_id UUID;
BEGIN
  v_cart_id := public.get_or_create_cart_secure(p_user_id, p_guest_token, p_secret);
  DELETE FROM cart_items WHERE cart_id = v_cart_id;
  RETURN jsonb_build_object('success', true, 'message', 'Cart cleared');
END;
$$;

-- 8) Hardened merge (uses signed guest token)
CREATE OR REPLACE FUNCTION public.merge_carts_secure(
  p_user_id UUID,
  p_guest_token TEXT,
  p_secret TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_cart_id UUID;
  v_guest_sid TEXT;
  v_guest_cart_id UUID;
  v_merged_count INT := 0;
  v_clamped_count INT := 0;
BEGIN
  IF p_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Cannot merge into different user''s cart';
  END IF;

  v_guest_sid := public.verify_guest_session(p_guest_token, p_secret);

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
