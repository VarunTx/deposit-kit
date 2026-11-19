import { useEffect, useRef, useState } from 'preact/hooks'
import type { Session } from '../lib/session.ts'
import { needsExport } from '../lib/session.ts'
import type { Photo, Property, Room } from '../lib/types.ts'
import { stateName } from '../lib/states.ts'
import { InstallHint } from './InstallHint.tsx'
import { RestoreButton } from './Restore.tsx'
import { useObjectUrl } from './feedback.tsx'
import { Camera, Check, ChevronRight, Download, Pencil, Plus, RoomIcon, ShieldCheck, Wifi } from './icons.tsx'

export const ROOM_SUGGESTIONS = ['Kitchen', 'Bathroom', 'Bedroom', 'Living room', 'Entry']

export function HomeView({
  session,
  property,
  version,
  onOpenRoom,
  onEdit,
  onSave,
  promptSave,
  onDismissPrompt,
}: {
  session: Session
  property: Property
  version: number
  onOpenRoom: (id: string) => void
  onEdit: () => void
  onSave: () => void
  promptSave: boolean
  onDismissPrompt: () => void
}) {
  const [rooms, setRooms] = useState<Room[]>([])
  const [photos, setPhotos] = useState<Photo[]>([])
  const [loaded, setLoaded] = useState(false)
  const [otherName, setOtherName] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    Promise.all([session.store.listRooms(property.id), session.store.listPropertyPhotos(property.id)]).then(([r, p]) => {
      setRooms(r)
      setPhotos(p)
      setLoaded(true)
    })
  }, [session, property.id, version])

  const addRoom = async (name: string) => {
    if (adding) return // a double tap shouldn't make "Kitchen" and "Kitchen 2"
    setAdding(true)
    try {
      const room = await session.addRoom(property, name)
      setOtherName(null)
      onOpenRoom(room.id)
    } finally {
      setAdding(false)
    }
  }

  const stamped = photos.filter((p) => p.stamp.status === 'stamped').length
  const failed = photos.filter((p) => p.stamp.status === 'failed').length
  const pending = photos.filter((p) => p.stamp.status === 'pending').length
  const unsaved = needsExport(property, photos.length)
  const roomsWithPhotos = rooms.filter((r) => photos.some((p) => p.roomId === r.id)).length

  return (
    <div class="stack">
      <section class="card summary">
        <div class="summary-head">
          <div>
            <p class="eyebrow">Move-in record</p>
            <h1>{property.label}</h1>
            <p class="muted small">
              Moved in {formatYmd(property.moveInDate)}
              {property.state ? ` · ${stateName(property.state)}` : ''}
            </p>
          </div>
          <button class="icon-btn" onClick={onEdit} aria-label="Edit home details">
            <Pencil size={18} />
          </button>
        </div>
        <div class="summary-stats">
          <ProgressRing value={stamped} total={photos.length} />
          <div class="stats-text">
            <p class="stats-main">
              {stampSummary(stamped, photos.length)}
            </p>
            <p class="muted small">
              {rooms.length} room{rooms.length === 1 ? '' : 's'} · {photos.length} photo{photos.length === 1 ? '' : 's'} saved on this device
            </p>
          </div>
        </div>
        {loaded && photos.length > 0 && (
          <p class={`status-line ${unsaved ? 'warn' : 'ok'}`}>
            {unsaved ? (
              <>
                <Download size={16} /> Not saved yet. Save your record before you close the app.
              </>
            ) : (
              <>
                <Check size={16} /> Saved {formatWhen(property.lastExportAt)}. Nice work.
              </>
            )}
          </p>
        )}
      </section>

      {promptSave && unsaved && <SavePrompt onSave={onSave} onLater={onDismissPrompt} />}

      {failed > 0 && (
        <div class="notice">
          <p class="notice-title">
            <Wifi size={18} /> {failed} photo{failed === 1 ? ' is' : 's are'} waiting for a timestamp
          </p>
          <p>Your photos are saved. The timestamp needs an internet connection.</p>
          <button class="btn" onClick={() => session.stampMissing(property.id)}>
            Try again now
          </button>
        </div>
      )}
      {pending > 0 && failed === 0 && (
        <p class="muted small pending-line">
          <span class="spinner" aria-hidden="true" /> Adding timestamps to {pending} photo{pending === 1 ? '' : 's'}…
        </p>
      )}

      <section class="section">
        <div class="section-head">
          <h2>Rooms</h2>
          {rooms.length > 0 && (
            <span class="muted small">
              {roomsWithPhotos} of {rooms.length} photographed
            </span>
          )}
        </div>
        {loaded && rooms.length === 0 && (
          <div class="empty-card">
            <Camera size={28} />
            <p>Start with the room you’re standing in. Pick one below.</p>
          </div>
        )}
        <ul class="room-list">
          {rooms.map((room) => (
            <RoomCard key={room.id} room={room} photos={photos.filter((p) => p.roomId === room.id)} onOpen={() => onOpenRoom(room.id)} />
          ))}
        </ul>
      </section>

      <section class="section">
        <h2>Add a room</h2>
        <div class="chips">
          {ROOM_SUGGESTIONS.map((name) => (
            <button key={name} class="chip" onClick={() => addRoom(name)} disabled={adding}>
              <RoomIcon name={name} size={18} /> {name}
            </button>
          ))}
          <button class="chip" onClick={() => setOtherName('')} disabled={adding}>
            <Plus size={18} /> Other
          </button>
        </div>
        {otherName !== null && (
          <form
            class="card inline-form"
            onSubmit={(e) => {
              e.preventDefault()
              if (otherName.trim()) addRoom(otherName)
            }}
          >
            <label class="field">
              <span>Room name</span>
              <input
                type="text"
                maxLength={40}
                placeholder="Hallway, balcony, garage…"
                value={otherName}
                autoFocus
                onInput={(e) => setOtherName(e.currentTarget.value)}
              />
            </label>
            <button class="btn primary" type="submit" disabled={!otherName.trim() || adding}>
              Add room
            </button>
          </form>
        )}
      </section>

      {photos.length > 0 && (
        <section class="save-cta">
          <button class={`btn big ${unsaved ? 'primary' : ''}`} onClick={onSave}>
            <ShieldCheck size={20} /> {unsaved ? 'Save my record' : 'Save a fresh copy'}
          </button>
        </section>
      )}

      <InstallHint />

      <section class="section restore-home">
        <h2>Restore a saved record</h2>
        <p class="muted small">Switched phones, or lost your photos? Load the zip file you saved. It replaces what’s on this device.</p>
        <RestoreButton session={session} existingPhotos={photos.length} unsaved={unsaved} variant="home" />
      </section>
    </div>
  )
}

