import { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Shipping Policy | KB Stylish",
  description: "Shipping and Delivery Policy for KB Stylish",
};

export default function ShippingPolicyPage() {
  return (
    <main className="min-h-screen bg-[var(--kb-bg-dark)] py-12 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-8 ring-1 ring-white/10">
          <h1 className="text-3xl font-bold mb-2">Shipping Policy</h1>
          <p className="text-sm text-foreground/60 mb-8">Created on Jan 24, 2026</p>
          
          <div className="prose prose-invert max-w-none space-y-6 text-foreground/80">
            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">1. Shipping Areas</h2>
              <p>
                We currently offer delivery to the following regions: Inside Kathmandu Valley for service booking and all over Nepal for B2B (shipping for outside Kathmandu Valley will charge as per cost of delivery)
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">2. Delivery Time</h2>
              <p>We aim to get your order to you as swiftly as possible! Our typical delivery times are:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li><strong>Express Delivery:</strong> Delivered within 24 hours within a Kathmandu Valley.</li>
                <li><strong>Standard Delivery:</strong> Delivery within 7 days, depending on your location.</li>
                <li><strong>Beauty & Salon Home Service:</strong> Service time will be mentioned at booking confirmation message and our service provider will visit 5-10 minutes before time mentioned.</li>
                <li><strong>Delivery not Available:</strong> Beauty and Salon service not available for out of Kathmandu Valley for now.</li>
              </ul>
              <p className="mt-3">
                Please note that delivery times may vary due to factors such as your location, product availability, and order volume. Times may also extend during holidays or special promotions.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">3. Delivery Time for Business</h2>
              <p>
                We strive to deliver your orders without disrupting your daily operations. For delivery must occur in designated time slots to minimize operational or delivery costs and reduce delays caused by traffic. Deliveries should be made within these time slabs by any means necessary.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">4. Shipping Fees</h2>
              <ul className="list-disc pl-6 space-y-1">
                <li><strong>Inside Ktm. Valley:</strong> No charges for B2B orders (only inside KTM Valley)</li>
                <li><strong>Outside Ktm. Valley:</strong> Delivery charges for outside valley is subject to cost incur and medium of delivery choose.</li>
                <li><strong>Inside Ktm. Valley:</strong> For beauty and salon service there are no additional home service charges. Price is inclusive of all cost you booked.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">5. Order Processing</h2>
              <p>
                Orders/bookings are processed immediately after checkout. You will receive an order/booking confirmation via email, SMS, or push notification, which will include the estimated delivery time.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">6. Missed Deliveries</h2>
              <p>If you are not available at the time of delivery, we will:</p>
              <ul className="list-disc pl-6 space-y-1">
                <li>Attempt to contact you.</li>
                <li>Hold the order/booking with our delivery person for a reasonable period before it is returned to the warehouse/outlet.</li>
              </ul>
              <p className="mt-2">
                There are no additional fees for redelivery, but it may affect your loyalty points.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">7. Order Tracking</h2>
              <p>
                Once your order has been processed, you will receive a tracking status that allows you to monitor your delivery in real-time.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">8. Damaged or Missing Items</h2>
              <p>If any items are damaged or missing upon arrival:</p>
              <ul className="list-disc pl-6 space-y-1">
                <li>Report the issue within 24 hours to our customer support.</li>
                <li>Provide photos of the damage, if applicable.</li>
              </ul>
              <p className="mt-2">
                We will arrange a replacement or refund as quickly as possible.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">9. Returns and Exchanges</h2>
              <p>Due to the nature of our e-commerce service, some products (such as perishable goods) may not be eligible for returns. For all other items:</p>
              <ul className="list-disc pl-6 space-y-1">
                <li><strong>Perishable goods:</strong> Returns must be requested within one hour of delivery.</li>
                <li>Refunds will be processed within one hour once the returned item is received in its original packaging.</li>
              </ul>
              <p className="mt-2">
                For more information, please refer to our <Link href="/legal/refund" className="text-[#1976D2] hover:underline">Returns Policy</Link>.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">10. Customer Support</h2>
              <p>For any questions or concerns regarding shipping, contact our customer service:</p>
              <p className="mt-2">
                <strong>Email:</strong> <a href="mailto:kbstylish2019@gmail.com" className="text-[#1976D2] hover:underline">kbstylish2019@gmail.com</a><br />
                <strong>Phone:</strong> <a href="tel:+9779801227448" className="text-[#1976D2] hover:underline">+977 9801227448</a><br />
                <strong>WhatsApp:</strong> <a href="https://wa.me/9779801227448" className="text-[#1976D2] hover:underline">9801227448</a><br />
                <strong>Support:</strong> <Link href="/support" className="text-[#1976D2] hover:underline">Help & Support</Link>
              </p>
              <p className="mt-2">Our team is available 24/7!</p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">11. Changes to the Shipping Policy</h2>
              <p>
                This policy may be updated periodically. Please review it regularly for any changes. By placing an order/booking with Kbstylish, you agree to the terms outlined in this shipping policy.
              </p>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}
