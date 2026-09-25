import { describe, expect, it } from 'vitest'
import {
  accountIdFromKey,
  judgeTestKeyPair,
  parseStripeCliConfig,
  redactStripeSecrets,
  testKeyPairFromCli,
} from '../../../scripts/verify/lib/stripe-cli-keys.mjs'

/*
 * FIXTURE KEYS ARE BUILT, NOT WRITTEN. The no-plaintext-credential guard reads
 * this file, and a literal sixteen-character run after sk_test_ is exactly the
 * shape it exists to catch. The same construction the env-manifest tests use.
 */
const MAIN = `1${'M'.repeat(15)}`
const OTHER = `1${'S'.repeat(15)}`
const sk = (acct: string) => `sk_test_5${acct}${'k'.repeat(30)}`
const pk = (acct: string) => `pk_test_5${acct}${'p'.repeat(30)}`

const config = (overrides: Partial<Record<string, string>> = {}, sandboxExpired = true) => {
  const main = {
    account_id: `acct_${MAIN}`,
    display_name: 'Eventlinqs',
    test_mode_api_key: sk(MAIN),
    test_mode_key_expires_at: '2026-12-10',
    test_mode_pub_key: pk(MAIN),
    ...overrides,
  }
  const lines = [
    "color = ''",
    "project-name = 'default'",
    '',
    '[default]',
    ...Object.entries(main)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => `${k} = '${v}'`),
    '',
    "['eventlinqs sandbox']",
    `account_id = 'acct_${OTHER}'`,
    `test_mode_api_key = '${sk(OTHER)}'`,
    `test_mode_key_expires_at = '${sandboxExpired ? '2026-07-29' : '2026-12-01'}'`,
    `test_mode_pub_key = '${pk(OTHER)}'`,
  ]
  return lines.join('\n')
}

const NOW = new Date('2026-09-12T06:00:00Z')

describe('accountIdFromKey', () => {
  it('reads the account a key opens from the key itself', () => {
    expect(accountIdFromKey(sk(MAIN))).toBe(`acct_${MAIN}`)
    expect(accountIdFromKey(pk(MAIN))).toBe(`acct_${MAIN}`)
    expect(accountIdFromKey(`rk_live_5${MAIN}${'x'.repeat(20)}`)).toBe(`acct_${MAIN}`)
  })
  it('answers null for anything not shaped like a Stripe key', () => {
    expect(accountIdFromKey('whsec_abc')).toBeNull()
    expect(accountIdFromKey('')).toBeNull()
    expect(accountIdFromKey(undefined)).toBeNull()
  })
})

describe('parseStripeCliConfig', () => {
  it('returns one object per profile, quoted section names included', () => {
    const { profiles } = parseStripeCliConfig(config())
    expect(Object.keys(profiles).sort()).toEqual(['', 'default', 'eventlinqs sandbox'])
    expect(profiles.default.account_id).toBe(`acct_${MAIN}`)
    expect(profiles['eventlinqs sandbox'].account_id).toBe(`acct_${OTHER}`)
    expect(profiles[''].color).toBe('')
  })
  it('strips single and double quotes and ignores comments and blank lines', () => {
    const { profiles } = parseStripeCliConfig('# a comment\n\n[p]\na = "x"\nb = \'y\'\nc = z\n')
    expect(profiles.p).toEqual({ a: 'x', b: 'y', c: 'z' })
  })
})

