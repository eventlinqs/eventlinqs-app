// Shared k6 check helpers. Centralised so that:
//   1. Every profile uses the same pass/fail thresholds for "ok response"
//   2. Per-route latency thresholds live in one file for cap-tuning
//   3. Failure shapes map cleanly to the results doc tables
//
// k6 `check()` returns boolean; we return it so the calling profile can
// gate its sleep / iteration logic on the outcome.

import { check } from 'k6'
import { Trend, Rate, Counter } from 'k6/metrics'

// Per-class trends so the JSON summary cleanly splits browse vs
// checkout vs dashboard P95s. The 'browse_*' / 'checkout_*' / 'org_*'
// naming is consumed verbatim by tests/load/process-results.mjs.
export const trends = {
  browseHomeMs: new Trend('browse_home_ms', true),
  browseEventsMs: new Trend('browse_events_ms', true),
  browseEventsCityMs: new Trend('browse_events_city_ms', true),
  browseEventSlugMs: new Trend('browse_event_slug_ms', true),
  browsePricingMs: new Trend('browse_pricing_ms', true),
  browseOrganisersMs: new Trend('browse_organisers_ms', true),

  checkoutEventViewMs: new Trend('checkout_event_view_ms', true),
  checkoutReserveMs: new Trend('checkout_reserve_ms', true),
  checkoutConfirmMs: new Trend('checkout_confirm_ms', true),

  orgDashboardMs: new Trend('org_dashboard_ms', true),
  orgEventsMs: new Trend('org_events_ms', true),
  orgPayoutsMs: new Trend('org_payouts_ms', true),
  orgInsightsMs: new Trend('org_insights_ms', true),
}

export const rates = {
  okBrowse: new Rate('ok_browse'),
  okCheckout: new Rate('ok_checkout'),
  okOrg: new Rate('ok_org'),
}

export const counters = {
  rateLimited: new Counter('rate_limited_total'),
  serverError: new Counter('server_error_total'),
  redirect: new Counter('redirect_total'),
}

// Standardised "is the response acceptable for a browse path" check.
// Acceptable: 2xx, or 3xx redirect (preview deployments have a few
// canonical-host redirects that are not failures).
//
// Body check passes when r.body is null because k6's
// discardResponseBodies:true zeros out the body field on every
// response - we still want to assert content-length flowed via the
// data_received metric, but the per-response check must not flag
// every browse iteration as failed when discardResponseBodies is on.
export function checkBrowse(res, route) {
  const ok = check(res, {
    [`${route}: status 2xx/3xx`]: (r) => r.status >= 200 && r.status < 400,
    [`${route}: body ok`]: (r) => r.body === null || r.body.length > 0,
  })
  rates.okBrowse.add(ok)
  if (res.status === 429) counters.rateLimited.add(1)
  if (res.status >= 500) counters.serverError.add(1)
  if (res.status >= 300 && res.status < 400) counters.redirect.add(1)
  return ok
}

export function checkCheckout(res, route) {
  const ok = check(res, {
    [`${route}: status 2xx`]: (r) => r.status >= 200 && r.status < 300,
    [`${route}: json body`]: (r) => {
      // r.body may be null when discardResponseBodies is set on the
      // run; the checkout profile leaves bodies enabled so reservation
      // ID parsing works, but be resilient anyway.
      if (r.body === null) return true
      try {
        return r.json() !== null
      } catch (_e) {
        return false
      }
    },
  })
  rates.okCheckout.add(ok)
  if (res.status === 429) counters.rateLimited.add(1)
  if (res.status >= 500) counters.serverError.add(1)
  return ok
}

export function checkOrg(res, route) {
  const ok = check(res, {
    [`${route}: status 2xx/3xx`]: (r) => r.status >= 200 && r.status < 400,
    [`${route}: body ok`]: (r) => r.body === null || r.body.length > 0,
  })
  rates.okOrg.add(ok)
  if (res.status === 429) counters.rateLimited.add(1)
  if (res.status >= 500) counters.serverError.add(1)
  if (res.status >= 300 && res.status < 400) counters.redirect.add(1)
  return ok
}

// Pass-criteria thresholds consumed by profile `options.thresholds`.
// Numbers come from docs/hardening/phase2/scope.md and are revisited
// only via PR review of the scope doc.
export const THRESHOLDS = {
  browse: {
    'http_req_duration{group:::browse}': ['p(95)<800'],
    'ok_browse': ['rate>0.995'],
  },
  checkout: {
    'http_req_duration{group:::checkout-reserve}': ['p(95)<1500'],
    'http_req_duration{group:::checkout-confirm}': ['p(95)<2000'],
    'ok_checkout': ['rate>0.99'],
  },
  org: {
    'http_req_duration{group:::organiser}': ['p(95)<2000'],
    'ok_org': ['rate>0.999'],
  },
}
