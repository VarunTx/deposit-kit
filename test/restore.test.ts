import 'fake-indexeddb/auto'
import { strToU8, unzipSync, zipSync } from 'fflate'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Store, newId } from '../src/lib/db.ts'
import { buildManifest, buildZip, type Manifest } from '../src/lib/export.ts'
import { RestoreError, readBackup } from '../src/lib/restore.ts'
import { Session, needsExport } from '../src/lib/session.ts'
import type { Photo, Property, Room } from '../src/lib/types.ts'
import { sha256Hex } from '../src/lib/hash.ts'
import { freetsa, tinyJpeg } from './fixtures.ts'

const tinySha = await sha256Hex(tinyJpeg)

const property: Property = { id: 'p1', label: 'Apt 4B, 120 Main St', moveInDate: '2026-11-18', state: 'CA', createdAt: '2026-11-18T10:00:00.000Z' }
const rooms: Room[] = [
  { id: 'r1', propertyId: 'p1', name: 'Kitchen', order: 1, createdAt: '' },
  { id: 'r2', propertyId: 'p1', name: 'Bathroom', order: 2, createdAt: '' },
]
const stamped: Photo = {
  id: 'a',
  propertyId: 'p1',
  roomId: 'r1',
  addedAt: '2026-11-18T10:01:00.000Z',
  fileName: 'IMG_0001.jpg',
  fileLastModified: Date.parse('2026-11-18T10:00:59.000Z'),
  original: new Blob([freetsa.data], { type: 'image/jpeg' }),
  display: new Blob([tinyJpeg], { type: 'image/jpeg' }),
  width: 48,
  height: 32,
  sha256: freetsa.meta.sha256,
  note: 'Scratch on floor by window',
  stamp: { status: 'stamped', attempts: 1, provider: 'FreeTSA', genTime: freetsa.meta.genTime, serialNumber: freetsa.meta.serialNumber, tsr: freetsa.tsr },
}
const unstamped: Photo = {
  ...stamped,
  id: 'b',
  roomId: 'r2',
  fileName: 'IMG_0002.jpg',
  original: new Blob([tinyJpeg], { type: 'image/jpeg' }),
  sha256: tinySha,
  note: 'Chipped tile',
  stamp: { status: 'failed', attempts: 1 },
}

async function exportZip(): Promise<{ bytes: Uint8Array; manifest: Manifest }> {
  const { manifest, entries } = buildManifest(property, rooms, new Map([['r1', [stamped]], ['r2', [unstamped]]]), new Date('2026-11-18T12:00:00.000Z'))
  return { bytes: new Uint8Array(await (await buildZip(manifest, entries)).arrayBuffer()), manifest }
}

const deps = { makeDisplay: async () => ({ blob: new Blob([tinyJpeg], { type: 'image/jpeg' }), width: 48, height: 32 }), now: () => new Date('2026-12-01T09:00:00.000Z') }

