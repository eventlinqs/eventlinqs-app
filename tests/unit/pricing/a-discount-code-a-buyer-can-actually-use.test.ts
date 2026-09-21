import { describe, expect, test, vi } from 'vitest'

import {
  DISCOUNT_UNCHECKABLE,
  validateDiscountCodeWith,
} from '@/lib/pricing/discount-validation'

/**
 * LB-CODEBLINK. THE BUYER-FACING DISCOUNT CHECK.
 *
 * THREE DEFECTS THESE PIN, all found on 21 September 2026 and two of them
 * driven on the real checkout screen at 390, 768 and 1440 before any of this
 * was written.
 *
 *   1. EVERY CODE ON THE PLATFORM WAS DEAD. The check ran on the SESSION
 *      client, and `discount_codes` admits only org members and the service
 *      role while `discount_code_usages` admits only the service role. Both
 *      read zero rows for a buyer, so a live code came back "Invalid discount
 *      code" and the per-user cap counted zero for everybody. That half is held
 *      by the action-level tests at the foot of this file and by clause 4 of
 *      the guard; the reader itself cannot see which client it was handed.
 *   2. THE CAP BELIEVED THE BROWSER about who the buyer was.
 *   3. A DROPPED SOCKET ANSWERED BOTH READS, in opposite directions: the cap
 *      failed OPEN and granted a spent discount, the lookup failed CLOSED and
 *      called a live code fake.
 *
 * THE FAKE CLIENT IS SHAPED LIKE supabase-js RATHER THAN LIKE THE HAPPY PATH.
 * A PostgREST failure is not a thrown error: it RESOLVES as `{ data: null,
 * error, count: null }`, which is the entire reason `?? 0` was able to turn a
 * dropped socket into zero past uses. A mock that threw would have made the old
 * code look correct.
 */

/*
 * THE NULLABLE COLUMNS CARRY THEIR TYPES EXPLICITLY. Without them TypeScript
 * infers `valid_until: null` from this literal, and a case that overrides it
 * with a date does not compile. The table allows both, so the fixture must.
 */
const CODE_ROW: {
  id: string
  code: string
  event_id: string
  organisation_id: string
  discount_type: string
  discount_percentage: number | null
  discount_amount_cents: number | null
  is_active: boolean
  valid_from: string | null
  valid_until: string | null
  max_uses: number | null
  max_uses_per_user: number
  current_uses: number
  reserved_uses: number
  min_order_amount_cents: number | null
  applicable_tier_ids: string[] | null
  currency: string | null
  created_at: string
  updated_at: string
} = {
  id: 'dc-1',
  code: 'LANEB20',
  event_id: 'event-1',
  organisation_id: 'org-1',
  discount_type: 'percentage',
  discount_percentage: 20,
  discount_amount_cents: null,
  is_active: true,
  valid_from: null,
  valid_until: null,
  max_uses: null,
  max_uses_per_user: 1,
  current_uses: 0,
  reserved_uses: 0,
  min_order_amount_cents: null,
  applicable_tier_ids: null,
  currency: null,
  created_at: '2026-09-01T00:00:00.000Z',
  updated_at: '2026-09-01T00:00:00.000Z',
}

/** The shape supabase-js hands back when a socket drops mid-request. */
const SOCKET_DROPPED = {
  message: 'TypeError: fetch failed',
  details: 'Caused by: SocketError: other side closed (UND_ERR_SOCKET)',
  hint: '',
  code: '',
}

type Outcome =
  | { kind: 'row'; row: typeof CODE_ROW | null }
  | { kind: 'error' }

type CountOutcome =
  | { kind: 'count'; count: number }
  | { kind: 'error' }

/**
 * A client that answers the two reads by table, counts how many times each was
 * asked, and NEVER throws. The retry inside the reader makes a second real
 * request, so the call counts are what prove the retry ran rather than a
 * comment claiming it does.
 */
