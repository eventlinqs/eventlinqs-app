/**
 * THE LIGHTHOUSE GATE MUST AUDIT THE SAME PAGES EVERY RUN.
 *
 * THE FIRST DEFECT (founder ruling, 24 August 2026). The resolver took the
 * FIRST /events/<slug> in the preview sitemap, and the sitemap query carried no
 * ORDER BY, so "first" was whatever Postgres returned that day. Two consecutive
 * runs on the same branch audited different pages:
 *
 *   135be599  /events/seat-proof-fifty-nwltxi   0.83, 0.75, 0.73  PASS
 *   8044480b  /events/cat-indie-sounds-...      0.74, 0.73, 0.73  FAIL
 *
 * That pass sorted the slugs and took first/middle/last, which made the choice
 * a pure function of the sitemap.
 *
 * THE SECOND DEFECT, AND WHY THIS FILE CHANGED (25 August 2026). A pure
 * function of a MOVING INPUT is still a moving output. The sitemap is the live
 * catalogue: publish one event and "middle" is a different page. On 25 August
 * the gate landed on /events/arena-sessions-large-room-performance-test, a
 * 1,200 seat arena chart, scored 0.75/0.74/0.77 against a 0.80 floor, and
 * blocked the merge. Nothing about the code had changed.
 *
 * The audited set is now a FIXED, REVIEWED LIST in lighthouse-gate-urls.json,
 * in version control, each entry carrying the reason it is there, verified to
 * answer 200 before it is audited and failing LOUDLY when one does not.
 *
 * WHAT IS ASSERTED HERE: the set is pinned and readable; it is not narrowed
 * (three event pages, the heaviest first); the full public surface is still
 * audited; a missing page fails rather than being substituted; and the sitemap
 * the resolver reports from is itself ordered.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { readPinnedSet, orderedPaths } from '../../../scripts/ci/resolve-gate-urls.mjs'

const REPO_ROOT = process.cwd()
const RESOLVER = join(REPO_ROOT, 'scripts/ci/resolve-gate-urls.mjs')

describe('the audited page set is pinned, not discovered', () => {
  const { parsed, paths } = readPinnedSet(REPO_ROOT)

  it('is identical on every read, because it is a file rather than a query', () => {
    const a = orderedPaths(readPinnedSet(REPO_ROOT).parsed)
    const b = orderedPaths(readPinnedSet(REPO_ROOT).parsed)
    expect(a).toEqual(b)
  })

  it('every entry says why it is in the set', () => {
    for (const e of [...(parsed.static ?? []), ...(parsed.eventDetail ?? [])]) {
      expect(typeof e.why, `${e.path} carries no reason`).toBe('string')
      expect(e.why.length, `${e.path} carries an empty reason`).toBeGreaterThan(20)
    }
  })

  it('every path is a leading-slash path, never an absolute URL', () => {
    // An absolute URL here would pin the gate to one host and quietly stop
    // measuring the preview for the commit under test.
    for (const p of paths) {
      expect(p.startsWith('/'), `${p} is not a path`).toBe(true)
      expect(p.startsWith('//'), `${p} looks like a protocol-relative URL`).toBe(false)
    }
  })

  it('negative control: a set that named the same path twice would be caught', () => {
    // Proves the shape assertions above measure something. Duplicates would
    // triple the runtime of one page and misreport the coverage.
    expect(new Set(paths).size).toBe(paths.length)
  })
})

describe('the gate is not quietly narrowed to make it pass', () => {
  const { parsed } = readPinnedSet(REPO_ROOT)
  const source = readFileSync(RESOLVER, 'utf8')
  const raw = readFileSync(join(REPO_ROOT, 'lighthouse-gate-urls.json'), 'utf8')

  it('audits at least three event-detail pages', () => {
    expect((parsed.eventDetail ?? []).length).toBeGreaterThanOrEqual(3)
  })

  it('keeps the heaviest page on the platform in the set', () => {
    // The 1,200 seat arena chart is the page that failed on 25 August 2026.
    // Dropping it is the cheapest way to make this gate green and it is the
    // exact move the founder forbade: "Do not narrow it to the fastest page to
    // pass; if anything widen it."
    const paths = (parsed.eventDetail ?? []).map((e: { path: string }) => e.path)
    expect(paths).toContain('/events/arena-sessions-large-room-performance-test')
  })

  it('still audits the full public surface, not a fast subset', () => {
    const statics = (parsed.static ?? []).map((e: { path: string }) => e.path)
    for (const path of [
      '/',
      '/events',
      '/events/browse/melbourne',
      '/community/african',
      '/organisers',
      '/pricing',
      '/help',
      '/legal/terms',
      '/login',
      '/signup',
    ]) {
      expect(statics, `${path} was dropped from the gate`).toContain(path)
    }
  })

  it('fails rather than substituting when a pinned page stops resolving', () => {
    // A silent substitution is how this gate became a coin toss. The resolver
    // must exit non-zero and name the path.
    expect(source).toMatch(/pinned path\(s\) do not answer 200/)
    expect(source).toMatch(/process\.exit\(1\)/)
  })

  it('verifies before auditing, so a 404 can never hard-fail the LHCI collect', () => {
    expect(source).toMatch(/verifying every pinned path answers 200/)
  })

  it('the pinned file records why the set is pinned at all', () => {
    expect(raw).toMatch(/arena-sessions-large-room-performance-test/)
    expect(raw).toMatch(/_notNarrowed/)
  })
})

describe('the sitemap the gate reads is itself ordered', () => {
  it('every paged sitemap query declares an explicit order', () => {
    // The resolver sorts defensively, but the sitemap is a PUBLISHED artefact
    // and its order should be a property of the data rather than of Postgres'
    // physical row order. Both halves are held so neither can quietly rot.
    //
    // WHY THIS COUNTS CHAINS RATHER THAN THE LITERAL `.order('slug', ...)`. It
    // used to, and it went red the moment a query legitimately ordered by
    // something else: the venue block orders by `venue_name`, because venues have
    // no slug column and the handle is derived from the name. Pinning the column
    // name asserted a coincidence rather than the rule, and the rule is "a paged
    // query is ordered", not "a paged query is ordered by slug".
    const sitemap = readFileSync(join(REPO_ROOT, 'src/app/sitemap.ts'), 'utf8')
    const chains = [...sitemap.matchAll(/\.from\('(\w+)'\)([\s\S]{0,900}?)(?=\n\s*(?:if|for|\}|const)\s)/g)]
    const paged = chains.filter(c => /\.limit\(\d+\)/.test(c[2]))
    expect(paged.length).toBeGreaterThan(0)
    for (const c of paged) {
      expect(
        /\.order\(\s*'[a-z_]+'\s*,\s*\{\s*ascending:/.test(c[2]),
        `the sitemap's paged query on '${c[1]}' has a .limit() and no explicit .order()`,
      ).toBe(true)
    }
  })
})
