// Browser side of timestamping: send only the hash to our endpoint, then check
// the returned token is really for that hash before saving it.

import { checkTimeStampResponse, fromBase64 } from './tsp.ts'
import type { PhotoStamp } from './types.ts'

export const TIMESTAMP_ENDPOINT = (import.meta.env?.VITE_TIMESTAMP_URL as string | undefined) ?? '/api/timestamp'

interface EndpointReply {
  provider?: string
  tsr?: string
  error?: string
}

/** Get a timestamp for a SHA-256 hash. Throws with a short reason on failure. */
export async function fetchTimestamp(
  sha256: string,
  fetchImpl: typeof fetch = fetch,
  endpoint = TIMESTAMP_ENDPOINT,
): Promise<Required<Pick<PhotoStamp, 'provider' | 'genTime' | 'serialNumber' | 'tsr'>>> {
  let res: Response
  try {
    res = await fetchImpl(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sha256 }),
    })
  } catch {
    throw new Error('No internet connection')
  }
  let reply: EndpointReply
  try {
    reply = (await res.json()) as EndpointReply
  } catch {
    throw new Error(`Timestamp service error (${res.status})`)
  }
  if (!res.ok || !reply.tsr || !reply.provider) throw new Error(reply.error ?? `Timestamp service error (${res.status})`)
  const tsr = fromBase64(reply.tsr)
  // Don't trust the server's summary: read the time and hash from the signed token itself.
  const info = checkTimeStampResponse(tsr, sha256)
  return { provider: reply.provider, tsr, genTime: info.genTime.toISOString(), serialNumber: info.serialNumber }
}

/** Apply a timestamp attempt's outcome to a photo's stamp record. */
export function stampSucceeded(prev: PhotoStamp, r: Awaited<ReturnType<typeof fetchTimestamp>>): PhotoStamp {
  return { status: 'stamped', attempts: prev.attempts + 1, ...r }
}

export function stampFailed(prev: PhotoStamp, err: unknown): PhotoStamp {
  return { status: 'failed', attempts: prev.attempts + 1, error: err instanceof Error ? err.message : String(err) }
}
