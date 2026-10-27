import {
  COLLECTOR_AGENT,
  dueSources,
  eventsFromHtml,
  planCandidates,
  robotsVerdict,
  type CandidatePlan,
  type FoundLink,
  type KnownEvent,
  type RegisteredSource,
} from './collect'

/**
 * ONE WEEKLY COLLECTION RUN (item 19; the rules in ./collect.ts, the reasons in docs/walk-in/COLLECTION-RUN.md).
 *
 * For each source the register says may be read and is due: robots.txt first (a disallow, or a robots.txt we cannot
 * reach, reads nothing), then the page itself, once, and only its own Event data. What it finds lands in
 * listing_candidates as waiting; a person accepts or refuses each on /admin/collected. One source failing never stops
 * the rest: each outcome is written on the source's own row. The reads and writes are the store's
 * (./collect-store.ts), so this file's own test drives every path.
 */

export type Fetcher = (url: string, init: { headers: Record<string, string>; signal: AbortSignal }) => Promise<{ status: number; text(): Promise<string> }>

export type CandidateRow = {
  sourceId: string
  foundAt: string
  kind: CandidatePlan['kind']
  eventId: string | null
  title: string
  startsAt: string
  endsAt: string | null
  venueName: string
  venueAddress: string | null
  pageUrl: string
  imageUrl: string | null
  links: FoundLink[]
}

export type CollectionStore = {
  sources(): Promise<RegisteredSource[]>
  known(now: Date): Promise<KnownEvent[]>
  /** The booking link addresses an event already carries. */
  heldLinks(eventId: string): Promise<Set<string>>
  /** True when it was new; a candidate found before (the same source, page and start) is left as it is. */
  land(row: CandidateRow): Promise<boolean>
  record(sourceId: string, outcome: string, at: Date): Promise<void>
}

export type SourceOutcome = { sourceId: string; name: string; outcome: string; landed: number }
export type CollectionResult = { read: number; skipped: number; landed: number; notReached: number; sources: SourceOutcome[] }

const FETCH_TIMEOUT_MS = 15_000

async function get(fetcher: Fetcher, url: string): Promise<{ status: number | null; body: string }> {
  try {
    const res = await fetcher(url, { headers: { 'User-Agent': COLLECTOR_AGENT, Accept: 'text/html,text/plain' }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
    return { status: res.status, body: res.status >= 200 && res.status < 300 ? await res.text() : '' }
  } catch {
    return { status: null, body: '' }
  }
}

/** Links the event already carries are not offered again; a candidate with nothing new is not landed. */
async function stillNew(store: CollectionStore, plan: CandidatePlan): Promise<CandidatePlan | null> {
  if (plan.kind === 'new') return plan
  const held = await store.heldLinks(plan.eventId)
  const links = plan.event.links.filter((l) => !held.has(l.url))
  return links.length === 0 ? null : { ...plan, event: { ...plan.event, links } }
}

/** deadline: no source is started after it; one not reached stays due and the next run reads it first. */
export async function runCollection(store: CollectionStore, fetcher: Fetcher, now: Date, deadline = Infinity): Promise<CollectionResult> {
  const due = dueSources(await store.sources(), now)
  const known = due.length > 0 ? await store.known(now) : []
  const robotsByOrigin = new Map<string, { status: number | null; body: string }>()
  const result: CollectionResult = { read: 0, skipped: 0, landed: 0, notReached: 0, sources: [] }

  for (const [i, source] of due.entries()) {
    if (Date.now() >= deadline) {
      result.notReached = due.length - i
      break
    }
    let outcome: string
    let landed = 0
    try {
      const page = new URL(source.pageUrl)
      let robots = robotsByOrigin.get(page.origin)
      if (!robots) {
        robots = await get(fetcher, `${page.origin}/robots.txt`)
        robotsByOrigin.set(page.origin, robots)
      }
      if (robotsVerdict(robots.status, robots.body, page.pathname + page.search) === 'disallowed') {
        outcome = robots.status === null || robots.status >= 500 ? 'robots.txt unreachable: nothing read' : 'robots.txt disallows this page: nothing read'
        result.skipped += 1
      } else {
        const res = await get(fetcher, source.pageUrl)
        if (res.status === null || res.status < 200 || res.status >= 300) {
          outcome = `the page answered ${res.status ?? 'nothing'}: nothing read`
          result.skipped += 1
        } else {
          result.read += 1
          const plans = planCandidates(eventsFromHtml(res.body, source.pageUrl), known, now)
          for (const p of plans) {
            const plan = await stillNew(store, p)
            if (!plan) continue
            const isNew = await store.land({
              sourceId: source.id,
              foundAt: now.toISOString(),
              kind: plan.kind,
              eventId: plan.kind === 'adds_links' ? plan.eventId : null,
              title: plan.event.title.slice(0, 200),
              startsAt: plan.event.startsAt,
              endsAt: plan.event.endsAt,
              venueName: plan.event.venueName,
              venueAddress: plan.event.venueAddress,
              pageUrl: plan.event.pageUrl,
              imageUrl: plan.event.imageUrl,
              links: plan.event.links,
            })
            if (isNew) landed += 1
          }
          outcome = `read: ${plans.length} event(s) found, ${landed} new for review`
        }
      }
    } catch (err) {
      outcome = `failed: ${err instanceof Error ? err.message : String(err)}`
      result.skipped += 1
    }
    result.landed += landed
    result.sources.push({ sourceId: source.id, name: source.name, outcome, landed })
    try {
      await store.record(source.id, outcome.slice(0, 500), now)
    } catch (err) {
      console.error(`[collection] ${source.name}: its check could not be recorded:`, err)
    }
  }
  return result
}
