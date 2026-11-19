// Store-app (Capacitor) specifics. On the web these are never loaded.
import { Capacitor } from '@capacitor/core'
import { toBase64 } from './tsp.ts'

export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform()
}

/** 3 MB, a multiple of 3 so each base64 chunk decodes on its own. */
const CHUNK = 3 * 1024 * 1024

/**
 * Save a file from the store app: write it to the app's cache in chunks (a zip can
 * be hundreds of MB), then open the system share sheet ("Save to Files", Drive, email…).
 * Returns false if the user closed the sheet without choosing anything.
 */
export async function shareFileNative(file: File): Promise<boolean> {
  const [{ Filesystem, Directory }, { Share }] = await Promise.all([import('@capacitor/filesystem'), import('@capacitor/share')])
  const path = file.name
  for (let off = 0; off === 0 || off < file.size; off += CHUNK) {
    const data = toBase64(new Uint8Array(await file.slice(off, off + CHUNK).arrayBuffer()))
    if (off === 0) await Filesystem.writeFile({ path, data, directory: Directory.Cache })
    else await Filesystem.appendFile({ path, data, directory: Directory.Cache })
  }
  const { uri } = await Filesystem.getUri({ path, directory: Directory.Cache })
  try {
    await Share.share({ files: [uri], dialogTitle: 'Save your record' })
    return true
  } catch (e) {
    if (/cancel/i.test(String((e as Error)?.message ?? e))) return false
    throw e
  }
}
