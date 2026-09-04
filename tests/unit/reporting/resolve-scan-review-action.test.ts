import { beforeEach, describe, expect, test, vi } from 'vitest'

/**
 * resolveScanReview against a mocked session client: identity first, then the
 * shared event gate, then the RPC, then the page revalidation. The RPC's own
 * refusals are proven on TEST by scripts/verify/offline-door-schema-verify.mjs.
 */
const rpc = vi.fn()
const revalidatePath = vi.fn()
const resolveEventAccess = vi.fn()
let sessionUser: { id: string } | null = { id: 'organiser-1' }

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: sessionUser } }) },
    rpc,
  }),
}))
vi.mock('next/cache', () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }))
vi.mock('@/lib/organisations/event-access', () => ({
  resolveEventAccess: (...a: unknown[]) => resolveEventAccess(...a),
}))

const { resolveScanReview } = await import('@/app/(dashboard)/dashboard/events/[id]/attendees/actions')

const EVENT = '22222222-2222-4222-8222-222222222222'
const SCAN = '33333333-3333-4333-8333-333333333333'

beforeEach(() => {
  rpc.mockReset()
  revalidatePath.mockReset()
  resolveEventAccess.mockReset()
  resolveEventAccess.mockResolvedValue({ allowed: true })
  rpc.mockResolvedValue({ data: true, error: null })
  sessionUser = { id: 'organiser-1' }
})

describe('resolveScanReview', () => {
  test('refuses without a session, before the gate and the RPC', async () => {
    sessionUser = null
    expect(await resolveScanReview(EVENT, SCAN, 'note')).toEqual({ ok: false, error: 'Sign in to review door scans.' })
    expect(resolveEventAccess).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalled()
  })

  test('refuses when the event gate refuses, and never calls the RPC', async () => {
    resolveEventAccess.mockResolvedValue({ allowed: false, reason: 'not_authorised' })
    const answer = await resolveScanReview(EVENT, SCAN, 'note')
    expect(answer.ok).toBe(false)
    expect(rpc).not.toHaveBeenCalled()
  })

  test('calls resolve_scan_review with the trimmed note, then revalidates the attendees page', async () => {
    expect(await resolveScanReview(EVENT, SCAN, '  Same guest, second door  ')).toEqual({ ok: true })
    expect(rpc).toHaveBeenCalledWith('resolve_scan_review', { p_scan_id: SCAN, p_note: 'Same guest, second door' })
    expect(revalidatePath).toHaveBeenCalledWith(`/dashboard/events/${EVENT}/attendees`)
  })

  test('an empty note is sent as null and a long one is cut at 500 characters', async () => {
    await resolveScanReview(EVENT, SCAN, '   ')
    expect(rpc).toHaveBeenLastCalledWith('resolve_scan_review', { p_scan_id: SCAN, p_note: null })
    await resolveScanReview(EVENT, SCAN, 'x'.repeat(600))
    expect((rpc.mock.calls.at(-1)?.[1] as { p_note: string }).p_note).toHaveLength(500)
  })

  test('a scan that is no longer waiting is said so, without revalidating', async () => {
    rpc.mockResolvedValue({ data: false, error: null })
    expect(await resolveScanReview(EVENT, SCAN, '')).toEqual({ ok: false, error: 'That scan is not waiting for review any more.' })
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  test("names the RPC's refusal", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'not_authorised', code: '42501' } })
    expect(await resolveScanReview(EVENT, SCAN, '')).toEqual({ ok: false, error: 'You are not authorised to review scans for this event.' })
    rpc.mockResolvedValue({ data: null, error: { message: 'connection reset', code: '08006' } })
    expect(await resolveScanReview(EVENT, SCAN, '')).toEqual({ ok: false, error: 'The scan could not be marked resolved (08006: connection reset).' })
  })
})
