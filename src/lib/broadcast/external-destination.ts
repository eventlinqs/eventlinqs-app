import { CANONICAL_HOST } from '@/lib/site-url'

/**
 * VALIDATION FOR AN EXTERNAL TICKETING URL.
 *
 * This is the only place an organiser-supplied URL becomes a thing the platform
 * will 302 a stranger to, so it is the security boundary of the whole external
 * ticketing feature. Pure and dependency-free on purpose: it is exhaustively
 * testable without a database, a network, or a rendered page.
 *
 * WHAT IT REFUSES, and why each one is here rather than assumed:
 *
 *   NOT https. `javascript:` and `data:` are the classic redirect payloads, and
 *   an open `http://` destination would downgrade a tap from a printed QR code
 *   onto a plaintext connection. The database CHECK refuses non-https as well,
 *   so this failing open still cannot write a bad row.
 *
 *   OUR OWN HOST. A tracked link that redirects back through eventlinqs is an
 *   OPEN REDIRECT: an attacker mints a kit whose destination is
 *   `https://www.eventlinqs.com.au/...`, and now our canonical host bounces
 *   people wherever the chain leads, with our domain doing the reassuring. It is
 *   also pointless, because the whole purpose of the destination is to leave.
 *
 *   CREDENTIALS IN THE URL. `https://user:pass@host/` renders in some clients as
 *   though the host is `user`, which is a phishing primitive, and it would put a
 *   credential into our database and our logs.
 *
 *   A HOST THAT IS NOT PUBLICLY ADDRESSABLE. `localhost`, a bare IP, `.local`,
 *   and the private ranges cannot be a real box office, so accepting one only
 *   ever helps somebody probing what our redirect will do.
 *
 * WHAT IT DELIBERATELY DOES NOT DO: fetch the URL. We never make a request to an
 * organiser-supplied address, so there is no SSRF surface here at all. The
 * consequence, stated rather than hidden, is that a URL that is well-formed but
 * DEAD passes this check. That is handled at redirect time instead, where the
 * visitor can be told something useful.
 */

/** Long enough for any real box-office URL, short enough to bound a column. */
export const MAX_DESTINATION_LENGTH = 2048

export type DestinationResult =
  | { ok: true; url: string }
  | { ok: false; reason: DestinationRejection; message: string }

export type DestinationRejection =
  | 'empty'
  | 'too-long'
  | 'unparseable'
  | 'not-https'
  | 'own-host'
  | 'has-credentials'
  | 'not-public-host'

/** Hosts that can never be a real external box office. */
function isNonPublicHost(host: string): boolean {
  const h = host.toLowerCase()
  if (h === 'localhost' || h.endsWith('.localhost')) return true
  if (h.endsWith('.local') || h.endsWith('.internal') || h.endsWith('.test')) return true
  // Any bare IPv4 or bracketed IPv6 literal. A box office has a name.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) return true
  if (h.startsWith('[')) return true
  return false
}

/**
 * Is this host ours? Matches the canonical host and every eventlinqs domain,
 * including subdomains and the apex, so a redirect cannot be laundered through
 * any address a person would read as us.
 */
export function isOwnHost(host: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, '')
  if (h === CANONICAL_HOST) return true
  return /(^|\.)eventlinqs\.(com|com\.au|app)$/.test(h)
}

/**
 * Validate and normalise an organiser-supplied ticketing URL.
 *
 * Returns the URL as parsed and re-serialised rather than the raw input, so what
 * is stored is what will actually be sent in the Location header. A caller must
 * never store the raw string.
 */
export function validateExternalTicketUrl(input: unknown): DestinationResult {
  const raw = typeof input === 'string' ? input.trim() : ''
  if (raw.length === 0) {
    return { ok: false, reason: 'empty', message: 'Add the web address where people buy tickets.' }
  }
  if (raw.length > MAX_DESTINATION_LENGTH) {
    return {
      ok: false,
      reason: 'too-long',
      message: 'That web address is too long. Use the direct link to the event, not a tracking link.',
    }
  }

  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return {
      ok: false,
      reason: 'unparseable',
      message: 'That does not look like a web address. It should start with https:// and include the site name.',
    }
  }

  if (url.protocol !== 'https:') {
    return {
      ok: false,
      reason: 'not-https',
      message: 'The ticketing address must start with https:// so the link is secure.',
    }
  }
  if (url.username || url.password) {
    return {
      ok: false,
      reason: 'has-credentials',
      message: 'Remove the username and password from the web address, then try again.',
    }
  }
  if (isOwnHost(url.hostname)) {
    return {
      ok: false,
      reason: 'own-host',
      message: 'That is an EventLinqs address. Use the address on the site where your tickets are actually sold.',
    }
  }
  if (isNonPublicHost(url.hostname)) {
    return {
      ok: false,
      reason: 'not-public-host',
      message: 'That address is not reachable from the public internet. Use the address your buyers would use.',
    }
  }

  return { ok: true, url: url.toString() }
}
