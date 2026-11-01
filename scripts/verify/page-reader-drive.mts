/**
 * THE PAGE READER ON THE REAL SITE, READ ONLY (the CONTROLLER's 15:54 of 1 November 2026). Reads a source's own sitemap
 * and each event page its rule reads, as the collector does: our agent named, robots.txt asked for every page, one page a
 * second, facts only. Writes NOTHING to any database: it prints what would land as candidates and saves it to <out>.
 *
 *   node node_modules/tsx/dist/cli.mjs scripts/verify/page-reader-drive.mts <sitemap url> <out.json> [max pages]
 */
import { writeFileSync } from 'node:fs'
import { COLLECTOR_AGENT, robotsVerdict } from '@/lib/listings/collect'
import { eventPagesFromSitemap, isSitemap, pageRuleFor } from '@/lib/listings/page-rules'

const [sitemapUrl, out, maxArg] = process.argv.slice(2)
if (!sitemapUrl || !out) throw new Error('usage: page-reader-drive.mts <sitemap url> <out.json> [max pages]')
const max = Number(maxArg ?? 200)
const rule = pageRuleFor(sitemapUrl)
if (!rule) throw new Error(`no page rule for ${sitemapUrl}`)

async function get(url: string): Promise<{ status: number; body: string }> {
  const res = await fetch(url, { headers: { 'user-agent': COLLECTOR_AGENT }, signal: AbortSignal.timeout(25_000) })
  return { status: res.status, body: await res.text() }
}

const origin = new URL(sitemapUrl).origin
const robots = await get(`${origin}/robots.txt`)
const sitemap = await get(sitemapUrl)
if (!isSitemap(sitemap.body)) throw new Error(`${sitemapUrl} is not a sitemap (HTTP ${sitemap.status})`)
const pages = eventPagesFromSitemap(sitemap.body, rule).slice(0, max)
const found: unknown[] = []
const skipped: { url: string; why: string }[] = []
let read = 0
let withNights = 0
for (const url of pages) {
  const u = new URL(url)
  if (robotsVerdict(robots.status, robots.body, u.pathname + u.search) === 'disallowed') {
    skipped.push({ url, why: 'robots.txt disallows' })
    continue
  }
  await new Promise((r) => setTimeout(r, 1000))
  const one = await get(url)
  if (one.status === 403 || one.status === 429) {
    skipped.push({ url, why: `HTTP ${one.status}: the site asked us to stop; reading stopped` })
    break
  }
  if (one.status < 200 || one.status >= 300) {
    skipped.push({ url, why: `HTTP ${one.status}` })
    continue
  }
  read += 1
  const nights = rule.read(one.body, url)
  if (nights.length > 0) withNights += 1
  found.push(...nights)
}
const upcoming = (found as { startsAt: string }[]).filter((e) => e.startsAt >= new Date().toISOString())
const summary = { sitemap: sitemapUrl, robots: robots.status, event_pages: pages.length, read, pages_with_nights: withNights, nights: found.length, upcoming_nights: upcoming.length, skipped: skipped.length, read_at: new Date().toISOString() }
writeFileSync(out, JSON.stringify({ summary, skipped, found }, null, 2))
console.log(JSON.stringify(summary))
