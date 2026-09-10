import { describe, expect, test } from 'vitest'
import {
  decide,
  holdoutIsDue,
  HOLDOUT_THRESHOLD_ABANDONMENTS,
  MESSAGE_DELAYS_HOURS,
  messageDueFor,
  sentKey,
  sequenceLengthFor,
  type DemandRow,
  type SlotFacts,
  type SlotRow,
} from '@/lib/fillrate/due'
import { unitWord, unitWordPlural, DEFAULT_UNIT_WORD } from '@/lib/fillrate/words'

/**
 * THE RULES ABOUT CONTACTING A REAL PERSON. Close-out D2.
 *
 * Every test here is a rule that, broken, sends an email to somebody who should
 * not have received one. That is why the decision is a pure function: the only
 * way to be sure a rule holds is to execute it against the cases that would
 * break it, and a rule you can only reach through a mailbox cannot be executed
 * at all.
 *
 * The close-out's own list, each with a test:
 *   - only ever about the slot they themselves started buying;
 *   - never the unsubscribed;
 *   - never anyone who already bought;
 *   - never anyone whose money came back;
 *   - never when the organiser switched it off;
 *   - never after the slot started or once it sold out;
 *   - never the same message twice.
 */
const NOW = new Date('2026-09-10T12:00:00.000Z')
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString()

const slot = (over: Partial<SlotRow> = {}): SlotRow => ({
  id: 'slot-1',
  sourceRef: 'ref-1',
  organisationId: 'org-1',
  category: 'music',
  subcategory: 'afrobeats',
  slotAt: '2026-10-10T09:00:00.000Z',
  capacity: 100,
  recoveryEnabled: true,
  ...over,
})

const abandonment = (over: Partial<DemandRow> = {}): DemandRow => ({
  id: 1,
  slotId: 'slot-1',
  organisationId: 'org-1',
  action: 'checkout_abandoned',
  contactEmail: 'Buyer@Example.com',
  occurredAt: hoursAgo(3),
  inventoryClass: 'General Admission',
  unitAmountCents: 2500,
  ...over,
})

const facts = (over: Partial<SlotFacts> = {}): SlotFacts => ({
  boughtHashes: new Set<string>(),
  refundedHashes: new Set<string>(),
  unitsSold: 10,
  alreadySent: new Set<string>(),
  ...over,
})

/*
 * THE HASH, STUBBED, AND THAT IS THE POINT OF INJECTING IT.
 *
 * A money row in the ledger carries a keyed `buyer_hash` and never an address,
 * so "did this person already buy" is a comparison between two hashes. `decide`
 * takes the function rather than importing one, so this test can execute the
 * rule with a hash it can read, and a source system with a different scheme
 * needs no change here.
 */
const fakeHash = (email: string) => `h:${email.trim().toLowerCase()}`

const run = (over: Partial<Parameters<typeof decide>[0]> = {}) =>
  decide({
    slot: slot(),
    demand: [abandonment()],
    facts: facts(),
    suppressed: new Set(),
    now: NOW,
    hash: fakeHash,
    ...over,
  })

describe('who is due a message', () => {
  test('somebody who walked away three hours ago is due the first message', () => {
    const { send } = run()
    expect(send).toHaveLength(1)
    expect(send[0].messageNumber).toBe(1)
    // Lower cased, because the address is a key everywhere else in this engine.
    expect(send[0].contactEmail).toBe('buyer@example.com')
    expect(send[0].inventoryClass).toBe('General Admission')
    expect(send[0].unitAmountCents).toBe(2500)
  })

  test('somebody who walked away one hour ago is due nothing yet', () => {
    const { send, refused } = run({ demand: [abandonment({ occurredAt: hoursAgo(1) })] })
    expect(send).toHaveLength(0)
    expect(refused[0].reason).toMatch(/no message is due yet/)
  })

  test('a sweep that has been down for a week sends ONE message, not three', () => {
    // The LATEST due message, never a catch-up burst. Somebody who has been gone
    // four days must not receive three emails in three minutes.
    const { send } = run({ demand: [abandonment({ occurredAt: hoursAgo(96) })] })
    expect(send).toHaveLength(1)
    expect(send[0].messageNumber).toBe(3)
  })

  test('the three delays are the ones the close-out names', () => {
    expect([...MESSAGE_DELAYS_HOURS]).toEqual([2, 24, 72])
  })

  test('each message follows the one before it as the hours pass', () => {
    const sent = new Set<string>()
    const at = (h: number) => messageDueFor(hoursAgo(h), NOW, sent, 'buyer@example.com')
    expect(at(1)).toBeNull()
    expect(at(3)).toBe(1)
    sent.add(sentKey('buyer@example.com', 1))
    expect(at(3)).toBeNull()
    expect(at(25)).toBe(2)
    sent.add(sentKey('buyer@example.com', 2))
    expect(at(25)).toBeNull()
    expect(at(80)).toBe(3)
    sent.add(sentKey('buyer@example.com', 3))
    expect(at(80)).toBeNull()
  })
})

