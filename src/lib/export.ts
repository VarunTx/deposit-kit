// The export is the record. On-device storage can be wiped (iOS deletes it after
// 7 days without use), so everything needed to prove the move-in condition goes
// into a zip the user keeps: original photos, timestamp tokens, and a manifest.
//
// fflate builds the zip: about 8 KB, no dependencies, and its streaming API lets
// us add one photo at a time instead of holding two copies of every photo in memory.

import { Zip, ZipPassThrough, ZipDeflate, strToU8 } from 'fflate'
import type { Photo, Property, Room } from './types.ts'
import freetsaCa from '../assets/tsa/freetsa-cacert.pem?raw'
import freetsaTsa from '../assets/tsa/freetsa-tsa.crt?raw'

export const MANIFEST_FORMAT = 'deposit-kit-evidence'
export const MANIFEST_VERSION = 1

export interface ManifestPhoto {
  /** Path of the original photo inside the zip. */
  file: string
  originalName: string
  sha256: string
  note: string
  addedAt: string
  /** The device's file date. Can be changed by anyone; the timestamp is the proof. */
  fileLastModified: string | null
  timestamp: {
    status: 'stamped' | 'not-yet-timestamped'
    provider?: string
    time?: string
    serialNumber?: string
    /** Path of the RFC 3161 response inside the zip. */
    file?: string
  }
}

export interface Manifest {
  format: typeof MANIFEST_FORMAT
  version: typeof MANIFEST_VERSION
  generatedAt: string
  property: { label: string; moveInDate: string; state: string }
  rooms: { name: string; photos: ManifestPhoto[] }[]
  totals: { photos: number; timestamped: number }
  howToVerify: string[]
}

export interface ExportEntry {
  photo: Photo
  path: string
  tsrPath?: string
}

export function slug(s: string): string {
  return (
    s
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'room'
  )
}

const pad = (n: number) => String(n).padStart(2, '0')

export function extensionFor(photo: Pick<Photo, 'fileName' | 'original'>): string {
  const fromName = /\.([a-z0-9]{1,5})$/i.exec(photo.fileName)?.[1]?.toLowerCase()
  if (fromName) return fromName === 'jpeg' ? 'jpg' : fromName
  const fromType: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/heic': 'heic', 'image/heif': 'heif', 'image/webp': 'webp' }
  return fromType[photo.original.type] ?? 'bin'
}

export const HOW_TO_VERIFY = [
  'Each photo has a SHA-256 fingerprint. Changing even one pixel changes the fingerprint.',
  'Each .tsr file is a signed timestamp (RFC 3161) from a public timestamp authority. It proves that fingerprint, and so this exact photo, existed at the time shown.',
  'To check a photo with OpenSSL: openssl ts -verify -data <photo> -in <photo>.tsr -CAfile certificates/freetsa-cacert.pem -untrusted certificates/freetsa-tsa.crt',
  'The result should say "Verification: OK". You can download the same certificates yourself from https://freetsa.org.',
  'Photos timestamped by DigiCert (shown in the manifest) verify with your computer\'s normal certificate store instead of the FreeTSA files.',
]

