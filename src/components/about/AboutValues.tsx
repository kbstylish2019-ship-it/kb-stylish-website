import { ShieldCheck, Sparkles, Handshake } from "lucide-react";

const values = [
  {
    icon: ShieldCheck,
    title: "Trust & Safety",
    desc: "Verified vendors, transparent policies, and secure payments for peace of mind.",
  },
  {
    icon: Sparkles,
    title: "Curated Quality",
    desc: "A boutique selection that balances global trends with Nepali craftsmanship.",
  },
  {
    icon: Handshake,
    title: "Creator-First",
    desc: "We help emerging brands and stylists grow with fair, transparent tools.",
  },
];

export default function AboutValues() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-16">
      <h2 className="text-2xl font-semibold tracking-tight">What We Stand For</h2>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {values.map(({ icon: Icon, title, desc }) => (
          <div key={title} className="rounded-2xl border border-white/10 bg-white/5 p-5 ring-1 ring-white/10">
            <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/5 ring-1 ring-white/10">
              <Icon className="h-5 w-5 text-[var(--kb-accent-gold)]" />
            </div>
            <h3 className="mt-3 text-base font-semibold">{title}</h3>
            <p className="mt-1 text-sm text-foreground/70">{desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
