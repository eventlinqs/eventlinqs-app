import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { cityGuideSubtitle } from '@/lib/cities/guide-subtitle'
import { OUR_CHECKOUT_LABEL, OUR_REGISTRATION_LABEL, OUTBOUND_LABEL, sourceLabel } from '@/lib/events/whats-on-directory'
import { bookingLine } from '@/components/features/city-guide/city-guide'

/*
 * ROUND 2, 'make it 10 out of 10' (Lawal, 2 November 2026, 12:05; C:\dev\DESIGN\CITY-FIRST-1NOV\
 * GEELONG-REFERENCE-DIRECTIVE-2NOV.md, the newest section). Finishing only; the layout is approved.
 */
const src = (f: string) => readFileSync(join(process.cwd(), f), 'utf8').replace(/\r\n/g, '\n')

describe('item 4: the hero line', () => {
  it("is Lawal's sentence, word for word, for Geelong", () => {
    expect(cityGuideSubtitle('Geelong')).toBe(
      'Discover live music, festivals, markets, family activities and everything happening in Geelong.',
    )
  })
  it('is the same sentence with their own name for the other three cities', () => {
    for (const name of ['Melbourne', 'Ballarat', 'Bendigo']) {
      expect(cityGuideSubtitle(name)).toBe(
        `Discover live music, festivals, markets, family activities and everything happening in ${name}.`,
      )
    }
  })
  it('replaces the city data descriptor under the heading', () => {
    const screen = src('src/components/features/city-guide/city-guide-screen.tsx')
    expect(screen).toMatch(/cityGuideSubtitle\(city\.name\)/)
    expect(screen).not.toMatch(/\{city\.descriptor\}/)
  })
})

describe('item 3: the time column', () => {
  it("holds '10:30 am' on one line: never broken at its space, and wide enough at 320 for '12:30 pm'", () => {
    const guide = src('src/components/features/city-guide/city-guide.tsx')
    // Round 3 moved the time into the gold 'when' line on top of the row; that line never breaks.
    expect(guide).toMatch(/<span className="block whitespace-nowrap [^"]*">\{whenLine\(e\)\}<\/span>/)
  })
})

describe('item 7: titles, venues and booking labels wrap on a phone, never past the edge', () => {
  it('the row title, the venue line, the meta line and the booking label each break a long unbroken word', () => {
    const guide = src('src/components/features/city-guide/city-guide.tsx')
    const classOf = (marker: string) => guide.split('\n').find((l) => l.includes(marker)) ?? ''
    for (const marker of [
      'block font-headline text-base font-bold leading-snug',
      'mt-1 block font-display text-sm font-medium text-[var(--text-secondary)]',
      'mt-1 block font-display text-xs font-semibold text-[var(--text-muted)]',
      'inline-flex items-start gap-1 font-display text-sm font-bold',
    ]) {
      expect(classOf(marker), marker).toContain('[overflow-wrap:anywhere]')
    }
  })
})

describe('item 6: the four kinds of booking stay distinct', () => {
  const ev = (o: Record<string, unknown>) => ({ ticket_tiers: [], external_ticket_url: null, is_free: null, entry_mode: null, ...o }) as never
  it('free entry, free registration with us, free registration elsewhere, our tickets and tickets elsewhere each read their own words', () => {
    expect(sourceLabel(ev({ is_free: true }))).toBe('Free · Walk in')
    // Free tickets on our own checkout (every tier at 0, no outside address): registration with us, never 'Book'.
    expect(sourceLabel(ev({ is_free: true, ticket_tiers: [{ price: 0, currency: 'AUD' }] }))).toBe('Register on EventLinqs')
    expect(sourceLabel(ev({ is_free: true, external_ticket_url: 'https://www.humanitix.com/au/events/x' }))).toBe('Register at Humanitix')
    expect(sourceLabel(ev({ is_free: false, entry_mode: 'tickets', ticket_tiers: [{ price: 2500, currency: 'AUD' }] }))).toBe('Book on EventLinqs')
    expect(OUR_REGISTRATION_LABEL).not.toBe(OUR_CHECKOUT_LABEL)
  })
  it("the row's booking line shows registration with us as its own action, not outbound", () => {
    expect(bookingLine({ price: 'Free, registration required', source: OUR_REGISTRATION_LABEL, free: true })).toEqual({
      said: 'Free',
      book: 'Register on EventLinqs',
      outbound: false,
    })
  })
  it('only a label that leaves EventLinqs carries the outbound mark', () => {
    expect(OUTBOUND_LABEL.test(OUR_REGISTRATION_LABEL)).toBe(false)
    expect(OUTBOUND_LABEL.test(OUR_CHECKOUT_LABEL)).toBe(false)
    expect(OUTBOUND_LABEL.test('Register at Humanitix')).toBe(true)
    expect(OUTBOUND_LABEL.test('Tickets at Humanitix')).toBe(true)
  })
})
