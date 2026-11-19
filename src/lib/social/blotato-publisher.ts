import type { Publisher } from './store'
import type { Slide } from './campaign'
import { formatOfSlides } from './meta-publisher'

/**
 * ROUTE B: EVENTLINQS' POSTS THROUGH BLOTATO (Lawal's yes of 15 November 2026, 13:55: Blotato Starter, US$29 a month,
 * C:\dev\GROWTH\SPEND-LIMITS.md). The same Publisher as the Meta route (./meta-publisher.ts): a due piece's slides,
 * drawn and stored as public JPEGs by the same step, go to the EventLinqs Instagram or Facebook account connected in
 * Blotato. Blotato's own reference, read 15 November 2026 (help.blotato.com/api/start, /rest-api-reference/publish-post):
 *   the key travels in the blotato-api-key header;
 *   GET  https://backend.blotato.com/v2/users/me/accounts lists the connected accounts (items[].id, items[].platform);
 *   GET  /v2/users/me/accounts/{accountId}/subaccounts gives a Facebook account's Pages (items[].id is target.pageId);
 *   POST /v2/media with a public url returns Blotato's own copy of the image (an older page asks that media come from
 *        Blotato; the newer examples pass any public URL; uploading first satisfies both);
 *   POST /v2/posts with { post: { accountId, content: { text, mediaUrls, platform }, target: { targetType, pageId? ,
 *        mediaType? } } }, content.platform and target.targetType the same, "story" as an Instagram mediaType for a
 *        story; it answers a postSubmissionId, read at GET /v2/posts/{postSubmissionId}.
 * The switch social_auto_publish still decides whether anything is sent; nothing here retries silently: a refusal is
 * thrown with Blotato's own words and the run holds the piece with them.
 */
export const BLOTATO_BASE = 'https://backend.blotato.com/v2'

export type BlotatoConfig = { readonly apiKey: string }

export function blotatoConfigFrom(env: Readonly<Record<string, string | undefined>>): BlotatoConfig | null {
  const key = env.BLOTATO_API_KEY?.trim()
  return key ? { apiKey: key } : null
}

export class BlotatoRefusal extends Error {}

export type BlotatoPublisherDeps = {
  readonly config: BlotatoConfig
  readonly fetchImpl?: typeof fetch
  /** Each slide drawn as a public JPEG at the piece's format, in order (the Meta route's own step). */
  readonly slideUrls: (pieceId: string, slides: readonly Slide[], format: 'feed' | 'story') => Promise<readonly string[]>
  readonly sleep?: (ms: number) => Promise<void>
}

const STATUS_CHECKS = 6
const STATUS_WAIT_MS = 5_000

