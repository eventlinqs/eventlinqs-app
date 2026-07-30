import { describe, expect, test } from 'vitest'
import { ENV_MANIFEST, CROSS_RULES, policyFor, shapeFor } from '@/lib/env/manifest.mjs'
import { evaluateProcessEnv, evaluateStores, checkShape } from '@/lib/env/manifest-checks.mjs'
import { CRITICAL_ENV_RULES, ALWAYS_BLOCKING_RULES, evalEnvRule } from '@/lib/health/critical-env.mjs'

/**
 * THE LOCKS MUST BE ABLE TO FAIL, AND CI MUST BE THE ONE THAT PROVES IT.
 *
 * `scripts/verify/env-locks-verify.mjs` demonstrates the same breakages by hand.
 * This file is the half that runs unattended, inside the blocking `npm test`
 * gate, so a future refactor cannot quietly turn a guard into a no-op. Every
 * case below asserts BOTH halves of the contract: the correct input passes, and
 * the broken input names the right rule.
 *
 * Every value here is synthetic, built from repeated characters. Nothing in this
 * file is or resembles a real credential.
 */

const rep = (ch: string, n: number) => ch.repeat(n)
const ACCOUNT = 'T8WBhGuiZ9cvxuu' // 15 characters, the shape of a Stripe account id

function goodProductionEnv(): Record<string, string> {
  return {
    VERCEL_ENV: 'production',
    NEXT_PUBLIC_SUPABASE_URL: 'https://gndnldyfudbytbboxesk.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: `eyJ${rep('a', 60)}`,
    SUPABASE_SERVICE_ROLE_KEY: `eyJ${rep('b', 60)}`,
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: `pk_live_51${ACCOUNT}${rep('P', 30)}`,
    STRIPE_SECRET_KEY: `sk_live_51${ACCOUNT}${rep('S', 30)}`,
    STRIPE_WEBHOOK_SECRETS: `whsec_${rep('w', 32)},whsec_${rep('x', 32)}`,
    CRON_SECRET: rep('c', 64),
    QUEUE_SECRET: rep('q', 64),
    RESEND_API_KEY: `re_${rep('r', 24)}`,
    EMAIL_FROM: 'EventLinqs <hello@eventlinqs.com>',
    NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: `AIza${rep('G', 35)}`,
    GOOGLE_MAPS_API_KEY: `AIza${rep('g', 35)}`,
    UPSTASH_REDIS_REST_URL: 'https://apt-mudfish-12345.upstash.io',
    UPSTASH_REDIS_REST_TOKEN: rep('u', 40),
    ADMIN_TOTP_ENC_KEY: rep('k', 44),
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: rep('V', 87),
    VAPID_PRIVATE_KEY: rep('v', 43),
    VAPID_SUBJECT: 'mailto:hello@eventlinqs.com',
    ANTHROPIC_API_KEY: `sk-ant-${rep('A', 40)}`,
  }
}

function goodInventory() {
  const records: { name: string; scope: string; gitBranch: string | null; readable: boolean }[] = []
  for (const entry of ENV_MANIFEST) {
    for (const scope of ['production', 'preview', 'development']) {
      if (policyFor(entry, scope) !== 'required') continue
      records.push({ name: entry.name, scope, gitBranch: null, readable: !entry.mustBeSensitive })
    }
  }
  return { records, githubSecrets: ENV_MANIFEST.filter(e => e.githubActions).map(e => e.name) }
}

/** Names of the findings a broken input produced. */
const names = (findings: { name: string }[]) => findings.map(f => f.name)

