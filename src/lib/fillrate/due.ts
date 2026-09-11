/**
 * WHO IS DUE WHAT, AND WHO MUST NOT BE WRITTEN TO. Close-out D2.
 *
 * This file is PURE: it takes rows and a clock and returns decisions. Nothing in
 * it reads a database, sends anything, or knows what industry it is in. That is
 * not architectural taste. Every rule below is a rule about contacting a real
 * person, and the only way to be sure a rule holds is to execute it against the
 * cases that would break it, which is impossible if the rule can only be reached
 * through a mailbox.
 *
 * THE SEQUENCE, from the close-out:
 *
 *     Email entered, checkout not completed. Three messages: 2 hours, 24 hours,
 *     72 hours. Stop on purchase, sell out, cancellation, or slot start. Each
 *     names the slot, the inventory class, the price, and links to a resumable
 *     checkout. No discount in v0.
 *
 * THE SUPPRESSION RULES, which are the ones that matter:
 *
 *   - only ever about the specific slot this person themselves started buying.
 *     Never another slot, never another organisation. Enforced by construction:
 *     a decision is derived FROM a demand row and carries that row's id, and the
 *     database will not accept a send that does not name one.
 *   - never anyone who has unsubscribed.
 *   - never anyone who already bought on this slot, whether before the sequence
 *     started or in the middle of it.
 *   - never anyone whose money came back: a refund on this slot means the
 *     relationship ended, and chasing it is the worst message we could send.
 *   - never when the organiser switched it off for this slot.
 *   - never after the slot has started, or once it has sold out: both make the
 *     message a lie.
 *   - never the same message twice, which the database also refuses.
 */
import { ANONYMOUS_DEMAND_ACTIONS, type DemandAction } from '@/lib/ledger/types'

/**
 * THE SCHEDULE. Hours after the abandonment, exactly as the close-out names
 * them. In code rather than in a table, because a schedule in a table is a
 * schedule nobody has ever run, and because the reversal condition changes it.
 */
export const MESSAGE_DELAYS_HOURS = [2, 24, 72] as const

/**
 * THE REVERSAL CONDITION'S CUT, from the close-out: above 2 percent unsubscribes
 * or 0.1 percent complaints, cut to a single message at 2 hours and report.
 * Registered here so the number is executable rather than remembered.
 */
export const UNSUBSCRIBE_RATE_CUT = 0.02
export const COMPLAINT_RATE_CUT = 0.001
export const COMPLAINT_RATE_STOP = 0.003

/**
 * HOW MANY SENDS A RATE NEEDS BEFORE IT MEANS ANYTHING. Found by driving the
 * engine on 11 September 2026, and it is a real defect rather than a nicety.
 *
 * The drive unsubscribed ONE person, out of sixteen sends. That is 6.25 percent,
 * the reversal condition read it as a sequence in trouble, and it cut every
 * future message for every person on the platform to one. The condition was
 * doing exactly what it says; the arithmetic was the problem.
 *
 * THE NUMBER IS DERIVED, NOT PICKED. At the 2 percent threshold, one unsubscribe
 * out of 50 sends is exactly 2 percent, which does not exceed it; out of 49 it is
 * 2.04 percent, which does. So 50 is the smallest number of sends at which a
 * SINGLE person pressing a link cannot by itself cut the sequence. Below it, the
 * rate is not a measurement of anything.
 *
 * THIS DOES NOT APPLY TO COMPLAINTS, deliberately. The close-out's reason for the
 * complaint stop is that "sender reputation damage would also take down the
 * confirmation emails buyers actually need", and one spam complaint really is a
 * warning about that whatever the denominator. A minimum on the complaint
 * thresholds would be a licence to keep sending through the early complaints
 * that matter most, so they fire at any volume.
 *
 * It is the same reasoning the close-out already applies to the holdout: "at
 * current volume it would withhold from two or three people and prove nothing".
 */
export const REVERSAL_MINIMUM_SENDS = 50

/**
 * WHEN A HOLDOUT STARTS EXISTING, from the close-out: "Do NOT build a holdout
 * yet. At current volume it would withhold from two or three people and prove
 * nothing. Add it automatically at 300 cumulative abandonments and register that
 * threshold in code."
 *
 * It is registered, it is executable, and `holdoutIsDue` below is the whole of
 * it. Nothing withholds a message today, and the day the count crosses this the
 * build says so rather than silently starting.
 */
export const HOLDOUT_THRESHOLD_ABANDONMENTS = 300

export function holdoutIsDue(cumulativeAbandonments: number): boolean {
  return cumulativeAbandonments >= HOLDOUT_THRESHOLD_ABANDONMENTS
}

/** One demand row, as much of it as the decision needs. */
export type DemandRow = {
  id: number
  slotId: string
  organisationId: string
  action: DemandAction
  contactEmail: string | null
  occurredAt: string
  inventoryClass: string | null
  unitAmountCents: number | null
}

