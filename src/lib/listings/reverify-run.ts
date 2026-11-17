import type { SupabaseClient } from '@supabase/supabase-js'
import { eventsFromBody, type FoundEvent } from './collect'
import { pageRuleFor } from './page-rules'
import { politeReader } from './hold-walk-run'
import { judgeNight, verdictOf, type ListedNight } from './night-judge'
import { readEveryRow } from '@/lib/supabase/read-every-row'
import { listingWindowOrPredicate } from '@/lib/events/listing-window'

/**
 * THE ENGINE KEEPS ITS OWN NIGHTS TRUE, AND THE DAY OF CHECK (Lawal, 15 November 2026, 06:03: "anything that goes online must
 * be verified on that day on the real source"; his 06:50, relayed by the PM at 07:00, item 4: "the same day check is PART of
 * the Discovery engine ... the engine ... refreshes itself independently; the same day check enforces accuracy on the day
 * and informs the engine"; the plan, C:\dev\START-16OCT\EL-SAME-DAY-15NOV\plan.md, version 2).
 *
 * The database keeps a listed night public from its newest agreeing read for as long as its distance allows (30 days when
 * it is more than 30 days out, 7 at 8 to 30, 2 at 2 to 7, and inside its last 2 days until 06:00 Melbourne on its own day
 * unless that read was made on its own day: listing_fresh_from_reads, 20261115091001); every public surface already hides a
 * night whose freshness has passed. Most nights stay fresh by their source's own list: the collection run reads every
 * source's list at least daily and a list that still carries a night writes its agreeing check (./collect-run.ts). This run
 * reads, on its own page, ONLY the nights that list reading did not keep fresh: a published listed night still listed
 * whose freshness ends inside the next DUE_AHEAD_MS. So, in each hourly turn of the occurrence run (no new schedule, law 14
 * (d)):
 *   - a night of a source with no list (an import, a hand listing) is read before its tier runs out;
 *   - every night starting today is read between 03:00 and 06:00 Melbourne on its own day (its freshness ends at 06:00
 *     unless a read that day agreed): the day of check, three turns to reach it, before anyone plans their day;
 *   - a night whose page disagrees MARKS ITS SITE (item 4 (e)): every other still listed night read from that site is read
 *     in the same turn, deadline allowing, however fresh it is.
 * Its outcome per night, through the engine's polite reader (robots.txt first, the collector's named agent, one request a
 * second per host, a stop at the first 403 or 429; law 14 (k)), judged by the accuracy sweep's own rules (./night-judge.ts):
 *   AGREE     a listing check, outcome confirmed, timed at this read: fresh again for its tier.
 *   DISAGREE  held at once (private, a listing_holds row with this reading, its next page a day on); hidden, never deleted;
 *             the hold walk and the two source rule decide it.
 *   UNREAD    nothing written: its freshness runs out and it is hidden until a read agrees (item 4 (f): unreadable is not
 *             wrong, so the next agreeing read, list or page, shows it again by itself).
 * A night with no source page on record is UNREAD. Nothing is ever deleted.
 */
export const DUE_AHEAD_MS = 3 * 3_600_000
/** Hosts read at once: each one stays at one request a second; different hosts are read side by side. */
export const HOSTS_AT_ONCE = 6

export type DueNight = ListedNight & {
  series_id: string
  rule: string
  fresh_until: string | null
  source_url: string | null
  reuse_basis: string | null
  links: { url: string; price_from_cents: number | null; availability: string }[]
}

export type ReverifyOutcome = {
  due: number
  pages: number
  agreed: number
  held: number
  unread: number
  /** Nights read because another night of their site disagreed this turn (item 4 (e)). */
  marked: number
  failed: string[]
  said: string[]
}

/** Is this night due a read now? Only when its own freshness ends inside DUE_AHEAD_MS (or has ended). Pure. */
export function isDue(n: Pick<DueNight, 'fresh_until'>, now: Date): boolean {
  const fresh = n.fresh_until ? new Date(n.fresh_until).getTime() : -Infinity
  return fresh < now.getTime() + DUE_AHEAD_MS
}

/** The day in Melbourne a read happened on, as a listing check's source_date. Pure. */
export function readDay(at: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Melbourne', year: 'numeric', month: '2-digit', day: '2-digit' }).format(at)
}

