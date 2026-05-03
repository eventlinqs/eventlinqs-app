import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const {
  resolveOrgMock,
  resolveBuyerMock,
  rateLimitMock,
  createMock,
  processMock,
  cancelMock,
  getOrgRefundsMock,
  getRefundStatsMock,
  getRefundByIdMock,
} = vi.hoisted(() => ({
  resolveOrgMock: vi.fn(),
  resolveBuyerMock: vi.fn(),
  rateLimitMock: vi.fn(),
  createMock: vi.fn(),
  processMock: vi.fn(),
  cancelMock: vi.fn(),
  getOrgRefundsMock: vi.fn(),
  getRefundStatsMock: vi.fn(),
  getRefundByIdMock: vi.fn(),
}))

vi.mock('@/lib/refunds/auth', () => ({
  resolveOrganiserRefundScope: resolveOrgMock,
  resolveBuyerScope: resolveBuyerMock,
}))
vi.mock('@/lib/rate-limit/middleware', () => ({
  applyRateLimit: rateLimitMock,
}))
vi.mock('@/lib/refunds/mutations', () => ({
  createRefundRequest: createMock,
  processRefund: processMock,
  cancelRefundRequest: cancelMock,
}))
vi.mock('@/lib/refunds/queries', () => ({
  getOrganiserRefunds: getOrgRefundsMock,
  getRefundStatistics: getRefundStatsMock,
  getRefundById: getRefundByIdMock,
  getBuyerRefundRequests: vi.fn(),
}))

import { POST as requestPOST } from '@/app/api/refunds/request/route'
import { GET as listGET } from '@/app/api/refunds/list/route'
import { GET as detailGET } from '@/app/api/refunds/[id]/route'
import { POST as processPOST } from '@/app/api/refunds/[id]/process/route'
import { POST as cancelPOST } from '@/app/api/refunds/[id]/cancel/route'

const orgScopeOk = {
  ok: true as const,
  org: { kind: 'organiser' as const, userId: 'u1', organisationId: 'org-1', ownerId: 'u1' },
}
const buyerScopeOk = { ok: true as const, buyer: { kind: 'buyer' as const, userId: 'u1' } }

beforeEach(() => {
  resolveOrgMock.mockReset()
  resolveBuyerMock.mockReset()
  rateLimitMock.mockReset().mockResolvedValue(null)
  createMock.mockReset()
  processMock.mockReset()
  cancelMock.mockReset()
  getOrgRefundsMock.mockReset()
  getRefundStatsMock.mockReset()
  getRefundByIdMock.mockReset()
})
afterEach(() => vi.clearAllMocks())

describe('POST /api/refunds/request', () => {
  test('rejects invalid JSON body with 400', async () => {
    const res = await requestPOST(new Request('https://t/api/refunds/request', { method: 'POST', body: '{not json' }))
    expect(res.status).toBe(400)
  })

  test('rejects when amount missing', async () => {
    const res = await requestPOST(new Request('https://t/api/refunds/request', { method: 'POST', body: JSON.stringify({ orderId: 'o1' }) }))
    expect(res.status).toBe(400)
  })

  test('returns 429 when rate-limited', async () => {
    rateLimitMock.mockResolvedValueOnce(new Response('blocked', { status: 429 }))
    const res = await requestPOST(new Request('https://t/api/refunds/request', { method: 'POST', body: JSON.stringify({ orderId: 'o1', amountCents: 100, reason: 'requested_by_buyer' }) }))
    expect(res.status).toBe(429)
  })

  test('uses buyer scope by default', async () => {
    resolveBuyerMock.mockResolvedValue(buyerScopeOk)
    createMock.mockResolvedValue({ ok: true, refund: { id: 'r1' } })
    const res = await requestPOST(new Request('https://t/api/refunds/request', { method: 'POST', body: JSON.stringify({ orderId: 'o1', amountCents: 100, reason: 'requested_by_buyer', buyerMessage: 'Hi' }) }))
    expect(res.status).toBe(201)
    expect(createMock).toHaveBeenCalledWith(expect.objectContaining({ creatorRole: 'buyer', requestedBy: 'u1' }))
  })

  test('asOrganiser flag uses organiser scope', async () => {
    resolveOrgMock.mockResolvedValue(orgScopeOk)
    createMock.mockResolvedValue({ ok: true, refund: { id: 'r1' } })
    const res = await requestPOST(new Request('https://t/api/refunds/request', { method: 'POST', body: JSON.stringify({ asOrganiser: true, orderId: 'o1', amountCents: 100, reason: 'event_cancelled' }) }))
    expect(res.status).toBe(201)
    expect(createMock).toHaveBeenCalledWith(expect.objectContaining({ creatorRole: 'organiser' }))
  })
})

