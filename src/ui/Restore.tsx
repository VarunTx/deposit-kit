import { useRef, useState } from 'preact/hooks'
import type { Session } from '../lib/session.ts'
import { RestoreError, type RestoreReport } from '../lib/restore.ts'
import { toast } from './feedback.tsx'
import { Archive } from './icons.tsx'

/**
 * "Restore from a saved zip". The file is picked first, then (if a record already
 * exists) the user confirms before anything on the device is replaced.
 */
export function RestoreButton({
  session,
  existingPhotos,
  unsaved,
  variant,
}: {
  session: Session
  /** Photos currently on this device; 0 when there's no record yet. */
  existingPhotos: number
  unsaved: boolean
  variant: 'intro' | 'home'
}) {
  const input = useRef<HTMLInputElement>(null)
  const [progress, setProgress] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<RestoreReport | null>(null)

  const onFile = async (el: HTMLInputElement) => {
    const file = el.files?.[0]
    el.value = ''
    if (!file) return
    setError(null)
    setResult(null)
    if (existingPhotos > 0) {
      const warning = unsaved
        ? `This replaces the record on this device, including ${existingPhotos} photo${existingPhotos === 1 ? '' : 's'} that aren’t in a saved file yet. They will be lost. Replace it?`
        : `This replaces the record on this device (${existingPhotos} photo${existingPhotos === 1 ? '' : 's'}) with the one in this file. Replace it?`
      if (!confirm(warning)) return
    }
    setProgress('Opening your file…')
    try {
      const report = await session.restore(file, (done, total) => setProgress(`Restoring photo ${done} of ${total}…`))
      setResult(report)
      toast(`Restored ${report.photos} photo${report.photos === 1 ? '' : 's'} in ${report.rooms} room${report.rooms === 1 ? '' : 's'}`)
    } catch (e) {
      console.error(e)
      setError(e instanceof RestoreError ? e.message : 'Something went wrong while restoring. Your current record wasn’t changed.')
    } finally {
      setProgress(null)
    }
  }

  return (
    <div class={`restore ${variant}`}>
      <button class={variant === 'intro' ? 'btn big' : 'btn'} onClick={() => input.current?.click()} disabled={!!progress}>
        <Archive size={20} /> {variant === 'intro' ? 'I have a saved record' : 'Restore from a saved file'}
      </button>
      <input
        ref={input}
        class="visually-hidden"
        type="file"
        accept=".zip,application/zip,application/x-zip-compressed"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => onFile(e.currentTarget)}
      />
      {progress && (
        <p class="saving-line" role="status">
          <span class="spinner" aria-hidden="true" /> {progress}
        </p>
      )}
      {error && (
        <p class="notice warn" role="alert">
          {error}
        </p>
      )}
      {result && (result.needStamp > 0 || result.missing > 0) && (
        <p class="notice" role="status">
          {result.missing > 0 && `${result.missing} photo${result.missing === 1 ? ' was' : 's were'} missing from the file. `}
          {result.needStamp > 0 &&
            `${result.needStamp} photo${result.needStamp === 1 ? ' doesn’t' : 's don’t'} have a matching timestamp, so ${result.needStamp === 1 ? 'it' : 'they'} will get a new one with today’s time.`}
        </p>
      )}
    </div>
  )
}
