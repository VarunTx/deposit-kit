import 'fake-indexeddb/auto'
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Store, newId } from '../src/lib/db.ts'
import { CAR_SHOTS, carLabel, cleanCar, shotsFor } from '../src/lib/car.ts'
import { buildManifest, buildZip, exportBaseName, type Manifest } from '../src/lib/export.ts'
import { buildPdf, carSpots } from '../src/lib/pdf.ts'
import { readBackup } from '../src/lib/restore.ts'
import { Session } from '../src/lib/session.ts'
import type { Photo, Property, Room } from '../src/lib/types.ts'
import { freetsa, tinyJpeg } from './fixtures.ts'

let store: Store
beforeEach(async () => {
  store = await Store.open(`car-${newId()}`)
})
afterEach(() => store.close())

const offline = (async () => new Response('{}', { status: 502 })) as typeof fetch
const display = async () => ({ blob: new Blob([tinyJpeg], { type: 'image/jpeg' }), width: 48, height: 32 })
const now = () => new Date('2026-11-21T15:00:00.000Z')
const car = { company: 'Hertz', vehicle: 'White Toyota Camry', plate: '8ABC123', reservation: 'K1234', pickupPlace: 'SFO garage level 2', returnPlace: '' }

function session() {
  return new Session(store, () => {}, { makeDisplay: display, fetchImpl: offline, now })
}

function stampedPhoto(room: Room, note = ''): Photo {
  return {
    id: newId(),
    propertyId: room.propertyId,
    roomId: room.id,
    addedAt: '2026-11-21T15:01:00.000Z',
    fileName: 'IMG_1.jpg',
    fileLastModified: 0,
    original: new Blob([freetsa.data], { type: 'image/jpeg' }),
    display: new Blob([tinyJpeg], { type: 'image/jpeg' }),
    width: 48,
    height: 32,
    sha256: freetsa.meta.sha256,
    note,
    stamp: { status: 'stamped', attempts: 1, provider: 'FreeTSA', genTime: freetsa.meta.genTime, serialNumber: freetsa.meta.serialNumber, tsr: freetsa.tsr },
  }
}

/** A car with photos of the front at pickup and at return, and the dashboard at pickup only. */
async function carWithPhotos(): Promise<{ property: Property; rooms: Room[]; byRoom: Map<string, Photo[]> }> {
  const s = session()
  const property = await s.addCar({ label: carLabel(car), moveInDate: '2026-11-21', car })
  await s.addPhase(property, 'return')
  const rooms = await store.listRooms(property.id)
  const find = (phase: string, slot: string) => rooms.find((r) => r.phase === phase && r.slot === slot)!
  const byRoom = new Map<string, Photo[]>([
    [find('pickup', 'front').id, [stampedPhoto(find('pickup', 'front'), 'Scratch on bumper')]],
    [find('pickup', 'dashboard').id, [stampedPhoto(find('pickup', 'dashboard'), '12,345 miles, full tank')]],
    [find('return', 'front').id, [stampedPhoto(find('return', 'front'))]],
  ])
  return { property: (await store.getProperty(property.id))!, rooms, byRoom }
}

