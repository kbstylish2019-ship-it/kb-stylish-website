import type { Metadata } from "next";
import CartPageClient from "@/components/cart/CartPageClient";

export const metadata: Metadata = {
  title: "Your Cart | KB Stylish",
  description: "Review your products and appointments before checkout.",
};

export default function CartPage() {
  return (
    <main className="min-h-screen bg-[#F5F5F5]">
      <CartPageClient />
    </main>
  );
}
