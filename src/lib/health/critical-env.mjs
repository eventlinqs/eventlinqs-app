/**
 * Critical environment variable spec - the single source of truth shared by
 * the BUILD-TIME guard (scripts/check-public-env.mjs) and the RUNTIME health
 * sentinel (src/lib/health/checks.ts).
 *
 * The founder's permanent lesson: a variable that EXISTS but is EMPTY is the
 * worst failure class, because presence checks pass and nothing errors (the
 * empty NEXT_PUBLIC_GOOGLE_MAPS_API_KEY that silently broke every map). So we
 * validate PRESENT + NON-EMPTY + WELL-FORMED (correct prefix / expected shape),
 * at build time (fail the build) and at runtime (alert the founder).
 *
 * Plain .mjs so the pre-build node script and the TypeScript runtime can both
 * import the exact same rules with zero drift.
 */

/**
 * @typedef {{ name: string, buildCritical: boolean, publicVar: boolean,
 *   describe: string, resolve?: (env: Record<string,string|undefined>) => string|undefined,
 *   validate: (v: string) => { ok: boolean, reason?: string } }} EnvRule
 */

const nonEmpty = v => (v && v.trim().length > 0)

/**
 * The PRODUCTION Supabase project ref. Not a secret: it is compiled into every
 * production browser bundle as part of NEXT_PUBLIC_SUPABASE_URL. It is named
 * here so the isolation rule below can state, concretely, which project a
 * non-production deployment must never resolve.
 */
export const PRODUCTION_SUPABASE_REF = 'gndnldyfudbytbboxesk'

/** Extract the project ref from a Supabase URL, or '' when it is not one. */
function refFromUrl(v) {
  const m = /^https:\/\/([a-z0-9]+)\.supabase\.co\/?$/i.exec((v ?? '').trim())
  return m ? m[1].toLowerCase() : ''
}

/**
 * Extract the project ref from a legacy `eyJ` service-role/anon JWT. Returns ''
 * for the newer opaque `sb_secret_` / `sb_publishable_` keys, which carry no
 * readable ref - those are checked by URL alone.
 */
function refFromJwt(v) {
  const t = (v ?? '').trim()
  if (!t.startsWith('eyJ')) return ''
  try {
    const payload = JSON.parse(Buffer.from(t.split('.')[1], 'base64').toString('utf8'))
    return typeof payload.ref === 'string' ? payload.ref.toLowerCase() : ''
  } catch {
    return ''
  }
}

/**
 * The MODE a Stripe key declares in its own prefix: 'live', 'test', or
 * 'missing'/'malformed' when there is nothing usable to read.
 *
 * Deliberately reads the prefix ONLY. Nothing here ever returns, logs or packs
 * key material.
 */
function stripeKeyMode(v) {
  const t = (v ?? '').trim()
  if (t.length === 0) return 'missing'
  const m = /^(?:pk|sk|rk)_(test|live)_/.exec(t)
  return m ? m[1] : 'malformed'
}

/**
 * The Stripe ACCOUNT REF both key types embed after the `_51` version marker.
 *
 * A publishable key `pk_live_51T8WBhGuiZ9cvxuu...` and its matching secret key
 * `sk_live_51T8WBhGuiZ9cvxuu...` carry the same 15-character ref, which is the
 * account id minus its `acct_1` prefix (`acct_1T8WBhGuiZ9cvxuu`). Comparing the
 * two refs is how a mismatched PAIR is caught.
 *
 * Returns '' when the key is absent or not in that shape, so the caller can
 * report "unreadable" rather than silently comparing two empty strings and
 * calling that a match.
 */
function stripeAccountRef(v) {
  const m = /^(?:pk|sk|rk)_(?:test|live)_51([A-Za-z0-9]{15})/.exec((v ?? '').trim())
  return m ? m[1] : ''
}

