"use client";
import React from "react";
import type { Booking } from "@/lib/types";
import { CalendarDays, Clock, MapPin, Scissors } from "lucide-react";

export default function BookingDetails({
  booking,
  onEdit,
}: {
  booking: Booking;
  onEdit?: () => void;
}) {
  return (
    <section aria-labelledby="your-appointment" className="rounded-xl border border-white/10 bg-white/5 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 id="your-appointment" className="text-lg font-semibold tracking-tight">
          Your Appointment
        </h2>
        {onEdit && (
          <button
            type="button"
            onClick={onEdit}
            className="text-sm text-[var(--kb-primary-brand)] hover:underline"
          >
            Change
          </button>
        )}
      </div>

      <div className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-2 text-sm">
        <div className="col-span-2 mb-1 inline-flex items-center gap-2">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[var(--kb-primary-brand)]/15 ring-1 ring-[var(--kb-primary-brand)]/30">
            <Scissors className="h-4 w-4 text-[var(--kb-primary-brand)]" />
          </span>
          <div className="font-medium">{booking.service}</div>
        </div>
        <CalendarDays className="h-4 w-4 text-[var(--kb-accent-gold)]" />
        <div>{new Date(booking.date).toLocaleDateString()} </div>
        <Clock className="h-4 w-4 text-[var(--kb-accent-gold)]" />
        <div>
          {booking.time} • {booking.durationMins} mins
        </div>
        {booking.location && (
          <>
            <MapPin className="h-4 w-4 text-[var(--kb-accent-gold)]" />
            <div>{booking.location}</div>
          </>
        )}
      </div>
    </section>
  );
}
