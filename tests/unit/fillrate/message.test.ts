import { describe, expect, test } from 'vitest'
import { compose, composeOffer, priceLine, whenItIs } from '@/lib/fillrate/message'
import { UNIT_WORDS } from '@/lib/fillrate/words'

/**
 * WHAT A REAL PERSON READS. Close-out D2.
 *
 *     "Each names the slot, the inventory class, the price, and links to a
 *      resumable checkout. No discount in v0."
 *
 *     "All customer facing copy is parameterised by slot category."
 *
 * The industry test is the one that matters most and is the easiest to lose: the
 * same function, given a category the ledger recorded, has to produce a message
 * that reads correctly for a business this platform does not serve. A guard
 * proves no line SAYS a forbidden word; only this proves the right word arrives.
 */

const facts = (over: Partial<Parameters<typeof compose>[0]> = {}) => ({
  slotName: 'Afro-Fusion Showcase',
  slotAt: '2026-10-10T09:00:00.000Z',
  slotTimezone: 'Australia/Melbourne',
  category: 'music',
  inventoryClass: 'General admission',
  unitAmountCents: 1800,
  currency: 'AUD',
  messageNumber: 1 as 1 | 2 | 3,
  resumeUrl: 'https://www.eventlinqs.com.au/events/afro-fusion#tickets',
  unsubscribeUrl: 'https://www.eventlinqs.com.au/unsubscribe/recovery/tok-1',
  organiserName: 'MKL Studios',
  signature: 'The EventLinqs team. Where every community celebrates.',
  ...over,
})

describe('the message names the four things the close-out lists', () => {
  test('it names the slot, in the subject and in the body', () => {
    const m = compose(facts())
    expect(m.subject).toContain('Afro-Fusion Showcase')
    expect(m.html).toContain('Afro-Fusion Showcase')
    expect(m.text).toContain('Afro-Fusion Showcase')
  })

  test('it names the inventory class and the price together', () => {
    const m = compose(facts())
    expect(m.text).toContain('General admission, $18.00 each')
    expect(m.html).toContain('General admission, $18.00 each')
  })

  test('it links to somewhere they can finish', () => {
    const m = compose(facts())
    expect(m.html).toContain('https://www.eventlinqs.com.au/events/afro-fusion#tickets')
    expect(m.text).toContain('https://www.eventlinqs.com.au/events/afro-fusion#tickets')
  })

  test('it carries a way to stop, in both bodies, on every message in the sequence', () => {
    for (const messageNumber of [1, 2, 3] as const) {
      const m = compose(facts({ messageNumber }))
      expect(m.html).toContain('/unsubscribe/recovery/tok-1')
      expect(m.text).toContain('/unsubscribe/recovery/tok-1')
    }
  })

  test('there is no discount in v0, and no word that offers one', () => {
    for (const messageNumber of [1, 2, 3] as const) {
      const m = compose(facts({ messageNumber }))
      expect(m.text.toLowerCase()).not.toMatch(/discount|voucher|% off|promo code|coupon/)
    }
  })
})

describe('the copy is parameterised by the category, which is the portability test', () => {
  test('a ticketed category reads as one', () => {
    expect(compose(facts({ category: 'music' })).unitWord).toBe('ticket')
  })

  test('a gym class reads as a class, with no line of the composer changing', () => {
    const m = compose(facts({ category: 'fitness' }))
    expect(m.unitWord).toBe('class')
    expect(m.subject).toContain('class')
    expect(m.subject).not.toContain('ticket')
  })

  test('a category nobody has mapped reads as the vaguest of the six, never as the likeliest', () => {
    const m = compose(facts({ category: 'something-nobody-has-mapped' }))
    expect(m.unitWord).toBe('place')
    expect(UNIT_WORDS).toContain(m.unitWord)
  })
})

describe('the three messages are three different messages', () => {
  test('each has its own subject, so an inbox does not thread them into one', () => {
    const subjects = ([1, 2, 3] as const).map(n => compose(facts({ messageNumber: n })).subject)
    expect(new Set(subjects).size).toBe(3)
  })

  test('the last one says it is the last one', () => {
    expect(compose(facts({ messageNumber: 3 })).subject.toLowerCase()).toContain('last')
  })
})

