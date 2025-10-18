'use server'

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';

// Create Supabase server client
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
            // Ignore - Server Component limitation
          }
        },
      },
    }
  );
}

/**
 * Create a new vendor product
 * Server Action - can be called from Client Components
 */
export async function createVendorProduct(productData: any): Promise<{
  success: boolean;
  product_id?: string;
  slug?: string;
  message?: string;
}> {
  const supabase = await createClient();
  
  try {
    // FIXED: Use the pre-built data structure from the client
    // The client (AddProductModal) already structures the data correctly with variants array
    const formattedData = {
      name: productData.name,
      description: productData.description || null,
      category_id: productData.category_id || null,
      variants: productData.variants || [],  // Use client-built variants
      images: productData.images || []
    };
    
    const { data, error } = await supabase.rpc('create_vendor_product', {
      p_product_data: formattedData
    });
    
    if (error) {
      console.error('createVendorProduct error:', error);
      return { success: false, message: error.message };
    }
    
    // Revalidate vendor products pages
    revalidatePath('/vendor/products');
    revalidatePath('/vendor/dashboard');
    
    return data as { success: boolean; product_id?: string; slug?: string; message?: string; };
  } catch (error: any) {
    console.error('createVendorProduct error:', error);
    return { success: false, message: error.message || 'Failed to create product' };
  }
}

/**
 * Update an existing vendor product
 * Server Action
 */
export async function updateVendorProduct(
  productId: string,
  updates: Partial<any>
): Promise<{ success: boolean; message?: string; }> {
  const supabase = await createClient();
  
  try {
    // Convert prices to cents if provided
    const updateData: any = {};
    
    if (updates.name !== undefined) updateData.p_name = updates.name;
    if (updates.description !== undefined) updateData.p_description = updates.description;
    if (updates.category !== undefined) updateData.p_category = updates.category;
    if (updates.price !== undefined) {
      updateData.p_price_cents = Math.round(parseFloat(updates.price as string) * 100);
    }
    if (updates.comparePrice !== undefined) {
      updateData.p_compare_at_price_cents = updates.comparePrice 
        ? Math.round(parseFloat(updates.comparePrice as string) * 100)
        : null;
    }
    if (updates.inventory !== undefined) {
      updateData.p_stock_quantity = parseInt(updates.inventory as string);
    }
    if (updates.sku !== undefined) updateData.p_sku = updates.sku;
    
    const { data, error } = await supabase.rpc('update_vendor_product', {
      p_product_id: productId,
      ...updateData,
    });
    
    if (error) {
      console.error('updateVendorProduct error:', error);
      return { success: false, message: error.message };
    }
    
    // Revalidate pages
    revalidatePath('/vendor/products');
    revalidatePath('/vendor/dashboard');
    
    return data as { success: boolean; message?: string; };
  } catch (error: any) {
    console.error('updateVendorProduct error:', error);
    return { success: false, message: error.message || 'Failed to update product' };
  }
}

/**
 * Delete a vendor product (soft delete)
 * Server Action
 */
export async function deleteVendorProduct(productId: string): Promise<{
  success: boolean;
  message?: string;
}> {
  const supabase = await createClient();
  
  try {
    const { data, error } = await supabase.rpc('delete_vendor_product', {
      p_product_id: productId,
    });
    
    if (error) {
      console.error('deleteVendorProduct error:', error);
      return { success: false, message: error.message };
    }
    
    // Revalidate pages
    revalidatePath('/vendor/products');
    revalidatePath('/vendor/dashboard');
    
    return data as { success: boolean; message?: string; };
  } catch (error: any) {
    console.error('deleteVendorProduct error:', error);
    return { success: false, message: error.message || 'Failed to delete product' };
  }
}

/**
 * Toggle product active status
 * Server Action
 */
export async function toggleProductActive(
  productId: string,
  isActive: boolean
): Promise<{ success: boolean; message?: string; }> {
  const supabase = await createClient();
  
  try {
    const { data, error } = await supabase.rpc('toggle_product_active', {
      p_product_id: productId,
      p_is_active: isActive,
    });
    
    if (error) {
      console.error('toggleProductActive error:', error);
      return { success: false, message: error.message };
    }
    
    // Revalidate pages
    revalidatePath('/vendor/products');
    revalidatePath('/vendor/dashboard');
    
    return data as { success: boolean; message?: string; };
  } catch (error: any) {
    console.error('toggleProductActive error:', error);
    return { success: false, message: error.message || 'Failed to toggle product status' };
  }
}
