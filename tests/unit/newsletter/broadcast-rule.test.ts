import { describe, expect, it } from 'vitest'
import { broadcastProblems } from '@/lib/email/broadcast'
import { contactAddress } from '@/lib/email/sender'
import { subscriberLetter } from '@/lib/newsletter/subscriber-letter'
import type { WhatsOnInput } from '@/lib/newsletter/whats-on'

/*
 * THE BROADCAST RULE (the PM's 15:35 of 21 November 2026, ruling 1): the newsletter is a broadcast, exempt from the
 * letter's greeting and sign off, and held instead by a named rule: the sender named in the footer with its contact
 * address, the reader's own unsubscribe, no dashes, no placeholder. Every design A edition a subscriber is sent passes it,
 * and one that fails it is never sent.
 */
const ORIGIN = 'https://www.eventlinqs.com.au'
const pick = (slug: string, title: string) => ({ slug, title, categoryLabel: 'Festival', categorySlug: 'festivals', whenLabel: 'Sat 28 Nov, 7:30pm', venue: 'Federation Square', priceLabel: 'Free entry', image: 'https://img.example/x.jpg', imageAlt: 'A photograph of the night' })
const edition = (over: Partial<WhatsOnInput> = {}): WhatsOnInput => ({
  edition: 'weekend',
  editionId: 'weekend-melbourne-2026-11-28',
  cityName: 'Melbourne',
  citySlug: 'melbourne',
  datesLabel: 'Sat 28 to Sun 29 Nov 2026',
  subjectDates: 'Sat 28 to Sun 29 Nov',
  areaLabel: 'Melbourne & Surrounds',
  heroImage: { desktop: 'https://img.example/hero-d.jpg', mobile: 'https://img.example/hero-m.jpg' },
  intro: 'Here is the best of this weekend in Melbourne.',
  featured: { ...pick('amcf-2026', 'African Music and Cultural Festival 2026'), blurb: 'Walk in, it is free.', featImage: { desktop: 'https://img.example/feat-d.jpg', mobile: 'https://img.example/feat-m.jpg' } },
  highlights: [pick('colours-of-asia', 'Colours of Asia: Garden of Wonders')],
  free: null,
  gem: null,
  drive: null,
  alerts: [],
  origin: ORIGIN,
  unsubscribeUrl: `${ORIGIN}/unsubscribe/digest/placeholder`,
  manageUrl: `${ORIGIN}/newsletter/city`,
  referUrl: `${ORIGIN}/newsletter/refer`,
  ...over,
}) as WhatsOnInput

const letter = (over: Partial<WhatsOnInput> = {}) =>
  subscriberLetter({
    origin: ORIGIN,
    edition: 'weekend',
    citySlug: 'melbourne',
    cityName: 'Melbourne',
    period: { start: '2026-11-28', end: '2026-11-29' },
    token: 'tok123',
    events: [],
    designA: { edition: edition(over), period: { start: '2026-11-28' } },
  })

describe('the broadcast rule', () => {
  it('a design A edition as a subscriber receives it passes: the sender and its contact address, their own unsubscribe', () => {
    const out = letter()
    const unsubscribeUrl = `${ORIGIN}/unsubscribe/digest/tok123`
    expect(broadcastProblems({ ...out, unsubscribeUrl })).toEqual([])
    expect(out.text).toContain(contactAddress('hello'))
  })

  it('names each fault: no contact address, no unsubscribe, a dash, a placeholder', () => {
    const unsubscribeUrl = `${ORIGIN}/unsubscribe/digest/tok123`
    const html = `<html><body><p>Big night — on now</p><p>Tickets TBA</p><p>EventLinqs, Geelong VIC, Australia.</p></body></html>`
    const problems = broadcastProblems({ html, text: 'Big night - on now\nEventLinqs, Geelong VIC, Australia.', unsubscribeUrl })
    expect(problems.join('\n')).toMatch(/footer does not name EventLinqs/)
    expect(problems.join('\n')).toMatch(/em or en dash/)
    expect(problems.join('\n')).toMatch(/spaced hyphen/)
    expect(problems.join('\n')).toMatch(/placeholder \(TBA\)/)
    expect(problems.join('\n')).toMatch(/no link to the reader's own unsubscribe/)
  })

  it('a design A edition that fails the rule is never sent: the letter refuses it', () => {
    expect(() => letter({ intro: 'Something on for undefined.' })).toThrow(/fails the broadcast rule.*placeholder \(undefined\)/)
  })
})
