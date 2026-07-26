import { describe, expect, test } from 'vitest'
import { CRITICAL_ENV_RULES, evalEnvRule } from '@/lib/health/critical-env.mjs'

/**
 * Proves PRODUCTION cannot build with test-mode Stripe keys, or with a
 * publishable and secret key from two DIFFERENT Stripe accounts.
 *
 * The two incidents this encodes, both of which produced NO error anywhere:
 *
 *   1. Production ran `sk_test_` / `pk_test_` while holding a LIVE webhook
 *      signing secret. It looked configured and would take card details, but
 *      every charge was a test charge and no money ever moved.
 *
 *   2. On the Preview scope (2026-07-25) the publishable key belonged to a
 *      different Stripe account than the secret key. Stripe.js cannot resolve a
 *      clientSecret minted by another account, so the payment element rendered
 *      NOTHING: no console error, no network error, no on-page message.
 *
 * Why this must be a BUILD gate: the founder will not paste the live secret key
 * into a session, and Vercel stores it Sensitive so it cannot be read back by
 * anyone. The deployment itself is the only witness, so a green production
 * build IS the proof that the keys are live and matched.
 */

/** Look a rule up by name and fail loudly if it has been renamed or removed. */
function ruleNamed(name: string) {
  const found = CRITICAL_ENV_RULES.find(r => r.name === name)
  if (!found) throw new Error(`CRITICAL_ENV_RULES has no rule named ${name}`)
  return found
}

const rule = ruleNamed('STRIPE_LIVE_KEY_PAIRING')

/**
 * The real production Stripe account, from
 * docs/roast/live-keys-production-2026-07-26.md. Its ref is the account id
 * minus the `acct_1` prefix, and it is the 15 characters both key types carry
 * after the `_51` version marker.
 */
const REAL_ACCOUNT = 'acct_1T8WBhGuiZ9cvxuu'
const REAL_REF = REAL_ACCOUNT.replace(/^acct_1/, '')
const OTHER_REF = 'T8WBzGqHIQtgS8t' // the TEST account seen on the same platform

/** Build a Stripe-shaped key. Real keys are 107 characters. */
function key(kind: 'pk' | 'sk', mode: 'test' | 'live', ref: string, tail = 'A'.repeat(80)): string {
  return `${kind}_${mode}_51${ref}${tail}`
}

const env = (over: Record<string, string | undefined>) => ({
  VERCEL_ENV: 'production',
  STRIPE_SECRET_KEY: key('sk', 'live', REAL_REF),
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: key('pk', 'live', REAL_REF),
  ...over,
})

