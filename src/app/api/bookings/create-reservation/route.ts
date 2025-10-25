/**
 * API Route: Create Booking Reservation
 * Part of THE GREAT DECOUPLING
 * 
 * Creates temporary booking reservations that are separate from the product cart
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Validate required fields
    const { 
      stylistId, 
      serviceId, 
      startTime, 
      customerName, 
      customerPhone,
      customerEmail,
      customerNotes 
    } = body;
    
    if (!stylistId || !serviceId || !startTime || !customerName) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Missing required fields',
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
    
    // Get authenticated user (optional for guest bookings)
    const { data: { user } } = await supabase.auth.getUser();
    
    // Generate a guest ID if not authenticated
    let customerId = user?.id;
    if (!customerId) {
      // For guest users, generate a valid UUID
      // We use all zeros for the first part to identify guest bookings
      const guestId = `00000000-0000-0000-0000-${Date.now().toString().slice(-12).padStart(12, '0')}`;
      customerId = guestId;
      
      console.log('[create-reservation] Guest booking with ID:', guestId);
    } else {
      console.log('[create-reservation] Authenticated booking for user:', user?.email);
    }
    
    // Call the PostgreSQL RPC to create reservation
    // Note: For guest users, we pass a generated guest ID
    const { data, error } = await supabase
      .rpc('create_booking_reservation', {
        p_customer_id: customerId,
        p_stylist_id: stylistId,
        p_service_id: serviceId,
        p_start_time: startTime,
        p_customer_name: customerName,
        p_customer_phone: customerPhone || null,
        p_customer_email: customerEmail || user?.email || null,
        p_customer_notes: customerNotes || null,
        p_ttl_minutes: 15 // 15-minute TTL for reservations
      });
    
    if (error) {
      console.error('Reservation RPC error:', error);
      console.error('Error details:', error.message, error.details);
      
      // Check for specific error codes
      if (error.message?.includes('slot is no longer available') || error.message?.includes('SLOT_UNAVAILABLE')) {
        return NextResponse.json({
          success: false,
          error: 'This time slot is no longer available. Someone else may have just booked it.',
          code: 'SLOT_UNAVAILABLE'
        });
      }
      
      if (error.message?.includes('cannot book appointments with themselves') || error.message?.includes('SELF_BOOKING')) {
        return NextResponse.json({
          success: false,
          error: 'Stylists cannot book appointments with themselves',
          code: 'SELF_BOOKING_NOT_ALLOWED'
        });
      }
      
      // Return more detailed error for debugging
      return NextResponse.json({
        success: false,
        error: error.message || 'Failed to create reservation',
        code: 'RESERVATION_FAILED',
        details: error.details || error.message
      });
    }
    
    // Handle the response based on the RPC return
    if (data && typeof data === 'object') {
      if (data.success === false) {
        return NextResponse.json({
          success: false,
          error: data.error || 'Reservation failed',
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
      error: 'Unexpected response from reservation service',
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
