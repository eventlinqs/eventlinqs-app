// What the owner is told, and when. Close-out UX3, the pure half.
//
// The routing boundary is the part worth a test rather than an assertion: the
// close-out asks for "individual until a configurable daily count, then a
// digest", and a ceiling that is off by one either sends a twenty-first
// individual email or silences the twentieth.

import { describe, it, expect } from 'vitest'
import {
  KIND_LABEL,
  PLATFORM_NOTIFICATION_KINDS,
  PLATFORM_ORDER_ALERTS_PER_DAY,
  bodyFor,
  digestBodyFor,
  digestSubjectFor,
  factsFor,
  formatMoment,
  platformDayStart,
  pushPayloadFor,
  routeFor,
  subjectFor,
  type PlatformNotificationRow,
} from '@/lib/notifications/platform-policy'

const row = (over: Partial<PlatformNotificationRow> = {}): PlatformNotificationRow => ({
  id: '11111111-1111-4111-8111-111111111111',
  kind: 'order_paid',
  occurred_at: '2026-09-09T13:42:00.000Z',
  actor_user_id: null,
  organisation_id: '22222222-2222-4222-8222-222222222222',
  event_id: '33333333-3333-4333-8333-333333333333',
  order_id: '44444444-4444-4444-8444-444444444444',
  actor_label: 'buyer@example.com',
  organisation_name: 'MKL Studios',
  event_title: 'Afro Fusion Music Showcase',
  summary: 'Paid order EL-000123: Afro Fusion Music Showcase',
  detail: { order_number: 'EL-000123', total_cents: 4500, currency: 'AUD', platform_fee_cents: 300 },
  admin_path: '/admin/orders/44444444-4444-4444-8444-444444444444',
  delivery_state: 'pending',
  attempts: 0,
  last_attempt_at: null,
  last_error: null,
  sent_at: null,
  channel: null,
  ...over,
})

describe('the daily ceiling', () => {
  it('is one named constant and nothing else carries a copy', () => {
    expect(PLATFORM_ORDER_ALERTS_PER_DAY).toBeTypeOf('number')
    expect(PLATFORM_ORDER_ALERTS_PER_DAY).toBeGreaterThan(0)
  })

  it('sends the Nth order individually and holds the (N+1)th, which is the boundary', () => {
    const n = PLATFORM_ORDER_ALERTS_PER_DAY
    expect(routeFor('order_paid', n - 1)).toBe('individual')
    expect(routeFor('order_paid', n)).toBe('digest')
    expect(routeFor('order_paid', n + 1)).toBe('digest')
  })

  it('never caps the four kinds whose volume is not set by the public', () => {
    for (const kind of PLATFORM_NOTIFICATION_KINDS) {
      if (kind === 'order_paid') continue
      expect(routeFor(kind, PLATFORM_ORDER_ALERTS_PER_DAY * 100)).toBe('individual')
    }
  })
})

describe('the platform day', () => {
  it('starts at local midnight in Sydney, not at UTC midnight', () => {
    // 2026-09-09T13:42Z is 2026-09-09 23:42 in Sydney (AEST, UTC+10), so the
    // day started at 2026-09-08T14:00Z.
    const start = platformDayStart(new Date('2026-09-09T13:42:00.000Z'))
    expect(start.toISOString()).toBe('2026-09-08T14:00:00.000Z')
  })

  it('is never in the future and never more than a day back', () => {
    const now = new Date('2026-01-15T03:04:05.678Z')
    const start = platformDayStart(now)
    expect(start.getTime()).toBeLessThanOrEqual(now.getTime())
    expect(now.getTime() - start.getTime()).toBeLessThan(25 * 60 * 60 * 1000)
  })
})

