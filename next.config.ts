import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Performance optimizations
  reactStrictMode: true,
  
  // Image optimization
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'unsplash.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'http',
        hostname: 'localhost',
        port: '*',
        pathname: '/**',
      },
    ],
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 60 * 60 * 24 * 365, // 1 year
  },
  
  // Bundle optimization
  compiler: {
    // Preserve console.error in production for critical error visibility
    removeConsole: process.env.NODE_ENV === "production" ? { exclude: ["error"] } : false,
  },
  
  // Experimental features disabled to ensure stable builds
  // experimental: {
  //   optimizeCss: true,
  //   optimizePackageImports: [
  //     "lucide-react",
  //     "react-window",
  //     "@radix-ui/react-dialog",
  //     "@radix-ui/react-dropdown-menu",
  //   ],
  // },
  
  // Rely on Next.js defaults for code splitting
};

export default nextConfig;
