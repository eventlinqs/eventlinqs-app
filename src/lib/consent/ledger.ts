import 'server-only'
import { readEveryRow } from '@/lib/supabase/read-every-row'
import { ReadFailed, readOrThrow } from '@/lib/supabase/read-or-throw'
import { isUnsubscribeToken } from './token'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { captureException } from '@/lib/observability/sentry'
import {
  PLATFORM_TENANT_SLUG,
  normaliseSubjectEmail,
  type ConsentChannelScope,
  type ConsentDecisionValue,
  type SuppressionScope,
} from './purposes'

type Admin = SupabaseClient<Database>

/**
 * WRITING TO THE CONSENT LEDGER, AND READING WHAT IS IN IT.
 *
 * The ledger is APPEND ONLY and the database enforces it, so there is no update
 * here and no delete here: a change of mind is a new event. Everything a
 * complaint has to be answered from rides on the row at the moment of capture,
 * because none of it can be reconstructed afterwards: the tenant, the purpose,
 * the channel scope, the verbatim wording, the wording version, the surface it
 * was captured on, whose marketing it covers and what a withdrawal stops.
 *
 * NOTHING IN THIS FILE SENDS ANYTHING. There is no transport import here and
 * there is not allowed to be one; the guard fails the build if that changes.
 */

export interface ConsentWordingRecord {
  purpose: string
  version: string
  label: string
  body: string
  channelScope: ConsentChannelScope
  thirdPartyScope: string
  suppressionScope: string
}

/**
 * The wording currently in force for a purpose: the newest effective version.
 *
 * The checkout renders from this and the privacy page reads the same row, so
 * the sentence a buyer agrees to and the sentence the privacy page describes
 * can never drift apart. A caller that cannot read it must not invent one, so
 * this returns null and the surface asks nothing rather than asking under
 * wording it cannot prove.
 */
export async function getCurrentConsentWording(
  admin: Admin,
  purpose: string,
): Promise<ConsentWordingRecord | null> {
  return getConsentWordingAsAt(admin, purpose, new Date().toISOString())
}

/**
 * THE WORDING THAT WAS IN FORCE AT A GIVEN MOMENT.
 *
 * AQ1 separates the moment a buyer READS the sentence from the moment their
 * consent is WRITTEN: under the reversal condition the question is asked on the
 * ticket page and recorded at the payment step. The version in force when the
 * reservation was created is the closest thing the server itself knows to what
 * was on screen, and it is knowable without trusting anything the browser says,
 * which a version sent up from the client would not be.
 *
 * THE RESIDUAL WINDOW IS STATED RATHER THAN HIDDEN: a wording version published
 * between the page rendering and the reservation being created would be missed,
 * because the server has nothing that records the render. That window is
 * sub-second and the alternative closes it only by believing the client.
 */
export async function getConsentWordingAsAt(
  admin: Admin,
  purpose: string,
  at: string,
): Promise<ConsentWordingRecord | null> {
  try {
    const { data, error } = await admin
      .from('consent_wordings')
      .select('purpose, version, label, body, channel_scope, third_party_scope, suppression_scope')
      .eq('purpose', purpose)
      .lte('effective_from', at)
      .order('effective_from', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error || !data) return null
    return {
      purpose: data.purpose,
      version: data.version,
      label: data.label,
      body: data.body,
      channelScope: data.channel_scope as ConsentChannelScope,
      thirdPartyScope: data.third_party_scope,
      suppressionScope: data.suppression_scope,
    }
  } catch (error) {
    captureException(error, { where: 'lib/consent/ledger:getConsentWordingAsAt' })
    return null
  }
}

/**
 * ONE SPECIFIC VERSION OF A WORDING, read back by the version that was shown.
 *
 * AQ1 moves the question to the ticket page under its reversal condition, so
 * the sentence a buyer reads and the moment their consent is written are no
 * longer the same request. consent_wordings refuses UPDATE and DELETE, so a
 * version is the same row it was when they read it: reading it back cannot
 * widen a consent after the fact, and the alternative (re-reading whichever
 * version is in force at payment time) silently could.
 */
