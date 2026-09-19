/**
 * THE DISCOVERY LAYER IS INDEXABLE, AND THE SITEMAP SAYS THE SAME THING.
 *
 * ============================================================================
 * WHAT THIS FILE HOLDS, AND WHY IT IS ONE FILE
 * ============================================================================
 *
 * Close-out SEO3 names nine tests by name. They are here together because they
 * are one invariant asked from nine directions: the page's robots directive and
 * the sitemap's decision to publish a URL are two readings of ONE number, and
 * every defect the audit of 13 September 2026 found was those two readings
 * disagreeing, or one of them never being taken at all.
 *
 *   - 46 discovery pages carried an UNCONDITIONAL noindex, so a city full of
 *     events stayed invisible for ever.
 *   - 22 categories existed only as `/events?category=<slug>`, which
 *     canonicalises to `/events`, so no category could rank for its own term.
 *   - `/organisers/oanh` was published to Google holding no events and no
 *     biography.
 *
 * THE SITEMAP IS GENERATED, NOT PARSED. The two sitemap tests call the real
 * `src/app/sitemap.ts` against a fixture catalogue and count what comes back. A
 * test that read the source for the word "isDiscoveryIndexable" would have been
 * green on the day the category block was missing entirely, because the gate it
 * was looking for was present in six other blocks.
 *
 * WHAT IS STUBBED AND WHAT IS REAL. The DATA is stubbed: one public client
 * serving the dimension rows and the taxonomy, one admin client serving the
 * events, organisations and venues, one threshold. Every DECISION is real: the
 * live matchers, the live count functions, the live indexing policy, the live
 * community, faith, city, suburb, guide and help tables. Stubbing a decision
 * would make the test agree with itself.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'

/* ========================================================== the fixture state */

interface RawRow {
  tags: string[]
  venue_city: string | null
  suburb_primary: string | null
  venue_latitude: number | null
  venue_longitude: number | null
  organisation_id: string | null
  category: { slug: string } | null
}

const state = vi.hoisted(() => ({
  /** What `loadDiscoveryRows` sees: the dimension columns of every live event. */
  discovery: [] as unknown[],
  /** What `public.event_categories` holds. */
  categories: [] as Array<{ slug: string; name: string; sort_order: number }>,
  /** What the admin client serves per table. */
  events: [] as Array<Record<string, unknown>>,
  organisations: [] as Array<Record<string, unknown>>,
  /**
   * What the WEEKEND query sees.
   *
   * The stub cannot read a predicate, so every events query would otherwise get
   * `state.events` and `/this-weekend` would be published whenever the platform
   * held any event at all, which is not the rule and would make this test agree
   * with itself. The weekend query is the only events read in the sitemap that
   * bounds `start_date`, so the chain below swaps to this list the moment it
   * sees that bound. The two lists are therefore independent: an event can be in
   * the catalogue and not on this weekend, which is the ordinary case.
   */
  weekend: [] as Array<Record<string, unknown>>,
  /** The owner's live indexing threshold. */
  threshold: 1,
}))

/**
 * A supabase query builder: every filter returns itself, and it is awaitable.
 *
 * `.order()` IS HONOURED, and that is not decoration. The category taxonomy gets
 * its order from PostgREST (`.order('sort_order')`), like every other ordered
 * read in this codebase, so a stub that ignored it would let the module drop the
 * clause without a test noticing and leave the sibling strip and the sitemap in
 * whatever order the storage engine happened to return. That is the same defect
 * class the sitemap's own events query carries a comment about.
 */
