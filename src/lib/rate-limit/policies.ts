// Central rate-limit policy table. Each policy is keyed by a stable
// short name and consumed by the withRateLimit middleware. Policies
// live here, not next to each route, so launch-day abuse review can
// audit the full surface in one place and cap-tune in one PR.
//
// The numbers below are conservative defaults sized for the v1 launch
// traffic estimate (10k organisers, ~100k attendees, peak ~1k req/s
// total inbound). Tighten or loosen via PR; do not hardcode local
// overrides at call sites.

export type PolicyName =
  | 'health-redis'
  | 'health-sentry-error'
  | 'location-set'
  | 'cron-job'
  | 'payouts-read'
  | 'payouts-stripe-link'
  | 'auth-signup'
  | 'auth-login'
  | 'checkout-reserve'

export type Policy = {
  /** Stable prefix used to namespace the redis key. Keep short. */
  keyPrefix: string
  /** Max requests per IP per window. */
  limit: number
  /** Window size in seconds. */
  windowSec: number
  /** Human-readable description of why this number, for cap-review audits. */
  rationale: string
  /**
   * Abuse-sensitive paths (auth, checkout) set this so a MISSING Upstash config
   * blocks in production rather than failing open. Transient Redis errors still
   * fail open. Omitted (falsey) elsewhere, where fail-open is acceptable.
   */
  failClosed?: boolean
}

export const POLICIES: Record<PolicyName, Policy> = {
  'health-redis': {
    keyPrefix: 'h-redis',
    limit: 60,
    windowSec: 60,
    rationale:
      'Health endpoint. 1 req/s per IP is plenty for monitoring agents; higher rates indicate scraping.',
  },
  'health-sentry-error': {
    keyPrefix: 'h-sentry',
    limit: 5,
    windowSec: 60,
    rationale:
      'Synthetic error endpoint. Each successful call generates a Sentry event; cap aggressively to avoid quota burn even if HEALTH_CHECK_TOKEN leaks.',
  },
  'location-set': {
    keyPrefix: 'loc-set',
    limit: 10,
    windowSec: 60,
    rationale:
      'User-driven location preference write. 10/min is generous for a UI; abuse vectors are scraping for geolocation inference.',
  },
  'cron-job': {
    keyPrefix: 'cron',
    limit: 12,
    windowSec: 60,
    rationale:
      'Vercel Cron tickles each cron route every 5 min at most. 12/min lets manual founder triggers through while bouncing replay attacks if CRON_SECRET ever leaks.',
  },
  'payouts-read': {
    keyPrefix: 'pay-r',
    limit: 60,
    windowSec: 60,
    rationale:
      'Organiser dashboard list/summary reads. 60/min per user covers tab switching, polling refreshes, and chart redraws while bouncing scrapers.',
  },
  'payouts-stripe-link': {
    keyPrefix: 'pay-l',
    limit: 6,
    windowSec: 60,
    rationale:
      'Stripe Express dashboard login-link mint. Short-lived single-use links, low legitimate cadence (one click per minute is generous), tight cap to avoid burning Stripe quota or leaking link tokens at scale.',
  },
  'auth-signup': {
    keyPrefix: 'auth-signup',
    limit: 5,
    windowSec: 600,
    failClosed: true,
    rationale:
      'Server-side signup endpoint that drives Resend SMTP. 5 attempts per IP per 10 min covers a legitimate user retrying twice with typos while bouncing scripted account-creation abuse and email-bombing relays. Far tighter than Supabase default SMTP cap (4/hr) was, but applied at the network edge so legitimate single-user signups never hit the floor.',
  },
  'auth-login': {
    keyPrefix: 'auth-login',
    limit: 10,
    windowSec: 600,
    failClosed: true,
    rationale:
      'Login attempts per IP per 10 min. 10 covers a user mistyping a few times across sessions while bouncing credential-stuffing / brute-force runs through the app login form. Supabase GoTrue retains its own limit underneath.',
  },
  'checkout-reserve': {
    keyPrefix: 'co-res',
    limit: 20,
    windowSec: 60,
    failClosed: true,
    rationale:
      'Reservation + checkout + squad payment-intent creation per IP per minute. 20 covers a buyer reserving several tiers and retrying a card while bouncing inventory-hold abuse and card-testing (each attempt can mint a Stripe PaymentIntent). Fail-closed: a missing Upstash config must not leave the money path unthrottled in production.',
  },
}
