import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test, vi } from 'vitest'
import { REFUSALS, googleSpendFigure, spendDecision, spendReadFrom, type SpendState } from '@/lib/google/spend-guard-math'
import { withGoogleSpend } from '@/lib/google/spend-guard'

/**
 * THE GOOGLE COST GUARD (the PROJECT MANAGER's 16:52 of 30 October 2026: "a daily quota and a monthly spend cap, the
 * counter on /admin/today"; Google stays OFF until Lawal says). The database decides (google_spend_reserve); these
 * tests pin the pure mirror to the migration's own words, and pin that the call is never made unless it said yes.
 */

const MIGRATION_DIR = 'supabase/migrations'
const migration = (() => {
  const name = readdirSync(MIGRATION_DIR).find((f) => f.endsWith('_google_spend_guard.sql'))
  return name ? readFileSync(join(MIGRATION_DIR, name), 'utf8') : ''
})()

const open: SpendState = { enabled: true, dailyCallQuota: 100, monthlyCapMicros: 50_000_000, unitPriceMicros: 7_000, callsToday: 0, spentThisMonthMicros: 0 }

describe('the decision, in the order the database takes it', () => {
  test('a call reserves at least one unit', () => {
    expect(spendDecision(open, 0)).toEqual({ allowed: false, reason: REFUSALS.units })
  })
  test('Google switched off refuses every call, whatever the limits', () => {
    expect(spendDecision({ ...open, enabled: false }, 1)).toEqual({ allowed: false, reason: REFUSALS.off })
  })
  test('a call with no recorded price is not made', () => {
    expect(spendDecision({ ...open, unitPriceMicros: null }, 1)).toEqual({ allowed: false, reason: REFUSALS.unpriced })
  })
  test("today's quota is a hard ceiling, counted in units", () => {
    expect(spendDecision({ ...open, dailyCallQuota: 10, callsToday: 9 }, 1)).toEqual({ allowed: true, costMicros: 7_000 })
    expect(spendDecision({ ...open, dailyCallQuota: 10, callsToday: 9 }, 2)).toEqual({ allowed: false, reason: REFUSALS.daily })
  })
  test("the month's cap refuses the call that would pass it, not only the one after", () => {
    expect(spendDecision({ ...open, monthlyCapMicros: 14_000, spentThisMonthMicros: 7_000 }, 1)).toEqual({ allowed: true, costMicros: 7_000 })
    expect(spendDecision({ ...open, monthlyCapMicros: 14_000, spentThisMonthMicros: 7_001 }, 1)).toEqual({ allowed: false, reason: REFUSALS.monthly })
  })
  test('the defaults the migration installs refuse everything', () => {
    expect(spendDecision({ ...open, enabled: false, dailyCallQuota: 0, monthlyCapMicros: 0 }, 1)).toEqual({ allowed: false, reason: REFUSALS.off })
    expect(spendDecision({ ...open, dailyCallQuota: 0, monthlyCapMicros: 0 }, 1)).toEqual({ allowed: false, reason: REFUSALS.daily })
  })
})

describe('the migration says the same, and starts shut', () => {
  test('the migration exists', () => {
    expect(migration).not.toBe('')
  })
  test.each(Object.entries(REFUSALS))('the refusal %s is the database\'s own sentence', (_key, sentence) => {
    expect(migration).toContain(`'${sentence.replace(/'/g, "''")}'`)
  })
  test('Google starts OFF with a zero quota and a zero cap', () => {
    expect(migration).toMatch(/enabled boolean not null default false/)
    expect(migration).toMatch(/daily_call_quota integer not null default 0/)
    expect(migration).toMatch(/monthly_cap_micros bigint not null default 0/)
  })
  test('every reservation is serialised on the one settings row', () => {
    expect(migration).toMatch(/from public\.google_spend_settings where id for update/)
  })
  test('only the service role may reserve or read the spend', () => {
    for (const fn of ['google_spend_reserve(text, integer, text)', 'google_spend_state()']) {
      expect(migration).toContain(`revoke all on function public.${fn} from public, anon, authenticated;`)
      expect(migration).toContain(`grant execute on function public.${fn} to service_role;`)
    }
  })
})

