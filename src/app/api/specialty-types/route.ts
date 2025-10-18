import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * GET endpoint to fetch active specialty types
 * Public access - used in onboarding wizard
 */
export async function GET() {
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
    
    const { data: specialties, error } = await supabase
      .from('specialty_types')
      .select('id, name, slug, category, description, icon, display_order')
      .eq('is_active', true)
      .order('display_order');
    
    if (error) {
      console.error('[Specialty Types API] Error:', error);
      return NextResponse.json(
        { success: false, error: error.message, specialties: [] },
        { status: 500 }
      );
    }
    
    return NextResponse.json({ 
      success: true, 
      specialties: specialties || [] 
    });
    
  } catch (error) {
    console.error('[Specialty Types API] Unexpected error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error', specialties: [] },
      { status: 500 }
    );
  }
}
