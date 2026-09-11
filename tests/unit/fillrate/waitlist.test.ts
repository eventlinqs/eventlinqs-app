import { describe, expect, test } from 'vitest'
import { HOLD_MINUTES, hasLapsed, isLive, planWaitlist, type HoldRow, type JoinRow } from '@/lib/fillrate/waitlist'

/**
 * WHO IS NEXT WHEN A UNIT FREES UP. Close-out D2, the second of three.
 *
 *     "Inventory class sold out, person joins waitlist. A refund or release
 *      frees a unit, the waitlist is notified in join order with a time limited
 *      hold that passes down the list on expiry."
 *
 * Every case below is a way a real person is treated wrongly: offered a place
 * twice, offered one after buying, offered one after saying stop, or left at the
 * top of a queue for ever because the person above them let their turn run out
 * and the queue looped on them. None of these can be observed through a mailbox,
 * which is why the decision is a pure function and this file executes it.
 */

const NOW = new Date('2026-09-11T10:00:00.000Z')
const minutesAgo = (n: number) => new Date(NOW.getTime() - n * 60_000).toISOString()
const minutesAhead = (n: number) => new Date(NOW.getTime() + n * 60_000).toISOString()

let nextId = 1
const join = (over: Partial<JoinRow> = {}): JoinRow => ({
  demandEntryId: nextId++,
  slotId: 'slot-1',
  organisationId: 'org-1',
  contactEmail: `person${nextId}@example.com`,
  joinedAt: minutesAgo(600),
  inventoryClass: 'General',
  unitsWanted: 1,
  ...over,
})

const hold = (over: Partial<HoldRow> = {}): HoldRow => ({
  id: nextId++,
  demandEntryId: 999,
  contactEmail: 'holder@example.com',
  inventoryClass: 'General',
  units: 1,
  expiresAt: minutesAhead(10),
  claimedAt: null,
  releasedAt: null,
  ...over,
})

const fakeHash = (email: string) => `h:${email.trim().toLowerCase()}`

const plan = (over: Partial<Parameters<typeof planWaitlist>[0]> = {}) =>
  planWaitlist({
    joins: [],
    holds: [],
    unitsFree: 1,
    suppressed: new Set(),
    boughtHashes: new Set(),
    slotStartsAt: '2026-12-01T09:00:00.000Z',
    recoveryEnabled: true,
    now: NOW,
    hash: fakeHash,
    ...over,
  })

describe('a hold has three states and only three', () => {
  test('an unclaimed hold with time left is live', () => {
    expect(isLive(hold(), NOW)).toBe(true)
    expect(hasLapsed(hold(), NOW)).toBe(false)
  })

  test('an unclaimed hold whose time ran out has lapsed', () => {
    const ran = hold({ expiresAt: minutesAgo(1) })
    expect(isLive(ran, NOW)).toBe(false)
    expect(hasLapsed(ran, NOW)).toBe(true)
  })

  test('a claimed hold is neither live nor lapsed, whatever the clock says', () => {
    const taken = hold({ expiresAt: minutesAgo(30), claimedAt: minutesAgo(31) })
    expect(isLive(taken, NOW)).toBe(false)
    expect(hasLapsed(taken, NOW)).toBe(false)
  })

  test('a released hold is finished too, so it is not released a second time', () => {
    const given = hold({ expiresAt: minutesAgo(30), releasedAt: minutesAgo(29) })
    expect(hasLapsed(given, NOW)).toBe(false)
  })
})

describe('the offer goes down the queue in the order people joined', () => {
  test('one free unit goes to the person who joined first', () => {
    const first = join({ contactEmail: 'first@example.com', joinedAt: minutesAgo(900) })
    const second = join({ contactEmail: 'second@example.com', joinedAt: minutesAgo(300) })
    const { toOffer, passedOver } = plan({ joins: [first, second], unitsFree: 1 })
    expect(toOffer.map(o => o.join.contactEmail)).toEqual(['first@example.com'])
    expect(passedOver.find(p => p.contactEmail === 'second@example.com')?.reason).toMatch(/nothing free/)
  })

  test('two free units reach two people, not one person twice', () => {
    const joins = [join({ contactEmail: 'a@example.com' }), join({ contactEmail: 'b@example.com' })]
    const { toOffer } = plan({ joins, unitsFree: 2 })
    expect(toOffer.map(o => o.join.contactEmail)).toEqual(['a@example.com', 'b@example.com'])
  })

  test('somebody who asked for more places than are free is offered what there is', () => {
    const wants3 = join({ contactEmail: 'a@example.com', unitsWanted: 3 })
    const { toOffer } = plan({ joins: [wants3], unitsFree: 2 })
    expect(toOffer[0].units).toBe(2)
  })

  test('the offer runs out at the hold window, not at some other time', () => {
    const { toOffer } = plan({ joins: [join()], unitsFree: 1 })
    expect(Date.parse(toOffer[0].expiresAt) - NOW.getTime()).toBe(HOLD_MINUTES * 60_000)
  })
})

