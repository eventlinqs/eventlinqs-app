/**
 * THE LIGHTHOUSE GATE MUST AUDIT THE SAME PAGES EVERY RUN.
 *
 * THE DEFECT THIS FILE WAS WRITTEN FOR (founder ruling, 24 August 2026).
 * scripts/ci/resolve-gate-urls.mjs discovered the event-detail page by taking
 * the FIRST /events/<slug> in the preview sitemap, and the sitemap query
 * carried no ORDER BY, so "first" was whatever Postgres returned that day.
 * Two consecutive gate runs on the same branch audited different pages:
 *
 *   135be599  /events/seat-proof-fifty-nwltxi   0.83, 0.75, 0.73  PASS
 *   8044480b  /events/cat-indie-sounds-...      0.74, 0.73, 0.73  FAIL
 *
 * Nothing about event-page performance changed between them. The category
 * floor aggregates 'optimistic' (best of three), so 0.83 cleared the 0.80
 * floor and 0.74 did not. A gate whose verdict depends on which page it
 * happened to pick is a coin toss, and it blocked two merges.
 *
 * WHAT IS ASSERTED HERE: the selection is a PURE FUNCTION of the sorted slug
 * list, so the same sitemap always yields the same URL set; the ends of the
 * catalogue are always included, so the sample cannot silently collapse onto
 * one lucky page; and the gate audits MORE event pages than before, never
 * fewer. That last one is a floor, not a detail: the cheap way to make this
 * gate green is to audit one fast page, and this test exists to forbid it.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { representativeSpread } from '../../../scripts/ci/resolve-gate-urls.mjs'

const REPO_ROOT = process.cwd()
const RESOLVER = join(REPO_ROOT, 'scripts/ci/resolve-gate-urls.mjs')

describe('the audited page set is a pure function of the sitemap', () => {
  const slugs = ['delta', 'alpha', 'charlie', 'echo', 'bravo', 'foxtrot']

  it('is stable across repeated calls on identical input', () => {
    const sorted = [...slugs].sort()
    const a = representativeSpread(sorted, 3)
    const b = representativeSpread(sorted, 3)
    const c = representativeSpread([...sorted], 3)
    expect(a).toEqual(b)
    expect(a).toEqual(c)
  })

  it('does NOT depend on the order the sitemap happened to list them in', () => {
    // This is the whole defect in one assertion: the same set of events,
    // delivered in a different order, must produce the same audited pages.
    const asShipped = [...slugs].sort()
    const shuffled = ['foxtrot', 'bravo', 'delta', 'alpha', 'echo', 'charlie'].sort()
    expect(representativeSpread(shuffled, 3)).toEqual(representativeSpread(asShipped, 3))
  })

  it('always includes the first and last of the sorted catalogue', () => {
    const sorted = [...slugs].sort()
    const picked = representativeSpread(sorted, 3)
    expect(picked[0]).toBe(sorted[0])
    expect(picked[picked.length - 1]).toBe(sorted[sorted.length - 1])
  })

  it('returns everything when the catalogue is smaller than the sample', () => {
    expect(representativeSpread(['only-one'], 3)).toEqual(['only-one'])
    expect(representativeSpread([], 3)).toEqual([])
  })

  it('never returns a duplicate', () => {
    const picked = representativeSpread(['a', 'b'], 3)
    expect(new Set(picked).size).toBe(picked.length)
  })

  it('negative control: taking the head is NOT stable, which is what shipped', () => {
    // Proves the assertions above measure something real. `head` is the old
    // behaviour: same events, different order, different audited page.
    const head = (list: string[]) => list.slice(0, 1)
    const orderA = ['cat-indie-sounds', 'seat-proof-fifty']
    const orderB = ['seat-proof-fifty', 'cat-indie-sounds']
    expect(head(orderA)).not.toEqual(head(orderB))
    // ...whereas the real selector is indifferent to that ordering.
    expect(representativeSpread([...orderA].sort(), 1)).toEqual(
      representativeSpread([...orderB].sort(), 1),
    )
  })
})

describe('the gate is not quietly narrowed to make it pass', () => {
  const source = readFileSync(RESOLVER, 'utf8')

  it('audits more than one event-detail page', () => {
    const m = source.match(/EVENT_DETAIL_SAMPLES\s*=\s*(\d+)/)
    expect(m, 'EVENT_DETAIL_SAMPLES is gone').not.toBeNull()
    expect(Number(m![1])).toBeGreaterThanOrEqual(3)
  })

  it('sorts before selecting, which is the line that makes it repeatable', () => {
    expect(source).toMatch(/slugs\.sort\(\)/)
  })

  it('still audits the full public surface, not a fast subset', () => {
    // The static set is the parity floor. If a future pass wants to drop a
    // slow page from the gate, it has to delete a line here and explain why.
    for (const path of [
      "'/'",
      "'/events'",
      "'/events/browse/melbourne'",
      "'/community/african'",
      "'/organisers'",
      "'/pricing'",
      "'/help'",
      "'/legal/terms'",
      "'/login'",
      "'/signup'",
    ]) {
      expect(source, `${path} was dropped from the gate`).toContain(path)
    }
  })
})

describe('the sitemap the gate reads is itself ordered', () => {
  it('every paged sitemap query declares an explicit order', () => {
    // The resolver sorts defensively, but the sitemap is a PUBLISHED artefact
    // and its order should be a property of the data rather than of Postgres'
    // physical row order. Both halves are held so neither can quietly rot.
    const sitemap = readFileSync(join(REPO_ROOT, 'src/app/sitemap.ts'), 'utf8')
    const limits = (sitemap.match(/\.limit\(5000\)/g) ?? []).length
    const orders = (sitemap.match(/\.order\('slug', \{ ascending: true \}\)/g) ?? []).length
    expect(limits).toBeGreaterThan(0)
    expect(orders).toBe(limits)
  })
})
