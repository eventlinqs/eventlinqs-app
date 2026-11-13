import {
  COLLECTOR_AGENT,
  dueSources,
  eventsFromBody,
  planCandidates,
  robotsVerdict,
  seriesConfirmations,
  withPermittedContent,
  type CandidatePlan,
  type FoundEvent,
  type FoundLink,
  type KnownEvent,
  type RegisteredSource,
} from './collect'
import { sameVenue } from '@/lib/events/booking-links'
import { PLATFORM_TIME_ZONE } from '@/lib/dates/event-time'
import { judgeCandidate, sourceHostOf, type CandidateReason, type Confidence } from './judge'
import { eventPagesFromListPage, eventPagesFromSitemap, isSitemap, pageRuleFor } from './page-rules'
import { HUNT_HOLDS, huntVenue, likelyDuplicate, plausibleHuntStart, type HuntSource } from './headline-hunt'
import { canaryOpen, inCanaryTenth } from './canary'
import { CAPTURE_RULE_PER_RUN, captureDecision, underCaptureRule } from './capture-rule'

/** One page a second on a site a page rule reads (the CONTROLLER's 15:54 of 1 November 2026). */
export const PAGE_PAUSE_MS = 1000
/** At most this many event pages of one source in one run; the next run reads the rest. */
export const PAGE_READ_CAP = 200

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
  /** Who presents the night, where its own page says so (FoundEvent.presentedBy); null when it names no one. */
  presentedBy?: string | null
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
  /**
   * STOPS A SOURCE THAT REFUSED US (law 14 (k): 'a stop at the first 403 or 429'; the PM's 09:05 (2) of 13 November 2026):
   * puts it back to 'ask', so no run reads it again until a person re-opens it, and records when and why
   * (listing_sources.stopped_at, stopped_because). Forum Melbourne answered 403 on 18 runs in a row from 5 November
   * because a refusal was retried daily like an outage. The nights it already gave stay listed.
   */
  stopSource?(sourceId: string, because: string, at: Date): Promise<void>
  /** The source's newest runs, newest first (listing_source_runs), for the dead source rule (deadSource). */
  recentRuns?(sourceId: string, n: number): Promise<{ ranAt: string; succeeded: boolean }[]>
  /** Appends the run's row to the source's run log. */
  logRun(row: RunRow): Promise<void>
  /**
   * Publishes a new night the partner rule accepted (public.listing_publish_partner_night): a dated series at the
   * partner's venue, which the hourly listings run makes into the event. Idempotent.
   */
  publishPartnerNight(row: CandidateRow): Promise<void>
  /**
   * Publishes a new night the hunt's rule accepted (./headline-hunt.ts): a dated series at the headline venue the night
   * names, its category from its own words, its seller's link, a licensed_source listing check. Idempotent.
   */
  /** 'promoted' when a night that waited for a person is decided by the hunt's rule now and published (car 44b). */
  publishHuntNight?(row: CandidateRow, hunt: HuntSource, venueName: string): Promise<'published' | 'promoted' | void>
  /**
   * Takes every waiting row whose night has passed out of the queue, saying so; returns how many. onlySources narrows
   * it to those sources' rows (a drive on TEST, which must not touch rows it did not plant); the run never passes it.
   */
  expirePassed(now: Date, onlySources?: readonly string[]): Promise<number>
  /**
   * The published street address of every venue EventLinqs records in one city, keyed by its name in lower case
   * (public.venues.name, address, city_slug). A feed that names such a venue and gives no street takes this one.
   */
  venueAddresses?(citySlug: string): Promise<ReadonlyMap<string, string>>
  /**
   * The names of the venues the capture rule may publish at in one city (./capture-rule.ts): held, not removed, not one
   * that lists its own nights or has claimed itself. A store without it publishes nothing by the capture rule.
   */
  knownVenueNames?(citySlug: string): Promise<readonly string[]>
  /**
   * Writes one confirmed listing check per series this read found again (public.listing_checks; its trigger moves the
   * series' last confirmed day and every night's listing_fresh_until). The collection run reads only sources whose
   * terms allow it, so its basis is 'licensed_source'.
   */
  confirmSeries?(rows: SeriesConfirmationRow[]): Promise<void>
  /** The ids of the sources whose found nights start in the next seven days: each is read every hour. */
  thisWeekSources?(now: Date): Promise<ReadonlySet<string>>
}

