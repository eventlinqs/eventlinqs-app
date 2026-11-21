/**
 * EVERY CONTROL THAT SENDS A CITY TO /events, ONE LIST (21 November 2026, the PM's 20:41). Walked as a model by
 * tests/unit/seo/city-controls-end-on-a-page.test.ts and read live by scripts/verify/city-controls-live.mjs, so the
 * test and the live read can never walk different targets. Pure.
 *
 * @param {{ slug: string, name: string }} c a guide city
 * @returns {Array<[string, string]>} [what was pressed, the address it sends]
 */
export function cityControlTargets(c) {
  const enc = encodeURIComponent
  return [
    ['the header search with words (it sends the name)', `/events?q=jazz&city=${enc(c.name)}`],
    ['the header search with no words', `/events?q=&city=${enc(c.name)}`],
    ["the home's Map button", `/events?city=${c.slug}&view=map`],
    ["the home's Sort, best match", `/events?city=${c.slug}&sort=relevance`],
    ["the home's Sort, soonest", `/events?city=${c.slug}&sort=date_asc`],
    ["the home's Sort, lowest price", `/events?city=${c.slug}&sort=price_asc`],
    ["the city page's type rail", `/events?city=${c.slug}&event_type=music`],
    ['a city tile', `/events?city=${enc(c.slug)}`],
    ['a link typed in capitals', `/events?city=${enc(c.name.toUpperCase())}`],
    ['the guide by its name', `/city/${enc(c.name)}`],
    ['the guide in capitals', `/city/${c.slug.toUpperCase()}`],
  ]
}
