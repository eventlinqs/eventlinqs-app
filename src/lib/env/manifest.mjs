/**
 * LOCK 1: THE ENVIRONMENT MANIFEST. The single source of truth for every
 * environment variable this platform's code requires, and for the scope,
 * sensitivity, branch policy and value shape each one must have.
 *
 * WHY THIS EXISTS. A document that records the truth about environment
 * configuration goes stale the moment somebody edits a dashboard. Every
 * environment failure this repo has suffered was invisible to the pipeline:
 *
 *   - an EMPTY NEXT_PUBLIC_GOOGLE_MAPS_API_KEY, so every map silently rendered
 *     its fallback with no error anywhere;
 *   - a Preview scope carrying a PRODUCTION service-role key, so preview code
 *     could read and write the live database past row level security;
 *   - a publishable key from one Stripe account beside a secret key from
 *     ANOTHER, so the payment element rendered nothing, with no console error
 *     and no network error;
 *   - production holding a LIVE webhook signing secret while running sk_test_,
 *     so checkout took card details and settled nothing;
 *   - CRON_SECRET present in Vercel and ABSENT from GitHub Actions, so the
 *     post-deploy smoke gate skipped its sentinel probes on every run from
 *     2026-07-12 to 2026-07-30 and nobody noticed.
 *
 * Not one of those is a missing variable. They are variables that are PRESENT
 * and WRONG: wrong scope, wrong shape, wrong store, or right in one place and
 * absent in another. Presence checks pass and nothing errors. So this manifest
 * declares the full contract, and the four locks that read it turn each of those
 * failures into something loud:
 *
 *   LOCK 2  scripts/check-public-env.mjs      fails the production BUILD
 *   LOCK 3  scripts/check-env-stores.mjs      fails on cross-store disagreement
 *   LOCK 4  src/lib/health/checks.ts          alerts the founder at RUNTIME
 *
 * THE MANIFEST IS THE AUTHORITY. Every check reads this file. No check hardcodes
 * a variable name. Adding a variable here is the whole change; the guards pick
 * it up with no edit.
 *
 * Plain .mjs so the pre-build node script, the standalone store checker and the
 * TypeScript runtime all import the exact same declarations with zero drift.
 * This is the same shape as `src/lib/health/critical-env.mjs`, which this file
 * generalises, and `src/lib/health/pricing-lock.mjs`.
 *
 * NEVER PRINTS A VALUE. Shapes are declared as regex SOURCE strings so a
 * generated document can show the rule without ever showing a secret. Every
 * evaluator built on this manifest reports presence, scope, length and an
 * 8-character fingerprint, never key material.
 */

/** The Vercel deployment scopes a variable can be attached to. */
export const SCOPES = ['production', 'preview', 'development']

/**
 * The PRODUCTION Supabase project ref. Re-exported from the leaf module so
 * there is one literal in the repository, not two.
 */
export { PRODUCTION_SUPABASE_REF } from './refs.mjs'

/**
 * Shape vocabulary. Declared once and referenced by name so two variables that
 * must look the same cannot drift apart, and so the generated handover document
 * can print a human sentence beside each regex.
 *
 * `pattern` is a regex SOURCE string, not a RegExp, so it survives JSON and can
 * be rendered into docs/verification/ENV-STATE.md verbatim.
 */
