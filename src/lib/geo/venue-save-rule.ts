/**
 * NEVER SAVE A NULL PAIR SILENTLY (close-out C9, 7 September 2026).
 *
 * resolveVenueCoordinates (./venue-coordinates.ts) resolves a typed address to
 * coordinates at save time and, when it cannot, hands back a null pair with the
 * reason by name. Until this rule existed the create and update actions logged
 * that reason at warn level and saved the event anyway, so on production an
 * organiser who typed an address and never picked from the suggestions got an
 * event that no city map, suburb page or distance search could place, and
 * nobody was told: not the organiser, not the founder. On 4 September 2026 that
 * was every typed address on production, because GOOGLE_MAPS_API_KEY there was
 * the referer-restricted browser key and Google refused it.
 *
 * The rule, in one place for both actions:
 *
 *   - a virtual event has no venue: nothing to place, allowed;
 *   - coordinates present (a Places pick, an edit that kept them, a geocode that
 *     succeeded): allowed;
 *   - no address at all: nothing to geocode, allowed with the reason as a warning;
 *   - a typed address and NO coordinates on a PRODUCTION-LIKE environment
 *     (production or preview, where the manifest requires the server key):
 *     REFUSED, with a message the organiser can act on. If the cause is the
 *     platform's own configuration (the key absent, or the browser key standing
 *     in for it) the message says so, because that fault is the founder's to fix
 *     and the organiser must not be left guessing; if Google refused or found
 *     nothing, the message says to check the address or pick the venue from the
 *     suggestions, which carry their own coordinates;
 *   - the same on DEVELOPMENT (a local checkout, where the server key is
 *     forbidden on the Vercel store by ruling R3 and may only sit in a local
 *     file): allowed, with the reason as a warning the server log carries, so a
 *     local drive without the key still saves.
 *
 * scripts/guards/geocoding-never-silent-null.mjs runs this rule against the
 * key-absent case and checks that both actions call it and return its refusal.
 */
import type { VenueCoordinates } from './venue-coordinates'

export type DeploymentEnvironment = 'production' | 'preview' | 'development'

/**
 * Which environment the code runs as, from Vercel's own variable. Anything
 * that is not a Vercel production or preview deployment (a local `next start`,
 * a test) is development.
 */
export function deploymentEnvironment(env: Record<string, string | undefined> = process.env): DeploymentEnvironment {
  const v = (env.VERCEL_ENV ?? '').trim()
  if (v === 'production' || v === 'preview') return v
  return 'development'
}

export type VenueSaveVerdict =
  | { ok: true; warning: string | null }
  | { ok: false; kind: 'configuration' | 'geocoding'; error: string; nextAction: { label: string; href: string } | null }

export const CONFIGURATION_REASON_PREFIX = 'server geocoding is off:'
export const GEOCODING_REASON_PREFIX = 'the Geocoding API answered'

export interface VenueSaveInput {
  eventType: 'in_person' | 'virtual' | 'hybrid'
  venueAddress: string | null
  coordinates: Pick<VenueCoordinates, 'venue_latitude' | 'venue_longitude' | 'reason'>
  environment: DeploymentEnvironment
}

const finite = (n: number | null | undefined): n is number => typeof n === 'number' && Number.isFinite(n)

export function judgeVenueSave(input: VenueSaveInput): VenueSaveVerdict {
  if (input.eventType === 'virtual') return { ok: true, warning: null }
  if (finite(input.coordinates.venue_latitude) && finite(input.coordinates.venue_longitude)) return { ok: true, warning: null }
  const reason = input.coordinates.reason ?? 'no coordinates and no reason recorded'
  if (!(input.venueAddress ?? '').trim()) return { ok: true, warning: reason }
  if (input.environment === 'development') return { ok: true, warning: reason }

  if (reason.startsWith(CONFIGURATION_REASON_PREFIX)) {
    return {
      ok: false,
      kind: 'configuration',
      error:
        'This environment cannot place a typed address on the map: GOOGLE_MAPS_API_KEY is not configured for server geocoding. ' +
        'Pick the venue from the suggestions so it carries its own coordinates, or contact hello@eventlinqs.com so we can fix the configuration.',
      nextAction: null,
    }
  }
  const status = reason.startsWith(GEOCODING_REASON_PREFIX) ? reason.slice(GEOCODING_REASON_PREFIX.length).trim().split(':')[0] : ''
  return {
    ok: false,
    kind: 'geocoding',
    error:
      `We could not place that address on the map${status ? ` (${status})` : ''}. ` +
      'Check the street address, city and state, or pick the venue from the suggestions so it carries its own coordinates.',
    nextAction: null,
  }
}
