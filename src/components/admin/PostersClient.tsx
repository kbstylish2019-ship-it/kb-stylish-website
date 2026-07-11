'use client';

import React from 'react';
import { QRCodeSVG } from 'qrcode.react';

interface Branch {
  id: string;
  name: string;
  referral_code: string | null;
}

/**
 * Printable per-salon QR poster sheet (one A5-ish card per branch).
 * QR encodes the public landing page; the human code is the universal fallback.
 */
export default function PostersClient({ branches }: { branches: Branch[] }) {
  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="mb-6 flex items-center justify-between print:hidden">
        <div>
          <h1 className="text-xl font-bold text-neutral-900">Salon QR Posters</h1>
          <p className="text-sm text-neutral-500">
            One card per salon — print, cut, and place at the reception desk and mirror stations.
          </p>
        </div>
        <button
          onClick={() => window.print()}
          className="rounded-lg bg-[var(--kb-primary-brand)] px-4 py-2 text-sm font-semibold text-white"
          data-testid="print-button"
        >
          Print
        </button>
      </div>

      <div className="grid gap-6">
        {branches.map((b) => {
          const code = (b.referral_code || '').toUpperCase();
          const url = `https://www.kbstylish.com.np/join/${code}`;
          return (
            <div
              key={b.id}
              className="rounded-2xl border-2 border-neutral-900 p-8 text-center break-inside-avoid"
              style={{ pageBreakInside: 'avoid' }}
            >
              <p className="text-sm font-bold uppercase tracking-widest text-[var(--kb-primary-brand)]">
                KB Stylish Rewards
              </p>
              <h2 className="mt-1 text-2xl font-extrabold text-neutral-900">
                Your first stamp is FREE
              </h2>
              <p className="mt-1 text-sm text-neutral-600">
                Scan, install the KB Stylish app, and your stamp card starts at 1/5.
                <br />
                Collect 5 stamps — your next booking is on us.
              </p>
              <div className="mt-5 flex justify-center">
                <QRCodeSVG value={url} size={180} level="M" includeMargin />
              </div>
              <p className="mt-4 text-xs uppercase tracking-wider text-neutral-500">
                No camera? Enter this salon code in the app:
              </p>
              <p className="mt-1 text-3xl font-black tracking-widest text-neutral-900">{code}</p>
              <p className="mt-3 text-xs text-neutral-400">
                {b.name.replace('KB Stylish_', 'KB Stylish ')} • kbstylish.com.np
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
