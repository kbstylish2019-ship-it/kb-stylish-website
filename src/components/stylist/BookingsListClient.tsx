'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Card, Button, Badge, Avatar, AvatarFallback } from '@/components/ui/custom-ui';
import { Calendar, Clock, Search, Loader2, FileText, ArrowUpDown, Download, CheckSquare, Square, HelpCircle } from 'lucide-react';
import { format, parseISO, startOfDay, endOfDay, isWithinInterval, isFuture, isPast } from 'date-fns';
import BookingActionsModal from './BookingActionsModal';
import QuickStatsBar from './QuickStatsBar';
import BulkActionsBar from './BulkActionsBar';
import ExportModal from './ExportModal';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { useBulkSelection } from '@/hooks/useBulkSelection';
import { createClient } from '@/lib/supabase/client';
import { FILTER_TYPES, SORT_OPTIONS, STATUS_COLORS, KEYBOARD_SHORTCUTS, type FilterType, type SortOption } from '@/constants/bookings';
import toast from 'react-hot-toast';

interface Booking {
  id: string;
  customerName: string;
  customerPhone?: string;
  customerEmail?: string;
  customerAddress?: {
    line1?: string;
    line2?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
  } | null;
  customerNotes?: string;
  deliveryNotes?: string;
  stylistNotes?: string;
  startTime: string;
  endTime: string;
  status: string;
  priceCents: number;
  bookingSource: string;
  createdAt: string;
  cancelledAt?: string;
  cancellationReason?: string;
  service: {
    name: string;
    durationMinutes: number;
    category: string;
  } | null;
  customer: {
    displayName: string;
    avatarUrl?: string;
  } | null;
}

/**
 * BookingsListClient - Complete booking management interface
 * 
 * Features:
 * - Filter by status (All, Upcoming, Past, Completed, Cancelled)
 * - Search by customer name
 * - Pagination
 * - Status badges
 * - Quick actions
 * - Real-time updates
 */
