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
// Not just src/components/auth. The build guard found two more credential
// forms this test originally missed: the ADMIN login, and the design-system
// preview. Scanning all of src is what caught them.
const SRC_DIR = path.join(ROOT, 'src')

function formFiles(): string[] {
  const walk = (dir: string, out: string[] = []): string[] => {
    for (const e of readdirSync(dir)) {
      const full = path.join(dir, e)
      if (statSync(full).isDirectory()) walk(full, out)
      else if (e.endsWith('.tsx')) out.push(full)
    }
    return out
  }
  return walk(SRC_DIR).filter((f) => {
    // A file listed by the walk can be gone by the time it is read. Vitest runs
    // test FILES in parallel workers, and tests/unit/ci/copy-gate-can-see.test.ts
    // plants and then deletes src/__copy_gate_scratch__/scratch.tsx to prove the
    // copy gate can see a new file. When the two overlap, this walk lists the
    // scratch file and the read then throws ENOENT, failing this suite for a
    // reason that has nothing to do with auth forms.
    //
    // Skipping a vanished file is correct independently of that race: a file
    // that no longer exists cannot contain an ungated form. Any OTHER read error
    // still throws, so this does not turn a real problem into a silent pass.
    let src: string
    try {
      src = readFileSync(f, 'utf8')
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return false
      throw err
    }
    return /<form[^>]*onSubmit=/.test(src) && /type=["']password["']/.test(src) && !/<form[^>]*\saction=/.test(src)
  })
}

describe('auth forms cannot submit before their handler exists', () => {
  const files = formFiles()

  it('finds the auth forms, so the suite cannot pass by checking nothing', () => {
    expect(files.length).toBeGreaterThanOrEqual(5)
  })

  it.each(files.map((f) => [path.relative(ROOT, f), f]))(
    '%s gates its submit control on hydration',
    (_rel, file) => {
      const src = readFileSync(file, 'utf8')
      expect(src).toContain('useHydrated')
      // No submit control may be gated on a busy flag alone: that control is
      // live in the pre-hydration window.
      expect(src.match(/disabled=\{\s*loading\s*\}/g), 'gated on loading alone').toBeNull()
      expect(src.match(/disabled=\{\s*pending\s*\}/g), 'gated on pending alone').toBeNull()
      expect(src).toMatch(/disabled=\{[^}]*!hydrated\}/)
    },
  )

  it.each(files.map((f) => [path.relative(ROOT, f), f]))(
    '%s still prevents the default submit in its handler',
    (_rel, file) => {
      // The hydration gate is the second line of defence, not a replacement
      // for preventDefault.
      expect(readFileSync(file, 'utf8')).toMatch(/preventDefault\(\)/)
    },
  )
})
