"use client";
import * as React from "react";
import { CalendarDays, Clock, Scissors, X } from "lucide-react";
import { useCartStore } from "@/lib/store/cartStore";
import type { Booking, Stylist } from "@/lib/types";
import type { StylistProfile, StylistService } from "@/lib/mock/stylists";

function makeTimeSlots(start: string, end: string, stepMins = 30): string[] {
  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  const [sh, sm] = start.split(":" ).map(Number);
  const [eh, em] = end.split(":" ).map(Number);
  const slots: string[] = [];
  const startMin = sh * 60 + sm;
  const endMin = eh * 60 + em;
  for (let t = startMin; t <= endMin; t += stepMins) {
    const h = Math.floor(t / 60);
    const m = t % 60;
    slots.push(`${pad(h)}:${pad(m)}`);
  }
  return slots;
}

function nextNDates(n: number): Date[] {
  const list: Date[] = [];
  const base = new Date();
  base.setHours(0, 0, 0, 0);
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
  stylist: StylistProfile;
  open: boolean;
  onClose: () => void;
}) {
  const addBooking = useCartStore((s) => s.addBooking);
  const [selectedService, setSelectedService] = React.useState<StylistService | null>(null);
  const [selectedDate, setSelectedDate] = React.useState<Date | null>(null);
  const [selectedTime, setSelectedTime] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) {
      setSelectedService(null);
      setSelectedDate(null);
      setSelectedTime(null);
    }
  }, [open]);

  const days = React.useMemo(() => nextNDates(14), []);
  const slots = React.useMemo(() => makeTimeSlots("10:00", "18:00", 30), []);

  const canConfirm = Boolean(selectedService && selectedDate && selectedTime);

  const onConfirm = () => {
    if (!canConfirm || !selectedService || !selectedDate || !selectedTime) return;
    const booking: Booking = {
      id: `bk-${Date.now()}`,
      stylist: stylist.name,
      service: selectedService.name,
      date: selectedDate.toISOString().slice(0, 10),
      time: selectedTime,
      durationMins: selectedService.durationMins,
      location: stylist.location,
      price: selectedService.price,
    };
    addBooking(booking);
    onClose();
  };

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center"
      data-testid="booking-modal"
    >
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 w-full max-w-2xl overflow-hidden rounded-2xl border border-white/10 bg-background shadow-2xl ring-1 ring-white/10">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[var(--kb-primary-brand)]/15 ring-1 ring-[var(--kb-primary-brand)]/30">
              <Scissors className="h-4 w-4 text-[var(--kb-primary-brand)]" />
            </span>
            <div>
              <div className="text-sm text-foreground/60">Book with</div>
              <div className="text-base font-semibold">{stylist.name}</div>
            </div>
          </div>
          <button aria-label="Close" onClick={onClose} className="rounded-md p-1 hover:bg-white/5">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid gap-5 p-5 sm:grid-cols-2">
          {/* Services */}
          <div>
            <div className="mb-2 text-sm font-medium">Select a Service</div>
            <div className="space-y-2" data-testid="service-list">
              {stylist.services.map((svc) => {
                const active = selectedService?.name === svc.name;
                return (
                  <label
                    key={svc.name}
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
                      <div className="text-foreground/60">{svc.durationMins} mins</div>
                    </div>
                    <div className="font-semibold">NPR {svc.price.toLocaleString("en-NP")}</div>
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
              <div className="grid grid-cols-4 gap-2" data-testid="time-grid">
                {slots.map((t) => {
                  const active = selectedTime === t;
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setSelectedTime(t)}
                      className={`rounded-md px-2 py-1 text-sm ring-1 ${
                        active
                          ? "bg-[var(--kb-primary-brand)]/20 ring-[var(--kb-primary-brand)]/50"
                          : "bg-white/5 ring-white/10 hover:bg-white/10"
                      }`}
                      aria-label={`Time ${t}`}
                    >
                      {t}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-white/10 px-5 py-4">
          <div className="text-sm text-foreground/70">
            {selectedService ? (
              <>
                {selectedService.name} • {selectedService.durationMins} mins
              </>
            ) : (
              <>Select service, date and time</>
            )}
          </div>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!canConfirm}
            className="inline-flex items-center justify-center rounded-lg bg-[var(--kb-primary-brand)] px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            Confirm & Add to Cart
          </button>
        </div>
      </div>
    </div>
  );
}
