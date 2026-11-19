import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const dir = join(import.meta.dirname, 'fixtures')

/** A real FreeTSA response recorded by `RECORD_FIXTURE=1 npm run verify:tsa`. */
export const freetsa = {
  data: new Uint8Array(readFileSync(join(dir, 'freetsa-data.bin'))),
  tsr: new Uint8Array(readFileSync(join(dir, 'freetsa-response.tsr'))),
  meta: JSON.parse(readFileSync(join(dir, 'freetsa-response.json'), 'utf8')) as {
    sha256: string
    nonce: string
    genTime: string
    serialNumber: string
  },
}

/** `openssl ts -query -digest <freetsa sha256> -sha256 -cert -no_nonce` */
export const opensslQueryNoNonce = new Uint8Array(readFileSync(join(dir, 'openssl-query-no-nonce.tsq')))

export const tinyJpeg = new Uint8Array(readFileSync(join(dir, 'tiny.jpg')))

export function tsrResponse(tsr: Uint8Array = freetsa.tsr, status = 200): Response {
  return new Response(tsr as Uint8Array<ArrayBuffer>, { status, headers: { 'Content-Type': 'application/timestamp-reply' } })
}