/** Decide zip paths and build the manifest. Pure, so it is easy to test. */
export function buildManifest(
  property: Property,
  rooms: Room[],
  photosByRoom: Map<string, Photo[]>,
  generatedAt: Date,
): { manifest: Manifest; entries: ExportEntry[] } {
  const entries: ExportEntry[] = []
  const usedDirs = new Set<string>()
  const manifestRooms = rooms.map((room, ri) => {
    let dir = `photos/${pad(ri + 1)}-${slug(room.name)}`
    while (usedDirs.has(dir)) dir += '-x'
    usedDirs.add(dir)
    const photos = (photosByRoom.get(room.id) ?? []).map((photo, pi): ManifestPhoto => {
      const path = `${dir}/${pad(pi + 1)}.${extensionFor(photo)}`
      const stamped = photo.stamp.status === 'stamped' && photo.stamp.tsr
      const tsrPath = stamped ? `${path}.tsr` : undefined
      entries.push({ photo, path, tsrPath })
      return {
        file: path,
        originalName: photo.fileName,
        sha256: photo.sha256,
        note: photo.note,
        addedAt: photo.addedAt,
        fileLastModified: photo.fileLastModified ? new Date(photo.fileLastModified).toISOString() : null,
        timestamp: stamped
          ? { status: 'stamped', provider: photo.stamp.provider, time: photo.stamp.genTime, serialNumber: photo.stamp.serialNumber, file: tsrPath }
          : { status: 'not-yet-timestamped' },
      }
    })
    return { name: room.name, photos }
  })
  const all = manifestRooms.flatMap((r) => r.photos)
  return {
    entries,
    manifest: {
      format: MANIFEST_FORMAT,
      version: MANIFEST_VERSION,
      generatedAt: generatedAt.toISOString(),
      property: { label: property.label, moveInDate: property.moveInDate, state: property.state },
      rooms: manifestRooms,
      totals: { photos: all.length, timestamped: all.filter((p) => p.timestamp.status === 'stamped').length },
      howToVerify: HOW_TO_VERIFY,
    },
  }
}

function readme(m: Manifest): string {
  return [
    'Deposit Kit move-in record',
    '==========================',
    '',
    `Property: ${m.property.label}`,
    `Move-in date: ${m.property.moveInDate}`,
    m.property.state ? `State: ${m.property.state}` : '',
    `Saved: ${m.generatedAt}`,
    `Photos: ${m.totals.photos} (${m.totals.timestamped} timestamped)`,
    '',
    'Keep this file somewhere safe (email it to yourself or save it to cloud storage).',
    'It is your record. The app on your phone is not a safe place to keep it long term.',
    '',
    'What is inside',
    '--------------',
    'photos/        the original photos, exactly as taken, one folder per room',
    '*.tsr          a signed timestamp for the photo with the same name',
    'manifest.json  every photo with its room, note, fingerprint and timestamp time',
    'certificates/  FreeTSA certificates for checking the timestamps',
    '',
    'How to verify',
    '-------------',
    ...m.howToVerify.map((l) => `- ${l}`),
    '',
    'Deposit Kit gives you templates and deadlines, not legal advice.',
    '',
  ]
    .filter((l, i, a) => l !== '' || a[i - 1] !== '')
    .join('\n')
}

/** Build the evidence zip as a Blob, adding one photo at a time. */
export async function buildZip(manifest: Manifest, entries: ExportEntry[]): Promise<Blob> {
  const chunks: Uint8Array<ArrayBuffer>[] = []
  let failure: Error | null = null
  let finished!: () => void
  const finishedPromise = new Promise<void>((r) => (finished = r))
  const zip = new Zip((err, chunk, final) => {
    if (err) failure = err
    else chunks.push(chunk as Uint8Array<ArrayBuffer>)
    if (final || err) finished()
  })
  const add = (path: string, data: Uint8Array, compress: boolean) => {
    const f = compress ? new ZipDeflate(path, { level: 6 }) : new ZipPassThrough(path)
    zip.add(f)
    f.push(data, true)
  }

  add('README.txt', strToU8(readme(manifest)), true)
  add('manifest.json', strToU8(JSON.stringify(manifest, null, 2)), true)
  add('certificates/freetsa-cacert.pem', strToU8(freetsaCa), true)
  add('certificates/freetsa-tsa.crt', strToU8(freetsaTsa), true)
  for (const e of entries) {
    // Photos are already compressed; store them as-is.
    add(e.path, new Uint8Array(await e.photo.original.arrayBuffer()), false)
    if (e.tsrPath && e.photo.stamp.tsr) add(e.tsrPath, e.photo.stamp.tsr, false)
  }
  zip.end()
  await finishedPromise
  if (failure) throw failure
  return new Blob(chunks, { type: 'application/zip' })
}

export function exportBaseName(property: Property, date: Date): string {
  const d = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
  return `deposit-kit-move-in-${slug(property.label) || 'home'}-${d}`
}
