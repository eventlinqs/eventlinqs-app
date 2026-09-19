import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { captureException } from '@/lib/observability/sentry'
import { readEveryRow } from '@/lib/supabase/read-every-row'
import { readOrThrow } from '@/lib/supabase/read-or-throw'
import { chunkInFilterValues } from '@/lib/supabase/in-chunks'
import {
  PLATFORM_TENANT_SLUG,
  isTransactionalPurpose,
  normaliseSubjectEmail,
  type ConsentChannel,
  type ConsentChannelScope,
  type ConsentDecisionValue,
  type SuppressionScope,
} from './purposes'
import {
  decideSend,
  type LedgerConsentEvent,
  type LedgerSuppressionEvent,
  type SendVerdict,
} from './decide'

type Admin = SupabaseClient<Database>

/**
 * THE ONE DOOR. Every message this platform sends to a person goes through it.
 *
 * It answers, for a tenant, a subject, a channel and a purpose: may this be
 * sent, and which ledger event decided. A refusal names the evidence, because a
 * platform that cannot say WHY it did not send cannot answer a complaint about
 * why it did.
 *
 * src/lib/consent/send-paths.ts is the registry of every module on the platform
 * that can reach a mail or SMS transport, and the registered guard
 * scripts/guards/consent-ledger-is-evidence.mjs fails the build when a module
 * reaches one without being registered, or when a marketing path reaches one
 * without calling this resolver.
 *
 * A TRANSACTIONAL PURPOSE COSTS NOTHING AND STILL GOES THROUGH THE DOOR. A
 * ticket, a receipt and a sign-in link are messages about a transaction the
 * person started; the resolver permits them by purpose without reading the
 * ledger, so the hot path pays for no query and the decision is still recorded
 * in one place rather than assumed in twenty.
 */

/** Fallback only. The live value is public.consent_policy.max_age_months. */
const CONSENT_MAX_AGE_MONTHS_FALLBACK = 24

export interface ResolveSendParams {
  email: string
  purpose: string
  channel: ConsentChannel
  tenantSlug?: string
  now?: Date
}

export async function resolveSend(
  admin: Admin,
  params: ResolveSendParams,
): Promise<SendVerdict> {
  const tenantSlug = params.tenantSlug ?? PLATFORM_TENANT_SLUG
  const now = params.now ?? new Date()

  if (isTransactionalPurpose(params.purpose)) {
    return decideSend({ tenantSlug, purpose: params.purpose, channel: params.channel, now, maxAgeMonths: 0 }, [], [])
  }

  const email = normaliseSubjectEmail(params.email)
  if (!email) {
    return { permitted: false, reason: 'no subject address was supplied', decidingEventId: null }
  }

  try {
    /*
     * THROUGH THE DOOR, SO THE REFUSAL NAMES THE RIGHT CAUSE.
     *
     * This read discarded its error, so a failure left `tenant` null and the
     * refusal below said "unknown tenant platform" - about the platform's own
     * tenant, which has existed since GA1. That sentence is not a nuisance: it
     * is stored as the detail of a marketing_send_skip row and read back as
     * evidence. `readOrThrow` raises instead, the catch at the bottom of this
     * function answers with the true reason, and the send still fails CLOSED.
     */
    const tenant = await readOrThrow('consent resolver tenant', () =>
      admin.from('marketing_tenants').select('id').eq('slug', tenantSlug).maybeSingle(),
    )
    if (!tenant?.id) {
      return { permitted: false, reason: `unknown tenant ${tenantSlug}`, decidingEventId: null }
    }

    /*
     * THE 200 IS A BOUND AND IT FAILS CLOSED, WHICH IS WHY IT IS NOT PAGED.
     *
     * Both reads are NEWEST FIRST, and `decideSend` uses exactly two things:
     * the latest event whose purpose covers this one, and the suppressions at
     * or after it. Taking the newest 200 can therefore only ever discard rows
     * OLDER than the deciding one. In the worst case a person with 200 newer
     * events of other purposes hides their own grant and the message is
     * REFUSED. Never the reverse. Do not replace this with an unbounded select:
     * that is the defect this file was corrected for on 19 September 2026, and
     * unbounded is not the same as complete.
     */
    const [eventResult, suppressionResult, policyResult] = await Promise.all([
      admin
        .from('consent_events')
        .select('id, purpose, channel_scope, decision, occurred_at, wording_version')
        .eq('tenant_id', tenant.id)
        .eq('subject_email', email)
        .order('occurred_at', { ascending: false })
        .limit(200),
      admin
        .from('suppression_events')
        .select('id, channel, scope, occurred_at')
        .eq('tenant_id', tenant.id)
        .eq('subject_email', email)
        .order('occurred_at', { ascending: false })
        .limit(200),
      admin.from('consent_policy').select('max_age_months').eq('id', true).maybeSingle(),
    ])

    const events: LedgerConsentEvent[] = (eventResult.data ?? []).map((row) => ({
      id: row.id,
      tenantSlug,
      purpose: row.purpose,
      channelScope: row.channel_scope as ConsentChannelScope,
      decision: row.decision as ConsentDecisionValue,
      occurredAt: row.occurred_at,
      wordingVersion: row.wording_version,
    }))

    const suppressions: LedgerSuppressionEvent[] = (suppressionResult.data ?? []).map((row) => ({
      id: row.id,
      tenantSlug,
      channel: row.channel as ConsentChannelScope,
      scope: row.scope as SuppressionScope,
      occurredAt: row.occurred_at,
    }))

    return decideSend(
      {
        tenantSlug,
        purpose: params.purpose,
        channel: params.channel,
        now,
        maxAgeMonths: policyResult.data?.max_age_months ?? CONSENT_MAX_AGE_MONTHS_FALLBACK,
      },
      events,
      suppressions,
    )
  } catch (error) {
    captureException(error, { where: 'lib/consent/resolver:resolveSend' })
    /*
     * A LEDGER THE RESOLVER CANNOT READ REFUSES THE SEND.
     *
     * Fail closed, deliberately and unlike most of this platform's other
     * fallbacks: an unreadable consent record is not evidence of consent, and
     * the cost of not sending a marketing email is a marketing email. The cost
     * of the other choice is a message to somebody who never agreed to it.
     */
    return {
      permitted: false,
      reason: 'the consent ledger could not be read, so the message is refused',
      decidingEventId: null,
    }
  }
}