export const SHAPES = {
  supabaseUrl: {
    pattern: '^https://[a-z0-9]{15,}\\.supabase\\.co/?$',
    minLength: 30,
    describe: 'https://<project-ref>.supabase.co',
  },
  supabaseAnonKey: {
    pattern: '^(eyJ[A-Za-z0-9_.-]{20,}|sb_publishable_[A-Za-z0-9_-]{20,})$',
    minLength: 40,
    describe: 'a legacy eyJ JWT or an sb_publishable_ key',
  },
  supabaseServiceKey: {
    pattern: '^(eyJ[A-Za-z0-9_.-]{20,}|sb_secret_[A-Za-z0-9_-]{20,})$',
    minLength: 40,
    describe: 'a legacy eyJ JWT or an sb_secret_ key',
  },
  stripePublishableAny: {
    pattern: '^pk_(test|live)_[A-Za-z0-9]{20,}$',
    minLength: 40,
    describe: 'pk_test_ or pk_live_ followed by the key body',
  },
  stripePublishableLive: {
    pattern: '^pk_live_51[A-Za-z0-9]{15}[A-Za-z0-9]{10,}$',
    minLength: 40,
    describe: 'pk_live_51 followed by the 15-character account id and the key body',
  },
  stripeSecretAny: {
    pattern: '^(sk|rk)_(test|live)_[A-Za-z0-9]{20,}$',
    minLength: 40,
    describe: 'sk_ or rk_, test or live, followed by the key body',
  },
  stripeSecretLive: {
    pattern: '^(sk|rk)_live_51[A-Za-z0-9]{15}[A-Za-z0-9]{10,}$',
    minLength: 40,
    describe: '(sk|rk)_live_51 followed by the 15-character account id and the key body',
  },
  stripeWebhookSecret: {
    pattern: '^whsec_[A-Za-z0-9]{20,}$',
    minLength: 26,
    describe: 'whsec_ followed by the signing secret body',
    // Applied per comma-separated entry: Stripe mints one signing secret per
    // endpoint and this platform runs two.
    listSeparator: ',',
  },
  resendKey: {
    pattern: '^re_[A-Za-z0-9_-]{16,}$',
    minLength: 20,
    describe: 're_ followed by the Resend key body',
  },
  anthropicKey: {
    pattern: '^sk-ant-[A-Za-z0-9_-]{20,}$',
    minLength: 30,
    describe: 'sk-ant- followed by the Anthropic key body',
  },
  googleApiKey: {
    pattern: '^AIza[0-9A-Za-z_-]{30,}$',
    minLength: 35,
    describe: 'AIza followed by the Google API key body (about 39 characters)',
  },
  upstashUrl: {
    pattern: '^https://[a-z0-9-]+\\.upstash\\.io/?$',
    minLength: 20,
    describe: 'https://<instance>.upstash.io',
  },
  strongSecret32: {
    pattern: '^\\S{32,}$',
    minLength: 32,
    describe: 'a single-token secret of at least 32 characters',
  },
  vapidPublicKey: {
    pattern: '^[A-Za-z0-9_-]{80,}$',
    minLength: 80,
    describe: 'a base64url VAPID public key (87 characters)',
  },
  vapidPrivateKey: {
    pattern: '^[A-Za-z0-9_-]{40,}$',
    minLength: 40,
    describe: 'a base64url VAPID private key',
  },
  mailtoOrHttps: {
    pattern: '^(mailto:[^\\s@]+@[^\\s@]+|https://\\S+)$',
    minLength: 8,
    describe: 'a mailto: address or an https URL',
  },
  /**
   * The sender address. The domain is pinned to the apex `eventlinqs.com`
   * because that is the ONLY domain the code's own hardcoded senders use
   * (`DEFAULT_FROM` and `TRANSACTIONAL_FROM` in src/lib/email/send.ts) and the
   * only one verified at Resend. Production once pointed EMAIL_FROM at the
   * unverified `send.eventlinqs.com`, so every send through `sendEmail` threw
   * "domain is not verified" - including the sentinel's own alert email, which
   * is precisely how a detected fault stayed silent. Pinning the shape here
   * makes that drift a build failure instead of an unnoticed outage.
   */
  eventlinqsSender: {
    pattern: '^([^<]*<\\s*)?[^@\\s<>]+@eventlinqs\\.com\\s*>?$',
    minLength: 12,
    describe: 'an address at eventlinqs.com, the apex domain verified at Resend, optionally with a display name',
  },
  brandedHttpsOrigin: {
    pattern: '^https://([a-z0-9-]+\\.)*eventlinqs\\.com(\\.au)?/?$',
    minLength: 20,
    describe: 'an https origin on an eventlinqs.com or eventlinqs.com.au host',
  },
  /**
   * The same origin OFF production, where `http://localhost:3000` is the
   * documented local value (src/lib/site-url.ts getAppUrl). Pinning the branded
   * form on every scope would fail a correct developer machine, and a guard that
   * fires on correct configuration teaches people to ignore it.
   */
  originOrLocalhost: {
    pattern: '^(https://([a-z0-9-]+\\.)*eventlinqs\\.com(\\.au)?|https?://localhost(:\\d{2,5})?|https://[a-z0-9-]+\\.vercel\\.app)/?$',
    minLength: 10,
    describe: 'a branded eventlinqs origin, a vercel.app deployment origin, or http://localhost',
  },
  httpsUrl: {
    pattern: '^https://\\S+$',
    minLength: 12,
    describe: 'an https URL',
  },
  hostname: {
    pattern: '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$',
    minLength: 4,
    describe: 'a bare hostname, no scheme and no path',
  },
  shortSlug: {
    pattern: '^[A-Za-z0-9][A-Za-z0-9 _.-]{0,60}$',
    minLength: 1,
    describe: 'a short identifier',
  },
  anyNonEmpty: {
    pattern: '^\\S(.*\\S)?$',
    minLength: 1,
    describe: 'any non-empty value with no leading or trailing whitespace',
  },
}

