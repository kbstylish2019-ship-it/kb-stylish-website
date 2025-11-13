'use client';

import React, { useState } from 'react';
import { Clock, Tag, MessageCircle, Send, Loader2, AlertCircle, CheckCircle, AlertTriangle } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

interface SupportTicket {
  id: string;
  subject: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'open' | 'in_progress' | 'waiting_customer' | 'resolved' | 'closed';
  category?: string;
  created_at: string;
  updated_at: string;
}

interface SupportMessage {
  id: string;
  message_text: string;
  is_internal: boolean;
  is_system: boolean;
  created_at: string;
  user_name?: string;
}

interface TicketDetailsClientProps {
  ticket: SupportTicket;
  messages: SupportMessage[];
}

export default function TicketDetailsClient({ ticket: initialTicket, messages: initialMessages }: TicketDetailsClientProps) {
  const [messages, setMessages] = useState<SupportMessage[]>(initialMessages);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!newMessage.trim()) return;

    setSending(true);
    setError(null);
    setSuccess(null);

    try {
      const supabase = createClient();
      
      const { data, error } = await supabase.rpc('add_support_message', {
        p_ticket_id: initialTicket.id,
        p_message_text: newMessage.trim()
      });

      if (error) throw error;

      if (data && data.success) {
        setNewMessage('');
        setSuccess('Message sent successfully!');
        // Refresh the page to show new message
        setTimeout(() => window.location.reload(), 1000);
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

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'open': return <AlertTriangle className="h-4 w-4 text-red-500" />;
      case 'in_progress': return <Clock className="h-4 w-4 text-yellow-500" />;
      case 'waiting_customer': return <MessageCircle className="h-4 w-4 text-blue-500" />;
      case 'resolved': return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'closed': return <CheckCircle className="h-4 w-4 text-gray-500" />;
      default: return <AlertTriangle className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusLabel = (status: string) => {
    return status.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  // Filter out internal messages for customers
  const visibleMessages = messages.filter(m => !m.is_internal);

  return (
    <div className="space-y-6">
      {/* Ticket Header */}
      <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
        <div className="flex items-start gap-3 mb-4">
          <MessageCircle className="h-6 w-6 text-[var(--kb-accent-gold)] mt-1" />
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-foreground mb-3">{initialTicket.subject}</h1>
            <div className="flex flex-wrap items-center gap-3">
              <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium border ${getPriorityColor(initialTicket.priority)}`}>
                {initialTicket.priority.toUpperCase()} PRIORITY
              </span>
              <div className="flex items-center gap-2 text-sm text-foreground/80">
                {getStatusIcon(initialTicket.status)}
                <span className="font-medium">{getStatusLabel(initialTicket.status)}</span>
              </div>
              {initialTicket.category && (
                <span className="flex items-center gap-1 text-sm text-foreground/60">
                  <Tag className="h-3 w-3" />
                  {initialTicket.category}
                </span>
              )}
              <span className="flex items-center gap-1 text-sm text-foreground/60">
                <Clock className="h-3 w-3" />
                {new Date(initialTicket.created_at).toLocaleDateString()}
              </span>
            </div>
          </div>
        </div>

        {initialTicket.status === 'waiting_customer' && (
          <div className="mt-4 rounded-lg border border-blue-500/20 bg-blue-500/10 p-4 flex items-start gap-3">
            <MessageCircle className="h-5 w-5 text-blue-500 mt-0.5" />
            <div>
              <p className="font-medium text-blue-400">Waiting for your response</p>
              <p className="text-sm text-blue-300/80 mt-1">
                Our support team has replied to your ticket. Please check the messages below.
              </p>
            </div>
          </div>
        )}

        {initialTicket.status === 'resolved' && (
          <div className="mt-4 rounded-lg border border-green-500/20 bg-green-500/10 p-4 flex items-start gap-3">
            <CheckCircle className="h-5 w-5 text-green-500 mt-0.5" />
            <div>
              <p className="font-medium text-green-400">Ticket Resolved</p>
              <p className="text-sm text-green-300/80 mt-1">
                This ticket has been marked as resolved. If you need further assistance, please reply below.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Messages */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <MessageCircle className="h-5 w-5" />
          Conversation
        </h2>

        {visibleMessages.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-12 text-center">
            <MessageCircle className="h-12 w-12 text-foreground/40 mx-auto mb-3" />
            <p className="text-foreground/60">No messages yet. Start the conversation below.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {visibleMessages.map((message) => (
              <div
                key={message.id}
                className={`rounded-2xl border p-6 ${
                  message.is_system
                    ? 'border-blue-500/20 bg-blue-500/5'
                    : 'border-white/10 bg-white/5'
                }`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-foreground">
                      {message.user_name || 'Support Team'}
                    </span>
                    {message.is_system && (
                      <span className="text-xs text-blue-500 font-medium px-2 py-0.5 rounded-full bg-blue-500/10">
                        SYSTEM
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-foreground/60">
                    {new Date(message.created_at).toLocaleString()}
                  </span>
                </div>
                <p className="text-foreground/80 whitespace-pre-wrap leading-relaxed">
                  {message.message_text}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Message Form */}
      {initialTicket.status !== 'closed' && (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <h3 className="text-lg font-semibold text-foreground mb-4">Add a Reply</h3>
          
          {error && (
            <div className="mb-4 rounded-lg border border-red-500/20 bg-red-500/10 p-3 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-red-500 mt-0.5" />
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          {success && (
            <div className="mb-4 rounded-lg border border-green-500/20 bg-green-500/10 p-3 flex items-start gap-2">
              <CheckCircle className="h-4 w-4 text-green-500 mt-0.5" />
              <p className="text-sm text-green-400">{success}</p>
            </div>
          )}

          <form onSubmit={handleSendMessage} className="space-y-4">
            <textarea
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Type your message here..."
              rows={5}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm ring-1 ring-white/10 focus:outline-none focus:ring-2 focus:ring-[var(--kb-primary-brand)] resize-none"
              disabled={sending}
            />
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={sending || !newMessage.trim()}
                className="flex items-center gap-2 rounded-full bg-gradient-to-r from-[var(--kb-primary-brand)] to-[color-mix(in_oklab,var(--kb-primary-brand)_80%,black)] px-6 py-3 text-sm font-semibold text-white transition hover:from-[var(--kb-primary-brand)] hover:to-[var(--kb-primary-brand)] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {sending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    Send Message
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {initialTicket.status === 'closed' && (
        <div className="rounded-2xl border border-gray-500/20 bg-gray-500/10 p-6 text-center">
          <p className="text-foreground/60">
            This ticket is closed. If you need further assistance, please{' '}
            <a href="/support" className="text-[var(--kb-primary-brand)] hover:underline">
              submit a new ticket
            </a>
            .
          </p>
        </div>
      )}
    </div>
  );
}
