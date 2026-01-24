import Link from "next/link";
import { Phone, Mail, MapPin, Facebook, Youtube } from "lucide-react";

export default function Footer() {
  return (
    <footer className="bg-[#1a1a2e] text-white">
      {/* Main Footer */}
      <div className="max-w-7xl mx-auto px-4 py-12">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {/* About KB Stylish */}
          <div>
            <div className="flex items-center gap-3 mb-4">
              <img 
                src="/kbStylishlogo.png" 
                alt="KB Stylish Logo" 
                className="h-6 sm:h-7 md:h-8 w-auto"
              />
            </div>
            <p className="text-sm text-gray-400 mb-4">
              Nepal&apos;s premier destination for professional salon and beauty products. 
              Quality products, trusted brands, delivered to your doorstep.
            </p>
            <div className="flex gap-3">
              <a href="https://www.facebook.com/kbstylish" target="_blank" rel="noopener noreferrer" className="w-9 h-9 bg-white/10 rounded-full flex items-center justify-center hover:bg-[#1976D2] transition-colors">
                <Facebook className="h-4 w-4" />
              </a>
              <a href="https://www.tiktok.com/@kbstylishofficial?_r=1&_t=ZS-93KqXPZyLUCh" target="_blank" rel="noopener noreferrer" className="w-9 h-9 bg-white/10 rounded-full flex items-center justify-center hover:bg-black transition-colors">
                <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"/>
                </svg>
              </a>
              <a href="https://youtube.com/@kbstylish?si=fRUyDYqYor6LpDqe" target="_blank" rel="noopener noreferrer" className="w-9 h-9 bg-white/10 rounded-full flex items-center justify-center hover:bg-[#FF0000] transition-colors">
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
              <li>
                <Link href="/legal/shipping" className="text-gray-400 hover:text-white transition-colors">
                  Shipping Policy
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
                  Narephat, Kathmandu
                </span>
              </li>
              <li className="flex items-center gap-3">
                <Phone className="h-5 w-5 text-[#1976D2] flex-shrink-0" />
                <a href="tel:+9779801227448" className="text-gray-400 hover:text-white transition-colors">
                  +977 9801227448
                </a>
              </li>
              <li className="flex items-center gap-3">
                <Mail className="h-5 w-5 text-[#1976D2] flex-shrink-0" />
                <a href="mailto:kbstylish2019@gmail.com" className="text-gray-400 hover:text-white transition-colors">
                  kbstylish2019@gmail.com
                </a>
              </li>
            </ul>

            {/* Payment Methods */}
            <div className="mt-6">
              <p className="text-xs text-gray-500 mb-2">We Accept</p>
              <div className="flex gap-2">
                <div className="px-3 py-1 bg-white/10 rounded text-xs">NPX</div>
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
