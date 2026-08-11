/**
 * The digest audience: who lawfully receives the weekly local email, from
 * BOTH consent sources, deduplicated, with one suppression list that wins over
 * everything.
 *
 * THE BRIDGE. Before this file the weekly digest read `marketing_consents`
 * alone. The national city waitlist wrote `city_waitlist_signups` and nothing
 * on earth read it to send anything, so every person who ever asked to hear
 * about events in their city through the waitlist was on a list we could not
 * contact. This module joins the two into one audience.
 *
 * Pure on purpose: no database client, no environment, no I/O. The rules that
 * decide whether a real person gets marketing mail are the rules that must be
 * readable and testable without standing a database up.
 *
 * THE FOUR RULES, in precedence order:
 *
 *   1. SUPPRESSION WINS. Any address with a withdrawn `marketing_consents`
 *      row receives nothing, from either source, ever. One unsubscribe click
 *      stops the digest for that address whichever list it arrived on.
 *   2. RECORDED WORDING BINDS. A waitlist row is only in the audience when
 *      its stored `consent_version` expressly named the weekly email. v1
 *      wording said "Nothing else", so v1 rows are excluded even though the
 *      person plainly wanted to hear about their city.
 *   3. LEAVING MEANS LEAVING. A waitlist row with `unsubscribed_at` set is
 *      out, and a `marketing_consents` row that is not `granted` is out.
 *   4. ONE PERSON, ONE EMAIL. Addresses are matched case-insensitively and
 *      each address appears at most once per city. Where a person is on both
 *      lists the consent row wins, because its unsubscribe token is the one
 *      already in circulation in their inbox.
 */

export type DigestRecipientSource = 'consent' | 'waitlist'

export interface DigestRecipient {
  email: string
  unsubscribeToken: string
  /** Which consent record put this address in the audience. */
  source: DigestRecipientSource
}

export interface ConsentAudienceRow {
  email: string
  unsubscribe_token: string
  status: string
}

export interface WaitlistAudienceRow {
  email: string
  unsubscribe_token: string
  consent_version: string | null
  unsubscribed_at: string | null
}

/** Case-insensitive address matching, the same normalisation the consent
 * layer uses when it records an address. */
export function normaliseAudienceEmail(email: string): string {
  return email.trim().toLowerCase()
}

/**
 * Merge one city's two consent sources into the send list.
 *
 * @param consents      `marketing_consents` rows for this city.
 * @param waitlist      `city_waitlist_signups` rows for this city.
 * @param suppressed    Addresses with a withdrawn `marketing_consents` row.
 * @param coversDigest  Predicate over a stored waitlist `consent_version`.
 */
export function mergeDigestAudience(input: {
  consents: ConsentAudienceRow[]
  waitlist: WaitlistAudienceRow[]
  suppressed: string[]
  coversDigest: (version: string | null | undefined) => boolean
}): DigestRecipient[] {
  const suppressed = new Set(input.suppressed.map(normaliseAudienceEmail))
  const seen = new Set<string>()
  const audience: DigestRecipient[] = []

  const add = (email: string, token: string, source: DigestRecipientSource) => {
    const key = normaliseAudienceEmail(email)
    if (!key || !token) return
    if (suppressed.has(key)) return
    if (seen.has(key)) return
    seen.add(key)
    audience.push({ email: key, unsubscribeToken: token, source })
  }

  // Consent rows first, so a person on both lists carries the token their
  // earlier EventLinqs emails already gave them.
  for (const row of input.consents) {
    if (row.status !== 'granted') continue
    add(row.email, row.unsubscribe_token, 'consent')
  }

  for (const row of input.waitlist) {
    if (row.unsubscribed_at) continue
    if (!input.coversDigest(row.consent_version)) continue
    add(row.email, row.unsubscribe_token, 'waitlist')
  }

  return audience
}
