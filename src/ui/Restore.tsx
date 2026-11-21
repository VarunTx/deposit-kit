import { useRef, useState } from 'preact/hooks'
import type { Session } from '../lib/session.ts'
import { RestoreError, type RestoreReport } from '../lib/restore.ts'
import { toast } from './feedback.tsx'
import { Archive } from './icons.tsx'

/** "Restore from a saved zip". The restored record is added next to any already on this device; nothing is replaced. */
export function RestoreButton({
  session,
  variant,
  onRestored,
}: {
  session: Session
  variant: 'intro' | 'home'
  onRestored?: (propertyId: string) => void
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
    setProgress('Opening your file…')
    try {
      const report = await session.restore(file, (done, total) => setProgress(`Restoring photo ${done} of ${total}…`))
      setResult(report)
      toast(`Restored ${report.photos} photo${report.photos === 1 ? '' : 's'}`)
      if (report.needStamp > 0 || report.missing > 0) {
        toast(
          report.missing > 0
            ? `${report.missing} photo${report.missing === 1 ? ' was' : 's were'} missing from the file.`
            : `${report.needStamp} photo${report.needStamp === 1 ? '' : 's'} will get a new timestamp with today’s time.`,
          'warn',
          6000,
        )
      }
      onRestored?.(report.propertyId)
    } catch (e) {
      console.error(e)
      setError(e instanceof RestoreError ? e.message : 'Something went wrong while restoring. Nothing on this device was changed.')
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
