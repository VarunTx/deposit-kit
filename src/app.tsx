import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks'
import './app.css'
import { Store } from './lib/db.ts'
import { Session } from './lib/session.ts'
import type { Property, RecordKind } from './lib/types.ts'
import { CarSetupForm, Intro, SetupForm, type CarFields, type HomeFields } from './ui/Setup.tsx'
import { HomeView } from './ui/Home.tsx'
import { CarView } from './ui/Car.tsx'
import { RecordsView } from './ui/Records.tsx'
import { RoomView } from './ui/Room.tsx'
import { SaveView } from './ui/Save.tsx'
import { Toasts, toast } from './ui/feedback.tsx'
import { Lock, ShieldCheck } from './ui/icons.tsx'
import { preloadPdf } from './lib/pdf.ts'

// 'home' is the list of records (the app's start screen); every other screen belongs to one record.
type Screen =
  | { name: 'home' }
  | { name: 'setup'; kind: RecordKind }
  | { name: 'record'; id: string }
  | { name: 'edit'; id: string }
  | { name: 'room'; id: string; roomId: string }
  | { name: 'save'; id: string }

function stateScreen(state: unknown): Screen {
  const s = (state as { dk?: Screen } | null)?.dk
  if (!s || typeof s.name !== 'string') return { name: 'home' }
  // History entries from before records had ids (one record per device) can't be resumed.
  if (s.name !== 'home' && s.name !== 'setup' && typeof (s as { id?: unknown }).id !== 'string') return { name: 'home' }
  return s
}

export function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [records, setRecords] = useState<Property[] | undefined>(undefined)
  // After a reload, reopen the record or room you were in, but nothing else (a stale Save or Edit screen would confuse).
  const [screen, setScreen] = useState<Screen>(() => {
    const s = stateScreen(history.state)
    return s.name === 'room' || s.name === 'record' ? s : { name: 'home' }
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
      setPromptSave(addedInRoom.current > 0 && next.name === 'record')
      addedInRoom.current = 0
    }
    current.current = next
    setScreen(next)
  }, [])
  const go = useCallback((next: Screen) => {
    history.pushState({ dk: next }, '')
    show(next)
  }, [show])
  /** Replace the current screen without adding a history entry (a finished form, or a screen that no longer exists). */
  const replace = useCallback(
    (next: Screen) => {
      history.replaceState({ dk: next }, '')
      show(next)
    },
    [show],
  )
  const home = useCallback(() => replace({ name: 'home' }), [replace])
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

  useEffect(() => {
    if (!session) return
    session.store.listProperties().then(setRecords)
  }, [session, version])

  // Finish any timestamps that didn't complete last time, and retry when the connection comes back.
  useEffect(() => {
    if (!session) return
    void session.stampAll()
    const online = () => void session.stampAll()
    window.addEventListener('online', online)
    return () => window.removeEventListener('online', online)
  }, [session])

  useEffect(() => window.scrollTo(0, 0), [screen])

  // Load the PDF code early (it's in the offline cache), so saving still works if
  // an app update replaces the cached files while this page is open.
  useEffect(() => {
    if (!session) return
    const t = setTimeout(() => void preloadPdf().catch(() => {}), 3000)
    return () => clearTimeout(t)
  }, [session])

  const property = 'id' in screen ? records?.find((r) => r.id === screen.id) : undefined

  // A record that no longer exists (deleted, or reached with Back/Forward): go to the list.
  // Check storage, not just the list in memory, which can lag just after a record is created or restored.
  useEffect(() => {
    if (!session || !records || !('id' in screen) || records.some((r) => r.id === screen.id)) return
    let cancelled = false
    session.store.getProperty(screen.id).then((p) => !cancelled && !p && home())
    return () => {
      cancelled = true
    }
  }, [session, records, screen, home])

  const createHome = useCallback(
    async (fields: HomeFields) => {
      if (!session) return
      const p = await session.addHome(fields)
      replace({ name: 'record', id: p.id })
    },
    [session, replace],
  )
  const createCar = useCallback(
    async (fields: CarFields) => {
      if (!session) return
      const p = await session.addCar(fields)
      replace({ name: 'record', id: p.id })
    },
    [session, replace],
  )
  const saveEdit = useCallback(
    async (fields: Partial<Property>) => {
      if (!session || !property) return
      const now = new Date().toISOString()
      await session.store.updateProperty(property.id, (p) => ({ ...p, ...fields, lastChangeAt: now }))
      bump()
      back()
    },
    [session, property, bump, back],
  )

  const screenKey = screen.name === 'room' ? `room-${screen.roomId}` : 'id' in screen ? `${screen.name}-${screen.id}` : screen.name

  const body = useMemo(() => {
    if (error) return <p class="notice warn">{error}</p>
    if (!session || records === undefined) return <div class="loading" aria-label="Loading" />
    if (screen.name === 'setup') {
      return screen.kind === 'car' ? <CarSetupForm onSave={createCar} onCancel={back} /> : <SetupForm onSave={createHome} onCancel={back} />
    }
    const start = (kind: RecordKind) => go({ name: 'setup', kind })
    const open = (id: string) => go({ name: 'record', id })
    if (screen.name !== 'home' && !property) return <div class="loading" aria-label="Loading" />
    if (screen.name === 'home' || !property) {
      if (records.length === 0) return <Intro onStart={start} session={session} onRestored={open} />
      return <RecordsView session={session} records={records} version={version} onOpen={open} onStart={start} />
    }
    const car = property.kind === 'car'
    switch (screen.name) {
      case 'edit':
        return car ? (
          <CarSetupForm initial={property} onSave={saveEdit} onCancel={back} />
        ) : (
          <SetupForm initial={property} onSave={saveEdit} onCancel={back} />
        )
      case 'room':
        return (
          <RoomView
            session={session}
            property={property}
            roomId={screen.roomId}
            version={version}
            onBack={back}
            onMissing={() => replace({ name: 'record', id: property.id })}
            onPhotoAdded={() => (addedInRoom.current += 1)}
            onSave={() => go({ name: 'save', id: property.id })}
          />
        )
      case 'save':
        return <SaveView session={session} property={property} onBack={back} />
      default: {
        const common = {
          session,
          property,
          version,
          onOpenRoom: (roomId: string) => go({ name: 'room', id: property.id, roomId }),
          onEdit: () => go({ name: 'edit', id: property.id }),
          onBack: back,
          onSave: () => {
            setPromptSave(false)
            go({ name: 'save', id: property.id })
          },
        }
        return car ? (
          <CarView {...common} />
        ) : (
          <HomeView {...common} promptSave={promptSave} onDismissPrompt={() => setPromptSave(false)} />
        )
      }
    }
  }, [error, session, records, property, screen, version, createHome, createCar, saveEdit, promptSave, go, back, replace])

  return (
    <div class="page">
      <header class="topbar">
        <a
          class="brand"
          href="/"
          onClick={(e) => {
            e.preventDefault()
            if (screen.name !== 'home') go({ name: 'home' })
          }}
        >
          <span class="brand-mark">
            <ShieldCheck size={20} />
          </span>
          Deposit Kit
        </a>
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
        <p>Deposit Kit gives you templates and deadlines, not legal advice. Check your rental agreement and your state’s law if you’re unsure.</p>
        <p class="footer-links">
          <a href="/support.html">Help</a> · <a href="/privacy.html">Privacy</a>
        </p>
      </footer>
      <Toasts />
    </div>
  )
}
