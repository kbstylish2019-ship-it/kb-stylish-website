import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * POST endpoint to assign specialties to a stylist
 * Admin-only - used in onboarding wizard
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
    const { stylistUserId, specialtyIds } = body;
    
    if (!stylistUserId || !Array.isArray(specialtyIds) || specialtyIds.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Missing stylistUserId or specialtyIds' },
        { status: 400 }
      );
    }
    
    if (specialtyIds.length > 5) {
      return NextResponse.json(
        { success: false, error: 'Maximum 5 specialties allowed' },
        { status: 400 }
      );
    }
    
    // Delete existing specialties for this stylist (to replace)
    const { error: deleteError } = await supabase
      .from('stylist_specialties')
      .delete()
      .eq('stylist_user_id', stylistUserId);
    
    if (deleteError) {
      console.error('[Stylist Specialties] Delete error:', deleteError);
      return NextResponse.json(
        { success: false, error: 'Failed to clear existing specialties' },
        { status: 500 }
      );
    }
    
    // Insert new specialties
    const specialtyRecords = specialtyIds.map((specialtyId, index) => ({
      stylist_user_id: stylistUserId,
      specialty_type_id: specialtyId,
      is_primary: index === 0, // First one is primary
      display_order: index,
    }));
    
    const { error: insertError } = await supabase
      .from('stylist_specialties')
      .insert(specialtyRecords);
    
    if (insertError) {
      console.error('[Stylist Specialties] Insert error:', insertError);
      return NextResponse.json(
        { success: false, error: insertError.message },
        { status: 500 }
      );
    }
    
    return NextResponse.json({ 
      success: true,
      message: `${specialtyIds.length} specialties assigned successfully`
    });
    
  } catch (error) {
    console.error('[Stylist Specialties] Unexpected error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
