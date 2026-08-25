/**
 * SITEMAP URL SWEEP: request every URL the sitemap publishes and classify it.
 *
 * ============================================================================
 * WHY THIS EXISTS
 * ============================================================================
 *
 * A sitemap is a PUBLISHED PROMISE. Every <loc> in it is EventLinqs telling
 * Google, in writing, "this page exists, please index it". A URL in there that
 * answers 404 is not a broken link somebody might click; it is a broken link we
 * mailed to the crawler ourselves. Google's own documentation is explicit that
 * a sitemap should list canonical, indexable URLs:
 *
 *   "Don't include URLs that redirect or that aren't canonical."
 *   https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap
 *   (fetched 2026-08-25)
 *
 * On 25 August 2026 the production sitemap published 586 URLs. It was built at
 * deploy time, and the demo purge had removed 46 events and 16 organisations
 * since. Nothing rebuilt it, so it went on advertising deleted pages. That is
 * the same class of defect as the organiser 404 and the cached-row rail: a
 * second copy of something a table owns, with nothing keeping the two in step.
 *
 * This script is the measurement, not the guard. It loads the real sitemap over
 * HTTP, requests EVERY URL in it (not a sample), follows nothing, and reports
 * each one as 200, 3xx (with its Location), 404, other status, or a transport
 * error. The static build-time guard is scripts/guards/sitemap-resolves.mjs.
 *
 * READ ONLY. It issues GET requests to a public website and writes nothing
 * anywhere, so it is safe against production.
 *
 * USAGE
 *   node scripts/verify/sitemap-url-sweep.mjs --base https://www.eventlinqs.com.au
 *   node scripts/verify/sitemap-url-sweep.mjs --base http://127.0.0.1:3210 --json out.json
 *
 * FLAGS
 *   --base <origin>     origin to sweep. Required.
 *   --sitemap <url>     override the sitemap URL (default <base>/sitemap.xml).
 *   --json <path>       write the full per-URL result set as JSON.
 *   --concurrency <n>   parallel requests (default 8).
 *   --limit <n>         stop after n URLs (diagnostics only; a partial sweep is
 *                       labelled PARTIAL in the output and never reads as a pass).
 */

const args = process.argv.slice(2)
function flag(name, fallback = undefined) {
  const i = args.indexOf(`--${name}`)
  if (i === -1) return fallback
  const v = args[i + 1]
  if (v === undefined || v.startsWith('--')) return true
  return v
}

const BASE = flag('base')
if (!BASE || BASE === true) {
  console.error('[sitemap-sweep] --base <origin> is required, e.g. --base https://www.eventlinqs.com.au')
  process.exit(2)
}
const SITEMAP_URL = flag('sitemap', `${String(BASE).replace(/\/$/, '')}/sitemap.xml`)
const JSON_OUT = flag('json')
const CONCURRENCY = Number(flag('concurrency', 8))
const LIMIT = Number(flag('limit', 0))

const UA = 'EventLinqs-sitemap-sweep/1.0 (+https://www.eventlinqs.com.au)'

async function fetchSitemapUrls(url, seen = new Set()) {
  if (seen.has(url)) return []
  seen.add(url)
  const res = await fetch(url, { headers: { 'user-agent': UA } })
  if (!res.ok) {
    throw new Error(`sitemap ${url} answered ${res.status}`)
  }
  const xml = await res.text()
  // A sitemap index nests <sitemap><loc>, a urlset nests <url><loc>. Both are
  // handled: recurse into an index so a sharded sitemap is swept whole.
  const isIndex = /<sitemapindex[\s>]/i.test(xml)
  const locs = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map(m => decodeXml(m[1]))
  if (!isIndex) return locs
  const out = []
  for (const child of locs) out.push(...(await fetchSitemapUrls(child, seen)))
  return out
}

function decodeXml(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
}

/** The bucket a result is reported under. */
function classify(status) {
  if (status === 200) return '200'
  if (status === 301 || status === 302 || status === 307 || status === 308) return 'redirect'
  if (status === 404) return '404'
  return 'other'
}

async function probe(url) {
  const started = Date.now()
  try {
    // redirect: 'manual' is the whole point. Following a redirect would report
    // 200 for a URL that is not the one the sitemap published, which is exactly
    // the finding this sweep exists to surface.
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'manual',
      headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml' },
    })
    return {
      url,
      status: res.status,
      bucket: classify(res.status),
      location: res.headers.get('location') ?? null,
      ms: Date.now() - started,
    }
  } catch (err) {
    return { url, status: null, bucket: 'error', error: String(err?.message ?? err), ms: Date.now() - started }
  }
}

