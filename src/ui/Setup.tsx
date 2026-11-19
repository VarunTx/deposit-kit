import { useState } from 'preact/hooks'
import type { Property } from '../lib/types.ts'
import { US_STATES } from '../lib/states.ts'

export function Intro({ onStart }: { onStart: () => void }) {
  return (
    <>
      <header>
        <h1>Deposit Kit</h1>
        <p class="lede">Prove your rental’s condition and get your security deposit back. Free. Your photos stay on your phone.</p>
      </header>
      <ol class="steps">
        <li>
          <span class="num">1</span>
          <div>
            <h2>Walk through each room</h2>
            <p>Take photos of anything that’s already worn, scratched or broken, and add a short note.</p>
          </div>
        </li>
        <li>
          <span class="num">2</span>
          <div>
            <h2>Each photo gets a timestamp</h2>
            <p>A public timestamp service signs a fingerprint of each photo. That shows when it was taken. Your photos are never uploaded.</p>
          </div>
        </li>
        <li>
          <span class="num">3</span>
          <div>
            <h2>Save your record</h2>
            <p>You get a PDF report and a zip of the original photos. Keep them somewhere safe for move-out.</p>
          </div>
        </li>
      </ol>
      <button class="btn primary big" onClick={onStart}>
        Start my move-in record
      </button>
    </>
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
        ← Back
      </button>
      <h1>{initial ? 'Edit your home' : 'Your new home'}</h1>
      <p class="muted">This stays on your device. It goes on your report so you can tell which home it’s for.</p>
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
      <button class="btn primary big" type="submit" disabled={!label.trim()}>
        {initial ? 'Save changes' : 'Continue'}
      </button>
    </form>
  )
}
