import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { isFeatureEnabled } from '@/lib/flags/broadcast'
import { getSiteUrl } from '@/lib/site-url'

/**
 * INDEXNOW, FOR BING AND THE ENGINES THAT SHARE ITS NOTICES (the PM's order 3 of 11 November 2026, addition 3, on
 * Lawal's locked direction of 00:56: 'IndexNow for Bing on every publish and change'). Google takes no notices of this
 * kind (it reads the sitemap's lastmod); IndexNow is how Bing hears at once.
 *
 * THE PROTOCOL, read on its own page (https://www.indexnow.org/documentation, 11 November 2026):
 * - "You must host a UTF-8 encoded text key file {your-key}.txt listing the key in the file at the root directory of
 *   your website" (public/<INDEXNOW_KEY>.txt). The key is public by design; it only proves the host is ours.
 * - One POST of JSON { host, key, keyLocation, urlList }: "You can submit up to 10,000 URLs per post."
 * - A URL "which has been added, updated, or deleted". 200 OK, 202 Accepted (key validation pending), 400 bad format,
 *   403 key not valid, 422 URLs not on the host, 429 Too Many Requests (potential spam).
 * - "Search engines adopting the IndexNow protocol agree that submitted URLs will be automatically shared with all
 *   other participating search engines", so one endpoint serves them all.
 *
 * WHEN. The hourly listings run calls notifyIndexNow after its own writes, so no cron is added (law 14 (d)). It sends
 * the public events changed in the last 70 minutes (the hour, and ten minutes of overlap so a slow run misses none) and
 * the guide of each one's city. An hour with no change sends nothing: production changed 262 public events in the 24
 * hours to 11 November 01:20, in bursts, and none in many hours (EVIDENCE\EL-11NOV\growth\change-rate.json).
 * A draft, a private or a held night is never sent, so no unannounced title leaves through its slug.
 *
 * NEVER IN THE WAY. A refusal, a timeout or an unreadable table is one line in the run's log; the run's own work is
 * already done. indexnow_ping turns it off with no deploy.
 */

export const INDEXNOW_KEY = '97224651173fb7ef497f58a4a54d2f44'
export const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/indexnow'
export const INDEXNOW_WINDOW_MS = 70 * 60_000
export const INDEXNOW_MAX_URLS = 10_000
const SENT_STATUSES = ['published', 'cancelled', 'postponed'] as const

export type ChangedEvent = { slug: string | null; venueCity: string | null }
export type IndexNowBody = { host: string; key: string; keyLocation: string; urlList: string[] }

/** The URLs to send for these changed events: each event's page, then each city guide once, at most 10,000. Pure. */
export function indexNowUrls(siteUrl: string, changed: readonly ChangedEvent[], citySlugByName: ReadonlyMap<string, string>): string[] {
  const base = siteUrl.replace(/\/+$/, '')
  const urls = new Set<string>()
  const guides = new Set<string>()
  for (const e of changed) {
    if (!e.slug) continue
    urls.add(`${base}/events/${encodeURIComponent(e.slug)}`)
    const city = e.venueCity ? citySlugByName.get(e.venueCity.trim().toLowerCase()) : undefined
    if (city) guides.add(`${base}/city/${city}`)
  }
  return [...urls, ...guides].slice(0, INDEXNOW_MAX_URLS)
}

/** The request body IndexNow's documentation names, for this site. Pure. */
export function indexNowBody(siteUrl: string, urlList: string[]): IndexNowBody {
  const base = siteUrl.replace(/\/+$/, '')
  return { host: new URL(base).host, key: INDEXNOW_KEY, keyLocation: `${base}/${INDEXNOW_KEY}.txt`, urlList }
}

/** What each answer means, in words for the run's log (the protocol's own table). Pure. */
export function indexNowAnswer(status: number): string {
  if (status === 200) return 'accepted'
  if (status === 202) return 'received, the key still being checked'
  if (status === 400) return 'refused: bad format'
  if (status === 403) return 'refused: the key was not found at its location'
  if (status === 422) return 'refused: a URL is not on this host'
  if (status === 429) return 'refused: too many requests'
  return `answered ${status}`
}

