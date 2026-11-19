import { useEffect, useRef, useState } from 'preact/hooks'
import type { Session } from '../lib/session.ts'
import type { Photo, Property, Room } from '../lib/types.ts'
import { useObjectUrl } from './feedback.tsx'
import { ArrowLeft, Camera, Check, Images, RoomIcon, ShieldCheck, Trash, Wifi } from './icons.tsx'

const TIPS = [
  'Stand in the doorway and take one wide photo of the whole room',
  'Walls, floors and ceiling, including corners',
  'Windows, blinds, doors and locks',
  'Appliances and fixtures, inside and out',
  'Get close to anything scratched, stained, chipped or broken, and add a note',
]

export function RoomView({
  session,
  property,
  roomId,
  version,
  onBack,
  onPhotoAdded,
  onSave,
}: {
  session: Session
  property: Property
  roomId: string
  version: number
  onBack: () => void
  onPhotoAdded: () => void
  onSave: () => void
}) {
  const [room, setRoom] = useState<Room | null>(null)
  const [photos, setPhotos] = useState<Photo[]>([])
  const [busy, setBusy] = useState(0)
  const [problem, setProblem] = useState<string | null>(null)
  const cameraRef = useRef<HTMLInputElement>(null)
  const libraryRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    session.store.listRooms(property.id).then((rooms) => {
      const found = rooms.find((r) => r.id === roomId) ?? null
      // A room that no longer exists (deleted, or reached with Back/Forward after a restore).
      if (!found) onBack()
      else setRoom(found)
    })
    session.store.listPhotos(roomId).then(setPhotos)
  }, [session, property.id, roomId, version])

  const onFiles = async (input: HTMLInputElement) => {
    const files = Array.from(input.files ?? [])
    input.value = '' // let the same file be picked again
    if (!room || files.length === 0) return
    setProblem(null)
    // Ask the browser not to clear our storage under pressure. Harmless if refused.
    navigator.storage?.persist?.().catch(() => {})
    setBusy((n) => n + files.length)
    for (const file of files) {
      try {
        if (file.type && !file.type.startsWith('image/')) throw new Error('not an image')
        await session.addPhoto(room, file)
        onPhotoAdded()
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
  }

  if (!room) return <div class="loading" aria-label="Loading" />

  const stamped = photos.filter((p) => p.stamp.status === 'stamped').length

  return (
    <div class="stack">
      <button class="back" onClick={onBack}>
        <ArrowLeft size={18} /> All rooms
      </button>
      <header class="room-head">
        <span class="room-icon big done">
          <RoomIcon name={room.name} size={28} />
        </span>
        <div>
          <h1>{room.name}</h1>
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
          {TIPS.map((t) => (
            <li key={t}>
              <Check size={16} /> {t}
            </li>
          ))}
        </ul>
      </details>

      <div class="capture">
        <button class="btn primary big" onClick={() => cameraRef.current?.click()} disabled={busy > 0}>
          <Camera size={22} /> Take a photo
        </button>
        <button class="btn big" onClick={() => libraryRef.current?.click()} disabled={busy > 0}>
          <Images size={22} /> Choose from photos
        </button>
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
          <p>No photos in this room yet. Your first photo is one tap away.</p>
        </div>
      ) : (
        <ul class="photo-list">
          {photos.map((p, i) => (
            <PhotoCard key={p.id} photo={p} index={i + 1} session={session} />
          ))}
        </ul>
      )}

      <div class="room-actions">
        <button class="btn big" onClick={onBack}>
          <Check size={20} /> Done with {room.name}
        </button>
        {photos.length > 0 && (
          <button class="btn ghost" onClick={onSave}>
            <ShieldCheck size={18} /> Save my record now
          </button>
        )}
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
      </div>
    </div>
  )
}

function PhotoCard({ photo, index, session }: { photo: Photo; index: number; session: Session }) {
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
            placeholder="e.g. scratch on floor by window"
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

function StampBadge({ photo, onRetry }: { photo: Photo; onRetry: () => void }) {
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
