// Production server: the built app (dist/) plus the timestamp endpoint, in one
// small Node process with no dependencies. Run: node server/node.ts
// (Node 22.18+ runs TypeScript directly).
//
// Env:
//   PORT              default 8080
//   STATIC_DIR        default ./dist (set to "" to serve only the API)
//   TRUST_PROXY=1     read the client IP from X-Forwarded-For / CF-Connecting-IP
//                     (set this behind Traefik/Dokploy or Cloudflare)
//   ALLOWED_ORIGINS   origins allowed to call the API cross-origin (not needed
//                     when the app and API share one domain)

import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { extname, join, normalize, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createTimestampHandler } from './timestamp.ts'
import { defaultLimiter } from './rate-limit.ts'

const MAX_BODY = 1024

type Handler = (req: Request, clientIp?: string) => Promise<Response>

/** Adapt a web-standard handler to Node's http module. Shared with the Vite dev server. */
export function toNodeHandler(handler: Handler, getIp: (req: IncomingMessage) => string = (r) => r.socket.remoteAddress ?? 'unknown') {
  return async (req: IncomingMessage, res: ServerResponse) => {
    // Never let one bad request take the whole server down.
    try {
      const chunks: Buffer[] = []
      let size = 0
      for await (const chunk of req) {
        size += (chunk as Buffer).length
        if (size > MAX_BODY) {
          res.writeHead(413, { 'Content-Type': 'application/json' }).end('{"error":"Send only a hash"}')
          return
        }
        chunks.push(chunk as Buffer)
      }
      const request = new Request(`http://localhost${req.url ?? '/'}`, {
        method: req.method,
        headers: toHeaders(req.headers),
        body: req.method !== 'GET' && req.method !== 'HEAD' ? Buffer.concat(chunks) : undefined,
      })
      const response = await handler(request, getIp(req))
      res.writeHead(response.status, { ...SECURITY_HEADERS, ...Object.fromEntries(response.headers) })
      res.end(Buffer.from(await response.arrayBuffer()))
    } catch {
      if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end('{"error":"Timestamp failed"}')
    }
  }
}

/** Node headers to web Headers. Skips HTTP/2 pseudo-headers (":method", ":path"), which Headers rejects. */
export function toHeaders(raw: IncomingMessage['headers']): Headers {
  const headers = new Headers()
  for (const [k, v] of Object.entries(raw)) {
    if (k.startsWith(':') || v === undefined) continue
    headers.set(k, Array.isArray(v) ? v.join(', ') : v)
  }
  return headers
}

export function clientIp(req: IncomingMessage, trustProxy: boolean): string {
  if (trustProxy) {
    const cf = req.headers['cf-connecting-ip']
    if (typeof cf === 'string' && cf) return cf.trim()
    const xff = req.headers['x-forwarded-for']
    const first = (Array.isArray(xff) ? xff[0] : xff)?.split(',')[0]?.trim()
    if (first) return first
  }
  return req.socket.remoteAddress ?? 'unknown'
}

export const SECURITY_HEADERS: Record<string, string> = {
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "connect-src 'self'",
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; '),
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'geolocation=(), microphone=(), interest-cohort=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.pem': 'text/plain; charset=utf-8',
  '.crt': 'text/plain; charset=utf-8',
}

/** Serve a built file, falling back to index.html for app routes. Returns false if nothing matched. */
export function serveStatic(root: string, req: IncomingMessage, res: ServerResponse): boolean {
  if (req.method !== 'GET' && req.method !== 'HEAD') return false
  let path: string
  try {
    path = decodeURIComponent((req.url ?? '/').split('?')[0])
  } catch {
    return false
  }
  const target = normalize(join(root, path))
  if (target !== root && !target.startsWith(root + sep)) return false // path traversal
  let file = target
  if (!existsSync(file) || statSync(file).isDirectory()) {
    if (extname(path)) return false // a missing asset is a real 404
    // "/privacy" → privacy.html; anything else is an app route.
    file = path !== '/' && existsSync(`${target}.html`) ? `${target}.html` : join(root, 'index.html')
  }
  if (!existsSync(file)) return false
  const name = file.slice(root.length)
  const cache = name.startsWith(`${sep}assets${sep}`)
    ? 'public, max-age=31536000, immutable' // content-hashed names
    : /(?:sw\.js|registerSW\.js|workbox-[^/]*\.js|index\.html|\.webmanifest)$/.test(name)
      ? 'no-cache' // must update promptly
      : 'public, max-age=3600'
  res.writeHead(200, {
    ...SECURITY_HEADERS,
    'Content-Type': MIME[extname(file)] ?? 'application/octet-stream',
    'Cache-Control': cache,
    'Content-Length': String(statSync(file).size),
  })
  if (req.method === 'HEAD') res.end()
  else createReadStream(file).pipe(res)
  return true
}

export function createAppServer(opts: { staticDir?: string; trustProxy?: boolean; allowedOrigins?: string[] } = {}) {
  const trustProxy = opts.trustProxy ?? false
  const timestamp = toNodeHandler(
    createTimestampHandler({ allowedOrigins: opts.allowedOrigins, limiter: defaultLimiter() }),
    (r) => clientIp(r, trustProxy),
  )
  const root = opts.staticDir ? resolve(opts.staticDir) : ''
  return createServer((req, res) => {
    const path = (req.url ?? '/').split('?')[0]
    if (path === '/api/timestamp') return void timestamp(req, res)
    if (path === '/api/health') return void res.writeHead(200, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' }).end('ok')
    if (root && serveStatic(root, req, res)) return
    res.writeHead(404, { ...SECURITY_HEADERS, 'Content-Type': 'text/plain' }).end('Not found')
  })
}

const isMain = !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) {
  const staticDir = process.env.STATIC_DIR ?? resolve(import.meta.dirname, '..', 'dist')
  const port = Number(process.env.PORT ?? 8080)
  createAppServer({
    staticDir: staticDir && existsSync(staticDir) ? staticDir : undefined,
    trustProxy: process.env.TRUST_PROXY === '1',
    allowedOrigins: process.env.ALLOWED_ORIGINS?.split(',').map((s) => s.trim()).filter(Boolean),
  }).listen(port, () => console.log(`Deposit Kit on http://localhost:${port} (static: ${staticDir || 'off'})`))
}
