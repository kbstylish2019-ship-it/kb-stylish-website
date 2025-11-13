import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { getCorsHeaders } from '../_shared/cors.ts';
import { createDualClients, verifyUser, errorResponse } from '../_shared/auth.ts';

/**
 * Support Ticket Manager Edge Function
 * Handles customer support ticket operations with role-based access
 * 
 * Customer Actions:
 * - POST /create - Create new support ticket
 * - GET /tickets - Get user's tickets
 * - GET /ticket/{id} - Get ticket details
 * - POST /message - Add message to ticket
 * 
 * Admin/Support Actions:
 * - GET /admin/tickets - Get all tickets with filters
 * - PUT /admin/ticket/{id} - Update ticket status/assignment
 */

interface CreateTicketRequest {
  category_id?: string;
  subject: string;
  message: string;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  order_reference?: string;
}

interface AddMessageRequest {
  ticket_id: string;
  message: string;
}

interface UpdateTicketRequest {
  status?: 'open' | 'in_progress' | 'waiting_customer' | 'resolved' | 'closed';
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  assigned_to?: string;
  internal_note?: string;
}

Deno.serve(async (req) => {
  const origin = req.headers.get('Origin');
  const cors = getCorsHeaders(origin);
  
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors });
  }
  
  try {
    const authHeader = req.headers.get('Authorization');
    const { userClient, serviceClient } = createDualClients(authHeader);
    const authenticatedUser = await verifyUser(authHeader, userClient);
    
    if (!authenticatedUser) {
      console.warn('[Support Ticket Manager] No authenticated user');
      return errorResponse('Authentication required', 'AUTH_REQUIRED', 401, cors);
    }
    
    const url = new URL(req.url);
    const pathSegments = url.pathname.split('/').filter(Boolean);
    
    // Remove function name from path
    if (pathSegments[0] === 'support-ticket-manager') {
      pathSegments.shift();
    }
    
    const action = pathSegments[0] || 'tickets';
    const method = req.method;
    
    console.log('[Support Ticket Manager] Request:', {
      method,
      action,
      path: pathSegments,
      user: authenticatedUser.id,
      roles: authenticatedUser.roles
    });
    
    // Route handling
    switch (`${method}:${action}`) {
      case 'POST:create':
        return await handleCreateTicket(req, userClient, cors);
        
      case 'GET:tickets':
        return await handleGetUserTickets(url, userClient, cors);
        
      case 'GET:ticket':
        const ticketId = pathSegments[1];
        if (!ticketId) {
          return errorResponse('Ticket ID required', 'MISSING_TICKET_ID', 400, cors);
        }
        return await handleGetTicketDetails(ticketId, userClient, cors);
        
      case 'POST:message':
        return await handleAddMessage(req, userClient, cors);
        
      case 'GET:admin':
        // Admin routes
        if (!authenticatedUser.roles?.includes('admin') && !authenticatedUser.roles?.includes('support')) {
          return errorResponse('Admin or support role required', 'FORBIDDEN', 403, cors);
        }
        
        if (pathSegments[1] === 'tickets') {
          return await handleGetAdminTickets(url, serviceClient, cors);
        }
        break;
        
      case 'PUT:admin':
        // Admin update routes
        if (!authenticatedUser.roles?.includes('admin') && !authenticatedUser.roles?.includes('support')) {
          return errorResponse('Admin or support role required', 'FORBIDDEN', 403, cors);
        }
        
        if (pathSegments[1] === 'ticket') {
          const adminTicketId = pathSegments[2];
          if (!adminTicketId) {
            return errorResponse('Ticket ID required', 'MISSING_TICKET_ID', 400, cors);
          }
          return await handleUpdateTicket(adminTicketId, req, serviceClient, cors);
        }
        break;
        
      default:
        return errorResponse('Invalid action', 'INVALID_ACTION', 400, cors);
    }
    
    return errorResponse('Route not found', 'NOT_FOUND', 404, cors);
    
  } catch (error) {
    console.error('[Support Ticket Manager] Unexpected error:', error);
    return errorResponse('Internal server error', 'INTERNAL_ERROR', 500, cors);
  }
});

// ============================================================================
// CUSTOMER HANDLERS
// ============================================================================

