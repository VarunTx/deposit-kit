import { useEffect, useState } from 'preact/hooks'
import type { Session } from '../lib/session.ts'
import { needsExport } from '../lib/session.ts'
import type { Photo, Property, Room } from '../lib/types.ts'
import { stateName } from '../lib/states.ts'
import { InstallHint } from './InstallHint.tsx'

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
  const [otherName, setOtherName] = useState<string | null>(null)

  useEffect(() => {
    session.store.listRooms(property.id).then(setRooms)
    session.store.listPropertyPhotos(property.id).then(setPhotos)
  }, [session, property.id, version])

  const addRoom = async (name: string) => {
    const room = await session.addRoom(property, name)
    setOtherName(null)
    onOpenRoom(room.id)
  }

  const failed = photos.filter((p) => p.stamp.status === 'failed').length
  const pending = photos.filter((p) => p.stamp.status === 'pending').length
  const unsaved = needsExport(property, photos.length)

  return (
    <div class="stack">
      <header class="home-head">
        <p class="eyebrow">Move-in record</p>
        <h1>{property.label}</h1>
        <p class="muted">
          Moved in {formatYmd(property.moveInDate)}
          {property.state ? ` · ${stateName(property.state)}` : ''} ·{' '}
          <button class="link" onClick={onEdit}>
            Edit
          </button>
        </p>
      </header>

      {promptSave && unsaved && (
        <div class="dialog-backdrop" role="presentation">
          <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="save-prompt-title">
            <h2 id="save-prompt-title">Save your record now?</h2>
            <p>
              Your photos are only on this device. Phones can clear app data, and iPhones may delete it if you don’t open Deposit Kit
              for 7 days. Saving gives you files you can keep.
            </p>
            <button class="btn primary big" onClick={onSave}>
              Save my record
            </button>
            <button class="btn ghost" onClick={onDismissPrompt}>
              Later
            </button>
          </div>
        </div>
      )}

      {unsaved && !promptSave && (
        <div class="notice warn">
          <strong>Not saved yet.</strong> You have photos that aren’t in a saved record. Save it before you close the app.
          <button class="btn primary" onClick={onSave}>
            Save my record
          </button>
        </div>
      )}

      {failed > 0 && (
        <div class="notice">
          {failed} photo{failed === 1 ? ' is' : 's are'} not yet timestamped. Your photos are saved; we just need a connection to add
          the timestamp.
          <button class="btn" onClick={() => session.stampMissing(property.id)}>
            Try again
          </button>
        </div>
      )}
      {pending > 0 && failed === 0 && <p class="muted small">Adding timestamps to {pending} photo{pending === 1 ? '' : 's'}…</p>}

      <section>
        <h2>Rooms</h2>
        {rooms.length === 0 && <p class="muted">Start with the room you’re standing in. Pick one below.</p>}
        <ul class="room-list">
          {rooms.map((room) => {
            const rp = photos.filter((p) => p.roomId === room.id)
            const stamped = rp.filter((p) => p.stamp.status === 'stamped').length
            return (
              <li key={room.id}>
                <button class="room-card" onClick={() => onOpenRoom(room.id)}>
                  <span class="room-name">{room.name}</span>
                  <span class="muted small">
                    {rp.length === 0
                      ? 'No photos yet'
                      : `${rp.length} photo${rp.length === 1 ? '' : 's'} · ${stamped === rp.length ? 'all timestamped' : `${stamped} timestamped`}`}
                  </span>
                  <span class="chev" aria-hidden="true">
                    ›
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </section>

      <section>
        <h2>Add a room</h2>
        <div class="chips">
          {ROOM_SUGGESTIONS.map((name) => (
            <button key={name} class="chip" onClick={() => addRoom(name)}>
              + {name}
            </button>
          ))}
          <button class="chip" onClick={() => setOtherName('')}>
            + Other
          </button>
        </div>
        {otherName !== null && (
          <form
            class="inline-form"
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
            <button class="btn primary" type="submit" disabled={!otherName.trim()}>
              Add room
            </button>
          </form>
        )}
      </section>

      {photos.length > 0 && (
        <section>
          <button class="btn primary big" onClick={onSave}>
            Save my record
          </button>
          <p class="muted small center">
            {property.lastExportAt ? `Last saved ${new Date(property.lastExportAt).toLocaleString()}` : 'Not saved yet'}
          </p>
        </section>
      )}

      <InstallHint />
    </div>
  )
}

export function formatYmd(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number)
  if (!y || !m || !d) return ymd
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
