/**
 * ONE ORGANISER'S RECORD (the Growth OS directive, Release 1's acceptance: "one organiser record shows everything that
 * happened, everything pending and the next action"). The record gathers every source, newest first; what waits is
 * listed oldest first; the next action names the first thing waiting; the right to write is its own fact.
 */
import { describe, expect, it } from 'vitest'
import { recordOf, type Sources } from '@/lib/crm/timeline-math'
import { NEXT_ACTION } from '@/lib/crm/stages'

const base: Sources = {
  organiser: { id: 'o1', name: 'Hop Temple', created_at: '2026-10-28T01:00:00Z', acquisition_state: 'eligibility_checked', found_on: 'https://hoptemple.com.au' },
  contacts: [{ id: 'c1', channel: 'email', address: 'info@hoptemple.com.au', role: 'Bookings', basis: 'conspicuous_publication', basis_recorded_at: '2026-10-29T02:00:00Z', created_at: '2026-10-29T01:00:00Z' }],
  transitions: [{ from_state: 'qualified', to_state: 'eligibility_checked', proved_by: 'organiser_contacts', at: '2026-10-29T02:00:01Z' }],
  touches: [],
  replies: [],
  unsubscribes: [],
  venues: [{ venue_id: 'v1', name: 'Hop Temple', linked_at: '2026-10-28T03:00:00Z' }],
  nights: [{ id: 'e1', title: 'Hop Temple Trivia', slug: 'hop-temple-trivia-2026-11-18', start_date: '2026-11-18T08:00:00Z', status: 'published', created_at: '2026-11-01T00:00:00Z' }],
  claims: [],
  submissions: [],
  permissions: [],
  photos: [],
  ticketing: { ticketingActivated: false, paidOrders: 0, paidMonths: 0 },
  paidOrders: [],
}

describe("an organiser's record", () => {
  it('gathers every source into one history, newest first, each line from its own row', () => {
    const r = recordOf(base)
    expect(r.lines.map((l) => l.kind)).toEqual(['night', 'stage', 'contact', 'contact', 'venue', 'record'])
    expect(r.lines[0].words).toBe('Night listed: Hop Temple Trivia (2026-11-18, published)')
    expect(r.lines[0].href).toBe('/events/hop-temple-trivia-2026-11-18')
    for (let i = 1; i < r.lines.length; i++) expect(r.lines[i - 1].at >= r.lines[i].at).toBe(true)
  })

  it("with nothing waiting, the next action is the stage's own", () => {
    const r = recordOf(base)
    expect(r.stage).toBe('qualified')
    expect(r.pending).toEqual([])
    expect(r.nextAction).toBe(NEXT_ACTION.qualified)
  })

  it('lists what waits, oldest first, and the next action names the first of it', () => {
    const r = recordOf({
      ...base,
      touches: [
        { id: 't2', contact_id: 'c1', step: 2, state: 'held', subject: 'Re: Your trivia nights', drafted_at: '2026-11-10T00:00:00Z', sent_at: null, void_reason: null, held_because: null, failed_reason: null },
        { id: 't1', contact_id: 'c1', step: 1, state: 'held', subject: 'Your trivia nights, could I ask your advice?', drafted_at: '2026-11-05T00:00:00Z', sent_at: null, void_reason: null, held_because: ['waits for Lawal'], failed_reason: null },
      ],
      replies: [{ id: 'r1', contact_id: 'c1', received_at: '2026-11-08T00:00:00Z', outcome: 'question', needs_lawal: true }],
    })
    expect(r.pending.map((p) => p.kind)).toEqual(['held_message', 'reply_to_read', 'held_message'])
    expect(r.pending[0].words).toBe('First message to info@hoptemple.com.au waits for approval: waits for Lawal')
    expect(r.nextAction).toBe(`${NEXT_ACTION.qualified} (first: ${r.pending[0].words})`)
  })

  it('a failed message is pending until resolved, never dropped', () => {
    const r = recordOf({ ...base, touches: [{ id: 't1', contact_id: 'c1', step: 1, state: 'held', subject: null, drafted_at: '2026-11-05T00:00:00Z', sent_at: null, void_reason: null, held_because: null, failed_reason: 'Graph answered 503' }] })
    expect(r.pending.some((p) => p.kind === 'failed_message' && /Graph answered 503/.test(p.words))).toBe(true)
  })

  it('a paid order is on the history and moves the stage to First Sale', () => {
    const r = recordOf({ ...base, ticketing: { ticketingActivated: true, paidOrders: 1, paidMonths: 1 }, paidOrders: [{ order_number: 'EL-1001', total_cents: 3500, confirmed_at: '2026-11-11T09:00:00Z', event_id: 'e1' }] })
    expect(r.stage).toBe('first_sale')
    expect(r.lines[0].words).toBe('Paid order EL-1001: $35.00')
  })

  it('no message may reach them once every email address is unsubscribed, whatever the stage', () => {
    expect(recordOf(base).mayWrite).toBe(true)
    expect(recordOf({ ...base, unsubscribes: [{ email: 'INFO@hoptemple.com.au', created_at: '2026-11-09T00:00:00Z', reason: null }] }).mayWrite).toBe(false)
    expect(recordOf({ ...base, organiser: { ...base.organiser, acquisition_state: 'suppressed' } }).mayWrite).toBe(false)
  })
})
