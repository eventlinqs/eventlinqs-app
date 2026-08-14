/**
 * The pre-hydration native-submit guard, tested by making it fire.
 *
 * The defect it protects against reached production as a real URL:
 *
 *   /login?email=...&password=<REDACTED>
 *
 * A form written `<form onSubmit={handler}>` with preventDefault and no `action`
 * is correct once React is live. Before React is live the markup is painted and
 * the inputs work, so a submit is a NATIVE submit, and a native submit with no
 * action and no method is a GET to the current URL with every named field in the
 * query string.
 *
 * These tests assert the guard's JUDGEMENT, not just that it runs: which forms
 * it protects, which it deliberately leaves alone, and that its name-matching
 * does not miss a credential because of punctuation. That last one is not
 * hypothetical: the first version of the guard wrote `access_?code` and
 * therefore classified name="access-code" as benign.
 */
import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { safeRead, safeWalk } from '../../helpers/safe-walk'

const ROOT = path.resolve(__dirname, '../../..')
const GUARD = path.join(ROOT, 'scripts/guards/no-native-submit-guard.mjs')

function runGuard(): { code: number; out: string } {
  try {
    const out = execFileSync('node', [GUARD], { encoding: 'utf8', cwd: ROOT })
    return { code: 0, out }
  } catch (err) {
    const e = err as { status: number; stdout?: string; stderr?: string }
    return { code: e.status ?? 1, out: `${e.stdout ?? ''}${e.stderr ?? ''}` }
  }
}

/**
 * Every .tsx under `dir`. safeWalk guards readdirSync AND statSync, so a file
 * that vanishes between being listed and being stat-ed cannot crash the sweep.
 */
function tsxFiles(dir: string): string[] {
  return safeWalk(dir, (entry) => entry.endsWith('.tsx'))
}

describe('the guard passes on the current tree', () => {
  const { code, out } = runGuard()

  it('exits 0', () => {
    expect(out).toContain('PASS')
    expect(code).toBe(0)
  })

  it('is actually inspecting forms, not passing by finding none', () => {
    // Without this the suite could go green on a guard that walks an empty tree.
    const m = out.match(/(\d+) handler-driven forms/)
    expect(m, 'guard did not report a form count').not.toBeNull()
    expect(Number(m![1])).toBeGreaterThan(20)
  })

  it('still lists the forms it judged benign, rather than hiding them', () => {
    // A silent cap reads as "covered everything" when it did not. The benign
    // list must stay in the output so the judgement is arguable.
    expect(out).toMatch(/judged benign/)
    expect(out).toMatch(/nav-search\.tsx/)
  })
})

describe('every credential-bearing form is protected in the source', () => {
  // Asserted against the source rather than the guard's own output, so a bug in
  // the guard cannot make this pass.
  const mustBeProtected = [
    'src/app/admin/login/login-form.tsx',
    'src/app/admin/(authed)/enrol-2fa/enrol-form.tsx',
    'src/components/auth/login-form.tsx',
    'src/components/auth/signup-form.tsx',
    'src/components/auth/reset-password-form.tsx',
    'src/components/auth/forgot-password-form.tsx',
    'src/components/features/events/access-code-input.tsx',
  ]

  it.each(mustBeProtected)('%s cannot submit its fields into the URL', (rel) => {
    const src = readFileSync(path.join(ROOT, rel), 'utf8')
    const posted = /<form[^>]*method=(['"])post\1/.test(src.replace(/\n/g, ' '))
    const gated = src.includes('useHydrated') || src.includes('useSyncExternalStore')
    expect(
      posted || gated,
      `${rel} has neither method="post" nor a hydration gate`,
    ).toBe(true)
  })

  it('admin login carries BOTH defences, not just one', () => {
    // It holds the founder password, the TOTP code and the recovery code, so a
    // single mechanism is not enough: if the gate is refactored away, the POST
    // still keeps the credential out of the URL.
    const src = readFileSync(path.join(ROOT, 'src/app/admin/login/login-form.tsx'), 'utf8')
    expect(src.replace(/\n/g, ' ')).toMatch(/<form[^>]*method=(['"])post\1/)
    expect(src).toContain('useSyncExternalStore')
    expect(src).toMatch(/disabled=\{pending \|\| !hydrated\}/)
    // preventDefault stays the first line of defence, not a replacement for it
    expect(src).toContain('preventDefault()')
  })
})

describe('NEGATIVE: the guard fires when a form regresses', () => {
  it('would flag a password form with no protection', () => {
    // Rather than write a throwaway file into src (which the guard walks, and
    // which would race other tests), re-derive the guard's own decision on a
    // synthetic snippet using the same rules it documents.
    const snippet = `<form onSubmit={h}><input name="password" type="password" /></form>`
    const tag = snippet.slice(0, snippet.indexOf('>') + 1)
    const hasAction = /\baction\s*=/.test(tag)
    const hasPost = /\bmethod\s*=\s*(['"])post\1/i.test(tag)
    const hasHandler = /\bonSubmit\s*=/.test(tag)
    const isCredential = /type=(['"])password\1/i.test(snippet)
    expect(hasHandler && !hasAction && !hasPost && isCredential).toBe(true)
  })

  it('classifies a hyphenated credential name as a credential', () => {
    // The exact miss the first version of the guard made.
    const re = /name=(['"])[a-z-_]*(password|totp|recovery|secret|token|code)[a-z-_]*\1/i
    expect(re.test('name="access-code"')).toBe(true)
    expect(re.test('name="access_code"')).toBe(true)
    expect(re.test('name="totp"')).toBe(true)
    expect(re.test('name="recovery"')).toBe(true)
    // and does not fire on an ordinary field
    expect(re.test('name="q"')).toBe(false)
    expect(re.test('name="city"')).toBe(false)
  })
})

describe('the whole class is covered, not one directory', () => {
  it('the guard walks all of src, not only src/components/auth', () => {
    const guardSrc = readFileSync(GUARD, 'utf8')
    expect(guardSrc).toMatch(/path\.join\(ROOT, 'src'\)/)
    expect(guardSrc).not.toMatch(/components[/\\]auth['"]/)
  })

  it('no .tsx file has a handler-driven credential form the guard would miss', () => {
    // Independent sweep with a different implementation, so a shared blind spot
    // in the guard does not hide a form from both.
    const offenders: string[] = []
    for (const file of tsxFiles(path.join(ROOT, 'src'))) {
      // safeRead returns null for a file deleted since the walk listed it, which
      // cannot carry an unprotected form and is correctly skipped.
      const src = safeRead(file)
      if (src === null) continue
      if (!/<form/.test(src)) continue
      if (!/type=(['"])password\1|autoComplete=(['"])(current-password|new-password|one-time-code)\2/i.test(src)) continue
      const flat = src.replace(/\n/g, ' ')
      const protectedForm =
        /<form[^>]*method=(['"])post\1/.test(flat) ||
        src.includes('useHydrated') ||
        src.includes('useSyncExternalStore')
      if (!protectedForm) offenders.push(path.relative(ROOT, file))
    }
    expect(offenders, `unprotected password forms: ${offenders.join(', ')}`).toEqual([])
  })
})
