"use client";

import React from "react";
import { Plus } from "lucide-react";
import dynamic from "next/dynamic";

const AddProductModal = dynamic(() => import("@/components/vendor/AddProductModal"));

interface VendorCtaButtonProps {
  userId?: string;
}

export default function VendorCtaButton({ userId }: VendorCtaButtonProps = {}) {
  const [isAddModalOpen, setIsAddModalOpen] = React.useState(false);
  
  return (
    <>
      <button
        onClick={() => setIsAddModalOpen(true)}
        className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-foreground shadow-sm ring-1 ring-white/10 transition bg-gradient-to-r from-[color-mix(in_oklab,var(--kb-accent-gold)_85%,black)] to-[var(--kb-accent-gold)] hover:from-[var(--kb-accent-gold)] hover:to-[var(--kb-accent-gold)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--kb-primary-brand)] whitespace-nowrap"
      >
        <Plus className="h-4 w-4 text-black" aria-hidden />
        <span className="text-black hidden sm:inline">Add Product/Service</span>
        <span className="text-black sm:hidden">Add Product</span>
      </button>
      {userId && <AddProductModal open={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} userId={userId} />}
    </>
  );
}
