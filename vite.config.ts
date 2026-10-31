import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// Served from https://my-vinyl-library.jacob-apps.co.il/
export default defineConfig({
  base: '/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'logo.svg', 'about.html', 'privacy.html', 'terms.html', 'legal.css'],
      manifest: {
        name: 'My Vinyl Library',
        short_name: 'My Vinyl',
        description: 'ניהול אוסף תקליטים אישי עם סריקת ברקוד',
        lang: 'he',
        dir: 'rtl',
        theme_color: '#14110e',
        background_color: '#14110e',
        display: 'standalone',
        start_url: '.',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,wasm}'],
        navigateFallbackDenylist: [/^\/__/, /^\/api\//, /\.html$/],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/(coverartarchive\.org|archive\.org|.*\.archive\.org)\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'covers',
              expiration: { maxEntries: 2000, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
})
