import { useState } from 'preact/hooks'
import type { CarDetails, Property, RecordKind } from '../lib/types.ts'
import { US_STATES } from '../lib/states.ts'
import { carLabel, emptyCar } from '../lib/car.ts'
import { ArrowLeft, Camera, Car, ChevronRight, Clock, FileText, Fingerprint, Home, Lock, ShieldCheck } from './icons.tsx'
import type { Session } from '../lib/session.ts'
import { RestoreButton } from './Restore.tsx'

/** The two kinds of record, as big tappable cards. */
export function StartChoices({ onStart }: { onStart: (kind: RecordKind) => void }) {
  return (
    <div class="kind-options">
      <button class="kind-option" onClick={() => onStart('home')}>
        <span class="kind-icon">
          <Home size={26} />
        </span>
        <span class="kind-text">
          <span class="kind-name">Apartment or house</span>
          <span class="muted small">Move-in photos, room by room. About 10 minutes.</span>
        </span>
        <ChevronRight class="chev" />
      </button>
      <button class="kind-option" onClick={() => onStart('car')}>
        <span class="kind-icon">
          <Car size={26} />
        </span>
        <span class="kind-text">
          <span class="kind-name">Rental car</span>
          <span class="muted small">Guided photos at pickup and again at return. About 3 minutes each.</span>
        </span>
        <ChevronRight class="chev" />
      </button>
    </div>
  )
}

export function Intro({ onStart, session, onRestored }: { onStart: (kind: RecordKind) => void; session: Session; onRestored: (id: string) => void }) {
  return (
    <div class="stack">
      <section class="hero">
        <div class="hero-badge" aria-hidden="true">
          <ShieldCheck size={40} />
        </div>
        <h1>Prove what your rental looked like</h1>
        <p class="hero-sub">
          Take photos that carry a signed timestamp, so you can show what was already there before anyone charges you for it.
        </p>
        <ul class="trust-row">
          <li>
            <Lock size={16} /> Photos stay on your phone
          </li>
          <li>
            <Clock size={16} /> Signed timestamps
          </li>
          <li>
            <ShieldCheck size={16} /> Free, no account
          </li>
        </ul>
      </section>

      <section class="section">
        <h2>What are you renting?</h2>
        <StartChoices onStart={onStart} />
      </section>

      <ol class="steps">
        <li>
          <span class="step-icon">
            <Camera />
          </span>
          <div>
            <h2>Photograph everything</h2>
            <p>The app tells you what to photograph. Get close to anything worn, scratched or broken, and add a short note.</p>
          </div>
        </li>
        <li>
          <span class="step-icon">
            <Fingerprint />
          </span>
          <div>
            <h2>Each photo gets a timestamp</h2>
            <p>A public timestamp service signs a fingerprint of each photo. That shows when it was taken. The photo itself is never uploaded.</p>
          </div>
        </li>
        <li>
          <span class="step-icon">
            <FileText />
          </span>
          <div>
            <h2>Save your record</h2>
            <p>Get a PDF report and a zip of the original photos. Keep them until your deposit is back or your rental is settled.</p>
          </div>
        </li>
      </ol>

      <div class="restore-intro">
        <p class="muted small center">New phone, or the app lost your photos? Load the zip file you saved.</p>
        <RestoreButton session={session} variant="intro" onRestored={onRestored} />
      </div>
    </div>
  )
}

