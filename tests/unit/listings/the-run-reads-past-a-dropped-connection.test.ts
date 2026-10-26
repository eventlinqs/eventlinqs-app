import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * THE DAILY RUN READS PAST ONE DROPPED CONNECTION, AND NAMES THE CAUSE WHEN IT CANNOT.
 *
 * Drive 3 of WI2 Part 2 (25 October 2026, 02:5x) lost eleven checks to one read: the run's first read of
 * event_series failed at the network and the route answered 500 ("event_series could not be read:
 * TypeError: fetch failed", C:\dev\EVIDENCE\WI1\server.log). Every page read on the platform already tries a
 * transient fault again (withBuildRetry, src/lib/supabase/build-retry.ts, whose POOL_ERROR names "fetch
 * failed"); the run's store did not. And the message kept only "fetch failed": postgrest-js puts the real
 * error in `details` ("Caused by: ...", @supabase/postgrest-js 2.101.1), which the store dropped.
 *
 * The failed answer below is the exact shape postgrest-js builds for a failed fetch.
 */

const DROPPED = {
  message: 'TypeError: fetch failed',
  details: 'TypeError: fetch failed\n\nCaused by: ConnectTimeoutError: Connect Timeout Error (UND_ERR_CONNECT_TIMEOUT)',
  hint: '',
  code: '',
}

const ROW = {
  id: 'series-1',
  organisation_id: 'org-1',
  venue_id: 'venue-1',
  name: 'Trivia night',
  rule: { kind: 'weekly', weekday: 3 },
  anchor_date: '2026-10-28',
  starts_at: '19:00:00',
  ends_at: '21:00:00',
  timezone: 'Australia/Melbourne',
  category_id: 'cat-1',
  age_restriction_min: 18,
  summary: 'A quiz',
  skip_dates: [],
  status: 'active',
}

let answers: Array<{ data: unknown; error: unknown }> = []
let calls = 0

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        order: () => ({
          range: () => {
            calls += 1
            return Promise.resolve(answers.shift() ?? { data: [], error: null })
          },
        }),
      }),
    }),
  }),
}))
// The store's write paths are not reached by a read; they are stubbed so the test loads nothing heavy.
vi.mock('@/lib/events/publish-gate', () => ({ checkPublishGate: vi.fn() }))
vi.mock('@/lib/events/generated-cover', () => ({ attachGeneratedCover: vi.fn() }))
vi.mock('@/lib/events/delete-event-core', () => ({ deleteEventEverywhere: vi.fn() }))
vi.mock('@/lib/events/revalidate-event', () => ({ revalidateEventSurfacesFromRouteHandlerById: vi.fn() }))
vi.mock('@/lib/geo/venue-coordinates', () => ({ resolveVenueCoordinates: vi.fn() }))
vi.mock('@/lib/cities/resolve-suburb', () => ({ resolveSuburbSlug: vi.fn() }))

const { occurrenceStore } = await import('@/lib/listings/occurrence-store')
const NOW = new Date('2026-10-25T00:00:00Z')

describe('the daily run reads past a dropped connection', () => {
  beforeEach(() => {
    calls = 0
    answers = []
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  it('tries event_series again after one failed connection, and reads the nights', async () => {
    answers = [{ data: null, error: DROPPED }, { data: [ROW], error: null }]
    const nights = await occurrenceStore().nights(NOW)
    expect(calls).toBe(2)
    expect(nights.map((n) => n.id)).toEqual(['series-1'])
  })

  it('when the connection never comes back, the error names its cause, not only "fetch failed"', async () => {
    answers = [1, 2, 3, 4].map(() => ({ data: null, error: DROPPED }))
    await expect(occurrenceStore().nights(NOW)).rejects.toThrow(
      /event_series could not be read: TypeError: fetch failed .*ConnectTimeoutError: Connect Timeout Error \(UND_ERR_CONNECT_TIMEOUT\)/,
    )
    expect(calls).toBe(4)
  })

  it('a refusal that is not transient is not tried again', async () => {
    answers = [{ data: null, error: { message: 'permission denied for table event_series', details: '', hint: '', code: '42501' } }]
    await expect(occurrenceStore().nights(NOW)).rejects.toThrow(/event_series could not be read: permission denied/)
    expect(calls).toBe(1)
  })
})
