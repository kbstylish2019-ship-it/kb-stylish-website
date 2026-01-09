import Link from "next/link";
import Image from "next/image";
import { Star } from "lucide-react";
import { fetchFeaturedStylists } from "@/lib/apiClient";

export default async function FeaturedStylists() {
  const stylists = await fetchFeaturedStylists(3);
  
  // Don't render section if no featured stylists
  if (stylists.length === 0) return null;
  
  return (
    <section className="mx-auto max-w-7xl px-4 py-16">
      <div className="flex items-end justify-between mb-8">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-gray-900">Featured Stylists</h2>
          <p className="mt-2 text-sm text-gray-600">Book with our top-rated professionals</p>
        </div>
        <Link 
          href="/book-a-stylist" 
          className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
        >
          View all →
        </Link>
      </div>
      
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {stylists.map((stylist) => (
          <Link
            key={stylist.stylist_id}
            href={`/book-a-stylist?stylist=${stylist.stylist_id}`}
            className="group relative overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm transition-all duration-300 hover:border-gray-300 hover:shadow-lg"
          >
            {/* Stylist Photo */}
            <div className="relative aspect-[4/3] overflow-hidden">
              {stylist.avatar_url ? (
                <Image
                  src={stylist.avatar_url}
                  alt={stylist.display_name}
                  fill
                  className="object-cover transition-transform duration-300 group-hover:scale-105"
                  sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                />
              ) : (
                <div className="size-full bg-gradient-to-br from-[#1976D2]/20 to-[#FFD400]/20 flex items-center justify-center">
                  <span className="text-6xl font-bold text-gray-300">
                    {stylist.display_name.charAt(0).toUpperCase()}
                  </span>
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
            </div>
            
            {/* Stylist Info */}
            <div className="p-6">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h3 className="text-xl font-bold tracking-tight text-gray-900 transition-colors group-hover:text-gray-700">
                    {stylist.display_name}
                  </h3>
                  {stylist.title && (
                    <p className="mt-1 text-sm text-gray-600">{stylist.title}</p>
                  )}
                </div>
                {stylist.rating_average && stylist.rating_average > 0 && (
                  <div className="flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-xs ring-1 ring-gray-200">
                    <Star className="h-3.5 w-3.5 fill-[#FFD400] text-[#FFD400]" />
                    <span className="font-medium text-gray-900">{stylist.rating_average.toFixed(1)}</span>
                  </div>
                )}
              </div>
              
              <div className="mt-4 flex items-center gap-4 text-sm text-gray-500">
                {stylist.years_experience && stylist.years_experience > 0 && (
                  <>
                    <span>{stylist.years_experience} years exp</span>
                    <span>•</span>
                  </>
                )}
                <span>{stylist.total_bookings} bookings</span>
              </div>
              
              {stylist.specialties && stylist.specialties.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {stylist.specialties.slice(0, 3).map((specialty, idx) => (
                    <span 
                      key={idx}
                      className="rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-600 ring-1 ring-gray-200"
                    >
                      {specialty}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
