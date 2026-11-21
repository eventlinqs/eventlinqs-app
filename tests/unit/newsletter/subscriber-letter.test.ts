import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { subscriberLetter } from '@/lib/newsletter/subscriber-letter'
import { NEWSLETTER_DESIGN_A_LIVE } from '@/lib/newsletter/design-a-live'
import type { WhatsOnInput } from '@/lib/newsletter/whats-on'

/*
 * ONE SUBSCRIBER'S EDITION (law 45 (a), law 46): read once per city, each reader's own links put in. Design A carries
 * the reader's unsubscribe link and the Manage link by the same token, so the one click header, the body link and the
 * Manage page name one person; while design A is not live for subscribers, the built digest is the letter.
 */
const ORIGIN = 'https://www.eventlinqs.com.au'
const TOKEN = '6f1c2a9e-3b4d-4c5e-8f60-718293a4b5c6'
const pick = { slug: 'jazz-night', title: 'Jazz Night', categoryLabel: 'Music', categorySlug: 'music', whenLabel: 'Fri 27 Nov, 8pm', venue: 'The Barwon Club', priceLabel: 'Free entry', image: 'https://img.example/x.jpg', imageAlt: 'A photograph of the night' }
const edition: WhatsOnInput = {
  edition: 'weekend',
  editionId: 'weekend-geelong-2026-11-27',
  cityName: 'Geelong',
  citySlug: 'geelong',
  datesLabel: 'Fri 27 to Sun 29 Nov 2026',
  subjectDates: 'Fri 27 to Sun 29 Nov',
  areaLabel: 'Geelong & Surrounds',
  heroImage: null,
  intro: 'A big weekend in Geelong.',
  featured: null,
  highlights: [pick],
  free: null,
  gem: null,
  drive: null,
  alerts: [],
  origin: ORIGIN,
  unsubscribeUrl: `${ORIGIN}/account/notifications`,
  manageUrl: `${ORIGIN}/newsletter/city`,
  referUrl: `${ORIGIN}/newsletter/refer`,
  webUrl: `${ORIGIN}/newsletter/weekend/geelong/2026-11-27`,
} as WhatsOnInput
const base = { origin: ORIGIN, edition: 'weekend' as const, citySlug: 'geelong', cityName: 'Geelong', period: { start: '2026-11-27', end: '2026-11-29' }, token: TOKEN, events: [{ id: 'e1', slug: 'jazz-night', title: 'Jazz Night', dateLabel: 'Fri 27 Nov, 8pm', venueLabel: 'The Barwon Club', priceLabel: 'Free entry', url: `${ORIGIN}/events/jazz-night` }] }

describe("a subscriber's edition carries that reader's own links", () => {
  it('design A: the unsubscribe link and the Manage link both name the reader by their token', () => {
    const letter = subscriberLetter({ ...base, designA: { edition, period: { start: '2026-11-27' } } })
    expect(letter.html).toContain(`${ORIGIN}/unsubscribe/digest/${TOKEN}`)
    expect(letter.html).toContain(`${ORIGIN}/newsletter/city?t=${TOKEN}`)
    expect(letter.html).not.toContain(`href="${ORIGIN}/account/notifications"`)
    expect(letter.text).toContain(`${ORIGIN}/unsubscribe/digest/${TOKEN}`)
    expect(letter.html).toContain(`${ORIGIN}/newsletter/weekend/geelong/2026-11-27`)
  })

  it('built: the digest as it has been, with the reader’s unsubscribe link', () => {
    const letter = subscriberLetter({ ...base, designA: null })
    expect(letter.subject).toMatch(/^This weekend in Geelong/)
    expect(letter.html).toContain(`${ORIGIN}/unsubscribe/digest/${TOKEN}`)
  })

  it('design A waits for subscribers until its pages answer and its greeting is ruled, said in its own module', () => {
    expect(NEWSLETTER_DESIGN_A_LIVE).toBe(false)
    const src = readFileSync(join(process.cwd(), 'src/lib/newsletter/design-a-live.ts'), 'utf8')
    expect(src).toContain('Kind regards,')
    expect(src).toContain('must read 200 on')
  })
})

describe('the send record is keyed by edition (20261121170001)', () => {
  it('edition defaults to week, is week or weekend, and joins the unique key', () => {
    const sql = readFileSync(join(process.cwd(), 'supabase/migrations/20261121170001_digest_sends_by_edition.sql'), 'utf8')
    expect(sql).toContain("add column if not exists edition text not null default 'week'")
    expect(sql).toContain("check (edition in ('week', 'weekend'))")
    expect(sql).toContain('unique (city_slug, edition, period_start)')
  })
})
