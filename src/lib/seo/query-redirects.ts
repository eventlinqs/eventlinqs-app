import { EVENTS_PARAM_KEYS } from '../events/events-param-keys'
import { GUIDED_CITY_SLUGS } from './permanent-redirects'

/**
 * REDIRECTS THAT HOLD ONLY FOR A QUERY (21 November 2026). Kept apart from ./permanent-redirects.ts, whose every source
 * the sitemap guard (scripts/guards/sitemap-resolves.mjs) reads as a page redirected away: /events itself is never
 * redirected, only /events with the query below, so it is no sitemap fault. Relative imports: next.config.ts reads this.
 *
 * /events?city=<city> FOR A CITY WITH A GUIDE GOES TO THE GUIDE (round 3, item 7), ONLY WHEN NOTHING ELSE /events
 * READS IS ASKED (21 November 2026, the PM's 20:41). The guide does not honour a search's words, the map, a sort, a
 * type or a date, so any of those keeps the visitor on /events, which does (EVENTS_PARAM_KEYS, one list with the
 * type). The city is matched in any case at Vercel's edge (it forwarded 'Melbourne', read on production at 20:58) and
 * by exact case under next start; either way /city/<any case or the name> answers 308 to its slug
 * (src/lib/cities/city-route.ts), so every case ends on the guide. Held by
 * tests/unit/seo/city-controls-end-on-a-page.test.ts and read live by scripts/verify/city-controls-live.mjs.
 */
export const EVENTS_CITY_TO_GUIDE = {
  source: '/events',
  has: [{ type: 'query' as const, key: 'city', value: `(?<city>${GUIDED_CITY_SLUGS.join('|')})` }],
  missing: EVENTS_PARAM_KEYS.filter((key) => key !== 'city').map((key) => ({ type: 'query' as const, key })),
  destination: '/city/:city',
  permanent: true as const,
}

