// Ties storage, hashing and timestamping together for the UI.
// A photo is saved first and timestamped after, so a failed or slow timestamp
// never loses a photo; it just stays "not yet timestamped" until a retry works.

import { newId, type Store } from './db.ts'
import { sha256Hex } from './hash.ts'
import { makeDisplayImage, type DisplayImage } from './image.ts'
import { readBackup, type RestoreReport } from './restore.ts'
import { fetchTimestamp, stampFailed, stampSucceeded } from './stamp.ts'
import { shotsFor, slotOrder } from './car.ts'
import type { CarDetails, Phase, Photo, Property, Room } from './types.ts'

export interface SessionDeps {
  makeDisplay?: (file: Blob) => Promise<DisplayImage | null>
  fetchImpl?: typeof fetch
  now?: () => Date
  /** Called after each timestamp attempt, for user feedback. */
  onStampResult?: (photoId: string, ok: boolean) => void
}

export class Session {
  readonly store: Store
  private onChange: () => void
  private deps: SessionDeps
  private queue: Promise<void> = Promise.resolve()
  private queued = new Set<string>()

  constructor(store: Store, onChange: () => void, deps: SessionDeps = {}) {
    this.store = store
    this.onChange = onChange
    this.deps = deps
  }

  private now(): Date {
    return this.deps.now?.() ?? new Date()
  }

  /** Record that something changed, so the app knows the export is out of date. */
  async touch(propertyId: string): Promise<void> {
    const at = this.now().toISOString()
    await this.store.updateProperty(propertyId, (p) => ({ ...p, lastChangeAt: at }))
  }

  /** Create a home record. */
  async addHome(fields: Pick<Property, 'label' | 'moveInDate' | 'state'>): Promise<Property> {
    const property: Property = { id: newId(), kind: 'home', createdAt: this.now().toISOString(), ...fields }
    await this.store.saveProperty(property)
    this.onChange()
    return property
  }

  /** Create a rental car record with the pickup shot list ready to fill. */
  async addCar(fields: Pick<Property, 'label' | 'moveInDate'> & { car: CarDetails }): Promise<Property> {
    const property: Property = { id: newId(), kind: 'car', state: '', createdAt: this.now().toISOString(), ...fields }
    await this.store.saveProperty(property)
    await this.addPhase(property, 'pickup')
    this.onChange()
    return property
  }

  /** Add the shot list for a visit (pickup or return). Spots that already exist are kept. */
  async addPhase(property: Property, phase: Phase): Promise<Room[]> {
    const existing = (await this.store.listRooms(property.id)).filter((r) => r.phase === phase)
    const at = this.now().toISOString()
    const added: Room[] = shotsFor(phase)
      .filter((s) => !existing.some((r) => r.slot === s.slot))
      .map((s) => ({ id: newId(), propertyId: property.id, name: s.name, order: slotOrder(phase, s.slot), createdAt: at, phase, slot: s.slot }))
    if (added.length) {
      await this.store.saveRooms(added)
      await this.touch(property.id)
      this.onChange()
    }
    return [...existing, ...added].sort((a, b) => a.order - b.order)
  }

  async deleteRecord(property: Property): Promise<void> {
    await this.store.deleteProperty(property.id)
    this.onChange()
  }

  async addRoom(property: Property, name: string): Promise<Room> {
    const rooms = await this.store.listRooms(property.id)
    const base = name.trim() || 'Room'
    let finalName = base
    for (let n = 2; rooms.some((r) => r.name.toLowerCase() === finalName.toLowerCase()); n++) finalName = `${base} ${n}`
    const room: Room = {
      id: newId(),
      propertyId: property.id,
      name: finalName,
      order: rooms.reduce((m, r) => Math.max(m, r.order), 0) + 1,
      createdAt: this.now().toISOString(),
    }
    await this.store.saveRoom(room)
    await this.touch(property.id)
    this.onChange()
    return room
  }

