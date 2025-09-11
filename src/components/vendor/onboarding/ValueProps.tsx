"use client";
import { Banknote, PackageOpen, UsersRound } from "lucide-react";

export default function ValueProps() {
  const items = [
    {
      icon: UsersRound,
      title: "Reach New Customers",
      desc: "Tap into a growing audience actively seeking premium fashion and grooming.",
    },
    {
      icon: Banknote,
      title: "Seamless Payouts",
      desc: "Reliable disbursements via bank, eSewa, or Khalti. Transparent and on time.",
    },
    {
      icon: PackageOpen,
      title: "Powerful Tools",
      desc: "Vendor dashboard for orders, catalog, and performance—designed for growth.",
    },
  ];
  return (
    <section className="rounded-2xl border border-white/10 bg-white/5 p-6 ring-1 ring-white/10">
      <h2 className="text-xl font-semibold">Why Partner with KB Stylish</h2>
      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map(({ icon: Icon, title, desc }) => (
          <div key={title} className="rounded-xl border border-white/10 bg-white/5 p-4 ring-1 ring-white/10">
            <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[var(--kb-primary-brand)]/15 ring-1 ring-[var(--kb-primary-brand)]/30">
              <Icon className="h-5 w-5 text-[var(--kb-primary-brand)]" />
            </div>
            <div className="mt-3 text-base font-medium">{title}</div>
            <p className="mt-1 text-sm text-foreground/70">{desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
