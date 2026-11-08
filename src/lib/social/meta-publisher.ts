import type { Slide } from './campaign'
import type { SocialPlatform } from './cadence'
import type { Publisher } from './store'

/**
 * THE META PUBLISHER (car 58; C:\dev\GROWTH\META-CONNECTION-7NOV.md, the windows' part (b)). The one function the social
 * run passes in place of null: it posts an approved piece to EventLinqs' own Instagram professional account and Facebook
 * Page, as Meta's own documents say, read 8 November 2026 (C:\dev\EVIDENCE\EL-8NOV\meta):
 *
 *   Instagram (developers.facebook.com/docs/instagram-platform/content-publishing/): a container per image,
 *     POST /{ig-user-id}/media with image_url ("We will cURL your image using the passed in URL so it must be on a public
 *     server"; "JPEG is the only image format supported"), media_type=STORIES for a story, is_carousel_item=true for each
 *     image of a carousel and then one container with media_type=CAROUSEL and children; the container's status_code read
 *     (EXPIRED, ERROR, FINISHED, IN_PROGRESS, PUBLISHED) and published only when FINISHED; POST /{ig-user-id}/media_publish
 *     with creation_id. The limit first: GET /{ig-user-id}/content_publishing_limit?fields=quota_usage,config answers
 *     {"data":[{"quota_usage":2,"config":{"quota_total":50,"quota_duration":86400}}]} (its reference page); we plan to 50.
 *   Facebook (developers.facebook.com/docs/graph-api/reference/page/photos/): one photo, POST /{page-id}/photos with url and
 *     caption ("message" there is "Deprecated. Please use the caption param instead"); several, each uploaded with
 *     published=false, then POST /{page-id}/feed with message and attached_media[n]={"media_fbid":...}. A Facebook story is
 *     not on those pages, so a Facebook story piece is held with that reason, never sent another way.
 *
 * Every refusal carries Meta's own message and is thrown, so the run holds the schedule with it (store.publishDuePieces:
 * "nothing is retried silently"). The switch social_auto_publish stays OFF until Lawal says yes; this only ever runs
 * behind it, and only once the five META_ names exist (metaConfigFrom). The token travels in the Authorization header,
 * never in an address. Graph API v27.0: "The latest Graph API version is: v27.0" (developers.facebook.com/docs/graph-api/
 * changelog/, read 8 November 2026).
 */

