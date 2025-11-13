import Link from "next/link";

export default function Footer() {
  return (
    <footer className="mt-10 border-t border-white/10 bg-gradient-to-b from-transparent to-white/5">
      <div className="mx-auto max-w-7xl px-4 py-10">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {/* About */}
          <div>
            <div className="inline-flex items-center gap-2">
              <span className="inline-block h-2 w-2 rounded-full bg-[var(--kb-accent-gold)]" />
              <h3 className="text-sm font-semibold tracking-wide text-foreground/90">
                About Us
              </h3>
            </div>
            <p className="mt-3 max-w-md text-sm text-foreground/70">
              KB Stylish is Nepal’s premium multi-vendor marketplace for fashion and self-care, built with a design-first ethos and an unwavering commitment to trust and quality.
            </p>
          </div>

          {/* Quick Links */}
          <div>
            <div className="inline-flex items-center gap-2">
              <span className="inline-block h-2 w-2 rounded-full bg-[var(--kb-accent-gold)]" />
              <h3 className="text-sm font-semibold tracking-wide text-foreground/90">
                Quick Links
              </h3>
            </div>
            <ul className="mt-3 space-y-2 text-sm">
              <li>
                <Link href="/shop" className="text-foreground/80 hover:text-foreground">
                  Shop
                </Link>
              </li>
              <li>
                <Link href="/bookings" className="text-foreground/80 hover:text-foreground">
                  Book a Stylist
                </Link>
              </li>
              <li>
                <Link href="/track-order" className="text-foreground/80 hover:text-foreground">
                  Track Order
                </Link>
              </li>
              <li>
                <Link href="/vendor/apply" className="text-foreground/80 hover:text-foreground">
                  Become a Vendor
                </Link>
              </li>
              <li>
                <Link href="/cart" className="text-foreground/80 hover:text-foreground">
                  Cart
                </Link>
              </li>
              <li>
                <Link href="/support" className="text-foreground/80 hover:text-foreground">
                  Support
                </Link>
              </li>
            </ul>
          </div>

          {/* Legal */}
          <div>
            <div className="inline-flex items-center gap-2">
              <span className="inline-block h-2 w-2 rounded-full bg-[var(--kb-accent-gold)]" />
              <h3 className="text-sm font-semibold tracking-wide text-foreground/90">
                Legal
              </h3>
            </div>
            <ul className="mt-3 space-y-2 text-sm">
              <li>
                <Link href="/legal/privacy" className="text-foreground/80 hover:text-foreground">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link href="/legal/terms" className="text-foreground/80 hover:text-foreground">
                  Terms of Service
                </Link>
              </li>
              <li>
                <Link href="/legal/refund" className="text-foreground/80 hover:text-foreground">
                  Refund Policy
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-10 border-t border-white/10 pt-6 text-xs text-foreground/60 sm:flex sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} KB Stylish. All rights reserved.</p>
          <p className="mt-2 sm:mt-0">
            Crafted by <span className="text-foreground">Divine Tech Innovation</span>
          </p>
        </div>
      </div>
    </footer>
  );
}
