import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}))

vi.mock('@/lib/redis/client', () => ({
  getRedisClient: vi.fn(),
}))

import { createAdminClient } from '@/lib/supabase/admin'
import { getRedisClient } from '@/lib/redis/client'
import {
  PRICING_RULES_CACHE_TTL_SECONDS,
  PricingRuleNotFoundError,
  getApplicationFeeCompositionMode,
  getPlatformFeePercentage,
  getProcessingFeePassThrough,
  getReservePercentage,
  invalidatePricingRule,
} from '@/lib/payments/pricing-rules'

type AnyRecord = Record<string, unknown>

interface RuleRow {
  id: string
  rule_type: string
  country_code: string
  currency: string | null
  organisation_id: string | null
  value: number
  value_type: 'percentage' | 'fixed' | 'integer'
  version: number
}

function buildRule(overrides: Partial<RuleRow> = {}): RuleRow {
  return {
    id: `rule_${Math.random().toString(36).slice(2, 8)}`,
    rule_type: 'platform_fee_percentage',
    country_code: 'AU',
    currency: 'AUD',
    organisation_id: null,
    value: 5,
    value_type: 'percentage',
    version: 1,
    ...overrides,
  }
}

interface CallCapture {
  rule_type?: string
  country_code?: string
  currency?: string
  organisation_id?: string | null
  organisation_id_is_null?: boolean
}

function buildAdminClient(matcher: (q: CallCapture) => RuleRow | null, calls: CallCapture[]) {
  const from = vi.fn((table: string) => {
    if (table !== 'pricing_rules') {
      throw new Error(`Unexpected table: ${table}`)
    }
    return {
      select: vi.fn(() => {
        const capture: CallCapture = {}
        const builder: AnyRecord = {
          eq: vi.fn((col: string, val: string) => {
            ;(capture as AnyRecord)[col] = val
            return builder
          }),
          is: vi.fn((col: string, val: null) => {
            if (col === 'organisation_id' && val === null) {
              capture.organisation_id_is_null = true
            }
            return builder
          }),
          lte: vi.fn(() => builder),
          or: vi.fn(() => builder),
          order: vi.fn(() => builder),
          limit: vi.fn(() => builder),
          maybeSingle: vi.fn(async () => {
            calls.push(capture)
            return { data: matcher(capture), error: null }
          }),
        }
        return builder
      }),
    }
  })
  return { from } as unknown as ReturnType<typeof createAdminClient>
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getRedisClient).mockReturnValue(null)
})
afterEach(() => {
  vi.clearAllMocks()
})

describe('pricing-rules service: precedence ladder', () => {
  test('level 1: per-org override beats region default', async () => {
    const calls: CallCapture[] = []
    const orgRule = buildRule({
      id: 'rule_org',
      organisation_id: 'org_enterprise',
      value: 3,
    })
    const regionRule = buildRule({ id: 'rule_region', value: 5 })

    vi.mocked(createAdminClient).mockReturnValue(
      buildAdminClient(q => {
        if (q.organisation_id === 'org_enterprise') return orgRule
        if (q.organisation_id_is_null && q.country_code === 'AU') return regionRule
        return null
      }, calls)
    )

    const value = await getPlatformFeePercentage('AU', 'AUD', 'org_enterprise')
    expect(value).toBe(3)
    expect(calls[0].organisation_id).toBe('org_enterprise')
  })

  test('level 2: region default when org has no override', async () => {
    const calls: CallCapture[] = []
    const regionRule = buildRule({ value: 5 })
    vi.mocked(createAdminClient).mockReturnValue(
      buildAdminClient(q => {
        if (q.organisation_id === 'org_x') return null
        if (q.organisation_id_is_null && q.country_code === 'AU') return regionRule
        return null
      }, calls)
    )

    const value = await getPlatformFeePercentage('AU', 'AUD', 'org_x')
    expect(value).toBe(5)
  })

  test('level 3: GLOBAL/currency fallback when no AU row exists', async () => {
    const calls: CallCapture[] = []
    const globalRule = buildRule({ country_code: 'GLOBAL', currency: 'AUD', value: 6 })
    vi.mocked(createAdminClient).mockReturnValue(
      buildAdminClient(q => {
        if (q.country_code === 'GLOBAL' && q.currency === 'AUD') return globalRule
        return null
      }, calls)
    )

    const value = await getPlatformFeePercentage('AU', 'AUD', null)
    expect(value).toBe(6)
  })

  test('level 5: throws PricingRuleNotFoundError when nothing matches', async () => {
    const calls: CallCapture[] = []
    vi.mocked(createAdminClient).mockReturnValue(buildAdminClient(() => null, calls))

    await expect(
      getPlatformFeePercentage('XX', 'XYZ', null)
    ).rejects.toBeInstanceOf(PricingRuleNotFoundError)
  })
})

