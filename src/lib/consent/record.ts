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
import { captureException } from '@/lib/observability/sentry'
import { readOrThrow } from '@/lib/supabase/read-or-throw'
import { isUnsubscribeToken } from './token'
import { LOCAL_DIGEST_PURPOSE, scopesForPurpose } from './purposes'
import { recordConsentEvent, recordSuppressionEvent } from './ledger'
import { resolveSend } from './resolver'

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
  } catch (error) {
    captureException(error, { where: 'lib/consent/record:56' })
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
  } catch (error) {
    captureException(error, { where: 'lib/consent/record:84' })
    return false
  }
}

/**
 * Record the express weekly-local-digest consent (Broadcast Layer SPEC 3.1).
 *
 * CLOSE-OUT GA1 v3 CHANGED WHERE THIS LANDS, AND NOTHING ELSE ABOUT IT. It used
 * to upsert public.marketing_consents, which held the current state and threw
 * the history away. It now writes ONE APPEND-ONLY EVENT to the consent ledger,
 * and a database trigger keeps marketing_consents in step, so every caller
 * keeps working, every unsubscribe token already in an inbox keeps working, and
 * the evidence of what each person was shown is kept for ever instead of being
 * overwritten by their next answer.
 *
 * City scoped, wording recorded verbatim, best effort: never throws into a
 * checkout or a signup, because a marketing record is not worth somebody's
 * ticket.
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
    const scopes = scopesForPurpose(LOCAL_DIGEST_PURPOSE)
    return await recordConsentEvent(admin, {
      email,
      purpose: LOCAL_DIGEST_PURPOSE,
      decision: 'granted',
      wording: params.consentText ?? DIGEST_CONSENT_WORDING,
      wordingVersion: params.consentVersion ?? DIGEST_CONSENT_WORDING_VERSION,
      channelScope: 'email',
      thirdPartyScope: scopes.thirdPartyScope,
      suppressionScope: scopes.suppressionScope,
      captureSurface: params.source ?? 'checkout',
      citySlug: params.citySlug ?? null,
      at: params.at,
    })
  } catch (error) {
    captureException(error, { where: 'lib/consent/record:recordPlatformDigestConsent' })
    return false
  }
}

/**
 * Record that this address WAS ASKED for platform marketing consent and said no.
 *
 * Close-out GA1. Until now an unticked box recorded nothing at all, so "asked
 * and declined" and "never asked" were the same absence. They are not the same
 * thing. The decline is evidence that the question was put and answered, which
 * is exactly what an audit of a marketing list wants to see, and it is the
 * denominator of the opt-in rate GA1's reversal condition is measured on.
 *
 * A DECLINE CAN NEVER REVOKE A CONSENT. A returning buyer who leaves the box
 * unticked on their second purchase has not withdrawn anything: under the Spam
 * Act a withdrawal is a deliberate act and an untouched checkbox is not one.
 *
 * That rule and the ledger's "latest event wins" rule pull against each other,
 * and the resolution is written here rather than left to a reader: the decline
 * is recorded only when the resolver does not currently permit this address.
 * Where a live grant exists, an untouched box records NOTHING, because writing
 * a later declined event would have silently revoked a consent the person never
 * touched. Where there is no live grant, the decline is written and is real
 * evidence that the question was put and answered.
 *
 * Best-effort, exactly like the grant: never throws into a checkout.
 */
