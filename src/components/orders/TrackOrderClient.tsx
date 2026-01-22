'use client';

import { useState } from 'react';
import { Search, Package, Truck, CheckCircle, XCircle, Clock, MapPin, Phone, Mail } from 'lucide-react';
import { formatNPR } from '@/lib/utils';
import VendorContactCard from './VendorContactCard';

interface OrderDetails {
  order_number: string;
  status: string;
  created_at: string;
  confirmed_at: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  canceled_at: string | null;
  tracking_number: string | null;
  total_cents: number;
  shipping_name: string;
  shipping_phone: string;
  shipping_address_line1: string;
  shipping_address_line2: string | null;
  shipping_city: string;
  shipping_state: string;
  shipping_postal_code: string;
  items: Array<{
    product_name: string;
    variant_sku: string;
    quantity: number;
    unit_price_cents: number;
    total_price_cents: number;
    fulfillment_status: string;
    tracking_number?: string | null;
    shipping_carrier?: string | null;
    vendor?: {
      business_name: string;
      user: {
        email: string;
        phone: string | null;
      };
    };
  }>;
}

export default function TrackOrderClient() {
  const [orderNumber, setOrderNumber] = useState('');
  const [order, setOrder] = useState<OrderDetails | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!orderNumber.trim()) {
      setError('Please enter an order number');
      return;
    }

    setIsSearching(true);
    setError(null);
    setOrder(null);

    try {
      const response = await fetch(`/api/orders/track?order_number=${encodeURIComponent(orderNumber.trim())}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch order');
      }

      setOrder(data.order);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Order not found. Please check your order number and try again.');
    } finally {
      setIsSearching(false);
    }
  };

  const getStatusStep = (status: string): number => {
    const statusMap: Record<string, number> = {
      'pending': 1,
      'confirmed': 2,
      'shipped': 3,
      'delivered': 4,
      'canceled': -1,
    };
    return statusMap[status.toLowerCase()] || 0;
  };

  const getStatusColor = (status: string) => {
    const statusMap: Record<string, string> = {
      'pending': 'text-yellow-400',
      'confirmed': 'text-blue-400',
      'shipped': 'text-purple-400',
      'delivered': 'text-green-400',
      'canceled': 'text-red-400',
    };
    return statusMap[status.toLowerCase()] || 'text-foreground/60';
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return null;
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="space-y-8">
      {/* Search Form */}
      <div className="rounded-xl border border-white/10 bg-white/5 p-6">
        <form onSubmit={handleSearch} className="space-y-4">
          <div>
            <label htmlFor="orderNumber" className="block text-sm font-medium text-foreground/90 mb-2">
              Order Number
            </label>
            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                id="orderNumber"
                type="text"
                value={orderNumber}
                onChange={(e) => setOrderNumber(e.target.value)}
                placeholder="e.g., ORD-2025-001234"
                className="flex-1 rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-foreground placeholder:text-foreground/40 focus:outline-none focus:ring-2 focus:ring-[var(--kb-primary-brand)]"
                disabled={isSearching}
              />
              <button
                type="submit"
                disabled={isSearching}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-[var(--kb-primary-brand)] to-[color-mix(in_oklab,var(--kb-primary-brand)_70%,black)] px-6 py-3 font-semibold text-foreground ring-1 ring-white/10 hover:from-[var(--kb-primary-brand)] hover:to-[var(--kb-primary-brand)] disabled:opacity-50 disabled:cursor-not-allowed w-full sm:w-auto"
              >
                {isSearching ? (
                  <>
                    <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Searching...
                  </>
                ) : (
                  <>
                    <Search className="h-5 w-5" />
                    Track Order
                  </>
                )}
              </button>
            </div>
          </div>
          
          {error && (
            <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          )}
        </form>

        <div className="mt-4 pt-4 border-t border-white/10">
          <p className="text-sm text-foreground/60">
            <strong className="text-foreground/80">Tip:</strong> Your order number was sent to your email after purchase.
            It starts with "ORD-".
          </p>
        </div>
      </div>

      {/* Order Details */}
      {order && (
        <div className="space-y-6">
          {/* Status Timeline */}
          <div className="rounded-xl border border-white/10 bg-white/5 p-6">
            <h2 className="text-xl font-bold text-foreground mb-6">Order Status</h2>
            
            <div className="relative">
              {/* Timeline */}
              <div className="space-y-6">
                {/* Ordered */}
                <div className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <div className={`rounded-full p-2 ${getStatusStep(order.status) >= 1 ? 'bg-blue-500/20 text-blue-400' : 'bg-white/5 text-foreground/30'}`}>
                      <Package className="h-5 w-5" />
                    </div>
                    {getStatusStep(order.status) > 1 && <div className="flex-1 w-0.5 bg-blue-500/50 my-2 min-h-[24px]" />}
                  </div>
                  <div className="flex-1 pb-6">
                    <h3 className="font-semibold text-foreground">Order Placed</h3>
                    <p className="text-sm text-foreground/60 mt-1">{formatDate(order.created_at)}</p>
                    <p className="text-xs text-foreground/50 mt-1">Your order has been received</p>
                  </div>
                </div>

                {/* Confirmed */}
                {getStatusStep(order.status) >= 2 && (
                  <div className="flex gap-4">
                    <div className="flex flex-col items-center">
                      <div className={`rounded-full p-2 ${getStatusStep(order.status) >= 2 ? 'bg-green-500/20 text-green-400' : 'bg-white/5 text-foreground/30'}`}>
                        <CheckCircle className="h-5 w-5" />
                      </div>
                      {getStatusStep(order.status) > 2 && <div className="flex-1 w-0.5 bg-green-500/50 my-2 min-h-[24px]" />}
                    </div>
                    <div className="flex-1 pb-6">
                      <h3 className="font-semibold text-foreground">Order Confirmed</h3>
                      <p className="text-sm text-foreground/60 mt-1">{formatDate(order.confirmed_at)}</p>
                      <p className="text-xs text-foreground/50 mt-1">Payment verified, preparing for shipment</p>
                    </div>
                  </div>
                )}

                {/* Shipped */}
                {getStatusStep(order.status) >= 3 && (
                  <div className="flex gap-4">
                    <div className="flex flex-col items-center">
                      <div className={`rounded-full p-2 ${getStatusStep(order.status) >= 3 ? 'bg-purple-500/20 text-purple-400' : 'bg-white/5 text-foreground/30'}`}>
                        <Truck className="h-5 w-5" />
                      </div>
                      {getStatusStep(order.status) > 3 && <div className="flex-1 w-0.5 bg-purple-500/50 my-2 min-h-[24px]" />}
                    </div>
                    <div className="flex-1 pb-6">
                      <h3 className="font-semibold text-foreground">Shipped</h3>
                      <p className="text-sm text-foreground/60 mt-1">{formatDate(order.shipped_at)}</p>
                      {order.tracking_number && (
                        <p className="text-xs text-foreground/70 mt-1 font-mono bg-white/5 px-2 py-1 rounded inline-block">
                          Tracking: {order.tracking_number}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Delivered */}
                {getStatusStep(order.status) >= 4 && (
                  <div className="flex gap-4">
                    <div className="flex flex-col items-center">
                      <div className="rounded-full p-2 bg-green-500/20 text-green-400">
                        <CheckCircle className="h-5 w-5" />
                      </div>
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-foreground">Delivered</h3>
                      <p className="text-sm text-foreground/60 mt-1">{formatDate(order.delivered_at)}</p>
                      <p className="text-xs text-foreground/50 mt-1">Order successfully delivered</p>
                    </div>
                  </div>
                )}

                {/* Canceled */}
                {order.status.toLowerCase() === 'canceled' && (
                  <div className="flex gap-4">
                    <div className="flex flex-col items-center">
                      <div className="rounded-full p-2 bg-red-500/20 text-red-400">
                        <XCircle className="h-5 w-5" />
                      </div>
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-foreground">Order Canceled</h3>
                      <p className="text-sm text-foreground/60 mt-1">{formatDate(order.canceled_at)}</p>
                      <p className="text-xs text-foreground/50 mt-1">This order was canceled</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Current Status Badge */}
            <div className="mt-6 pt-6 border-t border-white/10">
              <div className="flex items-center justify-between">
                <span className="text-sm text-foreground/60">Current Status:</span>
                <span className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold ${getStatusColor(order.status)} bg-white/5 border border-white/10`}>
                  <Clock className="h-4 w-4" />
                  {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                </span>
              </div>
            </div>
          </div>

          {/* Shipping Details */}
          <div className="rounded-xl border border-white/10 bg-white/5 p-6">
            <h2 className="text-xl font-bold text-foreground mb-4 flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              Shipping Details
            </h2>
            <div className="space-y-2 text-foreground/80">
              <p className="font-semibold">{order.shipping_name}</p>
              <p className="text-sm">{order.shipping_address_line1}</p>
              {order.shipping_address_line2 && <p className="text-sm">{order.shipping_address_line2}</p>}
              <p className="text-sm">
                {order.shipping_city}, {order.shipping_state} {order.shipping_postal_code}
              </p>
              <p className="text-sm flex items-center gap-2 mt-3">
                <Phone className="h-4 w-4" />
                {order.shipping_phone}
              </p>
            </div>
          </div>

          {/* Order Items */}
          <div className="rounded-xl border border-white/10 bg-white/5 p-6">
            <h2 className="text-xl font-bold text-foreground mb-4">Order Items</h2>
            <div className="space-y-6">
              {order.items.map((item, index) => (
                <div key={index} className="pb-6 border-b border-white/10 last:border-0 last:pb-0">
                  {/* Item Details */}
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-medium text-foreground">{item.product_name}</p>
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                          item.fulfillment_status === 'delivered' ? 'bg-green-500/20 text-green-400' :
                          item.fulfillment_status === 'shipped' ? 'bg-purple-500/20 text-purple-400' :
                          item.fulfillment_status === 'processing' ? 'bg-blue-500/20 text-blue-400' :
                          'bg-yellow-500/20 text-yellow-400'
                        }`}>
                          {item.fulfillment_status}
                        </span>
                      </div>
                      <p className="text-sm text-foreground/60">SKU: {item.variant_sku}</p>
                      <p className="text-sm text-foreground/60">Quantity: {item.quantity}</p>
                      <p className="text-sm text-foreground/60">Unit Price: {formatNPR(item.unit_price_cents / 100)}</p>
                      {item.tracking_number && (
                        <p className="text-xs text-foreground/70 mt-1 font-mono bg-white/5 px-2 py-1 rounded inline-block">
                          Tracking: {item.tracking_number}
                          {item.shipping_carrier && ` (${item.shipping_carrier})`}
                        </p>
                      )}
                    </div>
                    <p className="font-semibold text-foreground">{formatNPR(item.total_price_cents / 100)}</p>
                  </div>
                  
                  {/* Vendor Contact Card */}
                  {item.vendor && <VendorContactCard vendor={item.vendor} />}
                </div>
              ))}
            </div>
            <div className="mt-4 pt-4 border-t border-white/10 flex justify-between items-center">
              <span className="text-lg font-bold text-foreground">Total</span>
              <span className="text-2xl font-bold text-foreground">{formatNPR(order.total_cents / 100)}</span>
            </div>
          </div>

          {/* Platform Support Section */}
          <div className="rounded-xl border border-white/10 bg-white/5 p-6">
            <h3 className="text-lg font-semibold text-foreground mb-3">KB Stylish Platform Support</h3>
            <p className="text-sm text-foreground/70 mb-4">
              For issues with payment, refunds, account access, or general platform inquiries:
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <a
                href="mailto:kbstylish2019@gmail.com"
                className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-foreground/80 hover:bg-white/10 transition"
              >
                <Mail className="h-4 w-4" />
                Email Platform Support
              </a>
              <a
                href="tel:+9779801227448"
                className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-foreground/80 hover:bg-white/10 transition"
              >
                <Phone className="h-4 w-4" />
                Call Platform Support
              </a>
            </div>
            <p className="text-xs text-foreground/50 mt-3">
              💡 Tip: For questions about specific items, use the vendor contact above each product.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
