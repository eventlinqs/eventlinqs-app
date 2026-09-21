/**
 * THE RESOLVER'S DECISION, PURE.
 *
 * One question, one answer: may this tenant send to this person, on this
 * channel, for this purpose, and WHICH ledger event decided it. Every send path
 * on the platform asks it (src/lib/consent/send-paths.ts is the registry), and
 * a refusal always names the evidence, because "we did not send" is only worth
 * anything if it can say why.
 *
 * PURE ON PURPOSE. The rules that decide whether a real person receives
 * marketing mail are the rules that must be readable and exhaustively testable
 * without standing a database up, so this file takes rows and returns a verdict
 * and touches nothing else. src/lib/consent/resolver.ts is the half that reads
 * the ledger.
 *
 * TWO IMPORTS BEYOND ITS OWN TYPES, AND BOTH ARE PURE WORDING. The verdict's
 * reason is prose a person reads back as evidence, and it is stored as the
 * detail of every marketing_send_skip row. It used to slice the first ten
 * characters off the ISO instant, which is the UTC calendar date and is a day
 * early for every Australian evening. formatPlatformDate is pure, so this file
 * is still a function of its arguments and still testable with no database.
 *
 * THE ONE DUPLICATION, STATED RATHER THAN HIDDEN. public.consent_permits in
 * supabase/migrations/20260913000040_consent_ledger.sql carries the same rules
 * in SQL, because the audience asset is maintained by a trigger (a paid order
 * confirms on the Stripe webhook, in another lane's code) and a trigger cannot
 * call TypeScript. The drive compares the two across a matrix of subjects
 * rather than assuming they agree.
 */
import { formatPlatformDate } from '@/lib/dates/event-time'
import { suppressionScopeWords } from './sentences'
import {
  type ConsentChannel,
  type ConsentChannelScope,
  type ConsentDecisionValue,
  type SuppressionScope,
  coveringPurposes,
  findPurpose,
  isTransactionalPurpose,
} from './purposes'

export interface LedgerConsentEvent {
  id: string
  tenantSlug: string
  purpose: string
  channelScope: ConsentChannelScope
  decision: ConsentDecisionValue
  /** ISO timestamp. */
  occurredAt: string
  wordingVersion: string
}

export interface LedgerSuppressionEvent {
  id: string
  tenantSlug: string
  channel: ConsentChannelScope
  scope: SuppressionScope
  /** ISO timestamp. */
  occurredAt: string
}

export interface SendQuestion {
  tenantSlug: string
  purpose: string
  channel: ConsentChannel
  /** The moment the decision is made, so ageing is testable without a clock. */
  now: Date
  /** Configuration (public.consent_policy), never a literal. */
  maxAgeMonths: number
}

export interface SendVerdict {
  permitted: boolean
  /** Plain words, naming the deciding event where there is one. */
  reason: string
  decidingEventId: string | null
}

function timeOf(iso: string): number {
  const value = Date.parse(iso)
  return Number.isNaN(value) ? 0 : value
}

/** Latest first, with the id as a stable tie-break for same-instant rows. */
function latestFirst<T extends { occurredAt: string; id: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const delta = timeOf(b.occurredAt) - timeOf(a.occurredAt)
    return delta !== 0 ? delta : b.id.localeCompare(a.id)
  })
}

/** Whether a recorded channel scope covers the channel being asked about. */
function scopeCovers(scope: ConsentChannelScope, channel: ConsentChannel): boolean {
  return scope === 'both' || scope === channel
}

/**
 * The age boundary, in calendar months rather than days, because the threshold
 * is stated in months and a person reading a consent record counts months.
 */
function isOlderThan(occurredAt: string, now: Date, months: number): boolean {
  const at = new Date(timeOf(occurredAt))
  const boundary = new Date(now.getTime())
  boundary.setMonth(boundary.getMonth() - months)
  return at.getTime() < boundary.getTime()
}

/**
 * Decide one send.
 *
 * The rules, in the order they are applied:
 *   0. A transactional purpose is not direct marketing and is permitted, named.
 *   1. Only this tenant's records are considered, so an unsubscribe from
 *      EventLinqs never destroys a future client's own separately collected
 *      list, and a client's own suppression never silences EventLinqs.
 *   2. The LATEST consent event wins. Grant, withdraw, grant leaves a grant.
 *   3. A withdrawal or a decline refuses, naming the event that said so.
 *   4. The channel must be inside the recorded channel scope.
 *   5. A consent older than the configured threshold is refused until it is
 *      granted again.
 *   6. A suppression recorded at or after the deciding grant refuses. One
 *      unsubscribe from an EventLinqs facilitated message stops every
 *      EventLinqs facilitated message on every channel at once.
 */
export function decideSend(
  question: SendQuestion,
  events: LedgerConsentEvent[],
  suppressions: LedgerSuppressionEvent[],
): SendVerdict {
  if (isTransactionalPurpose(question.purpose)) {
    return {
      permitted: true,
      reason: `${question.purpose} is a transactional message about the person's own order and is not direct marketing`,
      decidingEventId: null,
    }
  }

  const definition = findPurpose(question.purpose)
  if (!definition) {
    return { permitted: false, reason: `unknown purpose ${question.purpose}`, decidingEventId: null }
  }

  const covering = coveringPurposes(question.purpose)
  const relevant = events.filter(
    (event) => event.tenantSlug === question.tenantSlug && covering.includes(event.purpose),
  )

  const deciding = latestFirst(relevant)[0]
  if (!deciding) {
    return {
      permitted: false,
      reason: 'no consent event is recorded for this tenant, purpose and subject',
      decidingEventId: null,
    }
  }

  if (deciding.decision !== 'granted') {
    return {
      permitted: false,
      reason: `the latest consent event is ${deciding.decision}`,
      decidingEventId: deciding.id,
    }
  }

  if (!scopeCovers(deciding.channelScope, question.channel)) {
    return {
      permitted: false,
      reason: `the consent covers ${deciding.channelScope} and the message is ${question.channel}`,
      decidingEventId: deciding.id,
    }
  }

  if (isOlderThan(deciding.occurredAt, question.now, question.maxAgeMonths)) {
    return {
      permitted: false,
      reason: `the consent is older than the ${question.maxAgeMonths} month threshold and needs granting again`,
      decidingEventId: deciding.id,
    }
  }

  const blocking = latestFirst(
    suppressions.filter((suppression) => {
      if (suppression.tenantSlug !== question.tenantSlug) return false
      if (!scopeCovers(suppression.channel, question.channel)) return false
      if (timeOf(suppression.occurredAt) < timeOf(deciding.occurredAt)) return false
      if (suppression.scope === 'all_marketing') return true
      if (suppression.scope === 'facilitation_by_others') return definition.facilitatesThirdParties
      return false
    }),
  )[0]

  if (blocking) {
    return {
      permitted: false,
      reason: `${suppressionScopeWords(blocking.scope)}, recorded on ${formatPlatformDate(blocking.occurredAt)}, stops this message`,
      decidingEventId: deciding.id,
    }
  }

  return {
    permitted: true,
    reason: `granted on ${formatPlatformDate(deciding.occurredAt)} under wording ${deciding.wordingVersion}`,
    decidingEventId: deciding.id,
  }
}
