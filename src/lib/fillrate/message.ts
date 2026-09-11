/**
 * WHAT THE MESSAGE SAYS. Close-out D2.
 *
 *     "Each names the slot, the inventory class, the price, and links to a
 *      resumable checkout. No discount in v0."
 *
 *     "All customer facing copy is parameterised by slot category. The word for
 *      a unit comes from a category lookup [...]. No user facing string hard
 *      codes" the noun of one industry.
 *
 * The six nouns themselves are listed in `words.ts`, which is the lookup and the
 * one file allowed to name them. So there is not one string below that says what
 * industry this is: the noun comes from the slot's own category, which the ledger
 * carries as data. Point this at a gym's ledger and the same three messages read
 * "your class" without a line of this file changing.
 *
 * PURE. It takes facts and returns a subject and a body. It sends nothing, so
 * every word in it can be asserted in a test rather than read out of an inbox.
 *
 * WHY THERE IS NO DISCOUNT. The close-out forbids one in v0, and the reason is
 * worth writing down: a discount in the first recovery message teaches buyers to
 * abandon. The message's job is to remove the friction that stopped them, not to
 * pay them to come back.
 */
import { escapeHtml } from '@/lib/email/escape'
import { unitWord, unitWordPlural, money as formatMoney, type UnitWord } from './words'

/** One newline, named once, so every body below composes the same way. */
const NEWLINE = '\n'

/** What a message needs to know. Nothing here names an industry. */
export type MessageFacts = {
  slotName: string
  slotAt: string
  slotTimezone: string | null
  category: string
  inventoryClass: string | null
  unitAmountCents: number | null
  currency: string
  messageNumber: 1 | 2 | 3
  resumeUrl: string
  unsubscribeUrl: string
  organiserName: string | null
  /** The one line the source system signs with. Supplied, never imported. */
  signature: string
}

export type ComposedMessage = {
  subject: string
  html: string
  text: string
  unitWord: UnitWord
}

/** A price, or nothing at all when the ledger never recorded one. */
export function priceLine(cents: number | null, currency = 'AUD'): string | null {
  if (cents === null || !Number.isFinite(cents)) return null
  if (cents <= 0) return 'free'
  return formatMoney(cents, currency)
}

/** The slot's own moment, in the slot's own timezone, in Australian English. */
export function whenItIs(slotAt: string, timezone: string | null): string {
  const at = new Date(slotAt)
  if (Number.isNaN(at.getTime())) return ''
  return at.toLocaleString('en-AU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: timezone || 'Australia/Melbourne',
  })
}

/**
 * THE THREE OPENINGS, and they are three because a person who has ignored two
 * messages is in a different situation from a person who left ten minutes ago.
 * The first assumes something interrupted them. The second assumes they forgot.
 * The third says plainly that it is the last one, because a sequence that never
 * admits it is ending is the sequence people report as spam.
 */
function opening(messageNumber: 1 | 2 | 3, noun: UnitWord, slotName: string): { subject: string; lead: string } {
  if (messageNumber === 1) {
    return {
      subject: `Your ${noun} for ${slotName} is still here`,
      lead: `You were part way through booking and did not finish. Nothing is lost: pick up where you left off.`,
    }
  }
  if (messageNumber === 2) {
    return {
      subject: `Still going to ${slotName}?`,
      lead: `Yesterday you started booking a ${noun} and stopped. It is still available, and it takes about a minute.`,
    }
  }
  return {
    subject: `Last reminder about ${slotName}`,
    lead: `This is the last message about this one. If you would still like a ${noun}, the link below is all you need.`,
  }
}

/** Compose one message. Nothing here decides WHETHER to send; `due.ts` does. */
export function compose(facts: MessageFacts): ComposedMessage {
  const noun = unitWord(facts.category)
  const { subject, lead } = opening(facts.messageNumber, noun, facts.slotName)

  const price = priceLine(facts.unitAmountCents, facts.currency)
  const when = whenItIs(facts.slotAt, facts.slotTimezone)
  const className = facts.inventoryClass?.trim() || null

  const lines: string[] = []
  lines.push(facts.slotName)
  if (when) lines.push(when)
  if (className && price) lines.push(`${className}, ${price} each`)
  else if (className) lines.push(className)
  else if (price) lines.push(price)

  const from = facts.organiserName?.trim()
    ? `You started this booking with ${facts.organiserName.trim()} on EventLinqs.`
    : `You started this booking on EventLinqs.`

  const text = [
    lead,
    '',
    ...lines,
    '',
    `Finish here: ${facts.resumeUrl}`,
    '',
    from,
    facts.signature,
    `If you would rather not hear about this again: ${facts.unsubscribeUrl}`,
  ].join(NEWLINE)

  const html = `<!DOCTYPE html>
<html lang="en-AU"><body style="margin:0;background:#F7F8FA;">
  <div style="font-family:'Hanken Grotesk',Arial,sans-serif;max-width:600px;margin:0 auto;padding:32px 24px;background:#FFFFFF;">
    <p style="margin:0 0 4px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#8A6A12;font-weight:700;">EventLinqs</p>
    <h1 style="margin:0 0 12px;font-size:22px;line-height:1.25;color:#0A1628;">${escapeHtml(subject)}</h1>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#374151;">${escapeHtml(lead)}</p>

    <div style="border:1px solid #E5E7EB;border-radius:12px;padding:16px 18px;margin:0 0 24px;">
      <p style="margin:0 0 4px;font-size:16px;font-weight:700;color:#0A1628;">${escapeHtml(facts.slotName)}</p>
      ${when ? `<p style="margin:0 0 4px;font-size:14px;color:#374151;">${escapeHtml(when)}</p>` : ''}
      ${
        className || price
          ? `<p style="margin:0;font-size:14px;color:#374151;">${escapeHtml(
              [className, price ? `${price} each` : null].filter(Boolean).join(', '),
            )}</p>`
          : ''
      }
    </div>

    <p style="margin:0 0 28px;">
      <a href="${escapeHtml(facts.resumeUrl)}" style="display:inline-block;background:#0A1628;color:#FFFFFF;padding:14px 28px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px;">Finish booking</a>
    </p>

    <p style="margin:0 0 8px;font-size:12px;line-height:1.6;color:#6B7280;">${escapeHtml(from)}</p>
    <p style="margin:0 0 8px;font-size:12px;line-height:1.6;color:#6B7280;">${escapeHtml(facts.signature)}</p>
    <p style="margin:0;font-size:12px;line-height:1.6;color:#6B7280;">
      <a href="${escapeHtml(facts.unsubscribeUrl)}" style="color:#6B7280;">Stop these reminders</a>
    </p>
  </div>
</body></html>`

  return { subject, html, text, unitWord: noun }
}

