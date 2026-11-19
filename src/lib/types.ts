export interface Property {
  id: string
  /** Free text the user picks, e.g. "Apt 4B, 120 Main St". Stays on the device. */
  label: string
  /** YYYY-MM-DD */
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
