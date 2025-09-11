"use client";
import OnboardingHero from "@/components/vendor/onboarding/OnboardingHero";
import ValueProps from "@/components/vendor/onboarding/ValueProps";
import HowItWorks from "@/components/vendor/onboarding/HowItWorks";
import ApplicationForm from "@/components/vendor/onboarding/ApplicationForm";

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
