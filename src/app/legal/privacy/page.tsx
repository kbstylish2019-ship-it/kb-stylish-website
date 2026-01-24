import { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy | KB Stylish",
  description: "Privacy Policy for KB Stylish - Learn how we protect your personal information",
};

export default function PrivacyPolicyPage() {
  return (
    <main className="min-h-screen bg-[var(--kb-bg-dark)] py-12 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-8 ring-1 ring-white/10">
          <h1 className="text-3xl font-bold mb-2">Privacy Policy</h1>
          <p className="text-sm text-foreground/60 mb-8">Created on Jan 24, 2026</p>
          
          <div className="prose prose-invert max-w-none space-y-6 text-foreground/80">
            <section>
              <p>
                At K. B. Stylish Pvt. Ltd., your privacy is our top priority. We are fully committed to safeguarding your personal data and providing transparency about how we collect, use, and share information. This Privacy Policy explains the types of data we collect, how we use it, who we share it with, and how you can control your personal information. By using our website, services, or platforms, you agree to the terms set forth in this Privacy Policy, as well as the terms in our Terms of Use. Please take the time to read through this Privacy Policy carefully.
              </p>
              <p>
                If you have any questions or need clarification about this Privacy Policy, feel free to contact us via email at <a href="mailto:kbstylish2019@gmail.com" className="text-[#1976D2] hover:underline">kbstylish2019@gmail.com</a>.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">1. Information We Collect and How We Use It</h2>
              
              <h3 className="text-lg font-medium text-foreground/90 mb-2">1.1 Automatically Collected Information</h3>
              <p>
                When you visit our website or use our services, we may collect certain information automatically. This includes data related to your web browser, IP address, device identifiers, and usage patterns. We gather this information to help us analyze user demographics, understand how you interact with our services, and improve our overall offerings. For instance, we may collect details like the web page you visited before landing on our platform, the web page you visit next, your browser type, and your device&apos;s unique IP address. This data is typically aggregated for analytics, research, and statistical purposes, helping us make informed business decisions and tailor our services to better meet your needs.
              </p>

              <h3 className="text-lg font-medium text-foreground/90 mb-2 mt-4">1.2 Personal Information You Provide</h3>
              <p>
                In order to offer you a seamless experience, we may request personal information when you use our services. This may include your name, email address, phone number, shipping and billing addresses, and payment information. We collect this information when you register for an account, place an order, booking home service, contact customer support, or participate in promotions. This personal information is used to fulfill your orders, provide customer support, and communicate with you about your account, our services, or promotional offers. Additionally, we may use your personal details to send you targeted marketing materials, which can include exclusive offers, updates on new products, or personalized recommendations based on your purchase history and interests.
              </p>

              <h3 className="text-lg font-medium text-foreground/90 mb-2 mt-4">1.3 Usage and Device Information</h3>
              <p>
                We track information related to your use of our website and services, including time stamps, the pages you visit, features you use, and your interactions with other users. Additionally, we collect device-specific information such as your device model, operating system, unique device identifiers, and network details. This information helps us enhance the functionality and security of our services, offering a more personalized user experience tailored to your preferences and device capabilities.
              </p>

              <h3 className="text-lg font-medium text-foreground/90 mb-2 mt-4">1.4 Location Data</h3>
              <p>
                We may also collect location-based data, such as your IP address or precise location using GPS, when you provide consent. This information helps us offer location-specific features, personalized content, and local promotions. You can choose whether or not to allow us to collect this data by adjusting your device settings. However, please note that disabling location services may affect your experience when using certain features of our platform.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">2. How We Use Your Information</h2>
              <p>We use the information we collect for various purposes, including but not limited to the following:</p>
              <ul className="list-disc pl-6 space-y-1">
                <li><strong>Service Delivery:</strong> To provide and maintain our website and services, process transactions, and manage orders/booking efficiently.</li>
                <li><strong>Personalization:</strong> To offer you a customized experience by tailoring our products, services, and recommendations based on your preferences and past interactions with our platform.</li>
                <li><strong>Analytics and Improvement:</strong> To monitor, analyze, and improve the performance and functionality of our website and services.</li>
                <li><strong>Marketing and Communication:</strong> To send you promotional emails, updates, and other marketing materials that are relevant to your interests, as well as to notify you of new products or services.</li>
                <li><strong>Customer Support:</strong> To assist with any inquiries, resolve technical issues, and provide ongoing support for your account or transactions.</li>
                <li><strong>Security and Legal Compliance:</strong> To protect against fraud, unauthorized access, or misuse of our services, and to comply with legal obligations such as regulatory requirements and court orders.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">3. Sharing Your Information</h2>
              
              <h3 className="text-lg font-medium text-foreground/90 mb-2">3.1 With Affiliates and Partners</h3>
              <p>
                We may share your personal information with our affiliates and subsidiaries, as well as companies that are part of the KB Stylish. These companies will use your information in accordance with this Privacy Policy. If you opt for a service that requires cooperation with third parties (such as payment processing or delivery services), we may also share the necessary information with these partners to fulfill your request. We ensure that these third parties are contractually obligated to keep your information confidential and use it solely for the services they provide.
              </p>

              <h3 className="text-lg font-medium text-foreground/90 mb-2 mt-4">3.2 Service Providers and Contractors</h3>
              <p>
                We rely on third-party service providers for a variety of tasks, such as payment processing, data analytics, marketing, and customer support. We share information with these vendors as necessary to perform their services on our behalf. For example, we may provide your payment details to a trusted payment processor to complete a purchase, or your email address to a marketing partner to deliver promotional content. Rest assured that all service providers we engage are required to follow strict data protection policies and use your information only for the specific purpose for which it was shared.
              </p>

              <h3 className="text-lg font-medium text-foreground/90 mb-2 mt-4">3.3 Third-Party Sharing</h3>
              <p>
                We may also share your data with selected third-party partners, such as advertisers or business partners, for the purposes of improving our services, analyzing trends, or delivering relevant advertisements. These third parties are not authorized to use your information beyond their contractual obligations with us, and any personal information shared with them is limited to what is necessary to fulfill the specific task or service.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">4. Security Measures and Data Retention</h2>
              <p>
                We implement a wide range of security measures to protect your data from unauthorized access, use, or disclosure. These include administrative, technical, and physical safeguards designed to ensure the confidentiality and integrity of your personal information. While we strive to maintain a secure environment, no system can be entirely immune to vulnerabilities, and we cannot guarantee the absolute security of your data. If a breach occurs, we will notify you as required by law.
              </p>
              <p>
                We retain your personal information for as long as necessary to fulfill the purposes outlined in this Privacy Policy, unless a longer retention period is required or permitted by law. Once your information is no longer needed, we securely delete or anonymize it to prevent unauthorized access.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">5. Your Rights Regarding Your Personal Information</h2>
              <p>Depending on your location, you may have certain legal rights regarding your personal data. These rights may include:</p>
              <ul className="list-disc pl-6 space-y-1">
                <li><strong>Access:</strong> Requesting access to the personal data we hold about you.</li>
                <li><strong>Rectification:</strong> Correcting any inaccurate or incomplete information.</li>
                <li><strong>Deletion:</strong> Requesting that we delete your personal data under specific circumstances.</li>
                <li><strong>Restriction:</strong> Limiting how we process your personal data.</li>
                <li><strong>Objection:</strong> Objecting to the processing of your personal data for certain purposes, such as marketing.</li>
                <li><strong>Portability:</strong> Requesting that we transfer your personal data to another organization or directly to you in a structured, commonly used format.</li>
              </ul>
              <p>
                If you wish to exercise any of these rights, please contact us at <a href="mailto:kbstylish2019@gmail.com" className="text-[#1976D2] hover:underline">kbstylish2019@gmail.com</a>. We will respond to your request within the timeframe stipulated by applicable law.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">6. Financial and Payment Information</h2>
              <p>
                We take your financial security seriously. When you provide us with payment details—whether credit card information or bank account numbers—these transactions are encrypted and processed through secure payment gateways. We use your financial information strictly for completing the transactions you initiate and ensuring compliance with applicable laws and anti-fraud regulations. We do not store your payment information for longer than necessary to complete the transaction, unless otherwise required by law.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">7. Permissions and Device Access</h2>
              <p>To provide you with the best possible experience, we may request access to certain features of your device. This may include:</p>
              <ul className="list-disc pl-6 space-y-1">
                <li><strong>Contacts:</strong> Accessing your contact list to allow for features like order sharing or social interactions.</li>
                <li><strong>SMS:</strong> Reading SMS messages to automatically fill OTPs and simplify the transaction process.</li>
                <li><strong>Phone:</strong> Directly calling our customer service from within the app.</li>
                <li><strong>Camera and Media:</strong> Accessing your camera and media gallery for purposes such as uploading photos for customer support or verifying the condition of a received product.</li>
              </ul>
              <p>You have the option to grant or deny these permissions at any time through your device settings.</p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">8. Cookies and Tracking Technologies</h2>
              <p>
                We use cookies, web beacons, and similar tracking technologies to enhance your browsing experience and provide personalized content. Cookies help us recognize your device, store preferences, and analyze web traffic patterns. Some cookies are essential for the basic functioning of our website, while others are used for performance analytics and targeted advertising. You can control cookie preferences through your browser settings. However, disabling cookies may impact certain functionalities of our website.
              </p>
              <p>
                Third-party advertisers may also use cookies and tracking technologies to deliver targeted advertisements. We recommend reviewing the privacy policies of these third parties for more information on their data practices.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">9. Data Retention and Legal Disclosures</h2>
              <p>
                We retain your data for as long as necessary to fulfill business and legal obligations. In certain cases, we may be required to disclose your information to comply with legal or regulatory requirements, such as court orders, subpoenas, or requests from governmental authorities. We will take all reasonable steps to ensure that such disclosures are lawful and necessary.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">10. Grievance Redressal Mechanism</h2>
              <p>
                If you have any concerns or complaints about our privacy practices, please contact our Chief Technology Officer, Subarna Bhandari, at <a href="mailto:kbstylish2019@gmail.com" className="text-[#1976D2] hover:underline">kbstylish2019@gmail.com</a>. We are committed to resolving any issues you may have and will respond to your inquiry in a timely and transparent manner. For further grievance redressal, we will take appropriate measures to ensure that your concerns are addressed adequately.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">11. Changes to This Privacy Policy</h2>
              <p>
                We may update this Privacy Policy from time to time to reflect changes in our practices or applicable law. Any modifications to the policy will be effective as soon as they are posted on this page. We recommend that you review this page periodically to stay informed about how we protect your personal data. By continuing to use our platform after changes are made, you agree to the updated terms of this Privacy Policy.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">Contact Information</h2>
              <p>For any questions regarding this privacy policy, please contact us:</p>
              <p className="mt-2">
                <strong>Email:</strong> <a href="mailto:kbstylish2019@gmail.com" className="text-[#1976D2] hover:underline">kbstylish2019@gmail.com</a><br />
                <strong>Phone:</strong> <a href="tel:+9779801227448" className="text-[#1976D2] hover:underline">+977 9801227448</a><br />
                <strong>Support:</strong> <Link href="/support" className="text-[#1976D2] hover:underline">Help & Support</Link>
              </p>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}
