/**
 * THE SWEEP. Close-out D2, the part that actually writes to somebody.
 *
 * It does four things in a fixed order and nothing else:
 *
 *   1. reads the ledger                       `read.ts`
 *   2. decides who is due what, and refuses everybody else   `due.ts` / `waitlist.ts`
 *   3. composes the message                   `message.ts`
 *   4. records the send BEFORE it sends, then sends
 *
 * WHY IT RECORDS BEFORE IT SENDS, which looks backwards. The record carries a
 * UNIQUE on (slot, address, message number), so writing it first is how two
 * workers, or one worker retried, are stopped from both getting past the same
 * check. If the send then fails, the worst case is one message somebody never
 * received. If it were the other way round the worst case is the same message
 * three times, and there is no comparison between those two outcomes.
 *
 * WHY IT TAKES A LINK RESOLVER RATHER THAN BUILDING A URL. The engine reads the
 * ledger, and the ledger records a slot's `source_ref` and nothing about how the
 * source system addresses it. Only the adapter knows how that reference turns
 * into a page somebody can open, so only the adapter can say where "finish
 * booking" goes. Point this at a gym and its adapter supplies a different
 * resolver: not one line of this file changes, which is the whole test the
 * close-out sets.
 */
import { sendEmail } from '@/lib/email/send'
import { getAppUrl } from '@/lib/site-url'
import { decide, sequenceLengthFor, type Decision, type SlotRow } from './due'
import { compose, composeOffer } from './message'
import { planWaitlist } from './waitlist'
import {
  abandonmentsOn,
  closeHold,
  factsFor,
  fingerprintsOf,
  hashOf,
  holdsOn,
  joinsOn,
  openHold,
  recordSend,
  slotsWithRecoverableDemand,
  suppressedAddresses,
  tokenFor,
} from './read'

/**
 * WHAT THE ADAPTER MUST TELL THE ENGINE, and it is deliberately small: two
 * questions about one slot, neither of which mentions this platform in its
 * shape. A gym's adapter answers the same two.
 */
export type Links = {
  /** Where "finish booking" goes, or null if the source system cannot say. */
  resumeUrlFor(slot: SlotRow, inventoryClass: string | null): Promise<string | null>
  /** What this slot is CALLED, and who runs it, for the message to name. */
  describe(slot: SlotRow): Promise<{ name: string; organiserName: string | null; timezone: string | null } | null>
  /**
   * The one line the source system signs its messages with.
   *
   * SUPPLIED, never imported, for the same reason the link is. A signature is a
   * statement about a brand, and the engine has no brand: point it at a gym and
   * the gym's adapter signs the message. It also keeps the positioning rule
   * intact, because the line still comes from the one place that defines it,
   * which is now the adapter rather than the sender.
   */
  signature: string
}

/** Injected so a test can drive the whole sweep without a mail server. */
export type Post = (message: { to: string; subject: string; html: string; text: string }) => Promise<unknown>

const postByEmail: Post = message =>
  sendEmail({ to: message.to, subject: message.subject, html: message.html, text: message.text })

export type SweepResult = {
  slotsConsidered: number
  sent: number
  refused: number
  failed: number
  sequenceLength: number
  sequenceReason: string
  /** Every refusal, counted by reason, so a sweep that sends nothing can be read. */
  refusals: Record<string, number>
}

/** One unsubscribe link per address, and it is the same link in every message. */
export async function unsubscribeUrlFor(email: string): Promise<string | null> {
  const token = await tokenFor(email)
  if (!token) return null
  return `${getAppUrl()}/unsubscribe/recovery/${token}`
}

/**
 * THE ABANDONED CHECKOUT SEQUENCE, swept once.
 *
 * `now` is injected rather than read, so the whole sweep can be executed at any
 * point in the 2, 24 and 72 hour schedule by a test instead of being waited for.
 */
