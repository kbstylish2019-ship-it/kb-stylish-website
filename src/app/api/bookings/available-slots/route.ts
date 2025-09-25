import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * API Route: GET /api/bookings/available-slots
 * Fetches available time slots for a stylist and service
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const stylistId = searchParams.get('stylistId');
    const serviceId = searchParams.get('serviceId');
    const targetDate = searchParams.get('targetDate');
    const customerTimezone = searchParams.get('customerTimezone') || 'Asia/Kathmandu';

    if (!stylistId || !serviceId || !targetDate) {
      return NextResponse.json(
        { error: 'Missing required parameters' },
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

    // Call the PostgreSQL function
    const { data: slots, error } = await supabase
      .rpc('get_available_slots', {
        p_stylist_id: stylistId,
        p_service_id: serviceId,
        p_target_date: targetDate,
        p_customer_timezone: customerTimezone
      });

    if (error) {
      console.error('Error fetching slots:', error);
      return NextResponse.json(
        { error: 'Failed to fetch available slots' },
        { status: 500 }
      );
    }

    // Transform snake_case to camelCase
    const transformedSlots = slots.map((slot: any) => ({
      slotStartUtc: slot.slot_start_utc,
      slotEndUtc: slot.slot_end_utc,
      slotStartLocal: slot.slot_start_local,
      slotEndLocal: slot.slot_end_local,
      slotDisplay: slot.slot_display,
      status: slot.status || (slot.is_available ? 'available' : 'unavailable'),
      isAvailable: slot.is_available,
      priceCents: slot.price_cents
    }));

    return NextResponse.json(transformedSlots);
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
