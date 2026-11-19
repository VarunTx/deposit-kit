// Timestamp proxy. Browsers can't call RFC 3161 authorities directly (no CORS),
// so this endpoint takes a SHA-256 hash, asks an authority to timestamp it, and
// returns the signed token. It never receives photos and stores nothing.
//
// Written against the web-standard Request/Response API so the same code runs
// under Node (server/node.ts), the Vite dev server, or a serverless runtime.

import { buildTimeStampRequest, checkTimeStampResponse, toBase64, toHex, fromHex } from '../src/lib/tsp.ts'

export interface TsaProvider {
  /** Short name saved with each photo, e.g. "FreeTSA". */
  name: string
  url: string
}

/** Tried in order. The second is used only if the first fails. */
export const DEFAULT_PROVIDERS: TsaProvider[] = [
  { name: 'FreeTSA', url: 'https://freetsa.org/tsr' },
  { name: 'DigiCert', url: 'http://timestamp.digicert.com' },
]

export interface TimestampResult {
  provider: string
  /** The full TimeStampResp, as saved in `.tsr` files. */
  tsr: Uint8Array
  genTime: Date
  serialNumber: string
}

export interface TimestampOptions {
  providers?: TsaProvider[]
  fetchImpl?: typeof fetch
  timeoutMs?: number
  /** For tests: fixed nonce bytes. */
  nonce?: Uint8Array
}

function randomNonce(): Uint8Array {
  const n = crypto.getRandomValues(new Uint8Array(8))
  n[0] = (n[0] & 0x7f) | 0x01 // positive and minimal as a DER INTEGER
  return n
}

/** Ask each provider in turn until one returns a valid token for this hash. */
export async function requestTimestamp(sha256Hex: string, opts: TimestampOptions = {}): Promise<TimestampResult> {
  const providers = opts.providers ?? DEFAULT_PROVIDERS
  const doFetch = opts.fetchImpl ?? fetch
  const hash = fromHex(sha256Hex)
  const errors: string[] = []

  for (const provider of providers) {
    const nonce = opts.nonce ?? randomNonce()
    const body = buildTimeStampRequest(hash, { nonce, certReq: true })
    try {
      const res = await doFetch(provider.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/timestamp-query', Accept: 'application/timestamp-reply' },
        body: body as Uint8Array<ArrayBuffer>,
        signal: AbortSignal.timeout(opts.timeoutMs ?? 15000),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const tsr = new Uint8Array(await res.arrayBuffer())
      const info = checkTimeStampResponse(tsr, sha256Hex, toHex(nonce))
      return { provider: provider.name, tsr, genTime: info.genTime, serialNumber: info.serialNumber }
    } catch (err) {
      errors.push(`${provider.name}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  throw new Error(`No timestamp authority answered (${errors.join('; ')})`)
}

export interface HandlerOptions extends TimestampOptions {
  /** Origins allowed to call from another site. Same-origin needs nothing. */
  allowedOrigins?: string[]
}

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers },
  })
}

/**
 * POST /api/timestamp  {"sha256": "<64 hex chars>"}
 * 200 {"provider", "tsr" (base64 TimeStampResp), "genTime" (ISO), "serialNumber"}
 */
export function createTimestampHandler(opts: HandlerOptions = {}): (req: Request) => Promise<Response> {
  return async (req) => {
    const origin = req.headers.get('Origin')
    const cors: Record<string, string> =
      origin && opts.allowedOrigins?.includes(origin)
        ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'Content-Type', Vary: 'Origin' }
        : {}
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
    if (req.method !== 'POST') return json(405, { error: 'Use POST' }, { ...cors, Allow: 'POST, OPTIONS' })

    const text = await req.text()
    if (text.length > 1024) return json(413, { error: 'Send only a hash' }, cors)
    let sha256: unknown
    try {
      sha256 = (JSON.parse(text) as { sha256?: unknown }).sha256
    } catch {
      return json(400, { error: 'Body must be JSON' }, cors)
    }
    if (typeof sha256 !== 'string' || !/^[0-9a-f]{64}$/i.test(sha256)) {
      return json(400, { error: 'sha256 must be 64 hex characters' }, cors)
    }

    try {
      const r = await requestTimestamp(sha256.toLowerCase(), opts)
      return json(
        200,
        { provider: r.provider, tsr: toBase64(r.tsr), genTime: r.genTime.toISOString(), serialNumber: r.serialNumber },
        cors,
      )
    } catch (err) {
      return json(502, { error: err instanceof Error ? err.message : 'Timestamp failed' }, cors)
    }
  }
}
