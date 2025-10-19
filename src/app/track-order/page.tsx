import { Suspense } from 'react';
import TrackOrderClient from '@/components/orders/TrackOrderClient';

export const metadata = {
  title: 'Track Your Order | KB Stylish',
  description: 'Track your order status and get real-time delivery updates',
};

export default function TrackOrderPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-white/10 bg-background/80 backdrop-blur">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <div className="py-8">
            <h1 className="text-3xl font-bold text-foreground">Track Your Order</h1>
            <p className="mt-2 text-foreground/70">
              Enter your order number to see the latest status and delivery updates
            </p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-8">
        <Suspense fallback={<div className="text-center py-12">Loading...</div>}>
          <TrackOrderClient />
        </Suspense>
      </div>
    </div>
  );
}
