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
  /** WI1. A walk-in event's pin says "Free entry". */
  walk_in: boolean
  /**
   * The pin's price words, the night's call to action read on the server (src/lib/broadcast/price-line.ts): a night
   * sold elsewhere names the site, free only where free is stored, '' where no price may be said. The pin shows these
   * and decides nothing itself (it used to say 'Free' for any night with no paid ticket of ours).
   */
  price_line: string
  currency: string
  lat: number
  lng: number
}
