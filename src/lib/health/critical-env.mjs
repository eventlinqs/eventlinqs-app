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
    describe: 'Stripe webhook signing secret (server)',
    validate: v => (v.startsWith('whsec_') ? { ok: true } : { ok: false, reason: 'must start with whsec_' }),
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