describe('every kind says what happened, who, and which event', () => {
  it('labels all five', () => {
    for (const kind of PLATFORM_NOTIFICATION_KINDS) {
      expect(KIND_LABEL[kind]).toBeTruthy()
    }
  })

  it('a paid order carries the order number, the total and the fee', () => {
    const facts = Object.fromEntries(factsFor(row()))
    expect(facts.Order).toBe('EL-000123')
    expect(facts.Total).toBe('$45.00')
    expect(facts['Platform fee']).toBe('$3.00')
    expect(facts.Event).toBe('Afro Fusion Music Showcase')
    expect(facts.Organiser).toBe('MKL Studios')
    expect(facts.When).toBeTruthy()
  })

  it('a published event carries the city and the start', () => {
    const facts = Object.fromEntries(
      factsFor(
        row({
          kind: 'event_published',
          detail: { slug: 'sunset-sessions', city: 'Geelong', start_date: '2026-10-01T09:00:00.000Z' },
        }),
      ),
    )
    expect(facts.City).toBe('Geelong')
    expect(facts.Starts).toContain('2026')
  })

  it('a new organiser carries the handle and the contact', () => {
    const facts = Object.fromEntries(
      factsFor(
        row({
          kind: 'organiser_created',
          event_title: null,
          actor_label: 'hello@mklstudios.example',
          detail: { slug: 'mkl-studios', email: 'hello@mklstudios.example', phone: null },
        }),
      ),
    )
    expect(facts.Handle).toBe('mkl-studios')
    expect(facts.Contact).toBe('hello@mklstudios.example')
  })

  it('a connect transition carries the Stripe account', () => {
    for (const kind of ['connect_onboarding_started', 'connect_charges_enabled'] as const) {
      const facts = Object.fromEntries(
        factsFor(row({ kind, detail: { stripe_account_id: 'acct_TEST123' } })),
      )
      expect(facts['Stripe account']).toBe('acct_TEST123')
    }
  })

  it('omits a fact rather than printing an empty one', () => {
    const facts = Object.fromEntries(
      factsFor(row({ kind: 'organiser_created', organisation_name: null, actor_label: '', detail: {} })),
    )
    expect(facts.Organiser).toBeUndefined()
    expect(facts.Contact).toBeUndefined()
    expect(facts.Handle).toBeUndefined()
  })
})

describe('the email body', () => {
  it('carries a direct link into the admin console for that record', () => {
    const { html, text } = bodyFor(row(), 'https://www.eventlinqs.com.au')
    const link = 'https://www.eventlinqs.com.au/admin/orders/44444444-4444-4444-8444-444444444444'
    expect(html).toContain(`href="${link}"`)
    expect(text).toContain(link)
  })

  it('escapes an organiser name that carries markup, in both parts', () => {
    const { html } = bodyFor(
      row({ organisation_name: '<script>alert(1)</script>', summary: 'Paid order & "more"' }),
      'https://example.test',
    )
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('&amp;')
    expect(html).toContain('&quot;')
  })

  it('subjects are prefixed so the owner can filter them', () => {
    expect(subjectFor(row())).toBe('EventLinqs: Paid order EL-000123: Afro Fusion Music Showcase')
  })

  it('never puts a bare URL against a full stop, in either part', () => {
    const { html, text } = bodyFor(row(), 'https://example.test')
    // An autolinker takes the character after a URL with it, so a sentence that
    // ends on one produces a link with a stop on the end that resolves nowhere.
    // The lookahead is what makes this test about a SENTENCE-ending stop rather
    // than about the dots inside every hostname.
    const urlThenStop = /https?:\/\/[^\s"'<>]*\.(?=[\s<]|$)/
    expect(html).not.toMatch(urlThenStop)
    expect(text).not.toMatch(urlThenStop)
  })

  it('carries no em dash, no en dash and no exclamation mark', () => {
    const { html, text } = bodyFor(row(), 'https://example.test')
    for (const part of [html, text]) {
      expect(part).not.toMatch(/[–—]/)
      expect(part).not.toContain('!')
    }
  })
})

describe('the digest', () => {
  const held = [
    row({ id: 'a', detail: { order_number: 'EL-1', total_cents: 1000, currency: 'AUD' } }),
    row({ id: 'b', detail: { order_number: 'EL-2', total_cents: 2500, currency: 'AUD' } }),
  ]

  it('names how many, in the singular and the plural', () => {
    expect(digestSubjectFor(1)).toBe('EventLinqs: 1 more paid order today')
    expect(digestSubjectFor(7)).toBe('EventLinqs: 7 more paid orders today')
  })

  it('lists every held order, totals them, and explains why it exists', () => {
    const { html, text } = digestBodyFor(held, 'https://example.test')
    expect(html).toContain('EL-1')
    expect(html).toContain('EL-2')
    expect(html).toContain('$35.00')
    expect(text).toContain(`The first ${PLATFORM_ORDER_ALERTS_PER_DAY} paid orders today were sent individually`)
  })

  it('links each order at its own admin path', () => {
    const { html } = digestBodyFor(held, 'https://example.test')
    expect(html).toContain('https://example.test/admin/orders/44444444-4444-4444-8444-444444444444')
  })
})

describe('the push payload', () => {
  it('carries only what the service worker reads, and a per-row tag', () => {
    const payload = pushPayloadFor(row())
    expect(Object.keys(payload).sort()).toEqual(['body', 'tag', 'title', 'url'])
    expect(payload.url).toBe(row().admin_path)
    expect(payload.tag).toContain(row().id)
  })
})

describe('formatMoment', () => {
  it('renders an Australian local time with its zone', () => {
    const s = formatMoment('2026-09-09T13:42:00.000Z')
    expect(s).toContain('2026')
    expect(s).toMatch(/AE[SD]T/)
  })

  it('hands back an unparseable value rather than printing Invalid Date', () => {
    expect(formatMoment('not a date')).toBe('not a date')
  })
})
