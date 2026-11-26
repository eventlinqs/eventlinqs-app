import { describe, expect, it } from 'vitest'
import { deadNotYetHeld, everyLinkDead, holdRow, holdsToMake, holdsToRelease, hostsDeadTwice, SENTINEL_HOLD_MARK, sourcesToStop, type NightLinks } from '@/lib/health/dead-link-hold'

/*
 * THE AUTOMATIC HOLD FOR A DEAD BOOKING LINK (the PM's 12:15 item 3 and 12:35 item 4 of 16 November 2026). The regression
 * case is the night that stayed public with its page gone: Cannonball featuring Chantal Mitvalsky at The JazzLab, its one
 * link marked dead at 18:00 UTC on 15 November, CRITICAL emailed at 05:41 and 11:40 on 16 November, never taken down.
 */
const NOW = new Date('2026-11-16T00:40:00Z') // the sentinel's 11:40 run, Melbourne time
const night = (over: Partial<NightLinks> = {}): NightLinks => ({
  id: 'e1',
  slug: 'cannonball-featuring-chantal-mitvalsky-jl-room-the-jazzlab-2026-11-20',
  seriesId: 's1',
  visibility: 'public',
  links: [{ url: 'https://thejazzlab.com.au/event/cannonball-featuring-chantal-mitvalsky-4/', availability: 'dead', updatedAt: '2026-11-15T18:00:33Z' }],
  ...over,
})

describe('the automatic hold for a dead booking link', () => {
  it('holds the Cannonball night: its one link dead since the run before (the regression case)', () => {
    expect(holdsToMake([night()], new Set(), NOW).map((n) => n.slug)).toEqual([night().slug])
  })

  it("a link found dead on this run is held on this run (the PM's 11:53 of 26 November 2026: within one run), never left live", () => {
    const fresh = night({ links: [{ url: 'https://example.com/a', availability: 'dead', updatedAt: NOW.toISOString() }] })
    expect(holdsToMake([fresh], new Set(), NOW).map((n) => n.id)).toEqual(['e1'])
    expect(deadNotYetHeld([fresh], new Set(), NOW)).toEqual([])
  })

  it('never holds a night with a link that works, a night with no link, a private night or one held already', () => {
    const oneLive = night({ links: [...night().links, { url: 'https://example.com/b', availability: 'on_sale', updatedAt: '2026-11-15T18:00:00Z' }] })
    expect(holdsToMake([oneLive, night({ links: [] }), night({ visibility: 'private' })], new Set(), NOW)).toEqual([])
    expect(holdsToMake([night()], new Set(['e1']), NOW)).toEqual([])
    expect(everyLinkDead(night({ links: [] }))).toBe(false)
  })

  it('a sold out link is not dead: a sold out night stays up', () => {
    expect(holdsToMake([night({ links: [{ url: 'https://example.com/c', availability: 'sold_out', updatedAt: '2026-11-14T00:00:00Z' }] })], new Set(), NOW)).toEqual([])
  })

  it("releases its own hold the moment a link answers again, and only then", () => {
    const holds = [{ id: 'h1', eventId: 'e1' }]
    expect(holdsToRelease(holds, [night()])).toEqual([])
    expect(holdsToRelease(holds, [night({ visibility: 'private', links: [{ url: 'https://example.com/a', availability: 'on_sale', updatedAt: NOW.toISOString() }] })])).toEqual(holds)
  })

  it('a host whose links died on two nights within a week switches its source off; one night, or a week apart, does not', () => {
    const jl = (eventId: string, heldAt: string) => ({ eventId, urls: [`https://thejazzlab.com.au/event/${eventId}/`], heldAt })
    const twice = hostsDeadTwice([jl('a', '2026-11-15T00:40:00Z'), jl('b', '2026-11-16T00:40:00Z'), jl('a', '2026-11-16T00:40:00Z')], NOW)
    expect([...twice.entries()]).toEqual([['thejazzlab.com.au', ['a', 'b']]])
    expect(hostsDeadTwice([jl('a', '2026-11-16T00:40:00Z')], NOW).size).toBe(0)
    expect(hostsDeadTwice([jl('a', '2026-11-01T00:40:00Z'), jl('b', '2026-11-16T00:40:00Z')], NOW).size).toBe(0)
    const sources = [
      { id: 's1', name: 'The JazzLab', page_url: 'https://www.thejazzlab.com.au/whats-on/', collection: 'read' },
      { id: 's2', name: 'Already asked', page_url: 'https://thejazzlab.com.au/feed', collection: 'ask' },
      { id: 's3', name: 'Elsewhere', page_url: 'https://fedsquare.com/events', collection: 'read' },
    ]
    expect(sourcesToStop(twice, sources).map((s) => s.id)).toEqual(['s1'])
  })

  it("its hold row is the resolver's own night hold, marked as the sentinel's, with every dead link as a reading", () => {
    const row = holdRow(night(), NOW)
    expect(row).toMatchObject({ event_id: 'e1', series_id: 's1', field: 'status', scope: 'night', reason: 'no_official_page', state: 'held', next_source: night().links[0].url })
    expect(row.readings).toEqual([expect.objectContaining({ by: SENTINEL_HOLD_MARK, availability: 'dead', marked_dead_at: '2026-11-15T18:00:33Z' })])
    expect(Date.parse(row.next_check_at) - NOW.getTime()).toBe(24 * 3_600_000)
  })
})