/** The site a night was read from, 'www.' aside; null when its page is not a web address. Pure. */
export function siteOf(url: string | null): string | null {
  if (!url) return null
  try {
    return new URL(url).host.replace(/^www\./, '')
  } catch {
    return null
  }
}

/** One page's nights judged: what the page states of each, by the shared judge. Pure. */
export function judgePageNights(url: string, body: string, nights: readonly DueNight[]): { night: DueNight; verdict: ReturnType<typeof verdictOf> }[] {
  const rule = pageRuleFor(url)
  let found: FoundEvent[] = []
  try {
    found = rule ? rule.read(body, url) : eventsFromBody(body, url)
  } catch {
    found = []
  }
  return nights.map((night) => ({ night, verdict: verdictOf(judgeNight(night, night.rule !== 'once', body, found, night.links)) }))
}

/** Every published public listed night still listed (until it has ENDED, the shared listing window), freshest last. */
async function listedNights(db: SupabaseClient, now: Date): Promise<DueNight[]> {
  const events = await readEveryRow<{
    id: string; title: string; start_date: string; timezone: string | null; venue_name: string | null; venue_address: string | null
    listing_series_id: string; listing_fresh_until: string | null
  }>('the published listed nights still listed', (from, to) =>
    db.from('events')
      .select('id, title, start_date, timezone, venue_name, venue_address, listing_series_id, listing_fresh_until')
      .eq('status', 'published').eq('visibility', 'public')
      .or(listingWindowOrPredicate(now))
      .not('listing_series_id', 'is', null)
      .order('listing_fresh_until', { ascending: true, nullsFirst: true }).order('id')
      .range(from, to),
  )
  if (events.length === 0) return []
  const seriesIds = [...new Set(events.map((e) => e.listing_series_id))]
  const series = new Map<string, string>()
  const lastCheck = new Map<string, { source_url: string | null; reuse_basis: string | null }>()
  for (let i = 0; i < seriesIds.length; i += 100) {
    const chunk = seriesIds.slice(i, i + 100)
    const { data: s, error: se } = await db.from('event_series').select('id, rule').in('id', chunk)
    if (se) throw new Error(`the series could not be read: ${se.message}`)
    for (const r of s ?? []) series.set(r.id as string, r.rule as string)
    const checks = await readEveryRow<{ series_id: string; source_url: string | null; reuse_basis: string | null; checked_at: string }>(
      'their listing checks',
      (from, to) => db.from('listing_checks').select('series_id, source_url, reuse_basis, checked_at').in('series_id', chunk).order('checked_at', { ascending: false }).order('id').range(from, to),
    )
    for (const c of checks) if (!lastCheck.has(c.series_id) && /^https?:\/\//.test(c.source_url ?? '')) lastCheck.set(c.series_id, { source_url: c.source_url, reuse_basis: c.reuse_basis })
  }
  return events.map((e) => ({
    id: e.id, title: e.title, start_date: e.start_date, timezone: e.timezone, venue_name: e.venue_name, venue_address: e.venue_address,
    series_id: e.listing_series_id, rule: series.get(e.listing_series_id) ?? 'once', fresh_until: e.listing_fresh_until,
    source_url: lastCheck.get(e.listing_series_id)?.source_url ?? null, reuse_basis: lastCheck.get(e.listing_series_id)?.reuse_basis ?? null,
    links: [],
  }))
}

async function withLinks(db: SupabaseClient, nights: DueNight[]): Promise<void> {
  const byId = new Map(nights.filter((n) => n.links.length === 0).map((n) => [n.id, n]))
  const ids = [...byId.keys()]
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await db.from('event_booking_links').select('event_id, url, price_from_cents, availability').in('event_id', ids.slice(i, i + 100))
    if (error) throw new Error(`the booking links could not be read: ${error.message}`)
    for (const l of data ?? []) byId.get(l.event_id as string)?.links.push({ url: l.url as string, price_from_cents: (l.price_from_cents as number | null) ?? null, availability: (l.availability as string) ?? 'unknown' })
  }
}

/**
 * One turn: every due night read and acted on, soonest lapse first, none started after `deadline`; the rest are taken by
 * the next hourly turn (their freshness may lapse meanwhile, which hides them: never the other way round). Then every
 * still listed night of a site that disagreed this turn, deadline allowing.
 */
