import { describe, it, expect } from 'vitest'
import { statSync } from 'node:fs'
import { join, extname } from 'node:path'
import { safeRead, safeWalk } from '../../helpers/safe-walk'

/**
 * Pre-launch hardening item 7 (regression guard).
 *
 * `supabase.auth.getSession()` reads the session from the cookie WITHOUT
 * re-validating the JWT against the Supabase auth server. Trusting it for an
 * authorisation decision in server code lets a forged/expired cookie through.
 * `supabase.auth.getUser()` re-validates on every call and is the only safe
 * choice server-side.
 *
 * The audit (PR #72, folded into chore/launch-hardening) found zero
 * server-side `getSession()` usages: middleware and ~57 server sites already
 * use `getUser()`. The only two `getSession()` reads are in `'use client'`
 * components, where the session is the user's own and the server (RLS +
 * Supabase) is the real gate.
 *
 * This test locks that in: any file that is NOT a client component
 * (`'use client'`) and calls `auth.getSession(` fails the build. Client
 * components are exempt by design.
 */

const ROOT = process.cwd()
const SCAN_DIRS = ['src']
const EXTRA_FILES = ['middleware.ts']
const CODE_EXT = new Set(['.ts', '.tsx'])

/**
 * Every code file under `dir`. safeWalk guards readdirSync AND statSync: the
 * local walk guarded only the readdir, so a file that vanished between being
 * listed and being stat-ed still threw ENOENT out of the sweep.
 */
function walk(dir: string): string[] {
  return safeWalk(dir, (name) => CODE_EXT.has(extname(name)))
}

function isClientComponent(source: string): boolean {
  // The 'use client' directive must be the first statement. Tolerate a leading
  // comment block or blank lines before it.
  const head = source.slice(0, 600)
  return /^\s*(?:\/\*[\s\S]*?\*\/\s*|\/\/[^\n]*\n\s*)*['"]use client['"]/.test(head)
}

describe('no server-side supabase.auth.getSession()', () => {
  // 30s, not the 5s default: this walks and reads every file in SCAN_DIRS, so
  // its cost grows with the codebase while the default timeout does not. It
  // began failing intermittently at 131 test files purely from competing for
  // I/O under the parallel runner, never from finding a real violation.
  it('every getSession() call lives in a client component', { timeout: 30_000 }, () => {
    const files: string[] = []
    for (const d of SCAN_DIRS) files.push(...walk(join(ROOT, d)))
    for (const f of EXTRA_FILES) {
      try {
        statSync(join(ROOT, f))
        files.push(join(ROOT, f))
      } catch {
        /* file absent, skip */
      }
    }

    const offenders: string[] = []
    for (const file of files) {
      // safeRead returns null for a file deleted since the walk listed it, which
      // cannot carry a server-side getSession() and is correctly skipped.
      const src = safeRead(file)
      if (src === null) continue
      if (!src.includes('auth.getSession(')) continue
      if (isClientComponent(src)) continue
      offenders.push(file.slice(ROOT.length + 1).replace(/\\/g, '/'))
    }

    expect(
      offenders,
      `Server-side auth.getSession() found (use getUser() for trusted authorisation):\n  ${offenders.join('\n  ')}`,
    ).toEqual([])
  })
})