/**
 * ONE MANIFEST ENTRY, field by field.
 *
 * @typedef {object} ManifestEntry
 * @property {string}   name          the exact variable name
 * @property {string}   describe      what it does, in one line
 * @property {string[]} requiredOn    scopes it MUST be set on
 * @property {string[]} forbiddenOn   scopes it must NOT be set on
 * @property {string[]} [optionalOn]  scopes where it is allowed but not required
 * @property {boolean}  mustBeSensitive  true when it must NOT be readable back
 * @property {'forbidden'|'allowed'} previewBranchScoping
 *                                    'forbidden' when every preview needs it, so
 *                                    pinning it to one git branch starves the rest
 * @property {object}   shape         a SHAPES entry, the default for every scope
 * @property {Record<string, object>} [scopeShape]
 *                                    a stricter shape for one scope (production
 *                                    must be LIVE where a preview may be test)
 * @property {boolean}  paymentCritical  true when production cannot take a real
 *                                    payment, or cannot complete one, without it
 * @property {boolean}  githubActions true when it must ALSO exist as a GitHub
 *                                    Actions repository secret
 * @property {boolean}  publicVar     true when it is baked into the browser
 *                                    bundle at build time (so it is not a secret
 *                                    and a change needs a REBUILD, not a restart)
 */

