// PDF report. jsPDF is the most widely used, actively maintained way to make a PDF
// in the browser with no server. It is loaded only when the user saves a report,
// so it doesn't slow down the first load.

import type { jsPDF as JsPdf } from 'jspdf'
import { VERIFY_COMMAND_LINES, type ExportEntry, type Manifest, type ManifestPhoto, type ManifestRoom } from './export.ts'
import { stateName } from './states.ts'
import { CAR_SHOTS } from './car.ts'
import type { Phase } from './types.ts'

const PAGE_W = 215.9 // US Letter, mm
const PAGE_H = 279.4
const M = 18 // side margin
const TOP = 24 // below the running header
const BOTTOM = PAGE_H - 18 // above the running footer
const W = PAGE_W - M * 2

type Rgb = [number, number, number]
const INK: Rgb = [17, 24, 39]
const MUTED: Rgb = [90, 101, 117]
const ACCENT: Rgb = [15, 118, 110]
const ACCENT_SOFT: Rgb = [230, 244, 241]
const PANEL: Rgb = [244, 246, 249]
const LINE: Rgb = [218, 224, 232]
const WARN: Rgb = [146, 84, 0]
const WARN_SOFT: Rgb = [255, 246, 228]

/** jsPDF's built-in fonts only cover Latin-1. Swap common typography and drop the rest. */
export function pdfSafe(s: string): string {
  return s
    .replace(/[‘’‚′]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/ /g, ' ')
    .normalize('NFC')
    .replace(/[^\x20-\x7e\xa0-\xff\n]/gu, '?')
}

export function formatTime(iso: string | undefined): string {
  if (!iso) return ''
  // dateStyle/timeStyle can't be combined with timeZoneName, so spell the parts out.
  return new Date(iso).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  })
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

function formatDate(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number)
  if (!y || !m || !d) return ymd
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { dateStyle: 'long' })
}

const LINE_H = (size: number) => size * 0.46

class Layout {
  doc: JsPdf
  y = TOP
  constructor(doc: JsPdf) {
    this.doc = doc
  }

  font(size: number, style: 'normal' | 'bold' = 'normal', color: Rgb = INK, face: 'helvetica' | 'courier' = 'helvetica') {
    this.doc.setFont(face, style)
    this.doc.setFontSize(size)
    this.doc.setTextColor(...color)
  }

  /** Start a new page if `h` mm won't fit. */
  ensure(h: number) {
    if (this.y + h > BOTTOM) this.newPage()
  }

  newPage() {
    this.doc.addPage()
    this.y = TOP
  }

  lines(text: string, width: number): string[] {
    return this.doc.splitTextToSize(pdfSafe(text), width) as string[]
  }

  /** Wrapped paragraph at x with the current font. Returns height used. */
  para(text: string, size: number, opts: { x?: number; width?: number; style?: 'normal' | 'bold'; color?: Rgb; after?: number } = {}) {
    const x = opts.x ?? M
    this.font(size, opts.style, opts.color)
    const ls = this.lines(text, opts.width ?? W - (x - M))
    const lh = LINE_H(size)
    for (const l of ls) {
      this.ensure(lh)
      this.doc.text(l, x, this.y + lh * 0.78)
      this.y += lh
    }
    this.y += opts.after ?? 2
  }

  bullet(text: string, size = 10, n?: number) {
    const indent = 6
    this.font(size, 'normal', INK)
    const ls = this.lines(text, W - indent)
    this.ensure(LINE_H(size) * Math.min(ls.length, 2))
    const cy = this.y + LINE_H(size) * 0.5
    if (n !== undefined) {
      this.doc.setFillColor(...ACCENT)
      this.doc.circle(M + 2, cy, 2.1, 'F')
      this.font(7.5, 'bold', [255, 255, 255])
      this.doc.text(String(n), M + 2, cy + 0.95, { align: 'center' })
    } else {
      this.doc.setFillColor(...ACCENT)
      this.doc.circle(M + 1.6, cy, 0.8, 'F')
    }
    this.para(text, size, { x: M + indent, after: 2.2 })
  }

