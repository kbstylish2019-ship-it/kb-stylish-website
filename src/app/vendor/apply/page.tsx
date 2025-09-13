"use client";
import dynamic from "next/dynamic";

// Dynamic imports to reduce initial bundle size
const OnboardingHero = dynamic(() => import("@/components/vendor/onboarding/OnboardingHero"));
const ValueProps = dynamic(() => import("@/components/vendor/onboarding/ValueProps"));
const HowItWorks = dynamic(() => import("@/components/vendor/onboarding/HowItWorks"));
const ApplicationForm = dynamic(() => import("@/components/vendor/onboarding/ApplicationForm"), {
  loading: () => <div className="h-96 animate-pulse rounded-lg bg-white/5" />
});

export default function VendorApplyPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="space-y-8">
        <OnboardingHero />
        <ValueProps />
        <HowItWorks />
        <ApplicationForm />
      </div>
    </div>
  );
}
