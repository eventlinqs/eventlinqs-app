import {
  COLLECTOR_AGENT,
  dueSources,
  eventsFromBody,
  planCandidates,
  robotsVerdict,
  withPermittedContent,
  type CandidatePlan,
  type FoundLink,
  type KnownEvent,
  type RegisteredSource,
} from './collect'
import { judgeCandidate, type CandidateReason, type Confidence } from './judge'

/**
 * ONE COLLECTION RUN (item 19; the rules in ./collect.ts, the reasons in docs/walk-in/COLLECTION-RUN.md). Daily from
 * the engine plan of 28 October 2026 (part A); each source is still read only on its own pace.
 *
 * For each source the register says may be read and is due: robots.txt first (a disallow, or a robots.txt we cannot
 * reach, reads nothing), then the page itself, once, and only its own Event data. Each find is judged (./judge.ts):
 * a high confidence new night or added link from a partner's own feed is accepted by the partner rule; everything else
 * lands in listing_candidates as waiting, the exception queue a person works on /admin/collected. A changed time or
 * venue on a listed night is always a person's. One source failing never stops the rest: each run writes a row in
 * the source's run log (listing_source_runs) as well as its latest outcome. The reads and writes are the store's
 * (./collect-store.ts), so this file's own test drives every path.
 */

export type Fetcher = (url: string, init: { headers: Record<string, string>; signal: AbortSignal }) => Promise<{ status: number; text(): Promise<string> }>

export type CandidateRow = {
  sourceId: string
  foundAt: string
  kind: CandidatePlan['kind']
  eventId: string | null
  change: 'time_changed' | 'venue_changed' | null
  title: string
  startsAt: string
  endsAt: string | null
  venueName: string
  venueAddress: string | null
  pageUrl: string
  imageUrl: string | null
  description: string | null
  links: FoundLink[]
  confidence: Confidence
  reasons: CandidateReason[]
  /** partner_rule: accepted by the run, never waiting; person: waits for a person. */
  decidedBy: 'person' | 'partner_rule'
}

/** One row of a source's run log (listing_source_runs). */
export type RunRow = {
  sourceId: string
  ranAt: string
  succeeded: boolean
  httpStatus: number | null
  outcome: string
  found: number
  landed: number
  queued: number
  acceptedByRule: number
}

export type CollectionStore = {
  sources(): Promise<RegisteredSource[]>
  known(now: Date): Promise<KnownEvent[]>
  /** The booking link addresses an event already carries. */
  heldLinks(eventId: string): Promise<Set<string>>
  /** Adds links to a listed event as curated links (the partner rule's half of an accept; ./collect-accept.ts). */
  addLinks(eventId: string, links: FoundLink[], foundAt: string): Promise<void>
  /** True when it was new; a candidate found before (the same source, page and start) is left as it is. */
  land(row: CandidateRow): Promise<boolean>
  /** succeeded: the source's page or feed was read, so its last successful collection moves to at. */
  record(sourceId: string, outcome: string, at: Date, succeeded: boolean): Promise<void>
  /** Appends the run's row to the source's run log. */
  logRun(row: RunRow): Promise<void>
}

export type SourceOutcome = { sourceId: string; name: string; outcome: string; landed: number; queued: number; acceptedByRule: number }
export type CollectionResult = {
  read: number
  skipped: number
  landed: number
  queued: number
  acceptedByRule: number
  notReached: number
  sources: SourceOutcome[]
}

/**
 * How long one fetch may take. Bendigo Pride Festival's feed answered in 7.3 to 12.6 s on 28 October 2026 and once
 * passed the 15 s this was. Robots.txt and the page together stay inside the 60 s the cron keeps after its last start.
 */
export const FETCH_TIMEOUT_MS = 30_000

