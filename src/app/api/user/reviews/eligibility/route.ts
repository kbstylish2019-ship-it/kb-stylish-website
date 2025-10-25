import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * Check if user can submit a review for a product
 * Returns: { canReview: boolean, orderId: string | null, reason?: string }
 * 
 * This endpoint prevents the frontend from showing the review form to ineligible users.
 * Backend RPC still validates, but this provides early feedback.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const productId = searchParams.get('productId');

    if (!productId) {
      return NextResponse.json(
        { error: 'Product ID required', canReview: false },
        { status: 400 }
      );
    }

    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          }
        }
      }
    );

    // Verify authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({
        canReview: false,
        orderId: null,
        reason: 'AUTH_REQUIRED',
        message: 'You must be logged in to review products'
      });
    }

    // Check if user is a vendor (vendors can't review any products)
    // CRITICAL: Check BOTH app_metadata and user_metadata for roles
    const roles = user.app_metadata?.user_roles || user.user_metadata?.user_roles || [];
    if (roles.includes('vendor')) {
      return NextResponse.json({
        canReview: false,
        orderId: null,
        reason: 'VENDOR_RESTRICTION',
        message: 'Vendors cannot submit reviews'
      });
    }

    // Check if user already reviewed this product
    const { data: existingReview } = await supabase
      .from('reviews')
      .select('id')
      .eq('product_id', productId)
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .maybeSingle();

    if (existingReview) {
      return NextResponse.json({
        canReview: false,
        orderId: null,
        reason: 'ALREADY_REVIEWED',
        message: 'You have already reviewed this product'
      });
    }

    // Find the most recent delivered item for this product
    // CRITICAL FIX: Query order_items table directly (not orders with embedded items)
    // An order can have status="confirmed" while individual items are "delivered"
    const { data: orderItem, error: orderError } = await supabase
      .from('order_items')
      .select(`
        id,
        order_id,
        product_id,
        fulfillment_status,
        delivered_at,
        order:orders!inner(user_id, status)
      `)
      .eq('order.user_id', user.id)
      .eq('product_id', productId)
      .eq('fulfillment_status', 'delivered')
      .order('delivered_at', { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();

    console.log('[Review Eligibility] Query result:', {
      hasData: !!orderItem,
      error: orderError,
      productId,
      userId: user.id
    });

    if (orderError || !orderItem) {
      console.error('[Review Eligibility] No delivered item found:', orderError);
      return NextResponse.json({
        canReview: false,
        orderId: null,
        reason: 'NO_PURCHASE',
        message: 'You must purchase this product before reviewing it'
      });
    }

    // Check if review window has expired (90 days from ITEM delivery, not order)
    if (orderItem.delivered_at) {
      const deliveredDate = new Date(orderItem.delivered_at);
      const daysSinceDelivery = Math.floor(
        (Date.now() - deliveredDate.getTime()) / (1000 * 60 * 60 * 24)
      );

      console.log('[Review Eligibility] Days since delivery:', daysSinceDelivery);

      if (daysSinceDelivery > 90) {
        return NextResponse.json({
          canReview: false,
          orderId: null,
          reason: 'REVIEW_WINDOW_EXPIRED',
          message: 'Review period has expired (90 days after delivery)'
        });
      }
    }

    // User is eligible!
    console.log('[Review Eligibility] User eligible, order_id:', orderItem.order_id);
    return NextResponse.json({
      canReview: true,
      orderId: orderItem.order_id,
      reason: null,
      message: 'You can review this product'
    });

  } catch (error) {
    console.error('[Review Eligibility] Error:', error);
    return NextResponse.json(
      { 
        error: 'Internal server error',
        canReview: false,
        orderId: null
      },
      { status: 500 }
    );
  }
}