describe('the manifest itself', () => {
  test('declares a name, a describe and a shape for every entry', () => {
    for (const e of ENV_MANIFEST) {
      expect(e.name, 'every entry has a name').toMatch(/^[A-Z][A-Z0-9_]*$/)
      expect(e.describe.length, `${e.name} has a describe`).toBeGreaterThan(10)
      expect(shapeFor(e, 'production')?.pattern, `${e.name} has a shape pattern`).toBeTruthy()
      expect(typeof e.paymentCritical, `${e.name} declares paymentCritical`).toBe('boolean')
      expect(typeof e.githubActions, `${e.name} declares githubActions`).toBe('boolean')
      expect(typeof e.mustBeSensitive, `${e.name} declares mustBeSensitive`).toBe('boolean')
    }
  })

  test('never declares a variable both required and forbidden on one scope', () => {
    for (const e of ENV_MANIFEST) {
      for (const scope of e.requiredOn ?? []) {
        expect(e.forbiddenOn ?? [], `${e.name} on ${scope}`).not.toContain(scope)
      }
    }
  })

  test('every shape pattern is a valid regex', () => {
    for (const e of ENV_MANIFEST) {
      for (const scope of ['production', 'preview', 'development']) {
        expect(() => new RegExp(shapeFor(e, scope).pattern)).not.toThrow()
      }
    }
  })

  test('the guard bypass flags are forbidden on every deployment scope', () => {
    // A bypass stored on a scope is permanent and invisible, and it disables the
    // guard it names. There is no scope on which one is correct.
    for (const name of ['ALLOW_EMPTY_PUBLIC_ENV', 'ALLOW_PRODUCTION_SUPABASE', 'ALLOW_PRICING_DRIFT', 'ALLOW_LOW_DISK']) {
      const entry = ENV_MANIFEST.find(e => e.name === name)
      expect(entry, `${name} is declared in the manifest`).toBeTruthy()
      expect(entry!.forbiddenOn).toEqual(expect.arrayContaining(['production', 'preview', 'development']))
    }
  })
})

describe('LOCK 2: the production build guard', () => {
  test('a complete, correct production environment passes', () => {
    expect(evaluateProcessEnv(goodProductionEnv()).findings).toEqual([])
  })

  test('a variable MISSING from a required scope fails', () => {
    const env = goodProductionEnv()
    delete env.STRIPE_WEBHOOK_SECRETS
    expect(names(evaluateProcessEnv(env).findings)).toContain('STRIPE_WEBHOOK_SECRETS')
  })

  test('a variable PRESENT BUT EMPTY fails, and is reported as empty not missing', () => {
    const env = goodProductionEnv()
    env.RESEND_API_KEY = ''
    const hit = evaluateProcessEnv(env).findings.find(f => f.name === 'RESEND_API_KEY')
    expect(hit?.state).toBe('empty')
  })

  test('a variable that fails its shape regex fails', () => {
    const env = goodProductionEnv()
    env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY = 'not-a-google-key'
    expect(names(evaluateProcessEnv(env).findings)).toContain('NEXT_PUBLIC_GOOGLE_MAPS_API_KEY')
  })

  test('THE REGRESSION: the sender drifting to the unverified Resend domain fails', () => {
    // Production sent from send.eventlinqs.com, which Resend rejects, so every
    // send through sendEmail threw - including the sentinel's own alert email.
    const env = goodProductionEnv()
    env.EMAIL_FROM = 'EventLinqs <noreply@send.eventlinqs.com>'
    expect(names(evaluateProcessEnv(env).findings)).toContain('EMAIL_FROM')
  })

  test('a variable present on a scope that FORBIDS it is always-blocking', () => {
    const env = goodProductionEnv()
    env.HOMEPAGE_SEED_FIXTURE = '1'
    const out = evaluateProcessEnv(env)
    expect(names(out.alwaysBlocking)).toContain('HOMEPAGE_SEED_FIXTURE')
  })

  test('a stored guard bypass cannot bypass the rule that forbids it', () => {
    const env = goodProductionEnv()
    env.ALLOW_EMPTY_PUBLIC_ENV = '1'
    const out = evaluateProcessEnv(env)
    expect(names(out.alwaysBlocking)).toContain('ALLOW_EMPTY_PUBLIC_ENV')
  })

  test('a PREVIEW override present on production is always-blocking', () => {
    const env = goodProductionEnv()
    env.SUPABASE_SERVICE_ROLE_KEY_PREVIEW = `eyJ${rep('z', 60)}`
    expect(names(evaluateProcessEnv(env).alwaysBlocking)).toContain('SUPABASE_SERVICE_ROLE_KEY_PREVIEW')
  })

  test('the manifest rules are wired into CRITICAL_ENV_RULES as build-critical', () => {
    const conformance = CRITICAL_ENV_RULES.find(r => r.name === 'ENV_MANIFEST_CONFORMANCE')
    const forbidden = CRITICAL_ENV_RULES.find(r => r.name === 'ENV_MANIFEST_FORBIDDEN_AND_CROSS')
    expect(conformance?.buildCritical).toBe(true)
    expect(forbidden?.buildCritical).toBe(true)
    expect(ALWAYS_BLOCKING_RULES.has('ENV_MANIFEST_FORBIDDEN_AND_CROSS')).toBe(true)
    // ALLOW_EMPTY_PUBLIC_ENV must not be able to switch off the forbidden class.
    expect(ALWAYS_BLOCKING_RULES.has('ENV_MANIFEST_CONFORMANCE')).toBe(false)
  })

  test('the wired rule actually fails through evalEnvRule, not just in isolation', () => {
    const rule = CRITICAL_ENV_RULES.find(r => r.name === 'ENV_MANIFEST_CONFORMANCE')!
    const env = goodProductionEnv()
    env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY = ''
    const result = evalEnvRule(rule, env)
    expect(result.ok).toBe(false)
    expect(result.reason).toContain('NEXT_PUBLIC_GOOGLE_MAPS_API_KEY')
  })
})

