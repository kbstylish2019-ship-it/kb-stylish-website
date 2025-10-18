import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * API Route: POST /api/admin/promotions/get-by-user
 * Fetches existing promotion for a user to enable resume functionality
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

    // Call the get promotion RPC
    const { data, error } = await supabase
      .rpc('get_promotion_by_user', {
        p_user_id: userId,
        p_admin_id: user.id
      });

    if (error) {
      console.error('Get promotion RPC error:', error);
      return NextResponse.json({
        success: false,
        error: error.message || 'Failed to fetch promotion',
        code: 'RPC_ERROR'
      }, { status: 500 });
    }

    // Handle the JSONB response from RPC
    if (data && typeof data === 'object') {
      if (data.success === false) {
        // Not found is expected - return 404
        const status = data.code === 'NOT_FOUND' ? 404 : 400;
        return NextResponse.json({
          success: false,
          error: data.error || 'Failed to fetch promotion',
          code: data.code || 'UNKNOWN_ERROR'
        }, { status });
      }

      // Success response
      return NextResponse.json({
        success: true,
        promotion: {
          promotionId: data.promotion_id,
          userId: data.user_id,
          userName: data.user_name,
          status: data.status,
          currentStep: data.current_step,
          checkStatus: data.checks,
          profileData: data.stylist_profile_data,
          createdAt: data.created_at,
          updatedAt: data.updated_at,
          requestedBy: data.requested_by,
          notes: data.notes
        }
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
