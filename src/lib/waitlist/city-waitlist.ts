/**
 * The national city waitlist - shared configuration.
 *
 * Nationally available, locally dense (the growth plan's launch shape): the
 * platform works everywhere in Australia today, and the waitlist concentrates
 * the first organisers and audiences city by city. Geelong and Melbourne open
 * first; their signups are Founding Organiser invite candidates.
 *
 * City names and states come from the canonical city registry
 * (src/lib/cities/data.ts) so the waitlist can never drift from the platform's
 * city taxonomy.
 */
import { getCity, type CitySlug } from '@/lib/cities/data'

export const WAITLIST_CITY_SLUGS = [
  'geelong',
  'melbourne',
  'sydney',
  'brisbane',
  'perth',
  'adelaide',
  'canberra',
  'hobart',
  'darwin',
] as const satisfies readonly CitySlug[]

export type WaitlistCitySlug = (typeof WAITLIST_CITY_SLUGS)[number]

/** Geelong and Melbourne open first; their signups are founding candidates. */
export const OPENING_FIRST: readonly WaitlistCitySlug[] = ['geelong', 'melbourne']

export function isWaitlistCitySlug(value: unknown): value is WaitlistCitySlug {
  return (
    typeof value === 'string' && (WAITLIST_CITY_SLUGS as readonly string[]).includes(value)
  )
}

export interface WaitlistCity {
  slug: WaitlistCitySlug
  name: string
  state: string
  openingFirst: boolean
}

export function getWaitlistCities(): WaitlistCity[] {
  return WAITLIST_CITY_SLUGS.map(slug => {
    const city = getCity(slug)
    return {
      slug,
      name: city?.name ?? slug,
      state: city?.state ?? '',
      openingFirst: (OPENING_FIRST as readonly string[]).includes(slug),
    }
  })
}

export const WAITLIST_ROLES = ['organiser', 'attendee'] as const
export type WaitlistRole = (typeof WAITLIST_ROLES)[number]

export const CONSENT_VERSION = 'v2'

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
 * The lawful route for a v1 signup is a fresh express opt-in, never an
 * assumption. See docs/roast/WAITLIST-BRIDGE.md.
 */
export const DIGEST_COVERING_CONSENT_VERSIONS: readonly string[] = ['v2']

/** Whether a stored consent_version permits sending that person the digest. */
export function consentVersionCoversDigest(version: string | null | undefined): boolean {
  return typeof version === 'string' && DIGEST_COVERING_CONSENT_VERSIONS.includes(version)
}

/** The exact join wording shown beside the submit button; stored verbatim as
 * the consent evidence (Spam Act 2003). Every stream it authorises is named
 * here, because this sentence is the whole of the permission. */
export function joinConsentText(cityName: string): string {
  return `Join the ${cityName} waitlist: EventLinqs will email you when ${cityName} opens, send you a weekly email of what is on in ${cityName}, and, if you registered as an organiser, contact you about Founding Organiser invitations. Nothing else, and one click unsubscribes you.`
}

/** The OPTIONAL, unticked-by-default marketing opt-in wording. */
export const MARKETING_OPT_IN_LABEL =
  'Also send me occasional EventLinqs updates: new cities, new tools, and organiser offers.'
