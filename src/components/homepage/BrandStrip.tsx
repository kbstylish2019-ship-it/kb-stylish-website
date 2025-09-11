const brands = ["Kailash", "Everest Co.", "Sajilo", "Lalitpur Denim", "K-Beauty Lab"];

export default function BrandStrip() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-8">
      <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4">
        {brands.map((b) => (
          <span
            key={b}
            className="inline-flex items-center justify-center rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-foreground/80 ring-1 ring-white/10"
          >
            {b}
          </span>
        ))}
      </div>
    </section>
  );
}
