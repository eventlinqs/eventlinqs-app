import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import {
  CONSENT_WORDING_VERSION,
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
