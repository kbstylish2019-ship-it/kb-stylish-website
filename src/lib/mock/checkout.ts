import type { Address, Booking, CartProductItem, OrderCosts, PaymentMethod } from "@/lib/types";

export function getMockBooking(): Booking {
  return {
    id: "b-1001",
    stylist: "KB Signature Studio",
    service: "Premium Haircut & Styling",
    date: new Date().toISOString().slice(0, 10), // today
    time: "15:30",
    durationMins: 60,
    location: "Durbar Marg, Kathmandu",
    price: 1200,
  };
}

export function getMockProducts(): CartProductItem[] {
  return [
    {
      type: "product",
      id: "p-aurora-kurta",
      name: "Aurora Satin Kurta Set",
      variant: "M / Royal Purple",
      imageUrl:
        "https://images.unsplash.com/photo-1542060748-10c28b62716a?q=80&w=900&auto=format&fit=crop",
      price: 4990,
      quantity: 1,
    },
    {
      type: "product",
      id: "rp-3",
      name: "Noor Statement Earrings",
      variant: "Gold",
      imageUrl:
        "https://images.unsplash.com/photo-1610622845878-1b6ac8948a58?q=80&w=900&auto=format&fit=crop",
      price: 990,
      quantity: 2,
    },
  ];
}

export function getEmptyAddress(): Address {
  return {
    fullName: "",
    phone: "",
    region: "Bagmati Province",
    city: "",
    area: "",
    line2: "",
    notes: "",
  };
}

export function validateAddress(a: Address): boolean {
  return Boolean(a.fullName && a.phone && a.city && a.area);
}

export function calculateCosts(products: CartProductItem[], bookingPrice: number, discount: number): OrderCosts {
  const productSubtotal = products.reduce((s, p) => s + p.price * p.quantity, 0);
  const serviceFees = bookingPrice;
  const shipping = productSubtotal >= 2000 ? 0 : (products.length > 0 ? 99 : 0);
  const discountApplied = Math.min(discount, productSubtotal + serviceFees);
  const total = productSubtotal + serviceFees + shipping - discountApplied;
  return { productSubtotal, serviceFees, shipping, discount: discountApplied, total, currency: "NPR" };
}

export function normalizePaymentMethod(m?: string): PaymentMethod | undefined {
  if (!m) return undefined;
  if (m === "esewa" || m === "khalti" || m === "cod") return m;
  return undefined;
}
