import { describe, expect, it } from 'vitest'
import { PICK_FLOOR, rankPicks, type PickInput } from '@/lib/growth/post-picks'

/*
 * THE PICK RANKING FOR EVERY SOCIAL POST (Lawal, 07:55 on 7 November 2026, through the CONTROLLER's 07:58: 'the hierarchy of
 * every night show, the hit shows, the best shows, not just listings ... it has to be bangers. The one with the most crowd has
 * to top the list. You cannot just be random.'). Ranked from what the engine stores: demand (sold out), crowd (the venue's
 * class), pull (the relevance tier), one-off over long runs; fit for the post; a hard floor.
 */
const at = (local: string) => new Date(`${local}+11:00`).toISOString()
const ev = (over: Partial<PickInput>): PickInput => ({
  id: over.title ?? 'x', title: 'A night', venue: 'The Corner Hotel', categorySlug: 'music', ticketed: true, free: false,
  startsAt: at('2026-11-07T20:00:00'), zone: 'Australia/Melbourne', soldOut: false, nightsInListing: 1, ...over,
})

describe('the Tonight post', () => {
  const picks = rankPicks(
    [
      ev({ title: 'Indie gig at the Corner' }),
      ev({ title: 'Benson Boone', venue: 'Rod Laver Arena' }),
      ev({ title: 'Melbourne Victory vs Sydney FC', venue: 'AAMI Park', categorySlug: 'sports' }),
      ev({ title: 'The Little Mermaid', venue: 'The Story House', categorySlug: 'family', startsAt: at('2026-11-07T13:30:00') }),
      ev({ title: 'Baby Rhyme Time', venue: 'Geelong Library', categorySlug: 'family', ticketed: false, free: true }),
      ev({ title: 'Sold out comedy', venue: 'Comedy Theatre', categorySlug: 'comedy', soldOut: true }),
    ],
    'tonight',
  )
  it("the biggest crowd tops it, in Lawal's words: a stadium match over an arena show, a sold out theatre night next, a pub gig under the floor", () => {
    expect(picks.map((p) => p.title)).toEqual(['Melbourne Victory vs Sydney FC', 'Benson Boone', 'Sold out comedy'])
  })
  it('a sold out night carries the demand reason, and passes a night of its own class that is not', () => {
    const sold = picks.find((p) => p.title === 'Sold out comedy')
    expect(sold?.reasons.join(' ')).toMatch(/sold out/)
    const pair = rankPicks([ev({ title: 'Seats left', venue: 'Rod Laver Arena' }), ev({ title: 'Sold out', venue: 'John Cain Arena', soldOut: true })], 'tonight')
    expect(pair.map((p) => p.title)).toEqual(['Sold out', 'Seats left'])
  })
  it("children's theatre, a matinee and a library session never make a Tonight post", () => {
    expect(picks.map((p) => p.title)).not.toContain('The Little Mermaid')
    expect(picks.map((p) => p.title)).not.toContain('Baby Rhyme Time')
  })
  it('every pick clears the floor and says why it is there', () => {
    for (const p of picks) {
      expect(p.score).toBeGreaterThanOrEqual(PICK_FLOOR)
      expect(p.reasons.length).toBeGreaterThan(0)
    }
  })
})

describe('the Free post', () => {
  // Carols by the Bay is free and community at a park; nothing the engine stores yet shows its crowd, so it does not clear
  // the floor (its draw is a signal named for collecting), and the post carries what does.
  it('only free nights that clear the floor; tier 4 never', () => {
    const picks = rankPicks(
      [
        ev({ title: 'Paid gig' }),
        ev({ title: 'Carols by the Bay', venue: 'Steampacket Gardens', categorySlug: 'community', ticketed: false, free: true }),
        ev({ title: 'Palestine Cultural Festival', venue: 'Federation Square', categorySlug: 'festival', ticketed: false, free: true }),
        ev({ title: 'Family Movie Time', venue: 'Biyal-a Armstrong Creek Library', categorySlug: 'family', ticketed: false, free: true }),
      ],
      'free',
    )
    expect(picks.map((p) => p.title)).toEqual(['Palestine Cultural Festival'])
    // A free festival's reason never calls it ticketed (the first output to production said 'a ticketed night').
    expect(picks[0].reasons.join('; ')).not.toMatch(/ticketed/)
  })
})

describe('one-off nights over long runs', () => {
  it('the same night, one of thirty in its run, ranks under a one-off', () => {
    const picks = rankPicks([ev({ title: 'Long run', venue: 'Regent Theatre', nightsInListing: 30 }), ev({ title: 'One night only', venue: 'Regent Theatre' })], 'weekend')
    expect(picks.map((p) => p.title)).toEqual(['One night only', 'Long run'])
  })
})

describe('the floor', () => {
  it('a post carries only what clears it, even if that is two', () => {
    const picks = rankPicks([ev({ title: 'Small free open mic', ticketed: false, free: true, categorySlug: 'music', venue: 'A cafe' })], 'tonight')
    expect(picks).toEqual([])
  })
})
