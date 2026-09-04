import { beforeEach, describe, expect, test, vi } from 'vitest'
import { DOOR_SET_PAGE_SIZE } from '@/lib/scanner/door-types'

/**
 * The two offline-door actions against a mocked session client: what they send
 * to the RPCs, how they map the answers, and what they refuse. The RPCs
 * themselves are proven on TEST by scripts/verify/offline-door-schema-verify.mjs.
 */
const rpc = vi.fn()
let sessionUser: { id: string } | null = { id: 'staff-1' }

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: sessionUser } }) },
    rpc,
  }),
}))

const { downloadValidationPage, syncOfflineScans } = await import('@/app/scan/actions')

const EVENT = '22222222-2222-4222-8222-222222222222'

function row(i: number, over: Record<string, unknown> = {}) {
  return {
    ticket_id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    ticket_code: `EL-2345-${6789 + i}`,
    secret_hash: 'a'.repeat(64),
    status: 'valid',
    holder_name: `Guest ${i}`,
    tier_name: 'General admission',
    seat_label: null,
    first_scanned_at: null,
    ...over,
  }
}

beforeEach(() => {
  rpc.mockReset()
  sessionUser = { id: 'staff-1' }
})

describe('downloadValidationPage', () => {
  test('asks door_validation_set for one page after the given code, and maps the rows', async () => {
    rpc.mockResolvedValue({ data: [row(1), row(2, { status: 'scanned', first_scanned_at: '2026-09-05T09:00:00.000Z', seat_label: 'Stalls Row A Seat 12' })], error: null })
    const page = await downloadValidationPage(EVENT, 'EL-2345-6000')
    expect(rpc).toHaveBeenCalledWith('door_validation_set', { p_event_id: EVENT, p_after_code: 'EL-2345-6000', p_limit: DOOR_SET_PAGE_SIZE })
    expect(page.ok).toBe(true)
    if (!page.ok) return
    expect(page.done).toBe(true)
    expect(page.rows[0]).toEqual({
      ticketId: '00000000-0000-4000-8000-000000000001',
      ticketCode: 'EL-2345-6790',
      secretHash: 'a'.repeat(64),
      status: 'valid',
      holderName: 'Guest 1',
      tierName: 'General admission',
      seatLabel: null,
      firstScannedAt: null,
      admittedLocallyAt: null,
    })
    expect(page.rows[1]).toMatchObject({ status: 'scanned', firstScannedAt: '2026-09-05T09:00:00.000Z', seatLabel: 'Stalls Row A Seat 12' })
    expect(JSON.stringify(page)).not.toMatch(/"secret"/)
  })

  test('a full page is not done', async () => {
    rpc.mockResolvedValue({ data: Array.from({ length: DOOR_SET_PAGE_SIZE }, (_, i) => row(i)), error: null })
    const page = await downloadValidationPage(EVENT, null)
    expect(page.ok && page.done).toBe(false)
  })

  test('a status the device does not know is carried as void, never as valid', async () => {
    rpc.mockResolvedValue({ data: [row(1, { status: 'mystery' })], error: null })
    const page = await downloadValidationPage(EVENT, null)
    expect(page.ok && page.rows[0].status).toBe('void')
  })

  test('refuses without a session and never calls the RPC', async () => {
    sessionUser = null
    const page = await downloadValidationPage(EVENT, null)
    expect(page).toEqual({ ok: false, error: 'Sign in to download the door list.' })
    expect(rpc).not.toHaveBeenCalled()
  })

  test('names the refusal when the RPC refuses', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'not_authorised', code: '42501' } })
    expect(await downloadValidationPage(EVENT, null)).toEqual({ ok: false, error: 'You are not authorised to scan for this event.' })
    rpc.mockResolvedValue({ data: null, error: { message: 'connection reset', code: '08006' } })
    const page = await downloadValidationPage(EVENT, null)
    expect(page.ok).toBe(false)
    if (!page.ok) expect(page.error).toBe('The door list could not be downloaded (08006: connection reset).')
  })
})

describe('syncOfflineScans', () => {
  const item = {
    client_scan_id: '00000000-0000-4000-8000-000000000001',
    ticket_code: 'EL-2345-6790',
    secret_hash: 'a'.repeat(64),
    device_id: 'device-a',
    scanned_at: '2026-09-05T09:00:00.000Z',
    offline_result: 'admitted' as const,
  }

  test('sends the batch to sync_offline_scans and returns the parsed outcomes', async () => {
    rpc.mockResolvedValue({
      data: [{ client_scan_id: item.client_scan_id, result: 'admitted', needs_review: false, holder_name: 'Guest 1', first_scanned_at: '2026-09-05T09:00:00.000Z', replayed: false }],
      error: null,
    })
    const answer = await syncOfflineScans(EVENT, [item])
    expect(rpc).toHaveBeenCalledWith('sync_offline_scans', { p_event_id: EVENT, p_scans: [item] })
    expect(answer.ok).toBe(true)
    if (answer.ok) expect(answer.outcomes[0]).toMatchObject({ clientScanId: item.client_scan_id, result: 'admitted', needsReview: false })
  })

  test('an empty batch is answered without a call', async () => {
    const answer = await syncOfflineScans(EVENT, [])
    expect(answer.ok && answer.outcomes).toEqual([])
    expect(rpc).not.toHaveBeenCalled()
  })

  test('refuses without a session', async () => {
    sessionUser = null
    expect(await syncOfflineScans(EVENT, [item])).toEqual({ ok: false, error: 'Sign in to sync the door.' })
  })

  test('names the refusal when the RPC refuses', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'too_many_scans', code: '22023' } })
    expect(await syncOfflineScans(EVENT, [item])).toEqual({ ok: false, error: 'The queued scans could not be synced (22023: too_many_scans).' })
  })

  test('an answer the door cannot read is an error, logged, never a half-applied queue', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    rpc.mockResolvedValue({ data: { surprise: true }, error: null })
    const answer = await syncOfflineScans(EVENT, [item])
    expect(answer.ok).toBe(false)
    if (!answer.ok) expect(answer.error).toMatch(/could not be read \(sync answer is not an array\)/)
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })
})
