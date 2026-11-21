import { useEffect, useState } from 'preact/hooks'
import { Home, Share } from './icons.tsx'
import { installPlatform } from '../lib/platform.ts'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

// Captured once at module load so the event isn't missed before this component mounts.
let deferred: BeforeInstallPromptEvent | null = null
let installed = false
const listeners = new Set<() => void>()
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferred = e as BeforeInstallPromptEvent
    listeners.forEach((l) => l())
  })
  window.addEventListener('appinstalled', () => {
    installed = true
    deferred = null
    listeners.forEach((l) => l())
  })
}

const DISMISS_KEY = 'dk-install-hint-dismissed'

function isStandalone(): boolean {
  return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true
}

function readDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1'
  } catch {
    return false
  }
}

/** "Install the app" guidance for each browser. `always` ignores an earlier dismissal (used on the save screen). */
export function InstallHint({ always = false }: { always?: boolean }) {
  const [, rerender] = useState(0)
  const [dismissed, setDismissed] = useState(readDismissed)

  useEffect(() => {
    const l = () => rerender((n) => n + 1)
    listeners.add(l)
    return () => void listeners.delete(l)
  }, [])

  if (installed || isStandalone() || (dismissed && !always)) return null

  const kind = installPlatform(navigator.userAgent, navigator.platform, navigator.maxTouchPoints)
  const phone = kind === 'ios' || kind === 'android'

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
        <Home size={18} /> {phone ? 'Add Deposit Kit to your home screen' : 'Install Deposit Kit on this computer'}
      </h2>
      <p class="small">
        {phone
          ? 'It opens like an app and is easy to find when you need your record again.'
          : 'It opens in its own window, works offline, and is easy to find when you need your record again. Free, nothing to download from a store.'}
      </p>
      {deferred ? (
        <button
          class="btn"
          onClick={async () => {
            await deferred?.prompt()
            deferred = null
            rerender((n) => n + 1)
          }}
        >
          {phone ? 'Add to home screen' : 'Install app'}
        </button>
      ) : kind === 'ios' ? (
        <p class="small">
          Tap <strong>Share</strong> <Share size={15} class="inline-icon" />, then <strong>Add to Home Screen</strong>.
        </p>
      ) : kind === 'android' ? (
        <p class="small">
          Open your browser’s menu (⋮) and choose <strong>Add to Home screen</strong> or <strong>Install app</strong>.
        </p>
      ) : kind === 'mac-safari' ? (
        <p class="small">
          In Safari’s menu bar, choose <strong>File</strong>, then <strong>Add to Dock</strong>.
        </p>
      ) : kind === 'firefox' ? (
        <p class="small">
          Firefox can’t install web apps, so bookmark this page instead. Or open it in Chrome, Edge or Safari to install it.
        </p>
      ) : (
        <p class="small">
          In Chrome or Edge, click the <strong>install</strong> icon at the right end of the address bar, or open the browser’s menu
          and choose <strong>Install Deposit Kit</strong>.
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
