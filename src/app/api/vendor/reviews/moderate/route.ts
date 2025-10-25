import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * Vendor Review Moderation API
 * 
 * Allows vendors to approve or reject reviews on their products
 */
export async function POST(req: NextRequest) {
  try {
    const { reviewId, action } = await req.json();

    // Validate input
    if (!reviewId || !action) {
      return NextResponse.json(
        { success: false, error: 'Missing reviewId or action' },
        { status: 400 }
      );
    }

    if (!['approve', 'reject'].includes(action)) {
      return NextResponse.json(
        { success: false, error: 'Invalid action. Must be approve or reject' },
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

    // Verify vendor authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Verify user is a vendor
    const roles = user.app_metadata?.user_roles || user.user_metadata?.user_roles || [];
    if (!roles.includes('vendor')) {
      return NextResponse.json(
        { success: false, error: 'Vendor access required' },
        { status: 403 }
      );
    }

    // First, verify this review is on the vendor's product
    const { data: review, error: reviewError } = await supabase
      .from('reviews')
      .select(`
        id,
        product_id,
        products!inner(id, name, vendor_id)
      `)
      .eq('id', reviewId)
      .single();

    if (reviewError || !review) {
      return NextResponse.json(
        { success: false, error: 'Review not found' },
        { status: 404 }
      );
    }

    // Verify vendor owns this product
    const product = (review as any).products;
    if (product.vendor_id !== user.id) {
      return NextResponse.json(
        { success: false, error: 'You can only moderate reviews on your own products' },
        { status: 403 }
      );
    }

    // Update review status
    const updateData = action === 'approve' 
      ? {
          is_approved: true,
          moderation_status: 'approved',
          moderated_at: new Date().toISOString(),
          moderated_by: user.id
        }
      : {
          is_approved: false,
          moderation_status: 'rejected',
          moderated_at: new Date().toISOString(),
          moderated_by: user.id
        };

    const { error: updateError } = await supabase
      .from('reviews')
      .update(updateData)
      .eq('id', reviewId);

    if (updateError) {
      console.error('[Moderate Review] Update error:', updateError);
      return NextResponse.json(
        { success: false, error: 'Failed to update review' },
        { status: 500 }
      );
    }

    return NextResponse.json({ 
      success: true,
      message: action === 'approve' ? 'Review approved successfully' : 'Review rejected successfully',
      action
    });

  } catch (error) {
    console.error('[Moderate Review] Exception:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
