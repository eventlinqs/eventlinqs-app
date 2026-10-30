// D3 (6), a venue's distribution preferences (the DemandOS directive, section 3). Pinned over fake database calls: a
// claimed venue's answer goes to its one database function and the database's refusal comes back in its own words; a
// venue that said nothing is yes to both channels; the venues that said no to a channel are read, and a failed read
// is thrown, never taken as 'nobody said no'; and the nights left out are exactly those at a venue that said no.

import { describe, expect, test } from 'vitest'
import {
  nightsLeftOut,
  SAID_NOTHING,
  setVenueDistribution,
  venueDistributionFor,
  venuesOff,
  type DistributionDeps,
} from '@/lib/venues/venue-distribution'

type Call = { name: string; args: Record<string, unknown> }

function fake(answer: (call: Call) => { data: unknown; error: { code: string; message: string } | null }) {
  const calls: Call[] = []
  const deps: DistributionDeps = {
    rpc: async (name, args) => {
      const call = { name, args }
      calls.push(call)
      return answer(call)
    },
  }
  return { deps, calls }
}

const VENUE = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'
const USER = '33333333-3333-4333-8333-333333333333'

describe('a venue sets where its nights are shared', () => {
  test('both answers go to the one database function, as the venue gave them', async () => {
    const { deps, calls } = fake(() => ({ data: null, error: null }))
    const answer = await setVenueDistribution(USER, VENUE, { ourPosts: false, weeklyRoundup: true }, deps)
    expect(answer).toEqual({ state: 'done' })
    expect(calls).toEqual([
      { name: 'venue_distribution_set', args: { p_user: USER, p_venue: VENUE, p_our_posts: false, p_weekly_roundup: true } },
    ])
  })

  test("the database's refusal comes back in its own words", async () => {
    const { deps } = fake(() => ({ data: null, error: { code: '23514', message: 'refused: only the people of a claimed venue may set where its nights are shared' } }))
    expect(await setVenueDistribution(USER, VENUE, { ourPosts: true, weeklyRoundup: true }, deps)).toEqual({
      state: 'refused',
      reason: 'Only the people of a claimed venue may set where its nights are shared',
    })
  })

  test('any other fault is thrown, never shown as saved', async () => {
    const { deps } = fake(() => ({ data: null, error: { code: '08006', message: 'connection lost' } }))
    await expect(setVenueDistribution(USER, VENUE, { ourPosts: true, weeklyRoundup: true }, deps)).rejects.toThrow('connection lost')
  })
})

describe('what each venue has said', () => {
  test('a venue with no answer is yes to both; an answer is read as given', async () => {
    const { deps, calls } = fake(() => ({
      data: [{ venue_id: VENUE, our_posts: false, weekly_roundup: true, set_at: '2026-10-31T03:30:00Z' }],
      error: null,
    }))
    const said = await venueDistributionFor([VENUE, OTHER], deps)
    expect(calls).toEqual([{ name: 'venue_distribution_for', args: { p_venues: [VENUE, OTHER] } }])
    expect(said.get(VENUE)).toEqual({ ourPosts: false, weeklyRoundup: true, setAt: '2026-10-31T03:30:00Z' })
    expect(said.get(OTHER)).toEqual(SAID_NOTHING)
    expect(SAID_NOTHING).toEqual({ ourPosts: true, weeklyRoundup: true, setAt: null })
  })

  test('no venues asks the database nothing', async () => {
    const { deps, calls } = fake(() => ({ data: [], error: null }))
    expect((await venueDistributionFor([], deps)).size).toBe(0)
    expect(calls).toEqual([])
  })

  test('a failed read is thrown', async () => {
    const { deps } = fake(() => ({ data: null, error: { code: '42501', message: 'permission denied' } }))
    await expect(venueDistributionFor([VENUE], deps)).rejects.toThrow('permission denied')
  })
})

describe('the venues that said no to a channel', () => {
  test('each channel asks for its own no', async () => {
    const { deps, calls } = fake((c) => ({ data: c.args.p_channel === 'our_posts' ? [VENUE] : [OTHER], error: null }))
    expect([...(await venuesOff('our_posts', deps))]).toEqual([VENUE])
    expect([...(await venuesOff('weekly_roundup', deps))]).toEqual([OTHER])
    expect(calls.map((c) => c.args)).toEqual([{ p_channel: 'our_posts' }, { p_channel: 'weekly_roundup' }])
  })

  test("a failed read is thrown, never taken as 'nobody said no'", async () => {
    const { deps } = fake(() => ({ data: null, error: { code: '42883', message: 'function venue_distribution_off does not exist' } }))
    await expect(venuesOff('our_posts', deps)).rejects.toThrow('venue_distribution_off does not exist')
  })
})

describe('the nights left out', () => {
  test('exactly the nights at a venue that said no; a night with no venue is never left out by this', () => {
    const nights = [
      { eventId: 'a', venueId: VENUE },
      { eventId: 'b', venueId: OTHER },
      { eventId: 'c', venueId: null },
      { eventId: 'd', venueId: VENUE },
    ]
    expect([...nightsLeftOut(nights, new Set([VENUE]))]).toEqual(['a', 'd'])
    expect(nightsLeftOut(nights, new Set()).size).toBe(0)
  })
})
