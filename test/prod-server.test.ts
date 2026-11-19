import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createAppServer, visitorScheme } from '../server/node.ts'
import type { IncomingMessage } from 'node:http'
import { RateLimiter } from '../server/rate-limit.ts'
import { createTimestampHandler } from '../server/timestamp.ts'
import { freetsa, tsrResponse } from './fixtures.ts'
import { fromHex } from '../src/lib/tsp.ts'

describe('RateLimiter', () => {
  it('allows a burst, then refills over time, per client', () => {
    let t = 0
    const rl = new RateLimiter({ capacity: 3, refillPerSecond: 1 }, { capacity: 100, refillPerSecond: 100 }, () => t)
    expect([rl.take('a'), rl.take('a'), rl.take('a')]).toEqual([0, 0, 0])
    expect(rl.take('a')).toBeGreaterThan(0)
    expect(rl.take('b')).toBe(0) // other clients are unaffected
    t += 1000
    expect(rl.take('a')).toBe(0)
  })

  it('caps the total across all clients', () => {
    const rl = new RateLimiter({ capacity: 10, refillPerSecond: 1 }, { capacity: 2, refillPerSecond: 1 }, () => 0)
    expect([rl.take('a'), rl.take('b')]).toEqual([0, 0])
    expect(rl.take('c')).toBeGreaterThan(0)
  })

  it('makes the endpoint answer 429 with Retry-After', async () => {
    const handler = createTimestampHandler({
      providers: [{ name: 'FreeTSA', url: 'https://x.example' }],
      fetchImpl: (async () => tsrResponse()) as typeof fetch,
      nonce: fromHex(freetsa.meta.nonce),
      limiter: new RateLimiter({ capacity: 1, refillPerSecond: 0.1 }, { capacity: 10, refillPerSecond: 1 }, () => 0),
    })
    const call = () => handler(new Request('http://x/api/timestamp', { method: 'POST', body: JSON.stringify({ sha256: freetsa.meta.sha256 }) }), '1.2.3.4')
    expect((await call()).status).toBe(200)
    const limited = await call()
    expect(limited.status).toBe(429)
    expect(limited.headers.get('Retry-After')).toBe('10')
  })
})

describe('production server', () => {
  let base = ''
  let close = () => {}
  beforeAll(async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dk-dist-'))
    mkdirSync(join(dir, 'assets'))
    writeFileSync(join(dir, 'index.html'), '<!doctype html><title>Deposit Kit</title>')
    writeFileSync(join(dir, 'assets', 'index-abc123.js'), 'console.log(1)')
    writeFileSync(join(dir, 'sw.js'), '//sw')
    writeFileSync(join(dir, 'privacy.html'), '<h1>Privacy policy</h1>')
    const server = createAppServer({ staticDir: dir, allowedOrigins: ['https://partner.example'] })
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    close = () => server.close()
  })
  afterAll(() => close())

  it('serves the app with security headers and the right caching', async () => {
    const page = await fetch(`${base}/`)
    expect(page.status).toBe(200)
    expect(page.headers.get('content-security-policy')).toContain("default-src 'self'")
    expect(page.headers.get('cache-control')).toBe('no-cache')
    const asset = await fetch(`${base}/assets/index-abc123.js`)
    expect(asset.headers.get('content-type')).toContain('text/javascript')
    expect(asset.headers.get('cache-control')).toContain('immutable')
    expect((await fetch(`${base}/sw.js`)).headers.get('cache-control')).toBe('no-cache')
  })

  it('falls back to the app for routes, but 404s missing files and path tricks', async () => {
    expect((await fetch(`${base}/some/route`)).status).toBe(200)
    expect(await (await fetch(`${base}/privacy`)).text()).toContain('Privacy policy')
    expect((await fetch(`${base}/assets/missing.js`)).status).toBe(404)
    expect((await fetch(`${base}/..%2f..%2fetc%2fpasswd`)).status).toBe(404)
    expect((await fetch(`${base}/%E0%A4%A`)).status).toBe(404)
  })

  it('answers health checks and only accepts a hash on the API', async () => {
    expect(await (await fetch(`${base}/api/health`)).text()).toBe('ok')
    const bad = await fetch(`${base}/api/timestamp`, { method: 'POST', body: '{"sha256":"nope"}' })
    expect(bad.status).toBe(400)
    const big = await fetch(`${base}/api/timestamp`, { method: 'POST', body: 'x'.repeat(5000) })
    expect(big.status).toBe(413)
  })

  it('only allows configured origins to call the API cross-origin', async () => {
    const pre = (origin: string) => fetch(`${base}/api/timestamp`, { method: 'OPTIONS', headers: { Origin: origin } })
    expect((await pre('https://partner.example')).headers.get('access-control-allow-origin')).toBe('https://partner.example')
    expect((await pre('https://evil.example')).headers.get('access-control-allow-origin')).toBeNull()
  })
})

describe('https handling behind Cloudflare', () => {
  const req = (headers: Record<string, string>) => ({ headers }) as unknown as IncomingMessage
  it('reads the visitor scheme from CF-Visitor, not from a plain-http proxy hop', () => {
    expect(visitorScheme(req({ 'cf-visitor': '{"scheme":"http"}' }))).toBe('http')
    expect(visitorScheme(req({ 'cf-visitor': '{"scheme":"https"}', 'x-forwarded-proto': 'http' }))).toBe('https')
    expect(visitorScheme(req({ 'x-forwarded-proto': 'http' }))).toBeUndefined()
    expect(visitorScheme(req({}))).toBeUndefined()
  })

  it('redirects http visitors to https only when behind a trusted proxy', async () => {
    const server = createAppServer({ trustProxy: true })
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
    const host = `127.0.0.1:${(server.address() as AddressInfo).port}` // fetch can't override Host
    const redirected = await fetch(`http://${host}/privacy?x=1`, { redirect: 'manual', headers: { 'CF-Visitor': '{"scheme":"http"}' } })
    expect(redirected.status).toBe(301)
    expect(redirected.headers.get('location')).toBe(`https://${host}/privacy?x=1`)
    const secure = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/health`, { headers: { 'CF-Visitor': '{"scheme":"https"}' } })
    expect(secure.status).toBe(200)
    expect(secure.headers.get('strict-transport-security')).toContain('max-age')
    server.close()
  })
})
