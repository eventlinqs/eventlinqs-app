import { describe, expect, it } from 'vitest'
import { buildEventSchemaPayload } from '@/components/features/events/event-schema-jsonld'

/* Read on Beck's live page at 06:21 on 21 November 2026: the event page's lede and meta description left the composed
   placeholder out (train AO), but its structured data still said 'An event on a Thursday evening, tickets through AXS.'
   as its description. The schema takes the same shownSummary (src/lib/listings/placeholder-summary.ts). */
describe("the event's structured data never describes it with a placeholder", () => {
  const base = {
    organisation: { name: 'Margaret Court Arena', slug: null, description: null },
    ticketTiers: [],
    baseUrl: 'https://www.eventlinqs.com.au',
    state: 'upcoming',
  }
  const event = (over: Record<string, unknown>) =>
    ({
      slug: 'beck-margaret-court-arena-2027-02-18', title: 'Beck', status: 'published', created_at: '2026-11-20T11:12:00Z',
      start_date: '2027-02-18T08:30:00Z', end_date: '2027-02-18T13:00:00Z', timezone: 'Australia/Melbourne', event_type: 'physical',
      venue_name: 'Margaret Court Arena', venue_address: 'Olympic Boulevard', venue_city: 'Melbourne', venue_state: 'VIC', venue_country: 'AU',
      category: { slug: 'music', name: 'Music' }, description: null, ...over,
    }) as never
  it("leaves the hunt's composed line out", () => {
    const p = buildEventSchemaPayload({ ...base, event: event({ summary: 'An event on a Thursday evening, tickets through AXS.' }) } as never) as Record<string, unknown>
    expect(String(p.description ?? '')).not.toMatch(/on a Thursday evening/)
  })
  it("keeps a real description", () => {
    const p = buildEventSchemaPayload({ ...base, event: event({ summary: 'Beck returns to Melbourne with his full band.' }) } as never) as Record<string, unknown>
    expect(p.description).toBe('Beck returns to Melbourne with his full band.')
  })
})
