/**
 * A CONSENT HISTORY, IN SENTENCES.
 *
 * Pure, so both surfaces that have to say the same thing say it from one place:
 * the admin subject lookup, which is the screen a complaint is answered from,
 * and the person's own rights page, which is where they are told where their
 * details came from (Australian Privacy Principle 7.7).
 *
 * The rule these follow is that a record is only evidence if a person can read
 * it. "granted / v1 / checkout / 2026-09-13T04:11:22Z" is a row. "On 13
 * September 2026 you agreed, at the checkout, that EventLinqs could email and
 * text you about other events near you" is an answer.
 */
import { formatPlatformDateLong } from '@/lib/dates/event-time'
import type { ConsentChannelScope, ConsentDecisionValue, SuppressionScope } from './purposes'

export interface HistoryConsentRow {
  purpose: string
  decision: ConsentDecisionValue
  channelScope: ConsentChannelScope
  wordingVersion: string
  captureSurface: string
  citySlug: string | null
  occurredAt: string
}

export interface HistorySuppressionRow {
  channel: ConsentChannelScope
  scope: SuppressionScope
  reason: string
  requestSource: string
  occurredAt: string
}

/**
 * A date a person reads, in Australian order, with no punctuation tricks, IN
 * THE PLATFORM ZONE.
 *
 * THE DEFECT THIS CLOSES, measured on 19 September 2026. This function built the
 * date from `getUTCDate()`, `getUTCMonth()` and `getUTCFullYear()` over its own
 * month array. Australian eastern time is UTC+10 or UTC+11, so EVERY record made
 * between 10:00 and midnight rendered a day early: a person who pressed
 * unsubscribe at 07:20 on 19 September was told, on this page, that they had
 * done it on 18 September. Fourteen hours of every day, and all of the evening,
 * which is when people read email and press unsubscribe.
 *
 * It is worse here than almost anywhere else on the platform, because the
 * closing line of the page this renders says "Records are kept as evidence of
 * what you were shown and when". A date that is out by a day is not a cosmetic
 * fault on a surface whose whole claim is evidence.
 *
 * The rule it now follows is the platform's own, written at
 * src/lib/dates/event-time.ts: a date with no event behind it takes the platform
 * zone. A consent event has no event behind it. There is no longer a month array
 * or a date getter in this file, so the zone cannot be got wrong here again
 * without deleting the delegation, which
 * scripts/guards/consent-dates-are-zoned.mjs fails the build for.
 */
export function readableDate(iso: string): string {
  const at = new Date(iso)
  // Kept ahead of the delegation: the shared formatter answers a malformed date
  // with the raw string, which is right for an admin table and wrong inside a
  // sentence a member of the public reads.
  if (Number.isNaN(at.getTime())) return 'an unrecorded date'
  return formatPlatformDateLong(iso)
}

/** Where a record was captured, said as a place rather than a code. */
export function readableSurface(surface: string): string {
  const cleaned = surface.startsWith('migrated:') ? surface.slice('migrated:'.length) : surface
  const named: Record<string, string> = {
    checkout: 'at the checkout',
    'squad-checkout': 'while paying for a group booking',
    account: 'in your account settings',
    signup: 'when you created your account',
    'newsletter-city': 'on a city page newsletter panel',
    'city-waitlist': 'when you joined a city list',
    'unsubscribe-token': 'from an unsubscribe link in a message',
    'waitlist-token': 'from an unsubscribe link in a city list message',
    'preference-centre': 'in your account notification settings',
    'rights-page': 'on the marketing preferences page',
  }
  const place = named[cleaned] ?? `on the ${cleaned} surface`
  return surface.startsWith('migrated:') ? `${place}, before the consent ledger existed` : place
}

function channelWords(scope: ConsentChannelScope): string {
  if (scope === 'both') return 'email and SMS'
  if (scope === 'sms') return 'SMS'
  return 'email'
}

export function consentEventSentence(row: HistoryConsentRow): string {
  const when = readableDate(row.occurredAt)
  const where = readableSurface(row.captureSurface)
  const channels = channelWords(row.channelScope)
  const city = row.citySlug ? `, scoped to ${row.citySlug}` : ''

  if (row.decision === 'granted') {
    return `On ${when}, ${where}, this address agreed to EventLinqs marketing by ${channels}${city}. The exact wording is recorded as version ${row.wordingVersion}.`
  }
  if (row.decision === 'withdrawn') {
    return `On ${when}, ${where}, this address withdrew that agreement. EventLinqs marketing stopped on every channel from that moment.`
  }
  return `On ${when}, ${where}, this address was asked and said no. Nothing was ever sent on the strength of it.`
}