/**
 * THE <loc> ORIGIN IS NOT NECESSARILY THE HOST YOU ARE SWEEPING.
 *
 * `NEXT_PUBLIC_*` values are inlined at BUILD time, so a locally served build
 * emits `https://www.eventlinqs.com.au/...` in its sitemap no matter what
 * `NEXT_PUBLIC_SITE_URL` says when `next start` runs. The first local run of this
 * script therefore fetched the sitemap from 127.0.0.1 and then quietly requested
 * 730 PRODUCTION URLs, reporting 187 404s that were all real facts about the
 * wrong machine.
 *
 * Every URL is now pinned onto --base, and the rewrite is COUNTED AND PRINTED so
 * it can never be a silent substitution again. The question this script answers
 * is "does this path resolve on this host", and the path is what carries it.
 */
function pinToBase(url, base) {
  const b = new URL(base)
  const u = new URL(url)
  if (u.origin === b.origin) return { url, rewritten: false }
  u.protocol = b.protocol
  u.host = b.host
  return { url: u.toString(), rewritten: true }
}

async function main() {
  console.log(`[sitemap-sweep] sitemap: ${SITEMAP_URL}`)
  const published = await fetchSitemapUrls(SITEMAP_URL)
  const pinned = published.map(u => pinToBase(u, BASE))
  const rewritten = pinned.filter(p => p.rewritten).length
  if (rewritten > 0) {
    const example = published.find((_, i) => pinned[i].rewritten)
    console.log(
      `[sitemap-sweep] ${rewritten} of ${published.length} <loc> value(s) name a different origin and were pinned onto ${BASE}`,
    )
    console.log(`[sitemap-sweep]   e.g. ${example}`)
    console.log(`[sitemap-sweep]   -> ${pinToBase(example, BASE).url}`)
  }
  const all = pinned.map(p => p.url)
  const urls = LIMIT > 0 ? all.slice(0, LIMIT) : all
  const partial = urls.length !== all.length
  console.log(`[sitemap-sweep] ${all.length} URL(s) published${partial ? `, sweeping ${urls.length} (PARTIAL)` : ', sweeping every one'}`)
  console.log(`[sitemap-sweep] concurrency ${CONCURRENCY}, redirects NOT followed`)

  const results = new Array(urls.length)
  let next = 0
  let done = 0
  async function worker() {
    for (;;) {
      const i = next++
      if (i >= urls.length) return
      results[i] = await probe(urls[i])
      done++
      if (done % 50 === 0) process.stdout.write(`[sitemap-sweep]   ${done}/${urls.length}\n`)
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, urls.length) }, worker))

  const buckets = { '200': [], redirect: [], '404': [], other: [], error: [] }
  for (const r of results) buckets[r.bucket].push(r)

  console.log('')
  console.log('[sitemap-sweep] OUTCOME COUNTS')
  console.log(`  200        ${String(buckets['200'].length).padStart(5)}`)
  console.log(`  301/308    ${String(buckets.redirect.length).padStart(5)}`)
  console.log(`  404        ${String(buckets['404'].length).padStart(5)}`)
  console.log(`  other      ${String(buckets.other.length).padStart(5)}`)
  console.log(`  error      ${String(buckets.error.length).padStart(5)}`)
  console.log(`  TOTAL      ${String(results.length).padStart(5)}`)

  for (const name of ['redirect', '404', 'other', 'error']) {
    if (!buckets[name].length) continue
    console.log('')
    console.log(`[sitemap-sweep] ${name.toUpperCase()} (${buckets[name].length})`)
    for (const r of buckets[name]) {
      const path = safePath(r.url)
      const extra = r.location ? ` -> ${r.location}` : r.error ? ` (${r.error})` : ''
      console.log(`  ${String(r.status ?? 'ERR').padEnd(4)} ${path}${extra}`)
    }
  }

  if (JSON_OUT && JSON_OUT !== true) {
    const fs = await import('node:fs')
    fs.writeFileSync(JSON_OUT, JSON.stringify({ base: BASE, sitemap: SITEMAP_URL, partial, published: all.length, results }, null, 2))
    console.log(`\n[sitemap-sweep] wrote ${JSON_OUT}`)
  }

  const bad = buckets.redirect.length + buckets['404'].length + buckets.other.length + buckets.error.length
  console.log('')
  if (partial) {
    console.log('[sitemap-sweep] PARTIAL sweep - this is a diagnostic run and is NOT a pass.')
    process.exit(2)
  }
  if (bad === 0) {
    console.log('[sitemap-sweep] PASS - every published URL resolves 200 with no redirect.')
    process.exit(0)
  }
  console.log(`[sitemap-sweep] FAIL - ${bad} of ${results.length} published URL(s) do not resolve 200.`)
  process.exit(1)
}

function safePath(u) {
  try {
    return new URL(u).pathname
  } catch {
    return u
  }
}

main().catch(err => {
  console.error('[sitemap-sweep] fatal:', err?.message ?? err)
  process.exit(2)
})