export type SeriesConfirmationRow = {
  seriesId: string
  sourceUrl: string
  /** The day of the read in the platform's zone, YYYY-MM-DD. */
  sourceDate: string
  sourceId: string
  outcome: 'confirmed'
  reuseBasis: 'licensed_source'
}

/** The calendar day of an instant in the platform's zone, YYYY-MM-DD. */
function platformDay(at: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: PLATFORM_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at)
}

/**
 * A found night naming a venue EventLinqs records by exactly that name in the source's own city is read at that venue's
 * address: the place the hunt's publisher lists it at (./collect-store.ts publishHuntNight, the venue by name in the
 * city), so it is matched to the nights EventLinqs already lists there. An unknown venue keeps the page's own address,
 * and with none it stays empty and the reviewer's address check holds it. The names are compared trimmed and in lower
 * case, never partly, so a near name never borrows another place's street.
 *
 * Why the page's own spelling gives way (6 November 2026, the LAW 19 planted demonstration on TEST, then production read
 * only): 8 of 20 found addresses at a held venue were spelled otherwise ('81 Ryrie Street, Geelong VIC' against The Play
 * House's '81 Ryrie Street, Geelong VIC 3220'; '354 Moorabool Street' against 'Moorabool St'), and sameVenue
 * (src/lib/events/booking-links.ts) refuses two addresses that differ. So the listed night was never found: a re-read
 * never confirmed its series, whose freshness then ran down, and a changed start planned as a NEW night instead of a
 * time change for a person.
 */
export function withKnownVenueAddress(events: readonly FoundEvent[], addresses: ReadonlyMap<string, string>): FoundEvent[] {
  return events.map((e) => {
    const known = addresses.get(e.venueName.trim().toLowerCase())
    return known && known !== e.venueAddress ? { ...e, venueAddress: known } : e
  })
}

