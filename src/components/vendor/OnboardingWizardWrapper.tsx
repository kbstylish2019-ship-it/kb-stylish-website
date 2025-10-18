"use client";

import dynamic from "next/dynamic";

// Dynamic import with ssr: false for the onboarding wizard
// This is a client component wrapper to allow ssr: false in a server component page
const OnboardingWizard = dynamic(() => import("@/components/vendor/OnboardingWizard"), {
  ssr: false, // Client-side only (uses localStorage and Supabase client)
});

export default function OnboardingWizardWrapper() {
  return <OnboardingWizard />;
}
