import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * Track Order API Endpoint
 * 
 * Public endpoint - no authentication required
 * Allows customers to track orders by order number
 * 
 * Security: Only returns order details, no sensitive payment info
 */

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const orderNumber = searchParams.get('order_number');

    // Validate input
    if (!orderNumber) {
      return NextResponse.json(
        { error: 'Order number is required' },
        { status: 400 }
      );
    }

    // Create Supabase client
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
        },
      }
    );

    // Fetch order details
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select(`
        order_number,
        status,
        created_at,
        confirmed_at,
        shipped_at,
        delivered_at,
        canceled_at,
        tracking_number,
        total_cents,
        shipping_name,
        shipping_phone,
        shipping_address_line1,
        shipping_address_line2,
        shipping_city,
        shipping_state,
        shipping_postal_code
      `)
      .eq('order_number', orderNumber.trim().toUpperCase())
      .single();

    if (orderError || !order) {
      console.error('[TrackOrder] Order not found:', orderError);
      return NextResponse.json(
        { error: 'Order not found. Please check your order number and try again.' },
        { status: 404 }
      );
    }

    // Get order ID first
    const { data: orderIdData } = await supabase
      .from('orders')
      .select('id')
      .eq('order_number', orderNumber.trim().toUpperCase())
      .single();

    // Fetch order items with correct column names including fulfillment status
    const { data: items, error: itemsError } = await supabase
      .from('order_items')
      .select(`
        quantity,
        unit_price_cents,
        total_price_cents,
        product_name,
        variant_sku,
        fulfillment_status,
        tracking_number,
        shipping_carrier
      `)
      .eq('order_id', orderIdData?.id);

    if (itemsError) {
      console.error('[TrackOrder] Error fetching items:', itemsError);
    }

    // Return order details (no sensitive payment information)
    return NextResponse.json({
      success: true,
      order: {
        ...order,
        items: items || [],
      },
    });

  } catch (error) {
    console.error('[TrackOrder] Unexpected error:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred. Please try again later.' },
      { status: 500 }
    );
  }
}