function fakeClient(lookup: Outcome, cap: CountOutcome) {
  const asked = { discount_codes: 0, discount_code_usages: 0 }
  const client = {
    from(table: string) {
      const chain = {
        select: () => chain,
        eq: () => chain,
        then(resolve: (v: unknown) => unknown) {
          asked.discount_code_usages += 1
          return Promise.resolve(
            cap.kind === 'error'
              ? { data: null, error: SOCKET_DROPPED, count: null }
              : { data: null, error: null, count: cap.count },
          ).then(resolve)
        },
        maybeSingle: async () => {
          asked.discount_codes += 1
          return lookup.kind === 'error'
            ? { data: null, error: SOCKET_DROPPED }
            : { data: lookup.row, error: null }
        },
      }
      void table
      return chain
    },
  }
  return { client, asked }
}

const INPUT = {
  code: 'laneb20',
  event_id: 'event-1',
  user_id: 'buyer-1' as string | null,
  order_subtotal_cents: 5000,
  tier_ids: ['tier-1'],
}

async function validate(
  lookup: Outcome,
  cap: CountOutcome,
  overrides: Partial<typeof INPUT> = {},
) {
  const { client, asked } = fakeClient(lookup, cap)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = await validateDiscountCodeWith(client as any, { ...INPUT, ...overrides })
  return { result, asked }
}

describe('the healthy answers, so a refusal under a blink proves something', () => {
  test('a live code the buyer has never used is granted, with the amount', async () => {
    const { result } = await validate({ kind: 'row', row: CODE_ROW }, { kind: 'count', count: 0 })
    expect(result.valid).toBe(true)
    expect(result.discount_cents).toBe(1000)
    expect(result.discount_code_id).toBe('dc-1')
  })

  test('a code the buyer has already spent is refused, naming the spend', async () => {
    const { result } = await validate({ kind: 'row', row: CODE_ROW }, { kind: 'count', count: 1 })
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/already used this code/i)
  })

  test('a code that genuinely does not exist is still called invalid', async () => {
    const { result } = await validate({ kind: 'row', row: null }, { kind: 'count', count: 0 })
    expect(result.valid).toBe(false)
    expect(result.error).toBe('Invalid discount code')
    expect(result.error).not.toBe(DISCOUNT_UNCHECKABLE)
  })

  test('a guest with no session is never asked about a per-user cap', async () => {
    const { result, asked } = await validate(
      { kind: 'row', row: CODE_ROW },
      { kind: 'count', count: 99 },
      { user_id: null },
    )
    expect(asked.discount_code_usages).toBe(0)
    expect(result.valid).toBe(true)
  })
})

describe('the per-user cap fails CLOSED, because granting is giving away money', () => {
  test('a blinked cap read refuses rather than granting the spent discount again', async () => {
    const { result } = await validate({ kind: 'row', row: CODE_ROW }, { kind: 'error' })
    expect(result.valid).toBe(false)
    expect(result.discount_cents).toBe(0)
  })

  test('and it says it could not check, accusing neither the buyer nor the code', async () => {
    const { result } = await validate({ kind: 'row', row: CODE_ROW }, { kind: 'error' })
    expect(result.error).toBe(DISCOUNT_UNCHECKABLE)
    expect(result.error).not.toMatch(/invalid discount code/i)
    expect(result.error).not.toMatch(/already used/i)
  })

  test('the cap read is RETRIED before it is believed, so one dropped socket is not a verdict', async () => {
    const { asked } = await validate({ kind: 'row', row: CODE_ROW }, { kind: 'error' })
    expect(asked.discount_code_usages).toBeGreaterThan(1)
  })

  /*
   * THE EXACT OLD SHAPE, AS ARITHMETIC. `count` arrives null, `?? 0` makes it
   * zero, and zero is below every cap an organiser can set, which is why this
   * failed open on EVERY configuration rather than on an unlucky one.
   */
  test.each([1, 2, 5, 100])('a null count is under a cap of %i, which is why null may never be read as zero', cap => {
    const count: number | null = null
    expect((count ?? 0) >= cap).toBe(false)
  })
})

describe('the code lookup fails CLOSED, and says something true', () => {
  test('a blinked lookup does not call a live code invalid', async () => {
    const { result } = await validate({ kind: 'error' }, { kind: 'count', count: 0 })
    expect(result.error).not.toMatch(/invalid discount code/i)
  })

  test('a blinked lookup says it could not check, and grants nothing', async () => {
    const { result } = await validate({ kind: 'error' }, { kind: 'count', count: 0 })
    expect(result.valid).toBe(false)
    expect(result.discount_cents).toBe(0)
    expect(result.error).toBe(DISCOUNT_UNCHECKABLE)
  })

  test('a blinked lookup never reaches the cap read, because there is no code to cap', async () => {
    const { asked } = await validate({ kind: 'error' }, { kind: 'count', count: 0 })
    expect(asked.discount_code_usages).toBe(0)
  })

  test('the lookup is RETRIED before it is believed', async () => {
    const { asked } = await validate({ kind: 'error' }, { kind: 'count', count: 0 })
    expect(asked.discount_codes).toBeGreaterThan(1)
  })
})

