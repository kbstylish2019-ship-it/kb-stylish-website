import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * API Route: POST /api/stylist/bookings/add-notes
 * 
 * Adds timestamped private notes to a booking
 * 
 * Security:
 * - Requires authentication
 * - Requires 'stylist' role
 * - Ownership validated in RPC
 * 
 * Request Body:
 * {
 *   booking_id: string,
 *   notes: string
 * }
 * 
 * Response:
 * {
 *   success: boolean,
 *   booking_id?: string,
 *   notes?: string,
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
    const { booking_id, notes } = body;

    // Validate booking ID
    if (!booking_id || typeof booking_id !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Invalid booking ID', code: 'INVALID_INPUT' },
        { status: 400 }
      );
    }

    // Validate notes
    if (!notes || typeof notes !== 'string' || notes.trim().length < 1) {
      return NextResponse.json(
        { success: false, error: 'Notes cannot be empty', code: 'INVALID_INPUT' },
        { status: 400 }
      );
    }

    if (notes.length > 2000) {
      return NextResponse.json(
        { success: false, error: 'Notes must be less than 2000 characters', code: 'NOTES_TOO_LONG' },
        { status: 400 }
      );
    }

    // ========================================================================
    // CALL RPC FUNCTION
    // ========================================================================
    
    const { data, error } = await supabase.rpc('add_stylist_notes', {
      p_booking_id: booking_id,
      p_notes: notes.trim()
    });

    // Handle RPC errors
    if (error) {
      console.error('[add-notes] RPC error:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to add notes', code: 'RPC_ERROR' },
        { status: 500 }
      );
    }

    // Handle business logic errors
    if (data && !data.success) {
      const statusCode = data.code === 'UNAUTHORIZED' ? 403 : 400;
      
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
      notes: data.notes
    });

  } catch (error) {
    console.error('[add-notes] Unexpected error:', error);
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