describe('what it does when the ledger recorded less than it would like', () => {
  test('a slot with no recorded price says less rather than inventing a number', () => {
    const m = compose(facts({ unitAmountCents: null }))
    expect(m.text).toContain('General admission')
    expect(m.text).not.toMatch(/\$\d/)
  })

  test('a free place is called free, not zero dollars', () => {
    expect(priceLine(0)).toBe('free')
  })

  test('a slot with no recorded class still names the slot and the price', () => {
    const m = compose(facts({ inventoryClass: null }))
    expect(m.text).toContain('Afro-Fusion Showcase')
    expect(m.text).toContain('$18.00')
  })

  test('an unreadable timestamp produces no date line rather than "Invalid Date"', () => {
    expect(whenItIs('not-a-date', 'Australia/Melbourne')).toBe('')
    const m = compose(facts({ slotAt: 'not-a-date' }))
    expect(m.text).not.toContain('Invalid')
  })

  test('the slot is described in its own timezone, not in the one this machine runs on', () => {
    const melbourne = whenItIs('2026-10-10T09:00:00.000Z', 'Australia/Melbourne')
    const perth = whenItIs('2026-10-10T09:00:00.000Z', 'Australia/Perth')
    expect(melbourne).not.toBe(perth)
  })
})

describe('the offer message, for the waiting list half', () => {
  const offer = (over: Partial<Parameters<typeof composeOffer>[0]> = {}) =>
    composeOffer({
      slotName: 'Afro-Fusion Showcase',
      slotAt: '2026-10-10T09:00:00.000Z',
      slotTimezone: 'Australia/Melbourne',
      category: 'music',
      inventoryClass: 'General admission',
      units: 1,
      expiresAt: '2026-09-11T10:15:00.000Z',
      claimUrl: 'https://www.eventlinqs.com.au/events/afro-fusion#tickets',
      unsubscribeUrl: 'https://www.eventlinqs.com.au/unsubscribe/recovery/tok-1',
      organiserName: 'MKL Studios',
      signature: 'The EventLinqs team. Where every community celebrates.',
      ...over,
    })

  test('it says when the offer runs out, in the lead rather than in a footnote', () => {
    const m = offer()
    expect(m.text.split('\n')[0]).toMatch(/until/)
  })

  test('it says the place passes to the next person, which is what actually happens', () => {
    expect(offer().text).toMatch(/passes to the next person waiting/)
  })

  test('it uses the category word here too', () => {
    expect(offer({ category: 'fitness' }).subject).toContain('class')
  })

  test('more than one place reads as a plural', () => {
    expect(offer({ units: 2, category: 'music' }).text).toContain('2 tickets')
  })

  test('it carries a way to stop, like every other message', () => {
    expect(offer().html).toContain('/unsubscribe/recovery/tok-1')
  })
})

describe('the link a person actually clicks', () => {
  /*
   * FOUND BY OPENING IT, 11 September 2026. The adapter appended its attribution
   * to the end of a URL that already ended in `#tickets`, so everything after
   * the hash became the FRAGMENT:
   *
   *     /events/<slug>#tickets?utm_source=eventlinqs&...
   *
   * The parameters were never query parameters, so the organiser's analytics saw
   * none of them, and the fragment stopped matching the `id="tickets"` element,
   * which is the one thing the link exists to do.
   */
  test('the query goes before the fragment, and the fragment survives', async () => {
    const { withAttribution } = await import('@/lib/recovery/links')
    const url = withAttribution('https://www.eventlinqs.com.au/events/a-slot#tickets', 'recovery')
    expect(url).toBe(
      'https://www.eventlinqs.com.au/events/a-slot?utm_source=eventlinqs&utm_medium=email&utm_campaign=recovery#tickets',
    )
    expect(new URL(url).hash).toBe('#tickets')
    expect(new URL(url).searchParams.get('utm_campaign')).toBe('recovery')
  })

  test('a url with no fragment is left with no fragment', async () => {
    const { withAttribution } = await import('@/lib/recovery/links')
    const url = withAttribution('https://www.eventlinqs.com.au/events/a-slot', 'recovery')
    expect(new URL(url).hash).toBe('')
    expect(new URL(url).searchParams.get('utm_source')).toBe('eventlinqs')
  })

  test('a url that already carries a query keeps it', async () => {
    const { withAttribution } = await import('@/lib/recovery/links')
    const url = withAttribution('https://www.eventlinqs.com.au/events/a-slot?ref=x#tickets', 'recovery')
    expect(new URL(url).searchParams.get('ref')).toBe('x')
    expect(new URL(url).searchParams.get('utm_medium')).toBe('email')
    expect(new URL(url).hash).toBe('#tickets')
  })
})
