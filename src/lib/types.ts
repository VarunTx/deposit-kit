export type RecordKind = 'home' | 'car'

/** Pickup and return for a rental car. Homes have no phase (move-in only for now). */
export type Phase = 'pickup' | 'return'

export interface CarDetails {
  company: string
  /** Free text, e.g. "White Toyota Camry". */
  vehicle: string
  plate: string
  /** Reservation or rental agreement number. */
  reservation: string
  pickupPlace: string
  returnPlace: string
}

/** One record: a rented home or a rented car. (Stored as "properties" for older versions of the app.) */
export interface Property {
  id: string
  /** Absent on records made before rental cars existed, which are all homes. */
  kind?: RecordKind
  car?: CarDetails
  /** Home: free text the user picks, e.g. "Apt 4B, 120 Main St". Car: made from the vehicle and plate. Stays on the device. */
  label: string
  /** YYYY-MM-DD. Home: move-in date. Car: pickup date. */
  moveInDate: string
  /** Two-letter US state code, or '' if not chosen. */
  state: string
  createdAt: string
  /** When the user last saved an export, ISO. */
  lastExportAt?: string
  /** When rooms, photos, notes or timestamps last changed, ISO. */
  lastChangeAt?: string
}

export interface Room {
  id: string
  propertyId: string
  name: string
  order: number
  createdAt: string
  /** Car records only: which visit, and which spot on the shot list. */
  phase?: Phase
  slot?: string
}

export type StampStatus = 'pending' | 'stamped' | 'failed'

export interface PhotoStamp {
  status: StampStatus
  provider?: string
  /** Time the authority signed, ISO. */
  genTime?: string
  serialNumber?: string
  /** DER TimeStampResp, as written to `.tsr` files. */
  tsr?: Uint8Array
  error?: string
  attempts: number
}

export interface Photo {
  id: string
  propertyId: string
  roomId: string
  /** When the photo was added to the app, ISO. */
  addedAt: string
  fileName: string
  /** The file's own last-modified time from the device, ms. Not proof, just a hint. */
  fileLastModified: number
  /** Exact bytes the user took. This is what the hash and timestamp cover. */
  original: Blob
  /** Smaller JPEG for the screen and the PDF. Null if the browser couldn't read the image. */
  display: Blob | null
  width?: number
  height?: number
  /** SHA-256 of `original`, lowercase hex. */
  sha256: string
  note: string
  stamp: PhotoStamp
}
