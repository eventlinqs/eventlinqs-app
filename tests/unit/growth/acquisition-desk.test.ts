// V3 ITEM 10, THE GROWTH DESK'S ACQUISITION NUMBERS (Lawal's Growth Engine V3 build checklist): suitable prospects,
// who to approach today and why, eligible contacts, replies, qualified opportunities, ticketing on, first and repeat
// paid sales, revenue, the best channel, every number split by city, group and source. From one facts row per
// organiser (growth_acquisition_facts, 20261101140001).

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'vitest'
import { acquisitionDesk, focusCities, sellersOf, type AcquisitionFactsRow } from '@/lib/growth/acquisition-desk-math'
import { AcquisitionDeskSection } from '@/components/admin/acquisition-desk'

const NOW = new Date('2026-11-01T03:00:00Z')
const OPEN = ['Geelong', 'Melbourne', 'Ballarat', 'Bendigo']
const FOCUS = 'Geelong and Melbourne, one weekend market'
const row = (over: Partial<AcquisitionFactsRow>): AcquisitionFactsRow => ({
  organiser_id: 'o', name: 'Organiser', city: null, group: null, source: null, opportunity_open: false,
  nights_90: 0, paid_nights_90: 0, next_night_at: null, outside_ticket_urls: [], permitted_contacts: 0, eligible_contacts: 0,
  touches_sent: 0, replies: 0, interested_replies: 0, ownership_verified: false, paid_tiers: 0, paid_events: 0, platform_fee_cents: 0,
  ...over,
})

const geelongHost = row({
  organiser_id: 'a', name: 'Geelong Host', city: 'Geelong', group: 'community_paid_organiser', source: 'manual', opportunity_open: true,
  nights_90: 6, paid_nights_90: 6, next_night_at: '2026-11-08T09:00:00Z', outside_ticket_urls: ['https://www.trybooking.com/ABCD'],
  permitted_contacts: 1, eligible_contacts: 1,
})
const sellsHere = row({
  organiser_id: 'b', name: 'Sells Here', city: 'Melbourne', source: 'manual', nights_90: 3, paid_nights_90: 3,
  next_night_at: '2026-11-03T09:00:00Z', eligible_contacts: 1, permitted_contacts: 1, ownership_verified: true,
  paid_tiers: 2, paid_events: 2, platform_fee_cents: 486,
})
const quiet = row({ organiser_id: 'c', name: 'Quiet Host', city: null })
const tierOnly = row({ organiser_id: 'd', name: 'Tier Only', city: 'Ballarat', nights_90: 1, paid_tiers: 1 })

describe('the numbers, each from its proving fact', () => {
  const acq = acquisitionDesk([geelongHost, sellsHere, quiet, tierOnly], NOW, OPEN, FOCUS)

  test('suitable prospects, eligible contacts, qualified opportunities', () => {
    expect(acq.organisers).toBe(4)
    expect(acq.suitableProspects).toBe(3)
    expect(acq.eligibleContacts).toBe(2)
    expect(acq.organisersWithEligibleContact).toBe(2)
    expect(acq.qualifiedOpportunities).toBe(1)
  })

  test('a ticket type is never a sale; revenue is platform fees on paid orders only', () => {
    expect(acq.ticketingOn).toBe(2)
    expect(acq.firstPaidSale).toBe(1)
    expect(acq.repeatPaid).toBe(1)
    expect(acq.platformFeeCents).toBe(486)
  })

  test('who to approach today: eligible, a night to talk about, not already selling here; the focus market first', () => {
    expect(acq.approachToday.map((a) => a.organiserId)).toEqual(['a'])
    expect(acq.approachToday[0].priority.reasons.join(' ')).toMatch(/City fit: the focus market/)
    expect(acq.approachToday[0].priority.reasons.join(' ')).toMatch(/Current ticketing ties: sells through a small independent seller/)
  })

  test('every number is split by city, group and source, a missing value named', () => {
    expect(acq.splits.city.map((s) => s.key).sort()).toEqual(['Ballarat', 'Geelong', 'Melbourne', 'not recorded'])
    expect(acq.splits.group.map((s) => s.key)).toContain('not recorded')
    expect(acq.channels.find((c) => c.key === 'manual')).toEqual({ key: 'manual', organisers: 2, firstPaidSale: 1 })
  })
})

describe('the rules under the numbers', () => {
  test('the focus cities are the open cities the plan names, read from its words', () => {
    expect(focusCities(OPEN, FOCUS)).toEqual(['Geelong', 'Melbourne'])
    expect(focusCities(OPEN, undefined)).toEqual([])
  })

  test("a venue's or organiser's own site is not a ticket seller", () => {
    expect(sellersOf(['https://www.eventbrite.com.au/e/1', 'https://www.thevenue.com.au/whats-on'])).toEqual(['eventbrite'])
  })
})

describe('the section', () => {
  test('says plainly when no channel has a first paid sale and when nobody is on today\'s list', () => {
    const html = renderToStaticMarkup(createElement(AcquisitionDeskSection, { acq: acquisitionDesk([quiet], NOW, OPEN, FOCUS) }))
    expect(html).toContain('No channel has a first paid sale yet, so none is called best.')
    expect(html).toContain('Nobody today:')
    expect(html).not.toMatch(/[–—!]/)
  })

  test('shows the reasons beside each organiser to approach', () => {
    const html = renderToStaticMarkup(createElement(AcquisitionDeskSection, { acq: acquisitionDesk([geelongHost], NOW, OPEN, FOCUS) }))
    expect(html).toContain('Geelong Host')
    expect(html).toContain('of 100.')
    expect(html).toContain('A$0.00')
  })
})
