import { describe, expect, test } from 'vitest'
import type { Slide } from '../../../src/lib/social/campaign'
import { graphCaller, makeMetaPublisher, metaConfigFrom, MetaRefusal, type GraphCall } from '../../../src/lib/social/meta-publisher'

/**
 * CAR 58, THE META PUBLISHER, on Meta's recorded answers (the shapes on Meta's own pages, read 8 November 2026,
 * C:\dev\EVIDENCE\EL-8NOV\meta): a container {"id"}, its {"status_code"}, a publish {"id"}, the publishing limit
 * {"data":[{"quota_usage","config":{"quota_total","quota_duration"}}]}, a Page photo {"id","post_id"}, an error
 * {"error":{"message","type":"OAuthException","code"}}. Never a real call.
 */

const CONFIG = { pageId: '111222333444555', pageToken: 'PAGE-TOKEN', igUserId: '17841400000000001' }

const night = (n: number): Slide =>
  ({ t: 'night', composition: 'night_led', eventId: `e${n}`, chip: null, when: 'Sat 14 Nov', day: 'Sat', title: `Night ${n}`, meta: 'Geelong', why: null, photo: null, credit: null }) as unknown as Slide
const story = (n: number): Slide =>
  ({ t: 'story', composition: 'night_led', eventId: `e${n}`, chip: 'Tonight', when: '8pm', title: `Story ${n}`, meta: 'Geelong', photo: null, credit: null, sticker: 'Link' }) as unknown as Slide

type Call = { method: string; path: string; params: Record<string, string> }

/** A Graph stand-in answering in Meta's recorded shapes; `script` overrides one path's answers in order. */
function recorded(script: Record<string, Array<Record<string, unknown> | Error>> = {}) {
  const calls: Call[] = []
  let n = 0
  const graph: GraphCall = async (method, path, params) => {
    calls.push({ method, path, params: { ...params } })
    const queue = script[`${method} ${path}`]
    if (queue && queue.length) {
      const next = queue.shift()!
      if (next instanceof Error) throw next
      return next
    }
    if (path.endsWith('/content_publishing_limit')) return { data: [{ quota_usage: 2, config: { quota_total: 50, quota_duration: 86400 } }] }
    if (method === 'GET') return { status_code: 'FINISHED', id: path }
    if (path.endsWith('/media')) return { id: `container-${++n}` }
    if (path.endsWith('/media_publish')) return { id: `media-${++n}` }
    if (path.endsWith('/photos')) return params.published === 'false' ? { id: `photo-${++n}` } : { id: `photo-${++n}`, post_id: `${CONFIG.pageId}_post-${n}` }
    if (path.endsWith('/feed')) return { id: `${CONFIG.pageId}_feed-${++n}` }
    throw new Error(`unrecorded ${method} ${path}`)
  }
  return { calls, graph }
}

const urlsFor = async (_id: string, slides: readonly Slide[], format: 'feed' | 'story') => slides.map((_, i) => `https://store.example/social/p/${i + 1}-${format}.jpg`)
const noWait = async () => undefined

describe('the five names, or nothing is wired', () => {
  const full = { META_APP_ID: '123', META_APP_SECRET: 's', META_PAGE_ID: 'p', META_PAGE_ACCESS_TOKEN: 't', META_IG_USER_ID: 'i' }
  test('all five present: the Page, its token and the Instagram account', () => {
    expect(metaConfigFrom(full)).toEqual({ pageId: 'p', pageToken: 't', igUserId: 'i' })
  })
  test.each(Object.keys(full))('without %s, null', (k) => {
    expect(metaConfigFrom({ ...full, [k]: '' })).toBeNull()
  })
})

