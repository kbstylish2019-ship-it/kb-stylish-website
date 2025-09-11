"use client";
import * as React from "react";
import StylistCard from "@/components/homepage/StylistCard";
import StylistFilter from "@/components/booking/StylistFilter";
import BookingModal from "@/components/booking/BookingModal";
import { STYLISTS, listSpecialties, type StylistProfile } from "@/lib/mock/stylists";

export default function BookAStylistPage() {
  const [filter, setFilter] = React.useState<string>("All");
  const specialties = React.useMemo(() => listSpecialties(STYLISTS), []);
  const list = React.useMemo(() => {
    if (filter === "All") return STYLISTS;
    return STYLISTS.filter((s) => s.specialty === filter);
  }, [filter]);

  const [selected, setSelected] = React.useState<StylistProfile | null>(null);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Book a Stylist</h1>
          <p className="mt-1 text-sm text-foreground/70">
            Discover top stylists and book appointments instantly.
          </p>
        </div>
        <StylistFilter specialties={specialties} value={filter} onChange={setFilter} />
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((stylist) => (
          <StylistCard
            key={stylist.id}
            stylist={stylist}
            onBook={() => setSelected(stylist)}
            bookLabel="Book"
          />
        ))}
        {list.length === 0 && (
          <div className="col-span-full rounded-xl border border-white/10 bg-white/5 p-8 text-center text-foreground/70">
            No stylists found for this specialty.
          </div>
        )}
      </div>

      {selected && (
        <BookingModal stylist={selected} open={Boolean(selected)} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
