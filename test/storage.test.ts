import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Store, newId } from '../src/lib/db.ts'
import { Session, needsExport } from '../src/lib/session.ts'
import { toBase64 } from '../src/lib/tsp.ts'
import type { Photo, Property, Room } from '../src/lib/types.ts'
import { freetsa, tinyJpeg } from './fixtures.ts'

let store: Store
let dbName: string

beforeEach(async () => {
  dbName = `test-${newId()}`
  store = await Store.open(dbName)
})
afterEach(() => store.close())

const property = (over: Partial<Property> = {}): Property => ({
  id: newId(),
  label: 'Apt 4B, 120 Main St',
  moveInDate: '2026-11-18',
  state: 'CA',
  createdAt: '2026-11-18T10:00:00.000Z',
  ...over,
})

const photo = (room: Room, over: Partial<Photo> = {}): Photo => ({
  id: newId(),
  propertyId: room.propertyId,
  roomId: room.id,
  addedAt: new Date().toISOString(),
  fileName: 'IMG_0001.JPG',
  fileLastModified: 1763460000000,
  original: new Blob([tinyJpeg], { type: 'image/jpeg' }),
  display: null,
  sha256: 'ab'.repeat(32),
  note: '',
  stamp: { status: 'pending', attempts: 0 },
  ...over,
})

describe('IndexedDB storage', () => {
  it('saves and reads a property, rooms in order, and photos with their Blob bytes', async () => {
    const p = property()
    await store.saveProperty(p)
    expect(await store.listProperties()).toEqual([p])

    const kitchen: Room = { id: newId(), propertyId: p.id, name: 'Kitchen', order: 2, createdAt: p.createdAt }
    const entry: Room = { id: newId(), propertyId: p.id, name: 'Entry', order: 1, createdAt: p.createdAt }
    await store.saveRoom(kitchen)
    await store.saveRoom(entry)
    expect((await store.listRooms(p.id)).map((r) => r.name)).toEqual(['Entry', 'Kitchen'])

    const ph = photo(kitchen, { stamp: { status: 'stamped', attempts: 1, tsr: freetsa.tsr, genTime: freetsa.meta.genTime } })
    await store.savePhoto(ph)
    const [back] = await store.listPhotos(kitchen.id)
    expect(back.original).toBeInstanceOf(Blob)
    expect(new Uint8Array(await back.original.arrayBuffer())).toEqual(tinyJpeg)
    expect(back.original.type).toBe('image/jpeg')
    expect(back.stamp.tsr).toEqual(freetsa.tsr)
  })

  it('survives closing and reopening the database', async () => {
    const p = property()
    await store.saveProperty(p)
    store.close()
    store = await Store.open(dbName)
    expect(await store.getProperty(p.id)).toEqual(p)
  })

  it('updates in place and deleting a room deletes its photos only', async () => {
    const p = property()
    await store.saveProperty(p)
    const a: Room = { id: newId(), propertyId: p.id, name: 'A', order: 1, createdAt: '' }
    const b: Room = { id: newId(), propertyId: p.id, name: 'B', order: 2, createdAt: '' }
    await store.saveRoom(a)
    await store.saveRoom(b)
    const pa = photo(a)
    const pb = photo(b)
    await store.savePhoto(pa)
    await store.savePhoto(pb)

    await store.updatePhoto(pa.id, (x) => ({ ...x, note: 'crack in tile' }))
    expect((await store.getPhoto(pa.id))?.note).toBe('crack in tile')
    expect(await store.updatePhoto('missing', (x) => x)).toBeUndefined()

    await store.deleteRoom(a.id)
    expect(await store.listRooms(p.id)).toEqual([b])
    expect(await store.getPhoto(pa.id)).toBeUndefined()
    expect((await store.listPropertyPhotos(p.id)).map((x) => x.id)).toEqual([pb.id])
  })

  it('does not lose either change when two property updates race', async () => {
    const p = property()
    await store.saveProperty(p)
    await Promise.all([
      store.updateProperty(p.id, (x) => ({ ...x, lastExportAt: '2026-11-18T12:00:00.000Z' })),
      store.updateProperty(p.id, (x) => ({ ...x, lastChangeAt: '2026-11-18T11:00:00.000Z' })),
    ])
    const back = await store.getProperty(p.id)
    expect(back?.lastExportAt).toBe('2026-11-18T12:00:00.000Z')
    expect(back?.lastChangeAt).toBe('2026-11-18T11:00:00.000Z')
  })
})

