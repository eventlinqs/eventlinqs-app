import { describe, it, expect, afterEach } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, extname } from 'node:path'
import { getAppUrl } from '@/lib/site-url'

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

function walk(dir: string, out: string[]): void {
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return
  }
  for (const name of entries) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (CODE_EXT.has(extname(name))) out.push(full)
  }
}

describe('HARD-07: no localhost fallback for NEXT_PUBLIC_APP_URL', () => {
  it('src/ contains no NEXT_PUBLIC_APP_URL ?? localhost fallback', () => {
    const files: string[] = []
    walk(join(ROOT, 'src'), files)
    const offenders: string[] = []
    // Matches `NEXT_PUBLIC_APP_URL ?? 'http://localhost...` or `|| "http://localhost...`
    const pattern = /NEXT_PUBLIC_APP_URL\s*(\?\?|\|\|)\s*['"]https?:\/\/localhost/
    for (const file of files) {
      if (pattern.test(readFileSync(file, 'utf8'))) {
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
      // HARD-01: canonical production host is www.
      expect(url).toBe('https://www.eventlinqs.com')
    })

    it('honours an explicit production NEXT_PUBLIC_APP_URL', () => {
      process.env.NEXT_PUBLIC_APP_URL = 'https://www.eventlinqs.com'
      expect(getAppUrl()).toBe('https://www.eventlinqs.com')
    })
  })
})
