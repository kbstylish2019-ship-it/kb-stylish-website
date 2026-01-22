"use client";
import React from "react";
import type { OrderCosts, PaymentMethod } from "@/lib/types";
import { formatNPR, cn } from "@/lib/utils";
import { ShieldCheck } from "lucide-react";

interface OrderSummaryProps {
  costs: OrderCosts;
  discountCode: string;
  onDiscountCodeChange: (v: string) => void;
  selectedPayment?: PaymentMethod;
  onPaymentSelect: (m: PaymentMethod) => void;
  onPlaceOrder: () => void;
  placeOrderEnabled?: boolean;
  isProcessing?: boolean;
  error?: string | null;
  onClearError?: () => void;
}

export default function OrderSummary({
  costs,
  discountCode,
  onDiscountCodeChange,
  selectedPayment,
  onPaymentSelect,
  onPlaceOrder,
  placeOrderEnabled = true,
  isProcessing = false,
  error = null,
  onClearError,
}: OrderSummaryProps) {
  const paymentBtns: { id: PaymentMethod; label: string }[] = [
    { id: "npx", label: "Nepal Payment (NPX)" },
    { id: "cod", label: "Cash on Delivery" },
  ];

  return (
    <aside className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-lg font-semibold tracking-tight text-gray-900">Summary & Payment</h2>

      <div className="space-y-2 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-gray-600">Products Subtotal</span>
          <span className="font-medium text-gray-900">{formatNPR(costs.productSubtotal)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-gray-600">Service Fees</span>
          <span className="font-medium text-gray-900">{formatNPR(costs.serviceFees)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-gray-600">Shipping</span>
          <span className="font-medium text-gray-900">{formatNPR(costs.shipping)}</span>
        </div>
        {costs.discount > 0 && (
          <div className="flex items-center justify-between">
            <span className="text-gray-600">Discount</span>
            <span className="font-medium text-green-600">- {formatNPR(costs.discount)}</span>
          </div>
        )}
        <div className="my-2 h-px bg-gray-200" />
        <div className="flex items-center justify-between text-base">
          <span className="font-semibold text-gray-900">Total</span>
          <span className="text-xl font-bold text-gray-900">{formatNPR(costs.total)}</span>
        </div>
      </div>

      {/* Discount code feature - Coming soon */}

      <div className="mt-4">
        <div className="mb-2 text-sm font-medium text-gray-700">Payment Method</div>
        <div className="grid grid-cols-1 gap-2">
          {paymentBtns.map((p) => {
            const selected = selectedPayment === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => onPaymentSelect(p.id)}
                className={cn(
                  "w-full rounded-lg px-3 py-2 text-sm border transition",
                  selected
                    ? "bg-[#1976D2]/10 border-[#1976D2] text-[#1976D2] font-medium"
                    : "border-gray-300 text-gray-700 hover:bg-gray-50"
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
        disabled={!placeOrderEnabled || !selectedPayment || isProcessing}
        className={cn(
          "mt-5 w-full rounded-lg px-5 py-3 text-sm font-semibold shadow-sm transition-all duration-200",
          !selectedPayment || !placeOrderEnabled || isProcessing
            ? "bg-gray-100 text-gray-400 cursor-not-allowed"
            : "bg-[#1976D2] text-white hover:bg-[#1565C0] hover:shadow-lg"
        )}
        aria-disabled={!placeOrderEnabled || !selectedPayment || isProcessing}
      >
        {isProcessing ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
              <circle 
                className="opacity-25" 
                cx="12" 
                cy="12" 
                r="10" 
                stroke="currentColor" 
                strokeWidth="4" 
                fill="none" 
              />
              <path 
                className="opacity-75" 
                fill="currentColor" 
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" 
              />
            </svg>
            Processing Order...
          </span>
        ) : (
          <span className="flex items-center justify-center gap-2">
            Place Order • {formatNPR(costs.total)}
          </span>
        )}
      </button>

      {error && (
        <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-start gap-2">
            <svg className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="flex-1">
              <p className="text-sm text-red-700">{error}</p>
              {onClearError && (
                <button 
                  onClick={onClearError}
                  className="text-xs text-red-600 hover:text-red-800 underline mt-1 transition-colors"
                >
                  Dismiss
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {!isProcessing && (
        <div className="mt-3 flex items-center gap-2 text-xs text-gray-500">
          <ShieldCheck className="h-4 w-4 text-green-600" />
          <span>Secure payment and encrypted checkout</span>
        </div>
      )}
    </aside>
  );
}
