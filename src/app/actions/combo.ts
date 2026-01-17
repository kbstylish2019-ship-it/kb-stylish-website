'use server'

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { isAuthorizedComboVendor } from '@/lib/constants/combo';

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
 * Create a new combo product
 * Only KB Stylish vendor can create combos
 */
export async function createComboProduct(comboData: {
  name: string;
  description?: string;
  category_id?: string;
  combo_price_cents: number;
  quantity_limit?: number;
  constituent_items: Array<{
    variant_id: string;
    quantity?: number;
    display_order?: number;
  }>;
  images?: string[];
}): Promise<{
  success: boolean;
  combo_id?: string;
  savings_cents?: number;
  message?: string;
}> {
  const supabase = await createClient();
  
  try {
    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return { success: false, message: 'Authentication required' };
    }
    
    // Authorization check - use the helper function
    if (!isAuthorizedComboVendor(user.id)) {
      return { success: false, message: 'Only authorized vendors can create combo products' };
    }
    
    const { data, error } = await supabase.rpc('create_combo_product', {
      p_name: comboData.name,
      p_description: comboData.description || null,
      p_category_id: comboData.category_id || null,
      p_combo_price_cents: comboData.combo_price_cents,
      p_quantity_limit: comboData.quantity_limit || null,
      p_constituent_items: comboData.constituent_items,
      p_images: comboData.images || []
    });
    
    if (error) {
      console.error('createComboProduct error:', error);
      return { success: false, message: error.message };
    }
    
    // Revalidate relevant pages
    revalidatePath('/vendor/products');
    revalidatePath('/vendor/combos');
    revalidatePath('/vendor/dashboard');
    revalidatePath('/');
    
    return data as { success: boolean; combo_id?: string; savings_cents?: number; message?: string };
  } catch (error: unknown) {
    console.error('createComboProduct error:', error);
    const message = error instanceof Error ? error.message : 'Failed to create combo';
    return { success: false, message };
  }
}

/**
 * Update an existing combo product
 * Only authorized vendors can update combos
 */
export async function updateComboProduct(
  comboId: string,
  updates: {
    name?: string;
    description?: string;
    combo_price_cents?: number;
    quantity_limit?: number | null;
  }
): Promise<{ success: boolean; message?: string }> {
  const supabase = await createClient();
  
  try {
    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return { success: false, message: 'Authentication required' };
    }
    
    // Authorization check
    if (!isAuthorizedComboVendor(user.id)) {
      return { success: false, message: 'Only authorized vendors can update combo products' };
    }
    
    // Build update object
    const updateData: Record<string, unknown> = {};
    if (updates.name !== undefined) updateData.name = updates.name;
    if (updates.description !== undefined) updateData.description = updates.description;
    if (updates.combo_price_cents !== undefined) updateData.combo_price_cents = updates.combo_price_cents;
    if (updates.quantity_limit !== undefined) updateData.combo_quantity_limit = updates.quantity_limit;
    
    const { error } = await supabase
      .from('products')
      .update(updateData)
      .eq('id', comboId)
      .eq('is_combo', true)
      .eq('vendor_id', user.id);
    
    if (error) {
      console.error('updateComboProduct error:', error);
      return { success: false, message: error.message };
    }
    
    // Revalidate relevant pages
    revalidatePath('/vendor/products');
    revalidatePath('/vendor/combos');
    revalidatePath('/vendor/dashboard');
    
    return { success: true };
  } catch (error: unknown) {
    console.error('updateComboProduct error:', error);
    const message = error instanceof Error ? error.message : 'Failed to update combo';
    return { success: false, message };
  }
}

/**
 * Toggle combo active status
 * Only authorized vendors can toggle combos
 */
export async function toggleComboActive(
  comboId: string,
  isActive: boolean
): Promise<{ success: boolean; message?: string }> {
  const supabase = await createClient();
  
  try {
    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return { success: false, message: 'Authentication required' };
    }
    
    // Authorization check
    if (!isAuthorizedComboVendor(user.id)) {
      return { success: false, message: 'Only authorized vendors can manage combo products' };
    }
    
    const { error } = await supabase
      .from('products')
      .update({ is_active: isActive })
      .eq('id', comboId)
      .eq('is_combo', true)
      .eq('vendor_id', user.id);
    
    if (error) {
      console.error('toggleComboActive error:', error);
      return { success: false, message: error.message };
    }
    
    // Revalidate relevant pages
    revalidatePath('/vendor/products');
    revalidatePath('/vendor/combos');
    revalidatePath('/vendor/dashboard');
    revalidatePath('/');
    
    return { success: true };
  } catch (error: unknown) {
    console.error('toggleComboActive error:', error);
    const message = error instanceof Error ? error.message : 'Failed to toggle combo status';
    return { success: false, message };
  }
}

/**
 * Get combo availability (for frontend display)
 */
export async function getComboAvailability(comboId: string): Promise<{
  available: boolean;
  max_quantity: number;
  combo_limit?: number | null;
  combo_sold?: number;
  reason?: string;
}> {
  const supabase = await createClient();
  
  try {
    const { data, error } = await supabase.rpc('get_combo_availability', {
      p_combo_id: comboId
    });
    
    if (error) {
      console.error('getComboAvailability error:', error);
      return { available: false, max_quantity: 0, reason: error.message };
    }
    
    return data as {
      available: boolean;
      max_quantity: number;
      combo_limit?: number | null;
      combo_sold?: number;
      reason?: string;
    };
  } catch (error: unknown) {
    console.error('getComboAvailability error:', error);
    return { available: false, max_quantity: 0, reason: 'Failed to check availability' };
  }
}
