'use client';

import { Toaster } from 'react-hot-toast';

/**
 * Mounts the react-hot-toast portal.
 *
 * Fourteen components across the stylist, vendor, admin and customer dashboards
 * call toast.success() / toast.error() -- booking status changes, time-off
 * requests, order fulfilment, product create/delete, schedule saves. None of it
 * was ever visible, because <Toaster /> was never mounted anywhere in the tree.
 * Every one of those calls was a no-op, so operators got no confirmation that
 * anything had happened and no error when it failed.
 *
 * layout.tsx is a server component, hence this thin client wrapper.
 */
export default function ToastProvider() {
  return (
    <Toaster
      position="top-center"
      toastOptions={{
        duration: 4000,
        // Errors stay longer -- they usually carry an instruction to act on.
        error: { duration: 6000 },
        style: {
          background: '#111827',
          color: '#ffffff',
          fontSize: '14px',
          maxWidth: '90vw',
        },
      }}
    />
  );
}