function chain(rows: unknown[], weekendRows?: unknown[]) {
  let out = rows
  const self: Record<string, unknown> = {}
  for (const method of ['select', 'match', 'not', 'eq', 'in', 'or', 'limit', 'lte', 'is', 'range']) {
    self[method] = () => self
  }
  /*
   * `.gte('start_date', ...)` IS THE WEEKEND QUERY AND NOTHING ELSE.
   *
   * Every other events read in the sitemap bounds nothing on start_date: the
   * event catalogue orders by slug, the venue and organiser reads project other
   * columns, and the listing window arrives as `.or(...)` rather than a bound.
   * So this one filter is enough to tell the two apart without teaching the stub
   * to parse PostgREST.
   */
  self.gte = (column: string) => {
    if (column === 'start_date' && weekendRows) out = weekendRows
    return self
  }
  self.order = (column: string, opts?: { ascending?: boolean }) => {
    const dir = opts?.ascending === false ? -1 : 1
    out = [...out].sort((a, b) => {
      const x = (a as Record<string, unknown>)[column]
      const y = (b as Record<string, unknown>)[column]
      if (typeof x === 'number' && typeof y === 'number') return (x - y) * dir
      return String(x).localeCompare(String(y)) * dir
    })
    return self
  }
  // `count` is served because `fetchPublicEvents` asks for `{ count: 'exact' }`
  // and decides the weekend surface's indexability from it. Every other reader
  // ignores the field.
  self.then = (resolve: (v: unknown) => unknown) => resolve({ data: out, error: null, count: out.length })
  return self
}

vi.mock('next/cache', () => ({
  unstable_cache: (fn: (...a: unknown[]) => unknown) => fn,
  revalidateTag: vi.fn(),
  revalidatePath: vi.fn(),
}))

vi.mock('@/lib/supabase/public-client', () => ({
  createPublicClient: () => ({
    from: (table: string) => chain(table === 'event_categories' ? state.categories : state.discovery),
  }),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) =>
      table === 'organisations'
        ? chain(state.organisations)
        : chain(state.events, state.weekend),
  }),
}))

/*
 * THE THRESHOLD, STUBBED AT THE RESOLVER AND NOWHERE ELSE. The functions below
 * are the real policy functions reading one stubbed number, so a test that moves
 * the threshold moves the page and the sitemap together, exactly as the owner's
 * setting does.
 */
vi.mock('@/lib/seo/discovery-threshold', async () => {
  const policy = await import('@/lib/seo/indexing-policy')
  return {
    resolveDiscoveryThreshold: async () => state.threshold,
    resetDiscoveryThresholdCache: () => {},
    discoveryIndexingFor: async (count: number, path: string) =>
      policy.discoveryIndexing(count, path, state.threshold),
    organiserIndexingFor: async (count: number, bio: boolean, path: string) =>
      policy.organiserIndexing(count, bio, path, state.threshold),
  }
})

/** Artists are flag gated; off keeps the generated set deterministic. */
vi.mock('@/lib/flags/broadcast', () => ({ isFeatureEnabled: async () => false }))

vi.mock('@/lib/site-url', () => ({ getSiteUrl: () => 'https://example.test' }))

/*
 * THE SHARED CHROME IS NOT WHAT THIS FILE IS ABOUT, AND IT CANNOT BE RENDERED
 * HERE ANYWAY. `PageShell` renders `SiteHeader`, which reads cookies and
 * suspends, and `renderToStaticMarkup` is synchronous by definition, so the
 * whole tree throws before a single tag of the category page is produced.
 *
 * Replacing the shell with a passthrough leaves EVERY line the category template
 * itself emits under test, which is the h1, the story, the grid, the sibling
 * strip and the closer. The header and the footer are a different surface with
 * their own tests (tests/unit/footer-links.test.ts,
 * tests/unit/site-header-cookie-snapshot.test.ts), and this file asserting them
 * a second time would prove nothing and break on every chrome change.
 */
vi.mock('@/components/layout/PageShell', () => ({
  PageShell: ({ children }: { children: unknown }) => children,
}))

/*
 * The picker city list merges 32 curated launch targets with every distinct
 * venue_city in the catalogue. Both the generator and this file's own
 * expectation read THIS list, so stubbing it makes the arithmetic below
 * checkable by hand without weakening a single decision under test.
 */
vi.mock('@/lib/locations/picker-cities', () => ({
  getPickerCities: async () => ({
    australia: [
      { city: 'Melbourne', slug: 'melbourne', country: 'Australia', countryCode: 'AU', latitude: null, longitude: null, isLaunchCity: true },
      { city: 'Perth', slug: 'perth', country: 'Australia', countryCode: 'AU', latitude: null, longitude: null, isLaunchCity: true },
    ],
    internationalByCountry: [],
    validSlugs: ['melbourne', 'perth'],
  }),
}))

