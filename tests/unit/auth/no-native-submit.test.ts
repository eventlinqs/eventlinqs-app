/**
 * No auth form may submit natively.
 *
 * THE DEFECT. Every auth form is `<form onSubmit={handler}>` with
 * `e.preventDefault()` inside and NO `action`. Correct once React is live;
 * before hydration the markup is painted, the inputs work, and a submit is a
 * NATIVE submit, which with no action is a GET to the current URL carrying
 * every field in the query string.
 *
 * Observed on the deployed preview from a real submit on /login:
 *
 *   /login?email=broadcast.gate.organiser%40eventlinqs.com&password=ArtistGate2026%21Drive
 *
 * The password lands in browser history, in any URL logging, and in the
 * Referer header of the next request. The person also sees the form cleared
 * with no message, because the navigation discarded the React error state.
 *
 * This reads the source rather than rendering, because the failure is a
 * property of the markup and the timing, not of any rendered output: a render
 * test hydrates immediately and can never observe the window.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(__dirname, '../../..')
const AUTH_DIR = path.join(ROOT, 'src/components/auth')

function formFiles(): string[] {
  const walk = (dir: string, out: string[] = []): string[] => {
    for (const e of readdirSync(dir)) {
      const full = path.join(dir, e)
      if (statSync(full).isDirectory()) walk(full, out)
      else if (e.endsWith('.tsx')) out.push(full)
    }
    return out
  }
  return walk(AUTH_DIR).filter((f) => readFileSync(f, 'utf8').includes('<form onSubmit'))
}

describe('auth forms cannot submit before their handler exists', () => {
  const files = formFiles()

  it('finds the auth forms, so the suite cannot pass by checking nothing', () => {
    expect(files.length).toBeGreaterThanOrEqual(4)
  })

  it.each(files.map((f) => [path.relative(ROOT, f), f]))(
    '%s gates its submit control on hydration',
    (_rel, file) => {
      const src = readFileSync(file, 'utf8')
      expect(src).toContain('useHydrated')
      // Every disabled submit control must include the hydration term. A
      // control still reading `disabled={loading}` alone is submittable in the
      // pre-hydration window.
      const bare = src.match(/disabled=\{loading\}/g)
      expect(bare, 'a submit control is still gated on loading alone').toBeNull()
      expect(src).toMatch(/disabled=\{loading \|\| !hydrated\}/)
    },
  )

  it.each(files.map((f) => [path.relative(ROOT, f), f]))(
    '%s still prevents the default submit in its handler',
    (_rel, file) => {
      // The hydration gate is the second line of defence, not a replacement
      // for preventDefault.
      expect(readFileSync(file, 'utf8')).toContain('preventDefault()')
    },
  )
})