export type IndexNowDeps = {
  enabled: () => Promise<boolean>
  changedSince: (since: Date) => Promise<ChangedEvent[]>
  /**
   * The public nights whose end fell in the window (the PM's 22:12 of 19 November 2026: 'IndexNow pinged on publish,
   * change and end'). A night's end changes its page (it leaves every list at its end, law 16) but writes no
   * updated_at, so changedSince never saw it. IndexNow takes a URL 'which has been added, updated, or deleted'
   * (https://www.indexnow.org/documentation).
   */
  endedSince?: (since: Date, now: Date) => Promise<ChangedEvent[]>
  citySlugs: () => Promise<Map<string, string>>
  post: (body: IndexNowBody) => Promise<number>
  siteUrl: () => string
}

export function indexNowDeps(): IndexNowDeps {
  return {
    enabled: () => isFeatureEnabled('indexnow_ping'),
    changedSince: async (since) => {
      const { data, error } = await createAdminClient()
        .from('events')
        .select('slug, venue_city')
        .gte('updated_at', since.toISOString())
        .eq('visibility', 'public')
        // A test night is never named to the engines (car W), as the guides and the sitemap leave it out.
        .eq('is_test', false)
        .in('status', [...SENT_STATUSES])
        .limit(INDEXNOW_MAX_URLS)
      if (error) throw new Error(`the changed events could not be read: ${error.message}`)
      return ((data ?? []) as { slug: string | null; venue_city: string | null }[]).map((r) => ({ slug: r.slug, venueCity: r.venue_city }))
    },
    endedSince: async (since, now) => {
      // Its stated end in the window, or, with no end stated, its start in the window (the day's end is not known).
      const db = createAdminClient()
      const read = (column: 'end_date' | 'start_date', noEnd: boolean) => {
        let q = db.from('events').select('slug, venue_city').gte(column, since.toISOString()).lte(column, now.toISOString())
          .eq('visibility', 'public').eq('is_test', false).in('status', [...SENT_STATUSES])
        if (noEnd) q = q.is('end_date', null)
        return q.limit(INDEXNOW_MAX_URLS)
      }
      const [stated, open] = await Promise.all([read('end_date', false), read('start_date', true)])
      const error = stated.error ?? open.error
      if (error) throw new Error(`the ended events could not be read: ${error.message}`)
      return ([...(stated.data ?? []), ...(open.data ?? [])] as { slug: string | null; venue_city: string | null }[]).map((r) => ({ slug: r.slug, venueCity: r.venue_city }))
    },
    citySlugs: async () => {
      const { data, error } = await createAdminClient().from('cities').select('name, slug')
      if (error) throw new Error(`the cities could not be read: ${error.message}`)
      return new Map(((data ?? []) as { name: string; slug: string }[]).map((c) => [c.name.trim().toLowerCase(), c.slug]))
    },
    post: async (body) => {
      const res = await fetch(INDEXNOW_ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json; charset=utf-8' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
        cache: 'no-store',
      })
      await res.body?.cancel().catch(() => undefined)
      return res.status
    },
    siteUrl: getSiteUrl,
  }
}

/** Tells IndexNow what changed or ended in the last 70 minutes; words for the run's log. Never throws. */
export async function notifyIndexNow(now: Date, deps: IndexNowDeps = indexNowDeps()): Promise<string> {
  try {
    if (!(await deps.enabled())) return 'not sent: the indexnow_ping switch is off'
    const since = new Date(now.getTime() - INDEXNOW_WINDOW_MS)
    const changed = [...(await deps.changedSince(since)), ...(deps.endedSince ? await deps.endedSince(since, now) : [])]
    if (changed.length === 0) return 'nothing changed or ended in the last 70 minutes; nothing sent'
    const site = deps.siteUrl()
    const urls = indexNowUrls(site, changed, await deps.citySlugs())
    if (urls.length === 0) return 'nothing to send'
    const status = await deps.post(indexNowBody(site, urls))
    return `${urls.length} URL(s) sent: ${indexNowAnswer(status)}`
  } catch (err) {
    return `not sent: ${err instanceof Error ? err.message : String(err)}`
  }
}
