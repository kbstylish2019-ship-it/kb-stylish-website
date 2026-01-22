'use client';

import { Suspense, useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

function TrackOrderContent() {
  const searchParams = useSearchParams();
  const orderNumberParam = searchParams.get('order_number');
  const [orderNumber, setOrderNumber] = useState(orderNumberParam || '');
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleTrack = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!orderNumber.trim()) return;

    setLoading(true);
    setError(null);
    setStatus(null);

    try {
      const response = await fetch(`/api/orders/track?order_number=${orderNumber.trim()}`);
      const data = await response.json();

      if (data.success) {
        setStatus(data.order);
      } else {
        setError(data.error || 'Order not found. Please check the order number.');
      }
    } catch (err) {
      setError('Failed to track order. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (orderNumberParam) {
      handleTrack();
    }
  }, [orderNumberParam]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="text-center mb-10">
        <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl mb-4">
          Track Your Order
        </h1>
        <p className="text-lg text-gray-400">
          Enter your order number to check its current status
        </p>
      </div>

      <div className="bg-white/5 border border-white/10 rounded-2xl p-6 sm:p-8 shadow-xl">
        <form onSubmit={handleTrack} className="flex flex-col sm:flex-row gap-3 mb-8">
          <div className="flex-1 relative">
            <input
              type="text"
              placeholder="e.g. ORD-20251018-12345"
              value={orderNumber}
              onChange={(e) => setOrderNumber(e.target.value)}
              className="w-full pl-4 pr-4 py-3 bg-gray-800 border border-gray-600 rounded-xl text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[var(--kb-primary-brand)] transition-all"
              required
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="px-8 py-3 bg-[var(--kb-primary-brand)] hover:bg-[var(--kb-primary-brand)]/80 text-white rounded-xl font-bold transition-all disabled:opacity-50 flex items-center justify-center min-w-[140px]"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
            ) : (
              'Track Order'
            )}
          </button>
        </form>

        {error && (
          <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm mb-6">
            <p className="flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {error}
            </p>
          </div>
        )}

        {status && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center justify-between p-4 bg-gray-800 rounded-xl border border-gray-600">
              <div>
                <p className="text-xs text-gray-400 mb-1 uppercase tracking-wider">Current Status</p>
                <p className="text-lg font-bold text-white capitalize">{status.status}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-400 mb-1 uppercase tracking-wider">Order Date</p>
                <p className="text-white font-medium">{new Date(status.created_at).toLocaleDateString()}</p>
              </div>
            </div>

            <div className="relative pt-4 px-2">
              <div className="absolute left-6 top-8 bottom-8 w-0.5 bg-white/10"></div>

              <div className="space-y-8">
                {[
                  { label: 'Order Placed', date: status.created_at, completed: true },
                  { label: 'Confirmed', date: status.confirmed_at, completed: !!status.confirmed_at },
                  { label: 'Shipped', date: status.shipped_at, completed: !!status.shipped_at },
                  { label: 'Delivered', date: status.delivered_at, completed: !!status.delivered_at }
                ].map((step, i) => (
                  <div key={i} className="relative flex items-start gap-6">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center z-10 ${step.completed
                        ? 'bg-gradient-to-br from-green-500 to-green-600 shadow-lg shadow-green-500/20'
                        : 'bg-white/5 border border-white/10'
                      }`}>
                      {step.completed ? (
                        <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        <div className="w-1.5 h-1.5 bg-white/20 rounded-full"></div>
                      )}
                    </div>
                    <div>
                      <p className={`font-semibold ${step.completed ? 'text-white' : 'text-gray-500'}`}>
                        {step.label}
                      </p>
                      {step.date ? (
                        <p className="text-xs text-gray-500">
                          {new Date(step.date).toLocaleString()}
                        </p>
                      ) : (
                        <p className="text-xs text-gray-600">Pending</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {status.tracking_number && (
              <div className="p-4 bg-[var(--kb-primary-brand)]/10 border border-[var(--kb-primary-brand)]/20 rounded-xl">
                <p className="text-sm text-[var(--kb-primary-brand)] font-semibold mb-1">Tracking Information</p>
                <p className="text-white font-mono">{status.tracking_number}</p>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="mt-12 text-center text-sm text-gray-500">
        <p>Copyright © 2025 KB-Stylish. All rights reserved.</p>
        <div className="flex justify-center gap-4 mt-2">
          <Link href="/support" className="hover:text-white transition-colors">Support</Link>
          <Link href="/shop" className="hover:text-white transition-colors">Shop</Link>
          <Link href="/legal/terms" className="hover:text-white transition-colors">Terms</Link>
        </div>
      </div>
    </div>
  );
}

export default function TrackOrderPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-black">
      <Suspense fallback={
        <div className="min-h-screen flex items-center justify-center">
          <div className="w-12 h-12 border-4 border-white/10 border-t-[var(--kb-primary-brand)] rounded-full animate-spin"></div>
        </div>
      }>
        <TrackOrderContent />
      </Suspense>
    </div>
  );
}
