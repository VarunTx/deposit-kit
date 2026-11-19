// Guardrail from docs/spec.md: the app must never say "lawyer", "legal advice"
// (except in "not legal advice") or "guaranteed".

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = join(import.meta.dirname, '..')

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) return files(p)
    return /\.(tsx?|css|html|json|md)$/.test(name) ? [p] : []
  })
}

describe('user-facing copy', () => {
  const sources = [
    ...files(join(root, 'src')),
    ...files(join(root, 'public')),
    join(root, 'index.html'),
    join(root, 'vite.config.ts'),
  ]

  it.each(sources.map((p) => [p.slice(root.length + 1), p]))('%s avoids banned words', (_name, path) => {
    const text = readFileSync(path, 'utf8').replace(/not legal advice/gi, '')
    expect(text).not.toMatch(/lawyer|attorney|legal advice|guarantee/i)
  })

  it('keeps the "not legal advice" footer', () => {
    expect(readFileSync(join(root, 'src/app.tsx'), 'utf8')).toContain('templates and deadlines, not legal advice')
  })
})
