// The rental car shot list. Rental damage claims usually arrive by email days after
// the car is returned, so the return photos matter as much as the pickup ones.
// The same spots are photographed at both visits so they can be shown side by side.

import type { CarDetails, Phase, Property, Room } from './types.ts'

export interface CarShot {
  slot: string
  name: string
  tip: string
  /** Optional shots can be skipped without the visit counting as unfinished. */
  optional?: boolean
  /** Visits this shot belongs to (default: both). */
  phases?: Phase[]
}

export const CAR_SHOTS: CarShot[] = [
  { slot: 'front', name: 'Front', tip: 'The whole front: bumper, grille, hood and lights. Step back so the parking spot or bay number is in the photo too.' },
  { slot: 'left', name: 'Left side', tip: 'The whole side from bumper to bumper, then the doors and mirror up close.' },
  { slot: 'rear', name: 'Back', tip: 'Bumper, trunk lid, lights and the license plate.' },
  { slot: 'right', name: 'Right side', tip: 'The whole side from bumper to bumper, then the doors and mirror up close.' },
  { slot: 'glass', name: 'Windshield and roof', tip: 'Look for chips and cracks in the glass. Get the roof too if you can see it.' },
  { slot: 'wheels', name: 'Wheels', tip: 'Each wheel and rim. Scuffed rims are one of the most common charges.' },
  { slot: 'interior', name: 'Seats and interior', tip: 'Front and back seats, floor mats and ceiling. Look for stains, burns and tears.' },
  { slot: 'trunk', name: 'Trunk', tip: 'Open the trunk: floor, sides and the spare tire area.' },
  { slot: 'dashboard', name: 'Mileage and fuel', tip: 'Turn the car on so the dashboard shows the mileage and fuel level, and make sure both are readable.' },
  {
    slot: 'damage',
    name: 'Damage close-ups',
    tip: 'Get close to every scratch, dent or chip and add a note. A key or coin next to a small mark shows its size.',
    optional: true,
  },
  {
    slot: 'dropoff',
    name: 'Keys and receipt',
    tip: 'Where you left the keys, or the return receipt. Most useful when you return the car after hours.',
    optional: true,
    phases: ['return'],
  },
]

export const PHASE_NAME: Record<Phase, string> = { pickup: 'Pickup', return: 'Return' }

export function shotsFor(phase: Phase): CarShot[] {
  return CAR_SHOTS.filter((s) => !s.phases || s.phases.includes(phase))
}

export function shotFor(slot: string | undefined): CarShot | undefined {
  return CAR_SHOTS.find((s) => s.slot === slot)
}

/** Room order: pickup spots first, then return spots, each in shot-list order. */
export function slotOrder(phase: Phase, slot: string): number {
  const i = CAR_SHOTS.findIndex((s) => s.slot === slot)
  return (phase === 'pickup' ? 0 : 100) + (i < 0 ? 99 : i + 1)
}

export function isCar(p: Pick<Property, 'kind'>): boolean {
  return p.kind === 'car'
}

/** What a car record is called on screen and in file names, e.g. "White Toyota Camry · 8ABC123". */
export function carLabel(car: Pick<CarDetails, 'vehicle' | 'plate' | 'company'>): string {
  const parts = [car.vehicle.trim(), car.plate.trim().toUpperCase()].filter(Boolean)
  if (parts.length === 0 && car.company.trim()) parts.push(`${car.company.trim()} rental`)
  return parts.join(' · ') || 'Rental car'
}

export function emptyCar(): CarDetails {
  return { company: '', vehicle: '', plate: '', reservation: '', pickupPlace: '', returnPlace: '' }
}

/** Read car details from untrusted input (a restored manifest), keeping only short strings. */
export function cleanCar(v: unknown): CarDetails {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>
  const str = (k: string, max = 80) => (typeof o[k] === 'string' ? (o[k] as string).slice(0, max) : '')
  return {
    company: str('company'),
    vehicle: str('vehicle'),
    plate: str('plate', 20),
    reservation: str('reservation', 40),
    pickupPlace: str('pickupPlace', 120),
    returnPlace: str('returnPlace', 120),
  }
}

export function roomsForPhase(rooms: Room[], phase: Phase): Room[] {
  return rooms.filter((r) => r.phase === phase)
}
