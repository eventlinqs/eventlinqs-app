import { describe, expect, test } from 'vitest'
import {
  CRITICAL_ENV_RULES,
  PRODUCTION_SUPABASE_REF,
  evalEnvRule,
} from '@/lib/health/critical-env.mjs'

/**
 * Proves a non-production deployment can never resolve the PRODUCTION Supabase
 * project.
 *
 * The incident this encodes: NEXT_PUBLIC_SUPABASE_URL,
 * NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY were
 * byte-identical across Production, Preview and Development, all pointing at
 * the production project. Every preview deployment therefore carried a
 * production service-role key - which bypasses row level security - in its
 * runtime environment, so staging could read and write the live database. The
 * *_PREVIEW overrides steered the resolver to TEST, but any code reading the
 * base variable directly (src/proxy.ts did exactly that on every
 * /events/<slug> request) went straight to production anyway.
 */

/** Look a rule up by name and fail loudly if it has been renamed or removed. */
function ruleNamed(name: string) {
  const found = CRITICAL_ENV_RULES.find(r => r.name === name)
  if (!found) throw new Error(`CRITICAL_ENV_RULES has no rule named ${name}`)
  return found
}

const rule = ruleNamed('SUPABASE_ENV_ISOLATION')

const TEST_REF = 'vkapkibzokmfaxqogypq'

/** Build a Supabase-shaped JWT carrying a project ref, as the real keys do. */
function jwtFor(ref: string, role = 'service_role') {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ ref, role })}.signature`
}

const prodUrl = `https://${PRODUCTION_SUPABASE_REF}.supabase.co`
const testUrl = `https://${TEST_REF}.supabase.co`