describe('LOCK 3: cross-variable rules', () => {
  test('THE REGRESSION: pk_live_51 and sk_live_51 from different accounts fails', () => {
    // Stripe.js cannot resolve a clientSecret minted by another account, so the
    // payment element renders nothing with no error. Three occurrences here.
    const env = goodProductionEnv()
    env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = `pk_live_51${rep('D', 15)}${rep('P', 30)}`
    expect(names(evaluateProcessEnv(env).findings)).toContain('STRIPE_ACCOUNT_PAIRING')
  })

  test('a matching pair passes', () => {
    expect(names(evaluateProcessEnv(goodProductionEnv()).findings)).not.toContain('STRIPE_ACCOUNT_PAIRING')
  })

  test('a test key coexisting with a live key on production fails', () => {
    const env = goodProductionEnv()
    env.STRIPE_SECRET_KEY = `sk_test_51${ACCOUNT}${rep('S', 30)}`
    expect(names(evaluateProcessEnv(env).findings)).toContain('STRIPE_MODE_FAMILY')
  })

  test('the production Supabase ref on the preview scope fails', () => {
    const env = goodProductionEnv()
    env.VERCEL_ENV = 'preview'
    env.NEXT_PUBLIC_SUPABASE_URL_PREVIEW = 'https://gndnldyfudbytbboxesk.supabase.co'
    expect(names(evaluateProcessEnv(env).findings)).toContain('SUPABASE_PRODUCTION_REF_ISOLATION')
  })

  test('fewer webhook signing secrets than Stripe delivery channels fails', () => {
    const env = goodProductionEnv()
    env.STRIPE_WEBHOOK_SECRETS = `whsec_${rep('w', 32)}`
    expect(names(evaluateProcessEnv(env).findings)).toContain('WEBHOOK_SECRETS_ON_PRODUCTION')
  })

  test('a STRIPE_WEBHOOK_SECRETS entry that is not whsec_ fails the list shape', () => {
    const env = goodProductionEnv()
    env.STRIPE_WEBHOOK_SECRETS = `whsec_${rep('w', 32)},${rep('n', 38)}`
    expect(names(evaluateProcessEnv(env).findings)).toContain('STRIPE_WEBHOOK_SECRETS')
  })

  test('the cross-store rule declares both stores and an equality proof that leaks nothing', () => {
    const rule = CROSS_RULES.find(r => r.id === 'CRON_SECRET_CROSS_STORE')
    expect(rule?.stores).toEqual(['vercel:production', 'github-actions'])
    // Comparing values directly would mean printing one. The handshake is an
    // exact equality test that reveals neither copy.
    expect(rule?.equalityProof).toBe('bearer-handshake')
  })
})