describe('Instagram', () => {
  test('one slide: the limit read first, a container with its caption, FINISHED, then published', async () => {
    const { calls, graph } = recorded()
    const pub = makeMetaPublisher({ config: CONFIG, graph, slideUrls: urlsFor, sleep: noWait })
    const out = await pub({ pieceId: 'p1', platform: 'instagram', slides: [night(1)], caption: 'Saturday in Geelong' })
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      `GET ${CONFIG.igUserId}/content_publishing_limit`,
      `POST ${CONFIG.igUserId}/media`,
      'GET container-1',
      `POST ${CONFIG.igUserId}/media_publish`,
    ])
    expect(calls[1].params).toEqual({ image_url: 'https://store.example/social/p/1-feed.jpg', caption: 'Saturday in Geelong' })
    expect(calls[3].params).toEqual({ creation_id: 'container-1' })
    expect(out.ref).toBe('instagram:media-2')
  })

  test('three slides: a carousel, each image a carousel item, then one CAROUSEL container with the caption', async () => {
    const { calls, graph } = recorded()
    const pub = makeMetaPublisher({ config: CONFIG, graph, slideUrls: urlsFor, sleep: noWait })
    await pub({ pieceId: 'p2', platform: 'instagram', slides: [night(1), night(2), night(3)], caption: 'This weekend' })
    const media = calls.filter((c) => c.path === `${CONFIG.igUserId}/media`)
    expect(media.slice(0, 3).map((c) => c.params)).toEqual([1, 2, 3].map((i) => ({ image_url: `https://store.example/social/p/${i}-feed.jpg`, is_carousel_item: 'true' })))
    expect(media[3].params).toEqual({ media_type: 'CAROUSEL', children: 'container-1,container-2,container-3', caption: 'This weekend' })
  })

  test('a story: STORIES containers at 9:16, no caption', async () => {
    const { calls, graph } = recorded()
    const pub = makeMetaPublisher({ config: CONFIG, graph, slideUrls: urlsFor, sleep: noWait })
    await pub({ pieceId: 'p3', platform: 'instagram', slides: [story(1)], caption: 'ignored' })
    expect(calls.find((c) => c.path === `${CONFIG.igUserId}/media`)?.params).toEqual({ image_url: 'https://store.example/social/p/1-story.jpg', media_type: 'STORIES' })
  })

  test('the 24 hour limit reached: nothing is made, the reason is said', async () => {
    const { calls, graph } = recorded({ [`GET ${CONFIG.igUserId}/content_publishing_limit`]: [{ data: [{ quota_usage: 50, config: { quota_total: 50, quota_duration: 86400 } }] }] })
    const pub = makeMetaPublisher({ config: CONFIG, graph, slideUrls: urlsFor, sleep: noWait })
    await expect(pub({ pieceId: 'p4', platform: 'instagram', slides: [night(1)], caption: 'x' })).rejects.toThrow("Instagram's publishing limit is reached: 50 of 50 in 24 hours")
    expect(calls).toHaveLength(1)
  })

  test('a container in ERROR is never published', async () => {
    const { calls, graph } = recorded({ 'GET container-1': [{ status_code: 'ERROR', id: 'container-1' }] })
    const pub = makeMetaPublisher({ config: CONFIG, graph, slideUrls: urlsFor, sleep: noWait })
    await expect(pub({ pieceId: 'p5', platform: 'instagram', slides: [night(1)], caption: 'x' })).rejects.toThrow('the Instagram container container-1 is ERROR')
    expect(calls.some((c) => c.path.endsWith('/media_publish'))).toBe(false)
  })

  test('a container still preparing after six checks is held, not published', async () => {
    const waiting = Array.from({ length: 6 }, () => ({ status_code: 'IN_PROGRESS', id: 'container-1' }))
    const { calls, graph } = recorded({ 'GET container-1': waiting })
    const pub = makeMetaPublisher({ config: CONFIG, graph, slideUrls: urlsFor, sleep: noWait })
    await expect(pub({ pieceId: 'p6', platform: 'instagram', slides: [night(1)], caption: 'x' })).rejects.toThrow('Meta was still preparing')
    expect(calls.some((c) => c.path.endsWith('/media_publish'))).toBe(false)
  })

  test('more than ten slides is refused before anything is made', async () => {
    const { calls, graph } = recorded()
    const pub = makeMetaPublisher({ config: CONFIG, graph, slideUrls: urlsFor, sleep: noWait })
    const slides = Array.from({ length: 11 }, (_, i) => night(i + 1))
    await expect(pub({ pieceId: 'p7', platform: 'instagram', slides, caption: 'x' })).rejects.toThrow('at most 10')
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(0)
  })
})

