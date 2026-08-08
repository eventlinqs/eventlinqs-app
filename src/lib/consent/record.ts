import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import {
  CONSENT_WORDING_VERSION,
  DIGEST_CONSENT_WORDING,
  DIGEST_CONSENT_WORDING_VERSION,
  organiserMarketingConsentWording,
  normaliseConsentEmail,
} from './wording'

type Admin = SupabaseClient<Database>

/**
 * Record (or refresh) an attendee's EXPRESS consent for an organiser to send
 * them marketing email. Per-organiser: upserts the single (organisation, email)
 * row. Re-consent flips a previously withdrawn row back to granted. The existing
 * unsubscribe_token is preserved on update (omitted from the payload) so old
 * unsubscribe links keep working. Best-effort: never throws into the checkout.
 */
export async function recordOrganiserMarketingConsent(
  admin: Admin,
  params: {
    organisationId: string
    organiserName: string
    email: string
    userId?: string | null
    orderId?: string | null
    eventId?: string | null
    source?: string
    at: string
  },
): Promise<boolean> {
  try {
    const email = normaliseConsentEmail(params.email)
    if (!email) return false
    const { error } = await admin.from('organiser_marketing_consents').upsert(
      {
        organisation_id: params.organisationId,
        email,
        user_id: params.userId ?? null,
        order_id: params.orderId ?? null,
        event_id: params.eventId ?? null,
        status: 'granted',
        consent_text: organiserMarketingConsentWording(params.organiserName),
        consent_version: CONSENT_WORDING_VERSION,
        source: params.source ?? 'checkout',
        updated_at: params.at,
        withdrawn_at: null,
      },
      { onConflict: 'organisation_id,email' },
    )
    return !error
  } catch {
    return false
  }
}

/**
 * Record the separate, optional EventLinqs platform-updates opt-in, kept in the
 * existing email_subscribers table (never mixed with organiser marketing). A
 * re-tick re-subscribes a previously unsubscribed address (their explicit act).
 */
export async function recordPlatformUpdateConsent(
  admin: Admin,
  params: { email: string; source?: string },
): Promise<boolean> {
  try {
    const email = normaliseConsentEmail(params.email)
    if (!email) return false
    const { error } = await admin.from('email_subscribers').upsert(
      {
        email,
        source: params.source ?? 'checkout',
        consent: true,
        unsubscribed_at: null,
      },
      { onConflict: 'email' },
    )
    return !error
  } catch {
    return false
  }
}

/**
 * Record (or refresh) the express weekly-local-digest consent (Broadcast
 * Layer SPEC 3.1) in marketing_consents: city scoped, wording recorded
 * verbatim, token preserved on update so old unsubscribe links keep working.
 * Best-effort: never throws into checkout or signup.
 */
export async function recordPlatformDigestConsent(
  admin: Admin,
  params: {
    email: string
    userId?: string | null
    citySlug?: string | null
    source?: string
    at: string
    /** The wording actually shown, when the surface differs from the standard
     * checkout opt-in. The city newsletter panel makes its own promise, and
     * the evidence has to be the sentence the person read, not a generic one
     * standing in for it. */
    consentText?: string
    consentVersion?: string
  },
): Promise<boolean> {
  try {
    const email = normaliseConsentEmail(params.email)
    if (!email) return false
    const { error } = await admin.from('marketing_consents').upsert(
      {
        email,
        user_id: params.userId ?? null,
        city_slug: params.citySlug ?? null,
        status: 'granted',
        consent_text: params.consentText ?? DIGEST_CONSENT_WORDING,
        consent_version: params.consentVersion ?? DIGEST_CONSENT_WORDING_VERSION,
        source: params.source ?? 'checkout',
        updated_at: params.at,
        revoked_at: null,
      },
      { onConflict: 'email' },
    )
    return !error
  } catch {
    return false
  }
}

export type DigestUnsubscribeSource = 'consent' | 'waitlist'

export interface DigestUnsubscribeResult {
  /** Which consent record the token belonged to. */
  source: DigestUnsubscribeSource
  email: string
  alreadyWithdrawn: boolean
}

/**
 * Withdraw the weekly digest by EITHER unsubscribe token.
 *
 * Since the bridge, a digest recipient can arrive from `marketing_consents`
 * or from the city waitlist, and each carries its own token. The unsubscribe
 * link in the email must work identically for both, or a waitlist recipient
 * would hold a link that does nothing, which is the one failure the Spam Act
 * does not forgive.
 *
 * The consent-token path is the existing withdrawal, unchanged.
 *
 * The waitlist-token path records the withdrawal in `marketing_consents`,
 * because that table is the single suppression list the audience merge
 * consults for BOTH sources. It carries the waitlist row's own consent
 * evidence across (the exact wording, its version, and when it was given) so
 * the audit trail reads truthfully: this person consented on that date under
 * that wording, and withdrew on this one. Where a `marketing_consents` row
 * already exists its recorded evidence is left untouched and only its status
 * moves, so no earlier grant is ever overwritten.
 *
 * The waitlist MEMBERSHIP is deliberately left in place: they asked to be
 * told when their city opens, and this click was about the weekly email. The
 * unsubscribe page says so and offers leaving the waitlist as a separate act.
 */
