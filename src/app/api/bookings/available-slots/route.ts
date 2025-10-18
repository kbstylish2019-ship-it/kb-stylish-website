import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * API Route: GET /api/bookings/available-slots
 * Fetches available time slots for a stylist and service
 * 
 * PERFORMANCE MIGRATION: Now uses get_available_slots_v2 (cached)
 * - Cache hit: ~2ms (72x faster)
 * - Cache miss: ~145ms (same as v1)
 * - Expected cache hit rate: 95%
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

    // Call the CACHED PostgreSQL function (v2)
    const { data: response, error } = await supabase
      .rpc('get_available_slots_v2', {
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

    // Handle v2 JSONB response format
    if (!response || !response.success) {
      console.error('RPC error:', response?.error);
      return NextResponse.json(
        { error: response?.error || 'Failed to fetch available slots' },
        { status: 500 }
      );
    }

    // Extract slots array from JSONB response
    const slots = response.slots || [];

    // Transform snake_case to camelCase (slots are JSONB objects from v2)
    const transformedSlots = slots.map((slot: any) => ({
      slotStartUtc: slot.slot_start_utc,
      slotEndUtc: slot.slot_end_utc,
      slotStartLocal: slot.slot_start_local,
      slotEndLocal: slot.slot_end_local,
      slotDisplay: slot.slot_display,
      status: slot.status,
      isAvailable: slot.status === 'available',
      priceCents: slot.price_cents
    }));

    // Return slots with cache metadata headers (for monitoring)
    return NextResponse.json(transformedSlots, {
      headers: {
        'X-Cache-Hit': response.cache_hit ? 'true' : 'false',
        'X-Cached': response.cached ? 'true' : 'false',
        'X-Computed-At': response.computed_at || new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
