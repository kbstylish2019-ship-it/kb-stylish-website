'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { cartAPI } from '@/lib/api/cartClient';
import { useDecoupledCartStore } from '@/lib/store/decoupledCartStore';

function PaymentCallbackContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState<'loading' | 'finalizing' | 'success' | 'error'>('loading');
  const [error, setError] = useState<string>('');
  const [paymentIntentId, setPaymentIntentId] = useState<string>('');
  const [amountCents, setAmountCents] = useState<number>(0);
  const [orderNumber, setOrderNumber] = useState<string>('');
  const { syncWithServer } = useDecoupledCartStore();

  useEffect(() => {
    verifyPayment();
  }, []);

  async function pollForOrderCompletion(paymentIntentId: string) {
    console.log('[PaymentCallback] Polling for order completion...');
    
    const maxAttempts = 60; // Poll for up to 120 seconds (60 x 2s) - cron runs every 2 mins
    let attempts = 0;
    
    while (attempts < maxAttempts) {
      attempts++;
      
      try {
        // Check if order exists using Supabase client directly
        const response = await fetch(`/api/orders/check-status?payment_intent_id=${paymentIntentId}`);
        const data = await response.json();
        
        if (data.exists && data.order_number) {
          console.log('[PaymentCallback] Order created:', data.order_number);
          setOrderNumber(data.order_number);
          
          // CRITICAL: Sync cart with server (cart should be cleared now)
          console.log('[PaymentCallback] Syncing cart with server...');
          await syncWithServer();
          
          // CRITICAL FIX: Force synchronous localStorage clear
          // Zustand persist is async and may not flush before navigation
          console.log('[PaymentCallback] Force clearing booking localStorage...');
          try {
            localStorage.removeItem('kb-stylish-bookings');
            console.log('[PaymentCallback] Booking localStorage cleared successfully');
          } catch (error) {
            console.error('[PaymentCallback] Failed to clear booking localStorage:', error);
          }
          
          // Show success
          setStatus('success');
          
          // Redirect after 3 seconds
          setTimeout(() => {
            router.push(`/order-confirmation?payment_intent_id=${paymentIntentId}`);
          }, 3000);
          
          return; // Success!
        }
        
        // Order not ready yet, wait 2 seconds and try again
        console.log(`[PaymentCallback] Order not ready yet (attempt ${attempts}/${maxAttempts}), waiting...`);
        await new Promise(resolve => setTimeout(resolve, 2000));
        
      } catch (error) {
        console.error('[PaymentCallback] Error checking order status:', error);
        // Continue polling even on errors
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    // Timeout after 60 seconds
    console.error('[PaymentCallback] Order creation timeout');
    setStatus('error');
    setError('Order is taking longer than expected. Please check your order history.');
  }

  async function verifyPayment() {
    let provider = searchParams.get('provider'); // 'esewa', 'khalti', or 'npx'
    let transactionUuid = searchParams.get('transaction_uuid'); // eSewa
    const transactionCode = searchParams.get('transaction_code'); // eSewa
    const pidx = searchParams.get('pidx'); // Khalti
    const purchaseOrderId = searchParams.get('purchase_order_id'); // Khalti
    const purchaseOrderName = searchParams.get('purchase_order_name'); // Khalti
    const transactionId = searchParams.get('transaction_id'); // Khalti
    let merchantTxnId = searchParams.get('MerchantTxnId'); // NPX
    let gatewayTxnId = searchParams.get('GatewayTxnId'); // NPX
    let data = searchParams.get('data'); // eSewa v2 callback data (base64 JSON)

    console.log('[PaymentCallback] Raw received params:', {
      provider,
      transactionUuid,
      transactionCode,
      data: data ? '(base64 data received)' : null,
      pidx,
      purchaseOrderId,
      purchaseOrderName,
      transactionId,
      merchantTxnId, // NPX
      gatewayTxnId // NPX
    });

    // Handle malformed provider parameter (e.g., 'esewa?data=...')
    // This happens when eSewa appends ?data=... to the callback URL
    if (provider && provider.includes('?data=')) {
      const parts = provider.split('?data=');
      provider = parts[0]; // Extract clean provider name
      data = parts[1]; // Extract base64 data
      console.log('[PaymentCallback] Extracted from malformed provider:', { provider, dataLength: data?.length });
    }

    // Handle malformed NPX provider parameter (e.g., 'npx?MerchantTxnId=...')
    // This happens when NPX appends ?MerchantTxnId=... to a URL that already has query params
    if (provider && provider.includes('?')) {
      const parts = provider.split('?');
      provider = parts[0]; // Extract clean provider name (e.g., 'npx')
      
      // Parse the malformed query string from provider parameter
      const malformedQuery = parts[1];
      const malformedParams = new URLSearchParams(malformedQuery);
      
      // Extract NPX parameters if not already present
      if (!merchantTxnId && malformedParams.has('MerchantTxnId')) {
        merchantTxnId = malformedParams.get('MerchantTxnId');
      }
      if (!gatewayTxnId && malformedParams.has('GatewayTxnId')) {
        gatewayTxnId = malformedParams.get('GatewayTxnId');
      }
      
      console.log('[PaymentCallback] Extracted from malformed NPX provider:', { 
        provider, 
        merchantTxnId, 
        gatewayTxnId 
      });
    }

    // TEMPORARY: Handle case where NPX was configured with eSewa callback URLs by mistake
    // If provider is 'esewa' but we have NPX transaction IDs, correct the provider
    if (provider === 'esewa' && merchantTxnId && gatewayTxnId && !transactionUuid) {
      console.log('[PaymentCallback] NPX transaction detected with esewa provider - correcting to npx');
      provider = 'npx';
    }

    // Handle eSewa v2 callback format where data is base64-encoded JSON
    if (data && !transactionUuid) {
      try {
        // Decode base64 JSON from eSewa
        const decodedData = JSON.parse(atob(data));
        console.log('[PaymentCallback] Decoded eSewa data:', decodedData);
        
        // Extract transaction_uuid from decoded data
        transactionUuid = decodedData.transaction_uuid || decodedData.transaction_code;
        
        if (!transactionUuid) {
          console.error('[PaymentCallback] No transaction_uuid in decoded data:', decodedData);
          setStatus('error');
          setError('Missing transaction identifier in eSewa response');
          return;
        }
      } catch (e) {
        console.error('[PaymentCallback] Failed to decode eSewa data:', e);
        setStatus('error');
        setError('Invalid payment data format from eSewa');
        return;
      }
    }

    // Validate provider
    if (!provider || (provider !== 'esewa' && provider !== 'khalti' && provider !== 'npx')) {
      setStatus('error');
      setError(`Invalid payment provider: ${provider}`);
      return;
    }

    // Validate transaction identifiers
    if (provider === 'esewa' && !transactionUuid) {
      setStatus('error');
      setError('Missing transaction details from eSewa');
      return;
    }

    if (provider === 'khalti' && !pidx) {
      setStatus('error');
      setError('Missing transaction details from Khalti');
      return;
    }

    if (provider === 'npx' && !merchantTxnId) {
      setStatus('error');
      setError('Missing transaction details from NPX');
      return;
    }

    try {
      // Call verify-payment Edge Function
      const verifyRequest = {
        provider: provider as 'esewa' | 'khalti' | 'npx',
        transaction_uuid: transactionUuid || undefined,
        pidx: pidx || undefined,
        merchant_txn_id: merchantTxnId || undefined, // NPX
        gateway_txn_id: gatewayTxnId || undefined, // NPX
      };
      console.log('[PaymentCallback] Verifying payment with backend...');
      console.log('[PaymentCallback] Verify request payload:', JSON.stringify(verifyRequest, null, 2));
      const response = await cartAPI.verifyPayment(verifyRequest);

      console.log('[PaymentCallback] Verification response:', response);

      // Log detailed error if verification failed
      if (!response.success) {
        console.error('[PaymentCallback] Verification failed with error:', response.error);
        console.error('[PaymentCallback] Full response:', JSON.stringify(response, null, 2));
      }

      if (response.success) {
        // Payment verified! Now wait for order to be created
        setStatus('finalizing');
        setPaymentIntentId(response.payment_intent_id || '');
        setAmountCents(response.amount_cents || 0);
        
        // CRITICAL: Trigger worker immediately (don't wait for cron)
        console.log('[PaymentCallback] Triggering worker immediately...');
        try {
          await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/order-worker`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
              'Content-Type': 'application/json'
            }
          });
        } catch (err) {
          console.warn('[PaymentCallback] Failed to trigger worker, will rely on polling:', err);
        }
        
        // Poll for order completion (worker creates order asynchronously)
        await pollForOrderCompletion(response.payment_intent_id!);
      } else {
        setStatus('error');
        setError(response.error || 'Payment verification failed');
      }
    } catch (err) {
      console.error('[PaymentCallback] Verification error:', err);
      setStatus('error');
      setError('Network error during verification. Please contact support.');
    }
  }

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-gray-900 to-black">
        <div className="text-center">
          <div className="relative">
            {/* Animated spinner */}
            <div className="w-24 h-24 border-4 border-white/10 border-t-[var(--kb-primary-brand)] rounded-full animate-spin mx-auto"></div>
            {/* Inner pulsing circle */}
            <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-16 h-16 bg-[var(--kb-primary-brand)]/20 rounded-full animate-pulse"></div>
          </div>
          <h1 className="mt-8 text-2xl font-bold text-white">Verifying Your Payment</h1>
          <p className="mt-3 text-gray-400 max-w-md">
            Please wait while we confirm your transaction with the payment gateway...
          </p>
          <p className="mt-2 text-sm text-gray-500">
            This usually takes just a few seconds
          </p>
        </div>
      </div>
    );
  }

  if (status === 'finalizing') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-gray-900 to-black">
        <div className="text-center">
          <div className="relative">
            {/* Animated spinner */}
            <div className="w-24 h-24 border-4 border-white/10 border-t-[var(--kb-primary-brand)] rounded-full animate-spin mx-auto"></div>
            {/* Inner pulsing circle */}
            <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-16 h-16 bg-green-500/20 rounded-full animate-pulse"></div>
          </div>
          <h1 className="mt-8 text-2xl font-bold text-white">Finalizing Your Order</h1>
          <p className="mt-3 text-gray-400 max-w-md">
            Payment confirmed! Creating your order...
          </p>
          <p className="mt-2 text-sm text-gray-500">
            This will just take a moment
          </p>
        </div>
      </div>
    );
  }

  if (status === 'success') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-gray-900 to-black px-4">
        <div className="text-center max-w-lg">
          {/* Success checkmark animation */}
          <div className="relative mx-auto w-24 h-24 mb-6">
            <div className="absolute inset-0 bg-gradient-to-br from-green-500 to-green-600 rounded-full animate-in zoom-in duration-500"></div>
            <svg 
              className="absolute inset-0 w-24 h-24 text-white animate-in zoom-in duration-700 delay-200" 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          </div>

          <h1 className="text-3xl font-bold bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent mb-3">
            Payment Successful!
          </h1>
          
          <div className="mb-6 p-4 bg-white/5 border border-white/10 rounded-lg">
            <p className="text-sm text-gray-400 mb-1">Order Number</p>
            <p className="text-[var(--kb-primary-brand)] font-mono text-lg font-semibold">
              {orderNumber || `#${paymentIntentId.slice(-12).toUpperCase()}`}
            </p>
          </div>

          <div className="mb-6">
            <p className="text-sm text-gray-400 mb-1">Amount Paid</p>
            <p className="text-3xl font-bold text-[var(--kb-accent-gold)]">
              NPR {(amountCents / 100).toLocaleString('en-NP', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>

          <div className="space-y-3 text-gray-300">
            <div className="flex items-center justify-center gap-2">
              <svg className="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/>
              </svg>
              <span className="text-sm">Payment verified with gateway</span>
            </div>
            <div className="flex items-center justify-center gap-2">
              <svg className="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/>
              </svg>
              <span className="text-sm">Order confirmed and processing</span>
            </div>
            <div className="flex items-center justify-center gap-2">
              <svg className="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/>
              </svg>
              <span className="text-sm">Confirmation email will be sent shortly</span>
            </div>
          </div>

          <div className="mt-8 p-4 bg-blue-900/20 border border-blue-500/30 rounded-lg">
            <p className="text-sm text-blue-200 animate-pulse">
              Redirecting to order details...
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Error state
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-gray-900 to-black px-4">
      <div className="text-center max-w-lg">
        {/* Error icon */}
        <div className="relative mx-auto w-24 h-24 mb-6">
          <div className="absolute inset-0 bg-gradient-to-br from-red-500 to-red-600 rounded-full"></div>
          <svg 
            className="absolute inset-0 w-24 h-24 text-white p-5" 
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>

        <h1 className="text-3xl font-bold text-white mb-3">
          Payment Verification Failed
        </h1>
        
        <div className="mb-6 p-4 bg-red-900/20 border border-red-500/30 rounded-lg">
          <p className="text-red-200 text-sm">
            {error}
          </p>
        </div>

        <div className="space-y-3 text-gray-400 text-sm mb-8">
          <p>Your payment may still be processing. Please check:</p>
          <ul className="list-disc list-inside text-left max-w-md mx-auto space-y-1">
            <li>Your payment gateway account for transaction status</li>
            <li>Your email for confirmation messages</li>
            <li>Your order history on our website</li>
          </ul>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={() => router.push('/checkout')}
            className="px-6 py-3 bg-white/10 hover:bg-white/20 text-white rounded-lg font-medium transition-colors"
          >
            Return to Checkout
          </button>
          <button
            onClick={() => router.push('/')}
            className="px-6 py-3 bg-[var(--kb-primary-brand)] hover:bg-[var(--kb-primary-brand)]/80 text-white rounded-lg font-medium transition-colors"
          >
            Go to Home
          </button>
        </div>

        <p className="mt-8 text-xs text-gray-500">
          If you believe this is an error, please contact our support team with your transaction details.
        </p>
      </div>
    </div>
  );
}

export default function PaymentCallbackPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-gray-900 to-black">
        <div className="text-center">
          <div className="w-24 h-24 border-4 border-white/10 border-t-[var(--kb-primary-brand)] rounded-full animate-spin mx-auto"></div>
          <p className="mt-4 text-gray-400">Loading...</p>
        </div>
      </div>
    }>
      <PaymentCallbackContent />
    </Suspense>
  );
}