/** @type {ManifestEntry[]} */
export const ENV_MANIFEST = [
  // ── Database: the platform cannot serve a page or hold an order without these ──
  {
    name: 'NEXT_PUBLIC_SUPABASE_URL',
    describe: 'Supabase project URL read by the browser client',
    requiredOn: ['production', 'preview', 'development'],
    forbiddenOn: [],
    mustBeSensitive: false,
    previewBranchScoping: 'forbidden',
    shape: SHAPES.supabaseUrl,
    paymentCritical: true,
    githubActions: false,
    publicVar: true,
  },
  {
    name: 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    describe: 'Supabase anon key read by the browser client',
    requiredOn: ['production', 'preview', 'development'],
    forbiddenOn: [],
    mustBeSensitive: false,
    previewBranchScoping: 'forbidden',
    shape: SHAPES.supabaseAnonKey,
    paymentCritical: true,
    githubActions: false,
    publicVar: true,
  },
  {
    name: 'SUPABASE_SERVICE_ROLE_KEY',
    describe: 'Supabase service-role key: bypasses row level security',
    requiredOn: ['production', 'preview', 'development'],
    forbiddenOn: [],
    // The single highest-value secret the platform holds. Anyone who can read it
    // back can read and write every row in the live database.
    mustBeSensitive: true,
    previewBranchScoping: 'forbidden',
    shape: SHAPES.supabaseServiceKey,
    paymentCritical: true,
    githubActions: false,
    publicVar: false,
  },

  // ── The PREVIEW overrides. Present so a preview deployment resolves the TEST
  // project even when the base variables still point at production. FORBIDDEN on
  // production for the mirror-image reason: a production deployment that
  // resolved a *_PREVIEW override would silently serve live traffic from the
  // TEST database, and every order would be written where no one is looking.
  {
    name: 'NEXT_PUBLIC_SUPABASE_URL_PREVIEW',
    describe: 'Preview override steering non-production deployments at the TEST project',
    requiredOn: ['preview'],
    forbiddenOn: ['production'],
    mustBeSensitive: false,
    previewBranchScoping: 'forbidden',
    shape: SHAPES.supabaseUrl,
    paymentCritical: false,
    githubActions: false,
    publicVar: true,
  },
  {
    name: 'NEXT_PUBLIC_SUPABASE_ANON_KEY_PREVIEW',
    describe: 'Preview override for the anon key',
    requiredOn: ['preview'],
    forbiddenOn: ['production'],
    mustBeSensitive: false,
    previewBranchScoping: 'forbidden',
    shape: SHAPES.supabaseAnonKey,
    paymentCritical: false,
    githubActions: false,
    publicVar: true,
  },
  {
    name: 'SUPABASE_SERVICE_ROLE_KEY_PREVIEW',
    describe: 'Preview override for the service-role key',
    requiredOn: ['preview'],
    forbiddenOn: ['production'],
    mustBeSensitive: true,
    previewBranchScoping: 'forbidden',
    shape: SHAPES.supabaseServiceKey,
    paymentCritical: false,
    githubActions: false,
    publicVar: false,
  },

  // ── Stripe: the money path ────────────────────────────────────────────────
  {
    name: 'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY',
    describe: 'Stripe publishable key that mounts the payment element',
    requiredOn: ['production', 'preview'],
    forbiddenOn: [],
    optionalOn: ['development'],
    mustBeSensitive: false,
    previewBranchScoping: 'forbidden',
    shape: SHAPES.stripePublishableAny,
    // Production must be LIVE. A test-mode publishable key on production takes
    // card details and settles nothing.
    scopeShape: { production: SHAPES.stripePublishableLive },
    paymentCritical: true,
    githubActions: false,
    publicVar: true,
  },
  {
    name: 'STRIPE_SECRET_KEY',
    describe: 'Stripe secret key: creates payment intents, transfers and refunds',
    requiredOn: ['production', 'preview'],
    forbiddenOn: [],
    optionalOn: ['development'],
    mustBeSensitive: true,
    previewBranchScoping: 'forbidden',
    shape: SHAPES.stripeSecretAny,
    scopeShape: { production: SHAPES.stripeSecretLive },
    paymentCritical: true,
    githubActions: false,
    publicVar: false,
  },
  {
    name: 'STRIPE_WEBHOOK_SECRETS',
    describe: 'Comma-separated webhook signing secrets, ONE PER STRIPE ENDPOINT',
    // Stripe mints a different signing secret per endpoint and this platform
    // runs two at the same URL: the account endpoint (payment_intent, charge,
    // checkout.session, transfer) and the connected-accounts endpoint
    // (account.*, payout.*, charge.dispute.*). With only the singular
    // STRIPE_WEBHOOK_SECRET set, every delivery from the second endpoint fails
    // signature verification and 400s forever while payments keep succeeding.
    requiredOn: ['production', 'preview'],
    forbiddenOn: [],
    mustBeSensitive: true,
    previewBranchScoping: 'forbidden',
    shape: SHAPES.stripeWebhookSecret,
    paymentCritical: true,
    githubActions: false,
    publicVar: false,
  },
  {
    name: 'STRIPE_WEBHOOK_SECRET',
    describe: 'Legacy single webhook signing secret, appended after the plural list',
    // Deliberately not required: resolveWebhookSecrets() in
    // src/lib/payments/stripe-adapter.ts reads the plural FIRST and appends this
    // one, deduplicated, so it is a compatibility path and a safe rotation
    // holding slot. It must still be well-formed wherever it exists.
    requiredOn: [],
    forbiddenOn: [],
    optionalOn: ['production', 'preview', 'development'],
    mustBeSensitive: true,
    previewBranchScoping: 'allowed',
    shape: SHAPES.stripeWebhookSecret,
    paymentCritical: false,
    githubActions: false,
    publicVar: false,
  },

  // ── Scheduled work and queue integrity ────────────────────────────────────
  {
    name: 'CRON_SECRET',
    describe: 'Bearer secret every cron and sentinel route requires, FAIL CLOSED',
    // requireCronAuth() refuses to run when this is unset, so an absent secret
    // silently disables the reservation expiry, the payout holds release, the
    // event disbursement, the payment sentinel and the health sentinel. It must
    // also exist in GitHub Actions, because the post-deploy smoke gate probes
    // both sentinels with it; without it there the gate skipped its probes on
    // every run for eighteen days.
    requiredOn: ['production'],
    forbiddenOn: [],
    optionalOn: ['preview', 'development'],
    mustBeSensitive: true,
    previewBranchScoping: 'allowed',
    shape: SHAPES.strongSecret32,
    paymentCritical: true,
    githubActions: true,
    publicVar: false,
  },
  {
    name: 'QUEUE_SECRET',
    describe: 'Signs queue position and admission tokens',
    // Missing means token issuance and validation fail CLOSED (everyone queues)
    // rather than falling back to a public dev constant that would let anyone
    // mint a token and skip the gate.
    requiredOn: ['production'],
    forbiddenOn: [],
    optionalOn: ['preview', 'development'],
    mustBeSensitive: true,
    previewBranchScoping: 'allowed',
    shape: SHAPES.strongSecret32,
    paymentCritical: false,
    githubActions: false,
    publicVar: false,
  },

  // ── Email: the ticket, and the only way an alert reaches a human ──────────
  {
    name: 'RESEND_API_KEY',
    describe: 'Resend API key: ticket emails, auth mail and every sentinel alert',
    requiredOn: ['production', 'preview'],
    forbiddenOn: [],
    optionalOn: ['development'],
    mustBeSensitive: true,
    previewBranchScoping: 'forbidden',
    shape: SHAPES.resendKey,
    // A buyer who pays and never receives a ticket has not completed a purchase.
    paymentCritical: true,
    githubActions: true,
    publicVar: false,
  },
  {
    name: 'EMAIL_FROM',
    describe: 'Sender address for every send through sendEmail',
    requiredOn: ['production'],
    forbiddenOn: [],
    optionalOn: ['preview', 'development'],
    mustBeSensitive: false,
    previewBranchScoping: 'allowed',
    shape: SHAPES.eventlinqsSender,
    paymentCritical: false,
    githubActions: false,
    publicVar: false,
  },
  {
    name: 'PAYMENT_ALERT_EMAIL',
    describe: 'Where payment and health alerts are delivered',
    requiredOn: [],
    forbiddenOn: [],
    optionalOn: ['production', 'preview', 'development'],
    mustBeSensitive: false,
    previewBranchScoping: 'allowed',
    shape: SHAPES.anyNonEmpty,
    paymentCritical: false,
    githubActions: false,
    publicVar: false,
  },
  {
    name: 'SUPPORT_INBOX_EMAIL',
    describe: 'Inbound support address surfaced in help content',
    requiredOn: [],
    forbiddenOn: [],
    optionalOn: ['production', 'preview', 'development'],
    mustBeSensitive: false,
    previewBranchScoping: 'allowed',
    shape: SHAPES.anyNonEmpty,
    paymentCritical: false,
    githubActions: false,
    publicVar: false,
  },

  // ── Maps: the empty-but-present failure this whole system was built after ──
  {
    name: 'NEXT_PUBLIC_GOOGLE_MAPS_API_KEY',
    describe: 'Google Maps browser key: event, city, venue and grid maps',
    requiredOn: ['production', 'preview'],
    forbiddenOn: [],
    optionalOn: ['development'],
    mustBeSensitive: false,
    previewBranchScoping: 'forbidden',
    shape: SHAPES.googleApiKey,
    paymentCritical: false,
    githubActions: false,
    publicVar: true,
  },
  {
    name: 'GOOGLE_MAPS_API_KEY',
    describe: 'Google Maps server key: geocoding at seed and publish time',
    requiredOn: ['production', 'preview'],
    forbiddenOn: [],
    optionalOn: ['development'],
    mustBeSensitive: false,
    previewBranchScoping: 'forbidden',
    shape: SHAPES.googleApiKey,
    paymentCritical: false,
    githubActions: false,
    publicVar: false,
  },

  // ── Rate limiting and the AI cost guard ───────────────────────────────────
  {
    name: 'UPSTASH_REDIS_REST_URL',
    describe: 'Upstash Redis REST URL: rate limits and the AI monthly budget guard',
    requiredOn: ['production'],
    forbiddenOn: [],
    optionalOn: ['preview', 'development'],
    mustBeSensitive: false,
    previewBranchScoping: 'allowed',
    shape: SHAPES.upstashUrl,
    paymentCritical: false,
    githubActions: false,
    publicVar: false,
  },
  {
    name: 'UPSTASH_REDIS_REST_TOKEN',
    describe: 'Upstash Redis REST token',
    requiredOn: ['production'],
    forbiddenOn: [],
    optionalOn: ['preview', 'development'],
    mustBeSensitive: true,
    previewBranchScoping: 'allowed',
    shape: SHAPES.anyNonEmpty,
    paymentCritical: false,
    githubActions: false,
    publicVar: false,
  },

  // ── Admin 2FA ─────────────────────────────────────────────────────────────
  {
    name: 'ADMIN_TOTP_ENC_KEY',
    describe: 'Encrypts every admin TOTP shared secret at rest',
    requiredOn: ['production'],
    forbiddenOn: [],
    optionalOn: ['preview', 'development'],
    mustBeSensitive: true,
    previewBranchScoping: 'allowed',
    shape: SHAPES.strongSecret32,
    paymentCritical: false,
    githubActions: false,
    publicVar: false,
  },

  // ── Canonical origin ──────────────────────────────────────────────────────
  {
    name: 'NEXT_PUBLIC_SITE_URL',
    describe: 'Explicit canonical origin override for metadata, sitemap and links',
    requiredOn: [],
    forbiddenOn: [],
    // getSiteUrl() has a deploy-safe fallback chain that can never reach
    // localhost, so this is an override rather than a dependency. When it IS
    // set it must be a branded https origin, because a wrong value puts a 301
    // in front of every link the platform generates and Stripe does not follow
    // redirects.
    optionalOn: ['production', 'preview', 'development'],
    mustBeSensitive: false,
    previewBranchScoping: 'allowed',
    shape: SHAPES.originOrLocalhost,
    scopeShape: { production: SHAPES.brandedHttpsOrigin },
    paymentCritical: false,
    githubActions: false,
    publicVar: true,
  },
  {
    name: 'NEXT_PUBLIC_APP_URL',
    describe: 'Absolute app origin for Stripe redirects, payout emails and share links',
    requiredOn: [],
    forbiddenOn: [],
    optionalOn: ['production', 'preview', 'development'],
    mustBeSensitive: false,
    previewBranchScoping: 'allowed',
    shape: SHAPES.originOrLocalhost,
    // On production a wrong value puts a 301 in front of every link the platform
    // generates, and Stripe does not follow redirects on a return URL.
    scopeShape: { production: SHAPES.brandedHttpsOrigin },
    paymentCritical: false,
    githubActions: false,
    publicVar: true,
  },
  {
    name: 'WEBHOOK_CANONICAL_HOST',
    describe: 'The host Stripe endpoints must point at, for the endpoint config check',
    requiredOn: [],
    forbiddenOn: [],
    optionalOn: ['production', 'preview', 'development'],
    mustBeSensitive: false,
    previewBranchScoping: 'allowed',
    shape: SHAPES.hostname,
    paymentCritical: false,
    githubActions: false,
    publicVar: false,
  },

  // ── Web push ──────────────────────────────────────────────────────────────
  {
    name: 'NEXT_PUBLIC_VAPID_PUBLIC_KEY',
    describe: 'VAPID public key for web push alerts',
    requiredOn: ['production'],
    forbiddenOn: [],
    optionalOn: ['preview', 'development'],
    mustBeSensitive: false,
    previewBranchScoping: 'allowed',
    shape: SHAPES.vapidPublicKey,
    paymentCritical: false,
    githubActions: false,
    publicVar: true,
  },
  {
    name: 'VAPID_PRIVATE_KEY',
    describe: 'VAPID private key for web push alerts',
    requiredOn: ['production'],
    forbiddenOn: [],
    optionalOn: ['preview', 'development'],
    mustBeSensitive: true,
    previewBranchScoping: 'allowed',
    shape: SHAPES.vapidPrivateKey,
    paymentCritical: false,
    githubActions: false,
    publicVar: false,
  },
  {
    name: 'VAPID_SUBJECT',
    describe: 'VAPID subject: a mailto: or https contact for push providers',
    requiredOn: ['production'],
    forbiddenOn: [],
    optionalOn: ['preview', 'development'],
    mustBeSensitive: false,
    previewBranchScoping: 'allowed',
    shape: SHAPES.mailtoOrHttps,
    paymentCritical: false,
    githubActions: false,
    publicVar: false,
  },

  // ── AI assistants ─────────────────────────────────────────────────────────
  {
    name: 'ANTHROPIC_API_KEY',
    describe: 'Anthropic key behind the four assistants and the guidance engine',
    requiredOn: ['production'],
    forbiddenOn: [],
    optionalOn: ['preview', 'development'],
    mustBeSensitive: true,
    previewBranchScoping: 'allowed',
    shape: SHAPES.anthropicKey,
    paymentCritical: false,
    githubActions: false,
    publicVar: false,
  },

  // ── Observability ─────────────────────────────────────────────────────────
  {
    name: 'SENTRY_DSN',
    describe: 'Sentry DSN for server-side error reporting',
    requiredOn: [],
    forbiddenOn: [],
    optionalOn: ['production', 'preview', 'development'],
    mustBeSensitive: false,
    previewBranchScoping: 'allowed',
    shape: SHAPES.httpsUrl,
    paymentCritical: false,
    githubActions: false,
    publicVar: false,
  },
  {
    name: 'NEXT_PUBLIC_SENTRY_DSN',
    describe: 'Sentry DSN for browser error reporting',
    requiredOn: [],
    forbiddenOn: [],
    optionalOn: ['production', 'preview', 'development'],
    mustBeSensitive: false,
    previewBranchScoping: 'allowed',
    shape: SHAPES.httpsUrl,
    paymentCritical: false,
    githubActions: false,
    publicVar: true,
  },
  {
    name: 'SENTRY_ORG',
    describe: 'Sentry organisation slug for source-map upload at build time',
    requiredOn: [],
    forbiddenOn: [],
    optionalOn: ['production', 'preview', 'development'],
    mustBeSensitive: false,
    previewBranchScoping: 'allowed',
    shape: SHAPES.shortSlug,
    paymentCritical: false,
    githubActions: false,
    publicVar: false,
  },
  {
    name: 'SENTRY_PROJECT',
    describe: 'Sentry project slug for source-map upload at build time',
    requiredOn: [],
    forbiddenOn: [],
    optionalOn: ['production', 'preview', 'development'],
    mustBeSensitive: false,
    previewBranchScoping: 'allowed',
    shape: SHAPES.shortSlug,
    paymentCritical: false,
    githubActions: false,
    publicVar: false,
  },
  {
    name: 'SENTRY_AUTH_TOKEN',
    describe: 'Sentry auth token for source-map upload at build time',
    requiredOn: [],
    forbiddenOn: [],
    optionalOn: ['production', 'preview', 'development'],
    mustBeSensitive: true,
    previewBranchScoping: 'allowed',
    shape: SHAPES.anyNonEmpty,
    paymentCritical: false,
    githubActions: false,
    publicVar: false,
  },
  {
    name: 'HEALTH_CHECK_TOKEN',
    describe: 'Bearer for the unauthenticated health probe endpoint',
    requiredOn: [],
    forbiddenOn: [],
    optionalOn: ['production', 'preview', 'development'],
    mustBeSensitive: true,
    previewBranchScoping: 'allowed',
    shape: SHAPES.anyNonEmpty,
    paymentCritical: false,
    githubActions: false,
    publicVar: false,
  },

  // ── Tooling keys that belong nowhere near production traffic ───────────────
  {
    name: 'PEXELS_API_KEY',
    describe: 'Stock imagery key used only by the local seeding scripts',
    requiredOn: [],
    forbiddenOn: [],
    optionalOn: ['production', 'preview', 'development'],
    mustBeSensitive: false,
    previewBranchScoping: 'allowed',
    shape: SHAPES.anyNonEmpty,
    paymentCritical: false,
    githubActions: false,
    publicVar: false,
  },

  // ── THE FORBIDDEN SET. Every entry here is a flag that, left set on a
  // deployment scope, PERMANENTLY DISABLES one of the guards that protect the
  // platform, and does so silently. A bypass used once in an emergency and never
  // removed is indistinguishable from a bypass nobody knows about. These have no
  // legitimate home in any Vercel scope: they are set inline, for one command,
  // on one machine.
  {
    name: 'HOMEPAGE_SEED_FIXTURE',
    describe: 'Serves the benchmark fixture catalogue instead of real events',
    requiredOn: [],
    forbiddenOn: ['production'],
    optionalOn: ['preview', 'development'],
    mustBeSensitive: false,
    previewBranchScoping: 'allowed',
    shape: SHAPES.anyNonEmpty,
    paymentCritical: false,
    githubActions: false,
    publicVar: false,
  },
  {
    name: 'ALLOW_EMPTY_PUBLIC_ENV',
    describe: 'Emergency bypass of the empty and malformed public env build guard',
    requiredOn: [],
    forbiddenOn: ['production', 'preview', 'development'],
    optionalOn: [],
    mustBeSensitive: false,
    previewBranchScoping: 'forbidden',
    shape: SHAPES.anyNonEmpty,
    paymentCritical: false,
    githubActions: false,
    publicVar: false,
  },
  {
    name: 'ALLOW_PRODUCTION_SUPABASE',
    describe: 'Named override letting a non-production build resolve the LIVE database',
    requiredOn: [],
    forbiddenOn: ['production', 'preview', 'development'],
    optionalOn: [],
    mustBeSensitive: false,
    previewBranchScoping: 'forbidden',
    shape: SHAPES.anyNonEmpty,
    paymentCritical: false,
    githubActions: false,
    publicVar: false,
  },
  {
    name: 'ALLOW_PRICING_DRIFT',
    describe: 'Bypass of the pricing lock, which holds the live fee to docs/PRICING.md',
    requiredOn: [],
    forbiddenOn: ['production', 'preview', 'development'],
    optionalOn: [],
    mustBeSensitive: false,
    previewBranchScoping: 'forbidden',
    shape: SHAPES.anyNonEmpty,
    paymentCritical: false,
    githubActions: false,
    publicVar: false,
  },
  {
    name: 'ALLOW_LOW_DISK',
    describe: 'Bypass of the pre-build disk-space guard',
    requiredOn: [],
    forbiddenOn: ['production', 'preview', 'development'],
    optionalOn: [],
    mustBeSensitive: false,
    previewBranchScoping: 'forbidden',
    shape: SHAPES.anyNonEmpty,
    paymentCritical: false,
    githubActions: false,
    publicVar: false,
  },
]

