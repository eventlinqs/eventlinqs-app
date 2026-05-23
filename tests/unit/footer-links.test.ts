// Footer link integrity test.
//
// Closes AUDIT-FUNCTIONALITY-2026-05-23.md HIGH-2: footer + homepage
// rail links were emitting URL params the /events search-params parser
// does not recognise (`?when=this-week`, `?price=free`, `?view=cities`
// etc.), so clicking them silently fell through to the unfiltered
// events grid.
//
// This test enforces that every /events?... href emitted by the
// footer's link arrays produces a parser-recognised active filter,
// sort, or non-default view. A future link with an unrecognised param
// fails this test before it ships.
//
// The parser at src/lib/events/search-params.ts is the source of
// truth; the test calls it directly.

import { describe, expect, test } from 'vitest'
import {
  COMPANY,
  CULTURES,
  DISCOVER,
  FOR_ORGANISERS,
  LEGAL,
} from '@/components/layout/site-footer'
import {
  hasActiveFilters,
  parseEventsSearchParams,
  type EventsSearchParams,
} from '@/lib/events/search-params'

interface FooterLink {
  label: string
  href: string
}

const ALL_ARRAYS: { name: string; items: ReadonlyArray<FooterLink> }[] = [
  { name: 'DISCOVER', items: DISCOVER },
  { name: 'CULTURES', items: CULTURES },
  { name: 'FOR_ORGANISERS', items: FOR_ORGANISERS },
  { name: 'COMPANY', items: COMPANY },
  { name: 'LEGAL', items: LEGAL },
]

function queryStringToParams(qs: string): EventsSearchParams {
  const out: Record<string, string> = {}
  for (const [k, v] of new URLSearchParams(qs).entries()) out[k] = v
  return out as EventsSearchParams
}

describe('site-footer link integrity', () => {
  for (const arr of ALL_ARRAYS) {
    for (const link of arr.items) {
      test(`[${arr.name}] "${link.label}" -> ${link.href}`, () => {
        // Parse the href; relative paths need a base.
        const url = new URL(link.href, 'http://localhost')
        const path = url.pathname
        const search = url.search.replace(/^\?/, '')

        // Every link must be a same-origin absolute path.
        expect(path.startsWith('/'), `href must be a same-origin path, got "${link.href}"`).toBe(true)

        // /events?... links must produce a parser-recognised effect.
        if (path === '/events' && search) {
          const raw = queryStringToParams(search)
          const parsed = parseEventsSearchParams(raw)
          const hasFilter = hasActiveFilters(parsed.filters)
          const hasSort = parsed.filters.sort !== undefined
          const hasView = parsed.view !== 'grid'

          expect(
            hasFilter || hasSort || hasView,
            `Footer link [${arr.name}] "${link.label}" emits ${link.href} but ` +
              `the search-params parser produces no active filter, sort, or non-default view. ` +
              `Raw query: ${JSON.stringify(raw)} -> parsed filters: ${JSON.stringify(parsed.filters)}, ` +
              `view: ${parsed.view}. Update the href to use a parser-accepted param name ` +
              `(see src/lib/events/search-params.ts: PRESETS, SORTS, VIEWS).`,
          ).toBe(true)
        }
        // Non-/events paths (e.g. /cities, /culture/african, /legal/...)
        // are real routes; their existence is verified by Next.js build
        // (every page.tsx under src/app/** is enumerated), not here.
      })
    }
  }

  test('DISCOVER "By city" routes to the dedicated /cities page, not /events', () => {
    const byCity = DISCOVER.find(l => l.label === 'By city')
    expect(byCity?.href, '"By city" should route to /cities, not /events?view=cities').toBe('/cities')
  })

  test('DISCOVER "By culture" routes to the dedicated /cultures page, not /events', () => {
    const byCulture = DISCOVER.find(l => l.label === 'By culture')
    expect(byCulture?.href, '"By culture" should route to /cultures, not /events?view=cultures').toBe('/cultures')
  })
})

// Homepage rail "View all" hrefs (src/app/page.tsx) are inline JSX
// strings, not exportable arrays. Their parser-recognised correctness
// is pinned here by parsing each href the rails are known to emit.
// Update this list when adding/changing a rail viewAllHref.
const HOMEPAGE_RAIL_HREFS: ReadonlyArray<{ rail: string; href: string }> = [
  { rail: 'This Weekend',  href: '/events?preset=weekend' },
  { rail: 'Free events',   href: '/events?preset=free' },
  { rail: 'Trending now',  href: '/events?sort=popularity' },
  { rail: 'Just added',    href: '/events?sort=date_asc' },
  { rail: "Editor's picks",href: '/events' },
  { rail: 'Community',     href: '/events?category=community' },
]

describe('homepage rail viewAllHref integrity', () => {
  for (const { rail, href } of HOMEPAGE_RAIL_HREFS) {
    test(`Rail "${rail}" -> ${href}`, () => {
      const url = new URL(href, 'http://localhost')
      const path = url.pathname
      const search = url.search.replace(/^\?/, '')

      expect(path).toBe('/events')

      // Plain /events (no params) is a legitimate "view all" - the
      // Editor's Picks rail uses it because the parser has no
      // `curated`/editor concept. Skip the parser assertion for that
      // case; the path-only test above already covered it.
      if (!search) return

      const raw = queryStringToParams(search)
      const parsed = parseEventsSearchParams(raw)
      const hasFilter = hasActiveFilters(parsed.filters)
      const hasSort = parsed.filters.sort !== undefined
      const hasView = parsed.view !== 'grid'

      expect(
        hasFilter || hasSort || hasView,
        `Rail "${rail}" viewAllHref ${href} does not produce a parser-recognised effect. ` +
          `Raw: ${JSON.stringify(raw)} -> parsed: ${JSON.stringify(parsed)}.`,
      ).toBe(true)
    })
  }
})
