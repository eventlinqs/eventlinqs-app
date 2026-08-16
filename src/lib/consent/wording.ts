/**
 * Marketing-consent wording (pure, client-safe).
 *
 * Australian Spam Act 2003 / ACMA: an opt-in must name WHO the marketing is from
 * and the CHANNEL, be plain language, and tell the person how to withdraw. These
 * are the single source of truth for the exact wording shown, so the same string
 * the buyer sees at checkout is the string recorded as evidence. Bump
 * CONSENT_WORDING_VERSION whenever the wording below changes, so the audit trail
 * stays provable across copy changes. No em or en dashes, no exclamation marks.
 */

export const CONSENT_WORDING_VERSION = 'v1'

/**
 * Organiser marketing opt-in, naming the specific organiser. Per-organiser: a
 * buyer consenting to one organiser is never consent to any other.
 */
export function organiserMarketingConsentWording(organiserName: string): string {
  const name = organiserName.trim() || 'this organiser'
  return `Keep me updated by ${name} about their upcoming events, news, and offers by email. You can unsubscribe at any time.`
}

/**
 * EventLinqs platform-updates opt-in, kept entirely separate from any organiser
 * marketing. Optional, and never bundled with the organiser box or the terms.
 */
export const PLATFORM_UPDATES_CONSENT_WORDING =
  'Send me EventLinqs updates: recommended events, new features, and offers by email. You can unsubscribe at any time.'

/**
 * The weekly local digest opt-in (Broadcast Layer SPEC 3.1): city-scoped
 * platform marketing, recorded verbatim in marketing_consents. Versioned
 * separately from the organiser wording so each audit trail stands alone.
 */
export const DIGEST_CONSENT_WORDING =
  'Keep me posted on events in my area: a weekly local digest and occasional EventLinqs updates by email. You can unsubscribe at any time.'
export const DIGEST_CONSENT_WORDING_VERSION = 'v1'

/**
 * The city newsletter capture, shown on every city landing, every
 * community-by-city page and every organiser profile.
 *
 * This string is the EXACT promise printed on that panel, word for word, so
 * the wording recorded as evidence is the wording the person actually read.
 * `tests/unit/consent/newsletter-capture.test.ts` pins it against the
 * component's own literals, so the two can never drift apart silently.
 *
 * Nothing is added that the panel does not say. Storing a stronger consent
 * than the one shown would be the same lie in the other direction.
 */
export function cityNewsletterConsentWording(cityName: string): string {
  return `Get ${cityName}'s best events weekly. One email a week, the events worth your time.`
}
export const CITY_NEWSLETTER_CONSENT_VERSION = 'v1'

/** Normalise an email for consent matching (case-insensitive, trimmed). */
export function normaliseConsentEmail(email: string): string {
  return email.trim().toLowerCase()
}
