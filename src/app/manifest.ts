import type { MetadataRoute } from 'next';

/**
 * Web app manifest — gives Chrome/Brave/Android the high-res square icons they
 * use for new-tab shortcut tiles, home-screen installs, and PWA identity.
 * (The wide wordmark logo is NOT usable here: tiles require square icons.)
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'KB Stylish',
    short_name: 'KB Stylish',
    description:
      "KB Stylish — Nepal's premier multi-vendor fashion and style marketplace.",
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#1976D2',
    icons: [
      {
        src: '/icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
    ],
  };
}