describe('Facebook', () => {
  test('one slide: a Page photo with its caption, published; the post id is the reference', async () => {
    const { calls, graph } = recorded()
    const pub = makeMetaPublisher({ config: CONFIG, graph, slideUrls: urlsFor, sleep: noWait })
    const out = await pub({ pieceId: 'p8', platform: 'facebook', slides: [night(1)], caption: 'Saturday in Geelong' })
    expect(calls).toEqual([{ method: 'POST', path: `${CONFIG.pageId}/photos`, params: { url: 'https://store.example/social/p/1-feed.jpg', caption: 'Saturday in Geelong', published: 'true' } }])
    expect(out.ref).toBe(`facebook:${CONFIG.pageId}_post-1`)
  })

  test('several slides: each photo unpublished, then one Page post attaching them in order', async () => {
    const { calls, graph } = recorded()
    const pub = makeMetaPublisher({ config: CONFIG, graph, slideUrls: urlsFor, sleep: noWait })
    await pub({ pieceId: 'p9', platform: 'facebook', slides: [night(1), night(2)], caption: 'This weekend' })
    expect(calls[0].params).toEqual({ url: 'https://store.example/social/p/1-feed.jpg', published: 'false' })
    expect(calls[2]).toEqual({
      method: 'POST',
      path: `${CONFIG.pageId}/feed`,
      params: { message: 'This weekend', 'attached_media[0]': '{"media_fbid":"photo-1"}', 'attached_media[1]': '{"media_fbid":"photo-2"}' },
    })
  })

  test('a story is held with its reason and nothing is drawn or sent', async () => {
    const { calls, graph } = recorded()
    let drawn = 0
    const pub = makeMetaPublisher({ config: CONFIG, graph, slideUrls: async (...a) => { drawn += 1; return urlsFor(...a) }, sleep: noWait })
    await expect(pub({ pieceId: 'p10', platform: 'facebook', slides: [story(1)], caption: 'x' })).rejects.toThrow('a Facebook story is not on the publisher')
    expect(calls).toHaveLength(0)
    expect(drawn).toBe(0)
  })
})

describe('the Graph call', () => {
  test("a refusal carries Meta's own message and code; the token rides in the header, never the address", async () => {
    const seen: { url: string; init: RequestInit }[] = []
    const fake = (async (url: string, init: RequestInit) => {
      seen.push({ url, init })
      return new Response(JSON.stringify({ error: { message: 'Invalid OAuth access token.', type: 'OAuthException', code: 190 } }), { status: 400 })
    }) as unknown as typeof fetch
    const graph = graphCaller('PAGE-TOKEN-SECRET', fake, 'https://graph.example/v27.0')
    await expect(graph('POST', '1784/media', { image_url: 'https://x/1.jpg' })).rejects.toThrow(new MetaRefusal('Meta: Invalid OAuth access token. (code 190)'))
    expect(seen[0].url).toBe('https://graph.example/v27.0/1784/media')
    expect(seen[0].url).not.toContain('PAGE-TOKEN-SECRET')
    expect((seen[0].init.headers as Record<string, string>).authorization).toBe('Bearer PAGE-TOKEN-SECRET')
    expect(String(seen[0].init.body)).toBe('image_url=https%3A%2F%2Fx%2F1.jpg')
  })
})
