import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
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
    const body = await request.json();
    
    const { data, error } = await supabase.rpc('admin_create_category', {
      p_name: body.name,
      p_slug: body.slug,
      p_parent_id: body.parent_id || null,
      p_description: body.description || null,
      p_image_url: body.image_url || null,
      p_sort_order: body.sort_order || 0,
    });
    
    if (error) {
      return NextResponse.json({ success: false, message: error.message }, { status: 400 });
    }
    
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to create category' },
      { status: 500 }
    );
  }
}
