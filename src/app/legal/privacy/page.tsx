import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy | KB Stylish",
  description: "Privacy Policy for KB Stylish",
};

export default function PrivacyPolicyPage() {
  return (
    <main className="min-h-screen bg-[var(--kb-bg-dark)] py-12 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-8 ring-1 ring-white/10">
          <h1 className="text-3xl font-bold mb-2">Privacy Policy</h1>
          <p className="text-sm text-foreground/60 mb-8">Last updated: November 29, 2025</p>
          
          <div className="prose prose-invert max-w-none space-y-6 text-foreground/80">
            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">1. Introduction</h2>
              <p>
                KB Stylish (&quot;we&quot;, &quot;our&quot;, or &quot;us&quot;) is committed to protecting your privacy. 
                This Privacy Policy explains how we collect, use, disclose, and safeguard your 
                information when you visit our website and use our services.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">2. Information We Collect</h2>
              <h3 className="text-lg font-medium text-foreground/90 mb-2">Personal Information</h3>
              <p>We may collect personal information that you voluntarily provide, including:</p>
              <ul className="list-disc pl-6 space-y-1">
                <li>Name and contact information (email, phone number, address)</li>
                <li>Account credentials</li>
                <li>Payment information (processed securely through our payment partners)</li>
                <li>Order history and preferences</li>
              </ul>
              
              <h3 className="text-lg font-medium text-foreground/90 mb-2 mt-4">Automatically Collected Information</h3>
              <ul className="list-disc pl-6 space-y-1">
                <li>Device and browser information</li>
                <li>IP address and location data</li>
                <li>Usage data and browsing patterns</li>
                <li>Cookies and similar technologies</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">3. How We Use Your Information</h2>
              <ul className="list-disc pl-6 space-y-1">
                <li>Process and fulfill your orders</li>
                <li>Communicate with you about orders, products, and services</li>
                <li>Improve our website and services</li>
                <li>Prevent fraud and ensure security</li>
                <li>Comply with legal obligations</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">4. Information Sharing</h2>
              <p>We may share your information with:</p>
              <ul className="list-disc pl-6 space-y-1">
                <li>Vendors to fulfill your orders</li>
                <li>Payment processors (eSewa, Khalti, banks)</li>
                <li>Delivery partners</li>
                <li>Service providers who assist our operations</li>
                <li>Legal authorities when required by law</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">5. Data Security</h2>
              <p>
                We implement appropriate technical and organizational measures to protect your 
                personal information. However, no method of transmission over the Internet is 
                100% secure.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">6. Your Rights</h2>
              <p>You have the right to:</p>
              <ul className="list-disc pl-6 space-y-1">
                <li>Access your personal information</li>
                <li>Correct inaccurate data</li>
                <li>Request deletion of your data</li>
                <li>Opt-out of marketing communications</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">7. Contact Us</h2>
              <p>If you have questions about this Privacy Policy, please contact us at:</p>
              <p className="mt-2">
                <strong>Email:</strong> kbstylish2019@gmail.com<br />
                <strong>Phone:</strong> +977 9801227448
              </p>
            </section>

            <div className="mt-8 pt-6 border-t border-white/10 text-sm text-foreground/50">
              <p>This privacy policy is a template. Please update with actual policy from legal counsel.</p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
