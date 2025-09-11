import { Star } from "lucide-react";
import type { Stylist } from "@/lib/types";

export default function StylistCard({
  stylist,
  onBook,
  bookLabel = "Book",
}: {
  stylist: Stylist;
  onBook?: () => void;
  bookLabel?: string;
}) {
  const fullStars = Math.round(stylist.rating);
  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/5 ring-1 ring-white/10">
      <div className="relative aspect-[4/3] w-full overflow-hidden">
        {stylist.imageUrl ? (
          <img src={stylist.imageUrl} alt={stylist.name} className="size-full object-cover" />
        ) : (
          <div className="size-full bg-gradient-to-br from-[var(--kb-primary-brand)]/20 to-[var(--kb-accent-gold)]/20" />
        )}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-black/10" />
      </div>
      <div className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-base font-semibold">{stylist.name}</p>
            <p className="text-sm text-foreground/70">{stylist.specialty}</p>
          </div>
          <div className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-1 text-xs ring-1 ring-white/10">
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
}