export function makeBlotatoPublisher(deps: BlotatoPublisherDeps): Publisher {
  const fetchImpl = deps.fetchImpl ?? fetch
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))
  const headers = { 'blotato-api-key': deps.config.apiKey, 'Content-Type': 'application/json' }

  async function call(method: 'GET' | 'POST', path: string, body?: unknown): Promise<Record<string, unknown>> {
    const res = await fetchImpl(`${BLOTATO_BASE}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
    if (!res.ok) {
      const words = typeof json.message === 'string' ? json.message : typeof json.error === 'string' ? json.error : `HTTP ${res.status}`
      throw new BlotatoRefusal(`Blotato refused ${method} ${path}: ${words}`)
    }
    return json
  }

  const items = (json: Record<string, unknown>) => (Array.isArray(json.items) ? (json.items as Array<Record<string, unknown>>) : [])

  return async ({ pieceId, platform, slides, caption }) => {
    const account = items(await call('GET', '/users/me/accounts')).find((a) => String(a.platform ?? '').toLowerCase() === platform)
    if (!account || account.id === undefined) throw new BlotatoRefusal(`Blotato has no connected ${platform} account; connect it in Blotato`)
    const accountId = String(account.id)

    const target: Record<string, string> = { targetType: platform }
    const format = formatOfSlides(slides)
    if (platform === 'facebook') {
      const pages = items(await call('GET', `/users/me/accounts/${encodeURIComponent(accountId)}/subaccounts`))
      if (pages.length !== 1) throw new BlotatoRefusal(`Blotato's Facebook account has ${pages.length} Pages; exactly one, the EventLinqs Page, is expected`)
      target.pageId = String(pages[0].id)
    }
    if (platform === 'instagram' && format === 'story') target.mediaType = 'story'

    const urls = await deps.slideUrls(pieceId, slides, format)
    const mediaUrls: string[] = []
    for (const url of urls) {
      const up = await call('POST', '/media', { url })
      const copied = typeof up.url === 'string' ? up.url : typeof up.publicUrl === 'string' ? up.publicUrl : null
      if (!copied) throw new BlotatoRefusal('Blotato gave no address for an uploaded slide')
      mediaUrls.push(copied)
    }

    const sent = await call('POST', '/posts', { post: { accountId, content: { text: caption, mediaUrls, platform }, target } })
    const submission = typeof sent.postSubmissionId === 'string' ? sent.postSubmissionId : null
    if (!submission) throw new BlotatoRefusal('Blotato gave no postSubmissionId')

    for (let i = 0; i < STATUS_CHECKS; i += 1) {
      const s = await call('GET', `/posts/${encodeURIComponent(submission)}`)
      const status = String(s.status ?? '').toLowerCase()
      if (status === 'published') return { ref: typeof s.publicUrl === 'string' ? s.publicUrl : `blotato:${submission}`, submission }
      if (status === 'failed') throw new BlotatoRefusal(`Blotato could not publish: ${typeof s.errorMessage === 'string' ? s.errorMessage : 'no reason given'}`)
      await sleep(STATUS_WAIT_MS)
    }
    // Accepted and still being published by Blotato: recorded by its submission, so the run never sends it twice.
    return { ref: `blotato:${submission}`, submission }
  }
}

/**
 * BLOTATO'S OWN WORD ON A POST IT ACCEPTED (the PM's 18:40 of 18 November 2026, item 1 (a)): GET /v2/posts/{postSubmissionId},
 * the same reference as above, answers the post's status and, once Blotato has published it, its public URL. A read only;
 * it sends nothing. The social run reads back every post recorded by its submission until its URL is known.
 */
export type BlotatoPostReader = (submission: string) => Promise<{ readonly status: string; readonly publicUrl: string | null }>

/**
 * BLOTATO'S OWN LIST OF PUBLISHED POSTS (GET /v2/published-posts, backend.blotato.com/openapi.json, read 18 November 2026:
 * 'Search published posts', items of { id, content, postUrl, platform, createdAt }, filtered by platform and limit). A read
 * only: it finds a post Blotato published whose submission was never kept.
 */
export type BlotatoPublishedSearch = (platform: string) => Promise<readonly { readonly content: string; readonly postUrl: string | null; readonly createdAt: string }[]>

export function makeBlotatoSearch(config: BlotatoConfig, fetchImpl: typeof fetch = fetch): BlotatoPublishedSearch {
  return async (platform) => {
    const res = await fetchImpl(`${BLOTATO_BASE}/published-posts?platform=${encodeURIComponent(platform)}&limit=50`, { method: 'GET', headers: { 'blotato-api-key': config.apiKey } })
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
    if (!res.ok) throw new BlotatoRefusal(`Blotato refused GET /published-posts: ${typeof json.message === 'string' ? json.message : `HTTP ${res.status}`}`)
    const items = Array.isArray(json.items) ? (json.items as Array<Record<string, unknown>>) : []
    return items.map((i) => ({ content: String(i.content ?? ''), postUrl: typeof i.postUrl === 'string' ? i.postUrl : null, createdAt: String(i.createdAt ?? '') }))
  }
}

