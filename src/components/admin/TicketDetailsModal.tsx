'use client';

import React, { useState, useEffect } from 'react';
import { X, Clock, User, Tag, MessageCircle, Send, Loader2, AlertCircle } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

interface SupportTicket {
  id: string;
  subject: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'open' | 'in_progress' | 'waiting_customer' | 'resolved' | 'closed';
  customer_name?: string;
  customer_email?: string;
  category?: string;
  category_color?: string;
  assigned_to?: string;
  order_reference?: string;
  created_at: string;
  updated_at: string;
  message_count?: number;
}

interface SupportMessage {
  id: string;
  message_text: string;
  is_internal: boolean;
  is_system: boolean;
  created_at: string;
  user_name?: string;
  user_avatar?: string;
}

interface TicketDetailsModalProps {
  ticket: SupportTicket;
  onClose: () => void;
  onUpdate: () => void;
}

export default function TicketDetailsModal({ ticket, onClose, onUpdate }: TicketDetailsModalProps) {
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Form states
  const [newMessage, setNewMessage] = useState('');
  const [isInternalNote, setIsInternalNote] = useState(false);
  const [status, setStatus] = useState(ticket.status);
  const [priority, setPriority] = useState(ticket.priority);

  useEffect(() => {
    fetchTicketDetails();
  }, [ticket.id]);

  const fetchTicketDetails = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const supabase = createClient();
      const { data, error } = await supabase.rpc('get_support_ticket_details', {
        p_ticket_id: ticket.id
      });

      if (error) throw error;

      if (data && data.success) {
        setMessages(data.messages || []);
      } else {
        setError(data?.error || 'Failed to load ticket details');
      }
    } catch (err: any) {
      console.error('Error fetching ticket details:', err);
      setError(err.message || 'Failed to load ticket details');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateTicket = async () => {
    if (status === ticket.status && priority === ticket.priority) {
      return; // No changes
    }

    setUpdating(true);
    setError(null);

    try {
      const supabase = createClient();
      const { data, error } = await supabase.rpc('update_support_ticket', {
        p_ticket_id: ticket.id,
        p_status: status !== ticket.status ? status : null,
        p_priority: priority !== ticket.priority ? priority : null,
        p_assigned_to: null,
        p_internal_note: null
      });

      if (error) throw error;

      if (data && data.success) {
        onUpdate();
        await fetchTicketDetails(); // Refresh messages to show system update
      } else {
        setError(data?.error || 'Failed to update ticket');
      }
    } catch (err: any) {
      console.error('Error updating ticket:', err);
      setError(err.message || 'Failed to update ticket');
    } finally {
      setUpdating(false);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!newMessage.trim()) return;

    setSending(true);
    setError(null);

    try {
      const supabase = createClient();
      
      // Add message via RPC with internal flag
      const { data, error } = await supabase.rpc('add_support_message', {
        p_ticket_id: ticket.id,
        p_message_text: newMessage.trim(),
        p_is_internal: isInternalNote
      });

      if (error) throw error;

      if (data && data.success) {
        setNewMessage('');
        setIsInternalNote(false);
        await fetchTicketDetails(); // Refresh messages
      } else {
        setError(data?.error || 'Failed to send message');
      }
    } catch (err: any) {
      console.error('Error sending message:', err);
      setError(err.message || 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const getPriorityColor = (p: string) => {
    switch (p) {
      case 'low': return 'text-green-500 bg-green-500/10 border-green-500/20';
      case 'medium': return 'text-yellow-500 bg-yellow-500/10 border-yellow-500/20';
      case 'high': return 'text-orange-500 bg-orange-500/10 border-orange-500/20';
      case 'urgent': return 'text-red-500 bg-red-500/10 border-red-500/20';
      default: return 'text-gray-500 bg-gray-500/10 border-gray-500/20';
    }
  };

  const getStatusColor = (s: string) => {
    switch (s) {
      case 'open': return 'text-red-500 bg-red-500/10 border-red-500/20';
      case 'in_progress': return 'text-yellow-500 bg-yellow-500/10 border-yellow-500/20';
      case 'waiting_customer': return 'text-blue-500 bg-blue-500/10 border-blue-500/20';
      case 'resolved': return 'text-green-500 bg-green-500/10 border-green-500/20';
      case 'closed': return 'text-gray-500 bg-gray-500/10 border-gray-500/20';
      default: return 'text-gray-500 bg-gray-500/10 border-gray-500/20';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="relative w-full max-w-4xl max-h-[90vh] rounded-2xl border border-white/10 bg-[#1a1a1a] shadow-xl ring-1 ring-white/10 flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between p-6 border-b border-white/10">
          <div className="flex-1">
            <h2 className="text-xl font-bold text-foreground mb-2">{ticket.subject}</h2>
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium border ${getPriorityColor(priority)}`}>
                {priority.toUpperCase()}
              </span>
              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium border ${getStatusColor(status)}`}>
                {status.replace('_', ' ').toUpperCase()}
              </span>
              {ticket.category && (
                <span className="text-foreground/60">
                  <Tag className="inline h-3 w-3 mr-1" />
                  {ticket.category}
                </span>
              )}
              <span className="text-foreground/60">
                <Clock className="inline h-3 w-3 mr-1" />
                {new Date(ticket.created_at).toLocaleString()}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 hover:bg-white/10 transition-colors"
          >
            <X className="h-5 w-5 text-foreground/60" />
          </button>
        </div>

        {/* Customer Info */}
        <div className="px-6 py-4 bg-white/5 border-b border-white/10">
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-foreground/60" />
              <span className="text-foreground">{ticket.customer_name || 'Unknown'}</span>
            </div>
            <span className="text-foreground/60">{ticket.customer_email}</span>
            {ticket.order_reference && (
              <span className="text-foreground/60">Order: {ticket.order_reference}</span>
            )}
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="mx-6 mt-4 rounded-lg border border-red-500/20 bg-red-500/10 p-3 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-red-500 mt-0.5" />
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-foreground/40" />
            </div>
          ) : messages.length === 0 ? (
            <div className="text-center py-12 text-foreground/60">
              <MessageCircle className="h-12 w-12 mx-auto mb-3 text-foreground/40" />
              <p>No messages yet</p>
            </div>
          ) : (
            messages.map((message) => (
              <div
                key={message.id}
                className={`rounded-lg p-4 ${
                  message.is_system
                    ? 'bg-blue-500/10 border border-blue-500/20'
                    : message.is_internal
                    ? 'bg-yellow-500/10 border border-yellow-500/20'
                    : 'bg-white/5 border border-white/10'
                }`}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-foreground text-sm">
                      {message.user_name || 'System'}
                    </span>
                    {message.is_internal && (
                      <span className="text-xs text-yellow-500 font-medium">INTERNAL</span>
                    )}
                    {message.is_system && (
                      <span className="text-xs text-blue-500 font-medium">SYSTEM</span>
                    )}
                  </div>
                  <span className="text-xs text-foreground/60">
                    {new Date(message.created_at).toLocaleString()}
                  </span>
                </div>
                <p className="text-sm text-foreground/80 whitespace-pre-wrap">
                  {message.message_text}
                </p>
              </div>
            ))
          )}
        </div>

        {/* Actions */}
        <div className="border-t border-white/10 p-6 space-y-4">
          {/* Update Status/Priority */}
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-xs font-medium text-foreground/70 mb-2">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as any)}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm ring-1 ring-white/10 focus:outline-none focus:ring-2 focus:ring-[var(--kb-primary-brand)] [&>option]:bg-[#1a1a1a] [&>option]:text-foreground"
              >
                <option value="open">Open</option>
                <option value="in_progress">In Progress</option>
                <option value="waiting_customer">Waiting Customer</option>
                <option value="resolved">Resolved</option>
                <option value="closed">Closed</option>
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-xs font-medium text-foreground/70 mb-2">Priority</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as any)}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm ring-1 ring-white/10 focus:outline-none focus:ring-2 focus:ring-[var(--kb-primary-brand)] [&>option]:bg-[#1a1a1a] [&>option]:text-foreground"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
            <div className="flex items-end">
              <button
                onClick={handleUpdateTicket}
                disabled={updating || (status === ticket.status && priority === ticket.priority)}
                className="rounded-lg px-4 py-2 text-sm font-medium bg-[var(--kb-primary-brand)] text-white hover:bg-[var(--kb-primary-brand)]/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {updating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  'Update'
                )}
              </button>
            </div>
          </div>

          {/* Add Message */}
          <form onSubmit={handleSendMessage} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-foreground/70 mb-2">Add Message</label>
              <textarea
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder="Type your message..."
                rows={3}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm ring-1 ring-white/10 focus:outline-none focus:ring-2 focus:ring-[var(--kb-primary-brand)] resize-none"
              />
            </div>
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm text-foreground/70">
                <input
                  type="checkbox"
                  checked={isInternalNote}
                  onChange={(e) => setIsInternalNote(e.target.checked)}
                  className="rounded border-white/20 bg-white/5 text-[var(--kb-primary-brand)]"
                />
                Internal note (not visible to customer)
              </label>
              <button
                type="submit"
                disabled={sending || !newMessage.trim()}
                className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium bg-[var(--kb-primary-brand)] text-white hover:bg-[var(--kb-primary-brand)]/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {sending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    Send
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
