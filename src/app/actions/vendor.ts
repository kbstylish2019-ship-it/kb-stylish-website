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
    // Use the simple function with correct parameters
    const { data, error } = await supabase.rpc('update_vendor_product_simple', {
      p_product_id: productId,
      p_name: updates.name || null,
      p_description: updates.description || null,
      p_category_id: updates.category || null,
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

// ============================================================================
// INVENTORY SYSTEM UPGRADE - New Server Actions (Phase 8 Implementation)
// ============================================================================

/**
 * Add a custom attribute for the vendor
 * Allows vendors to create attributes like "Volume", "Scent", "Flavor", etc.
 */
export async function addVendorAttribute(
  name: string,
  displayName: string,
  attributeType: 'text' | 'color' | 'number' | 'select',
  isVariantDefining: boolean = true,
  values: Array<{ value: string; display_value: string; color_hex?: string; sort_order: number }>
): Promise<{ success: boolean; attribute_id?: string; message?: string }> {
  const supabase = await createClient();
  
  try {
    const { data, error } = await supabase.rpc('add_vendor_attribute', {
      p_name: name,
      p_display_name: displayName,
      p_attribute_type: attributeType,
      p_is_variant_defining: isVariantDefining,
      p_values: values
    });
    
    if (error) {
      console.error('addVendorAttribute error:', error);
      return { success: false, message: error.message };
    }
    
    revalidatePath('/vendor/products');
    return data as { success: boolean; attribute_id?: string; message?: string };
  } catch (error: any) {
    console.error('addVendorAttribute error:', error);
    return { success: false, message: error.message || 'Failed to add attribute' };
  }
}

/**
 * Delete (soft or hard) a vendor's custom attribute
 * Soft deletes if attribute is in use by variants, hard deletes otherwise
 */
export async function deleteVendorAttribute(
  attributeId: string
): Promise<{ success: boolean; message?: string }> {
  const supabase = await createClient();
  
  try {
    const { data, error } = await supabase.rpc('delete_vendor_attribute', {
      p_attribute_id: attributeId
    });
    
    if (error) {
      console.error('deleteVendorAttribute error:', error);
      return { success: false, message: error.message };
    }
    
    revalidatePath('/vendor/products');
    return data as { success: boolean; message?: string };
  } catch (error: any) {
    console.error('deleteVendorAttribute error:', error);
    return { success: false, message: error.message || 'Failed to delete attribute' };
  }
}

/**
 * Update inventory quantity for a variant
 * Creates audit trail in inventory_movements table
 */
export async function updateInventoryQuantity(
  variantId: string,
  quantityChange: number,
  movementType: 'purchase' | 'sale' | 'adjustment' | 'transfer' | 'return' | 'damage',
  notes?: string
): Promise<{ success: boolean; old_quantity?: number; new_quantity?: number; message?: string }> {
  const supabase = await createClient();
  
  try {
    const { data, error } = await supabase.rpc('update_inventory_quantity', {
      p_variant_id: variantId,
      p_quantity_change: quantityChange,
      p_movement_type: movementType,
      p_notes: notes || null
    });
    
    if (error) {
      console.error('updateInventoryQuantity error:', error);
      return { success: false, message: error.message };
    }
    
    revalidatePath('/vendor/products');
    revalidatePath('/vendor/dashboard');
    return data as { success: boolean; old_quantity?: number; new_quantity?: number; message?: string };
  } catch (error: any) {
    console.error('updateInventoryQuantity error:', error);
    return { success: false, message: error.message || 'Failed to update inventory' };
  }
}

/**
 * Add a new variant to an existing product
 */
export async function addProductVariant(
  productId: string,
  sku: string,
  price: number,
  compareAtPrice?: number,
  costPrice?: number,
  quantity: number = 0,
  attributeValueIds: string[] = []
): Promise<{ success: boolean; variant_id?: string; message?: string }> {
  const supabase = await createClient();
  
  try {
    const { data, error } = await supabase.rpc('add_product_variant', {
      p_product_id: productId,
      p_sku: sku.toUpperCase(),
      p_price: price,
      p_compare_at_price: compareAtPrice || null,
      p_cost_price: costPrice || null,
      p_quantity: quantity,
      p_attribute_value_ids: attributeValueIds
    });
    
    if (error) {
      console.error('addProductVariant error:', error);
      return { success: false, message: error.message };
    }
    
    revalidatePath('/vendor/products');
    return data as { success: boolean; variant_id?: string; message?: string };
  } catch (error: any) {
    console.error('addProductVariant error:', error);
    return { success: false, message: error.message || 'Failed to add variant' };
  }
}

/**
 * Update an existing variant's details (SKU, price, etc.)
 */
export async function updateProductVariant(
  variantId: string,
  updates: {
    sku?: string;
    price?: number;
    compareAtPrice?: number;
    costPrice?: number;
    isActive?: boolean;
  }
): Promise<{ success: boolean; message?: string }> {
  const supabase = await createClient();
  
  try {
    const { data, error } = await supabase.rpc('update_product_variant', {
      p_variant_id: variantId,
      p_sku: updates.sku?.toUpperCase() || null,
      p_price: updates.price ?? null,
      p_compare_at_price: updates.compareAtPrice ?? null,
      p_cost_price: updates.costPrice ?? null,
      p_is_active: updates.isActive ?? null
    });
    
    if (error) {
      console.error('updateProductVariant error:', error);
      return { success: false, message: error.message };
    }
    
    revalidatePath('/vendor/products');
    return data as { success: boolean; message?: string };
  } catch (error: any) {
    console.error('updateProductVariant error:', error);
    return { success: false, message: error.message || 'Failed to update variant' };
  }
}