function RoomCard({ room, photos, onOpen }: { room: Room; photos: Photo[]; onOpen: () => void }) {
  const stamped = photos.filter((p) => p.stamp.status === 'stamped').length
  const all = photos.length > 0 && stamped === photos.length
  return (
    <li>
      <button class="room-card" onClick={onOpen}>
        <span class={`room-icon ${photos.length ? 'done' : ''}`}>
          <RoomIcon name={room.name} />
        </span>
        <span class="room-text">
          <span class="room-name">{room.name}</span>
          <span class={`small ${all ? 'ok-text' : 'muted'}`}>
            {photos.length === 0
              ? 'No photos yet'
              : `${photos.length} photo${photos.length === 1 ? '' : 's'} · ${all ? 'all timestamped' : `${stamped} timestamped`}`}
          </span>
        </span>
        <span class="thumbs" aria-hidden="true">
          {photos.slice(-3).map((p) => (
            <Thumb key={p.id} blob={p.display} />
          ))}
        </span>
        <ChevronRight class="chev" />
      </button>
    </li>
  )
}

function Thumb({ blob }: { blob: Blob | null }) {
  const url = useObjectUrl(blob)
  return url ? <img class="thumb" src={url} alt="" /> : <span class="thumb blank" />
}

function ProgressRing({ value, total }: { value: number; total: number }) {
  const pct = total ? value / total : 0
  const r = 26
  const c = 2 * Math.PI * r
  return (
    <div class="ring" role="img" aria-label={`${value} of ${total} photos timestamped`}>
      <svg width="68" height="68" viewBox="0 0 68 68">
        <circle cx="34" cy="34" r={r} class="ring-track" />
        <circle cx="34" cy="34" r={r} class="ring-fill" stroke-dasharray={`${c * pct} ${c}`} transform="rotate(-90 34 34)" />
      </svg>
      <span class="ring-label">{total ? <ShieldCheck size={24} /> : <Camera size={22} />}</span>
    </div>
  )
}

function SavePrompt({ onSave, onLater }: { onSave: () => void; onLater: () => void }) {
  const primary = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    primary.current?.focus()
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onLater()
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onLater])
  return (
    <div class="dialog-backdrop" role="presentation" onClick={(e) => e.target === e.currentTarget && onLater()}>
      <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="save-prompt-title">
        <div class="dialog-icon" aria-hidden="true">
          <ShieldCheck size={30} />
        </div>
        <h2 id="save-prompt-title">Nice, that room is done. Save your record?</h2>
        <p>
          Right now your photos live only in this app. Phones can clear app data, and iPhones may do it after 7 days without
          opening Deposit Kit. Saving gives you files you keep.
        </p>
        <button ref={primary} class="btn primary big" onClick={onSave}>
          Save my record
        </button>
        <button class="btn ghost" onClick={onLater}>
          Later
        </button>
      </div>
    </div>
  )
}

export function formatYmd(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number)
  if (!y || !m || !d) return ymd
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatWhen(iso: string | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  const sameDay = d.toDateString() === new Date().toDateString()
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  return sameDay ? `today at ${time}` : `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} at ${time}`
}

function stampSummary(stamped: number, total: number): string {
  if (total === 0) return 'No photos yet'
  if (stamped === total) return total === 1 ? 'Your photo is timestamped' : `All ${total} photos timestamped`
  return `${stamped} of ${total} photos timestamped`
}
