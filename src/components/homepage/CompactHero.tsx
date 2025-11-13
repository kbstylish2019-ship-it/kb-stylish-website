import Link from "next/link";

export default function CompactHero() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-[color-mix(in_oklab,var(--kb-primary-brand)_85%,black)] via-[var(--kb-primary-brand)] to-[color-mix(in_oklab,var(--kb-primary-brand)_75%,var(--kb-accent-gold))] border-b border-[var(--kb-accent-gold)]/20">
      {/* Background accents */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -right-32 -top-16 h-64 w-64 rounded-full bg-[var(--kb-accent-gold)]/15 blur-3xl" />
        <div className="absolute -left-32 -bottom-16 h-48 w-48 rounded-full bg-white/5 blur-2xl" />
      </div>

      <div className="mx-auto max-w-7xl px-4 py-12">
        <div className="text-center">
          <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white ring-1 ring-white/20">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--kb-accent-gold)]" />
            Nepal&apos;s premier style marketplace
          </span>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Discover Premium Fashion & Expert Stylists
          </h1>
          <p className="mt-2 max-w-2xl mx-auto text-base text-white/90">
            Curated products from trusted brands, professional styling services, all in one place.
          </p>
          <div className="mt-6 flex items-center justify-center gap-4 text-sm text-white/80">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-[var(--kb-accent-gold)]" /> 
              Verified brands
            </div>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-white" /> 
              Secure payments
            </div>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-[var(--kb-accent-red)]" /> 
              Premium quality
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
