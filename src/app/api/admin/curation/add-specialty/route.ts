import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * POST endpoint to add new specialty type
 * Admin-only
 */
export async function POST(req: NextRequest) {
  try {
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
            } catch {}
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
    const { name, slug, category, description, icon, display_order } = body;
    
    if (!name || !slug || !category) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: name, slug, category' },
        { status: 400 }
      );
    }
    
    // Insert new specialty
    const { data: specialty, error: insertError } = await supabase
      .from('specialty_types')
      .insert({
        name,
        slug,
        category,
        description: description || null,
        icon: icon || null,
        display_order: display_order || 0,
        is_active: true,
      })
      .select()
      .single();
    
    if (insertError) {
      console.error('[Add Specialty] Insert error:', insertError);
      
      // Check for unique constraint violation
      if (insertError.code === '23505') {
        return NextResponse.json(
          { success: false, error: 'A specialty with this name or slug already exists' },
          { status: 409 }
        );
      }
      
      return NextResponse.json(
        { success: false, error: insertError.message },
        { status: 500 }
      );
    }
    
    return NextResponse.json({ 
      success: true,
      message: 'Specialty added successfully',
      specialty
    });
    
  } catch (error) {
    console.error('[Add Specialty] Unexpected error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
