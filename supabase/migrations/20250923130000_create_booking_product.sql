-- =====================================================================
-- Create a special product entry for bookings
-- This allows bookings to be added to cart alongside regular products
-- =====================================================================

-- Create a special category for bookings
INSERT INTO public.categories (id, name, slug, description)
VALUES (
    'cat_bookings',
    'Bookings',
    'bookings',
    'Service bookings and appointments'
) ON CONFLICT (id) DO NOTHING;

-- Create a special product for bookings
-- This acts as a placeholder that allows bookings to flow through cart
INSERT INTO public.products (
    id,
    name,
    slug,
    description,
    category_id,
    vendor_id,
    is_active,
    is_featured,
    created_at,
    updated_at
)
SELECT
    'prod_booking_placeholder',
    'Service Booking',
    'service-booking',
    'Professional styling service booking',
    'cat_bookings',
    u.id, -- Use first admin user as vendor
    true,
    false,
    NOW(),
    NOW()
FROM public.user_profiles u
WHERE u.id IN (
    SELECT ur.user_id 
    FROM public.user_roles ur 
    JOIN public.roles r ON ur.role_id = r.id 
    WHERE r.role_name = 'admin'
    LIMIT 1
)
ON CONFLICT (id) DO NOTHING;

-- Create booking product variants dynamically
-- Each booking creates its own variant
CREATE OR REPLACE FUNCTION public.create_booking_variant(
    p_booking_id UUID,
    p_price_cents INTEGER,
    p_service_name TEXT
) RETURNS UUID AS $$
DECLARE
    v_variant_id UUID;
BEGIN
    -- Use booking ID as variant ID for simplicity
    v_variant_id := p_booking_id;
    
    -- Insert product variant for this booking
    INSERT INTO public.product_variants (
        id,
        product_id,
        name,
        sku,
        price,
        created_at,
        updated_at
    )
    VALUES (
        v_variant_id,
        'prod_booking_placeholder',
        'Booking: ' || p_service_name,
        'BOOKING_' || UPPER(REPLACE(p_booking_id::TEXT, '-', '')),
        p_price_cents / 100.0, -- Convert cents to decimal
        NOW(),
        NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
        price = EXCLUDED.price,
        updated_at = NOW();
    
    -- Create inventory record (unlimited for bookings)
    INSERT INTO public.inventory (
        id,
        variant_id,
        quantity_available,
        quantity_reserved,
        version,
        last_updated
    )
    VALUES (
        gen_random_uuid(),
        v_variant_id,
        999999, -- Effectively unlimited
        0,
        1,
        NOW()
    )
    ON CONFLICT (variant_id) DO NOTHING;
    
    RETURN v_variant_id;
END;
$$ LANGUAGE plpgsql;

-- Modify create_booking to also create a product variant
CREATE OR REPLACE FUNCTION public.create_booking_with_variant(
    p_customer_id UUID,
    p_stylist_id UUID,
    p_service_id UUID,
    p_start_time TIMESTAMPTZ,
    p_customer_name TEXT,
    p_customer_phone TEXT DEFAULT NULL,
    p_customer_email TEXT DEFAULT NULL,
    p_customer_notes TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
    v_booking_result JSONB;
    v_variant_id UUID;
    v_service_name TEXT;
BEGIN
    -- First create the booking using existing function
    v_booking_result := public.create_booking(
        p_customer_id,
        p_stylist_id,
        p_service_id,
        p_start_time,
        p_customer_name,
        p_customer_phone,
        p_customer_email,
        p_customer_notes
    );
    
    -- If booking was successful, create product variant
    IF (v_booking_result->>'success')::BOOLEAN THEN
        -- Get service name
        SELECT name INTO v_service_name
        FROM public.services
        WHERE id = p_service_id;
        
        -- Create product variant for this booking
        v_variant_id := public.create_booking_variant(
            (v_booking_result->>'booking_id')::UUID,
            (v_booking_result->>'price_cents')::INTEGER,
            v_service_name
        );
        
        -- Add variant_id to result
        v_booking_result := v_booking_result || jsonb_build_object('variant_id', v_variant_id);
    END IF;
    
    RETURN v_booking_result;
END;
$$ LANGUAGE plpgsql;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.create_booking_variant TO service_role;
GRANT EXECUTE ON FUNCTION public.create_booking_with_variant TO service_role;

-- Add comment
COMMENT ON FUNCTION public.create_booking_with_variant IS 'Creates a booking and corresponding product variant for cart integration';