describe('rental car records', () => {
  it('names the car from the vehicle and plate', () => {
    expect(carLabel(car)).toBe('White Toyota Camry · 8ABC123')
    expect(carLabel({ vehicle: '', plate: '', company: 'Turo' })).toBe('Turo rental')
    expect(carLabel({ vehicle: '', plate: '', company: '' })).toBe('Rental car')
  })

  it('creates the pickup shot list, then the return list once, in shot-list order', async () => {
    const s = session()
    const p = await s.addCar({ label: carLabel(car), moveInDate: '2026-11-21', car })
    expect(p.kind).toBe('car')
    let rooms = await store.listRooms(p.id)
    expect(rooms.map((r) => r.slot)).toEqual(shotsFor('pickup').map((x) => x.slot))
    expect(rooms.every((r) => r.phase === 'pickup')).toBe(true)
    expect(shotsFor('pickup').some((x) => x.slot === 'dropoff')).toBe(false)

    await s.addPhase(p, 'return')
    await s.addPhase(p, 'return') // a double tap doesn't duplicate spots
    rooms = await store.listRooms(p.id)
    const ret = rooms.filter((r) => r.phase === 'return')
    expect(ret.map((r) => r.slot)).toEqual(shotsFor('return').map((x) => x.slot))
    expect(rooms.indexOf(ret[0])).toBe(shotsFor('pickup').length)
  })

  it('keeps several records on one device and deletes one with all its photos', async () => {
    const s = session()
    const home = await s.addHome({ label: 'Apt 4B', moveInDate: '2026-11-01', state: 'CA' })
    const kitchen = await s.addRoom(home, 'Kitchen')
    const a = await s.addCar({ label: 'Car A', moveInDate: '2026-11-21', car })
    const [front] = await store.listRooms(a.id)
    await s.addPhoto(front, new File([tinyJpeg], 'a.jpg', { type: 'image/jpeg' }))
    await s.addPhoto(kitchen, new File([tinyJpeg], 'k.jpg', { type: 'image/jpeg' }))
    await s.idle()
    expect((await store.listProperties()).map((p) => p.label).sort()).toEqual(['Apt 4B', 'Car A'])

    await s.deleteRecord(a)
    expect((await store.listProperties()).map((p) => p.label)).toEqual(['Apt 4B'])
    expect(await store.listRooms(a.id)).toEqual([])
    expect(await store.listPropertyPhotos(a.id)).toEqual([])
    expect(await store.listPropertyPhotos(home.id)).toHaveLength(1)
  })

  it('exports the car details, visits and spots', async () => {
    const { property, rooms, byRoom } = await carWithPhotos()
    const { manifest, entries } = buildManifest(property, rooms, byRoom, now())
    expect(manifest.kind).toBe('car')
    expect(manifest.version).toBe(2)
    expect(manifest.car).toEqual(car)
    const front = manifest.rooms.filter((r) => r.slot === 'front')
    expect(front.map((r) => r.phase)).toEqual(['pickup', 'return'])
    expect(front[0].photos[0].file).toBe('photos/01-pickup-front/01.jpg')
    expect(front[1].photos[0].file).toMatch(/^photos\/\d\d-return-front\/01\.jpg$/)
    expect(entries).toHaveLength(3)
    expect(exportBaseName(property, new Date(2026, 10, 21))).toBe('deposit-kit-rental-car-white-toyota-camry-8abc123-2026-11-21')

    const files = unzipSync(new Uint8Array(await (await buildZip(manifest, entries)).arrayBuffer()))
    const readme = strFromU8(files['README.txt'])
    expect(readme).toContain('Deposit Kit rental car record')
    expect(readme).toContain('Rental company: Hertz')
    expect(readme).toContain('Photos taken at: pickup and return')
    expect(readme).not.toContain('Returned at') // left blank
    expect(readme).not.toMatch(/\n\n\n/)
  })

  it('pairs pickup and return photos by spot for the report', async () => {
    const { property, rooms, byRoom } = await carWithPhotos()
    const { manifest } = buildManifest(property, rooms, byRoom, now())
    const spots = carSpots(manifest)
    expect(spots.map((s) => [s.name, s.pickup.length, s.ret.length])).toEqual([
      ['Front', 1, 1],
      ['Mileage and fuel', 1, 0],
    ])
  })

  it('builds a PDF for a car, with and without return photos', async () => {
    const { property, rooms, byRoom } = await carWithPhotos()
    const both = buildManifest(property, rooms, byRoom, now())
    const pdf = await buildPdf(both.manifest, both.entries)
    const text = new TextDecoder('latin1').decode(new Uint8Array(await pdf.arrayBuffer()))
    expect(text.startsWith('%PDF-')).toBe(true)
    expect(text).toContain('Rental car condition report')

    const pickupOnly = buildManifest(property, rooms.filter((r) => r.phase === 'pickup'), byRoom, now())
    expect((await buildPdf(pickupOnly.manifest, pickupOnly.entries)).size).toBeGreaterThan(1000)
  })

  it('restores a car with its details, visits and spots, next to existing records', async () => {
    const { property, rooms, byRoom } = await carWithPhotos()
    const { manifest, entries } = buildManifest(property, rooms, byRoom, now())
    const zip = await buildZip(manifest, entries)

    const s = session()
    const report = await s.restore(zip)
    await s.idle()
    expect(report).toMatchObject({ photos: 3, stamped: 3, needStamp: 0 })
    const restored = (await store.getProperty(report.propertyId))!
    expect(restored).toMatchObject({ kind: 'car', car, label: property.label, moveInDate: '2026-11-21' })
    expect(await store.getProperty(property.id)).toBeDefined()

    const back = await store.listRooms(restored.id)
    expect(back.map((r) => `${r.phase}:${r.slot}`)).toEqual(rooms.map((r) => `${r.phase}:${r.slot}`))
    // Exporting the restored car gives the same evidence.
    const again = new Map<string, Photo[]>()
    for (const r of back) again.set(r.id, await store.listPhotos(r.id))
    expect(buildManifest(restored, back, again, now()).manifest.rooms).toEqual(manifest.rooms)
  })

  it('reads older (version 1) files as homes and ignores junk car fields', async () => {
    const { property, rooms, byRoom } = await carWithPhotos()
    const { manifest, entries } = buildManifest(property, rooms, byRoom, now())
    const files = unzipSync(new Uint8Array(await (await buildZip(manifest, entries)).arrayBuffer()))

    const v1: Partial<Manifest> & Record<string, unknown> = { ...manifest, version: 1 as never, kind: undefined as never, car: undefined }
    files['manifest.json'] = strToU8(JSON.stringify(v1))
    const home = await readBackup(zipSync(files), { makeDisplay: display, now })
    expect(home.property.kind).toBe('home')
    expect(home.property.car).toBeUndefined()
    expect(home.rooms.every((r) => r.phase === undefined)).toBe(true)

    files['manifest.json'] = strToU8(JSON.stringify({ ...manifest, car: { vehicle: 42, plate: 'X'.repeat(500) } }))
    const odd = await readBackup(zipSync(files), { makeDisplay: display, now })
    expect(odd.property.car).toEqual({ ...cleanCar({}), plate: 'X'.repeat(20) })
  })

  it('has a tip for every spot', () => {
    for (const shot of CAR_SHOTS) expect(shot.tip.length).toBeGreaterThan(20)
  })
})
