"use client";

import React from "react";
import { Plus } from "lucide-react";
import dynamic from "next/dynamic";

const AddProductModal = dynamic(() => import("@/components/vendor/AddProductModal"));

export default function VendorCtaButton() {
  const [isAddModalOpen, setIsAddModalOpen] = React.useState(false);
  
  return (
    <>
      <button
        onClick={() => setIsAddModalOpen(true)}
        className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-foreground shadow-sm ring-1 ring-white/10 transition bg-gradient-to-r from-[color-mix(in_oklab,var(--kb-accent-gold)_85%,black)] to-[var(--kb-accent-gold)] hover:from-[var(--kb-accent-gold)] hover:to-[var(--kb-accent-gold)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--kb-primary-brand)]"
      >
        <Plus className="h-4 w-4 text-black" aria-hidden />
        <span className="text-black">Add Product/Service</span>
      </button>
      <AddProductModal open={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} />
    </>
  );
}
