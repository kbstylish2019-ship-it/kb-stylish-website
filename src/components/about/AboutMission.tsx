import Image from "next/image";
import { Target, Eye, Sparkles } from "lucide-react";

export default function AboutMission() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-16 sm:py-20">
      <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
        <div className="space-y-8">
          {/* Vision */}
          <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.07] to-white/[0.02] p-6 backdrop-blur-sm">
            <div className="flex items-center gap-3 mb-3">
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[var(--kb-accent-gold)]/10 ring-1 ring-[var(--kb-accent-gold)]/20">
                <Eye className="h-5 w-5 text-[var(--kb-accent-gold)]" />
              </div>
              <h3 className="text-lg font-semibold">Our Vision</h3>
            </div>
            <p className="text-foreground/80 leading-relaxed">
              To serve beauty & salon services that enhances our clients&apos; physical appearance and mental relaxation.
            </p>
          </div>

          {/* Mission */}
          <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.07] to-white/[0.02] p-6 backdrop-blur-sm">
            <div className="flex items-center gap-3 mb-3">
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[var(--kb-primary-brand)]/10 ring-1 ring-[var(--kb-primary-brand)]/20">
                <Target className="h-5 w-5 text-[var(--kb-primary-brand)]" />
              </div>
              <h3 className="text-lg font-semibold">Our Mission</h3>
            </div>
            <p className="text-foreground/80 leading-relaxed italic">
              &ldquo;KB Stylish is dedicated to helping every client look and feel their best. Our mission is to provide 
              high-quality, individualized hair and beauty services in a friendly, hygienic, affordable space where 
              beauty, comfort, price and connection matter.&rdquo;
            </p>
          </div>

          {/* Company Summary */}
          <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.07] to-white/[0.02] p-6 backdrop-blur-sm">
            <div className="flex items-center gap-3 mb-3">
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/5 ring-1 ring-white/10">
                <Sparkles className="h-5 w-5 text-[var(--kb-accent-gold)]" />
              </div>
              <h3 className="text-lg font-semibold">What Sets Us Apart</h3>
            </div>
            <p className="text-foreground/80 leading-relaxed">
              KB Stylish provides quality hair services along with top lines of beauty products. What sets us apart 
              from the competition is our commitment to providing all of these services in one convenient location.
            </p>
          </div>
        </div>

        <div className="relative aspect-[4/3] overflow-hidden rounded-3xl ring-1 ring-white/10">
          <Image
            src="https://images.unsplash.com/photo-1522337360788-8b13dee7a37e"
            alt="Professional stylist providing personalized beauty service"
            fill
            className="object-cover"
            sizes="(max-width: 1024px) 100vw, 50vw"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent" />
        </div>
      </div>
    </section>
  );
}
