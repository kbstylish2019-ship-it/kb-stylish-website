import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import type { UserCapability } from "@/lib/types";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
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
