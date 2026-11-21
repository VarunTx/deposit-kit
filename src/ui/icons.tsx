// Small inline icon set (24x24, stroke). Inline so the app works offline and loads nothing extra.
import type { JSX } from 'preact'

type P = { size?: number; class?: string; title?: string }

function Svg({ size = 22, class: cls, title, children }: P & { children: JSX.Element | JSX.Element[] }) {
  return (
    <svg
      class={`icon ${cls ?? ''}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : 'true'}
      aria-label={title}
    >
      {children}
    </svg>
  )
}

export const ShieldCheck = (p: P) => (
  <Svg {...p}>
    <path d="M12 3l7 3v5c0 4.6-3 8.4-7 10-4-1.6-7-5.4-7-10V6z" />
    <path d="M8.8 12.2l2.2 2.2 4.4-4.6" />
  </Svg>
)
export const Lock = (p: P) => (
  <Svg {...p}>
    <rect x="5" y="11" width="14" height="10" rx="2" />
    <path d="M8 11V8a4 4 0 018 0v3" />
  </Svg>
)
export const Camera = (p: P) => (
  <Svg {...p}>
    <path d="M4 8h3l2-3h6l2 3h3a1 1 0 011 1v10a1 1 0 01-1 1H4a1 1 0 01-1-1V9a1 1 0 011-1z" />
    <circle cx="12" cy="13.5" r="3.5" />
  </Svg>
)
export const Images = (p: P) => (
  <Svg {...p}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <circle cx="8.5" cy="10" r="1.5" />
    <path d="M21 16l-5-5-8 8" />
  </Svg>
)
export const Clock = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </Svg>
)
export const Check = (p: P) => (
  <Svg {...p}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </Svg>
)
export const ArrowLeft = (p: P) => (
  <Svg {...p}>
    <path d="M15 5l-7 7 7 7" />
  </Svg>
)
export const ChevronRight = (p: P) => (
  <Svg {...p}>
    <path d="M9 5l7 7-7 7" />
  </Svg>
)
export const Plus = (p: P) => (
  <Svg {...p}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
)
export const Trash = (p: P) => (
  <Svg {...p}>
    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
  </Svg>
)
export const Download = (p: P) => (
  <Svg {...p}>
    <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
  </Svg>
)
export const FileText = (p: P) => (
  <Svg {...p}>
    <path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z" />
    <path d="M14 3v5h5M9 13h6M9 17h6" />
  </Svg>
)
export const Archive = (p: P) => (
  <Svg {...p}>
    <rect x="3" y="4" width="18" height="5" rx="1" />
    <path d="M5 9v10a1 1 0 001 1h12a1 1 0 001-1V9M10 13h4" />
  </Svg>
)
export const Wifi = (p: P) => (
  <Svg {...p}>
    <path d="M5 12.5a10 10 0 0114 0M8.5 16a5 5 0 017 0M12 19.5h.01M2 9a15 15 0 0120 0" />
  </Svg>
)
export const Fingerprint = (p: P) => (
  <Svg {...p}>
    <path d="M12 11v3a8 8 0 01-1.5 4.7M8 7.5A6 6 0 0118 12v1M6 10.5a6 6 0 00-.2 1.5c0 2-.5 3.6-1.3 5M15.5 16c-.2 1.6-.7 3.1-1.5 4.4M9 13c0 2.5-.6 4.6-1.7 6.4M12 7a5 5 0 00-5 5" />
  </Svg>
)
export const Home = (p: P) => (
  <Svg {...p}>
    <path d="M3 11l9-7 9 7" />
    <path d="M5 10v10h14V10" />
    <path d="M10 20v-5h4v5" />
  </Svg>
)
export const Pencil = (p: P) => (
  <Svg {...p}>
    <path d="M4 20h4L19 9l-4-4L4 16z" />
  </Svg>
)
export const Share = (p: P) => (
  <Svg {...p}>
    <path d="M12 3v12M7 8l5-5 5 5" />
    <path d="M5 13v6a2 2 0 002 2h10a2 2 0 002-2v-6" />
  </Svg>
)

// Room icons
export const Kitchen = (p: P) => (
  <Svg {...p}>
    <path d="M4 10h16v3a5 5 0 01-5 5H9a5 5 0 01-5-5z" />
    <path d="M2 10h20M9 4c0 1.5 1 1.5 1 3M13 4c0 1.5 1 1.5 1 3" />
  </Svg>
)
export const Bath = (p: P) => (
  <Svg {...p}>
    <path d="M3 12h18v2a5 5 0 01-5 5H8a5 5 0 01-5-5z" />
    <path d="M6 12V6a2 2 0 014 0M7 19l-1 2M17 19l1 2" />
  </Svg>
)
export const Bed = (p: P) => (
  <Svg {...p}>
    <path d="M3 18V7M3 13h18v5M21 18v-3a3 3 0 00-3-3h-7v1" />
    <circle cx="7" cy="10.5" r="1.8" />
  </Svg>
)
export const Sofa = (p: P) => (
  <Svg {...p}>
    <path d="M5 11V8a2 2 0 012-2h10a2 2 0 012 2v3" />
    <path d="M3 13a2 2 0 014 0v2h10v-2a2 2 0 014 0v5H3zM6 18v2M18 18v2" />
  </Svg>
)
export const Door = (p: P) => (
  <Svg {...p}>
    <path d="M6 21V4a1 1 0 011-1h10a1 1 0 011 1v17M3 21h18" />
    <path d="M14.5 12h.01" />
  </Svg>
)
export const Box = (p: P) => (
  <Svg {...p}>
    <path d="M21 8l-9-5-9 5 9 5zM3 8v8l9 5 9-5V8M12 13v8" />
  </Svg>
)

// Car icons
export const Car = (p: P) => (
  <Svg {...p}>
    <path d="M5 16H3v-4l2-5a2 2 0 012-1.4h10A2 2 0 0119 7l2 5v4h-2" />
    <path d="M3 12h18M9 16h6" />
    <circle cx="7" cy="16.5" r="2" />
    <circle cx="17" cy="16.5" r="2" />
  </Svg>
)
export const Wheel = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="3" />
    <path d="M12 3v6M12 15v6M3 12h6M15 12h6" />
  </Svg>
)
export const Gauge = (p: P) => (
  <Svg {...p}>
    <path d="M4.5 18a9 9 0 1115 0" />
    <path d="M12 13l4-4" />
    <circle cx="12" cy="13" r="1.2" />
  </Svg>
)
export const Seat = (p: P) => (
  <Svg {...p}>
    <path d="M8 3h4a2 2 0 012 2l-1 9H7L6 5a2 2 0 012-2z" />
    <path d="M5 14h12a2 2 0 012 2v2H5zM7 18v3M17 18v3" />
  </Svg>
)
export const Key = (p: P) => (
  <Svg {...p}>
    <circle cx="8" cy="15" r="4" />
    <path d="M11 12l9-9M16 7l3 3M14 9l2 2" />
  </Svg>
)
export const Windshield = (p: P) => (
  <Svg {...p}>
    <path d="M4 17l2-9a2 2 0 012-1.6h8A2 2 0 0118 8l2 9z" />
    <path d="M9 10l-1 3M14 9l2 2" />
  </Svg>
)
export const Search = (p: P) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="M20 20l-4-4" />
  </Svg>
)

/** Icon for a car shot-list spot. */
export function SlotIcon({ slot, ...p }: P & { slot: string | undefined }) {
  switch (slot) {
    case 'wheels':
      return <Wheel {...p} />
    case 'dashboard':
      return <Gauge {...p} />
    case 'interior':
      return <Seat {...p} />
    case 'dropoff':
      return <Key {...p} />
    case 'glass':
      return <Windshield {...p} />
    case 'damage':
      return <Search {...p} />
    case 'trunk':
      return <Box {...p} />
    default:
      return <Car {...p} />
  }
}

export function RoomIcon({ name, ...p }: P & { name: string }) {
  const n = name.toLowerCase()
  if (/kitchen|pantry/.test(n)) return <Kitchen {...p} />
  if (/bath|toilet|shower|wc|restroom/.test(n)) return <Bath {...p} />
  if (/bed|nursery|guest/.test(n)) return <Bed {...p} />
  if (/living|lounge|family|den|dining/.test(n)) return <Sofa {...p} />
  if (/entry|hall|door|foyer/.test(n)) return <Door {...p} />
  return <Box {...p} />
}
