"use client";
import * as React from "react";
import StylistCard from "@/components/homepage/StylistCard";
import StylistFilter from "@/components/booking/StylistFilter";
import BookingModal from "@/components/booking/BookingModal";
import type { StylistWithServices } from "@/lib/apiClient";

interface BookingPageClientProps {
  stylists: StylistWithServices[];
  categories: string[];
}

export default function BookingPageClient({ 
  stylists, 
  categories 
}: BookingPageClientProps) {
  const [filter, setFilter] = React.useState<string>("All");
  const [selected, setSelected] = React.useState<StylistWithServices | null>(null);

  // Filter stylists based on selected category
  const filteredStylists = React.useMemo(() => {
    if (filter === "All") return stylists;
    
    // Filter stylists who offer at least one service in the selected category
    return stylists.filter(stylist =>
      stylist.services.some(service => service.category === filter)
    );
  }, [stylists, filter]);

  return (
    <>
      {/* Filter bar */}
      <div className="mt-6 flex justify-end">
        <StylistFilter 
          specialties={categories} 
          value={filter} 
          onChange={setFilter} 
        />
      </div>

      {/* Stylist grid */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filteredStylists.map((stylist) => {
          // Create a stylist profile compatible with StylistCard
          const stylistProfile = {
            id: stylist.id,
            name: stylist.displayName,
            title: stylist.title || `${stylist.yearsExperience}+ years experience`,
            specialty: stylist.specialties[0] || 'General',
            bio: stylist.bio,
            profileImage: '/stylist-placeholder.jpg', // Use placeholder or fetch from database
            rating: stylist.ratingAverage || 5.0,
            reviewCount: stylist.totalBookings || 0,
            availability: 'Available Today', // Could be calculated from actual availability
            services: stylist.services.map(s => ({
              name: s.name,
              duration: `${s.durationMinutes} min`,
              price: s.priceCents / 100
            }))
          };

          return (
            <StylistCard
              key={stylist.id}
              stylist={stylistProfile}
              onBook={() => setSelected(stylist)}
              bookLabel="Book Now"
            />
          );
        })}
        {filteredStylists.length === 0 && (
          <div className="col-span-full rounded-xl border border-white/10 bg-white/5 p-8 text-center text-foreground/70">
            No stylists found for this category.
          </div>
        )}
      </div>

      {/* Booking modal */}
      {selected && (
        <BookingModal 
          stylist={selected} 
          open={Boolean(selected)} 
          onClose={() => setSelected(null)} 
        />
      )}
    </>
  );
}