/**
 * CROSS-VARIABLE RULES. Some failures are not a missing variable: they are two
 * variables that must agree, and neither one is wrong on its own. Every rule
 * here has cost this project real time, and none of them produced an error
 * anywhere.
 *
 * `kind` selects the evaluator in src/lib/env/manifest-checks.mjs. Declaring the
 * rules as data keeps the evaluators from hardcoding variable names.
 *
 * @typedef {object} CrossRule
 * @property {string}   id
 * @property {string}   kind
 * @property {string}   describe
 * @property {string[]} appliesTo  the scopes the rule is evaluated on
 * @property {'value'|'store'} needs
 * @property {string}   [publishable]   stripeAccountPair: the publishable key
 * @property {string}   [secret]        stripeAccountPair: the secret key
 * @property {string[]} [members]       stripeModeAgreement: the keys that must agree
 * @property {string}   [requiredMode]  stripeModeAgreement: 'live' or 'test'
 * @property {string[]} [urlVars]       productionRefIsolation: url vars, most-preferred first
 * @property {string[]} [keyVars]       productionRefIsolation: key vars, most-preferred first
 * @property {string}   [rawKeyVar]     productionRefIsolation: the base key a direct read would find
 * @property {string}   [variable]      requiredListOnScope / crossStore: the variable
 * @property {string}   [scope]         requiredListOnScope: the scope it is required on
 * @property {number}   [minimumEntries] requiredListOnScope: fewest acceptable list entries
 * @property {string[]} [stores]        crossStore: the stores that must agree
 * @property {string}   [equalityProof] crossStore: how equality is proven without printing a value
 * @property {string}   [handshakePath] crossStore: the authenticated path the handshake calls
 *   'value' rules need the real values, so they run where the values are real:
 *   inside the build and inside the serving deployment. 'store' rules compare
 *   two configuration STORES and run in the store checker.
 */

