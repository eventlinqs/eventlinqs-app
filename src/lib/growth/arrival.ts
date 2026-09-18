/**
 * HOW AN ACCOUNT ARRIVED, captured on the first page and read back at signup.
 *
 * Close-out AN1. Nobody can say how the first real organiser found EventLinqs.
 * The facts that answer it, the parameters on the link and the page they landed
 * on, exist for exactly one paint and are gone by the time the person fills in
 * a form two screens later. So they are captured at the first page, kept in a
 * first-touch cookie, and written onto the account when it is created.
 *
 * ================================================================
 * WHY THIS IS NOT `el_from`, THE COOKIE THAT ALREADY EXISTS
 * ================================================================
 *
 * `src/lib/growth/visit-attribution.ts` keeps a first-touch cookie for a
 * different question, and the two must not be merged even though their fields
 * overlap:
 *
 *   el_from     WHICH CHANNEL BROUGHT THIS SALE. Written on an event page,
 *               read by the checkout and by the demand ledger, and its shape is
 *               part of the money path.
 *   el_arrival  WHICH SURFACE BROUGHT THIS ACCOUNT. Written on ANY page,
 *               read once at signup, and never read again.
 *
 * They are captured at different moments, on different pages, and consumed by
 * different code. Folding the account question into the money cookie would mean
 * every change to a marketing parameter reshaped a value the checkout parses,
 * which is the wrong thing to couple. The parsing is shared where it can be
 * (the referring host rule), and the records are separate.
 *
 * ================================================================
 * FIRST TOUCH, AND WHY
 * ================================================================
 *
 * Someone who reads /organisers, leaves, comes back through a Google search and
 * signs up was brought by /organisers. Last touch would credit the search for
 * an account the page earned, and a number that credits the wrong channel is
 * worse than no number, because it gets spent against.
 *
 * ================================================================
 * WHAT IS NOT KEPT, AND WHY NO CONSENT IS NEEDED FOR IT
 * ================================================================
 *
 * The referrer is reduced to a HOST and the landing URL to a PATH, both before
 * anything is written. A full referrer can carry a search query, a session
 * token or somebody's own account page; a full landing URL can carry the same.
 * What is left is five campaign labels, one source word and one path: no name,
 * no address, no identifier, nothing that follows anyone anywhere else. That is
 * why this needs no consent banner, and it is why the consent banner in this
 * item governs the THIRD-PARTY scripts instead, which are a different question
 * and are off until somebody says yes.
 */

/** The cookie the first arrival is kept in. Not httpOnly: the page writes it. */
export const ARRIVAL_COOKIE = 'el_arrival'

/** Thirty days, the same window the sale attribution uses. */
export const ARRIVAL_MAX_AGE_SECONDS = 30 * 24 * 60 * 60

/** Bound, so a crafted link cannot write a kilobyte into a cookie. */
const MAX_FIELD = 120

export interface ArrivalRecord {
  /** The platform's own surface marker: organisers, footer, share, ticket. */
  src: string | null
  /** A referral code, when the link carried one. */
  ref: string | null
  /** The first path, WITHOUT its query string. */
  landingPath: string | null
  /** The site that sent them, host only. */
  referrerHost: string | null
  utmSource: string | null
  utmMedium: string | null
  utmCampaign: string | null
  utmTerm: string | null
  utmContent: string | null
}

export const NO_ARRIVAL: ArrivalRecord = {
  src: null,
  ref: null,
  landingPath: null,
  referrerHost: null,
  utmSource: null,
  utmMedium: null,
  utmCampaign: null,
  utmTerm: null,
  utmContent: null,
}

function trim(value: string | null | undefined): string | null {
  const out = (value ?? '').trim().slice(0, MAX_FIELD)
  return out.length > 0 ? out : null
}

/**
 * The referring HOST, never the full URL, and never our own host.
 *
 * Our own host is dropped because an internal navigation is not a channel: a
 * person who clicked through from the homepage was not "referred by
 * eventlinqs.com.au", and recording that would bury every real source under the
 * platform's own name.
 */
