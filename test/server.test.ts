import { describe, expect, it, vi } from 'vitest'
import { createTimestampHandler, requestTimestamp, type TsaProvider } from '../server/timestamp.ts'
import { fromHex, parseTimeStampResponse, toBase64, toHex } from '../src/lib/tsp.ts'
import { freetsa, tsrResponse } from './fixtures.ts'

const providers: TsaProvider[] = [
  { name: 'FreeTSA', url: 'https://freetsa.example/tsr' },
  { name: 'Backup', url: 'https://backup.example/tsr' },
]
const nonce = fromHex(freetsa.meta.nonce)
const hash = freetsa.meta.sha256

describe('requestTimestamp', () => {
  it('sends a DER query for the hash and returns the checked token', async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => tsrResponse())
    const r = await requestTimestamp(hash, { providers, fetchImpl: fetchImpl as typeof fetch, nonce })
    expect(r.provider).toBe('FreeTSA')
    expect(r.genTime.toISOString()).toBe(freetsa.meta.genTime)
    expect(toHex(r.tsr)).toBe(toHex(freetsa.tsr))

    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe(providers[0].url)
    expect(new Headers(init?.headers).get('Content-Type')).toBe('application/timestamp-query')
    const body = init?.body as Uint8Array
    expect(body.length).toBeLessThan(100) // a hash, never a photo
    expect(toHex(body)).toContain(hash)
    expect(toHex(body)).toContain(freetsa.meta.nonce)
  })

  it('falls back to the second authority when the first is down', async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      if (String(url) === providers[0].url) throw new TypeError('fetch failed')
      return tsrResponse()
    })
    const r = await requestTimestamp(hash, { providers, fetchImpl: fetchImpl as typeof fetch, nonce })
    expect(r.provider).toBe('Backup')
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('falls back when the first answers with an HTTP error or a token for the wrong hash', async () => {
    const http = vi.fn(async (url: string | URL | Request) => (String(url) === providers[0].url ? new Response('busy', { status: 503 }) : tsrResponse()))
    expect((await requestTimestamp(hash, { providers, fetchImpl: http as typeof fetch, nonce })).provider).toBe('Backup')

    const wrongNonce = vi.fn(async () => tsrResponse())
    await expect(
      requestTimestamp(hash, { providers, fetchImpl: wrongNonce as typeof fetch, nonce: fromHex('0102030405060708') }),
    ).rejects.toThrow(/FreeTSA: Timestamp nonce does not match.*Backup: Timestamp nonce does not match/)
  })

  it('reports every authority that failed', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('fetch failed')
    })
    await expect(requestTimestamp(hash, { providers, fetchImpl: fetchImpl as typeof fetch })).rejects.toThrow(
      'No timestamp authority answered (FreeTSA: fetch failed; Backup: fetch failed)',
    )
  })
})

describe('timestamp endpoint', () => {
  const ok = vi.fn(async () => tsrResponse()) as unknown as typeof fetch
  const handler = createTimestampHandler({ providers, fetchImpl: ok, nonce })
  const post = (body: string, headers: Record<string, string> = {}) =>
    handler(new Request('http://localhost/api/timestamp', { method: 'POST', body, headers: { 'Content-Type': 'application/json', ...headers } }))

  it('returns the token as base64 with its time', async () => {
    const res = await post(JSON.stringify({ sha256: hash.toUpperCase() }))
    expect(res.status).toBe(200)
    const json = (await res.json()) as { provider: string; tsr: string; genTime: string }
    expect(json.provider).toBe('FreeTSA')
    expect(json.genTime).toBe(freetsa.meta.genTime)
    expect(json.tsr).toBe(toBase64(freetsa.tsr))
    expect(parseTimeStampResponse(freetsa.tsr).tstInfo?.hashedMessage).toBe(hash)
  })

  it('rejects anything that is not a SHA-256 hash', async () => {
    expect((await post('{"sha256":"abc"}')).status).toBe(400)
    expect((await post('not json')).status).toBe(400)
    expect((await post(JSON.stringify({ sha256: hash, photo: 'x'.repeat(5000) }))).status).toBe(413)
    expect((await handler(new Request('http://localhost/api/timestamp'))).status).toBe(405)
  })

  it('returns 502 with a reason when no authority answers', async () => {
    const down = createTimestampHandler({ providers, fetchImpl: (async () => new Response('', { status: 500 })) as typeof fetch })
    const res = await down(new Request('http://x/api/timestamp', { method: 'POST', body: JSON.stringify({ sha256: hash }) }))
    expect(res.status).toBe(502)
    expect(((await res.json()) as { error: string }).error).toMatch(/No timestamp authority answered/)
  })

  it('only adds CORS headers for allowed origins', async () => {
    const h = createTimestampHandler({ providers, fetchImpl: ok, nonce, allowedOrigins: ['https://app.example'] })
    const req = (origin: string) =>
      h(new Request('http://x/api/timestamp', { method: 'POST', body: JSON.stringify({ sha256: hash }), headers: { Origin: origin } }))
    expect((await req('https://app.example')).headers.get('Access-Control-Allow-Origin')).toBe('https://app.example')
    expect((await req('https://evil.example')).headers.get('Access-Control-Allow-Origin')).toBeNull()
  })
})

describe('Node adapter', () => {
  it('ignores HTTP/2 pseudo-headers instead of crashing', async () => {
    const { toHeaders } = await import('../server/node.ts')
    const h = toHeaders({ ':method': 'POST', ':path': '/api/timestamp', 'content-type': 'application/json', 'x-list': ['a', 'b'] })
    expect(h.get('content-type')).toBe('application/json')
    expect(h.get('x-list')).toBe('a, b')
    expect([...h.keys()].some((k) => k.startsWith(':'))).toBe(false)
  })
})
