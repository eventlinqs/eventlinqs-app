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
