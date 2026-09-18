/**
 * ONE-CLICK UNSUBSCRIBE: THE TWO HEADERS, AND THE ONE ADDRESS THEY POINT AT.
 *
 * PURE. No imports, so the registered guard can read it, a unit test can assert
 * the exact bytes against the specification, and neither has to run a database,
 * a transport or a browser.
 *
 * ---------------------------------------------------------------------------
 * THE DEFECT THIS EXISTS TO CLOSE, measured on this tree on 19 September 2026.
 *
 * `src/lib/email/send.ts` passed Resend exactly five fields (from, to, subject,
 * html, text) and no headers, and a grep for `List-Unsubscribe` across `src`,
 * `scripts`, `tests`, `docs` and `supabase` returned ZERO matches. Both of this
 * platform's marketing send paths, the two entries classified `marketing` in
 * `src/lib/consent/send-paths.ts`, therefore left without the headers a
 * mailbox provider looks for, and there was no endpoint that could have
 * answered the POST those headers advertise: `/marketing/preferences/[token]`
 * and `/unsubscribe/digest/[token]` are pages, and a page answers GET.
 *
 * The body link was there and worked. What was missing is the machine-readable
 * half: the unsubscribe button the mail client itself draws.
 *
 * ---------------------------------------------------------------------------
 * THE SPECIFICATION, from the primary sources, cited rather than remembered.
 *
 * Google, "Email sender guidelines", fetched 2026-09-19
 * (https://support.google.com/a/answer/81126). Senders of "more than 5,000
 * messages per day to Gmail accounts", "Starting February 1, 2024", must
 * include both:
 *
 *     List-Unsubscribe-Post: List-Unsubscribe=One-Click
 *     List-Unsubscribe: <https://solarmora.com/unsubscribe/example>
 *
 * and "marketing and subscribed messages must support one-click unsubscribe,
 * and include a clearly visible unsubscribe link" in the body as well. The body
 * link is unchanged by this module and still ships; this is the other half.
 *
 * RFC 8058, fetched 2026-09-19 (https://www.rfc-editor.org/rfc/rfc8058.html):
 *   - "The List-Unsubscribe header field MUST contain one HTTPS URI. It MAY
 *     contain other non-HTTP/S URIs such as MAILTO:"
 *   - the List-Unsubscribe-Post value is exactly `List-Unsubscribe=One-Click`
 *   - the receiver "sends the key/value pair in the List-Unsubscribe-Post
 *     header as the request body", as multipart/form-data or
 *     application/x-www-form-urlencoded
 *   - "The mail receiver MUST NOT perform a POST on the HTTPS URI without user
 *     consent."
 *
 * WHY NO `mailto:` IS OFFERED, although RFC 8058 permits one. A mailto in this
 * header is a promise that a mailbox somewhere processes unsubscribe mail. No
 * such mailbox exists on this platform, and a header that names an address
 * nobody reads is worse than no header: it is an unsubscribe facility that
 * silently fails. The HTTPS URI is the one the RFC requires and the one this
 * platform can actually answer.
 *
 * ---------------------------------------------------------------------------
 * WHY THE HTTPS RULE IS ENFORCED HERE AND NOT LEFT TO A REVIEWER.
 *
 * `MUST contain one HTTPS URI` is not advisory: a `http://` URI in this header
 * is a malformed one-click facility, and the cost of shipping one is not an
 * error anybody sees. It is bulk mail delivered without a working unsubscribe
 * button, which is the deliverability failure the headers exist to prevent.
 *
 * So a non-HTTPS origin THROWS rather than composing a header, exactly as
 * `src/lib/campaigner/render.ts` already throws rather than render a commercial
 * message with no unsubscribe link at all. The one exception is a loopback
 * origin, because that is a local drive rather than deliverable mail: nothing
 * addressed to 127.0.0.1 ever reaches a mailbox provider, and refusing it would
 * mean the only way to prove this path is to not run it.
 */

/**
 * The address the two headers point at, written down ONCE. The route handler
 * lives at `src/app/api/marketing/one-click-unsubscribe/[token]/route.ts` and
 * the registered guard checks that file exists at exactly this path, so the
 * constant and the route cannot drift apart without the build going red.
 */
export const ONE_CLICK_UNSUBSCRIBE_ROUTE = '/api/marketing/one-click-unsubscribe'

/** RFC 8058: the List-Unsubscribe-Post value, exact, with no other form accepted. */
export const LIST_UNSUBSCRIBE_POST_VALUE = 'List-Unsubscribe=One-Click'

/** The header names, so no caller spells one differently. */
export const LIST_UNSUBSCRIBE_HEADER = 'List-Unsubscribe'
export const LIST_UNSUBSCRIBE_POST_HEADER = 'List-Unsubscribe-Post'

/**
 * The key and value a conforming receiver posts in the body, per RFC 8058. The
 * route handler accepts the POST whether or not the body arrived, because the
 * RFC's own wording is that the receiver "sends" it rather than that the sender
 * may demand it, and refusing a Gmail unsubscribe over a body parse would mean
 * a person who pressed the button stayed subscribed.
 */
export const ONE_CLICK_BODY_KEY = 'List-Unsubscribe'
export const ONE_CLICK_BODY_VALUE = 'One-Click'

export class OneClickUnsubscribeError extends Error {
  readonly origin: string
  constructor(origin: string, why: string) {
    super(
      `refusing to compose a one-click unsubscribe header for origin ${origin}: ${why}. ` +
        'RFC 8058 requires the List-Unsubscribe header to carry one HTTPS URI, and a ' +
        'malformed one is an unsubscribe facility that fails without telling anybody.',
    )
    this.name = 'OneClickUnsubscribeError'
    this.origin = origin
  }
}

/** Loopback, and only loopback: a local drive, never deliverable mail. */
function isLoopback(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]' || hostname === '::1'
}

/**
 * The one-click address for one token. Throws rather than return an address a
 * mailbox provider would reject.
 */
export function oneClickUnsubscribeUrl(origin: string, token: string): string {
  const trimmedToken = token.trim()
  if (trimmedToken.length === 0) {
    throw new OneClickUnsubscribeError(origin, 'no unsubscribe token was supplied')
  }

  let parsed: URL
  try {
    parsed = new URL(origin)
  } catch {
    throw new OneClickUnsubscribeError(origin, 'it is not a URL')
  }

  if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && isLoopback(parsed.hostname))) {
    throw new OneClickUnsubscribeError(
      origin,
      `its scheme is ${parsed.protocol} and the host is not loopback`,
    )
  }

  const base = origin.replace(/\/+$/, '')
  return `${base}${ONE_CLICK_UNSUBSCRIBE_ROUTE}/${encodeURIComponent(trimmedToken)}`
}

/**
 * The two headers, exactly as the specification writes them, for one token.
 *
 * The angle brackets around the URI are RFC 2369 list-header syntax and are
 * part of the value rather than decoration: Google's own published example is
 * `List-Unsubscribe: <https://solarmora.com/unsubscribe/example>`.
 */
export function oneClickUnsubscribeHeaders(origin: string, token: string): Record<string, string> {
  return {
    [LIST_UNSUBSCRIBE_HEADER]: `<${oneClickUnsubscribeUrl(origin, token)}>`,
    [LIST_UNSUBSCRIBE_POST_HEADER]: LIST_UNSUBSCRIBE_POST_VALUE,
  }
}