export function arrivalReferrerHost(
  referrer: string | null | undefined,
  ownHost: string | null | undefined,
): string | null {
  const raw = (referrer ?? '').trim()
  if (!raw) return null
  try {
    const host = new URL(raw).host.toLowerCase().replace(/^www\./, '')
    if (!host) return null
    const own = (ownHost ?? '').toLowerCase().replace(/^www\./, '')
    if (own && host === own) return null
    return host.slice(0, MAX_FIELD)
  } catch {
    // A referrer that is not a URL is not a channel. Returning null is the
    // answer, not a swallowed failure: there is nothing to report.
    return null
  }
}

/**
 * Reads an arrival out of a URL and a referrer. PURE, so the same function
 * produces the record in the browser, in a test and in a drive.
 */
export function readArrival(input: {
  url: string
  referrer?: string | null
  ownHost?: string | null
}): ArrivalRecord {
  let parsed: URL
  try {
    parsed = new URL(input.url)
  } catch {
    return NO_ARRIVAL
  }
  const q = parsed.searchParams
  return {
    src: trim(q.get('src')),
    ref: trim(q.get('ref')),
    // The path, never the query. `/` is a real answer and is kept.
    landingPath: trim(parsed.pathname) ?? '/',
    referrerHost: arrivalReferrerHost(input.referrer, input.ownHost ?? parsed.host),
    utmSource: trim(q.get('utm_source')),
    utmMedium: trim(q.get('utm_medium')),
    utmCampaign: trim(q.get('utm_campaign')),
    utmTerm: trim(q.get('utm_term')),
    utmContent: trim(q.get('utm_content')),
  }
}

/** True when the record says nothing at all, so nothing is written. */
export function arrivalIsEmpty(a: ArrivalRecord): boolean {
  return (
    !a.src && !a.ref && !a.referrerHost && !a.utmSource && !a.utmMedium && !a.utmCampaign && !a.utmTerm && !a.utmContent
  )
}

/**
 * The cookie value. Compact keys, because a cookie is sent on every request and
 * this one carries nothing a reader needs to understand without the decoder.
 */
export function encodeArrival(a: ArrivalRecord): string {
  const payload: Record<string, string> = {}
  if (a.src) payload.s = a.src
  if (a.ref) payload.r = a.ref
  if (a.landingPath) payload.p = a.landingPath
  if (a.referrerHost) payload.h = a.referrerHost
  if (a.utmSource) payload.us = a.utmSource
  if (a.utmMedium) payload.um = a.utmMedium
  if (a.utmCampaign) payload.uc = a.utmCampaign
  if (a.utmTerm) payload.ut = a.utmTerm
  if (a.utmContent) payload.un = a.utmContent
  return encodeURIComponent(JSON.stringify(payload))
}

/**
 * Reads the cookie back. A cookie is user-writable, so every field is
 * re-trimmed and re-bounded on the way out: nothing here trusts what it reads.
 */
export function decodeArrival(value: string | null | undefined): ArrivalRecord {
  if (!value) return NO_ARRIVAL
  try {
    const raw = JSON.parse(decodeURIComponent(value)) as Record<string, unknown>
    if (!raw || typeof raw !== 'object') return NO_ARRIVAL
    const str = (v: unknown) => (typeof v === 'string' ? trim(v) : null)
    return {
      src: str(raw.s),
      ref: str(raw.r),
      landingPath: str(raw.p),
      referrerHost: str(raw.h),
      utmSource: str(raw.us),
      utmMedium: str(raw.um),
      utmCampaign: str(raw.uc),
      utmTerm: str(raw.ut),
      utmContent: str(raw.un),
    }
  } catch {
    // A malformed cookie is somebody's broken extension or a hand edit, not an
    // incident. The answer is "we do not know where they came from".
    return NO_ARRIVAL
  }
}

/** The utm object as it is stored on the account: absent keys, never nulls. */
export function arrivalUtmObject(a: ArrivalRecord): Record<string, string> | null {
  const utm: Record<string, string> = {}
  if (a.utmSource) utm.source = a.utmSource
  if (a.utmMedium) utm.medium = a.utmMedium
  if (a.utmCampaign) utm.campaign = a.utmCampaign
  if (a.utmTerm) utm.term = a.utmTerm
  if (a.utmContent) utm.content = a.utmContent
  return Object.keys(utm).length > 0 ? utm : null
}