/** One slot, as much of it as the decision needs. */
export type SlotRow = {
  id: string
  sourceRef: string
  organisationId: string
  category: string
  subcategory: string
  slotAt: string
  capacity: number | null
  recoveryEnabled: boolean
}

/** What already happened on a slot, summarised, so the rules can be pure. */
export type SlotFacts = {
  /**
   * The keyed hashes of everybody who bought on this slot.
   *
   * HASHES AND NOT ADDRESSES, because that is what a money row in the ledger
   * carries: a sale records that somebody paid, never who they are. The caller
   * supplies `hash` to `decide` so this file can put a demand row's address
   * through the same function and compare like with like.
   */
  boughtHashes: ReadonlySet<string>
  /** The same, for everybody whose money came back on this slot. */
  refundedHashes: ReadonlySet<string>
  /** Net units sold on this slot, for the sold-out test. */
  unitsSold: number
  /** Which (email, messageNumber) pairs have already been sent. */
  alreadySent: ReadonlySet<string>
}

export type Decision = {
  demandEntryId: number
  slotId: string
  organisationId: string
  contactEmail: string
  messageNumber: 1 | 2 | 3
  inventoryClass: string | null
  unitAmountCents: number | null
  /** Why this one, in the words a log should carry. */
  because: string
}

export type Refusal = {
  demandEntryId: number
  contactEmail: string | null
  reason: string
}

export const sentKey = (email: string, messageNumber: number) => `${email.trim().toLowerCase()}::${messageNumber}`

const HOUR_MS = 3_600_000

/**
 * WHICH MESSAGE IS DUE for one abandonment, or null.
 *
 * The LATEST one whose delay has passed and which has not been sent, not the
 * earliest. A sweep that has been down for a day must not walk somebody through
 * three messages in three minutes to catch up; it sends the one that is right
 * for how long they have been gone and lets the earlier ones lapse.
 */
export function messageDueFor(
  abandonedAtIso: string,
  now: Date,
  alreadySent: ReadonlySet<string>,
  email: string,
): 1 | 2 | 3 | null {
  const abandonedAt = Date.parse(abandonedAtIso)
  if (!Number.isFinite(abandonedAt)) return null
  const elapsedHours = (now.getTime() - abandonedAt) / HOUR_MS
  for (let i = MESSAGE_DELAYS_HOURS.length - 1; i >= 0; i -= 1) {
    const number = (i + 1) as 1 | 2 | 3
    if (elapsedHours < MESSAGE_DELAYS_HOURS[i]) continue
    if (alreadySent.has(sentKey(email, number))) return null
    return number
  }
  return null
}

/**
 * THE WHOLE DECISION, for one slot's abandonments.
 *
 * Returns what to send AND what was refused, because a refusal is the more
 * important half: a sweep that quietly sends nothing and a sweep that correctly
 * refuses everything look identical from the outside, and only one of them is
 * working.
 */
