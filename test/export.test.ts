import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { unzipSync, strFromU8 } from 'fflate'
import { describe, expect, it } from 'vitest'
import { buildManifest, buildZip, exportBaseName, extensionFor, slug, type Manifest } from '../src/lib/export.ts'
import { buildPdf, pdfSafe } from '../src/lib/pdf.ts'
import { fitWithin } from '../src/lib/image.ts'
import { sha256Hex } from '../src/lib/hash.ts'
import type { Photo, Property, Room } from '../src/lib/types.ts'
import { freetsa, tinyJpeg } from './fixtures.ts'

const property: Property = { id: 'p1', label: 'Apt 4B, 120 Main St', moveInDate: '2026-11-18', state: 'CA', createdAt: '2026-11-18T10:00:00.000Z' }
const rooms: Room[] = [
  { id: 'r1', propertyId: 'p1', name: 'Kitchen', order: 1, createdAt: '' },
  { id: 'r2', propertyId: 'p1', name: 'Living room', order: 2, createdAt: '' },
  { id: 'r3', propertyId: 'p1', name: 'Bedroom', order: 3, createdAt: '' },
]

const stamped: Photo = {
  id: 'a',
  propertyId: 'p1',
  roomId: 'r1',
  addedAt: '2026-11-18T10:01:00.000Z',
  fileName: 'IMG_0001.JPEG',
  fileLastModified: Date.parse('2026-11-18T10:00:59.000Z'),
  original: new Blob([freetsa.data], { type: 'image/jpeg' }),
  display: new Blob([tinyJpeg], { type: 'image/jpeg' }),
  width: 48,
  height: 32,
  sha256: freetsa.meta.sha256,
  note: 'Scratch on floor by window — about 10 cm',
  stamp: { status: 'stamped', attempts: 1, provider: 'FreeTSA', genTime: freetsa.meta.genTime, serialNumber: freetsa.meta.serialNumber, tsr: freetsa.tsr },
}
const unstamped: Photo = {
  ...stamped,
  id: 'b',
  roomId: 'r2',
  fileName: 'image.png',
  original: new Blob([tinyJpeg], { type: 'image/png' }),
  display: null,
  sha256: 'cd'.repeat(32),
  note: '',
  stamp: { status: 'failed', attempts: 2, error: 'No internet connection' },
}
const byRoom = new Map([
  ['r1', [stamped]],
  ['r2', [unstamped]],
])
const generatedAt = new Date('2026-11-18T12:00:00.000Z')

describe('export manifest', () => {
  const { manifest, entries } = buildManifest(property, rooms, byRoom, generatedAt)

  it('lists every room and photo with paths, hashes and timestamp details', () => {
    expect(manifest.format).toBe('deposit-kit-evidence')
    expect(manifest.property).toEqual({ label: 'Apt 4B, 120 Main St', moveInDate: '2026-11-18', state: 'CA' })
    expect(manifest.totals).toEqual({ photos: 2, timestamped: 1 })
    expect(manifest.rooms.map((r) => r.name)).toEqual(['Kitchen', 'Living room', 'Bedroom'])
    expect(manifest.rooms[2].photos).toEqual([])
    expect(manifest.rooms[0].photos[0]).toEqual({
      file: 'photos/01-kitchen/01.jpg',
      originalName: 'IMG_0001.JPEG',
      sha256: freetsa.meta.sha256,
      note: 'Scratch on floor by window — about 10 cm',
      addedAt: '2026-11-18T10:01:00.000Z',
      fileLastModified: '2026-11-18T10:00:59.000Z',
      timestamp: {
        status: 'stamped',
        provider: 'FreeTSA',
        time: freetsa.meta.genTime,
        serialNumber: freetsa.meta.serialNumber,
        file: 'photos/01-kitchen/01.jpg.tsr',
      },
    })
    expect(manifest.rooms[1].photos[0]).toMatchObject({ file: 'photos/02-living-room/01.png', timestamp: { status: 'not-yet-timestamped' } })
    expect(entries.map((e) => [e.path, e.tsrPath])).toEqual([
      ['photos/01-kitchen/01.jpg', 'photos/01-kitchen/01.jpg.tsr'],
      ['photos/02-living-room/01.png', undefined],
    ])
    expect(manifest.howToVerify.join(' ')).toContain('openssl ts -verify')
  })

  it('makes safe, unique names', () => {
    expect(slug('Kid’s Room #2!')).toBe('kid-s-room-2')
    expect(slug('🙂')).toBe('room')
    expect(extensionFor({ fileName: 'photo', original: new Blob([], { type: 'image/heic' }) })).toBe('heic')
    const dup = buildManifest(property, [rooms[0], { ...rooms[0], id: 'r9' }], new Map(), generatedAt)
    expect(dup.manifest.rooms.length).toBe(2)
    expect(exportBaseName(property, new Date(2026, 10, 18))).toBe('deposit-kit-move-in-apt-4b-120-main-st-2026-11-18')
  })
})

