import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * INDEXABILITY IS ASSERTED AGAINST THE HOST, AND A LOCAL BUILD IS PRODUCTION.
 *
 * scripts/ci/assert-seo-audits.mjs asserts the one SEO audit the category
 * floor cannot: a preview must be blocked, production must be crawlable. Until
 * 6 September 2026 a loopback host was neither, so the pre-push gate's local
 * run declared zero indexability work and failed under the zero-is-failure
 * contract, while production's crawlability was asserted nowhere at all.
 * next.config.ts sends `index, follow` whenever VERCEL_ENV is absent, so a
 * local build carries production's header and is held to production's rule,
 * as src/lib/seo/indexing-policy.ts classifies each route: always must be
 * crawlable, never and alias must be blocked, conditional is named and left to
 * the driven check that can count events.
 *
 * The script runs at import, so it is driven as a child over synthetic
 * reports in a temp directory, the way the gate drives it over real ones.
 */

const ROOT = join(__dirname, '..', '..', '..')
const SCRIPT = join(ROOT, 'scripts', 'ci', 'assert-seo-audits.mjs')

/** The reviewed audit set, read from the script so the fixtures cannot drift from it. */
function baselineAudits(): string[] {
  const src = readFileSync(SCRIPT, 'utf8')
  const block = /SEO_AUDIT_BASELINE = \[([\s\S]*?)\]/.exec(src)
  if (!block) throw new Error('SEO_AUDIT_BASELINE not found in assert-seo-audits.mjs')
  return [...block[1].matchAll(/'([^']+)'/g)].map((m) => m[1])
}

function report(url: string, crawlable: number) {
  return JSON.stringify({
    requestedUrl: url,
    categories: { seo: { auditRefs: baselineAudits().map((id) => ({ id })) } },
    audits: { 'is-crawlable': { score: crawlable } },
  })
}

let dir: string
let n = 0

function runOver(reports: string[]) {
  const sub = join(dir, `set-${n++}`)
  rmSync(sub, { recursive: true, force: true })
  mkdirSync(sub, { recursive: true })
  reports.forEach((r, i) => writeFileSync(join(sub, `lhr-${1000 + i}.json`), r))
  const result = spawnSync(process.execPath, [SCRIPT, sub], { cwd: ROOT, encoding: 'utf8' })
  return { status: result.status, out: `${result.stdout}${result.stderr}` }
}

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'el-seo-audits-'))
})

afterAll(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('assert-seo-audits indexability by host', () => {
  test('a crawlable local production build passes, and its indexability was actually checked', () => {
    const { status, out } = runOver([report('http://127.0.0.1:3311/', 1), report('http://127.0.0.1:3311/events', 1)])
    expect(status, out).toBe(0)
    expect(out).toContain('indexability asserted on 2 report(s), skipped on 0')
  })

  test('a blocked page on a local production build fails, naming what production would lose', () => {
    const { status, out } = runOver([report('http://127.0.0.1:3311/events', 0)])
    expect(status).toBe(1)
    expect(out).toContain('THE LOCAL PRODUCTION BUILD IS BLOCKED FROM INDEXING')
    expect(out).toContain('carries the production header')
  })

  /*
   * CHANGED 8 SEPTEMBER 2026 (close-out C19), AND THE CHANGE IS A STRENGTHENING.
   *
   * A route the indexing policy classes `never` used to be SKIPPED here: the
   * script read src/app/(auth)/ and excused those four paths, and said nothing
   * about any other private surface. Nothing anywhere failed if /dashboard,
   * /admin or the door scanner started inviting crawlers. It is now ASSERTED:
   * a never route must be blocked, and a never route that is crawlable fails.
   */
  test('a never route is asserted BLOCKED, on local and on production', () => {
    const local = runOver([report('http://127.0.0.1:3311/login', 0), report('http://127.0.0.1:3311/', 1)])
    expect(local.status, local.out).toBe(0)
    expect(local.out).toContain('indexability asserted on 2 report(s), skipped on 0')

    const production = runOver([report('https://www.eventlinqs.com.au/signup', 0), report('https://www.eventlinqs.com.au/', 1)])
    expect(production.status, production.out).toBe(0)
  })

  test('a never route that is CRAWLABLE fails, which nothing checked before', () => {
    const { status, out } = runOver([report('https://www.eventlinqs.com.au/dashboard', 1)])
    expect(status).toBe(1)
    expect(out).toContain('A NEVER ROUTE IS INDEXABLE')
    expect(out).toContain('/dashboard')
  })

  test('an alias route is asserted blocked too', () => {
    const blocked = runOver([report('https://www.eventlinqs.com.au/for-organisers', 0)])
    expect(blocked.status, blocked.out).toBe(0)
    const open = runOver([report('https://www.eventlinqs.com.au/for-organisers', 1)])
    expect(open.status).toBe(1)
    expect(open.out).toContain('A ALIAS ROUTE IS INDEXABLE')
  })

  /*
   * A templated discovery page is indexable exactly while it holds enough
   * events, and a Lighthouse report carries no event count, so this script
   * cannot tell a correct noindex from a broken one. It says so by name instead
   * of guessing; scripts/verify/indexing-drive.mjs asserts that half against a
   * running server, where the count is knowable.
   */
  test('a conditional discovery page is named as not-asserted-here, in either state', () => {
    const blocked = runOver([report('https://www.eventlinqs.com.au/community/african', 0), report('https://www.eventlinqs.com.au/', 1)])
    expect(blocked.status, blocked.out).toBe(0)
    expect(blocked.out).toContain('templated discovery page')
    expect(blocked.out).toContain('indexing-drive.mjs')
    expect(blocked.out).toContain('indexability asserted on 1 report(s), skipped on 1')

    const open = runOver([report('https://www.eventlinqs.com.au/community/african', 1), report('https://www.eventlinqs.com.au/', 1)])
    expect(open.status, open.out).toBe(0)
  })

  test('a preview that is indexable still fails, and an unknown host is still only noted', () => {
    const preview = runOver([report('https://eventlinqs-app-abc.vercel.app/', 1)])
    expect(preview.status).toBe(1)
    expect(preview.out).toContain('PREVIEW IS INDEXABLE AGAIN')

    const unknown = runOver([report('https://staging.example.org/', 1)])
    expect(unknown.status).toBe(1)
    expect(unknown.out).toContain('neither a *.vercel.app preview nor the canonical host')
  })
})
