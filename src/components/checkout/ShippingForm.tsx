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
    <section aria-labelledby="shipping-info" className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <h2 id="shipping-info" className="mb-3 text-lg font-semibold tracking-tight text-gray-900">
        Shipping Information
      </h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="mb-1 block text-sm text-gray-600" htmlFor="fullName">
            Full Name
          </label>
          <input
            id="fullName"
            value={address.fullName}
            onChange={(e) => onChange({ ...address, fullName: e.target.value })}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 placeholder-gray-400 focus:border-[#1976D2] focus:ring-1 focus:ring-[#1976D2] focus:outline-none"
            placeholder="e.g., Sita Sharma"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm text-gray-600" htmlFor="phone">
            Phone
          </label>
          <input
            id="phone"
            value={address.phone}
            onChange={(e) => onChange({ ...address, phone: e.target.value })}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 placeholder-gray-400 focus:border-[#1976D2] focus:ring-1 focus:ring-[#1976D2] focus:outline-none"
            placeholder="98XXXXXXXX"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm text-gray-600" htmlFor="region">
            Province/Region
          </label>
          <input
            id="region"
            value={address.region}
            onChange={(e) => onChange({ ...address, region: e.target.value })}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 placeholder-gray-400 focus:border-[#1976D2] focus:ring-1 focus:ring-[#1976D2] focus:outline-none"
            placeholder="Bagmati Province"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm text-gray-600" htmlFor="city">
            City
          </label>
          <input
            id="city"
            value={address.city}
            onChange={(e) => onChange({ ...address, city: e.target.value })}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 placeholder-gray-400 focus:border-[#1976D2] focus:ring-1 focus:ring-[#1976D2] focus:outline-none"
            placeholder="Kathmandu"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm text-gray-600" htmlFor="area">
            Area / Street
          </label>
          <input
            id="area"
            value={address.area}
            onChange={(e) => onChange({ ...address, area: e.target.value })}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 placeholder-gray-400 focus:border-[#1976D2] focus:ring-1 focus:ring-[#1976D2] focus:outline-none"
            placeholder="Thamel, JP Road"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1 block text-sm text-gray-600" htmlFor="line2">
            Address Line 2 (Optional)
          </label>
          <input
            id="line2"
            value={address.line2 ?? ""}
            onChange={(e) => onChange({ ...address, line2: e.target.value })}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 placeholder-gray-400 focus:border-[#1976D2] focus:ring-1 focus:ring-[#1976D2] focus:outline-none"
            placeholder="Apartment, building, etc."
          />
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1 block text-sm text-gray-600" htmlFor="notes">
            Delivery Notes (Optional)
          </label>
          <textarea
            id="notes"
            rows={3}
            value={address.notes ?? ""}
            onChange={(e) => onChange({ ...address, notes: e.target.value })}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 placeholder-gray-400 focus:border-[#1976D2] focus:ring-1 focus:ring-[#1976D2] focus:outline-none"
            placeholder="Any instructions for delivery"
          />
        </div>
      </div>
    </section>
  );
}
