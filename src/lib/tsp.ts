// RFC 3161 time-stamp protocol: build a request and read a response.
// Pure TypeScript with no DOM or Node APIs, so the browser and the server share it.
// It reads the token's fields; it does not check the TSA's signature. That check is
// done offline with `openssl ts -verify` (see README.txt in the export).

const OID_SHA256 = '2.16.840.1.101.3.4.2.1'
const OID_SIGNED_DATA = '1.2.840.113549.1.7.2'
const OID_TST_INFO = '1.2.840.113549.1.9.16.1.4'

// ---------- DER writing ----------

function encodeLength(len: number): Uint8Array {
  if (len < 0x80) return Uint8Array.of(len)
  const bytes: number[] = []
  while (len > 0) {
    bytes.unshift(len & 0xff)
    len = Math.floor(len / 256)
  }
  return Uint8Array.of(0x80 | bytes.length, ...bytes)
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let off = 0
  for (const p of parts) {
    out.set(p, off)
    off += p.length
  }
  return out
}

function tlv(tag: number, ...content: Uint8Array[]): Uint8Array {
  const body = concat(content)
  return concat([Uint8Array.of(tag), encodeLength(body.length), body])
}

function encodeOid(oid: string): Uint8Array {
  const parts = oid.split('.').map(Number)
  const out: number[] = [parts[0] * 40 + parts[1]]
  for (const n of parts.slice(2)) {
    const chunk: number[] = [n & 0x7f]
    let v = Math.floor(n / 128)
    while (v > 0) {
      chunk.unshift((v & 0x7f) | 0x80)
      v = Math.floor(v / 128)
    }
    out.push(...chunk)
  }
  return tlv(0x06, Uint8Array.from(out))
}

/** sha256 AlgorithmIdentifier with explicit NULL parameters, as OpenSSL sends it. */
function sha256AlgorithmId(): Uint8Array {
  return tlv(0x30, encodeOid(OID_SHA256), Uint8Array.of(0x05, 0x00))
}

/** A positive DER INTEGER from big-endian bytes (minimal encoding). */
function encodePositiveInteger(bytes: Uint8Array): Uint8Array {
  let start = 0
  while (start < bytes.length - 1 && bytes[start] === 0) start++
  let body = bytes.subarray(start)
  if (body[0] & 0x80) body = concat([Uint8Array.of(0), body])
  return tlv(0x02, body)
}

export interface TimeStampRequestOptions {
  /** Random nonce bytes; the response must echo them. */
  nonce?: Uint8Array
  /** Ask the TSA to include its certificate in the token (needed for offline checks). Default true. */
  certReq?: boolean
}

/** Build a DER TimeStampReq for a SHA-256 digest (RFC 3161 section 2.4.1). */
export function buildTimeStampRequest(sha256: Uint8Array, opts: TimeStampRequestOptions = {}): Uint8Array {
  if (sha256.length !== 32) throw new Error('A SHA-256 hash must be 32 bytes')
  const parts: Uint8Array[] = [
    tlv(0x02, Uint8Array.of(1)), // version v1
    tlv(0x30, sha256AlgorithmId(), tlv(0x04, sha256)), // messageImprint
  ]
  if (opts.nonce) parts.push(encodePositiveInteger(opts.nonce))
  if (opts.certReq ?? true) parts.push(Uint8Array.of(0x01, 0x01, 0xff))
  return tlv(0x30, ...parts)
}

// ---------- DER reading ----------

interface Node {
  tag: number
  /** Offset of the tag byte in the source buffer. */
  start: number
  /** Offset of the first content byte. */
  contentStart: number
  /** Offset just past the content. */
  end: number
  bytes: Uint8Array
}

function readNode(buf: Uint8Array, offset: number): Node {
  if (offset + 2 > buf.length) throw new Error('Timestamp data is cut short')
  const tag = buf[offset]
  if ((tag & 0x1f) === 0x1f) throw new Error('Unsupported ASN.1 tag')
  let pos = offset + 1
  let len = buf[pos++]
  if (len === 0x80) throw new Error('Indefinite-length encoding is not supported')
  if (len & 0x80) {
    const n = len & 0x7f
    if (n > 4 || pos + n > buf.length) throw new Error('Bad ASN.1 length')
    len = 0
    for (let i = 0; i < n; i++) len = len * 256 + buf[pos++]
  }
  const end = pos + len
  if (end > buf.length) throw new Error('Timestamp data is cut short')
  return { tag, start: offset, contentStart: pos, end, bytes: buf }
}

function content(n: Node): Uint8Array {
  return n.bytes.subarray(n.contentStart, n.end)
}

function children(n: Node): Node[] {
  const out: Node[] = []
  let off = n.contentStart
  while (off < n.end) {
    const c = readNode(n.bytes, off)
    out.push(c)
    off = c.end
  }
  return out
}

function expect(n: Node | undefined, tag: number, what: string): Node {
  if (!n || n.tag !== tag) throw new Error(`Unexpected timestamp format (${what})`)
  return n
}

function decodeOid(bytes: Uint8Array): string {
  const first = bytes[0]
  const parts = [Math.floor(first / 40), first % 40]
  let v = 0
  for (let i = 1; i < bytes.length; i++) {
    v = v * 128 + (bytes[i] & 0x7f)
    if (!(bytes[i] & 0x80)) {
      parts.push(v)
      v = 0
    }
  }
  return parts.join('.')
}

function decodeSmallInt(bytes: Uint8Array): number {
  let v = 0
  for (const b of bytes) v = v * 256 + b
  return v
}

