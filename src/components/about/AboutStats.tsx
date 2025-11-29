import { Building2, Users, Home, Briefcase } from "lucide-react";

export default function AboutStats() {
  const objectives = [
    { 
      icon: Building2,
      label: "Target Outlets", 
      value: "30+",
      detail: "Across Nepal"
    },
    { 
      icon: Users,
      label: "Gents Salons", 
      value: "25",
      detail: "In Kathmandu Valley"
    },
    { 
      icon: Briefcase,
      label: "B2B Partners", 
      value: "400",
      detail: "Salon Supplies"
    },
    { 
      icon: Home,
      label: "Daily Home Services", 
      value: "20",
      detail: "At Your Doorstep"
    },
  ];

  return (
    <section className="mx-auto max-w-7xl px-4">
      <div className="text-center mb-8">
        <span className="inline-flex items-center gap-2 rounded-full bg-[var(--kb-accent-gold)]/10 px-3 py-1 text-xs font-medium text-[var(--kb-accent-gold)] ring-1 ring-[var(--kb-accent-gold)]/20">
          Our Objectives (2082-2084)
        </span>
        <h2 className="mt-3 text-xl font-semibold tracking-tight sm:text-2xl">
          Becoming Nepal&apos;s #1 Hair Salon Brand
        </h2>
        <p className="mt-2 text-sm text-foreground/60">
          With 30 outlets & e-commerce presence across the nation
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {objectives.map((s) => (
          <div 
            key={s.label} 
            className="group rounded-xl border border-white/10 bg-gradient-to-br from-white/[0.07] to-white/[0.02] p-4 text-center transition-all duration-300 hover:border-[var(--kb-accent-gold)]/30"
          >
            <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/5 ring-1 ring-white/10 mb-3 group-hover:bg-[var(--kb-accent-gold)]/10 transition-colors">
              <s.icon className="h-5 w-5 text-[var(--kb-accent-gold)]" />
            </div>
            <div className="text-2xl font-bold sm:text-3xl bg-gradient-to-r from-white to-white/80 bg-clip-text text-transparent">
              {s.value}
            </div>
            <div className="mt-1 text-sm font-medium text-foreground/80">{s.label}</div>
            <div className="text-xs text-foreground/50">{s.detail}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
