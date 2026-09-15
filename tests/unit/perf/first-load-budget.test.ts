import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
// Plain .mjs modules with no type declarations, imported the way every other
// guard test in this suite imports one.
import { FEATURE_MARKERS, attribute, markerCoverage, UNATTRIBUTED } from '../../../scripts/perf/lib/chunk-attribution.mjs'
import { SCOPE_10_3_BUDGET_BYTES, readFirstLoad } from '../../../scripts/perf/lib/first-load.mjs'
import { audienceOf, audienceDisagreements, INTERNAL_PREFIXES } from '../../../scripts/perf/lib/route-audience.mjs'

/**
 * Close-out C8 EXECUTION METHOD, C8B.1/C8B.3/C8B.4.
 *
 * These tests hold the three decisions that are easy to get wrong later and
 * expensive to notice: what "public" means for a byte budget, that a marker
 * list cannot gain an undocumented entry, and that measuring nothing can never
 * read as a pass.
 */

const ROOT = join(__dirname, '..', '..', '..')
const BUDGET_FILE = join(ROOT, 'perf-budget.json')

describe('the Scope v5 10.3 budget', () => {
  it('is 200 KB, the number the scope itself states', () => {
    expect(SCOPE_10_3_BUDGET_BYTES).toBe(200 * 1024)
  })
})

describe('what a chunk serves', () => {
  it('names a chunk from a marker in its own bytes', () => {
    expect(attribute('...next-router-state-tree...')).toEqual(['Next.js App Router runtime'])
    expect(attribute('...ChunkLoadError...')).toEqual(['Turbopack chunk loader'])
  })

  it('returns unattributed rather than guessing', () => {
    expect(attribute('const a = 1')).toEqual([UNATTRIBUTED])
    expect(attribute('')).toEqual([UNATTRIBUTED])
  })

  it('lets a first-party fact from the build beat a regex', () => {
    // build-manifest.json NAMES the polyfill bundle. A string match is an
    // inference; the manifest is the build saying so.
    expect(attribute('...__reactContainer...', 'legacy polyfill bundle (noModule)')).toEqual([
      'legacy polyfill bundle (noModule)',
    ])
  })

  it('reports every feature a chunk carries, not just the first', () => {
    const both = attribute('__reactContainer and also NEXT_HTTP_ERROR_FALLBACK')
    expect(both).toContain('React DOM')
    expect(both).toContain('Next.js error boundaries')
  })

  it('every marker declares why it identifies that feature and whether it can be absent', () => {
    for (const marker of FEATURE_MARKERS) {
      expect(marker.feature, 'a marker with no feature name').toBeTruthy()
      expect(marker.why, `${marker.feature} does not say why its marker identifies it`).toBeTruthy()
      expect(
        typeof marker.alwaysPresent,
        `${marker.feature} does not declare alwaysPresent, so the guard cannot tell a dead marker from a feature that is simply not built here`,
      ).toBe('boolean')
      if (!marker.alwaysPresent) {
        expect(marker.absentWhen, `${marker.feature} is conditional and does not say when`).toBeTruthy()
      }
    }
  })
})

describe('a marker that matches nothing', () => {
  const bodies = ['__reactContainer', 'next-router-state-tree', 'resolved_model', 'NEXT_REDIRECT', 'NEXT_HTTP_ERROR_FALLBACK', 'ChunkLoadError']

  it('is DEAD when it claims the feature is always present', () => {
    // Every alwaysPresent marker is satisfied by the bodies above, so nothing
    // is dead. This is the green direction.
    expect(markerCoverage(bodies).dead).toEqual([])
  })

  it('is merely ABSENT, with a reason, when the feature is conditional', () => {
    const coverage = markerCoverage(bodies)
    expect(coverage.absent.length).toBeGreaterThan(0)
    for (const entry of coverage.absent) expect(entry).toMatch(/\(.+\)$/)
  })

  it('is DEAD when an always-present marker really does match nothing', () => {
    // This is the defect the clause was written for: three markers in the old
    // list matched zero chunks, and the 30.5 KB App Router runtime read
    // `unattributed` in the table that decides the work order.
    const withoutTheRouter = bodies.filter((b) => b !== 'next-router-state-tree')
    expect(markerCoverage(withoutTheRouter).dead).toContain('Next.js App Router runtime')
  })
})