describe('the rest of the ladder still refuses for its own reasons', () => {
  test('an inactive code is refused before either cap is consulted', async () => {
    const { result, asked } = await validate(
      { kind: 'row', row: { ...CODE_ROW, is_active: false } },
      { kind: 'error' },
    )
    expect(result.error).toMatch(/no longer active/i)
    expect(asked.discount_code_usages).toBe(0)
  })

  test('an expired code is refused, and not as a read failure', async () => {
    const { result } = await validate(
      { kind: 'row', row: { ...CODE_ROW, valid_until: '2020-01-01T00:00:00.000Z' } },
      { kind: 'count', count: 0 },
    )
    expect(result.error).toMatch(/expired/i)
    expect(result.error).not.toBe(DISCOUNT_UNCHECKABLE)
  })

  test('the global cap counts held uses as well as confirmed ones', async () => {
    const { result } = await validate(
      { kind: 'row', row: { ...CODE_ROW, max_uses: 2, current_uses: 1, reserved_uses: 1 } },
      { kind: 'count', count: 0 },
    )
    expect(result.error).toMatch(/usage limit/i)
  })
})

/**
 * THE ACTION. These are the half the reader cannot prove about itself: WHICH
 * client it is handed, and WHOSE identity decides the cap.
 */
describe('the buyer-facing action', () => {
  test('hands the reader the service-role client and the SESSION user, ignoring the caller claim', async () => {
    vi.resetModules()
    const seen: Array<{ client: unknown; user_id: string | null }> = []
    const adminMarker = { iAm: 'admin' }

    vi.doMock('@/lib/supabase/admin', () => ({ createAdminClient: () => adminMarker }))
    vi.doMock('@/lib/supabase/server', () => ({
      createClient: async () => ({
        auth: { getUser: async () => ({ data: { user: { id: 'session-buyer' } } }) },
      }),
    }))
    vi.doMock('next/cache', () => ({ revalidatePath: () => {} }))
    vi.doMock('@/lib/pricing/discount-validation', () => ({
      validateDiscountCodeWith: async (client: unknown, input: { user_id: string | null }) => {
        seen.push({ client, user_id: input.user_id })
        return { valid: true, discount_cents: 0 }
      },
    }))

    const { validateDiscountCode } = await import('@/app/actions/discount-codes')
    /*
     * THE THIRD ARGUMENT IS THE ATTACK. A client component supplies it, so a
     * browser can send a stranger's id, or a fresh one, and the per-user cap is
     * held nowhere else on the platform.
     */
    await validateDiscountCode('LANEB20', 'event-1', 'an-id-the-browser-chose', 5000, ['tier-1'])

    expect(seen).toHaveLength(1)
    expect(seen[0].client).toBe(adminMarker)
    expect(seen[0].user_id).toBe('session-buyer')
    expect(seen[0].user_id).not.toBe('an-id-the-browser-chose')

    vi.doUnmock('@/lib/pricing/discount-validation')
    vi.doUnmock('@/lib/supabase/admin')
    vi.doUnmock('@/lib/supabase/server')
    vi.resetModules()
  })

  test('passes null for a guest, rather than whatever the browser sent', async () => {
    vi.resetModules()
    const seen: Array<string | null> = []

    vi.doMock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))
    vi.doMock('@/lib/supabase/server', () => ({
      createClient: async () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }),
    }))
    vi.doMock('next/cache', () => ({ revalidatePath: () => {} }))
    vi.doMock('@/lib/pricing/discount-validation', () => ({
      validateDiscountCodeWith: async (_client: unknown, input: { user_id: string | null }) => {
        seen.push(input.user_id)
        return { valid: true, discount_cents: 0 }
      },
    }))

    const { validateDiscountCode } = await import('@/app/actions/discount-codes')
    await validateDiscountCode('LANEB20', 'event-1', 'still-not-trusted', 5000, ['tier-1'])

    expect(seen).toEqual([null])

    vi.doUnmock('@/lib/pricing/discount-validation')
    vi.doUnmock('@/lib/supabase/admin')
    vi.doUnmock('@/lib/supabase/server')
    vi.resetModules()
  })
})