export async function recordPlatformDigestDecline(
  admin: Admin,
  params: {
    email: string
    source?: string
    at: string
    consentText?: string
    consentVersion?: string
  },
): Promise<boolean> {
  try {
    const email = normaliseConsentEmail(params.email)
    if (!email) return false

    const live = await resolveSend(admin, {
      email,
      purpose: LOCAL_DIGEST_PURPOSE,
      channel: 'email',
    })
    if (live.permitted) return false
    /*
     * AN OUTAGE IS NOT A WITHDRAWAL. The same defect as the checkout answer, in
     * the second of the two places that turn a send verdict into a written fact
     * about a person; the reasoning is recorded once, in
     * src/lib/consent/checkout-answer.ts. Measured on TEST on 21 September 2026
     * with the consent read failing on cue: a live local-digest grant went from
     * "granted on 14 Sept 2026 under wording v1" to "the latest consent event is
     * declined", in an append-only ledger, because a socket dropped.
     */
    if (!live.ledgerWasRead) return false

    const scopes = scopesForPurpose(LOCAL_DIGEST_PURPOSE)
    return await recordConsentEvent(admin, {
      email,
      purpose: LOCAL_DIGEST_PURPOSE,
      decision: 'declined',
      wording: params.consentText ?? DIGEST_CONSENT_WORDING,
      wordingVersion: params.consentVersion ?? DIGEST_CONSENT_WORDING_VERSION,
      channelScope: 'email',
      thirdPartyScope: scopes.thirdPartyScope,
      suppressionScope: scopes.suppressionScope,
      captureSurface: params.source ?? 'checkout',
      at: params.at,
    })
  } catch (error) {
    captureException(error, { where: 'lib/consent/record:recordPlatformDigestDecline' })
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
 * CLOSE-OUT GA1 v3: A WITHDRAWAL IS NOW TWO LEDGER FACTS, NOT AN UPDATE.
 *
 * It records a withdrawn consent event, carrying the exact wording the person
 * originally agreed to, and a suppression event scoped to every EventLinqs
 * facilitated message on every channel, which is what the wording promises.
 * The projection trigger moves public.marketing_consents to withdrawn, so the
 * digest, the audience asset and the preference centre all see it at once and
 * every unsubscribe link already in an inbox keeps working.
 *
 * ONE CLICK STOPS EVERYTHING, ON EVERY CHANNEL. The suppression is written with
 * channel `both`, so there is no state in which somebody who stopped email
 * still receives SMS. It is scoped to this tenant, so it can never destroy a
 * future client's own separately collected list.
 *
 * IDEMPOTENT. A second visit writes nothing and reports the same answer, which
 * is what a person pressing it twice expects to see.
 *
 * The waitlist-token path carries the waitlist row's own consent evidence into
 * the ledger, so the trail reads truthfully: this person consented on that date
 * under that wording, and withdrew on this one.
 *
 * The waitlist MEMBERSHIP is deliberately left in place: they asked to be
 * told when their city opens, and this click was about the weekly email. The
 * unsubscribe page says so and offers leaving the waitlist as a separate act.
 */
export async function withdrawDigestByAnyToken(
  admin: Admin,
  token: string,
  at: string,
  /**
   * WHERE THE WITHDRAWAL CAME FROM, when it is not one of the two link
   * surfaces this function was written for.
   *
   * `capture_surface` is free text in the schema (the only constraint is
   * `length(btrim(capture_surface)) > 0`, migration 20260913000040 line 210),
   * so recording a new surface costs no migration. It is worth recording
   * because the ledger is evidence: a withdrawal a MAILBOX PROVIDER posted on
   * somebody's behalf, through the one-click header, is a different fact from
   * one the person typed on the preferences page, and a ledger that cannot
   * tell them apart cannot answer which facility people actually use.
   *
   * Omitted, the two original surfaces are kept exactly as they were, so no
   * existing caller changes behaviour.
   */
  captureSurface?: string,
): Promise<DigestUnsubscribeResult | null> {
  if (!isUnsubscribeToken(token)) {
    return null
  }

  /*
   * THROUGH THE DOOR, BECAUSE null FROM HERE IS "THIS LINK IS NOT VALID".
   *
   * Every read in this file that resolves an unsubscribe token used to discard
   * its error, so a dropped socket told a person their unsubscribe link was not
   * valid, or that they were already withdrawn when they were not. That is the
   * Spam Act facility itself. A read failure now raises and the surface answers
   * 500, which says ask again; only the database saying "no row" still means no
   * such token.
   */
  const consentRow = await readOrThrow('withdraw token, platform consent', () =>
    admin
      .from('marketing_consents')
      .select('email, status, consent_text, consent_version, city_slug')
      .eq('unsubscribe_token', token)
      .maybeSingle(),
  )

  if (consentRow) {
    const email = normaliseConsentEmail(consentRow.email)
    if (consentRow.status === 'withdrawn') {
      return { source: 'consent', email, alreadyWithdrawn: true }
    }
    await writeWithdrawalToLedger(admin, {
      email,
      wording: consentRow.consent_text,
      wordingVersion: consentRow.consent_version,
      citySlug: consentRow.city_slug,
      captureSurface: captureSurface ?? 'unsubscribe-token',
      at,
    })
    return { source: 'consent', email, alreadyWithdrawn: false }
  }

  const waitlistRow = await readOrThrow('withdraw token, city waitlist', () =>
    admin
      .from('city_waitlist_signups')
      .select('email, city_slug, consent_text, consent_version, created_at')
      .eq('unsubscribe_token', token)
      .maybeSingle(),
  )

  if (!waitlistRow) return null

  const email = normaliseConsentEmail(waitlistRow.email)
  const existing = await readOrThrow('withdraw token, existing consent', () =>
    admin.from('marketing_consents').select('id, status').eq('email', email).maybeSingle(),
  )

  if (existing?.status === 'withdrawn') {
    return { source: 'waitlist', email, alreadyWithdrawn: true }
  }

  const written = await writeWithdrawalToLedger(admin, {
    email,
    wording: waitlistRow.consent_text,
    wordingVersion: waitlistRow.consent_version,
    citySlug: waitlistRow.city_slug,
    captureSurface: captureSurface ?? 'waitlist-token',
    at,
  })
  if (!written) return null

  return { source: 'waitlist', email, alreadyWithdrawn: false }
}

/**
 * The two facts a withdrawal is, written once so every route that can withdraw
 * writes the same pair. The suppression is what the resolver reads; the consent
 * event is what an auditor reads.
 */
async function writeWithdrawalToLedger(
  admin: Admin,
  params: {
    email: string
    wording: string | null
    wordingVersion: string | null
    citySlug?: string | null
    captureSurface: string
    at: string
  },
): Promise<boolean> {
  const scopes = scopesForPurpose(LOCAL_DIGEST_PURPOSE)
  const recorded = await recordConsentEvent(admin, {
    email: params.email,
    purpose: LOCAL_DIGEST_PURPOSE,
    decision: 'withdrawn',
    // The withdrawal carries the words it withdraws, so the pair reads as one
    // story. Where a source held no wording, the fallback is the standard
    // digest sentence rather than an empty string the ledger would refuse.
    wording: params.wording?.trim() || DIGEST_CONSENT_WORDING,
    wordingVersion: params.wordingVersion?.trim() || DIGEST_CONSENT_WORDING_VERSION,
    channelScope: 'email',
    thirdPartyScope: scopes.thirdPartyScope,
    suppressionScope: scopes.suppressionScope,
    captureSurface: params.captureSurface,
    citySlug: params.citySlug ?? null,
    at: params.at,
  })

  const suppressed = await recordSuppressionEvent(admin, {
    email: params.email,
    channel: 'both',
    scope: 'all_marketing',
    reason: 'the person unsubscribed from EventLinqs marketing',
    requestSource: params.captureSurface,
    at: params.at,
  })

  return recorded && suppressed
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
  if (!isUnsubscribeToken(token)) {
    return null
  }

  const consentRow = await readOrThrow('token state, platform consent', () =>
    admin.from('marketing_consents').select('status').eq('unsubscribe_token', token).maybeSingle(),
  )
  if (consentRow) {
    return { source: 'consent', alreadyWithdrawn: consentRow.status === 'withdrawn' }
  }

  const waitlistRow = await readOrThrow('token state, city waitlist', () =>
    admin.from('city_waitlist_signups').select('email').eq('unsubscribe_token', token).maybeSingle(),
  )
  if (!waitlistRow) return null

  const suppression = await readOrThrow('token state, suppression', () =>
    admin
      .from('marketing_consents')
      .select('status')
      .eq('email', normaliseConsentEmail(waitlistRow.email))
      .maybeSingle(),
  )

  return { source: 'waitlist', alreadyWithdrawn: suppression?.status === 'withdrawn' }
}

/**
 * Withdraw digest consent for an email directly (the signed-in preference
 * centre path, where the user proves ownership by session rather than token).
 *
 * The same pair of ledger facts as the token path, for the same reason: a
 * withdrawal recorded one way in one place and another way in another is how a
 * suppression goes missing.
 */
export async function withdrawDigestConsentByEmail(
  admin: Admin,
  email: string,
  at: string,
): Promise<boolean> {
  try {
    const normalised = normaliseConsentEmail(email)
    if (!normalised) return false
    /*
     * THE ONE READ ON THIS PATH THAT MUST NOT STOP THE WITHDRAWAL.
     *
     * Everything else here raises, because null means "not valid". This read
     * only fetches the WORDING the consent was taken under, to store beside the
     * withdrawal as evidence. Losing that evidence is a real cost; refusing to
     * record somebody's unsubscribe because we could not look it up is a far
     * larger one, and it is the failure the Spam Act is about. So the error is
     * bound, recorded, and the withdrawal proceeds with what is known.
     */
    const { data: existing, error: existingError } = await admin
      .from('marketing_consents')
      .select('consent_text, consent_version, city_slug')
      .eq('email', normalised)
      .maybeSingle()
    if (existingError) {
      captureException(existingError, {
        where: 'lib/consent/record:withdrawDigestByEmail',
        note: 'the wording this consent was taken under could not be read; the withdrawal was still recorded, without it',
      })
    }
    return await writeWithdrawalToLedger(admin, {
      email: normalised,
      wording: existing?.consent_text ?? null,
      wordingVersion: existing?.consent_version ?? null,
      citySlug: existing?.city_slug ?? null,
      captureSurface: 'preference-centre',
      at,
    })
  } catch (error) {
    captureException(error, { where: 'lib/consent/record:withdrawDigestConsentByEmail' })
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
  if (!isUnsubscribeToken(token)) {
    return null
  }
  const row = await readOrThrow('organiser consent token', () =>
    admin
      .from('organiser_marketing_consents')
      .select('id, status, organisation:organisations(name)')
      .eq('unsubscribe_token', token)
      .maybeSingle(),
  )
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
