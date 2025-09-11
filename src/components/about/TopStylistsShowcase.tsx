import Link from "next/link";
import StylistCard from "@/components/homepage/StylistCard";
import { STYLISTS } from "@/lib/mock/stylists";

export default function TopStylistsShowcase() {
  const top = STYLISTS.slice(0, 3);
  return (
    <section className="mx-auto max-w-7xl px-4 py-16">
      <div className="flex items-end justify-between">
        <h2 className="text-2xl font-semibold tracking-tight">Meet Our Top Stylists</h2>
        <Link href="/book-a-stylist" className="text-sm text-foreground/70 hover:text-foreground">
          View all
        </Link>
      </div>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {top.map((s) => (
          <StylistCard key={s.id} stylist={s} />
        ))}
      </div>
    </section>
  );
}