export async function getConsentWordingByVersion(
  admin: Admin,
  purpose: string,
  version: string,
): Promise<ConsentWordingRecord | null> {
  try {
    const { data, error } = await admin
      .from('consent_wordings')
      .select('purpose, version, label, body, channel_scope, third_party_scope, suppression_scope')
      .eq('purpose', purpose)
      .eq('version', version)
      .maybeSingle()
    if (error || !data) return null
    return {
      purpose: data.purpose,
      version: data.version,
      label: data.label,
      body: data.body,
      channelScope: data.channel_scope as ConsentChannelScope,
      thirdPartyScope: data.third_party_scope,
      suppressionScope: data.suppression_scope,
    }
  } catch (error) {
    captureException(error, { where: 'lib/consent/ledger:getConsentWordingByVersion' })
    return null
  }
}

export interface RecordConsentParams {
  email: string
  purpose: string
  decision: ConsentDecisionValue
  /** The verbatim sentence the person read. Never a summary of it. */
  wording: string
  wordingVersion: string
  channelScope: ConsentChannelScope
  thirdPartyScope: string
  suppressionScope: string
  captureSurface: string
  citySlug?: string | null
  mobileHash?: string | null
  /** An IP or session reference, so a record can be tied to a moment. */
  reference?: string | null
  tenantSlug?: string
  at?: string
}

/** The ledger fields a stored wording record supplies, in one place. */
export function consentFieldsFromWording(
  wording: ConsentWordingRecord,
): Pick<
  RecordConsentParams,
  'purpose' | 'wording' | 'wordingVersion' | 'channelScope' | 'thirdPartyScope' | 'suppressionScope'
> {
  return {
    purpose: wording.purpose,
    wording: wording.body,
    wordingVersion: wording.version,
    channelScope: wording.channelScope,
    thirdPartyScope: wording.thirdPartyScope,
    suppressionScope: wording.suppressionScope,
  }
}

/**
 * Record one consent event.
 *
 * Best effort by design: a marketing record is never worth somebody's ticket,
 * so a failure here is captured and reported false rather than thrown into a
 * checkout. The evidence that matters is written in one statement, so there is
 * no half-written state to reason about.
 */
export async function recordConsentEvent(
  admin: Admin,
  params: RecordConsentParams,
): Promise<boolean> {
  try {
    const email = normaliseSubjectEmail(params.email)
    if (!email) return false

    const tenantSlug = params.tenantSlug ?? PLATFORM_TENANT_SLUG
    /*
     * THROUGH THE DOOR, SO A BLINK IS NOT "NO SUCH TENANT". Without it a failed
     * read returned false here, before the catch below, so the ledger write
     * that a person's unsubscribe or consent depends on was abandoned with
     * nothing logged anywhere. `readOrThrow` throws, the catch records it, and
     * the caller still sees false - but now somebody can find out why.
     */
    const tenant = await readOrThrow('consent ledger tenant', () =>
      admin.from('marketing_tenants').select('id').eq('slug', tenantSlug).maybeSingle(),
    )
    if (!tenant?.id) return false

    const { error } = await admin.from('consent_events').insert({
      tenant_id: tenant.id,
      subject_email: email,
      subject_mobile_hash: params.mobileHash ?? null,
      purpose: params.purpose,
      channel_scope: params.channelScope,
      decision: params.decision,
      wording: params.wording,
      wording_version: params.wordingVersion,
      capture_surface: params.captureSurface,
      third_party_scope: params.thirdPartyScope,
      suppression_scope: params.suppressionScope,
      city_slug: params.citySlug ?? null,
      occurred_at: params.at ?? new Date().toISOString(),
      ip_or_session_ref: params.reference ?? null,
    })
    return !error
  } catch (error) {
    captureException(error, { where: 'lib/consent/ledger:recordConsentEvent' })
    return false
  }
}

export interface RecordSuppressionParams {
  email: string
  channel: ConsentChannelScope
  scope: SuppressionScope
  reason: string
  requestSource: string
  mobileHash?: string | null
  tenantSlug?: string
  at?: string
}

