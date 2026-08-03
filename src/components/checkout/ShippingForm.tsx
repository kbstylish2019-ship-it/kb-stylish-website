"use client";
import React from "react";
import type { Address } from "@/lib/types";
import {
  PROVINCES,
  districtsFor,
  validateAddressFields,
  normalisePhone,
  type AddressErrors,
} from "@/lib/checkout/address";

const inputBase =
  "w-full rounded-lg border bg-white px-3 py-2 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-1";
const ok = "border-gray-300 focus:border-[#1976D2] focus:ring-[#1976D2]";
const bad = "border-red-400 focus:border-red-500 focus:ring-red-500";

function Req() {
  return <span className="text-red-600" aria-hidden="true"> *</span>;
}

export default function ShippingForm({
  address,
  onChange,
  showAllErrors = false,
}: {
  address: Address;
  onChange: (a: Address) => void;
  /** Set once the customer has attempted to submit, to reveal every problem at once. */
  showAllErrors?: boolean;
}) {
  const [touched, setTouched] = React.useState<Record<string, boolean>>({});
  const errors: AddressErrors = validateAddressFields(address);

  const show = (f: keyof Address) => Boolean((showAllErrors || touched[f]) && errors[f]);
  const mark = (f: keyof Address) => `${inputBase} ${show(f) ? bad : ok}`;
  const blur = (f: keyof Address) => () => setTouched(t => ({ ...t, [f]: true }));

  const Err = ({ f }: { f: keyof Address }) =>
    show(f) ? (
      <p id={`${f}-error`} role="alert" className="mt-1 text-xs text-red-700">
        {errors[f]}
      </p>
    ) : null;

  const districts = districtsFor(address.region);

  return (
    <section aria-labelledby="shipping-info" className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <h2 id="shipping-info" className="mb-1 text-lg font-semibold tracking-tight text-gray-900">
        Delivery Address
      </h2>
      <p className="mb-3 text-xs text-gray-500">
        Fields marked <span className="text-red-600">*</span> are required. We only use this to deliver your order.
      </p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="mb-1 block text-sm text-gray-600" htmlFor="fullName">
            Full Name<Req />
          </label>
          <input
            id="fullName"
            value={address.fullName}
            onChange={(e) => onChange({ ...address, fullName: e.target.value })}
            onBlur={blur("fullName")}
            aria-invalid={show("fullName")}
            aria-describedby={show("fullName") ? "fullName-error" : undefined}
            className={mark("fullName")}
            placeholder="e.g. Sita Sharma"
            autoComplete="name"
          />
          <Err f="fullName" />
        </div>

        <div>
          <label className="mb-1 block text-sm text-gray-600" htmlFor="phone">
            Mobile Number<Req />
          </label>
          {/* type=tel + inputMode=numeric opens the number pad on a phone. The old
              type=text opened a QWERTY keyboard for a 10-digit number, and nothing
              validated it -- "48464546132" reached production as a real COD order. */}
          <input
            id="phone"
            type="tel"
            inputMode="numeric"
            maxLength={14}
            value={address.phone}
            onChange={(e) => onChange({ ...address, phone: e.target.value })}
            onBlur={() => {
              setTouched(t => ({ ...t, phone: true }));
              const n = normalisePhone(address.phone);
              if (n && n !== address.phone) onChange({ ...address, phone: n });
            }}
            aria-invalid={show("phone")}
            aria-describedby={show("phone") ? "phone-error" : "phone-hint"}
            className={mark("phone")}
            placeholder="98XXXXXXXX"
            autoComplete="tel"
          />
          {show("phone") ? <Err f="phone" /> : (
            <p id="phone-hint" className="mt-1 text-xs text-gray-500">The rider will call you on this number.</p>
          )}
        </div>

        <div>
          <label className="mb-1 block text-sm text-gray-600" htmlFor="region">
            Province<Req />
          </label>
          <select
            id="region"
            value={address.region}
            onChange={(e) => onChange({ ...address, region: e.target.value, district: "" })}
            onBlur={blur("region")}
            aria-invalid={show("region")}
            className={`${mark("region")} [&>option]:bg-white [&>option]:text-gray-900`}
          >
            <option value="">Select province</option>
            {PROVINCES.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <Err f="region" />
        </div>

        <div>
          <label className="mb-1 block text-sm text-gray-600" htmlFor="district">
            District<Req />
          </label>
          <select
            id="district"
            value={address.district}
            onChange={(e) => onChange({ ...address, district: e.target.value })}
            onBlur={blur("district")}
            disabled={!address.region}
            aria-invalid={show("district")}
            className={`${mark("district")} disabled:bg-gray-50 disabled:text-gray-400 [&>option]:bg-white [&>option]:text-gray-900`}
          >
            <option value="">{address.region ? "Select district" : "Choose a province first"}</option>
            {districts.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          <Err f="district" />
        </div>

        <div>
          <label className="mb-1 block text-sm text-gray-600" htmlFor="city">
            Municipality / Area<Req />
          </label>
          <input
            id="city"
            value={address.city}
            onChange={(e) => onChange({ ...address, city: e.target.value })}
            onBlur={blur("city")}
            aria-invalid={show("city")}
            className={mark("city")}
            placeholder="e.g. Kathmandu-10, Baneshwor"
          />
          <Err f="city" />
        </div>

        <div>
          <label className="mb-1 block text-sm text-gray-600" htmlFor="area">
            Tole / Street<Req />
          </label>
          <input
            id="area"
            value={address.area}
            onChange={(e) => onChange({ ...address, area: e.target.value })}
            onBlur={blur("area")}
            aria-invalid={show("area")}
            className={mark("area")}
            placeholder="e.g. New Baneshwor Marga"
          />
          <Err f="area" />
        </div>

        <div className="sm:col-span-2">
          <label className="mb-1 block text-sm text-gray-600" htmlFor="landmark">
            Nearest Landmark<Req />
          </label>
          {/* Promoted out of the optional "Delivery Notes" textarea. In Nepal this is
              the field that actually gets a parcel to the door. */}
          <input
            id="landmark"
            value={address.landmark}
            onChange={(e) => onChange({ ...address, landmark: e.target.value })}
            onBlur={blur("landmark")}
            aria-invalid={show("landmark")}
            aria-describedby={show("landmark") ? "landmark-error" : "landmark-hint"}
            className={mark("landmark")}
            placeholder="e.g. near Bagbazar Chowk, opposite Nabil Bank"
          />
          {show("landmark") ? <Err f="landmark" /> : (
            <p id="landmark-hint" className="mt-1 text-xs text-gray-500">
              So the rider can find you without calling.
            </p>
          )}
        </div>

        <div className="sm:col-span-2">
          <label className="mb-1 block text-sm text-gray-600" htmlFor="notes">
            Delivery Notes (Optional)
          </label>
          <textarea
            id="notes"
            rows={2}
            value={address.notes ?? ""}
            onChange={(e) => onChange({ ...address, notes: e.target.value })}
            className={`${inputBase} ${ok}`}
            placeholder="e.g. call before coming, 2nd floor"
          />
        </div>
      </div>
    </section>
  );
}