  heading(text: string, size: number, after = 3) {
    this.ensure(LINE_H(size) + 12)
    this.para(text, size, { style: 'bold', after })
  }
}

/** Shorten text with "..." so it fits in `width` mm with the current font. */
function fit(doc: JsPdf, text: string, width: number): string {
  if (doc.getTextWidth(text) <= width) return text
  let t = text
  while (t.length > 4 && doc.getTextWidth(t + '...') > width) t = t.slice(0, -1)
  return t.trimEnd() + '...'
}

function carRows(m: Manifest): [string, string][] {
  const c = m.car
  const pickupPhotos = m.rooms.filter((r) => r.phase === 'pickup').reduce((n, r) => n + r.photos.length, 0)
  const returnPhotos = m.rooms.filter((r) => r.phase === 'return').reduce((n, r) => n + r.photos.length, 0)
  const hasReturn = m.rooms.some((r) => r.phase === 'return')
  const rows: [string, string][] = []
  if (c?.company) rows.push(['Rental company', c.company])
  if (c?.vehicle) rows.push(['Car', c.vehicle])
  if (c?.plate) rows.push(['License plate', c.plate])
  if (c?.reservation) rows.push(['Reservation', c.reservation])
  rows.push(['Picked up', [formatDate(m.property.moveInDate), c?.pickupPlace].filter(Boolean).join(', ')])
  if (c?.returnPlace) rows.push(['Returned at', c.returnPlace])
  rows.push(['Photos', hasReturn ? `${pickupPhotos} at pickup, ${returnPhotos} at return` : `${plural(pickupPhotos, 'photo')} at pickup; no return photos yet`])
  return rows
}

interface CarSpot {
  name: string
  slot?: string
  pickup: ManifestPhoto[]
  ret: ManifestPhoto[]
  hasReturn: boolean
}

/** Group a car manifest by spot, in shot-list order, pairing each spot's pickup and return photos. */
export function carSpots(m: Manifest): CarSpot[] {
  const hasReturn = m.rooms.some((r) => r.phase === 'return')
  const key = (r: ManifestRoom) => r.slot ?? `name:${r.name}`
  const spots = new Map<string, CarSpot>()
  const order = (k: string) => {
    const i = CAR_SHOTS.findIndex((s) => s.slot === k)
    return i < 0 ? 999 : i
  }
  for (const r of m.rooms) {
    const k = key(r)
    const spot = spots.get(k) ?? { name: r.name, slot: r.slot, pickup: [], ret: [], hasReturn }
    if (r.phase === 'return') spot.ret.push(...r.photos)
    else spot.pickup.push(...r.photos)
    spots.set(k, spot)
  }
  return [...spots.entries()]
    .sort((a, b) => order(a[0]) - order(b[0]))
    .map(([, s]) => s)
    .filter((s) => s.pickup.length + s.ret.length > 0)
}

const PHASE_LABEL: Record<Phase, string> = { pickup: 'Pickup', return: 'Return' }

