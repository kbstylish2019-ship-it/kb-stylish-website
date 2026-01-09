import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * GET /api/categories
 * Fetches top-level categories (parent_id IS NULL) for navigation and category strips
 * Returns categories sorted by sort_order, then by name
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
            } catch {
              // Ignore - called from Server Component
            }
          },
        },
      }
    );

    // Fetch top-level categories (parent_id IS NULL)
    const { data: categories, error } = await supabase
      .from('categories')
      .select('id, name, slug, sort_order')
      .is('parent_id', null)
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });

    if (error) {
      console.error('Error fetching categories:', error);
      return NextResponse.json(
        { error: 'Failed to fetch categories' },
        { status: 500 }
      );
    }

    // Filter out test categories and limit to reasonable number
    const filteredCategories = (categories || [])
      .filter(cat => !cat.name.toLowerCase().includes('test'))
      .slice(0, 15);

    return NextResponse.json({
      categories: filteredCategories,
      count: filteredCategories.length,
    });
  } catch (error) {
    console.error('Categories API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
