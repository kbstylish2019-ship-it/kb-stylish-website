'use client';

/**
 * API Client - Browser/Client Component Safe
 * 
 * This file contains client-side safe functions for admin management
 * operations that need to be called from Client Components.
 * 
 * Uses createBrowserClient instead of server-side cookies.
 */

import { createBrowserClient } from '@supabase/ssr';

// Browser Supabase client (safe for Client Components)
function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

// ============================================================================
// TYPES (re-exported from apiClient for convenience)
// ============================================================================

export interface AdminUser {
  id: string;
  email: string;
  username: string;
  display_name: string;
  avatar_url?: string;
  is_verified: boolean;
  created_at: string;
  last_sign_in_at?: string;
  email_confirmed_at?: string;
  banned_until?: string;
  roles: Array<{
    role_name: string;
    role_id: string;
    assigned_at: string;
    expires_at?: string;
    is_active: boolean;
  }>;
  status: 'active' | 'inactive' | 'banned' | 'pending';
}

export interface AdminVendor {
  user_id: string;
  business_name: string;
  business_type?: string;
  tax_id?: string;
  verification_status: 'pending' | 'verified' | 'rejected';
  commission_rate: number;
  created_at: string;
  updated_at: string;
  display_name: string;
  username: string;
  avatar_url?: string;
  is_verified: boolean;
  email: string;
  last_sign_in_at?: string;
  banned_until?: string;
  total_products: number;
  active_products: number;
  total_revenue_cents: number;
  total_orders: number;
  pending_orders: number;
}

// ============================================================================
// ADMIN USERS MANAGEMENT
// ============================================================================

/**
 * Assign a role to a user
 */
export async function assignUserRole(
  userId: string,
  roleName: string,
  expiresAt?: string
): Promise<{ success: boolean; message: string; } | null> {
  const supabase = createClient();
  
  try {
    const { data, error } = await supabase.rpc('assign_user_role', {
      p_user_id: userId,
      p_role_name: roleName,
      p_expires_at: expiresAt || null,
    });
    
    if (error) {
      console.error('assignUserRole error:', error);
      return { success: false, message: error.message };
    }
    
    return data as { success: boolean; message: string; };
  } catch (error: any) {
    console.error('assignUserRole error:', error);
    return { success: false, message: error.message || 'Failed to assign role' };
  }
}

/**
 * Revoke a role from a user
 */
export async function revokeUserRole(
  userId: string,
  roleName: string
): Promise<{ success: boolean; message: string; } | null> {
  const supabase = createClient();
  
  try {
    const { data, error } = await supabase.rpc('revoke_user_role', {
      p_user_id: userId,
      p_role_name: roleName,
    });
    
    if (error) {
      console.error('revokeUserRole error:', error);
      return { success: false, message: error.message };
    }
    
    return data as { success: boolean; message: string; };
  } catch (error: any) {
    console.error('revokeUserRole error:', error);
    return { success: false, message: error.message || 'Failed to revoke role' };
  }
}

/**
 * Suspend a user (admin only)
 */
export async function suspendUser(
  userId: string,
  days?: number,
  reason?: string
): Promise<{ success: boolean; message?: string; banned_until?: string } | null> {
  const supabase = createClient();
  
  try {
    const { data, error } = await supabase.rpc('suspend_user', {
      p_user_id: userId,
      p_days: days || null,
      p_reason: reason || null,
    });
    
    if (error) {
      console.error('suspendUser error:', error);
      return null;
    }
    
    return data;
  } catch (error) {
    console.error('suspendUser error:', error);
    return null;
  }
}

/**
 * Activate a user account (remove suspension)
 */
export async function activateUser(
  userId: string
): Promise<{ success: boolean; message: string; } | null> {
  const supabase = createClient();
  
  try {
    const { data, error } = await supabase.rpc('activate_user', {
      p_user_id: userId,
    });
    
    if (error) {
      console.error('activateUser error:', error);
      return { success: false, message: error.message };
    }
    
    return data as { success: boolean; message: string; };
  } catch (error: any) {
    console.error('activateUser error:', error);
    return { success: false, message: error.message || 'Failed to activate user' };
  }
}

// ============================================================================
// ADMIN VENDORS MANAGEMENT
// ============================================================================

