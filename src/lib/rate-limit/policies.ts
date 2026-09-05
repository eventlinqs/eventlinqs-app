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
  | 'cron-job'
  | 'payouts-read'
  | 'payouts-stripe-link'
  | 'auth-signup'
  | 'auth-login'
  | 'auth-recover'
  | 'auth-magic-link'
  | 'auth-resend-verification'
  | 'event-create'
  | 'checkout-reserve'
  | 'refund-request'
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
  | 'launch-upload'
  | 'stream-message'

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
  'cron-job': {
    keyPrefix: 'cron',
    limit: 12,
    windowSec: 60,
    rationale:
      'Vercel Cron tickles each cron route every 5 min at most. 12/min lets manual founder triggers through while bouncing replay attacks if CRON_SECRET ever leaks. STAYS FAIL-OPEN, ruled 2026-08-19 alongside the waitlist-join reversal. It does send real mail (the connect-divergence founder alert, src/app/api/cron/connect-divergence/route.ts), which is why it was reviewed at all, but two things that are not the limiter bound it: CRON_SECRET gates the route, and the alert only sends when divergence is actually found. Fail-closed here would mean a missing Upstash config silently stops the cron fleet, which is a worse failure than the one it would prevent.',
  },
  'payouts-read': {
    keyPrefix: 'pay-r',
    limit: 60,
    windowSec: 60,
    rationale:
      'Organiser dashboard list/summary reads, 60/min PER ORGANISATION. 60 covers tab switching, polling refreshes and chart redraws while bouncing scrapers. KEYED BY organisationId, passed explicitly, which is why the limiter sits AFTER resolveOrganiserScope on all three routes rather than at the top: the bucket cannot be named until the scope names it. It was keyed by the forwarded IP until 2026-08-19 while this line said "per user", the CGNAT bucket this platform has met twice before (launch-artefact, launch-compose-daily), where a shared office or carrier NAT put every organiser behind it into one window of sixty. Founder ruling 2026-08-19 re-keyed it to the organiser. TWO CONSEQUENCES OF THE MOVE, recorded rather than left to be found: an unauthenticated caller is refused as unauthenticated and is no longer throttled by this policy, which costs nothing because the 401 is decided from the cookie with no database read; and an owner of N businesses now has N windows rather than one, which is correct for the legitimate case (three businesses in three tabs genuinely make three times the reads) and is bounded by the fact that every window still only serves that owner their own data. Fail-open: a read path with no metered spend, verified by scripts/verify/rate-limit-audit.mjs section 3b. Parity proven by scripts/verify/payouts-read-parity.mjs.',
  },
  'payouts-stripe-link': {
    keyPrefix: 'pay-l',
    limit: 6,
    windowSec: 60,
    rationale:
      'Stripe Express dashboard login-link mint. Short-lived single-use links, low legitimate cadence (one click per minute is generous), tight cap to avoid burning Stripe quota or leaking link tokens at scale. STAYS FAIL-OPEN, ruled 2026-08-19 alongside the waitlist-join reversal. It mints a real Stripe login-link token against a metered API, but the route resolves the organiser scope first, so an anonymous caller is refused as unauthenticated before the mint and never reaches the spend: the ownership scope is the bound, not this limit. Fail-closed would lock a legitimate organiser out of their own Stripe dashboard on a Redis blip.',
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
  'event-create': {
    keyPrefix: 'ev-new',
    limit: 30,
    windowSec: 3600,
    failClosed: true,
    rationale:
      'Event creation per organiser per hour, KEYED BY user id (passed explicitly at the call site; actionRateLimit defaults to IP and the first version of this policy shipped with that default, so the sentence "per organiser" was untrue for a day). It had NO limiter at all until 2026-08-19, found by scripts/verify/rate-limit-audit.mjs. The ceiling was one free account creating events in a loop, and each one writes an events row, its ticket_tiers, and the share_links the acquisition loop mints, so the cost is database rows and storage rather than an API bill. Thirty an hour is far above any real organiser (a busy promoter announcing a season does a handful) and still bounds a script. Fail-closed because it is a WRITE on the organiser side and a deploy missing UPSTASH_* should not leave an unbounded write open; an organiser blocked for a minute can retry, and unlike the anonymous composer there is no first-time visitor to protect.',
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
      'Organiser event-image uploads, keyed per user. 60/min covers filling the full 10-image gallery plus retries and re-crops in one sitting, while bouncing a scripted storage-flooding run. STAYS FAIL-OPEN, ruled 2026-08-19 alongside the waitlist-join reversal, and the reason is the thing that is NOT the limiter: every call site requires a signed-in user (src/lib/upload.ts, src/lib/organisation/logo.ts, src/app/actions/section-view-photo.ts), so a missing Upstash config cannot open this to an anonymous caller, which is the only case a fail-closed posture defends against. It does spend metered Supabase Storage bytes, so the spend is real, but it is bounded by the session rather than by this limit. A Redis blip never blocks a legitimate organiser mid-upload.',
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
    failClosed: true,
    rationale:
      'City waitlist join per IP per 10 min. A household joining two or three city lists fits comfortably; scripted signup floods (fake demand signal, email harvesting probes) are bounced. FAIL-CLOSED as of 2026-08-19 (founder ruling), taking the posture of launch-email rather than of its neighbours, because it does the same thing launch-email does: it sends real mail from our verified sending domain, through sendEmail at src/app/waitlist/actions.ts. It was fail-open, and its old rationale said "the confirmation email is best-effort, so abuse cost is bounded", which prices the email as a MESSAGE. That is the wrong unit. launch-email prices the same send as the DOMAIN and refuses to be fail-open for it: "the cost of getting it wrong is not a bill, it is deliverability, and a sending domain burned by an open relay cannot be un-burned by a rate limit added later." Two policies sending from one domain cannot hold opposite postures; one of them was wrong and it was this one. This surface is PUBLIC and unauthenticated, so the limiter is the only thing in front of the send, unlike media-upload (needs a session), cron-job (needs CRON_SECRET) or payouts-stripe-link (organiser-scoped), all three of which stay fail-open because something other than the limiter bounds them.',
  },
  'refund-request': {
    keyPrefix: 'ref-req',
    limit: 5,
    windowSec: 3600,
    rationale:
      'Buyer refund requests, 5 per hour, KEYED BY user id where there is one and by the forwarded address only for a guest checkout (passed explicitly at the call site; actionRateLimit defaults to the address and that default is the wrong bucket here). A real buyer submits ONE request per order and the surface refuses a second while one is open, so five an hour is already far above the honest ceiling; what it bounces is a script hammering the endpoint to enumerate order ids or to spam an organiser inbox, because every submitted request sends the organiser an email. Keyed by the user rather than the address because a household or a share house behind one address must not share a refund budget: that is the CGNAT bucket this platform has met twice (launch-artefact, launch-compose-daily), and being unable to ask for your money back is a far worse failure than being unable to compose a launch kit. Fail-OPEN: the limiter is not the only thing in front of this. The action refuses anyone who does not own the order, the unique partial index refuses a second open request per order, and the refund itself is bounded by the event policy and the funds check. A missing Upstash config therefore cannot open a spend path here, and refusing a legitimate refund request during a Redis blip would be the worse outcome.',
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
    limit: 250,
    windowSec: 86400,
    rationale:
      'Daily anonymous composer builds per IP. RAISED FROM 60 on 9 Aug 2026. The old rationale claimed sixty was "generous for a shared office or a carrier NAT range"; that was reasoning about one PERSON, not one address, and it is wrong for exactly the case it named. An Australian carrier NAT range fronts thousands of phones, so sixty a day across all of them is a handful each. It was reached in a single afternoon of verification from ONE machine, which is the cheapest possible demonstration that it would break a real shared address. The per-session cap (40 per browser per day) is what actually bounds an individual now, which is what lets this be sized for the address rather than the person. Fail-open for the same reason as the hourly.',
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
  'launch-upload': {
    keyPrefix: 'lnch-u',
    limit: 10,
    windowSec: 3600,
    rationale:
      'Anonymous cover artwork uploads per IP per hour. FAIL-CLOSED, taking the posture of launch-email rather than of its compose neighbours, because this is the SECOND action on this surface that costs real money: it writes bytes we then store and serve, and unlike a render it does not evaporate when the response ends. A Redis blip must not become an open write endpoint on our own storage domain. Ten is generous for the real behaviour, which is uploading one photo and possibly replacing it a few times after seeing it on the poster, and it is useless for filling a bucket. It is bounded further by three things a limit cannot express: the caller must already own a draft (so a cookie and a composed kit come first), the object path is the draft code so one draft can only ever hold ONE object no matter how often it is replaced, and every accepted byte is re-encoded rather than stored as supplied.',
    failClosed: true,
  },
  'stream-message': {
    keyPrefix: 'strm-m',
    limit: 20,
    windowSec: 60,
    rationale:
      'Livestream room posts (chat, questions, reactions) on /api/stream/[code]/messages, 20 per minute PER TICKET. KEYED BY the ticket id, passed explicitly, never the IP: a household watching one stream on one connection holds several tickets and must not share a bucket, and this platform has met the carrier-NAT bucket twice before (launch-artefact, launch-compose-daily). The bucket cannot be named until the bearer gate has resolved the ticket, so the limiter sits AFTER resolveStreamAccess, and a stranger with the wrong secret is refused as not found before ever reaching it. Twenty a minute is a fast typist in a busy room and is useless for flooding it: the organiser can hide any message, and every row is bounded to 500 characters by the schema. FAIL-OPEN: the write is a 500 character row in our own database, the same posture as share-track and newsletter-subscribe. The audit (scripts/verify/rate-limit-audit.mjs) will note a Sentry capture behind this route; it fires only on a database error, never per request, so volume cannot reach it.',
  },
}
