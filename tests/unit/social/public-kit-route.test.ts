import { beforeEach, describe, expect, it, vi } from 'vitest'

/*
 * /kit/<piece>/<n> (window 6's message 7, 29 October 2026): an approved partner kit's slide, and nothing else. The
 * store's rule is tested in public-kit.test.ts; here, that the route asks it and answers 404 for anything it refuses,
 * takes the anonymous render limit, and serves a public, unindexed image that a withdrawal leaves within the hour.
 */
const readPublicKit = vi.fn()
const applyRateLimit = vi.fn()
vi.mock('@/lib/social/store', () => ({ readPublicKit: (...a: unknown[]) => readPublicKit(...a), slideImagesNow: async () => new Map() }))
vi.mock('@/lib/rate-limit/middleware', () => ({ applyRateLimit: (...a: unknown[]) => applyRateLimit(...a) }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))
vi.mock('@/lib/observability/sentry', () => ({ captureException: () => {} }))
vi.mock('@/lib/broadcast/campaign-slides', () => ({
  formatsOf: (f: string) => (f === 'feed' ? ['feed', 'square'] : ['story']),
  renderCampaignSlide: async () => new Uint8Array([0xff, 0xd8, 0xff, 0xd9]),
}))

const { GET } = await import('@/app/kit/[pieceId]/[n]/route')
const ID = '3f2b8c1e-5a4d-4e6f-9b2a-1c3d5e7f9a0b'
const call = (id: string, n: string, query = '') => GET(new Request(`https://www.eventlinqs.com.au/kit/${id}/${n}${query}`) as never, { params: Promise.resolve({ pieceId: id, n }) })
const kit = { slides: [{ t: 'story' }, { t: 'story' }], format: 'feed', city: 'geelong', partnerName: 'The Barwon Club' }

beforeEach(() => {
  readPublicKit.mockReset()
  applyRateLimit.mockReset().mockResolvedValue(null)
})

describe('/kit/<piece>/<n>', () => {
  it('answers 404 for an address that is not a piece uuid and a slide number, asking nothing', async () => {
    for (const [id, n] of [['not-a-uuid', '1'], [ID, '0'], [ID, 'x'], [ID, '21']]) expect((await call(id, n)).status).toBe(404)
    expect(readPublicKit).not.toHaveBeenCalled()
  })

  it('answers 404 for every piece the store does not serve, and for a slide past the kit', async () => {
    readPublicKit.mockResolvedValue(null)
    expect((await call(ID, '1')).status).toBe(404)
    readPublicKit.mockResolvedValue(kit)
    expect((await call(ID, '3')).status).toBe(404)
    expect((await call(ID, '1', '?format=story')).status).toBe(404)
  })

  it('takes the anonymous render limit before it reads anything', async () => {
    applyRateLimit.mockResolvedValue(new Response(null, { status: 429 }))
    expect((await call(ID, '1')).status).toBe(429)
    expect(applyRateLimit.mock.calls[0][0]).toBe('launch-artefact')
    expect(readPublicKit).not.toHaveBeenCalled()
  })

  it('serves an approved kit slide as a public image, never indexed, cached an hour at most', async () => {
    readPublicKit.mockResolvedValue(kit)
    const res = await call(ID, '2', '?format=square')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/jpeg')
    expect(res.headers.get('x-robots-tag')).toContain('noindex')
    const maxAge = Math.max(...[...(res.headers.get('cache-control') ?? '').matchAll(/max-?age=(\d+)/g)].map((m) => Number(m[1])))
    expect(maxAge).toBeLessThanOrEqual(3600)
    expect(res.headers.get('cache-control')).toMatch(/^public/)
  })
})
