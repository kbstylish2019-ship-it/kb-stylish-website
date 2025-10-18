import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * Toggle specialty active status
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
    const { specialty_id, is_active } = body;
    
    if (!specialty_id || typeof is_active !== 'boolean') {
      return NextResponse.json(
        { success: false, error: 'Missing specialty_id or is_active' },
        { status: 400 }
      );
    }
    
    // Update specialty
    const { error: updateError } = await supabase
      .from('specialty_types')
      .update({ 
        is_active,
        updated_at: new Date().toISOString()
      })
      .eq('id', specialty_id);
    
    if (updateError) {
      console.error('[Toggle Specialty] Update error:', updateError);
      return NextResponse.json(
        { success: false, error: updateError.message },
        { status: 500 }
      );
    }
    
    return NextResponse.json({ 
      success: true,
      message: `Specialty ${is_active ? 'activated' : 'deactivated'} successfully`
    });
    
  } catch (error) {
    console.error('[Toggle Specialty] Unexpected error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