export async function sweepAbandonedCheckouts(
  links: Links,
  now: Date = new Date(),
  rates?: { sent: number; unsubscribed: number; complained: number },
  post: Post = postByEmail,
): Promise<SweepResult> {
  const cut = sequenceLengthFor(rates ?? { sent: 0, unsubscribed: 0, complained: 0 })
  const result: SweepResult = {
    slotsConsidered: 0,
    sent: 0,
    refused: 0,
    failed: 0,
    sequenceLength: cut.length,
    sequenceReason: cut.reason,
    refusals: {},
  }
  if (cut.length === 0) return result

  const slots = await slotsWithRecoverableDemand(now)
  if (slots.length === 0) return result

  const suppressed = await suppressedAddresses()

  for (const slot of slots) {
    result.slotsConsidered += 1
    const [demand, facts] = await Promise.all([abandonmentsOn(slot.id, now), factsFor(slot.id)])

    const { send, refused } = decide({
      slot,
      demand,
      facts,
      suppressed,
      now,
      hash: hashOf,
      fingerprints: fingerprintsOf,
      sequenceLength: cut.length,
    })
    result.refused += refused.length
    for (const refusal of refused) {
      result.refusals[refusal.reason] = (result.refusals[refusal.reason] ?? 0) + 1
    }
    if (send.length === 0) continue

    const described = await links.describe(slot)
    if (!described) {
      result.refusals['the source system could not say what this slot is'] =
        (result.refusals['the source system could not say what this slot is'] ?? 0) + send.length
      result.refused += send.length
      continue
    }

    for (const decision of send) {
      const outcome = await deliver(decision, slot, described, links, result, post)
      if (outcome === 'sent') result.sent += 1
      else if (outcome === 'failed') result.failed += 1
      else result.refused += 1
    }
  }

  return result
}

async function deliver(
  decision: Decision,
  slot: SlotRow,
  described: { name: string; organiserName: string | null; timezone: string | null },
  links: Links,
  result: SweepResult,
  post: Post,
): Promise<'sent' | 'failed' | 'refused'> {
  const count = (reason: string) => {
    result.refusals[reason] = (result.refusals[reason] ?? 0) + 1
  }

  const resumeUrl = await links.resumeUrlFor(slot, decision.inventoryClass)
  if (!resumeUrl) {
    count('no resumable link, so the message would have nowhere to send them')
    return 'refused'
  }
  const unsubscribeUrl = await unsubscribeUrlFor(decision.contactEmail)
  if (!unsubscribeUrl) {
    /*
     * NO UNSUBSCRIBE LINK MEANS NO MESSAGE. The Spam Act 2003 (Cth) requires a
     * functional unsubscribe on every commercial message, and a build that
     * treated it as a nice-to-have would send unlawful mail the first time the
     * token table was unreachable. Refusing costs one recovery. Sending without
     * it costs the sending domain.
     */
    count('no unsubscribe link could be minted, so nothing was sent')
    return 'refused'
  }

  // Recorded BEFORE the send: the UNIQUE is the only thing standing between a
  // retried sweep and somebody's inbox. See this file's header.
  const written = await recordSend({
    slotId: decision.slotId,
    organisationId: decision.organisationId,
    contactEmail: decision.contactEmail,
    messageNumber: decision.messageNumber,
    inventoryClass: decision.inventoryClass,
    unitAmountCents: decision.unitAmountCents,
    demandEntryId: decision.demandEntryId,
  })
  if (written.alreadyThere) {
    count('another worker had already recorded this exact message')
    return 'refused'
  }
  if (!written.recorded) {
    console.error(`[fillrate] could not record a send for slot ${decision.slotId}: ${written.reason}`)
    return 'failed'
  }

  const composed = compose({
    slotName: described.name,
    slotAt: slot.slotAt,
    slotTimezone: described.timezone,
    category: slot.category,
    inventoryClass: decision.inventoryClass,
    unitAmountCents: decision.unitAmountCents,
    currency: 'AUD',
    messageNumber: decision.messageNumber,
    resumeUrl,
    unsubscribeUrl,
    organiserName: described.organiserName,
    signature: links.signature,
  })

  try {
    await post({
      to: decision.contactEmail,
      subject: composed.subject,
      html: composed.html,
      text: composed.text,
    })
    return 'sent'
  } catch (cause) {
    /*
     * SPEAKS, NEVER SWALLOWS. The record is already written, so this address
     * will not be tried again for this message number, and a silent failure
     * here would be a recovery that never happened and was never counted.
     */
    const why = cause instanceof Error ? cause.message : String(cause)
    console.error(`[fillrate] message ${decision.messageNumber} to ${decision.contactEmail} failed to send: ${why}`)
    void import('@/lib/observability/sentry')
      .then(({ captureException }) => {
        captureException(new Error(`fillrate send failed: ${why}`), { area: 'fillrate' })
      })
      .catch(sinkError => {
        console.error(
          `[fillrate] and the error sink could not be reached: ${
            sinkError instanceof Error ? sinkError.message : String(sinkError)
          }`,
        )
      })
    return 'failed'
  }
}

export type WaitlistSweepResult = {
  released: number
  offered: number
  passedOver: Record<string, number>
  failed: number
}

/**
 * WHY THE ENGINE SENDS THIS ONE TOO, and the platform stopped.
 *
 * Before D2 the waiting list message was composed and sent by the source system,
 * against its own inventory. Two senders for one offer would be two messages for
 * one freed unit, so there is exactly one and it is here: the engine decides who
 * is next, records the offer, and writes to them. The source system keeps the
 * part only it can do, which is taking the unit out of a real inventory class
 * atomically.
 *
 * It also fixes a defect that predates D2. The old sender resolved the address
 * through the source system's account records, so a person with no account was
 * silently skipped: they joined a waiting list and could never be told. The
 * ledger's `waitlist_join` row carries the address itself, so the engine reaches
 * everybody who asked.
 */

