import type { JSX } from 'preact'
import { useEffect, useState } from 'preact/hooks'
import type { Session } from '../lib/session.ts'
import type { Photo, Property } from '../lib/types.ts'
import { buildManifest, buildZip, exportBaseName } from '../lib/export.ts'
import { buildPdf } from '../lib/pdf.ts'
import { InstallHint } from './InstallHint.tsx'
import { Archive, ArrowLeft, Check, FileText, ShieldCheck, Wifi } from './icons.tsx'

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

/** Wait for running timestamps (and retry missing ones) so the files include them, but never wait forever. */
async function settleTimestamps(session: Session, propertyId: string, maxMs = 20_000): Promise<void> {
  await Promise.race([session.stampMissing(propertyId), new Promise((r) => setTimeout(r, maxMs))])
}

type Stage = 'stamping' | 'building' | 'ready' | 'error'

export function SaveView({ session, property, onBack }: { session: Session; property: Property; onBack: () => void }) {
  const [stage, setStage] = useState<Stage>('stamping')
  const [ready, setReady] = useState<Ready | null>(null)
  const [saved, setSaved] = useState<{ pdf: boolean; zip: boolean }>({ pdf: false, zip: false })

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        await settleTimestamps(session, property.id)
        if (cancelled) return
        setStage('building')
        const rooms = await session.store.listRooms(property.id)
        const byRoom = new Map<string, Photo[]>()
        for (const r of rooms) byRoom.set(r.id, await session.store.listPhotos(r.id))
        const fresh = (await session.store.getProperty(property.id)) ?? property
        const now = new Date()
        const { manifest, entries } = buildManifest(fresh, rooms, byRoom, now)
        const base = exportBaseName(fresh, now)
        const [pdfBlob, zipBlob] = await Promise.all([buildPdf(manifest, entries), buildZip(manifest, entries)])
        if (cancelled) return
        setReady({
          pdf: new File([pdfBlob], `${base}.pdf`, { type: 'application/pdf' }),
          zip: new File([zipBlob], `${base}.zip`, { type: 'application/zip' }),
          photos: manifest.totals.photos,
          stamped: manifest.totals.timestamped,
        })
        setStage('ready')
      } catch (e) {
        console.error(e)
        if (!cancelled) setStage('error')
      }
    })()
    return () => {
      cancelled = true
    }
    // Build once per visit; `property` changes when the save is recorded and must not rebuild.
  }, [session, property.id])

  const save = async (kind: 'pdf' | 'zip') => {
    if (!ready) return
    const ok = await saveFile(ready[kind])
    if (!ok) return
    setSaved((s) => ({ ...s, [kind]: true }))
    // The zip holds the originals and timestamps, so it is what counts as "saved".
    if (kind === 'zip') await session.markExported(property.id)
  }

  const done = saved.pdf && saved.zip

  return (
    <div class="stack">
      <button class="back" onClick={onBack}>
        <ArrowLeft size={18} /> Back
      </button>

      <section class={`save-hero ${done ? 'done' : ''}`}>
        <div class="hero-badge" aria-hidden="true">
          {done ? <Check size={40} /> : <ShieldCheck size={40} />}
        </div>
        <h1>{done ? 'Your record is saved' : 'Save your record'}</h1>
        <p>
          {done
            ? 'Keep both files until your deposit is back. Emailing them to yourself is an easy way to keep a copy.'
            : 'These two files are your proof. Save them to iCloud Drive, Google Drive, your computer, or email them to yourself.'}
        </p>
      </section>

      {(stage === 'stamping' || stage === 'building') && (
        <div class="card preparing" role="status">
          <span class="spinner big" aria-hidden="true" />
          <div>
            <strong>{stage === 'stamping' ? 'Finishing timestamps…' : 'Making your PDF and zip…'}</strong>
            <p class="muted small">Everything happens on this device.</p>
          </div>
        </div>
      )}

      {stage === 'error' && <p class="notice warn">Something went wrong while making your files. Go back and try again.</p>}

      {ready && (
        <>
          {ready.stamped < ready.photos && (
            <div class="notice">
              <p class="notice-title">
                <Wifi size={18} /> {ready.photos - ready.stamped} of {ready.photos} photos don’t have a timestamp yet
              </p>
              <p>Save now anyway. When you’re back online, save again to include the timestamps.</p>
            </div>
          )}
          <FileCard
            n={1}
            icon={<FileText size={26} />}
            title="Photo report (PDF)"
            detail={`Easy to read, print or send. ${mb(ready.pdf.size)}`}
            action="Save PDF report"
            saved={saved.pdf}
            onSave={() => save('pdf')}
          />
          <FileCard
            n={2}
            icon={<Archive size={26} />}
            title="Original photos and proof (zip)"
            detail={`Full-size photos and timestamp files that let anyone check them. ${mb(ready.zip.size)}`}
            action="Save photos and proof"
            saved={saved.zip}
            onSave={() => save('zip')}
          />
        </>
      )}

      <InstallHint always />
    </div>
  )
}

function FileCard(props: {
  n: number
  icon: JSX.Element
  title: string
  detail: string
  action: string
  saved: boolean
  onSave: () => void
}) {
  return (
    <div class={`file-card ${props.saved ? 'saved' : ''}`}>
      <div class="file-head">
        <span class="file-icon">{props.saved ? <Check size={26} /> : props.icon}</span>
        <div>
          <h2>
            {props.n}. {props.title}
          </h2>
          <p class="muted small">{props.detail}</p>
        </div>
      </div>
      <button class={`btn big ${props.saved ? '' : 'primary'}`} onClick={props.onSave}>
        {props.saved ? 'Saved. Save another copy' : props.action}
      </button>
    </div>
  )
}
