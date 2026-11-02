// V3 ITEMS 3 AND 4 (Lawal's Growth Engine V3 build checklist, decided 1 November 2026 05:12, "build it as written"):
// the ten-stage acquisition funnel with the actual rate between every stage, split by city, organiser group and source;
// outside tickets, claims and tiers never counted as a sale; and one open, adjustable priority formula whose every
// score shows its inputs and reasons.

import { describe, expect, test } from 'vitest'
import {
  ACQUISITION_STAGES, acquisitionFunnel, funnelSplit, NOT_RECORDED, stagesOf, type OrganiserStageFacts,
} from '@/lib/growth/acquisition-funnel-math'
import { PRIORITY_FORMULA, priorityOf, tiesOf, type PriorityFacts } from '@/lib/growth/priority-math'

const none: OrganiserStageFacts = {
  organiserId: 'o', city: 'Geelong', group: null, source: null, nightsLastAndNext90: 0, permittedContacts: 0,
  touchesSent: 0, replies: 0, interestedReplies: 0, ownershipVerified: false, paidTiers: 0, paidEvents: 0,
}
const org = (id: string, f: Partial<OrganiserStageFacts>): OrganiserStageFacts => ({ ...none, organiserId: id, ...f })

describe('the ten stages, in the checklist order', () => {
  test('are the checklist ten, by name', () => {
    expect(ACQUISITION_STAGES).toEqual([
      'identified', 'qualified', 'contact_permitted', 'contacted', 'responded',
      'interested', 'ownership_verified', 'ticketing_activated', 'first_paid_sale', 'repeat_paid',
    ])
  })

  test('a claim or a ticket tier is never a paid sale; only paid EventLinqs orders are', () => {
    const claimedWithATier = stagesOf(org('a', { ownershipVerified: true, paidTiers: 2 }))
    expect(claimedWithATier.has('ticketing_activated')).toBe(true)
    expect(claimedWithATier.has('first_paid_sale')).toBe(false)
    expect(stagesOf(org('b', { paidEvents: 1 })).has('first_paid_sale')).toBe(true)
    expect(stagesOf(org('b', { paidEvents: 1 })).has('repeat_paid')).toBe(false)
    expect(stagesOf(org('c', { paidEvents: 2 })).has('repeat_paid')).toBe(true)
  })

  test('the actual rate is shown between every stage, and none after a stage of nobody', () => {
    const steps = acquisitionFunnel([
      org('a', { nightsLastAndNext90: 3, permittedContacts: 1, touchesSent: 1, replies: 1 }),
      org('b', { nightsLastAndNext90: 1, permittedContacts: 1 }),
      org('c', { nightsLastAndNext90: 2 }),
      org('d', {}),
    ])
    const at = (s: string) => steps.find((x) => x.stage === s)!
    expect(at('identified')).toMatchObject({ organisers: 4, fromBefore: null })
    expect(at('qualified')).toMatchObject({ organisers: 3, fromBefore: 0.75 })
    expect(at('contact_permitted').fromBefore).toBeCloseTo(2 / 3)
    expect(at('contacted')).toMatchObject({ organisers: 1, fromBefore: 0.5 })
    expect(at('responded')).toMatchObject({ organisers: 1, fromBefore: 1 })
    expect(at('interested')).toMatchObject({ organisers: 0, fromBefore: 0 })
    expect(at('ownership_verified')).toMatchObject({ organisers: 0, fromBefore: null })
  })

  test('split by city, organiser group and source, a missing value named, never dropped', () => {
    const rows = [org('a', { city: 'Melbourne', group: 'ticketed_venue', source: 'listing' }), org('b', { city: 'Melbourne' }), org('c', { city: null })]
    expect(funnelSplit(rows, 'city').map((s) => [s.key, s.steps[0].organisers])).toEqual([['Melbourne', 2], [NOT_RECORDED, 1]])
    expect(funnelSplit(rows, 'group').map((s) => s.key)).toEqual([NOT_RECORDED, 'ticketed_venue'])
    expect(funnelSplit(rows, 'source').reduce((n, s) => n + s.steps[0].organisers, 0)).toBe(3)
  })
})

describe('the priority score', () => {
  const base: PriorityFacts = {
    nightsLastAndNext90: 6, paidNightsLastAndNext90: 6, ties: 'independent', daysToNextNight: 9,
    cityFit: 'focus', engagement: 1, eligible: true,
  }

  test('scores every input by the one formula and shows each input with its points', () => {
    const p = priorityOf(base)
    expect(p.inputs.map((i) => i.input)).toEqual([
      'How often they run events', 'Yearly ticket opportunity', 'Current ticketing ties', 'Next event', 'City fit', 'Engagement', 'Contact eligibility',
    ])
    // 6 nights x 2 = 12; about 12 paid nights a year x 0.5 = 6; independent 15; within 14 days 15; focus 15; 1 x 5 = 5; eligible 5.
    expect(p.inputs.map((i) => i.points)).toEqual([12, 6, 15, 15, 15, 5, 5])
    expect(p.score).toBe(73)
    expect(p.reasons[0]).toMatch(/\(15\)$/)
    expect(p.approachToday).toBe(true)
  })

  test('the formula is adjustable in one place and its caps hold', () => {
    expect(priorityOf({ ...base, nightsLastAndNext90: 40 }).inputs[0].points).toBe(PRIORITY_FORMULA.frequency.max)
    expect(PRIORITY_FORMULA.ties.major).toBeLessThan(PRIORITY_FORMULA.ties.independent)
    expect(PRIORITY_FORMULA.cityFit.focus).toBeGreaterThan(PRIORITY_FORMULA.cityFit.open)
  })

  test('no permitted contact, or already selling through EventLinqs, is never on the list to approach today', () => {
    expect(priorityOf({ ...base, eligible: false }).approachToday).toBe(false)
    expect(priorityOf({ ...base, ties: 'eventlinqs' }).approachToday).toBe(false)
    expect(priorityOf({ ...base, nightsLastAndNext90: 0, paidNightsLastAndNext90: 0, daysToNextNight: null }).approachToday).toBe(false)
  })

  test('ticketing ties read from the platforms: independent sellers first, venue-contracted majors last', () => {
    expect(tiesOf([], false)).toBe('none')
    expect(tiesOf(['humanitix'], false)).toBe('independent')
    expect(tiesOf(['ticketek', 'ticketmaster'], false)).toBe('major')
    expect(tiesOf(['ticketek', 'trybooking'], false)).toBe('independent')
    expect(tiesOf(['humanitix'], true)).toBe('eventlinqs')
  })
})