/* ============================================================ the real tables */

import {
  discoveryIndexing,
  isDiscoveryIndexable,
  isOrganiserProfileIndexable,
  organiserIndexing,
} from '@/lib/seo/indexing-policy'
import { getCommunityTags } from '@/lib/communities/tag-bridge'
import { getFaithTags, type FaithSlug } from '@/lib/faiths/data'
import { CATEGORY_EDITORIAL } from '@/lib/categories/category-editorial'
import type { CommunitySlug } from '@/lib/communities/data'

/** One live event, in Melbourne by default. */
function row(over: Partial<RawRow> = {}): RawRow {
  return {
    tags: [],
    venue_city: 'Melbourne',
    suburb_primary: null,
    venue_latitude: null,
    venue_longitude: null,
    organisation_id: null,
    category: null,
    ...over,
  }
}

beforeEach(() => {
  state.discovery = []
  state.categories = []
  state.events = []
  state.organisations = []
  state.threshold = 1
  vi.resetModules()
})

/* ======================================================================== */
/* THE FOUR TEMPLATED FAMILIES                                              */
/* ======================================================================== */

describe('a templated discovery page is indexable on substance, never on existence', () => {
  test('city_page_with_zero_events_is_noindex', () => {
    const meta = discoveryIndexing(0, '/city/melbourne', 1)
    expect(meta.robots.index).toBe(false)
    expect(meta.robots.follow).toBe(true)
    expect(meta.robots.googleBot.index).toBe(false)
    // SELF-CANONICAL EVEN WHEN NOINDEX. The URL is its own page whether or not
    // anything is on it; pointing its canonical elsewhere is how 57 pages came
    // to claim the homepage as their canonical (close-out C19).
    expect(meta.alternates.canonical).toBe('/city/melbourne')
  })

  test('city_page_at_threshold_is_indexable', async () => {
    state.discovery = [row()]
    const { loadDiscoveryRows, countCity } = await import('@/lib/seo/discovery-counts')
    const count = countCity(await loadDiscoveryRows(), 'Melbourne')

    expect(count).toBe(1)
    expect(discoveryIndexing(count, '/city/melbourne', 1).robots.index).toBe(true)
    // AT the threshold, not merely above it, and below it it is still noindex.
    expect(isDiscoveryIndexable(1, 1)).toBe(true)
    expect(isDiscoveryIndexable(0, 1)).toBe(false)
    // The owner raising the number takes the same page back out, which is the
    // reversal condition SEO3 writes down.
    expect(discoveryIndexing(count, '/city/melbourne', 5).robots.index).toBe(false)
  })

  test('community_page_follows_the_same_rule', async () => {
    const tag = getCommunityTags('african')[0]
    expect(typeof tag).toBe('string')

    state.discovery = [row({ tags: [tag] })]
    const { loadDiscoveryRows, countCommunity } = await import('@/lib/seo/discovery-counts')
    const rows = await loadDiscoveryRows()

    expect(discoveryIndexing(countCommunity(rows, 'african'), '/community/african', 1).robots.index).toBe(true)
    // A community nothing is tagged for stays noindex on the same rows.
    expect(discoveryIndexing(countCommunity(rows, 'greek'), '/community/greek', 1).robots.index).toBe(false)
  })

  test('faith_page_follows_the_same_rule', async () => {
    const tag = getFaithTags('christian')[0]
    expect(typeof tag).toBe('string')

    state.discovery = [row({ tags: [tag] })]
    const { loadDiscoveryRows, countFaith } = await import('@/lib/seo/discovery-counts')
    const rows = await loadDiscoveryRows()

    expect(discoveryIndexing(countFaith(rows, 'christian'), '/faith/christian', 1).robots.index).toBe(true)
    expect(discoveryIndexing(countFaith(rows, 'muslim'), '/faith/muslim', 1).robots.index).toBe(false)
  })
})