describe('pricing-rules service: typed value coercion', () => {
  test('getProcessingFeePassThrough returns 0|1|2', async () => {
    const calls: CallCapture[] = []
    vi.mocked(createAdminClient).mockReturnValue(
      buildAdminClient(
        () => buildRule({ rule_type: 'processing_fee_pass_through', value: 1, value_type: 'integer' }),
        calls
      )
    )
    await expect(getProcessingFeePassThrough('AU', 'AUD', null)).resolves.toBe(1)
  })

  test('getProcessingFeePassThrough throws on out-of-range value', async () => {
    const calls: CallCapture[] = []
    vi.mocked(createAdminClient).mockReturnValue(
      buildAdminClient(
        () => buildRule({ rule_type: 'processing_fee_pass_through', value: 7, value_type: 'integer' }),
        calls
      )
    )
    await expect(getProcessingFeePassThrough('AU', 'AUD', null)).rejects.toThrow(/out of range/)
  })

  test('getApplicationFeeCompositionMode returns 1|2', async () => {
    const calls: CallCapture[] = []
    vi.mocked(createAdminClient).mockReturnValue(
      buildAdminClient(
        () => buildRule({ rule_type: 'application_fee_composition_mode', value: 2, value_type: 'integer' }),
        calls
      )
    )
    await expect(getApplicationFeeCompositionMode('AU', 'AUD', null)).resolves.toBe(2)
  })

  test('getReservePercentage returns numeric percent', async () => {
    const calls: CallCapture[] = []
    vi.mocked(createAdminClient).mockReturnValue(
      buildAdminClient(
        () => buildRule({ rule_type: 'reserve_percentage', value: 20 }),
        calls
      )
    )
    await expect(getReservePercentage('AU', 'AUD', null)).resolves.toBe(20)
  })
})

describe('pricing-rules service: caching', () => {
  test('cache hit returns without hitting the database', async () => {
    const cached = {
      value: 5,
      valueType: 'percentage' as const,
      ruleId: 'cached_rule',
      source: 'region_default' as const,
    }
    const redisGet = vi.fn().mockResolvedValue(JSON.stringify(cached))
    const redisSet = vi.fn()
    vi.mocked(getRedisClient).mockReturnValue({
      get: redisGet,
      set: redisSet,
      del: vi.fn(),
    } as never)

    const adminFromSpy = vi.fn()
    vi.mocked(createAdminClient).mockReturnValue({ from: adminFromSpy } as never)

    const value = await getPlatformFeePercentage('AU', 'AUD', null)
    expect(value).toBe(5)
    expect(redisGet).toHaveBeenCalledOnce()
    expect(adminFromSpy).not.toHaveBeenCalled()
  })

  test('cache miss writes through with the configured TTL', async () => {
    const redisGet = vi.fn().mockResolvedValue(null)
    const redisSet = vi.fn()
    vi.mocked(getRedisClient).mockReturnValue({
      get: redisGet,
      set: redisSet,
      del: vi.fn(),
    } as never)

    const calls: CallCapture[] = []
    vi.mocked(createAdminClient).mockReturnValue(
      buildAdminClient(() => buildRule({ value: 7 }), calls)
    )

    const value = await getPlatformFeePercentage('AU', 'AUD', null)
    expect(value).toBe(7)
    expect(redisSet).toHaveBeenCalledOnce()
    const [, , opts] = redisSet.mock.calls[0]
    expect(opts).toMatchObject({ ex: PRICING_RULES_CACHE_TTL_SECONDS })
  })

  test('invalidatePricingRule deletes the cache key for that scope', async () => {
    const redisDel = vi.fn().mockResolvedValue(1)
    vi.mocked(getRedisClient).mockReturnValue({
      get: vi.fn(),
      set: vi.fn(),
      del: redisDel,
    } as never)

    await invalidatePricingRule({
      ruleType: 'platform_fee_percentage',
      countryCode: 'AU',
      currency: 'AUD',
      organisationId: null,
    })

    expect(redisDel).toHaveBeenCalledWith('pr:v1:platform_fee_percentage:AU:AUD:null')
  })

  test('falls back to direct DB read when Redis is unavailable', async () => {
    vi.mocked(getRedisClient).mockReturnValue(null)
    const calls: CallCapture[] = []
    vi.mocked(createAdminClient).mockReturnValue(
      buildAdminClient(() => buildRule({ value: 9 }), calls)
    )

    const value = await getPlatformFeePercentage('AU', 'AUD', null)
    expect(value).toBe(9)
    expect(calls.length).toBeGreaterThan(0)
  })
})
