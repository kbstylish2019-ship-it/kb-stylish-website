import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * DELETE recommendation from product_recommendations table
 * Admin-only endpoint
 */
export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    
    // Create Supabase client
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
    
    // Verify authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    // Verify admin role
    const userRoles = user.user_metadata?.user_roles || user.app_metadata?.user_roles || [];
    if (!userRoles.includes('admin')) {
      return NextResponse.json(
        { success: false, error: 'Forbidden: Admin access required' },
        { status: 403 }
      );
    }
    
    // Parse request body
    const body = await req.json();
    const { recommendation_id } = body;
    
    if (!recommendation_id) {
      return NextResponse.json(
        { success: false, error: 'Missing recommendation_id' },
        { status: 400 }
      );
    }
    
    // Delete recommendation
    const { error: deleteError } = await supabase
      .from('product_recommendations')
      .delete()
      .eq('id', recommendation_id);
    
    if (deleteError) {
      console.error('[Remove Recommendation] Error:', deleteError);
      return NextResponse.json(
        { success: false, error: deleteError.message },
        { status: 500 }
      );
    }
    
    return NextResponse.json({ 
      success: true,
      message: 'Recommendation removed successfully'
    });
    
  } catch (error) {
    console.error('[Remove Recommendation] Unexpected error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
