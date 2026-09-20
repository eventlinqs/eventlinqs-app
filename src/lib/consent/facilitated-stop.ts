import type { SupabaseClient } from '@supabase/supabase-js'

import type { Database } from '@/types/database'
import { readEveryRow } from '@/lib/supabase/read-every-row'
import { readOrThrow } from '@/lib/supabase/read-or-throw'
import { chunkInFilterValues } from '@/lib/supabase/in-chunks'
import { formatPlatformDate } from '@/lib/dates/event-time'
import { suppressionScopeWords } from './sentences'
import {
  PLATFORM_TENANT_SLUG,
  normaliseSubjectEmail,
  type ConsentChannelScope,
  type ConsentDecisionValue,
  type SuppressionScope,
} from './purposes'

/**
 * WHO HAS TOLD THIS PLATFORM TO STOP, ANSWERED FOR A SENDER THAT NEEDS NO GRANT.
 *
 * ---------------------------------------------------------------------------
 * THE DEFECT THIS EXISTS TO CLOSE, measured on TEST on 20 September 2026.
 *
 * A person who unsubscribes is told, and `suppression_events` stores as the
 * evidence behind that sentence, that the withdrawal covers
 *
 *     "every EventLinqs facilitated message on every channel"
 *
 * (src/lib/consent/purposes.ts, scopesForPurpose, both branches). It was not
 * true. The abandoned-checkout recovery sender decides who to mail from
 * `suppressedAddresses()` in src/lib/fillrate/read.ts, which read
 * `recovery_suppressions` and NOTHING ELSE, so a withdrawal taken on the
 * preferences page, on the digest unsubscribe page, or through the Gmail
 * one-click button never reached it. Measured on TEST the same day: 147 distinct
 * people carried a suppression event and `recovery_suppressions` held 19 rows.
 *
 * The recovery message is not a borderline case. The engine's own code refuses
 * to send one without an unsubscribe link and says why, in `deliver()`: "The
 * Spam Act 2003 (Cth) requires a functional unsubscribe on every commercial
 * message". It is commercial mail by the sender's own account of itself.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS NOT JUST `filterPermittedRecipients`, which already exists.
 *
 * That function answers "may we market to this person", and its answer requires
 * a positive GRANT. Recovery mail has no grant and needs none: the person put
 * tickets in a basket on this platform, and `decideSend` returns permitted for
 * every transactional purpose without consulting a consent record at all.
 * Routing the recovery sender through the grant check would not have fixed the
 * defect, it would have deleted the feature, silently, by refusing everybody.
 *
 * So the question this module answers is the NARROWER and correct one: has this
 * person explicitly said stop, and have they not since said start again.
 *
 * ---------------------------------------------------------------------------
 * THE THREE RULES, and each one is the ledger's own rule rather than a new one.
 *
 *   1. ONLY THIS TENANT'S RECORDS COUNT. `decideSend` rule 1: "a client's own
 *      suppression never silences EventLinqs". A stop is read inside one tenant
 *      or it is not read at all, so the tenant is resolved first and every read
 *      is filtered on it.
 *   2. THE LATEST WORD WINS. `decideSend` rule 2: "Grant, withdraw, grant leaves
 *      a grant." A suppression followed by a later grant is superseded. Without
 *      this clause a person who unsubscribed in March and opted back in in
 *      September would be barred from recovery mail for ever, which would be a
 *      new defect introduced by the fix for an old one.
 *   3. THE CHANNEL AND THE SCOPE MUST BOTH COVER THE MESSAGE. `all_marketing`
 *      stops everything. `facilitation_by_others` stops a message this platform
 *      sends on an organiser's behalf, which is exactly what a recovery message
 *      is: it promotes one organiser's event to somebody who did not finish
 *      buying a ticket to it. `tenant_own` is neither and does not stop it,
 *      which is the same answer `decideSend` gives. Both live scopes are in real
 *      use: TEST carried 109 `all_marketing` and 96 `facilitation_by_others`
 *      rows, every one of them on channel `both`.
 *
 * ---------------------------------------------------------------------------
 * WHY EVERY READ IS PAGED, and what an unpaged one costs here.
 *
 * Supabase caps one response at a fixed number of rows, 1,000 by default
 * (https://supabase.com/docs/reference/javascript/select, fetched 2026-09-19),
 * and the cap is invisible: HTTP 200, `error` null, a full-looking array.
 * Re-measured against this project on 20 September 2026 rather than trusted:
 *
 *     Content-Range: 0-999/14364      consent_events, unbounded select
 *
 * A suppression list is the one shape where a short read FAILS OPEN. Miss a
 * name and the platform mails the person who asked it not to. So every read
 * here goes through `readEveryRow`, which advances by what arrived and stops
 * only on an empty page.
 *
 * THE SUPPRESSION LIST IS READ WHOLE; THE GRANTS ARE NOT. The set of people who
 * have ever said stop is small and bounded by the people who pressed a button.
 * The consent ledger is not: it held 14,364 rows on TEST. So the grants are read
 * only for the addresses that already carry a suppression, chunked through
 * `chunkInFilterValues`, which is the same shape the resolver uses.
 */

