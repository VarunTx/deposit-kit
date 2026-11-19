import { toHex } from './tsp.ts'

/** SHA-256 of the exact bytes, as lowercase hex. */
export async function sha256Hex(data: Blob | ArrayBuffer | Uint8Array): Promise<string> {
  const bytes = data instanceof Blob ? await data.arrayBuffer() : data
  const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource)
  return toHex(new Uint8Array(digest))
}