describe('Session: add photo, timestamp, retry', () => {
  const okFetch = async () => new Response(JSON.stringify({ provider: 'FreeTSA', tsr: toBase64(freetsa.tsr) }), { status: 200 })
  const offline = async () => {
    throw new TypeError('Failed to fetch')
  }

  it('hashes the original file, saves it, then stores the timestamp', async () => {
    const onChange = vi.fn()
    const session = new Session(store, onChange, { makeDisplay: async () => null, fetchImpl: okFetch as typeof fetch })
    const p = property()
    await store.saveProperty(p)
    const room = await session.addRoom(p, 'Kitchen')
    // Use the recorded data as the "photo" so the recorded token matches its hash.
    const file = new File([freetsa.data], 'IMG_1.jpg', { type: 'image/jpeg', lastModified: 1763460000000 })
    const added = await session.addPhoto(room, file)
    expect(added.sha256).toBe(freetsa.meta.sha256)
    expect(added.stamp.status).toBe('pending')

    await session.enqueueStamp(added.id)
    const saved = await store.getPhoto(added.id)
    expect(saved?.stamp).toMatchObject({ status: 'stamped', provider: 'FreeTSA', genTime: freetsa.meta.genTime, attempts: 1 })
    expect(new Uint8Array(await saved!.original.arrayBuffer())).toEqual(freetsa.data)
    expect(onChange).toHaveBeenCalled()
  })

  it('keeps the photo as "not yet timestamped" when offline, and a retry fixes it', async () => {
    const deps = { makeDisplay: async () => null, fetchImpl: offline as typeof fetch }
    const session = new Session(store, () => {}, deps)
    const p = property()
    await store.saveProperty(p)
    const room = await session.addRoom(p, 'Bathroom')
    const added = await session.addPhoto(room, new File([freetsa.data], 'a.jpg', { type: 'image/jpeg' }))
    await session.enqueueStamp(added.id)
    expect((await store.getPhoto(added.id))?.stamp).toMatchObject({ status: 'failed', error: 'No internet connection', attempts: 1 })

    deps.fetchImpl = okFetch as typeof fetch
    await session.stampMissing(p.id)
    expect((await store.getPhoto(added.id))?.stamp).toMatchObject({ status: 'stamped', attempts: 2 })
  })

  it('names duplicate rooms "Bedroom 2" and tracks whether the record needs saving', async () => {
    let t = Date.parse('2026-11-18T10:00:00Z')
    const session = new Session(store, () => {}, { makeDisplay: async () => null, fetchImpl: offline as typeof fetch, now: () => new Date((t += 1000)) })
    const p = property()
    await store.saveProperty(p)
    await session.addRoom(p, 'Bedroom')
    const second = await session.addRoom(p, 'bedroom')
    expect(second.name).toBe('bedroom 2')

    expect(needsExport((await store.getProperty(p.id))!, 0)).toBe(false)
    await session.addPhoto(second, new File([tinyJpeg], 'x.jpg', { type: 'image/jpeg' }))
    expect(needsExport((await store.getProperty(p.id))!, 1)).toBe(true)
    await session.markExported(p.id)
    expect(needsExport((await store.getProperty(p.id))!, 1)).toBe(false)
    const [ph] = await store.listPropertyPhotos(p.id)
    await session.setNote(ph.id, 'stain on carpet')
    expect(needsExport((await store.getProperty(p.id))!, 1)).toBe(true)
  })
})