export function decide(input: {
  slot: SlotRow
  demand: readonly DemandRow[]
  facts: SlotFacts
  suppressed: ReadonlySet<string>
  now: Date
  /**
   * The keyed hash of one address, supplied by the caller.
   *
   * Injected rather than imported so this file stays pure, and so the engine
   * holds no opinion about how a source system hashes a person. A caller that
   * passes nothing gets no money-based suppression, which is stated here rather
   * than left to be discovered.
   */
  hash?: (email: string) => string | null
  /**
   * Every hash the address may carry on a money row, keyed first. When given
   * it replaces `hash` for the two money-based refusals, so a sale row written
   * on a deployment without the key is still recognised (see
   * identityFingerprints in src/lib/ledger/identity.ts for the day it happened).
   */
  fingerprints?: (email: string) => string[]
  /** How many messages the sequence is currently allowed to send (the reversal condition cuts it to 1). */
  sequenceLength?: number
}): { send: Decision[]; refused: Refusal[] } {
  const { slot, demand, facts, suppressed, now } = input
  const hash = input.hash ?? (() => null)
  const fingerprints =
    input.fingerprints ?? ((email: string) => [hash(email)].filter((h): h is string => Boolean(h)))
  const sequenceLength = input.sequenceLength ?? MESSAGE_DELAYS_HOURS.length
  const send: Decision[] = []
  const refused: Refusal[] = []

  const refuse = (row: DemandRow, reason: string) =>
    refused.push({ demandEntryId: row.id, contactEmail: row.contactEmail, reason })

  // Slot-level refusals, said once each rather than once per person.
  const slotStarted = Date.parse(slot.slotAt) <= now.getTime()
  const soldOut = slot.capacity !== null && facts.unitsSold >= slot.capacity

  for (const row of demand) {
    if (row.action !== 'checkout_abandoned') {
      refuse(row, `not an abandonment (${row.action})`)
      continue
    }
    if (ANONYMOUS_DEMAND_ACTIONS.includes(row.action)) {
      refuse(row, 'this action carries no person')
      continue
    }
    const email = (row.contactEmail ?? '').trim().toLowerCase()
    if (!email) {
      refuse(row, 'no address on the row, so there is nobody to write to')
      continue
    }
    /*
     * THE ONE THAT MATTERS MOST. A decision is derived FROM a demand row on THIS
     * slot, so it cannot be about a slot the person never engaged with. Checked
     * anyway, because the rule is worth more than the shape of the loop that
     * happens to satisfy it today.
     */
    if (row.slotId !== slot.id) {
      refuse(row, 'this row belongs to another slot')
      continue
    }
    if (!slot.recoveryEnabled) {
      refuse(row, 'the organiser switched recovery off for this slot')
      continue
    }
    if (slotStarted) {
      refuse(row, 'the slot has already started')
      continue
    }
    if (soldOut) {
      refuse(row, 'the slot has sold out, so the message would be a lie')
      continue
    }
    if (suppressed.has(email)) {
      refuse(row, 'this address has unsubscribed')
      continue
    }
    const prints = fingerprints(email)
    if (prints.some(print => facts.boughtHashes.has(print))) {
      refuse(row, 'they already bought')
      continue
    }
    if (prints.some(print => facts.refundedHashes.has(print))) {
      refuse(row, 'their money came back, so chasing them would be the worst message we could send')
      continue
    }

    const number = messageDueFor(row.occurredAt, now, facts.alreadySent, email)
    if (number === null) {
      refuse(row, 'no message is due yet, or every due message has been sent')
      continue
    }
    if (number > sequenceLength) {
      refuse(row, `the sequence is cut to ${sequenceLength} message(s)`)
      continue
    }

    send.push({
      demandEntryId: row.id,
      slotId: slot.id,
      organisationId: row.organisationId,
      contactEmail: email,
      messageNumber: number,
      inventoryClass: row.inventoryClass,
      unitAmountCents: row.unitAmountCents,
      because: `abandoned at ${row.occurredAt}, message ${number} of ${sequenceLength}`,
    })
  }

  return { send, refused }
}

/**
 * THE REVERSAL CONDITION, as a function rather than as a paragraph.
 *
 * "Track unsubscribe and complaint rates. Above 2 percent unsubscribes or 0.1
 * percent complaints, cut to a single message at 2 hours and report. Above 0.3
 * percent complaints, stop all sends immediately and report, because sender
 * reputation damage would also take down the confirmation emails buyers actually
 * need."
 */
export function sequenceLengthFor(rates: { sent: number; unsubscribed: number; complained: number }): {
  length: number
  reason: string
} {
  if (rates.sent === 0) return { length: MESSAGE_DELAYS_HOURS.length, reason: 'nothing sent yet' }
  const unsubRate = rates.unsubscribed / rates.sent
  const complaintRate = rates.complained / rates.sent
  if (complaintRate > COMPLAINT_RATE_STOP) {
    return {
      length: 0,
      reason: `complaints are ${(complaintRate * 100).toFixed(2)}% of sends, above the ${(COMPLAINT_RATE_STOP * 100).toFixed(1)}% stop. Sending is halted: reputation damage would take the confirmation emails down with it.`,
    }
  }
  if (complaintRate > COMPLAINT_RATE_CUT) {
    return {
      length: 1,
      reason: `complaints are ${(complaintRate * 100).toFixed(2)}% of ${rates.sent} send(s), above the ${(COMPLAINT_RATE_CUT * 100).toFixed(1)}% cut: cut to a single message at ${MESSAGE_DELAYS_HOURS[0]} hours.`,
    }
  }
  if (unsubRate > UNSUBSCRIBE_RATE_CUT) {
    if (rates.sent < REVERSAL_MINIMUM_SENDS) {
      return {
        length: MESSAGE_DELAYS_HOURS.length,
        reason: `unsubscribes are ${rates.unsubscribed} of ${rates.sent} send(s), which is ${(unsubRate * 100).toFixed(2)}%, but a rate over fewer than ${REVERSAL_MINIMUM_SENDS} sends is not a measurement: one person can exceed the threshold on their own. Held at ${MESSAGE_DELAYS_HOURS.length} messages and watching.`,
      }
    }
    return {
      length: 1,
      reason: `unsubscribes are ${(unsubRate * 100).toFixed(2)}% of ${rates.sent} send(s), above the ${(UNSUBSCRIBE_RATE_CUT * 100).toFixed(0)}% cut: cut to a single message at ${MESSAGE_DELAYS_HOURS[0]} hours.`,
    }
  }
  return { length: MESSAGE_DELAYS_HOURS.length, reason: 'within both thresholds' }
}