/**
 * Record one suppression.
 *
 * A suppression is a fact that arrived, never a flag that gets toggled, so a
 * second unsubscribe writes a second fact rather than editing the first. The
 * resolver reads the latest, so repeating it changes nothing a person can see,
 * which is exactly what idempotent means from their side of the message.
 */
export async function recordSuppressionEvent(
  admin: Admin,
  params: RecordSuppressionParams,
): Promise<boolean> {
  try {
    const email = normaliseSubjectEmail(params.email)
    if (!email) return false

    const tenantSlug = params.tenantSlug ?? PLATFORM_TENANT_SLUG
    /*
     * THROUGH THE DOOR, SO A BLINK IS NOT "NO SUCH TENANT". Without it a failed
     * read returned false here, before the catch below, so the ledger write
     * that a person's unsubscribe or consent depends on was abandoned with
     * nothing logged anywhere. `readOrThrow` throws, the catch records it, and
     * the caller still sees false - but now somebody can find out why.
     */
    const tenant = await readOrThrow('consent ledger tenant', () =>
      admin.from('marketing_tenants').select('id').eq('slug', tenantSlug).maybeSingle(),
    )
    if (!tenant?.id) return false

    const { error } = await admin.from('suppression_events').insert({
      tenant_id: tenant.id,
      subject_email: email,
      subject_mobile_hash: params.mobileHash ?? null,
      channel: params.channel,
      scope: params.scope,
      reason: params.reason,
      request_source: params.requestSource,
      occurred_at: params.at ?? new Date().toISOString(),
    })
    return !error
  } catch (error) {
    captureException(error, { where: 'lib/consent/ledger:recordSuppressionEvent' })
    return false
  }
}

/**
 * WHO A MESSAGE TOKEN BELONGS TO, WITH NO SESSION.
 *
 * Every message carries a token, and the two rights routes need to know whose
 * address it is without asking anybody to log in: a right you have to create an
 * account to exercise is not a right anybody exercises. Both tokens a recipient
 * can be holding are accepted, the platform consent token and the city waitlist
 * token, so nobody is ever sent a link that does nothing.
 */
export async function findSubjectByToken(admin: Admin, token: string): Promise<string | null> {
  if (!isUnsubscribeToken(token)) {
    return null
  }
  /*
   * A FAILED READ HERE TELLS A PERSON THEIR UNSUBSCRIBE LINK IS NOT VALID.
   *
   * null from this function makes /marketing/preferences/[token] render "This
   * link is not valid", and that page is the unsubscribe facility the Spam Act
   * 2003 is about. Both reads discarded their error, so a dropped socket became
   * a permanent-looking refusal of a right, on the one surface where it must
   * never happen. Through the door, and the catch re-raises a read failure
   * rather than folding it back into the same null.
   */
  try {
    const consentRow = await readOrThrow('unsubscribe token, platform consent', () =>
      admin.from('marketing_consents').select('email').eq('unsubscribe_token', token).maybeSingle(),
    )
    if (consentRow?.email) return normaliseSubjectEmail(consentRow.email)

    const waitlistRow = await readOrThrow('unsubscribe token, city waitlist', () =>
      admin.from('city_waitlist_signups').select('email').eq('unsubscribe_token', token).maybeSingle(),
    )
    if (waitlistRow?.email) return normaliseSubjectEmail(waitlistRow.email)

    return null
  } catch (error) {
    captureException(error, { where: 'lib/consent/ledger:findSubjectByToken' })
    // "Not valid" is a statement about the token. A read that failed is not
    // evidence about the token, so it is raised and the page answers 500.
    if (error instanceof ReadFailed) throw error
    return null
  }
}

export interface SubjectConsentRow {
  id: string
  purpose: string
  decision: ConsentDecisionValue
  channelScope: ConsentChannelScope
  wording: string
  wordingVersion: string
  captureSurface: string
  thirdPartyScope: string
  suppressionScope: string
  citySlug: string | null
  occurredAt: string
}

