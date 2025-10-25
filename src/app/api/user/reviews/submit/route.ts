import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { verifyCsrfToken, CSRF_TOKEN_HEADER } from '@/lib/csrf';
import { checkRateLimit } from '@/lib/rate-limit';

/**
 * Review Submission API Route with Rate Limiting
 * 
 * This route adds an additional layer of protection by implementing:
 * 1. CSRF token verification
 * 2. Rate limiting (5 reviews per hour per user)
 * 3. Request validation before forwarding to Edge Function
 * 
 * While the Edge Function does the heavy lifting, this route prevents
 * spam attempts from even reaching the backend.
 */
export async function POST(req: NextRequest) {
  try {
    // CSRF Protection
    const csrfToken = req.headers.get(CSRF_TOKEN_HEADER);
    const csrfValid = await verifyCsrfToken(csrfToken);
    
    if (!csrfValid) {
      console.error('[Review Submit API] CSRF validation failed');
      return NextResponse.json({ 
        success: false, 
        error: 'Invalid security token. Please refresh the page.',
        error_code: 'CSRF_INVALID' 
      }, { status: 403 });
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
        success: false,
        error: 'Authentication required',
        error_code: 'AUTH_REQUIRED'
      }, { status: 401 });
    }

    // Rate Limiting: 5 reviews per hour per user
    const { allowed, remaining, resetAt } = await checkRateLimit(
      `review:${user.id}`,
      5,        // Max 5 reviews
      3600      // Per hour (3600 seconds)
    );

    if (!allowed) {
      const resetInMinutes = resetAt 
        ? Math.ceil((resetAt - Date.now()) / 60000)
        : 60;
      
      console.warn(`[Review Submit API] Rate limit exceeded for user ${user.id}`);
      
      return NextResponse.json({
        success: false,
        error: `Too many review submissions. Please try again in ${resetInMinutes} minutes.`,
        error_code: 'RATE_LIMIT_EXCEEDED',
        resetAt,
        remaining: 0
      }, { status: 429 });
    }

    console.log(`[Review Submit API] Rate limit check passed. Remaining: ${remaining}`);

    // Validate request body
    const body = await req.json();
    const { productId, orderId, rating, title, comment } = body;

    if (!productId || !orderId || !rating) {
      return NextResponse.json({
        success: false,
        error: 'Missing required fields: productId, orderId, rating',
        error_code: 'INVALID_REQUEST'
      }, { status: 400 });
    }

    if (rating < 1 || rating > 5) {
      return NextResponse.json({
        success: false,
        error: 'Rating must be between 1 and 5',
        error_code: 'INVALID_RATING'
      }, { status: 400 });
    }

    // Forward to Edge Function (which does the actual work)
    // The RPC function will verify purchase, check duplicates, etc.
    const { data, error } = await supabase.rpc('submit_review_secure', {
      p_product_id: productId,
      p_order_id: orderId,
      p_rating: rating,
      p_title: title || null,
      p_comment: comment || null
    });

    if (error) {
      console.error('[Review Submit API] RPC error:', error);
      return NextResponse.json({
        success: false,
        error: 'Failed to submit review',
        error_code: 'SUBMISSION_FAILED'
      }, { status: 400 });
    }

    // Check if RPC returned an error
    if (data && !data.success) {
      return NextResponse.json({
        success: false,
        error: data.error || 'Failed to submit review',
        error_code: data.error_code || 'SUBMISSION_FAILED'
      }, { status: 400 });
    }

    // Success response
    return NextResponse.json({
      success: true,
      review: {
        id: data.review_id,
        status: data.status
      },
      message: data.message,
      rateLimit: {
        remaining,
        resetAt
      }
    });

  } catch (error) {
    console.error('[Review Submit API] Error:', error);
    return NextResponse.json({
      success: false,
      error: 'Internal server error',
      error_code: 'INTERNAL_ERROR'
    }, { status: 500 });
  }
}
