"use client";
import React from "react";
import type { Address, Booking, CartProductItem, CartBookingItem, OrderCosts, PaymentMethod } from "@/lib/types";
import BookingDetails from "@/components/checkout/BookingDetails";
import ProductList from "@/components/checkout/ProductList";
import ShippingForm from "@/components/checkout/ShippingForm";
import OrderSummary from "@/components/checkout/OrderSummary";
import { useCartStore } from "@/lib/store/cartStore";
import {
  getEmptyAddress,
  validateAddress,
  calculateCosts,
  normalizePaymentMethod,
} from "@/lib/mock/checkout";

export default function CheckoutClient() {
  const items = useCartStore((state) => state.items);
  const updateProductQuantity = useCartStore((state) => state.updateProductQuantity);
  const removeItem = useCartStore((state) => state.removeItem);
  const clearCart = useCartStore((state) => state.clearCart);
  const getProductSubtotal = useCartStore((state) => state.getProductSubtotal);
  const getServiceSubtotal = useCartStore((state) => state.getServiceSubtotal);
  const getTotal = useCartStore((state) => state.getTotal);
  
  const [address, setAddress] = React.useState<Address>(getEmptyAddress());
  const [discountCode, setDiscountCode] = React.useState<string>("");
  const [payment, setPayment] = React.useState<PaymentMethod | undefined>(undefined);

  // Separate products and bookings from cart items
  const products = React.useMemo(
    () => items.filter((item): item is CartProductItem => item.type === "product"),
    [items]
  );
  
  const bookings = React.useMemo(
    () => items.filter((item): item is CartBookingItem => item.type === "booking"),
    [items]
  );
  
  const firstBooking = bookings[0]?.booking;

  const discountValue = React.useMemo(() => {
    return discountCode.trim().toUpperCase() === "WELCOME100" ? 100 : 0;
  }, [discountCode]);

  const costs: OrderCosts = React.useMemo(
    () => calculateCosts(
      products, 
      bookings.reduce((total, item) => total + item.booking.price, 0),
      discountValue
    ),
    [products, bookings, discountValue]
  );

  const onQtyChange = (id: string, qty: number, variant?: string) => {
    updateProductQuantity(id, qty, variant);
  };

  const onRemove = (id: string, variant?: string) => {
    removeItem(id, variant);
  };

  const canPlaceOrder = validateAddress(address) && Boolean(payment);

  const onPlaceOrder = () => {
    if (!canPlaceOrder) return;
    // Placeholder — integrate with Supabase checkout API in future
    alert(
      `Order placed with ${payment?.toUpperCase()}! Total: NPR ${costs.total.toLocaleString("en-NP")}`
    );
    // Clear cart after successful order
    clearCart();
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <h1 className="mb-4 text-2xl font-semibold tracking-tight">Checkout</h1>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 lg:gap-8">
        <div className="lg:col-span-2 space-y-4">
          {firstBooking && (
            <BookingDetails booking={firstBooking} onEdit={() => alert("Edit booking not implemented")}/>
          )}
          {products.length > 0 && (
            <ProductList items={products} onQtyChange={onQtyChange} onRemove={onRemove} />
          )}
          {items.length === 0 && (
            <div className="rounded-xl border border-white/10 bg-white/5 p-8 text-center">
              <p className="text-foreground/60">Your cart is empty</p>
              <a href="/" className="mt-4 inline-block text-[var(--kb-primary-brand)] hover:underline">
                Continue Shopping
              </a>
            </div>
          )}
          <ShippingForm address={address} onChange={setAddress} />
        </div>
        <div className="lg:col-span-1">
          <div className="lg:sticky lg:top-24">
            <OrderSummary
              costs={costs}
              discountCode={discountCode}
              onDiscountCodeChange={setDiscountCode}
              selectedPayment={payment}
              onPaymentSelect={setPayment}
              onPlaceOrder={onPlaceOrder}
              placeOrderEnabled={canPlaceOrder}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
