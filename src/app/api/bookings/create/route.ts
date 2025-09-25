import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * API Route: POST /api/bookings/create
 * Creates a new booking
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
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

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      return NextResponse.json(
        { 
          success: false,
          error: 'You must be logged in to book an appointment',
          code: 'AUTH_REQUIRED'
        },
        { status: 401 }
      );
    }

    // Call the PostgreSQL RPC to create booking with variant
    // This creates both a booking and a product variant for cart integration
    const { data, error } = await supabase
      .rpc('create_booking_with_variant', {
        p_customer_id: user.id,
        p_stylist_id: stylistId,
        p_service_id: serviceId,
        p_start_time: startTime,
        p_customer_name: customerName,
        p_customer_phone: customerPhone || null,
        p_customer_email: customerEmail || user.email || null,
        p_customer_notes: customerNotes || null
      });

    if (error) {
      console.error('Booking RPC error:', error);
      console.error('Error details:', error.message, error.details);
      
      // Check for specific error codes
      if (error.message?.includes('slot is no longer available')) {
        return NextResponse.json({
          success: false,
          error: 'This time slot is no longer available',
          code: 'SLOT_UNAVAILABLE'
        });
      }
      
      // Return more detailed error for debugging
      return NextResponse.json({
        success: false,
        error: error.message || 'Failed to create booking',
        code: 'BOOKING_FAILED',
        details: error.details || error.message
      });
    }

    // Handle the response based on the RPC return
    if (data && typeof data === 'object') {
      if (data.success === false) {
        return NextResponse.json({
          success: false,
          error: data.error || 'Booking failed',
          code: data.code || 'UNKNOWN_ERROR'
        });
      }
      
      // Transform snake_case to camelCase
      return NextResponse.json({
        success: true,
        bookingId: data.booking_id,
        variantId: data.variant_id || data.booking_id, // Use variant_id if available
        startTime: data.start_time,
        endTime: data.end_time,
        priceCents: data.price_cents
      });
    }

    // Fallback response
    return NextResponse.json({
      success: false,
      error: 'Unexpected response from booking service',
      code: 'INVALID_RESPONSE'
    });

  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'Internal server error',
        code: 'INTERNAL_ERROR'
      },
      { status: 500 }
    );
  }
}
