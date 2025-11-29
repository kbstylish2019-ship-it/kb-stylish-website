import { Metadata } from "next";
import Link from "next/link";
import { FileText, Shield, Store, RotateCcw } from "lucide-react";

export const metadata: Metadata = {
  title: "Legal | KB Stylish",
  description: "Legal documents and policies for KB Stylish",
};

export default function LegalIndexPage() {
  const legalPages = [
    {
      title: "Terms of Service",
      description: "Terms and conditions for using KB Stylish",
      href: "/legal/terms",
      icon: FileText,
    },
    {
      title: "Privacy Policy",
      description: "How we collect, use, and protect your data",
      href: "/legal/privacy",
      icon: Shield,
    },
    {
      title: "Refund Policy",
      description: "Our return and refund policies",
      href: "/legal/refund",
      icon: RotateCcw,
    },
    {
      title: "Vendor Terms & Conditions",
      description: "Terms for vendors selling on KB Stylish",
      href: "/legal/vendor-terms",
      icon: Store,
    },
  ];

  return (
    <main className="min-h-screen bg-[var(--kb-bg-dark)] py-12 px-4">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">Legal</h1>
        <p className="text-foreground/60 mb-8">
          Review our legal documents and policies
        </p>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {legalPages.map((page) => (
            <Link
              key={page.href}
              href={page.href}
              className="rounded-2xl border border-white/10 bg-white/5 p-6 ring-1 ring-white/10 hover:bg-white/10 transition-colors"
            >
              <page.icon className="h-8 w-8 text-[var(--kb-primary-brand)] mb-3" />
              <h2 className="text-lg font-semibold mb-1">{page.title}</h2>
              <p className="text-sm text-foreground/60">{page.description}</p>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
