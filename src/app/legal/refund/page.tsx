import { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Return Policy | KB Stylish",
  description: "Return and Refund Policy for KB Stylish",
};

export default function RefundPolicyPage() {
  return (
    <main className="min-h-screen bg-[var(--kb-bg-dark)] py-12 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-8 ring-1 ring-white/10">
          <h1 className="text-3xl font-bold mb-2">Return Policy</h1>
          <p className="text-sm text-foreground/60 mb-8">Created on Jan 24, 2026</p>
          
          <div className="prose prose-invert max-w-none space-y-6 text-foreground/80">
            <section>
              <p>
                At Kbstylish, we prioritize customer satisfaction. If you are not fully happy with your purchase, we offer a simple and straightforward return process.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">1. Eligibility for Returns</h2>
              <ul className="list-disc pl-6 space-y-1">
                <li>Items must be returned within seven (7) days of delivery.</li>
                <li>They must be unused, in original packaging, and in the same condition as delivered.</li>
                <li>Perishable goods, hygiene products, and certain personal care items are not eligible unless they arrive damaged or defective.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">2. Non-Returnable Items</h2>
              <ul className="list-disc pl-6 space-y-1">
                <li>Customized or personalized items</li>
                <li>Subscriptions</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">3. Initiating a Return</h2>
              <ul className="list-disc pl-6 space-y-1">
                <li>Contact customer service via WhatsApp (<a href="https://wa.me/9779801227448" className="text-[#1976D2] hover:underline">9801227448</a>) within the return window.</li>
                <li>Provide your order/booking number, the item(s) to be returned, and the reason for the return.</li>
                <li>Our team will guide you through the return process.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">4. Return Methods</h2>
              <ul className="list-disc pl-6 space-y-1">
                <li><strong>Courier Pickup:</strong> Free pickup is available for eligible returns.</li>
                <li><strong>Drop-Off Locations:</strong> You may drop off your return at designated locations.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">5. Refunds</h2>
              <ul className="list-disc pl-6 space-y-1">
                <li>Once the returned item is inspected, you&apos;ll be notified of approval or rejection.</li>
                <li>Approved refunds will be processed to your original payment method within two days.</li>
                <li>Shipping fees are non-refundable unless the return is due to an error (e.g., wrong or damaged item).</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">6. Damaged or Defective Items</h2>
              <p>
                For damaged or defective items, contact customer support with photos and descriptions. We will arrange for a replacement or refund.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">7. Customer Support</h2>
              <p>For any return-related inquiries:</p>
              <p className="mt-2">
                <strong>Email:</strong> <a href="mailto:kbstylish2019@gmail.com" className="text-[#1976D2] hover:underline">kbstylish2019@gmail.com</a><br />
                <strong>Phone:</strong> <a href="tel:+9779801227448" className="text-[#1976D2] hover:underline">+977 9801227448</a><br />
                <strong>WhatsApp:</strong> <a href="https://wa.me/9779801227448" className="text-[#1976D2] hover:underline">9801227448</a><br />
                <strong>Support:</strong> <Link href="/support" className="text-[#1976D2] hover:underline">Help & Support</Link>
              </p>
              <p className="mt-2">We are available 24/7!</p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">8. Changes to the Return Policy</h2>
              <p>
                This policy may be updated periodically. Please review it regularly for any changes.
              </p>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}
