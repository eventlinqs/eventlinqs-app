/**
 * THE MANIFEST'S OWN CONTRACT, MACHINE-CHECKED.
 *
 * Locks 2 to 4 all read src/lib/env/manifest.mjs and enforce what it declares.
 * Nothing enforced the manifest ITSELF, so a variable could sit in it with no
 * opinion attached, report PRESENT AND CORRECT forever, and be green purely
 * because nothing ever asked anything of it. Thirteen entries were in that state
 * when this file was written.
 *
 * These tests are the missing half: they hold the manifest to a contract before
 * the manifest holds anything else to one.
 *
 *   1. every variable has an opinion on every scope
 *   2. a variable optional EVERYWHERE must say why, in writing
 *   3. every variable declares its sensitivity
 *   4. the cross-variable rules actually fire
 *
 * A guard that has never been seen to fail is not a guard, so each rule test
 * asserts the failing case as well as the passing one.
 */

import { describe, it, expect } from 'vitest'
import { ENV_MANIFEST, CROSS_RULES, SCOPES, SENSITIVE_CAPABLE_SCOPES, policyFor } from '@/lib/env/manifest.mjs'
import { evaluateValueCrossRules } from '@/lib/env/manifest-checks.mjs'

type Entry = {
  name: string
  requiredOn?: string[]
  forbiddenOn?: string[]
  optionalOn?: string[]
  optionalReason?: string
  mustBeSensitive?: unknown
  describe?: string
}

const entries = ENV_MANIFEST as Entry[]

describe('every manifest variable carries an opinion', () => {
  it('the manifest is not empty, so these tests cannot pass vacuously', () => {
    expect(entries.length).toBeGreaterThan(30)
  })

  it.each(entries.map(e => [e.name, e] as const))(
    '%s is required, forbidden or explicitly optional on every scope',
    (name, entry) => {
      const unlisted = (SCOPES as string[]).filter(s => policyFor(entry, s) === 'unlisted')
      expect(
        unlisted,
        `${name} has NO declaration for scope(s): ${unlisted.join(', ')}. A variable with no opinion ` +
          `reports healthy because nothing asks anything of it. Add the scope to requiredOn, ` +
          `forbiddenOn or optionalOn in src/lib/env/manifest.mjs.`,
      ).toEqual([])
    },
  )

  it.each(entries.map(e => [e.name, e] as const))(
    '%s explains itself in writing when it is optional on every scope',
    (name, entry) => {
      const optionalEverywhere = (SCOPES as string[]).every(s => policyFor(entry, s) === 'optional')
      if (!optionalEverywhere) return

      expect(
        typeof entry.optionalReason === 'string' && entry.optionalReason.trim().length > 20,
        `${name} is optional on production, preview AND development, so no check can ever fail on ` +
          `it and it is green because it was never asked for. That may be correct, but it has to be ` +
          `a decision rather than an oversight: add an optionalReason to its manifest entry saying ` +
          `why it is genuinely optional.`,
      ).toBe(true)
    },
  )

  it.each(entries.map(e => [e.name, e] as const))('%s declares its sensitivity', (name, entry) => {
    expect(
      typeof entry.mustBeSensitive,
      `${name} does not declare mustBeSensitive. Every variable is either a secret that must never ` +
        `be readable out of the store, or it is not, and the store checker needs to be told which.`,
    ).toBe('boolean')
  })
})

describe('the sensitivity contract matches what the platform can enforce', () => {
  it('never claims a scope Vercel refuses to hold a secret on', () => {
    // Vercel rejects sensitive on Development outright. If this list ever grows
    // to include it, the store checker starts printing advice the platform will
    // not carry out.
    expect(SENSITIVE_CAPABLE_SCOPES).toEqual(['production', 'preview'])
  })
})

describe('ORIGIN_AGREEMENT', () => {
  const rule = (CROSS_RULES as { id: string }[]).find(r => r.id === 'ORIGIN_AGREEMENT')
  const run = (env: Record<string, string>) =>
    evaluateValueCrossRules(env, { scope: 'production', rules: [rule] }).findings

  it('is declared', () => expect(rule).toBeDefined())

  it('FAILS when the canonical origin and its alias disagree', () => {
    const findings = run({
      NEXT_PUBLIC_SITE_URL: 'https://www.eventlinqs.com.au',
      NEXT_PUBLIC_APP_URL: 'https://www.eventlinqs.com',
    })
    expect(findings).toHaveLength(1)
    expect(findings[0].severity).toBe('always-blocking')
    expect(findings[0].reason).toContain('https://www.eventlinqs.com.au')
  })

  it('passes when they agree, including a trailing-slash difference', () => {
    expect(
      run({
        NEXT_PUBLIC_SITE_URL: 'https://www.eventlinqs.com.au',
        NEXT_PUBLIC_APP_URL: 'https://www.eventlinqs.com.au/',
      }),
    ).toEqual([])
  })

  it('passes when only the canonical is set, because the alias then derives', () => {
    expect(run({ NEXT_PUBLIC_SITE_URL: 'https://www.eventlinqs.com.au' })).toEqual([])
  })
})

describe('LIVE_CREDENTIAL_ISOLATION', () => {
  const rule = (CROSS_RULES as { id: string }[]).find(r => r.id === 'LIVE_CREDENTIAL_ISOLATION')
  const run = (env: Record<string, string>, scope = 'preview') =>
    evaluateValueCrossRules(env, { scope, rules: [rule] }).findings

  it('is declared', () => expect(rule).toBeDefined())

  it('FAILS when a live secret key sits on a non-production scope', () => {
    const findings = run({ STRIPE_SECRET_KEY: `sk_live_51${'a'.repeat(15)}${'b'.repeat(24)}` })
    expect(findings).toHaveLength(1)
    expect(findings[0].severity).toBe('always-blocking')
    expect(findings[0].reason).toContain('STRIPE_SECRET_KEY is live mode')
  })

  it('FAILS on development too, where the platform cannot hold the value sensitive', () => {
    expect(
      run({ NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: `pk_live_51${'a'.repeat(15)}${'b'.repeat(24)}` }, 'development'),
    ).toHaveLength(1)
  })

  it('passes on test-mode keys, which is what these scopes must hold', () => {
    expect(
      run({
        STRIPE_SECRET_KEY: `sk_test_51${'a'.repeat(15)}${'b'.repeat(24)}`,
        NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: `pk_test_51${'a'.repeat(15)}${'b'.repeat(24)}`,
      }),
    ).toEqual([])
  })

  it('does not apply to production, where STRIPE_MODE_FAMILY requires the opposite', () => {
    expect(run({ STRIPE_SECRET_KEY: `sk_live_51${'a'.repeat(15)}${'b'.repeat(24)}` }, 'production')).toEqual([])
  })
})
