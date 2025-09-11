import React from "react";
import { ShieldCheck, Truck, RotateCcw } from "lucide-react";

export default function PDPTrustBar() {
  const items = [
    {
      icon: <ShieldCheck className="h-4 w-4 text-[var(--kb-accent-gold)]" />,
      title: "Authentic Brands",
      desc: "Verified vendors only",
    },
    { icon: <Truck className="h-4 w-4 text-[var(--kb-accent-gold)]" />, title: "Fast Delivery", desc: "Nationwide" },
    { icon: <RotateCcw className="h-4 w-4 text-[var(--kb-accent-gold)]" />, title: "Easy Returns", desc: "7-day window" },
  ];
  return (
    <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
      {items.map((it) => (
        <div key={it.title} className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 p-3 text-sm">
          {it.icon}
          <div>
            <div className="font-medium">{it.title}</div>
            <div className="text-foreground/70">{it.desc}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