export type SourceOutcome = { sourceId: string; name: string; outcome: string; landed: number; queued: number; acceptedByRule: number }
export type CollectionResult = {
  read: number
  skipped: number
  landed: number
  queued: number
  acceptedByRule: number
  notReached: number
  /** Waiting rows whose night passed before anyone reviewed them, taken out of the queue by this run. */
  expired: number
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

/**
 * Whether a ticket link does not reach its seller (LAW 19 section 4.2 (5); 6 November 2026): the seller's robots.txt first
 * (cached per origin, as every page is read), then one request with the collector's agent. True only for a 404 or 410:
 * a link robots bars, or a seller that does not answer, is not held, since the button falls back to the source page and
 * the daily link check (src/lib/events/link-check-run.ts) reads it again.
 */
async function linkUnreached(
  fetcher: Fetcher,
  url: string,
  robotsByOrigin: Map<string, { status: number | null; body: string }>,
  pauseMs: number,
): Promise<boolean> {
  let at: URL
  try {
    at = new URL(url)
  } catch {
    return true
  }
  let robots = robotsByOrigin.get(at.origin)
  if (!robots) {
    robots = await get(fetcher, `${at.origin}/robots.txt`)
    robotsByOrigin.set(at.origin, robots)
  }
  if (robotsVerdict(robots.status, robots.body, at.pathname + at.search) === 'disallowed') return false
  if (pauseMs > 0) await new Promise((r) => setTimeout(r, pauseMs))
  const answer = await get(fetcher, url)
  return answer.status === 404 || answer.status === 410
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
 * organiser, ./collect-store.ts), only high confidence, only a new night held at the partner's own venue or an added
 * link on a listed night. The database holds the same rule (listing_candidates_decided_by, 20261028204001).
 */
export function acceptedByRule(source: Pick<RegisteredSource, 'partner' | 'verified' | 'partnerVenue'>, plan: CandidatePlan, confidence: Confidence): boolean {
  if (!source.partner || !source.verified || confidence !== 'high') return false
  if (plan.kind === 'adds_links') return true
  if (plan.kind !== 'new' || !source.partnerVenue) return false
  const at = (name: string, address: string | null) => ({ venueId: null, venueName: name, venueAddress: address, title: '', startsAt: plan.event.startsAt })
  return sameVenue(at(source.partnerVenue.name, source.partnerVenue.address), at(plan.event.venueName, plan.event.venueAddress))
}

/** deadline: no source is started after it; one not reached stays due and the next run reads it first. */
/**
 * pauseMs: the wait between two pages of one site when a page rule follows a sitemap (one request a second, the
 * CONTROLLER's 15:54); tests pass 0.
 */
/** Failed runs in a row, at least this many, ... */
export const DEAD_AFTER_RUNS = 6
/** ... the oldest of them at least this long ago, make a source dead. */
export const DEAD_AFTER_MS = 72 * 60 * 60 * 1000

/**
 * A DEAD SOURCE (Lawal's 10:42 of 13 November 2026: capture 'retires dead ones'): its newest runs, newest first, are all
 * failures, at least DEAD_AFTER_RUNS of them, the oldest of that streak at least three days ago. A source down for an
 * afternoon is never retired; one that has answered nothing for three days is, and a person re-opens it. Pure.
 */
export function deadSource(runs: readonly { ranAt: string; succeeded: boolean }[], now: Date): boolean {
  const streak: { ranAt: string }[] = []
  for (const r of runs) {
    if (r.succeeded) break
    streak.push(r)
  }
  if (streak.length < DEAD_AFTER_RUNS) return false
  const oldest = Date.parse(streak[streak.length - 1].ranAt)
  return Number.isFinite(oldest) && now.getTime() - oldest >= DEAD_AFTER_MS
}

export async function runCollection(
  store: CollectionStore,
  fetcher: Fetcher,
  now: Date,
  deadline = Infinity,
  options: { pauseMs?: number; pageCap?: number } = {},
): Promise<CollectionResult> {
  const pauseMs = options.pauseMs ?? PAGE_PAUSE_MS
  /* The big event hunt reads fewer pages per site (HUNT_PAGE_CAP) so every site on its list fits its runs; the daily
     collection run still reads each up to PAGE_READ_CAP. */
  const pageCap = options.pageCap ?? PAGE_READ_CAP
  /* This week first: a source holding nights in the next seven days falls due again 6 hours after its last read (the
     run itself every 6 hours, CONTROLLER 01:04). A failed read of that set never stops the run; every source then keeps
     the daily floor. */
  let thisWeek: ReadonlySet<string> = new Set()
  if (store.thisWeekSources) {
    try {
      thisWeek = await store.thisWeekSources(now)
    } catch (err) {
      console.error('[collection] the sources with nights this week could not be read:', err instanceof Error ? err.message : err)
    }
  }
  const due = dueSources(await store.sources(), now, thisWeek)
  const known = due.length > 0 ? await store.known(now) : []
  const robotsByOrigin = new Map<string, { status: number | null; body: string }>()
  const result: CollectionResult = { read: 0, skipped: 0, landed: 0, queued: 0, acceptedByRule: 0, notReached: 0, expired: 0, sources: [] }
  /* The queue never holds a night that has already happened (the directive's section 21: no checking expired events
     one by one). A failure here never stops the read. */
  try {
    result.expired = await store.expirePassed(now)
  } catch (err) {
    console.error('[collection] passed nights could not be taken out of the queue:', err)
  }

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
    /* The status a site refused us with (403 or 429), on its robots.txt, its page or any page a rule reads: the source is
       then stopped, never read again by a run until a person re-opens it (law 14 (k)). */
    let refusedWith: number | null = null
    const unpublished: string[] = []
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
          if (robots.status === 429) refusedWith = 429
          result.skipped += 1
        } else {
          const res = await get(fetcher, source.pageUrl)
          httpStatus = res.status
          if (res.status === null || res.status < 200 || res.status >= 300) {
            outcome = `the page answered ${res.status ?? 'nothing'}: nothing read`
            if (res.status === 403 || res.status === 429) refusedWith = res.status
            result.skipped += 1
          } else {
            result.read += 1
            succeeded = true
            /* Only what the source permits (D4): a facts only source lands no image, no description and no link. */
            /* A source with a page rule and a sitemap: the rule reads each event page the sitemap lists, robots.txt asked for
               every page, one page a second, never past the run's deadline (./page-rules.ts). Any other answer is read
               for its own Event data or feed, as before. */
            const rule = pageRuleFor(source.pageUrl)
            let raw: FoundEvent[]
            /* A site that answers 403 or 429 is asking us to stop: no further page of it is asked this run, and the run
               says so (WINDOW 5's finding of 16:05, 1 November 2026: a city calendar began refusing after 21 pages). */
            let stoppedBy: string | null = null
            /* A rule's source is its sitemap, or its own list page where the sitemap does not carry the current program
               (WINDOW 2's Forum finding, 1 November 2026); a page the rule itself reads is read below as any page is. */
            const listPage = rule !== null && !isSitemap(res.body) && !rule.eventPath.test(new URL(source.pageUrl).pathname)
            if (rule && (isSitemap(res.body) || listPage)) {
              raw = []
              const pages = listPage ? eventPagesFromListPage(res.body, source.pageUrl, rule) : eventPagesFromSitemap(res.body, rule)
              for (const url of pages.slice(0, pageCap)) {
                if (Date.now() >= deadline) break
                const at = new URL(url)
                let siteRobots = robotsByOrigin.get(at.origin)
                if (!siteRobots) {
                  siteRobots = await get(fetcher, `${at.origin}/robots.txt`)
                  robotsByOrigin.set(at.origin, siteRobots)
                }
                if (robotsVerdict(siteRobots.status, siteRobots.body, at.pathname + at.search) === 'disallowed') continue
                if (pauseMs > 0) await new Promise((r) => setTimeout(r, pauseMs))
                const one = await get(fetcher, url)
                if (one.status === 403 || one.status === 429) {
                  stoppedBy = `the site answered ${one.status} on ${url}: reading stopped`
                  refusedWith = one.status
                  break
                }
                if (one.status !== null && one.status >= 200 && one.status < 300) raw.push(...rule.read(one.body, url))
              }
            } else {
              raw = eventsFromBody(res.body, source.pageUrl)
            }
            const permitted = raw.flatMap((e) => withPermittedContent(e, source.permits) ?? [])
            const city = source.citySlug ?? null
            /* A venue read that fails never stops the source: its nights land as found, and the address check holds them. */
            let addresses: ReadonlyMap<string, string> = new Map()
            if (city && store.venueAddresses) {
              try {
                addresses = await store.venueAddresses(city)
              } catch (err) {
                console.error('[collection] known venue addresses could not be read:', err instanceof Error ? err.message : err)
              }
            }
            const events = withKnownVenueAddress(permitted, addresses)
            const plans = planCandidates(events, known, now, city)
            /* CAPTURE PUBLISHES BY ITSELF (./capture-rule.ts; Lawal's 10:42 to 11:05 of 13 November 2026): a verified
               source in a guide's city, under no other rule, publishes its checked nights at the venues held there. A
               failed venue read publishes nothing by the rule; every night then waits for a person, as before. */
            let captureVenues: readonly string[] | null = null
            if (underCaptureRule(source) && store.knownVenueNames) {
              try {
                captureVenues = await store.knownVenueNames(source.citySlug)
              } catch (err) {
                console.error('[collection] the capture rule could not read its venues:', err instanceof Error ? err.message : err)
              }
            }
            let captureDecided = 0
            found = plans.length
            /* Before stillNew drops the re-finds whose links are already held: a re-find is exactly what confirms. */
            const confirmations = seriesConfirmations(plans, known)
            if (confirmations.length > 0 && store.confirmSeries) {
              const sourceDate = platformDay(now)
              try {
                await store.confirmSeries(
                  confirmations.map((c) => ({ ...c, sourceDate, sourceId: source.id, outcome: 'confirmed' as const, reuseBasis: 'licensed_source' as const })),
                )
              } catch (err) {
                /* A failed confirmation never stops the read; the night simply keeps its old freshness. */
                console.error('[collection] series confirmations could not be written:', err instanceof Error ? err.message : err)
              }
            }
            for (const p of plans) {
              const plan = await stillNew(store, p)
              if (!plan) continue
              const judged = judgeCandidate({ plan, sourceVerified: source.verified, known, sourceHost: sourceHostOf(source.pageUrl), citySlug: city })
              let confidence = judged.confidence
              const reasons = [...judged.reasons]
              /* THE HUNT'S RULE (car 44, Lawal's 15:12 of 4 November 2026): a new night a headline venue's own page states
                 at that venue, with high confidence, is listed without a person; anything else waits, as before. */
              /* Car 44b (the CONTROLLER's 01:05 of 5 November 2026): 'For review ends for these sources: a public ticketed
                 event from a headline venue's own page is accepted by rule ... only a likely duplicate is held'. A called off
                 show and a midnight start (a time the page likely did not state) are held with it. */
              /* The rule's venues: the hunt's, or a venue's own programme (OWN_PROGRAMME_SOURCES, Lawal's 10:42 of
                 13 November 2026), judged by exactly the same holds. */
              let ruleSource: HuntSource | null = source.hunt ?? source.ownProgramme ?? null
              let captureVenue: string | null = null
              if (!ruleSource && captureVenues && plan.kind === 'new' && underCaptureRule(source)) {
                const decision = captureDecision(plan.event, source, captureVenues)
                if ('holds' in decision) {
                  reasons.push(...decision.holds)
                  confidence = 'low'
                } else if (captureDecided < CAPTURE_RULE_PER_RUN && Date.now() < deadline) {
                  /* At most CAPTURE_RULE_PER_RUN a source a run: each asks its ticket link first, inside the run's budget;
                     the rest wait for the next runs, which decide them the same way (publishHuntNight's promote). */
                  ruleSource = decision.rule
                  captureVenue = decision.venue
                }
              }
              const huntAt =
                ruleSource &&
                plan.kind === 'new' &&
                !reasons.some((r) => (HUNT_HOLDS as readonly string[]).includes(r)) &&
                /* Car 44c: a start between midnight and 9 am in Melbourne waits for a person (plausibleHuntStart). */
                plausibleHuntStart(plan.event.startsAt) &&
                !likelyDuplicate(plan.event, known, ruleSource.citySlug, (iso) => platformDay(new Date(iso)))
                  ? (captureVenue ?? huntVenue(ruleSource, plan.event.venueName))
                  : null
              /* ONE PUBLICATION GATE (car 46; LAW 19 section 4; the independent review's gate gap): a hunt night is listed by
                 the rule only at high confidence, through its candidate row, the way the database's own check
                 (listing_candidates_decided_by) allows; anything less lands for a person, with its reasons. The direct
                 publish of car 44b, with no candidate row, no audit and no plausibility check, is gone. */
              let byRule = acceptedByRule(source, plan, confidence) || (huntAt !== null && confidence === 'high')
              if (captureVenue && byRule) captureDecided += 1
              /* LAW 19 SECTION 4.2, RULE (5): a night a rule would publish is first asked whether its ticket link reaches the
                 seller. A 404 or 410 holds it for a person (link_unreached); robots barring the link, or no answer, does not. */
              if (byRule && plan.kind === 'new' && plan.event.links[0] && (await linkUnreached(fetcher, plan.event.links[0].url, robotsByOrigin, pauseMs))) {
                reasons.push('link_unreached')
                confidence = 'low'
                byRule = false
              }
              /* LAW 19 SECTION 7.4, THE RECORDS CANARY: while the source's canary is open, a rule publishes only the
                 records in its tenth (./canary.ts); every other record waits for a person until the canary widens. */
              if (byRule && plan.kind === 'new' && canaryOpen(source) && !inCanaryTenth({ sourceId: source.id, pageUrl: plan.event.pageUrl, startsAt: plan.event.startsAt })) {
                reasons.push('canary_hold')
                confidence = 'low'
                byRule = false
              }
              const foundAt = now.toISOString()
              /* The links first, so an accepted row never names links the event does not carry. */
              if (byRule && plan.kind === 'adds_links') await store.addLinks(plan.eventId, plan.event.links, foundAt)
              const row: CandidateRow = {
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
                presentedBy: plan.event.presentedBy ?? null,
              }
              const isNew = await store.land(row)
              /* Asked on every run, landed or not: the store publishes only a partner rule row with no series yet, so a
                 publish an earlier run could not finish is finished by the next, and nothing is published twice. */
              let promoted = false
              if (byRule && plan.kind === 'new') {
                /* One night that cannot be published never stops the rest of the feed; it stays accepted and the next
                   run asks again. */
                try {
                  if (huntAt && ruleSource && store.publishHuntNight) promoted = (await store.publishHuntNight(row, ruleSource, huntAt)) === 'promoted'
                  else await store.publishPartnerNight(row)
                } catch (err) {
                  unpublished.push(err instanceof Error ? err.message : String(err))
                }
              }
              /* Car 44b: a night that waited for a person from before the hunt, decided by the hunt's rule now, is listed. It
                 counts as landed too: the run log holds queued + accepted_by_rule <= landed (listing_source_runs_counts_add_up),
                 and production refused GMHBA's run row on 5 November 2026 when it did not (car 44c). */
              if (!isNew) {
                if (promoted) {
                  landed += 1
                  ruled += 1
                }
                continue
              }
              landed += 1
              if (byRule) ruled += 1
              else queued += 1
            }
            outcome =
              ruled === 0
                ? `read: ${found} event(s) found, ${landed} new for review`
                : `read: ${found} event(s) found, ${landed} new: ${ruled} accepted by the partner rule, ${queued} for review`
            if (unpublished.length > 0) outcome += `; ${unpublished.length} accepted night(s) not yet published: ${unpublished[0]}`
            if (stoppedBy) outcome += `; ${stoppedBy}`
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
    if (refusedWith !== null) outcome += `; stopped: it answered ${refusedWith}, so no run reads it until a person re-opens it`
    try {
      await store.record(source.id, outcome.slice(0, 500), now, succeeded)
    } catch (err) {
      console.error(`[collection] ${source.name}: its check could not be recorded:`, err)
    }
    if (refusedWith !== null && store.stopSource) {
      try {
        await store.stopSource(
          source.id,
          `It answered ${refusedWith} to our named agent on ${at.slice(0, 10)}. Law 14 (k) stops at the first 403 or 429 and never reads around it; a person re-opens it once the site answers us, or takes its nights from the venue's own feed or submission.`,
          now,
        )
      } catch (err) {
        console.error(`[collection] ${source.name}: its stop could not be recorded:`, err)
      }
    }
    let logged = false
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
      logged = true
    } catch (err) {
      console.error(`[collection] ${source.name}: its run could not be logged:`, err)
    }
    /* RETIRES DEAD ONES: a failed run that makes the source dead (deadSource) puts it back to 'ask' with why, so no run
       reads it until a person re-opens it; the Command Centre already shows it among the sources failing their runs. */
    if (!succeeded && logged && refusedWith === null && store.recentRuns && store.stopSource) {
      try {
        const runs = await store.recentRuns(source.id, DEAD_AFTER_RUNS + 4)
        if (deadSource(runs, now)) {
          await store.stopSource(
            source.id,
            `Retired on ${at.slice(0, 10)}: every run for three days or more has failed (the last: ${outcome.slice(0, 200)}). A person re-opens it once it answers again.`,
            now,
          )
        }
      } catch (err) {
        console.error(`[collection] ${source.name}: whether it is dead could not be read:`, err)
      }
    }
  }
  return result
}
