import { MapPin, Leaf, Clock, Award, Shield } from "lucide-react";

const keysToSuccess = [
  {
    icon: MapPin,
    title: "Prime Location",
    desc: "Providing an easily accessible location for clients across Kathmandu Valley.",
  },
  {
    icon: Leaf,
    title: "Relaxing Environment",
    desc: "An environment conducive to giving relaxing and professional service.",
  },
  {
    icon: Clock,
    title: "Convenience",
    desc: "Offering clients a wide range of services in one setting with extended business hours.",
  },
  {
    icon: Award,
    title: "Reputation",
    desc: "Reputation of our beauticians as providing superior personal service.",
  },
  {
    icon: Shield,
    title: "Professional Standards",
    desc: "Sterilized professional equipment used for all services ensuring hygiene and safety.",
  },
];

export default function AboutValues() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-16">
      <div className="text-center mb-10">
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Keys to Our Success</h2>
        <p className="mt-2 text-foreground/60 max-w-2xl mx-auto">
          What makes KB Stylish the trusted choice for beauty and salon services in Nepal
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {keysToSuccess.map(({ icon: Icon, title, desc }) => (
          <div 
            key={title} 
            className="group rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.07] to-white/[0.02] p-5 ring-1 ring-white/10 transition-all duration-300 hover:border-[var(--kb-accent-gold)]/30 hover:ring-[var(--kb-accent-gold)]/20"
          >
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-white/5 ring-1 ring-white/10 group-hover:bg-[var(--kb-accent-gold)]/10 group-hover:ring-[var(--kb-accent-gold)]/20 transition-all duration-300">
              <Icon className="h-6 w-6 text-[var(--kb-accent-gold)]" />
            </div>
            <h3 className="mt-4 text-base font-semibold">{title}</h3>
            <p className="mt-2 text-sm text-foreground/70 leading-relaxed">{desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
