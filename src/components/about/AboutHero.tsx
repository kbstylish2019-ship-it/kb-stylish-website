import Image from "next/image";

export default function AboutHero() {
  return (
    <section className="relative overflow-hidden">
      {/* Background image */}
      <div className="absolute inset-0 -z-10">
        <div className="relative h-full w-full">
          <Image
            src="https://images.unsplash.com/photo-1560066984-138dadb4c035"
            alt="Professional beauty salon interior with elegant styling stations"
            fill
            priority
            className="object-cover opacity-60"
            sizes="100vw"
          />
        </div>
        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/50 to-background" />
      </div>

      <div className="mx-auto max-w-7xl px-4 py-24 sm:py-28 lg:py-32">
        <div className="max-w-3xl">
          <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium ring-1 ring-white/15 backdrop-blur-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--kb-accent-gold)]" />
            Our Story
          </span>
          <h1 className="mt-4 text-4xl font-extrabold tracking-tight sm:text-5xl lg:text-6xl">
            <span className="bg-gradient-to-b from-white to-white/80 bg-clip-text text-transparent">
              Nepal&apos;s Premier Beauty & Salon Destination
            </span>
          </h1>
          <p className="mt-4 text-base text-white/90 sm:text-lg leading-relaxed">
            KB Stylish is a full-service beauty salon dedicated to consistently providing high client satisfaction 
            by rendering excellent service, quality products, and furnishing an enjoyable atmosphere at an 
            acceptable price/value relationship.
          </p>
          <p className="mt-3 text-sm text-white/70">
            A friendly, fair, and creative work environment that respects diversity, ideas, and hard work.
          </p>
        </div>
      </div>
    </section>
  );
}
