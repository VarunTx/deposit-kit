import { describe, expect, it } from 'vitest'
import { buildTimeStampRequest, checkTimeStampResponse, fromHex, parseTimeStampResponse, toHex, fromBase64, toBase64 } from '../src/lib/tsp.ts'
import { sha256Hex } from '../src/lib/hash.ts'
import { freetsa, opensslQueryNoNonce } from './fixtures.ts'

describe('hashing', () => {
  it('matches the SHA-256 test vector for "abc"', async () => {
    expect(await sha256Hex(new TextEncoder().encode('abc'))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })

  it('hashes a Blob the same as its bytes', async () => {
    const bytes = new TextEncoder().encode('scratch on floor by window')
    expect(await sha256Hex(new Blob([bytes]))).toBe(await sha256Hex(bytes))
  })

  it('agrees with the hash FreeTSA signed for the recorded data', async () => {
    expect(await sha256Hex(freetsa.data)).toBe(freetsa.meta.sha256)
  })
})

describe('timestamp request', () => {
  it('is byte-for-byte what OpenSSL builds', () => {
    const req = buildTimeStampRequest(fromHex(freetsa.meta.sha256), { certReq: true })
    expect(toHex(req)).toBe(toHex(opensslQueryNoNonce))
  })

  it('includes a nonce as a positive INTEGER', () => {
    const req = buildTimeStampRequest(new Uint8Array(32), { nonce: fromHex('8000000000000001') })
    // 0x80 high bit means a leading zero byte must be added: 02 09 00 80 ...
    expect(toHex(req)).toContain('0209008000000000000001')
  })

  it('rejects a hash that is not 32 bytes', () => {
    expect(() => buildTimeStampRequest(new Uint8Array(20))).toThrow()
  })
})

describe('timestamp response (recorded from FreeTSA)', () => {
  it('reads status, hash, time, serial and nonce', () => {
    const r = parseTimeStampResponse(freetsa.tsr)
    expect(r.status).toBe(0)
    expect(r.token?.[0]).toBe(0x30)
    expect(r.tstInfo?.hashAlgorithm).toBe('sha256')
    expect(r.tstInfo?.hashedMessage).toBe(freetsa.meta.sha256)
    expect(r.tstInfo?.genTime.toISOString()).toBe(freetsa.meta.genTime)
    expect(r.tstInfo?.serialNumber).toBe(freetsa.meta.serialNumber)
    expect(r.tstInfo?.nonce).toBe(freetsa.meta.nonce)
  })

  it('accepts the token for the right hash and nonce', () => {
    const info = checkTimeStampResponse(freetsa.tsr, freetsa.meta.sha256, freetsa.meta.nonce)
    expect(info.genTime.toISOString()).toBe(freetsa.meta.genTime)
  })

  it('refuses a token for a different hash', () => {
    expect(() => checkTimeStampResponse(freetsa.tsr, '00'.repeat(32))).toThrow(/different hash/)
  })

  it('refuses a token with a different nonce', () => {
    expect(() => checkTimeStampResponse(freetsa.tsr, freetsa.meta.sha256, '0102030405060708')).toThrow(/nonce/)
  })

  it('reports a rejection from the authority', () => {
    // TimeStampResp { status { rejection(2), statusString { "bad request" } } }
    const text = new TextEncoder().encode('bad request')
    const statusString = Uint8Array.of(0x30, text.length + 2, 0x0c, text.length, ...text)
    const statusInfo = Uint8Array.of(0x30, 3 + statusString.length, 0x02, 0x01, 0x02, ...statusString)
    const resp = Uint8Array.of(0x30, statusInfo.length, ...statusInfo)
    expect(parseTimeStampResponse(resp)).toEqual({ status: 2, statusText: 'bad request' })
    expect(() => checkTimeStampResponse(resp, freetsa.meta.sha256)).toThrow(/refused \(status 2: bad request\)/)
  })

  it('throws on cut-off data instead of returning garbage', () => {
    expect(() => parseTimeStampResponse(freetsa.tsr.subarray(0, 200))).toThrow()
    expect(() => parseTimeStampResponse(new Uint8Array())).toThrow()
  })

  it('round-trips through base64', () => {
    expect(toHex(fromBase64(toBase64(freetsa.tsr)))).toBe(toHex(freetsa.tsr))
  })
})
