import { describe, expect, it, vi } from 'vitest'
import { fetchTimestamp } from '../src/lib/stamp.ts'
import { toBase64, toHex } from '../src/lib/tsp.ts'
import { freetsa } from './fixtures.ts'

const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

describe('fetchTimestamp (browser side)', () => {
  it('sends only the hash and reads the time from the signed token', async () => {
    const fetchImpl = vi.fn(async (_u: string | URL | Request, _i?: RequestInit) =>
      // genTime in the reply is ignored on purpose; the token is the source of truth.
      reply({ provider: 'FreeTSA', tsr: toBase64(freetsa.tsr), genTime: '1999-01-01T00:00:00Z' }),
    )
    const r = await fetchTimestamp(freetsa.meta.sha256, fetchImpl as typeof fetch, '/api/timestamp')
    expect(JSON.parse(fetchImpl.mock.calls[0][1]?.body as string)).toEqual({ sha256: freetsa.meta.sha256 })
    expect(r.provider).toBe('FreeTSA')
    expect(r.genTime).toBe(freetsa.meta.genTime)
    expect(r.serialNumber).toBe(freetsa.meta.serialNumber)
    expect(toHex(r.tsr)).toBe(toHex(freetsa.tsr))
  })

  it('refuses a token for another photo', async () => {
    const fetchImpl = async () => reply({ provider: 'FreeTSA', tsr: toBase64(freetsa.tsr) })
    await expect(fetchTimestamp('11'.repeat(32), fetchImpl as typeof fetch)).rejects.toThrow(/different hash/)
  })

  it('gives plain reasons for offline and server errors', async () => {
    await expect(fetchTimestamp(freetsa.meta.sha256, (async () => { throw new TypeError('Failed to fetch') }) as typeof fetch)).rejects.toThrow(
      'No internet connection',
    )
    await expect(fetchTimestamp(freetsa.meta.sha256, (async () => reply({ error: 'No timestamp authority answered' }, 502)) as typeof fetch)).rejects.toThrow(
      'No timestamp authority answered',
    )
    await expect(fetchTimestamp(freetsa.meta.sha256, (async () => new Response('<html>', { status: 404 })) as typeof fetch)).rejects.toThrow(
      'Timestamp service error (404)',
    )
  })
})
