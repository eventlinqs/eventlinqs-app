/**
 * AN ORGANISER SAVES, AND THE PUBLIC PAGE CHANGES.
 *
 * THE DEFECT THIS PINS, 18 August 2026. An organiser edited a field, reloaded the
 * public page, and saw the old value. The cache was not too aggressive; the
 * revalidation was gated on the wrong thing:
 *
 *     if (input.has_reserved_seating && event.slug) {
 *       revalidatePath(`/events/${event.slug}`)
 *     }
 *
 * so an ordinary event was never invalidated and waited out its own 300 second
 * ISR window. Five of the seven event mutations invalidated NOTHING at all, and
 * a cancelled event went on being sold from a cached page.
 *
 * Next.js time-based revalidation is stale-while-revalidate, so the first reload
 * after expiry still serves the old page
 * (node_modules/next/dist/docs/01-app/02-guides/how-revalidation-works.md,
 * next@16.3.0). Refreshing once and seeing nothing is the designed behaviour of a
 * cache nobody told about the write.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'

const revalidatePath = vi.fn()
const updateTag = vi.fn()
const revalidateTag = vi.fn()

vi.mock('next/cache', () => ({
  revalidatePath: (p: string) => revalidatePath(p),
  updateTag: (t: string) => updateTag(t),
  revalidateTag: (t: string, profile: unknown) => revalidateTag(t, profile),
}))
vi.mock('server-only', () => ({}))

const {
  revalidateEventSurfaces,
  revalidateEventSurfacesById,
  revalidateEventSurfacesFromRouteHandler,
  revalidateEventSurfacesFromRouteHandlerById,
} = await import('@/lib/events/revalidate-event')

beforeEach(() => {
  revalidatePath.mockClear()
  updateTag.mockClear()
  revalidateTag.mockClear()
})

describe('every surface an event appears on', () => {
  it('invalidates the detail page, the listing and the homepage at minimum', () => {
    const paths = revalidateEventSurfaces({ slug: 'my-event' })
    expect(paths).toContain('/events/my-event')
    expect(paths).toContain('/events')
    expect(paths).toContain('/')
  })

  it('invalidates the city landing, resolved from the venue city', () => {
    const paths = revalidateEventSurfaces({ slug: 'e', venue_city: 'Melbourne' })
    expect(paths).toContain('/city/melbourne')
  })

  it('does NOT invalidate /categories/<real slug>, because that path does not exist', () => {
    // `/categories/[slug]` serves the seven hero-category editorial slugs. A
    // real category slug (one of the twenty-two in event_categories) has never
    // resolved there: driven against production on 25 August 2026, all
    // twenty-two answered 404, and this function was invalidating them anyway.
    // Since that pass a real slug 308s to /events?category=<slug>, and /events
    // is the route that renders it and is already invalidated below.
    const paths = revalidateEventSurfaces({ slug: 'e', category_slug: 'music' })
    expect(paths).not.toContain('/categories/music')
    expect(paths).toContain('/events')
  })

  it('invalidates the organiser profile', () => {
    const paths = revalidateEventSurfaces({ slug: 'e', organiser_handle: 'party-pty-ltd' })
    expect(paths).toContain('/organisers/party-pty-ltd')
  })

  it('invalidates the sitemap, so a cancelled event stops being advertised to Google', () => {
    expect(revalidateEventSurfaces({ slug: 'e' })).toContain('/sitemap.xml')
  })

  it('refreshes the city picker source', () => {
    revalidateEventSurfaces({ slug: 'e' })
    expect(updateTag).toHaveBeenCalledWith('picker-cities')
  })

  it('actually calls revalidatePath for each path it reports', () => {
    const paths = revalidateEventSurfaces({ slug: 'e', venue_city: 'Sydney' })
    // The returned list is evidence, not decoration: every entry was a real call.
    expect(revalidatePath).toHaveBeenCalledTimes(paths.length)
    for (const p of paths) expect(revalidatePath).toHaveBeenCalledWith(p)
  })
})

describe('it does not depend on the caller assembling fields', () => {
  const rowClient = (row: unknown, error: unknown = null) => ({
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: () => Promise.resolve({ data: row, error }) }),
      }),
    }),
  })

  it('reads the row and invalidates from it', async () => {
    const paths = await revalidateEventSurfacesById(
      rowClient({
        slug: 'read-from-db',
        venue_city: 'Geelong',
        tags: [],
        category: { slug: 'comedy' },
        organisation: { slug: 'a-promoter' },
      }),
      'evt-1',
    )
    expect(paths).toContain('/events/read-from-db')
    expect(paths).not.toContain('/categories/comedy')
    expect(paths).toContain('/organisers/a-promoter')
    expect(paths).toContain('/city/geelong')
  })

  it('a failed read still invalidates the shared surfaces rather than throwing', async () => {
    // Refusing to save an organiser's event because a cache hint could not be
    // composed would turn a stale page into a lost edit.
    const paths = await revalidateEventSurfacesById(rowClient(null, { message: 'boom' }), 'evt-1')
    expect(paths).toContain('/')
    expect(paths).toContain('/events')
  })
})

describe('the shape of the original defect', () => {
  it('does not depend on reserved seating, which is what gated it before', () => {
    // The old code invalidated the public page only for seated events. A plain
    // general-admission event is the common case and was never invalidated.
    const plain = revalidateEventSurfaces({ slug: 'general-admission-only' })
    expect(plain).toContain('/events/general-admission-only')
  })
})

/**
 * THE ROUTE-HANDLER FORM. Close-out R1, 14 September 2026.
 *
 * A refund returned a place to inventory and /events/<slug> went on saying SOLD
 * OUT, because the refund path was the one inventory movement that invalidated
 * nothing. It could not call the function above: that one uses `updateTag`,
 * which "can only be called from within a Server Action", so a webhook calling
 * it would have traded a stale page for a thrown handler and a Stripe retry
 * loop. These tests pin that the second form reaches the SAME paths and the SAME
 * tags, through the mechanism a route handler is allowed to use.
 */
