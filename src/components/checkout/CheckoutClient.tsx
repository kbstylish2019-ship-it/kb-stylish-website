"use client";
import React, { useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import type { Address, CartProductItem, OrderCosts, PaymentMethod, CartBookingItem as CheckoutBookingItem } from "@/lib/types";
import type { CartBookingItem as StoreCartBookingItem } from "@/lib/store/decoupledCartStore";
import BookingDetails from "@/components/checkout/BookingDetails";
import ProductList from "@/components/checkout/ProductList";
import ShippingForm from "@/components/checkout/ShippingForm";
import OrderSummary from "@/components/checkout/OrderSummary";
import ChangeAppointmentModal from "@/components/booking/ChangeAppointmentModal";
import type { StylistWithServices } from "@/lib/apiClient";
import useDecoupledCartStore from "@/lib/store/decoupledCartStore";
import { cartAPI } from "@/lib/api/cartClient";
import {
  getEmptyAddress,
  validateAddress,
  calculateCosts,
} from "@/lib/mock/checkout";

export default function CheckoutClient() {
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
  const clearCart = useDecoupledCartStore((state) => state.clearCart);
  const grandTotal = useDecoupledCartStore((state) => state.grandTotal);
  
  // Combine items for display (temporarily for compatibility)
  const items = [...productItems, ...bookingItems];
  
  // Debug logging to identify items
  React.useEffect(() => {
    console.log('[CheckoutClient] Product items:', productItems);
    console.log('[CheckoutClient] Booking items:', bookingItems);
    console.log('[CheckoutClient] Combined items:', items);
  }, [productItems, bookingItems]);
  
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
      // Transform from CartProductItem to display format
      return {
        type: "product",
        id: item.id,
        name: item.product_name || 'Product',
        variant: item.variant_name,
        variantId: item.variant_id,
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
    return discountCode.trim().toUpperCase() === "WELCOME100" ? 100 : 0;
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

  const onRemove = (id: string, variant?: string) => {
    // Check if it's a product or booking and remove accordingly
    const isBooking = bookingItems.some(b => b.id === id);
    if (isBooking) {
      const booking = bookingItems.find(b => b.id === id);
      if (booking) {
        removeBookingItem(booking.reservation_id);
      }
    } else {
      removeProductItem(id);
    }
  };

  const canPlaceOrder = validateAddress(address) && Boolean(payment);

  /**
   * Mock payment simulation for MVP
   * In production, this would integrate with Stripe/eSewa SDK
   */
  const simulatePaymentProcessing = async (): Promise<void> => {
    // Simulate payment gateway processing time
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // In production, this would:
    // 1. Initialize Stripe/eSewa SDK
    // 2. Confirm payment with client_secret
    // 3. Handle 3D Secure if required
    // 4. Return success/failure
  };

  /**
   * Production-ready order placement with complete error handling
   */
  const onPlaceOrder = async () => {
    if (!canPlaceOrder || isProcessingOrder) return;
    
    setIsProcessingOrder(true);
    setOrderError(null);
    
    try {
      // Step 1: Create order intent with backend
      console.log('[CheckoutClient] Creating order intent with address:', address);
      const response = await cartAPI.createOrderIntent({
        name: address.fullName,
        phone: address.phone,
        address_line1: address.area,
        address_line2: address.line2 || undefined,
        city: address.city,
        state: address.region,
        postal_code: '44600', // Default postal code for MVP
        country: 'NP'
      });
      
      console.log('[CheckoutClient] Order intent response:', response);
      
      if (!response.success) {
        // Handle specific error cases
        if (response.details?.some((d: string) => d.includes('Insufficient'))) {
          setOrderError('Some items in your cart are no longer available. Please review your cart.');
        } else if (response.error?.includes('Cart is empty')) {
          setOrderError('Your cart is empty. Please add items to continue.');
        } else if (response.error?.includes('Authentication required') || response.error?.includes('Invalid authentication token')) {
          setOrderError('Please sign in to place an order.');
          setAuthOpen(true); // Open login modal for guests
        } else {
          setOrderError(response.error || 'Failed to process order. Please try again.');
        }
        setIsProcessingOrder(false);
        return;
      }
      
      // Step 2: Store payment intent for confirmation
      setPaymentIntentId(response.payment_intent_id!);
      console.log('[CheckoutClient] Payment intent created:', response.payment_intent_id);
      
      // Step 3: Store the current total BEFORE clearing cart
      setOrderTotal(costs.total);
      
      // Step 4: Mock payment confirmation (in production, integrate Stripe/eSewa SDK)
      await simulatePaymentProcessing();
      
      // Step 5: Show success modal FIRST, then clear cart
      setOrderSuccess(true);
      
      // Step 6: Clear cart after a short delay to allow modal to show with correct total
      setTimeout(async () => {
        await clearCart();
      }, 500);
      
      // Step 7: Redirect to order confirmation page after delay
      setTimeout(() => {
        // Close the modal and reset state
        setOrderSuccess(false);
        setPaymentIntentId(null);
        setOrderTotal(0);
        
        // In production, redirect to confirmation page
        console.log('[CheckoutClient] Order complete! Would redirect to:', `/order-confirmation/${response.payment_intent_id}`);
        // window.location.href = `/order-confirmation/${response.payment_intent_id}`;
        
        // For now, redirect to home page
        window.location.href = '/';
      }, 5000); // Give user 5 seconds to see the success message
      
    } catch (error) {
      console.error('[CheckoutClient] Order processing error:', error);
      setOrderError('An unexpected error occurred. Please try again.');
    } finally {
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
            <div className="rounded-xl border border-white/10 bg-white/5 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-white">
                  Your Appointment{bookings.length > 1 ? 's' : ''}
                </h2>
              </div>
              <div className="space-y-4">
                {bookings.map((bookingWrapper, index) => {
                  const booking = bookingWrapper.booking;
                  const startDate = new Date(booking.date);
                  return (
                    <div key={booking.id} className="flex items-start gap-4 p-4 bg-white/5 rounded-lg">
                      <div className="flex-shrink-0">
                        <div className="w-10 h-10 bg-[var(--kb-primary-brand)] rounded-lg flex items-center justify-center">
                          <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 2C5.58 2 2 5.58 2 10s3.58 8 8 8 8-3.58 8-8-3.58-8-8-8zm3.5 6L10 10.5 6.5 8 8 6.5 10 8.5 12 6.5 13.5 8z" clipRule="evenodd"/>
                          </svg>
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-white">{booking.service}</h3>
                        <p className="text-sm text-foreground/70 mt-1">with {booking.stylist}</p>
                        <div className="flex items-center gap-4 mt-2 text-sm text-foreground/60">
                          <div className="flex items-center gap-1">
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd"/>
                            </svg>
                            {startDate.toLocaleDateString('en-US', { 
                              weekday: 'short', 
                              month: 'short', 
                              day: 'numeric' 
                            })}
                          </div>
                          <div className="flex items-center gap-1">
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd"/>
                            </svg>
                            {booking.time} • {booking.durationMins} mins
                          </div>
                        </div>
                      </div>
                      <div className="flex-shrink-0 text-right">
                        <p className="font-semibold text-white">NPR {booking.price.toFixed(0)}</p>
                        <div className="flex gap-2 mt-1">
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
                            className="text-xs text-[var(--kb-primary-brand)] hover:underline"
                          >
                            Change
                          </button>
                          <button
                            onClick={() => onRemove(booking.id)}
                            className="text-xs text-red-400 hover:text-red-300"
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
          
          {/* Show Products */}
          {products.length > 0 && (
            <ProductList items={products} onQtyChange={onQtyChange} onRemove={onRemove} />
          )}
          {items.length === 0 && (
            <div className="rounded-xl border border-white/10 bg-white/5 p-8 text-center">
              <p className="text-foreground/60">Your cart is empty</p>
              <Link href="/" className="mt-4 inline-block text-[var(--kb-primary-brand)] hover:underline">
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
                <p>You will receive a confirmation email shortly.</p>
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