export async function withdrawDigestByAnyToken(
  admin: Admin,
  token: string,
  at: string,
): Promise<DigestUnsubscribeResult | null> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) {
    return null
  }

  const { data: consentRow } = await admin
    .from('marketing_consents')
    .select('email, status')
    .eq('unsubscribe_token', token)
    .maybeSingle()

  if (consentRow) {
    if (consentRow.status === 'withdrawn') {
      return { source: 'consent', email: consentRow.email, alreadyWithdrawn: true }
    }
    await admin
      .from('marketing_consents')
      .update({ status: 'withdrawn', revoked_at: at, updated_at: at })
      .eq('unsubscribe_token', token)
    return { source: 'consent', email: consentRow.email, alreadyWithdrawn: false }
  }

  const { data: waitlistRow } = await admin
    .from('city_waitlist_signups')
    .select('email, city_slug, consent_text, consent_version, created_at')
    .eq('unsubscribe_token', token)
    .maybeSingle()

  if (!waitlistRow) return null

  const email = normaliseConsentEmail(waitlistRow.email)
  const { data: existing } = await admin
    .from('marketing_consents')
    .select('id, status')
    .eq('email', email)
    .maybeSingle()

  if (existing) {
    if (existing.status === 'withdrawn') {
      return { source: 'waitlist', email, alreadyWithdrawn: true }
    }
    await admin
      .from('marketing_consents')
      .update({ status: 'withdrawn', revoked_at: at, updated_at: at })
      .eq('id', existing.id)
    return { source: 'waitlist', email, alreadyWithdrawn: false }
  }

  const { error } = await admin.from('marketing_consents').insert({
    email,
    city_slug: waitlistRow.city_slug,
    status: 'withdrawn',
    consent_text: waitlistRow.consent_text,
    consent_version: waitlistRow.consent_version,
    source: 'city-waitlist',
    granted_at: waitlistRow.created_at,
    revoked_at: at,
    updated_at: at,
  })
  if (error) return null

  return { source: 'waitlist', email, alreadyWithdrawn: false }
}

/**
 * Read-only lookup behind the unsubscribe page, so the page can render the
 * correct state before the person presses anything. Withdrawal itself is
 * always a deliberate button press, never an on-load side effect, because an
 * email scanner prefetching the link must not be able to unsubscribe anyone.
 */
export async function findDigestUnsubscribeTarget(
  admin: Admin,
  token: string,
): Promise<{ source: DigestUnsubscribeSource; alreadyWithdrawn: boolean } | null> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) {
    return null
  }

  const { data: consentRow } = await admin
    .from('marketing_consents')
    .select('status')
    .eq('unsubscribe_token', token)
    .maybeSingle()
  if (consentRow) {
    return { source: 'consent', alreadyWithdrawn: consentRow.status === 'withdrawn' }
  }

  const { data: waitlistRow } = await admin
    .from('city_waitlist_signups')
    .select('email')
    .eq('unsubscribe_token', token)
    .maybeSingle()
  if (!waitlistRow) return null

  const { data: suppression } = await admin
    .from('marketing_consents')
    .select('status')
    .eq('email', normaliseConsentEmail(waitlistRow.email))
    .maybeSingle()

  return { source: 'waitlist', alreadyWithdrawn: suppression?.status === 'withdrawn' }
}

/**
 * Withdraw digest consent for an email directly (the signed-in preference
 * centre path, where the user proves ownership by session rather than token).
 */
export async function withdrawDigestConsentByEmail(
  admin: Admin,
  email: string,
  at: string,
): Promise<boolean> {
  try {
    const normalised = normaliseConsentEmail(email)
    if (!normalised) return false
    const { error } = await admin
      .from('marketing_consents')
      .update({ status: 'withdrawn', revoked_at: at, updated_at: at })
      .eq('email', normalised)
    return !error
  } catch {
    return false
  }
}

export type WithdrawResult = {
  organisationName: string
  alreadyWithdrawn: boolean
}

/**
 * Withdraw organiser marketing consent via the per-row unsubscribe token (no
 * login required, per ACMA). Idempotent: a second visit reports already done.
 * Scoped to the one organiser, so platform updates are untouched.
 */
export async function withdrawOrganiserConsentByToken(
  admin: Admin,
  token: string,
  at: string,
): Promise<WithdrawResult | null> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) {
    return null
  }
  const { data: row } = await admin
    .from('organiser_marketing_consents')
    .select('id, status, organisation:organisations(name)')
    .eq('unsubscribe_token', token)
    .maybeSingle()
  if (!row) return null

  const organisationName =
    (row as { organisation?: { name?: string } | null }).organisation?.name ?? 'the organiser'
  if (row.status === 'withdrawn') {
    return { organisationName, alreadyWithdrawn: true }
  }

  await admin
    .from('organiser_marketing_consents')
    .update({ status: 'withdrawn', withdrawn_at: at, updated_at: at })
    .eq('unsubscribe_token', token)

  return { organisationName, alreadyWithdrawn: false }
}