/**
 * THE ORGANISER SIDE OF THE SAME FILE. All three of these functions opened
 * with a read whose error was discarded and whose empty answer became a
 * statement of fact, so a dropped socket told an organiser that their own
 * event, or a code they were looking at a second earlier, did not exist.
 *
 * THE FAKE CLIENT ANSWERS THE READ AND NOTHING ELSE. Each test asserts the
 * SENTENCE, because the whole defect was which sentence a failure borrowed.
 */
describe('the organiser-facing functions', () => {
  async function withRead(outcome: { kind: 'row'; row: unknown } | { kind: 'error' }) {
    vi.resetModules()
    /*
     * THE WRITE ARMS ARE PART OF THE FIXTURE, not decoration. Two of these
     * functions go on to UPDATE or DELETE after the read, and a chain that
     * stops at the read makes the happy path throw, which would have hidden
     * whether the delete refusal fires at all.
     */
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: () => chain,
      update: () => chain,
      delete: () => chain,
      then: (resolve: (v: unknown) => unknown) => Promise.resolve({ error: null }).then(resolve),
      maybeSingle: async () =>
        outcome.kind === 'error'
          ? { data: null, error: SOCKET_DROPPED }
          : { data: outcome.row, error: null },
    }
    vi.doMock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))
    vi.doMock('@/lib/supabase/server', () => ({
      createClient: async () => ({
        auth: { getUser: async () => ({ data: { user: { id: 'organiser-1' } } }) },
        from: () => chain,
      }),
    }))
    vi.doMock('next/cache', () => ({ revalidatePath: () => {} }))
    vi.doMock('@/lib/organisations/event-access', () => ({
      resolveEventAccess: async () => ({ allowed: true }),
    }))
    return import('@/app/actions/discount-codes')
  }

  test('a blinked read never tells an organiser their own code is not there', async () => {
    const { updateDiscountCode } = await withRead({ kind: 'error' })
    const result = await updateDiscountCode('dc-1', { is_active: false })
    expect(result.error).not.toMatch(/not found/i)
    expect(result.error).toMatch(/could not reach the database/i)
  })

  test('and a code that genuinely is not there is still called not found', async () => {
    const { updateDiscountCode } = await withRead({ kind: 'row', row: null })
    const result = await updateDiscountCode('dc-1', { is_active: false })
    expect(result.error).toBe('Discount code not found')
  })

  test('a blinked read never tells an organiser their own event does not exist', async () => {
    const { createDiscountCode } = await withRead({ kind: 'error' })
    const result = await createDiscountCode({
      event_id: '22222222-2222-4222-8222-222222222222',
      code: 'LANEB20',
      discount_type: 'percentage',
      discount_value: 20,
      max_uses_per_user: 1,
      is_active: true,
    })
    expect(result.error).not.toMatch(/not found/i)
    expect(result.error).toMatch(/could not reach the database/i)
  })

  /*
   * A HELD USE IS A USE. reserved_uses moves the moment a buyer applies the
   * code and current_uses only when their order confirms, so a delete that
   * reads one of the two removes a code out from under somebody mid-checkout:
   * discount_code_claims cascades and orders.discount_code_id is set null.
   */
  test('a code a buyer is HOLDING right now cannot be deleted', async () => {
    const { deleteDiscountCode } = await withRead({
      kind: 'row',
      row: { event_id: 'event-1', organisation_id: 'org-1', current_uses: 0, reserved_uses: 1 },
    })
    const result = await deleteDiscountCode('dc-1')
    expect(result.error).toMatch(/cannot delete a code that has been used/i)
  })

  test('a code nobody has used or is holding can still be deleted', async () => {
    const { deleteDiscountCode } = await withRead({
      kind: 'row',
      row: { event_id: 'event-1', organisation_id: 'org-1', current_uses: 0, reserved_uses: 0 },
    })
    const result = await deleteDiscountCode('dc-1')
    expect(result.error).toBeUndefined()
  })
})
