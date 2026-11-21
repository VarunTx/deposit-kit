import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import type { Session } from '../lib/session.ts'
import type { Photo, Property, Room } from '../lib/types.ts'
import { useObjectUrl } from './feedback.tsx'
import { ArrowLeft, Camera, Check, Images, RoomIcon, ShieldCheck, SlotIcon, Trash, Wifi } from './icons.tsx'
import { PHASE_NAME, shotFor } from '../lib/car.ts'

const TIPS = [
  'Stand in the doorway and take one wide photo of the whole room',
  'Walls, floors and ceiling, including corners',
  'Windows, blinds, doors and locks',
  'Appliances and fixtures, inside and out',
  'Get close to anything scratched, stained, chipped or broken, and add a note',
]

/** Adds picked or dropped files to a room one at a time, with progress and plain error messages. */
export function useAddPhotos(session: Session, onAdded?: () => void) {
  const [busy, setBusy] = useState(0)
  const [problem, setProblem] = useState<string | null>(null)
  const add = async (room: Room, all: File[]): Promise<number> => {
    const files = all.filter((f) => !f.type || f.type.startsWith('image/'))
    const skipped = all.length - files.length
    if (all.length === 0) return 0
    setProblem(skipped ? `Skipped ${skipped} file${skipped === 1 ? '' : 's'} that ${skipped === 1 ? 'isn’t a photo' : 'aren’t photos'}.` : null)
    if (files.length === 0) return 0
    // Ask the browser not to clear our storage under pressure. Harmless if refused.
    navigator.storage?.persist?.().catch(() => {})
    setBusy((n) => n + files.length)
    let added = 0
    for (const file of files) {
      try {
        await session.addPhoto(room, file)
        added++
        onAdded?.()
      } catch (e) {
        const quota = e instanceof DOMException && e.name === 'QuotaExceededError'
        setProblem(
          quota
            ? 'Your device is out of space for photos. Save your record now, then free up some space.'
            : `Couldn’t add ${file.name || 'that file'}. Please choose a photo.`,
        )
      } finally {
        setBusy((n) => n - 1)
      }
    }
    return added
  }
  return { busy, problem, add }
}

