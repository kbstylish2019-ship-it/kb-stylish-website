"use client";
import React from "react";
import type { Address } from "@/lib/types";

export default function ShippingForm({
  address,
  onChange,
}: {
  address: Address;
  onChange: (a: Address) => void;
}) {
  return (
    <section aria-labelledby="shipping-info" className="rounded-xl border border-white/10 bg-white/5 p-4">
      <h2 id="shipping-info" className="mb-3 text-lg font-semibold tracking-tight">
        Shipping Information
      </h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="mb-1 block text-sm text-foreground/80" htmlFor="fullName">
            Full Name
          </label>
          <input
            id="fullName"
            value={address.fullName}
            onChange={(e) => onChange({ ...address, fullName: e.target.value })}
            className="w-full rounded-lg bg-white/5 px-3 py-2 ring-1 ring-white/10"
            placeholder="e.g., Sita Sharma"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm text-foreground/80" htmlFor="phone">
            Phone
          </label>
          <input
            id="phone"
            value={address.phone}
            onChange={(e) => onChange({ ...address, phone: e.target.value })}
            className="w-full rounded-lg bg-white/5 px-3 py-2 ring-1 ring-white/10"
            placeholder="98XXXXXXXX"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm text-foreground/80" htmlFor="region">
            Province/Region
          </label>
          <input
            id="region"
            value={address.region}
            onChange={(e) => onChange({ ...address, region: e.target.value })}
            className="w-full rounded-lg bg-white/5 px-3 py-2 ring-1 ring-white/10"
            placeholder="Bagmati Province"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm text-foreground/80" htmlFor="city">
            City
          </label>
          <input
            id="city"
            value={address.city}
            onChange={(e) => onChange({ ...address, city: e.target.value })}
            className="w-full rounded-lg bg-white/5 px-3 py-2 ring-1 ring-white/10"
            placeholder="Kathmandu"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm text-foreground/80" htmlFor="area">
            Area / Street
          </label>
          <input
            id="area"
            value={address.area}
            onChange={(e) => onChange({ ...address, area: e.target.value })}
            className="w-full rounded-lg bg-white/5 px-3 py-2 ring-1 ring-white/10"
            placeholder="Thamel, JP Road"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1 block text-sm text-foreground/80" htmlFor="line2">
            Address Line 2 (Optional)
          </label>
          <input
            id="line2"
            value={address.line2 ?? ""}
            onChange={(e) => onChange({ ...address, line2: e.target.value })}
            className="w-full rounded-lg bg-white/5 px-3 py-2 ring-1 ring-white/10"
            placeholder="Apartment, building, etc."
          />
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1 block text-sm text-foreground/80" htmlFor="notes">
            Delivery Notes (Optional)
          </label>
          <textarea
            id="notes"
            rows={3}
            value={address.notes ?? ""}
            onChange={(e) => onChange({ ...address, notes: e.target.value })}
            className="w-full rounded-lg bg-white/5 px-3 py-2 ring-1 ring-white/10"
            placeholder="Any instructions for delivery"
          />
        </div>
      </div>
    </section>
  );
}
