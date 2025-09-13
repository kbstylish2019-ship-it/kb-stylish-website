import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import dynamic from "next/dynamic";

// Defer Header to reduce initial JS; render a lightweight skeleton during loading
const Header = dynamic(() => import("@/components/layout/Header"), {
  loading: () => (
    <div className="sticky top-0 z-50 border-b border-white/10 bg-background/80 h-16" aria-label="Loading header" />
  ),
});

// Lazy load Footer as it's below the fold
const Footer = dynamic(() => import("@/components/layout/Footer"), {
  loading: () => <div className="h-64 mt-10 animate-pulse bg-white/5" />,
});
import type { UserCapability } from "@/lib/types";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
  preload: false, // Reduce initial load
});

export const metadata: Metadata = {
  title: "KB Stylish",
  description: "KB Stylish — Nepal's premier multi-vendor fashion and style marketplace.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // TODO: Replace with real capability hydration from auth/session
  const guestCapabilities: UserCapability[] = [
    "view_shop",
    "view_about",
    "apply_vendor",
    "view_cart",
  ];
  return (
    <html lang="en" className="dark">
      <body className={`${inter.variable} antialiased`}>
        <Header capabilities={guestCapabilities} cartItemCount={3} />
        {children}
        <Footer />
      </body>
    </html>
  );
}
