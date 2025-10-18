import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

type CheckType = 'background_check' | 'id_verification' | 'training' | 'mfa';

/**
 * API Route: POST /api/admin/promotions/update-checks
 * Updates verification check status for a stylist promotion
 * Admin-only endpoint
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { promotionId, checkType, status, note } = body;

    // Validation
    if (!promotionId || !checkType || !status) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing required fields: promotionId, checkType, status',
          code: 'VALIDATION_ERROR'
        },
        { status: 400 }
      );
    }

    const validCheckTypes: CheckType[] = ['background_check', 'id_verification', 'training', 'mfa'];
    if (!validCheckTypes.includes(checkType)) {
      return NextResponse.json(
        {
          success: false,
          error: `Invalid checkType. Must be one of: ${validCheckTypes.join(', ')}`,
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

    // Call the update checks RPC
    const { data, error } = await supabase
      .rpc('update_promotion_checks', {
        p_promotion_id: promotionId,
        p_check_type: checkType,
        p_status: status,
        p_admin_id: user.id,
        p_note: note || null
      });

    if (error) {
      console.error('Update checks RPC error:', error);
      return NextResponse.json({
        success: false,
        error: error.message || 'Failed to update check status',
        code: 'RPC_ERROR'
      }, { status: 500 });
    }

    // Handle the JSONB response
    if (data && typeof data === 'object') {
      if (data.success === false) {
        return NextResponse.json({
          success: false,
          error: data.error || 'Check update failed',
          code: data.code || 'UNKNOWN_ERROR'
        }, { status: 400 });
      }

      // Success response
      return NextResponse.json({
        success: true,
        promotionId: data.promotion_id,
        checkType: data.check_type,
        checkStatus: data.check_status,
        workflowStatus: data.workflow_status,
        allChecksPassed: data.all_checks_passed,
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
