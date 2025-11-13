/**
 * Support System API Layer
 * Server-side functions for support ticket operations
 * Following the pattern from categoryApi.ts
 */

import { createClient } from '@/lib/supabase/server';
import { unstable_noStore as noStore } from 'next/cache';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface SupportCategory {
  id: string;
  name: string;
  description?: string;
  color: string;
  sort_order: number;
  is_active: boolean;
}

export interface SupportTicket {
  id: string;
  subject: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'open' | 'in_progress' | 'waiting_customer' | 'resolved' | 'closed';
  category?: string;
  category_color?: string;
  customer_name?: string;
  customer_email?: string;
  assigned_to?: string;
  order_reference?: string;
  created_at: string;
  updated_at: string;
  resolved_at?: string;
  closed_at?: string;
  message_count?: number;
  last_message_at?: string;
}

export interface SupportMessage {
  id: string;
  message_text: string;
  is_internal: boolean;
  is_system: boolean;
  created_at: string;
  user_name?: string;
  user_avatar?: string;
}

export interface TicketDetailsResponse {
  success: boolean;
  ticket?: SupportTicket;
  messages?: SupportMessage[];
  error?: string;
}

export interface TicketListResponse {
  success: boolean;
  tickets?: SupportTicket[];
  total?: number;
  limit?: number;
  offset?: number;
  error?: string;
}

// ============================================================================
// USER FUNCTIONS (Customer-facing)
// ============================================================================

/**
 * Fetch user's support tickets
 * Server-side only - uses RLS to filter by user
 */
export async function fetchUserSupportTickets(
  limit: number = 20,
  offset: number = 0
): Promise<TicketListResponse> {
  noStore();
  
  const supabase = await createClient();
  
  try {
    const { data, error } = await supabase.rpc('get_user_support_tickets', {
      p_limit: limit,
      p_offset: offset
    });
    
    if (error) {
      console.error('fetchUserSupportTickets error:', error);
      return { success: false, error: error.message };
    }
    
    return data as TicketListResponse;
  } catch (error: any) {
    console.error('fetchUserSupportTickets error:', error);
    return { success: false, error: error.message || 'Failed to fetch tickets' };
  }
}

/**
 * Fetch ticket details with messages
 * Server-side only - RLS enforces access control
 */
export async function fetchTicketDetails(
  ticketId: string
): Promise<TicketDetailsResponse> {
  noStore();
  
  const supabase = await createClient();
  
  try {
    const { data, error } = await supabase.rpc('get_support_ticket_details', {
      p_ticket_id: ticketId
    });
    
    if (error) {
      console.error('fetchTicketDetails error:', error);
      return { success: false, error: error.message };
    }
    
    return data as TicketDetailsResponse;
  } catch (error: any) {
    console.error('fetchTicketDetails error:', error);
    return { success: false, error: error.message || 'Failed to fetch ticket details' };
  }
}

/**
 * Fetch support categories
 * Public data - no auth required
 */
export async function fetchSupportCategories(): Promise<SupportCategory[]> {
  noStore();
  
  const supabase = await createClient();
  
  try {
    const { data, error } = await supabase
      .from('support_categories')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });
    
    if (error) {
      console.error('fetchSupportCategories error:', error);
      return [];
    }
    
    return data as SupportCategory[];
  } catch (error) {
    console.error('fetchSupportCategories error:', error);
    return [];
  }
}

// ============================================================================
// ADMIN FUNCTIONS (Admin/Support staff only)
// ============================================================================

/**
 * Fetch all support tickets with filters (admin only)
 * Uses private.get_admin_support_tickets which enforces admin role
 */
export async function fetchAdminSupportTickets(params: {
  status?: string;
  priority?: string;
  assigned_to?: string;
  category_id?: string;
  search?: string;
  limit?: number;
  offset?: number;
} = {}): Promise<TicketListResponse> {
  noStore();
  
  const supabase = await createClient();
  
  try {
    const { data, error } = await supabase.rpc('get_admin_support_tickets', {
      p_status: params.status || null,
      p_priority: params.priority || null,
      p_assigned_to: params.assigned_to || null,
      p_category_id: params.category_id || null,
      p_search: params.search || null,
      p_limit: params.limit || 50,
      p_offset: params.offset || 0
    });
    
    if (error) {
      console.error('fetchAdminSupportTickets error:', error);
      return { success: false, error: error.message };
    }
    
    return data as TicketListResponse;
  } catch (error: any) {
    console.error('fetchAdminSupportTickets error:', error);
    return { success: false, error: error.message || 'Failed to fetch admin tickets' };
  }
}

/**
 * Update ticket status/assignment (admin only)
 * Uses private.update_support_ticket which enforces admin role
 */
export async function updateSupportTicket(
  ticketId: string,
  updates: {
    status?: 'open' | 'in_progress' | 'waiting_customer' | 'resolved' | 'closed';
    priority?: 'low' | 'medium' | 'high' | 'urgent';
    assigned_to?: string;
    internal_note?: string;
  }
): Promise<{ success: boolean; message?: string; error?: string }> {
  noStore();
  
  const supabase = await createClient();
  
  try {
    const { data, error } = await supabase.rpc('update_support_ticket', {
      p_ticket_id: ticketId,
      p_status: updates.status || null,
      p_priority: updates.priority || null,
      p_assigned_to: updates.assigned_to || null,
      p_internal_note: updates.internal_note || null
    });
    
    if (error) {
      console.error('updateSupportTicket error:', error);
      return { success: false, error: error.message };
    }
    
    return data as { success: boolean; message?: string };
  } catch (error: any) {
    console.error('updateSupportTicket error:', error);
    return { success: false, error: error.message || 'Failed to update ticket' };
  }
}