/** @type {CrossRule[]} */
export const CROSS_RULES = [
  {
    id: 'STRIPE_ACCOUNT_PAIRING',
    kind: 'stripeAccountPair',
    describe:
      'The account id after pk_live_51 must equal the account id after sk_live_51. ' +
      'A publishable key from one Stripe account beside a secret key from another means Stripe.js ' +
      'cannot resolve a clientSecret minted by the other account, so the payment element renders ' +
      'NOTHING with no console error and no network error. This has bitten this project three times.',
    publishable: 'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY',
    secret: 'STRIPE_SECRET_KEY',
    appliesTo: ['production'],
    needs: 'value',
  },
  {
    id: 'STRIPE_MODE_FAMILY',
    kind: 'stripeModeAgreement',
    describe:
      'On production every Stripe key must be LIVE. A live key coexisting with a test key in the ' +
      'same family looks configured, takes card details and settles nothing: a test-mode charge ' +
      'moves no money.',
    members: ['NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY', 'STRIPE_SECRET_KEY'],
    requiredMode: 'live',
    appliesTo: ['production'],
    needs: 'value',
  },
  {
    id: 'SUPABASE_PRODUCTION_REF_ISOLATION',
    kind: 'productionRefIsolation',
    describe:
      'No non-production scope may resolve the PRODUCTION Supabase project, and the RAW base ' +
      'service-role key must not be the production one either, so a future direct process.env read ' +
      'cannot resurrect the row-level-security bypass.',
    urlVars: ['NEXT_PUBLIC_SUPABASE_URL_PREVIEW', 'NEXT_PUBLIC_SUPABASE_URL'],
    keyVars: ['SUPABASE_SERVICE_ROLE_KEY_PREVIEW', 'SUPABASE_SERVICE_ROLE_KEY'],
    rawKeyVar: 'SUPABASE_SERVICE_ROLE_KEY',
    appliesTo: ['preview', 'development', 'local'],
    needs: 'value',
  },
  {
    id: 'WEBHOOK_SECRETS_ON_PRODUCTION',
    kind: 'requiredListOnScope',
    describe:
      'STRIPE_WEBHOOK_SECRETS must exist on the PRODUCTION scope and every comma-separated entry ' +
      'must match the whsec_ shape. Production runs two Stripe endpoints and each mints its own ' +
      'signing secret; hold fewer and every delivery from the uncovered endpoint 400s forever ' +
      'while payments keep succeeding.',
    variable: 'STRIPE_WEBHOOK_SECRETS',
    scope: 'production',
    minimumEntries: 2,
    appliesTo: ['production'],
    needs: 'value',
  },
  {
    id: 'CRON_SECRET_CROSS_STORE',
    kind: 'crossStore',
    describe:
      'CRON_SECRET must exist in BOTH Vercel Production and GitHub Actions, and the two copies ' +
      'must be the same secret. When they diverge the post-deploy smoke gate cannot authenticate ' +
      'and silently stops probing the payment and health sentinels, which is exactly what happened ' +
      'from 2026-07-12 to 2026-07-30.',
    variable: 'CRON_SECRET',
    stores: ['vercel:production', 'github-actions'],
    // The two values are never compared directly, because neither store will
    // reveal a sensitive value and printing one would defeat the purpose. The
    // comparison is the AUTHENTICATION HANDSHAKE: the GitHub Actions copy is
    // presented as a bearer token to the production deployment, which validates
    // it against the Vercel copy. A 200 proves they are byte-identical; a 401
    // proves they differ. That is an exact equality test that leaks nothing.
    equalityProof: 'bearer-handshake',
    handshakePath: '/api/cron/warm',
    appliesTo: ['production'],
    needs: 'store',
  },
]

/** Look one entry up by name. Returns undefined when it is not declared. */
export function manifestEntry(name) {
  return ENV_MANIFEST.find(e => e.name === name)
}

/** Every variable the manifest says production needs to take a real payment. */
export function paymentCriticalNames() {
  return ENV_MANIFEST.filter(e => e.paymentCritical).map(e => e.name)
}

/** Every variable that must also exist as a GitHub Actions repository secret. */
export function githubActionsNames() {
  return ENV_MANIFEST.filter(e => e.githubActions).map(e => e.name)
}

/**
 * The shape that applies to one variable on one scope: the scope-specific
 * override when there is one, otherwise the default.
 */
export function shapeFor(entry, scope) {
  return entry.scopeShape?.[scope] ?? entry.shape
}

/** Whether a variable is required, optional or forbidden on a given scope. */
export function policyFor(entry, scope) {
  if (entry.forbiddenOn?.includes(scope)) return 'forbidden'
  if (entry.requiredOn?.includes(scope)) return 'required'
  if (entry.optionalOn?.includes(scope)) return 'optional'
  return 'unlisted'
}
