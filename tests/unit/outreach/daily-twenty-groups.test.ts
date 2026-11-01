import { describe, expect, test } from 'vitest'
import { ACQUISITION_STATES } from '@/lib/outreach/acquisition-states'
import { contactFor, groupOf } from '@/lib/outreach/daily-twenty'

/**
 * WHICH GROUP OF THE DAILY TWENTY AN ORGANISER IS IN TODAY, from the acquisition state the database keeps on each
 * organiser (20261030034001), and which of their contacts the action goes to. Pure; the reader
 * (src/lib/outreach/daily-twenty-read.ts) only fetches the rows.
 */

const TODAY = '2026-11-01'

describe('the group from the state', () => {
  test('a first ask goes to an organiser qualified by a night ahead and not yet written to', () => {
    for (const s of ['qualified', 'eligibility_checked', 'ready'] as const) expect(groupOf(s, null, TODAY)).toBe('conversion')
  })
  test('a follow up is due only on or after its day; an open conversation is always a follow up', () => {
    expect(groupOf('contacted', '2026-11-01', TODAY)).toBe('follow_up')
    expect(groupOf('contacted', '2026-10-28', TODAY)).toBe('follow_up')
    expect(groupOf('contacted', '2026-11-04', TODAY)).toBeNull()
    expect(groupOf('contacted', null, TODAY)).toBeNull()
    expect(groupOf('engaged', null, TODAY)).toBe('follow_up')
    expect(groupOf('claim_invited', null, TODAY)).toBe('follow_up')
  })
  test('organisers with nights running with us are the recurring group; claimed partners and the expired are partnerships and reactivation', () => {
    expect(groupOf('active', null, TODAY)).toBe('recurring')
    expect(groupOf('recurring', null, TODAY)).toBe('recurring')
    expect(groupOf('verified', null, TODAY)).toBe('partnership_reactivation')
    expect(groupOf('media_approved', null, TODAY)).toBe('partnership_reactivation')
    expect(groupOf('expired', null, TODAY)).toBe('partnership_reactivation')
  })
  test('a stop, a no, a dispute, a take down, and an organiser with no night ahead are never in the day', () => {
    for (const s of ['suppressed', 'rejected', 'disputed', 'withdrawn', 'discovered'] as const) expect(groupOf(s, '2026-10-01', TODAY)).toBeNull()
  })
  test('every state the database can hold has an answer', () => {
    for (const s of ACQUISITION_STATES) expect(() => groupOf(s, null, TODAY)).not.toThrow()
  })
})

describe('the contact an action goes to', () => {
  const c = (id: string, channel: string, address: string, refusal: string | null, personName: string | null = null) => ({ id, channel, address, personName, refusal })

  test('the contact a running conversation is on, when it may still be written to', () => {
    const picked = contactFor([c('a', 'email', 'info@venue.example', null), c('b', 'email', 'sam@venue.example', null, 'Sam')], 'a')
    expect(picked).toMatchObject({ channel: 'email', address: 'info@venue.example', eligible: true })
  })
  test('else an eligible email, a named person first, then a bookings address, then a general inbox', () => {
    const picked = contactFor([
      c('a', 'email', 'info@venue.example', null),
      c('b', 'email', 'bookings@venue.example', null),
      c('d', 'instagram', '@venue', null),
    ], null)
    expect(picked?.address).toBe('bookings@venue.example')
    expect(contactFor([c('a', 'email', 'info@venue.example', null), c('b', 'email', 'jo@venue.example', null, 'Jo')], null)?.address).toBe('jo@venue.example')
  })
  test('an eligible message channel other than email is used when no email may be written to', () => {
    const picked = contactFor([c('a', 'email', 'info@venue.example', 'refused: they asked not to be contacted'), c('b', 'website_form', 'https://venue.example/contact', null)], null)
    expect(picked).toMatchObject({ channel: 'website_form', eligible: true })
  })
  test('with no contact eligible, the best one comes back with the database refusal, so the day can say why', () => {
    const picked = contactFor([c('a', 'email', 'info@venue.example', 'refused: no basis recorded')], null)
    expect(picked).toEqual({ channel: 'email', address: 'info@venue.example', eligible: false, refusal: 'refused: no basis recorded' })
    expect(contactFor([], null)).toBeNull()
  })
})
