import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  server: {
    host: true, // <-- allow access from LAN
    allowedHosts: ['.ngrok-free.app'],
  },
  preview: {
    host: true,
    allowedHosts: ['.ngrok-free.app'],
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Precached so the launch screen and icons show even offline.
      includeAssets: ['logo.svg', 'favicon.svg', 'app-icon.png', 'app-icon-192.png', 'app-icon-512.png', 'app-icon-maskable-512.png'],
      devOptions: {
        enabled: true,
        type: 'module',
      },
      // Android uses background_color and the icon for its own launch screen:
      // white, like the in-app one (see index.html).
      manifest: {
        name: 'Order Manager Pro',
        short_name: 'Order Manager',
        theme_color: '#ffffff',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'app-icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'app-icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'app-icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'logo.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
      },
      workbox: {
        runtimeCaching: [
          {
            urlPattern: ({ url }: { url: URL }) => {
              return url.pathname.startsWith('/api/items')
            },
            // Shows the saved catalog instantly and refreshes it in the background,
            // so catalog changes (e.g. categories) show up on the next open.
            // A new cache name drops the old never-refreshed CacheFirst copy.
            handler: 'StaleWhileRevalidate' as const,
            options: {
              cacheName: 'items-cache',
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
    }),
  ],
})
