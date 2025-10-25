"use client";
import * as React from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { useVendorOnboarding } from "@/hooks/useVendorOnboarding";
import { createClient } from "@/lib/supabase/client";
import type {
  VendorApplication,
  VendorBusinessInfo,
  PayoutMethod,
} from "@/lib/types";

const BUSINESS_TYPES: VendorBusinessInfo["businessType"][] = [
  "Boutique",
  "Salon",
  "Designer",
  "Manufacturer",
  "Other",
];

function StepIndicator({ step }: { step: number }) {
  const labels = ["Business", "Payout", "Confirm"];
  return (
    <ol className="mb-4 grid grid-cols-3 gap-2 text-sm" aria-label="progress">
      {labels.map((label, i) => {
        const idx = i + 1;
        const active = step === idx;
        const complete = step > idx;
        return (
          <li key={label} className={`flex items-center gap-2 rounded-lg border px-3 py-2 ring-1 ${
            active
              ? "border-[var(--kb-primary-brand)]/50 bg-[var(--kb-primary-brand)]/10 ring-[var(--kb-primary-brand)]/50"
              : complete
              ? "border-[var(--kb-accent-gold)]/40 bg-[var(--kb-accent-gold)]/10 ring-[var(--kb-accent-gold)]/40"
              : "border-white/10 bg-white/5 ring-white/10"
          }`}>
            <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
              active ? "bg-[var(--kb-primary-brand)] text-white" : complete ? "bg-[var(--kb-accent-gold)] text-black" : "bg-white/10"
            }`}>{idx}</span>
            <span>{label}</span>
          </li>
        );
      })}
    </ol>
  );
}

export default function ApplicationForm({
  onSubmit,
}: {
  onSubmit?: (app: VendorApplication) => void;
}) {
  const {
    currentStep,
    business,
    payout,
    consent,
    errors,
    submitted,
    submitting,
    updateBusiness,
    updatePayoutMethod,
    updatePayout,
    updateConsent,
    goNext,
    goPrev,
    submitApplication,
  } = useVendorOnboarding();

  const handleSubmit = React.useCallback(async () => {
    // Call the actual submission function
    await submitApplication(async (application) => {
      try {
        // Get Supabase session for auth
        const supabase = createClient();
        
        // DEBUG: Check if user is authenticated
        console.log('[ApplicationForm] Checking authentication...');
        
        // CRITICAL FIX: Use getUser() which validates the JWT and refreshes if needed
        // getSession() only returns cached session without validation
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        
        console.log('[ApplicationForm] User:', user ? user.email : 'NULL', 'Error:', userError);
        
        if (userError || !user) {
          console.error('[ApplicationForm] User not authenticated:', userError);
          throw new Error('You must be logged in to submit an application. Please refresh the page and try again.');
        }
        
        // Now get the session (which should be available after getUser())
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        
        console.log('[ApplicationForm] Session after getUser():', session ? 'Found' : 'NULL');
        
        if (!session || !session.access_token) {
          console.error('[ApplicationForm] No session after getUser()');
          throw new Error('Session expired. Please refresh the page and try again.');
        }
        
        // Submit with retry logic using the validated session
        const result = await submitWithRetry(application, session.access_token);
        
        if (!result.success) {
          throw new Error(result.error || 'Submission failed');
        }
        
        // Clear draft from localStorage on success
        localStorage.removeItem('vendor_application_draft');
        
        // Call optional callback
        await onSubmit?.(application);
      } catch (error) {
        console.error('Application submission error:', error);
        throw error;  // Re-throw to be caught by useVendorOnboarding
      }
    });
  }, [submitApplication, onSubmit]);
  
  // Submit with retry logic (3 attempts with exponential backoff)
  const submitWithRetry = async (
    application: VendorApplication,
    accessToken: string,
    attempt = 1
  ): Promise<{ success: boolean; error?: string; error_code?: string; current_state?: string }> => {
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/submit-vendor-application`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            business_name: application.business.businessName,
            business_type: application.business.businessType,
            contact_name: application.business.contactName,
            email: application.business.email,
            phone: application.business.phone,
            website: application.business.website || null,
            payout_method: application.payout.method,
            bank_name: application.payout.method === 'bank' ? (application.payout as any).bankName : null,
            bank_account_name: application.payout.method === 'bank' ? (application.payout as any).accountName : null,
            bank_account_number: application.payout.method === 'bank' ? (application.payout as any).accountNumber : null,
            bank_branch: application.payout.method === 'bank' ? (application.payout as any).branch : null,
            esewa_number: application.payout.method === 'esewa' ? (application.payout as any).esewaId : null,
            khalti_number: application.payout.method === 'khalti' ? (application.payout as any).khaltiId : null,
          }),
        }
      );
      
      if (!response.ok) {
        const errorData = await response.json();
        console.error('[ApplicationForm] Edge Function Error Response:', errorData);
        console.error('[ApplicationForm] Status:', response.status);
        console.error('[ApplicationForm] Headers:', Object.fromEntries(response.headers.entries()));
        
        // Return the actual error message from backend (it's user-friendly)
        // Backend errors include helpful context like "You already have a pending application"
        return { 
          success: false, 
          error: errorData.error || 'Submission failed',
          error_code: errorData.error_code,
          current_state: errorData.current_state
        };
      }
      
      const data = await response.json();
      return data;
    } catch (error) {
      // Retry on network errors
      if (attempt < 3) {
        console.log(`Retrying submission (attempt ${attempt + 1}/3)...`);
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));  // Exponential backoff
        return submitWithRetry(application, accessToken, attempt + 1);
      }
      return { success: false, error: 'Network error. Please check your connection and try again.' };
    }
  };

  return (
    <section id="apply" className="rounded-2xl border border-white/10 bg-white/5 p-6 ring-1 ring-white/10">
      <h2 className="text-xl font-semibold">Start Your Application</h2>
      <p className="mt-1 text-sm text-foreground/70">Tell us about your business. It takes about 2 minutes.</p>

      <div className="mt-4">
        {submitted && (
          <div
            className="rounded-xl border border-white/10 bg-white/5 p-6 text-center ring-1 ring-white/10"
            data-testid="application-success"
          >
            <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full bg-[var(--kb-accent-gold)]/20 ring-1 ring-[var(--kb-accent-gold)]/40">
              <CheckCircle2 className="h-6 w-6 text-[var(--kb-accent-gold)]" />
            </div>
            <h3 className="mt-3 text-lg font-semibold">Application submitted</h3>
            <p className="mt-1 text-sm text-foreground/70">
              Thank you for partnering with KB Stylish. Our team will review and contact you within 1–2 business days.
            </p>
          </div>
        )}

        {!submitted && (
          <>
            <StepIndicator step={currentStep} />

            {errors.length > 0 && (
              <div className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
                <ul className="list-disc space-y-1 pl-5">
                  {errors.map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              </div>
            )}

        {currentStep === 1 && (
          <div className="grid gap-3 sm:grid-cols-2" data-testid="step-1">
            <div className="sm:col-span-2">
              <label className="text-sm" htmlFor="businessName">Business Name</label>
              <input
                id="businessName"
                value={business.businessName}
                onChange={(e) => updateBusiness({ businessName: e.target.value })}
                className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm ring-1 ring-white/10 focus:outline-none focus:ring-2 focus:ring-[var(--kb-primary-brand)]/50"
                placeholder="e.g., KB Signature Studio"
              />
            </div>
            <div>
              <label className="text-sm" htmlFor="businessType">Business Type</label>
              <select
                id="businessType"
                value={business.businessType}
                onChange={(e) => updateBusiness({ businessType: e.target.value as VendorBusinessInfo["businessType"] })}
                className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm ring-1 ring-white/10 focus:outline-none focus:ring-2 focus:ring-[var(--kb-primary-brand)]/50 [&>option]:bg-[var(--kb-surface-dark)] [&>option]:text-foreground"
              >
                {BUSINESS_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm" htmlFor="contactName">Contact Name</label>
              <input
                id="contactName"
                value={business.contactName}
                onChange={(e) => updateBusiness({ contactName: e.target.value })}
                className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm ring-1 ring-white/10 focus:outline-none focus:ring-2 focus:ring-[var(--kb-primary-brand)]/50"
              />
            </div>
            <div>
              <label className="text-sm" htmlFor="email">Email</label>
              <input
                type="email"
                id="email"
                value={business.email}
                onChange={(e) => updateBusiness({ email: e.target.value })}
                className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm ring-1 ring-white/10 focus:outline-none focus:ring-2 focus:ring-[var(--kb-primary-brand)]/50"
                placeholder="you@brand.com"
              />
            </div>
            <div>
              <label className="text-sm" htmlFor="phone">Phone</label>
              <input
                id="phone"
                value={business.phone}
                onChange={(e) => updateBusiness({ phone: e.target.value })}
                className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm ring-1 ring-white/10 focus:outline-none focus:ring-2 focus:ring-[var(--kb-primary-brand)]/50"
                placeholder="98XXXXXXXX"
              />
            </div>
            <div>
              <label className="text-sm" htmlFor="website">Website (optional)</label>
              <input
                id="website"
                value={business.website ?? ""}
                onChange={(e) => updateBusiness({ website: e.target.value })}
                className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm ring-1 ring-white/10 focus:outline-none focus:ring-2 focus:ring-[var(--kb-primary-brand)]/50"
                placeholder="https://"
              />
            </div>
          </div>
        )}

        {currentStep === 2 && (
          <div className="space-y-4" data-testid="step-2">
            <div>
              <label className="text-sm">Payout Method</label>
              <div className="mt-2 inline-flex gap-2">
                {(["bank", "esewa", "khalti"] as PayoutMethod[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => updatePayoutMethod(m)}
                    className={`rounded-lg px-3 py-2 text-sm ring-1 ${
                      payout.method === m
                        ? "bg-[var(--kb-primary-brand)]/20 ring-[var(--kb-primary-brand)]/50"
                        : "bg-white/5 ring-white/10 hover:bg-white/10"
                    }`}
                  >
                    {m.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            {payout.method === "bank" && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="text-sm" htmlFor="bankName">Bank Name</label>
                  <input
                    id="bankName"
                    value={("bankName" in payout ? payout.bankName : "") ?? ""}
                    onChange={(e) => updatePayout({ bankName: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm ring-1 ring-white/10 focus:outline-none focus:ring-2 focus:ring-[var(--kb-primary-brand)]/50"
                  />
                </div>
                <div>
                  <label className="text-sm" htmlFor="accountName">Account Name</label>
                  <input
                    id="accountName"
                    value={("accountName" in payout ? payout.accountName : "") ?? ""}
                    onChange={(e) => updatePayout({ accountName: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm ring-1 ring-white/10 focus:outline-none focus:ring-2 focus:ring-[var(--kb-primary-brand)]/50"
                  />
                </div>
                <div>
                  <label className="text-sm" htmlFor="accountNumber">Account Number</label>
                  <input
                    id="accountNumber"
                    value={("accountNumber" in payout ? payout.accountNumber : "") ?? ""}
                    onChange={(e) => updatePayout({ accountNumber: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm ring-1 ring-white/10 focus:outline-none focus:ring-2 focus:ring-[var(--kb-primary-brand)]/50"
                  />
                </div>
                <div>
                  <label className="text-sm" htmlFor="branch">Branch (optional)</label>
                  <input
                    id="branch"
                    value={("branch" in payout ? payout.branch : "") ?? ""}
                    onChange={(e) => updatePayout({ branch: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm ring-1 ring-white/10 focus:outline-none focus:ring-2 focus:ring-[var(--kb-primary-brand)]/50"
                  />
                </div>
              </div>
            )}

            {payout.method === "esewa" && (
              <div>
                <label className="text-sm" htmlFor="esewaId">eSewa ID</label>
                <input
                  id="esewaId"
                  value={("esewaId" in payout ? payout.esewaId : "") ?? ""}
                  onChange={(e) => updatePayout({ esewaId: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm ring-1 ring-white/10 focus:outline-none focus:ring-2 focus:ring-[var(--kb-primary-brand)]/50"
                />
              </div>
            )}

            {payout.method === "khalti" && (
              <div>
                <label className="text-sm" htmlFor="khaltiId">Khalti ID</label>
                <input
                  id="khaltiId"
                  value={("khaltiId" in payout ? payout.khaltiId : "") ?? ""}
                  onChange={(e) => updatePayout({ khaltiId: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm ring-1 ring-white/10 focus:outline-none focus:ring-2 focus:ring-[var(--kb-primary-brand)]/50"
                />
              </div>
            )}
          </div>
        )}

        {currentStep === 3 && (
          <div className="space-y-4" data-testid="step-3">
            <div className="rounded-xl border border-white/10 bg-white/5 p-4 ring-1 ring-white/10">
              <div className="text-sm font-medium">Review</div>
              <div className="mt-2 grid gap-2 text-sm text-foreground/80 sm:grid-cols-2">
                <div>
                  <div className="text-foreground/60">Business</div>
                  <div>{business.businessName}</div>
                  <div>{business.businessType}</div>
                  <div>{business.contactName}</div>
                  <div>{business.email}</div>
                  <div>{business.phone}</div>
                </div>
                <div>
                  <div className="text-foreground/60">Payout</div>
                  <div>Method: {payout.method.toUpperCase()}</div>
                </div>
              </div>
            </div>
            <div className="inline-flex items-center gap-2 text-sm">
              <input
                id="consent"
                type="checkbox"
                checked={consent}
                onChange={(e) => updateConsent(e.target.checked)}
              />
              <label htmlFor="consent">I agree to the platform terms and privacy policy.</label>
            </div>
          </div>
        )}

            <div className="mt-4 flex items-center justify-between">
              <button
                type="button"
                onClick={goPrev}
                disabled={currentStep === 1}
                className="rounded-lg px-4 py-2 text-sm ring-1 ring-white/10 disabled:opacity-50"
              >
                Back
              </button>
              {currentStep < 3 ? (
                <button
                  type="button"
                  onClick={goNext}
                  className="rounded-lg bg-[var(--kb-primary-brand)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  Next
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="rounded-lg bg-[var(--kb-primary-brand)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50 flex items-center gap-2"
                  data-testid="submit-application"
                >
                  {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  {submitting ? "Submitting..." : "Submit Application"}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