describe('STRIPE_LIVE_KEY_PAIRING', () => {
  test('is a BUILD-critical rule, so a bad pair fails the build rather than only alerting', () => {
    expect(rule.buildCritical).toBe(true)
  })

  test('the real account ref is exactly the 15 characters the keys carry after _51', () => {
    expect(REAL_REF).toBe('T8WBhGuiZ9cvxuu')
    expect(REAL_REF).toHaveLength(15)
    // Pins the extraction against the real observed production key shape.
    expect(key('pk', 'live', REAL_REF).startsWith('pk_live_51T8WBhGuiZ9cvxuu')).toBe(true)
  })

  test('PASSES on production when both keys are live and the same account', () => {
    expect(evalEnvRule(rule, env({})).ok).toBe(true)
  })

  test('FAILS on production when the secret key is test mode', () => {
    const r = evalEnvRule(rule, env({ STRIPE_SECRET_KEY: key('sk', 'test', REAL_REF) }))
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/STRIPE_SECRET_KEY is test/)
    expect(r.reason).toMatch(/sk_live_/)
  })

  test('FAILS on production when the publishable key is test mode', () => {
    const r = evalEnvRule(rule, env({ NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: key('pk', 'test', REAL_REF) }))
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is test/)
  })

  test('FAILS on production when BOTH keys are test mode (the state production was actually in)', () => {
    const r = evalEnvRule(
      rule,
      env({
        STRIPE_SECRET_KEY: key('sk', 'test', REAL_REF),
        NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: key('pk', 'test', REAL_REF),
      }),
    )
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/moves no money|settle NOTHING/i)
  })

  /**
   * THE SILENT KILLER. Both keys are live and well-formed, so every
   * per-variable check passes; only comparing them catches it.
   */
  test('FAILS on production when the two live keys are DIFFERENT accounts', () => {
    const r = evalEnvRule(rule, env({ STRIPE_SECRET_KEY: key('sk', 'live', OTHER_REF) }))
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/DIFFERENT Stripe accounts/)
  })

  test('FAILS on production when a key is missing', () => {
    const r = evalEnvRule(rule, env({ STRIPE_SECRET_KEY: undefined }))
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/STRIPE_SECRET_KEY is missing/)
  })

  test('FAILS on production when a key is malformed rather than silently comparing two empty refs', () => {
    const r = evalEnvRule(rule, env({ STRIPE_SECRET_KEY: 'not-a-stripe-key' }))
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/malformed/)
  })

  test('FAILS when a live key is too short to carry a full account id', () => {
    const r = evalEnvRule(rule, env({ STRIPE_SECRET_KEY: 'sk_live_51SHORT' }))
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/account id could not be read/)
  })

  /**
   * SECRECY. The brief is explicit: never log or expose either value, only the
   * boolean and the mismatch reason. Both consumers print `reason` verbatim
   * into a build log and an alert email, so a leak here is a leak everywhere.
   */
  test('NEVER puts key material or an account ref into the failure reason', () => {
    const sk = key('sk', 'live', OTHER_REF, 'SECRETTAIL'.repeat(8))
    const pk = key('pk', 'live', REAL_REF, 'PUBLICTAIL'.repeat(8))
    const r = evalEnvRule(rule, env({ STRIPE_SECRET_KEY: sk, NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: pk }))
    expect(r.ok).toBe(false)
    const reason = r.reason ?? ''
    expect(reason).not.toContain(sk)
    expect(reason).not.toContain(pk)
    expect(reason).not.toContain('SECRETTAIL')
    expect(reason).not.toContain(OTHER_REF)
    expect(reason).not.toContain(REAL_REF)
    expect(reason).not.toMatch(/sk_live_51|pk_live_51/)
  })

  test('is a NO-OP on preview, which legitimately runs test keys', () => {
    const r = evalEnvRule(
      rule,
      env({
        VERCEL_ENV: 'preview',
        STRIPE_SECRET_KEY: key('sk', 'test', OTHER_REF),
        NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: key('pk', 'test', OTHER_REF),
      }),
    )
    expect(r.ok).toBe(true)
  })

  test('is a NO-OP on a local run with no VERCEL_ENV', () => {
    const r = evalEnvRule(
      rule,
      env({
        VERCEL_ENV: undefined,
        STRIPE_SECRET_KEY: key('sk', 'test', OTHER_REF),
        NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: key('pk', 'test', REAL_REF),
      }),
    )
    expect(r.ok).toBe(true)
  })

  /**
   * SELF-PROVING. Asserts the pre-existing per-variable rule ACCEPTS the exact
   * configuration this new rule rejects, so this test cannot pass for the
   * trivial reason that something else already caught it.
   */
  test('the existing STRIPE_SECRET_KEY rule accepts a TEST key on production, which is why this rule is needed', () => {
    const perVariable = ruleNamed('STRIPE_SECRET_KEY')
    const testKeyOnProd = env({ STRIPE_SECRET_KEY: key('sk', 'test', REAL_REF) })
    expect(evalEnvRule(perVariable, testKeyOnProd).ok).toBe(true)
    expect(evalEnvRule(rule, testKeyOnProd).ok).toBe(false)
  })

  test('the existing per-variable rules both accept a MISMATCHED live pair, which is why the pairing check is needed', () => {
    const mismatched = env({ STRIPE_SECRET_KEY: key('sk', 'live', OTHER_REF) })
    expect(evalEnvRule(ruleNamed('STRIPE_SECRET_KEY'), mismatched).ok).toBe(true)
    expect(evalEnvRule(ruleNamed('NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY'), mismatched).ok).toBe(true)
    expect(evalEnvRule(rule, mismatched).ok).toBe(false)
  })
})