describe('readBackup', () => {
  it('restores the home, rooms, notes, original bytes and checked timestamps', async () => {
    const { bytes } = await exportZip()
    const plan = await readBackup(bytes, deps)
    expect(plan.property).toMatchObject({ label: 'Apt 4B, 120 Main St', moveInDate: '2026-11-18', state: 'CA', lastExportAt: '2026-11-18T12:00:00.000Z' })
    expect(plan.rooms.map((r) => r.name)).toEqual(['Kitchen', 'Bathroom'])
    expect(plan.report).toEqual({ rooms: 2, photos: 2, stamped: 1, needStamp: 1, missing: 0 })

    const [a, b] = plan.photos
    expect(a.roomId).toBe(plan.rooms[0].id)
    expect(a.note).toBe('Scratch on floor by window')
    expect(a.fileName).toBe('IMG_0001.jpg')
    expect(a.addedAt).toBe('2026-11-18T10:01:00.000Z')
    expect(new Uint8Array(await a.original.arrayBuffer())).toEqual(freetsa.data)
    expect(a.sha256).toBe(freetsa.meta.sha256)
    expect(a.stamp).toMatchObject({ status: 'stamped', provider: 'FreeTSA', genTime: freetsa.meta.genTime, serialNumber: freetsa.meta.serialNumber })
    expect(a.stamp.tsr).toEqual(freetsa.tsr)
    expect(a.display).not.toBeNull()

    expect(b.roomId).toBe(plan.rooms[1].id)
    expect(b.stamp.status).toBe('pending')
    expect(new Uint8Array(await b.original.arrayBuffer())).toEqual(tinyJpeg)
  })

  it('does not trust a timestamp that no longer matches the photo', async () => {
    const files = unzipSync((await exportZip()).bytes)
    files['photos/01-kitchen/01.jpg'] = strToU8('edited photo')
    const plan = await readBackup(zipSync(files), deps)
    expect(plan.photos[0].stamp.status).toBe('pending')
    expect(plan.report).toMatchObject({ stamped: 0, needStamp: 2 })
  })

  it('reads the time from the token, not from an edited manifest', async () => {
    const files = unzipSync((await exportZip()).bytes)
    const m = JSON.parse(new TextDecoder().decode(files['manifest.json'])) as Manifest
    m.rooms[0].photos[0].timestamp.time = '2020-01-01T00:00:00.000Z'
    files['manifest.json'] = strToU8(JSON.stringify(m))
    const plan = await readBackup(zipSync(files), deps)
    expect(plan.photos[0].stamp.genTime).toBe(freetsa.meta.genTime)
  })

  it('handles a zip that was unzipped and re-zipped into a folder (with Mac extras)', async () => {
    const files = unzipSync((await exportZip()).bytes)
    const nested: Record<string, Uint8Array> = { '__MACOSX/._manifest.json': strToU8('junk') }
    for (const [k, v] of Object.entries(files)) nested[`deposit-kit-move-in/${k}`] = v
    const plan = await readBackup(zipSync(nested), deps)
    expect(plan.report).toMatchObject({ photos: 2, stamped: 1 })
  })

  it('counts photos missing from the zip instead of failing', async () => {
    const files = unzipSync((await exportZip()).bytes)
    delete files['photos/02-bathroom/01.jpg']
    const plan = await readBackup(zipSync(files), deps)
    expect(plan.report).toMatchObject({ photos: 1, missing: 1 })
    expect(plan.property.lastChangeAt).toBe('2026-12-01T09:00:00.000Z') // not "saved" anymore
  })

  it('gives plain reasons for the wrong file', async () => {
    await expect(readBackup(strToU8('%PDF-1.3 ...'), deps)).rejects.toThrow(/That’s the PDF report/)
    await expect(readBackup(strToU8('hello'), deps)).rejects.toThrow(RestoreError)
    await expect(readBackup(zipSync({ 'notes.txt': strToU8('hi') }), deps)).rejects.toThrow(/doesn’t have a Deposit Kit manifest/)
    await expect(readBackup(zipSync({ 'manifest.json': strToU8('{"format":"other"}') }), deps)).rejects.toThrow(/wasn’t made by Deposit Kit/)
    await expect(
      readBackup(zipSync({ 'manifest.json': strToU8('{"format":"deposit-kit-evidence","version":99,"property":{},"rooms":[]}') }), deps),
    ).rejects.toThrow(/newer version/)
    await expect(readBackup(Uint8Array.of(0x50, 0x4b, 3, 4, 0, 0), deps)).rejects.toThrow(/damaged/)
  })
})

describe('Session.restore', () => {
  let store: Store
  beforeEach(async () => {
    store = await Store.open(`restore-${newId()}`)
  })
  afterEach(() => store.close())

  it('replaces the device record, and exporting again gives the same evidence', async () => {
    // Something already on the device.
    const old: Property = { ...property, id: 'old', label: 'Old place' }
    await store.saveProperty(old)
    await store.saveRoom({ id: 'oldroom', propertyId: 'old', name: 'Garage', order: 1, createdAt: '' })

    const okFetch = async () => new Response(JSON.stringify({ error: 'offline in test' }), { status: 502 })
    const session = new Session(store, () => {}, { makeDisplay: deps.makeDisplay, fetchImpl: okFetch as typeof fetch, now: deps.now })
    const { bytes, manifest } = await exportZip()
    const report = await session.restore(new Blob([bytes as Uint8Array<ArrayBuffer>]))
    expect(report).toMatchObject({ photos: 2, stamped: 1 })
    await session.idle()

    const [p] = await store.listProperties()
    expect(p.label).toBe('Apt 4B, 120 Main St')
    expect(await store.getProperty('old')).toBeUndefined()
    const restoredRooms = await store.listRooms(p.id)
    expect(restoredRooms.map((r) => r.name)).toEqual(['Kitchen', 'Bathroom'])
    // One photo still needs a timestamp, so it isn't counted as fully saved.
    expect(needsExport(p, 2)).toBe(true)

    // Re-export: same photos, hashes, notes and tokens as the original export.
    const byRoom = new Map<string, Photo[]>()
    for (const r of restoredRooms) byRoom.set(r.id, await store.listPhotos(r.id))
    const again = buildManifest(p, restoredRooms, byRoom, new Date('2026-11-18T12:00:00.000Z'))
    expect(again.manifest.rooms).toEqual(manifest.rooms)
  })

  it('leaves the device untouched when the file is bad', async () => {
    await store.saveProperty({ ...property, id: 'keep' })
    const session = new Session(store, () => {}, { makeDisplay: deps.makeDisplay })
    await expect(session.restore(new Blob(['not a zip']))).rejects.toThrow(RestoreError)
    expect((await store.listProperties()).map((p) => p.id)).toEqual(['keep'])
  })
})
