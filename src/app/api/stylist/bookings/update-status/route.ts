import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * API Route: POST /api/stylist/bookings/update-status
 * 
 * Updates booking status with comprehensive validation
 * 
 * Security:
 * - Requires authentication
 * - Requires 'stylist' role
 * - Ownership validated in RPC
 * 
 * Request Body:
 * {
 *   booking_id: string,
 *   new_status: 'in_progress' | 'completed' | 'cancelled' | 'no_show',
 *   reason?: string (required for cancellation)
 * }
 * 
 * Response:
 * {
 *   success: boolean,
 *   booking_id?: string,
 *   old_status?: string,
 *   new_status?: string,
 *   error?: string,
 *   code?: string
 * }
 */
export async function POST(request: NextRequest) {
  try {
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
        { success: false, error: 'Unauthorized', code: 'UNAUTHORIZED' },
        { status: 401 }
      );
    }

    // ========================================================================
    // AUTHORIZATION: Verify stylist role
    // ========================================================================
    
    const { data: isStylist, error: roleError } = await supabase.rpc('user_has_role', {
      user_uuid: user.id,
      role_name: 'stylist'
    });

    if (roleError || !isStylist) {
      return NextResponse.json(
        { success: false, error: 'Forbidden: Stylist role required', code: 'FORBIDDEN' },
        { status: 403 }
      );
    }

    // ========================================================================
    // INPUT VALIDATION
    // ========================================================================
    
    const body = await request.json();
    const { booking_id, new_status, reason } = body;

    // Validate booking ID
    if (!booking_id || typeof booking_id !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Invalid booking ID', code: 'INVALID_INPUT' },
        { status: 400 }
      );
    }

    // Validate new status
    const validStatuses = ['in_progress', 'completed', 'cancelled', 'no_show'];
    if (!new_status || !validStatuses.includes(new_status)) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Invalid status. Must be one of: ' + validStatuses.join(', '),
          code: 'INVALID_INPUT'
        },
        { status: 400 }
      );
    }

    // Validate cancellation reason if status is cancelled
    if (new_status === 'cancelled' && (!reason || reason.trim().length < 3)) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Cancellation reason is required (minimum 3 characters)',
          code: 'REASON_REQUIRED'
        },
        { status: 400 }
      );
    }

    // ========================================================================
    // CALL RPC FUNCTION
    // ========================================================================
    
    const { data, error } = await supabase.rpc('update_booking_status', {
      p_booking_id: booking_id,
      p_new_status: new_status,
      p_reason: reason || null,
      p_actor_role: 'stylist'
    });

    // Handle RPC errors
    if (error) {
      console.error('[update-status] RPC error:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to update booking status', code: 'RPC_ERROR' },
        { status: 500 }
      );
    }

    // Handle business logic errors (returned by RPC)
    if (data && !data.success) {
      const statusCode = data.code === 'UNAUTHORIZED' ? 403 :
                        data.code === 'NOT_FOUND' ? 404 :
                        data.code === 'CONCURRENT_UPDATE' ? 409 :
                        400;
      
      return NextResponse.json(
        { success: false, error: data.error, code: data.code },
        { status: statusCode }
      );
    }

    // ========================================================================
    // SUCCESS RESPONSE
    // ========================================================================
    
    return NextResponse.json({
      success: true,
      booking_id: data.booking_id,
      old_status: data.old_status,
      new_status: data.new_status,
      changed_at: data.changed_at
    });

  } catch (error) {
    console.error('[update-status] Unexpected error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Internal server error',
        code: 'INTERNAL_ERROR'
      },
      { status: 500 }
    );
  }
}