export interface SubjectSuppressionRow {
  id: string
  channel: ConsentChannelScope
  scope: SuppressionScope
  reason: string
  requestSource: string
  occurredAt: string
}

export interface SubjectHistory {
  email: string
  consents: SubjectConsentRow[]
  suppressions: SubjectSuppressionRow[]
}

/**
 * One person's whole history, newest first.
 *
 * This is the screen a complaint is answered from and the answer the APP 7.7
 * source disclosure gives, so it returns the records themselves rather than a
 * summary: where each one came from, under exactly which words, and when.
 */
export async function readSubjectHistory(
  admin: Admin,
  email: string,
  tenantSlug: string = PLATFORM_TENANT_SLUG,
): Promise<SubjectHistory> {
  const normalised = normaliseSubjectEmail(email)
  const empty: SubjectHistory = { email: normalised, consents: [], suppressions: [] }
  if (!normalised) return empty

  try {
    const tenant = await readOrThrow('subject history tenant', () =>
      admin.from('marketing_tenants').select('id').eq('slug', tenantSlug).maybeSingle(),
    )
    if (!tenant?.id) return empty

    /*
     * ONE PERSON'S WHOLE HISTORY, PAGED, BECAUSE THIS IS THE ANSWER TO A LEGAL
     * QUESTION. This read backs the preferences page a person reads about
     * themselves and the admin screen a complaint is answered from. A silent
     * 1,000-row ceiling would answer a request for everything held about
     * somebody with most of it, which is the one failure this surface cannot
     * have. Ordered newest first for display, with the id as the tie-break so
     * paging is over a total order.
     */
    const [consentRows, suppressionRows] = await Promise.all([
      readEveryRow('the subject consent history', (from, to) =>
        admin
          .from('consent_events')
          .select(
            'id, purpose, decision, channel_scope, wording, wording_version, capture_surface, third_party_scope, suppression_scope, city_slug, occurred_at',
          )
          .eq('tenant_id', tenant.id)
          .eq('subject_email', normalised)
          .order('occurred_at', { ascending: false })
          .order('id', { ascending: false })
          .range(from, to),
      ),
      readEveryRow('the subject suppression history', (from, to) =>
        admin
          .from('suppression_events')
          .select('id, channel, scope, reason, request_source, occurred_at')
          .eq('tenant_id', tenant.id)
          .eq('subject_email', normalised)
          .order('occurred_at', { ascending: false })
          .order('id', { ascending: false })
          .range(from, to),
      ),
    ])

    return {
      email: normalised,
      consents: consentRows.map((row) => ({
        id: row.id,
        purpose: row.purpose,
        decision: row.decision as ConsentDecisionValue,
        channelScope: row.channel_scope as ConsentChannelScope,
        wording: row.wording,
        wordingVersion: row.wording_version,
        captureSurface: row.capture_surface,
        thirdPartyScope: row.third_party_scope,
        suppressionScope: row.suppression_scope,
        citySlug: row.city_slug,
        occurredAt: row.occurred_at,
      })),
      suppressions: suppressionRows.map((row) => ({
        id: row.id,
        channel: row.channel as ConsentChannelScope,
        scope: row.scope as SuppressionScope,
        reason: row.reason,
        requestSource: row.request_source,
        occurredAt: row.occurred_at,
      })),
    }
  } catch (error) {
    captureException(error, { where: 'lib/consent/ledger:readSubjectHistory' })
    /*
     * AN EMPTY HISTORY IS AN ANSWER TO A LEGAL QUESTION AND IT MUST BE TRUE.
     *
     * This backs the preferences page a person reads about themselves and the
     * admin screen a complaint is answered from. "We hold nothing about you" is
     * a statement; a read that failed is not evidence for it. Note that
     * `readEveryRow` above ALREADY throws on a failed page, and this catch was
     * quietly turning every one of those into the same empty answer.
     */
    if (error instanceof ReadFailed) throw error
    throw new ReadFailed('consent subject history', error)
  }
}
