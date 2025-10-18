import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * API Route: POST /api/admin/stylist-services
 * Saves service selections for a stylist
 * Admin-only endpoint
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { stylistUserId, serviceIds } = body;

    // Validation
    if (!stylistUserId || !serviceIds || !Array.isArray(serviceIds)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing required fields: stylistUserId and serviceIds (array)',
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

    // Call the RPC to save services
    const { data, error } = await supabase
      .rpc('save_stylist_services', {
        p_stylist_user_id: stylistUserId,
        p_service_ids: serviceIds,
        p_admin_id: user.id
      });

    if (error) {
      console.error('Save services RPC error:', error);
      return NextResponse.json({
        success: false,
        error: error.message || 'Failed to save services',
        code: 'RPC_ERROR'
      }, { status: 500 });
    }

    // Handle the JSONB response from RPC
    if (data && typeof data === 'object') {
      if (data.success === false) {
        return NextResponse.json({
          success: false,
          error: data.error || 'Failed to save services',
          code: data.code || 'UNKNOWN_ERROR'
        }, { status: 400 });
      }

      // Success response
      return NextResponse.json({
        success: true,
        servicesCount: data.services_count,
        message: data.message || 'Services saved successfully'
      });
    }

    // Fallback
    return NextResponse.json({
      success: false,
      error: 'Unexpected response from service',
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
