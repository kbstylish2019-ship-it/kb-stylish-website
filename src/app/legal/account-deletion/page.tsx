import { Metadata } from "next";
import Link from "next/link";

// Google Play's data-deletion policy requires a PUBLICLY reachable URL (no sign-in) that
// explains how an account and its data are deleted. This page is that URL — submit it in
// Play Console under Data safety → Data deletion. Apple does not require a URL, but links
// here from the App Store listing's privacy section anyway.

export const metadata: Metadata = {
  title: "Delete Your Account | KB Stylish",
  description:
    "How to delete your KB Stylish account and what happens to your data when you do.",
};

const DELETED = [
  "Your name, profile photo and bio",
  "Your saved delivery addresses",
  "Your phone number and date of birth",
  "Your shopping cart and wishlist",
  "Your push-notification device registrations",
  "Your ability to sign in — the login is disabled permanently",
];

const RETAINED = [
  {
    what: "Completed orders and payment records",
    why: "Nepal accounting and tax law requires sellers to retain transaction records. We keep them with your name and contact details stripped out, so they can no longer be linked to you.",
  },
  {
    what: "Reviews and ratings you posted",
    why: "Other shoppers rely on them. Your name is replaced with “Deleted User”, so the review stays useful but is no longer attributed to you.",
  },
  {
    what: "A record that a deletion was requested",
    why: "So we can prove to you — or to Google and Apple — that your request was honoured. It contains no personal details.",
  },
];

export default function AccountDeletionPage() {
  return (
    <main className="min-h-screen bg-[var(--kb-bg-dark)] py-12 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-8 ring-1 ring-white/10">
          <h1 className="text-3xl font-bold mb-2">Delete Your Account</h1>
          <p className="text-sm text-foreground/60 mb-8">
            KB Stylish Pvt. Ltd. — applies to both the website and the KB Stylish mobile app
          </p>

          <div className="max-w-none space-y-8 text-foreground/80">
            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">
                Delete from inside the app
              </h2>
              <ol className="list-decimal pl-6 space-y-1.5">
                <li>Open the KB Stylish app and sign in.</li>
                <li>
                  Go to the <strong>Profile</strong> tab.
                </li>
                <li>
                  Scroll to the bottom and tap <strong>Delete my account</strong>.
                </li>
                <li>
                  Type <strong>DELETE</strong> to confirm, then confirm once more.
                </li>
              </ol>
              <p className="mt-3">
                Deletion happens immediately. You will be signed out and will not be able to
                sign in again with that account.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">
                Delete by email
              </h2>
              <p>
                If you no longer have the app installed, email{" "}
                <a
                  href="mailto:kbstylish2019@gmail.com?subject=Account%20deletion%20request"
                  className="text-[#1976D2] hover:underline"
                >
                  kbstylish2019@gmail.com
                </a>{" "}
                from the address registered to your account with the subject{" "}
                <em>Account deletion request</em>. We will confirm and complete the deletion
                within <strong>30 days</strong>.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">
                Vendor and stylist accounts
              </h2>
              <p>
                Seller and stylist accounts can carry unpaid payouts and upcoming customer
                bookings, so they are closed by our team rather than instantly in the app.
                Email{" "}
                <a
                  href="mailto:kbstylish2019@gmail.com?subject=Vendor%20account%20closure"
                  className="text-[#1976D2] hover:underline"
                >
                  kbstylish2019@gmail.com
                </a>{" "}
                and we will settle any balance owed to you and close the account.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">
                What is deleted
              </h2>
              <ul className="list-disc pl-6 space-y-1">
                {DELETED.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">
                What we keep, and why
              </h2>
              <div className="space-y-4">
                {RETAINED.map((row) => (
                  <div
                    key={row.what}
                    className="rounded-xl border border-white/10 bg-white/5 p-4"
                  >
                    <p className="font-medium text-foreground">{row.what}</p>
                    <p className="text-sm text-foreground/70 mt-1">{row.why}</p>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-sm text-foreground/70">
                Retained financial records are kept for <strong>7 years</strong> as required
                by Nepali law, then permanently destroyed.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">Questions</h2>
              <p>
                <strong>Email:</strong>{" "}
                <a
                  href="mailto:kbstylish2019@gmail.com"
                  className="text-[#1976D2] hover:underline"
                >
                  kbstylish2019@gmail.com
                </a>
                <br />
                <strong>Phone:</strong>{" "}
                <a href="tel:+9779801227448" className="text-[#1976D2] hover:underline">
                  +977 9801227448
                </a>
                <br />
                <strong>Privacy Policy:</strong>{" "}
                <Link href="/legal/privacy" className="text-[#1976D2] hover:underline">
                  How we protect your data
                </Link>
              </p>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}
