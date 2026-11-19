/// <reference types="vitest/config" />
import { fileURLToPath } from 'node:url'
import preact from '@preact/preset-vite'
import { defineConfig, type Plugin } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import { toNodeHandler } from './server/node.ts'
import { createTimestampHandler } from './server/timestamp.ts'

/** Serve the timestamp endpoint from `npm run dev` and `npm run preview`, so one command runs everything locally. */
function timestampEndpoint(): Plugin {
  const handler = toNodeHandler(createTimestampHandler())
  return {
    name: 'deposit-kit-timestamp-endpoint',
    configureServer(server) {
      server.middlewares.use('/api/timestamp', (req, res) => void handler(req, res))
    },
    configurePreviewServer(server) {
      server.middlewares.use('/api/timestamp', (req, res) => void handler(req, res))
    },
  }
}

const unused = fileURLToPath(new URL('./src/lib/unused-module.ts', import.meta.url))

export default defineConfig({
  resolve: {
    alias: { html2canvas: unused, dompurify: unused, canvg: unused },
  },
  plugins: [
    preact(),
    timestampEndpoint(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        navigateFallbackDenylist: [/^\/api\//],
      },
      manifest: {
        name: 'Deposit Kit',
        short_name: 'Deposit Kit',
        description: 'Prove your rental’s condition and get your security deposit back. Free, and your photos stay on your phone.',
        theme_color: '#0f766e',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        icons: [{ src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
})
