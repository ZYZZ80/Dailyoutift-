import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
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