export default function BookingsListClient({ userId }: { userId: string }) {
  // Core state
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [filter, setFilter] = useState<FilterType>(FILTER_TYPES.UPCOMING);
  const [searchInput, setSearchInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>(SORT_OPTIONS.DATE_DESC);
  
  // Modal state
  const [selectedBooking, setSelectedBooking] = useState<any>(null);
  const [showActionsModal, setShowActionsModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showKeyboardHelp, setShowKeyboardHelp] = useState(false);
  
  // Refs
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  
  // Debounced search
  const debouncedSearch = useDebouncedValue(searchInput, 300);
  
  // Supabase client for real-time
  const supabase = createClient();

  // ========================================================================
  // DATA FETCHING
  // ========================================================================
  
  const fetchBookings = async () => {
    setLoading(true);
    setError('');

    try {
      const params = new URLSearchParams();
      params.set('limit', '1000'); // Fetch all, filter client-side

      const response = await fetch(`/api/stylist/bookings?${params}`);
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to fetch bookings');
      }

      setBookings(data.bookings);
    } catch (err: any) {
      setError(err.message);
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Fetch on mount only
  useEffect(() => {
    fetchBookings();
  }, []);

  // ========================================================================
  // HANDLERS
  // ========================================================================
  
  // Client-side filtering and sorting
  const filteredAndSortedBookings = useMemo(() => {
    let filtered = bookings;

    // Apply status filter
    const now = new Date();
    if (filter === FILTER_TYPES.UPCOMING) {
      filtered = filtered.filter(b => 
        isFuture(parseISO(b.startTime)) && 
        ['confirmed', 'pending'].includes(b.status)
      );
    } else if (filter === FILTER_TYPES.PAST) {
      filtered = filtered.filter(b => 
        isPast(parseISO(b.startTime)) && 
        !['cancelled'].includes(b.status)
      );
    } else if (filter === FILTER_TYPES.COMPLETED) {
      filtered = filtered.filter(b => b.status === 'completed');
    } else if (filter === FILTER_TYPES.CANCELLED) {
      filtered = filtered.filter(b => b.status === 'cancelled');
    }

    // Apply search filter
    if (debouncedSearch) {
      const searchLower = debouncedSearch.toLowerCase();
      filtered = filtered.filter(b =>
        b.customerName.toLowerCase().includes(searchLower) ||
        b.service?.name.toLowerCase().includes(searchLower) ||
        b.customerPhone?.includes(searchLower) ||
        b.customerEmail?.toLowerCase().includes(searchLower)
      );
    }

    // Apply sorting
    const sorted = [...filtered].sort((a, b) => {
      switch (sortBy) {
        case SORT_OPTIONS.DATE_ASC:
          return new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
        case SORT_OPTIONS.DATE_DESC:
          return new Date(b.startTime).getTime() - new Date(a.startTime).getTime();
        case SORT_OPTIONS.CUSTOMER_NAME:
          return a.customerName.localeCompare(b.customerName);
        case SORT_OPTIONS.PRICE_ASC:
          return a.priceCents - b.priceCents;
        case SORT_OPTIONS.PRICE_DESC:
          return b.priceCents - a.priceCents;
        case SORT_OPTIONS.STATUS:
          return a.status.localeCompare(b.status);
        default:
          return 0;
      }
    });

    return sorted;
  }, [bookings, filter, debouncedSearch, sortBy]);

  // Calculate quick stats
  const stats = useMemo(() => {
    const today = new Date();
    const todayStart = startOfDay(today);
    const todayEnd = endOfDay(today);
    
    const todayBookings = bookings.filter(b =>
      isWithinInterval(parseISO(b.startTime), { start: todayStart, end: todayEnd }) &&
      b.status === 'completed'
    );
    
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);
    const weeklyBookings = bookings.filter(b =>
      parseISO(b.startTime) >= weekAgo && b.status === 'completed'
    );
    
    const upcomingBookings = bookings.filter(b =>
      isFuture(parseISO(b.startTime)) && 
      ['confirmed', 'pending'].includes(b.status)
    );
    
    const last30Days = new Date(today);
    last30Days.setDate(last30Days.getDate() - 30);
    const recentBookings = bookings.filter(b =>
      parseISO(b.startTime) >= last30Days
    );
    const noShows = recentBookings.filter(b => b.status === 'no_show');
    
    return {
      todayCompleted: todayBookings.length,
      todayRevenue: todayBookings.reduce((sum, b) => sum + b.priceCents, 0),
      upcomingCount: upcomingBookings.length,
      weeklyCompleted: weeklyBookings.length,
      noShowRate: recentBookings.length > 0 ? (noShows.length / recentBookings.length) * 100 : 0
    };
  }, [bookings]);

  // Bulk selection
  const {
    selectedItems,
    selectedCount,
    isSelected,
    toggle: toggleSelection,
    clearSelection,
    hasSelection
  } = useBulkSelection(filteredAndSortedBookings);

  const openActionsModal = (booking: Booking) => {
    setSelectedBooking({
      id: booking.id,
      customerName: booking.customerName,
      serviceName: booking.service?.name || 'Unknown Service',
      startTime: booking.startTime,
      endTime: booking.endTime,
      status: booking.status,
      customerNotes: booking.customerNotes,
      stylistNotes: booking.stylistNotes
    });
    setShowActionsModal(true);
  };

  const closeActionsModal = () => {
    setShowActionsModal(false);
    setSelectedBooking(null);
  };

  const handleSuccess = () => {
    fetchBookings(); // Refresh list after action
  };

  // ========================================================================
  // UI HELPERS
  // ========================================================================
  
  const getStatusBadge = (status: string) => {
    const variants: Record<string, string> = {
      confirmed: 'bg-green-500/20 text-green-400 border-green-500/30',
      pending: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
      in_progress: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
      completed: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
      cancelled: 'bg-red-500/20 text-red-400 border-red-500/30',
      no_show: 'bg-orange-500/20 text-orange-400 border-orange-500/30'
    };
    return variants[status] || 'bg-gray-500/20 text-gray-400 border-gray-500/30';
  };

  const formatCurrency = (cents: number) => {
    return `NPR ${(cents / 100).toFixed(2)}`;
  };

  // ========================================================================
  // RENDER
  // ========================================================================
  
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-foreground">My Bookings</h2>
          <p className="text-sm text-muted-foreground">
            {total} total bookings
          </p>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="flex flex-col lg:flex-row gap-4">
        {/* Filter Tabs */}
        <div className="flex flex-wrap gap-2">
          {(['all', 'upcoming', 'past', 'completed', 'cancelled'] as FilterType[]).map((f) => (
            <Button
              key={f}
              onClick={() => setFilter(f)}
              variant={filter === f ? 'default' : 'outline'}
              size="sm"
              className="capitalize"
            >
              {f === 'all' ? 'All' : f.replace('_', ' ')}
            </Button>
          ))}
        </div>

        {/* Search */}
        <div className="flex gap-2 flex-1 lg:max-w-md">
          <input
            type="text"
            placeholder="Search by customer name..."
            value={searchInput}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchInput(e.target.value)}
            onKeyDown={handleKeyPress}
            className="flex-1 px-3 py-2 border border-white/10 rounded-lg bg-white/5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <Button onClick={handleSearch} size="sm" variant="outline">
            <Search className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          <span className="ml-3 text-muted-foreground">Loading bookings...</span>
        </div>
      )}

      {/* Error State */}
      {error && !loading && (
        <Card className="p-8 text-center border-destructive/50">
          <p className="text-destructive mb-4">{error}</p>
          <Button onClick={fetchBookings} variant="outline">
            Try Again
          </Button>
        </Card>
      )}

      {/* Empty State */}
      {!loading && !error && bookings.length === 0 && (
        <Card className="p-12 text-center">
          <Calendar className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-lg font-medium text-foreground">No bookings found</p>
          <p className="text-sm text-muted-foreground mt-1">
            {search ? 'Try a different search term' : `No ${filter} bookings yet`}
          </p>
        </Card>
      )}

      {/* Bookings List */}
      {!loading && !error && bookings.length > 0 && (
        <div className="grid gap-4">
          {bookings.map((booking) => (
            <Card key={booking.id} className="p-6 hover:bg-muted/5 transition-colors">
              <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                {/* Left: Booking Details */}
                <div className="flex-1 space-y-3">
                  {/* Customer & Time */}
                  <div className="flex items-start gap-3">
                    <Avatar>
                      <AvatarFallback className="bg-primary/20 text-primary">
                        {booking.customerName[0].toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-foreground">
                          {booking.customerName}
                        </p>
                        <Badge className={`${getStatusBadge(booking.status)} border text-xs`}>
                          {booking.status.replace('_', ' ')}
                        </Badge>
                      </div>
                      
                      {/* Service Info */}
                      <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                        <span>{booking.service?.name || 'Unknown Service'}</span>
                        <span>•</span>
                        <span>{booking.service?.durationMinutes} min</span>
                        <span>•</span>
                        <span className="font-medium text-foreground">
                          {formatCurrency(booking.priceCents)}
                        </span>
                      </div>

                      {/* Date & Time */}
                      <div className="flex items-center gap-4 text-sm text-muted-foreground mt-2">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="h-4 w-4" />
                          <span>{format(parseISO(booking.startTime), 'MMM d, yyyy')}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Clock className="h-4 w-4" />
                          <span>
                            {format(parseISO(booking.startTime), 'h:mm a')} - {format(parseISO(booking.endTime), 'h:mm a')}
                          </span>
                        </div>
                      </div>

                      {/* Contact Info */}
                      {(booking.customerPhone || booking.customerEmail) && (
                        <div className="flex items-center gap-4 text-sm text-muted-foreground mt-2">
                          {booking.customerPhone && <span>📞 {booking.customerPhone}</span>}
                          {booking.customerEmail && <span>📧 {booking.customerEmail}</span>}
                        </div>
                      )}

                      {/* Address */}
                      {booking.customerAddress && (
                        <div className="mt-2 text-sm text-muted-foreground">
                          <span>📍 {booking.customerAddress.line1}
                          {booking.customerAddress.line2 && `, ${booking.customerAddress.line2}`}
                          {booking.customerAddress.city && `, ${booking.customerAddress.city}`}
                          {booking.customerAddress.state && `, ${booking.customerAddress.state}`}
                          {booking.customerAddress.postalCode && ` ${booking.customerAddress.postalCode}`}</span>
                        </div>
                      )}

                      {/* Customer Notes */}
                      {booking.customerNotes && (
                        <div className="mt-2 p-2 bg-muted/50 rounded text-sm">
                          <p className="font-medium text-xs text-muted-foreground mb-1">Booking Notes:</p>
                          <p className="text-foreground">{booking.customerNotes}</p>
                        </div>
                      )}

                      {/* Delivery Notes from Checkout */}
                      {booking.deliveryNotes && (
                        <div className="mt-2 p-2 bg-blue-500/10 border border-blue-500/20 rounded text-sm">
                          <p className="font-medium text-xs text-blue-400 mb-1">Delivery Instructions:</p>
                          <p className="text-foreground">{booking.deliveryNotes}</p>
                        </div>
                      )}
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Showing {filteredAndSortedBookings.length} bookings</p>
                      </div>
                      {booking.stylistNotes && (
                        <div className="mt-2 p-2 bg-primary/10 rounded text-sm">
                          <div className="flex items-center gap-1 mb-1">
                            <FileText className="h-3 w-3" />
                            <p className="font-medium text-xs">Your Notes:</p>
                          </div>
                          <p className="text-foreground/90 whitespace-pre-wrap">
                            {booking.stylistNotes}
                          </p>
                        </div>
                      )}

                      {/* Cancellation Info */}
                      {booking.status === 'cancelled' && booking.cancellationReason && (
                        <div className="mt-2 p-2 bg-destructive/10 rounded text-sm">
                          <p className="font-medium text-xs text-destructive mb-1">Cancellation Reason:</p>
                          <p className="text-foreground/90">{booking.cancellationReason}</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right: Actions */}
                <div className="flex lg:flex-col gap-2 lg:items-end">
                  {booking.status === 'confirmed' && (
                    <Button
                      onClick={() => openActionsModal(booking)}
                      size="sm"
                      className="whitespace-nowrap"
                    >
                      Manage
                    </Button>
                  )}
                  {booking.status !== 'confirmed' && (
                    <Button
                      onClick={() => openActionsModal(booking)}
                      size="sm"
                      variant="outline"
                      className="whitespace-nowrap"
                    >
                      View Details
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Actions Modal */}
      <BookingActionsModal
        booking={selectedBooking}
        isOpen={showActionsModal}
        onClose={closeActionsModal}
        onSuccess={handleSuccess}
      />
    </div>
  );
}
