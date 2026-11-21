import { useEffect, useState } from 'preact/hooks'
import type { Session } from '../lib/session.ts'
import { needsExport } from '../lib/session.ts'
import { isCar } from '../lib/car.ts'
import type { Photo, Property, RecordKind, Room } from '../lib/types.ts'
import { InstallHint } from './InstallHint.tsx'
import { RestoreButton } from './Restore.tsx'
import { StartChoices } from './Setup.tsx'
import { Thumb, formatYmd } from './Home.tsx'
import { Car, Check, ChevronRight, Download, Home } from './icons.tsx'

interface Summary {
  property: Property
  photos: Photo[]
  returnStarted: boolean
}

/** Every record on this device: homes and rental cars, newest first. */
export function RecordsView({
  session,
  records,
  version,
  onOpen,
  onStart,
}: {
  session: Session
  records: Property[]
  version: number
  onOpen: (id: string) => void
  onStart: (kind: RecordKind) => void
}) {
  const [summaries, setSummaries] = useState<Summary[] | null>(null)

  useEffect(() => {
    let cancelled = false
    Promise.all(
      records.map(async (property): Promise<Summary> => {
        const [photos, rooms] = await Promise.all([session.store.listPropertyPhotos(property.id), session.store.listRooms(property.id)])
        return { property, photos, returnStarted: rooms.some((r: Room) => r.phase === 'return') }
      }),
    ).then((s) => !cancelled && setSummaries(s))
    return () => {
      cancelled = true
    }
  }, [session, records, version])

  const sorted = [...(summaries ?? [])].sort((a, b) => b.property.createdAt.localeCompare(a.property.createdAt))
  const unsaved = sorted.filter((s) => needsExport(s.property, s.photos.length)).length

  return (
    <div class="stack">
      <div>
        <p class="eyebrow">Your records</p>
        <h1>Your rentals</h1>
        <p class="muted">
          {unsaved > 0
            ? `${unsaved} record${unsaved === 1 ? ' has' : 's have'} photos that aren’t in a saved file yet.`
            : 'Everything here is stored only on this device.'}
        </p>
      </div>

      <ul class="room-list">
        {sorted.map((s) => (
          <RecordCard key={s.property.id} summary={s} onOpen={() => onOpen(s.property.id)} />
        ))}
      </ul>

      <section class="section">
        <h2>Start a new record</h2>
        <StartChoices onStart={onStart} />
      </section>

      <InstallHint />

      <section class="section restore-home">
        <h2>Restore a saved record</h2>
        <p class="muted small">Switched phones, or lost your photos? Load the zip file you saved. It’s added next to the records already here.</p>
        <RestoreButton session={session} variant="home" onRestored={onOpen} />
      </section>
    </div>
  )
}

function RecordCard({ summary, onOpen }: { summary: Summary; onOpen: () => void }) {
  const { property, photos, returnStarted } = summary
  const car = isCar(property)
  const unsaved = needsExport(property, photos.length)
  const when = car
    ? `Picked up ${formatYmd(property.moveInDate)}${returnStarted ? ' · Return photos started' : ''}`
    : `Moved in ${formatYmd(property.moveInDate)}`
  return (
    <li>
      <button class="room-card record-card" onClick={onOpen}>
        <span class={`room-icon ${photos.length ? 'done' : ''}`}>{car ? <Car /> : <Home />}</span>
        <span class="room-text">
          <span class="muted small kind-label">{car ? 'Rental car' : 'Home'}</span>
          <span class="room-name">{property.label}</span>
          <span class="muted small">{when}</span>
          {photos.length > 0 && (
            <span class={`small record-status ${unsaved ? 'warn' : 'ok'}`}>
              {unsaved ? <Download size={14} /> : <Check size={14} />}
              {photos.length} photo{photos.length === 1 ? '' : 's'} · {unsaved ? 'not saved yet' : 'saved'}
            </span>
          )}
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