/**
 * THE WAITING LIST, ACTIVATED. Close-out D2, the second thing.
 *
 * The caller says how many units the SOURCE SYSTEM has free right now, because
 * only it can know: the ledger records that a refund happened, not that the
 * released unit is still unsold a minute later. The engine decides who is next,
 * releases anything that ran out first so the unit passes down the list, and
 * writes to exactly one person per free unit.
 */
export async function activateWaitlist(
  input: {
    slot: SlotRow
    unitsFree: number
    inventoryClass: string | null
  },
  links: Links,
  now: Date = new Date(),
  post: Post = postByEmail,
): Promise<WaitlistSweepResult> {
  const out: WaitlistSweepResult = { released: 0, offered: 0, passedOver: {}, failed: 0 }

  const [joins, holds, facts, suppressed] = await Promise.all([
    joinsOn(input.slot.id),
    holdsOn(input.slot.id),
    factsFor(input.slot.id),
    suppressedAddresses(),
  ])

  const onThisClass = input.inventoryClass
    ? joins.filter(join => !join.inventoryClass || join.inventoryClass === input.inventoryClass)
    : joins

  const plan = planWaitlist({
    joins: onThisClass,
    holds,
    unitsFree: input.unitsFree,
    suppressed,
    boughtHashes: facts.boughtHashes,
    hash: hashOf,
    fingerprints: fingerprintsOf,
    slotStartsAt: input.slot.slotAt,
    recoveryEnabled: input.slot.recoveryEnabled,
    now,
  })

  for (const lapsed of plan.toRelease) {
    await closeHold(lapsed.id, 'released')
    out.released += 1
  }
  for (const row of plan.passedOver) {
    out.passedOver[row.reason] = (out.passedOver[row.reason] ?? 0) + 1
  }
  if (plan.toOffer.length === 0) return out

  const described = await links.describe(input.slot)
  if (!described) {
    out.passedOver['the source system could not say what this slot is'] = plan.toOffer.length
    return out
  }

  for (const offer of plan.toOffer) {
    const opened = await openHold({
      slotId: input.slot.id,
      organisationId: offer.join.organisationId,
      demandEntryId: offer.join.demandEntryId,
      contactEmail: offer.join.contactEmail,
      inventoryClass: offer.join.inventoryClass ?? input.inventoryClass,
      units: offer.units,
      expiresAt: offer.expiresAt,
    })
    if (opened.alreadyThere) {
      out.passedOver['this queue position was already offered'] =
        (out.passedOver['this queue position was already offered'] ?? 0) + 1
      continue
    }
    if (!opened.opened) {
      console.error(`[fillrate] could not open a hold on slot ${input.slot.id}: ${opened.reason}`)
      out.failed += 1
      continue
    }

    const claimUrl = await links.resumeUrlFor(input.slot, offer.join.inventoryClass ?? input.inventoryClass)
    const unsubscribeUrl = await unsubscribeUrlFor(offer.join.contactEmail)
    if (!claimUrl || !unsubscribeUrl) {
      /*
       * THE HOLD STANDS EVEN THOUGH THE MESSAGE DID NOT GO. Releasing it here
       * would hand the unit straight to the next person while this one is still
       * inside their window, which is worse than a hold that lapses on its own
       * fifteen minutes later and then passes down the list correctly.
       */
      const why = claimUrl
        ? 'no unsubscribe link could be minted, so nothing was sent'
        : 'no claim link, so the offer had nowhere to send them'
      out.passedOver[why] = (out.passedOver[why] ?? 0) + 1
      out.failed += 1
      continue
    }

    const composed = composeOffer({
      slotName: described.name,
      slotAt: input.slot.slotAt,
      slotTimezone: described.timezone,
      category: input.slot.category,
      inventoryClass: offer.join.inventoryClass ?? input.inventoryClass,
      units: offer.units,
      expiresAt: offer.expiresAt,
      claimUrl,
      unsubscribeUrl,
      organiserName: described.organiserName,
      signature: links.signature,
    })

    try {
      await post({
        to: offer.join.contactEmail,
        subject: composed.subject,
        html: composed.html,
        text: composed.text,
      })
      out.offered += 1
    } catch (cause) {
      const why = cause instanceof Error ? cause.message : String(cause)
      console.error(`[fillrate] the offer to ${offer.join.contactEmail} failed to send: ${why}`)
      out.failed += 1
    }
  }

  return out
}
