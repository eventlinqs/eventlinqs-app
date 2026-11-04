/**
 * CAR 44 GROUNDWORK, READ ONLY (the CONTROLLER's 15:20, 15:30 and 22:25b of 4 November 2026): for each headline venue's
 * What's on page, ask robots.txt first, then the page, ONE request a second per host, the collector's own named agent,
 * a stop at the first 403 or 429 (law 14 (k)), and count the schema.org Events the collector's own reader finds there.
 * Writes nothing anywhere.
 *
 *   node node_modules/tsx/dist/cli.mjs scripts/verify/headline-probe.mts > C:\dev\EVIDENCE\CAR44\probe.txt
 */
import Module from 'node:module'
import { fileURLToPath } from 'node:url'
import type * as CollectModule from '@/lib/listings/collect'

const EMPTY = fileURLToPath(new URL('../../tests/stubs/empty.ts', import.meta.url))
const cjs = Module as unknown as { _resolveFilename: (request: string, ...rest: unknown[]) => string }
const resolveFilename = cjs._resolveFilename
cjs._resolveFilename = (request: string, ...rest: unknown[]) =>
  request === 'server-only' || request === 'client-only' ? EMPTY : resolveFilename(request, ...rest)

const mod = (await import('@/lib/listings/collect')) as typeof CollectModule & { default?: typeof CollectModule }
const { COLLECTOR_AGENT, robotsVerdict, eventsFromBody } = (mod.default ?? mod) as typeof CollectModule

const CANDIDATES: { city: string; venue: string; url: string }[] = JSON.parse(process.argv[2] ?? '[]')
const lastHit = new Map<string, number>()
const stopped = new Set<string>()

async function polite(url: string): Promise<{ status: number | null; body: string; final: string }> {
  const host = new URL(url).host
  if (stopped.has(host)) return { status: null, body: '', final: url }
  const wait = (lastHit.get(host) ?? 0) + 1000 - Date.now()
  if (wait > 0) await new Promise((r) => setTimeout(r, wait))
  lastHit.set(host, Date.now())
  try {
    const res = await fetch(url, { headers: { 'User-Agent': COLLECTOR_AGENT, Accept: 'text/html' }, redirect: 'follow', signal: AbortSignal.timeout(25000) })
    if (res.status === 403 || res.status === 429) stopped.add(host)
    return { status: res.status, body: res.ok ? await res.text() : '', final: res.url }
  } catch (e) {
    return { status: null, body: `ERR ${e instanceof Error ? e.message : String(e)}`, final: url }
  }
}

/** The sitemaps robots.txt names, and the event-like page addresses they list (one level of index followed). */
async function sitemapEvents(robotsTxt: string, origin: string): Promise<{ maps: string[]; pages: string[] }> {
  const maps = [...robotsTxt.matchAll(/^\s*sitemap:\s*(\S+)/gim)].map((m) => m[1])
  if (maps.length === 0) maps.push(`${origin}/sitemap.xml`)
  const pages: string[] = []
  for (const m of maps.slice(0, 3)) {
    const r = await polite(m)
    const locs = [...r.body.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((x) => x[1])
    const children = locs.filter((l) => /sitemap/i.test(l) && /event|show|whats|performance|production|page/i.test(l)).slice(0, 2)
    for (const c of children) {
      const rc = await polite(c)
      pages.push(...[...rc.body.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((x) => x[1]))
    }
    pages.push(...locs.filter((l) => !/sitemap/i.test(l)))
  }
  return { maps, pages: [...new Set(pages)].filter((p) => /\/(event|events|show|shows|whats-on|performances?|productions?)\/[^/]+/i.test(new URL(p).pathname)) }
}

for (const c of CANDIDATES) {
  const u = new URL(c.url)
  const robots = await polite(`${u.origin}/robots.txt`)
  const verdict = robotsVerdict(robots.status, robots.body, u.pathname + u.search)
  if (verdict === 'disallowed') {
    console.log(`${c.city} | ${c.venue} | ${c.url} | robots ${robots.status}: DISALLOWED, not read`)
    continue
  }
  const page = await polite(c.url)
  const events = page.body ? eventsFromBody(page.body, page.final) : []
  const eventLinks = [...new Set([...page.body.matchAll(/href="([^"#]*(?:\/event[s]?\/|\/whats-on\/|\/shows?\/)[^"#]+)"/gi)].map((m) => new URL(m[1], page.final).toString()))].slice(0, 200)
  let sampleEvents = 0
  let sampleUrl = ''
  if (events.length === 0 && eventLinks.length > 0) {
    sampleUrl = eventLinks.find((l) => new URL(l).host === new URL(page.final).host) ?? ''
    if (sampleUrl && robotsVerdict(robots.status, robots.body, new URL(sampleUrl).pathname) !== 'disallowed') {
      const one = await polite(sampleUrl)
      sampleEvents = one.body ? eventsFromBody(one.body, one.final).length : 0
    }
  }
  const first = events.slice(0, 2).map((e) => `${e.startsAt.slice(0, 10)} ${e.title.slice(0, 40)} @ ${e.venueName.slice(0, 30)}`).join('; ')
  if (process.argv.includes('--sitemaps') && events.length === 0 && sampleEvents === 0) {
    const sm = await sitemapEvents(robots.body, u.origin)
    const pick = sm.pages.find((p) => robotsVerdict(robots.status, robots.body, new URL(p).pathname) !== 'disallowed')
    let n = 0
    if (pick) {
      const one = await polite(pick)
      n = one.body ? eventsFromBody(one.body, one.final).length : 0
    }
    console.log(`${c.city} | ${c.venue} | sitemaps ${sm.maps.join(' ')} | event-like pages ${sm.pages.length}${pick ? ` | sample ${pick.slice(0, 90)}: ${n} Event(s)` : ''}`)
  }
  console.log(
    `${c.city} | ${c.venue} | ${c.url} | robots ${robots.status} ${verdict} | page ${page.status}${page.final !== c.url ? ` -> ${page.final}` : ''} | ` +
      `Events on the page: ${events.length}${first ? ` (${first})` : ''} | event links: ${eventLinks.length}` +
      (sampleUrl ? ` | one event page ${sampleUrl.slice(0, 90)}: ${sampleEvents} Event(s)` : ''),
  )
}