export function RoomView({
  session,
  property,
  roomId,
  version,
  onBack,
  onMissing,
  onPhotoAdded,
  onSave,
}: {
  session: Session
  property: Property
  roomId: string
  version: number
  onBack: () => void
  onMissing: () => void
  onPhotoAdded: () => void
  onSave: () => void
}) {
  const [room, setRoom] = useState<Room | null>(null)
  const [photos, setPhotos] = useState<Photo[]>([])
  const { busy, problem, add } = useAddPhotos(session, onPhotoAdded)
  const [dragging, setDragging] = useState(false)
  const dragDepth = useRef(0)
  const cameraRef = useRef<HTMLInputElement>(null)
  const libraryRef = useRef<HTMLInputElement>(null)
  // Phones and tablets get "Take a photo"; computers get "Add photos" and drag-and-drop.
  const touch = useMemo(() => window.matchMedia?.('(pointer: coarse)').matches ?? false, [])

  useEffect(() => {
    session.store.listRooms(property.id).then((rooms) => {
      const found = rooms.find((r) => r.id === roomId) ?? null
      // A room that no longer exists (deleted, or reached with Back/Forward after a restore).
      if (!found) onMissing()
      else setRoom(found)
    })
    session.store.listPhotos(roomId).then(setPhotos)
  }, [session, property.id, roomId, version])

  const onFiles = (input: HTMLInputElement) => {
    const files = Array.from(input.files ?? [])
    input.value = '' // let the same file be picked again
    void addFiles(files)
  }

  const addFiles = async (all: File[]) => {
    if (room) await add(room, all)
  }

  if (!room) return <div class="loading" aria-label="Loading" />

  const stamped = photos.filter((p) => p.stamp.status === 'stamped').length
  // A spot on a rental car's shot list: fixed name, its own tip, can't be deleted.
  const shot = room.slot ? shotFor(room.slot) : undefined
  const isSpot = !!room.phase
  const title = room.phase ? `${PHASE_NAME[room.phase]}: ${room.name}` : room.name
  const tips = shot ? [shot.tip, 'Get close to anything scratched, dented or chipped, and add a note'] : TIPS
  const notePlaceholder = room.slot === 'dashboard' ? 'e.g. 12,345 miles, full tank' : isSpot ? 'e.g. scratch on rear bumper' : 'e.g. scratch on floor by window'

  const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files')

  return (
    <div
      class="stack"
      onDragEnter={(e) => {
        if (!hasFiles(e)) return
        e.preventDefault()
        dragDepth.current++
        setDragging(true)
      }}
      onDragOver={(e) => {
        if (!hasFiles(e)) return
        e.preventDefault()
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
      }}
      onDragLeave={() => {
        dragDepth.current = Math.max(0, dragDepth.current - 1)
        if (dragDepth.current === 0) setDragging(false)
      }}
      onDrop={(e) => {
        if (!hasFiles(e)) return
        e.preventDefault()
        dragDepth.current = 0
        setDragging(false)
        void addFiles(Array.from(e.dataTransfer?.files ?? []))
      }}
    >
      {dragging && (
        <div class="drop-overlay" aria-hidden="true">
          <div>
            <Images size={40} />
            <p>Drop photos to add them to {room.name}</p>
          </div>
        </div>
      )}
      <button class="back" onClick={onBack}>
        <ArrowLeft size={18} /> {isSpot ? 'Back to the car' : 'All rooms'}
      </button>
      <header class="room-head">
        <span class="room-icon big done">{isSpot ? <SlotIcon slot={room.slot} size={28} /> : <RoomIcon name={room.name} size={28} />}</span>
        <div>
          <h1>{title}</h1>
          <p class="muted small">
            {photos.length === 0
              ? 'No photos yet'
              : `${photos.length} photo${photos.length === 1 ? '' : 's'} · ${stamped} timestamped`}
          </p>
        </div>
      </header>

      <details class="tips" open={photos.length === 0}>
        <summary>What to photograph</summary>
        <ul>
          {tips.map((t) => (
            <li key={t}>
              <Check size={16} /> {t}
            </li>
          ))}
        </ul>
      </details>

      <div class={`capture ${touch ? '' : 'desktop'}`}>
        {touch ? (
          <>
            <button class="btn primary big" onClick={() => cameraRef.current?.click()} disabled={busy > 0}>
              <Camera size={22} /> Take a photo
            </button>
            <button class="btn big" onClick={() => libraryRef.current?.click()} disabled={busy > 0}>
              <Images size={22} /> Choose from photos
            </button>
          </>
        ) : (
          <>
            <button class="btn primary big" onClick={() => libraryRef.current?.click()} disabled={busy > 0}>
              <Images size={22} /> Add photos
            </button>
            <p class="muted small center drop-hint">or drag photos here from your computer. You can pick several at once.</p>
          </>
        )}
        <input
          ref={cameraRef}
          class="visually-hidden"
          type="file"
          accept="image/*"
          capture="environment"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => onFiles(e.currentTarget)}
        />
        <input
          ref={libraryRef}
          class="visually-hidden"
          type="file"
          accept="image/*"
          multiple
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => onFiles(e.currentTarget)}
        />
      </div>
      {busy > 0 && (
        <p class="saving-line" role="status">
          <span class="spinner" aria-hidden="true" /> Saving {busy} photo{busy === 1 ? '' : 's'} to this device…
        </p>
      )}
      {problem && (
        <p class="notice warn" role="alert">
          {problem}
        </p>
      )}

      {photos.length === 0 ? (
        <div class="empty-card">
          <Camera size={28} />
          <p>{touch ? 'No photos in this room yet. Your first photo is one tap away.' : 'No photos in this room yet. Drag photos here, or click Add photos.'}</p>
        </div>
      ) : (
        <ul class="photo-list">
          {photos.map((p, i) => (
            <PhotoCard key={p.id} photo={p} index={i + 1} session={session} placeholder={notePlaceholder} />
          ))}
        </ul>
      )}

      <div class="room-actions">
        <button class="btn big" onClick={onBack}>
          <Check size={20} /> {isSpot ? 'Done' : `Done with ${room.name}`}
        </button>
        {photos.length > 0 && (
          <button class="btn ghost" onClick={onSave}>
            <ShieldCheck size={18} /> Save my record now
          </button>
        )}
        {!isSpot && (
        <button
          class="btn danger-ghost"
          onClick={async () => {
            const msg =
              photos.length > 0
                ? `Delete ${room.name} and its ${photos.length} photo${photos.length === 1 ? '' : 's'} from this device? This can’t be undone.`
                : `Delete ${room.name}?`
            if (confirm(msg)) {
              await session.deleteRoom(room)
              onBack()
            }
          }}
        >
          <Trash size={18} /> Delete this room
        </button>
        )}
      </div>
    </div>
  )
}

