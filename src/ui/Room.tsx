import { useEffect, useRef, useState } from 'preact/hooks'
import type { Session } from '../lib/session.ts'
import type { Photo, Property, Room } from '../lib/types.ts'

function useObjectUrl(blob: Blob | null): string | null {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!blob) return setUrl(null)
    const u = URL.createObjectURL(blob)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [blob])
  return url
}

export function RoomView({
  session,
  property,
  roomId,
  version,
  onBack,
  onSave,
}: {
  session: Session
  property: Property
  roomId: string
  version: number
  onBack: (addedThisVisit: number) => void
  onSave: () => void
}) {
  const [room, setRoom] = useState<Room | null>(null)
  const [photos, setPhotos] = useState<Photo[]>([])
  const [busy, setBusy] = useState(0)
  const [added, setAdded] = useState(0)
  const [problem, setProblem] = useState<string | null>(null)
  const cameraRef = useRef<HTMLInputElement>(null)
  const libraryRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    session.store.listRooms(property.id).then((rooms) => setRoom(rooms.find((r) => r.id === roomId) ?? null))
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
        setAdded((n) => n + 1)
      } catch (e) {
        const quota = e instanceof DOMException && e.name === 'QuotaExceededError'
        setProblem(
          quota
            ? 'Your device is out of space for photos. Save your record now, then free up space.'
            : `Couldn’t add ${file.name || 'that file'}. Please try a photo.`,
        )
      } finally {
        setBusy((n) => n - 1)
      }
    }
  }

  if (!room) return <p class="muted">Loading…</p>

  return (
    <div class="stack">
      <button class="back" onClick={() => onBack(added)}>
        ← All rooms
      </button>
      <header>
        <h1>{room.name}</h1>
        <p class="muted">
          Photograph walls, floors, doors, windows and appliances. Get close to anything damaged and add a note, like “scratch on
          floor by window”.
        </p>
      </header>

      <div class="capture">
        <button class="btn primary big" onClick={() => cameraRef.current?.click()} disabled={busy > 0}>
          <span aria-hidden="true">📷 </span>Take a photo
        </button>
        <button class="btn big" onClick={() => libraryRef.current?.click()} disabled={busy > 0}>
          Choose from photos
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
        <p class="muted" role="status">
          Saving {busy} photo{busy === 1 ? '' : 's'}…
        </p>
      )}
      {problem && (
        <p class="notice warn" role="alert">
          {problem}
        </p>
      )}

      {photos.length === 0 ? (
        <p class="muted center empty">No photos in this room yet.</p>
      ) : (
        <ul class="photo-list">
          {photos.map((p, i) => (
            <PhotoCard key={p.id} photo={p} index={i + 1} session={session} />
          ))}
        </ul>
      )}

      <div class="room-actions">
        <button class="btn big" onClick={() => onBack(added)}>
          Done with {room.name}
        </button>
        {photos.length > 0 && (
          <button class="btn ghost" onClick={onSave}>
            Save my record now
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
              onBack(0)
            }
          }}
        >
          Delete this room
        </button>
      </div>
    </div>
  )
}

function PhotoCard({ photo, index, session }: { photo: Photo; index: number; session: Session }) {
  const url = useObjectUrl(photo.display)
  const [note, setNote] = useState(photo.note)
  const timer = useRef<number | undefined>(undefined)

  // Keep in sync if the note changed elsewhere, but don't fight the user while typing.
  useEffect(() => {
    if (timer.current === undefined) setNote(photo.note)
  }, [photo.note])

  const save = (value: string) => {
    window.clearTimeout(timer.current)
    timer.current = undefined
    if (value !== photo.note) session.setNote(photo.id, value)
  }

  return (
    <li class="photo-card">
      {url ? (
        <img src={url} alt={note ? `Photo ${index}: ${note}` : `Photo ${index}`} loading="lazy" />
      ) : (
        <div class="no-preview">Preview not available on this device. The original is saved.</div>
      )}
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
          onClick={() => {
            if (confirm('Delete this photo from this device? This can’t be undone.')) session.deletePhoto(photo)
          }}
        >
          Delete photo
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
        ✓ Timestamped {new Date(s.genTime!).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
      </p>
    )
  }
  if (s.status === 'pending') return <p class="badge">Getting timestamp…</p>
  return (
    <p class="badge warn">
      Not yet timestamped. The photo is saved.{' '}
      <button class="link" onClick={onRetry}>
        Try again
      </button>
    </p>
  )
}
