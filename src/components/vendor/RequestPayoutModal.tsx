"use client";

import React, { useState } from "react";
import { X, Wallet, AlertCircle, CheckCircle, Loader2 } from "lucide-react";
import { requestPayout } from "@/actions/vendor/payouts";

interface RequestPayoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  availableBalanceCents: number;
  vendorProfile: {
    bank_account_name: string | null;
    bank_account_number: string | null;
    bank_name: string | null;
    esewa_number: string | null;
    khalti_number: string | null;
  };
}

type PaymentMethod = 'bank_transfer' | 'esewa' | 'khalti';

export default function RequestPayoutModal({
  isOpen,
  onClose,
  availableBalanceCents,
  vendorProfile,
}: RequestPayoutModalProps) {
  const [step, setStep] = useState<'form' | 'confirm' | 'success' | 'error'>('form');
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const availableBalance = availableBalanceCents / 100;
  const minAmount = 1000; // NPR 1,000

  // Check if vendor has payment methods configured
  const hasPaymentMethods = 
    vendorProfile.bank_account_number ||
    vendorProfile.esewa_number ||
    vendorProfile.khalti_number;

  // Get available payment methods
  const availableMethods: PaymentMethod[] = [];
  if (vendorProfile.bank_account_number) availableMethods.push('bank_transfer');
  if (vendorProfile.esewa_number) availableMethods.push('esewa');
  if (vendorProfile.khalti_number) availableMethods.push('khalti');

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    // Allow only numbers and decimal point
    if (value === '' || /^\d*\.?\d{0,2}$/.test(value)) {
      setAmount(value);
    }
  };

  const requestAmount = parseFloat(amount) || 0;
  const isValidAmount = requestAmount >= minAmount && requestAmount <= availableBalance;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isValidAmount || !paymentMethod) {
      setErrorMessage('Please fill in all required fields');
      return;
    }

    setStep('confirm');
  };

  const handleConfirm = async () => {
    setIsSubmitting(true);
    setErrorMessage('');

    // Type guard - paymentMethod should not be null here
    if (!paymentMethod) {
      setErrorMessage('Please select a payment method');
      setStep('error');
      setIsSubmitting(false);
      return;
    }

    try {
      const amountCents = Math.round(requestAmount * 100);
      
      // Build payment details based on method
      const paymentDetails: Record<string, string> = {};
      
      if (paymentMethod === 'bank_transfer') {
        paymentDetails.accountName = vendorProfile.bank_account_name || '';
        paymentDetails.accountNumber = vendorProfile.bank_account_number || '';
        paymentDetails.bankName = vendorProfile.bank_name || '';
      } else if (paymentMethod === 'esewa') {
        paymentDetails.phoneNumber = vendorProfile.esewa_number || '';
      } else if (paymentMethod === 'khalti') {
        paymentDetails.phoneNumber = vendorProfile.khalti_number || '';
      }

      const result = await requestPayout({
        amountCents,
        paymentMethod,
        paymentDetails,
      });

      if (result.success) {
        setSuccessMessage(result.message);
        setStep('success');
        // Reset form after 3 seconds and close
        setTimeout(() => {
          handleClose();
        }, 3000);
      } else {
        setErrorMessage(result.message);
        setStep('error');
      }
    } catch (error) {
      setErrorMessage('An unexpected error occurred. Please try again.');
      setStep('error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setStep('form');
    setAmount('');
    setPaymentMethod(null);
    setErrorMessage('');
    setSuccessMessage('');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-lg rounded-2xl border border-white/10 bg-[var(--kb-surface-dark)] p-6 shadow-2xl ring-1 ring-white/10">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--kb-accent-gold)]/20 ring-1 ring-[var(--kb-accent-gold)]/30">
              <Wallet className="h-5 w-5 text-[var(--kb-accent-gold)]" />
            </div>
            <h2 className="text-xl font-semibold">Request Payout</h2>
          </div>
          <button
            onClick={handleClose}
            className="rounded-lg p-1 text-foreground/60 hover:bg-white/5 hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* No Payment Methods Warning */}
        {!hasPaymentMethods ? (
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-4">
            <div className="flex gap-3">
              <AlertCircle className="h-5 w-5 text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-medium text-amber-300 mb-1">Payment Method Required</h3>
                <p className="text-sm text-amber-200/80 mb-3">
                  Please add a payment method to your profile before requesting a payout.
                </p>
                <a
                  href="/vendor/settings"
                  className="inline-flex items-center gap-2 rounded-lg bg-amber-500/20 px-3 py-1.5 text-sm font-medium text-amber-300 hover:bg-amber-500/30 transition-colors"
                >
                  Go to Settings
                </a>
              </div>
            </div>
          </div>
        ) : step === 'form' ? (
          /* Step 1: Form */
          <form onSubmit={handleSubmit}>
            {/* Available Balance */}
            <div className="mb-6 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4">
              <div className="text-sm text-emerald-300/80 mb-1">Available Balance</div>
              <div className="text-2xl font-bold text-emerald-300">
                NPR {availableBalance.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>

            {/* Amount Input */}
            <div className="mb-4">
              <label className="block text-sm font-medium mb-2">
                Payout Amount <span className="text-red-400">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground/50">NPR</span>
                <input
                  type="text"
                  value={amount}
                  onChange={handleAmountChange}
                  placeholder="0.00"
                  className="w-full rounded-lg border border-white/10 bg-white/5 py-2 pl-14 pr-4 text-foreground placeholder:text-foreground/40 focus:border-[var(--kb-accent-gold)]/50 focus:outline-none focus:ring-2 focus:ring-[var(--kb-accent-gold)]/20"
                />
              </div>
              <div className="mt-2 flex items-center justify-between text-xs text-foreground/60">
                <span>Minimum: NPR {minAmount.toLocaleString('en-IN')}</span>
                <button
                  type="button"
                  onClick={() => setAmount(availableBalance.toFixed(2))}
                  className="text-[var(--kb-accent-gold)] hover:underline"
                >
                  Request Full Amount
                </button>
              </div>
              {amount && !isValidAmount && (
                <p className="mt-1 text-xs text-red-400">
                  {requestAmount < minAmount
                    ? `Amount must be at least NPR ${minAmount.toLocaleString('en-IN')}`
                    : 'Amount exceeds available balance'}
                </p>
              )}
            </div>

            {/* Payment Method */}
            <div className="mb-6">
              <label className="block text-sm font-medium mb-2">
                Payment Method <span className="text-red-400">*</span>
              </label>
              <div className="space-y-2">
                {availableMethods.map((method) => (
                  <label
                    key={method}
                    className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                      paymentMethod === method
                        ? 'border-[var(--kb-accent-gold)]/50 bg-[var(--kb-accent-gold)]/10 ring-2 ring-[var(--kb-accent-gold)]/20'
                        : 'border-white/10 bg-white/5 hover:bg-white/10'
                    }`}
                  >
                    <input
                      type="radio"
                      name="paymentMethod"
                      value={method}
                      checked={paymentMethod === method}
                      onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                      className="h-4 w-4 text-[var(--kb-accent-gold)]"
                    />
                    <div className="flex-1">
                      <div className="font-medium capitalize">
                        {method === 'bank_transfer' ? 'Bank Transfer' : method.charAt(0).toUpperCase() + method.slice(1)}
                      </div>
                      <div className="text-xs text-foreground/60">
                        {method === 'bank_transfer' && `${vendorProfile.bank_name} - ${vendorProfile.bank_account_number}`}
                        {method === 'esewa' && vendorProfile.esewa_number}
                        {method === 'khalti' && vendorProfile.khalti_number}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleClose}
                className="flex-1 rounded-lg border border-white/10 bg-white/5 px-4 py-2 font-medium hover:bg-white/10 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!isValidAmount || !paymentMethod}
                className="flex-1 rounded-lg bg-[var(--kb-accent-gold)] px-4 py-2 font-medium text-black hover:bg-[var(--kb-accent-gold)]/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Continue
              </button>
            </div>
          </form>
        ) : step === 'confirm' ? (
          /* Step 2: Confirmation */
          <div>
            <div className="mb-6 space-y-4">
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <div className="text-sm text-foreground/60 mb-1">Amount</div>
                <div className="text-2xl font-bold">NPR {requestAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <div className="text-sm text-foreground/60 mb-2">Payment Method</div>
                <div className="font-medium capitalize">
                  {paymentMethod === 'bank_transfer' ? 'Bank Transfer' : paymentMethod}
                </div>
                <div className="text-sm text-foreground/60 mt-1">
                  {paymentMethod === 'bank_transfer' && (
                    <>
                      {vendorProfile.bank_name}<br />
                      {vendorProfile.bank_account_name}<br />
                      {vendorProfile.bank_account_number}
                    </>
                  )}
                  {paymentMethod === 'esewa' && vendorProfile.esewa_number}
                  {paymentMethod === 'khalti' && vendorProfile.khalti_number}
                </div>
              </div>

              <div className="rounded-xl border border-blue-500/20 bg-blue-500/10 p-4">
                <div className="flex gap-3">
                  <AlertCircle className="h-5 w-5 text-blue-400 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-blue-200/80">
                    Your request will be reviewed by our admin team. Payouts are typically processed within 2-3 business days.
                  </div>
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setStep('form')}
                disabled={isSubmitting}
                className="flex-1 rounded-lg border border-white/10 bg-white/5 px-4 py-2 font-medium hover:bg-white/10 disabled:opacity-50 transition-colors"
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={isSubmitting}
                className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-[var(--kb-accent-gold)] px-4 py-2 font-medium text-black hover:bg-[var(--kb-accent-gold)]/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  'Confirm Request'
                )}
              </button>
            </div>
          </div>
        ) : step === 'success' ? (
          /* Step 3: Success */
          <div className="text-center py-8">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/20 ring-1 ring-emerald-500/30">
              <CheckCircle className="h-8 w-8 text-emerald-400" />
            </div>
            <h3 className="text-xl font-semibold mb-2">Request Submitted!</h3>
            <p className="text-foreground/70 mb-6">
              {successMessage}
            </p>
            <button
              onClick={handleClose}
              className="rounded-lg bg-[var(--kb-accent-gold)] px-6 py-2 font-medium text-black hover:bg-[var(--kb-accent-gold)]/90 transition-colors"
            >
              Close
            </button>
          </div>
        ) : (
          /* Step 4: Error */
          <div className="text-center py-8">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-500/20 ring-1 ring-red-500/30">
              <AlertCircle className="h-8 w-8 text-red-400" />
            </div>
            <h3 className="text-xl font-semibold mb-2">Request Failed</h3>
            <p className="text-foreground/70 mb-6">
              {errorMessage}
            </p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={handleClose}
                className="rounded-lg border border-white/10 bg-white/5 px-6 py-2 font-medium hover:bg-white/10 transition-colors"
              >
                Close
              </button>
              <button
                onClick={() => setStep('form')}
                className="rounded-lg bg-[var(--kb-accent-gold)] px-6 py-2 font-medium text-black hover:bg-[var(--kb-accent-gold)]/90 transition-colors"
              >
                Try Again
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