/**
 * Filter a list of addresses down to the ones a purpose may be sent to.
 *
 * One question per address rather than one query per address: the ledger rows
 * for the whole list are read once. A send list is the shape every marketing
 * path actually needs, and building it here keeps the decision in one place
 * instead of a loop in each caller.
 */
export async function filterPermittedRecipients(
  admin: Admin,
  emails: string[],
  params: { purpose: string; channel: ConsentChannel; tenantSlug?: string; now?: Date },
): Promise<{ permitted: string[]; refused: { email: string; reason: string }[] }> {
  const tenantSlug = params.tenantSlug ?? PLATFORM_TENANT_SLUG
  const now = params.now ?? new Date()
  const normalised = [...new Set(emails.map(normaliseSubjectEmail).filter(Boolean))]
  if (normalised.length === 0) return { permitted: [], refused: [] }

  if (isTransactionalPurpose(params.purpose)) {
    return { permitted: normalised, refused: [] }
  }

  try {
    /*
     * THROUGH THE DOOR, SO THE REFUSAL NAMES THE RIGHT CAUSE.
     *
     * This read discarded its error, so a failure left `tenant` null and the
     * refusal below said "unknown tenant platform" - about the platform's own
     * tenant, which has existed since GA1. That sentence is not a nuisance: it
     * is stored as the detail of a marketing_send_skip row and read back as
     * evidence. `readOrThrow` raises instead, the catch at the bottom of this
     * function answers with the true reason, and the send still fails CLOSED.
     */
    const tenant = await readOrThrow('consent resolver tenant', () =>
      admin.from('marketing_tenants').select('id').eq('slug', tenantSlug).maybeSingle(),
    )
    if (!tenant?.id) {
      return { permitted: [], refused: normalised.map((email) => ({ email, reason: `unknown tenant ${tenantSlug}` })) }
    }

    /*
     * THE ADDRESSES ARE READ IN CHUNKS, AND THE REASON IS A REAL FAILURE.
     *
     * A single `.in()` carrying five hundred addresses is a URL of about
     * twenty-two kilobytes, and PostgREST refuses it. The refusal lands in the
     * catch below, which fails CLOSED, so the whole list came back refused and
     * a matcher run returned nobody: the first driven run of GA2 produced zero
     * matches out of five hundred consented people and every one of them was
     * recorded as "the consent resolver does not permit". Fail-closed is right
     * and it is exactly what made the fault look like a policy decision instead
     * of a broken query.
     *
     * A HUNDRED AT A TIME WAS STILL THE WRONG BOUND, because the thing being
     * bounded is BYTES. An address may legally be 254 characters (RFC 5321
     * 4.5.3.1.3), so a hundred of them is about 25 KB against a documented
     * 16 KB. `chunkInFilterValues` bounds both, and its header carries the
     * citation and the measurement taken on this project.
     */
    const chunks = chunkInFilterValues(normalised)

    /*
     * EVERY ROW, NOT THE FIRST THOUSAND. A hundred addresses is a hundred
     * PEOPLE and an unknown number of ROWS: this ledger is append-only, so a
     * long-standing buyer accumulates an event for every preference change,
     * checkout answer and unsubscribe they ever made. Supabase caps a response
     * at 1,000 rows and reports the truncation nowhere (HTTP 200, no error);
     * this read carried no order, so WHICH rows were dropped was whatever the
     * query plan happened to produce.
     *
     * That is the one truncation that can send a message rather than withhold
     * one. `decideSend` takes the LATEST event per person: drop somebody's
     * withdrawal, keep the grant underneath it, and the platform mails a person
     * who unsubscribed. Every other truncation on this path fails closed; this
     * one failed open.
     */
    const [eventRows, suppressionRows, policyResult] = await Promise.all([
      Promise.all(
        chunks.map(chunk =>
          readEveryRow('the consent ledger', (from, to) =>
            admin
              .from('consent_events')
              .select('id, subject_email, purpose, channel_scope, decision, occurred_at, wording_version')
              .eq('tenant_id', tenant.id)
              .in('subject_email', chunk)
              .order('id', { ascending: true })
              .range(from, to),
          ),
        ),
      ),
      Promise.all(
        chunks.map(chunk =>
          readEveryRow('the suppression ledger', (from, to) =>
            admin
              .from('suppression_events')
              .select('id, subject_email, channel, scope, occurred_at')
              .eq('tenant_id', tenant.id)
              .in('subject_email', chunk)
              .order('id', { ascending: true })
              .range(from, to),
          ),
        ),
      ),
      admin.from('consent_policy').select('max_age_months').eq('id', true).maybeSingle(),
    ])

    /*
     * A CHUNK THAT FAILED IS NOT A CHUNK THAT SAID NO. Reading half the ledger
     * and treating the missing half as "no consent recorded" would refuse real
     * people for a network blip, so any failure raises and the whole list fails
     * closed together, which at least says the same thing about everybody.
     * `readEveryRow` throws on a failed page, so a chunk that could not be read
     * in full reaches the catch below rather than arriving as a short list.
     */
    const eventResult = { data: eventRows.flat() }
    const suppressionResult = { data: suppressionRows.flat() }

    const maxAgeMonths = policyResult.data?.max_age_months ?? CONSENT_MAX_AGE_MONTHS_FALLBACK
    const permitted: string[] = []
    const refused: { email: string; reason: string }[] = []

    for (const email of normalised) {
      const events: LedgerConsentEvent[] = (eventResult.data ?? [])
        .filter((row) => row.subject_email === email)
        .map((row) => ({
          id: row.id,
          tenantSlug,
          purpose: row.purpose,
          channelScope: row.channel_scope as ConsentChannelScope,
          decision: row.decision as ConsentDecisionValue,
          occurredAt: row.occurred_at,
          wordingVersion: row.wording_version,
        }))
      const suppressions: LedgerSuppressionEvent[] = (suppressionResult.data ?? [])
        .filter((row) => row.subject_email === email)
        .map((row) => ({
          id: row.id,
          tenantSlug,
          channel: row.channel as ConsentChannelScope,
          scope: row.scope as SuppressionScope,
          occurredAt: row.occurred_at,
        }))

      const verdict = decideSend(
        { tenantSlug, purpose: params.purpose, channel: params.channel, now, maxAgeMonths },
        events,
        suppressions,
      )
      if (verdict.permitted) permitted.push(email)
      else refused.push({ email, reason: verdict.reason })
    }

    return { permitted, refused }
  } catch (error) {
    captureException(error, { where: 'lib/consent/resolver:filterPermittedRecipients' })
    // Fail closed, for the reason recorded in resolveSend.
    return {
      permitted: [],
      refused: normalised.map((email) => ({
        email,
        reason: 'the consent ledger could not be read, so the message is refused',
      })),
    }
  }
}
