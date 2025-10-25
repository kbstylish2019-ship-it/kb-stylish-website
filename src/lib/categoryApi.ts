/**
 * Category Management API Client
 * Admin-only functions for managing product categories
 */

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { unstable_noStore as noStore } from 'next/cache';

// Server-side Supabase client
async function createClient() {
  const cookieStore = await cookies();
  
  return createServerClient(
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
}

// Types
export interface Category {
  id: string;
  name: string;
  slug: string;
  parent_id: string | null;
  description: string | null;
  image_url: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  product_count: number;
}

export interface CategoryListResponse {
  success: boolean;
  categories: Category[];
}

export interface CategoryActionResponse {
  success: boolean;
  message: string;
  category_id?: string;
}

/**
 * List all categories with product counts
 * @returns List of categories or null on error
 */
export async function fetchCategories(): Promise<Category[] | null> {
  noStore();
  
  const supabase = await createClient();
  
  try {
    const { data, error } = await supabase.rpc('admin_list_categories');
    
    if (error) {
      console.error('fetchCategories error:', error);
      return null;
    }
    
    return (data as CategoryListResponse)?.categories || [];
  } catch (error) {
    console.error('fetchCategories error:', error);
    return null;
  }
}

/**
 * Create a new category
 * @param params Category creation parameters
 * @returns Success response or null on error
 */
export async function createCategory(params: {
  name: string;
  slug: string;
  parent_id?: string | null;
  description?: string | null;
  image_url?: string | null;
  sort_order?: number;
}): Promise<CategoryActionResponse | null> {
  noStore();
  
  const supabase = await createClient();
  
  try {
    const { data, error } = await supabase.rpc('admin_create_category', {
      p_name: params.name,
      p_slug: params.slug,
      p_parent_id: params.parent_id || null,
      p_description: params.description || null,
      p_image_url: params.image_url || null,
      p_sort_order: params.sort_order || 0,
    });
    
    if (error) {
      console.error('createCategory error:', error);
      return { success: false, message: error.message };
    }
    
    return data as CategoryActionResponse;
  } catch (error: any) {
    console.error('createCategory error:', error);
    return { success: false, message: error.message || 'Failed to create category' };
  }
}

/**
 * Update an existing category
 * @param categoryId Category ID to update
 * @param params Fields to update
 * @returns Success response or null on error
 */
export async function updateCategory(
  categoryId: string,
  params: {
    name?: string;
    slug?: string;
    parent_id?: string | null;
    description?: string | null;
    image_url?: string | null;
    sort_order?: number;
    is_active?: boolean;
  }
): Promise<CategoryActionResponse | null> {
  noStore();
  
  const supabase = await createClient();
  
  try {
    const { data, error } = await supabase.rpc('admin_update_category', {
      p_category_id: categoryId,
      p_name: params.name || null,
      p_slug: params.slug || null,
      p_parent_id: params.parent_id === undefined ? null : params.parent_id,
      p_description: params.description === undefined ? null : params.description,
      p_image_url: params.image_url === undefined ? null : params.image_url,
      p_sort_order: params.sort_order || null,
      p_is_active: params.is_active === undefined ? null : params.is_active,
    });
    
    if (error) {
      console.error('updateCategory error:', error);
      return { success: false, message: error.message };
    }
    
    return data as CategoryActionResponse;
  } catch (error: any) {
    console.error('updateCategory error:', error);
    return { success: false, message: error.message || 'Failed to update category' };
  }
}

/**
 * Delete (deactivate) a category
 * @param categoryId Category ID to delete
 * @returns Success response or null on error
 */
export async function deleteCategory(
  categoryId: string
): Promise<CategoryActionResponse | null> {
  noStore();
  
  const supabase = await createClient();
  
  try {
    const { data, error } = await supabase.rpc('admin_delete_category', {
      p_category_id: categoryId,
    });
    
    if (error) {
      console.error('deleteCategory error:', error);
      return { success: false, message: error.message };
    }
    
    return data as CategoryActionResponse;
  } catch (error: any) {
    console.error('deleteCategory error:', error);
    return { success: false, message: error.message || 'Failed to delete category' };
  }
}

/**
 * Fetch public categories (for product forms, shop filters)
 * No auth required - uses public SELECT policy
 */
export async function fetchPublicCategories(): Promise<Category[]> {
  noStore();
  
  const supabase = await createClient();
  
  try {
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .eq('is_active', true)
      .order('sort_order')
      .order('name');
    
    if (error) {
      console.error('fetchPublicCategories error:', error);
      return [];
    }
    
    return data as Category[];
  } catch (error) {
    console.error('fetchPublicCategories error:', error);
    return [];
  }
}
