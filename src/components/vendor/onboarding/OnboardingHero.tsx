"use client";
import { ShieldCheck, Star } from "lucide-react";

export default function OnboardingHero({ onCtaClick }: { onCtaClick?: () => void }) {
  return (
    <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-[var(--kb-primary-brand)]/10 to-[var(--kb-accent-gold)]/10 p-8 ring-1 ring-white/10">
      <div className="mx-auto max-w-4xl text-center">
        <p className="inline-flex items-center gap-2 rounded-full bg-white/5 px-3 py-1 text-xs font-medium ring-1 ring-white/10">
          <Star className="h-3.5 w-3.5 text-[var(--kb-accent-gold)]" />
          Trusted by leading boutiques and salons
        </p>
        <h1 className="mt-4 text-3xl font-semibold sm:text-4xl">
          Partner with Nepal's Premier Style Platform
        </h1>
        <p className="mx-auto mt-3 max-w-2xl text-sm text-foreground/70">
          Join KB Stylish to reach high-intent customers, showcase your brand, and grow with seamless payouts and powerful tools.
        </p>
        <div className="mt-6">
          <a
            href="#apply"
            onClick={onCtaClick}
            className="inline-flex items-center justify-center rounded-xl bg-[var(--kb-primary-brand)] px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-[var(--kb-primary-brand)]/20 hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-[var(--kb-accent-gold)]/40"
          >
            Start Your Application
          </a>
        </div>
        <div className="mt-6 inline-flex items-center gap-2 text-xs text-foreground/70">
          <ShieldCheck className="h-4 w-4 text-[var(--kb-accent-gold)]" />
          Secure, fast onboarding • No platform fee to apply
        </div>
      </div>
    </section>
  );
}