export async function reverifyNights(db: SupabaseClient, fetcher: typeof fetch, now: Date, deadline: number): Promise<ReverifyOutcome> {
  const out: ReverifyOutcome = { due: 0, pages: 0, agreed: 0, held: 0, unread: 0, marked: 0, failed: [], said: [] }
  const listed = await listedNights(db, now)
  const due = listed.filter((n) => isDue(n, now))
  out.due = due.length
  const reader = politeReader(fetcher)
  const confirmed = new Set<string>()
  const readPages = new Set<string>()
  const disagreeingSites = new Set<string>()

  async function act(url: string, nights: DueNight[]): Promise<void> {
    readPages.add(url)
    const page = await reader.read(url)
    out.pages += 1
    const readAt = new Date()
    if (page.why) {
      out.unread += nights.length
      return
    }
    for (const { night, verdict } of judgePageNights(url, page.body, nights)) {
      try {
        if (verdict.verdict === 'agree') {
          if (!confirmed.has(night.series_id)) {
            const { error } = await db.from('listing_checks').insert({
              series_id: night.series_id,
              source_url: url,
              source_date: readDay(readAt),
              checked_at: readAt.toISOString(),
              import_file: 'same day re-read',
              outcome: 'confirmed',
              reuse_basis: night.reuse_basis,
            })
            if (error) throw new Error(`the check could not be written: ${error.message}`)
            confirmed.add(night.series_id)
          }
          out.agreed += 1
        } else if (verdict.verdict === 'disagree') {
          const site = siteOf(url)
          if (site) disagreeingSites.add(site)
          const { data: open, error: oe } = await db.from('listing_holds').select('id').eq('event_id', night.id).is('released_at', null).limit(1)
          if (oe) throw new Error(`the open holds could not be read: ${oe.message}`)
          const { error: ve } = await db.from('events').update({ visibility: 'private' }).eq('id', night.id).eq('visibility', 'public')
          if (ve) throw new Error(`the night could not be held: ${ve.message}`)
          if (!open || open.length === 0) {
            const { error: he } = await db.from('listing_holds').insert({
              event_id: night.id,
              series_id: night.series_id,
              field: verdict.field ?? 'start',
              scope: 'night',
              reason: 'officials_disagree',
              readings: [{ url, read: verdict.detail, read_at: readAt.toISOString(), by: 'same day re-read' }],
              next_source: url,
              next_check_at: new Date(readAt.getTime() + 86_400_000).toISOString(),
            })
            if (he) throw new Error(`the hold could not be written: ${he.message}`)
          }
          out.held += 1
          out.said.push(`held ${night.title} (${night.id}): ${verdict.detail}`)
        } else {
          out.unread += 1
        }
      } catch (err) {
        out.failed.push(`${night.title}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }
  }

  /** Reads the nights page by page: hosts side by side, each host's pages one after another (one request a second each). */
  async function readAll(nights: DueNight[], counted: (n: number) => void): Promise<void> {
    const byPage = new Map<string, DueNight[]>()
    for (const n of nights) {
      if (!n.source_url) {
        out.unread += 1
        continue
      }
      if (readPages.has(n.source_url)) continue
      byPage.set(n.source_url, [...(byPage.get(n.source_url) ?? []), n])
    }
    await withLinks(db, [...byPage.values()].flat())
    const byHost = new Map<string, string[]>()
    for (const url of byPage.keys()) {
      const host = new URL(url).host
      byHost.set(host, [...(byHost.get(host) ?? []), url])
    }
    const hosts = [...byHost.values()]
    async function lane(): Promise<void> {
      for (let urls = hosts.shift(); urls; urls = hosts.shift()) {
        for (const url of urls) {
          const these = byPage.get(url) ?? []
          if (Date.now() >= deadline) {
            out.unread += these.length
            continue
          }
          counted(these.length)
          await act(url, these)
        }
      }
    }
    await Promise.all(Array.from({ length: HOSTS_AT_ONCE }, lane))
  }

  await readAll(due, () => {})
  // INFORMS THE ENGINE (item 4 (e)): a site that disagreed has every other still listed night read now.
  if (disagreeingSites.size > 0) {
    const dueIds = new Set(due.map((n) => n.id))
    const marked = listed.filter((n) => !dueIds.has(n.id) && disagreeingSites.has(siteOf(n.source_url) ?? ''))
    await readAll(marked, (k) => {
      out.marked += k
    })
  }
  return out
}
