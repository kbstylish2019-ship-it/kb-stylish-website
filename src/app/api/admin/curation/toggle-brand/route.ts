import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * API Route: POST /api/admin/curation/toggle-brand
 * Toggle brand featured status
 * Admin-only endpoint
 * 
 * Body: { brand_id: string, is_featured: boolean }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { brand_id, is_featured } = body;
    
    // Validation
    if (!brand_id || typeof is_featured !== 'boolean') {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid parameters: brand_id (string) and is_featured (boolean) required',
          code: 'VALIDATION_ERROR'
        },
        { status: 400 }
      );
    }
    
    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(brand_id)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid brand_id format (must be UUID)',
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
    const { error: toggleError } = await supabase.rpc('toggle_brand_featured', {
      p_brand_id: brand_id,
      p_is_featured: is_featured
    });
    
    if (toggleError) {
      console.error('toggle_brand_featured error:', toggleError);
      
      // Check for specific error codes
      if (toggleError.code === '22023') {
        return NextResponse.json(
          {
            success: false,
            error: 'Brand not found',
            code: 'NOT_FOUND'
          },
          { status: 404 }
        );
      }
      
      return NextResponse.json(
        {
          success: false,
          error: toggleError.message || 'Failed to toggle brand featured status',
          code: 'RPC_ERROR'
        },
        { status: 500 }
      );
    }
    
    return NextResponse.json({
      success: true,
      message: `Brand ${is_featured ? 'featured' : 'unfeatured'} successfully`
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
