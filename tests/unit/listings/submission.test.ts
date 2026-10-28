import { describe, expect, test } from 'vitest'
import { PERMISSION_WORDS, judgeSubmission, priceCents, type SubmissionInput } from '../../../src/lib/listings/submission'

/**
 * H1, the organiser's submission of an outside event (the release checklist, the project manager's 13:10 of
 * 28 October 2026). The judgement the form, its action and the database share.
 */

const NOW = new Date('2026-10-28T03:00:00.000Z') // 14:00 in Melbourne

const GOOD: SubmissionInput = {
  name: 'Bp Test Organiser',
  email: 'Organiser@Example.com ',
  role: 'organiser',
  title: 'Night Market on the Bay',
  startsLocal: '2026-11-07T18:00',
  endsLocal: '2026-11-07T22:00',
  venueName: 'Steampacket Gardens',
  venueAddress: 'Eastern Beach Road, Geelong VIC 3220',
  city: 'geelong',
  bookingUrl: 'https://www.humanitix.com/au/events/night-market-on-the-bay',
  entry: 'paid',
  price: '12.50',
  description: 'Forty stalls and live music by the water.',
  hasPhoto: true,
  photoOwned: true,
  authority: true,
  permission: true,
}

const judge = (patch: Partial<SubmissionInput>) => judgeSubmission({ ...GOOD, ...patch }, NOW)
const problemOf = (patch: Partial<SubmissionInput>) => {
  const j = judge(patch)
  return j.ok ? null : j.problem
}

describe('a submission that passes', () => {
  test('becomes one row in the database\'s own shape, the start read in Melbourne time', () => {
    const j = judge({})
    expect(j.ok).toBe(true)
    if (!j.ok) return
    expect(j.row).toMatchObject({
      email: 'organiser@example.com',
      starts_at: '2026-11-07T07:00:00.000Z',
      ends_at: '2026-11-07T11:00:00.000Z',
      city_slug: 'geelong',
      booking_url: 'https://www.humanitix.com/au/events/night-market-on-the-bay',
      entry: 'paid',
      price_from_cents: 1250,
      photo_owned: true,
      permission_given_at: NOW.toISOString(),
    })
  })

  test("keeps the permission line in the exact words agreed to: Lawal's one line (K4, as the project manager's 14:53 words it)", () => {
    const j = judge({})
    expect(j.ok && j.row.permission_words).toBe(PERMISSION_WORDS)
    expect(PERMISSION_WORDS).toBe("Yes, you're welcome to use our event promotional material for EventLinqs listings and social posts, now and for future events.")
    expect(j.ok && [j.row.authority_confirmed, j.row.photo_owned]).toEqual([true, true])
  })

  test('with no photo it is still a whole submission: discovery never waits for an image (K)', () => {
    const j = judge({ hasPhoto: false, photoOwned: false })
    expect(j.ok).toBe(true)
    expect(j.ok && j.row.photo_owned).toBe(false)
  })

  test('a free event with no price stays free with no price; a paid one with no price keeps none, never invented', () => {
    const free = judge({ entry: 'free', price: '' })
    expect(free.ok && [free.row.entry, free.row.price_from_cents]).toEqual(['free', null])
    const paid = judge({ entry: 'paid', price: '' })
    expect(paid.ok && [paid.row.entry, paid.row.price_from_cents]).toEqual(['paid', null])
  })
})

describe('a submission that is refused says why', () => {
  test('a photo sent and not owned, no authority, no permission', () => {
    expect(problemOf({ photoOwned: false })).toMatch(/own the photo/)
    expect(problemOf({ authority: false })).toMatch(/can give permission/)
    expect(problemOf({ permission: false })).toMatch(/promotional material/)
  })

  test('a booking page that is not https, carries a script, or is EventLinqs itself', () => {
    for (const bookingUrl of ['http://example.com/e', 'javascript:alert(1)', 'data:text/html,hi', 'https://exa mple.com', 'example.com/e', '']) {
      expect(problemOf({ bookingUrl }), bookingUrl).toMatch(/https address/)
    }
    expect(problemOf({ bookingUrl: 'https://www.eventlinqs.com.au/events/x' })).toMatch(/not an EventLinqs page/)
  })

  test('a start in the past, too far ahead, or an end before it', () => {
    expect(problemOf({ startsLocal: '2026-10-28T13:00' })).toMatch(/in the past/)
    expect(problemOf({ startsLocal: '2028-11-07T18:00', endsLocal: '' })).toMatch(/18 months/)
    expect(problemOf({ endsLocal: '2026-11-07T17:00' })).toMatch(/before the start/)
    expect(problemOf({ startsLocal: '' })).toMatch(/starts/)
  })

  test('a price on a free event, or a price that is not dollars', () => {
    expect(problemOf({ entry: 'free', price: '10' })).toMatch(/only for paid/)
    expect(problemOf({ entry: 'free_registration', price: '10' })).toMatch(/only for paid/)
    expect(problemOf({ price: 'ten dollars' })).toMatch(/in dollars/)
  })

  test('a city outside the four, a role or entry not offered, a missing field', () => {
    expect(problemOf({ city: 'sydney' })).toMatch(/city/)
    expect(problemOf({ role: 'fan' })).toMatch(/connected/)
    expect(problemOf({ entry: 'donation' })).toMatch(/free, free with registration, or paid/)
    expect(problemOf({ name: ' ' })).toMatch(/your name/)
    expect(problemOf({ email: 'not an email' })).toMatch(/email/)
    expect(problemOf({ title: '' })).toMatch(/name of the event/)
    expect(problemOf({ venueName: '' })).toMatch(/venue/)
    expect(problemOf({ venueAddress: '' })).toMatch(/address/)
  })
})

describe('priceCents', () => {
  test('reads dollars as typed', () => {
    expect([priceCents('35'), priceCents('35.5'), priceCents('$35.50'), priceCents('0'), priceCents('35.505')]).toEqual([3500, 3550, 3550, null, null])
  })
})
