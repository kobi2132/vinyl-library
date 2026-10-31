import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }

const sha = (() => {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 7)
  try {
    return execSync('git rev-parse --short HEAD').toString().trim()
  } catch {
    return 'dev'
  }
})()

// Served from https://my-vinyl-library.jacob-apps.co.il/
export default defineConfig({
  base: '/',
  // local development: the API runs with `node server/server.mjs` (see server/README.md)
  server: { proxy: { '/api/app': 'http://localhost:8080' } },
  preview: { proxy: { '/api/app': 'http://localhost:8080' } },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    __BUILD_SHA__: JSON.stringify(sha),
  },
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
        // the text-recognition engine is large; download it only when catalogue scan is used
        globIgnores: ['ocr/**'],
        navigateFallbackDenylist: [/^\/__/, /^\/api\//, /\.html$/],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/ocr/'),
            handler: 'CacheFirst',
            options: { cacheName: 'ocr', cacheableResponse: { statuses: [200] } },
          },
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
