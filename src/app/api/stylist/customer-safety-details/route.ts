import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * API Route: POST /api/stylist/customer-safety-details
 * Provides access to customer PII (allergies) with full audit trail
 * 
 * Security: Requires 'stylist' role + booking ownership
 * GDPR: Every access logged to customer_data_access_log (Article 30)
 * Used: When stylist clicks "View Safety Details" button
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { bookingId, reason } = body;

    // ========================================================================
    // VALIDATION
    // ========================================================================
    
    if (!bookingId) {
      return NextResponse.json(
        { error: 'Missing required field: bookingId' },
        { status: 400 }
      );
    }

    if (!reason || reason.trim().length < 10) {
      return NextResponse.json(
        { error: 'Access reason required (minimum 10 characters)' },
        { status: 400 }
      );
    }

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
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // ========================================================================
    // AUTHORIZATION: Verify stylist role (RPC also checks, defense in depth)
    // ========================================================================
    
    const { data: isStylist, error: roleError } = await supabase.rpc('user_has_role', {
      user_uuid: user.id,
      role_name: 'stylist'
    });

    if (roleError || !isStylist) {
      return NextResponse.json(
        { error: 'Forbidden: Stylist role required' },
        { status: 403 }
      );
    }

    // ========================================================================
    // CALL AUDIT-LOGGED RPC
    // ========================================================================
    
    const { data: result, error: rpcError } = await supabase
      .rpc('get_customer_safety_details', {
        p_stylist_id: user.id,
        p_booking_id: bookingId,
        p_reason: reason
      });

    if (rpcError) {
      console.error('RPC error:', rpcError);
      return NextResponse.json(
        { error: 'Failed to fetch safety details' },
        { status: 500 }
      );
    }

    // Handle RPC result (JSONB response)
    if (!result || !result.success) {
      return NextResponse.json(
        { 
          success: false,
          error: result?.error || 'Failed to fetch safety details',
          code: result?.code || 'UNKNOWN_ERROR'
        },
        { status: result?.code === 'NOT_FOUND' ? 404 : 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: result.data,
      auditLogged: result.auditLogged,
      message: result.message
    });

  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
