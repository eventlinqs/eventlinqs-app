import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const {
  resolveScopeMock,
  rateLimitMock,
  getOrganiserPayoutsMock,
  getOrganiserPayoutSummaryMock,
  getReserveReleaseScheduleMock,
  getRefundImpactMock,
  createDashboardLoginLinkMock,
} = vi.hoisted(() => ({
  resolveScopeMock: vi.fn(),
  rateLimitMock: vi.fn(),
  getOrganiserPayoutsMock: vi.fn(),
  getOrganiserPayoutSummaryMock: vi.fn(),
  getReserveReleaseScheduleMock: vi.fn(),
  getRefundImpactMock: vi.fn(),
  createDashboardLoginLinkMock: vi.fn(),
}))

vi.mock('@/lib/payouts/auth', () => ({
  resolveOrganiserScope: resolveScopeMock,
}))
vi.mock('@/lib/rate-limit/middleware', () => ({
  applyRateLimit: rateLimitMock,
}))
vi.mock('@/lib/payouts/queries', () => ({
  getOrganiserPayouts: getOrganiserPayoutsMock,
  getOrganiserPayoutSummary: getOrganiserPayoutSummaryMock,
  getReserveReleaseSchedule: getReserveReleaseScheduleMock,
  getRefundImpact: getRefundImpactMock,
}))
vi.mock('@/lib/stripe/connect', () => ({
  createDashboardLoginLink: createDashboardLoginLinkMock,
}))

import { GET as listGET } from '@/app/api/payouts/list/route'
import { GET as summaryGET } from '@/app/api/payouts/summary/route'
import { POST as linkPOST } from '@/app/api/payouts/stripe-dashboard-link/route'
import { GET as refundsGET } from '@/app/api/payouts/refunds/route'

const okScope = {
  ok: true as const,
  org: {
    userId: 'user-1',
    organisationId: 'org-1',
    stripeAccountId: 'acct_test_123',
    stripeChargesEnabled: true,
    stripePayoutsEnabled: true,
  },
}

beforeEach(() => {
  resolveScopeMock.mockReset()
  rateLimitMock.mockReset()
  rateLimitMock.mockResolvedValue(null)
  getOrganiserPayoutsMock.mockReset()
  getOrganiserPayoutSummaryMock.mockReset()
  getReserveReleaseScheduleMock.mockReset()
  getRefundImpactMock.mockReset()
  createDashboardLoginLinkMock.mockReset()
})

afterEach(() => vi.clearAllMocks())

describe('GET /api/payouts/list', () => {
  test('returns 401 when unauthenticated', async () => {
    resolveScopeMock.mockResolvedValue({ ok: false, status: 401, reason: 'unauthenticated' })
    const res = await listGET(new Request('https://test/api/payouts/list'))
    expect(res.status).toBe(401)
    const json = await res.json()
    expect(json.error).toBe('unauthenticated')
  })

  test('returns 404 when organiser has no organisation', async () => {
    resolveScopeMock.mockResolvedValue({ ok: false, status: 404, reason: 'no_organisation' })
    const res = await listGET(new Request('https://test/api/payouts/list'))
    expect(res.status).toBe(404)
  })

  test('returns rate-limit response when blocked', async () => {
    rateLimitMock.mockResolvedValue(new Response('blocked', { status: 429 }))
    const res = await listGET(new Request('https://test/api/payouts/list'))
    expect(res.status).toBe(429)
    expect(resolveScopeMock).not.toHaveBeenCalled()
  })

  test('passes status filter through to queries layer', async () => {
    resolveScopeMock.mockResolvedValue(okScope)
    getOrganiserPayoutsMock.mockResolvedValue({
      rows: [], total: 0, limit: 20, offset: 0,
    })
    const res = await listGET(new Request('https://test/api/payouts/list?status=paid'))
    expect(res.status).toBe(200)
    expect(getOrganiserPayoutsMock).toHaveBeenCalledWith('org-1', expect.objectContaining({ status: 'paid' }))
  })

  test('coerces invalid status to "all"', async () => {
    resolveScopeMock.mockResolvedValue(okScope)
    getOrganiserPayoutsMock.mockResolvedValue({
      rows: [], total: 0, limit: 20, offset: 0,
    })
    await listGET(new Request('https://test/api/payouts/list?status=garbage'))
    expect(getOrganiserPayoutsMock).toHaveBeenCalledWith('org-1', expect.objectContaining({ status: 'all' }))
  })
})

