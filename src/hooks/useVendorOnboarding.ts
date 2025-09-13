import * as React from "react";
import type {
  VendorApplication,
  VendorBusinessInfo,
  VendorPayoutInfo,
  PayoutMethod,
  VendorBankPayout,
  VendorEsewaPayout,
  VendorKhaltiPayout,
} from "@/lib/types";

interface VendorOnboardingState {
  currentStep: number;
  business: VendorBusinessInfo;
  payout: VendorPayoutInfo;
  consent: boolean;
  errors: string[];
  submitted: boolean;
  submitting: boolean;
}

const INITIAL_BUSINESS: VendorBusinessInfo = {
  businessName: "",
  businessType: "Boutique",
  contactName: "",
  email: "",
  phone: "",
  website: "",
};

const INITIAL_BANK_PAYOUT: VendorPayoutInfo = {
  method: "bank",
  bankName: "",
  accountName: "",
  accountNumber: "",
  branch: "",
};

function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function validatePhone(phone: string): boolean {
  return /^9[678]\d{8}$/.test(phone.replace(/\s/g, ""));
}

export function useVendorOnboarding() {
  const [state, setState] = React.useState<VendorOnboardingState>({
    currentStep: 1,
    business: INITIAL_BUSINESS,
    payout: INITIAL_BANK_PAYOUT,
    consent: false,
    errors: [],
    submitted: false,
    submitting: false,
  });

  const updateBusiness = React.useCallback((updates: Partial<VendorBusinessInfo>) => {
    setState((prev) => ({
      ...prev,
      business: { ...prev.business, ...updates },
    }));
  }, []);

  const updatePayoutMethod = React.useCallback((method: PayoutMethod) => {
    setState((prev) => {
      let newPayout: VendorPayoutInfo;
      if (method === "bank") {
        newPayout = { 
          method: "bank", 
          bankName: "", 
          accountName: "", 
          accountNumber: "", 
          branch: "" 
        };
      } else if (method === "esewa") {
        newPayout = { 
          method: "esewa", 
          esewaId: "" 
        };
      } else {
        newPayout = { 
          method: "khalti", 
          khaltiId: "" 
        };
      }
      return {
        ...prev,
        payout: newPayout,
      };
    });
  }, []);

  const updatePayout = React.useCallback((updates: Partial<VendorPayoutInfo>) => {
    setState((prev) => ({
      ...prev,
      payout: { ...prev.payout, ...updates } as VendorPayoutInfo,
    }));
  }, []);

  const updateConsent = React.useCallback((consent: boolean) => {
    setState((prev) => ({
      ...prev,
      consent,
    }));
  }, []);

  const validateStep1 = React.useCallback((): string[] => {
    const errors: string[] = [];
    const { businessName, contactName, email, phone } = state.business;
    
    if (!businessName.trim()) errors.push("Business name is required.");
    if (!contactName.trim()) errors.push("Contact name is required.");
    if (!email.trim()) {
      errors.push("Email is required.");
    } else if (!validateEmail(email)) {
      errors.push("Please enter a valid email address.");
    }
    if (!phone.trim()) {
      errors.push("Phone number is required.");
    } else if (!validatePhone(phone)) {
      errors.push("Please enter a valid Nepali mobile number (98XXXXXXXX).");
    }
    
    return errors;
  }, [state.business]);

  const validateStep2 = React.useCallback((): string[] => {
    const errors: string[] = [];
    
    if (state.payout.method === "bank") {
      const p = state.payout as VendorBankPayout;
      if (!p.bankName?.trim()) errors.push("Bank name is required.");
      if (!p.accountName?.trim()) errors.push("Account name is required.");
      if (!p.accountNumber?.trim()) errors.push("Account number is required.");
    } else if (state.payout.method === "esewa") {
      const p = state.payout as VendorEsewaPayout;
      if (!p.esewaId?.trim()) errors.push("eSewa ID is required.");
    } else if (state.payout.method === "khalti") {
      const p = state.payout as VendorKhaltiPayout;
      if (!p.khaltiId?.trim()) errors.push("Khalti ID is required.");
    }
    
    return errors;
  }, [state.payout]);

  const validateStep3 = React.useCallback((): string[] => {
    const errors: string[] = [];
    if (!state.consent) errors.push("You must agree to the terms and conditions.");
    return errors;
  }, [state.consent]);

  const isStepValid = React.useCallback((step: number): boolean => {
    if (step === 1) return validateStep1().length === 0;
    if (step === 2) return validateStep2().length === 0;
    if (step === 3) return validateStep3().length === 0;
    return false;
  }, [validateStep1, validateStep2, validateStep3]);

  const goNext = React.useCallback(() => {
    const currentErrors = 
      state.currentStep === 1 ? validateStep1() :
      state.currentStep === 2 ? validateStep2() : [];
    
    if (currentErrors.length > 0) {
      setState((prev) => ({ ...prev, errors: currentErrors }));
      return;
    }
    
    setState((prev) => ({
      ...prev,
      currentStep: Math.min(3, prev.currentStep + 1),
      errors: [],
    }));
  }, [state.currentStep, validateStep1, validateStep2]);

  const goPrev = React.useCallback(() => {
    setState((prev) => ({
      ...prev,
      currentStep: Math.max(1, prev.currentStep - 1),
      errors: [],
    }));
  }, []);

  const submitApplication = React.useCallback(async (
    onSubmit?: (app: VendorApplication) => void | Promise<void>
  ) => {
    const finalErrors = validateStep3();
    if (finalErrors.length > 0) {
      setState((prev) => ({ ...prev, errors: finalErrors }));
      return;
    }

    setState((prev) => ({ ...prev, submitting: true, errors: [] }));

    try {
      const application: VendorApplication = {
        business: state.business,
        payout: state.payout,
        consent: state.consent,
      };

      // Log to console as requested
      console.log("Vendor Application Submitted:", application);

      await onSubmit?.(application);

      setState((prev) => ({ 
        ...prev, 
        submitted: true, 
        submitting: false 
      }));
    } catch (error) {
      console.error("Application submission failed:", error);
      setState((prev) => ({ 
        ...prev, 
        submitting: false,
        errors: ["Submission failed. Please try again."]
      }));
    }
  }, [state.business, state.payout, state.consent, validateStep3]);

  const resetForm = React.useCallback(() => {
    setState({
      currentStep: 1,
      business: INITIAL_BUSINESS,
      payout: INITIAL_BANK_PAYOUT,
      consent: false,
      errors: [],
      submitted: false,
      submitting: false,
    });
  }, []);

  return {
    // State
    currentStep: state.currentStep,
    business: state.business,
    payout: state.payout,
    consent: state.consent,
    errors: state.errors,
    submitted: state.submitted,
    submitting: state.submitting,
    
    // Computed
    isStepValid,
    canGoNext: isStepValid(state.currentStep),
    
    // Actions
    updateBusiness,
    updatePayoutMethod,
    updatePayout,
    updateConsent,
    goNext,
    goPrev,
    submitApplication,
    resetForm,
  };
}
