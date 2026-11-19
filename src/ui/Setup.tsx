import { useState } from 'preact/hooks'
import type { Property } from '../lib/types.ts'
import { US_STATES } from '../lib/states.ts'
import { ArrowLeft, Camera, Clock, FileText, Fingerprint, Lock, ShieldCheck } from './icons.tsx'
import type { Session } from '../lib/session.ts'
import { RestoreButton } from './Restore.tsx'

export function Intro({ onStart, session }: { onStart: () => void; session: Session }) {
  return (
    <div class="stack">
      <section class="hero">
        <div class="hero-badge" aria-hidden="true">
          <ShieldCheck size={40} />
        </div>
        <h1>Prove your rental’s condition from day one</h1>
        <p class="hero-sub">
          Take move-in photos that carry a signed timestamp, so you can show what was already there when you move out.
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

      <ol class="steps">
        <li>
          <span class="step-icon">
            <Camera />
          </span>
          <div>
            <h2>Walk through each room</h2>
            <p>Photograph walls, floors and appliances. Get close to anything worn, scratched or broken, and add a short note.</p>
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
            <p>Get a PDF report and a zip of the original photos. Keep them safe until you get your deposit back.</p>
          </div>
        </li>
      </ol>

      <button class="btn primary big" onClick={onStart}>
        Start my move-in record
      </button>
      <p class="muted small center">Takes about 10 minutes. Have your phone charged and the lights on.</p>
      <div class="restore-intro">
        <p class="muted small center">New phone, or the app lost your photos? Load the zip file you saved.</p>
        <RestoreButton session={session} existingPhotos={0} unsaved={false} variant="intro" />
      </div>
    </div>
  )
}

function today(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function SetupForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: Property
  onSave: (f: Pick<Property, 'label' | 'moveInDate' | 'state'>) => void
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