export function makeBlotatoReader(config: BlotatoConfig, fetchImpl: typeof fetch = fetch): BlotatoPostReader {
  return async (submission) => {
    const res = await fetchImpl(`${BLOTATO_BASE}/posts/${encodeURIComponent(submission)}`, { method: 'GET', headers: { 'blotato-api-key': config.apiKey } })
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
    if (!res.ok) throw new BlotatoRefusal(`Blotato refused GET /posts/${submission}: ${typeof json.message === 'string' ? json.message : `HTTP ${res.status}`}`)
    return { status: String(json.status ?? '').toLowerCase(), publicUrl: typeof json.publicUrl === 'string' ? json.publicUrl : null }
  }
}

/**
 * BLOTATO'S PUBLISHED POSTS WITH THEIR LATEST FIGURES (car C, measure; the PM's 21:00 of 18 November 2026). GET
 * /v2/analytics, as backend.blotato.com/openapi.json describes it (read 18 November 2026, 23:04): 'List top performing
 * posts', the user's published posts over since and until (since defaults to 30 days ago), filtered by platform, sorted
 * by likes, comments, views or reach, at most 100; each item { id, content, postUrl, platform, createdAt, mediaUrls,
 * latestMetrics: { fetchedAt, metrics } }, every count a string. It 'does not trigger a re-fetch'. A read only: it sends
 * nothing and changes nothing on Blotato.
 */
export type BlotatoAnalyticsItem = {
  readonly id: string
  readonly platform: string
  readonly content: string
  readonly postUrl: string | null
  readonly createdAt: string
  readonly fetchedAt: string | null
  /** Blotato's own metric names (reachCount, likesCount, ...), each a whole number; a count Blotato did not give is absent. */
  readonly metrics: Readonly<Record<string, number>>
}
export type BlotatoAnalyticsList = (q: { readonly platform: 'instagram' | 'facebook'; readonly since: string }) => Promise<readonly BlotatoAnalyticsItem[]>

/** Blotato's counts are strings ('120'); each becomes a whole number, and anything else is left out, never guessed. */
export function blotatoCounts(metrics: unknown): Record<string, number> {
  const out: Record<string, number> = {}
  if (!metrics || typeof metrics !== 'object') return out
  for (const [k, v] of Object.entries(metrics as Record<string, unknown>)) {
    const n = typeof v === 'number' ? v : typeof v === 'string' && /^\d{1,12}$/.test(v.trim()) ? Number(v.trim()) : NaN
    if (Number.isInteger(n) && n >= 0) out[k] = n
  }
  return out
}

export function makeBlotatoAnalytics(config: BlotatoConfig, fetchImpl: typeof fetch = fetch): BlotatoAnalyticsList {
  return async ({ platform, since }) => {
    const q = new URLSearchParams({ platform, since, sortBy: 'reach_count', limit: '100' })
    const res = await fetchImpl(`${BLOTATO_BASE}/analytics?${q}`, { method: 'GET', headers: { 'blotato-api-key': config.apiKey } })
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
    if (!res.ok) throw new BlotatoRefusal(`Blotato refused GET /analytics: ${typeof json.message === 'string' ? json.message : `HTTP ${res.status}`}`)
    const items = Array.isArray(json.items) ? (json.items as Array<Record<string, unknown>>) : []
    return items
      .filter((i) => typeof i.id === 'string' && i.id !== '')
      .map((i) => {
        const latest = (i.latestMetrics && typeof i.latestMetrics === 'object' ? i.latestMetrics : {}) as Record<string, unknown>
        return {
          id: String(i.id),
          platform: String(i.platform ?? platform),
          content: String(i.content ?? ''),
          postUrl: typeof i.postUrl === 'string' && i.postUrl ? i.postUrl : null,
          createdAt: String(i.createdAt ?? ''),
          fetchedAt: typeof latest.fetchedAt === 'string' ? latest.fetchedAt : null,
          metrics: blotatoCounts(latest.metrics),
        }
      })
  }
}