/** One suppression, reduced to the three fields the decision uses. */
export interface FacilitatedStopSuppression {
  channel: ConsentChannelScope
  scope: SuppressionScope
  occurredAt: string
}

/** One consent event, reduced to the three fields the decision uses. */
export interface FacilitatedStopConsent {
  decision: ConsentDecisionValue
  channelScope: ConsentChannelScope
  occurredAt: string
}

export interface FacilitatedStopVerdict {
  stopped: boolean
  /** A sentence a person can be shown, never a code. */
  reason: string
}

/** The channel a recovery message travels on. The engine sends email only. */
const CHANNEL = 'email'

/**
 * The instant, or null when the stored value cannot be read as one.
 *
 * NULL IS NOT ZERO AND IT IS NOT NOW. An unreadable date is a fact we do not
 * have, and every caller below is written so that a missing fact lands on the
 * side of NOT SENDING, which is the only side a suppression decision may fail
 * towards. The first draft of this returned -Infinity, which read as "very old"
 * and therefore let ANY grant supersede an unreadable suppression: a stop that
 * failed open, inside the function written to stop one.
 */
function timeOf(occurredAt: string): number | null {
  const parsed = Date.parse(occurredAt)
  return Number.isNaN(parsed) ? null : parsed
}

/** Newest first, with unreadable dates last so they never win a tie-break. */
function newestFirst<T extends { occurredAt: string }>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => {
    const left = timeOf(a.occurredAt)
    const right = timeOf(b.occurredAt)
    if (left === null && right === null) return 0
    if (left === null) return 1
    if (right === null) return -1
    return right - left
  })
}

function covers(scope: ConsentChannelScope, channel: typeof CHANNEL): boolean {
  return scope === 'both' || scope === channel
}

/**
 * Does this address's own record say stop.
 *
 * PURE, so the rule can be exhausted by a unit test without a database, and so
 * the same rule cannot be half-applied by one caller and not another.
 */
export function decideFacilitatedStop(
  suppressions: readonly FacilitatedStopSuppression[],
  consents: readonly FacilitatedStopConsent[],
): FacilitatedStopVerdict {
  const blocking = newestFirst(
    suppressions.filter(
      (suppression) =>
        covers(suppression.channel, CHANNEL) &&
        (suppression.scope === 'all_marketing' || suppression.scope === 'facilitation_by_others'),
    ),
  )[0]

  if (!blocking) {
    return { stopped: false, reason: 'no suppression on this address covers a facilitated email' }
  }

  /*
   * SUPERSESSION HAS TO BE ESTABLISHED, NOT ASSUMED. Both instants must be
   * readable for one to be later than the other, so an unreadable date on
   * either side leaves the stop standing. The person said stop; the burden is
   * on the record that claims they later said otherwise.
   */
  const blockingAt = timeOf(blocking.occurredAt)
  const laterGrant =
    blockingAt === null
      ? undefined
      : newestFirst(
          consents.filter((consent) => {
            if (consent.decision !== 'granted') return false
            if (!covers(consent.channelScope, CHANNEL)) return false
            const grantedAt = timeOf(consent.occurredAt)
            return grantedAt !== null && grantedAt >= blockingAt
          }),
        )[0]

  if (laterGrant) {
    return {
      stopped: false,
      reason:
        `${suppressionScopeWords(blocking.scope)}, recorded on ${formatPlatformDate(blocking.occurredAt)}, ` +
        `was superseded by a consent granted on ${formatPlatformDate(laterGrant.occurredAt)}`,
    }
  }

  return {
    stopped: true,
    reason: `${suppressionScopeWords(blocking.scope)}, recorded on ${formatPlatformDate(blocking.occurredAt)}, stops this message`,
  }
}

