export default function AboutHero() {
  return (
    <section className="relative overflow-hidden">
      {/* Background image */}
      <div className="absolute inset-0 -z-10">
        <img
          src="https://images.unsplash.com/photo-1520975916090-3105956dac38?q=80&w=1600&auto=format&fit=crop"
          alt="Elegant South Asian fashion editorial with premium textures"
          className="h-full w-full object-cover opacity-70"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/40 to-background" />
      </div>

      <div className="mx-auto max-w-7xl px-4 py-24 sm:py-28 lg:py-32">
        <div className="max-w-2xl">
          <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium ring-1 ring-white/15">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--kb-accent-gold)]" />
            Our Story
          </span>
          <h1 className="mt-4 text-4xl font-extrabold tracking-tight sm:text-5xl lg:text-6xl">
            <span className="bg-gradient-to-b from-white to-white/80 bg-clip-text text-transparent">
              Crafting Nepal's premier destination for style
            </span>
          </h1>
          <p className="mt-4 text-base text-white/85 sm:text-lg">
            KB Stylish blends curated commerce with trusted services—bringing premium products, expert stylists, and a distinctly Nepali point of view together in one elegant experience.
          </p>
        </div>
      </div>
    </section>
  );
}
