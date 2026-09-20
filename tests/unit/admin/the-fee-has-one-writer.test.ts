import { beforeEach, describe, expect, test, vi } from 'vitest'

/**
 * LB-OVERRIDE0. THE PLATFORM FEE HAS EXACTLY ONE WRITER.
 *
 * uq_pricing_rules_one_open_per_scope (migration 20260727000002) states the
 * obligation in its own COMMENT: "Writers must stamp the previous row before
 * inserting the next version." No writer was changed that day, so from 27 July
 * 2026 writePricingField inserted a row with effective_until NULL, left the
 * previous row open, and every save on /admin/pricing was refused by the index.
 * Driven against TEST before this was rewritten:
 *
 *   insert ... ('platform_fee_percentage','AU','AUD',...,4,now(),null,7.5)
 *   ERROR: 23505 duplicate key ... "uq_pricing_rules_one_open_per_scope"
 *
 * Closing the old row and inserting the new one cannot be two calls from here:
 * supabase-js has no transaction, so between them the scope has no open row and
 * the resolver reads through to the next precedence level. These tests hold the
 * TypeScript half of the contract: that the write goes through the database
 * function, with the scope and the value in the right parameters, and that the
 * audit trail records what the database actually did rather than what this file
 * hoped it would do.
 */

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))
vi.mock('@/lib/admin/audit', () => ({ recordAuditEvent: vi.fn(async () => {}) }))
vi.mock('@/lib/payments/pricing-rules', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/payments/pricing-rules')>()),
  invalidatePricingRule: vi.fn(async () => {}),
}))

import { createAdminClient } from '@/lib/supabase/admin'
import { recordAuditEvent } from '@/lib/admin/audit'
import { invalidatePricingRule } from '@/lib/payments/pricing-rules'
import { writePricingField } from '@/lib/admin/pricing'
import type { AdminSession } from '@/lib/admin/types'

const SESSION = {
  userId: 'ad000000-0000-4000-8000-00000000000b',
  email: 'lane-b@eventlinqs.test',
  admin: {} as AdminSession['admin'],
  capabilities: ['admin.pricing.manage'],
} as AdminSession

/** The last rpc() call, and a `from` that fails loudly if anything reaches it. */
function fakeClient(result: { data: unknown; error: { message: string } | null }) {
  // Typed with its parameters, so `rpc.mock.calls[0][1]` is the argument object
  // rather than an empty tuple: the whole point of these tests is WHAT is sent.
  const rpc = vi.fn(async (_name: string, _args: Record<string, unknown>) => result)
  const from = vi.fn(() => {
    throw new Error('a direct table call reached the fee writer; the one writer is the rpc')
  })
  ;(createAdminClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue({ rpc, from })
  return { rpc, from }
}

const OK = (over: Record<string, unknown> = {}) => ({
  data: { changed: true, old_value: 3.5, new_value: 4.75, version: 4, ...over },
  error: null,
})

beforeEach(() => {
  vi.clearAllMocks()
})

describe('writePricingField goes through the one lawful writer', () => {
  test('writes through rpc(write_pricing_rule) and never touches the table directly', async () => {
    const { rpc, from } = fakeClient(OK())

    const res = await writePricingField(
      { field: 'platform_fee_percentage', countryCode: 'AU', currency: 'AUD', value: 4.75 },
      SESSION,
    )

    expect(res).toEqual({ ok: true, changed: true })
    expect(from).not.toHaveBeenCalled()
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc.mock.calls[0][0]).toBe('write_pricing_rule')
  })

  test('a region default carries no organisation and no event', async () => {
    const { rpc } = fakeClient(OK())
    await writePricingField(
      { field: 'platform_fee_percentage', countryCode: 'AU', currency: 'AUD', value: 4.75 },
      SESSION,
    )
    /*
     * THE OPTIONAL ARGUMENTS ARE ABSENT, NOT NULL, AND THE DIFFERENCE IS THE
     * MECHANISM.
     *
     * These four used to assert `p_organisation_id: null`. Since migration
     * 20260920000011 the five optional arguments carry `default null` in the
     * database, and supabase-js OMITS an undefined key from the JSON body, so
     * PostgREST does not name the argument and Postgres applies the default.
     * The value that reaches the column is NULL either way; asserting the key
     * is absent is what pins the route by which it gets there.
     *
     * `toMatchObject` with an expected `undefined` would pass on an absent key
     * too, which is why absence is asserted separately and explicitly.
     */
    const args = rpc.mock.calls[0][1]
    expect(args).toMatchObject({
      p_rule_type: 'platform_fee_percentage',
      p_country_code: 'AU',
      p_currency: 'AUD',
      p_value_type: 'percentage',
      p_value_percentage: 4.75,
      p_created_by: SESSION.userId,
    })
    for (const absent of ['p_organisation_id', 'p_event_id', 'p_value_cents', 'p_value_integer']) {
      expect(args[absent], `${absent} must be omitted so the database default applies`).toBeUndefined()
    }
  })

  test('an event override outranks an organisation passed alongside it', async () => {
    const { rpc } = fakeClient(OK())
    await writePricingField(
      {
        field: 'platform_fee_percentage',
        countryCode: 'AU',
        currency: 'AUD',
        value: 1.5,
        scope: { organisationId: 'a1000000-0000-4000-8000-000000000001', eventId: 'e1000000-0000-4000-8000-000000000009' },
      },
      SESSION,
    )
    // Event wins, and the organisation is cleared rather than sent alongside:
    // the resolver matches an event rule on (rule_type, event_id) ALONE, so a
    // row carrying both would be closed by one scope and read by another.
    const args = rpc.mock.calls[0][1]
    expect(args).toMatchObject({ p_event_id: 'e1000000-0000-4000-8000-000000000009' })
    expect(
      args.p_organisation_id,
      'the organisation is CLEARED, which is now an omitted key rather than an explicit null',
    ).toBeUndefined()
  })

  test('a fixed fee goes to value_cents as a whole number, never to the percentage', async () => {
    const { rpc } = fakeClient(OK({ old_value: 99, new_value: 120 }))
    await writePricingField(
      { field: 'platform_fee_fixed', countryCode: 'AU', currency: 'AUD', value: 119.6 },
      SESSION,
    )
    const args = rpc.mock.calls[0][1]
    expect(args).toMatchObject({ p_value_type: 'fixed', p_value_cents: 120 })
    expect(args.p_value_percentage).toBeUndefined()
    expect(args.p_value_integer).toBeUndefined()
  })

  test('who carries the fee goes to value_integer', async () => {
    const { rpc } = fakeClient(OK({ old_value: 1, new_value: 0 }))
    await writePricingField(
      { field: 'processing_fee_pass_through', countryCode: 'AU', currency: 'AUD', value: 0 },
      SESSION,
    )
    const args = rpc.mock.calls[0][1]
    expect(args).toMatchObject({ p_value_type: 'integer', p_value_integer: 0 })
    expect(args.p_value_percentage).toBeUndefined()
    expect(args.p_value_cents).toBeUndefined()
  })
})

