'use client';

// Client-side support API functions
// Separate from apiClient.ts to avoid server-side dependencies

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
  is_system: boolean;
  created_at: string;
  user_name?: string;
  user_avatar?: string;
}

export interface CreateTicketRequest {
  category_id?: string;
  subject: string;
  message: string;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  order_reference?: string;
}

export interface TicketListResponse {
  tickets: SupportTicket[];
  total: number;
  limit: number;
  offset: number;
}

export interface TicketDetailsResponse {
  ticket: SupportTicket;
  messages: SupportMessage[];
}

/**
 * Create a new support ticket (client-side)
 */
export async function createSupportTicket(
  ticketData: CreateTicketRequest,
  accessToken?: string
): Promise<{ success: boolean; ticket_id?: string; error?: string }> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  
  if (!supabaseUrl || !anonKey) {
    console.error('[Support API] Missing Supabase environment variables');
    return { success: false, error: 'Configuration error' };
  }
  
  try {
    const response = await fetch(
      `${supabaseUrl}/functions/v1/support-ticket-manager/create`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken || anonKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(ticketData),
      }
    );
    
    const data = await response.json();
    
    if (!response.ok) {
      console.error('[Support API] Create ticket failed:', data);
      return { success: false, error: data.error || 'Failed to create ticket' };
    }
    
    return {
      success: true,
      ticket_id: data.data?.ticket_id
    };
    
  } catch (error) {
    console.error('[Support API] Create ticket error:', error);
    return { success: false, error: 'Network error' };
  }
}

/**
 * Get user's support tickets (client-side)
 */
export async function getUserSupportTickets(
  limit: number = 20,
  offset: number = 0,
  accessToken?: string
): Promise<TicketListResponse | null> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  
  if (!supabaseUrl || !anonKey) {
    console.error('[Support API] Missing Supabase environment variables');
    return null;
  }
  
  try {
    const params = new URLSearchParams({
      limit: limit.toString(),
      offset: offset.toString()
    });
    
    const response = await fetch(
      `${supabaseUrl}/functions/v1/support-ticket-manager/tickets?${params}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken || anonKey}`,
          'Content-Type': 'application/json',
        },
      }
    );
    
    if (!response.ok) {
      console.error('[Support API] Get tickets failed:', response.status);
      return null;
    }
    
    const data = await response.json();
    return data.success ? data.data : null;
    
  } catch (error) {
    console.error('[Support API] Get tickets error:', error);
    return null;
  }
}

/**
 * Get support ticket details with messages (client-side)
 */
export async function getSupportTicketDetails(
  ticketId: string,
  accessToken?: string
): Promise<TicketDetailsResponse | null> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  
  if (!supabaseUrl || !anonKey) {
    console.error('[Support API] Missing Supabase environment variables');
    return null;
  }
  
  try {
    const response = await fetch(
      `${supabaseUrl}/functions/v1/support-ticket-manager/ticket/${ticketId}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken || anonKey}`,
          'Content-Type': 'application/json',
        },
      }
    );
    
    if (!response.ok) {
      console.error('[Support API] Get ticket details failed:', response.status);
      return null;
    }
    
    const data = await response.json();
    return data.success ? data.data : null;
    
  } catch (error) {
    console.error('[Support API] Get ticket details error:', error);
    return null;
  }
}

/**
 * Add message to support ticket (client-side)
 */
export async function addSupportMessage(
  ticketId: string,
  message: string,
  accessToken?: string
): Promise<{ success: boolean; error?: string }> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  
  if (!supabaseUrl || !anonKey) {
    console.error('[Support API] Missing Supabase environment variables');
    return { success: false, error: 'Configuration error' };
  }
  
  try {
    const response = await fetch(
      `${supabaseUrl}/functions/v1/support-ticket-manager/message`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken || anonKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ticket_id: ticketId,
          message: message
        }),
      }
    );
    
    const data = await response.json();
    
    if (!response.ok) {
      console.error('[Support API] Add message failed:', data);
      return { success: false, error: data.error || 'Failed to add message' };
    }
    
    return { success: true };
    
  } catch (error) {
    console.error('[Support API] Add message error:', error);
    return { success: false, error: 'Network error' };
  }
}

/**
 * Get support categories (client-side)
 */
export async function getSupportCategories(): Promise<SupportCategory[]> {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    
    if (!supabaseUrl || !anonKey) {
      console.error('[Support API] Missing Supabase environment variables');
      return [];
    }

    const response = await fetch(
      `${supabaseUrl}/rest/v1/support_categories?is_active=eq.true&order=sort_order.asc`,
      {
        headers: {
          'apikey': anonKey,
          'Authorization': `Bearer ${anonKey}`,
          'Content-Type': 'application/json',
        },
      }
    );
    
    if (!response.ok) {
      console.error('[Support API] Get categories failed:', response.status);
      return [];
    }
    
    const data = await response.json();
    return data || [];
    
  } catch (error) {
    console.error('[Support API] Get categories error:', error);
    return [];
  }
}
