"use client";
import { FileText, Settings, UploadCloud, CheckCircle2 } from "lucide-react";

export default function HowItWorks() {
  const steps = [
    {
      icon: UploadCloud,
      title: "Tell Us About Your Business",
      desc: "Share your brand and contact details so we can verify and tailor your setup.",
    },
    {
      icon: Settings,
      title: "Configure Payouts",
      desc: "Choose bank, eSewa, or Khalti for fast, reliable disbursements.",
    },
    {
      icon: FileText,
      title: "Confirm & Submit",
      desc: "Review your information and submit your application securely.",
    },
    {
      icon: CheckCircle2,
      title: "Go Live",
      desc: "Our team approves and guides you to your vendor dashboard.",
    },
  ];
  return (
    <section className="rounded-2xl border border-white/10 bg-white/5 p-6 ring-1 ring-white/10">
      <h2 className="text-xl font-semibold">How It Works</h2>
      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map(({ icon: Icon, title, desc }) => (
          <div key={title} className="rounded-xl border border-white/10 bg-white/5 p-4 ring-1 ring-white/10">
            <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[var(--kb-accent-gold)]/20 ring-1 ring-[var(--kb-accent-gold)]/30">
              <Icon className="h-5 w-5 text-[var(--kb-accent-gold)]" />
            </div>
            <div className="mt-3 text-base font-medium">{title}</div>
            <p className="mt-1 text-sm text-foreground/70">{desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
