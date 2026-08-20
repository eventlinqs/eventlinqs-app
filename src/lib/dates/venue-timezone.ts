/**
 * THE EVENT'S ZONE COMES FROM WHERE THE EVENT IS, not from where the organiser
 * was sitting when they filled the form in.
 *
 * THE DEFECT THIS CLOSES, 18 August 2026. An event at a GEELONG venue, in
 * Victoria, was stored with `Australia/Sydney`. Today that is harmless, because
 * Melbourne and Sydney share an offset. It stops being harmless the moment a
 * Perth or Brisbane organiser signs up, and it is already wrong on the label a
 * buyer reads.
 *
 * WHY IT HAPPENED, and it is not carelessness. The organiser form seeded the
 * zone from `Intl.DateTimeFormat().resolvedOptions().timeZone`, the BROWSER's
 * zone. On Windows the whole eastern seaboard is one setting, "(UTC+10:00)
 * Canberra, Melbourne, Sydney", and the CLDR mapping that Windows setting
 * resolves to is `Australia/Sydney`. So a Melbourne organiser on Windows reports
 * Sydney, correctly, as far as the browser is concerned. The browser was simply
 * being asked a question it cannot answer: it knows where the ORGANISER is, and
 * the event is not necessarily there.
 *
 * SOURCE for the zone names: the IANA Time Zone Database, which is what
 * `Intl.DateTimeFormat` resolves against
 * (https://www.iana.org/time-zones). The Australian zone list below is the set
 * of `Australia/*` zones covering the eight states and territories. Lord Howe
 * Island (`Australia/Lord_Howe`, UTC+10:30 with a 30 minute change) and Eucla
 * (`Australia/Eucla`) are deliberately NOT inferred from a state code, because
 * no state code implies them: an event there must set its zone explicitly, and
 * inferring NSW to Sydney for a Lord Howe event would be a confident guess of
 * exactly the kind this module exists to stop.
 */

/** The eight state and territory codes, to their IANA zone. */
const STATE_ZONE: Record<string, string> = {
  NSW: 'Australia/Sydney',
  ACT: 'Australia/Sydney',
  VIC: 'Australia/Melbourne',
  QLD: 'Australia/Brisbane',
  SA: 'Australia/Adelaide',
  WA: 'Australia/Perth',
  TAS: 'Australia/Hobart',
  NT: 'Australia/Darwin',
}

/**
 * Full state names, because a venue's state arrives from an address field and a
 * human types "Victoria" as often as "VIC".
 */
const STATE_NAME_TO_CODE: Record<string, string> = {
  'NEW SOUTH WALES': 'NSW',
  'AUSTRALIAN CAPITAL TERRITORY': 'ACT',
  VICTORIA: 'VIC',
  QUEENSLAND: 'QLD',
  'SOUTH AUSTRALIA': 'SA',
  'WESTERN AUSTRALIA': 'WA',
  TASMANIA: 'TAS',
  'NORTHERN TERRITORY': 'NT',
}

/**
 * Cities whose state a form may not carry. Deliberately SHORT: it exists to
 * catch the common case where an organiser fills in a city and leaves the state
 * blank, not to become a gazetteer. A city not listed here falls through to the
 * caller's fallback rather than being guessed at.
 */
const CITY_TO_STATE: Record<string, string> = {
  SYDNEY: 'NSW',
  NEWCASTLE: 'NSW',
  WOLLONGONG: 'NSW',
  CANBERRA: 'ACT',
  MELBOURNE: 'VIC',
  GEELONG: 'VIC',
  BALLARAT: 'VIC',
  BENDIGO: 'VIC',
  BRISBANE: 'QLD',
  'GOLD COAST': 'QLD',
  CAIRNS: 'QLD',
  TOWNSVILLE: 'QLD',
  ADELAIDE: 'SA',
  PERTH: 'WA',
  FREMANTLE: 'WA',
  HOBART: 'TAS',
  LAUNCESTON: 'TAS',
  DARWIN: 'NT',
  'ALICE SPRINGS': 'NT',
}

export interface VenueLocation {
  state?: string | null
  city?: string | null
}

/**
 * The event's zone, resolved from its venue.
 *
 * Returns null when the venue does not determine one, which is the honest answer
 * and is why this returns a nullable rather than a default. A caller that needs
 * a value supplies its own fallback and knows it is falling back; a function
 * that quietly returned Sydney would recreate the defect it replaces.
 */
export function timezoneForVenue(venue: VenueLocation): string | null {
  const rawState = venue.state?.trim().toUpperCase() ?? ''
  const code = STATE_ZONE[rawState] ? rawState : STATE_NAME_TO_CODE[rawState]
  if (code && STATE_ZONE[code]) return STATE_ZONE[code]

  const city = venue.city?.trim().toUpperCase() ?? ''
  const cityState = CITY_TO_STATE[city]
  if (cityState) return STATE_ZONE[cityState]

  return null
}

/** Every zone this module can produce, for a form's option list and for tests. */
export const AUSTRALIAN_ZONES = Array.from(new Set(Object.values(STATE_ZONE))).sort()