/** Car pages: each spot with its pickup photos on the left and return photos on the right. */
async function carPages(L: Layout, m: Manifest, byPath: Map<string, ExportEntry>) {
  const doc = L.doc
  const spots = carSpots(m)
  const twoCol = spots.some((s) => s.hasReturn)
  const GAP = 6
  const colW = twoCol ? (W - GAP) / 2 : W
  const IMG_MAX_H = twoCol ? 62 : 72
  const numbers: Record<Phase, number> = { pickup: 0, return: 0 }

  const imgSize = (p: ManifestPhoto) => {
    const e = byPath.get(p.file)?.photo
    if (e?.display && e.width && e.height) {
      const scale = Math.min(colW / e.width, IMG_MAX_H / e.height)
      return { w: e.width * scale, h: e.height * scale }
    }
    return { w: colW, h: 28 }
  }
  const captionLines = (p: ManifestPhoto, title: string): { title: string[]; stamp: string[]; mono: string[] } => {
    L.font(10.5, 'bold')
    const t = L.lines(title, colW)
    L.font(9, 'normal')
    const st = L.lines(
      p.timestamp.status === 'stamped'
        ? `Timestamped ${formatTime(p.timestamp.time)} by ${p.timestamp.provider}, serial ${p.timestamp.serialNumber}`
        : `Not yet timestamped. Added to the app ${formatTime(p.addedAt)}.`,
      colW,
    )
    const mono = twoCol
      ? [`SHA-256 ${p.sha256.slice(0, 32)}`, `        ${p.sha256.slice(32)}`, `Photo   ${p.file}`]
      : [`SHA-256  ${p.sha256}`, `Photo    ${p.file}`]
    if (p.timestamp.file) mono.push(`${twoCol ? 'Proof   ' : 'Proof    '}${p.timestamp.file}`)
    return { title: t, stamp: st, mono }
  }
  const blockHeight = (p: ManifestPhoto | undefined, title: string) => {
    if (!p) return 16
    const c = captionLines(p, title)
    return imgSize(p).h + 3 + c.title.length * LINE_H(10.5) + 1 + c.stamp.length * LINE_H(9) + 1 + c.mono.length * 3.6 + 6
  }
  const drawBlock = async (p: ManifestPhoto | undefined, title: string, phase: Phase, x: number, top: number, slot?: string) => {
    if (!p) {
      const only = CAR_SHOTS.find((s) => s.slot === slot)?.phases
      doc.setFillColor(...PANEL)
      doc.roundedRect(x, top, colW, 12, 2, 2, 'F')
      L.font(9.5, 'normal', MUTED)
      const msg = only && !only.includes(phase) ? `Only photographed at ${only.map((x) => PHASE_LABEL[x].toLowerCase()).join(' and ')}.` : `No ${phase} photo of this spot.`
      doc.text(msg, x + colW / 2, top + 7.2, { align: 'center' })
      return
    }
    const entry = byPath.get(p.file)
    const size = imgSize(p)
    if (entry?.photo.display) {
      doc.addImage(new Uint8Array(await entry.photo.display.arrayBuffer()), 'JPEG', x, top, size.w, size.h, undefined, 'NONE')
      doc.setDrawColor(...LINE)
      doc.rect(x, top, size.w, size.h)
    } else {
      doc.setFillColor(...PANEL)
      doc.roundedRect(x, top, colW, size.h, 2, 2, 'F')
      L.font(9, 'normal', MUTED)
      doc.text('No preview. The original is in the zip.', x + colW / 2, top + size.h / 2 + 1, { align: 'center' })
    }
    let y = top + size.h + 3
    const c = captionLines(p, title)
    L.font(10.5, 'bold', INK)
    for (const l of c.title) {
      doc.text(l, x, y + LINE_H(10.5) * 0.78)
      y += LINE_H(10.5)
    }
    y += 1
    L.font(9, 'normal', p.timestamp.status === 'stamped' ? ACCENT : WARN)
    for (const l of c.stamp) {
      doc.text(l, x, y + LINE_H(9) * 0.78)
      y += LINE_H(9)
    }
    y += 1
    L.font(7.4, 'normal', MUTED, 'courier')
    for (const l of c.mono) {
      doc.text(fit(doc, pdfSafe(l), colW), x, y + 3)
      y += 3.6
    }
  }

  const labelH = twoCol ? 6 : 0
  const rowOf = (spot: CarSpot, i: number) => {
    const cells: [Phase, ManifestPhoto | undefined][] = twoCol
      ? [
          ['pickup', spot.pickup[i]],
          ['return', spot.ret[i]],
        ]
      : [['pickup', spot.pickup[i]]]
    const titles = cells.map(([ph, p]) => (p ? `${PHASE_LABEL[ph]} photo ${numbers[ph] + 1}${p.note ? `  -  ${p.note}` : ''}` : ''))
    return { cells, titles, h: Math.max(...cells.map(([, p], j) => blockHeight(p, titles[j]))) }
  }

  L.newPage()
  for (const spot of spots) {
    // Keep the spot's heading on the same page as its first row of photos.
    L.ensure(5 + LINE_H(16) + 3 + labelH + rowOf(spot, 0).h)
    L.font(9, 'bold', ACCENT)
    doc.text('SPOT', M, L.y + 3)
    L.y += 5
    L.para(spot.name, 16, { style: 'bold', after: 3 })
    const rows = Math.max(spot.pickup.length, twoCol ? spot.ret.length : 0)
    for (let i = 0; i < rows; i++) {
      const { cells, titles, h } = rowOf(spot, i)
      // Column labels sit above the first row of each spot (and again after a page break).
      const fresh = L.y + labelH + h > BOTTOM
      if (fresh) L.newPage()
      if (twoCol && (i === 0 || fresh)) {
        cells.forEach(([ph], j) => {
          L.font(8.5, 'bold', MUTED)
          doc.text(`${PHASE_LABEL[ph].toUpperCase()}${fresh && i > 0 ? `  (${pdfSafe(spot.name)}, continued)` : ''}`, M + j * (colW + GAP), L.y + 3)
        })
        L.y += labelH
      }
      const top = L.y
      for (const [j, [ph, p]] of cells.entries()) {
        if (p) numbers[ph]++
        await drawBlock(p, titles[j], ph, M + j * (colW + GAP), top, spot.slot)
      }
      L.y = top + h
    }
    L.y += 4
  }
}

