'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Clock, CheckCircle, AlertTriangle, MessageCircle, Eye } from 'lucide-react';

interface SupportTicket {
  id: string;
  subject: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'open' | 'in_progress' | 'waiting_customer' | 'resolved' | 'closed';
  category?: string;
  created_at: string;
  updated_at: string;
  message_count?: number;
}

interface MyTicketsClientProps {
  initialTickets: SupportTicket[];
  totalCount: number;
}

export default function MyTicketsClient({ initialTickets, totalCount }: MyTicketsClientProps) {
  const [tickets] = useState<SupportTicket[]>(initialTickets);

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'low': return 'text-green-500';
      case 'medium': return 'text-yellow-500';
      case 'high': return 'text-orange-500';
      case 'urgent': return 'text-red-500';
      default: return 'text-gray-500';
    }
  };

  const getPriorityBg = (priority: string) => {
    switch (priority) {
      case 'low': return 'bg-green-500/10 border-green-500/20';
      case 'medium': return 'bg-yellow-500/10 border-yellow-500/20';
      case 'high': return 'bg-orange-500/10 border-orange-500/20';
      case 'urgent': return 'bg-red-500/10 border-red-500/20';
      default: return 'bg-gray-500/10 border-gray-500/20';
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

  if (tickets.length === 0) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/5 p-12 text-center">
        <MessageCircle className="h-12 w-12 text-foreground/40 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-foreground mb-2">No Support Tickets Yet</h3>
        <p className="text-foreground/60 mb-6">
          You haven't submitted any support requests. Need help?
        </p>
        <Link
          href="/support"
          className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[var(--kb-primary-brand)] to-[color-mix(in_oklab,var(--kb-primary-brand)_80%,black)] px-6 py-3 text-sm font-semibold text-white transition hover:from-[var(--kb-primary-brand)] hover:to-[var(--kb-primary-brand)]"
        >
          <MessageCircle className="h-4 w-4" />
          Submit a Ticket
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="text-xs font-medium text-foreground/70">Total Tickets</div>
          <div className="mt-2 text-2xl font-semibold text-foreground">{totalCount}</div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="text-xs font-medium text-foreground/70">Open</div>
          <div className="mt-2 text-2xl font-semibold text-yellow-400">
            {tickets.filter(t => t.status === 'open' || t.status === 'in_progress').length}
          </div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="text-xs font-medium text-foreground/70">Resolved</div>
          <div className="mt-2 text-2xl font-semibold text-green-400">
            {tickets.filter(t => t.status === 'resolved' || t.status === 'closed').length}
          </div>
        </div>
      </div>

      {/* Tickets List */}
      <div className="space-y-4">
        {tickets.map((ticket) => (
          <div
            key={ticket.id}
            className="rounded-2xl border border-white/10 bg-white/5 p-6 hover:bg-white/10 transition-colors"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-2">
                  <h3 className="text-lg font-semibold text-foreground truncate">
                    {ticket.subject}
                  </h3>
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium border ${getPriorityBg(ticket.priority)}`}>
                    <span className={getPriorityColor(ticket.priority)}>●</span>
                    {ticket.priority.toUpperCase()}
                  </span>
                </div>
                
                <div className="flex flex-wrap items-center gap-4 text-sm text-foreground/60">
                  <div className="flex items-center gap-2">
                    {getStatusIcon(ticket.status)}
                    <span>{getStatusLabel(ticket.status)}</span>
                  </div>
                  
                  {ticket.category && (
                    <div className="flex items-center gap-2">
                      <span>•</span>
                      <span>{ticket.category}</span>
                    </div>
                  )}
                  
                  <div className="flex items-center gap-2">
                    <span>•</span>
                    <Clock className="h-3 w-3" />
                    <span>{new Date(ticket.created_at).toLocaleDateString()}</span>
                  </div>
                  
                  {ticket.message_count && ticket.message_count > 0 && (
                    <div className="flex items-center gap-2">
                      <span>•</span>
                      <MessageCircle className="h-3 w-3" />
                      <span>{ticket.message_count} messages</span>
                    </div>
                  )}
                </div>
              </div>
              
              <Link
                href={`/support/tickets/${ticket.id}`}
                className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium bg-[var(--kb-primary-brand)]/20 text-[var(--kb-primary-brand)] hover:bg-[var(--kb-primary-brand)]/30 transition-colors"
              >
                <Eye className="h-4 w-4" />
                View Details
              </Link>
            </div>
          </div>
        ))}
      </div>

      {/* Submit New Ticket */}
      <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-center">
        <p className="text-foreground/70 mb-4">Need more help?</p>
        <Link
          href="/support"
          className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[var(--kb-primary-brand)] to-[color-mix(in_oklab,var(--kb-primary-brand)_80%,black)] px-6 py-3 text-sm font-semibold text-white transition hover:from-[var(--kb-primary-brand)] hover:to-[var(--kb-primary-brand)]"
        >
          <MessageCircle className="h-4 w-4" />
          Submit New Ticket
        </Link>
      </div>
    </div>
  );
}
