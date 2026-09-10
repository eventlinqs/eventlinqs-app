/**
 * WHERE A VISIT CAME FROM, captured once and read back later.
 *
 * THE PROBLEM THIS SOLVES. A sale is recorded on a Stripe webhook, minutes after
 * the person bought, on a machine with no browser, no headers and no page URL.
 * By then every fact about where they came from is gone. So the attribution is
 * captured at the moment the browser still has it, kept in a first-touch cookie,
 * and read off the request when the person enters their address at checkout.
 *
 * FIRST TOUCH, NOT LAST. A person who arrives from an organiser's Instagram
 * post, browses, leaves, comes back through a Google search and buys, was
 * brought by the Instagram post. Last-touch would credit Google for a visit the
 * post paid for, and organiser-facing numbers that credit the wrong channel are
 * worse than no numbers. So the cookie is written ONLY when it is absent.
 *
 * NOTHING IDENTIFYING IS KEPT HERE. A referring host, three campaign labels and
 * one word for the device. No address, no name, no identifier of any kind, so
 * the cookie needs no consent banner and carries nothing worth stealing.
 */

/** The cookie the first touch is kept in. Not httpOnly: the page writes it. */
export const FIRST_TOUCH_COOKIE = 'el_from'

/** How long a first touch is honoured. Thirty days, the ordinary window. */
export const FIRST_TOUCH_MAX_AGE_SECONDS = 30 * 24 * 60 * 60

export type VisitAttribution = {
  referrer: string | null
  utmSource: string | null
  utmMedium: string | null
  utmCampaign: string | null
  device: string | null
}

export const NO_ATTRIBUTION: VisitAttribution = {
  referrer: null,
  utmSource: null,
  utmMedium: null,
  utmCampaign: null,
  device: null,
}

/** Bound, so a crafted link cannot write a kilobyte into a cookie. */
const MAX_FIELD = 120

function trim(value: string | null | undefined): string | null {
  const out = (value ?? '').trim().slice(0, MAX_FIELD)
  return out.length > 0 ? out : null
}

/**
 * The referring HOST, never the full URL.
 *
 * A full referrer can carry a search query, a session token or somebody's own
 * account page, and none of that belongs in a ledger kept for years. The host is
 * the whole answer to "which channel brought them".
 */
export function referringHost(referrer: string | null | undefined, ownHost: string | null | undefined): string | null {
  const raw = (referrer ?? '').trim()
  if (!raw) return null
  try {
    const host = new URL(raw).host.toLowerCase()
    if (!host) return null
    // A link from one page of this platform to another is not a channel.
    if (ownHost && host === ownHost.toLowerCase()) return null
    return host.slice(0, MAX_FIELD)
  } catch {
    return null
  }
}

/**
 * One word for the device, from the user agent.
 *
 * Three buckets, because that is the resolution an organiser can act on: they
 * either need a mobile-first page or they do not. Anything finer is a fingerprint.
 */
export function deviceFromUserAgent(userAgent: string | null | undefined): string | null {
  const ua = (userAgent ?? '').toLowerCase()
  if (!ua) return null
  if (/ipad|tablet|playbook|silk|(android(?!.*mobile))/.test(ua)) return 'tablet'
  if (/mobi|iphone|ipod|android|blackberry|iemobile|opera mini/.test(ua)) return 'mobile'
  return 'desktop'
}

/** The campaign labels a link can carry, read out of a query string. */
export function campaignFromQuery(query: URLSearchParams): Pick<VisitAttribution, 'utmSource' | 'utmMedium' | 'utmCampaign'> {
  return {
    utmSource: trim(query.get('utm_source')),
    utmMedium: trim(query.get('utm_medium')),
    utmCampaign: trim(query.get('utm_campaign')),
  }
}

/** True when there is something worth keeping. */
export function hasAttribution(a: VisitAttribution): boolean {
  return Boolean(a.referrer || a.utmSource || a.utmMedium || a.utmCampaign)
}

/**
 * The cookie value. A compact pipe-joined string rather than JSON: it goes on
 * every request to this origin, so four short fields beat a percent-encoded
 * object, and a value that cannot be parsed reads as no attribution rather than
 * throwing on somebody's checkout.
 */
export function encodeFirstTouch(a: VisitAttribution): string {
  return [a.referrer ?? '', a.utmSource ?? '', a.utmMedium ?? '', a.utmCampaign ?? '']
    .map(v => encodeURIComponent(v))
    .join('|')
}

export function decodeFirstTouch(raw: string | null | undefined): VisitAttribution {
  if (!raw) return { ...NO_ATTRIBUTION }
  const parts = raw.split('|')
  if (parts.length < 4) return { ...NO_ATTRIBUTION }
  const at = (i: number) => {
    try {
      return trim(decodeURIComponent(parts[i] ?? ''))
    } catch {
      return null
    }
  }
  return {
    referrer: at(0),
    utmSource: at(1),
    utmMedium: at(2),
    utmCampaign: at(3),
    device: null,
  }
}
