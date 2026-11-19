// Minimal Node server for the timestamp endpoint. No dependencies.
// Run: node server/node.ts   (Node 22.18+ runs TypeScript directly)
// Env: PORT (default 8787), ALLOWED_ORIGINS (comma-separated, only for cross-origin hosting)

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { createTimestampHandler } from './timestamp.ts'

const MAX_BODY = 1024

/** Adapt a web-standard handler to Node's http module. Shared with the Vite dev server. */
export function toNodeHandler(handler: (req: Request) => Promise<Response>) {
  return async (req: IncomingMessage, res: ServerResponse) => {
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
    const headers = new Headers()
    for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v)
    const hasBody = req.method !== 'GET' && req.method !== 'HEAD'
    const request = new Request(`http://localhost${req.url ?? '/'}`, {
      method: req.method,
      headers,
      body: hasBody ? Buffer.concat(chunks) : undefined,
    })
    const response = await handler(request)
    res.writeHead(response.status, Object.fromEntries(response.headers))
    res.end(Buffer.from(await response.arrayBuffer()))
  }
}

const isMain = import.meta.url === `file://${process.argv[1]}`
if (isMain) {
  const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',').map((s) => s.trim()).filter(Boolean)
  const timestamp = toNodeHandler(createTimestampHandler({ allowedOrigins }))
  const port = Number(process.env.PORT ?? 8787)
  createServer((req, res) => {
    const path = (req.url ?? '/').split('?')[0]
    if (path === '/api/timestamp') return void timestamp(req, res)
    if (path === '/api/health') return void res.writeHead(200, { 'Content-Type': 'text/plain' }).end('ok')
    res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found')
  }).listen(port, () => console.log(`Deposit Kit timestamp endpoint on http://localhost:${port}/api/timestamp`))
}
