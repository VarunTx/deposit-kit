// Pre-launch check: fails while any placeholder that must be filled in is still there.
// Run: npm run check:launch

import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const read = (p: string) => (existsSync(join(root, p)) ? readFileSync(join(root, p), 'utf8') : '')
const problems: string[] = []

for (const page of ['public/privacy.html', 'public/support.html']) {
  if (read(page).includes('CONTACT_EMAIL')) problems.push(`${page}: replace CONTACT_EMAIL with a real support email address`)
}

if (problems.length) {
  console.log('Not ready to launch yet:\n')
  for (const p of problems) console.log(`  - ${p}`)
  console.log('')
  process.exit(1)
}
console.log('Launch check passed: no placeholders left.')
