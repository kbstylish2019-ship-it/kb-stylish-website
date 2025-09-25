import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * API Route: POST /api/bookings/cancel-reservation
 * Cancels a booking reservation to immediately free up the slot
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { reservationId } = body;
    
    if (!reservationId) {
      return NextResponse.json(
        { success: false, error: 'Reservation ID is required' },
        { status: 400 }
      );
    }
    
    // Create Supabase client
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!, // Use service role for admin operations
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              )
            } catch {
              // The `setAll` method was called from a Server Component.
            }
          },
        },
      }
    );
    
    // Get the current user (optional for guest cancellations)
    const { data: { user } } = await supabase.auth.getUser();
    
    // Cancel the reservation (mark as cancelled instead of deleting)
    // For guest users, we can't verify ownership by user ID, 
    // so we rely on the reservation ID being secret/unique
    let query = supabase
      .from('booking_reservations')
      .update({
        status: 'cancelled',
        updated_at: new Date().toISOString()
      })
      .eq('id', reservationId);
    
    // Only add user check if authenticated
    if (user) {
      query = query.eq('customer_user_id', user.id);
    }
    
    const { data, error } = await query.select().single();
    
    if (error) {
      console.error('[cancel-reservation] Database error:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to cancel reservation' },
        { status: 500 }
      );
    }
    
    if (!data) {
      return NextResponse.json(
        { success: false, error: 'Reservation not found or unauthorized' },
        { status: 404 }
      );
    }
    
    console.log('[cancel-reservation] Successfully cancelled reservation:', {
      reservationId,
      userId: user?.id || 'guest',
      slotTime: data.start_time
    });
    
    return NextResponse.json({
      success: true,
      message: 'Reservation cancelled successfully',
      reservation: data
    });
    
  } catch (error) {
    console.error('[cancel-reservation] Unexpected error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Internal server error' 
      },
      { status: 500 }
    );
  }
}