describe('GET /api/refunds/list', () => {
  test('returns 401 when unauthenticated', async () => {
    resolveOrgMock.mockResolvedValue({ ok: false, status: 401, reason: 'unauthenticated' })
    const res = await listGET(new Request('https://t/api/refunds/list'))
    expect(res.status).toBe(401)
  })

  test('coerces invalid status to "all"', async () => {
    resolveOrgMock.mockResolvedValue(orgScopeOk)
    getOrgRefundsMock.mockResolvedValue({ rows: [], total: 0, limit: 20, offset: 0 })
    await listGET(new Request('https://t/api/refunds/list?status=garbage'))
    expect(getOrgRefundsMock).toHaveBeenCalledWith('org-1', expect.objectContaining({ status: 'all' }))
  })

  test('includes stats when includeStats=true', async () => {
    resolveOrgMock.mockResolvedValue(orgScopeOk)
    getOrgRefundsMock.mockResolvedValue({ rows: [], total: 0, limit: 20, offset: 0 })
    getRefundStatsMock.mockResolvedValue({ pending_count: 1, processing_count: 0, completed_count: 0, failed_count: 0, cancelled_count: 0, total_refunded_cents: 0, refund_rate_percent: 0, currency: 'aud' })
    const res = await listGET(new Request('https://t/api/refunds/list?includeStats=true'))
    const json = await res.json()
    expect(json.stats?.pending_count).toBe(1)
  })
})

describe('GET /api/refunds/[id]', () => {
  test('returns 404 when refund missing', async () => {
    resolveOrgMock.mockResolvedValue(orgScopeOk)
    getRefundByIdMock.mockResolvedValue(null)
    const res = await detailGET(new Request('https://t/api/refunds/x'), { params: Promise.resolve({ id: 'x' }) })
    expect(res.status).toBe(404)
  })

  test('returns 403 when org does not own refund', async () => {
    resolveOrgMock.mockResolvedValue(orgScopeOk)
    getRefundByIdMock.mockResolvedValue({ id: 'r1', organisation_id: 'org-other', requested_by: 'somebody' })
    const res = await detailGET(new Request('https://t/api/refunds/r1'), { params: Promise.resolve({ id: 'r1' }) })
    expect(res.status).toBe(403)
  })

  test('falls back to buyer scope when not organiser', async () => {
    resolveOrgMock.mockResolvedValue({ ok: false, status: 404, reason: 'no_organisation' })
    resolveBuyerMock.mockResolvedValue(buyerScopeOk)
    getRefundByIdMock.mockResolvedValue({ id: 'r1', organisation_id: 'org-1', requested_by: 'u1' })
    const res = await detailGET(new Request('https://t/api/refunds/r1'), { params: Promise.resolve({ id: 'r1' }) })
    expect(res.status).toBe(200)
  })
})

describe('POST /api/refunds/[id]/process', () => {
  test('502 when Stripe fails', async () => {
    resolveOrgMock.mockResolvedValue(orgScopeOk)
    processMock.mockResolvedValue({ ok: true, status: 'failed' })
    const res = await processPOST(new Request('https://t/api/refunds/r1/process', { method: 'POST' }), { params: Promise.resolve({ id: 'r1' }) })
    expect(res.status).toBe(502)
  })

  test('200 on completed', async () => {
    resolveOrgMock.mockResolvedValue(orgScopeOk)
    processMock.mockResolvedValue({ ok: true, status: 'completed', stripeRefundId: 're_x' })
    const res = await processPOST(new Request('https://t/api/refunds/r1/process', { method: 'POST' }), { params: Promise.resolve({ id: 'r1' }) })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.stripeRefundId).toBe('re_x')
  })
})

describe('POST /api/refunds/[id]/cancel', () => {
  test('buyer cancel of own request', async () => {
    resolveBuyerMock.mockResolvedValue(buyerScopeOk)
    cancelMock.mockResolvedValue({ ok: true, refund: { id: 'r1', status: 'cancelled' } })
    const res = await cancelPOST(new Request('https://t/api/refunds/r1/cancel', { method: 'POST', body: JSON.stringify({}) }), { params: Promise.resolve({ id: 'r1' }) })
    expect(res.status).toBe(200)
    expect(cancelMock).toHaveBeenCalledWith(expect.objectContaining({ actorRole: 'buyer' }))
  })

  test('organiser cancel forwards denialReason', async () => {
    resolveOrgMock.mockResolvedValue(orgScopeOk)
    cancelMock.mockResolvedValue({ ok: true, refund: { id: 'r1', status: 'cancelled' } })
    const res = await cancelPOST(new Request('https://t/api/refunds/r1/cancel', { method: 'POST', body: JSON.stringify({ asOrganiser: true, denialReason: 'too late' }) }), { params: Promise.resolve({ id: 'r1' }) })
    expect(res.status).toBe(200)
    expect(cancelMock).toHaveBeenCalledWith(expect.objectContaining({ actorRole: 'organiser', denialReason: 'too late' }))
  })
})