/* ======================================================================== */
/* THE CATEGORY PAGES                                                       */
/* ======================================================================== */

describe('a category is a page of its own, not a filter on another page', () => {
  test('category_page_has_its_own_canonical_title_and_h1', async () => {
    state.categories = [
      { slug: 'comedy', name: 'Comedy', sort_order: 9 },
      { slug: 'music', name: 'Music', sort_order: 1 },
    ]
    state.discovery = [row({ category: { slug: 'comedy' } })]

    const { generateMetadata } = await import('@/app/categories/[slug]/page')
    const comedy = await generateMetadata({ params: Promise.resolve({ slug: 'comedy' }) })
    const music = await generateMetadata({ params: Promise.resolve({ slug: 'music' }) })

    // ITS OWN CANONICAL. `/events?category=comedy` canonicalised to `/events`,
    // which is the whole reason no category could ever rank for its own term.
    expect(comedy.alternates?.canonical).toBe('/categories/comedy')
    expect(music.alternates?.canonical).toBe('/categories/music')

    // ITS OWN TITLE AND DESCRIPTION, written, never templated from the name.
    const comedyEditorial = CATEGORY_EDITORIAL.find(c => c.slug === 'comedy')!
    expect(comedy.title).toBe(comedyEditorial.metaTitle)
    expect(comedy.title).not.toBe(music.title)
    expect(comedy.description).not.toBe(music.description)

    // AND THE SAME SUBSTANCE RULE. Comedy holds the one event; music holds none.
    expect(comedy.robots).toMatchObject({ index: true, follow: true })
    expect(music.robots).toMatchObject({ index: false, follow: true })

    // ITS OWN H1, rendered, taken from the editorial and not from the row name.
    const { CategoryEventsLandingPage } = await import('@/components/templates/CategoryEventsLandingPage')
    const html = renderToStaticMarkup(
      createElement(CategoryEventsLandingPage, {
        name: 'Comedy',
        editorial: comedyEditorial,
        heroImage: null,
        events: [],
        siblings: [{ slug: 'music', name: 'Music' }],
      }),
    )
    const h1 = /<h1[^>]*>([\s\S]*?)<\/h1>/.exec(html)
    expect(h1).not.toBeNull()
    expect(h1![1].replace(/<[^>]*>/g, '')).toContain(comedyEditorial.h1)
    // The sibling strip links the real page, never the query string it replaced.
    expect(html).toContain('href="/categories/music"')
    expect(html).not.toContain('/events?category=')
  })

  test('category_list_is_read_from_taxonomy_not_a_literal', async () => {
    // THE PROOF IS THAT THE ANSWER MOVES WITH THE TABLE. A literal list cannot
    // shrink because a row was deleted, and cannot reorder because sort_order
    // changed. Both are asserted against the same module in one test.
    state.categories = [
      { slug: 'music', name: 'Music', sort_order: 2 },
      { slug: 'comedy', name: 'Comedy', sort_order: 1 },
    ]
    const two = await (await import('@/lib/categories/taxonomy')).getPublishableCategories()
    expect(two.map(c => c.slug)).toEqual(['comedy', 'music'])

    vi.resetModules()
    state.categories = [{ slug: 'music', name: 'Music', sort_order: 2 }]
    const fewer = await (await import('@/lib/categories/taxonomy')).getPublishableCategories()
    expect(fewer.map(c => c.slug)).toEqual(['music'])

    // A ROW WITH NO WRITTEN EDITORIAL IS NOT A PAGE. The alternative is a page
    // that derives its copy from its own name, which is the generic template
    // Law 1 refuses and the duplicate Google collapses. The build refuses the
    // state as well (scripts/guards/discovery-indexability.mjs); this is the
    // runtime half, so a row added between two deployments degrades to "not a
    // page yet" rather than to "a generic page".
    vi.resetModules()
    state.categories = [
      { slug: 'music', name: 'Music', sort_order: 1 },
      { slug: 'lane-c-unwritten', name: 'Unwritten', sort_order: 2 },
    ]
    const written = await (await import('@/lib/categories/taxonomy')).getPublishableCategories()
    expect(written.map(c => c.slug)).toEqual(['music'])
  })
})