describe('who must never be written to', () => {
  test('a row belonging to another slot is refused, whatever else is true of it', () => {
    const { send, refused } = run({ demand: [abandonment({ slotId: 'somebody-elses-slot' })] })
    expect(send).toHaveLength(0)
    expect(refused[0].reason).toMatch(/belongs to another slot/)
  })

  test('an address that has unsubscribed is refused', () => {
    const { send, refused } = run({ suppressed: new Set(['buyer@example.com']) })
    expect(send).toHaveLength(0)
    expect(refused[0].reason).toMatch(/unsubscribed/)
  })

  test('somebody who already bought on this slot is refused', () => {
    const { send, refused } = run({ facts: facts({ boughtHashes: new Set([fakeHash('buyer@example.com')]) }) })
    expect(send).toHaveLength(0)
    expect(refused[0].reason).toMatch(/already bought/)
  })

  test('somebody whose money came back is refused, which is not the same rule', () => {
    const { send, refused } = run({ facts: facts({ refundedHashes: new Set([fakeHash('buyer@example.com')]) }) })
    expect(send).toHaveLength(0)
    expect(refused[0].reason).toMatch(/money came back/)
  })

  test('an organiser who switched it off for their slot is obeyed', () => {
    const { send, refused } = run({ slot: slot({ recoveryEnabled: false }) })
    expect(send).toHaveLength(0)
    expect(refused[0].reason).toMatch(/switched recovery off/)
  })

  test('a slot that has already started is refused, because the message would be a lie', () => {
    const { send, refused } = run({ slot: slot({ slotAt: '2026-09-01T09:00:00.000Z' }) })
    expect(send).toHaveLength(0)
    expect(refused[0].reason).toMatch(/already started/)
  })

  test('a slot that has sold out is refused, for the same reason', () => {
    const { send, refused } = run({ slot: slot({ capacity: 10 }), facts: facts({ unitsSold: 10 }) })
    expect(send).toHaveLength(0)
    expect(refused[0].reason).toMatch(/sold out/)
  })

  test('a slot with no recorded capacity can never be "sold out", so it is not refused for that', () => {
    const { send } = run({ slot: slot({ capacity: null }), facts: facts({ unitsSold: 9_999 }) })
    expect(send).toHaveLength(1)
  })

  test('a message already sent is never sent again', () => {
    const { send, refused } = run({ facts: facts({ alreadySent: new Set([sentKey('buyer@example.com', 1)]) }) })
    expect(send).toHaveLength(0)
    expect(refused[0].reason).toMatch(/every due message has been sent/)
  })

  test('a demand row that is not an abandonment is never a reason to write to anybody', () => {
    for (const action of ['page_view', 'sold_out_view', 'checkout_started', 'waitlist_join'] as const) {
      const { send } = run({ demand: [abandonment({ action })] })
      expect(send, `${action} must not produce a send`).toHaveLength(0)
    }
  })

  test('an abandonment with no address is refused rather than crashed on', () => {
    const { send, refused } = run({ demand: [abandonment({ contactEmail: null })] })
    expect(send).toHaveLength(0)
    expect(refused[0].reason).toMatch(/nobody to write to/)
  })

  test('every send names the demand row that authorised it', () => {
    const { send } = run({ demand: [abandonment({ id: 4242 })] })
    expect(send[0].demandEntryId).toBe(4242)
  })
})