  /** Hash the original bytes, keep the original, make a smaller copy for display, save, then timestamp. */
  async addPhoto(room: Room, file: File): Promise<Photo> {
    const [sha256, display] = await Promise.all([sha256Hex(file), (this.deps.makeDisplay ?? makeDisplayImage)(file)])
    const photo: Photo = {
      id: newId(),
      propertyId: room.propertyId,
      roomId: room.id,
      addedAt: this.now().toISOString(),
      fileName: file.name || 'photo.jpg',
      fileLastModified: file.lastModified,
      original: file,
      display: display?.blob ?? null,
      width: display?.width,
      height: display?.height,
      sha256,
      note: '',
      stamp: { status: 'pending', attempts: 0 },
    }
    await this.store.savePhoto(photo)
    await this.touch(room.propertyId)
    this.onChange()
    this.enqueueStamp(photo.id)
    return photo
  }

  /** Timestamp one photo. Requests run one at a time to be gentle with the free authority. */
  enqueueStamp(photoId: string): Promise<void> {
    if (this.queued.has(photoId)) return this.queue
    this.queued.add(photoId)
    this.queue = this.queue.then(async () => {
      try {
        const photo = await this.store.getPhoto(photoId)
        if (!photo || photo.stamp.status === 'stamped') return
        if (photo.stamp.status === 'failed') {
          await this.store.updatePhoto(photoId, (p) => ({ ...p, stamp: { ...p.stamp, status: 'pending', error: undefined } }))
          this.onChange()
        }
        let result: Awaited<ReturnType<typeof fetchTimestamp>> | null = null
        let error: unknown = null
        try {
          result = await fetchTimestamp(photo.sha256, this.deps.fetchImpl)
        } catch (e) {
          error = e
        }
        await this.store.updatePhoto(photoId, (p) => ({
          ...p,
          stamp: result ? stampSucceeded(p.stamp, result) : stampFailed(p.stamp, error),
        }))
        if (result) await this.touch(photo.propertyId)
        this.onChange()
        this.deps.onStampResult?.(photoId, !!result)
      } finally {
        this.queued.delete(photoId)
      }
    })
    return this.queue
  }

  /** Resolves when no timestamp request is queued or running. */
  idle(): Promise<void> {
    return this.queue
  }

  /** Timestamp every photo of a property that doesn't have one yet (on load, on retry, when back online). */
  async stampMissing(propertyId: string): Promise<void> {
    const photos = await this.store.listPropertyPhotos(propertyId)
    let last: Promise<void> = Promise.resolve()
    for (const p of photos) if (p.stamp.status !== 'stamped') last = this.enqueueStamp(p.id)
    await last
  }

  async setNote(photoId: string, note: string): Promise<void> {
    const p = await this.store.updatePhoto(photoId, (p) => ({ ...p, note }))
    if (p) await this.touch(p.propertyId)
  }

  async deletePhoto(photo: Photo): Promise<void> {
    await this.store.deletePhoto(photo.id)
    await this.touch(photo.propertyId)
    this.onChange()
  }

  async deleteRoom(room: Room): Promise<void> {
    await this.store.deleteRoom(room.id)
    await this.touch(room.propertyId)
    this.onChange()
  }

  /** Timestamp every photo on this device that doesn't have one yet. */
  async stampAll(): Promise<void> {
    for (const p of await this.store.listProperties()) await this.stampMissing(p.id)
  }

  /** Add a record from a saved zip next to the ones already here, then timestamp anything that needs it. */
  async restore(zip: Blob, onProgress?: (done: number, total: number) => void): Promise<RestoreReport & { propertyId: string }> {
    const plan = await readBackup(new Uint8Array(await zip.arrayBuffer()), {
      makeDisplay: this.deps.makeDisplay ?? makeDisplayImage,
      now: this.deps.now,
      onProgress,
    })
    await this.store.addRecord(plan.property, plan.rooms, plan.photos)
    this.onChange()
    void this.stampMissing(plan.property.id)
    return { ...plan.report, propertyId: plan.property.id }
  }

  async markExported(propertyId: string): Promise<void> {
    const at = this.now().toISOString()
    await this.store.updateProperty(propertyId, (p) => ({ ...p, lastExportAt: at }))
    this.onChange()
  }
}

/** True when there are photos and something changed since the last saved export. */
export function needsExport(property: Property, photoCount: number): boolean {
  if (photoCount === 0) return false
  if (!property.lastExportAt) return true
  return !!property.lastChangeAt && property.lastChangeAt > property.lastExportAt
}
