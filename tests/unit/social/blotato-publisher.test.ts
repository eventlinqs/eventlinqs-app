import { describe, expect, test } from 'vitest'
import type { Slide } from '../../../src/lib/social/campaign'
import { blotatoConfigFrom, blotatoMediaType, BlotatoRefusal, makeBlotatoPublisher } from '../../../src/lib/social/blotato-publisher'

/*
 * ROUTE B, BLOTATO (Lawal's yes of 15 November 2026, 13:55). The publisher against Blotato's recorded shapes
 * (help.blotato.com, read 15 November 2026): the connected account found by its platform, each slide copied into Blotato
 * first, the post body exactly as Blotato's reference gives it, Facebook's one Page, a story as Instagram's mediaType,
 * and every refusal in Blotato's own words, never a silent retry.
 */
const night = (n: number): Slide =>
  ({ t: 'night', composition: 'night_led', eventId: `e${n}`, chip: null, when: 'Sat 14 Nov', day: 'Sat', title: `Night ${n}`, meta: 'Geelong', why: null, photo: null, credit: null }) as unknown as Slide
const story = (n: number): Slide =>
  ({ t: 'story', composition: 'night_led', eventId: `e${n}`, chip: 'Tonight', when: '8pm', title: `Story ${n}`, meta: 'Geelong', photo: null, credit: null, sticker: 'Link' }) as unknown as Slide

type Seen = { method: string; url: string; body: unknown; key: string | null }

function blotato(answers: { accounts?: unknown[]; pages?: unknown[]; status?: string; refuse?: string }) {
  const seen: Seen[] = []
  let uploads = 0
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    const body = init?.body ? JSON.parse(String(init.body)) : undefined
    const key = (init?.headers as Record<string, string> | undefined)?.['blotato-api-key'] ?? null
    seen.push({ method, url, body, key })
    const reply = (status: number, json: unknown) => new Response(JSON.stringify(json), { status, headers: { 'Content-Type': 'application/json' } })
    if (answers.refuse && url.endsWith('/v2/posts') && method === 'POST') return reply(400, { message: answers.refuse })
    if (url.endsWith('/v2/users/me/accounts')) return reply(200, { items: answers.accounts ?? [] })
    if (url.includes('/subaccounts')) return reply(200, { items: answers.pages ?? [] })
    if (url.endsWith('/v2/media')) return reply(201, { url: `https://database.blotato.com/m/${++uploads}.jpg` })
    if (url.endsWith('/v2/posts')) return reply(201, { postSubmissionId: 'sub-1' })
    if (url.includes('/v2/posts/sub-1')) return reply(200, { status: answers.status ?? 'published', publicUrl: 'https://www.instagram.com/p/abc/' })
    return reply(404, { message: 'not stubbed' })
  }) as unknown as typeof fetch
  return { seen, fetchImpl }
}

const slideUrls = async (_: string, slides: readonly Slide[]) => slides.map((_, i) => `https://storage.example/s${i + 1}.jpg`)
const config = { apiKey: 'test-key-0123456789abcdef' }