/**
 * A SUPPRESSION SCOPE AS A NOUN PHRASE, because the decision modules were
 * printing the DATABASE ENUM at a member of the public.
 *
 * Driven on 21 September 2026 at 390, 768 and 1440, the person's own
 * preferences page said, in full:
 *
 *   "Right now, EventLinqs sends you no marketing: a all_marketing suppression
 *    recorded on 1 July 2026 stops this message."
 *
 * Two faults in one sentence. `all_marketing` is a column value and means
 * nothing to the person reading it, and "a all_marketing" is wrong English
 * because the article was a literal in a format string while the word after it
 * was a variable. That page is the unsubscribe facility the Spam Act 2003 is
 * about, and the sentence beneath it claims the records are evidence.
 *
 * It is a noun phrase rather than a whole sentence so that both callers can
 * place it: `${words}, recorded on ${date}, stops this message`.
 * `suppressionSentence` below keeps its own verb phrasing, which is already
 * correct prose and a different grammatical shape.
 *
 * THE SQL TWIN STILL SAYS THE OLD WORDS, and that is recorded rather than
 * hidden: `public.consent_permits` carries the same rules in SQL for the
 * trigger that maintains the audience asset, and its `format('a %s suppression
 * ...')` needs a migration to change. No product path reads that function's
 * reason - nothing under src/ calls it - so nobody is shown the old sentence,
 * and the drive that compares the two resolvers compares `permitted`. The
 * alignment is queued in REVIEW-QUEUE-B.md for the next migration.
 */
export function suppressionScopeWords(scope: SuppressionScope): string {
  if (scope === 'facilitation_by_others') {
    return 'a request not to be marketed to on behalf of other organisations'
  }
  if (scope === 'tenant_own') return "a stop on this client's own list"
  return 'an unsubscribe from all EventLinqs marketing'
}

export function suppressionSentence(row: HistorySuppressionRow): string {
  const when = readableDate(row.occurredAt)
  const channels = channelWords(row.channel)
  if (row.scope === 'facilitation_by_others') {
    return `On ${when} this address asked that its details are not used to help other organisations market to it. That request covers ${channels} and was applied at once.`
  }
  if (row.scope === 'tenant_own') {
    return `On ${when} this address was suppressed for one client's own list only, on ${channels}.`
  }
  return `On ${when} this address was suppressed for all EventLinqs marketing on ${channels}.`
}

/**
 * The APP 7.7 answer: where the details came from, in plain words.
 *
 * The right is to be TOLD THE SOURCE, so the answer names the surface and the
 * date the platform first got the address, and says plainly that no list was
 * bought, because that is the question people are really asking.
 */
export function sourceDisclosureSentences(rows: HistoryConsentRow[]): string[] {
  if (rows.length === 0) {
    return [
      'EventLinqs holds no marketing consent record for this address.',
      'EventLinqs does not buy marketing lists, so an address is only ever here because it was given to us.',
    ]
  }
  const oldest = [...rows].sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt))[0]
  return [
    `EventLinqs got these details from you directly, ${readableSurface(oldest.captureSurface)}, on ${readableDate(oldest.occurredAt)}.`,
    'They were not bought, rented or taken from another list. EventLinqs does not buy marketing lists and does not sell yours.',
    'Every record of what you were shown, and when, is kept below.',
  ]
}

/**
 * WHAT THE PLATFORM WILL DO NEXT, said to the person whose consent it is.
 *
 * THE DEFECT THIS CLOSES, 21 September 2026. This sentence used to be built
 * inline on /marketing/preferences/[token] from `permitted` alone:
 *
 *     Right now, EventLinqs sends you no marketing: the consent ledger could
 *     not be read, so the message is refused.
 *
 * The resolver fails CLOSED, so an unreadable ledger produces `permitted:
 * false`, and the page then ASSERTED THEIR STATE on a read that had failed. The
 * leading clause is a statement about them, the trailing clause is the internal
 * reason pasted after a colon, and the page exists so that a person can see and
 * change their own marketing state. Somebody reading "EventLinqs sends you no
 * marketing" concludes they are already unsubscribed and stops pressing, which
 * is the same harm this platform already ruled on when a live unsubscribe link
 * was called spent because a socket dropped (commit 162c6d28).
 *
 * So there are THREE sentences, not two, and the third one does not pretend to
 * know. Nothing on the page changes in that state, which it says, because the
 * useful thing to tell somebody in the middle of an outage is that their record
 * is untouched and to come back.
 */
export function marketingStateSentence(verdict: {
  permitted: boolean
  reason: string
  ledgerWasRead: boolean
} | null): string {
  if (!verdict) {
    return 'Right now, EventLinqs sends you no marketing: no consent is recorded for this address.'
  }
  if (!verdict.ledgerWasRead) {
    return 'We could not check your marketing record just now. Nothing on it has changed, and nothing has been sent. Please open this link again in a few minutes.'
  }
  return verdict.permitted
    ? 'Right now, EventLinqs can send you marketing about events near you.'
    : `Right now, EventLinqs sends you no marketing: ${verdict.reason}.`
}
