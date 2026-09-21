/**
 * THE PURPOSES A CONSENT CAN BE GIVEN FOR, AND WHAT EACH ONE COVERS.
 *
 * Pure and client safe: no database, no environment, no I/O. The same table
 * exists in the database as public.consent_purposes, because the audience asset
 * is maintained by a trigger and a trigger cannot call TypeScript. The two are
 * held equal by scripts/guards/consent-ledger-is-evidence.mjs, so this is one
 * decision written in two languages rather than two lists.
 *
 * WHY COVERAGE EXISTS AND WHY IT ONLY RUNS ONE WAY. A broad consent authorises
 * the narrower purpose inside it; a narrow one never widens into the broad one.
 * The consents this platform already held promised the EventLinqs weekly local
 * digest and did NOT authorise marketing another organiser's event, so they are
 * carried into the ledger at the scope they were actually given and can never
 * be used for the facilitated send. Scope is set at capture and is never
 * inferred later, which is the whole reason GA1 was rewritten.
 */

/** The platform tenant. EventLinqs is tenant one; a client is its own tenant. */
export const PLATFORM_TENANT_SLUG = 'eventlinqs'

export type ConsentChannel = 'email' | 'sms'
export type ConsentChannelScope = ConsentChannel | 'both'
export type ConsentDecisionValue = 'granted' | 'withdrawn' | 'declined'
export type SuppressionScope = 'all_marketing' | 'facilitation_by_others' | 'tenant_own'

export interface ConsentPurposeDefinition {
  /** The stored purpose string. Never re-worded: it is written into evidence. */
  purpose: string
  /** What it is, in the words the admin screen and the ledger history use. */
  name: string
  /** Narrower purposes this one authorises. Never the other way round. */
  covers: readonly string[]
  /** Whether it markets another organisation's events (APP 7.6 bites here). */
  facilitatesThirdParties: boolean
}

/** The marketing purposes, mirroring public.consent_purposes exactly. */
export const CONSENT_PURPOSES: readonly ConsentPurposeDefinition[] = [
  {
    purpose: 'facilitated_event_marketing',
    name: 'Marketing about events run by other organisers who sell tickets on EventLinqs',
    covers: ['platform_local_digest'],
    facilitatesThirdParties: true,
  },
  {
    purpose: 'platform_local_digest',
    name: 'The weekly local digest of events in a city',
    covers: [],
    facilitatesThirdParties: true,
  },
] as const

/** The purpose the checkout question asks for. */
export const FACILITATED_MARKETING_PURPOSE = 'facilitated_event_marketing'
/** The purpose the weekly local digest sends under. */
export const LOCAL_DIGEST_PURPOSE = 'platform_local_digest'

/**
 * PURPOSES THAT ARE NOT MARKETING, AND THEREFORE NOT GOVERNED BY THE LEDGER.
 *
 * A ticket, a receipt, a refund notice, a sign-in link and an event change are
 * messages about a transaction the person themselves started. They are not the
 * direct marketing this ledger is evidence for, and gating them on a marketing
 * consent would mean a buyer who declined marketing never received their
 * ticket. They still go through the resolver, which answers permitted and names
 * the purpose, so that the resolver is genuinely the only door and every send
 * carries a recorded reason rather than an assumption.
 */
export const TRANSACTIONAL_PURPOSES: readonly string[] = [
  'order_confirmation',
  'ticket_delivery',
  'refund_notice',
  'payout_notice',
  'auth_link',
  'event_change_notice',
  'waitlist_offer',
  'organiser_operations',
  'platform_operations',
]

export function isTransactionalPurpose(purpose: string): boolean {
  return TRANSACTIONAL_PURPOSES.includes(purpose)
}

export function findPurpose(purpose: string): ConsentPurposeDefinition | null {
  return CONSENT_PURPOSES.find((p) => p.purpose === purpose) ?? null
}

/**
 * The purposes whose consent authorises `purpose`: the purpose itself, plus
 * every purpose that lists it under `covers`.
 */
export function coveringPurposes(purpose: string): string[] {
  const out = new Set<string>()
  for (const definition of CONSENT_PURPOSES) {
    if (definition.purpose === purpose) out.add(definition.purpose)
    if (definition.covers.includes(purpose)) out.add(definition.purpose)
  }
  return [...out]
}

/**
 * WHOSE MARKETING A CONSENT COVERS, AND WHAT A WITHDRAWAL STOPS.
 *
 * Both are declared at capture and never inferred later, which is the whole
 * point of the columns. The facilitated wording states its own scopes and they
 * ride across from the wording record; the digest surfaces (the city panel, the
 * signup box, the account preference centre) each carry their own sentence but
 * all promise the same thing, so their scopes are declared once here rather
 * than retyped on each surface.
 */
export function scopesForPurpose(purpose: string): {
  thirdPartyScope: string
  suppressionScope: string
} {
  if (purpose === LOCAL_DIGEST_PURPOSE) {
    return {
      thirdPartyScope: 'events listed on EventLinqs, inside the EventLinqs weekly local digest',
      suppressionScope: 'every EventLinqs facilitated message on every channel',
    }
  }
  return {
    thirdPartyScope: 'events ticketed on EventLinqs, marketed by EventLinqs as the sender',
    suppressionScope: 'every EventLinqs facilitated message on every channel',
  }
}

/** Case-insensitive address matching, the normalisation the ledger stores. */
export function normaliseSubjectEmail(email: string): string {
  return email.trim().toLowerCase()
}

/**
 * THE AGEING FALLBACK, IN ONE PLACE, AND REACHED ONLY WHEN THE POLICY ROW IS
 * GENUINELY ABSENT.
 *
 * The live value is `public.consent_policy.max_age_months`, which is
 * configuration so it can move without a deploy. This number is what both
 * readers use when that single row does not exist at all, and it matches
 * `coalesce(v_max_age, 24)` in `public.consent_permits`
 * (supabase/migrations/20260913000040_consent_ledger.sql) deliberately: the
 * SQL resolver and the TypeScript one are compared across a matrix of subjects
 * by the GA1 drive, and a missing configuration row is the one case where both
 * have to guess, so both have to guess the same.
 *
 * IT IS NOT A FALLBACK FOR A FAILED READ. It was reached by one on
 * 21 September 2026, in the resolver and on the audience screen, and a blink
 * therefore widened a tightened window back to twenty four months in silence.
 * Both reads go through a door now and a failure raises instead.
 */
export const CONSENT_MAX_AGE_MONTHS_FALLBACK = 24
