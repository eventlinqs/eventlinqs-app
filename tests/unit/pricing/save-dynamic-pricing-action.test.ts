import { beforeEach, describe, expect, test, vi } from 'vitest'

/**
 * saveDynamicPricing reaches the database through ONE call, save_dynamic_pricing,
 * with the steps normalised first. The old three-statement save (toggle,
 * delete, insert) is what the price history triggers cannot tolerate, and the
 * guard refuses it in source; this proves the action's behaviour against a
 * mocked admin client: what it sends, what it refuses, and what it revalidates.
 */
const rpc = vi.fn()
const revalidatePath = vi.fn()
const revalidateEventSurfacesById = vi.fn()
const resolveEventAccess = vi.fn()
let sessionUser: { id: string } | null = { id: 'user-1' }

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ rpc }),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: sessionUser } }) },
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          single: async () =>
            table === 'ticket_tiers'
              ? { data: { id: 'tier-1', event_id: 'event-1' }, error: null }
              : { data: { id: 'event-1', organisation_id: 'org-1' }, error: null },
        }),
      }),
    }),
  }),
}))

vi.mock('next/cache', () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }))
vi.mock('@/lib/events/revalidate-event', () => ({
  revalidateEventSurfacesById: (...a: unknown[]) => revalidateEventSurfacesById(...a),
}))
vi.mock('@/lib/organisations/event-access', () => ({
  resolveEventAccess: (...a: unknown[]) => resolveEventAccess(...a),
}))

const { saveDynamicPricing } = await import('@/app/actions/dynamic-pricing')

const VALID = {
  tier_id: '11111111-1111-4111-8111-111111111111',
  event_id: '22222222-2222-4222-8222-222222222222',
  enabled: true,
  steps: [
    { step_order: 1, capacity_threshold_percent: 100, price_cents: 4000 },
    { step_order: 2, capacity_threshold_percent: 25, price_cents: 2800 },
  ],
}

beforeEach(() => {
  rpc.mockReset()
  revalidatePath.mockReset()
  revalidateEventSurfacesById.mockReset()
  resolveEventAccess.mockReset()
  resolveEventAccess.mockResolvedValue({ allowed: true })
  rpc.mockResolvedValue({ data: 2, error: null })
  sessionUser = { id: 'user-1' }
})

describe('saveDynamicPricing', () => {
  test('sends the normalised steps to save_dynamic_pricing in one call and revalidates the public page', async () => {
    const result = await saveDynamicPricing(VALID)
    expect(result).toEqual({ success: true })
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('save_dynamic_pricing', {
      p_tier_id: VALID.tier_id,
      p_enabled: true,
      p_steps: [
        { step_order: 1, capacity_threshold_percent: 25, price_cents: 2800 },
        { step_order: 2, capacity_threshold_percent: 100, price_cents: 4000 },
      ],
    })
    expect(revalidatePath).toHaveBeenCalledWith(`/dashboard/events/${VALID.event_id}/pricing`)
    expect(revalidateEventSurfacesById).toHaveBeenCalledWith(expect.anything(), VALID.event_id)
  })

  /*
   * THIS ASSERTION IS REVERSED FROM WHAT IT SAID BEFORE, AND THE REVERSAL IS
   * THE FIX. LB-PRICEWHOLE, 20 September 2026.
   *
   * It used to read "switching dynamic pricing off sends no steps" and asserted
   * `p_steps: []`. That was a faithful description of the code and a pin on a
   * data-loss defect: `save_dynamic_pricing` deleted every rule for the tier
   * BEFORE deciding whether to insert any, so an empty list meant the
   * organiser's whole price ladder was destroyed the moment they turned the
   * switch off and pressed Save. Nothing on the screen said so, the steps were
   * hidden as soon as the switch moved, and turning it back on showed a single
   * step at the base price, which reads as "this tier never had a ladder".
   *
   * Pausing a price ladder for a weekend is an ordinary thing to want. The
   * steps are now sent whatever the switch says, so a paused ladder is stored
   * and comes back; migration 20260920000040 also makes the database read an
   * empty list as an absence of instruction rather than as an instruction to
   * delete, so an older caller cannot reopen it either.
   */
  test('switching dynamic pricing off keeps the ladder and sends the steps', async () => {
    await saveDynamicPricing({ ...VALID, enabled: false })
    expect(rpc).toHaveBeenCalledWith('save_dynamic_pricing', {
      p_tier_id: VALID.tier_id,
      p_enabled: false,
      p_steps: [
        { step_order: 1, capacity_threshold_percent: 25, price_cents: 2800 },
        { step_order: 2, capacity_threshold_percent: 100, price_cents: 4000 },
      ],
    })
  })

  test('a database refusal is reported and nothing is revalidated', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'function not found' } })
    const result = await saveDynamicPricing(VALID)
    expect(result).toEqual({ success: false, error: 'Failed to save pricing steps' })
    expect(revalidateEventSurfacesById).not.toHaveBeenCalled()
    expect(error.mock.calls[0][1]).toMatchObject({ code: 'PGRST202', hint: expect.stringContaining('20260904000002') })
    error.mockRestore()
  })

  test('a caller without access to the event is refused before any write', async () => {
    resolveEventAccess.mockResolvedValue({ allowed: false })
    const result = await saveDynamicPricing(VALID)
    expect(result).toEqual({ success: false, error: 'Access denied' })
    expect(rpc).not.toHaveBeenCalled()
  })

  test('no session is refused before any read', async () => {
    sessionUser = null
    const result = await saveDynamicPricing(VALID)
    expect(result).toEqual({ success: false, error: 'Not authenticated' })
    expect(rpc).not.toHaveBeenCalled()
  })

  test('a malformed input never reaches the database', async () => {
    const result = await saveDynamicPricing({ ...VALID, steps: [] })
    expect(result.success).toBe(false)
    expect(rpc).not.toHaveBeenCalled()
  })
})