/* ======================================================================== */
/* THE ORGANISER PROFILES                                                   */
/* ======================================================================== */

describe('an organiser profile is indexable on substance', () => {
  test('organiser_with_zero_events_is_noindex', () => {
    // The audit of 13 September 2026 named /organisers/oanh: active, no events
    // on sale, no biography. A name and a logo is not a page.
    expect(isOrganiserProfileIndexable(0, false, 1)).toBe(false)
    expect(organiserIndexing(0, false, '/organisers/oanh', 1).robots.index).toBe(false)

    // EITHER kind of substance is enough, and the two are kept distinguishable
    // rather than collapsed into one nudged count.
    expect(isOrganiserProfileIndexable(1, false, 1)).toBe(true)
    expect(isOrganiserProfileIndexable(0, true, 1)).toBe(true)

    // Still self-canonical while noindex, like every conditional page.
    expect(organiserIndexing(0, false, '/organisers/oanh', 1).alternates.canonical).toBe('/organisers/oanh')
  })
})

/* ======================================================================== */
/* THE SITEMAP                                                              */
/* ======================================================================== */

/**
 * THE STATIC HALF OF THE SITEMAP, WRITTEN OUT HERE ON PURPOSE.
 *
 * The two tests below need a number for "everything that is published
 * unconditionally". Deriving it from the generator would make the arithmetic
 * agree with itself; typing it means a URL added to or removed from
 * src/app/sitemap.ts fails this file until somebody says so out loud.
 */
const ALWAYS_PUBLISHED = [
  '/',
  '/events',
  '/communities',
  '/cities',
  '/organisers',
  // FT1's free forecast tool, added here 17 September 2026 when it arrived in
  // this tree. Saying it out loud is the whole point of typing this list.
  '/forecast',
  '/pricing',
  '/guides',
  '/legal/terms',
  '/legal/privacy',
  '/legal/cookies',
  '/legal/refunds',
  '/legal/organiser-terms',
  '/legal/accessibility',
  '/about',
  '/press',
  '/careers',
  '/contact',
  '/help',
]

/** Generate the real sitemap against whatever is in `state`. */
async function generate(): Promise<string[]> {
  const mod = await import('@/app/sitemap')
  const entries = await mod.default()
  return entries.map(e => e.url.replace('https://example.test', ''))
}