function PhotoCard({ photo, index, session, placeholder }: { photo: Photo; index: number; session: Session; placeholder: string }) {
  const url = useObjectUrl(photo.display)
  const [note, setNote] = useState(photo.note)
  const timer = useRef<number | undefined>(undefined)
  const latest = useRef(note)
  latest.current = note

  // Keep in sync if the note changed elsewhere, but don't fight the user while typing.
  useEffect(() => {
    if (timer.current === undefined) setNote(photo.note)
  }, [photo.note])

  // Save a half-typed note if the card goes away before the debounce fires.
  useEffect(
    () => () => {
      if (timer.current !== undefined) {
        window.clearTimeout(timer.current)
        session.setNote(photo.id, latest.current)
      }
    },
    [session, photo.id],
  )

  // Phones can kill a backgrounded app without warning; save the note as soon as we're hidden.
  useEffect(() => {
    const flush = (e: Event) => {
      if ((e.type === 'pagehide' || document.visibilityState === 'hidden') && timer.current !== undefined) save(latest.current)
    }
    document.addEventListener('visibilitychange', flush)
    window.addEventListener('pagehide', flush)
    return () => {
      document.removeEventListener('visibilitychange', flush)
      window.removeEventListener('pagehide', flush)
    }
  })

  const save = (value: string) => {
    window.clearTimeout(timer.current)
    timer.current = undefined
    if (value !== photo.note) session.setNote(photo.id, value)
  }

  return (
    <li class="photo-card">
      <div class="photo-frame">
        {url ? (
          <img src={url} alt={note ? `Photo ${index}: ${note}` : `Photo ${index}`} loading="lazy" />
        ) : (
          <div class="no-preview">Preview not available on this device. The original is saved.</div>
        )}
        <span class="photo-num">{index}</span>
      </div>
      <div class="photo-body">
        <StampBadge photo={photo} onRetry={() => session.enqueueStamp(photo.id)} />
        <label class="field">
          <span>Note (optional)</span>
          <input
            type="text"
            maxLength={200}
            placeholder={placeholder}
            value={note}
            onInput={(e) => {
              const v = e.currentTarget.value
              setNote(v)
              window.clearTimeout(timer.current)
              timer.current = window.setTimeout(() => save(v), 600)
            }}
            onBlur={(e) => save(e.currentTarget.value)}
          />
        </label>
        <button
          class="link danger"
          aria-label={`Delete photo ${index}`}
          onClick={() => {
            if (confirm('Delete this photo from this device? This can’t be undone.')) session.deletePhoto(photo)
          }}
        >
          <Trash size={16} /> Delete photo
        </button>
      </div>
    </li>
  )
}

export function StampBadge({ photo, onRetry }: { photo: Photo; onRetry: () => void }) {
  const s = photo.stamp
  if (s.status === 'stamped') {
    return (
      <p class="badge ok">
        <ShieldCheck size={18} />
        <span>Timestamped {new Date(s.genTime!).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}</span>
      </p>
    )
  }
  if (s.status === 'pending') {
    return (
      <p class="badge pending">
        <span class="spinner" aria-hidden="true" />
        <span>Saved. Getting timestamp…</span>
      </p>
    )
  }
  return (
    <p class="badge warn">
      <Wifi size={18} />
      <span>
        Saved, waiting for a timestamp.{' '}
        <button class="link" onClick={onRetry}>
          Try again
        </button>
      </span>
    </p>
  )
}
