import { fetchActiveStylistsWithServices, fetchActiveBranches } from "@/lib/apiClient";
import BookingPageClient from "@/components/booking/BookingPageClient";
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

async function createClient() {
  const cookieStore = await cookies();
  
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {}
        },
      },
    }
  );
}

// Server Component that fetches live data
export default async function BookAStylistPage() {
  // Fetch real stylists with their services and branch data from the database
  const stylists = await fetchActiveStylistsWithServices();
  
  // Fetch active KB Stylish branches for location filtering
  const branches = await fetchActiveBranches();

  // Get unique categories from all services
  const categoriesSet = new Set<string>();
  categoriesSet.add("All"); // Add "All" as first option
  
  stylists.forEach(stylist => {
    stylist.services.forEach(service => {
      categoriesSet.add(service.category);
    });
  });
  
  const categories = Array.from(categoriesSet);

  // Fetch active specialty types for filtering
  const supabase = await createClient();
  const { data: specialtyTypes } = await supabase
    .from('specialty_types')
    .select('id, name, slug, category')
    .eq('is_active', true)
    .order('display_order');

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
        specialtyTypes={specialtyTypes || []}
        branches={branches}
      />
    </div>
  );
}
