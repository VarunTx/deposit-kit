import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks'
import './app.css'
import { Store, newId } from './lib/db.ts'
import { Session } from './lib/session.ts'
import type { Property } from './lib/types.ts'
import { Intro, SetupForm } from './ui/Setup.tsx'
import { HomeView } from './ui/Home.tsx'
import { RoomView } from './ui/Room.tsx'
import { SaveView } from './ui/Save.tsx'
import { Toasts, toast } from './ui/feedback.tsx'
import { Lock, ShieldCheck } from './ui/icons.tsx'
import { preloadPdf } from './lib/pdf.ts'

type Screen = { name: 'home' } | { name: 'setup' } | { name: 'edit' } | { name: 'room'; roomId: string } | { name: 'save' }

function stateScreen(state: unknown): Screen {
  const s = (state as { dk?: Screen } | null)?.dk
  return s && typeof s.name === 'string' ? s : { name: 'home' }
}

export function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [property, setProperty] = useState<Property | null | undefined>(undefined)
  // After a reload, reopen the room you were in, but nothing else (a stale Save or Edit screen would confuse).
  const [screen, setScreen] = useState<Screen>(() => {
    const s = stateScreen(history.state)
    return s.name === 'room' ? s : { name: 'home' }
  })
  const [version, setVersion] = useState(0)
  const [promptSave, setPromptSave] = useState(false)
  const bump = useCallback(() => setVersion((v) => v + 1), [])

  // Navigation goes through browser history, so the phone's Back button and
  // iOS swipe-back move between screens instead of leaving the app.
  const current = useRef(screen)
  const addedInRoom = useRef(0)
  const show = useCallback((next: Screen) => {
    const prev = current.current
    if (prev.name === 'room' && !(next.name === 'room' && next.roomId === prev.roomId)) {
      // Leaving a room where photos were added: suggest saving (unless heading to Save already).
      setPromptSave(addedInRoom.current > 0 && next.name === 'home')
      addedInRoom.current = 0
    }
    current.current = next
    setScreen(next)
  }, [])
  const go = useCallback((next: Screen) => {
    history.pushState({ dk: next }, '')
    show(next)
  }, [show])
  /** Go home without adding a history entry (used when the current screen no longer exists). */
  const home = useCallback(() => {
    history.replaceState({ dk: { name: 'home' } }, '')
    show({ name: 'home' })
  }, [show])
  const back = useCallback(() => {
    if (stateScreen(history.state).name !== 'home') history.back()
    else show({ name: 'home' })
  }, [show])
  useEffect(() => {
    if (current.current.name === 'home') history.replaceState({ dk: { name: 'home' } }, '')
    const onPop = (e: PopStateEvent) => show(stateScreen(e.state))
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [show])

  useEffect(() => {
    Store.open()
      .then((store) =>
        setSession(
          new Session(store, bump, {
            onStampResult: (_id, ok) =>
              ok
                ? toast('Timestamp added to your photo')
                : toast('Photo saved. Timestamp will be added when you’re back online.', 'warn', 4500),
          }),
        ),
      )
      .catch(() => setError('This browser won’t let Deposit Kit save data. Try turning off private browsing, or use Safari or Chrome.'))
  }, [bump])

  // v1 keeps one move-in record per device.
  useEffect(() => {
    if (!session) return
    session.store.listProperties().then((all) => setProperty(all[0] ?? null))
  }, [session, version])

  // Finish any timestamps that didn't complete last time, and retry when the connection comes back.
  useEffect(() => {
    if (!session || !property) return
    session.stampMissing(property.id)
    const online = () => session.stampMissing(property.id)
    window.addEventListener('online', online)
    return () => window.removeEventListener('online', online)
  }, [session, property?.id])

  useEffect(() => window.scrollTo(0, 0), [screen])

  // Load the PDF code early (it's in the offline cache), so saving still works if
  // an app update replaces the cached files while this page is open.
  useEffect(() => {
    if (!session) return
    const t = setTimeout(() => void preloadPdf().catch(() => {}), 3000)
    return () => clearTimeout(t)
  }, [session])

  const saveProperty = useCallback(
    async (fields: Pick<Property, 'label' | 'moveInDate' | 'state'>) => {
      if (!session) return
      const now = new Date().toISOString()
      if (property) await session.store.updateProperty(property.id, (p) => ({ ...p, ...fields, lastChangeAt: now }))
      else await session.store.saveProperty({ id: newId(), createdAt: now, ...fields })
      bump()
      back()
    },
    [session, property, bump, back],
  )

  const screenKey = !property ? (screen.name === 'setup' ? 'setup' : 'intro') : screen.name === 'room' ? `room-${screen.roomId}` : screen.name

  const body = useMemo(() => {
    if (error) return <p class="notice warn">{error}</p>
    if (!session || property === undefined) return <div class="loading" aria-label="Loading" />
    if (!property) {
      return screen.name === 'setup' ? (
        <SetupForm onSave={saveProperty} onCancel={back} />
      ) : (
        <Intro onStart={() => go({ name: 'setup' })} session={session} />
      )
    }
    switch (screen.name) {
      case 'edit':
        return <SetupForm initial={property} onSave={saveProperty} onCancel={back} />
      case 'room':
        return (
          <RoomView
            session={session}
            property={property}
            roomId={screen.roomId}
            version={version}
            onBack={back}
            onMissing={home}
            onPhotoAdded={() => (addedInRoom.current += 1)}
            onSave={() => go({ name: 'save' })}
          />
        )
      case 'save':
        return <SaveView session={session} property={property} onBack={back} />
      default:
        return (
          <HomeView
            session={session}
            property={property}
            version={version}
            onOpenRoom={(roomId) => go({ name: 'room', roomId })}
            onEdit={() => go({ name: 'edit' })}
            onSave={() => {
              setPromptSave(false)
              go({ name: 'save' })
            }}
            promptSave={promptSave}
            onDismissPrompt={() => setPromptSave(false)}
          />
        )
    }
  }, [error, session, property, screen, version, saveProperty, promptSave, go, back, home])

  return (
    <div class="page">
      <header class="topbar">
        <span class="brand">
          <span class="brand-mark">
            <ShieldCheck size={20} />
          </span>
          Deposit Kit
        </span>
        <span class="private-pill" title="Your photos are stored only on this device">
          <Lock size={14} /> Private to this device
        </span>
      </header>
      <main key={screenKey} class="screen">
        {body}
      </main>
      <footer class="site-footer">
        <p class="footer-trust">
          <Lock size={14} /> No account. No tracking. Deposit Kit never uploads your photos.
        </p>
        <p>Deposit Kit gives you templates and deadlines, not legal advice. Check your state’s law or a tenant rights group if you’re unsure.</p>
        <p class="footer-links">
          <a href="/support.html">Help</a> · <a href="/privacy.html">Privacy</a>
        </p>
      </footer>
      <Toasts />
    </div>
  )
}
