'use client';

import dynamic from 'next/dynamic';

/**
 * Client-side wrapper for WelcomeModal
 * This allows us to use ssr: false in a Client Component
 */
const WelcomeModal = dynamic(() => import('./WelcomeModal'), {
  ssr: false, // Client-side only (uses sessionStorage)
});

export default function WelcomeModalWrapper() {
  return <WelcomeModal />;
}