describe('SUPABASE_ENV_ISOLATION rule', () => {
  test('the rule exists, is build-critical, and names the production project', () => {
    expect(rule.buildCritical).toBe(true)
    expect(PRODUCTION_SUPABASE_REF).toBe('gndnldyfudbytbboxesk')
  })

  test('THE REGRESSION: a preview resolving production FAILS', () => {
    const result = evalEnvRule(rule, {
      VERCEL_ENV: 'preview',
      NEXT_PUBLIC_SUPABASE_URL: prodUrl,
      SUPABASE_SERVICE_ROLE_KEY: jwtFor(PRODUCTION_SUPABASE_REF),
    })
    expect(result.ok).toBe(false)
    expect(result.reason).toContain(PRODUCTION_SUPABASE_REF)
  })

  test('a preview with TEST everywhere PASSES', () => {
    const result = evalEnvRule(rule, {
      VERCEL_ENV: 'preview',
      NEXT_PUBLIC_SUPABASE_URL: testUrl,
      SUPABASE_SERVICE_ROLE_KEY: jwtFor(TEST_REF),
    })
    expect(result.ok).toBe(true)
  })

  test('THE SUBTLE CASE: *_PREVIEW steers the resolver to TEST but the RAW production key is still reachable -> FAILS', () => {
    const result = evalEnvRule(rule, {
      VERCEL_ENV: 'preview',
      // Resolver picks these, so every well-behaved call site is on TEST...
      NEXT_PUBLIC_SUPABASE_URL_PREVIEW: testUrl,
      SUPABASE_SERVICE_ROLE_KEY_PREVIEW: jwtFor(TEST_REF),
      // ...but a direct process.env read still finds production.
      NEXT_PUBLIC_SUPABASE_URL: prodUrl,
      SUPABASE_SERVICE_ROLE_KEY: jwtFor(PRODUCTION_SUPABASE_REF),
    })
    expect(result.ok).toBe(false)
    expect(result.reason).toContain('raw SUPABASE_SERVICE_ROLE_KEY')
  })

  test('development is held to the same bar as preview', () => {
    const result = evalEnvRule(rule, {
      VERCEL_ENV: 'development',
      NEXT_PUBLIC_SUPABASE_URL: prodUrl,
      SUPABASE_SERVICE_ROLE_KEY: jwtFor(PRODUCTION_SUPABASE_REF),
    })
    expect(result.ok).toBe(false)
  })

  test('production resolving production PASSES - that is the whole point of production', () => {
    const result = evalEnvRule(rule, {
      VERCEL_ENV: 'production',
      NEXT_PUBLIC_SUPABASE_URL: prodUrl,
      SUPABASE_SERVICE_ROLE_KEY: jwtFor(PRODUCTION_SUPABASE_REF),
    })
    expect(result.ok).toBe(true)
  })

  test('THE LOCAL FOOTGUN: a local run resolving production FAILS', () => {
    // SUPERSEDES the old assertion that local was a no-op pass. That exemption
    // is what let `.env.local`, which points at the production project, bake
    // production public vars into a local build three separate times. A written
    // procedure is not a control.
    const result = evalEnvRule(rule, {
      NEXT_PUBLIC_SUPABASE_URL: prodUrl,
      SUPABASE_SERVICE_ROLE_KEY: jwtFor(PRODUCTION_SUPABASE_REF),
    })
    expect(result.ok).toBe(false)
    expect(result.reason).toContain(PRODUCTION_SUPABASE_REF)
    expect(result.reason).toContain('LOCAL')
    expect(result.reason).toContain('ALLOW_PRODUCTION_SUPABASE=1')
  })

  test('the explicit override lets a deliberate local run through', () => {
    const result = evalEnvRule(rule, {
      NEXT_PUBLIC_SUPABASE_URL: prodUrl,
      SUPABASE_SERVICE_ROLE_KEY: jwtFor(PRODUCTION_SUPABASE_REF),
      ALLOW_PRODUCTION_SUPABASE: '1',
    })
    expect(result.ok).toBe(true)
  })

  test('the override must be exactly "1": a truthy-looking value does not open the gate', () => {
    for (const value of ['true', 'yes', '0', '']) {
      const result = evalEnvRule(rule, {
        NEXT_PUBLIC_SUPABASE_URL: prodUrl,
        SUPABASE_SERVICE_ROLE_KEY: jwtFor(PRODUCTION_SUPABASE_REF),
        ALLOW_PRODUCTION_SUPABASE: value,
      })
      expect(result.ok).toBe(false)
    }
  })

  test('a local run on TEST passes, so the normal local workflow is unaffected', () => {
    const result = evalEnvRule(rule, {
      NEXT_PUBLIC_SUPABASE_URL: testUrl,
      SUPABASE_SERVICE_ROLE_KEY: jwtFor(TEST_REF),
    })
    expect(result.ok).toBe(true)
  })

  test('a fresh clone with no Supabase variables at all passes', () => {
    // An unreadable ref is not the production ref. CI uses a placeholder URL
    // (https://example.supabase.co) and must keep building.
    expect(evalEnvRule(rule, {}).ok).toBe(true)
    expect(evalEnvRule(rule, { NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co' }).ok).toBe(true)
  })

  test('opaque sb_secret_ keys carry no readable ref and do not false-fail a preview', () => {
    const result = evalEnvRule(rule, {
      VERCEL_ENV: 'preview',
      NEXT_PUBLIC_SUPABASE_URL_PREVIEW: testUrl,
      NEXT_PUBLIC_SUPABASE_URL: testUrl,
      SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_opaque_value_with_no_embedded_ref',
    })
    expect(result.ok).toBe(true)
  })
})

describe('STRIPE_WEBHOOK_SECRET rule accepts the plural form', () => {
  const webhookRule = ruleNamed('STRIPE_WEBHOOK_SECRET')

  test('a comma-separated STRIPE_WEBHOOK_SECRETS passes', () => {
    const result = evalEnvRule(webhookRule, {
      STRIPE_WEBHOOK_SECRETS: `whsec_${'a'.repeat(32)},whsec_${'b'.repeat(32)}`,
    })
    expect(result.ok).toBe(true)
  })

  test('the singular STRIPE_WEBHOOK_SECRET still passes on its own', () => {
    const result = evalEnvRule(webhookRule, {
      STRIPE_WEBHOOK_SECRET: `whsec_${'a'.repeat(32)}`,
    })
    expect(result.ok).toBe(true)
  })

  test('a malformed entry anywhere in the list fails', () => {
    const result = evalEnvRule(webhookRule, {
      STRIPE_WEBHOOK_SECRETS: `whsec_${'a'.repeat(32)},pk_live_not_a_webhook_secret`,
    })
    expect(result.ok).toBe(false)
    expect(result.reason).toContain('whsec_')
  })

  test('neither form set is reported as missing', () => {
    const result = evalEnvRule(webhookRule, {})
    expect(result.ok).toBe(false)
  })
})