function today(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export type HomeFields = Pick<Property, 'label' | 'moveInDate' | 'state'>
export type CarFields = Pick<Property, 'label' | 'moveInDate'> & { car: CarDetails }

export function SetupForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: Property
  onSave: (f: HomeFields) => void
  onCancel: () => void
}) {
  const [label, setLabel] = useState(initial?.label ?? '')
  const [moveInDate, setMoveInDate] = useState(initial?.moveInDate ?? today())
  const [state, setState] = useState(initial?.state ?? '')

  return (
    <form
      class="stack"
      onSubmit={(e) => {
        e.preventDefault()
        if (label.trim()) onSave({ label: label.trim(), moveInDate, state })
      }}
    >
      <button type="button" class="back" onClick={onCancel}>
        <ArrowLeft size={18} /> Back
      </button>
      <div>
        <p class="eyebrow">{initial ? 'Your home' : 'Getting started'}</p>
        <h1>{initial ? 'Edit your home' : 'Which home is this for?'}</h1>
        <p class="muted">This goes on your report so anyone reading it knows which home it’s about.</p>
      </div>
      <div class="card form-card">
        <label class="field">
          <span>Address or name</span>
          <input
            type="text"
            required
            maxLength={120}
            autoComplete="street-address"
            placeholder="Apt 4B, 120 Main St"
            value={label}
            onInput={(e) => setLabel(e.currentTarget.value)}
          />
        </label>
        <label class="field">
          <span>Move-in date</span>
          <input type="date" required value={moveInDate} onInput={(e) => setMoveInDate(e.currentTarget.value)} />
        </label>
        <label class="field">
          <span>State</span>
          <select value={state} onChange={(e) => setState(e.currentTarget.value)}>
            <option value="">Choose a state</option>
            {US_STATES.map(([code, name]) => (
              <option key={code} value={code}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <p class="privacy-note">
          <Lock size={16} /> Saved only on this device. Deposit Kit has no accounts and never sees your address.
        </p>
      </div>
      <button class="btn primary big" type="submit" disabled={!label.trim()}>
        {initial ? 'Save changes' : 'Continue to rooms'}
      </button>
    </form>
  )
}

const COMPANIES = ['Alamo', 'Avis', 'Budget', 'Dollar', 'Enterprise', 'Fox', 'Hertz', 'National', 'Payless', 'Sixt', 'Thrifty', 'Turo', 'Zipcar']

/** Car details. Everything is optional except the car itself, so people at a counter can start fast and fill in the rest later. */
export function CarSetupForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: Property
  onSave: (f: CarFields) => void
  onCancel: () => void
}) {
  const [car, setCar] = useState<CarDetails>(initial?.car ?? emptyCar())
  const [pickupDate, setPickupDate] = useState(initial?.moveInDate ?? today())
  const set = (k: keyof CarDetails) => (e: { currentTarget: HTMLInputElement }) => setCar((c) => ({ ...c, [k]: e.currentTarget.value }))
  const ready = !!(car.vehicle.trim() || car.plate.trim())

  return (
    <form
      class="stack"
      onSubmit={(e) => {
        e.preventDefault()
        if (!ready) return
        const clean = Object.fromEntries(Object.entries(car).map(([k, v]) => [k, v.trim()])) as unknown as CarDetails
        clean.plate = clean.plate.toUpperCase()
        onSave({ label: carLabel(clean), moveInDate: pickupDate, car: clean })
      }}
    >
      <button type="button" class="back" onClick={onCancel}>
        <ArrowLeft size={18} /> Back
      </button>
      <div>
        <p class="eyebrow">{initial ? 'Your rental car' : 'Rental car'}</p>
        <h1>{initial ? 'Edit car details' : 'Which car is this?'}</h1>
        <p class="muted">
          {initial
            ? 'These go on your report so anyone reading it knows which rental it’s about.'
            : 'Only the car or plate is needed now. Fill in the rest later if you’re in a hurry.'}
        </p>
      </div>
      <div class="card form-card">
        <label class="field">
          <span>Car</span>
          <input type="text" maxLength={80} placeholder="White Toyota Camry" value={car.vehicle} onInput={set('vehicle')} />
        </label>
        <label class="field">
          <span>License plate</span>
          <input type="text" maxLength={20} autoCapitalize="characters" placeholder="8ABC123" value={car.plate} onInput={set('plate')} />
        </label>
        <label class="field">
          <span>Rental company (optional)</span>
          <input type="text" maxLength={80} list="rental-companies" placeholder="Enterprise, Hertz, Turo…" value={car.company} onInput={set('company')} />
          <datalist id="rental-companies">
            {COMPANIES.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </label>
        <label class="field">
          <span>Reservation or agreement number (optional)</span>
          <input type="text" maxLength={40} value={car.reservation} onInput={set('reservation')} />
        </label>
        <label class="field">
          <span>Pickup date</span>
          <input type="date" required value={pickupDate} onInput={(e) => setPickupDate(e.currentTarget.value)} />
        </label>
        <label class="field">
          <span>Pickup location (optional)</span>
          <input type="text" maxLength={120} placeholder="Airport, garage level 2" value={car.pickupPlace} onInput={set('pickupPlace')} />
        </label>
        {initial && (
          <label class="field">
            <span>Return location (optional)</span>
            <input type="text" maxLength={120} placeholder="Same as pickup" value={car.returnPlace} onInput={set('returnPlace')} />
          </label>
        )}
        <p class="privacy-note">
          <Lock size={16} /> Saved only on this device. Deposit Kit has no accounts and never sees these details.
        </p>
      </div>
      <button class="btn primary big" type="submit" disabled={!ready}>
        {initial ? 'Save changes' : 'Start pickup photos'}
      </button>
    </form>
  )
}