/** @type {EnvRule[]} */
export const CRITICAL_ENV_RULES = [
  {
    name: 'NEXT_PUBLIC_SUPABASE_URL',
    buildCritical: true,
    publicVar: true,
    describe: 'Supabase project URL (client)',
    resolve: e => e.NEXT_PUBLIC_SUPABASE_URL_PREVIEW || e.NEXT_PUBLIC_SUPABASE_URL,
    validate: v => (/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(v) ? { ok: true } : { ok: false, reason: 'must be https://<ref>.supabase.co' }),
  },
  {
    name: 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    buildCritical: true,
    publicVar: true,
    describe: 'Supabase anon key (client)',
    resolve: e => e.NEXT_PUBLIC_SUPABASE_ANON_KEY_PREVIEW || e.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    validate: v => (v.length > 30 && (v.startsWith('eyJ') || v.startsWith('sb_')) ? { ok: true } : { ok: false, reason: 'expected a JWT (eyJ...) or sb_ publishable key' }),
  },
  {
    name: 'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY',
    buildCritical: true,
    publicVar: true,
    describe: 'Stripe publishable key (client checkout)',
    validate: v => (/^pk_(test|live)_/.test(v) ? { ok: true } : { ok: false, reason: 'must start with pk_test_ or pk_live_' }),
  },
  {
    name: 'NEXT_PUBLIC_GOOGLE_MAPS_API_KEY',
    buildCritical: true,
    publicVar: true,
    describe: 'Google Maps browser key (event + city maps)',
    validate: v => (v.startsWith('AIza') && v.length >= 35 ? { ok: true } : { ok: false, reason: 'must be a Google API key (AIza..., ~39 chars)' }),
  },
  // Server-side critical secrets (runtime health-checked; not build-baked, so
  // NOT build-critical - they are read at request time).
  {
    name: 'STRIPE_SECRET_KEY',
    buildCritical: false,
    publicVar: false,
    describe: 'Stripe secret key (server)',
    validate: v => (/^sk_(test|live)_/.test(v) || /^rk_(test|live)_/.test(v) ? { ok: true } : { ok: false, reason: 'must start with sk_ or rk_' }),
  },
  {
    name: 'STRIPE_WEBHOOK_SECRET',
    buildCritical: false,
    publicVar: false,
    describe: 'Stripe webhook signing secret(s) (server)',
    // Accepts either form: the comma-separated STRIPE_WEBHOOK_SECRETS (one
    // secret per Stripe endpoint - the platform endpoint and the
    // connected-accounts endpoint have different ones) or the original
    // singular STRIPE_WEBHOOK_SECRET. Mirrors resolveWebhookSecrets() in
    // src/lib/payments/stripe-adapter.ts.
    resolve: e => e.STRIPE_WEBHOOK_SECRETS || e.STRIPE_WEBHOOK_SECRET,
    validate: v => {
      const parts = v.split(',').map(s => s.trim()).filter(s => s.length > 0)
      if (parts.length === 0) return { ok: false, reason: 'no signing secret listed' }
      const bad = parts.filter(p => !p.startsWith('whsec_'))
      return bad.length === 0
        ? { ok: true }
        : { ok: false, reason: `${bad.length} of ${parts.length} entries do not start with whsec_` }
    },
  },
  {
    name: 'SUPABASE_SERVICE_ROLE_KEY',
    buildCritical: false,
    publicVar: false,
    describe: 'Supabase service-role key (server)',
    resolve: e => e.SUPABASE_SERVICE_ROLE_KEY_PREVIEW || e.SUPABASE_SERVICE_ROLE_KEY,
    validate: v => (v.length > 30 && (v.startsWith('eyJ') || v.startsWith('sb_')) ? { ok: true } : { ok: false, reason: 'expected a JWT (eyJ...) or sb_ secret key' }),
  },
  {
    name: 'RESEND_API_KEY',
    buildCritical: false,
    publicVar: false,
    describe: 'Resend API key (email + alerts)',
    validate: v => (v.startsWith('re_') ? { ok: true } : { ok: false, reason: 'must start with re_' }),
  },
  {
    name: 'CRON_SECRET',
    buildCritical: false,
    publicVar: false,
    describe: 'Cron/sentinel bearer secret (server)',
    validate: v => (v.length >= 16 ? { ok: true } : { ok: false, reason: 'expected a strong secret (>= 16 chars)' }),
  },
  {
    // Signs queue position + admission tokens (src/lib/queue/tokens.ts). If it
    // is missing, token issuance and validation fail CLOSED (everyone queues)
    // rather than falling back to the public dev constant, which would let
    // anyone mint a token and skip the /events/<slug> gate. Health-checked so
    // the founder is alerted instead of discovering it from a bypass.
    name: 'QUEUE_SECRET',
    buildCritical: false,
    publicVar: false,
    describe: 'Queue admission token signing secret (server)',
    validate: v => (v.length >= 32 ? { ok: true } : { ok: false, reason: 'expected a strong secret (>= 32 chars)' }),
  },
  {
    // CROSS-VARIABLE RULE (2026-07-25). Every other rule asks "is this one
    // variable sane"; this one asks "is this DEPLOYMENT pointed at the right
    // database". The gap it closes: NEXT_PUBLIC_SUPABASE_URL,
    // NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY were
    // byte-identical across Production, Preview and Development, all on the
    // production project, so every preview deployment carried a production
    // service-role key - which bypasses row level security - in its runtime
    // environment. The *_PREVIEW overrides steered the resolver to TEST, but
    // any code reading the base var directly (src/proxy.ts did) went straight
    // to the live database, and the raw key stayed reachable regardless.
    //
    // Two things are asserted for any non-production deployment:
    //   1. the RESOLVED url + service-role key are not the production project;
    //   2. the RAW base service-role key is not the production one either, so
    //      a future direct read cannot resurrect the bypass.
    // On production, and on a local run with no VERCEL_ENV, it is a no-op pass.
    name: 'SUPABASE_ENV_ISOLATION',
    buildCritical: true,
    publicVar: false,
    describe: 'Non-production deployments must never resolve the PRODUCTION Supabase project',
    resolve: e => {
      const target = e.VERCEL_ENV || e.NEXT_PUBLIC_VERCEL_ENV || 'local'
      const resolvedUrl = e.NEXT_PUBLIC_SUPABASE_URL_PREVIEW || e.NEXT_PUBLIC_SUPABASE_URL || ''
      const resolvedKey = e.SUPABASE_SERVICE_ROLE_KEY_PREVIEW || e.SUPABASE_SERVICE_ROLE_KEY || ''
      const rawKey = e.SUPABASE_SERVICE_ROLE_KEY || ''
      // Packed into one string because the shared evaluator hands validate() a
      // single resolved value. Order is fixed and parsed below.
      return [target, refFromUrl(resolvedUrl), refFromJwt(resolvedKey), refFromJwt(rawKey)].join('|')
    },
    validate: v => {
      const [target, urlRef, keyRef, rawKeyRef] = v.split('|')
      if (target === 'production' || target === 'local') return { ok: true }
      const offenders = []
      if (urlRef === PRODUCTION_SUPABASE_REF) offenders.push('resolved NEXT_PUBLIC_SUPABASE_URL')
      if (keyRef === PRODUCTION_SUPABASE_REF) offenders.push('resolved SUPABASE_SERVICE_ROLE_KEY')
      if (rawKeyRef === PRODUCTION_SUPABASE_REF) offenders.push('raw SUPABASE_SERVICE_ROLE_KEY (reachable via a direct process.env read)')
      if (offenders.length === 0) return { ok: true }
      return {
        ok: false,
        reason: `VERCEL_ENV=${target} but ${offenders.join(' and ')} point at the PRODUCTION project ${PRODUCTION_SUPABASE_REF}. A preview must never be able to read or write the live database.`,
      }
    },
  },
  {
    // CROSS-VARIABLE RULE (2026-07-26). The SECOND cross-variable rule, and the
    // one that makes PRODUCTION PROVE ITS OWN STRIPE KEYS at build time.
    //
    // Two failures it closes, both of which produced NO error anywhere:
    //
    //   1. TEST KEYS ON PRODUCTION. Production ran `sk_test_` / `pk_test_`
    //      while holding a LIVE webhook signing secret. That combination looks
    //      configured and takes card details, but every charge is a test charge
    //      and no money ever moves. The per-variable STRIPE_SECRET_KEY rule
    //      cannot catch it: it accepts `sk_test_` and `sk_live_` equally,
    //      because a preview legitimately needs the test key.
    //
    //   2. A MISMATCHED PAIR. A publishable key from one Stripe account and a
    //      secret key from another. Stripe.js cannot resolve a clientSecret
    //      minted by a different account, so the payment element renders
    //      NOTHING, with no console error and no network error. Found on the
    //      Preview scope on 2026-07-25; it must never be discovered on live
    //      traffic.
    //
    // Why buildCritical: the founder will not paste the live secret key into a
    // session, and Vercel stores it Sensitive so it cannot be read back by
    // anyone. The deployment itself is therefore the only witness. Making this
    // block the BUILD turns "are the live keys right?" into a question
    // production answers on every deploy, with no human holding a secret. A
    // green production build IS the proof.
    //
    // SECRECY: resolve() packs only non-secret facts (the deployment target,
    // each key's declared MODE, and the account ref). validate() returns a
    // boolean and a reason that names NEITHER key value NOR either account ref.
    // Both consumers (scripts/check-public-env.mjs and the runtime sentinel in
    // src/lib/health/checks.ts) print only name, state and reason, so no key
    // material can reach a build log or an alert email.
    name: 'STRIPE_LIVE_KEY_PAIRING',
    buildCritical: true,
    publicVar: false,
    describe: 'Production runs LIVE Stripe keys, and both keys are the same account',
    resolve: e => {
      const target = e.VERCEL_ENV || e.NEXT_PUBLIC_VERCEL_ENV || 'local'
      const sk = e.STRIPE_SECRET_KEY ?? ''
      const pk = e.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? ''
      // Fixed order, parsed below. No key material is packed.
      return [target, stripeKeyMode(sk), stripeKeyMode(pk), stripeAccountRef(sk), stripeAccountRef(pk)].join('|')
    },
    validate: v => {
      const [target, skMode, pkMode, skRef, pkRef] = v.split('|')
      // Only production must be LIVE. A preview or a local run legitimately
      // carries test keys, and this rule is a no-op pass for them.
      if (target !== 'production') return { ok: true }

      const modeProblems = []
      if (skMode !== 'live') modeProblems.push(`STRIPE_SECRET_KEY is ${skMode}, expected a key starting sk_live_`)
      if (pkMode !== 'live') modeProblems.push(`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is ${pkMode}, expected a key starting pk_live_`)
      if (modeProblems.length > 0) {
        return {
          ok: false,
          reason: `${modeProblems.join('; ')}. Production would take card details and settle NOTHING: a test-mode charge moves no money.`,
        }
      }

      // Both are live. Now the pair. An unreadable ref is reported as its own
      // failure rather than being compared, so two empty strings can never be
      // mistaken for a match.
      if (!skRef || !pkRef) {
        const which = !skRef && !pkRef ? 'neither key' : !skRef ? 'STRIPE_SECRET_KEY' : 'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY'
        return {
          ok: false,
          reason: `the Stripe account id could not be read out of ${which}, so the two keys cannot be proven to be the same account. Expected the shape <prefix>_live_51<15-character account id>.`,
        }
      }
      if (skRef !== pkRef) {
        return {
          ok: false,
          reason:
            'the publishable and secret keys belong to DIFFERENT Stripe accounts. ' +
            'Stripe.js cannot resolve a clientSecret minted by another account, so the payment element renders nothing and reports no error: checkout would look fine and take no money. ' +
            'Re-copy BOTH keys from the same account in the Stripe dashboard (live mode).',
        }
      }
      return { ok: true }
    },
  },
]

/**
 * Evaluate a rule against an env bag. Returns present/nonEmpty/wellFormed.
 * @param {EnvRule} rule
 * @param {Record<string,string|undefined>} env
 */
export function evalEnvRule(rule, env) {
  const value = rule.resolve ? rule.resolve(env) : env[rule.name]
  if (!nonEmpty(value)) {
    // Distinguish the dangerous "present but empty" from "absent".
    const declared = rule.name in env || (rule.resolve && Boolean(rule.resolve(env) !== undefined))
    return { name: rule.name, ok: false, state: declared ? 'empty' : 'missing', reason: declared ? 'present but EMPTY (the silent-failure class)' : 'missing', describe: rule.describe }
  }
  const v = rule.validate(value.trim())
  if (!v.ok) return { name: rule.name, ok: false, state: 'malformed', reason: v.reason, describe: rule.describe }
  return { name: rule.name, ok: true, state: 'ok', describe: rule.describe }
}
