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

export const CONSENT_VERSION = 'v1'

/** The exact join wording shown beside the submit button; stored verbatim as
 * the consent evidence (Spam Act 2003). */
export function joinConsentText(cityName: string): string {
  return `Join the ${cityName} waitlist: EventLinqs will email you when ${cityName} opens and, if you registered as an organiser, about Founding Organiser invitations. Nothing else, and one click unsubscribes you.`
}

/** The OPTIONAL, unticked-by-default marketing opt-in wording. */
export const MARKETING_OPT_IN_LABEL =
  'Also send me occasional EventLinqs updates: new cities, new tools, and organiser offers.'
