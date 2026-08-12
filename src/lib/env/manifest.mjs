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
 * THE SCOPES THE PLATFORM CAN ACTUALLY HOLD A SECRET ON.
 *
 * Vercel refuses to store a sensitive value on the Development scope. This is
 * not a setting and not an oversight: Development exists to be pulled to a
 * developer's machine by `vercel env pull`, so a value that could not be read
 * back would be useless there. Asked directly, the platform answers:
 *
 *   {
 *     "status": "error",
 *     "reason": "sensitive_not_allowed_on_development",
 *     "message": "--sensitive is not allowed with the Development Environment.
 *                 Sensitive Environment Variables are only supported on
 *                 Production and Preview."
 *   }
 *
 * WHY THIS CONSTANT EXISTS RATHER THAN A SILENT EXCEPTION. `mustBeSensitive`
 * used to be evaluated on all three scopes, so four Development records failed
 * the store checker permanently and the advice it printed, "re-add it with
 * --sensitive", was an instruction the platform rejects. A guard that demands
 * the impossible is a guard people learn to ignore, and an ignored guard is the
 * same as no guard.
 *
 * The protection on Development is therefore a DIFFERENT and stronger one:
 * LIVE_CREDENTIAL_ISOLATION below makes it a build failure for any
 * non-production scope to hold a live-mode credential or the production
 * database. A Development value stays readable, as the platform intends, and is
 * guaranteed to be worthless against production.
 */
