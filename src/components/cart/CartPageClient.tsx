"use client";

import React from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Minus, Plus, Trash2, ShoppingBag, Calendar, Truck, RotateCcw, Phone } from "lucide-react";
import useDecoupledCartStore from "@/lib/store/decoupledCartStore";
import { formatNPR } from "@/lib/utils";

/**
 * The cart review step.
 *
 * There was no /cart route at all: the header cart button linked straight to
 * /checkout, so tapping it dropped the customer into line items, an address form
 * and payment buttons in one long mobile scroll. Every Nepali marketplace these
 * customers have used (Daraz, SastoDeal) has a review-then-checkout step, so
 * landing on a form reads as the site trying to take money immediately.
 */
export default function CartPageClient() {
  const router = useRouter();
  const productItems = useDecoupledCartStore((s) => s.productItems);
  const bookingItems = useDecoupledCartStore((s) => s.bookingItems);
  const updateProductQuantity = useDecoupledCartStore((s) => s.updateProductQuantity);
  const removeProductItem = useDecoupledCartStore((s) => s.removeProductItem);
  const removeBookingItem = useDecoupledCartStore((s) => s.removeBookingItem);
  const isUpdatingItem = useDecoupledCartStore((s) => s.isUpdatingItem);

  const productTotal = productItems.reduce((s, i) => s + i.price * i.quantity, 0);
  const bookingTotal = bookingItems.reduce((s, b) => s + b.price, 0);
  const total = productTotal + bookingTotal;
  const count = productItems.length + bookingItems.length;

  if (count === 0) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <ShoppingBag className="mx-auto mb-4 h-14 w-14 text-gray-300" />
        <h1 className="mb-2 text-2xl font-semibold text-gray-900">Your cart is empty</h1>
        <p className="mb-6 text-gray-600">Browse products or book an appointment with a stylist.</p>
        <div className="flex flex-wrap justify-center gap-3">
          <Link href="/shop" className="rounded-lg bg-[#1976D2] px-5 py-3 text-sm font-semibold text-white hover:bg-[#1565C0]">
            Shop Products
          </Link>
          <Link href="/book-a-stylist" className="rounded-lg border border-gray-300 bg-white px-5 py-3 text-sm font-semibold text-gray-800 hover:bg-gray-50">
            Book a Stylist
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <h1 className="mb-1 text-2xl font-semibold text-gray-900">Your Cart</h1>
      <p className="mb-5 text-sm text-gray-600">{count} item{count === 1 ? "" : "s"}</p>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {productItems.length > 0 && (
            <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <h2 className="mb-3 text-lg font-semibold text-gray-900">Products</h2>
              <ul className="divide-y divide-gray-100">
                {productItems.map((item) => (
                  <li key={item.id} className="flex gap-3 py-3">
                    <div className="relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg bg-gray-50">
                      {item.image_url && (
                        <Image src={item.image_url} alt={item.product_name || "Product"} fill className="object-contain p-1" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-gray-900">{item.product_name}</p>
                      {item.variant_name && <p className="text-xs text-gray-500">{item.variant_name}</p>}
                      <p className="mt-0.5 text-sm font-semibold text-gray-900">{formatNPR(item.price)}</p>

                      {/* 44px tap targets: the checkout steppers were 32px with Remove
                          adjacent, which produced mis-taps that deleted the line. */}
                      <div className="mt-2 flex items-center gap-3">
                        <div className="flex items-center rounded-lg border border-gray-300">
                          <button
                            type="button"
                            aria-label={`Decrease quantity of ${item.product_name}`}
                            disabled={!!isUpdatingItem || item.quantity <= 1}
                            onClick={() => updateProductQuantity(item.id, item.quantity - 1)}
                            className="flex h-11 w-11 items-center justify-center text-gray-700 disabled:opacity-40"
                          >
                            <Minus className="h-4 w-4" />
                          </button>
                          <span className="w-8 text-center text-sm font-medium text-gray-900">{item.quantity}</span>
                          <button
                            type="button"
                            aria-label={`Increase quantity of ${item.product_name}`}
                            disabled={!!isUpdatingItem}
                            onClick={() => updateProductQuantity(item.id, item.quantity + 1)}
                            className="flex h-11 w-11 items-center justify-center text-gray-700 disabled:opacity-40"
                          >
                            <Plus className="h-4 w-4" />
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeProductItem(item.id)}
                          className="flex h-11 items-center gap-1 px-2 text-sm text-gray-500 hover:text-red-600"
                          aria-label={`Remove ${item.product_name}`}
                        >
                          <Trash2 className="h-4 w-4" /> Remove
                        </button>
                      </div>
                    </div>
                    <div className="text-right text-sm font-semibold text-gray-900">
                      {formatNPR(item.price * item.quantity)}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {bookingItems.length > 0 && (
            <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-gray-900">
                <Calendar className="h-5 w-5 text-[#1976D2]" /> Appointments
              </h2>
              <ul className="divide-y divide-gray-100">
                {bookingItems.map((b) => (
                  <li key={b.reservation_id} className="flex items-start justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-gray-900">{b.service_name}</p>
                      <p className="text-xs text-gray-600">with {b.stylist_name}</p>
                      <p className="text-xs text-gray-500">
                        {new Date(b.start_time).toLocaleString("en-GB", {
                          timeZone: "Asia/Kathmandu", weekday: "short", day: "2-digit",
                          month: "short", hour: "2-digit", minute: "2-digit",
                        })}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-semibold text-gray-900">{formatNPR(b.price)}</span>
                      <button
                        type="button"
                        onClick={() => removeBookingItem(b.reservation_id)}
                        className="flex h-11 w-11 items-center justify-center text-gray-500 hover:text-red-600"
                        aria-label={`Remove ${b.service_name}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <div className="lg:col-span-1">
          <div className="lg:sticky lg:top-24 space-y-3">
            <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <h2 className="mb-3 text-lg font-semibold text-gray-900">Order Summary</h2>
              <dl className="space-y-2 text-sm">
                {productItems.length > 0 && (
                  <div className="flex justify-between"><dt className="text-gray-600">Products</dt><dd className="text-gray-900">{formatNPR(productTotal)}</dd></div>
                )}
                {bookingItems.length > 0 && (
                  <div className="flex justify-between"><dt className="text-gray-600">Appointments</dt><dd className="text-gray-900">{formatNPR(bookingTotal)}</dd></div>
                )}
                <div className="flex justify-between"><dt className="text-gray-600">Delivery</dt><dd className="font-medium text-emerald-700">Free</dd></div>
                <div className="mt-2 flex justify-between border-t border-gray-200 pt-2 text-base font-semibold">
                  <dt className="text-gray-900">Total</dt><dd className="text-gray-900">{formatNPR(total)}</dd>
                </div>
              </dl>

              <button
                type="button"
                onClick={() => router.push("/checkout")}
                className="mt-4 w-full rounded-lg bg-[#1976D2] px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-[#1565C0]"
              >
                Proceed to Checkout
              </button>
              <Link href="/shop" className="mt-2 block text-center text-sm text-[#1976D2] hover:underline">
                Continue shopping
              </Link>
            </section>

            {/* The reassurance a first-time COD buyer needs, at the decision point. */}
            <section className="rounded-xl border border-gray-200 bg-white p-4 text-xs text-gray-700 shadow-sm">
              <p className="mb-2 flex items-start gap-2"><Truck className="mt-0.5 h-4 w-4 flex-shrink-0 text-[#1976D2]" /> Free delivery inside Kathmandu Valley, 2–4 days. Outside the Valley we call you with the charge before dispatch.</p>
              <p className="mb-2 flex items-start gap-2"><RotateCcw className="mt-0.5 h-4 w-4 flex-shrink-0 text-[#1976D2]" /> 7-day returns on unused items.</p>
              <p className="flex items-start gap-2"><Phone className="mt-0.5 h-4 w-4 flex-shrink-0 text-[#1976D2]" /> Questions? <a href="tel:+9779801227448" className="text-[#1976D2] hover:underline">9801227448</a></p>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
