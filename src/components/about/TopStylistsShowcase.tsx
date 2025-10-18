import Link from "next/link";
import Image from "next/image";
import { Star } from "lucide-react";
import { fetchTopStylists } from "@/lib/apiClient";

export default async function TopStylistsShowcase() {
  const stylists = await fetchTopStylists(3);
  if (stylists.length === 0) return null;

  return (
    <section className="mx-auto max-w-7xl px-4 py-16">
      <div className="flex items-end justify-between mb-8">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Meet Our Top Stylists</h2>
          <p className="mt-2 text-sm text-foreground/60">Top performers by bookings and ratings</p>
        </div>
        <Link href="/book-a-stylist" className="text-sm text-foreground/70 hover:text-foreground">
          View all →
        </Link>
      </div>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {stylists.map((s) => (
          <Link key={s.stylist_id} href={`/book-a-stylist?stylist=${s.stylist_id}`}
            className="group relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.07] to-white/[0.02] backdrop-blur-sm transition-all duration-300 hover:border-white/20 hover:shadow-xl">
            <div className="relative aspect-[4/3] overflow-hidden">
              {s.avatar_url ? <Image src={s.avatar_url} alt={s.display_name} fill className="object-cover transition-transform duration-300 group-hover:scale-105" sizes="33vw" />
              : <div className="size-full bg-gradient-to-br from-[var(--kb-primary-brand)]/20 to-[var(--kb-accent-gold)]/20 flex items-center justify-center">
                  <span className="text-6xl font-bold text-white/30">{s.display_name.charAt(0).toUpperCase()}</span>
                </div>}
              <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
            </div>
            <div className="p-6">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h3 className="text-xl font-bold">{s.display_name}</h3>
                  {s.title && <p className="mt-1 text-sm text-foreground/70">{s.title}</p>}
                </div>
                {s.rating_average && s.rating_average > 0 && (
                  <div className="flex items-center gap-1 rounded-full bg-white/5 px-2.5 py-1 text-xs ring-1 ring-white/10">
                    <Star className="h-3.5 w-3.5 fill-[var(--kb-accent-gold)] text-[var(--kb-accent-gold)]" />
                    <span className="font-medium">{s.rating_average.toFixed(1)}</span>
                  </div>
                )}
              </div>
              <div className="mt-4 flex items-center gap-4 text-sm text-foreground/60">
                {s.years_experience && <><span>{s.years_experience} years exp</span><span>•</span></>}
                <span>{s.total_bookings} bookings</span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
