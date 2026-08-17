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

vi.mock('next/cache', () => ({
  revalidatePath: (p: string) => revalidatePath(p),
  updateTag: (t: string) => updateTag(t),
}))
vi.mock('server-only', () => ({}))

const { revalidateEventSurfaces, revalidateEventSurfacesById } = await import(
  '@/lib/events/revalidate-event'
)

beforeEach(() => {
  revalidatePath.mockClear()
  updateTag.mockClear()
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

  it('invalidates the category landing', () => {
    const paths = revalidateEventSurfaces({ slug: 'e', category_slug: 'music' })
    expect(paths).toContain('/categories/music')
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
    expect(paths).toContain('/categories/comedy')
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
