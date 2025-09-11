import Link from "next/link";

export default function HeroSection() {
  return (
    <section className="relative overflow-hidden">
      {/* Background accents */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-24 -left-24 h-72 w-72 rounded-full bg-[var(--kb-primary-brand)]/15 blur-3xl" />
        <div className="absolute -bottom-32 -right-24 h-80 w-80 rounded-full bg-[var(--kb-accent-gold)]/20 blur-3xl" />
      </div>

      <div className="mx-auto max-w-7xl px-4 py-16 sm:py-20 lg:py-28">
        <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full bg-white/5 px-3 py-1 text-xs font-medium ring-1 ring-white/10">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--kb-accent-gold)]" />
              Nepal's premier style marketplace
            </span>
            <h1 className="mt-4 text-4xl font-extrabold tracking-tight sm:text-5xl lg:text-6xl">
              <span className="bg-gradient-to-b from-[var(--kb-text-primary)] to-white/70 bg-clip-text text-transparent">
                Elevate your everyday style
              </span>
            </h1>
            <p className="mt-4 max-w-xl text-base text-foreground/80 sm:text-lg">
              Discover curated fashion, book trusted stylists, and enjoy a premium shopping experience built for Nepal.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/shop"
                className="inline-flex items-center justify-center rounded-full px-6 py-3 text-sm font-semibold text-foreground shadow-sm ring-1 ring-white/10 transition bg-gradient-to-r from-[color-mix(in_oklab,var(--kb-primary-brand)_75%,black)] to-[var(--kb-primary-brand)] hover:from-[var(--kb-primary-brand)] hover:to-[var(--kb-primary-brand)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--kb-accent-gold)]"
              >
                Shop Now
              </Link>
              <Link
                href="/account/bookings"
                className="inline-flex items-center justify-center rounded-full px-6 py-3 text-sm font-semibold text-foreground transition ring-1 ring-white/10 hover:bg-white/5"
              >
                Book a Stylist
              </Link>
            </div>
            <div className="mt-6 flex items-center gap-6 text-sm text-foreground/70">
              <div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-[var(--kb-accent-gold)]" /> Verified brands</div>
              <div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-[var(--kb-primary-brand)]" /> Secure payments</div>
            </div>
          </div>

          {/* Hero visual */}
          <div className="relative aspect-[4/3] w-full overflow-hidden rounded-3xl ring-1 ring-white/10">
            <img
              src="https://images.unsplash.com/photo-1520975916090-3105956dac38?q=80&w=1600&auto=format&fit=crop"
              alt="Editorial fashion portrait with elegant South Asian aesthetics"
              className="h-full w-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-tr from-black/30 via-transparent to-black/20" />
          </div>
        </div>
      </div>
    </section>
  );
}
