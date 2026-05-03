// Profile 1 - Browse (anonymous, public surface).
//
// Models launch-day discovery surge. 10K concurrent VUs, 10 min steady,
// weighted route mix per scope.md. Anonymous, GET-heavy.
//
// Run:
//   ./tools/k6.exe run -e BASE_URL=https://<preview>.vercel.app \
//                       --out json=tests/load/results/raw/browse-<utc>.json \
//                       tests/load/profiles/browse.js
//
// Env override knobs:
//   VUS               - VU count override (default 10000)
//   DURATION          - hold duration override (default 10m)
//   BASE_URL          - target URL (no trailing slash)

import http from 'k6/http'
import { sleep, group } from 'k6'
import { BASE_URL, baseHeaders, weightedPick, randInt } from '../lib/config.js'
import { eventSlugs, cities } from '../lib/fixtures.js'
import { checkBrowse, trends } from '../lib/checks.js'

const VUS = parseInt(__ENV.VUS || '10000', 10)
const DURATION = __ENV.DURATION || '10m'
const RAMPDOWN = __ENV.RAMPDOWN || '30s'

export const options = {
  discardResponseBodies: true,
  scenarios: {
    browse: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: VUS },
        { duration: DURATION, target: VUS },
        { duration: RAMPDOWN, target: 0 },
      ],
      gracefulRampDown: '15s',
    },
  },
  thresholds: {
    'http_req_duration{route:home}': ['p(95)<800'],
    'http_req_duration{route:events}': ['p(95)<1000'],
    'http_req_duration{route:events_city}': ['p(95)<1200'],
    'http_req_duration{route:event_slug}': ['p(95)<800'],
    'http_req_duration{route:pricing}': ['p(95)<800'],
    'http_req_duration{route:organisers}': ['p(95)<800'],
    'ok_browse': ['rate>0.995'],
    'http_req_failed': ['rate<0.005'],
  },
  tags: {
    profile: 'browse',
    env: __ENV.RUN_ENV || 'preview',
  },
}

const ROUTE_WEIGHTS = [
  [15, 'home'],
  [35, 'events'],
  [10, 'events_city'],
  [30, 'event_slug'],
  [5, 'pricing'],
  [5, 'organisers'],
]

// eslint-disable-next-line import/no-anonymous-default-export
export default function () {
  const route = weightedPick(ROUTE_WEIGHTS)
  group('browse', function () {
    switch (route) {
      case 'home':
        hit('/', 'home', trends.browseHomeMs)
        break
      case 'events':
        hit('/events', 'events', trends.browseEventsMs)
        break
      case 'events_city': {
        const city = cities[randInt(0, cities.length - 1)]
        hit(`/events?city=${city}`, 'events_city', trends.browseEventsCityMs)
        break
      }
      case 'event_slug': {
        const slug = eventSlugs[randInt(0, eventSlugs.length - 1)]
        hit(`/events/${slug}`, 'event_slug', trends.browseEventSlugMs)
        break
      }
      case 'pricing':
        hit('/pricing', 'pricing', trends.browsePricingMs)
        break
      case 'organisers':
        hit('/organisers', 'organisers', trends.browseOrganisersMs)
        break
    }
  })
  sleep(randInt(2, 8))
}

function hit(path, route, trend) {
  const url = `${BASE_URL}${path}`
  const res = http.get(url, {
    headers: baseHeaders({ Referer: BASE_URL + '/' }),
    tags: { route },
  })
  trend.add(res.timings.duration)
  checkBrowse(res, route)
}
