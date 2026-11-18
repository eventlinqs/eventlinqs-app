import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { blotatoCounts, makeBlotatoAnalytics } from '@/lib/social/blotato-publisher'
import { matchBlotatoPosts, postKey, type ReadPost, type WentPost } from '@/lib/growth/social-report-math'
import { recordBlotatoFigures } from '@/lib/growth/social-report'

/*
 * CAR C, MEASURE (the PM's 21:00 and 23:09 of 18 November 2026; migration 20261118230001). Blotato's published posts and
 * their latest figures (GET /v2/analytics, backend.blotato.com/openapi.json, read 18 November 2026, 23:04), matched to the
 * piece that went by its URL first, by its exact caption only when exactly one piece carries it, never guessed, and kept
 * once a day by the report's one writer.
 */
const now = new Date('2026-11-19T00:00:00Z') // 11:00 on 19 November in Melbourne
const went = (over: Partial<WentPost> & { pieceId: string }): WentPost => ({ platform: 'instagram', postUrl: null, wentAt: '2026-11-18T07:00:00Z', captions: [], ...over })
const post = (over: Partial<ReadPost> & { id: string }): ReadPost => ({ platform: 'instagram', content: '', postUrl: null, fetchedAt: '2026-11-18T20:00:00Z', metrics: { reachCount: 120, likesCount: 9 }, ...over })

describe("Blotato's analytics, read as its contract states", () => {
  it('counts are strings; each becomes a whole number, anything else is left out', () => {
    expect(blotatoCounts({ reachCount: '120', likesCount: 4, sharesCount: '', clicksCount: 'x', savesCount: '-1', viewsCount: '1.5' })).toEqual({ reachCount: 120, likesCount: 4 })
    expect(blotatoCounts(null)).toEqual({})
  })
  it('GET /v2/analytics by platform and since, sorted by reach, at most 100, with the key in its header; read only', async () => {
    const calls: { url: string; init: RequestInit }[] = []
    const fetchImpl = (async (url: string, init: RequestInit) => {
      calls.push({ url, init })
      return new Response(JSON.stringify({ items: [{ id: 'p1', content: 'Hi', postUrl: 'https://www.instagram.com/p/ABC/', platform: 'instagram', createdAt: '2026-11-18T07:00:00Z', mediaUrls: [], latestMetrics: { fetchedAt: '2026-11-18T20:00:00Z', metrics: { reachCount: '120', clicksCount: '3' } } }, { content: 'no id' }] }), { status: 200 })
    }) as unknown as typeof fetch
    const items = await makeBlotatoAnalytics({ apiKey: 'k' }, fetchImpl)({ platform: 'instagram', since: '2026-10-20T00:00:00Z' })
    expect(items).toEqual([{ id: 'p1', platform: 'instagram', content: 'Hi', postUrl: 'https://www.instagram.com/p/ABC/', createdAt: '2026-11-18T07:00:00Z', fetchedAt: '2026-11-18T20:00:00Z', metrics: { reachCount: 120, clicksCount: 3 } }])
    const u = new URL(calls[0].url)
    expect(`${u.origin}${u.pathname}`).toBe('https://backend.blotato.com/v2/analytics')
    expect(Object.fromEntries(u.searchParams)).toEqual({ platform: 'instagram', since: '2026-10-20T00:00:00Z', sortBy: 'reach_count', limit: '100' })
    expect(calls[0].init.method).toBe('GET')
    expect((calls[0].init.headers as Record<string, string>)['blotato-api-key']).toBe('k')
  })
  it('a refusal is said, never read as no posts', async () => {
    const fetchImpl = (async () => new Response(JSON.stringify({ message: 'Forbidden access' }), { status: 403 })) as unknown as typeof fetch
    await expect(makeBlotatoAnalytics({ apiKey: 'k' }, fetchImpl)({ platform: 'facebook', since: 's' })).rejects.toThrow(/Forbidden access/)
  })
})

