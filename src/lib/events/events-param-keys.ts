/**
 * EVERY QUERY KEY /events READS (src/lib/events/search-params.ts, EventsSearchParams), as one list. The redirect that
 * sends /events?city=<city> to the city's guide (src/lib/seo/permanent-redirects.ts, EVENTS_CITY_TO_GUIDE) stands aside
 * when any of these other than city is asked, because the guide does not honour them: a search's words, the map, a
 * sort, a type or a date stay on /events. The type and this list are held equal by
 * tests/unit/seo/city-controls-end-on-a-page.test.ts, so a key added to one and not the other fails the gate.
 * No imports: next.config.ts reads this through the redirects module.
 */
export const EVENTS_PARAM_KEYS = [
  'q',
  'preset',
  'category',
  'community',
  'sub_community',
  'country',
  'price_min',
  'price_max',
  'from',
  'to',
  'distance_km',
  'sort',
  'view',
  'page',
  'city',
  'date',
  'suburb',
  'event_type',
  'venue',
  'organiser',
  'faith',
  'moment',
  'tab',
  'free',
  'price',
  'focus',
  'error',
] as const

export type EventsParamKey = (typeof EVENTS_PARAM_KEYS)[number]
