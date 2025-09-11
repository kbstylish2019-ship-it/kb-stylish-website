import { BadgeCheck, Headphones, Lock, Truck } from "lucide-react";

const items = [
  { id: "authentic", title: "Authentic Brands", desc: "Official partners & verified sellers.", Icon: BadgeCheck },
  { id: "returns", title: "Easy Returns", desc: "7-day hassle-free returns.", Icon: Truck },
  { id: "secure", title: "Secure Payments", desc: "PCI-compliant & encrypted.", Icon: Lock },
  { id: "support", title: "Premium Support", desc: "Human help when you need it.", Icon: Headphones },
];

export default function ValueProps() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-10">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {items.map(({ id, title, desc, Icon }) => (
          <div key={id} className="rounded-2xl border border-white/10 bg-white/5 p-4 ring-1 ring-white/10">
            <div className="inline-flex rounded-xl bg-white/5 p-3 ring-1 ring-white/10">
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
