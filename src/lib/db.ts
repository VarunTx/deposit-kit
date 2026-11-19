// A small promise wrapper over IndexedDB. No dependency: the app needs three
// stores and a handful of calls, which is less code than learning a library's API.
// On-device storage is a cache; the export is the record (see docs/spec.md).

import type { Photo, Property, Room } from './types.ts'

export const DB_NAME = 'deposit-kit'
const VERSION = 1

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => reject(r.error)
  })
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error ?? new Error('Storage transaction aborted'))
  })
}

export function openDb(name = DB_NAME): Promise<IDBDatabase> {
  const open = indexedDB.open(name, VERSION)
  open.onupgradeneeded = () => {
    const db = open.result
    db.createObjectStore('properties', { keyPath: 'id' })
    db.createObjectStore('rooms', { keyPath: 'id' }).createIndex('propertyId', 'propertyId')
    const photos = db.createObjectStore('photos', { keyPath: 'id' })
    photos.createIndex('roomId', 'roomId')
    photos.createIndex('propertyId', 'propertyId')
  }
  return req(open)
}

export class Store {
  private db: IDBDatabase
  constructor(db: IDBDatabase) {
    this.db = db
  }

  static async open(name = DB_NAME): Promise<Store> {
    return new Store(await openDb(name))
  }

  close(): void {
    this.db.close()
  }

  private async put(store: string, value: unknown): Promise<void> {
    const tx = this.db.transaction(store, 'readwrite')
    tx.objectStore(store).put(value)
    await done(tx)
  }

  private get<T>(store: string, key: string): Promise<T | undefined> {
    return req(this.db.transaction(store).objectStore(store).get(key)) as Promise<T | undefined>
  }

  private byIndex<T>(store: string, index: string, key: string): Promise<T[]> {
    return req(this.db.transaction(store).objectStore(store).index(index).getAll(key)) as Promise<T[]>
  }

  /** Read-modify-write in one transaction so concurrent updates (a note, a timestamp, an export) don't overwrite each other. */
  private async update<T>(storeName: string, id: string, patch: (v: T) => T): Promise<T | undefined> {
    const tx = this.db.transaction(storeName, 'readwrite')
    const store = tx.objectStore(storeName)
    const current = (await req(store.get(id))) as T | undefined
    let next: T | undefined
    if (current !== undefined) {
      next = patch(current)
      store.put(next)
    }
    await done(tx)
    return next
  }

  // Properties
  async listProperties(): Promise<Property[]> {
    const all = (await req(this.db.transaction('properties').objectStore('properties').getAll())) as Property[]
    return all.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  }
  getProperty(id: string) {
    return this.get<Property>('properties', id)
  }
  saveProperty(p: Property) {
    return this.put('properties', p)
  }
  updateProperty(id: string, patch: (p: Property) => Property) {
    return this.update<Property>('properties', id, patch)
  }

  // Rooms
  async listRooms(propertyId: string): Promise<Room[]> {
    const rooms = await this.byIndex<Room>('rooms', 'propertyId', propertyId)
    return rooms.sort((a, b) => a.order - b.order)
  }
  saveRoom(r: Room) {
    return this.put('rooms', r)
  }
  /** Deletes the room and its photos in one transaction. */
  async deleteRoom(id: string): Promise<void> {
    const tx = this.db.transaction(['rooms', 'photos'], 'readwrite')
    tx.objectStore('rooms').delete(id)
    const photos = tx.objectStore('photos')
    const keys = await req(photos.index('roomId').getAllKeys(id))
    for (const k of keys) photos.delete(k)
    await done(tx)
  }

  // Photos
  async listPhotos(roomId: string): Promise<Photo[]> {
    const photos = await this.byIndex<Photo>('photos', 'roomId', roomId)
    return photos.sort((a, b) => a.addedAt.localeCompare(b.addedAt))
  }
  async listPropertyPhotos(propertyId: string): Promise<Photo[]> {
    const photos = await this.byIndex<Photo>('photos', 'propertyId', propertyId)
    return photos.sort((a, b) => a.addedAt.localeCompare(b.addedAt))
  }
  getPhoto(id: string) {
    return this.get<Photo>('photos', id)
  }
  savePhoto(p: Photo) {
    return this.put('photos', p)
  }
  updatePhoto(id: string, patch: (p: Photo) => Photo) {
    return this.update<Photo>('photos', id, patch)
  }
  async deletePhoto(id: string): Promise<void> {
    const tx = this.db.transaction('photos', 'readwrite')
    tx.objectStore('photos').delete(id)
    await done(tx)
  }
}

export function newId(): string {
  return crypto.randomUUID()
}
