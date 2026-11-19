import { useEffect, useState } from 'preact/hooks'
import { Home, Share } from './icons.tsx'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

// Captured once at module load so the event isn't missed before this component mounts.
let deferred: BeforeInstallPromptEvent | null = null
const listeners = new Set<() => void>()
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferred = e as BeforeInstallPromptEvent
    listeners.forEach((l) => l())
  })
}

const DISMISS_KEY = 'dk-install-hint-dismissed'

function isStandalone(): boolean {
  return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true
}

function isIos(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

function readDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1'
  } catch {
    return false
  }
}

/** "Add to Home Screen" guidance. `always` ignores an earlier dismissal (used on the save screen). */
export function InstallHint({ always = false }: { always?: boolean }) {
  const [, rerender] = useState(0)
  const [dismissed, setDismissed] = useState(readDismissed)

  useEffect(() => {
    const l = () => rerender((n) => n + 1)
    listeners.add(l)
    return () => void listeners.delete(l)
  }, [])

  if (isStandalone() || (dismissed && !always)) return null

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, '1')
    } catch {
      /* private mode: just hide for now */
    }
    setDismissed(true)
  }

  return (
    <aside class="install-hint">
      <h2>
        <Home size={18} /> Add Deposit Kit to your home screen
      </h2>
      <p class="small">It opens like an app and is easier to find when you move out.</p>
      {deferred ? (
        <button
          class="btn"
          onClick={async () => {
            await deferred?.prompt()
            deferred = null
            rerender((n) => n + 1)
          }}
        >
          Add to home screen
        </button>
      ) : isIos() ? (
        <p class="small">
          In Safari, tap <strong>Share</strong> <Share size={15} class="inline-icon" />, then <strong>Add to Home Screen</strong>.
        </p>
      ) : (
        <p class="small">
          Open your browser’s menu and choose <strong>Install app</strong> or <strong>Add to Home screen</strong>.
        </p>
      )}
      <p class="small muted">Even then, keep your saved files. They are your record.</p>
      {!always && (
        <button class="link small" onClick={dismiss}>
          Hide this
        </button>
      )}
    </aside>
  )
}