describe('who a route is for', () => {
  it('calls the two consoles internal', () => {
    expect(audienceOf('/dashboard')).toBe('internal')
    expect(audienceOf('/dashboard/events/[id]/edit')).toBe('internal')
    expect(audienceOf('/admin/orders')).toBe('internal')
    expect(INTERNAL_PREFIXES).toEqual(['/dashboard', '/admin'])
  })

  it('calls every noindex BUYER page public, which the indexing policy would not have', () => {
    // The reason this module exists. `classifyRoute` returns `never` for all of
    // these, and a budget built on that reading would have exempted the exact
    // pages Scope 10.3 is about: a buyer on a phone on a bad connection.
    for (const route of [
      '/checkout/[reservation_id]',
      '/orders/[order_id]/confirmation',
      '/queue/[slug]',
      '/t/[code]',
      '/tickets',
      '/account/tickets',
      '/scan/[eventId]',
      '/login',
      '/signup',
    ]) {
      expect(audienceOf(route), `${route} must be judged against the public budget`).toBe('public')
    }
  })

  it('does not mistake a route that merely starts with the same letters', () => {
    expect(audienceOf('/administrators')).toBe('public')
    expect(audienceOf('/dashboards-are-great')).toBe('public')
  })

  it('reports a disagreement when a console route is not noindex', () => {
    const routes = ['/dashboard/events', '/events/[slug]']
    expect(audienceDisagreements(routes, { '/dashboard/events': 'never', '/events/[slug]': 'always' })).toEqual([])
    expect(audienceDisagreements(routes, { '/dashboard/events': 'always', '/events/[slug]': 'always' })).toHaveLength(1)
    expect(audienceDisagreements(routes, { '/events/[slug]': 'always' })[0]).toContain('unclassified')
  })
})

describe('measuring nothing can never read as a pass', () => {
  it('throws when the build diagnostic is absent rather than reporting zero routes', () => {
    expect(() => readFirstLoad(join(ROOT, 'tests'))).toThrow(/route-bundle-stats\.json is not present/)
  })
})

describe('perf-budget.json, the recorded marks', () => {
  it('exists, because the guard is registered and blocking without it', () => {
    expect(existsSync(BUDGET_FILE)).toBe(true)
  })

  const budget = existsSync(BUDGET_FILE) ? JSON.parse(readFileSync(BUDGET_FILE, 'utf8')) : { marks: {} }

  it('states the same budget the code does', () => {
    expect(budget._budgetBytes).toBe(SCOPE_10_3_BUDGET_BYTES)
  })

  it('records a positive byte count for every route it names', () => {
    const marks = Object.entries(budget.marks as Record<string, unknown>)
    expect(marks.length).toBeGreaterThan(100)
    for (const [route, mark] of marks) {
      expect(Number.isInteger(mark), `${route} has a mark that is not a byte count`).toBe(true)
      expect(mark as number, `${route} has a non-positive mark`).toBeGreaterThan(0)
    }
  })

  it('has no PUBLIC route above the Scope budget that is not registered', () => {
    // The clause the guard enforces on the build output, held here as well so a
    // regression is visible in the suite and not only after a build. If this
    // goes red, a buyer-facing page has crossed 200 KB of first-load JS with
    // nobody writing down why.
    const register = (budget.overBudget ?? {}) as Record<string, { since?: string; why?: string; fix?: string }>
    const unregistered = Object.entries(budget.marks as Record<string, number>)
      .filter(([route, mark]) => audienceOf(route) === 'public' && mark > SCOPE_10_3_BUDGET_BYTES && !register[route])
      .map(([route, mark]) => `${route} ${(mark / 1024).toFixed(1)} KB`)
    expect(unregistered).toEqual([])
  })

  it('dates and explains every registered breach, and registers nothing that is under budget', () => {
    const register = (budget.overBudget ?? {}) as Record<string, { since?: string; why?: string; fix?: string }>
    const marks = budget.marks as Record<string, number>
    for (const [route, entry] of Object.entries(register)) {
      expect(marks[route], `${route} is registered over budget but has no mark`).toBeGreaterThan(SCOPE_10_3_BUDGET_BYTES)
      expect(entry.since, `${route} has no date`).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(entry.why, `${route} does not say why`).toBeTruthy()
      expect(entry.fix, `${route} does not say what would fix it`).toBeTruthy()
    }
  })
})