describe('the sitemap publishes exactly the pages that are indexable', () => {
  beforeEach(() => {
    state.categories = [
      { slug: 'comedy', name: 'Comedy', sort_order: 9 },
      { slug: 'music', name: 'Music', sort_order: 1 },
    ]
    state.weekend = []
  })

  test('sitemap_contains_no_noindex_page', async () => {
    // One event: Melbourne, Comedy, tagged African and Christian, published by
    // organisation A. Everything else on the platform holds nothing, so every
    // other templated page is noindex and none of them may appear.
    state.discovery = [
      row({
        tags: [getCommunityTags('african')[0], getFaithTags('christian')[0]],
        category: { slug: 'comedy' },
        organisation_id: 'org-a',
      }),
    ]
    state.events = [{ slug: 'lane-c-comedy-night', venue_name: 'Lane C Hall', updated_at: null }]
    state.organisations = [
      { id: 'org-a', slug: 'lane-c-with-events', description: null, updated_at: null },
      { id: 'org-b', slug: 'lane-c-empty', description: null, updated_at: null },
      { id: 'org-c', slug: 'lane-c-biography-only', description: 'Twelve years of rooms in Footscray.', updated_at: null },
    ]

    const urls = await generate()
    const { loadDiscoveryRows, countCity, countCommunity, countFaith, countCategory, countOrganiser } =
      await import('@/lib/seo/discovery-counts')
    const rows = await loadDiscoveryRows()

    // Every conditional URL that IS published must be indexable on the page.
    for (const url of urls) {
      const city = /^\/city\/([^/]+)$/.exec(url)
      if (city) expect(countCity(rows, city[1])).toBeGreaterThanOrEqual(state.threshold)
      const community = /^\/community\/([^/]+)$/.exec(url)
      if (community) {
        expect(countCommunity(rows, community[1] as CommunitySlug)).toBeGreaterThanOrEqual(state.threshold)
      }
      const faith = /^\/faith\/([^/]+)$/.exec(url)
      if (faith) {
        expect(countFaith(rows, faith[1] as FaithSlug)).toBeGreaterThanOrEqual(state.threshold)
      }
      const category = /^\/categories\/([^/]+)$/.exec(url)
      if (category) expect(countCategory(rows, [category[1]])).toBeGreaterThanOrEqual(state.threshold)
    }

    // And the named empties are absent. /faith/muslim and /community/greek hold
    // nothing on these rows; /city/perth is a launch city with no events, which
    // is the 545-URL shape close-out C19 measured on production.
    expect(urls).toContain('/city/melbourne')
    expect(urls).toContain('/community/african')
    expect(urls).toContain('/faith/christian')
    expect(urls).toContain('/categories/comedy')
    expect(urls).not.toContain('/city/perth')
    expect(urls).not.toContain('/community/greek')
    expect(urls).not.toContain('/faith/muslim')
    expect(urls).not.toContain('/categories/music')

    // THE ORGANISER RULE, PUBLISHED THE SAME WAY IT IS RENDERED.
    for (const org of state.organisations) {
      const indexable = isOrganiserProfileIndexable(
        countOrganiser(rows, org.id as string),
        typeof org.description === 'string' && org.description.trim().length > 0,
        state.threshold,
      )
      expect(urls.includes(`/organisers/${org.slug as string}`)).toBe(indexable)
    }
    expect(urls).not.toContain('/organisers/lane-c-empty')

    // THE WEEKEND SURFACE IS ABSENT, and that is the case worth pinning.
    // `state.events` holds a published event, so the platform is not empty; what
    // it holds nothing of is THIS WEEKEND. A page whose contents expire every
    // Sunday night must leave the sitemap on its own, and the only way to see
    // that is a catalogue that is full and a weekend that is not.
    expect(urls).not.toContain('/this-weekend')

    // NO QUERY STRING EVER. A sitemap URL carrying one is the filter-as-a-page
    // shape this item exists to remove.
    expect(urls.filter(u => u.includes('?'))).toEqual([])
  })

  test('sitemap_publishes_the_weekend_only_while_it_holds_events', async () => {
    state.discovery = []
    state.events = [{ slug: 'lane-c-comedy-night', venue_name: 'Lane C Hall', updated_at: null }]
    state.organisations = []

    state.weekend = []
    expect(await generate()).not.toContain('/this-weekend')

    vi.resetModules()
    state.weekend = [
      {
        id: 'lane-c-weekend-1',
        slug: 'lane-c-saturday-night',
        title: 'Lane C Saturday Night',
        start_date: '2026-09-19T09:00:00.000Z',
        end_date: '2026-09-19T13:00:00.000Z',
        timezone: 'Australia/Sydney',
        cover_image_url: 'https://example.test/cover.avif',
        ticket_tiers: [],
      },
    ]
    expect(await generate()).toContain('/this-weekend')

    /*
     * AND THE OWNER'S THRESHOLD GOVERNS IT LIKE EVERY OTHER CONDITIONAL PAGE.
     * One event on the weekend, a threshold of two, and the URL leaves again.
     */
    vi.resetModules()
    state.threshold = 2
    expect(await generate()).not.toContain('/this-weekend')
    state.threshold = 1
  })

  test('sitemap_count_equals_indexable_count', async () => {
    state.discovery = [
      row({
        tags: [getCommunityTags('african')[0], getFaithTags('christian')[0]],
        category: { slug: 'comedy' },
        organisation_id: 'org-a',
      }),
    ]
    state.events = [
      { slug: 'lane-c-comedy-night', venue_name: 'Lane C Hall', updated_at: null },
      { slug: 'lane-c-second-night', venue_name: 'Lane C Hall', updated_at: null },
    ]
    state.organisations = [
      { id: 'org-a', slug: 'lane-c-with-events', description: null, updated_at: null },
      { id: 'org-b', slug: 'lane-c-empty', description: null, updated_at: null },
    ]

    const urls = await generate()

    const { GUIDES } = await import('@/lib/guides')
    const { helpTopics } = await import('@/lib/help-content')
    const { getAllCommunities } = await import('@/lib/communities/data')
    const { getAllFaiths } = await import('@/lib/faiths/data')
    const { getAllCities, getSuburbsForCity } = await import('@/lib/cities/data')
    const { getAllHeroCategories } = await import('@/lib/hero-categories')
    const { isRedirected } = await import('@/lib/seo/permanent-redirects')
    const {
      loadDiscoveryRows,
      countCity,
      countSuburb,
      countCommunity,
      countCommunityCity,
      countFaith,
      countCategory,
      countOrganiser,
    } = await import('@/lib/seo/discovery-counts')
    const rows = await loadDiscoveryRows()
    const t = state.threshold
    const yes = (n: number) => (isDiscoveryIndexable(n, t) ? 1 : 0)

    /*
     * THE EXPECTED COUNT, BUILT FROM THE PAGE SIDE OF THE RULE.
     *
     * Every term below is "how many pages of this family would render
     * index, follow", judged with the same count functions the pages call in
     * generateMetadata. The sitemap is then required to hold exactly that many
     * URLs. This is the arithmetic behind SEO3 step 6: the live sitemap read 37,
     * then 40, then 41 on three reads, and the true count is not a constant at
     * all, it is this sum evaluated against the catalogue of the moment.
     */
    let expected = ALWAYS_PUBLISHED.length + GUIDES.length + helpTopics.length

    for (const c of getAllHeroCategories()) {
      if (isRedirected(`/categories/${c.slug}`)) continue
      expected += yes(countCategory(rows, [c.slug, c.displayName.toLowerCase()]))
    }
    for (const c of state.categories) expected += yes(countCategory(rows, [c.slug]))
    // The two stubbed picker cities, as /events/browse/[city].
    for (const name of ['Melbourne', 'Perth']) expected += yes(countCity(rows, name))
    for (const community of getAllCommunities()) expected += yes(countCommunity(rows, community.slug))
    for (const faith of getAllFaiths()) expected += yes(countFaith(rows, faith.slug))
    for (const city of getAllCities()) {
      expected += yes(countCity(rows, city.name))
      for (const s of getSuburbsForCity(city.slug)) {
        expected += yes(countSuburb(rows, city.name, city.slug, s.slug))
      }
      for (const community of getAllCommunities()) {
        expected += yes(countCommunityCity(rows, community.slug, city.name))
      }
    }
    expected += state.events.length
    // The weekend surface, published on the same rule as every other
    // conditional page and counted the same way.
    expected += yes(state.weekend.length)
    for (const org of state.organisations) {
      expected += isOrganiserProfileIndexable(
        countOrganiser(rows, org.id as string),
        typeof org.description === 'string' && org.description.trim().length > 0,
        t,
      )
        ? 1
        : 0
    }
    // Venue handles are derived from the events' venue_name, deduplicated.
    expected += new Set(state.events.map(e => e.venue_name as string)).size

    expect(urls).toHaveLength(expected)
    // A URL published twice is still one page, and would make the count a lie.
    expect(new Set(urls).size).toBe(urls.length)

    /*
     * AND THE NUMBER MOVES WITH THE CATALOGUE, WHICH IS THE POINT OF STEP 6.
     * Raising the owner's threshold out of reach removes every conditional page
     * and leaves exactly the unconditional ones plus the rows: the reversal
     * condition SEO3 writes down, measured rather than asserted.
     */
    vi.resetModules()
    state.threshold = 9_999
    const starved = await generate()
    expect(starved).toHaveLength(
      ALWAYS_PUBLISHED.length +
        GUIDES.length +
        helpTopics.length +
        state.events.length +
        new Set(state.events.map(e => e.venue_name as string)).size,
    )
    expect(starved).not.toContain('/city/melbourne')
    expect(starved).not.toContain('/categories/comedy')
    expect(starved).not.toContain('/organisers/lane-c-with-events')
  })
})
