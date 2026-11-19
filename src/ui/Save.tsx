import { useEffect, useState } from 'preact/hooks'
import type { Session } from '../lib/session.ts'
import type { Photo, Property } from '../lib/types.ts'
import { buildManifest, buildZip, exportBaseName } from '../lib/export.ts'
import { buildPdf } from '../lib/pdf.ts'
import { InstallHint } from './InstallHint.tsx'

interface Ready {
  pdf: File
  zip: File
  photos: number
  stamped: number
}

/** Share sheet on phones (lets iPhone users pick "Save to Files"), plain download elsewhere. */
function canShareFile(file: File): boolean {
  const coarse = window.matchMedia?.('(pointer: coarse)').matches
  return !!coarse && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })
}

async function saveFile(file: File): Promise<boolean> {
  if (canShareFile(file)) {
    try {
      await navigator.share({ files: [file], title: file.name })
      return true
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return false
      // Fall through to a download if sharing isn't allowed here.
    }
  }
  const url = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.href = url
  a.download = file.name
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
  return true
}

function mb(bytes: number): string {
  return bytes < 1e6 ? `${Math.max(1, Math.round(bytes / 1e3))} KB` : `${(bytes / 1e6).toFixed(1)} MB`
}

export function SaveView({ session, property, onBack }: { session: Session; property: Property; onBack: () => void }) {
  const [ready, setReady] = useState<Ready | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<{ pdf: boolean; zip: boolean }>({ pdf: false, zip: false })

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const rooms = await session.store.listRooms(property.id)
        const byRoom = new Map<string, Photo[]>()
        for (const r of rooms) byRoom.set(r.id, await session.store.listPhotos(r.id))
        const now = new Date()
        const { manifest, entries } = buildManifest(property, rooms, byRoom, now)
        const base = exportBaseName(property, now)
        const [pdfBlob, zipBlob] = await Promise.all([buildPdf(manifest, entries), buildZip(manifest, entries)])
        if (cancelled) return
        setReady({
          pdf: new File([pdfBlob], `${base}.pdf`, { type: 'application/pdf' }),
          zip: new File([zipBlob], `${base}.zip`, { type: 'application/zip' }),
          photos: manifest.totals.photos,
          stamped: manifest.totals.timestamped,
        })
      } catch (e) {
        console.error(e)
        if (!cancelled) setError('Something went wrong while making your files. Please try again.')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [session, property.id])

  const save = async (kind: 'pdf' | 'zip') => {
    if (!ready) return
    const ok = await saveFile(ready[kind])
    if (!ok) return
    setSaved((s) => ({ ...s, [kind]: true }))
    // The zip holds the originals and timestamps, so it is what counts as "saved".
    if (kind === 'zip') await session.markExported(property.id)
  }

  return (
    <div class="stack">
      <button class="back" onClick={onBack}>
        ← Back
      </button>
      <h1>Save your record</h1>
      <p>
        These two files are your proof. Your phone may delete app data (iPhones can after 7 days without opening Deposit Kit), so
        keep them somewhere safe: email them to yourself, or save them to iCloud Drive, Google Drive or your computer.
      </p>

      {error && <p class="notice warn">{error}</p>}
      {!ready && !error && (
        <p class="muted" role="status">
          Getting your files ready…
        </p>
      )}

      {ready && (
        <>
          {ready.stamped < ready.photos && (
            <p class="notice">
              {ready.photos - ready.stamped} of {ready.photos} photos are not yet timestamped. Save now anyway, and save again later
              once they are.
            </p>
          )}
          <div class="save-item">
            <div>
              <h2>1. Photo report (PDF)</h2>
              <p class="muted small">Easy to read and print. {mb(ready.pdf.size)}</p>
            </div>
            <button class={`btn big ${saved.pdf ? '' : 'primary'}`} onClick={() => save('pdf')}>
              {saved.pdf ? '✓ Saved · save again' : 'Save PDF report'}
            </button>
          </div>
          <div class="save-item">
            <div>
              <h2>2. Original photos and timestamps (zip)</h2>
              <p class="muted small">The full-size photos and the proof files. Keep this one too. {mb(ready.zip.size)}</p>
            </div>
            <button class={`btn big ${saved.zip ? '' : 'primary'}`} onClick={() => save('zip')}>
              {saved.zip ? '✓ Saved · save again' : 'Save photos and proof'}
            </button>
          </div>
          {saved.pdf && saved.zip && <p class="notice ok">Both files saved. Keep them until you get your deposit back.</p>}
        </>
      )}

      <InstallHint always />
    </div>
  )
}
