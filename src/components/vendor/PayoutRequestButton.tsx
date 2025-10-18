"use client";

import React, { useState } from "react";
import { DollarSign } from "lucide-react";
import RequestPayoutModal from "./RequestPayoutModal";

interface PayoutRequestButtonProps {
  availableBalanceCents: number;
  vendorProfile: {
    bank_account_name: string | null;
    bank_account_number: string | null;
    bank_name: string | null;
    esewa_number: string | null;
    khalti_number: string | null;
  };
}

export default function PayoutRequestButton({
  availableBalanceCents,
  vendorProfile,
}: PayoutRequestButtonProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  const isDisabled = availableBalanceCents < 100000; // Minimum NPR 1,000

  return (
    <>
      <button
        onClick={() => setIsModalOpen(true)}
        disabled={isDisabled}
        className={`
          flex items-center gap-2 rounded-lg px-6 py-3 font-medium transition-all
          ${isDisabled
            ? 'bg-gray-500/20 text-gray-400 cursor-not-allowed'
            : 'bg-[var(--kb-accent-gold)] text-black hover:bg-[var(--kb-accent-gold)]/90 hover:shadow-lg hover:shadow-[var(--kb-accent-gold)]/20'
          }
        `}
        title={isDisabled ? 'Minimum payout amount is NPR 1,000' : 'Request a payout'}
      >
        <DollarSign className="h-5 w-5" />
        Request Payout
      </button>

      <RequestPayoutModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        availableBalanceCents={availableBalanceCents}
        vendorProfile={vendorProfile}
      />
    </>
  );
}
