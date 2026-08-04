/**
 * THE GATE MUST NOT DEPEND ON THE DEVELOPER'S SHELL.
 *
 * On 2026-07-27 the unit suite was reported green at 1057 passing. It was green
 * only because `.env.test` had been sourced earlier in the same shell and vitest
 * inherited it. In a clean shell, which is exactly what CI runs, eleven payment
 * tests failed with `supabaseUrl is required`. The gate had been measuring the
 * machine it ran on rather than the code.
 *
 * This file removes the ambient variables before any test module is imported,
 * so the suite produces the SAME result on a laptop with a sourced env file, on
 * a fresh clone, and in CI. A test that genuinely needs a value now has to
 * provide it explicitly (vi.stubEnv, a mock, or a fixture), which is the point:
 * the dependency becomes visible in the test instead of hiding in the shell.
 *
 * This is deliberately a strip rather than a "fail loudly if absent" check.
 * Failing when absent still lets a machine that HAS the variables pass a suite
 * that a machine without them fails; stripping makes both machines identical.
 *
 * If a unit test ever legitimately needs to talk to a real service, it does not
 * belong in tests/unit. Those live in scripts/verify and are run against TEST
 * on purpose, with their target named in the output.
 */

const STRIPPED = [
  // Supabase: the pair that made the suite environment-dependent.
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_URL_PREVIEW',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY_PREVIEW',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_SERVICE_ROLE_KEY_PREVIEW',
  'SUPABASE_DB_URL',
  'SUPABASE_DB_PASSWORD',
  'SUPABASE_DB_PASSWORD_SYDNEY',
  'SUPABASE_ACCESS_TOKEN',
  // Stripe: same class of hazard on the payment paths.
  'STRIPE_SECRET_KEY',
  'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'STRIPE_WEBHOOK_SECRETS',
  // Everything else a unit test must never reach for.
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
  'ANTHROPIC_API_KEY',
  'RESEND_API_KEY',
  'CRON_SECRET',
  'QUEUE_SECRET',
  'NEXT_PUBLIC_GOOGLE_MAPS_API_KEY',
]

for (const key of STRIPPED) delete process.env[key]

// Marker so a test can assert the strip ran, and so a future reader of a CI log
// can see which suite guarantee is in force.
process.env.VITEST_CLEAN_ENV = '1'
