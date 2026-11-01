/**
 * CITY FIRST, DIRECTIVE 3: how an event's venue stands to the guide city a visitor chose, as
 * public.venue_city_relation(city, venue) answers it (20261101160001). The rule lives in the database, read from the
 * venue's ABS placement and public.city_geography; this module only names the answers for the guide and the desk.
 * No city is named here: every city is a row of city_geography.
 */

export const CITY_RELATIONS = ['city', 'surrounding', 'region', 'outside', 'unplaced'] as const
export type CityRelation = (typeof CITY_RELATIONS)[number]

/** The relations a guide shows at each step of widening, from the city alone outwards. */
export const WIDENING_STEPS: readonly (readonly CityRelation[])[] = [
  ['city'],
  ['city', 'surrounding'],
  ['city', 'surrounding', 'region'],
]

/** Words for each step, with the city's own names filled in from city_geography and cities. */
export function wideningWords(step: number, cityName: string, regionName: string): string {
  if (step <= 0) return cityName
  if (step === 1) return `${cityName} and nearby towns`
  return regionName
}

/** An event the guide may show at a widening step: never one outside, never one not yet placed. */
export function shownAtStep(relation: CityRelation, step: number): boolean {
  const steps = WIDENING_STEPS[Math.max(0, Math.min(step, WIDENING_STEPS.length - 1))]
  return steps.includes(relation)
}

export function isCityRelation(value: unknown): value is CityRelation {
  return typeof value === 'string' && (CITY_RELATIONS as readonly string[]).includes(value)
}
