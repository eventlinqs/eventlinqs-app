import { describe, it, expect, afterEach } from 'vitest'
import { join, extname } from 'node:path'
import { getAppUrl } from '@/lib/site-url'
import { safeRead, safeWalk } from '../../helpers/safe-walk'

/**
 * HARD-07 proof.
 *
 * No deployed environment may emit a localhost URL into a redirect or an email.
 * The defect was `process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'`
 * scattered across route handlers: if the env var were ever unset in prod, the
 * app would hand Stripe (and buyers) a localhost link.
 *
 * 1. Guard: no file under src/ resolves NEXT_PUBLIC_APP_URL to a localhost
 *    literal fallback.
 * 2. Behaviour: getAppUrl() never returns localhost when the env is unset.
 */

const ROOT = process.cwd()
const CODE_EXT = new Set(['.ts', '.tsx'])

/**
 * Every code file under `dir`. safeWalk guards readdirSync AND statSync: the
 * local walk guarded only the readdir, so a file that vanished between being
 * listed and being stat-ed still threw ENOENT out of the sweep.
 */
function walk(dir: string): string[] {
  return safeWalk(dir, (name) => CODE_EXT.has(extname(name)))
}

describe('HARD-07: no localhost fallback for NEXT_PUBLIC_APP_URL', () => {
  // 30s, not the 5s default. This walks every file under src/ and reads each
  // one, so its cost grows with the codebase while the default timeout does
  // not. It began failing intermittently at 131 test files purely from
  // competing for I/O under the parallel runner, never from finding a real
  // violation. A security gate that fails at random is a security gate people
  // learn to re-run instead of read.
  it('src/ contains no NEXT_PUBLIC_APP_URL ?? localhost fallback', { timeout: 30_000 }, () => {
    const files = walk(join(ROOT, 'src'))
    const offenders: string[] = []
    // Matches `NEXT_PUBLIC_APP_URL ?? 'http://localhost...` or `|| "http://localhost...`
    const pattern = /NEXT_PUBLIC_APP_URL\s*(\?\?|\|\|)\s*['"]https?:\/\/localhost/
    for (const file of files) {
      // safeRead returns null for a file deleted since the walk listed it, which
      // cannot carry a localhost fallback and is correctly skipped.
      const src = safeRead(file)
      if (src === null) continue
      if (pattern.test(src)) {
        offenders.push(file.slice(ROOT.length + 1).replace(/\\/g, '/'))
      }
    }
    expect(
      offenders,
      `localhost fallback for NEXT_PUBLIC_APP_URL found (use getAppUrl()):\n  ${offenders.join('\n  ')}`,
    ).toEqual([])
  })

  describe('getAppUrl()', () => {
    const saved = { ...process.env }
    afterEach(() => {
      process.env = { ...saved }
    })

    it('falls back to the production origin, never localhost, when env is unset', () => {
      delete process.env.NEXT_PUBLIC_APP_URL
      delete process.env.NEXT_PUBLIC_SITE_URL
      delete process.env.VERCEL_PROJECT_PRODUCTION_URL
      delete process.env.VERCEL_URL
      const url = getAppUrl()
      expect(url).not.toContain('localhost')
      // Founder ruling 2026-07-25: the canonical host is www.eventlinqs.com.au.
      // The fallback has to BE the canonical host, otherwise every generated
      // link starts life behind a 301.
      expect(url).toBe('https://www.eventlinqs.com.au')
    })

    it('a preview deploy resolves its OWN url, not the production domain', () => {
      // Without this, staging emitted production links for tickets and payouts
      // that only exist in the TEST database.
      delete process.env.NEXT_PUBLIC_APP_URL
      delete process.env.NEXT_PUBLIC_SITE_URL
      process.env.VERCEL_ENV = 'preview'
      process.env.VERCEL_URL = 'eventlinqs-app-git-feat-x.vercel.app'
      process.env.VERCEL_PROJECT_PRODUCTION_URL = 'www.eventlinqs.com.au'
      expect(getAppUrl()).toBe('https://eventlinqs-app-git-feat-x.vercel.app')
    })

    it('honours an explicit production NEXT_PUBLIC_APP_URL', () => {
      process.env.NEXT_PUBLIC_APP_URL = 'https://www.eventlinqs.com'
      expect(getAppUrl()).toBe('https://www.eventlinqs.com')
    })
  })
})
