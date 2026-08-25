/**
 * Local events alerts - shared configuration.
 *
 * NATIONWIDE FROM DAY ONE (founder ruling 2026-08-23). This module used to
 * describe a LAUNCH QUEUE: nine cities, `OPENING_FIRST = ['geelong',
 * 'melbourne']`, and consent wording promising "we will email you when your
 * city opens". Every city and state is open today, so that email would never
 * be sent and the premise was false. What survives is the useful half: a
 * person tells us which city they are in, and we email them when there is
 * something on near them.
 *
 * EVERY city in the canonical registry is offered, not a launch subset, so a
 * person in Perth or Darwin picks their own city rather than the nearest one
 * we had decided to open.
 *
 * City names and states come from the canonical city registry
 * (src/lib/cities/data.ts) so this can never drift from the platform's city
 * taxonomy.
 */
import { getAllCities, isCitySlug, type CitySlug } from '@/lib/cities/data'

export type WaitlistCitySlug = CitySlug

export function isWaitlistCitySlug(value: unknown): value is WaitlistCitySlug {
  return typeof value === 'string' && isCitySlug(value)
}

export interface WaitlistCity {
  slug: WaitlistCitySlug
  name: string
  state: string
}

/** Every Australian city, in the registry's own order. */
export function getWaitlistCities(): WaitlistCity[] {
  return getAllCities().map(city => ({
    slug: city.slug,
    name: city.name,
    state: city.state,
  }))
}

export const WAITLIST_ROLES = ['organiser', 'attendee'] as const
export type WaitlistRole = (typeof WAITLIST_ROLES)[number]

export const CONSENT_VERSION = 'v3'

/**
 * The consent versions whose recorded wording expressly covers the weekly
 * local digest, and therefore the ONLY versions the digest audience may draw
 * from.
 *
 * v1 wording promised the city-opening email and Founding Organiser
 * invitations and then said "Nothing else". A weekly digest is something
 * else, so v1 signups are excluded from the digest by construction, no matter
 * what they would probably have wanted. The recorded wording binds, not the
 * intent. v2 names the weekly email in the sentence the person read before
 * pressing the button.
 *
 * v3 IS LISTED HERE DELIBERATELY, AND OMITTING IT WOULD HAVE BEEN A SILENT
 * REGRESSION. v3 is the nationwide wording: it drops the city-opening promise
 * and states no cadence, because a weekly cadence is not one the platform can
 * honour yet and a thin digest burns the subscriber. It still expressly names
 * emails about what is on near the person, which is exactly what the digest
 * is, so it covers the send. Had v3 been introduced without being added to
 * this list, every new signup would have landed in a table nothing reads and
 * been asked for permission we then ignored, which is the precise defect the
 * audience bridge exists to have fixed.
 *
 * The lawful route for a v1 signup is a fresh express opt-in, never an
 * assumption. See docs/roast/WAITLIST-BRIDGE.md.
 */
export const DIGEST_COVERING_CONSENT_VERSIONS: readonly string[] = ['v2', 'v3']

/** Whether a stored consent_version permits sending that person the digest. */
export function consentVersionCoversDigest(version: string | null | undefined): boolean {
  return typeof version === 'string' && DIGEST_COVERING_CONSENT_VERSIONS.includes(version)
}

/** The exact join wording shown beside the submit button; stored verbatim as
 * the consent evidence (Spam Act 2003). Every stream it authorises is named
 * here, because this sentence is the whole of the permission. */
export function joinConsentText(cityName: string): string {
  return `Get ${cityName} alerts: EventLinqs will email you when there is something on near you in ${cityName}, and, if you registered as an organiser, contact you about Founding Organiser invitations. Nothing else, and one click unsubscribes you.`
}

/** The OPTIONAL, unticked-by-default marketing opt-in wording. */
export const MARKETING_OPT_IN_LABEL =
  'Also send me occasional EventLinqs updates: new tools and organiser offers.'
