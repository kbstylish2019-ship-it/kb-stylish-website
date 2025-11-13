import React from "react";
import Image from "next/image";
import { Star, Award, MapPin } from "lucide-react";
import type { Stylist } from "@/lib/types";

/**
 * StylistCard component displays stylist information with booking capability.
 * Memoized to prevent unnecessary re-renders in stylist lists.
 * 
 * @param stylist - Stylist data to display
 * @param onBook - Optional callback for booking action
 * @param bookLabel - Custom label for book button
 * @returns Memoized stylist card component
 */
const StylistCard = React.memo(function StylistCard({
  stylist,
  onBook,
  bookLabel = "Book",
}: {
  stylist: Stylist;
  onBook?: () => void;
  bookLabel?: string;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/5 ring-1 ring-white/10">
      <div className="relative aspect-[4/3] w-full overflow-hidden">
        {stylist.imageUrl ? (
          <Image 
            src={stylist.imageUrl} 
            alt={stylist.name} 
            fill
            className="object-cover" 
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          />
        ) : (
          <div className="size-full bg-gradient-to-br from-[var(--kb-primary-brand)]/20 to-[var(--kb-accent-gold)]/20" />
        )}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-black/10" />
        
        {/* Featured Badge */}
        {stylist.isFeatured && (
          <div className="absolute right-3 top-3 flex items-center gap-1.5 rounded-full bg-gradient-to-r from-amber-500/90 to-yellow-500/90 px-3 py-1.5 text-xs font-semibold text-black shadow-lg backdrop-blur-sm ring-1 ring-amber-400/50">
            <Award className="h-3.5 w-3.5" />
            <span>Featured</span>
          </div>
        )}
      </div>
      <div className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex-1 min-w-0">
            <p className="text-base font-semibold">{stylist.name}</p>
            <p className="text-sm text-foreground/70">{stylist.specialty}</p>
            {stylist.location && (
              <div className="flex items-center gap-1 mt-1">
                <MapPin className="h-3 w-3 text-foreground/50" />
                <p className="text-xs text-foreground/50 truncate">{stylist.location}</p>
              </div>
            )}
          </div>
          <div className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-1 text-xs ring-1 ring-white/10 ml-2">
            <Star className="h-3.5 w-3.5 text-[var(--kb-accent-gold)]" />
            <span>{stylist.rating.toFixed(1)}</span>
          </div>
        </div>
        {onBook && (
          <div className="mt-4">
            <button
              type="button"
              onClick={onBook}
              className="inline-flex w-full items-center justify-center rounded-lg bg-[var(--kb-primary-brand)] px-3 py-2 text-sm font-medium text-white hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-[var(--kb-accent-gold)]/40"
            >
              {bookLabel}
            </button>
          </div>
        )}
      </div>
    </div>
  );
});

export default StylistCard;
