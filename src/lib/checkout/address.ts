/**
 * Nepali delivery address: shape, geography and validation.
 *
 * The old form asked for Province / City / Area as free text and nothing else.
 * That produced addresses a rider cannot use and data ops cannot group:
 * "Ktm", "KTM", "kathmandu" and "Kathmandu Valley" all became distinct values in
 * orders.shipping_city, there was no district at all, and the one thing that
 * actually finds a house in Nepal -- the landmark -- sat in an optional textarea
 * labelled "Delivery Notes".
 *
 * Nepali addresses are Province -> District -> Municipality/Ward -> Tole/landmark.
 */

import type { Address } from '@/lib/types';

export const PROVINCES = [
  'Koshi Province',
  'Madhesh Province',
  'Bagmati Province',
  'Gandaki Province',
  'Lumbini Province',
  'Karnali Province',
  'Sudurpashchim Province',
] as const;

/**
 * Districts by province. Kathmandu Valley first inside Bagmati because it is the
 * overwhelming majority of orders.
 */
export const DISTRICTS_BY_PROVINCE: Record<string, string[]> = {
  'Koshi Province': ['Morang', 'Sunsari', 'Jhapa', 'Ilam', 'Udayapur', 'Dhankuta', 'Bhojpur', 'Taplejung', 'Panchthar', 'Terhathum', 'Sankhuwasabha', 'Khotang', 'Okhaldhunga', 'Solukhumbu'],
  'Madhesh Province': ['Dhanusha', 'Bara', 'Parsa', 'Sarlahi', 'Siraha', 'Mahottari', 'Rautahat', 'Saptari'],
  'Bagmati Province': ['Kathmandu', 'Lalitpur', 'Bhaktapur', 'Chitwan', 'Makwanpur', 'Kavrepalanchok', 'Nuwakot', 'Dhading', 'Sindhupalchok', 'Ramechhap', 'Dolakha', 'Sindhuli', 'Rasuwa'],
  'Gandaki Province': ['Kaski', 'Tanahun', 'Syangja', 'Gorkha', 'Lamjung', 'Parbat', 'Baglung', 'Myagdi', 'Nawalpur', 'Manang', 'Mustang'],
  'Lumbini Province': ['Rupandehi', 'Dang', 'Banke', 'Bardiya', 'Kapilvastu', 'Palpa', 'Gulmi', 'Arghakhanchi', 'Pyuthan', 'Rolpa', 'Parasi', 'Rukum East'],
  'Karnali Province': ['Surkhet', 'Dailekh', 'Jajarkot', 'Salyan', 'Rukum West', 'Jumla', 'Kalikot', 'Mugu', 'Humla', 'Dolpa'],
  'Sudurpashchim Province': ['Kailali', 'Kanchanpur', 'Doti', 'Achham', 'Dadeldhura', 'Baitadi', 'Darchula', 'Bajhang', 'Bajura'],
};

/** Districts we deliver to for free / fastest. Used for the delivery estimate. */
export const VALLEY_DISTRICTS = ['Kathmandu', 'Lalitpur', 'Bhaktapur'];

export function districtsFor(province: string): string[] {
  return DISTRICTS_BY_PROVINCE[province] ?? [];
}

export function isInsideValley(district: string): boolean {
  return VALLEY_DISTRICTS.includes(district);
}

/**
 * Nepali mobile numbers are 10 digits beginning 96, 97 or 98.
 * Landlines are not accepted: for a COD order the rider has to be able to call.
 */
export const NEPALI_MOBILE = /^9[678]\d{8}$/;

export function normalisePhone(raw: string): string {
  // Accept "+977 98…", "977-98…", spaces and dashes; keep the last 10 digits.
  const digits = (raw || '').replace(/\D/g, '');
  return digits.startsWith('977') ? digits.slice(3) : digits;
}

export type AddressErrors = Partial<Record<keyof Address, string>>;

/**
 * Field-level validation. Returns a map of field -> message so the form can show
 * the problem next to the input instead of silently disabling the submit button.
 */
export function validateAddressFields(a: Address): AddressErrors {
  const e: AddressErrors = {};

  if (!a.fullName?.trim()) {
    e.fullName = 'Enter the name of the person receiving the order';
  } else if (a.fullName.trim().length < 3) {
    e.fullName = 'Please enter the full name';
  }

  const phone = normalisePhone(a.phone);
  if (!phone) {
    e.phone = 'We need a mobile number — the rider will call you on it';
  } else if (!NEPALI_MOBILE.test(phone)) {
    e.phone = 'Enter a 10-digit mobile number starting 98, 97 or 96';
  }

  if (!a.region?.trim()) e.region = 'Choose your province';
  if (!a.district?.trim()) e.district = 'Choose your district';
  if (!a.city?.trim()) e.city = 'Enter your municipality or area (e.g. Kathmandu-10, Baneshwor)';
  if (!a.area?.trim()) e.area = 'Enter your tole or street';

  if (!a.landmark?.trim()) {
    e.landmark = 'Add a nearby landmark so the rider can find you';
  }

  return e;
}

export function validateAddress(a: Address): boolean {
  return Object.keys(validateAddressFields(a)).length === 0;
}

/** Human-readable summary of what is still missing, for the disabled submit button. */
export function describeMissing(a: Address): string | null {
  const errs = validateAddressFields(a);
  const keys = Object.keys(errs) as (keyof Address)[];
  if (keys.length === 0) return null;
  const labels: Record<string, string> = {
    fullName: 'full name', phone: 'mobile number', region: 'province',
    district: 'district', city: 'municipality / area', area: 'tole / street',
    landmark: 'nearest landmark',
  };
  const names = keys.map(k => labels[k as string] ?? String(k));
  if (names.length === 1) return `Add your ${names[0]} to continue.`;
  const last = names.pop();
  return `Add your ${names.join(', ')} and ${last} to continue.`;
}