describe('GET /api/payouts/summary', () => {
  test('returns summary plus reserve release schedule together', async () => {
    resolveScopeMock.mockResolvedValue(okScope)
    getOrganiserPayoutSummaryMock.mockResolvedValue({
      currency: 'aud',
      pendingCents: 100,
      paidThisMonthCents: 200,
      onHoldCents: 50,
      lifetimeCents: 1000,
      nextArrivalDate: null,
    })
    getReserveReleaseScheduleMock.mockResolvedValue([])
    const res = await summaryGET(new Request('https://test/api/payouts/summary'))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.summary.lifetimeCents).toBe(1000)
    expect(json.reserve_release_schedule).toEqual([])
  })

  test('clamps daysAhead between 1 and 365', async () => {
    resolveScopeMock.mockResolvedValue(okScope)
    getOrganiserPayoutSummaryMock.mockResolvedValue({
      currency: 'aud',
      pendingCents: 0,
      paidThisMonthCents: 0,
      onHoldCents: 0,
      lifetimeCents: 0,
      nextArrivalDate: null,
    })
    getReserveReleaseScheduleMock.mockResolvedValue([])
    await summaryGET(new Request('https://test/api/payouts/summary?daysAhead=99999'))
    expect(getReserveReleaseScheduleMock).toHaveBeenCalledWith('org-1', 30)
  })
})

describe('POST /api/payouts/stripe-dashboard-link', () => {
  test('returns 409 when stripe account is not connected', async () => {
    resolveScopeMock.mockResolvedValue({
      ok: true,
      org: { ...okScope.org, stripeAccountId: null },
    })
    const res = await linkPOST(new Request('https://test', { method: 'POST' }))
    expect(res.status).toBe(409)
    const json = await res.json()
    expect(json.error).toBe('stripe_not_connected')
    expect(createDashboardLoginLinkMock).not.toHaveBeenCalled()
  })

  test('returns the Stripe login link url on success', async () => {
    resolveScopeMock.mockResolvedValue(okScope)
    createDashboardLoginLinkMock.mockResolvedValue({
      url: 'https://connect.stripe.com/express/abcdef',
      created: 1700000000,
    })
    const res = await linkPOST(new Request('https://test', { method: 'POST' }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.url).toBe('https://connect.stripe.com/express/abcdef')
  })

  test('returns 502 when Stripe throws', async () => {
    resolveScopeMock.mockResolvedValue(okScope)
    createDashboardLoginLinkMock.mockRejectedValue(new Error('Stripe is down'))
    const res = await linkPOST(new Request('https://test', { method: 'POST' }))
    expect(res.status).toBe(502)
  })
})

describe('GET /api/payouts/refunds', () => {
  test('returns refund impact page for the resolved organisation', async () => {
    resolveScopeMock.mockResolvedValue(okScope)
    getRefundImpactMock.mockResolvedValue({
      rows: [
        {
          id: 'led_1',
          reason: 'refund_from_balance',
          delta_cents: -1000,
          currency: 'aud',
          reference_type: 'order',
          reference_id: 'order-uuid',
          created_at: '2026-05-01T00:00:00Z',
          metadata: {},
        },
      ],
      total: 1,
      limit: 20,
      offset: 0,
    })
    const res = await refundsGET(new Request('https://test/api/payouts/refunds'))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.total).toBe(1)
    expect(json.rows[0].reason).toBe('refund_from_balance')
    expect(getRefundImpactMock).toHaveBeenCalledWith('org-1', { limit: 20, offset: 0 })
  })
})
