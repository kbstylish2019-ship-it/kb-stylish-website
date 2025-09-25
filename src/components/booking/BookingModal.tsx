"use client";
import * as React from "react";
import FocusTrap from "focus-trap-react";
import { CalendarDays, Clock, Scissors, X, Loader2, AlertCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useDecoupledCartStore } from "@/lib/store/decoupledCartStore";
import { 
  fetchAvailableSlots, 
  createBookingReservation
} from "@/lib/api/bookingClient";
import type { 
  StylistWithServices, 
  BookingService,
  AvailableSlot 
} from "@/lib/apiClient";

function nextNDates(n: number): Date[] {
  const list: Date[] = [];
  const base = new Date();
  base.setHours(0, 0, 0, 0);
  // Start from tomorrow (min advance booking is 2 hours, so tomorrow is safer)
  base.setDate(base.getDate() + 1);
  for (let i = 0; i < n; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    list.push(d);
  }
  return list;
}

export default function BookingModal({
  stylist,
  open,
  onClose,
}: {
  stylist: StylistWithServices;
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  // Use individual selectors to avoid infinite loop
  const addBookingItem = useDecoupledCartStore((state) => state.addBookingItem);
  const isAddingBooking = useDecoupledCartStore((state) => state.isAddingBooking);
  const [selectedService, setSelectedService] = React.useState<BookingService | null>(null);
  const [selectedDate, setSelectedDate] = React.useState<Date | null>(null);
  const [selectedSlot, setSelectedSlot] = React.useState<AvailableSlot | null>(null);
  const [availableSlots, setAvailableSlots] = React.useState<AvailableSlot[]>([]);
  const [isLoadingSlots, setIsLoadingSlots] = React.useState(false);
  const [isProcessing, setIsProcessing] = React.useState(false);
  const [bookingError, setBookingError] = React.useState<string | null>(null);
  const closeButtonRef = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    if (!open) {
      setSelectedService(null);
      setSelectedDate(null);
      setSelectedSlot(null);
      setAvailableSlots([]);
      setBookingError(null);
    } else if (closeButtonRef.current) {
      closeButtonRef.current.focus();
    }
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Fetch available slots when date and service are selected
  React.useEffect(() => {
    async function loadSlots() {
      if (!selectedDate || !selectedService) {
        setAvailableSlots([]);
        return;
      }

      setIsLoadingSlots(true);
      setBookingError(null);
      
      try {
        // Format date as YYYY-MM-DD
        const year = selectedDate.getFullYear();
        const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
        const day = String(selectedDate.getDate()).padStart(2, '0');
        const targetDate = `${year}-${month}-${day}`;
        
        const slots = await fetchAvailableSlots({
          stylistId: stylist.id,
          serviceId: selectedService.id,
          targetDate,
          customerTimezone: 'Asia/Kathmandu'
        });
        
        setAvailableSlots(slots);
      } catch (error) {
        console.error('Error fetching slots:', error);
        setBookingError('Failed to load available time slots. Please try again.');
      } finally {
        setIsLoadingSlots(false);
      }
    }
    
    loadSlots();
  }, [selectedDate, selectedService, stylist.id]);

  const days = React.useMemo(() => nextNDates(14), []);

  const canConfirm = Boolean(selectedService && selectedDate && selectedSlot) && !isProcessing;

  const handleConfirm = async () => {
    if (!selectedService || !selectedDate || !selectedSlot) {
      setBookingError('Please complete all required fields');
      return;
    }
    
    setIsProcessing(true);
    setBookingError(null);
    
    try {
      // THE GREAT DECOUPLING: Create a booking reservation (separate from cart)
      const reservationResponse = await createBookingReservation({
        stylistId: stylist.id,
        serviceId: selectedService.id,
        startTime: selectedSlot.slotStartUtc,
        customerName: 'Customer', // In production, fetch from user profile
        customerPhone: '', // Optional
        customerEmail: '', // Optional
        customerNotes: '' // Optional
      });
      
      if (reservationResponse.success && reservationResponse.reservation_id) {
        // Add the booking to the decoupled cart store (not as a product!)
        const success = await addBookingItem({
          reservation_id: reservationResponse.reservation_id,
          service_id: selectedService.id,
          service_name: reservationResponse.service_name || selectedService.name,
          stylist_id: stylist.id,
          stylist_name: reservationResponse.stylist_name || stylist.displayName,
          start_time: reservationResponse.start_time || selectedSlot.slotStartUtc,
          end_time: reservationResponse.end_time || selectedSlot.slotEndUtc,
          price: (reservationResponse.price_cents || selectedSlot.priceCents) / 100,
          customer_name: 'Customer', // In production, fetch from user profile
          customer_phone: '',
          customer_email: '',
          customer_notes: '',
          expires_at: reservationResponse.expires_at || ''
        });
        
        if (success) {
          // WORLD-CLASS FUNNEL: Navigate directly to checkout
          console.log('[BookingModal] Successfully added booking to cart, navigating to checkout...');
          onClose();
          // Seamless navigation to checkout page
          router.push('/checkout');
        } else {
          setBookingError('Failed to add booking to cart. Please try again.');
        }
      } else {
        setBookingError(reservationResponse.error || 'Failed to create booking reservation. Please try again.');
      }
    } catch (error) {
      console.error('Booking error:', error);
      setBookingError('An unexpected error occurred. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  if (!open) return null;

  return (
    <FocusTrap active={open}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="booking-modal-title"
        className="fixed inset-0 z-50 flex items-center justify-center"
        data-testid="booking-modal"
      >
        <div 
          className="absolute inset-0 bg-black/50" 
          onClick={onClose}
          role="button"
          tabIndex={0}
          aria-label="Close overlay"
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onClose();
            }
          }}
        />
        <div className="relative z-10 w-full max-w-2xl overflow-hidden rounded-2xl border border-white/10 bg-background shadow-2xl ring-1 ring-white/10">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[var(--kb-primary-brand)]/15 ring-1 ring-[var(--kb-primary-brand)]/30">
              <Scissors className="h-4 w-4 text-[var(--kb-primary-brand)]" />
            </span>
            <div>
              <div className="text-sm text-foreground/60">Book with</div>
              <div id="booking-modal-title" className="text-base font-semibold">{stylist.displayName}</div>
            </div>
          </div>
          <button ref={closeButtonRef} aria-label="Close" onClick={onClose} className="rounded-md p-1 hover:bg-white/5">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid gap-5 p-5 sm:grid-cols-2">
          {/* Services */}
          <div>
            <div className="mb-2 text-sm font-medium">Select a Service</div>
            <div className="space-y-2" data-testid="service-list">
              {stylist.services.map((svc) => {
                const active = selectedService?.id === svc.id;
                return (
                  <label
                    key={svc.id}
                    className={`flex cursor-pointer items-center justify-between rounded-lg border px-3 py-2 text-sm ring-1 ${
                      active
                        ? "border-[var(--kb-primary-brand)]/50 bg-[var(--kb-primary-brand)]/10 ring-[var(--kb-primary-brand)]/50"
                        : "border-white/10 bg-white/5 ring-white/10 hover:bg-white/10"
                    }`}
                  >
                    <input
                      type="radio"
                      name="service"
                      className="sr-only"
                      checked={active}
                      onChange={() => setSelectedService(svc)}
                      aria-label={`Service ${svc.name}`}
                    />
                    <div>
                      <div className="font-medium">{svc.name}</div>
                      <div className="text-foreground/60">{svc.durationMinutes} mins</div>
                    </div>
                    <div className="font-semibold">NPR {(svc.priceCents / 100).toLocaleString("en-NP")}</div>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Date & Time */}
          <div className="space-y-4">
            <div>
              <div className="mb-2 inline-flex items-center gap-2 text-sm font-medium">
                <CalendarDays className="h-4 w-4 text-[var(--kb-accent-gold)]" />
                Pick a Date
              </div>
              <div className="grid grid-cols-7 gap-2" data-testid="date-grid">
                {days.map((d) => {
                  const key = d.toISOString().slice(0, 10);
                  const active = selectedDate?.toDateString() === d.toDateString();
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setSelectedDate(d)}
                      className={`rounded-md px-2 py-1 text-sm ring-1 ${
                        active
                          ? "bg-[var(--kb-primary-brand)]/20 ring-[var(--kb-primary-brand)]/50"
                          : "bg-white/5 ring-white/10 hover:bg-white/10"
                      }`}
                      aria-label={`Date ${d.toDateString()}`}
                    >
                      {d.getDate()}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="mb-2 inline-flex items-center gap-2 text-sm font-medium">
                <Clock className="h-4 w-4 text-[var(--kb-accent-gold)]" />
                Select a Time
              </div>
              {isLoadingSlots ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-foreground/60" />
                </div>
              ) : bookingError ? (
                <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">
                  {bookingError}
                </div>
              ) : availableSlots.length === 0 && selectedDate && selectedService ? (
                <div className="rounded-lg border border-white/10 bg-white/5 p-3 text-center text-sm text-foreground/60">
                  No available time slots for this date
                </div>
              ) : (
                <div className="grid grid-cols-4 gap-2" data-testid="time-grid">
                  {availableSlots.map((slot: AvailableSlot) => {
                    const active = selectedSlot?.slotStartUtc === slot.slotStartUtc;
                    const status = slot.status || (slot.isAvailable ? 'available' : 'unavailable');
                    const disabled = status !== 'available';
                    
                    // World-class status-based styling
                    let slotClassName = "relative rounded-lg px-3 py-2 text-sm font-medium transition-all ";
                    let slotContent = slot.slotDisplay;
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
                      case 'reserved':
                        slotClassName += "bg-orange-500/10 text-orange-400/50 cursor-not-allowed ring-1 ring-orange-500/20";
                        statusIcon = <span className="absolute top-0 right-0 -mt-1 -mr-1 text-xs">⏳</span>;
                        break;
                      case 'in_break':
                        slotClassName += "bg-yellow-500/10 text-yellow-400/50 cursor-not-allowed ring-1 ring-yellow-500/20";
                        statusIcon = <span className="absolute top-0 right-0 -mt-1 -mr-1 text-xs">☕</span>;
                        break;
                      case 'unavailable':
                        slotClassName += "bg-gray-500/5 text-gray-400/30 cursor-not-allowed ring-1 ring-gray-500/10";
                        break;
                    }
                    
                    return (
                      <button
                        key={slot.slotStartUtc}
                        type="button"
                        onClick={() => !disabled && setSelectedSlot(slot)}
                        disabled={disabled}
                        className={slotClassName}
                        aria-label={`Time ${slot.slotDisplay} - ${status}`}
                        title={status === 'booked' ? 'Already booked' : 
                               status === 'in_break' ? 'Break time' : 
                               status === 'unavailable' ? 'Unavailable' : 
                               'Available'}
                      >
                        {statusIcon}
                        {slot.slotDisplay.split(' - ')[0]}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-white/10 px-5 py-4">
          <div className="text-sm text-foreground/70">
            {selectedService ? (
              <>
                {selectedService.name} • {selectedService.durationMinutes} mins
              </>
            ) : (
              <>Select service, date and time</>
            )}
          </div>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!canConfirm}
            className="inline-flex items-center justify-center rounded-lg bg-[var(--kb-primary-brand)] px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            Confirm & Add to Cart
          </button>
        </div>
      </div>
    </div>
    </FocusTrap>
  );
}
