import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * API Route: POST /api/admin/promotions/complete
 * Completes stylist promotion by creating profile and assigning role
 * Admin-only endpoint
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { promotionId, profileData } = body;

    // Validation
    if (!promotionId || !profileData) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing required fields: promotionId, profileData',
          code: 'VALIDATION_ERROR'
        },
        { status: 400 }
      );
    }

    if (!profileData.display_name) {
      return NextResponse.json(
        {
          success: false,
          error: 'profileData.display_name is required',
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

    // Admin role check
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

    // Call the complete promotion RPC
    const { data, error } = await supabase
      .rpc('complete_stylist_promotion', {
        p_promotion_id: promotionId,
        p_admin_id: user.id,
        p_profile_data: profileData
      });

    if (error) {
      console.error('Complete promotion RPC error:', error);
      return NextResponse.json({
        success: false,
        error: error.message || 'Failed to complete promotion',
        code: 'RPC_ERROR'
      }, { status: 500 });
    }

    // Handle the JSONB response
    if (data && typeof data === 'object') {
      if (data.success === false) {
        return NextResponse.json({
          success: false,
          error: data.error || 'Promotion completion failed',
          code: data.code || 'UNKNOWN_ERROR',
          missing: data.missing  // Which check is incomplete
        }, { status: 400 });
      }

      // Success response
      return NextResponse.json({
        success: true,
        promotionId: data.promotion_id,
        stylistUserId: data.stylist_user_id,
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