describe('LOCK 3: cross-store rules', () => {
  test('a complete, correct store inventory passes', () => {
    expect(evaluateStores(goodInventory()).findings).toEqual([])
  })

  test('THE REGRESSION: CRON_SECRET absent from GitHub Actions fails', () => {
    // The post-deploy smoke gate skipped its sentinel probes on every run from
    // 2026-07-12 to 2026-07-30 because of exactly this.
    const inv = goodInventory()
    inv.githubSecrets = inv.githubSecrets.filter(n => n !== 'CRON_SECRET')
    const hit = evaluateStores(inv).findings.find(f => f.name === 'CRON_SECRET')
    expect(hit?.state).toBe('missing-github-secret')
  })

  test('CRON_SECRET absent from Vercel Production fails', () => {
    const inv = goodInventory()
    inv.records = inv.records.filter(r => !(r.name === 'CRON_SECRET' && r.scope === 'production'))
    expect(names(evaluateStores(inv).findings)).toContain('CRON_SECRET')
  })

  test('a secret that must be sensitive being readable back fails', () => {
    const inv = goodInventory()
    for (const r of inv.records) if (r.name === 'SUPABASE_SERVICE_ROLE_KEY') r.readable = true
    const hit = evaluateStores(inv).findings.find(f => f.name === 'SUPABASE_SERVICE_ROLE_KEY')
    expect(hit?.state).toBe('readable-secret')
  })

  test('unknown read-back exposure never fails, only a proven exposure does', () => {
    const inv = goodInventory()
    for (const r of inv.records) if (r.name === 'SUPABASE_SERVICE_ROLE_KEY') (r as { readable: boolean | null }).readable = null
    expect(names(evaluateStores(inv).findings)).not.toContain('SUPABASE_SERVICE_ROLE_KEY')
  })

  test('a scope-wide preview variable wrongly pinned to one git branch fails', () => {
    const inv = goodInventory()
    for (const r of inv.records) if (r.name === 'STRIPE_WEBHOOK_SECRETS' && r.scope === 'preview') r.gitBranch = 'feat/some-branch'
    const hit = evaluateStores(inv).findings.find(f => f.name === 'STRIPE_WEBHOOK_SECRETS')
    expect(hit?.state).toBe('wrong-branch-scope')
  })

  test('a forbidden variable holding a record on production fails', () => {
    const inv = goodInventory()
    inv.records.push({ name: 'HOMEPAGE_SEED_FIXTURE', scope: 'production', gitBranch: null, readable: true })
    expect(names(evaluateStores(inv).alwaysBlocking)).toContain('HOMEPAGE_SEED_FIXTURE')
  })
})

describe('shape checking', () => {
  test('a list shape is applied to every entry, not just the first', () => {
    const shape = { pattern: '^whsec_[A-Za-z0-9]{20,}$', minLength: 26, describe: 'whsec_', listSeparator: ',' }
    expect(checkShape(`whsec_${rep('a', 30)},whsec_${rep('b', 30)}`, shape)).toBeNull()
    expect(checkShape(`whsec_${rep('a', 30)},${rep('b', 30)}`, shape)).toContain('1 of 2')
  })

  test('no finding ever carries the value it is about', () => {
    // The whole system is worthless if a guard leaks what it is guarding.
    const env = goodProductionEnv()
    env.STRIPE_SECRET_KEY = `sk_test_51${ACCOUNT}${rep('S', 30)}`
    env.RESEND_API_KEY = `re_${rep('LEAKCANARY', 3)}`
    const serialised = JSON.stringify(evaluateProcessEnv(env).findings)
    expect(serialised).not.toContain('LEAKCANARY')
    expect(serialised).not.toContain(env.STRIPE_SECRET_KEY)
    expect(serialised).not.toContain(env.SUPABASE_SERVICE_ROLE_KEY)
  })
})
