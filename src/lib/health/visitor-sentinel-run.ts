/**
 * THE VISITOR SENTINEL'S RUN (the controller's 16:43 of 1 November 2026). Reads the LIVE home page and every guide
 * city's page as a visitor would, as a named crawler, read only; reads the database's facts about every night those
 * pages link; judges each page (./visitor-sentinel.ts); and follows every internal link once. A page that does not
 * answer, or a read that fails, is itself a failure: the sentinel never reports a clean run it could not make.
 * The counted routes (/out, /e, /s, /go) are never fetched, so the sentinel never adds a visit or a click.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { HealthResult } from './result'
import { judgeVisitorPage, linksOnPage, type PageEventFacts } from './visitor-sentinel'

export const VISITOR_SENTINEL_AGENT = 'EventLinqs-visitor-sentinel/1.0 (crawler; read only)'
/** Enough for every link on the home page and four guide cities, with room; more is reported, never silently cut. */
const MAX_INTERNAL_LINKS = 600

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>

const fail = (id: string, label: string, detail: string, action: string): HealthResult => ({
  id, label, severity: 'critical', ok: false, detail, action,
})

async function factsFor(db: SupabaseClient, slugs: string[]): Promise<PageEventFacts[]> {
  const out: PageEventFacts[] = []
  for (let i = 0; i < slugs.length; i += 100) {
    const chunk = slugs.slice(i, i + 100)
    const { data: events, error } = await db
      .from('events')
      .select('id, slug, city_primary, start_date, end_date, timezone, status')
      .in('slug', chunk)
      .limit(chunk.length)
    if (error) throw new Error(`the nights could not be read: ${error.message}`)
    const ids = (events ?? []).map((e) => e.id as string)
    const { data: links, error: linkError } = ids.length
      ? await db.from('event_booking_links').select('event_id, availability').in('event_id', ids).limit(ids.length * 20)
      : { data: [], error: null }
    if (linkError) throw new Error(`the booking links could not be read: ${linkError.message}`)
    for (const e of events ?? []) {
      const own = (links ?? []).filter((l) => l.event_id === e.id)
      out.push({
        slug: e.slug as string,
        citySlug: (e.city_primary as string | null) ?? null,
        startDate: e.start_date as string,
        endDate: (e.end_date as string | null) ?? null,
        timezone: (e.timezone as string | null) ?? null,
        status: e.status as string,
        deadBookingLinks: own.filter((l) => l.availability === 'dead').length,
        liveBookingLinks: own.filter((l) => l.availability !== 'dead').length,
      })
    }
  }
  return out
}

export async function runVisitorSentinel(opts: { db: SupabaseClient; base: string; fetcher?: Fetcher; now?: Date }): Promise<HealthResult[]> {
  const { db, base } = opts
  const fetcher: Fetcher = opts.fetcher ?? ((url, init) => fetch(url, init))
  const now = opts.now ?? new Date()
  const headers = { 'user-agent': VISITOR_SENTINEL_AGENT }
  const results: HealthResult[] = []

  const { data: cities, error } = await db.from('cities').select('slug').eq('free_guide', true).eq('is_active', true).limit(50)
  if (error) return [fail('visitor-cities', 'Guide cities', `could not be read: ${error.message}`, 'Check the database answers; nothing else could be judged.')]
  const pages = [{ path: '/', citySlug: null as string | null }, ...(cities ?? []).map((c) => ({ path: `/city/${c.slug as string}`, citySlug: c.slug as string }))]

  const internal = new Set<string>()
  for (const page of pages) {
    let html: string
    try {
      const res = await fetcher(`${base}${page.path}`, { headers })
      if (!res.ok) {
        results.push(fail(`visitor-page:${page.path}`, `Public page ${page.path}`, `answered ${res.status}`, 'A visitor cannot open this page; check the deployment and its logs.'))
        continue
      }
      html = await res.text()
    } catch (err) {
      results.push(fail(`visitor-page:${page.path}`, `Public page ${page.path}`, `did not answer: ${err instanceof Error ? err.message : String(err)}`, 'A visitor cannot open this page.'))
      continue
    }
    const links = linksOnPage(html)
    for (const l of links.internal) internal.add(l)
    try {
      const facts = await factsFor(db, links.events)
      results.push(...judgeVisitorPage({ path: page.path, citySlug: page.citySlug, html, facts, now }))
    } catch (err) {
      results.push(fail(`visitor-facts:${page.path}`, `Facts behind ${page.path}`, err instanceof Error ? err.message : String(err), 'The page could not be judged; check the database answers.'))
    }
  }

  const toCheck = [...internal].slice(0, MAX_INTERNAL_LINKS)
  const dead: string[] = []
  for (let i = 0; i < toCheck.length; i += 6) {
    await Promise.all(
      toCheck.slice(i, i + 6).map(async (path) => {
        try {
          const res = await fetcher(`${base}${path}`, { headers, method: 'GET' })
          if (res.status >= 400) dead.push(`${path} (${res.status})`)
        } catch {
          dead.push(`${path} (no answer)`)
        }
      }),
    )
  }
  results.push({
    id: 'visitor-dead-internal',
    label: 'Internal links a visitor can follow',
    severity: 'critical',
    ok: dead.length === 0 && internal.size <= MAX_INTERNAL_LINKS,
    detail:
      dead.length === 0
        ? `${toCheck.length} followed, none dead${internal.size > MAX_INTERNAL_LINKS ? `; ${internal.size - MAX_INTERNAL_LINKS} not followed (over the cap)` : ''}`
        : `${dead.length} of ${toCheck.length} dead: ${dead.slice(0, 12).join(', ')}`,
    action: dead.length === 0 ? undefined : 'Each dead link is a page a visitor reaches as an error; fix the link or the page.',
  })
  return results
}
