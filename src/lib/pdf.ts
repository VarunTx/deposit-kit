// PDF report. jsPDF is the most widely used, actively maintained way to make a PDF
// in the browser with no server. It is loaded only when the user saves a report,
// so it doesn't slow down the first load.

import type { jsPDF as JsPdf } from 'jspdf'
import { HOW_TO_VERIFY, type ExportEntry, type Manifest } from './export.ts'
import { stateName } from './states.ts'

const PAGE_W = 215.9 // US Letter, mm
const PAGE_H = 279.4
const M = 16 // margin
const W = PAGE_W - M * 2

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

export async function buildPdf(manifest: Manifest, entries: ExportEntry[]): Promise<Blob> {
  const { jsPDF } = await import('jspdf')
  const doc: JsPdf = new jsPDF({ unit: 'mm', format: 'letter', compress: true })
  const byPath = new Map(entries.map((e) => [e.path, e]))
  let y = M

  const text = (s: string, size: number, opts: { bold?: boolean; color?: number; gap?: number; mono?: boolean } = {}) => {
    doc.setFont(opts.mono ? 'courier' : 'helvetica', opts.bold ? 'bold' : 'normal')
    doc.setFontSize(size)
    doc.setTextColor(opts.color ?? 20)
    const lines = doc.splitTextToSize(pdfSafe(s), W) as string[]
    const lh = size * 0.42
    for (const line of lines) {
      if (y + lh > PAGE_H - M - 8) {
        doc.addPage()
        y = M
      }
      doc.text(line, M, y + lh * 0.8)
      y += lh
    }
    y += opts.gap ?? 1.5
  }

  // Cover
  text('Move-in condition report', 22, { bold: true, gap: 4 })
  text(manifest.property.label, 14, { bold: true })
  if (manifest.property.state) text(`State: ${stateName(manifest.property.state)}`, 11)
  text(`Move-in date: ${formatDate(manifest.property.moveInDate)}`, 11)
  text(`Report saved: ${formatTime(manifest.generatedAt)}`, 11)
  text(
    `${plural(manifest.totals.photos, 'photo')} in ${plural(manifest.rooms.length, 'room')}. ${manifest.totals.timestamped} of ${manifest.totals.photos} have a signed timestamp.`,
    11,
    { gap: 6 },
  )
  text('How to verify these photos', 13, { bold: true })
  text(
    'This report comes with a zip file holding the original photos. Each photo below shows its SHA-256 fingerprint and the time a public timestamp authority signed that fingerprint.',
    10,
  )
  for (const line of HOW_TO_VERIFY) text(`-  ${line}`, 9.5, { color: 60 })
  y += 4
  text('Deposit Kit gives you templates and deadlines, not legal advice.', 9, { color: 90 })

  // Rooms and photos
  let photoNo = 0
  for (const room of manifest.rooms) {
    doc.addPage()
    y = M
    text(room.name, 18, { bold: true })
    text(`${room.photos.length} photo${room.photos.length === 1 ? '' : 's'}`, 10, { color: 90, gap: 4 })
    if (room.photos.length === 0) text('No photos taken in this room.', 11, { color: 90 })

    for (const p of room.photos) {
      photoNo++
      const entry = byPath.get(p.file)
      const display = entry?.photo.display
      const maxH = 92
      let imgW = W
      let imgH = maxH
      const pw = entry?.photo.width
      const ph = entry?.photo.height
      if (pw && ph) {
        const scale = Math.min(W / pw, maxH / ph)
        imgW = pw * scale
        imgH = ph * scale
      }
      if (y + imgH + 34 > PAGE_H - M - 8) {
        doc.addPage()
        y = M
      }
      if (display) {
        const bytes = new Uint8Array(await display.arrayBuffer())
        doc.addImage(bytes, 'JPEG', M, y, imgW, imgH, undefined, 'NONE')
      } else {
        doc.setDrawColor(180)
        doc.rect(M, y, W, 30)
        doc.setFontSize(10)
        doc.setTextColor(90)
        doc.text('Preview not available. The original photo is in the zip file.', M + 4, y + 16)
        imgH = 30
      }
      y += imgH + 3
      text(`Photo ${photoNo}${p.note ? `: ${p.note}` : ''}`, 11, { bold: true })
      text(
        p.timestamp.status === 'stamped'
          ? `Timestamped ${formatTime(p.timestamp.time)} by ${p.timestamp.provider} (serial ${p.timestamp.serialNumber})`
          : 'Not yet timestamped. Added to the app ' + formatTime(p.addedAt),
        9.5,
        { color: p.timestamp.status === 'stamped' ? 40 : 150 },
      )
      text(`SHA-256: ${p.sha256}`, 8, { mono: true, color: 60 })
      text(`File in zip: ${p.file}`, 8.5, { color: 90, gap: 7 })
    }
  }

  // Footer on every page
  const pages = doc.getNumberOfPages()
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(120)
    doc.text(pdfSafe(`Deposit Kit - ${manifest.property.label} - templates and deadlines, not legal advice`), M, PAGE_H - 8)
    doc.text(`Page ${i} of ${pages}`, PAGE_W - M, PAGE_H - 8, { align: 'right' })
  }
  return doc.output('blob')
}
