import Link from "next/link";
import { Phone, Mail, MapPin, Facebook, Instagram, Youtube } from "lucide-react";

export default function Footer() {
  return (
    <footer className="bg-[#1a1a2e] text-white">
      {/* Main Footer */}
      <div className="max-w-7xl mx-auto px-4 py-12">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {/* About KB Stylish */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-10 h-10 bg-[#1976D2] rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-lg">KB</span>
              </div>
              <div>
                <span className="font-bold text-lg">KB Stylish</span>
                <p className="text-xs text-gray-400">Beauty & Salon Products</p>
              </div>
            </div>
            <p className="text-sm text-gray-400 mb-4">
              Nepal&apos;s premier destination for professional salon and beauty products. 
              Quality products, trusted brands, delivered to your doorstep.
            </p>
            <div className="flex gap-3">
              <a href="#" className="w-9 h-9 bg-white/10 rounded-full flex items-center justify-center hover:bg-[#1976D2] transition-colors">
                <Facebook className="h-4 w-4" />
              </a>
              <a href="#" className="w-9 h-9 bg-white/10 rounded-full flex items-center justify-center hover:bg-[#E1306C] transition-colors">
                <Instagram className="h-4 w-4" />
              </a>
              <a href="#" className="w-9 h-9 bg-white/10 rounded-full flex items-center justify-center hover:bg-[#FF0000] transition-colors">
                <Youtube className="h-4 w-4" />
              </a>
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h3 className="font-semibold text-lg mb-4">Quick Links</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/shop" className="text-gray-400 hover:text-white transition-colors">
                  Shop All Products
                </Link>
              </li>
              <li>
                <Link href="/shop?category=facial-kits" className="text-gray-400 hover:text-white transition-colors">
                  Facial Kits
                </Link>
              </li>
              <li>
                <Link href="/shop?category=hair-care" className="text-gray-400 hover:text-white transition-colors">
                  Hair Care
                </Link>
              </li>
              <li>
                <Link href="/shop?category=combos" className="text-gray-400 hover:text-white transition-colors">
                  Combo Deals
                </Link>
              </li>
              <li>
                <Link href="/book-a-stylist" className="text-gray-400 hover:text-white transition-colors">
                  Book a Stylist
                </Link>
              </li>
              <li>
                <Link href="/track-order" className="text-gray-400 hover:text-white transition-colors">
                  Track Order
                </Link>
              </li>
            </ul>
          </div>

          {/* Customer Service */}
          <div>
            <h3 className="font-semibold text-lg mb-4">Customer Service</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/about" className="text-gray-400 hover:text-white transition-colors">
                  About Us
                </Link>
              </li>
              <li>
                <Link href="/support" className="text-gray-400 hover:text-white transition-colors">
                  Help & Support
                </Link>
              </li>
              <li>
                <Link href="/vendor/apply" className="text-gray-400 hover:text-white transition-colors">
                  Become a Seller
                </Link>
              </li>
              <li>
                <Link href="/legal/privacy" className="text-gray-400 hover:text-white transition-colors">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link href="/legal/terms" className="text-gray-400 hover:text-white transition-colors">
                  Terms of Service
                </Link>
              </li>
              <li>
                <Link href="/legal/refund" className="text-gray-400 hover:text-white transition-colors">
                  Refund Policy
                </Link>
              </li>
            </ul>
          </div>

          {/* Contact Info */}
          <div>
            <h3 className="font-semibold text-lg mb-4">Contact Us</h3>
            <ul className="space-y-3 text-sm">
              <li className="flex items-start gap-3">
                <MapPin className="h-5 w-5 text-[#1976D2] flex-shrink-0 mt-0.5" />
                <span className="text-gray-400">
                  Kathmandu, Nepal<br />
                  Near Ratnapark
                </span>
              </li>
              <li className="flex items-center gap-3">
                <Phone className="h-5 w-5 text-[#1976D2] flex-shrink-0" />
                <a href="tel:+9779851234567" className="text-gray-400 hover:text-white transition-colors">
                  +977 985-1234567
                </a>
              </li>
              <li className="flex items-center gap-3">
                <Mail className="h-5 w-5 text-[#1976D2] flex-shrink-0" />
                <a href="mailto:info@kbstylish.com" className="text-gray-400 hover:text-white transition-colors">
                  info@kbstylish.com
                </a>
              </li>
            </ul>

            {/* Payment Methods */}
            <div className="mt-6">
              <p className="text-xs text-gray-500 mb-2">We Accept</p>
              <div className="flex gap-2">
                <div className="px-3 py-1 bg-white/10 rounded text-xs">eSewa</div>
                <div className="px-3 py-1 bg-white/10 rounded text-xs">Khalti</div>
                <div className="px-3 py-1 bg-white/10 rounded text-xs">COD</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Bar */}
      <div className="border-t border-white/10">
        <div className="max-w-7xl mx-auto px-4 py-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-gray-500">
          <p>&copy; {new Date().getFullYear()} KB Stylish. All rights reserved.</p>
          <p>
            Crafted with ❤️ by <span className="text-gray-400">Divine Tech Innovation</span>
          </p>
        </div>
      </div>
    </footer>
  );
}
