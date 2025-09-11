export default function AboutMission() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-16 sm:py-20">
      <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Our Mission</h2>
          <p className="mt-4 text-foreground/80">
            We are building Nepal's most trusted marketplace for style — where discerning
            shoppers discover premium products and connect with vetted stylists. We fuse
            world-class UX with a deep respect for local culture and craftsmanship.
          </p>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <p className="text-sm font-semibold">For Customers</p>
              <p className="mt-1 text-sm text-foreground/70">
                Curated products, honest pricing, and seamless bookings with top stylists.
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <p className="text-sm font-semibold">For Creators & Vendors</p>
              <p className="mt-1 text-sm text-foreground/70">
                A premium storefront, transparent payouts, and growth tools built-in.
              </p>
            </div>
          </div>
        </div>
        <div className="relative overflow-hidden rounded-3xl ring-1 ring-white/10">
          <img
            src="https://images.unsplash.com/photo-1519741497674-611481863552?q=80&w=1400&auto=format&fit=crop"
            alt="Artful fashion editorial scene with warm tones"
            className="h-full w-full object-cover"
          />
        </div>
      </div>
    </section>
  );
}