export const SENSITIVE_CAPABLE_SCOPES = ['production', 'preview']

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
  googleMapId: {
    // A Google Cloud Map ID. The 16-character floor is deliberate: Google's
    // own placeholder, DEMO_MAP_ID, is 11 characters, so a real ID passes and
    // the demo value cannot be shipped by accident. Shipping DEMO_MAP_ID would
    // render a map whose advanced markers silently do not appear, which is a
    // worse defect than the deprecation notice this variable exists to remove.
    pattern: '^[A-Za-z0-9_-]{16,64}$',
    minLength: 16,
    describe: 'a Google Cloud Map ID, never the literal DEMO_MAP_ID',
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
   * because that is the ONLY domain the code's own sender identity resolves to
   * (`DEFAULT_SENDER_DOMAIN` in src/lib/email/sender.ts, the single definition
   * every `from:` derives from) and the only one verified at Resend. Note that
   * this shape is now the load-bearing guard rather than a second opinion:
   * since every sender role follows EMAIL_FROM, a bad value here moves ALL
   * platform mail, not just the `sendEmail` path.
   * Production once pointed EMAIL_FROM at the
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
 *                                    payment, cannot complete one, or would take
 *                                    it FOR THE WRONG AMOUNT, without it or with
 *                                    the wrong value.
 *                                    The third clause was added 8 August 2026 by
 *                                    founder ruling. The wording only covered
 *                                    absence, so a variable whose CORRUPTION
 *                                    changes the amount charged did not qualify,
 *                                    which is how the Upstash store, holding the
 *                                    resolved-fee cache, was classified false.
 *                                    A fee is money whether it is missing or
 *                                    wrong.
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
    forbiddenOn: ['production', 'development'],
    // FORBIDDEN ON DEVELOPMENT TOO. The override is consulted only when
    // VERCEL_ENV is 'preview', so on the development scope it is inert: nothing
    // reads it, and a value nothing reads drifts unnoticed and misleads whoever
    // finds it next.
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
    forbiddenOn: ['production', 'development'],
    // FORBIDDEN ON DEVELOPMENT TOO. The override is consulted only when
    // VERCEL_ENV is 'preview', so on the development scope it is inert: nothing
    // reads it, and a value nothing reads drifts unnoticed and misleads whoever
    // finds it next.
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
    forbiddenOn: ['production', 'development'],
    // FORBIDDEN ON DEVELOPMENT TOO. The override is consulted only when
    // VERCEL_ENV is 'preview', so on the development scope it is inert: nothing
    // reads it, and a value nothing reads drifts unnoticed and misleads whoever
    // finds it next.
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
    optionalOn: ['development'],
    optionalReason:
      'a local `stripe listen` mints ONE secret and the singular STRIPE_WEBHOOK_SECRET carries it, so ' +
      'the plural list has nothing to hold on a development machine; on both deployed scopes it stays ' +
      'required',
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
    optionalReason:
      'a deliberate compatibility path and rotation holding slot: resolveWebhookSecrets() reads the ' +
      'plural STRIPE_WEBHOOK_SECRETS first and appends this one deduplicated, so it is never the only ' +
      'source, and requiring it would force a duplicate of a value the plural already carries',
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
    // REQUIRED ON PRODUCTION, AND SET THERE (2026-08-03). Two call sites read
    // it, src/lib/health/runner.ts and src/app/api/cron/webhook-sentinel/route.ts,
    // and both used to fall back to a PERSONAL address hardcoded separately in
    // each file. Nothing was lost, which is why it survived, but the destination
    // for every payment and health alert was a literal in source rather than a
    // value anyone could see or change, in two places that could drift. It was
    // also set ONLY on preview branch scopes, and an alert that fires only on a
    // preview branch is not an alert.
    //
    // Both literals are gone (founder ruling R2). Both call sites now read
    // src/lib/env/destinations.ts, whose fallback is the brand inbox and never a
    // personal address. The fallback deliberately STAYS: a required variable
    // that someone later deletes must degrade to a real inbox, never to nothing.
    //
    // NOT alerts@eventlinqs.com. That address was tested on 2026-08-03 and HARD
    // BOUNCED (`550 5.4.1 Recipient address rejected`, Exchange Online): the
    // mailbox does not exist. Do not point this at it until it does.
    requiredOn: ['production'],
    forbiddenOn: [],
    optionalOn: ['preview', 'development'],
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
    // REQUIRED ON PRODUCTION, AND SET THERE (2026-08-03). One call site reads
    // it, src/lib/ai/handoff.ts. Support mail never vanished and never threw,
    // because it fell back to the apex address; the defect was that the address
    // a customer's escalation reaches was a literal in a source file while the
    // variable existed on no scope at all. It now reads
    // src/lib/env/destinations.ts, the one definition every destination shares,
    // and the fallback STAYS for the same reason as PAYMENT_ALERT_EMAIL.
    requiredOn: ['production'],
    forbiddenOn: [],
    optionalOn: ['preview', 'development'],
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
    name: 'NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID',
    describe: 'Google Maps Map ID (vector): required by AdvancedMarkerElement on every map',
    // Required wherever a map renders. AdvancedMarkerElement REQUIRES a Map ID
    // (Google, "Advanced markers migration"): a map built without one shows no
    // advanced markers at all, so an absent value here is a blank-pin defect
    // rather than a degraded one. Optional in development so a local checkout
    // without the ID still boots; the map falls back to the legacy marker path.
    requiredOn: ['production', 'preview'],
    forbiddenOn: [],
    optionalOn: ['development'],
    // Not a secret. A Map ID is embedded in the page by design, exactly like
    // the browser key beside it, and is scoped in the Cloud console.
    mustBeSensitive: false,
    previewBranchScoping: 'forbidden',
    shape: SHAPES.googleMapId,
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

  // ── The shared Redis store: rate limits, the AI budget guard, the feature
  //    flags, AND the resolved-fee cache. paymentCritical by founder ruling
  //    2026-08-08: getPricingRule returns the cached entry BEFORE consulting
  //    the database, so a wrong value here is a wrong fee charged, for up to
  //    PRICING_RULES_CACHE_TTL_SECONDS. A fee is money.
  {
    name: 'UPSTASH_REDIS_REST_URL',
    describe: 'Upstash Redis REST URL: the resolved-fee cache, feature flags, rate limits and the AI monthly budget guard',
    requiredOn: ['production'],
    forbiddenOn: [],
    optionalOn: ['preview', 'development'],
    mustBeSensitive: false,
    previewBranchScoping: 'allowed',
    shape: SHAPES.upstashUrl,
    paymentCritical: true,
    githubActions: false,
    publicVar: false,
  },
  {
    name: 'UPSTASH_REDIS_REST_TOKEN',
    describe: 'Upstash Redis REST token: write access to the resolved-fee cache and the feature flags',
    requiredOn: ['production'],
    forbiddenOn: [],
    optionalOn: ['preview', 'development'],
    mustBeSensitive: true,
    previewBranchScoping: 'allowed',
    shape: SHAPES.anyNonEmpty,
    paymentCritical: true,
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
    describe: 'THE canonical origin. Every other origin variable derives from this one',
    // THE CANONICAL ORIGIN, chosen over NEXT_PUBLIC_APP_URL on three grounds,
    // none of them taste:
    //   1. BOTH resolvers already consult it. getSiteUrl() reads it first and
    //      getAppUrl() falls back to it, so it is the only origin variable the
    //      whole platform already agrees on. NEXT_PUBLIC_APP_URL is read by one
    //      resolver only.
    //   2. It feeds the compounding surface. metadataBase, canonical tags,
    //      og:url, robots.txt and sitemap.xml all resolve through getSiteUrl(),
    //      and those are the surfaces where a wrong origin is expensive for
    //      years rather than minutes.
    //   3. Its name says what it is. An origin named APP_URL invites a second
    //      meaning ("the app, as opposed to the site"), and that ambiguity is
    //      how two sources of truth are born in the first place.
    // It stays OPTIONAL rather than required because getSiteUrl() has a
    // deploy-safe fallback chain that can never reach localhost, so the platform
    // is correct with it unset. When it IS set it must be a branded https origin,
    // and it must agree with NEXT_PUBLIC_APP_URL: see ORIGIN_AGREEMENT.
    requiredOn: [],
    forbiddenOn: [],
    optionalReason:
      'getSiteUrl() resolves a correct branded origin with this unset, so requiring it would add a ' +
      'value that can only be wrong; when present it is the canonical origin every other origin ' +
      'variable derives from',
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
    describe: 'DERIVED ALIAS of the canonical origin, kept for local development',
    // NOT A SECOND SOURCE OF TRUTH. NEXT_PUBLIC_SITE_URL is the canonical origin
    // (see its entry above for the justification). This variable survives for
    // exactly one reason: `getAppUrl()` in src/lib/site-url.ts reads it FIRST so
    // a developer can point a local machine at http://localhost:3000 without
    // touching the canonical variable, and .env.example documents that. On every
    // deployed scope it is redundant, because getAppUrl() already falls through
    // to NEXT_PUBLIC_SITE_URL and then to the same deploy-safe chain getSiteUrl()
    // uses.
    //
    // Redundant is safe. DISAGREEING is not: getSiteUrl() feeds canonical tags,
    // og:url, the sitemap and every tracked or QR-encoded link, while getAppUrl()
    // feeds Stripe return URLs, payout emails and share cards. Two origins that
    // differ split the platform in half, and Stripe does not follow redirects on
    // a return URL. ORIGIN_AGREEMENT below makes that disagreement a build
    // failure rather than a silent split.
    requiredOn: [],
    forbiddenOn: [],
    optionalOn: ['production', 'preview', 'development'],
    optionalReason:
      'a local-development override for getAppUrl(); on any deployed scope it is redundant with ' +
      'NEXT_PUBLIC_SITE_URL and is held to agreement with it by ORIGIN_AGREEMENT',
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
    // DELIBERATELY OPTIONAL EVERYWHERE, AND KEPT. It has exactly one consumer,
    // `endpointConfigCheck()` in src/lib/health/payment-checks.ts, which resolves
    // `process.env.WEBHOOK_CANONICAL_HOST || new URL(origin).host` and then
    // counts the enabled Stripe endpoints pointing at that host.
    //
    // NOT REQUIRED ON PRODUCTION, on the evidence: on production `origin` is
    // getSiteUrl(), which resolves to the canonical https://www.eventlinqs.com.au,
    // so the fallback already produces exactly the value the override would
    // supply. Requiring it there would add a variable that can only ever restate
    // what the code already computes, and a variable that can disagree with the
    // truth is worse than one that cannot.
    //
    // NOT REMOVED EITHER, which the alternative reading of this decision would
    // have done: on a PREVIEW deployment `origin` is the deployment's own
    // vercel.app URL while the Stripe endpoints point at the canonical host, so
    // without the override the check finds zero matching endpoints and reports a
    // failure that is not real. That is why it exists on preview branch scopes
    // and nowhere else, and that placement is correct.
    requiredOn: [],
    forbiddenOn: [],
    optionalOn: ['production', 'preview', 'development'],
    optionalReason:
      'on production the code already computes this exact host from getSiteUrl(), so requiring it ' +
      'would only create a value that can disagree with the truth; on preview it is a genuine ' +
      'override because the deployment host is not the endpoint host',
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
    optionalReason:
      'error reporting degrades to silence rather than breaking a request, so the platform must still ' +
      'boot and serve on a scope with no Sentry project attached',
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
    optionalReason:
      'browser error reporting degrades to silence rather than breaking a page, and requiring it would ' +
      'fail a correct local build that has no Sentry project',
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
    optionalReason:
      'source-map upload is a build-time convenience: without it the build still succeeds and stack ' +
      'traces are merely unminified, so requiring it would fail a correct build over a diagnostic ' +
      'nicety',
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
    optionalReason:
      'source-map upload only, as with SENTRY_ORG: its absence costs readable stack traces, never any ' +
      'running behaviour',
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
    optionalReason:
      'source-map upload only, as with SENTRY_ORG. It stays declared mustBeSensitive so that IF it is ' +
      'present it can still never be read back out of the store',
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
    optionalReason:
      'the health endpoint fails CLOSED when it is unset, refusing the probe rather than exposing the ' +
      'report, so absence is the SAFE state and requiring it would turn a safe default into a build ' +
      'failure',
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
    optionalReason:
      'used only by the seeding scripts under scripts/, never by any code path a request can reach, so ' +
      'no deployment needs it and its absence cannot affect a user',
    mustBeSensitive: false,
    previewBranchScoping: 'allowed',
    shape: SHAPES.anyNonEmpty,
    paymentCritical: false,
    githubActions: false,
    publicVar: false,
  },

  // ── CI-only credentials ───────────────────────────────────────────────────
  {
    name: 'SUPABASE_ACCESS_TOKEN',
    describe: 'Supabase management API token used by the CI types-drift guard',
    // DECLARED HERE BECAUSE IT WAS INVISIBLE. It lives in GitHub Actions and
    // nowhere else, is read by .github/workflows/ci.yml for the types-drift
    // guard, and was absent from this manifest entirely. A credential the
    // manifest does not name is a credential the rotation runbook cannot list
    // and the store checker cannot miss, which is exactly how it expired twice
    // without anyone noticing until the guard went quiet.
    //
    // FORBIDDEN ON EVERY VERCEL SCOPE. It is a management-plane token: it can
    // read and alter project configuration through the Supabase API. Nothing in
    // the running application uses it, so a copy sitting in a deployment scope
    // would be pure attack surface with no consumer, and it would be readable on
    // Development where the platform cannot hold it sensitive.
    requiredOn: [],
    forbiddenOn: ['production', 'preview', 'development'],
    optionalOn: [],
    mustBeSensitive: true,
    previewBranchScoping: 'forbidden',
    shape: SHAPES.anyNonEmpty,
    paymentCritical: false,
    githubActions: true,
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
  {
    id: 'ORIGIN_AGREEMENT',
    kind: 'originAgreement',
    describe:
      'NEXT_PUBLIC_SITE_URL is the canonical origin and NEXT_PUBLIC_APP_URL is a derived alias. ' +
      'When both are set they must resolve to the SAME origin. getSiteUrl() feeds canonical tags, ' +
      'og:url, the sitemap and every tracked or QR-encoded poster link; getAppUrl() feeds Stripe ' +
      'return URLs, payout emails and share cards. Two origins that disagree split the platform in ' +
      'half along that line, every generated link becomes a 301 for one half, and Stripe does not ' +
      'follow redirects on a return URL. Neither variable is wrong on its own, which is why nothing ' +
      'downstream reports it.',
    canonical: 'NEXT_PUBLIC_SITE_URL',
    alias: 'NEXT_PUBLIC_APP_URL',
    appliesTo: ['production', 'preview'],
    needs: 'value',
  },
  {
    id: 'LIVE_CREDENTIAL_ISOLATION',
    kind: 'liveCredentialIsolation',
    describe:
      'No NON-PRODUCTION scope may hold a live-mode credential, and production may not hold a ' +
      'test-mode one. STRIPE_MODE_FAMILY already holds production to live keys, but nothing held ' +
      'the mirror image: a pk_live_ or sk_live_ key, or the production Supabase project ref, ' +
      'sitting on preview or development. That direction matters more since the platform cannot ' +
      'store a Development value as sensitive, so anyone with project access can read whatever is ' +
      'there. This rule is what makes that readable Development value safe: it is guaranteed to be ' +
      'a test credential, worthless against production.\n\n' +
      'SCOPE OF THIS RULE: Stripe only, deliberately. The other keyed service, Supabase, is already ' +
      'held by SUPABASE_PRODUCTION_REF_ISOLATION above, which covers the same three scopes and ' +
      'compares project refs rather than key material. Restating it here would report one defect ' +
      'twice and leave two rules to keep in step, so the pair is complete without the duplication. ' +
      'Any FUTURE keyed service joins this rule by adding its variables to modeVars.',
    modeVars: ['STRIPE_SECRET_KEY', 'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY'],
    forbiddenMode: 'live',
    appliesTo: ['preview', 'development', 'local'],
    needs: 'value',
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

/**
 * What the VERCEL STORE may hold, which is a different question from what a
 * running PROCESS needs.
 *
 * `policyFor` answers: when the code runs as this scope, must this variable be
 * in its environment? A developer running the app locally genuinely needs
 * SUPABASE_SERVICE_ROLE_KEY in their process, so that stays required.
 *
 * This answers: may the Vercel store keep a copy of it on that scope? For a
 * SECRET on a scope the platform cannot mark sensitive, the answer is no.
 *
 * THE DEVELOPMENT SCOPE MUST NOT HOLD SECRETS AT ALL (founder ruling R3,
 * 2026-08-03). Vercel refuses `--sensitive` on Development by design, because
 * Development exists to be pulled to a laptop by `vercel env pull`. So every
 * secret stored there is readable in plain text by anyone with project access,
 * permanently, with no setting that can change it. The previous position was
 * that this was tolerable because LIVE_CREDENTIAL_ISOLATION guarantees the
 * value is a test credential. That argument is FALSE for any credential with no
 * test mode: the audit found a live RESEND_API_KEY and a billable
 * GOOGLE_MAPS_API_KEY sitting readable there, and no mode rule can protect
 * either, because neither has a mode.
 *
 * The replacement is not a weaker store, it is a different store: a local
 * `.env.local` file, which is what that file is for, is gitignored, and never
 * leaves the machine. See docs/ENV-DOCTRINE.md.
 *
 * Returns 'forbidden' for a secret on a non-sensitive-capable Vercel scope,
 * otherwise defers to `policyFor`.
 */
export function storePolicyFor(entry, scope) {
  if (entry.mustBeSensitive && SCOPES.includes(scope) && !SENSITIVE_CAPABLE_SCOPES.includes(scope)) {
    return 'forbidden'
  }
  return policyFor(entry, scope)
}
