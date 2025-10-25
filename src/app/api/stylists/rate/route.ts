import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { z } from 'zod';

// Request validation schema
const ratingSchema = z.object({
  booking_id: z.string().uuid('Invalid booking ID'),
  rating: z.number().int().min(1).max(5, 'Rating must be between 1 and 5'),
  review_text: z.string().max(1000, 'Review must be 1000 characters or less').optional().nullable(),
});

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              );
            } catch {}
          },
        },
      }
    );
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }
    
    // Parse and validate request body
    const body = await request.json();
    const validation = ratingSchema.safeParse(body);
    
    if (!validation.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'Validation failed',
          details: validation.error.issues
        },
        { status: 400 }
      );
    }
    
    const { booking_id, rating, review_text } = validation.data;
    
    // Submit rating via RPC (handles all validation)
    const { data, error } = await supabase.rpc('submit_rating_atomic', {
      p_booking_id: booking_id,
      p_rating: rating,
      p_review_text: review_text || null
    });
    
    if (error) {
      console.error('[RATING API] RPC Error:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to submit rating' },
        { status: 500 }
      );
    }
    
    // Check if RPC returned error
    if (data && !data.success) {
      return NextResponse.json(
        { success: false, error: data.error },
        { status: 400 }
      );
    }
    
    console.log(`[RATING API] Rating submitted - User: ${user.id}, Booking: ${booking_id}, Rating: ${rating}`);
    
    return NextResponse.json({
      success: true,
      rating_id: data.rating_id,
      message: 'Thank you for your rating!'
    });
    
  } catch (error) {
    console.error('[RATING API] Unexpected error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
