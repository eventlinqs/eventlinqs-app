/**
 * THE GUIDE CITIES' NAMES AND SLUGS ONLY, light enough for code the browser loads on every page (the shared header's
 * Browse link reads the visitor's chosen city through it). src/lib/cities/data.ts holds every city's words (48 KB) and
 * stays out of the client bundle: importing it there put /events/[slug] over the 200 KB first-load budget (the gate of
 * 5 November 2026, 23:45). tests/unit/cities/city-names-match.test.ts holds this list equal to getAllCities().
 */
export const CITY_NAMES: ReadonlyArray<readonly [slug: string, name: string]> = [
  ['sydney', 'Sydney'],
  ['melbourne', 'Melbourne'],
  ['brisbane', 'Brisbane'],
  ['perth', 'Perth'],
  ['adelaide', 'Adelaide'],
  ['gold-coast', 'Gold Coast'],
  ['canberra', 'Canberra'],
  ['hobart', 'Hobart'],
  ['newcastle', 'Newcastle'],
  ['wollongong', 'Wollongong'],
  ['geelong', 'Geelong'],
  ['townsville', 'Townsville'],
  ['cairns', 'Cairns'],
  ['darwin', 'Darwin'],
  ['sunshine-coast', 'Sunshine Coast'],
  ['bendigo', 'Bendigo'],
  ['ballarat', 'Ballarat'],
  ['albury', 'Albury'],
  ['launceston', 'Launceston'],
  ['toowoomba', 'Toowoomba'],
]