export const GRAPH_VERSION = 'v27.0'
export const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`
/** Our own plan, below Meta's: the reference page states 50 a day, another section of the publishing page 100. */
export const DAILY_POSTS_PLANNED = 50
/** Carousel children: the plan's ten (META-CONNECTION-7NOV.md), inside the publishing page's "up to 20". */
export const CAROUSEL_MOST = 10

export type MetaConfig = { readonly pageId: string; readonly pageToken: string; readonly igUserId: string }

/** The connection, only when every one of the five names Lawal's script writes is present; else null (nothing is wired). */
export function metaConfigFrom(env: Readonly<Record<string, string | undefined>>): MetaConfig | null {
  const v = (k: string) => (env[k] ?? '').trim()
  const names = ['META_APP_ID', 'META_APP_SECRET', 'META_PAGE_ID', 'META_PAGE_ACCESS_TOKEN', 'META_IG_USER_ID']
  if (names.some((k) => v(k) === '')) return null
  return { pageId: v('META_PAGE_ID'), pageToken: v('META_PAGE_ACCESS_TOKEN'), igUserId: v('META_IG_USER_ID') }
}

export class MetaRefusal extends Error {}

/** One Graph call: GET with a query, POST with a form body. Throws MetaRefusal carrying Meta's own message. */
export type GraphCall = (method: 'GET' | 'POST', path: string, params: Readonly<Record<string, string>>) => Promise<Record<string, unknown>>

export function graphCaller(token: string, fetchImpl: typeof fetch = fetch, base: string = GRAPH_BASE): GraphCall {
  return async (method, path, params) => {
    const body = new URLSearchParams(params)
    const url = method === 'GET' ? `${base}/${path}?${body.toString()}` : `${base}/${path}`
    let res: Response
    try {
      res = await fetchImpl(url, {
        method,
        headers: { authorization: `Bearer ${token}`, ...(method === 'POST' ? { 'content-type': 'application/x-www-form-urlencoded' } : {}) },
        body: method === 'POST' ? body.toString() : undefined,
        signal: AbortSignal.timeout(30_000),
      })
    } catch {
      throw new MetaRefusal(`Meta did not answer /${path.split('?')[0]}`)
    }
    let json: Record<string, unknown> = {}
    try {
      json = (await res.json()) as Record<string, unknown>
    } catch {
      /* an answer that is not JSON is judged by its status below */
    }
    const err = json.error as { message?: string; code?: number } | undefined
    if (!res.ok || err) throw new MetaRefusal(`Meta: ${err?.message ?? `HTTP ${res.status}`}${err?.code !== undefined ? ` (code ${err.code})` : ''}`)
    return json
  }
}

export type MetaPublisherDeps = {
  readonly config: MetaConfig
  readonly graph: GraphCall
  /** Each slide drawn as a public JPEG at the piece's format, in order. */
  readonly slideUrls: (pieceId: string, slides: readonly Slide[], format: 'feed' | 'story') => Promise<readonly string[]>
  readonly sleep?: (ms: number) => Promise<void>
}

const STATUS_CHECKS = 6
const STATUS_WAIT_MS = 5_000

const idOf = (json: Record<string, unknown>, what: string): string => {
  const id = json.id
  if (typeof id !== 'string' || id === '') throw new MetaRefusal(`Meta gave no id for ${what}`)
  return id
}

export function formatOfSlides(slides: readonly Slide[]): 'feed' | 'story' {
  return slides.some((s) => s.t === 'story') ? 'story' : 'feed'
}

export function makeMetaPublisher(deps: MetaPublisherDeps): Publisher {
  const { config, graph } = deps
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))

  /** Published only once Meta says the container is FINISHED; ERROR or EXPIRED, or still preparing, is held. */
  async function whenFinished(container: string): Promise<void> {
    for (let i = 0; i < STATUS_CHECKS; i += 1) {
      const s = await graph('GET', container, { fields: 'status_code' })
      const code = String(s.status_code ?? '')
      if (code === 'FINISHED') return
      if (code === 'ERROR' || code === 'EXPIRED') throw new MetaRefusal(`Meta: the Instagram container ${container} is ${code}`)
      if (code === 'PUBLISHED') throw new MetaRefusal(`Meta: the Instagram container ${container} is already PUBLISHED`)
      await sleep(STATUS_WAIT_MS)
    }
    throw new MetaRefusal(`Meta was still preparing the Instagram container ${container} after ${(STATUS_CHECKS * STATUS_WAIT_MS) / 1000} seconds`)
  }

  async function instagram(urls: readonly string[], format: 'feed' | 'story', caption: string): Promise<string> {
    const limit = await graph('GET', `${config.igUserId}/content_publishing_limit`, { fields: 'quota_usage,config' })
    const row = (limit.data as { quota_usage?: number; config?: { quota_total?: number } }[] | undefined)?.[0]
    const used = Number(row?.quota_usage ?? 0)
    const total = Math.min(Number(row?.config?.quota_total ?? DAILY_POSTS_PLANNED), DAILY_POSTS_PLANNED)
    if (used >= total) throw new MetaRefusal(`Instagram's publishing limit is reached: ${used} of ${total} in 24 hours`)

    const publish = async (container: string) => {
      await whenFinished(container)
      return idOf(await graph('POST', `${config.igUserId}/media_publish`, { creation_id: container }), 'the published post')
    }
    if (format === 'story') {
      const refs: string[] = []
      for (const url of urls) refs.push(await publish(idOf(await graph('POST', `${config.igUserId}/media`, { image_url: url, media_type: 'STORIES' }), 'a story container')))
      return refs.join(',')
    }
    if (urls.length === 1) return publish(idOf(await graph('POST', `${config.igUserId}/media`, { image_url: urls[0], caption }), 'the post container'))
    if (urls.length > CAROUSEL_MOST) throw new MetaRefusal(`the piece has ${urls.length} slides; an Instagram carousel takes at most ${CAROUSEL_MOST} here`)
    const children: string[] = []
    for (const url of urls) {
      const child = idOf(await graph('POST', `${config.igUserId}/media`, { image_url: url, is_carousel_item: 'true' }), 'a carousel image')
      await whenFinished(child)
      children.push(child)
    }
    return publish(idOf(await graph('POST', `${config.igUserId}/media`, { media_type: 'CAROUSEL', children: children.join(','), caption }), 'the carousel container'))
  }

  async function facebook(urls: readonly string[], format: 'feed' | 'story', caption: string): Promise<string> {
    if (format === 'story') throw new MetaRefusal('a Facebook story is not on the publisher (Meta\'s Page photos and posts pages publish feed photos only); post it from the phone')
    if (urls.length === 1) {
      const one = await graph('POST', `${config.pageId}/photos`, { url: urls[0], caption, published: 'true' })
      return typeof one.post_id === 'string' && one.post_id !== '' ? one.post_id : idOf(one, 'the Page photo')
    }
    const media: string[] = []
    for (const url of urls) media.push(idOf(await graph('POST', `${config.pageId}/photos`, { url, published: 'false' }), 'an unpublished Page photo'))
    const params: Record<string, string> = { message: caption }
    media.forEach((id, i) => {
      params[`attached_media[${i}]`] = JSON.stringify({ media_fbid: id })
    })
    return idOf(await graph('POST', `${config.pageId}/feed`, params), 'the Page post')
  }

  return async ({ pieceId, platform, slides, caption }: { pieceId: string; platform: SocialPlatform; slides: readonly Slide[]; caption: string }) => {
    if (slides.length === 0) throw new MetaRefusal('the piece has no slides')
    const format = formatOfSlides(slides)
    if (platform === 'facebook' && format === 'story') return { ref: `facebook:${await facebook([], format, caption)}` }
    const urls = await deps.slideUrls(pieceId, slides, format)
    if (urls.length !== slides.length) throw new MetaRefusal(`only ${urls.length} of ${slides.length} slides could be drawn`)
    const ref = platform === 'instagram' ? await instagram(urls, format, caption) : await facebook(urls, format, caption)
    return { ref: `${platform}:${ref}` }
  }
}
