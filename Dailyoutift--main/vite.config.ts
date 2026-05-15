import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        // Split heavy vendor libs into their own chunks so they can be
        // loaded only when actually needed (and cached separately by HTTP).
        manualChunks: (id) => {
          if (!id.includes('node_modules')) return undefined
          if (id.includes('openai')) return 'vendor-openai'
          if (id.includes('@google/generative-ai')) return 'vendor-gemini'
          if (id.includes('@supabase')) return 'vendor-supabase'
          if (id.includes('react') || id.includes('scheduler')) return 'vendor-react'
          if (id.includes('lucide-react')) return 'vendor-icons'
          return 'vendor'
        },
      },
    },
    chunkSizeWarningLimit: 700,
  },
  plugins: [
    react(),
    VitePWA({
      // iPad Safari was holding old app bundles too long. Auto-update makes the
      // newest deployment take control after a normal reload.
      registerType: 'autoUpdate',
      workbox: {
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest}'],
        navigateFallbackDenylist: [/^\/api/],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
      },
      manifest: {
        name: 'Daily Outfit Stylist',
        short_name: 'Stylist',
        description: 'Your personal AI outfit stylist',
        theme_color: '#2C2C2C',
        background_color: '#FAF7F2',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
    }),
  ],
  base: './',
  server: {
    allowedHosts: 'all',
    proxy: {
      '/ollama': {
        target: 'http://localhost:11434',
        rewrite: (path) => path.replace(/^\/ollama/, ''),
        changeOrigin: true,
      },
    },
  },
  define: {
    global: 'globalThis',
  },
})
