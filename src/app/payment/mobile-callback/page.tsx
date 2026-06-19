'use client';

import { Suspense, useEffect, useState } from 'react';

/**
 * MOBILE PAYMENT BRIDGE
 *
 * Payment gateways (NPX / eSewa / Khalti) can only redirect to an https URL, not to a
 * custom app scheme. The mobile app therefore asks `create-order-intent` to set the
 * gateway return URL to THIS page (only when metadata.source === 'mobile_app').
 *
 * This page is a pure pass-through: it forwards every query parameter it received from
 * the gateway to the app's deep link `kbstylish://payment/callback?...`. The app's
 * in-app browser (WebBrowser.openAuthSessionAsync) detects that scheme, closes, and the
 * app then verifies the payment server-side via the verify-payment edge function.
 *
 * No verification happens here — this page never decides whether a payment succeeded.
 */
const APP_SCHEME = 'kbstylish';

function MobileCallbackBridge() {
  const [deepLink, setDeepLink] = useState<string>('');

  useEffect(() => {
    // Forward the full query string (provider, pidx, transaction_uuid, data,
    // MerchantTxnId, GatewayTxnId, status, ...) unchanged to the app.
    const search = typeof window !== 'undefined' ? window.location.search : '';
    const target = `${APP_SCHEME}://payment/callback${search}`;
    setDeepLink(target);
    // Attempt the redirect immediately.
    window.location.href = target;
  }, []);

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        padding: 24,
        textAlign: 'center',
        fontFamily: 'system-ui, sans-serif',
        background: '#0b1220',
        color: '#fff',
      }}
    >
      <div
        style={{
          width: 56,
          height: 56,
          border: '4px solid rgba(255,255,255,0.15)',
          borderTopColor: '#1976D2',
          borderRadius: '50%',
          animation: 'kbspin 1s linear infinite',
        }}
      />
      <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Returning to KB Stylish…</h1>
      <p style={{ fontSize: 14, opacity: 0.7, margin: 0, maxWidth: 320 }}>
        We&apos;re taking you back to the app to confirm your order.
      </p>
      {deepLink ? (
        <a href={deepLink} style={{ color: '#5aa9ff', fontSize: 14, marginTop: 8 }}>
          Tap here if the app doesn&apos;t open automatically
        </a>
      ) : null}
      <style>{`@keyframes kbspin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

export default function MobileCallbackPage() {
  return (
    <Suspense fallback={null}>
      <MobileCallbackBridge />
    </Suspense>
  );
}
