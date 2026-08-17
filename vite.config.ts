import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const buildId =
  (process.env.GITHUB_SHA ?? '').slice(0, 7) ||
  'dev-' + new Date().toISOString().slice(5, 16).replace('T', ' ');

export default defineConfig({
  define: {
    __BUILD_ID__: JSON.stringify(buildId),
  },
  base: '/poly-pro/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      manifest: {
        name: 'Poly Pro',
        short_name: 'PolyPro',
        description: 'Pro-grade metronome with recording and analytics',
        theme_color: '#0C0C0E',
        background_color: '#0C0C0E',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          {
            src: 'icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable',
          },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2,wav}'],
        // Activation is coordinated by updateCoordinator.ts so a deployment
        // can never reload the app during recording, analysis, import/export,
        // or instrument training.
        skipWaiting: false,
        clientsClaim: false,
        cleanupOutdatedCaches: true,
        navigateFallback: 'index.html',
        navigateFallbackAllowlist: [/^\/poly-pro\//],
      },
    }),
  ],
});
