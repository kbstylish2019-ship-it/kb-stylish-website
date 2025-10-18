import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { isPast, parseISO } from 'date-fns';

/**
 * API Route: POST /api/bookings/[id]/cancel
 * 
 * Cancels a customer's booking
 * 
 * Security:
 * - Requires authentication
 * - Customer can only cancel their own bookings (RLS enforced)
 * - Cannot cancel past bookings
 * - Cannot cancel already cancelled bookings
 * 
 * Response:
 * {
 *   success: boolean,
 *   message?: string,
 *   error?: string
 * }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    // ========================================================================
    // AUTHENTICATION
    // ========================================================================
    
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
              // Server Component limitation
            }
          },
        },
      }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // ========================================================================
    // FETCH BOOKING TO VALIDATE
    // ========================================================================
    
    const { data: booking, error: fetchError } = await supabase
      .from('bookings')
      .select('id, customer_user_id, start_time, status')
      .eq('id', id)
      .eq('customer_user_id', user.id) // RLS also enforces this
      .single();

    if (fetchError || !booking) {
      return NextResponse.json(
        { success: false, error: 'Booking not found' },
        { status: 404 }
      );
    }

    // ========================================================================
    // VALIDATION
    // ========================================================================
    
    // Check if already cancelled
    if (booking.status === 'cancelled') {
      return NextResponse.json(
        { success: false, error: 'Booking already cancelled' },
        { status: 400 }
      );
    }

    // Check if booking is in the past
    if (isPast(parseISO(booking.start_time))) {
      return NextResponse.json(
        { success: false, error: 'Cannot cancel past bookings' },
        { status: 400 }
      );
    }

    // Check if booking already completed
    if (['completed', 'in_progress'].includes(booking.status)) {
      return NextResponse.json(
        { success: false, error: 'Cannot cancel completed or in-progress bookings' },
        { status: 400 }
      );
    }

    // ========================================================================
    // CANCEL BOOKING
    // ========================================================================
    
    const { error: updateError } = await supabase
      .from('bookings')
      .update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        cancelled_by: user.id,
        cancellation_reason: 'Cancelled by customer',
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('customer_user_id', user.id); // Double-check ownership

    if (updateError) {
      console.error('[/api/bookings/cancel] Update error:', updateError);
      return NextResponse.json(
        { success: false, error: 'Failed to cancel booking' },
        { status: 500 }
      );
    }

    // ========================================================================
    // RETURN SUCCESS
    // ========================================================================
    
    return NextResponse.json({
      success: true,
      message: 'Booking cancelled successfully',
    });

  } catch (error) {
    console.error('[/api/bookings/cancel] Unexpected error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Internal server error' 
      },
      { status: 500 }
    );
  }
}
