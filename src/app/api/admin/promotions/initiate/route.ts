import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * API Route: POST /api/admin/promotions/initiate
 * Initiates a new stylist promotion workflow
 * Admin-only endpoint
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId } = body;

    // Validation
    if (!userId) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing required field: userId',
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
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              );
            } catch {
              // Server Component limitation
            }
          },
        },
      }
    );

    // Auth check
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        {
          success: false,
          error: 'Authentication required',
          code: 'AUTH_REQUIRED'
        },
        { status: 401 }
      );
    }

    // Admin role check using database function
    const { data: isAdmin, error: roleError } = await supabase
      .rpc('user_has_role', {
        user_uuid: user.id,
        role_name: 'admin'
      });

    if (roleError || !isAdmin) {
      return NextResponse.json(
        {
          success: false,
          error: 'Admin access required',
          code: 'FORBIDDEN'
        },
        { status: 403 }
      );
    }

    // Call the promotion RPC
    const { data, error } = await supabase
      .rpc('initiate_stylist_promotion', {
        p_user_id: userId,
        p_admin_id: user.id
      });

    if (error) {
      console.error('Promotion initiation RPC error:', error);
      return NextResponse.json({
        success: false,
        error: error.message || 'Failed to initiate promotion',
        code: 'RPC_ERROR'
      }, { status: 500 });
    }

    // Handle the JSONB response from RPC
    if (data && typeof data === 'object') {
      if (data.success === false) {
        return NextResponse.json({
          success: false,
          error: data.error || 'Promotion initiation failed',
          code: data.code || 'UNKNOWN_ERROR'
        }, { status: 400 });
      }

      // Success response
      return NextResponse.json({
        success: true,
        promotionId: data.promotion_id,
        userId: data.user_id,
        userName: data.user_name,
        status: data.status,
        message: data.message
      });
    }

    // Fallback
    return NextResponse.json({
      success: false,
      error: 'Unexpected response from promotion service',
      code: 'INVALID_RESPONSE'
    }, { status: 500 });

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
