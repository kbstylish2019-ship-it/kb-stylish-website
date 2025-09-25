"use client";
import * as React from "react";
import FocusTrap from "focus-trap-react";
import { CalendarDays, Clock, X, Loader2, AlertCircle, Scissors } from "lucide-react";
import { useDecoupledCartStore, type CartBookingItem } from "@/lib/store/decoupledCartStore";
import { 
  fetchAvailableSlots, 
  updateBookingReservation
} from "@/lib/api/bookingClient";
import type { 
  StylistWithServices, 
  BookingService,
  AvailableSlot 
} from "@/lib/apiClient";

function nextNDates(n: number): Date[] {
  const list: Date[] = [];
  const base = new Date();
  for (let i = 0; i < n; i++) {
    const date = new Date(base);
    date.setDate(base.getDate() + i);
    list.push(date);
  }
  return list;
}

export default function ChangeAppointmentModal({
  booking,
  stylist,
  open,
  onClose,
}: {
  booking: CartBookingItem;
  stylist: StylistWithServices;
  open: boolean;
  onClose: () => void;
}) {
  // Store actions
  const removeBookingItem = useDecoupledCartStore((state) => state.removeBookingItem);
  const addBookingItem = useDecoupledCartStore((state) => state.addBookingItem);
  
  // Find current service from stylist services or use first one
  const currentService = stylist.services.find(s => s.id === booking.service_id) || stylist.services[0];
  
  const [selectedService, setSelectedService] = React.useState<BookingService | null>(currentService);
  const [selectedDate, setSelectedDate] = React.useState<Date | null>(new Date(booking.start_time));
  const [selectedSlot, setSelectedSlot] = React.useState<AvailableSlot | null>(null);
  const [availableSlots, setAvailableSlots] = React.useState<AvailableSlot[]>([]);
  const [isLoadingSlots, setIsLoadingSlots] = React.useState(false);
  const [isProcessing, setIsProcessing] = React.useState(false);
  const [bookingError, setBookingError] = React.useState<string | null>(null);
  const closeButtonRef = React.useRef<HTMLButtonElement>(null);

  // Load available slots when date or service changes
  React.useEffect(() => {
    async function loadSlots() {
      if (!selectedDate || !selectedService) {
        setAvailableSlots([]);
        return;
      }

      setIsLoadingSlots(true);
      setBookingError(null);
      
      try {
        // Make sure we have valid IDs
        const stylistId = stylist.id || booking.stylist_id;
        if (!stylistId) {
          throw new Error('Stylist ID is required');
        }
        
        console.log('[ChangeAppointmentModal] Fetching slots for:', {
          stylistId,
          serviceId: selectedService.id,
          serviceName: selectedService.name,
          date: selectedDate.toISOString().split('T')[0]
        });
        
        const slots = await fetchAvailableSlots({
          stylistId: stylistId,
          serviceId: selectedService.id,
          targetDate: selectedDate.toISOString().split('T')[0],
          customerTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone
        });
        
        console.log('[ChangeAppointmentModal] Received slots:', slots.length, slots);
        
        // Process slots to ensure proper availability marking
        const processedSlots = slots.map(slot => {
          // The backend returns isAvailable as a boolean
          // But we need to double-check it's properly marked
          const available = slot.isAvailable === true;
          
          // Additional check: if slot is in the past, mark as unavailable
          const slotTime = new Date(slot.slotStartUtc);
          const now = new Date();
          const isPast = slotTime < now;
          
          return {
            ...slot,
            isAvailable: available && !isPast
          };
        });
        
        setAvailableSlots(processedSlots);
        
        // If changing time for same date/service, try to find current slot
        if (selectedService.id === booking.service_id && 
            selectedDate.toDateString() === new Date(booking.start_time).toDateString()) {
          const currentSlot = processedSlots.find(slot => 
            new Date(slot.slotStartUtc).toISOString() === new Date(booking.start_time).toISOString()
          );
          setSelectedSlot(currentSlot || null);
        } else {
          setSelectedSlot(null);
        }
      } catch (error) {
        console.error('Error loading slots:', error);
        setBookingError('Failed to load available time slots. Please try again.');
        setAvailableSlots([]);
      } finally {
        setIsLoadingSlots(false);
      }
    }
    
    loadSlots();
  }, [selectedDate, selectedService, stylist.id, booking.service_id, booking.start_time]);

  const days = React.useMemo(() => nextNDates(14), []);

  const canConfirm = Boolean(selectedService && selectedDate && selectedSlot) && !isProcessing;

  const handleConfirm = async () => {
    if (!selectedService || !selectedDate || !selectedSlot) {
      setBookingError('Please select service, date and time');
      return;
    }
    
    setIsProcessing(true);
    setBookingError(null);
    
    try {
      console.log('[ChangeAppointment] Attempting to update reservation:', {
        reservationId: booking.reservation_id,
        bookingId: booking.id,
        serviceId: selectedService.id,
        startTime: selectedSlot.slotStartUtc
      });
      
      // If reservation has expired (error from update), create a new one
      let response = await updateBookingReservation({
        reservationId: booking.reservation_id || booking.id,
        serviceId: selectedService.id,
        startTime: selectedSlot.slotStartUtc,
      });
      
      // If update failed due to expired/missing reservation, create a new one
      if (!response.success && (response.code === 'RESERVATION_NOT_FOUND' || response.error?.includes('not found'))) {
        console.log('[ChangeAppointment] Reservation expired, creating new one...');
        
        const { createBookingReservation } = await import('@/lib/api/bookingClient');
        response = await createBookingReservation({
          serviceId: selectedService.id,
          stylistId: stylist.id,
          startTime: selectedSlot.slotStartUtc,
          customerName: booking.customer_name,
          customerPhone: booking.customer_phone || '',
          customerEmail: booking.customer_email || '',
          customerNotes: booking.customer_notes || ''
        });
      }
      
      if (response.success && response.reservation_id) {
        // Remove old booking and add updated one
        await removeBookingItem(booking.reservation_id);
        
        const success = await addBookingItem({
          reservation_id: response.reservation_id,
          service_id: selectedService.id,
          service_name: response.service_name || selectedService.name,
          stylist_id: stylist.id,
          stylist_name: response.stylist_name || stylist.displayName,
          start_time: response.start_time || selectedSlot.slotStartUtc,
          end_time: response.end_time || selectedSlot.slotEndUtc,
          price: (response.price_cents || selectedSlot.priceCents) / 100,
          customer_name: booking.customer_name,
          customer_phone: booking.customer_phone,
          customer_email: booking.customer_email,
          customer_notes: booking.customer_notes,
          expires_at: response.expires_at || ''
        });
        
        if (success) {
          onClose();
        } else {
          setBookingError('Failed to update booking in cart. Please try again.');
        }
      } else {
        setBookingError(response.error || 'Failed to update appointment. Please try again.');
      }
    } catch (error) {
      console.error('Booking update error:', error);
      setBookingError('An unexpected error occurred. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  if (!open) return null;

  return (
    <FocusTrap>
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/80" onClick={onClose} />
      <div className="relative w-full max-w-4xl bg-slate-900 rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 z-10 bg-slate-900 border-b border-white/10 p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-10 h-10 rounded-full bg-[var(--kb-primary-brand)]">
                <Scissors className="h-5 w-5 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-white">Change Appointment</h2>
                <p className="text-sm text-foreground/70">
                  Modify your appointment with {stylist.displayName}
                </p>
              </div>
            </div>
            <button
              ref={closeButtonRef}
              onClick={onClose}
              className="flex items-center justify-center w-8 h-8 text-foreground/60 hover:text-white hover:bg-white/10 rounded-full transition-colors"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Current Appointment Info */}
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4">
            <h3 className="font-medium text-amber-200 mb-2">Current Appointment</h3>
            <div className="text-sm text-amber-100/80">
              <p><strong>{booking.service_name}</strong></p>
              <p>{new Date(booking.start_time).toLocaleDateString('en-US', { 
                weekday: 'long', 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
              })} at {new Date(booking.start_time).toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit'
              })}</p>
              <p>NPR {booking.price.toFixed(0)}</p>
            </div>
          </div>

          {/* Error Display */}
          {bookingError && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
              <p className="text-red-200 text-sm">{bookingError}</p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Service Selection */}
            <div>
              <h3 className="text-sm font-medium text-foreground/90 mb-3 flex items-center gap-2">
                <Scissors className="h-4 w-4" />
                Select a Service
              </h3>
              <div className="space-y-2">
                {stylist.services.map((service) => (
                  <button
                    key={service.id}
                    onClick={() => setSelectedService(service)}
                    className={`w-full text-left p-4 rounded-lg transition-all ${
                      selectedService?.id === service.id
                        ? 'bg-[var(--kb-primary-brand)] text-white shadow-lg'
                        : 'bg-white/5 hover:bg-white/10 text-foreground/90'
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="font-medium">{service.name}</h4>
                        <p className="text-sm opacity-75">{service.durationMinutes} mins</p>
                      </div>
                      <span className="font-semibold">NPR {service.priceCents / 100}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Date & Time Selection */}
            <div>
              <h3 className="text-sm font-medium text-foreground/90 mb-3 flex items-center gap-2">
                <CalendarDays className="h-4 w-4" />
                Pick a Date
              </h3>
              <div className="grid grid-cols-7 gap-1 mb-4">
                {days.map((date) => {
                  const isSelected = selectedDate?.toDateString() === date.toDateString();
                  const isToday = date.toDateString() === new Date().toDateString();
                  return (
                    <button
                      key={date.toISOString()}
                      onClick={() => setSelectedDate(date)}
                      className={`p-2 text-center rounded-lg transition-all ${
                        isSelected
                          ? 'bg-[var(--kb-primary-brand)] text-white'
                          : isToday
                          ? 'bg-white/10 text-foreground/90'
                          : 'hover:bg-white/5 text-foreground/70'
                      }`}
                    >
                      <div className="text-xs">{date.getDate()}</div>
                    </button>
                  );
                })}
              </div>

              <h3 className="text-sm font-medium text-foreground/90 mb-3 flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Select a Time
              </h3>
              
              {isLoadingSlots ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-[var(--kb-primary-brand)]" />
                </div>
              ) : availableSlots.length > 0 ? (
                <div className="grid grid-cols-4 gap-2 max-h-64 overflow-y-auto">
                  {availableSlots.map((slot) => {
                    const active = selectedSlot?.slotStartUtc === slot.slotStartUtc;
                    const status = slot.status || (slot.isAvailable ? 'available' : 'unavailable');
                    const disabled = status !== 'available';
                    
                    // World-class status-based styling (same as BookingModal)
                    let slotClassName = "relative rounded-lg px-2 py-2 text-sm font-medium transition-all ";
                    let statusIcon = null;
                    
                    switch(status) {
                      case 'available':
                        slotClassName += active
                          ? "bg-[var(--kb-primary-brand)] text-white shadow-lg ring-2 ring-[var(--kb-primary-brand)]/50"
                          : "bg-white/5 text-white hover:bg-white/10 ring-1 ring-white/10";
                        break;
                      case 'booked':
                        slotClassName += "bg-red-500/10 text-red-400/50 cursor-not-allowed ring-1 ring-red-500/20";
                        statusIcon = <span className="absolute top-0 right-0 -mt-1 -mr-1 text-xs">🔒</span>;
                        break;
                      case 'in_break':
                        slotClassName += "bg-yellow-500/10 text-yellow-400/50 cursor-not-allowed ring-1 ring-yellow-500/20";
                        statusIcon = <span className="absolute top-0 right-0 -mt-1 -mr-1 text-xs">☕</span>;
                        break;
                      case 'unavailable':
                        slotClassName += "bg-gray-500/5 text-gray-400/30 cursor-not-allowed ring-1 ring-gray-500/10";
                        break;
                    }
                    
                    const displayTime = slot.slotDisplay || 
                      new Date(slot.slotStartUtc).toLocaleTimeString('en-US', {
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: false
                      });
                    
                    return (
                      <button
                        key={slot.slotStartUtc}
                        onClick={() => !disabled && setSelectedSlot(slot)}
                        disabled={disabled}
                        className={slotClassName}
                        aria-label={`Time ${displayTime} - ${status}`}
                        title={status === 'booked' ? 'Already booked' : 
                               status === 'in_break' ? 'Break time' : 
                               status === 'unavailable' ? 'Unavailable' : 
                               'Available'}
                      >
                        {statusIcon}
                        {displayTime}
                      </button>
                    );
                  })}
                </div>
              ) : selectedDate && selectedService ? (
                <div className="text-center py-8 text-foreground/60">
                  No available slots for this date
                </div>
              ) : (
                <div className="text-center py-8 text-foreground/60">
                  Select service and date to see available times
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-slate-900 border-t border-white/10 p-6">
          <div className="flex items-center justify-between">
            <div className="text-sm text-foreground/70">
              {selectedService ? (
                <>
                  {selectedService.name} • {selectedService.durationMinutes} mins
                </>
              ) : (
                <>Select service, date and time</>
              )}
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-foreground/70 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={!canConfirm}
                className="inline-flex items-center justify-center rounded-lg bg-[var(--kb-primary-brand)] px-6 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50 hover:bg-[var(--kb-primary-brand)]/90 transition-colors"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Updating...
                  </>
                ) : (
                  'Update Appointment'
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
    </FocusTrap>
  );
}
