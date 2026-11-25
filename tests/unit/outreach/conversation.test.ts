import { describe, expect, test } from 'vitest'
import { asksToBePhoned, conversationOf, statedAddressIn } from '@/lib/outreach/conversation'
import { HELLO_MAILBOX, LAWAL_MAILBOX, mailboxFor, OUR_MAILBOXES } from '@/lib/outreach/addresses'

/*
 * ONE CHANNEL PER CONVERSATION (Lawal, 25 November 2026, 14:41 and 14:43; the PM's 14:42 and 14:43, item 4's tests): the
 * same address is kept, on hello@ and on lawal@; a category or sequence that would pick the other sender does not; a
 * stated "email X instead" moves it once and it stays; no request, no move.
 */
describe('the mailbox of a conversation', () => {
  test("Stage 29 Studios: she wrote to lawal@, our answer went from hello@, so her conversation lives on hello@", () => {
    const c = conversationOf(
      [
        { id: '<acq@eventlinqs.com>', at: '2026-11-19T20:00:00Z', mailbox: LAWAL_MAILBOX },
        { id: '<hers@stage29>', at: '2026-11-20T22:02:00Z', mailbox: LAWAL_MAILBOX },
        { id: '<answer@outlook>', at: '2026-11-24T20:01:16Z', mailbox: HELLO_MAILBOX },
      ],
      OUR_MAILBOXES,
    )
    expect(c.mailbox).toBe(HELLO_MAILBOX)
    expect(c.ids).toEqual(['<acq@eventlinqs.com>', '<hers@stage29>', '<answer@outlook>'])
  })

  test('the newest message whose mailbox is known decides; one with none is passed over; none known, none', () => {
    expect(conversationOf([{ id: 'a', at: '2026-11-20T00:00:00Z', mailbox: LAWAL_MAILBOX }, { id: 'b', at: '2026-11-21T00:00:00Z', mailbox: null }], OUR_MAILBOXES).mailbox).toBe(LAWAL_MAILBOX)
    expect(conversationOf([{ id: 'a', at: '2026-11-20T00:00:00Z', mailbox: null }], OUR_MAILBOXES).mailbox).toBeNull()
    expect(conversationOf([{ id: 'a', at: '2026-11-20T00:00:00Z', mailbox: 'someone@else.example' }], OUR_MAILBOXES).mailbox).toBeNull()
    expect(conversationOf([], OUR_MAILBOXES)).toEqual({ ids: [], mailbox: null })
  })

  test('the same address is kept on each mailbox, for any category or sequence; only a first message goes by its category', () => {
    for (const box of [HELLO_MAILBOX, LAWAL_MAILBOX]) {
      for (const category of ['ACQ', 'RET', 'PERM', 'LIST', 'TKT', 'SOC', 'SYS']) {
        for (const purpose of ['cadence', 'relationship', 'reply']) {
          expect(mailboxFor({ category, purpose, conversation: box })).toEqual({ mailbox: box })
        }
      }
    }
    expect(mailboxFor({ category: 'ACQ', purpose: 'cadence', conversation: null })).toEqual({ mailbox: LAWAL_MAILBOX })
    expect(mailboxFor({ category: 'PERM', purpose: 'cadence', conversation: null })).toEqual({ mailbox: HELLO_MAILBOX })
    // A conversation on an address that is not ours is no conversation of ours: the category decides.
    expect(mailboxFor({ category: 'PERM', purpose: 'reply', conversation: 'them@venue.example' })).toEqual({ mailbox: HELLO_MAILBOX })
  })
})

describe('their stated address, in their own words', () => {
  const from = 'info@stage29studios.com.au'
  test('"email X instead" names X', () => {
    expect(statedAddressIn('Thanks Lawal. Please email me at bookings@stage29studios.com.au instead.', { from, ours: OUR_MAILBOXES })).toBe('bookings@stage29studios.com.au')
    expect(statedAddressIn('Going forward, please use Events@Venue.com.au.', { from, ours: OUR_MAILBOXES })).toBe('events@venue.com.au')
  })
  test('no request, no move: an address only mentioned, their own address, ours, or two to choose from', () => {
    expect(statedAddressIn('Yes, that sounds great.', { from, ours: OUR_MAILBOXES })).toBeNull()
    expect(statedAddressIn('Our booker is jo@stage29studios.com.au.', { from, ours: OUR_MAILBOXES })).toBeNull()
    expect(statedAddressIn('You can reach me at info@stage29studios.com.au any time.', { from, ours: OUR_MAILBOXES })).toBeNull()
    expect(statedAddressIn('Please email hello@eventlinqs.com instead', { from, ours: OUR_MAILBOXES })).toBeNull()
    expect(statedAddressIn('Please email a@venue.com.au or b@venue.com.au instead.', { from, ours: OUR_MAILBOXES })).toBeNull()
  })
})

describe('a request to be phoned or texted', () => {
  test('is seen in their words, and only there', () => {
    expect(asksToBePhoned('Can you give me a call on 0412 345 678?')).toBe(true)
    expect(asksToBePhoned('Call me tomorrow morning')).toBe(true)
    expect(asksToBePhoned('Happy to chat on the phone if easier')).toBe(true)
    expect(asksToBePhoned('Yes please list it')).toBe(false)
    expect(asksToBePhoned('We had a call with our board and they agreed')).toBe(false)
  })
})
