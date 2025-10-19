"use client";

import React, { useState } from "react";
import { Building2, Smartphone, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { createBrowserClient } from "@supabase/ssr";

interface VendorProfile {
  user_id: string;
  bank_account_name: string | null;
  bank_account_number: string | null;
  bank_name: string | null;
  bank_branch: string | null;
  esewa_number: string | null;
  khalti_number: string | null;
}

interface PaymentMethodsSettingsProps {
  vendorProfile: VendorProfile;
}

export default function PaymentMethodsSettings({ vendorProfile: initialProfile }: PaymentMethodsSettingsProps) {
  const [formData, setFormData] = useState({
    bank_account_name: '',
    bank_account_number: '',
    bank_name: '',
    bank_branch: '',
    esewa_number: '',
    khalti_number: '',
  });
  const [isLoading, setIsLoading] = useState(true);

  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Load decrypted payment methods on mount
  React.useEffect(() => {
    const loadPaymentMethods = async () => {
      try {
        const supabase = createBrowserClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        );

        const { data, error } = await supabase.rpc('get_vendor_payment_methods');

        if (error) {
          console.error('Error loading payment methods:', error);
        } else if (data?.success && data?.data) {
          setFormData({
            bank_account_name: data.data.bank_account_name || '',
            bank_account_number: data.data.bank_account_number || '',
            bank_name: data.data.bank_name || '',
            bank_branch: data.data.bank_branch || '',
            esewa_number: data.data.esewa_number || '',
            khalti_number: data.data.khalti_number || '',
          });
        }
      } catch (error) {
        console.error('Error loading payment methods:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadPaymentMethods();
  }, []);

  const handleChange = (field: keyof typeof formData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setMessage(null);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setMessage(null);

    try {
      const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );

      // Use secure RPC function that handles encryption
      const { data, error } = await supabase.rpc('update_vendor_payment_methods', {
        p_bank_account_name: formData.bank_account_name || null,
        p_bank_account_number: formData.bank_account_number || null,
        p_bank_name: formData.bank_name || null,
        p_bank_branch: formData.bank_branch || null,
        p_esewa_number: formData.esewa_number || null,
        p_khalti_number: formData.khalti_number || null,
      });

      if (error) {
        setMessage({ type: 'error', text: error.message });
      } else if (data?.success) {
        setMessage({ type: 'success', text: 'Payment methods updated successfully!' });
      } else {
        setMessage({ type: 'error', text: data?.error || 'Failed to update payment methods' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'An unexpected error occurred' });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/5 p-6 ring-1 ring-white/10">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-[var(--kb-accent-gold)]" />
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-6 ring-1 ring-white/10">
      <div className="mb-6">
        <h2 className="text-xl font-semibold mb-2">Payment Methods</h2>
        <p className="text-sm text-foreground/60">
          Add at least one payment method to receive payouts. You can configure multiple methods.
        </p>
      </div>

      {/* Status Message */}
      {message && (
        <div className={`mb-6 rounded-xl border p-4 ${
          message.type === 'success'
            ? 'border-emerald-500/20 bg-emerald-500/10'
            : 'border-red-500/20 bg-red-500/10'
        }`}>
          <div className="flex gap-3">
            {message.type === 'success' ? (
              <CheckCircle className="h-5 w-5 text-emerald-400 flex-shrink-0" />
            ) : (
              <AlertCircle className="h-5 w-5 text-red-400 flex-shrink-0" />
            )}
            <p className={`text-sm ${
              message.type === 'success' ? 'text-emerald-200' : 'text-red-200'
            }`}>
              {message.text}
            </p>
          </div>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-8">
        {/* Bank Transfer */}
        <div>
          <div className="flex items-center gap-3 mb-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-500/20 ring-1 ring-blue-500/30">
              <Building2 className="h-5 w-5 text-blue-400" />
            </div>
            <h3 className="text-lg font-semibold">Bank Transfer</h3>
          </div>

          <div className="space-y-4 pl-13">
            <div>
              <label className="block text-sm font-medium mb-2">Account Holder Name</label>
              <input
                type="text"
                value={formData.bank_account_name}
                onChange={(e) => handleChange('bank_account_name', e.target.value)}
                placeholder="e.g., Shishir Bhusal"
                className="w-full rounded-lg border border-white/10 bg-white/5 py-2 px-4 text-foreground placeholder:text-foreground/40 focus:border-[var(--kb-accent-gold)]/50 focus:outline-none focus:ring-2 focus:ring-[var(--kb-accent-gold)]/20"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Account Number</label>
              <input
                type="text"
                value={formData.bank_account_number}
                onChange={(e) => handleChange('bank_account_number', e.target.value)}
                placeholder="e.g., 0123456789"
                className="w-full rounded-lg border border-white/10 bg-white/5 py-2 px-4 text-foreground placeholder:text-foreground/40 focus:border-[var(--kb-accent-gold)]/50 focus:outline-none focus:ring-2 focus:ring-[var(--kb-accent-gold)]/20"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium mb-2">Bank Name</label>
                <input
                  type="text"
                  value={formData.bank_name}
                  onChange={(e) => handleChange('bank_name', e.target.value)}
                  placeholder="e.g., Nabil Bank"
                  className="w-full rounded-lg border border-white/10 bg-white/5 py-2 px-4 text-foreground placeholder:text-foreground/40 focus:border-[var(--kb-accent-gold)]/50 focus:outline-none focus:ring-2 focus:ring-[var(--kb-accent-gold)]/20"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Branch (Optional)</label>
                <input
                  type="text"
                  value={formData.bank_branch}
                  onChange={(e) => handleChange('bank_branch', e.target.value)}
                  placeholder="e.g., Kathmandu"
                  className="w-full rounded-lg border border-white/10 bg-white/5 py-2 px-4 text-foreground placeholder:text-foreground/40 focus:border-[var(--kb-accent-gold)]/50 focus:outline-none focus:ring-2 focus:ring-[var(--kb-accent-gold)]/20"
                />
              </div>
            </div>
          </div>
        </div>

        {/* eSewa */}
        <div>
          <div className="flex items-center gap-3 mb-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-500/20 ring-1 ring-green-500/30">
              <Smartphone className="h-5 w-5 text-green-400" />
            </div>
            <h3 className="text-lg font-semibold">eSewa</h3>
          </div>

          <div className="pl-13">
            <label className="block text-sm font-medium mb-2">eSewa Number</label>
            <input
              type="text"
              value={formData.esewa_number}
              onChange={(e) => handleChange('esewa_number', e.target.value)}
              placeholder="e.g., 9876543210"
              className="w-full rounded-lg border border-white/10 bg-white/5 py-2 px-4 text-foreground placeholder:text-foreground/40 focus:border-[var(--kb-accent-gold)]/50 focus:outline-none focus:ring-2 focus:ring-[var(--kb-accent-gold)]/20"
            />
          </div>
        </div>

        {/* Khalti */}
        <div>
          <div className="flex items-center gap-3 mb-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-purple-500/20 ring-1 ring-purple-500/30">
              <Smartphone className="h-5 w-5 text-purple-400" />
            </div>
            <h3 className="text-lg font-semibold">Khalti</h3>
          </div>

          <div className="pl-13">
            <label className="block text-sm font-medium mb-2">Khalti Number</label>
            <input
              type="text"
              value={formData.khalti_number}
              onChange={(e) => handleChange('khalti_number', e.target.value)}
              placeholder="e.g., 9876543210"
              className="w-full rounded-lg border border-white/10 bg-white/5 py-2 px-4 text-foreground placeholder:text-foreground/40 focus:border-[var(--kb-accent-gold)]/50 focus:outline-none focus:ring-2 focus:ring-[var(--kb-accent-gold)]/20"
            />
          </div>
        </div>

        {/* Save Button */}
        <div className="flex justify-end pt-4">
          <button
            type="submit"
            disabled={isSaving}
            className="flex items-center gap-2 rounded-lg bg-[var(--kb-accent-gold)] px-6 py-2.5 font-medium text-black hover:bg-[var(--kb-accent-gold)]/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <CheckCircle className="h-4 w-4" />
                Save Payment Methods
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
