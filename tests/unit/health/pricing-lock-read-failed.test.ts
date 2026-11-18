import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LOCKED_RULE_TYPES, PRICING_LOCK_RULE, parseLockedValues } from '../../../src/lib/health/pricing-lock.mjs'

/*
 * A FAILED READ IS NEVER CALLED DRIFT (the PM's 13:38 of 18 November 2026; law 4). At 13:30:52 #300's gate went red on
 * scripts/check-pricing-lock.mjs, which printed 'Someone changed a rate in /admin/pricing or in the database directly'
 * while TEST's rates were unchanged (read ok alone a minute later), at the same minutes reads of www failed with an SSL
 * connect error. A read that errors is tried once more; if it fails again the verdict is READ FAILED, with the error
 * quoted and its own exit code; only rates actually read and different from docs/PRICING.md are DRIFT.
 */
const env = { NEXT_PUBLIC_SUPABASE_URL: 'https://vkapkibzokmfaxqogypq.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'test-key' }
const locked = parseLockedValues()
const rowsFor = (url: string, override: Record<string, number> = {}) => {
  const type = LOCKED_RULE_TYPES.find((r) => url.includes(`rule_type=eq.${r.key}`))
  if (!type) throw new Error(`no rule type in ${url}`)
  const value = override[type.key] ?? Number(locked[type.key as keyof typeof locked])
  return [{ id: 'x', version: 7, value_type: type.valueType, [type.column]: value }]
}
const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })

afterEach(() => vi.unstubAllGlobals())

describe('the pricing lock tells a failed read from drift', () => {
  it('a read that fails twice is READ FAILED, with the error quoted, never drift', async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error('SSL connect error')
    })
    vi.stubGlobal('fetch', fetchMock)
    const result = PRICING_LOCK_RULE.validate(await PRICING_LOCK_RULE.resolve(env))
    expect(result.ok).toBe(false)
    expect(result.kind).toBe('read_failed')
    expect(result.reason).toMatch(/^READ FAILED: /)
    expect(result.reason).toContain('SSL connect error')
    expect(result.reason).not.toMatch(/drift|disagree|changed a rate/i)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('a read that fails once and then answers is judged on what it read', async () => {
    let calls = 0
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      calls += 1
      if (calls === 1) return new Response('busy', { status: 503 })
      return ok(rowsFor(url))
    }))
    const result = PRICING_LOCK_RULE.validate(await PRICING_LOCK_RULE.resolve(env))
    expect(result.ok).toBe(true)
  })

  it('a rate actually read and different from docs/PRICING.md is DRIFT', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ok(rowsFor(url, { platform_fee_percentage: 9.9 }))))
    const result = PRICING_LOCK_RULE.validate(await PRICING_LOCK_RULE.resolve(env))
    expect(result.ok).toBe(false)
    expect(result.kind).toBe('drift')
    expect(result.reason).toMatch(/^DRIFT: /)
    expect(result.reason).toContain('platform_fee_percentage: live value 9.9')
  })

  it('the build script says READ FAILED in its own words and exit code, and keeps the drift advice for drift only', () => {
    const script = readFileSync(join(__dirname, '..', '..', '..', 'scripts', 'check-pricing-lock.mjs'), 'utf8')
    expect(script).toMatch(/result\.kind === 'read_failed'/)
    expect(script).toMatch(/process\.exitCode = 2/)
  })
})
