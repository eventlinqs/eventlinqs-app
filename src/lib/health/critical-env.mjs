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
