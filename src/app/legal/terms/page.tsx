import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service | KB Stylish",
  description: "Terms of Service for KB Stylish",
};

export default function TermsOfServicePage() {
  return (
    <main className="min-h-screen bg-[var(--kb-bg-dark)] py-12 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-8 ring-1 ring-white/10">
          <h1 className="text-3xl font-bold mb-2">Terms of Service</h1>
          <p className="text-sm text-foreground/60 mb-8">Last updated: November 29, 2025</p>
          
          <div className="prose prose-invert max-w-none space-y-6 text-foreground/80">
            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">1. Acceptance of Terms</h2>
              <p>
                By accessing and using KB Stylish (&quot;the Platform&quot;), you agree to be bound by these 
                Terms of Service. If you do not agree to these terms, please do not use our services.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">2. Account Registration</h2>
              <ul className="list-disc pl-6 space-y-1">
                <li>You must be at least 18 years old to create an account</li>
                <li>You are responsible for maintaining the security of your account</li>
                <li>You must provide accurate and complete information</li>
                <li>One person may not maintain multiple accounts</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">3. Orders and Payments</h2>
              <ul className="list-disc pl-6 space-y-1">
                <li>All prices are listed in Nepali Rupees (NPR)</li>
                <li>Payment must be completed before order processing</li>
                <li>We accept payments via eSewa, Khalti, and bank transfer</li>
                <li>Orders are subject to availability and confirmation</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">4. Shipping and Delivery</h2>
              <ul className="list-disc pl-6 space-y-1">
                <li>Delivery times are estimates and not guaranteed</li>
                <li>Shipping costs are calculated at checkout</li>
                <li>Risk of loss transfers upon delivery to carrier</li>
                <li>You are responsible for providing accurate delivery information</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">5. Returns and Refunds</h2>
              <ul className="list-disc pl-6 space-y-1">
                <li>Returns accepted within 7 days of delivery</li>
                <li>Items must be unused and in original packaging</li>
                <li>Refunds processed within 7-14 business days</li>
                <li>Some items may not be eligible for return</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">6. Prohibited Activities</h2>
              <p>You agree not to:</p>
              <ul className="list-disc pl-6 space-y-1">
                <li>Use the platform for any illegal purpose</li>
                <li>Attempt to gain unauthorized access</li>
                <li>Interfere with the platform&apos;s operation</li>
                <li>Submit false or misleading information</li>
                <li>Engage in fraudulent transactions</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">7. Intellectual Property</h2>
              <p>
                All content on KB Stylish, including logos, images, and text, is the property of 
                KB Stylish or its licensors and is protected by intellectual property laws.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">8. Limitation of Liability</h2>
              <p>
                KB Stylish shall not be liable for any indirect, incidental, special, or 
                consequential damages arising from your use of the platform.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">9. Changes to Terms</h2>
              <p>
                We reserve the right to modify these terms at any time. Continued use of the 
                platform after changes constitutes acceptance of the new terms.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">10. Contact</h2>
              <p>For questions about these Terms, contact us at:</p>
              <p className="mt-2">
                <strong>Email:</strong> kbstylish2019@gmail.com<br />
                <strong>Phone:</strong> +977 9801227448
              </p>
            </section>

            <div className="mt-8 pt-6 border-t border-white/10 text-sm text-foreground/50">
              <p>This is a template. Please update with actual terms from legal counsel.</p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
