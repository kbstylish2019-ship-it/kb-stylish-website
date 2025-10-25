import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * Vendor Reviews API - List reviews on vendor's products
 * 
 * Allows vendors to:
 * - View all reviews on their products
 * - Filter by: pending reply, replied, all
 * - Filter by specific product
 * - See review details for replying
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const productId = searchParams.get('productId');
    const status = searchParams.get('status') || 'all'; // all | pending_reply | replied

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
        { error: 'Unauthorized', reviews: [], count: 0 },
        { status: 401 }
      );
    }

    // Verify user is a vendor
    // CRITICAL: Check BOTH app_metadata and user_metadata for roles
    // Some users have roles in app_metadata, others in user_metadata
    const roles = user.app_metadata?.user_roles || user.user_metadata?.user_roles || [];
    if (!roles.includes('vendor')) {
      return NextResponse.json(
        { error: 'Vendor access required', reviews: [], count: 0 },
        { status: 403 }
      );
    }

    // Build query - fetch ALL reviews on vendor's products (including pending)
    let query = supabase
      .from('reviews')
      .select(`
        *,
        product:products!inner(id, name, vendor_id),
        author:user_profiles!reviews_user_id_fkey(display_name, avatar_url),
        replies:review_replies(id, comment, created_at, user_id)
      `)
      .eq('products.vendor_id', user.id)
      .is('deleted_at', null)
      .order('is_approved', { ascending: true })  // Pending first
      .order('created_at', { ascending: false });

    // Filter by product if specified
    if (productId) {
      query = query.eq('product_id', productId);
    }

    // Filter by reply status
    if (status === 'pending_reply') {
      // Reviews with no replies
      query = query.is('replies.id', null);
    } else if (status === 'replied') {
      // Reviews with at least one reply
      query = query.not('replies.id', 'is', null);
    }

    // Limit to recent 100 reviews
    query = query.limit(100);

    const { data: reviews, error } = await query;

    if (error) {
      console.error('[Vendor Reviews API] Error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch reviews', reviews: [], count: 0 },
        { status: 500 }
      );
    }

    // Process reviews to handle reply arrays
    const processedReviews = (reviews || []).map((review: any) => {
      // Filter vendor replies only
      const vendorReplies = (review.replies || []).filter(
        (r: any) => r.user_id === user.id
      );

      return {
        ...review,
        has_vendor_reply: vendorReplies.length > 0,
        vendor_reply: vendorReplies[0] || null,
        replies: undefined // Remove raw replies array
      };
    });

    // Apply client-side filtering for pending_reply/replied
    // (since Supabase query doesn't fully support this pattern)
    let filteredReviews = processedReviews;
    if (status === 'pending_reply') {
      filteredReviews = processedReviews.filter((r: any) => !r.has_vendor_reply);
    } else if (status === 'replied') {
      filteredReviews = processedReviews.filter((r: any) => r.has_vendor_reply);
    }

    return NextResponse.json({ 
      success: true, 
      reviews: filteredReviews,
      count: filteredReviews.length
    });

  } catch (error) {
    console.error('[Vendor Reviews API] Exception:', error);
    return NextResponse.json(
      { error: 'Internal server error', reviews: [], count: 0 },
      { status: 500 }
    );
  }
}
