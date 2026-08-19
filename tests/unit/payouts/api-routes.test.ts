import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const {
  resolveScopeMock,
  rateLimitMock,
  getOrganiserPayoutsMock,
  getOrganiserPayoutSummaryMock,
  getOrganiserPayoutTermsMock,
  getReserveReleaseScheduleMock,
  getRefundImpactMock,
  createDashboardLoginLinkMock,
} = vi.hoisted(() => ({
  resolveScopeMock: vi.fn(),
  rateLimitMock: vi.fn(),
  getOrganiserPayoutsMock: vi.fn(),
  getOrganiserPayoutSummaryMock: vi.fn(),
  getOrganiserPayoutTermsMock: vi.fn(),
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
  getOrganiserPayoutTerms: getOrganiserPayoutTermsMock,
  getReserveReleaseSchedule: getReserveReleaseScheduleMock,
  getRefundImpact: getRefundImpactMock,
}))
vi.mock('@/lib/payouts/stripe-link', () => ({
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

const summaryStub = {
  currency: 'AUD',
  availableCents: 0,
  pendingCents: 0,
  paidThisMonthCents: 0,
  onHoldCents: 0,
  lifetimeCents: 0,
  nextArrivalDate: null,
}

const termsStub = {
  tier: 'tier_1',
  tierLabel: 'Standard',
  schedule: 'post_event_only',
  scheduleLabel: 'Released after each event completes',
  onDemandEligible: false,
  cadenceDays: 3,
  reservePercent: 20,
}

beforeEach(() => {
  resolveScopeMock.mockReset()
  rateLimitMock.mockReset()
  rateLimitMock.mockResolvedValue(null)
  getOrganiserPayoutsMock.mockReset()
  getOrganiserPayoutSummaryMock.mockReset()
  getOrganiserPayoutTermsMock.mockReset()
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

  // THE LIMITER MOVED BELOW THE SCOPE on 19 August 2026 (founder ruling), because
  // it is now keyed to the organisation and the bucket cannot be named until the
  // scope names it. This test previously asserted the OPPOSITE ordering, with
  // `expect(resolveScopeMock).not.toHaveBeenCalled()`. It is inverted here
  // deliberately rather than deleted, because the ordering IS the contract and a
  // deleted test would let the ordering drift back silently.
  test('returns the rate-limit response when blocked, and the bucket is the organisation', async () => {
    resolveScopeMock.mockResolvedValue(okScope)
    rateLimitMock.mockResolvedValue(new Response('blocked', { status: 429 }))
    const res = await listGET(new Request('https://test/api/payouts/list'))
    expect(res.status).toBe(429)
    // The scope runs FIRST now, because it is what supplies the key.
    expect(resolveScopeMock).toHaveBeenCalled()
    // The third argument is the whole point of the move: the bucket is the
    // organisation, not the forwarded address.
    expect(rateLimitMock).toHaveBeenCalledWith('payouts-read', expect.anything(), 'org-1')
  })

  test('a blocked read never reaches the queries layer', async () => {
    resolveScopeMock.mockResolvedValue(okScope)
    rateLimitMock.mockResolvedValue(new Response('blocked', { status: 429 }))
    await listGET(new Request('https://test/api/payouts/list'))
    expect(getOrganiserPayoutsMock).not.toHaveBeenCalled()
  })

  test('an unauthenticated caller is refused as unauthenticated and consumes no window', async () => {
    // The recorded consequence of the move, pinned so it stays a decision rather
    // than a surprise: the 401 is decided from the cookie with no database read,
    // so refusing it before the limiter costs nothing to serve.
    resolveScopeMock.mockResolvedValue({ ok: false, status: 401, reason: 'unauthenticated' })
    const res = await listGET(new Request('https://test/api/payouts/list'))
    expect(res.status).toBe(401)
    expect(rateLimitMock).not.toHaveBeenCalled()
  })

  test('passes status filter through to queries layer', async () => {
    resolveScopeMock.mockResolvedValue(okScope)
    getOrganiserPayoutsMock.mockResolvedValue({ rows: [], total: 0, limit: 20, offset: 0 })
    const res = await listGET(new Request('https://test/api/payouts/list?status=paid'))
    expect(res.status).toBe(200)
    expect(getOrganiserPayoutsMock).toHaveBeenCalledWith('org-1', expect.objectContaining({ status: 'paid' }))
  })

  test('coerces invalid status to "all"', async () => {
    resolveScopeMock.mockResolvedValue(okScope)
    getOrganiserPayoutsMock.mockResolvedValue({ rows: [], total: 0, limit: 20, offset: 0 })
    await listGET(new Request('https://test/api/payouts/list?status=garbage'))
    expect(getOrganiserPayoutsMock).toHaveBeenCalledWith('org-1', expect.objectContaining({ status: 'all' }))
  })
})

describe('GET /api/payouts/summary', () => {
  test('returns summary, terms, and reserve release schedule together', async () => {
    resolveScopeMock.mockResolvedValue(okScope)
    getOrganiserPayoutSummaryMock.mockResolvedValue({ ...summaryStub, lifetimeCents: 1000 })
    getOrganiserPayoutTermsMock.mockResolvedValue(termsStub)
    getReserveReleaseScheduleMock.mockResolvedValue([])
    const res = await summaryGET(new Request('https://test/api/payouts/summary'))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.summary.lifetimeCents).toBe(1000)
    expect(json.terms.tierLabel).toBe('Standard')
    expect(json.terms.reservePercent).toBe(20)
    expect(json.reserve_release_schedule).toEqual([])
  })

  test('clamps daysAhead between 1 and 365', async () => {
    resolveScopeMock.mockResolvedValue(okScope)
    getOrganiserPayoutSummaryMock.mockResolvedValue(summaryStub)
    getOrganiserPayoutTermsMock.mockResolvedValue(termsStub)
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