describe('the call is made only on the database\'s yes', () => {
  const req = { api: 'places_photo' as const, units: 1, purpose: 'venue photo, Forum Melbourne' }
  type Answer = { data: unknown; error: { message: string } | null }
  const rpcSaying = (answer: Answer) => ({ rpc: vi.fn(async (_fn: string, _args: Record<string, unknown>) => answer) })

  test('a refusal never reaches Google, and says why', async () => {
    const call = vi.fn(async () => 'photo')
    const db = rpcSaying({ data: [{ allowed: false, reason: REFUSALS.off }], error: null })
    expect(await withGoogleSpend(db, req, call)).toEqual({ ok: false, reason: REFUSALS.off })
    expect(call).not.toHaveBeenCalled()
    expect(db.rpc).toHaveBeenCalledWith('google_spend_reserve', { p_api: 'places_photo', p_units: 1, p_purpose: 'venue photo, Forum Melbourne' })
  })
  test('a yes makes the call once', async () => {
    const call = vi.fn(async () => 'photo')
    expect(await withGoogleSpend(rpcSaying({ data: [{ allowed: true, reason: null }], error: null }), req, call)).toEqual({ ok: true, value: 'photo' })
    expect(call).toHaveBeenCalledTimes(1)
  })
  test('a database that cannot answer is a no, never a yes', async () => {
    const call = vi.fn(async () => 'photo')
    const out = await withGoogleSpend(rpcSaying({ data: null, error: { message: 'connection refused' } }), req, call)
    expect(out.ok).toBe(false)
    expect(call).not.toHaveBeenCalled()
  })
  test('an empty answer is a no', async () => {
    const call = vi.fn(async () => 'photo')
    expect((await withGoogleSpend(rpcSaying({ data: [], error: null }), req, call)).ok).toBe(false)
    expect(call).not.toHaveBeenCalled()
  })
})

describe('the counter on /admin/today', () => {
  test('off reads as off, with the limits, every day', () => {
    const f = googleSpendFigure({ enabled: false, dailyCallQuota: 0, monthlyCapMicros: 0, callsToday: 0, spentThisMonthMicros: 0, refusedToday: 0 })
    expect(f.cadence).toBe('daily')
    expect(f.value).toBe(0)
    expect(f.display).toBe("OFF until Lawal says; US$0.00 of a US$0.00 cap this month; 0 of 0 calls today")
  })
  test('a refused call asks for Lawal and is a failure', () => {
    const f = googleSpendFigure({ enabled: true, dailyCallQuota: 200, monthlyCapMicros: 25_000_000, callsToday: 200, spentThisMonthMicros: 3_150_000, refusedToday: 4 })
    expect(f).toMatchObject({ value: 4, asksForAPerson: true, kind: 'failed' })
    expect(f.display).toBe('ON; US$3.15 of a US$25.00 cap this month; 200 of 200 calls today; 4 refused today')
  })
  test("google_spend_state()'s row is read as it comes back, numbers or numeric strings", () => {
    expect(spendReadFrom([{ enabled: false, daily_call_quota: 0, monthly_cap_micros: '0', calls_today: '0', spent_this_month_micros: 0, refused_today: '2' }])).toEqual({
      enabled: false, dailyCallQuota: 0, monthlyCapMicros: 0, callsToday: 0, spentThisMonthMicros: 0, refusedToday: 2,
    })
  })
  test('no row, or a row that is not a number, is not read as 0', () => {
    expect(spendReadFrom([])).toBeNull()
    expect(spendReadFrom(null)).toBeNull()
    expect(spendReadFrom([{ enabled: true, daily_call_quota: 'x', monthly_cap_micros: 0, calls_today: 0, spent_this_month_micros: 0, refused_today: 0 }])).toBeNull()
  })
  test('a spend that could not be read is not counted, never 0', () => {
    const f = googleSpendFigure(null, 'could not be read: no such function')
    expect(f.value).toBeNull()
    expect(f.note).toBe('could not be read: no such function')
  })
})
