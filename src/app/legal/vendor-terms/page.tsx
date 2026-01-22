import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Vendor Terms & Conditions | KB Stylish",
  description: "Terms and Conditions for KB Stylish Vendors",
};

export default function VendorTermsPage() {
  return (
    <main className="min-h-screen bg-[var(--kb-bg-dark)] py-12 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-8 ring-1 ring-white/10">
          <h1 className="text-3xl font-bold mb-2">Vendor Terms & Conditions</h1>
          <p className="text-sm text-foreground/60 mb-8">Last updated: November 29, 2025</p>
          
          <div className="prose prose-invert max-w-none space-y-6 text-foreground/80">
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-4 mb-6">
              <p className="text-amber-400 text-sm">
                <strong>Note:</strong> These vendor terms are pending final review. 
                The complete vendor agreement will be provided by KB Stylish management.
              </p>
            </div>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">1. Vendor Eligibility</h2>
              <p>To become a vendor on KB Stylish, you must:</p>
              <ul className="list-disc pl-6 space-y-1">
                <li>Be a registered business in Nepal</li>
                <li>Provide valid PAN certificate</li>
                <li>Provide VAT certificate (if applicable)</li>
                <li>Have a valid bank account or digital wallet for payouts</li>
                <li>Agree to these terms and conditions</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">2. Commission Structure</h2>
              <p>
                KB Stylish charges a commission on each successful sale. The standard commission 
                rate and any special arrangements will be communicated during the onboarding process.
              </p>
              <ul className="list-disc pl-6 space-y-1">
                <li>Commission is calculated on the product sale price</li>
                <li>Commission rates may vary by category</li>
                <li>Promotional periods may have different rates</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">3. Payouts</h2>
              <ul className="list-disc pl-6 space-y-1">
                <li>Payouts are processed on a regular schedule</li>
                <li>Minimum payout threshold: NPR 1,000</li>
                <li>Payout methods: Bank transfer, eSewa, Khalti</li>
                <li>Vendors are responsible for any applicable taxes</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">4. Product Listings</h2>
              <ul className="list-disc pl-6 space-y-1">
                <li>All products must be accurately described</li>
                <li>Images must be original or properly licensed</li>
                <li>Pricing must be competitive and fair</li>
                <li>Prohibited items are not allowed</li>
                <li>KB Stylish reserves the right to remove listings</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">5. Order Fulfillment</h2>
              <ul className="list-disc pl-6 space-y-1">
                <li>Orders must be processed within 24-48 hours</li>
                <li>Accurate tracking information must be provided</li>
                <li>Products must match listing descriptions</li>
                <li>Proper packaging is required</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">6. Returns and Disputes</h2>
              <ul className="list-disc pl-6 space-y-1">
                <li>Vendors must honor the platform return policy</li>
                <li>Disputes will be mediated by KB Stylish</li>
                <li>Refunds may be deducted from vendor balance</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">7. Account Suspension</h2>
              <p>KB Stylish may suspend vendor accounts for:</p>
              <ul className="list-disc pl-6 space-y-1">
                <li>Violation of these terms</li>
                <li>Poor customer ratings</li>
                <li>Fraudulent activity</li>
                <li>Failure to fulfill orders</li>
                <li>Selling prohibited items</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">8. Contact</h2>
              <p>For vendor support, contact us at:</p>
              <p className="mt-2">
                <strong>Email:</strong> kbstylish2019@gmail.com<br />
                <strong>Phone:</strong> +977 9801227448
              </p>
            </section>

            <div className="mt-8 pt-6 border-t border-white/10 text-sm text-foreground/50">
              <p>
                <strong>Pending:</strong> Complete vendor terms to be provided by KB Stylish management. 
                This is a placeholder document.
              </p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