async function get(fetcher: Fetcher, url: string): Promise<{ status: number | null; body: string }> {
  try {
    const res = await fetcher(url, { headers: { 'User-Agent': COLLECTOR_AGENT, Accept: 'text/html,text/calendar,text/plain' }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
    return { status: res.status, body: res.status >= 200 && res.status < 300 ? await res.text() : '' }
  } catch {
    return { status: null, body: '' }
  }
}

/** Links the event already carries are not offered again; a candidate with nothing new is not landed. */
async function stillNew(store: CollectionStore, plan: CandidatePlan): Promise<CandidatePlan | null> {
  if (plan.kind !== 'adds_links') return plan
  const held = await store.heldLinks(plan.eventId)
  const links = plan.event.links.filter((l) => !held.has(l.url))
  return links.length === 0 ? null : { ...plan, event: { ...plan.event, links } }
}

/**
 * The partner rule: only a partner's own verified feed (listing_sources.organisation_id or venue_id on a claimed
 * organiser, ./collect-store.ts), only high confidence, only a new night or an added link. The database holds the same
 * rule (listing_candidates_decided_by, 20261028204001).
 */
export function acceptedByRule(source: Pick<RegisteredSource, 'partner' | 'verified'>, plan: CandidatePlan, confidence: Confidence): boolean {
  return source.partner && source.verified && confidence === 'high' && (plan.kind === 'new' || plan.kind === 'adds_links')
}

/** deadline: no source is started after it; one not reached stays due and the next run reads it first. */
export async function runCollection(store: CollectionStore, fetcher: Fetcher, now: Date, deadline = Infinity): Promise<CollectionResult> {
  const due = dueSources(await store.sources(), now)
  const known = due.length > 0 ? await store.known(now) : []
  const robotsByOrigin = new Map<string, { status: number | null; body: string }>()
  const result: CollectionResult = { read: 0, skipped: 0, landed: 0, queued: 0, acceptedByRule: 0, notReached: 0, sources: [] }

  for (const [i, source] of due.entries()) {
    if (Date.now() >= deadline) {
      result.notReached = due.length - i
      break
    }
    let outcome: string
    let httpStatus: number | null = null
    let found = 0
    let landed = 0
    let queued = 0
    let ruled = 0
    let succeeded = false
    try {
      if (!source.permits.facts) {
        /* The database never lets such a source be 'read'; the run holds the same rule on its own. */
        outcome = 'the source permits no facts: nothing read'
        result.skipped += 1
      } else {
        const page = new URL(source.pageUrl)
        let robots = robotsByOrigin.get(page.origin)
        if (!robots) {
          robots = await get(fetcher, `${page.origin}/robots.txt`)
          robotsByOrigin.set(page.origin, robots)
        }
        if (robotsVerdict(robots.status, robots.body, page.pathname + page.search) === 'disallowed') {
          outcome = robots.status === null || robots.status >= 500 ? 'robots.txt unreachable: nothing read' : 'robots.txt disallows this page: nothing read'
          httpStatus = robots.status
          result.skipped += 1
        } else {
          const res = await get(fetcher, source.pageUrl)
          httpStatus = res.status
          if (res.status === null || res.status < 200 || res.status >= 300) {
            outcome = `the page answered ${res.status ?? 'nothing'}: nothing read`
            result.skipped += 1
          } else {
            result.read += 1
            succeeded = true
            /* Only what the source permits (D4): a facts only source lands no image, no description and no link. */
            const events = eventsFromBody(res.body, source.pageUrl).flatMap((e) => withPermittedContent(e, source.permits) ?? [])
            const plans = planCandidates(events, known, now)
            found = plans.length
            for (const p of plans) {
              const plan = await stillNew(store, p)
              if (!plan) continue
              const { confidence, reasons } = judgeCandidate({ plan, sourceVerified: source.verified, known })
              const byRule = acceptedByRule(source, plan, confidence)
              const foundAt = now.toISOString()
              /* The links first, so an accepted row never names links the event does not carry. */
              if (byRule && plan.kind === 'adds_links') await store.addLinks(plan.eventId, plan.event.links, foundAt)
              const isNew = await store.land({
                sourceId: source.id,
                foundAt,
                kind: plan.kind,
                eventId: plan.kind === 'new' ? null : plan.eventId,
                change: plan.kind === 'changes_facts' ? plan.change : null,
                title: plan.event.title.slice(0, 200),
                startsAt: plan.event.startsAt,
                endsAt: plan.event.endsAt,
                venueName: plan.event.venueName,
                venueAddress: plan.event.venueAddress,
                pageUrl: plan.event.pageUrl,
                imageUrl: plan.event.imageUrl,
                description: plan.event.description,
                links: plan.event.links,
                confidence,
                reasons,
                decidedBy: byRule ? 'partner_rule' : 'person',
              })
              if (!isNew) continue
              landed += 1
              if (byRule) ruled += 1
              else queued += 1
            }
            outcome =
              ruled === 0
                ? `read: ${found} event(s) found, ${landed} new for review`
                : `read: ${found} event(s) found, ${landed} new: ${ruled} accepted by the partner rule, ${queued} for review`
          }
        }
      }
    } catch (err) {
      outcome = `failed: ${err instanceof Error ? err.message : String(err)}`
      if (!succeeded) result.skipped += 1
      /* A failure part way through a read still logs what landed before it. */
      found = Math.max(found, landed)
    }
    result.landed += landed
    result.queued += queued
    result.acceptedByRule += ruled
    result.sources.push({ sourceId: source.id, name: source.name, outcome, landed, queued, acceptedByRule: ruled })
    const at = now.toISOString()
    try {
      await store.record(source.id, outcome.slice(0, 500), now, succeeded)
    } catch (err) {
      console.error(`[collection] ${source.name}: its check could not be recorded:`, err)
    }
    try {
      await store.logRun({
        sourceId: source.id,
        ranAt: at,
        succeeded,
        httpStatus,
        outcome: outcome.slice(0, 500),
        found: succeeded ? found : 0,
        landed: succeeded ? landed : 0,
        queued: succeeded ? queued : 0,
        acceptedByRule: succeeded ? ruled : 0,
      })
    } catch (err) {
      console.error(`[collection] ${source.name}: its run could not be logged:`, err)
    }
  }
  return result
}
