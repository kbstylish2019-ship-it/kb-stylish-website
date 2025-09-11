export default function AboutStats() {
  const stats = [
    { label: "Curated Brands", value: "40+" },
    { label: "Verified Stylists", value: "25+" },
    { label: "Customer Rating", value: "4.8/5" },
    { label: "Cities Served", value: "7" },
  ];
  return (
    <section className="mx-auto max-w-7xl px-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl border border-white/10 bg-white/5 p-4 text-center">
            <div className="text-xl font-bold sm:text-2xl">{s.value}</div>
            <div className="mt-1 text-xs text-foreground/70">{s.label}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
