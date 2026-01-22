"use client";
import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import type { Address, CartProductItem, OrderCosts, PaymentMethod, CartBookingItem as CheckoutBookingItem } from "@/lib/types";
import type { CartBookingItem as StoreCartBookingItem } from "@/lib/store/decoupledCartStore";
import BookingDetails from "@/components/checkout/BookingDetails";
import ProductList from "@/components/checkout/ProductList";
import ComboGroup from "@/components/cart/ComboGroup";
import ShippingForm from "@/components/checkout/ShippingForm";
import OrderSummary from "@/components/checkout/OrderSummary";
import ChangeAppointmentModal from "@/components/booking/ChangeAppointmentModal";
import type { StylistWithServices } from "@/lib/apiClient";
import useDecoupledCartStore, { groupCartItemsByCombo } from "@/lib/store/decoupledCartStore";
import { cartAPI } from "@/lib/api/cartClient";
import {
  getEmptyAddress,
  validateAddress,
  calculateCosts,
} from "@/lib/mock/checkout";

export default function CheckoutClient() {
  const router = useRouter();
  // Lazy load AuthModal locally so we can open it from checkout
  const AuthModal = React.useMemo(
    () => dynamic(() => import("@/components/features/AuthModal"), { ssr: false, loading: () => null }),
    []
  );
  // Use the new decoupled store with separated products and bookings
  const productItems = useDecoupledCartStore((state) => state.productItems);
  const bookingItems = useDecoupledCartStore((state) => state.bookingItems);
  const updateProductQuantity = useDecoupledCartStore((state) => state.updateProductQuantity);
  const removeProductItem = useDecoupledCartStore((state) => state.removeProductItem);
  const removeBookingItem = useDecoupledCartStore((state) => state.removeBookingItem);
  const removeComboItem = useDecoupledCartStore((state) => state.removeComboItem);
  const updateComboQuantity = useDecoupledCartStore((state) => state.updateComboQuantity);
  const isRemovingCombo = useDecoupledCartStore((state) => state.isRemovingCombo);
  const isUpdatingItem = useDecoupledCartStore((state) => state.isUpdatingItem);
  const clearCart = useDecoupledCartStore((state) => state.clearCart);
  const grandTotal = useDecoupledCartStore((state) => state.grandTotal);

  // Group items by combo
  const { comboGroups, regularItems } = React.useMemo(
    () => groupCartItemsByCombo(productItems),
    [productItems]
  );

  // Combine items for display (temporarily for compatibility)
  const items = [...productItems, ...bookingItems];

  // Debug logging to identify items
  React.useEffect(() => {
    console.log('[CheckoutClient] Product items:', productItems);
    console.log('[CheckoutClient] Combo groups:', comboGroups);
    console.log('[CheckoutClient] Regular items:', regularItems);
    console.log('[CheckoutClient] Booking items:', bookingItems);
  }, [productItems, bookingItems, comboGroups, regularItems]);

  const [address, setAddress] = React.useState<Address>(getEmptyAddress());
  const [discountCode, setDiscountCode] = React.useState<string>("");
  const [payment, setPayment] = React.useState<PaymentMethod | undefined>(undefined);

  // Enhanced state management for order processing
  const [isProcessingOrder, setIsProcessingOrder] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null);
  const [orderSuccess, setOrderSuccess] = useState(false);
  const [orderTotal, setOrderTotal] = useState<number>(0); // Store the total before clearing cart
  const [authOpen, setAuthOpen] = useState(false);

  // Change appointment modal state
  const [changeModalOpen, setChangeModalOpen] = useState(false);
  const [selectedBookingToChange, setSelectedBookingToChange] = useState<StoreCartBookingItem | null>(null);

  // Mock stylist data for the change modal (in production, fetch from API)
  const mockStylist: StylistWithServices = {
    id: bookingItems[0]?.stylist_id || '19d02e52-4bb3-4bd6-ae4c-87e3f1543968',
    displayName: bookingItems[0]?.stylist_name || 'Sarah Johnson',
    title: 'Senior Stylist',
    bio: 'Expert stylist with years of experience',
    yearsExperience: 5,
    specialties: ['Hair', 'Makeup'],
    timezone: 'Asia/Kathmandu',
    isActive: true,
    isFeatured: false,
    avatarUrl: '',
    ratingAverage: 4.9,
    totalBookings: 150,
    services: [
      {
        id: '3c203cca-fbe9-411c-bd6c-c03b8c1128fd',
        name: 'Haircut & Style',
        durationMinutes: 60,
        priceCents: 150000,
        slug: 'haircut-style',
        description: 'Professional haircut and styling',
        category: 'Hair',
        requiresConsultation: false
      },
      {
        id: '2ea00cdd-390c-4cfb-9c31-ce77ec7ea074',
        name: 'Bridal Makeup',
        durationMinutes: 90,
        priceCents: 500000,
        slug: 'bridal-makeup',
        description: 'Complete bridal makeup service',
        category: 'Makeup',
        requiresConsultation: true
      },
      {
        id: '30dc36d1-f970-494b-90a0-aa14881daf0a',
        name: 'Hair Color',
        durationMinutes: 120,
        priceCents: 350000,
        slug: 'hair-color',
        description: 'Professional hair coloring',
        category: 'Hair',
        requiresConsultation: true
      },
      {
        id: '9f18f1b3-47f2-4450-a7ed-26c531933f86',
        name: 'Facial Treatment',
        durationMinutes: 60,
        priceCents: 200000,
        slug: 'facial-treatment',
        description: 'Relaxing facial treatment',
        category: 'Skincare',
        requiresConsultation: false
      },
      {
        id: 'ce7ec3b7-c363-404b-a682-be54a3e0312c',
        name: 'Manicure',
        durationMinutes: 45,
        priceCents: 80000,
        slug: 'manicure',
        description: 'Professional nail care',
        category: 'Nails',
        requiresConsultation: false
      }
    ]
  };

  // Map the decoupled store items to the expected format
  const products = React.useMemo(
    () => productItems.map((item): CartProductItem => {
      // 🔍 DEBUG: Log each item transformation
      console.log('[CheckoutClient] Transforming item:', {
        id: item.id,
        product_name: item.product_name,
        store_price: item.price,
        quantity: item.quantity
      });

      // Transform from CartProductItem to display format
      return {
        type: "product",
        id: item.id,
        name: item.product_name || 'Product',
        variant: item.variant_name,
        variantId: item.variant_id,
        variantData: item.variant_data,  // ⭐ Include structured variant data
        imageUrl: item.image_url,
        price: item.price,
        quantity: item.quantity,
      };
    }),
    [productItems]
  );

  const bookings = React.useMemo(
    () => bookingItems.map((item): CheckoutBookingItem => ({
      type: "booking",
      booking: {
        id: item.reservation_id,
        service: item.service_name,
        stylist: item.stylist_name,
        date: item.start_time,
        time: new Date(item.start_time).toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit'
        }),
        durationMins: Math.round(
          (new Date(item.end_time).getTime() - new Date(item.start_time).getTime()) / 60000
        ),
        price: item.price,
      },
    })),
    [bookingItems]
  );

  // Remove firstBooking - we'll show all bookings

  const discountAmount = React.useMemo(() => {
    // Discount codes feature - Coming soon
    return 0;
  }, [discountCode]);

  const costs: OrderCosts = React.useMemo(
    () => calculateCosts(
      products,
      bookings.reduce((total, item) => total + item.booking.price, 0),
      discountAmount
    ),
    [products, bookings, discountAmount]
  );

  const onQtyChange = (id: string, qty: number, variant?: string) => {
    // Update product quantity
    updateProductQuantity(id, qty);
  };

  const onRemove = (id: string, variant?: string, itemType?: 'product' | 'booking') => {
    console.log('[CheckoutClient] onRemove called:', { id, variant, itemType });
    console.log('[CheckoutClient] Current productItems:', productItems);
    console.log('[CheckoutClient] Current regularItems:', regularItems);

    // Find the item to verify it exists
    const itemToRemove = productItems.find(item => item.id === id);
    console.log('[CheckoutClient] Item to remove:', itemToRemove);

    // FIXED: Use explicit type parameter to avoid ID collision
    if (itemType === 'booking') {
      // For bookings, id is the reservation_id
      removeBookingItem(id);
    } else {
      // For products, use the product removal
      console.log('[CheckoutClient] Removing product with id:', id);
      removeProductItem(id);
    }
  };

  const canPlaceOrder = validateAddress(address) && Boolean(payment);

  /**
   * Production-ready order placement with real payment gateway integration
   */
  // Redirect to order confirmation after success
  useEffect(() => {
    if (orderSuccess && paymentIntentId) {
      const timer = setTimeout(() => {
        router.push(`/order-confirmation?payment_intent_id=${paymentIntentId}`);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [orderSuccess, paymentIntentId, router]);

  const onPlaceOrder = async () => {
    if (!canPlaceOrder || isProcessingOrder || !payment) return;

    // COD is now supported!

    setIsProcessingOrder(true);
    setOrderError(null);

    try {
      // Step 1: Create order intent with backend (includes payment gateway integration)
      console.log('[CheckoutClient] Creating order intent with payment method:', payment);
      const response = await cartAPI.createOrderIntent({
        payment_method: payment as 'esewa' | 'khalti' | 'npx' | 'cod',
        shipping_address: {
          name: address.fullName,
          phone: address.phone,
          address_line1: address.area,
          address_line2: address.line2 || undefined,
          city: address.city,
          state: address.region,
          postal_code: '44600', // Default postal code for Nepal
          country: 'Nepal',
          notes: address.notes || undefined  // Delivery instructions
        },
        metadata: {
          discount_code: discountCode || undefined,
        }
      });

      console.log('[CheckoutClient] Order intent response:', response);

      if (!response.success) {
        // Handle specific error cases
        // Safely check response.details regardless of type (string or array)
        const details = (response as any).details as unknown;
        const detailsStr = typeof details === 'string' ? details : '';
        const detailsArr = Array.isArray(details) ? (details as unknown[]) : [];
        const hasInsufficientStock = (
          detailsArr.some((d) => String(d).includes('Insufficient')) ||
          detailsStr.includes('Insufficient')
        );

        const hasAuthError = (response.error?.includes('Authentication required') ?? false)
          || (response.error?.includes('Invalid authentication token') ?? false)
          || (response.error?.includes('401') ?? false)
          || detailsStr.includes('authentication')
          || detailsStr.includes('401')
          || detailsArr.some((d) => String(d).includes('authentication'));

        if (hasInsufficientStock) {
          setOrderError('Some items in your cart are no longer available. Please review your cart.');
        } else if (response.error?.includes('Cart is empty')) {
          setOrderError('Your cart is empty. Please add items to continue.');
        } else if (hasAuthError) {
          setOrderError('Payment gateway authentication failed. Please try again or contact support.');
        } else {
          setOrderError(response.error || 'Failed to process order. Please try again.');
        }
        setIsProcessingOrder(false);
        return;
      }

      // Step 2: Handle payment gateway redirect based on method
      if (response.payment_method === 'npx') {
        // NPX: Auto-submit form to redirect to NPX gateway
        console.log('[CheckoutClient] Redirecting to NPX with form fields');
        const form = document.createElement('form');
        form.method = 'POST';
        form.action = response.payment_url!;

        // Add all form fields from response
        Object.entries(response.form_fields || {}).forEach(([key, value]) => {
          const input = document.createElement('input');
          input.type = 'hidden';
          input.name = key;
          input.value = value;
          form.appendChild(input);
        });

        document.body.appendChild(form);
        form.submit();
        // User will be redirected, no need to continue

      } else if (response.payment_method === 'esewa') {
        // eSewa: Auto-submit form to redirect to gateway
        console.log('[CheckoutClient] Redirecting to eSewa with form fields');
        const form = document.createElement('form');
        form.method = 'POST';
        form.action = response.payment_url!;

        // Add all form fields from response
        Object.entries(response.form_fields || {}).forEach(([key, value]) => {
          const input = document.createElement('input');
          input.type = 'hidden';
          input.name = key;
          input.value = value;
          form.appendChild(input);
        });

        document.body.appendChild(form);
        form.submit();
        // User will be redirected, no need to continue

      } else if (response.payment_method === 'khalti') {
        // Khalti: Direct redirect to payment URL
        console.log('[CheckoutClient] Redirecting to Khalti:', response.payment_url);
        window.location.href = response.payment_url!;
        // User will be redirected, no need to continue
      } else if (response.payment_method === 'cod' || response.redirect_to_success) {
        // COD: Poll for order confirmation before showing success
        console.log('[CheckoutClient] COD Order - waiting for confirmation...');
        setOrderTotal(costs.total);
        setPaymentIntentId(response.payment_intent_id || null);

        // Poll for order to be created (max 10 attempts, 1 second apart)
        if (response.payment_intent_id) {
          const confirmationResult = await cartAPI.pollOrderConfirmation(
            response.payment_intent_id,
            10,  // maxAttempts
            1000 // intervalMs
          );

          if (confirmationResult.success) {
            console.log('[CheckoutClient] COD Order confirmed:', confirmationResult.orderNumber);
          } else {
            // Order still processing - show success anyway but with note
            console.log('[CheckoutClient] COD Order still processing, showing success');
          }
        }

        setOrderSuccess(true);

        // Cart will be cleared by the order-worker in the database
        // The store will sync on next page load

        // Finalize state
        setIsProcessingOrder(false);
      }

    } catch (error) {
      console.error('[CheckoutClient] Order processing error:', error);
      setOrderError('An unexpected error occurred. Please try again.');
      setIsProcessingOrder(false);
    }
  };

  const clearOrderError = () => {
    setOrderError(null);
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <h1 className="mb-4 text-2xl font-semibold tracking-tight">Checkout</h1>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 lg:gap-8">
        <div className="lg:col-span-2 space-y-4">
          {/* Show All Bookings */}
          {bookings.length > 0 && (
            <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900">
                  Your Appointment{bookings.length > 1 ? 's' : ''}
                </h2>
              </div>
              <div className="space-y-4">
                {bookings.map((bookingWrapper, index) => {
                  const booking = bookingWrapper.booking;
                  const startDate = new Date(booking.date);
                  // Use a unique key combining index and booking properties
                  const uniqueKey = booking.id || `booking-${index}-${booking.service}-${booking.date}`;
                  return (
                    <div key={uniqueKey} className="flex flex-col sm:flex-row items-start gap-4 p-4 bg-gray-50 rounded-lg border border-gray-100">
                      <div className="flex-shrink-0">
                        <div className="w-10 h-10 bg-[#1976D2] rounded-lg flex items-center justify-center">
                          <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 2C5.58 2 2 5.58 2 10s3.58 8 8 8 8-3.58 8-8-3.58-8-8-8zm3.5 6L10 10.5 6.5 8 8 6.5 10 8.5 12 6.5 13.5 8z" clipRule="evenodd" />
                          </svg>
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-gray-900">{booking.service}</h3>
                        <p className="text-sm text-gray-600 mt-1">with {booking.stylist}</p>
                        <div className="flex flex-wrap items-center gap-4 mt-2 text-sm text-gray-500">
                          <div className="flex items-center gap-1">
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
                            </svg>
                            {startDate.toLocaleDateString('en-US', {
                              weekday: 'short',
                              month: 'short',
                              day: 'numeric'
                            })}
                          </div>
                          <div className="flex items-center gap-1">
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                            </svg>
                            {booking.time} • {booking.durationMins} mins
                          </div>
                        </div>
                      </div>
                      <div className="sm:text-right w-full sm:w-auto mt-3 sm:mt-0">
                        <div className="flex items-center justify-between sm:block">
                          <p className="font-semibold text-gray-900">NPR {booking.price.toFixed(0)}</p>
                        </div>
                        <div className="flex gap-3 mt-2 sm:justify-end">
                          <button
                            onClick={() => {
                              const bookingItem = bookingItems.find(b =>
                                b.reservation_id === booking.id ||
                                b.id === booking.id
                              );
                              if (bookingItem) {
                                setSelectedBookingToChange(bookingItem);
                                setChangeModalOpen(true);
                              }
                            }}
                            className="text-xs text-[#1976D2] hover:underline"
                          >
                            Change
                          </button>
                          <button
                            onClick={() => {
                              console.log('[CheckoutClient] DEBUG - Full booking object:', booking);
                              console.log('[CheckoutClient] DEBUG - Full bookingItems:', bookingItems);

                              // CRITICAL FIX: booking.id is undefined!
                              // bookingItems have the actual data, find by matching other fields
                              const matchingItem = bookingItems.find(item =>
                                item.service_name === booking.service &&
                                item.stylist_name === booking.stylist
                              );

                              if (matchingItem) {
                                console.log('[CheckoutClient] Found matching item, removing:', matchingItem.reservation_id);
                                onRemove(matchingItem.reservation_id, undefined, 'booking');
                              } else {
                                console.error('[CheckoutClient] Could not find matching booking item!');
                              }
                            }}
                            className="text-xs text-red-500 hover:text-red-600"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Show Combo Groups */}
          {comboGroups.length > 0 && (
            <div className="space-y-4 mb-4">
              {comboGroups.map((group) => (
                <ComboGroup
                  key={group.comboGroupId}
                  comboGroupId={group.comboGroupId}
                  comboName={group.comboName}
                  items={group.items.map(item => ({
                    type: "product" as const,
                    id: item.id,
                    name: item.product_name,
                    variant: item.variant_name,
                    variantId: item.variant_id,
                    variantData: item.variant_data,
                    imageUrl: item.image_url,
                    price: item.price,
                    quantity: item.quantity,
                  }))}
                  originalTotal={group.originalTotal}
                  discountedTotal={group.discountedTotal}
                  onRemove={removeComboItem}
                  onQuantityChange={updateComboQuantity}
                  isRemoving={isRemovingCombo === group.comboGroupId}
                  isUpdating={isUpdatingItem[group.comboGroupId] || false}
                />
              ))}
            </div>
          )}

          {/* Show Regular Products */}
          {regularItems.length > 0 && (
            <ProductList
              items={regularItems.map(item => ({
                type: "product" as const,
                id: item.id,
                name: item.product_name,
                variant: item.variant_name,
                variantId: item.variant_id,
                variantData: item.variant_data,
                imageUrl: item.image_url,
                price: item.price,
                quantity: item.quantity,
              }))}
              onQtyChange={onQtyChange}
              onRemove={onRemove}
            />
          )}

          {items.length === 0 && (
            <div className="rounded-xl border border-gray-200 bg-white p-8 text-center shadow-sm">
              <p className="text-gray-500">Your cart is empty</p>
              <Link href="/" className="mt-4 inline-block text-[#1976D2] hover:underline">
                Continue Shopping
              </Link>
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
              isProcessing={isProcessingOrder}
              error={orderError}
              onClearError={clearOrderError}
            />
          </div>
        </div>
      </div>

      {/* Success Modal */}
      {orderSuccess && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="bg-gradient-to-b from-gray-900 to-gray-950 rounded-xl p-8 max-w-md mx-4 border border-white/10 shadow-2xl animate-in fade-in zoom-in duration-300">
            <div className="text-center">
              <div className="w-16 h-16 bg-gradient-to-br from-green-500 to-green-600 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold mb-2 bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">
                Order Placed Successfully!
              </h2>
              <p className="text-gray-400 mb-4">
                Your order <span className="text-[var(--kb-primary-brand)] font-mono">#{paymentIntentId?.slice(-8)}</span> has been confirmed
              </p>
              <div className="text-sm text-gray-500 space-y-1">
                <p>Save your order number for tracking.</p>
                <p className="text-xs mt-2">Contact us at <span className="text-[var(--kb-primary-brand)]">+977 9801227448</span> for any queries.</p>
                <p className="text-xs mt-2 animate-pulse">Redirecting to order details...</p>
              </div>
              <div className="mt-6 pt-4 border-t border-white/10">
                <p className="text-xs text-gray-600">Total Amount</p>
                <p className="text-xl font-bold text-[var(--kb-accent-gold)]">
                  NPR {(orderTotal || costs.total).toLocaleString("en-NP")}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Change Appointment Modal */}
      {selectedBookingToChange && (
        <ChangeAppointmentModal
          booking={selectedBookingToChange}
          stylist={{
            ...mockStylist,
            id: selectedBookingToChange.stylist_id,
            displayName: selectedBookingToChange.stylist_name
          }}
          open={changeModalOpen}
          onClose={() => {
            setChangeModalOpen(false);
            setSelectedBookingToChange(null);
          }}
        />
      )}

      {/* Auth Modal (opened when checkout requires login) */}
      {authOpen && (
        <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
      )}
    </div>
  );
}
