// @ts-check
import { defineConfig } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';
import AstroPWA from '@vite-pwa/astro';

// https://astro.build/config
export default defineConfig({
  output: 'static',
  integrations: [
    AstroPWA({
      registerType: 'prompt',
      manifest: {
        name: 'Tinya Point — Punto de venta',
        short_name: 'Tinya Point',
        lang: 'es',
        start_url: '/',
        display: 'standalone',
        // Literal token values (doc/stilesbase.md §2): --color-primary / --color-bg —
        // manifests can't read CSS custom properties, so these two hexes are the
        // ONLY place where token values are repeated (grep gate in Fase 8 covers src/).
        theme_color: '#1C4E80',
        background_color: '#F7F5F1',
        icons: [
          {
            src: '/icons/pwa-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable',
          },
          {
            src: '/icons/pwa-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        // App shell precache: HTML/CSS/JS + Atkinson woff2 (doc/extras.md §2).
        globPatterns: ['**/*.{js,css,html,woff2}'],
        // Multi-page static site: all 3 HTML files are precached above.
        // No SPA fallback — an unknown route offline must fail, not fake the homepage.
        navigateFallback: null,
        // Cloudinary images: show cached instantly, refresh in background (§2).
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/res\.cloudinary\.com\//,
            handler: 'StaleWhileRevalidate',
          },
        ],
        // Apps Script calls are NEVER cached by the SW: they don't match any
        // rule above (precache globs are local dist files only; runtime rule is
        // Cloudinary-only), so they stay network-only. Their own freshness is
        // owned by `catalogo_cache` + TTL in localStorage (doc/extras.md §2).
      },
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
});
