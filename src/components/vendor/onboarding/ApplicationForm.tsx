"use client";
import * as React from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { useVendorOnboarding } from "@/hooks/useVendorOnboarding";
import { createClient } from "@/lib/supabase/client";
import DocumentUploader from "./DocumentUploader";
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
  const labels = ["Business", "Payout", "Documents", "Confirm"];
  return (
    <ol className="mb-4 grid grid-cols-4 gap-2 text-sm" aria-label="progress">
      {labels.map((label, i) => {
        const idx = i + 1;
        const active = step === idx;
        const complete = step > idx;
        return (
          <li key={label} className={`flex items-center gap-2 rounded-lg border px-2 py-2 ring-1 ${
            active
              ? "border-[var(--kb-primary-brand)]/50 bg-[var(--kb-primary-brand)]/10 ring-[var(--kb-primary-brand)]/50"
              : complete
              ? "border-[var(--kb-accent-gold)]/40 bg-[var(--kb-accent-gold)]/10 ring-[var(--kb-accent-gold)]/40"
              : "border-white/10 bg-white/5 ring-white/10"
          }`}>
            <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold flex-shrink-0 ${
              active ? "bg-[var(--kb-primary-brand)] text-white" : complete ? "bg-[var(--kb-accent-gold)] text-black" : "bg-white/10"
            }`}>{idx}</span>
            <span className="text-xs sm:text-sm truncate">{label}</span>
          </li>
        );
      })}
    </ol>
  );
}

// Document type for uploaded files
interface UploadedDoc {
  id: string;
  document_type: string;
  file_name: string;
  storage_path: string;
  status: string;
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
  
  // Documents state (new step)
  const [uploadedDocuments, setUploadedDocuments] = React.useState<UploadedDoc[]>([]);
  const [documentError, setDocumentError] = React.useState<string | null>(null);
  
  // Track actual step (1-4 now instead of 1-3)
  const totalSteps = 4;
  
  // Custom navigation to handle 4 steps
  const handleNext = React.useCallback(() => {
    // Validate documents on step 3
    if (currentStep === 3) {
      const hasPan = uploadedDocuments.some(d => d.document_type === 'pan_certificate');
      if (!hasPan) {
        setDocumentError('PAN Certificate is required');
        return;
      }
      setDocumentError(null);
    }
    goNext();
  }, [currentStep, uploadedDocuments, goNext]);
  
  const handlePrev = React.useCallback(() => {
    setDocumentError(null);
    goPrev();
  }, [goPrev]);

  const handleSubmit = React.useCallback(async () => {
    // Validate documents before submission
    const hasPan = uploadedDocuments.some(d => d.document_type === 'pan_certificate');
    if (!hasPan) {
      setDocumentError('PAN Certificate is required before submitting');
      return;
    }
    
    // Call the actual submission function
    await submitApplication(async (application) => {
      try {
        // Get Supabase session for auth
        const supabase = createClient();
        
        // DEBUG: Check if user is authenticated
        console.log('[ApplicationForm] Checking authentication...');
        
        // CRITICAL FIX: Use getUser() which validates the JWT and refreshes if needed
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
        
        // Mark documents as submitted in vendor_profiles
        await supabase
          .from('vendor_profiles')
          .update({ documents_submitted: true })
          .eq('user_id', user.id);
        
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
  }, [submitApplication, onSubmit, uploadedDocuments]);
  
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
              <h3 className="text-sm font-medium mb-2">Upload Business Documents</h3>
              <p className="text-xs text-foreground/60 mb-4">
                Please upload your business verification documents. PAN Certificate is required.
                VAT Certificate is optional but recommended for VAT-registered businesses.
              </p>
              <DocumentUploader 
                onChange={setUploadedDocuments}
                required={['pan_certificate']}
              />
            </div>
            {documentError && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
                {documentError}
              </div>
            )}
          </div>
        )}

        {currentStep === 4 && (
          <div className="space-y-4" data-testid="step-4">
            <div className="rounded-xl border border-white/10 bg-white/5 p-4 ring-1 ring-white/10">
              <div className="text-sm font-medium">Review Your Application</div>
              <div className="mt-3 grid gap-4 text-sm text-foreground/80 sm:grid-cols-2">
                <div>
                  <div className="text-foreground/60 font-medium mb-1">Business Details</div>
                  <div>{business.businessName}</div>
                  <div className="text-xs text-foreground/50">{business.businessType}</div>
                  <div className="mt-2">{business.contactName}</div>
                  <div className="text-xs text-foreground/50">{business.email}</div>
                  <div className="text-xs text-foreground/50">{business.phone}</div>
                </div>
                <div>
                  <div className="text-foreground/60 font-medium mb-1">Payout Method</div>
                  <div>{payout.method.toUpperCase()}</div>
                  
                  <div className="text-foreground/60 font-medium mb-1 mt-3">Documents</div>
                  <div className="text-xs">
                    {uploadedDocuments.length > 0 ? (
                      <ul className="space-y-1">
                        {uploadedDocuments.map(doc => (
                          <li key={doc.id} className="flex items-center gap-1">
                            <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                            <span>{doc.file_name}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <span className="text-amber-400">No documents uploaded</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
            <div className="flex items-start gap-2 text-sm">
              <input
                id="consent"
                type="checkbox"
                checked={consent}
                onChange={(e) => updateConsent(e.target.checked)}
                className="mt-1"
              />
              <label htmlFor="consent">
                I agree to the{" "}
                <a 
                  href="/legal/vendor-terms" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-[var(--kb-primary-brand)] hover:underline"
                >
                  Vendor Terms & Conditions
                </a>
                ,{" "}
                <a 
                  href="/legal/terms" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-[var(--kb-primary-brand)] hover:underline"
                >
                  Terms of Service
                </a>
                , and{" "}
                <a 
                  href="/legal/privacy" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-[var(--kb-primary-brand)] hover:underline"
                >
                  Privacy Policy
                </a>
                .
              </label>
            </div>
          </div>
        )}

            <div className="mt-4 flex items-center justify-between">
              <button
                type="button"
                onClick={handlePrev}
                disabled={currentStep === 1}
                className="rounded-lg px-4 py-2 text-sm ring-1 ring-white/10 disabled:opacity-50"
              >
                Back
              </button>
              {currentStep < totalSteps ? (
                <button
                  type="button"
                  onClick={handleNext}
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