describe('the reversal condition', () => {
  test('within both thresholds the sequence is the full three', () => {
    expect(sequenceLengthFor({ sent: 1000, unsubscribed: 10, complained: 0 }).length).toBe(3)
  })

  test('unsubscribes above 2 percent cut it to one message', () => {
    const cut = sequenceLengthFor({ sent: 1000, unsubscribed: 21, complained: 0 })
    expect(cut.length).toBe(1)
    expect(cut.reason).toMatch(/cut to a single message at 2 hours/)
  })

  test('complaints above 0.1 percent cut it to one message', () => {
    expect(sequenceLengthFor({ sent: 1000, unsubscribed: 0, complained: 2 }).length).toBe(1)
  })

  test('complaints above 0.3 percent stop sending entirely', () => {
    const stop = sequenceLengthFor({ sent: 1000, unsubscribed: 0, complained: 4 })
    expect(stop.length).toBe(0)
    expect(stop.reason).toMatch(/confirmation emails/)
  })

  test('a cut sequence refuses the messages beyond it, and still sends the first', () => {
    const first = run({ demand: [abandonment({ occurredAt: hoursAgo(3) })], sequenceLength: 1 })
    expect(first.send).toHaveLength(1)
    const later = run({ demand: [abandonment({ occurredAt: hoursAgo(96) })], sequenceLength: 1 })
    expect(later.send).toHaveLength(0)
    expect(later.refused[0].reason).toMatch(/cut to 1 message/)
  })

  test('a full stop sends nothing at all', () => {
    expect(run({ sequenceLength: 0 }).send).toHaveLength(0)
  })
})

describe('a rate needs enough sends to be a rate at all', () => {
  /*
   * FOUND BY DRIVING IT, 11 September 2026. The D2 drive unsubscribed ONE
   * person, out of sixteen sends. That is 6.25 percent, the reversal condition
   * read it as a sequence in trouble, and it cut every future message for every
   * person on the platform to one. The condition was doing what it says; the
   * arithmetic was the problem.
   */
  test('one person unsubscribing out of sixteen does NOT cut the sequence', () => {
    const held = sequenceLengthFor({ sent: 16, unsubscribed: 1, complained: 0 })
    expect(held.length).toBe(3)
    expect(held.reason).toMatch(/not a measurement/)
  })

  test('and the build says out loud that it is holding rather than passing silently', () => {
    const held = sequenceLengthFor({ sent: 16, unsubscribed: 1, complained: 0 })
    expect(held.reason).toContain('1 of 16')
    expect(held.reason).toMatch(/watching/)
  })

  test('at fifty sends one unsubscribe is exactly the threshold, which does not exceed it', () => {
    expect(sequenceLengthFor({ sent: 50, unsubscribed: 1, complained: 0 }).length).toBe(3)
  })

  test('at fifty sends two unsubscribes is four percent, and the cut lands', () => {
    const cut = sequenceLengthFor({ sent: 50, unsubscribed: 2, complained: 0 })
    expect(cut.length).toBe(1)
    expect(cut.reason).toMatch(/above the 2% cut/)
  })

  test('a COMPLAINT is not held back by volume, because one is already a warning', () => {
    const cut = sequenceLengthFor({ sent: 500, unsubscribed: 0, complained: 1 })
    expect(cut.length).toBe(1)
    expect(cut.reason).toMatch(/complaints/)
  })

  test('and neither is the full stop, at any volume at all', () => {
    const stop = sequenceLengthFor({ sent: 3, unsubscribed: 0, complained: 1 })
    expect(stop.length).toBe(0)
    expect(stop.reason).toMatch(/halted/)
  })
})

describe('the holdout, which does not exist yet and says when it will', () => {
  test('the threshold is the one the close-out registers, in code', () => {
    expect(HOLDOUT_THRESHOLD_ABANDONMENTS).toBe(300)
  })

  test('below it there is no holdout, because withholding from three people proves nothing', () => {
    expect(holdoutIsDue(0)).toBe(false)
    expect(holdoutIsDue(299)).toBe(false)
  })

  test('at it, the build says so rather than silently starting', () => {
    expect(holdoutIsDue(300)).toBe(true)
  })
})

describe('the word for a place, which is where the portability is visible', () => {
  test('a dated performance sells a ticket', () => {
    expect(unitWord('music')).toBe('ticket')
    expect(unitWord('comedy')).toBe('ticket')
  })

  test('the same engine sells a class, an appointment and a booking', () => {
    expect(unitWord('fitness')).toBe('class')
    expect(unitWord('clinic')).toBe('appointment')
    expect(unitWord('tour')).toBe('booking')
  })

  test('a category nobody has mapped reads as the vaguest true word, never as a ticket', () => {
    expect(unitWord('something-nobody-has-mapped')).toBe(DEFAULT_UNIT_WORD)
    expect(unitWord(null)).toBe(DEFAULT_UNIT_WORD)
    expect(unitWord(null)).not.toBe('ticket')
  })

  test('it is case and whitespace insensitive, because a category is data we did not write', () => {
    expect(unitWord('  Music  ')).toBe('ticket')
  })

  test('the plural is only plural when it needs to be', () => {
    expect(unitWordPlural('music', 1)).toBe('ticket')
    expect(unitWordPlural('music', 2)).toBe('tickets')
    expect(unitWordPlural('clinic', 2)).toBe('appointments')
  })
})