describe('a live hold is somebody elses unit', () => {
  test('a unit already held is not offered to anybody else', () => {
    const held = hold({ contactEmail: 'holder@example.com', units: 1 })
    const { toOffer, passedOver } = plan({
      joins: [join({ contactEmail: 'next@example.com' })],
      holds: [held],
      unitsFree: 1,
    })
    expect(toOffer).toHaveLength(0)
    expect(passedOver[0].reason).toMatch(/nothing free/)
  })

  test('the person already holding one is not offered a second', () => {
    const held = hold({ contactEmail: 'holder@example.com' })
    const { toOffer, passedOver } = plan({
      joins: [join({ contactEmail: 'holder@example.com' })],
      holds: [held],
      unitsFree: 2,
    })
    expect(toOffer).toHaveLength(0)
    expect(passedOver[0].reason).toMatch(/already holding one/)
  })
})

describe('a hold that runs out passes down the list, which is the whole feature', () => {
  test('the lapsed hold is released, and the released unit goes to the next person', () => {
    const lapsed = hold({ contactEmail: 'first@example.com', expiresAt: minutesAgo(1) })
    const second = join({ contactEmail: 'second@example.com', joinedAt: minutesAgo(300) })
    const { toRelease, toOffer } = plan({ joins: [second], holds: [lapsed], unitsFree: 1 })
    expect(toRelease.map(h => h.contactEmail)).toEqual(['first@example.com'])
    expect(toOffer.map(o => o.join.contactEmail)).toEqual(['second@example.com'])
  })

  test('the person whose turn ran out does not get offered the same unit again', () => {
    const lapsed = hold({ contactEmail: 'first@example.com', expiresAt: minutesAgo(1) })
    const first = join({ contactEmail: 'first@example.com', joinedAt: minutesAgo(900) })
    const second = join({ contactEmail: 'second@example.com', joinedAt: minutesAgo(300) })
    const { toOffer, passedOver } = plan({ joins: [first, second], holds: [lapsed], unitsFree: 1 })
    expect(toOffer.map(o => o.join.contactEmail)).toEqual(['second@example.com'])
    expect(passedOver.find(p => p.contactEmail === 'first@example.com')?.reason).toMatch(/had their turn/)
  })

  test('a lapsed hold is not counted as spoken for, or the freed unit would never move', () => {
    const lapsed = hold({ contactEmail: 'gone@example.com', expiresAt: minutesAgo(5) })
    const { toOffer } = plan({ joins: [join({ contactEmail: 'next@example.com' })], holds: [lapsed], unitsFree: 1 })
    expect(toOffer).toHaveLength(1)
  })
})

describe('the rules about writing to a person hold here too', () => {
  test('an address that has unsubscribed is passed over', () => {
    const person = join({ contactEmail: 'stop@example.com' })
    const { toOffer, passedOver } = plan({ joins: [person], suppressed: new Set(['stop@example.com']) })
    expect(toOffer).toHaveLength(0)
    expect(passedOver[0].reason).toMatch(/unsubscribed/)
  })

  test('somebody who already bought is passed over, matched on the hash a sale row carries', () => {
    const person = join({ contactEmail: 'bought@example.com' })
    const { toOffer, passedOver } = plan({
      joins: [person],
      boughtHashes: new Set([fakeHash('bought@example.com')]),
    })
    expect(toOffer).toHaveLength(0)
    expect(passedOver[0].reason).toMatch(/already bought/)
  })

  test('a sale row hashed on a deployment without the key still passes the person over', () => {
    const unkeyed = (email: string) => `unkeyed:${email.trim().toLowerCase()}`
    const person = join({ contactEmail: 'bought@example.com' })
    const { toOffer, passedOver } = plan({
      joins: [person],
      boughtHashes: new Set([unkeyed('bought@example.com')]),
      fingerprints: (email) => [fakeHash(email), unkeyed(email)],
    })
    expect(toOffer).toHaveLength(0)
    expect(passedOver[0].reason).toMatch(/already bought/)
  })

  test('an organiser who switched recovery off for the slot is obeyed', () => {
    const { toOffer, passedOver } = plan({ joins: [join()], recoveryEnabled: false })
    expect(toOffer).toHaveLength(0)
    expect(passedOver[0].reason).toMatch(/switched recovery off/)
  })

  test('a slot that has already started produces no offer, because it would be a lie', () => {
    const { toOffer, passedOver } = plan({ joins: [join()], slotStartsAt: minutesAgo(60) })
    expect(toOffer).toHaveLength(0)
    expect(passedOver[0].reason).toMatch(/already started/)
  })

  test('a lapsed hold is still released on a slot that has started, so nothing is left open', () => {
    const lapsed = hold({ expiresAt: minutesAgo(5) })
    const { toRelease } = plan({ joins: [join()], holds: [lapsed], slotStartsAt: minutesAgo(60) })
    expect(toRelease).toHaveLength(1)
  })

  test('a caller with no hash function gets no money based suppression, and it is silent by design', () => {
    const person = join({ contactEmail: 'bought@example.com' })
    const { toOffer } = planWaitlist({
      joins: [person],
      holds: [],
      unitsFree: 1,
      suppressed: new Set(),
      boughtHashes: new Set([fakeHash('bought@example.com')]),
      slotStartsAt: '2026-12-01T09:00:00.000Z',
      recoveryEnabled: true,
      now: NOW,
    })
    expect(toOffer).toHaveLength(1)
  })
})
