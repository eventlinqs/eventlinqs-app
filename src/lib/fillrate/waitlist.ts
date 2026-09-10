/**
 * WHO IS NEXT, AND FOR HOW LONG. Close-out D2, the second of the three things.
 *
 *     "Inventory class sold out, person joins waitlist. A refund or release
 *      frees a unit, the waitlist is notified in join order with a time limited
 *      hold that passes down the list on expiry."
 *
 * PURE, for the same reason `due.ts` is: every line below is a rule about
 * writing to a real person, and a rule that can only be reached through a
 * mailbox is a rule nobody has ever executed.
 *
 * WHY THE ENGINE DECIDES AND THE PLATFORM HOLDS. The engine may read the ledger
 * and nothing else, so it cannot itself take a unit out of a real inventory
 * class: that is a write against the source system's own tables and it belongs
 * to the adapter. The division is exactly D1's: the engine says WHO is next,
 * for HOW LONG, and whether they may be written to at all; the adapter performs
 * the hold against whatever the source system's inventory happens to be, and
 * tells the engine what it did.
 *
 * ONE PERSON, ONE LIVE HOLD, ONE MESSAGE. A hold that is live suppresses every
 * further offer to that address on that slot, so a second freed unit passes to
 * the next person rather than to the same one twice.
 */

/** One person who asked to be told, from a `waitlist_join` demand row. */
export type JoinRow = {
  demandEntryId: number
  slotId: string
  organisationId: string
  contactEmail: string
  joinedAt: string
  inventoryClass: string | null
  unitsWanted: number
}

/** One unit put aside for one person until a moment. */
export type HoldRow = {
  id: number
  demandEntryId: number
  contactEmail: string
  inventoryClass: string | null
  units: number
  expiresAt: string
  claimedAt: string | null
  releasedAt: string | null
}

/**
 * HOW LONG SOMEBODY GETS. Fifteen minutes, which is the window the platform's
 * own inventory hold already uses, so the two halves of one offer cannot
 * disagree about when it ends.
 */
export const HOLD_MINUTES = 15

/** A hold that has not been claimed, released, or run out. */
export function isLive(hold: HoldRow, now: Date): boolean {
  if (hold.claimedAt) return false
  if (hold.releasedAt) return false
  return Date.parse(hold.expiresAt) > now.getTime()
}

/** A hold whose time ran out with nobody claiming it. */
export function hasLapsed(hold: HoldRow, now: Date): boolean {
  if (hold.claimedAt) return false
  if (hold.releasedAt) return false
  return Date.parse(hold.expiresAt) <= now.getTime()
}

export type Offer = {
  join: JoinRow
  units: number
  expiresAt: string
  because: string
}

export type WaitlistPlan = {
  /** Holds that ran out and must be handed back before anybody else is offered. */
  toRelease: HoldRow[]
  /** Who to write to, in join order, and until when. */
  toOffer: Offer[]
  /** Why somebody in the queue was passed over, so a silent sweep can be read. */
  passedOver: { contactEmail: string; reason: string }[]
}

/**
 * THE WHOLE DECISION for one inventory class on one slot.
 *
 * `unitsFree` is what the SOURCE SYSTEM says is available right now, because
 * only it can know: the ledger records that a refund happened, not that the
 * released unit is still unsold a minute later. The engine decides who gets it.
 *
 * The order is the order people joined, oldest first, and the caller passes the
 * rows in that order because that is how the ledger stores them. A lapsed hold
 * is released FIRST, in the same plan, which is what "passes down the list on
 * expiry" means: the unit that person did not claim is the unit the next person
 * is offered.
 */
export function planWaitlist(input: {
  joins: readonly JoinRow[]
  holds: readonly HoldRow[]
  unitsFree: number
  suppressed: ReadonlySet<string>
  boughtHashes: ReadonlySet<string>
  slotStartsAt: string
  recoveryEnabled: boolean
  now: Date
  holdMinutes?: number
  /** The keyed hash of one address, for the same reason `decide` takes one. */
  hash?: (email: string) => string | null
}): WaitlistPlan {
  const { joins, holds, suppressed, boughtHashes, now } = input
  const holdMinutes = input.holdMinutes ?? HOLD_MINUTES
  const hash = input.hash ?? (() => null)
  const toRelease = holds.filter(hold => hasLapsed(hold, now))
  const toOffer: Offer[] = []
  const passedOver: { contactEmail: string; reason: string }[] = []

  if (!input.recoveryEnabled) {
    for (const join of joins) {
      passedOver.push({ contactEmail: join.contactEmail, reason: 'the organiser switched recovery off for this slot' })
    }
    return { toRelease, toOffer, passedOver }
  }
  if (Date.parse(input.slotStartsAt) <= now.getTime()) {
    for (const join of joins) {
      passedOver.push({ contactEmail: join.contactEmail, reason: 'the slot has already started' })
    }
    return { toRelease, toOffer, passedOver }
  }

  /*
   * A LIVE HOLD IS SOMEBODY ELSE'S UNIT. It is subtracted from what is on offer,
   * so two sweeps a minute apart cannot promise the same unit to two people.
   * A LAPSED hold is not subtracted: releasing it is the first thing this plan
   * does, and the caller performs the plan in order.
   */
  const liveHolds = holds.filter(hold => isLive(hold, now))
  const spokenFor = liveHolds.reduce((total, hold) => total + hold.units, 0)
  let remaining = Math.max(0, input.unitsFree - spokenFor)

  const holdingNow = new Set(liveHolds.map(hold => hold.contactEmail))
  /*
   * ALREADY OFFERED AND DID NOT TAKE IT. A lapsed hold means this person was
   * given their turn and let it run out. They are passed over rather than
   * offered the same unit again, which is what "passes down the list" requires:
   * without this the queue would loop on its first member for ever.
   */
  const hadTheirTurn = new Set(holds.map(hold => hold.contactEmail))
  const offeredThisRun = new Set<string>()
  const expiresAt = new Date(now.getTime() + holdMinutes * 60_000).toISOString()

  for (const join of joins) {
    if (remaining <= 0) {
      passedOver.push({ contactEmail: join.contactEmail, reason: 'nothing free to offer yet' })
      continue
    }
    if (suppressed.has(join.contactEmail)) {
      passedOver.push({ contactEmail: join.contactEmail, reason: 'this address has unsubscribed' })
      continue
    }
    const fingerprint = hash(join.contactEmail)
    if (fingerprint && boughtHashes.has(fingerprint)) {
      passedOver.push({ contactEmail: join.contactEmail, reason: 'they already bought' })
      continue
    }
    if (holdingNow.has(join.contactEmail)) {
      passedOver.push({ contactEmail: join.contactEmail, reason: 'they are already holding one' })
      continue
    }
    if (hadTheirTurn.has(join.contactEmail)) {
      passedOver.push({ contactEmail: join.contactEmail, reason: 'they had their turn and it ran out' })
      continue
    }
    if (offeredThisRun.has(join.contactEmail)) {
      passedOver.push({ contactEmail: join.contactEmail, reason: 'already offered one in this run' })
      continue
    }

    const units = Math.min(join.unitsWanted, remaining)
    remaining -= units
    offeredThisRun.add(join.contactEmail)
    toOffer.push({
      join,
      units,
      expiresAt,
      because: `joined at ${join.joinedAt}, ${units} of ${input.unitsFree} free`,
    })
  }

  return { toRelease, toOffer, passedOver }
}
