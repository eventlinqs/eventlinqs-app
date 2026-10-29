import { describe, expect, it } from 'vitest'
import { ctaFor, ctaPriceLine } from '@/lib/events/cta'
import { heroSaleWords } from '@/lib/listings/ticket-panel'
import { buildEventMetaDescription } from '@/lib/events/event-meta'

/**
 * NO TICKET IS OFFERED THAT DOES NOT EXIST (the project manager's 22:02 of 28 October 2026, critical class "false
 * ticketing claims" in Lawal's directive).
 *
 * Found on production after #195: /events/afro-fusion-music-showcase-with-mikhaell-friends-a-l1vcpz, a night of
 * Saturday 10 October, said "This event has ended." while its hero and sticky bar said "Get tickets" over "From AUD
 * $18" (window 5's finish pass, C:\dev\EVIDENCE\FINISH-28OCT\RESULT.md); and an event with no summary got the search
 * snippet "Get tickets to <title>" whatever it was. A night that is over offers details and no price, here and on an
 * outside site alike, and the snippet says "Get tickets" only for our own paid tickets.
 */

const AFRO_FUSION_TIERS = [{ price: 1800 }]

describe('a night that is over', () => {
  it('offers details, no price and no chip, whatever its tickets were', () => {
    for (const input of [
      { over: true, tiers: AFRO_FUSION_TIERS },
      { over: true, entryMode: 'walk_in' },
      { over: true, externalTicketUrl: 'https://www.humanitix.com/au/events/x', providerName: 'Humanitix' },
      { over: true, isFree: true },
    ]) {
      const cta = ctaFor(input)
      expect(cta.state).toBe('over')
      expect(cta.action).toBe('View event details')
      expect(cta.chip).toBeNull()
      expect(cta.ticketingByEventLinqs).toBe(false)
      expect(cta.freeEntry).toBe(false)
      expect(ctaPriceLine(cta, { native: 'From AUD $18', outsideChecked: 'From $20' })).toBeNull()
    }
  })

  it('is still on sale when it is not over', () => {
    expect(ctaFor({ over: false, tiers: AFRO_FUSION_TIERS }).action).toBe('Get tickets')
  })

  it('the hero and sticky bar of the ended afro fusion night say details and no price', () => {
    const words = heroSaleWords({
      externalUrl: null,
      panel: null,
      isFree: false,
      saleBlocked: false,
      isSoldOut: false,
      priceLabel: 'From AUD $18',
      cta: ctaFor({ over: true, tiers: AFRO_FUSION_TIERS }),
    })
    expect(words.cta).toBe('View event details')
    expect(words.price).toBeNull()
  })

  it('an ended night sold elsewhere names no outside ticket either', () => {
    const words = heroSaleWords({
      externalUrl: 'https://www.humanitix.com/au/events/x',
      panel: null,
      isFree: false,
      saleBlocked: false,
      isSoldOut: false,
      priceLabel: null,
      cta: ctaFor({ over: true, externalTicketUrl: 'https://www.humanitix.com/au/events/x', providerName: 'Humanitix' }),
    })
    expect(words.cta).toBe('View event details')
    expect(words.price).toBeNull()
  })
})

describe('the search snippet of an event with no summary', () => {
  const base = { title: 'Mystery Event', venueName: 'The Venue', venueCity: null, dateLabel: 'Sat 12 Dec' }

  it('says "Get tickets" only for our own paid tickets', () => {
    expect(buildEventMetaDescription({ ...base, cta: ctaFor({ tiers: AFRO_FUSION_TIERS }) })).toBe(
      'Get tickets to Mystery Event at The Venue on Sat 12 Dec. All-in pricing, no surprise fees.',
    )
  })

  it('claims no ticket for a night sold elsewhere, an unknown price, an ended night, or no call to action', () => {
    for (const cta of [
      ctaFor({ externalTicketUrl: 'https://www.humanitix.com/au/events/x', providerName: 'Humanitix' }),
      ctaFor({}),
      ctaFor({ over: true, tiers: AFRO_FUSION_TIERS }),
      undefined,
    ]) {
      const d = buildEventMetaDescription({ ...base, cta })
      expect(d).not.toContain('Get tickets')
      expect(d).not.toContain('All-in pricing')
      expect(d.startsWith('Mystery Event at The Venue on Sat 12 Dec.')).toBe(true)
    }
  })

  it('names the outside site for a night sold elsewhere', () => {
    expect(
      buildEventMetaDescription({ ...base, cta: ctaFor({ externalTicketUrl: 'https://www.humanitix.com/au/events/x', providerName: 'Humanitix' }) }),
    ).toBe('Mystery Event at The Venue on Sat 12 Dec. Tickets on Humanitix.')
  })
})
