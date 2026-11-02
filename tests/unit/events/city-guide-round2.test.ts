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
    expect(guide).toMatch(/grid-cols-\[4\.25rem_minmax\(0,1fr\)\]/)
    expect(guide).toMatch(/<span className="whitespace-nowrap[^"]*">\{r\.time \?\? ''\}<\/span>/)
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