describe('judgeTestKeyPair', () => {
  it('accepts a matched, unexpired sk_test_ and pk_test_ pair of one account', () => {
    const { profiles } = parseStripeCliConfig(config())
    const verdict = judgeTestKeyPair(profiles.default, { now: NOW })
    expect(verdict).toEqual({
      ok: true,
      publishableKey: pk(MAIN),
      secretKey: sk(MAIN),
      accountId: `acct_${MAIN}`,
      expiresAt: '2026-12-10',
    })
  })
  it('refuses a missing profile and says how to make one', () => {
    const verdict = judgeTestKeyPair(undefined, { profileName: 'eventlinqs sandbox', now: NOW })
    expect(verdict.ok).toBe(false)
    expect(verdict.reason).toMatch(/no profile named "eventlinqs sandbox"/)
    expect(verdict.reason).toMatch(/stripe login/)
  })
  it('refuses an expired key, naming the date', () => {
    const { profiles } = parseStripeCliConfig(config())
    const verdict = judgeTestKeyPair(profiles['eventlinqs sandbox'], { profileName: 'eventlinqs sandbox', now: NOW })
    expect(verdict.ok).toBe(false)
    expect(verdict.reason).toMatch(/expired on 2026-07-29/)
  })
  it('refuses a live or restricted secret', () => {
    const { profiles } = parseStripeCliConfig(config({ test_mode_api_key: `sk_live_5${MAIN}${'k'.repeat(30)}` }))
    expect(judgeTestKeyPair(profiles.default, { now: NOW })).toMatchObject({ ok: false, reason: expect.stringMatching(/not an sk_test_ key/) })
    const restricted = parseStripeCliConfig(config({ test_mode_api_key: `rk_test_5${MAIN}${'k'.repeat(30)}` })).profiles
    expect(judgeTestKeyPair(restricted.default, { now: NOW }).ok).toBe(false)
  })
  it('refuses a pair whose keys open different accounts', () => {
    const { profiles } = parseStripeCliConfig(config({ test_mode_pub_key: pk(OTHER) }))
    const verdict = judgeTestKeyPair(profiles.default, { now: NOW })
    expect(verdict.ok).toBe(false)
    expect(verdict.reason).toMatch(new RegExp(`secret for acct_${MAIN} with a publishable for acct_${OTHER}`))
  })
  it('refuses keys that disagree with the profile account_id', () => {
    const { profiles } = parseStripeCliConfig(config({ account_id: `acct_${OTHER}` }))
    const verdict = judgeTestKeyPair(profiles.default, { now: NOW })
    expect(verdict.ok).toBe(false)
    expect(verdict.reason).toMatch(/says account acct_/)
  })
  it('refuses a profile with no publishable key rather than guessing one', () => {
    const { profiles } = parseStripeCliConfig(config({ test_mode_pub_key: undefined as unknown as string }))
    const verdict = judgeTestKeyPair(profiles.default, { now: NOW })
    expect(verdict.ok).toBe(false)
    expect(verdict.reason).toMatch(/no test-mode publishable key/)
  })
  it('never carries a secret in a refusal', () => {
    const { profiles } = parseStripeCliConfig(config({ test_mode_pub_key: pk(OTHER) }))
    const verdict = judgeTestKeyPair(profiles.default, { now: NOW })
    expect(verdict.ok).toBe(false)
    expect(verdict.reason).not.toContain('sk_test_5')
  })
})

describe('testKeyPairFromCli', () => {
  it('reads the file it is pointed at and judges the named profile', () => {
    const verdict = testKeyPairFromCli({ configPath: '/nowhere/config.toml', readFile: () => config(), now: NOW })
    expect(verdict.ok).toBe(true)
    expect(verdict.ok && verdict.accountId).toBe(`acct_${MAIN}`)
  })
  it('refuses when the config cannot be read, and says to log in', () => {
    const verdict = testKeyPairFromCli({
      configPath: '/nowhere/config.toml',
      readFile: () => {
        throw new Error('ENOENT')
      },
      now: NOW,
    })
    expect(verdict.ok).toBe(false)
    expect(verdict.reason).toMatch(/could not read the Stripe CLI config/)
    expect(verdict.reason).toMatch(/stripe login/)
  })
})

describe('redactStripeSecrets', () => {
  it('masks every secret-shaped value and leaves the publishable key alone', () => {
    const line = `Ready! secret whsec_${'w'.repeat(40)} key ${sk(MAIN)} pk ${pk(MAIN)} rk rk_live_${'r'.repeat(30)}`
    const out = redactStripeSecrets(line)
    expect(out).toContain('whsec_[redacted]')
    expect(out).toContain('sk_test_[redacted]')
    expect(out).toContain('rk_live_[redacted]')
    expect(out).toContain(pk(MAIN))
    expect(out).not.toContain('w'.repeat(40))
    expect(out).not.toContain('k'.repeat(30))
  })
})
