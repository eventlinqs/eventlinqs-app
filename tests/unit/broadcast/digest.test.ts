// Weekly digest core proof.
//
// The invariants under test:
//   1. Consent gating: only status='granted' rows are recipients (the
//      mechanical guarantee behind "unsubscribe stops the next send").
//   2. Content hygiene: private and seed events never reach a digest.
//   3. The email carries the Spam Act essentials: sender identification and
//      the recipient's own unsubscribe link, in both HTML and text parts.
//   4. The period is exactly the seven days from the send date.

import { describe, expect, test, vi } from 'vitest'

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => {
    throw new Error('admin client must not be constructed when a client is injected')
  },
}))

import {
  buildDigestEmailHtml,
  fetchDigestEvents,
  fetchDigestRecipients,
  resolveDigestPeriod,
} from '@/lib/broadcast/digest'

type Row = Record<string, unknown>

/** A stub client whose final awaited builder resolves the given rows, and
 * which records the filters applied so the consent gate is provable. */
function stubClient(rows: Row[], captured: Record<string, unknown>) {
  const builder: Record<string, unknown> = {}
  const chain = (name: string) =>
    ((...args: unknown[]) => {
      captured[`${name}:${String(args[0])}`] = args[1]
      return builder
    }) as unknown
  builder.select = chain('select')
  builder.eq = chain('eq')
  builder.gte = chain('gte')
  builder.lte = chain('lte')
  builder.not = chain('not')
  builder.order = chain('order')
  builder.limit = (() => builder) as unknown
  builder.then = ((resolve: (v: { data: Row[] }) => void) =>
    resolve({ data: rows })) as unknown
  return {
    from: () => builder,
  } as never
}

describe('digest period', () => {
  test('covers exactly the seven days from the send date', () => {
    const period = resolveDigestPeriod(new Date('2026-07-04T22:00:00Z'))
    expect(period.start).toBe('2026-07-04')
    expect(period.end).toBe('2026-07-11')
  })
})

describe('consent gating', () => {
  test('recipients query filters to granted rows for the city', async () => {
    const captured: Record<string, unknown> = {}
    const client = stubClient(
      [{ email: 'a@example.com', unsubscribe_token: 'tok-a' }],
      captured,
    )
    const recipients = await fetchDigestRecipients(client, 'geelong')
    expect(recipients).toEqual([{ email: 'a@example.com', unsubscribeToken: 'tok-a' }])
    expect(captured['eq:status']).toBe('granted')
    expect(captured['eq:city_slug']).toBe('geelong')
  })
})

describe('content hygiene', () => {
  test('private and seed events are filtered out', async () => {
    const base = {
      slug: 's',
      title: 'T',
      start_date: '2026-07-05T09:00:00Z',
      timezone: 'Australia/Melbourne',
      venue_name: 'V',
      venue_city: 'Geelong',
      ticket_tiers: [{ price: 0, currency: 'AUD' }],
    }
    const client = stubClient(
      [
        { ...base, slug: 'public-real', visibility: 'public', is_seed_data: false },
        { ...base, slug: 'private-one', visibility: 'private', is_seed_data: false },
        { ...base, slug: 'seed-one', visibility: 'public', is_seed_data: true },
      ],
      {},
    )
    const events = await fetchDigestEvents(client, 'geelong', {
      start: '2026-07-04',
      end: '2026-07-11',
    })
    expect(events.map((e) => e.slug)).toEqual(['public-real'])
  })
})

describe('the digest email', () => {
  const built = buildDigestEmailHtml({
    cityName: 'Geelong',
    events: [
      {
        slug: 'harbour-jazz',
        title: 'Harbour Jazz Night',
        dateLabel: 'Sat 11 Jul',
        venueLabel: 'The Wharf, Geelong',
        priceLabel: 'From $25',
      },
    ],
    origin: 'https://staging.eventlinqs.com',
    unsubscribeUrl: 'https://staging.eventlinqs.com/unsubscribe/digest/tok-123',
  })

  test('subject names the city and the count', () => {
    expect(built.subject).toBe('This week in Geelong: 1 event worth a look')
  })

  test('html carries the event link, sender identity, and unsubscribe link', () => {
    expect(built.html).toContain('/events/harbour-jazz')
    expect(built.html).toContain('EventLinqs, hello@eventlinqs.com')
    expect(built.html).toContain('/unsubscribe/digest/tok-123')
    expect(built.html).toContain('This week in Geelong')
  })

  test('text part carries the unsubscribe link and sender identity too', () => {
    expect(built.text).toContain('/unsubscribe/digest/tok-123')
    expect(built.text).toContain('EventLinqs, hello@eventlinqs.com')
  })

  test('titles are html-escaped', () => {
    const evil = buildDigestEmailHtml({
      cityName: 'Geelong',
      events: [
        {
          slug: 'x',
          title: '<script>alert(1)</script>',
          dateLabel: 'Sat',
          venueLabel: '',
          priceLabel: 'Free entry',
        },
      ],
      origin: 'https://staging.eventlinqs.com',
      unsubscribeUrl: 'https://staging.eventlinqs.com/unsubscribe/digest/t',
    })
    expect(evil.html).not.toContain('<script>alert(1)</script>')
    expect(evil.html).toContain('&lt;script&gt;')
  })
})
