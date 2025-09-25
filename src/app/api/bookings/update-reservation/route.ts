/**
 * API Route: Update Booking Reservation
 * Part of THE GREAT DECOUPLING
 * 
 * Updates existing booking reservations (change appointment functionality)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Validate required fields
    const { reservationId, serviceId, startTime } = body;
    
    if (!reservationId) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Reservation ID is required',
          code: 'VALIDATION_ERROR'
        },
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
          getAll: () => cookieStore.getAll(),
          setAll: (cookiesToSet) => {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          }
        }
      }
    );
    
    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json(
        { 
          success: false,
          error: 'You must be logged in to update an appointment',
          code: 'AUTH_REQUIRED'
        },
        { status: 401 }
      );
    }
    
    // Call the PostgreSQL RPC to update reservation
    const { data, error } = await supabase
      .rpc('update_booking_reservation', {
        p_reservation_id: reservationId,
        p_customer_id: user.id,
        p_service_id: serviceId,
        p_start_time: startTime
      });
    
    if (error) {
      console.error('Update reservation RPC error:', error);
      console.error('Error details:', error.message, error.details);
      
      // Check for specific error codes
      if (error.message?.includes('not found') || error.message?.includes('NOT_FOUND')) {
        return NextResponse.json({
          success: false,
          error: 'Appointment not found or expired',
          code: 'RESERVATION_NOT_FOUND'
        });
      }
      
      if (error.message?.includes('slot is no longer available') || error.message?.includes('SLOT_UNAVAILABLE')) {
        return NextResponse.json({
          success: false,
          error: 'This time slot is no longer available',
          code: 'SLOT_UNAVAILABLE'
        });
      }
      
      // Return detailed error for debugging
      return NextResponse.json({
        success: false,
        error: error.message || 'Failed to update reservation',
        code: 'UPDATE_FAILED',
        details: error.details || error.message
      });
    }
    
    // Handle the response based on the RPC return
    if (data && typeof data === 'object') {
      if (data.success === false) {
        return NextResponse.json({
          success: false,
          error: data.error || 'Update failed',
          code: data.code || 'UNKNOWN_ERROR'
        });
      }
      
      // Transform snake_case to camelCase
      return NextResponse.json({
        success: true,
        reservation_id: data.reservation_id,
        service_name: data.service_name,
        stylist_name: data.stylist_name,
        start_time: data.start_time,
        end_time: data.end_time,
        price_cents: data.price_cents,
        expires_at: data.expires_at
      });
    }
    
    // Fallback response
    return NextResponse.json({
      success: false,
      error: 'Unexpected response from update service',
      code: 'INVALID_RESPONSE'
    });
    
  } catch (error) {
    console.error('API route error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Internal server error',
        code: 'SERVER_ERROR'
      },
      { status: 500 }
    );
  }
}
