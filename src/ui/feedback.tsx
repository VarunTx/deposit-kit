// Shared UI bits: object URLs for Blobs, and short toast messages.
import { useEffect, useState } from 'preact/hooks'
import { Check, Clock, Wifi } from './icons.tsx'

export function useObjectUrl(blob: Blob | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!blob) return setUrl(null)
    const u = URL.createObjectURL(blob)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [blob])
  return url
}

export type ToastTone = 'ok' | 'info' | 'warn'
interface Toast {
  id: number
  text: string
  tone: ToastTone
}

let toasts: Toast[] = []
let nextId = 1
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

export function toast(text: string, tone: ToastTone = 'ok', ms = 3200): void {
  if (toasts.some((x) => x.text === text)) return
  const t = { id: nextId++, text, tone }
  toasts = [...toasts.slice(-2), t]
  emit()
  setTimeout(() => {
    toasts = toasts.filter((x) => x.id !== t.id)
    emit()
  }, ms)
}

export function Toasts() {
  const [, rerender] = useState(0)
  useEffect(() => {
    const l = () => rerender((n) => n + 1)
    listeners.add(l)
    return () => void listeners.delete(l)
  }, [])
  return (
    <div class="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} class={`toast ${t.tone}`}>
          {t.tone === 'ok' ? <Check size={18} /> : t.tone === 'warn' ? <Wifi size={18} /> : <Clock size={18} />}
          <span>{t.text}</span>
        </div>
      ))}
    </div>
  )
}
