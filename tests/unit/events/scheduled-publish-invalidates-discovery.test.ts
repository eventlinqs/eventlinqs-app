/**
 * A SCHEDULED PUBLISH IS A PUBLISH, AND IT MUST CLEAR WHAT A PUBLISH CLEARS.
 *
 * ============================================================================
 * THE DEFECT, FOUND 14 SEPTEMBER 2026 WHILE BUILDING THE PROOF FOR SEO3 STEP 3
 * ============================================================================
 *
 * `src/app/api/cron/publish-scheduled/route.ts` published an organiser's
 * scheduled event and then invalidated exactly three paths: `/`, `/events` and
 * `/events/<slug>`. Every OTHER publish path on the platform calls
 * `revalidateEventSurfacesById`, which clears all six event data cache tags and
 * marks the city, community, category, organiser and sitemap surfaces the event
 * belongs to.
 *
 * So an event that went live at 7pm on the schedule its organiser set was:
 *
 *   - absent from every cached count (`loadDiscoveryRows`, the /events grid, the
 *     popular ranking, the city and community index counts) until a five minute
 *     to one hour timer expired, because a cached row outlives the row; and
 *   - absent from `/city/<its city>`, `/community/<its communities>`,
 *     `/categories/<its category>`, its organiser profile and `/sitemap.xml`.
 *
 * Close-out SEO3 step 3 is explicit that "when an event is published in
 * Melbourne, /city/melbourne enters the sitemap on the next generation". On this
 * path it did not.
 *
 * ============================================================================
 * WHY THE ROUTE IS TESTED AND NOT JUST THE FUNCTION
 * ============================================================================
 *
 * `tests/unit/events/publish-scheduled.test.ts` covers `publishScheduledEvents`
 * thoroughly, and it was green the whole time the defect existed, because the
 * defect was never in that function. It was in what the ROUTE did with the
 * answer. A test of the pure core cannot see a caller that ignores half of it.
 *
 * The second assertion is about `updateTag` rather than about SEO, and it is
 * the reason this route could not simply be pointed at the existing helper:
 * "`updateTag` ... can only be used in Server Actions"
 * (node_modules/next/dist/docs/01-app/01-getting-started/09-revalidating.md
 * line 121, shipped with next@16.3.0, read 14 September 2026). A cron GET is a
 * Route Handler. Calling the Server Action path from here would have replaced a
 * stale cache with a 500 on every scheduled publish, which is worse than the
 * defect being fixed, so the route asks for the Route Handler semantics and this
 * test fails if anybody moves it back.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const revalidatePath = vi.fn()
const revalidateTag = vi.fn()
const updateTag = vi.fn()

vi.mock('next/cache', () => ({
  revalidatePath: (p: string) => revalidatePath(p),
  revalidateTag: (t: string, profile: unknown) => revalidateTag(t, profile),
  updateTag: (t: string) => updateTag(t),
}))
vi.mock('server-only', () => ({}))

/** The cron auth gate is not what is under test; it is proven elsewhere. */
vi.mock('@/lib/cron/auth', () => ({ requireCronAuth: () => null }))

/**
 * The one row the route's own read will find. `revalidateEventSurfacesById`
 * reads the event to compose its surfaces, so the row here is what decides which
 * paths should be marked.
 */
const EVENT_ROW = {
  slug: 'lane-c-scheduled-night',
  venue_city: 'Melbourne',
  tags: [] as string[],
  category: { slug: 'comedy' },
  organisation: { slug: 'northside-sound' },
}

/**
 * ONE STUB SERVES TWO DIFFERENT READS, so `select()` returns a chain that is
 * both awaitable (the dry-run listing) and terminable with `maybeSingle()` (the
 * row `revalidateEventSurfacesById` reads to compose its surfaces).
 */
vi.mock('@/lib/supabase/admin', () => {
  const chain = () => {
    const self: Record<string, unknown> = {}
    for (const method of ['select', 'eq', 'not', 'lte', 'order', 'limit']) self[method] = () => self
    self.maybeSingle = async () => ({ data: EVENT_ROW, error: null })
    self.then = (resolve: (v: unknown) => unknown) => resolve({ data: [], error: null })
    return self
  }
  return { createAdminClient: () => ({ from: () => chain() }) }
})

/** One event publishes; one is blocked, so the route must tell them apart. */
vi.mock('@/lib/events/publish-scheduled', () => ({
  publishScheduledEvents: async () => ({
    considered: 2,
    published: 1,
    blocked: 1,
    errored: 0,
    outcomes: [
      {
        eventId: 'evt-published',
        slug: 'lane-c-scheduled-night',
        title: 'Lane C Scheduled Night',
        result: 'published',
      },
      {
        eventId: 'evt-blocked',
        slug: 'lane-c-blocked-night',
        title: 'Lane C Blocked Night',
        result: 'blocked',
        reason: 'no cover image',
      },
    ],
  }),
}))

const { GET } = await import('@/app/api/cron/publish-scheduled/route')
const { EVENT_DATA_CACHE_TAGS } = await import('@/lib/events/cache-tags')

/** The shape the route reads off the request: the dry-run flag only. */
function request(url = 'https://example.test/api/cron/publish-scheduled') {
  return { nextUrl: new URL(url) } as unknown as Parameters<typeof GET>[0]
}

beforeEach(() => {
  revalidatePath.mockClear()
  revalidateTag.mockClear()
  updateTag.mockClear()
})

describe('the scheduled publish cron', () => {
  it('clears every event data cache tag, so a published event is not missing from counts', async () => {
    await GET(request())

    const cleared = revalidateTag.mock.calls.map(c => c[0])
    for (const tag of EVENT_DATA_CACHE_TAGS) {
      expect(cleared).toContain(tag)
    }
    // The picker city list is merged from live event cities and is tagged too.
    expect(cleared).toContain('picker-cities')
  })

  it('marks the discovery surfaces the event belongs to, not just the event page', async () => {
    await GET(request())

    const marked = revalidatePath.mock.calls.map(c => c[0])
    expect(marked).toContain('/events/lane-c-scheduled-night')
    // SEO3 step 3, in one line: the city page and the sitemap.
    expect(marked).toContain('/city/melbourne')
    expect(marked).toContain('/sitemap.xml')
    expect(marked).toContain('/categories/comedy')
    expect(marked).toContain('/organisers/northside-sound')
  })

  it('uses the Route Handler tag semantics, because updateTag is Server-Action only', async () => {
    await GET(request())

    expect(updateTag).not.toHaveBeenCalled()
    expect(revalidateTag).toHaveBeenCalled()
    // And it expires on the spot rather than handing the entry a fresh lease:
    // `revalidateTag(tag, profile)` requires the second argument in next@16.3.0.
    for (const call of revalidateTag.mock.calls) {
      expect(call[1]).toEqual({ expire: 0 })
    }
  })

  it('invalidates nothing for an event that was blocked rather than published', async () => {
    await GET(request())

    // The blocked event stays scheduled. Marking its page would be harmless; the
    // point is that the route reads `result`, so a run that publishes NOTHING
    // touches no cache at all.
    const marked = revalidatePath.mock.calls.map(c => c[0])
    expect(marked).not.toContain('/events/lane-c-blocked-night')
  })

  it('changes nothing on a dry run', async () => {
    await GET(request('https://example.test/api/cron/publish-scheduled?dry_run=1'))

    expect(revalidatePath).not.toHaveBeenCalled()
    expect(revalidateTag).not.toHaveBeenCalled()
    expect(updateTag).not.toHaveBeenCalled()
  })
})
