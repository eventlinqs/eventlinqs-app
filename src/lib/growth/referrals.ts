/**
 * Referral and attribution core (the acquisition loop).
 *
 * The growth plan's first engine is the acquisition loop: every shared ticket
 * and every invite-an-organiser prompt carries a personalised, attributed link
 * so we can measure which shares and which organisers drive new users. This
 * module is the single source of truth for that attribution. It is deliberately
 * storage-light: a referrer is identified by an opaque code derived from their
 * profile id, the link carries that code plus a source, the browser holds a
 * first-touch cookie, and on signup the attribution is written into the new
 * profile's existing `metadata` JSONB. No schema migration is required, so the
 * loop ships and is provable on the current database. It can be promoted to
 * dedicated columns post-launch without changing this contract.
 */

/** Query-string key carrying the referrer code on a shared link. */
export const REF_PARAM = 'ref'
/** Query-string key carrying the attribution source on a link. */
export const SOURCE_PARAM = 'via'

/** First-touch cookies. First touch wins: the first link that brought a user
 * is the one credited, so a later visit never overwrites the original source. */
export const REF_COOKIE = 'el_ref'
export const REF_SOURCE_COOKIE = 'el_ref_src'
export const REF_EVENT_COOKIE = 'el_ref_event'

/** How long a first-touch attribution survives before it expires (30 days). */
export const REF_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30

export const REFERRAL_SOURCES = [
  'share-a-ticket',
  'organiser-invite',
  'organic',
] as const
export type ReferralSource = (typeof REFERRAL_SOURCES)[number]

export function isReferralSource(value: unknown): value is ReferralSource {
  return typeof value === 'string' && (REFERRAL_SOURCES as readonly string[]).includes(value)
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const BASE62 = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'

/**
 * Encode a profile UUID to a short, URL-safe, opaque code (base62 of the 128-bit
 * value). Reversible via decodeRefCode. We never expose a raw UUID in a share
 * link, and the code is meaningless without database access (profile reads are
 * RLS-gated to own-or-public), so this leaks nothing.
 */
export function encodeRefCode(profileId: string): string | null {
  if (!UUID_RE.test(profileId)) return null
  let n = BigInt('0x' + profileId.replace(/-/g, ''))
  if (n === 0n) return '0'
  let out = ''
  const base = BigInt(62)
  while (n > 0n) {
    out = BASE62[Number(n % base)] + out
    n = n / base
  }
  return out
}

/** Reverse encodeRefCode back to a canonical UUID, or null if the code is invalid. */
export function decodeRefCode(code: string | null | undefined): string | null {
  if (!code || !/^[0-9A-Za-z]{1,24}$/.test(code)) return null
  let n = 0n
  const base = BigInt(62)
  for (const ch of code) {
    const idx = BASE62.indexOf(ch)
    if (idx < 0) return null
    n = n * base + BigInt(idx)
  }
  let hex = n.toString(16)
  if (hex.length > 32) return null
  hex = hex.padStart(32, '0')
  const uuid = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
  return UUID_RE.test(uuid) ? uuid : null
}

/**
 * Append attribution to a share URL without disturbing any existing query or
 * the canonical path. The canonical <link> on each page still points at the
 * clean URL, so attributed variants never create duplicate-content problems.
 */
export function buildAttributedUrl(
  baseUrl: string,
  opts: { refCode?: string | null; source: ReferralSource },
): string {
  let url: URL
  try {
    url = new URL(baseUrl)
  } catch {
    return baseUrl
  }
  if (opts.refCode) url.searchParams.set(REF_PARAM, opts.refCode)
  url.searchParams.set(SOURCE_PARAM, opts.source)
  return url.toString()
}

export type CapturedAttribution = {
  /** The referrer's profile id, decoded from the ref code (null for a
   * source-only touch such as an organiser-invite prompt). */
  referredBy: string | null
  /** The original opaque ref code as shared (kept for debugging/measurement). */
  refCode: string | null
  source: ReferralSource
  /** The event slug the link pointed at, when the touch came from an event. */
  event: string | null
}

type CookieReader = (name: string) => string | undefined

/**
 * Read the first-touch attribution cookies into a normalised object, or null
 * when there is no attribution to record (a purely organic signup).
 */
export function readAttributionCookies(getCookie: CookieReader): CapturedAttribution | null {
  const refCode = getCookie(REF_COOKIE) ?? null
  const rawSource = getCookie(REF_SOURCE_COOKIE)
  const event = getCookie(REF_EVENT_COOKIE) ?? null
  const source: ReferralSource = isReferralSource(rawSource) ? rawSource : 'organic'

  // No code and no explicit source means there is nothing to attribute.
  if (!refCode && source === 'organic') return null

  return {
    referredBy: decodeRefCode(refCode),
    refCode,
    source,
    event,
  }
}

/** The shape stored at profiles.metadata.attribution on signup. The `at` value
 * is supplied by the caller (the runtime forbids Date.now in some contexts). */
export type AttributionRecord = CapturedAttribution & { at: string }

export function toAttributionRecord(
  captured: CapturedAttribution,
  at: string,
): AttributionRecord {
  return { ...captured, at }
}
