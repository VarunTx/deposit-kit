export const DISPLAY_MAX_SIDE = 2000
export const DISPLAY_QUALITY = 0.85

/** Fit width x height inside a square of `max`, keeping the aspect ratio. Never upscales. */
export function fitWithin(width: number, height: number, max = DISPLAY_MAX_SIDE): { width: number; height: number } {
  const longest = Math.max(width, height)
  if (longest <= max) return { width, height }
  const scale = max / longest
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

export interface DisplayImage {
  blob: Blob
  width: number
  height: number
}

/**
 * Make a smaller JPEG for the screen and the PDF. Returns null when the browser
 * can't decode the file (for example HEIC on desktop Chrome); the original is
 * still kept and timestamped.
 */
export async function makeDisplayImage(file: Blob): Promise<DisplayImage | null> {
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    return null
  }
  try {
    const { width, height } = fitWithin(bitmap.width, bitmap.height)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.fillStyle = '#fff' // flatten transparency for JPEG
    ctx.fillRect(0, 0, width, height)
    ctx.drawImage(bitmap, 0, 0, width, height)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', DISPLAY_QUALITY))
    return blob ? { blob, width, height } : null
  } finally {
    bitmap.close()
  }
}
