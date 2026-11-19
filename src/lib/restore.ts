// Restore a record from a saved zip, so a wiped phone (or a new phone) can carry on.
// Nothing is trusted blindly: each photo is re-hashed, and each timestamp token is
// checked against that hash. A photo whose token doesn't match is kept but marked
// for a fresh timestamp, so the app never shows a time the token can't back up.

import { unzipSync, strFromU8 } from 'fflate'
import { MANIFEST_FORMAT, MANIFEST_VERSION, type Manifest, type ManifestPhoto } from './export.ts'
import { newId } from './db.ts'
import { sha256Hex } from './hash.ts'
import type { DisplayImage } from './image.ts'
import { checkTimeStampResponse } from './tsp.ts'
import type { Photo, PhotoStamp, Property, Room } from './types.ts'

export class RestoreError extends Error {}

export interface RestoreReport {
  rooms: number
  photos: number
  /** Photos whose saved timestamp checked out. */
  stamped: number
  /** Photos that will get a new timestamp (none saved, or it didn't match the photo). */
  needStamp: number
  /** Photos listed in the manifest but missing from the zip. */
  missing: number
}

export interface RestorePlan {
  property: Property
  rooms: Room[]
  photos: Photo[]
  report: RestoreReport
}

export interface RestoreDeps {
  makeDisplay: (file: Blob) => Promise<DisplayImage | null>
  now?: () => Date
  onProgress?: (done: number, total: number) => void
}

const TYPES: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', heic: 'image/heic', heif: 'image/heif', webp: 'image/webp' }

function typeFor(path: string): string {
  return TYPES[/\.([a-z0-9]+)$/i.exec(path)?.[1]?.toLowerCase() ?? ''] ?? 'application/octet-stream'
}

function isZip(bytes: Uint8Array): boolean {
  return bytes[0] === 0x50 && bytes[1] === 0x4b
}

function isPdf(bytes: Uint8Array): boolean {
  return strFromU8(bytes.subarray(0, 5)) === '%PDF-'
}

/** Read a Deposit Kit zip into records ready to store. Throws RestoreError with a plain message. */
export async function readBackup(bytes: Uint8Array, deps: RestoreDeps): Promise<RestorePlan> {
  if (isPdf(bytes)) throw new RestoreError('That’s the PDF report. Choose the .zip file saved with it; it holds the original photos.')
  if (!isZip(bytes)) throw new RestoreError('That doesn’t look like a Deposit Kit zip file.')

  let files: Record<string, Uint8Array>
  try {
    files = unzipSync(bytes, { filter: (f) => !f.name.startsWith('__MACOSX/') && !f.name.endsWith('/') })
  } catch {
    throw new RestoreError('This zip file is damaged and can’t be opened.')
  }

  // The zip may have been unzipped and re-zipped, which puts everything inside a folder.
  const manifestPath = Object.keys(files)
    .filter((n) => n === 'manifest.json' || n.endsWith('/manifest.json'))
    .sort((a, b) => a.length - b.length)[0]
  if (!manifestPath) throw new RestoreError('This zip doesn’t have a Deposit Kit manifest. Choose the zip that Deposit Kit saved.')
  const prefix = manifestPath.slice(0, -'manifest.json'.length)

  let manifest: Manifest
  try {
    manifest = JSON.parse(strFromU8(files[manifestPath])) as Manifest
  } catch {
    throw new RestoreError('The manifest in this zip is damaged.')
  }
  if (manifest.format !== MANIFEST_FORMAT) throw new RestoreError('This zip wasn’t made by Deposit Kit.')
  if (typeof manifest.version !== 'number' || manifest.version > MANIFEST_VERSION) {
    throw new RestoreError('This file was made by a newer version of Deposit Kit. Reload the app to update it, then try again.')
  }
  if (!manifest.property || !Array.isArray(manifest.rooms)) throw new RestoreError('The manifest in this zip is incomplete.')

  const now = (deps.now ?? (() => new Date()))()
  const savedAt = typeof manifest.generatedAt === 'string' ? manifest.generatedAt : now.toISOString()
  const property: Property = {
    id: newId(),
    label: String(manifest.property.label ?? 'My home').slice(0, 120),
    moveInDate: String(manifest.property.moveInDate ?? ''),
    state: String(manifest.property.state ?? ''),
    createdAt: now.toISOString(),
    // It came from a saved file, so it counts as saved until something changes.
    lastExportAt: savedAt,
    lastChangeAt: savedAt,
  }

  const total = manifest.rooms.reduce((n, r) => n + (Array.isArray(r.photos) ? r.photos.length : 0), 0)
  const report: RestoreReport = { rooms: 0, photos: 0, stamped: 0, needStamp: 0, missing: 0 }
  const rooms: Room[] = []
  const photos: Photo[] = []
  let done = 0

  for (const [i, mr] of manifest.rooms.entries()) {
    const room: Room = { id: newId(), propertyId: property.id, name: String(mr.name ?? `Room ${i + 1}`).slice(0, 40), order: i + 1, createdAt: now.toISOString() }
    rooms.push(room)
    for (const mp of (Array.isArray(mr.photos) ? mr.photos : []) as ManifestPhoto[]) {
      deps.onProgress?.(++done, total)
      const data = typeof mp.file === 'string' ? files[prefix + mp.file] : undefined
      if (!data) {
        report.missing++
        continue
      }
      const original = new Blob([data as Uint8Array<ArrayBuffer>], { type: typeFor(mp.file) })
      const sha256 = await sha256Hex(data)
      const stamp = checkStamp(mp, files, prefix, sha256)
      if (stamp.status === 'stamped') report.stamped++
      else report.needStamp++
      const display = await deps.makeDisplay(original)
      photos.push({
        id: newId(),
        propertyId: property.id,
        roomId: room.id,
        addedAt: typeof mp.addedAt === 'string' ? mp.addedAt : savedAt,
        fileName: typeof mp.originalName === 'string' && mp.originalName ? mp.originalName : mp.file.split('/').pop()!,
        fileLastModified: mp.fileLastModified ? Date.parse(mp.fileLastModified) || 0 : 0,
        original,
        display: display?.blob ?? null,
        width: display?.width,
        height: display?.height,
        sha256,
        note: typeof mp.note === 'string' ? mp.note.slice(0, 200) : '',
        stamp,
      })
      report.photos++
    }
  }
  report.rooms = rooms.length
  if (rooms.length === 0) throw new RestoreError('This zip has no rooms in it.')
  // If any photo needs a timestamp, the restored record isn't fully saved yet.
  if (report.needStamp > 0 || report.missing > 0) property.lastChangeAt = now.toISOString()
  return { property, rooms, photos, report }
}

function checkStamp(mp: ManifestPhoto, files: Record<string, Uint8Array>, prefix: string, sha256: string): PhotoStamp {
  const tsr = mp.timestamp?.file ? files[prefix + mp.timestamp.file] : undefined
  if (!tsr) return { status: 'pending', attempts: 0 }
  try {
    // Read the time from the signed token, not from the editable manifest.
    const info = checkTimeStampResponse(tsr, sha256)
    return {
      status: 'stamped',
      attempts: 1,
      provider: mp.timestamp.provider ?? 'Unknown',
      genTime: info.genTime.toISOString(),
      serialNumber: info.serialNumber,
      tsr: new Uint8Array(tsr),
    }
  } catch {
    return { status: 'pending', attempts: 0 }
  }
}