async function handleCreateTicket(req: Request, userClient: any, cors: any) {
  try {
    const payload: CreateTicketRequest = await req.json();
    
    const { data, error } = await userClient.rpc('create_support_ticket', {
      p_category_id: payload.category_id || null,
      p_subject: payload.subject,
      p_message_text: payload.message,
      p_priority: payload.priority || 'medium',
      p_order_reference: payload.order_reference || null
    });
    
    if (error) {
      console.error('[Support Ticket Manager] Create ticket error:', error);
      return errorResponse(error.message || 'Failed to create ticket', 'RPC_ERROR', 500, cors);
    }
    
    if (!data.success) {
      return errorResponse(data.error || 'Failed to create ticket', data.code || 'CREATE_FAILED', 400, cors);
    }
    
    console.log('[Support Ticket Manager] Ticket created:', data.ticket_id);
    
    // TODO: Send confirmation email
    // await sendTicketConfirmationEmail(data.ticket_id);
    
    return new Response(JSON.stringify({
      success: true,
      data: {
        ticket_id: data.ticket_id,
        message: data.message
      }
    }), {
      status: 201,
      headers: { ...cors, 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('[Support Ticket Manager] Create ticket error:', error);
    return errorResponse('Invalid request body', 'INVALID_BODY', 400, cors);
  }
}

async function handleGetUserTickets(url: URL, userClient: any, cors: any) {
  const limit = parseInt(url.searchParams.get('limit') || '20');
  const offset = parseInt(url.searchParams.get('offset') || '0');
  
  const { data, error } = await userClient.rpc('get_user_support_tickets', {
    p_limit: limit,
    p_offset: offset
  });
  
  if (error) {
    console.error('[Support Ticket Manager] Get tickets error:', error);
    return errorResponse(error.message || 'Failed to fetch tickets', 'RPC_ERROR', 500, cors);
  }
  
  if (!data.success) {
    return errorResponse(data.error || 'Failed to fetch tickets', 'FETCH_FAILED', 400, cors);
  }
  
  return new Response(JSON.stringify({
    success: true,
    data: {
      tickets: data.tickets,
      total: data.total,
      limit: data.limit,
      offset: data.offset
    }
  }), {
    headers: { ...cors, 'Content-Type': 'application/json' }
  });
}

async function handleGetTicketDetails(ticketId: string, userClient: any, cors: any) {
  const { data, error } = await userClient.rpc('get_support_ticket_details', {
    p_ticket_id: ticketId
  });
  
  if (error) {
    console.error('[Support Ticket Manager] Get ticket details error:', error);
    return errorResponse(error.message || 'Failed to fetch ticket', 'RPC_ERROR', 500, cors);
  }
  
  if (!data.success) {
    return errorResponse(data.error || 'Ticket not found', 'NOT_FOUND', 404, cors);
  }
  
  return new Response(JSON.stringify({
    success: true,
    data: {
      ticket: data.ticket,
      messages: data.messages
    }
  }), {
    headers: { ...cors, 'Content-Type': 'application/json' }
  });
}

async function handleAddMessage(req: Request, userClient: any, cors: any) {
  try {
    const payload: AddMessageRequest = await req.json();
    
    const { data, error } = await userClient.rpc('add_support_message', {
      p_ticket_id: payload.ticket_id,
      p_message_text: payload.message
    });
    
    if (error) {
      console.error('[Support Ticket Manager] Add message error:', error);
      return errorResponse(error.message || 'Failed to add message', 'RPC_ERROR', 500, cors);
    }
    
    if (!data.success) {
      return errorResponse(data.error || 'Failed to add message', 'ADD_FAILED', 400, cors);
    }
    
    console.log('[Support Ticket Manager] Message added:', data.message_id);
    
    // TODO: Send notification email to support team
    // await sendNewMessageNotification(payload.ticket_id);
    
    return new Response(JSON.stringify({
      success: true,
      data: {
        message_id: data.message_id,
        message: data.message
      }
    }), {
      headers: { ...cors, 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('[Support Ticket Manager] Add message error:', error);
    return errorResponse('Invalid request body', 'INVALID_BODY', 400, cors);
  }
}

// ============================================================================
// ADMIN/SUPPORT HANDLERS
// ============================================================================

async function handleGetAdminTickets(url: URL, serviceClient: any, cors: any) {
  const status = url.searchParams.get('status') || null;
  const priority = url.searchParams.get('priority') || null;
  const assigned_to = url.searchParams.get('assigned_to') || null;
  const category_id = url.searchParams.get('category_id') || null;
  const search = url.searchParams.get('search') || null;
  const limit = parseInt(url.searchParams.get('limit') || '50');
  const offset = parseInt(url.searchParams.get('offset') || '0');
  
  const { data, error } = await serviceClient.rpc('get_admin_support_tickets', {
    p_status: status,
    p_priority: priority,
    p_assigned_to: assigned_to,
    p_category_id: category_id,
    p_search: search,
    p_limit: limit,
    p_offset: offset
  });
  
  if (error) {
    console.error('[Support Ticket Manager] Get admin tickets error:', error);
    if (error.code === '42501') {
      return errorResponse('Admin verification failed at database level', 'DB_AUTH_FAILED', 403, cors);
    }
    return errorResponse(error.message || 'Failed to fetch tickets', 'RPC_ERROR', 500, cors);
  }
  
  if (!data.success) {
    return errorResponse(data.error || 'Failed to fetch tickets', 'FETCH_FAILED', 400, cors);
  }
  
  return new Response(JSON.stringify({
    success: true,
    data: {
      tickets: data.tickets,
      total: data.total,
      limit: data.limit,
      offset: data.offset
    }
  }), {
    headers: { ...cors, 'Content-Type': 'application/json' }
  });
}

async function handleUpdateTicket(ticketId: string, req: Request, serviceClient: any, cors: any) {
  try {
    const payload: UpdateTicketRequest = await req.json();
    
    const { data, error } = await serviceClient.rpc('update_support_ticket', {
      p_ticket_id: ticketId,
      p_status: payload.status || null,
      p_priority: payload.priority || null,
      p_assigned_to: payload.assigned_to || null,
      p_internal_note: payload.internal_note || null
    });
    
    if (error) {
      console.error('[Support Ticket Manager] Update ticket error:', error);
      if (error.code === '42501') {
        return errorResponse('Admin verification failed at database level', 'DB_AUTH_FAILED', 403, cors);
      }
      return errorResponse(error.message || 'Failed to update ticket', 'RPC_ERROR', 500, cors);
    }
    
    if (!data.success) {
      return errorResponse(data.error || 'Failed to update ticket', 'UPDATE_FAILED', 400, cors);
    }
    
    console.log('[Support Ticket Manager] Ticket updated:', ticketId);
    
    // TODO: Send status update email to customer
    // await sendTicketStatusUpdateEmail(ticketId, payload.status);
    
    return new Response(JSON.stringify({
      success: true,
      data: {
        message: data.message
      }
    }), {
      headers: { ...cors, 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('[Support Ticket Manager] Update ticket error:', error);
    return errorResponse('Invalid request body', 'INVALID_BODY', 400, cors);
  }
}