describe('the route-handler form, for the Stripe webhook', () => {
  it('invalidates exactly the same paths as the server-action form', () => {
    const fromAction = revalidateEventSurfaces({
      slug: 'my-event',
      venue_city: 'Melbourne',
      organiser_handle: 'someone',
      tags: [],
    })
    revalidatePath.mockClear()
    const fromRoute = revalidateEventSurfacesFromRouteHandler({
      slug: 'my-event',
      venue_city: 'Melbourne',
      organiser_handle: 'someone',
      tags: [],
    })
    expect(fromRoute).toEqual(fromAction)
    // And the returned list is evidence, not decoration: every entry was a call.
    expect(revalidatePath.mock.calls.map(c => c[0])).toEqual(fromRoute)
  })

  it('never calls updateTag, which throws outside a Server Action', () => {
    revalidateEventSurfacesFromRouteHandler({ slug: 'e' })
    expect(updateTag).not.toHaveBeenCalled()
    expect(revalidateTag).toHaveBeenCalled()
  })

  it('expires every data tag IMMEDIATELY with { expire: 0 }, the documented webhook pattern', () => {
    /*
     * `revalidateTag(tag)` alone is stale-while-revalidate AND its single-argument
     * form is deprecated in this version. The shipped reference names this exact
     * caller: "For webhooks or third-party services that need immediate
     * expiration, you can pass { expire: 0 } as the second argument".
     */
    revalidateEventSurfacesFromRouteHandler({ slug: 'e' })
    expect(revalidateTag.mock.calls.length).toBeGreaterThan(0)
    for (const [, profile] of revalidateTag.mock.calls) {
      expect(profile).toEqual({ expire: 0 })
    }
  })

  it('expires the same set of tags as the server-action form', () => {
    revalidateEventSurfaces({ slug: 'e' })
    const actionTags = updateTag.mock.calls.map(c => c[0]).sort()
    revalidateEventSurfacesFromRouteHandler({ slug: 'e' })
    const routeTags = revalidateTag.mock.calls.map(c => c[0]).sort()
    expect(routeTags).toEqual(actionTags)
  })

  it('reads the event by id and still never reaches updateTag', async () => {
    const db = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { slug: 'read-back', venue_city: 'Geelong', tags: [], category: null, organisation: null },
              error: null,
            }),
          }),
        }),
      }),
    }
    const paths = await revalidateEventSurfacesFromRouteHandlerById(db, 'an-event-id')
    expect(paths).toContain('/events/read-back')
    expect(updateTag).not.toHaveBeenCalled()
  })

  it('a read that fails still invalidates the shared surfaces rather than nothing', async () => {
    const db = {
      from: () => ({
        select: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: null, error: { message: 'gone' } }) }),
        }),
      }),
    }
    const paths = await revalidateEventSurfacesFromRouteHandlerById(db, 'an-event-id')
    expect(paths).toContain('/events')
    expect(paths).toContain('/')
    expect(updateTag).not.toHaveBeenCalled()
  })
})