describe('export zip', () => {
  it('holds the exact original bytes, the tokens, certificates and the manifest', async () => {
    const { manifest, entries } = buildManifest(property, rooms, byRoom, generatedAt)
    const zip = await buildZip(manifest, entries)
    const files = unzipSync(new Uint8Array(await zip.arrayBuffer()))
    expect(Object.keys(files).sort()).toEqual([
      'README.txt',
      'certificates/freetsa-cacert.pem',
      'certificates/freetsa-tsa.crt',
      'manifest.json',
      'photos/01-kitchen/01.jpg',
      'photos/01-kitchen/01.jpg.tsr',
      'photos/02-living-room/01.png',
    ])
    expect(await sha256Hex(files['photos/01-kitchen/01.jpg'])).toBe(freetsa.meta.sha256)
    expect(files['photos/01-kitchen/01.jpg.tsr']).toEqual(freetsa.tsr)
    expect(JSON.parse(strFromU8(files['manifest.json'])) as Manifest).toEqual(manifest)
    const readme = strFromU8(files['README.txt'])
    expect(readme).toContain('not legal advice')
    expect(readme).toContain('Apt 4B, 120 Main St')
  })

  const hasOpenssl = (() => {
    try {
      execFileSync('openssl', ['version'], { stdio: 'ignore' })
      return true
    } catch {
      return false
    }
  })()

  it.skipIf(!hasOpenssl)('verifies with `openssl ts -verify` using only what is in the zip', async () => {
    const { manifest, entries } = buildManifest(property, rooms, byRoom, generatedAt)
    const files = unzipSync(new Uint8Array(await (await buildZip(manifest, entries)).arrayBuffer()))
    const dir = mkdtempSync(join(tmpdir(), 'dk-zip-'))
    for (const [name, data] of Object.entries(files)) {
      mkdirSync(dirname(join(dir, name)), { recursive: true })
      writeFileSync(join(dir, name), data)
    }
    const out = execFileSync(
      'openssl',
      ['ts', '-verify', '-data', 'photos/01-kitchen/01.jpg', '-in', 'photos/01-kitchen/01.jpg.tsr', '-CAfile', 'certificates/freetsa-cacert.pem', '-untrusted', 'certificates/freetsa-tsa.crt'],
      { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    )
    expect(out).toContain('Verification: OK')

    // A changed photo must fail.
    writeFileSync(join(dir, 'photos/01-kitchen/01.jpg'), 'edited')
    expect(() =>
      execFileSync('openssl', ['ts', '-verify', '-data', 'photos/01-kitchen/01.jpg', '-in', 'photos/01-kitchen/01.jpg.tsr', '-CAfile', 'certificates/freetsa-cacert.pem', '-untrusted', 'certificates/freetsa-tsa.crt'], {
        cwd: dir,
        stdio: 'ignore',
      }),
    ).toThrow()
  })
})

describe('PDF report', () => {
  it('builds a PDF with a cover page and one section per room', async () => {
    const { manifest, entries } = buildManifest(property, rooms, byRoom, generatedAt)
    const pdf = await buildPdf(manifest, entries)
    const bytes = new Uint8Array(await pdf.arrayBuffer())
    expect(strFromU8(bytes.subarray(0, 5))).toBe('%PDF-')
    const pages = strFromU8(bytes, true).match(/\/Type \/Page\b/g)?.length ?? 0
    expect(pages).toBeGreaterThanOrEqual(1 + rooms.length)
  })

  it('replaces characters the PDF fonts can’t show', () => {
    expect(pdfSafe('“Scratch” — by window… 🙂 café')).toBe('"Scratch" - by window... ? café')
  })
})

describe('downscaling', () => {
  it('fits the longest side to 2000px and never upscales', () => {
    expect(fitWithin(4032, 3024)).toEqual({ width: 2000, height: 1500 })
    expect(fitWithin(3024, 4032)).toEqual({ width: 1500, height: 2000 })
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 })
  })
})
