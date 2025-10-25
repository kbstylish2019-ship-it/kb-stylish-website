import { redirect } from "next/navigation";
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import dynamic from "next/dynamic";
import { AlertCircle, CheckCircle, Clock } from "lucide-react";
import Link from "next/link";

// Dynamic imports to reduce initial bundle size
const OnboardingHero = dynamic(() => import("@/components/vendor/onboarding/OnboardingHero"));
const ValueProps = dynamic(() => import("@/components/vendor/onboarding/ValueProps"));
const HowItWorks = dynamic(() => import("@/components/vendor/onboarding/HowItWorks"));
const ApplicationForm = dynamic(() => import("@/components/vendor/onboarding/ApplicationForm"), {
  loading: () => <div className="h-96 animate-pulse rounded-lg bg-white/5" />
});

async function createClient() {
  const cookieStore = await cookies();
  
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Ignore - Server Component limitation
          }
        },
      },
    }
  );
}

export default async function VendorApplyPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  // Check if user is authenticated and their vendor status
  let applicationState = null;
  if (user) {
    // Check if user has vendor role (they're already approved)
    const { data: { user: userWithMeta } } = await supabase.auth.getUser();
    const userRoles = userWithMeta?.user_metadata?.user_roles || [];
    const isVendor = userRoles.includes('vendor');
    
    // If they have vendor role, redirect to dashboard
    if (isVendor) {
      redirect('/vendor/dashboard');
    }
    
    // Otherwise check application state
    const { data: vendorProfile } = await supabase
      .from('vendor_profiles')
      .select('application_state, business_name')
      .eq('user_id', user.id)
      .single();
    
    if (vendorProfile) {
      applicationState = vendorProfile.application_state;
      
      // Also redirect if application_state is approved (backup check)
      if (applicationState === 'approved') {
        redirect('/vendor/dashboard');
      }
    }
  }
  
  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="space-y-8">
        <OnboardingHero />
        <ValueProps />
        <HowItWorks />
        
        {/* Show appropriate UI based on application state */}
        {applicationState === 'submitted' || applicationState === 'under_review' || applicationState === 'info_requested' ? (
          <section className="rounded-2xl border border-white/10 bg-white/5 p-6 ring-1 ring-white/10">
            <div className="text-center">
              {applicationState === 'submitted' || applicationState === 'under_review' ? (
                <>
                  <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full bg-blue-500/20 ring-1 ring-blue-500/40">
                    <Clock className="h-6 w-6 text-blue-400" />
                  </div>
                  <h3 className="mt-3 text-lg font-semibold">Application Under Review</h3>
                  <p className="mt-1 text-sm text-foreground/70">
                    Your vendor application is currently being reviewed by our team. 
                    We'll contact you within 1-2 business days with an update.
                  </p>
                  <p className="mt-4 text-xs text-foreground/60">
                    Status: <span className="capitalize font-medium text-blue-400">{applicationState.replace('_', ' ')}</span>
                  </p>
                </>
              ) : applicationState === 'info_requested' ? (
                <>
                  <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/20 ring-1 ring-amber-500/40">
                    <AlertCircle className="h-6 w-6 text-amber-400" />
                  </div>
                  <h3 className="mt-3 text-lg font-semibold">Additional Information Needed</h3>
                  <p className="mt-1 text-sm text-foreground/70">
                    Our team has requested additional information about your application. 
                    Please check your email for details.
                  </p>
                  <Link 
                    href="/profile"
                    className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[var(--kb-accent-gold)] px-4 py-2 text-sm font-medium text-black hover:bg-[var(--kb-accent-gold)]/90"
                  >
                    Check Your Profile
                  </Link>
                </>
              ) : (
                <></>
              )}
            </div>
          </section>
        ) : (
          <>
            {applicationState === 'rejected' && (
              <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
                <div className="flex gap-3">
                  <AlertCircle className="h-5 w-5 text-amber-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <h3 className="font-medium text-amber-300 mb-1">Previous Application Not Approved</h3>
                    <p className="text-sm text-amber-200/80">
                      Your previous vendor application was not approved. You may submit a new application with updated information below.
                    </p>
                  </div>
                </div>
              </div>
            )}
            {applicationState === 'draft' && (
              <div className="mb-4 rounded-xl border border-blue-500/30 bg-blue-500/10 p-4">
                <div className="flex gap-3">
                  <AlertCircle className="h-5 w-5 text-blue-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <h3 className="font-medium text-blue-300 mb-1">Continue Your Application</h3>
                    <p className="text-sm text-blue-200/80">
                      You have a draft application. Complete the form below to submit it for review.
                    </p>
                  </div>
                </div>
              </div>
            )}
            <ApplicationForm />
          </>
        )}
      </div>
    </div>
  );
}