/**
 * THE OFFER MESSAGE, for the waiting list half of D2.
 *
 *     "A refund or release frees a unit, the waitlist is notified in join order
 *      with a time limited hold that passes down the list on expiry."
 *
 * It says the one thing that matters and says it first: this runs out. A message
 * about a time limited hold that buries the time is a message that produces a
 * person arriving at an expired link and blaming the platform.
 *
 * Same industry rule as the sequence above: the noun comes from the slot's
 * category, so a gym's waiting list offers a class and nothing here changes.
 */
export function composeOffer(facts: {
  slotName: string
  slotAt: string
  slotTimezone: string | null
  category: string
  inventoryClass: string | null
  units: number
  expiresAt: string
  claimUrl: string
  unsubscribeUrl: string
  organiserName: string | null
  signature: string
}): ComposedMessage {
  const noun = unitWord(facts.category)
  const plural = facts.units === 1 ? noun : unitWordPlural(facts.category, facts.units)
  const when = whenItIs(facts.slotAt, facts.slotTimezone)
  const until = whenItIs(facts.expiresAt, facts.slotTimezone)
  const className = facts.inventoryClass?.trim() || null

  const subject = `A ${noun} just opened up for ${facts.slotName}`
  const lead =
    `You asked to be told when one became available. ` +
    `${facts.units} ${plural} ${facts.units === 1 ? 'is' : 'are'} held for you until ${until}, ` +
    `then it passes to the next person waiting.`

  const from = facts.organiserName?.trim()
    ? `You joined this waiting list with ${facts.organiserName.trim()} on EventLinqs.`
    : `You joined this waiting list on EventLinqs.`

  const lines = [facts.slotName]
  if (when) lines.push(when)
  if (className) lines.push(className)

  const text = [
    lead,
    '',
    ...lines,
    '',
    `Claim it here: ${facts.claimUrl}`,
    '',
    from,
    facts.signature,
    `If you would rather not hear about this again: ${facts.unsubscribeUrl}`,
  ].join(NEWLINE)

  const html = `<!DOCTYPE html>
<html lang="en-AU"><body style="margin:0;background:#F7F8FA;">
  <div style="font-family:'Hanken Grotesk',Arial,sans-serif;max-width:600px;margin:0 auto;padding:32px 24px;background:#FFFFFF;">
    <p style="margin:0 0 4px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#8A6A12;font-weight:700;">EventLinqs</p>
    <h1 style="margin:0 0 12px;font-size:22px;line-height:1.25;color:#0A1628;">${escapeHtml(subject)}</h1>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#374151;">${escapeHtml(lead)}</p>

    <div style="border:1px solid #E5E7EB;border-radius:12px;padding:16px 18px;margin:0 0 24px;">
      <p style="margin:0 0 4px;font-size:16px;font-weight:700;color:#0A1628;">${escapeHtml(facts.slotName)}</p>
      ${when ? `<p style="margin:0 0 4px;font-size:14px;color:#374151;">${escapeHtml(when)}</p>` : ''}
      ${className ? `<p style="margin:0;font-size:14px;color:#374151;">${escapeHtml(className)}</p>` : ''}
    </div>

    <p style="margin:0 0 28px;">
      <a href="${escapeHtml(facts.claimUrl)}" style="display:inline-block;background:#0A1628;color:#FFFFFF;padding:14px 28px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px;">Claim it</a>
    </p>

    <p style="margin:0 0 8px;font-size:12px;line-height:1.6;color:#6B7280;">${escapeHtml(from)}</p>
    <p style="margin:0 0 8px;font-size:12px;line-height:1.6;color:#6B7280;">${escapeHtml(facts.signature)}</p>
    <p style="margin:0;font-size:12px;line-height:1.6;color:#6B7280;">
      <a href="${escapeHtml(facts.unsubscribeUrl)}" style="color:#6B7280;">Stop these reminders</a>
    </p>
  </div>
</body></html>`

  return { subject, html, text, unitWord: noun }
}
