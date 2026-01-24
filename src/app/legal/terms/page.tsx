import { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Use | KB Stylish",
  description: "Terms of Use for KB Stylish",
};

export default function TermsOfServicePage() {
  return (
    <main className="min-h-screen bg-[var(--kb-bg-dark)] py-12 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-8 ring-1 ring-white/10">
          <h1 className="text-3xl font-bold mb-2">Terms of Use</h1>
          <p className="text-sm text-foreground/60 mb-8">Created on Jan 24, 2026</p>
          
          <div className="prose prose-invert max-w-none space-y-6 text-foreground/80">
            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">1. Introduction</h2>
              <p>
                Welcome to Kbstylish, an e-commerce platform purposing to serve B2B beauty and personal care, salon and beauty service at home based in Nepal. By accessing or using our website, you agree to the following terms. Please review them carefully. If you disagree with any part, you must discontinue use.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">2. Definitions</h2>
              <ul className="list-disc pl-6 space-y-1">
                <li><strong>User:</strong> Anyone who visits, browses, or uses the Kbstylish platform.</li>
                <li><strong>Customer:</strong> A user who purchases products or services from Kbstylish.</li>
                <li><strong>Seller:</strong> A user who lists goods or services on Kbstylish.</li>
                <li><strong>We/Us/Our:</strong> Refers to Kbstylish and its management.</li>
                <li><strong>Website:</strong> Refers to <a href="https://www.kbstylish.com.np" className="text-[#1976D2] hover:underline">www.kbstylish.com.np</a></li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">3. Use of the Website</h2>
              <ul className="list-disc pl-6 space-y-1">
                <li>Users must be at least 18 years old or have parental/guardian consent.</li>
                <li>Users must provide accurate information during registration and keep their details updated.</li>
                <li>Users are responsible for maintaining the confidentiality of their account information and for all activities under their account.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">4. User Conduct</h2>
              <ul className="list-disc pl-6 space-y-1">
                <li>Users must not engage in illegal or unauthorized activities using the website.</li>
                <li>Disruption of the website&apos;s functionality or security is prohibited.</li>
                <li>Posting or transmitting harmful, threatening, defamatory, or obscene content is not allowed.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">5. Orders and Payments</h2>
              <ul className="list-disc pl-6 space-y-1">
                <li>Orders/bookings are subject to acceptance and availability.</li>
                <li>Prices may change without notice.</li>
                <li>Customers are responsible for payment of all charges associated with their orders/bookings, including taxes and shipping fees.</li>
                <li>Accepted payment methods include credit/debit cards, bank transfers, and others as specified.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">6. Shipping and Delivery</h2>
              <ul className="list-disc pl-6 space-y-1">
                <li>Kbstylish aims to ensure timely delivery, but times may vary based on location and availability.</li>
                <li>Customers are responsible for providing accurate shipping details.</li>
                <li>Kbstylish is not liable for delays caused by incorrect information.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">7. Returns and Refunds</h2>
              <ul className="list-disc pl-6 space-y-1">
                <li>Returns are subject to the policies detailed on the website.</li>
                <li>Refunds will be processed within a reasonable time after the returned product is received and inspected.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">8. Intellectual Property</h2>
              <p>
                All content on the Kbstylish website, including text, images, logos, and software, is owned by Kbstylish or its suppliers and is protected by intellectual property laws. Users may not reproduce or distribute content without written permission.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">9. Limitation of Liability</h2>
              <ul className="list-disc pl-6 space-y-1">
                <li>Kbstylish is not liable for any damages arising from the use or inability to use the website or products.</li>
                <li>We do not guarantee the website will be error-free or uninterrupted.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">10. Privacy Policy</h2>
              <p>
                We value your privacy and handle personal information per our <Link href="/legal/privacy" className="text-[#1976D2] hover:underline">Privacy Policy</Link>, available on the website.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">11. Changes to Terms of Service</h2>
              <p>
                These terms may be updated at any time. Continued use of the website after any changes constitutes acceptance of the updated terms.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">12. Governing Law</h2>
              <p>
                These terms are governed by the laws of Nepal. Any disputes will be resolved in Nepalese courts.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">13. Contact Information</h2>
              <p>For any questions regarding these terms, please contact us:</p>
              <p className="mt-2">
                <strong>Email:</strong> <a href="mailto:kbstylish2019@gmail.com" className="text-[#1976D2] hover:underline">kbstylish2019@gmail.com</a><br />
                <strong>Phone:</strong> <a href="tel:+9779801227448" className="text-[#1976D2] hover:underline">+977 9801227448</a><br />
                <strong>WhatsApp:</strong> <a href="https://wa.me/9779801227448" className="text-[#1976D2] hover:underline">9801227448</a><br />
                <strong>Support:</strong> <Link href="/support" className="text-[#1976D2] hover:underline">Help & Support</Link>
              </p>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}
