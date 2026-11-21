import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import type { Session } from '../lib/session.ts'
import { needsExport } from '../lib/session.ts'
import { PHASE_NAME, shotFor } from '../lib/car.ts'
import type { Phase, Photo, Property, Room } from '../lib/types.ts'
import { InstallHint } from './InstallHint.tsx'
import { DeleteRecord, ProgressRing, SavedLine, StampNotices, formatYmd, stampSummary } from './Home.tsx'
import { useAddPhotos } from './Room.tsx'
import { useObjectUrl } from './feedback.tsx'
import { ArrowLeft, Camera, Check, Images, Key, Pencil, ShieldCheck, SlotIcon } from './icons.tsx'

/** A rental car: a guided walkaround at pickup, the same again at return, then save. */
export function CarView({
  session,
  property,
  version,
  onBack,
  onOpenRoom,
  onEdit,
  onSave,
}: {
  session: Session
  property: Property
  version: number
  onBack: () => void
  onOpenRoom: (id: string) => void
  onEdit: () => void
  onSave: () => void
}) {
  const [rooms, setRooms] = useState<Room[]>([])
  const [photos, setPhotos] = useState<Photo[]>([])
  const [loaded, setLoaded] = useState(false)
  const [chosen, setChosen] = useState<Phase | null>(null)
  const [skipped, setSkipped] = useState<Set<string>>(new Set())
  // Spots just photographed. The card moves on as soon as a save finishes, before the photo list reloads,
  // so a quick next tap can't land in the spot that was just done.
  const [filled, setFilled] = useState<Set<string>>(new Set())
  const [lastSaved, setLastSaved] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
  const cameraRef = useRef<HTMLInputElement>(null)
  const libraryRef = useRef<HTMLInputElement>(null)
  const target = useRef<Room | null>(null)
  const touch = useMemo(() => window.matchMedia?.('(pointer: coarse)').matches ?? false, [])
  const { busy, problem, add } = useAddPhotos(session)

  useEffect(() => {
    Promise.all([session.store.listRooms(property.id), session.store.listPropertyPhotos(property.id)]).then(([r, p]) => {
      setRooms(r)
      setPhotos(p)
      setLoaded(true)
    })
  }, [session, property.id, version])

  if (!loaded) return <div class="loading" aria-label="Loading" />

  const car = property.car
  const hasReturn = rooms.some((r) => r.phase === 'return')
  const phase: Phase = chosen ?? (hasReturn ? 'return' : 'pickup')
  const phaseRooms = rooms.filter((r) => r.phase === phase)
  const photosIn = (r: Room) => photos.filter((p) => p.roomId === r.id)
  const required = phaseRooms.filter((r) => !shotFor(r.slot)?.optional)
  const requiredDone = required.filter((r) => photosIn(r).length > 0).length
  const next = phaseRooms.find((r) => photosIn(r).length === 0 && !skipped.has(r.id) && !filled.has(r.id))
  const skippedRequired = required.filter((r) => photosIn(r).length === 0).length
  const pickupPhotos = rooms.filter((r) => r.phase === 'pickup').reduce((n, r) => n + photosIn(r).length, 0)
  const stamped = photos.filter((p) => p.stamp.status === 'stamped').length
  const unsaved = needsExport(property, photos.length)

  const progress = (ph: Phase) => {
    const rs = rooms.filter((r) => r.phase === ph && !shotFor(r.slot)?.optional)
    if (rs.length === 0) return 'not started'
    return `${rs.filter((r) => photosIn(r).length > 0).length} of ${rs.length} spots`
  }

  const pick = (room: Room, camera: boolean) => {
    target.current = room
    ;(camera ? cameraRef : libraryRef).current?.click()
  }

  const onFiles = async (input: HTMLInputElement) => {
    const files = Array.from(input.files ?? [])
    input.value = ''
    const room = target.current
    if (!room || files.length === 0) return
    const n = await add(room, files)
    if (n > 0) {
      setFilled((s) => new Set(s).add(room.id))
      setLastSaved(room.name)
    }
  }

  const skip = (room: Room) => {
    setSkipped((s) => new Set(s).add(room.id))
    setLastSaved(null)
  }

  const startReturn = async () => {
    if (starting) return
    setStarting(true)
    try {
      await session.addPhase(property, 'return')
      setChosen('return')
      setSkipped(new Set())
      setLastSaved(null)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } finally {
      setStarting(false)
    }
  }

  // At return, show the pickup photo of the same spot so it's easy to match the angle.
  const pickupMatch = next && phase === 'return' ? rooms.find((r) => r.phase === 'pickup' && r.slot === next.slot) : undefined
  const pickupPhoto = pickupMatch ? photosIn(pickupMatch)[0] : undefined

  return (
    <div class="stack">
      <button class="back" onClick={onBack}>
        <ArrowLeft size={18} /> All records
      </button>

      <section class="card summary">
        <div class="summary-head">
          <div>
            <p class="eyebrow">Rental car</p>
            <h1>{property.label}</h1>
            <p class="muted small">
              {car?.company ? `${car.company} · ` : ''}Picked up {formatYmd(property.moveInDate)}
            </p>
          </div>
          <button class="icon-btn" onClick={onEdit} aria-label="Edit car details">
            <Pencil size={18} />
          </button>
        </div>
        <div class="summary-stats">
          <ProgressRing value={stamped} total={photos.length} />
          <div class="stats-text">
            <p class="stats-main">{stampSummary(stamped, photos.length)}</p>
            <p class="muted small">
              Pickup: {progress('pickup')} · Return: {progress('return')}
            </p>
          </div>
        </div>
        <SavedLine property={property} photos={photos.length} unsaved={unsaved} />
      </section>

      <StampNotices session={session} property={property} photos={photos} />

      {hasReturn && (
        <div class="segmented" role="tablist" aria-label="Which visit">
          {(['pickup', 'return'] as Phase[]).map((ph) => (
            <button
              key={ph}
              role="tab"
              aria-selected={phase === ph}
              class={phase === ph ? 'on' : ''}
              onClick={() => {
                setChosen(ph)
                setLastSaved(null)
              }}
            >
              {PHASE_NAME[ph]}
            </button>
          ))}
        </div>
      )}

      {next ? (
        <section class="card next-shot" aria-live="polite">
          {lastSaved && (
            <p class="saved-flash">
              <Check size={16} /> {lastSaved} saved
            </p>
          )}
          <p class="eyebrow">
            {PHASE_NAME[phase]} · photo {phaseRooms.indexOf(next) + 1} of {phaseRooms.length}
          </p>
          <div class="next-head">
            <span class="room-icon big done">
              <SlotIcon slot={next.slot} size={28} />
            </span>
            <h2>{next.name}</h2>
          </div>
          <p class="muted">{shotFor(next.slot)?.tip}</p>
          {pickupPhoto && <PickupReference photo={pickupPhoto} />}
          {touch ? (
            <div class="capture">
              <button class="btn primary big" onClick={() => pick(next, true)} disabled={busy > 0}>
                <Camera size={22} /> Take photo
              </button>
              <button class="btn" onClick={() => pick(next, false)} disabled={busy > 0}>
                <Images size={20} /> Choose from photos
              </button>
            </div>
          ) : (
            <button class="btn primary big" onClick={() => pick(next, false)} disabled={busy > 0}>
              <Images size={22} /> Add photos of the {next.name.toLowerCase()}
            </button>
          )}
          {busy > 0 && (
            <p class="saving-line" role="status">
              <span class="spinner" aria-hidden="true" /> Saving to this device…
            </p>
          )}
          {problem && (
            <p class="notice warn" role="alert">
              {problem}
            </p>
          )}
          <button class="link" onClick={() => skip(next)} disabled={busy > 0}>
            {shotFor(next.slot)?.optional ? 'Nothing to add, skip' : 'Skip for now'}
          </button>
        </section>
      ) : (
        <section class={`card next-shot ${skippedRequired === 0 ? 'done' : ''}`}>
          {skippedRequired === 0 ? (
            <>
              <div class="next-head">
                <span class="room-icon big done">
                  <Check size={28} />
                </span>
                <h2>{PHASE_NAME[phase]} photos done</h2>
              </div>
              <p class="muted">
                {phase === 'pickup'
                  ? 'Save your record now. When you return the car, open this record again and take the return photos.'
                  : 'Save your record now, before you leave if you can. Keep the files for a few months: damage charges can arrive weeks after a rental.'}
              </p>
            </>
          ) : (
            <>
              <h2>
                {skippedRequired} spot{skippedRequired === 1 ? '' : 's'} still need{skippedRequired === 1 ? 's' : ''} a photo
              </h2>
              <p class="muted">Missing spots are where disputes start. You can still save what you have.</p>
              <button class="btn" onClick={() => setSkipped(new Set())}>
                Go back to skipped spots
              </button>
            </>
          )}
          {unsaved && (
            <button class="btn primary big" onClick={onSave}>
              <ShieldCheck size={20} /> Save my record
            </button>
          )}
        </section>
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

      <section class="section">
        <div class="section-head">
          <h2>{PHASE_NAME[phase]} photos</h2>
          <span class="muted small">
            {requiredDone} of {required.length} spots
          </span>
        </div>
        <ul class="shot-grid">
          {phaseRooms.map((r) => (
            <ShotTile key={r.id} room={r} photos={photosIn(r)} next={r.id === next?.id} onOpen={() => onOpenRoom(r.id)} />
          ))}
        </ul>
      </section>

      {phase === 'pickup' && !hasReturn && pickupPhotos > 0 && (
        <section class="card return-cta">
          <div class="next-head">
            <span class="room-icon big">
              <Key size={26} />
            </span>
            <h2>Returning the car?</h2>
          </div>
          <p class="muted">
            Take the same photos at the drop-off spot before you hand over the keys. Damage charges usually arrive after you’ve left,
            so these photos matter most.
          </p>
          <button class="btn big" onClick={startReturn} disabled={starting}>
            <Camera size={20} /> Start return photos
          </button>
        </section>
      )}

      {photos.length > 0 && (next || !unsaved) && (
        <section class="save-cta">
          <button class={`btn big ${unsaved ? 'primary' : ''}`} onClick={onSave}>
            <ShieldCheck size={20} /> {unsaved ? 'Save my record' : 'Save a fresh copy'}
          </button>
        </section>
      )}

      <InstallHint />

      <DeleteRecord session={session} property={property} photos={photos.length} unsaved={unsaved} onDeleted={onBack} />
    </div>
  )
}

function ShotTile({ room, photos, next, onOpen }: { room: Room; photos: Photo[]; next: boolean; onOpen: () => void }) {
  const last = photos[photos.length - 1]
  const url = useObjectUrl(last?.display)
  const optional = shotFor(room.slot)?.optional
  const done = photos.length > 0
  return (
    <li>
      <button class={`shot-tile ${done ? 'done' : ''} ${next ? 'next' : ''}`} onClick={onOpen} aria-label={`${room.name}: ${done ? `${photos.length} photos` : 'no photos yet'}`}>
        <span class="shot-media">
          {url ? <img src={url} alt="" /> : <SlotIcon slot={room.slot} size={26} />}
          {done && (
            <span class="shot-check" aria-hidden="true">
              <Check size={14} />
            </span>
          )}
        </span>
        <span class="shot-name">{room.name}</span>
        <span class="muted small">
          {done ? `${photos.length} photo${photos.length === 1 ? '' : 's'}` : next ? 'Up next' : optional ? 'Optional' : 'Not yet'}
        </span>
      </button>
    </li>
  )
}

function PickupReference({ photo }: { photo: Photo }) {
  const url = useObjectUrl(photo.display)
  if (!url) return null
  return (
    <figure class="pickup-ref">
      <img src={url} alt="The same spot at pickup" />
      <figcaption class="muted small">At pickup. Try to match this angle.</figcaption>
    </figure>
  )
}
