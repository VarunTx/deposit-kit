// Writes a sample report for eyeballing the layout. Skipped unless PDF_OUT is set:
//   PDF_OUT=/tmp/sample.pdf [PDF_PHOTOS=a.jpg,b.jpg] npx vitest run test/render-pdf.test.ts

import { readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { describe, it } from 'vitest'
import { buildManifest } from '../src/lib/export.ts'
import { buildPdf } from '../src/lib/pdf.ts'
import type { Photo, Property, Room } from '../src/lib/types.ts'
import { freetsa, tinyJpeg } from './fixtures.ts'

function size(path: string): [number, number] {
  const out = execFileSync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', path], { encoding: 'utf8' })
  return [Number(/pixelWidth: (\d+)/.exec(out)![1]), Number(/pixelHeight: (\d+)/.exec(out)![1])]
}

describe.runIf(!!process.env.PDF_OUT)('sample PDF', () => {
  it('writes a sample report', async () => {
    const photos = (process.env.PDF_PHOTOS ?? '').split(',').filter(Boolean)
    const property: Property = { id: 'p', label: 'Apt 4B, 120 Main Street, Springfield', moveInDate: '2026-11-18', state: 'CA', createdAt: '' }
    const rooms: Room[] = ['Kitchen', 'Bathroom', 'Bedroom'].map((name, i) => ({ id: `r${i}`, propertyId: 'p', name, order: i, createdAt: '' }))
    const notes = ['Scratch on floor by window, about 4 inches', 'Chipped tile next to the tub', '', 'Small stain on carpet near closet']
    const make = (i: number, roomId: string, stamped: boolean): Photo => {
      const path = photos[i % Math.max(1, photos.length)]
      const bytes = path ? new Uint8Array(readFileSync(path)) : tinyJpeg
      const [width, height] = path ? size(path) : [48, 32]
      return {
        id: `ph${i}`,
        propertyId: 'p',
        roomId,
        addedAt: '2026-11-18T18:00:00.000Z',
        fileName: `IMG_${i}.jpg`,
        fileLastModified: 0,
        original: new Blob([freetsa.data]),
        display: new Blob([bytes], { type: 'image/jpeg' }),
        width,
        height,
        sha256: freetsa.meta.sha256,
        note: notes[i % notes.length],
        stamp: stamped
          ? { status: 'stamped', attempts: 1, provider: 'FreeTSA', genTime: freetsa.meta.genTime, serialNumber: freetsa.meta.serialNumber, tsr: freetsa.tsr }
          : { status: 'failed', attempts: 1 },
      }
    }
    const byRoom = new Map<string, Photo[]>([
      ['r0', [make(0, 'r0', true), make(1, 'r0', true), make(2, 'r0', true)]],
      ['r1', [make(3, 'r1', false)]],
      ['r2', []],
    ])
    const { manifest, entries } = buildManifest(property, rooms, byRoom, new Date('2026-11-18T19:00:00Z'))
    const pdf = await buildPdf(manifest, entries)
    writeFileSync(process.env.PDF_OUT!, new Uint8Array(await pdf.arrayBuffer()))
  })
})
