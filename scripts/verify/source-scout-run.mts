/**
 * THE SOURCE SCOUT, RUN READ ONLY (the CONTROLLER's 16:14 (4) of 1 November 2026). For each site in <sites.json>
 * ([{ name, url, citySlug, kind }]) it reads robots.txt (and the sitemaps it names, or /sitemap_index.xml and
 * /sitemap.xml), then the page, as the collector does: our agent named, one request a second, stop the site on 403 or
 * 429. It writes each verdict and the listing_sources row it would PROPOSE (asking, unverified) to <out.json>. It
 * writes NOTHING to any database; registering the proposals is a reviewed data change on the acting WINDOW 4's path.
 *
 *   node node_modules/tsx/dist/cli.mjs scripts/verify/source-scout-run.mts <sites.json> <out.json>
 */
import { readFileSync, writeFileSync } from 'node:fs'
import type * as CollectModule from '@/lib/listings/collect'
import type * as ScoutModule from '@/lib/listings/source-scout'

/* src is CommonJS to tsx; read each module's exports whichever way the loader hands them over. */
const collectMod = (await import('@/lib/listings/collect')) as typeof CollectModule & { default?: typeof CollectModule }
const scoutMod = (await import('@/lib/listings/source-scout')) as typeof ScoutModule & { default?: typeof ScoutModule }
const { COLLECTOR_AGENT, robotsVerdict } = collectMod.default ?? collectMod
const { proposedSource, scoutSite } = scoutMod.default ?? scoutMod

type Site = { name: string; url: string; citySlug: string; kind: string }
const [sitesFile, out] = process.argv.slice(2)
if (!sitesFile || !out) throw new Error('usage: source-scout-run.mts <sites.json> <out.json>')
const sites = JSON.parse(readFileSync(sitesFile, 'utf8')) as Site[]

const pause = () => new Promise((r) => setTimeout(r, 1000))
async function get(url: string): Promise<{ status: number | null; body: string }> {
  try {
    const res = await fetch(url, { headers: { 'user-agent': COLLECTOR_AGENT }, signal: AbortSignal.timeout(25_000) })
    return { status: res.status, body: await res.text() }
  } catch {
    return { status: null, body: '' }
  }
}
const locs = (xml: string) => [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1])

const results: unknown[] = []
for (const site of sites) {
  const page = new URL(site.url)
  const robots = await get(`${page.origin}/robots.txt`)
  const allowed = robotsVerdict(robots.status, robots.body, page.pathname + page.search) !== 'disallowed'
  let sitemapUrls: string[] = [...robots.body.matchAll(/^\s*sitemap\s*:\s*(\S+)/gim)].map((m) => m[1])
  let status: number | null = null
  let html = ''
  if (allowed) {
    if (sitemapUrls.length === 0) sitemapUrls = [`${page.origin}/sitemap_index.xml`, `${page.origin}/sitemap.xml`]
    /* An index lists the section sitemaps; read the index once, never the sections. */
    const named: string[] = []
    for (const sm of sitemapUrls.slice(0, 2)) {
      await pause()
      const r = await get(sm)
      if (r.status === 403 || r.status === 429) break
      if (r.status !== null && r.status >= 200 && r.status < 300) named.push(sm, ...locs(r.body).filter((u) => /\.xml(\?|$)/i.test(u)))
    }
    sitemapUrls = [...new Set(named)]
    await pause()
    const r = await get(site.url)
    status = r.status
    html = r.body
  }
  const verdict = scoutSite({ url: site.url, robotsAllowed: allowed, status, html, sitemapUrls })
  results.push({ site, verdict, proposed: proposedSource(verdict, site) })
  console.log(`${site.name}: ${verdict.adapter} (${verdict.reason})`)
}
writeFileSync(out, JSON.stringify({ read_at: new Date().toISOString(), results }, null, 2))