describe('what the database decided is what gets recorded', () => {
  test('an unchanged value is not audited and does not invalidate the cache', async () => {
    fakeClient({ data: { changed: false, old_value: 3.5, new_value: 3.5, version: null }, error: null })

    const res = await writePricingField(
      { field: 'platform_fee_percentage', countryCode: 'AU', currency: 'AUD', value: 3.5 },
      SESSION,
    )

    expect(res).toEqual({ ok: true, changed: false })
    expect(recordAuditEvent).not.toHaveBeenCalled()
    expect(invalidatePricingRule).not.toHaveBeenCalled()
  })

  test('the audit entry carries the old value and version the database returned', async () => {
    fakeClient(OK({ old_value: 2.5, new_value: 3.5, version: 7 }))

    await writePricingField(
      { field: 'platform_fee_percentage', countryCode: 'AU', currency: 'AUD', value: 3.5 },
      SESSION,
    )

    const call = (recordAuditEvent as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(call.action).toBe('admin.pricing.updated')
    expect(call.metadata).toMatchObject({ oldValue: 2.5, newValue: 3.5, version: 7, scope: 'region' })
  })

  test('a refusal from the database is surfaced, not swallowed', async () => {
    fakeClient({
      data: null,
      error: { message: 'duplicate key value violates unique constraint "uq_pricing_rules_one_open_per_scope"' },
    })

    const res = await writePricingField(
      { field: 'platform_fee_percentage', countryCode: 'AU', currency: 'AUD', value: 9 },
      SESSION,
    )

    expect(res.ok).toBe(false)
    expect(res.error).toContain('uq_pricing_rules_one_open_per_scope')
    expect(recordAuditEvent).not.toHaveBeenCalled()
  })

  test('no result at all is a failure rather than a silent success', async () => {
    // A null body with no error is the shape a dropped grant produces. Reading
    // it as "nothing changed" would report a saved fee that was never written.
    fakeClient({ data: null, error: null })

    const res = await writePricingField(
      { field: 'platform_fee_percentage', countryCode: 'AU', currency: 'AUD', value: 9 },
      SESSION,
    )

    expect(res.ok).toBe(false)
    expect(res.changed).toBe(false)
    expect(recordAuditEvent).not.toHaveBeenCalled()
  })
})
