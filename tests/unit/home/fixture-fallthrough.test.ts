/**
 * A STALE FIXTURE MUST FALL THROUGH TO THE LIVE QUERY, not blank the homepage.
 *
 * THE DEFECT THIS PINS (15 August 2026, found by walking the deployed preview).
 * `loadHomeUpcoming` guarded its fixture branch with `rows.length > 0` and then
 * returned the list filtered to `start_date >= now`. So a fixture that EXISTED
 * but had aged entirely into the past returned an empty array and NEVER reached
 * the live query underneath it.
 *
 * The fixture generator anchored its dates to a hardcoded 7 June 2026, so by
 * mid-August all 55 rows were in the past. The deployed preview homepage
 * rendered "Events loading soon" while the database held 184 upcoming published
 * public events, and `/events` on the same deployment showed a full catalogue.
 *
 * Nothing failed. A stale fixture and an empty catalogue produce the identical
 * screen, so every claim of the form "verified on the preview" made about the
 * homepage was made against a blank page for roughly seven weeks.
 *
 * The generator is fixed and the fixture is now asserted fresh in
 * fixture-integrity.test.ts. This is the third layer and the one that pins the
 * BEHAVIOUR: even with a completely stale fixture, the homepage must still show
 * live events.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const fixtureState = { enabled: true, rows: [] as { start_date: string; slug: string }[] }

vi.mock('@/lib/dev/fixture-events', () => ({
  fixtureEnabled: () => fixtureState.enabled,
  loadFixtureRows: async () => fixtureState.rows,
}))

const { loadHomeUpcoming } = await import('@/lib/events/home-queries')

/** A minimal Supabase stub: every builder method chains, the await resolves rows. */
function stubClient(rows: unknown[]) {
  const result = Promise.resolve({ data: rows, error: null })
  const chain: Record<string, unknown> = {}
  // `is` was added when the homepage rails began excluding externally ticketed
  // events (`.is('external_ticket_url', null)`). A stub that omits a builder
  // method fails with "is not a function", which reads as a broken query rather
  // than an out-of-date double, so the list is kept complete deliberately.
  // `or` was added on 16 August 2026 when the rails stopped filtering
  // `start_date >= now` and began asking "has this ended yet?" instead
  // (src/lib/events/listing-window.ts). Same lesson as `is` above: the stub
  // failing with "or is not a function" reads as a broken query rather than an
  // out-of-date double.
  for (const m of ['from', 'select', 'eq', 'gte', 'or', 'is', 'order', 'limit']) {
    chain[m] = () => chain
  }
  chain.then = (...args: unknown[]) => (result as unknown as { then: (...a: unknown[]) => unknown }).then(...args)
  return chain as never
}

const NOW = '2026-08-15T00:00:00.000Z'
const LIVE = [{ slug: 'live-event-from-the-database', start_date: '2026-09-01T00:00:00.000Z' }]

describe('loadHomeUpcoming and a stale fixture', () => {
  beforeEach(() => {
    fixtureState.enabled = true
    fixtureState.rows = []
  })

  it('uses the fixture when it holds upcoming rows', async () => {
    fixtureState.rows = [{ slug: 'fixture-future', start_date: '2026-09-10T00:00:00.000Z' }]
    const rows = await loadHomeUpcoming(stubClient(LIVE), NOW, 60)
    expect(rows.map(r => r.slug)).toEqual(['fixture-future'])
  })

  it('FALLS THROUGH to the live query when every fixture row is in the past', async () => {
    // The exact shape that blanked the deployed homepage: the file is present
    // and populated, and every row has expired.
    fixtureState.rows = [
      { slug: 'fixture-stale-1', start_date: '2026-06-07T08:00:00.000Z' },
      { slug: 'fixture-stale-2', start_date: '2026-07-27T08:00:00.000Z' },
    ]
    const rows = await loadHomeUpcoming(stubClient(LIVE), NOW, 60)
    expect(
      rows.map(r => r.slug),
      'a stale fixture returned an empty homepage instead of falling through to the database',
    ).toEqual(['live-event-from-the-database'])
  })

  it('falls through when the fixture file is missing entirely', async () => {
    fixtureState.rows = []
    const rows = await loadHomeUpcoming(stubClient(LIVE), NOW, 60)
    expect(rows.map(r => r.slug)).toEqual(['live-event-from-the-database'])
  })

  it('uses the live query when the fixture flag is off', async () => {
    fixtureState.enabled = false
    fixtureState.rows = [{ slug: 'fixture-future', start_date: '2026-09-10T00:00:00.000Z' }]
    const rows = await loadHomeUpcoming(stubClient(LIVE), NOW, 60)
    expect(rows.map(r => r.slug)).toEqual(['live-event-from-the-database'])
  })
})
