"use client";
import * as React from "react";
import StylistCard from "@/components/homepage/StylistCard";
import StylistFilter from "@/components/booking/StylistFilter";
import BranchFilter from "@/components/booking/BranchFilter";
import BookingModal from "@/components/booking/BookingModal";
import type { StylistWithServices, KBBranch } from "@/lib/apiClient";

interface SpecialtyType {
  id: string;
  name: string;
  slug: string;
  category: string;
}

interface BookingPageClientProps {
  stylists: StylistWithServices[];
  categories: string[];
  specialtyTypes?: SpecialtyType[];
  branches: KBBranch[];
}

export default function BookingPageClient({ 
  stylists, 
  categories,
  specialtyTypes = [],
  branches
}: BookingPageClientProps) {
  const [filter, setFilter] = React.useState<string>("All");
  const [selectedBranch, setSelectedBranch] = React.useState<string | null>(null);
  const [selected, setSelected] = React.useState<StylistWithServices | null>(null);
  const [stylistSpecialties, setStylistSpecialties] = React.useState<Record<string, any[]>>({});

  // Fetch specialties for all stylists
  React.useEffect(() => {
    const fetchAllSpecialties = async () => {
      const specialtiesMap: Record<string, any[]> = {};
      
      await Promise.all(
        stylists.map(async (stylist) => {
          try {
            const response = await fetch(`/api/stylist-specialties/${stylist.id}`);
            if (response.ok) {
              const data = await response.json();
              specialtiesMap[stylist.id] = data.specialties || [];
            }
          } catch (error) {
            console.error(`Failed to fetch specialties for ${stylist.id}:`, error);
          }
        })
      );
      
      setStylistSpecialties(specialtiesMap);
    };

    fetchAllSpecialties();
  }, [stylists]);

  // Filter stylists based on selected branch, category, or specialty
  const filteredStylists = React.useMemo(() => {
    let filtered = stylists;
    
    // First filter by branch if selected
    if (selectedBranch) {
      filtered = filtered.filter(stylist => stylist.branch?.id === selectedBranch);
    }
    
    // Then filter by category/specialty if not "All"
    if (filter !== "All") {
      // Check if filter is a specialty ID (only if specialtyTypes is provided)
      const isSpecialtyFilter = specialtyTypes && specialtyTypes.length > 0 
        ? specialtyTypes.some(st => st.id === filter) 
        : false;
      
      if (isSpecialtyFilter) {
        // Filter by specialty
        filtered = filtered.filter(stylist => {
          const specs = stylistSpecialties[stylist.id] || [];
          return specs.some((s: any) => s.specialty_id === filter);
        });
      } else {
        // Filter by service category
        filtered = filtered.filter(stylist =>
          stylist.services.some(service => service.category === filter)
        );
      }
    }
    
    return filtered;
  }, [stylists, selectedBranch, filter, stylistSpecialties, specialtyTypes]);

  return (
    <>
      {/* Filter bar */}
      <div className="mt-6 space-y-4">
        {/* Branch filter - Primary filter */}
        <BranchFilter
          branches={branches}
          selectedBranch={selectedBranch}
          onBranchChange={setSelectedBranch}
        />
        
        {/* Category and specialty filters */}
        <StylistFilter 
          categories={categories}
          specialtyTypes={specialtyTypes}
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
            imageUrl: stylist.avatarUrl || '/stylist-placeholder.jpg',
            rating: stylist.ratingAverage || 0,
            reviewCount: stylist.totalBookings || 0,
            availability: 'Available Today', // Could be calculated from actual availability
            isFeatured: stylist.isFeatured,
            location: stylist.branch?.name, // Display branch name
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
