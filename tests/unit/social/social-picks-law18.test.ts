import { describe, expect, it } from 'vitest'
import { ctaFor, ctaPriceLine, type CtaInput } from '@/lib/events/cta'
import { selectNights, socialTierOf, type CampaignNight } from '@/lib/social/campaign'

/*
 * LAW 18 IN THE SOCIAL PICKS (Lawal's 14:07 of 15 November 2026: "relevant events and most priority events are
 * included"; the PM's relay: law 18's tiers, tier 4 never in a lead post). The posts' picks use the guide's own tier
 * (src/lib/events/relevance.ts): a ticketed night at a headline venue leads a sooner free one; a library session, story
 * time, class or workshop is never picked for a post, however soon.
 */
let seq = 0
function night(over: Partial<CampaignNight> & { at: string; state?: CtaInput }): CampaignNight {
  seq += 1
  const cta = ctaFor(over.state ?? { entryMode: 'walk_in', isFree: true })
  return {
    eventId: `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`,
    slug: `l18-night-${seq}`,
    title: `Night ${seq}`,
    startDate: over.at,
    timezone: 'Australia/Melbourne',
    citySlug: 'geelong',
    cityName: 'Geelong',
    venueName: 'The Barwon Club',
    host: 'The Barwon Club',
    categorySlug: 'music',
    summary: 'A night of local bands in the front bar. Doors at seven.',
    approvedPhotoUrl: null,
    photoCredit: null,
    cta,
    priceLine: ctaPriceLine(cta, { native: 'From $25' }),
    ...over,
  }
}

describe('law 18 in the social picks', () => {
  const headline = night({ at: '2026-11-21T09:00:00Z', title: 'Boyz II Men', venueName: 'GMHBA Stadium', host: 'Live Nation', state: { tiers: [{ price: 9900 }] } })
  const free = night({ at: '2026-11-17T09:00:00Z', title: 'Open mic', venueName: 'The Barwon Club', host: 'Barwon' })
  const library = night({ at: '2026-11-16T00:00:00Z', title: 'Story time for toddlers', venueName: 'Geelong Library', host: 'Library', categorySlug: 'family' })

  it('the tiers are the guide\'s own', () => {
    expect(socialTierOf(library)).toBe(4)
    expect(socialTierOf(free)).toBe(3)
  })

  it('a ticketed headline night leads a sooner free one', () => {
    const { nights, picks } = selectNights([library, free, headline], 2)
    expect(nights.map((n) => n.title)).toContain('Boyz II Men')
    const reason = picks.find((p) => p.eventId === headline.eventId)?.reason ?? ''
    expect(reason).toMatch(/a (headline|ticketed) night/)
  })

  it('tier then date: a Friday arena show leads a week of sooner bar shows (law 18 (c))', () => {
    const sooner = Array.from({ length: 60 }, (_, i) =>
      night({ at: `2026-11-16T${String(9 + (i % 10)).padStart(2, '0')}:00:00Z`, title: `Bar show ${i}`, venueName: `Room ${i}`, host: `Room ${i}`, categorySlug: `music-${i}`, state: { tiers: [{ price: 2500 }] } }),
    )
    const arena = night({ at: '2026-11-20T08:30:00Z', title: 'Two Door Cinema Club', venueName: 'John Cain Arena', host: 'AXS', state: { tiers: [{ price: 9900 }] } })
    expect(socialTierOf(arena)).toBe(1)
    const { nights } = selectNights([...sooner, arena], 5)
    expect(nights.map((n) => n.title)).toContain('Two Door Cinema Club')
  })

  it('a class at a headline venue is still a session, never a lead pick', () => {
    const term = night({ at: '2026-11-17T22:15:00Z', title: 'Song Play Term Four', venueName: 'Melbourne Recital Centre', host: 'Melbourne Recital Centre', state: { tiers: [{ price: 2200 }] } })
    expect(socialTierOf(term)).toBe(4)
    expect(selectNights([term, free, headline], 5).nights.map((n) => n.title)).not.toContain('Song Play Term Four')
  })

  it('a tier 4 session is never picked for a post, however soon', () => {
    const { nights } = selectNights([library, free, headline], 5)
    expect(nights.map((n) => n.title)).not.toContain('Story time for toddlers')
  })
})
