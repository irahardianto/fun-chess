/// <reference types="vitest" />
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';

export default defineConfig({
  plugins: [
    vue(),
    VitePWA({
      registerType: 'autoUpdate',
      includeManifestIcons: false,
      manifest: {
        id: '/',
        name: 'Fun Chess! ♟️✨',
        short_name: 'FunChess',
        description:
          'Kid-friendly, offline-first chess academy and tactical puzzles with smart progress sync!',
        start_url: '/',
        scope: '/',
        theme_color: '#1e1e38',
        background_color: '#0f0f1b',
        display: 'standalone',
        orientation: 'portrait-primary',
        categories: ['games', 'education', 'kids', 'entertainment'],
        shortcuts: [
          {
            name: 'Quick Match',
            short_name: 'Play',
            description: 'Start a quick chess match vs AI or Friend',
            url: '/?mode=bot',
            icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }],
          },
          {
            name: 'Tactical Puzzles',
            short_name: 'Puzzles',
            description: 'Solve fun chess puzzles & tactical challenges',
            url: '/?mode=puzzles',
            icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }],
          },
          {
            name: 'Chess Academy',
            short_name: 'Academy',
            description: 'Interactive lessons and master classes',
            url: '/?mode=academy',
            icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }],
          },
        ],
        icons: [
          {
            src: '/icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: '/icons/maskable-icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,txt,woff2}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\/.*/, /^\/socket\.io\/.*/],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'google-fonts-stylesheets',
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-webfonts',
              expiration: {
                maxEntries: 30,
                maxAgeSeconds: 365 * 24 * 60 * 60, // 1 year
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            urlPattern: /^\/(api|socket\.io)\/.*/,
            handler: 'NetworkOnly',
          },
        ],
      },
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          // PERF: Partition stable framework dependencies to maximize long-term browser cache hit rates (HIGH-004)
          if (id.includes('node_modules/vue') || id.includes('node_modules/@vue/')) {
            return 'vendor-vue';
          }
          if (id.includes('node_modules/zod')) {
            return 'vendor-zod';
          }
          if (id.includes('node_modules/chess.js')) {
            return 'vendor-chess';
          }
          if (id.includes('node_modules/pako')) {
            return 'vendor-pako';
          }
          if (id.includes('node_modules/canvas-confetti')) {
            return 'vendor-confetti';
          }
          if (id.includes('node_modules/jsqr') || id.includes('node_modules/qrcode')) {
            return 'vendor-qr';
          }
          if (id.includes('node_modules/socket.io-client')) {
            return 'vendor-socket';
          }
          if (id.includes('/features/scenarios/data/')) {
            return 'curriculum-data';
          }
          if (id.includes('/features/puzzles/data/')) {
            return 'puzzles-data';
          }
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@fun-chess/shared': path.resolve(__dirname, '../../shared/src/index.ts'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://localhost:3000',
        ws: true,
      },
    },
  },
});