describe('route B, Blotato', () => {
  test('the key is read from BLOTATO_API_KEY only, trimmed; absent means no route B', () => {
    expect(blotatoConfigFrom({ BLOTATO_API_KEY: '  k-0123456789  ' })).toEqual({ apiKey: 'k-0123456789' })
    expect(blotatoConfigFrom({})).toBeNull()
    expect(blotatoConfigFrom({ BLOTATO_API_KEY: '   ' })).toBeNull()
  })

  test('an Instagram feed post: the account by platform, each slide copied in, the body as the reference gives it', async () => {
    const b = blotato({ accounts: [{ id: 101, platform: 'facebook' }, { id: 202, platform: 'instagram' }] })
    const publish = makeBlotatoPublisher({ config, fetchImpl: b.fetchImpl, slideUrls, sleep: async () => {} })
    const out = await publish({ pieceId: 'p1', platform: 'instagram', slides: [night(1), night(2)], caption: 'This weekend' })
    expect(out).toEqual({ ref: 'https://www.instagram.com/p/abc/', submission: 'sub-1' })
    expect(b.seen.every((s) => s.key === config.apiKey)).toBe(true)
    expect(b.seen.filter((s) => s.url.endsWith('/v2/media')).map((s) => s.body)).toEqual([{ url: 'https://storage.example/s1.jpg' }, { url: 'https://storage.example/s2.jpg' }])
    const post = b.seen.find((s) => s.url.endsWith('/v2/posts') && s.method === 'POST')
    expect(post?.body).toEqual({
      post: {
        accountId: '202',
        content: { text: 'This weekend', mediaUrls: ['https://database.blotato.com/m/1.jpg', 'https://database.blotato.com/m/2.jpg'], platform: 'instagram' },
        target: { targetType: 'instagram' },
      },
    })
  })

  test('an Instagram story is sent as mediaType story', async () => {
    const b = blotato({ accounts: [{ id: 202, platform: 'instagram' }] })
    const publish = makeBlotatoPublisher({ config, fetchImpl: b.fetchImpl, slideUrls, sleep: async () => {} })
    await publish({ pieceId: 'p2', platform: 'instagram', slides: [story(1)], caption: 'Tonight' })
    const post = b.seen.find((s) => s.url.endsWith('/v2/posts') && s.method === 'POST')
    expect((post?.body as { post: { target: unknown } }).post.target).toEqual({ targetType: 'instagram', mediaType: 'story' })
  })

  // A STORY POSTS AS A STORY, ON EVERY NETWORK (the PM's 04:40 of 20 November 2026, item 4): Blotato's reference takes
  // mediaType 'story' on Facebook too ("Set 'story' for Stories"); without it a Facebook story posted to the Page's feed.
  test('a Facebook story is sent as mediaType story, to the one Page', async () => {
    const b = blotato({ accounts: [{ id: 101, platform: 'facebook' }], pages: [{ id: '555' }] })
    const publish = makeBlotatoPublisher({ config, fetchImpl: b.fetchImpl, slideUrls, sleep: async () => {} })
    await publish({ pieceId: 'p4', platform: 'facebook', slides: [story(1)], caption: 'Tonight' })
    const post = b.seen.find((s) => s.url.endsWith('/v2/posts') && s.method === 'POST')
    expect((post?.body as { post: { target: unknown } }).post.target).toEqual({ targetType: 'facebook', pageId: '555', mediaType: 'story' })
  })

  test('the story type follows the format on every network, and a feed piece carries none', () => {
    expect(blotatoMediaType('story')).toBe('story')
    expect(blotatoMediaType('feed')).toBeNull()
  })

  test("Facebook posts to the account's one Page", async () => {
    const b = blotato({ accounts: [{ id: 101, platform: 'facebook' }], pages: [{ id: '555' }] })
    const publish = makeBlotatoPublisher({ config, fetchImpl: b.fetchImpl, slideUrls, sleep: async () => {} })
    await publish({ pieceId: 'p3', platform: 'facebook', slides: [night(1)], caption: 'This week' })
    const post = b.seen.find((s) => s.url.endsWith('/v2/posts') && s.method === 'POST')
    expect((post?.body as { post: { target: unknown } }).post.target).toEqual({ targetType: 'facebook', pageId: '555' })
  })

  test('refusals are thrown in their own words: no account, two Pages, a refused post, a failed publish', async () => {
    const none = blotato({ accounts: [{ id: 101, platform: 'facebook' }] })
    await expect(makeBlotatoPublisher({ config, fetchImpl: none.fetchImpl, slideUrls })({ pieceId: 'p', platform: 'instagram', slides: [night(1)], caption: 'x' })).rejects.toThrow(/no connected instagram account/)
    const two = blotato({ accounts: [{ id: 101, platform: 'facebook' }], pages: [{ id: '1' }, { id: '2' }] })
    await expect(makeBlotatoPublisher({ config, fetchImpl: two.fetchImpl, slideUrls })({ pieceId: 'p', platform: 'facebook', slides: [night(1)], caption: 'x' })).rejects.toThrow(/2 Pages/)
    const refused = blotato({ accounts: [{ id: 202, platform: 'instagram' }], refuse: 'caption too long' })
    await expect(makeBlotatoPublisher({ config, fetchImpl: refused.fetchImpl, slideUrls })({ pieceId: 'p', platform: 'instagram', slides: [night(1)], caption: 'x' })).rejects.toThrow(/caption too long/)
    const failed = blotato({ accounts: [{ id: 202, platform: 'instagram' }], status: 'failed' })
    await expect(makeBlotatoPublisher({ config, fetchImpl: failed.fetchImpl, slideUrls, sleep: async () => {} })({ pieceId: 'p', platform: 'instagram', slides: [night(1)], caption: 'x' })).rejects.toBeInstanceOf(BlotatoRefusal)
  })

  test('accepted and still publishing after the checks: recorded by its submission, so it is never sent twice', async () => {
    const slow = blotato({ accounts: [{ id: 202, platform: 'instagram' }], status: 'in-progress' })
    const out = await makeBlotatoPublisher({ config, fetchImpl: slow.fetchImpl, slideUrls, sleep: async () => {} })({ pieceId: 'p', platform: 'instagram', slides: [night(1)], caption: 'x' })
    expect(out).toEqual({ ref: 'blotato:sub-1', submission: 'sub-1' })
  })
})
