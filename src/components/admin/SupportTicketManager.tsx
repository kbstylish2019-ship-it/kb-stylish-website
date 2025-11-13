'use client';

import React, { useState } from 'react';
import { Search, Eye, Clock, CheckCircle, AlertTriangle, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import TicketDetailsModal from './TicketDetailsModal';

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
  last_message_at?: string;
}

interface Filters {
  status: string;
  priority: string;
  search: string;
}

interface SupportTicketManagerProps {
  initialTickets: SupportTicket[];
  totalCount: number;
}

export default function SupportTicketManager({ initialTickets, totalCount }: SupportTicketManagerProps) {
  const [tickets] = useState<SupportTicket[]>(initialTickets);
  const [filters, setFilters] = useState<Filters>({
    status: '',
    priority: '',
    search: ''
  });
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'low': return 'text-green-500';
      case 'medium': return 'text-yellow-500';
      case 'high': return 'text-orange-500';
      case 'urgent': return 'text-red-500';
      default: return 'text-gray-500';
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

  const filteredTickets = tickets.filter(ticket => {
    const matchesStatus = !filters.status || ticket.status === filters.status;
    const matchesPriority = !filters.priority || ticket.priority === filters.priority;
    const matchesSearch = !filters.search || 
      ticket.subject.toLowerCase().includes(filters.search.toLowerCase()) ||
      ticket.customer_name?.toLowerCase().includes(filters.search.toLowerCase()) ||
      ticket.customer_email?.toLowerCase().includes(filters.search.toLowerCase());
    
    return matchesStatus && matchesPriority && matchesSearch;
  });


  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-foreground/50" />
              <Input
                placeholder="Search tickets, customers, or emails..."
                value={filters.search}
                onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
                className="pl-10 bg-white/5 border-white/20 text-foreground"
              />
            </div>
          </div>
          
          <div className="flex gap-3">
            <select
              value={filters.status}
              onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))}
              className="w-40 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm ring-1 ring-white/10 focus:outline-none focus:ring-2 focus:ring-[var(--kb-primary-brand)] [&>option]:bg-[#1a1a1a] [&>option]:text-foreground"
            >
              <option value="">All Status</option>
              <option value="open">Open</option>
              <option value="in_progress">In Progress</option>
              <option value="waiting_customer">Waiting Customer</option>
              <option value="resolved">Resolved</option>
              <option value="closed">Closed</option>
            </select>

            <select
              value={filters.priority}
              onChange={(e) => setFilters(prev => ({ ...prev, priority: e.target.value }))}
              className="w-40 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm ring-1 ring-white/10 focus:outline-none focus:ring-2 focus:ring-[var(--kb-primary-brand)] [&>option]:bg-[#1a1a1a] [&>option]:text-foreground"
            >
              <option value="">All Priority</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>
        </div>
      </div>

      {/* Tickets Table */}
      <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-white/10">
              <tr className="text-left">
                <th className="p-4 text-sm font-medium text-foreground/80">Ticket</th>
                <th className="p-4 text-sm font-medium text-foreground/80">Customer</th>
                <th className="p-4 text-sm font-medium text-foreground/80">Category</th>
                <th className="p-4 text-sm font-medium text-foreground/80">Priority</th>
                <th className="p-4 text-sm font-medium text-foreground/80">Status</th>
                <th className="p-4 text-sm font-medium text-foreground/80">Updated</th>
                <th className="p-4 text-sm font-medium text-foreground/80">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredTickets.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-foreground/60">
                    {filters.search || filters.status || filters.priority ? 
                      'No tickets match your filters.' : 
                      'No support tickets found.'
                    }
                  </td>
                </tr>
              ) : (
                filteredTickets.map((ticket) => (
                  <tr key={ticket.id} className="border-b border-white/5 hover:bg-white/5">
                    <td className="p-4">
                      <div>
                        <div className="font-medium text-foreground">{ticket.subject}</div>
                        <div className="text-sm text-foreground/60">#{ticket.id}</div>
                        {ticket.message_count && (
                          <div className="text-xs text-foreground/50 mt-1">
                            {ticket.message_count} messages
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="p-4">
                      <div>
                        <div className="text-sm text-foreground">{ticket.customer_name}</div>
                        <div className="text-xs text-foreground/60">{ticket.customer_email}</div>
                      </div>
                    </td>
                    <td className="p-4">
                      {ticket.category && (
                        <div className="flex items-center gap-2">
                          <div 
                            className="w-2 h-2 rounded-full" 
                            style={{ backgroundColor: ticket.category_color }}
                          />
                          <span className="text-sm text-foreground">{ticket.category}</span>
                        </div>
                      )}
                    </td>
                    <td className="p-4">
                      <span className={`text-sm font-medium capitalize ${getPriorityColor(ticket.priority)}`}>
                        {ticket.priority}
                      </span>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        {getStatusIcon(ticket.status)}
                        <span className="text-sm text-foreground capitalize">
                          {ticket.status.replace('_', ' ')}
                        </span>
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="text-sm text-foreground/60">
                        {new Date(ticket.updated_at).toLocaleDateString()}
                      </div>
                    </td>
                    <td className="p-4">
                      <button
                        onClick={() => setSelectedTicket(ticket)}
                        className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium text-foreground/80 hover:text-foreground hover:bg-white/10 transition-colors"
                      >
                        <Eye className="h-4 w-4" />
                        View
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Results Summary */}
      <div className="text-sm text-foreground/60">
        Showing {filteredTickets.length} of {totalCount} tickets
      </div>

      {/* Ticket Details Modal */}
      {selectedTicket && (
        <TicketDetailsModal
          ticket={selectedTicket}
          onClose={() => setSelectedTicket(null)}
          onUpdate={() => {
            // Refresh the page to get updated data
            window.location.reload();
          }}
        />
      )}
    </div>
  );
}
