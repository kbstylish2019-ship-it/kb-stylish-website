import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * API Route: POST /api/admin/curation/add-recommendation
 * Add product recommendation
 * Admin-only endpoint
 * 
 * Body: { source_product_id: string, recommended_product_id: string, display_order?: number }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { source_product_id, recommended_product_id, display_order } = body;
    
    // Validation
    if (!source_product_id || !recommended_product_id) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing required parameters: source_product_id and recommended_product_id',
          code: 'VALIDATION_ERROR'
        },
        { status: 400 }
      );
    }
    
    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(source_product_id) || !uuidRegex.test(recommended_product_id)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid UUID format for product IDs',
          code: 'VALIDATION_ERROR'
        },
        { status: 400 }
      );
    }
    
    // Validate display_order if provided
    if (display_order !== undefined && (typeof display_order !== 'number' || display_order < 0)) {
      return NextResponse.json(
        {
          success: false,
          error: 'display_order must be a non-negative number',
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
    
    // Call database function (self-defending with assert_admin)
    const { data: recommendation_id, error: addError } = await supabase.rpc('add_product_recommendation', {
      p_source_product_id: source_product_id,
      p_recommended_product_id: recommended_product_id,
      p_display_order: display_order || 0
    });
    
    if (addError) {
      console.error('add_product_recommendation error:', addError);
      
      // Check for specific error codes
      if (addError.code === '22023') {
        return NextResponse.json(
          {
            success: false,
            error: 'Product not found',
            code: 'NOT_FOUND'
          },
          { status: 404 }
        );
      }
      
      if (addError.code === '23505') {
        return NextResponse.json(
          {
            success: false,
            error: 'Recommendation already exists for these products',
            code: 'DUPLICATE'
          },
          { status: 409 }
        );
      }
      
      if (addError.code === '23514') {
        return NextResponse.json(
          {
            success: false,
            error: 'Cannot recommend a product to itself',
            code: 'INVALID_RECOMMENDATION'
          },
          { status: 400 }
        );
      }
      
      return NextResponse.json(
        {
          success: false,
          error: addError.message || 'Failed to add recommendation',
          code: 'RPC_ERROR'
        },
        { status: 500 }
      );
    }
    
    return NextResponse.json({
      success: true,
      recommendation_id,
      message: 'Recommendation added successfully'
    });
    
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
