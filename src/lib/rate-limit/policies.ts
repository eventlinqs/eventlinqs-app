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
  | 'auth-recover'
  | 'auth-magic-link'
  | 'auth-resend-verification'
  | 'checkout-reserve'
  | 'media-upload'
  | 'share-link-mint'
  | 'share-track'
  | 'waitlist-join'
  | 'newsletter-subscribe'
  | 'ai-chat'
  | 'ai-chat-daily'
  | 'gig-post'
  | 'gig-apply'
  | 'booking-request'
  | 'marketplace-report'
  | 'launch-compose'
  | 'launch-compose-daily'
  | 'launch-artefact'
  | 'launch-email'

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
  'auth-recover': {
    keyPrefix: 'auth-rec',
    limit: 5,
    windowSec: 900,
    failClosed: true,
    rationale:
      'Password reset requests per IP per 15 min. Reset now drives OUR Resend transport rather than Supabase built-in SMTP, so the old 2-per-hour project-wide ceiling no longer throttles abuse for us: this policy is the ceiling. 5 covers a user retrying with a typo and re-requesting after a slow inbox, while bouncing reset-bombing of a known address.',
  },
  'auth-magic-link': {
    keyPrefix: 'auth-magic',
    limit: 5,
    windowSec: 900,
    failClosed: true,
    rationale:
      'Magic-link requests per IP per 15 min. Same transport and same abuse shape as auth-recover (email-bombing a known address), so the same cap. Deliberately separate from auth-login, which gates password attempts and needs a looser limit for typo retries.',
  },
  'auth-resend-verification': {
    keyPrefix: 'auth-resend',
    limit: 5,
    windowSec: 900,
    failClosed: true,
    rationale:
      'Verification resends per IP per 15 min. The button already enforces a 60-second client-side cooldown; this is the server-side floor that a scripted caller cannot skip, sized to match the other two mail-sending auth endpoints.',
  },
  'checkout-reserve': {
    keyPrefix: 'co-res',
    limit: 20,
    windowSec: 60,
    failClosed: true,
    rationale:
      'Reservation + checkout + squad payment-intent creation per IP per minute. 20 covers a buyer reserving several tiers and retrying a card while bouncing inventory-hold abuse and card-testing (each attempt can mint a Stripe PaymentIntent). Fail-closed: a missing Upstash config must not leave the money path unthrottled in production.',
  },
  'media-upload': {
    keyPrefix: 'media-up',
    limit: 60,
    windowSec: 60,
    rationale:
      'Organiser event-image uploads, keyed per user. 60/min covers filling the full 10-image gallery plus retries and re-crops in one sitting, while bouncing a scripted storage-flooding run. Fail-open (no money path); a Redis blip never blocks a legitimate organiser mid-upload.',
  },
  'share-link-mint': {
    keyPrefix: 'share-mint',
    limit: 30,
    windowSec: 60,
    rationale:
      'Broadcast share-link minting per IP. One call returns every channel link for a page, so 30/min covers heavy browsing while bouncing a scripted row-flooding run. Fail-open (no money path); a Redis blip degrades to the untracked long URL, never a broken share.',
  },
  'share-track': {
    keyPrefix: 'share-trk',
    limit: 60,
    windowSec: 60,
    rationale:
      'Broadcast view beacon per IP. Views are deduped per link per visitor per day server-side, so this cap only bounds junk traffic. Fail-open; losing a view beacon never breaks a page.',
  },
  'newsletter-subscribe': {
    keyPrefix: 'nl-sub',
    limit: 5,
    windowSec: 600,
    rationale:
      'City newsletter capture per IP per 10 min. It is public, unauthenticated and now writes a consent row, so it is an email-harvesting and list-poisoning target. Five covers a household signing up for two or three cities; a scripted flood is bounced. Fail-open: losing a legitimate signup to a Redis blip is worse than the bounded abuse, and the row carries its own unsubscribe token either way.',
  },
  'waitlist-join': {
    keyPrefix: 'wl-join',
    limit: 5,
    windowSec: 600,
    rationale:
      'City waitlist join per IP per 10 min. A household joining two or three city lists fits comfortably; scripted signup floods (fake demand signal, email harvesting probes) are bounced. Fail-open: the confirmation email is best-effort, so abuse cost is bounded.',
  },
  'ai-chat': {
    keyPrefix: 'ai-c',
    limit: 10,
    windowSec: 60,
    failClosed: true,
    rationale:
      'AI assistant turns per user (or IP for guests) per minute. A human conversation runs 1 to 4 turns a minute; 10 leaves headroom for quick back-and-forth while bouncing scripted abuse. Fail-closed: every allowed turn spends real Anthropic tokens, so a missing Upstash config must not leave the AI spend path unthrottled in production.',
  },
  'ai-chat-daily': {
    keyPrefix: 'ai-d',
    limit: 120,
    windowSec: 86400,
    failClosed: true,
    rationale:
      'Daily AI assistant cap per user (or IP for guests). 120 turns a day is far beyond any legitimate support or onboarding session and caps the worst-case daily spend a single abuser can inflict, alongside the platform-wide monthly cost guard.',
  },
  'gig-post': {
    keyPrefix: 'gig-p',
    limit: 10,
    windowSec: 86400,
    failClosed: true,
    rationale:
      'Gig postings per organiser per day. Ten real gigs a day is beyond any venue booker; higher rates are listing spam. Keyed by user id.',
  },
  'gig-apply': {
    keyPrefix: 'gig-a',
    limit: 5,
    windowSec: 600,
    failClosed: true,
    rationale:
      'Gig applications per performer per ten minutes. A considered application takes minutes to write; five per window stops spray-applying while never blocking a genuine performer. Keyed by user id.',
  },
  'booking-request': {
    keyPrefix: 'bkg-r',
    limit: 10,
    windowSec: 3600,
    failClosed: true,
    rationale:
      'Structured booking and mentoring requests per sender per hour. The pending-pair unique index already stops duplicates; this caps cross-target spraying. Keyed by user id.',
  },
  'marketplace-report': {
    keyPrefix: 'mkt-rep',
    limit: 10,
    windowSec: 86400,
    rationale:
      'Abuse reports per user per day. Enough for genuine moderation help, low enough to stop report-bombing a performer or organiser.',
  },
  'launch-compose': {
    keyPrefix: 'lnch-c',
    limit: 20,
    windowSec: 3600,
    rationale:
      'Anonymous composer draft builds per IP per hour. The compose path is DETERMINISTIC and spends no model tokens (founder ruling 9 Aug 2026), so this caps database writes and render CPU, not an API bill. Twenty covers an organiser rewriting their description repeatedly while bouncing a scripted flood. Deliberately fail-OPEN: a Redis blip must never stop a stranger building a kit, because there is no spend to protect and the whole point of the surface is that it always works.',
  },
  'launch-compose-daily': {
    keyPrefix: 'lnch-cd',
    limit: 60,
    windowSec: 86400,
    rationale:
      'Daily anonymous composer builds per IP. Bounds a slow-drip flood that stays under the hourly cap. Sixty is far beyond any real organiser and still generous for a shared office or a carrier NAT range, which is the case a tighter number would break. Fail-open for the same reason as the hourly.',
  },
  'launch-artefact': {
    keyPrefix: 'lnch-a',
    limit: 400,
    windowSec: 3600,
    rationale:
      'Anonymous artefact renders (cards and posters) per IP per hour. RAISED FROM 60 on 9 Aug 2026 after the live walk tripped it: the old number was set by counting kits rather than REQUESTS, and one kit view costs four renders (three cards plus the poster), so sixty was only fifteen views an hour. A promoter showing their kit around, an office, or a carrier NAT range hits that in minutes, and Phase 0 named CGNAT as the specific reason a tight per-IP cap breaks real organisers before it troubles an abuser. Four hundred is a hundred kit views an hour, which no honest person reaches and which still bounds a scripted flood. Renders are also browser-cacheable now, so a re-view usually costs zero. This is CPU and sharp memory, never model spend.',
  },
  'launch-email': {
    keyPrefix: 'lnch-e',
    limit: 3,
    windowSec: 3600,
    rationale:
      'Anonymous "send this kit to myself" per IP per hour. THE ONLY FAIL-CLOSED POLICY ON THIS SURFACE, and deliberately unlike its neighbours: every other launch action is local computation with no marginal cost, while this one sends real mail from our verified domain. The cost of getting it wrong is not a bill, it is deliverability, and a sending domain burned by an open relay cannot be un-burned by a rate limit added later. Three is enough to fix a typo twice and useless as a spam vector. The action also requires an owned draft, so a sender must first compose a kit.',
    failClosed: true,
  },
}
