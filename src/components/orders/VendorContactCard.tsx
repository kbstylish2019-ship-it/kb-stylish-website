'use client';

import { Store, Mail, Phone, Clock } from 'lucide-react';

interface VendorContactInfo {
  business_name: string;
  user: {
    email: string;
    phone: string | null;
  };
}

interface VendorContactCardProps {
  vendor: VendorContactInfo;
}

export default function VendorContactCard({ vendor }: VendorContactCardProps) {
  const hasEmail = !!vendor.user?.email;
  const hasPhone = !!vendor.user?.phone;

  if (!hasEmail && !hasPhone) {
    return null; // Don't show card if no contact info available
  }

  return (
    <div className="mt-3 rounded-lg border border-blue-500/20 bg-blue-500/5 p-4">
      {/* Vendor Name */}
      <div className="flex items-center gap-2 mb-3">
        <Store className="h-4 w-4 text-blue-400" />
        <h4 className="font-semibold text-foreground">{vendor.business_name}</h4>
      </div>

      <p className="text-sm text-foreground/70 mb-3">
        Questions about this item? Contact the vendor directly:
      </p>

      {/* Contact Buttons */}
      <div className="flex flex-col sm:flex-row gap-2">
        {hasEmail && (
          <a
            href={`mailto:${vendor.user.email}`}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors text-sm font-medium"
          >
            <Mail className="h-4 w-4" />
            <span>Email Vendor</span>
          </a>
        )}
        
        {hasPhone && (
          <a
            href={`tel:${vendor.user.phone}`}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-white/10 border border-white/20 text-foreground hover:bg-white/20 transition-colors text-sm font-medium"
          >
            <Phone className="h-4 w-4" />
            <span>Call Vendor</span>
          </a>
        )}
      </div>

      {/* Response Time Estimate */}
      <div className="mt-3 pt-3 border-t border-blue-500/10">
        <div className="flex items-center gap-1.5 text-xs text-foreground/50">
          <Clock className="h-3 w-3" />
          <span>Usually responds within 24 hours</span>
        </div>
      </div>
    </div>
  );
}