/** Load jsPDF ahead of time. Once loaded it stays in memory for this page. */
export function preloadPdf(): Promise<unknown> {
  return import('jspdf')
}

export async function buildPdf(manifest: Manifest, entries: ExportEntry[]): Promise<Blob> {
  const { jsPDF } = await import('jspdf')
  const doc: JsPdf = new jsPDF({ unit: 'mm', format: 'letter', compress: true })
  const isCar = manifest.kind === 'car'
  doc.setProperties({
    title: `${isCar ? 'Rental car condition report' : 'Move-in condition report'} - ${pdfSafe(manifest.property.label)}`,
    creator: 'Deposit Kit',
  })
  const L = new Layout(doc)
  const byPath = new Map(entries.map((e) => [e.path, e]))
  const { totals } = manifest
  const allStamped = totals.photos > 0 && totals.timestamped === totals.photos

  // ---------- Cover ----------
  L.font(9, 'bold', ACCENT)
  doc.text(isCar ? 'RENTAL CAR CONDITION REPORT' : 'MOVE-IN CONDITION REPORT', M, L.y + 3)
  L.y += 8
  L.para(manifest.property.label, 22, { style: 'bold', after: 5 })

  // Summary panel
  const rows: [string, string][] = isCar
    ? carRows(manifest)
    : [
        ['Move-in date', formatDate(manifest.property.moveInDate)],
        ...(manifest.property.state ? ([['State', stateName(manifest.property.state)]] as [string, string][]) : []),
        ['Photos', `${plural(totals.photos, 'photo')} in ${plural(manifest.rooms.length, 'room')}`],
      ]
  rows.push(['Timestamps', `${totals.timestamped} of ${totals.photos} photos have a signed timestamp`], ['Report saved', formatTime(manifest.generatedAt)])
  const rowH = 7
  const panelH = rows.length * rowH + 6
  doc.setFillColor(...PANEL)
  doc.roundedRect(M, L.y, W, panelH, 3, 3, 'F')
  let ry = L.y + 3
  for (const [k, v] of rows) {
    L.font(9.5, 'normal', MUTED)
    doc.text(k, M + 5, ry + 4.6)
    L.font(10.5, 'bold', INK)
    doc.text(fit(doc, pdfSafe(v), W - 47), M + 42, ry + 4.6)
    ry += rowH
  }
  L.y += panelH + 5

  // Status pill
  const missing = totals.photos - totals.timestamped
  const pill = allStamped
    ? 'Every photo has a signed timestamp.'
    : `${plural(missing, 'photo')} ${missing === 1 ? 'is' : 'are'} not yet timestamped.`
  L.font(10, 'bold', allStamped ? ACCENT : WARN)
  const pw = doc.getTextWidth(pill) + 10
  doc.setFillColor(...(allStamped ? ACCENT_SOFT : WARN_SOFT))
  doc.roundedRect(M, L.y, pw, 8, 4, 4, 'F')
  doc.text(pill, M + 5, L.y + 5.4)
  L.y += 15

  L.heading('What this report shows', 13)
  L.para(
    (isCar
      ? 'These photos record the condition of the rental car, spot by spot, when it was picked up and when it was returned. Pickup and return photos of the same spot are shown side by side.'
      : 'These photos record the condition of the home at move-in.') +
      ' Each photo has a SHA-256 fingerprint, a code that changes if even one pixel of the photo changes. A public timestamp service (FreeTSA) signed each fingerprint, which shows the photo existed at the time listed. The photos were never uploaded; only their fingerprints were sent.',
    10.5,
    { color: INK, after: 6 },
  )

  // Contents
  const contents: [string, string][] = isCar
    ? carSpots(manifest).map((s) => [s.name, s.hasReturn ? `${s.pickup.length} at pickup · ${s.ret.length} at return` : plural(s.pickup.length, 'photo')])
    : manifest.rooms.map((r) => [r.name, plural(r.photos.length, 'photo')])
  L.heading(isCar ? 'Spots in this report' : 'Rooms in this report', 13)
  L.ensure(8 * Math.min(contents.length, 3))
  for (const [name, count] of contents) {
    L.ensure(7)
    L.font(10.5, 'normal', INK)
    doc.text(pdfSafe(name), M, L.y + 4)
    L.font(10, 'normal', MUTED)
    doc.text(pdfSafe(count), PAGE_W - M, L.y + 4, { align: 'right' })
    doc.setDrawColor(...LINE)
    doc.line(M, L.y + 6.3, PAGE_W - M, L.y + 6.3)
    L.y += 8
  }

  L.y += 6
  L.heading('How to check a photo', 13)
  L.bullet('Open the zip file saved with this report. It holds the original photos and a .tsr timestamp file for each one.', 10, 1)
  L.bullet('Anyone with OpenSSL (built into Mac and Linux) can run the command below from inside the unzipped folder, using the photo and .tsr file names listed in this report.', 10, 2)
  L.bullet('If the photo is unchanged since it was timestamped, the result is "Verification: OK". An edited photo fails the check.', 10, 3)
  L.y += 2

  // Command box: monospace, one option per line.
  const cmdSize = 8.6
  const boxH = VERIFY_COMMAND_LINES.length * LINE_H(cmdSize) * 1.15 + 6
  L.ensure(boxH + 10)
  doc.setFillColor(...PANEL)
  doc.setDrawColor(...LINE)
  doc.roundedRect(M, L.y, W, boxH, 2, 2, 'FD')
  let cy = L.y + 5.5
  for (const line of VERIFY_COMMAND_LINES) {
    L.font(cmdSize, 'normal', INK, 'courier')
    doc.text(line, M + 5, cy)
    cy += LINE_H(cmdSize) * 1.15
  }
  L.y += boxH + 4
  const usedOther = manifest.rooms.some((r) => r.photos.some((p) => p.timestamp.provider && p.timestamp.provider !== 'FreeTSA'))
  L.para(
    'The certificates are in the zip, or download them yourself from freetsa.org.' +
      (usedOther ? ' Photos timestamped by DigiCert check against your computer\'s standard certificate list instead.' : ''),
    9,
    { color: MUTED, after: 4 },
  )


  // ---------- Rooms (or car spots) ----------
  if (isCar) await carPages(L, manifest, byPath)
  let photoNo = 0
  const IMG_MAX_H = 72
  const CAPTION_H = 30
  for (const room of isCar ? [] : manifest.rooms) {
    L.newPage()
    L.font(9, 'bold', ACCENT)
    doc.text('ROOM', M, L.y + 3)
    L.y += 5
    L.para(room.name, 20, { style: 'bold', after: 1 })
    L.para(plural(room.photos.length, 'photo'), 10, { color: MUTED, after: 5 })
    if (room.photos.length === 0) L.para('No photos taken in this room.', 11, { color: MUTED })

    for (const p of room.photos) {
      photoNo++
      const entry = byPath.get(p.file)
      const display = entry?.photo.display
      const pw = entry?.photo.width
      const ph = entry?.photo.height
      let imgW = W
      let imgH = 32
      if (display && pw && ph) {
        const scale = Math.min(W / pw, IMG_MAX_H / ph)
        imgW = pw * scale
        imgH = ph * scale
      }
      L.ensure(imgH + CAPTION_H)
      const top = L.y
      if (display) {
        const bytes = new Uint8Array(await display.arrayBuffer())
        doc.addImage(bytes, 'JPEG', M, top, imgW, imgH, undefined, 'NONE')
        doc.setDrawColor(...LINE)
        doc.rect(M, top, imgW, imgH)
      } else {
        doc.setFillColor(...PANEL)
        doc.roundedRect(M, top, W, imgH, 2, 2, 'F')
        L.font(10, 'normal', MUTED)
        doc.text('No preview on this device. The original photo is in the zip file.', M + W / 2, top + imgH / 2 + 1, { align: 'center' })
      }
      L.y = top + imgH + 3

      L.para(`Photo ${photoNo}${p.note ? `  -  ${p.note}` : ''}`, 11, { style: 'bold', after: 1.2 })
      if (p.timestamp.status === 'stamped') {
        L.para(`Timestamped ${formatTime(p.timestamp.time)} by ${p.timestamp.provider}, serial ${p.timestamp.serialNumber}`, 9.5, {
          color: ACCENT,
          after: 1,
        })
      } else {
        L.para(`Not yet timestamped. Added to the app ${formatTime(p.addedAt)}.`, 9.5, { color: WARN, after: 1 })
      }
      L.font(7.8, 'normal', MUTED, 'courier')
      L.ensure(4)
      doc.text(`SHA-256  ${p.sha256}`, M, L.y + 3)
      L.y += 4
      L.font(7.8, 'normal', MUTED, 'courier')
      doc.text(pdfSafe(`Photo    ${p.file}`), M, L.y + 3)
      L.y += 4
      if (p.timestamp.file) {
        doc.text(pdfSafe(`Proof    ${p.timestamp.file}`), M, L.y + 3)
        L.y += 4
      }
      L.y += 6
    }
  }

  // ---------- Running header and footer ----------
  const pages = doc.getNumberOfPages()
  const label = pdfSafe(manifest.property.label)
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i)
    doc.setDrawColor(...LINE)
    doc.line(M, 14, PAGE_W - M, 14)
    L.font(8, 'bold', ACCENT)
    doc.text('Deposit Kit', M, 11)
    L.font(8, 'normal', MUTED)
    const maxLabel = W - 40
    let shown = label
    while (doc.getTextWidth(shown) > maxLabel && shown.length > 4) shown = shown.slice(0, -2)
    if (shown !== label) shown = shown.trimEnd() + '...'
    doc.text(shown, PAGE_W - M, 11, { align: 'right' })

    doc.line(M, PAGE_H - 13, PAGE_W - M, PAGE_H - 13)
    doc.text('Deposit Kit gives you templates and deadlines, not legal advice.', M, PAGE_H - 8.5)
    doc.text(`Page ${i} of ${pages}`, PAGE_W - M, PAGE_H - 8.5, { align: 'right' })
  }
  return doc.output('blob')
}
