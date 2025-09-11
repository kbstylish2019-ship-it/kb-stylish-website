"use client";
import React from "react";
import type { OrderCosts, PaymentMethod } from "@/lib/types";
import { formatNPR, cn } from "@/lib/utils";
import { ShieldCheck } from "lucide-react";

export default function OrderSummary({
  costs,
  discountCode,
  onDiscountCodeChange,
  selectedPayment,
  onPaymentSelect,
  onPlaceOrder,
  placeOrderEnabled = true,
}: {
  costs: OrderCosts;
  discountCode: string;
  onDiscountCodeChange: (v: string) => void;
  selectedPayment?: PaymentMethod;
  onPaymentSelect: (m: PaymentMethod) => void;
  onPlaceOrder: () => void;
  placeOrderEnabled?: boolean;
}) {
  const paymentBtns: { id: PaymentMethod; label: string }[] = [
    { id: "esewa", label: "eSewa" },
    { id: "khalti", label: "Khalti" },
    { id: "cod", label: "Cash on Delivery" },
  ];

  return (
    <aside className="rounded-xl border border-white/10 bg-white/5 p-4 shadow-sm">
      <h2 className="mb-3 text-lg font-semibold tracking-tight">Summary & Payment</h2>

      <div className="space-y-2 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-foreground/80">Products Subtotal</span>
          <span className="font-medium">{formatNPR(costs.productSubtotal)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-foreground/80">Service Fees</span>
          <span className="font-medium">{formatNPR(costs.serviceFees)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-foreground/80">Shipping</span>
          <span className="font-medium">{formatNPR(costs.shipping)}</span>
        </div>
        {costs.discount > 0 && (
          <div className="flex items-center justify-between">
            <span className="text-foreground/80">Discount</span>
            <span className="font-medium text-[var(--kb-accent-gold)]">- {formatNPR(costs.discount)}</span>
          </div>
        )}
        <div className="my-2 h-px bg-white/10" />
        <div className="flex items-center justify-between text-base">
          <span className="font-semibold">Total</span>
          <span className="text-xl font-bold">{formatNPR(costs.total)}</span>
        </div>
      </div>

      <div className="mt-4">
        <label className="mb-1 block text-sm text-foreground/80" htmlFor="discount">
          Discount Code
        </label>
        <input
          id="discount"
          value={discountCode}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => onDiscountCodeChange(e.target.value)}
          placeholder="e.g., WELCOME100"
          className="w-full rounded-lg bg-white/5 px-3 py-2 text-sm ring-1 ring-white/10"
        />
        <p className="mt-1 text-xs text-foreground/60">Use WELCOME100 for demo.</p>
      </div>

      <div className="mt-4">
        <div className="mb-2 text-sm font-medium text-foreground/90">Payment Method</div>
        <div className="grid grid-cols-1 gap-2">
          {paymentBtns.map((p) => {
            const selected = selectedPayment === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => onPaymentSelect(p.id)}
                className={cn(
                  "w-full rounded-lg px-3 py-2 text-sm ring-1 transition",
                  selected
                    ? "bg-[var(--kb-primary-brand)]/20 ring-[var(--kb-primary-brand)]"
                    : "ring-white/10 hover:bg-white/5"
                )}
                aria-pressed={selected}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      </div>

      <button
        type="button"
        onClick={onPlaceOrder}
        disabled={!placeOrderEnabled || !selectedPayment}
        className={cn(
          "mt-5 w-full rounded-lg px-5 py-3 text-sm font-semibold shadow-sm ring-1 transition",
          !selectedPayment || !placeOrderEnabled
            ? "bg-white/5 text-foreground/60 ring-white/10 cursor-not-allowed"
            : "bg-gradient-to-r from-[color-mix(in_oklab,var(--kb-primary-brand)_75%,black)] to-[var(--kb-primary-brand)] ring-white/10 hover:from-[var(--kb-primary-brand)] hover:to-[var(--kb-primary-brand)]"
        )}
        aria-disabled={!placeOrderEnabled || !selectedPayment}
      >
        Place Order
      </button>

      <div className="mt-3 flex items-center gap-2 text-xs text-foreground/70">
        <ShieldCheck className="h-4 w-4 text-[var(--kb-accent-gold)]" />
        <span>Secure payment and encrypted checkout</span>
      </div>
    </aside>
  );
}
