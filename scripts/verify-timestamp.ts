// End-to-end check against the real FreeTSA service:
// hash a file, get a token through the same code the endpoint uses, then verify
// it with `openssl ts -verify` and FreeTSA's certificates.
//
// Run: npm run verify:tsa            (random test data)
//      npm run verify:tsa -- photo.jpg
//      RECORD_FIXTURE=1 npm run verify:tsa   (also refresh test/fixtures)

import { execFileSync } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { mkdtempSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { requestTimestamp, DEFAULT_PROVIDERS } from '../server/timestamp.ts'

const root = resolve(import.meta.dirname, '..')
const certs = join(root, 'src/assets/tsa')
const dir = mkdtempSync(join(tmpdir(), 'deposit-kit-tsa-'))

const input = process.argv[2]
const data = input ? readFileSync(input) : Buffer.concat([Buffer.from('Deposit Kit test photo '), randomBytes(32)])
const dataPath = join(dir, 'data.bin')
writeFileSync(dataPath, data)
const sha256 = createHash('sha256').update(data).digest('hex')
console.log(`SHA-256 ${sha256}`)

const nonce = Uint8Array.from(randomBytes(8))
nonce[0] = (nonce[0] & 0x7f) | 1
const result = await requestTimestamp(sha256, { providers: [DEFAULT_PROVIDERS[0]], nonce })
const tsrPath = join(dir, 'data.tsr')
writeFileSync(tsrPath, result.tsr)
console.log(`${result.provider} time ${result.genTime.toISOString()} serial ${result.serialNumber}`)

const out = execFileSync(
  'openssl',
  ['ts', '-verify', '-data', dataPath, '-in', tsrPath, '-CAfile', join(certs, 'freetsa-cacert.pem'), '-untrusted', join(certs, 'freetsa-tsa.crt')],
  { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
)
console.log(out.trim())
if (!/Verification: OK/.test(out)) process.exit(1)

if (process.env.RECORD_FIXTURE) {
  const fixtures = join(root, 'test/fixtures')
  copyFileSync(dataPath, join(fixtures, 'freetsa-data.bin'))
  copyFileSync(tsrPath, join(fixtures, 'freetsa-response.tsr'))
  writeFileSync(
    join(fixtures, 'freetsa-response.json'),
    JSON.stringify({ sha256, nonce: Buffer.from(nonce).toString('hex'), genTime: result.genTime.toISOString(), serialNumber: result.serialNumber }, null, 2) + '\n',
  )
  console.log('Fixture recorded in test/fixtures')
}
