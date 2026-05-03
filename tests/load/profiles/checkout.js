// Profile 2 - Checkout (authenticated, transactional).
//
// Models a popular event going on-sale. constant-arrival-rate at
// 1000/min => ~16.67 RPS sustained on the checkout chain. Each iteration:
//   1. GET /events/[slug]   (warm the inventory cache)
//   2. POST /api/checkout/reserve
//   3. POST /api/checkout/confirm  (or release if no test-user pool)
//
// IMPORTANT: this profile WRITES to the target environment. Run only
// against preview, never production. Reservations are tagged
// metadata.loadtest=true so they can be swept with a single SQL
// statement post-run.
//
// Run:
//   ./tools/k6.exe run -e BASE_URL=https://<preview>.vercel.app \
//                       --out json=tests/load/results/raw/checkout-<utc>.json \
//                       tests/load/profiles/checkout.js

import http from 'k6/http'
import { sleep, group } from 'k6'
import { BASE_URL, baseHeaders, randInt } from '../lib/config.js'
import { eventSlugs, testUsers } from '../lib/fixtures.js'
import { checkCheckout, checkBrowse, trends } from '../lib/checks.js'

const RATE = parseInt(__ENV.RATE || '1000', 10) // per minute
const DURATION = __ENV.DURATION || '5m'

export const options = {
  scenarios: {
    checkout: {
      executor: 'constant-arrival-rate',
      rate: RATE,
      timeUnit: '1m',
      duration: DURATION,
      preAllocatedVUs: Math.max(50, Math.ceil(RATE / 6)),
      maxVUs: Math.max(200, Math.ceil(RATE / 2)),
    },
  },
  thresholds: {
    'http_req_duration{stage:event_view}': ['p(95)<1000'],
    'http_req_duration{stage:reserve}': ['p(95)<1500'],
    'http_req_duration{stage:confirm}': ['p(95)<2000'],
    'ok_checkout': ['rate>0.99'],
    'http_req_failed': ['rate<0.01'],
  },
  tags: {
    profile: 'checkout',
    env: __ENV.RUN_ENV || 'preview',
  },
}

export function setup() {
  if (testUsers.length === 0) {
    console.warn(
      '[checkout] tests/load/fixtures/test-users.json missing or empty. ' +
        'Reserve calls will be made anonymously and will likely 401. ' +
        'Run tests/load/scripts/seed-test-users.mjs against preview first.'
    )
  }
  return { userCount: testUsers.length }
}

// eslint-disable-next-line import/no-anonymous-default-export
export default function () {
  const slug = eventSlugs[randInt(0, eventSlugs.length - 1)]
  const user = testUsers.length > 0 ? testUsers[randInt(0, testUsers.length - 1)] : null

  group('checkout-event-view', function () {
    const res = http.get(`${BASE_URL}/events/${slug}`, {
      headers: baseHeaders(),
      tags: { stage: 'event_view' },
    })
    trends.checkoutEventViewMs.add(res.timings.duration)
    checkBrowse(res, 'event_view')
  })

  sleep(randInt(1, 2))

  let reservationId = null

  group('checkout-reserve', function () {
    const headers = baseHeaders({ 'Content-Type': 'application/json' })
    if (user && user.sessionCookie) headers.Cookie = user.sessionCookie
    const payload = JSON.stringify({
      slug,
      tier: 'general',
      qty: 1,
      metadata: { loadtest: true },
    })
    const res = http.post(`${BASE_URL}/api/checkout/reserve`, payload, {
      headers,
      tags: { stage: 'reserve' },
    })
    trends.checkoutReserveMs.add(res.timings.duration)
    const ok = checkCheckout(res, 'reserve')
    if (ok) {
      try {
        const body = res.json()
        reservationId = body && body.reservationId ? body.reservationId : null
      } catch (_e) {
        reservationId = null
      }
    }
  })

  if (!reservationId) return

  sleep(randInt(1, 3))

  group('checkout-confirm', function () {
    const headers = baseHeaders({ 'Content-Type': 'application/json' })
    if (user && user.sessionCookie) headers.Cookie = user.sessionCookie
    const payload = JSON.stringify({ reservationId, paymentMethod: 'pm_loadtest_simulated' })
    const res = http.post(`${BASE_URL}/api/checkout/confirm`, payload, {
      headers,
      tags: { stage: 'confirm' },
    })
    trends.checkoutConfirmMs.add(res.timings.duration)
    checkCheckout(res, 'confirm')
  })
}
