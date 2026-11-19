/// <reference types="vitest/config" />
import { fileURLToPath } from 'node:url'
import preact from '@preact/preset-vite'
import { defineConfig, type Plugin } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import { toNodeHandler } from './server/node.ts'
import { createTimestampHandler } from './server/timestamp.ts'
import { ensureDevCert } from './scripts/dev-cert.ts'

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

// `--mode phone` serves over HTTPS on the local network (see `npm run dev:phone`).
function phoneHttps(mode: string) {
  if (mode !== 'phone') return undefined
  const { key, cert, ips } = ensureDevCert()
  console.log(`\n  Phone testing: on a phone on the same Wi-Fi, open the https://${ips[0] ?? '<this-computer-ip>'} "Network" address below.`)
  console.log('  Your phone will warn that the certificate isn\'t trusted. That is expected for this local test.\n')
  return { key, cert }
}

export default defineConfig(({ mode }) => {
  const https = phoneHttps(mode)
  return {
  server: {
    https,
    // Lets a tunnel such as ngrok reach the dev server, if you choose to use one.
    allowedHosts: ['.ngrok-free.app', '.ngrok.app'],
  },
  preview: { https },
  resolve: {
    alias: { html2canvas: unused, dompurify: unused, canvg: unused },
  },
  plugins: [
    preact(),
    timestampEndpoint(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        // API calls and the help/privacy pages must not be replaced by the app shell offline.
        navigateFallbackDenylist: [/^\/api\//, /^\/(privacy|support)(\.html)?$/],
      },
      manifest: {
        id: '/',
        name: 'Deposit Kit',
        lang: 'en-US',
        categories: ['productivity', 'utilities', 'lifestyle'],
        short_name: 'Deposit Kit',
        description: 'Prove your rental’s condition and get your security deposit back. Free, and your photos stay on your phone.',
        theme_color: '#0f766e',
        background_color: '#f4f7f6',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
  }
})
