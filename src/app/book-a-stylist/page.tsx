import { fetchActiveStylistsWithServices } from "@/lib/apiClient";
import BookingPageClient from "@/components/booking/BookingPageClient";

// Server Component that fetches live data
export default async function BookAStylistPage() {
  // Fetch real stylists with their services from the database
  const stylists = await fetchActiveStylistsWithServices();

  // Get unique categories from all services
  const categoriesSet = new Set<string>();
  categoriesSet.add("All"); // Add "All" as first option
  
  stylists.forEach(stylist => {
    stylist.services.forEach(service => {
      categoriesSet.add(service.category);
    });
  });
  
  const categories = Array.from(categoriesSet);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Book a Stylist</h1>
          <p className="mt-1 text-sm text-foreground/70">
            Discover top stylists and book appointments instantly.
          </p>
        </div>
      </div>

      {/* Client component handles interactive filtering and booking */}
      <BookingPageClient 
        stylists={stylists} 
        categories={categories}
      />
    </div>
  );
}