export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

export function fromHex(hex: string): Uint8Array {
  if (!/^(?:[0-9a-fA-F]{2})*$/.test(hex)) throw new Error('Not a hex string')
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return out
}

/** Strip leading zero bytes so INTEGERs compare by value. */
function intHex(bytes: Uint8Array): string {
  let i = 0
  while (i < bytes.length - 1 && bytes[i] === 0) i++
  return toHex(bytes.subarray(i))
}

function parseGeneralizedTime(bytes: Uint8Array): Date {
  const s = new TextDecoder().decode(bytes)
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(?:\.(\d+))?Z$/.exec(s)
  if (!m) throw new Error(`Unsupported time format: ${s}`)
  const ms = m[7] ? Math.round(Number(`0.${m[7]}`) * 1000) : 0
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6], ms))
}

export interface TstInfo {
  policy: string
  hashAlgorithm: string
  /** The hash the TSA signed, as lowercase hex. */
  hashedMessage: string
  serialNumber: string
  genTime: Date
  /** Echoed nonce as hex without leading zeros, if present. */
  nonce?: string
}

export interface TimeStampResponse {
  /** PKIStatus: 0 granted, 1 granted with mods, 2 rejection, 3 waiting, 4/5 revocation. */
  status: number
  statusText?: string
  /** The token (CMS ContentInfo) DER, if one was returned. */
  token?: Uint8Array
  tstInfo?: TstInfo
}

/** Read a DER TimeStampResp (what TSAs return and what `.tsr` files hold). */
export function parseTimeStampResponse(der: Uint8Array): TimeStampResponse {
  const root = expect(readNode(der, 0), 0x30, 'response')
  const [statusInfo, tokenNode] = children(root)
  const statusParts = children(expect(statusInfo, 0x30, 'status'))
  const status = decodeSmallInt(content(expect(statusParts[0], 0x02, 'status code')))
  let statusText: string | undefined
  if (statusParts[1]?.tag === 0x30) {
    statusText = children(statusParts[1])
      .map((c) => new TextDecoder().decode(content(c)))
      .join('; ')
  }
  if (!tokenNode) return { status, statusText }

  const token = der.slice(tokenNode.start, tokenNode.end)
  const [ctOid, ctContent] = children(expect(tokenNode, 0x30, 'token'))
  if (decodeOid(content(expect(ctOid, 0x06, 'content type'))) !== OID_SIGNED_DATA) {
    throw new Error('Timestamp token is not CMS SignedData')
  }
  const signedData = expect(children(expect(ctContent, 0xa0, 'signed data wrapper'))[0], 0x30, 'signed data')
  const encap = expect(children(signedData)[2], 0x30, 'encapsulated content')
  const [eType, eContentWrap] = children(encap)
  if (decodeOid(content(expect(eType, 0x06, 'eContentType'))) !== OID_TST_INFO) {
    throw new Error('Timestamp token does not hold TSTInfo')
  }
  const octets = expect(children(expect(eContentWrap, 0xa0, 'eContent wrapper'))[0], 0x04, 'eContent')
  const tst = expect(readNode(content(octets), 0), 0x30, 'TSTInfo')
  const f = children(tst)
  const policy = decodeOid(content(expect(f[1], 0x06, 'policy')))
  const [alg, hashed] = children(expect(f[2], 0x30, 'message imprint'))
  const hashAlgorithm = decodeOid(content(expect(children(expect(alg, 0x30, 'hash algorithm'))[0], 0x06, 'hash OID')))
  const hashedMessage = toHex(content(expect(hashed, 0x04, 'hashed message')))
  const serialNumber = intHex(content(expect(f[3], 0x02, 'serial number')))
  const genTime = parseGeneralizedTime(content(expect(f[4], 0x18, 'genTime')))
  // Optional fields after genTime: accuracy (SEQUENCE), ordering (BOOLEAN), nonce (INTEGER), tsa [0], extensions [1].
  let nonce: string | undefined
  for (const opt of f.slice(5)) if (opt.tag === 0x02) nonce = intHex(content(opt))

  return {
    status,
    statusText,
    token,
    tstInfo: {
      policy,
      hashAlgorithm: hashAlgorithm === OID_SHA256 ? 'sha256' : hashAlgorithm,
      hashedMessage,
      serialNumber,
      genTime,
      nonce,
    },
  }
}

/**
 * Check that a response grants a timestamp for exactly this hash (and nonce, if given).
 * Returns the parsed TSTInfo or throws with a plain reason.
 */
export function checkTimeStampResponse(der: Uint8Array, sha256Hex: string, nonceHex?: string): TstInfo {
  const resp = parseTimeStampResponse(der)
  if (resp.status !== 0 && resp.status !== 1) {
    throw new Error(`Timestamp refused (status ${resp.status}${resp.statusText ? `: ${resp.statusText}` : ''})`)
  }
  const info = resp.tstInfo
  if (!info) throw new Error('Timestamp response has no token')
  if (info.hashAlgorithm !== 'sha256') throw new Error('Timestamp uses an unexpected hash algorithm')
  if (info.hashedMessage !== sha256Hex.toLowerCase()) throw new Error('Timestamp is for a different hash')
  if (nonceHex !== undefined && info.nonce !== intHex(fromHex(nonceHex))) {
    throw new Error('Timestamp nonce does not match the request')
  }
  return info
}

/** Base64 helpers that work in browsers and Node without Buffer. */
export function toBase64(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

export function fromBase64(b64: string): Uint8Array {
  const s = atob(b64)
  const out = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i)
  return out
}
