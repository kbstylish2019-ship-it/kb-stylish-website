import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Refund Policy | KB Stylish",
  description: "Refund and Return Policy for KB Stylish",
};

export default function RefundPolicyPage() {
  return (
    <main className="min-h-screen bg-[var(--kb-bg-dark)] py-12 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-8 ring-1 ring-white/10">
          <h1 className="text-3xl font-bold mb-2">Refund & Return Policy</h1>
          <p className="text-sm text-foreground/60 mb-8">Last updated: November 29, 2025</p>
          
          <div className="prose prose-invert max-w-none space-y-6 text-foreground/80">
            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">1. Return Eligibility</h2>
              <p>Items may be returned within 7 days of delivery if they meet the following conditions:</p>
              <ul className="list-disc pl-6 space-y-1">
                <li>Item is unused and in original condition</li>
                <li>Item is in original packaging with all tags attached</li>
                <li>Item is not a final sale or non-returnable item</li>
                <li>Proof of purchase is provided</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">2. Non-Returnable Items</h2>
              <p>The following items cannot be returned:</p>
              <ul className="list-disc pl-6 space-y-1">
                <li>Personal care items (for hygiene reasons)</li>
                <li>Customized or personalized products</li>
                <li>Items marked as &quot;Final Sale&quot;</li>
                <li>Gift cards</li>
                <li>Downloadable products</li>
                <li>Items damaged due to customer misuse</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">3. How to Request a Return</h2>
              <ol className="list-decimal pl-6 space-y-2">
                <li>Log in to your KB Stylish account</li>
                <li>Go to your order history</li>
                <li>Select the order containing the item you wish to return</li>
                <li>Click &quot;Request Return&quot; and follow the instructions</li>
                <li>Pack the item securely in its original packaging</li>
                <li>Ship the item to the address provided</li>
              </ol>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">4. Refund Process</h2>
              <ul className="list-disc pl-6 space-y-1">
                <li>Refunds are processed within 7-14 business days after we receive the returned item</li>
                <li>Refunds will be issued to the original payment method</li>
                <li>Shipping costs are non-refundable unless the return is due to our error</li>
                <li>You will receive an email confirmation when your refund is processed</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">5. Exchanges</h2>
              <p>
                We currently do not offer direct exchanges. If you need a different size or color, 
                please return the original item for a refund and place a new order.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">6. Damaged or Defective Items</h2>
              <p>
                If you receive a damaged or defective item, please contact us within 48 hours of 
                delivery with photos of the damage. We will arrange for a replacement or full refund 
                including shipping costs.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">7. Booking Cancellations</h2>
              <p>For stylist booking cancellations:</p>
              <ul className="list-disc pl-6 space-y-1">
                <li>Cancellations made 24+ hours before appointment: Full refund</li>
                <li>Cancellations made 12-24 hours before: 50% refund</li>
                <li>Cancellations made less than 12 hours before: No refund</li>
                <li>No-shows: No refund</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">8. Contact Us</h2>
              <p>For questions about returns or refunds, contact us at:</p>
              <p className="mt-2">
                <strong>Email:</strong> support@kbstylish.com.np<br />
                <strong>Phone:</strong> +977-XXX-XXXXXXX
              </p>
            </section>

            <div className="mt-8 pt-6 border-t border-white/10 text-sm text-foreground/50">
              <p>This is a template. Please update with actual policy from management.</p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
