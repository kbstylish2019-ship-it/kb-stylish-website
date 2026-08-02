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
    
    // Create authenticated Supabase client
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
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

    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: 'You must be logged in to cancel a reservation' },
        { status: 401 }
      );
    }
    
    const query = supabase
      .from('booking_reservations')
      .update({
        status: 'cancelled',
        updated_at: new Date().toISOString()
      })
      .eq('id', reservationId)
      .eq('customer_user_id', user.id)
      .eq('status', 'reserved');
    
    // Use select() without single() to avoid error on 0 rows
    const { data, error } = await query.select();
    
    if (error) {
      console.error('[cancel-reservation] Database error:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to cancel reservation' },
        { status: 500 }
      );
    }
    
    // Check if any rows were updated
    if (!data || data.length === 0) {
      console.warn('[cancel-reservation] No reservation found:', {
        reservationId
      });
      return NextResponse.json(
        { success: false, error: 'Reservation not found or already cancelled' },
        { status: 404 }
      );
    }
    
    const reservation = data[0];
    
    console.log('[cancel-reservation] Successfully cancelled reservation:', {
      reservationId,
      customerId: reservation.customer_user_id,
      slotTime: reservation.start_time
    });
    
    return NextResponse.json({
      success: true,
      message: 'Reservation cancelled successfully',
      reservation: reservation
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