/**
 * Approve a vendor application
 */
export async function approveVendor(
  vendorId: string,
  notes?: string
): Promise<{ success: boolean; message: string; } | null> {
  const supabase = createClient();
  
  try {
    const { data, error } = await supabase.rpc('approve_vendor', {
      p_vendor_id: vendorId,
      p_notes: notes || null,
    });
    
    if (error) {
      console.error('approveVendor error:', error);
      return { success: false, message: error.message };
    }
    
    return data as { success: boolean; message: string; };
  } catch (error: any) {
    console.error('approveVendor error:', error);
    return { success: false, message: error.message || 'Failed to approve vendor' };
  }
}

/**
 * Reject a vendor application
 */
export async function rejectVendor(
  vendorId: string,
  reason?: string
): Promise<{ success: boolean; message: string; } | null> {
  const supabase = createClient();
  
  try {
    const { data, error } = await supabase.rpc('reject_vendor', {
      p_vendor_id: vendorId,
      p_reason: reason || null,
    });
    
    if (error) {
      console.error('rejectVendor error:', error);
      return { success: false, message: error.message };
    }
    
    return data as { success: boolean; message: string; };
  } catch (error: any) {
    console.error('rejectVendor error:', error);
    return { success: false, message: error.message || 'Failed to reject vendor' };
  }
}

/**
 * Reactivate a rejected vendor (admin only)
 * Restores vendor status to 'verified' and reactivates all products
 */
export async function reactivateVendor(
  vendorId: string,
  notes?: string
): Promise<{ success: boolean; message: string; products_reactivated?: number; } | null> {
  const supabase = createClient();
  
  try {
    const { data, error } = await supabase.rpc('reactivate_vendor', {
      p_vendor_id: vendorId,
      p_notes: notes || null,
    });
    
    if (error) {
      console.error('reactivateVendor error:', error);
      return { success: false, message: error.message };
    }
    
    return data as { success: boolean; message: string; products_reactivated?: number; };
  } catch (error: any) {
    console.error('reactivateVendor error:', error);
    return { success: false, message: error.message || 'Failed to reactivate vendor' };
  }
}

/**
 * Update vendor commission rate
 */
export async function updateVendorCommission(
  vendorId: string,
  commissionRate: number
): Promise<{ success: boolean; message: string; old_rate?: number; new_rate?: number; } | null> {
  const supabase = createClient();
  
  try {
    const { data, error } = await supabase.rpc('update_vendor_commission', {
      p_vendor_id: vendorId,
      p_commission_rate: commissionRate,
    });
    
    if (error) {
      console.error('updateVendorCommission error:', error);
      return { success: false, message: error.message };
    }
    
    return data as { success: boolean; message: string; old_rate?: number; new_rate?: number; };
  } catch (error: any) {
    console.error('updateVendorCommission error:', error);
    return { success: false, message: error.message || 'Failed to update commission' };
  }
}

/**
 * Suspend a vendor account
 */
export async function suspendVendor(
  vendorId: string,
  reason?: string
): Promise<{ success: boolean; message: string; products_deactivated?: number; } | null> {
  const supabase = createClient();
  
  try {
    const { data, error } = await supabase.rpc('suspend_vendor', {
      p_vendor_id: vendorId,
      p_reason: reason || null,
    });
    
    if (error) {
      console.error('suspendVendor error:', error);
      return { success: false, message: error.message };
    }
    
    return data as { success: boolean; message: string; products_deactivated?: number; };
  } catch (error: any) {
    console.error('suspendVendor error:', error);
    return { success: false, message: error.message || 'Failed to suspend vendor' };
  }
}

/**
 * Activate a vendor account (remove suspension)
 */
export async function activateVendor(
  vendorId: string
): Promise<{ success: boolean; message: string; } | null> {
  const supabase = createClient();
  
  try {
    const { data, error } = await supabase.rpc('activate_vendor', {
      p_vendor_id: vendorId,
    });
    
    if (error) {
      console.error('activateVendor error:', error);
      return { success: false, message: error.message };
    }
    
    return data as { success: boolean; message: string; };
  } catch (error: any) {
    console.error('activateVendor error:', error);
    return { success: false, message: error.message || 'Failed to activate vendor' };
  }
}
