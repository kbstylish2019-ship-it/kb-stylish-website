import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * GET endpoint to fetch stylist specialties
 * Public access
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ stylistId: string }> }
) {
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
    
    // Next.js 15: params must be awaited before accessing properties
    const { stylistId } = await params;
    
    // Use the RPC function to get specialties
    const { data, error } = await supabase.rpc('get_stylist_specialties', {
      p_stylist_user_id: stylistId
    });
    
    if (error) {
      console.error('[Stylist Specialties API] Error:', error);
      return NextResponse.json(
        { success: false, error: error.message, specialties: [] },
        { status: 500 }
      );
    }
    
    return NextResponse.json({ 
      success: true, 
      specialties: data || [] 
    });
    
  } catch (error) {
    console.error('[Stylist Specialties API] Unexpected error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error', specialties: [] },
      { status: 500 }
    );
  }
}
