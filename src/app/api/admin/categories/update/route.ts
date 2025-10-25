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
    
    const { data, error } = await supabase.rpc('admin_update_category', {
      p_category_id: body.category_id,
      p_name: body.name || null,
      p_slug: body.slug || null,
      p_parent_id: body.parent_id || null,
      p_description: body.description || null,
      p_image_url: body.image_url || null,
      p_sort_order: body.sort_order !== undefined ? body.sort_order : null,
      p_is_active: body.is_active !== undefined ? body.is_active : null,
    });
    
    if (error) {
      return NextResponse.json({ success: false, message: error.message }, { status: 400 });
    }
    
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to update category' },
      { status: 500 }
    );
  }
}
