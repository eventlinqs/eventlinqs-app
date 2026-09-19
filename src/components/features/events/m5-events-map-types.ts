/**
 * Shared map types. Kept in a standalone module so the 'use server'
 * actions file can import them without pulling in the Google Maps
 * JS runtime (which would otherwise leak window/document access into
 * the server action bundle).
 */

export type MapEventPoint = {
  id: string
  slug: string
  title: string
  venue_city: string | null
  start_date: string
  /** The EVENT own IANA zone, so a map pin prints the day the event happens. */
  timezone: string | null
  starting_from_cents: number | null
  is_free: boolean
  currency: string
  lat: number
  lng: number
}
