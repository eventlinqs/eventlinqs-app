import { CONSENT_CATEGORIES, type ConsentCategory } from './providers'

/**
 * WHAT THIS VISITOR HAS AGREED TO, and the answer before they have said anything.
 *
 * Close-out AN1. Two categories, both OFF until somebody says yes, recorded in
 * one first-party cookie that stores a decision and nothing else.
 *
 * THE DEFAULT IS THE WHOLE DESIGN. `NO_CONSENT` is what every reader sees on a
 * first visit, on a visit from a browser that blocks cookies, on a crawler, and
 * on any value this module cannot parse. There is no path through this file
 * that returns a granted category without an explicit, parseable record saying
 * so, which is what makes "off by default" a property of the code rather than a
 * claim about it.
 *
 * WHY A VERSION. Consent is to a specific list of providers. Adding a provider
 * to a category somebody already agreed to would silently extend a permission
 * they never gave, so the version travels with the record and a bump makes every
 * stored decision stale, which shows the banner again. The version is bumped
 * whenever the provider list changes in a way a reasonable person would care
 * about.
 *
 * NOTHING IDENTIFYING. Two booleans, a version and a date. No id, nothing that
 * could join to a person, which is why this cookie itself needs no consent: it
 * is the record of the choice, and a platform that cannot remember "no" has to
 * keep asking.
 */
export const CONSENT_COOKIE = 'el_consent'

/** A year. Long enough that a decision is not re-asked every week. */
export const CONSENT_MAX_AGE_SECONDS = 365 * 24 * 60 * 60

/**
 * Bumped when the provider list changes in a way a person would care about.
 * v1: PostHog (analytics); GA4, Google Ads and the Meta pixel (advertising).
 */
export const CONSENT_VERSION = 1

export type ConsentDecision = {
  [K in ConsentCategory]: boolean
} & {
  version: number
  decidedAt: string | null
}

/** Nothing agreed to. The answer before anyone has been asked, and after a no. */
export const NO_CONSENT: ConsentDecision = {
  analytics: false,
  advertising: false,
  version: CONSENT_VERSION,
  decidedAt: null,
}

/** Everything agreed to. Only ever produced by a person pressing accept. */
export function allGranted(now: Date = new Date()): ConsentDecision {
  return {
    analytics: true,
    advertising: true,
    version: CONSENT_VERSION,
    decidedAt: now.toISOString(),
  }
}

/** A recorded refusal. Distinct from "not yet asked": the banner stays down. */
export function allRefused(now: Date = new Date()): ConsentDecision {
  return {
    analytics: false,
    advertising: false,
    version: CONSENT_VERSION,
    decidedAt: now.toISOString(),
  }
}

export function encodeConsent(decision: ConsentDecision): string {
  return encodeURIComponent(
    JSON.stringify({
      v: decision.version,
      a: decision.analytics ? 1 : 0,
      d: decision.advertising ? 1 : 0,
      t: decision.decidedAt,
    }),
  )
}

/**
 * Reads a decision back.
 *
 * EVERY failure path returns NO_CONSENT: a missing cookie, a malformed one, a
 * value that is not an object, a version that is not the current one. A cookie
 * is user-writable and arrives from a public browser, so nothing here trusts
 * what it reads, and the safe direction is always "they have not agreed".
 */
export function decodeConsent(value: string | null | undefined): ConsentDecision {
  if (!value) return NO_CONSENT
  try {
    const raw = JSON.parse(decodeURIComponent(value)) as Record<string, unknown>
    if (!raw || typeof raw !== 'object') return NO_CONSENT
    if (raw.v !== CONSENT_VERSION) return NO_CONSENT
    return {
      analytics: raw.a === 1,
      advertising: raw.d === 1,
      version: CONSENT_VERSION,
      decidedAt: typeof raw.t === 'string' ? raw.t : null,
    }
  } catch {
    return NO_CONSENT
  }
}

/** True once the person has answered, either way. Drives the banner. */
export function hasDecided(decision: ConsentDecision): boolean {
  return decision.decidedAt !== null
}

/**
 * MAY THIS PROVIDER LOAD? The one question every script tag asks, with both
 * halves of the answer in one place: the person agreed to the category AND the
 * owner has configured the provider.
 *
 * Pure, and it takes the identifier rather than reading the environment, so the
 * rule can be tested exhaustively without a build.
 */
export function mayLoad(input: {
  decision: ConsentDecision
  category: ConsentCategory
  identifier: string | null | undefined
}): boolean {
  if (!CONSENT_CATEGORIES.includes(input.category)) return false
  if (!input.decision[input.category]) return false
  const id = (input.identifier ?? '').trim()
  return id.length > 0
}
