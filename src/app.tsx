import { useCallback, useEffect, useMemo, useState } from 'preact/hooks'
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

type Screen = { name: 'home' } | { name: 'edit' } | { name: 'room'; roomId: string } | { name: 'save' }

export function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [property, setProperty] = useState<Property | null | undefined>(undefined)
  const [screen, setScreen] = useState<Screen>({ name: 'home' })
  const [version, setVersion] = useState(0)
  const [starting, setStarting] = useState(false)
  const [promptSave, setPromptSave] = useState(false)
  const bump = useCallback(() => setVersion((v) => v + 1), [])

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

  useEffect(() => window.scrollTo(0, 0), [screen, starting])

  const saveProperty = useCallback(
    async (fields: Pick<Property, 'label' | 'moveInDate' | 'state'>) => {
      if (!session) return
      const now = new Date().toISOString()
      if (property) await session.store.updateProperty(property.id, (p) => ({ ...p, ...fields, lastChangeAt: now }))
      else await session.store.saveProperty({ id: newId(), createdAt: now, ...fields })
      setScreen({ name: 'home' })
      bump()
    },
    [session, property, bump],
  )

  const screenKey = property ? (screen.name === 'room' ? `room-${screen.roomId}` : screen.name) : starting ? 'setup' : 'intro'

  const body = useMemo(() => {
    if (error) return <p class="notice warn">{error}</p>
    if (!session || property === undefined) return <div class="loading" aria-label="Loading" />
    if (!property) {
      return starting ? <SetupForm onSave={saveProperty} onCancel={() => setStarting(false)} /> : <Intro onStart={() => setStarting(true)} session={session} />
    }
    switch (screen.name) {
      case 'edit':
        return <SetupForm initial={property} onSave={saveProperty} onCancel={() => setScreen({ name: 'home' })} />
      case 'room':
        return (
          <RoomView
            session={session}
            property={property}
            roomId={screen.roomId}
            version={version}
            onBack={(added) => {
              setPromptSave(added > 0)
              setScreen({ name: 'home' })
            }}
            onSave={() => setScreen({ name: 'save' })}
          />
        )
      case 'save':
        return <SaveView session={session} property={property} onBack={() => setScreen({ name: 'home' })} />
      default:
        return (
          <HomeView
            session={session}
            property={property}
            version={version}
            onOpenRoom={(roomId) => setScreen({ name: 'room', roomId })}
            onEdit={() => setScreen({ name: 'edit' })}
            onSave={() => {
              setPromptSave(false)
              setScreen({ name: 'save' })
            }}
            promptSave={promptSave}
            onDismissPrompt={() => setPromptSave(false)}
          />
        )
    }
  }, [error, session, property, screen, version, starting, saveProperty, promptSave])

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
      </footer>
      <Toasts />
    </div>
  )
}
