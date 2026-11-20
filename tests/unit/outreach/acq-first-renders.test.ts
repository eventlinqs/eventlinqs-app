import { describe, expect, it } from 'vitest'
import { fillTemplate, renderTemplate } from '@/lib/outreach/rules'

/*
 * LAWAL'S APPROVED ORGANISER MARKETING LETTER RENDERS EXACTLY AS APPROVED (train AE, 20 November 2026; the PM's 08:37
 * item 4, T7). acq_first v1 is production's template text as read on 20 November 2026; the expected letter is the one
 * drawn for Geelong Symphony Orchestra that morning and VALIDATED by gateway.py (its unsubscribe token replaced by a test
 * token). Until this train the drafter left '[organiser]', '[what they run, or events]' and '[unsubscribe link]' unfilled
 * and would have written the guide link as /city/Geelong, so every such draft was held for a missing field.
 */
const ACQ_FIRST_V1 = { channel: 'email' as const, purpose: 'cadence' as const, step: 1, subject: "Complimentary EventLinqs listing for [organiser]", body: "Hi [organiser] team,\n\nI hope you're well.\n\nI came across [organiser] and thought your [what they run, or events] would be a great addition to our [city] events guide.\n\nYou can see the guide here: eventlinqs.com.au/city/[city]\n\nWe'd be happy to prepare a complimentary listing for your next event, with a direct link to your existing booking page. Your ticketing arrangements stay exactly as they are, and we'll handle the setup.\n\nWould you be happy for us to prepare a listing and send it to you for review?\n\nKind regards,\nLawal Adams\nFounder, EventLinqs\neventlinqs.com.au\nABN 30 837 447 587\nGeelong, VIC, Australia\n\nIf you'd rather I didn't write again, just reply and say so, or unsubscribe here: [unsubscribe link]" }
const APPROVED_LETTER = "Hi Geelong Symphony Orchestra team,\n\nI hope you're well.\n\nI came across Geelong Symphony Orchestra and thought your events would be a great addition to our Geelong events guide.\n\nYou can see the guide here: eventlinqs.com.au/city/geelong\n\nWe'd be happy to prepare a complimentary listing for your next event, with a direct link to your existing booking page. Your ticketing arrangements stay exactly as they are, and we'll handle the setup.\n\nWould you be happy for us to prepare a listing and send it to you for review?\n\nKind regards,\nLawal Adams\nFounder, EventLinqs\neventlinqs.com.au\nABN 30 837 447 587\nGeelong, VIC, Australia\n\nIf you'd rather I didn't write again, just reply and say so, or unsubscribe here: https://www.eventlinqs.com.au/unsubscribe/outreach?t=00000000-0000-4000-8000-000000000001"
const UNSUBSCRIBE = "https://www.eventlinqs.com.au/unsubscribe/outreach?t=00000000-0000-4000-8000-000000000001"
const FIELDS = { organiser: 'Geelong Symphony Orchestra', city: 'Geelong', 'city slug': 'geelong', 'what they run, or events': 'events' }

describe('acq_first v1 for one organiser, from rows', () => {
  it('renders word for word the letter the gateway validated, and holds for nothing', () => {
    const r = renderTemplate(ACQ_FIRST_V1, FIELDS, UNSUBSCRIBE)
    expect(r.body).toBe(APPROVED_LETTER)
    expect(r.subject).toBe('Complimentary EventLinqs listing for Geelong Symphony Orchestra')
    expect(r.heldBecause).toEqual([])
  })
  it('writes the guide link with the city slug, never its name', () => {
    const r = renderTemplate(ACQ_FIRST_V1, FIELDS, UNSUBSCRIBE)
    expect(r.body).toContain('You can see the guide here: eventlinqs.com.au/city/geelong')
    expect(r.body).not.toContain('/city/Geelong')
    expect(r.body).toContain('our Geelong events guide')
  })
  it('leaves the link unfilled, and so held, when no slug was read', () => {
    const { 'city slug': _slug, ...noSlug } = FIELDS
    void _slug
    const r = renderTemplate(ACQ_FIRST_V1, noSlug, UNSUBSCRIBE)
    expect(r.body).toContain('eventlinqs.com.au/city/[city]')
    expect(r.heldBecause.length).toBeGreaterThan(0)
  })
  it('leaves a missing organiser unfilled, and so held', () => {
    const { organiser: _o, ...noName } = FIELDS
    void _o
    const r = renderTemplate(ACQ_FIRST_V1, noName, UNSUBSCRIBE)
    expect(r.body).toContain('[organiser]')
    expect(r.heldBecause.length).toBeGreaterThan(0)
  })
})

describe('a placeholder inside a city guide path', () => {
  it('takes its slug field, and a placeholder anywhere else takes the name', () => {
    expect(fillTemplate('our [city] guide: eventlinqs.com.au/city/[city]', { city: 'Ballarat', 'city slug': 'ballarat' })).toBe('our Ballarat guide: eventlinqs.com.au/city/ballarat')
  })
  it('stays unfilled without its slug, never takes the name', () => {
    expect(fillTemplate('eventlinqs.com.au/city/[city]', { city: 'Ballarat' })).toBe('eventlinqs.com.au/city/[city]')
  })
})
