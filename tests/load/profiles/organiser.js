// Profile 3 - Organiser dashboard (authenticated, read-heavy).
//
// Models an "event-day morning" rush. 100 organisers refresh dashboard
// pages every ~30s. Heavier per-page payload than browse: aggregations
// over events, payouts, ticket sales. Each route exercises RLS scope
// checks (organiser can see only own events) which is the path most
// likely to surface a query plan issue under load.
//
// Run:
//   ./tools/k6.exe run -e BASE_URL=https://<preview>.vercel.app \
//                       --out json=tests/load/results/raw/organiser-<utc>.json \
//                       tests/load/profiles/organiser.js

import http from 'k6/http'
import { sleep, group } from 'k6'
import { BASE_URL, baseHeaders, weightedPick, randInt } from '../lib/config.js'
import { testOrganisers } from '../lib/fixtures.js'
import { checkOrg, trends } from '../lib/checks.js'

const VUS = parseInt(__ENV.VUS || '100', 10)
const HOLD = __ENV.HOLD || '8m'

export const options = {
  discardResponseBodies: true,
  scenarios: {
    organiser: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '60s', target: VUS },
        { duration: HOLD, target: VUS },
        { duration: '60s', target: 0 },
      ],
      gracefulRampDown: '15s',
    },
  },
  thresholds: {
    'http_req_duration{route:dashboard}': ['p(95)<2000'],
    'http_req_duration{route:dashboard_events}': ['p(95)<2000'],
    'http_req_duration{route:dashboard_payouts}': ['p(95)<2500'],
    'http_req_duration{route:dashboard_insights}': ['p(95)<3000'],
    'ok_org': ['rate>0.999'],
    'http_req_failed': ['rate<0.001'],
  },
  tags: {
    profile: 'organiser',
    env: __ENV.RUN_ENV || 'preview',
  },
}

export function setup() {
  if (testOrganisers.length === 0) {
    console.warn(
      '[organiser] tests/load/fixtures/test-organisers.json missing or empty. ' +
        'Calls will be unauthenticated and likely redirect to /login. ' +
        'Run tests/load/scripts/seed-test-organisers.mjs against preview first.'
    )
  }
  return { organiserCount: testOrganisers.length }
}

const ROUTE_WEIGHTS = [
  [25, 'dashboard'],
  [25, 'dashboard_events'],
  [25, 'dashboard_payouts'],
  [25, 'dashboard_insights'],
]

// eslint-disable-next-line import/no-anonymous-default-export
export default function () {
  const route = weightedPick(ROUTE_WEIGHTS)
  const organiser =
    testOrganisers.length > 0 ? testOrganisers[randInt(0, testOrganisers.length - 1)] : null
  const headers = baseHeaders()
  if (organiser && organiser.sessionCookie) headers.Cookie = organiser.sessionCookie

  group('organiser', function () {
    switch (route) {
      case 'dashboard':
        hit('/dashboard', 'dashboard', headers, trends.orgDashboardMs)
        break
      case 'dashboard_events':
        hit('/dashboard/events', 'dashboard_events', headers, trends.orgEventsMs)
        break
      case 'dashboard_payouts':
        hit('/dashboard/payouts', 'dashboard_payouts', headers, trends.orgPayoutsMs)
        break
      case 'dashboard_insights':
        hit('/dashboard/insights', 'dashboard_insights', headers, trends.orgInsightsMs)
        break
    }
  })

  sleep(randInt(20, 40))
}

function hit(path, route, headers, trend) {
  const res = http.get(`${BASE_URL}${path}`, {
    headers,
    tags: { route },
    redirects: 0, // catch redirect-to-login as a failure rather than masking
  })
  trend.add(res.timings.duration)
  checkOrg(res, route)
}