describe('each post matched to the piece that went, never guessed (the PM 23:09)', () => {
  it('by its URL first, whatever its caption', () => {
    const m = matchBlotatoPosts([post({ id: 'p1', postUrl: 'https://instagram.com/p/ABC', content: 'same words' })], [went({ pieceId: 'a', postUrl: 'https://www.instagram.com/p/ABC/', captions: ['other'] }), went({ pieceId: 'b', captions: ['same words'] })], now)
    expect(m.matched).toEqual([{ pieceId: 'a', platform: 'instagram', postUrl: 'https://instagram.com/p/ABC', how: 'url' }])
    expect(m.rows.map((r) => [r.pieceId, r.metric, r.value, r.platformPostId])).toEqual([['a', 'reach', 120, 'p1'], ['a', 'likes', 9, 'p1']])
  })
  it('by its exact caption only when exactly one piece carries it', () => {
    const one = matchBlotatoPosts([post({ id: 'p2', content: 'Five events in Geelong this week.' })], [went({ pieceId: 'c', captions: ['Five events in Geelong this week.'] }), went({ pieceId: 'd', captions: ['Four events'] })], now)
    expect(one.matched).toEqual([{ pieceId: 'c', platform: 'instagram', postUrl: null, how: 'caption' }])
    const two = matchBlotatoPosts([post({ id: 'p3', content: 'Same words.' })], [went({ pieceId: 'e', captions: ['Same words.'] }), went({ pieceId: 'f', captions: ['Same words.'] })], now)
    expect(two.matched).toEqual([])
    expect(two.rows).toEqual([])
    expect(two.unmatched).toEqual([{ id: 'p3', platform: 'instagram', postUrl: null, why: '2 pieces carry its caption, so none is guessed' }])
  })
  it('a post no piece carries is named, never credited; a platform of another kind is named too', () => {
    const m = matchBlotatoPosts([post({ id: 'p4', content: 'Nothing like ours' }), post({ id: 'p5', platform: 'tiktok' })], [went({ pieceId: 'g', captions: ['Ours'] })], now)
    expect(m.rows).toEqual([])
    expect(m.unmatched.map((u) => u.why)).toEqual(['no piece that went carries its address or its caption', 'not an Instagram or Facebook post'])
  })
  it('a figure read before its post went is refused, as the database refuses it', () => {
    const m = matchBlotatoPosts([post({ id: 'p6', content: 'Ours', fetchedAt: '2026-11-18T06:00:00Z' })], [went({ pieceId: 'h', captions: ['Ours'] })], now)
    expect(m.unmatched[0].why).toBe('its figures were read before its post went')
  })
  it('one post a piece and platform: a second post of the same words is not credited twice', () => {
    const m = matchBlotatoPosts([post({ id: 'p7', content: 'Ours' }), post({ id: 'p8', content: 'Ours' })], [went({ pieceId: 'i', captions: ['Ours'] })], now)
    expect(m.matched.map((x) => x.pieceId)).toEqual(['i'])
    expect(m.unmatched.map((u) => u.id)).toEqual(['p8'])
  })
  it('an address is compared without its scheme, www, query or trailing slash', () => {
    expect(postKey('https://www.Instagram.com/p/ABC/?igsh=1')).toBe('instagram.com/p/ABC')
    expect(postKey(null)).toBeNull()
  })
})

/** A database answering the chains recordBlotatoFigures makes, and keeping what it inserts. */
function fakeDb(tables: Record<string, Record<string, unknown>[]>) {
  const inserted: Record<string, unknown>[] = []
  const query = (table: string) => {
    const tests: ((r: Record<string, unknown>) => boolean)[] = []
    const q = {
      select: () => q,
      eq: (k: string, v: unknown) => (tests.push((r) => r[k] === v), q),
      gte: (k: string, v: string) => (tests.push((r) => String(r[k]) >= v), q),
      in: (k: string, vs: unknown[]) => (tests.push((r) => vs.includes(r[k])), q),
      limit: () => q,
      insert: async (rows: Record<string, unknown>[]) => (inserted.push(...rows), { error: null }),
      then: (ok: (v: unknown) => unknown) => Promise.resolve({ data: (tables[table] ?? []).filter((r) => tests.every((t) => t(r))), error: null }).then(ok),
    }
    return q
  }
  return { db: { from: query } as never, inserted }
}

describe("the day's read, kept by the report's one writer", () => {
  const list = async ({ platform }: { platform: 'instagram' | 'facebook' }) => (platform === 'instagram' ? [post({ id: 'p1', content: 'Ours' })] : [])
  const tables = {
    social_piece_figures: [] as Record<string, unknown>[],
    social_piece_schedules: [
      { piece_id: 'a', platform: 'instagram', state: 'held', published_ref: null, published_at: null, go_at: '2026-11-18T07:00:00Z', held_reason: 'new row for relation "social_piece_schedules" violates check constraint "social_piece_schedules_published_ref_check"' },
      { piece_id: 'z', platform: 'instagram', state: 'held', published_ref: null, published_at: null, go_at: '2026-11-18T07:00:00Z', held_reason: 'Not published: LANY: its ticket page answers 403.' },
    ],
    social_piece_revisions: [{ piece_id: 'a', version: 1, caption: 'Ours', versions: { instagram: { caption: 'Ours' } } }, { piece_id: 'z', version: 1, caption: 'Ours', versions: {} }],
  }
  it("before 06:40 in Melbourne it waits for the day's first run after it", async () => {
    const { db, inserted } = fakeDb(tables)
    expect((await recordBlotatoFigures(db, list, new Date('2026-11-18T19:00:00Z'))).state).toBe('not_today')
    expect(inserted).toEqual([])
  })
  it('a held post Blotato accepted is measured (the five of 18 November); one held for another reason is not', async () => {
    const { db, inserted } = fakeDb(tables)
    const out = await recordBlotatoFigures(db, list, now)
    expect(out.state).toBe('read')
    expect(out.matched).toEqual([{ pieceId: 'a', platform: 'instagram', postUrl: null, how: 'caption' }])
    expect(inserted.map((r) => [r.piece_id, r.metric, r.value, r.source, r.platform_post_id])).toEqual([['a', 'reach', 120, 'blotato', 'p1'], ['a', 'likes', 9, 'blotato', 'p1']])
  })
  it('read already today: nothing more is kept', async () => {
    const { db, inserted } = fakeDb({ ...tables, social_piece_figures: [{ id: 'x', source: 'blotato', entered_at: '2026-11-18T23:00:00Z' }] })
    expect((await recordBlotatoFigures(db, list, now)).state).toBe('not_today')
    expect(inserted).toEqual([])
  })
})