type Admin = SupabaseClient<Database>

interface SuppressionRow {
  subject_email: string | null
  channel: string | null
  scope: string | null
  occurred_at: string | null
}

interface ConsentRow {
  subject_email: string | null
  decision: string | null
  channel_scope: string | null
  occurred_at: string | null
}

/**
 * Every address whose own record says stop, for the facilitated email channel.
 *
 * THROWS RATHER THAN RETURNING WHAT IT MANAGED TO COLLECT. A half-read
 * suppression list is the defect this module exists to end, and a caller that
 * received one could not tell it from a complete one. `readEveryRow` already
 * throws on a failed page; the tenant read goes through `readOrThrow` for the
 * same reason, because a dropped socket must not read as "no such tenant, so
 * nobody has unsubscribed".
 *
 * @param tenantSlug defaults to this platform's own tenant (rule 1 above)
 */
export async function addressesStoppedForFacilitatedMail(
  admin: Admin,
  { tenantSlug = PLATFORM_TENANT_SLUG }: { tenantSlug?: string } = {},
): Promise<Set<string>> {
  const db = admin

  const tenant = await readOrThrow('the facilitated-stop tenant', () =>
    db.from('marketing_tenants').select('id').eq('slug', tenantSlug).maybeSingle(),
  )
  /*
   * NO TENANT ROW IS NOT AN ERROR AND IS NOT A STOP. A platform that has never
   * recorded a consent has no tenant row and nobody has unsubscribed from it.
   * `readOrThrow` has already turned a FAILED read into a throw above, so the
   * only thing reaching here is the database saying there is no such row.
   */
  if (!tenant?.id) return new Set<string>()

  const suppressionRows = await readEveryRow<SuppressionRow>(
    'the facilitated-stop suppressions',
    (from, to) =>
      db
        .from('suppression_events')
        .select('subject_email, channel, scope, occurred_at')
        .eq('tenant_id', tenant.id)
        .order('id', { ascending: true })
        .range(from, to) as unknown as PromiseLike<{ data: SuppressionRow[] | null; error: { message: string } | null }>,
  )

  const suppressionsByAddress = new Map<string, FacilitatedStopSuppression[]>()
  for (const row of suppressionRows) {
    if (!row.subject_email || !row.occurred_at || !row.channel || !row.scope) continue
    const address = normaliseSubjectEmail(row.subject_email)
    const list = suppressionsByAddress.get(address) ?? []
    list.push({
      channel: row.channel as ConsentChannelScope,
      scope: row.scope as SuppressionScope,
      occurredAt: row.occurred_at,
    })
    suppressionsByAddress.set(address, list)
  }

  if (suppressionsByAddress.size === 0) return new Set<string>()

  const addresses = [...suppressionsByAddress.keys()]
  const consentsByAddress = new Map<string, FacilitatedStopConsent[]>()

  /*
   * ASKED ONLY ABOUT THE ADDRESSES THAT ALREADY CARRY A STOP. The ledger held
   * 14,364 rows on TEST against 205 suppressions; reading it whole every sweep
   * to answer a question about a few hundred people would be a read that grows
   * with the platform for no gain.
   */
  for (const chunk of chunkInFilterValues(addresses)) {
    const rows = await readEveryRow<ConsentRow>('the facilitated-stop consents', (from, to) =>
      db
        .from('consent_events')
        .select('subject_email, decision, channel_scope, occurred_at')
        .eq('tenant_id', tenant.id)
        .in('subject_email', chunk)
        .order('id', { ascending: true })
        .range(from, to) as unknown as PromiseLike<{ data: ConsentRow[] | null; error: { message: string } | null }>,
    )

    for (const row of rows) {
      if (!row.subject_email || !row.occurred_at || !row.decision || !row.channel_scope) continue
      const address = normaliseSubjectEmail(row.subject_email)
      const list = consentsByAddress.get(address) ?? []
      list.push({
        decision: row.decision as ConsentDecisionValue,
        channelScope: row.channel_scope as ConsentChannelScope,
        occurredAt: row.occurred_at,
      })
      consentsByAddress.set(address, list)
    }
  }

  const stopped = new Set<string>()
  for (const [address, suppressions] of suppressionsByAddress) {
    const verdict = decideFacilitatedStop(suppressions, consentsByAddress.get(address) ?? [])
    if (verdict.stopped) stopped.add(address)
  }
  return stopped
}
