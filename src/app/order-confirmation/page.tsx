'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';

function OrderConfirmationContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const paymentIntentId = searchParams.get('payment_intent_id');

  if (!paymentIntentId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-gray-900 to-black px-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white mb-4">Order Not Found</h1>
          <p className="text-gray-400 mb-6">We couldn't find your order details.</p>
          <Link 
            href="/" 
            className="px-6 py-3 bg-[var(--kb-primary-brand)] hover:bg-[var(--kb-primary-brand)]/80 text-white rounded-lg font-medium transition-colors inline-block"
          >
            Return to Home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-black">
      <div className="max-w-3xl mx-auto px-4 py-12">
        {/* Success Header */}
        <div className="text-center mb-12">
          <div className="w-20 h-20 bg-gradient-to-br from-green-500 to-green-600 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg">
            <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent mb-3">
            Order Confirmed!
          </h1>
          <p className="text-gray-400 text-lg">
            Thank you for your purchase
          </p>
        </div>

        {/* Order Details Card */}
        <div className="bg-white/5 border border-white/10 rounded-xl p-8 mb-6">
          <div className="flex items-center justify-between mb-6 pb-6 border-b border-white/10">
            <div>
              <p className="text-sm text-gray-400 mb-1">Order Number</p>
              <p className="text-xl font-mono font-bold text-[var(--kb-primary-brand)]">
                #{paymentIntentId.slice(-12).toUpperCase()}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-400 mb-1">Order Date</p>
              <p className="text-white font-medium">
                {new Date().toLocaleDateString('en-US', {
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric'
                })}
              </p>
            </div>
          </div>

          {/* Status Timeline */}
          <div className="space-y-4 mb-8">
            <h3 className="text-lg font-semibold text-white mb-4">Order Status</h3>
            <div className="relative">
              {/* Timeline line */}
              <div className="absolute left-4 top-8 bottom-8 w-0.5 bg-white/10"></div>

              {/* Status items */}
              {[
                { label: 'Payment Confirmed', completed: true, time: 'Just now' },
                { label: 'Order Processing', completed: true, time: 'In progress' },
                { label: 'Ready for Pickup/Delivery', completed: false, time: 'Pending' },
                { label: 'Completed', completed: false, time: 'Pending' },
              ].map((status, index) => (
                <div key={index} className="relative flex items-start gap-4 mb-4 last:mb-0">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center z-10 ${
                    status.completed 
                      ? 'bg-gradient-to-br from-green-500 to-green-600' 
                      : 'bg-white/10 border-2 border-white/20'
                  }`}>
                    {status.completed && (
                      <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                  <div className="flex-1 pt-1">
                    <p className={`font-medium ${status.completed ? 'text-white' : 'text-gray-500'}`}>
                      {status.label}
                    </p>
                    <p className="text-sm text-gray-500">{status.time}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Important Information */}
          <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-4">
            <div className="flex gap-3">
              <svg className="w-5 h-5 text-blue-400 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <p className="text-blue-200 font-medium mb-1">What's Next?</p>
                <ul className="text-sm text-blue-200/80 space-y-1">
                  <li>• You'll receive a confirmation email shortly</li>
                  <li>• We'll notify you when your order is ready</li>
                  <li>• Track your order status in your account</li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            href="/"
            className="px-8 py-3 bg-[var(--kb-primary-brand)] hover:bg-[var(--kb-primary-brand)]/80 text-white rounded-lg font-medium transition-colors text-center"
          >
            Continue Shopping
          </Link>
          <Link
            href="/shop"
            className="px-8 py-3 bg-white/10 hover:bg-white/20 text-white rounded-lg font-medium transition-colors text-center"
          >
            Browse Products
          </Link>
        </div>

        {/* Support Info */}
        <div className="mt-12 text-center">
          <p className="text-sm text-gray-400 mb-2">
            Need help with your order?
          </p>
          <Link 
            href="/support" 
            className="text-[var(--kb-primary-brand)] hover:underline text-sm font-medium"
          >
            Contact Support
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function OrderConfirmationPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-gray-900 to-black">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-white/10 border-t-[var(--kb-primary-brand)] rounded-full animate-spin mx-auto"></div>
          <p className="mt-4 text-gray-400">Loading order details...</p>
        </div>
      </div>
    }>
      <OrderConfirmationContent />
    </Suspense>
  );
}
