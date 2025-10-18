'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle,
  Badge,
  Avatar,
  AvatarFallback,
  Button,
  Progress
} from '@/components/ui/custom-ui';
import { 
  AlertTriangle, 
  Star, 
  Calendar,
  Clock,
  Loader2,
  Bell,
  TrendingUp,
  Shield
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import toast from 'react-hot-toast';
import SafetyDetailsModal from './SafetyDetailsModal';
import BookingActionsModal from './BookingActionsModal';

interface Booking {
  id: string;
  customerUserId: string;
  customerName: string;
  customerPhone?: string;
  customerEmail?: string;
  customerNotes?: string;
  serviceName: string;
  serviceDuration: number;
  startTime: string;
  endTime: string;
  status: string;
  priceCents: number;
  isRepeatCustomer: boolean;
  history: {
    totalBookings: number;
    lastVisit?: string;
    lastService?: string;
    hasAllergies: boolean;
    allergySummary?: string;
    hasSafetyNotes: boolean;
  };
}

interface Budget {
  monthlyLimit: number;
  monthlyUsed: number;
  monthlyRemaining: number;
  emergencyRemaining: number;
  resetsAt: string;
}

interface StylistDashboardClientProps {
  userId: string;
}

export default function StylistDashboardClient({ userId }: StylistDashboardClientProps) {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [budget, setBudget] = useState<Budget | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newBookingAlert, setNewBookingAlert] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [showSafetyModal, setShowSafetyModal] = useState(false);
  const [showActionsModal, setShowActionsModal] = useState(false);
  const supabase = createClient();

  // ========================================================================
  // DATA FETCHING
  // ========================================================================
  
  async function loadDashboardData() {
    try {
      setError(null);
      const response = await fetch('/api/stylist/dashboard');
      
      if (!response.ok) {
        throw new Error('Failed to fetch dashboard data');
      }

      const data = await response.json();
      setBookings(data.bookings || []);
      setBudget(data.budget);
    } catch (err) {
      console.error('Dashboard error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load dashboard');
    } finally {
      setIsLoading(false);
    }
  }

  // ========================================================================
  // REAL-TIME SUBSCRIPTION
  // ========================================================================
  
  useEffect(() => {
    loadDashboardData();

    // Subscribe to new bookings for this stylist
    const channel = supabase
      .channel('stylist-bookings')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'bookings',
        filter: `stylist_user_id=eq.${userId}`
      }, (payload) => {
        console.log('New booking received:', payload);
        setNewBookingAlert(true);
        toast.success('New booking received!');
        loadDashboardData();
        
        // Auto-dismiss alert after 10 seconds
        setTimeout(() => setNewBookingAlert(false), 10000);
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('Real-time subscription active');
        }
        if (status === 'CHANNEL_ERROR') {
          console.warn('Real-time connection failed, using polling fallback');
          // Fallback to polling every 30 seconds
          const interval = setInterval(loadDashboardData, 30000);
          return () => clearInterval(interval);
        }
      });

    return () => {
      channel.unsubscribe();
    };
  }, [userId]);

  // ========================================================================
  // HELPERS
  // ========================================================================
  
  function formatTime(datetime: string) {
    return format(parseISO(datetime), 'h:mm a');
  }

  function formatDate(datetime: string) {
    return format(parseISO(datetime), 'MMM d, yyyy');
  }

  function getStatusBadge(status: string) {
    const variants: Record<string, string> = {
      confirmed: 'bg-green-500/20 text-green-300 border-green-500/30',
      pending: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
      completed: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
      cancelled: 'bg-red-500/20 text-red-300 border-red-500/30'
    };
    return variants[status] || 'bg-gray-500/20 text-gray-300 border-gray-500/30';
  }

  function openSafetyDetails(booking: Booking) {
    setSelectedBooking(booking);
    setShowSafetyModal(true);
  }

  function openActionsModal(booking: Booking) {
    setSelectedBooking(booking);
    setShowActionsModal(true);
  }

  function closeActionsModal() {
    setShowActionsModal(false);
  }

  function handleBookingUpdate() {
    loadDashboardData(); // Refresh after action
  }

  // ========================================================================
  // RENDER: LOADING STATE
  // ========================================================================
  
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-foreground/40" />
        <span className="ml-3 text-foreground/70">Loading dashboard...</span>
      </div>
    );
  }

  // ========================================================================
  // RENDER: ERROR STATE
  // ========================================================================
  
  if (error) {
    return (
      <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
        <div className="flex items-center">
          <AlertTriangle className="w-5 h-5 text-red-400 mr-2" />
          <span className="text-red-300">{error}</span>
        </div>
        <Button 
          onClick={loadDashboardData} 
          variant="outline" 
          size="sm" 
          className="mt-3"
        >
          Retry
        </Button>
      </div>
    );
  }

  // ========================================================================
  // RENDER: MAIN DASHBOARD
  // ========================================================================
  
  return (
    <div className="space-y-6">
      {/* New Booking Alert */}
      {newBookingAlert && (
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4 flex items-center justify-between">
          <div className="flex items-center">
            <Bell className="w-5 h-5 text-blue-400 mr-2" />
            <span className="text-blue-300 font-medium">New booking received!</span>
          </div>
          <Button 
            variant="ghost" 
            size="sm"
            onClick={() => setNewBookingAlert(false)}
          >
            Dismiss
          </Button>
        </div>
      )}

      {/* Budget Tracker Widget */}
      {budget && (
        <div className="rounded-2xl border border-white/10 bg-white/5 ring-1 ring-white/10 overflow-hidden">
          <div className="p-4 border-b border-white/10">
            <h3 className="text-lg font-semibold text-foreground flex items-center">
              <TrendingUp className="w-5 h-5 mr-2" />
              Override Budget
            </h3>
          </div>
          <div className="p-4 space-y-4">
            <div>
              <div className="flex justify-between text-sm mb-2">
                <span className="text-foreground/70">Monthly Overrides</span>
                <span className="font-medium text-foreground">
                  {budget.monthlyUsed} / {budget.monthlyLimit} used
                </span>
              </div>
              <Progress 
                value={(budget.monthlyUsed / budget.monthlyLimit) * 100} 
                className="h-2"
              />
              <p className="text-xs text-foreground/50 mt-1">
                Resets: {formatDate(budget.resetsAt)}
              </p>
            </div>
            
            <div className="pt-3 border-t border-white/10">
              <div className="flex items-center justify-between">
                <span className="text-sm text-foreground/70">Emergency Overrides</span>
                <Badge variant="outline" className="font-medium bg-orange-500/20 text-orange-300 border-orange-500/30">
                  {budget.emergencyRemaining} remaining
                </Badge>
              </div>
              <p className="text-xs text-foreground/50 mt-1">
                ⚠️ Use for urgent requests only
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Bookings List */}
      <div>
        <h2 className="text-xl font-semibold text-foreground mb-4">
          Upcoming Appointments ({bookings.length})
        </h2>

        {bookings.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 ring-1 ring-white/10 py-12 text-center">
            <Calendar className="w-12 h-12 text-foreground/20 mx-auto mb-3" />
            <p className="text-foreground/70">No upcoming appointments</p>
            <p className="text-sm text-foreground/50 mt-1">
              Your schedule is clear for the next 30 days
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {bookings.map((booking) => (
              <div key={booking.id} className="rounded-2xl border border-white/10 bg-white/5 ring-1 ring-white/10 p-6 hover:bg-white/10 transition-all">
                {/* Time & Service */}
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <div className="text-lg font-semibold text-foreground flex items-center">
                      <Clock className="w-4 h-4 mr-2 text-foreground/60" />
                      {formatTime(booking.startTime)} - {formatTime(booking.endTime)}
                    </div>
                    <div className="text-sm text-foreground/70 mt-1">
                      {booking.serviceName} • {booking.serviceDuration} mins
                    </div>
                  </div>
                  <Badge className={getStatusBadge(booking.status)}>
                    {booking.status}
                  </Badge>
                </div>

                {/* Customer Info with History */}
                <div className="bg-white/5 border border-white/10 rounded-lg p-4">
                    <div className="flex items-center gap-3 mb-3">
                      <Avatar>
                        <AvatarFallback className="bg-blue-500/20 text-blue-300">
                          {booking.customerName[0]}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <div className="font-medium text-foreground flex items-center gap-2">
                          {booking.customerName}
                          {booking.isRepeatCustomer && (
                            <Badge variant="secondary" className="text-xs bg-purple-500/20 text-purple-300 border-purple-500/30">
                              <Star className="w-3 h-3 mr-1" />
                              Repeat Customer
                            </Badge>
                          )}
                        </div>
                        {booking.customerPhone && (
                          <div className="text-sm text-foreground/70">
                            {booking.customerPhone}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Customer History */}
                    {booking.history.totalBookings > 0 && (
                      <div className="mt-3 pt-3 border-t border-white/10 space-y-2">
                        <div className="text-xs font-medium text-foreground/60 uppercase">
                          Previous Visits
                        </div>
                        <div className="grid grid-cols-2 gap-3 text-sm">
                          <div>
                            <span className="text-foreground/70">Total visits:</span>
                            <span className="font-medium text-foreground ml-2">
                              {booking.history.totalBookings}
                            </span>
                          </div>
                          {booking.history.lastVisit && (
                            <div>
                              <span className="text-foreground/70">Last visit:</span>
                              <span className="font-medium text-foreground ml-2">
                                {formatDate(booking.history.lastVisit)}
                              </span>
                            </div>
                          )}
                        </div>
                        
                        {/* Safety Information (Privacy-by-Design) */}
                        {booking.history.hasAllergies && (
                          <div className="mt-3 p-3 bg-amber-500/10 border border-amber-500/20 rounded">
                            <div className="flex items-start justify-between">
                              <div className="flex items-start">
                                <AlertTriangle className="w-4 h-4 text-amber-400 mr-2 mt-0.5" />
                                <div>
                                  <p className="text-sm font-medium text-amber-300">
                                    {booking.history.allergySummary}
                                  </p>
                                  <Button
                                    variant="link"
                                    size="sm"
                                    className="text-xs p-0 h-auto text-amber-400 hover:text-amber-300"
                                    onClick={() => openSafetyDetails(booking)}
                                  >
                                    <Shield className="w-3 h-3 mr-1" />
                                    View Safety Details (Access will be logged)
                                  </Button>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Customer Notes */}
                    {booking.customerNotes && (
                      <div className="mt-3 pt-3 border-t border-white/10">
                        <p className="text-xs text-foreground/60 uppercase mb-1">Notes</p>
                        <p className="text-sm text-foreground/90">{booking.customerNotes}</p>
                      </div>
                    )}
                  </div>
                  
                  {/* Action Button */}
                  {booking.status === 'confirmed' && (
                    <div className="mt-4">
                      <Button
                        onClick={() => openActionsModal(booking)}
                        size="sm"
                        className="w-full"
                      >
                        Manage Booking
                      </Button>
                    </div>
                  )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Safety Details Modal */}
      {selectedBooking && (
        <SafetyDetailsModal
          booking={selectedBooking}
          isOpen={showSafetyModal}
          onClose={() => {
            setShowSafetyModal(false);
            setSelectedBooking(null);
          }}
        />
      )}

      {/* Booking Actions Modal */}
      {selectedBooking && (
        <BookingActionsModal
          booking={{
            id: selectedBooking.id,
            customerName: selectedBooking.customerName,
            serviceName: selectedBooking.serviceName,
            startTime: selectedBooking.startTime,
            endTime: selectedBooking.endTime,
            status: selectedBooking.status,
            customerNotes: selectedBooking.customerNotes,
            stylistNotes: undefined
          }}
          isOpen={showActionsModal}
          onClose={closeActionsModal}
          onSuccess={handleBookingUpdate}
        />
      )}
    </div>
  );
}
