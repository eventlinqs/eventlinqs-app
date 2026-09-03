/**
 * WHAT GOOGLE IS ACTUALLY OFFERED.
 *
 * Two questions, answered against a running deployment rather than from the
 * source, because only the deployment can tell you a status code:
 *
 *   1. Does every URL in the sitemap resolve? A sitemap is a promise to a
 *      crawler; a dead entry in it is the platform offering a page it does not
 *      have.
 *   2. Does every dead URL a crawler might try return a real 404, and is it
 *      marked noindex?
 *
 * WHY BOTH, and why the second is not just the first inverted. On 29 August the
 * founder submitted the sitemap to Google, having been told by me that not-found
 * pages returned HTTP 200. That was WRONG and this script exists so nobody has
 * to take my word for it again. Every public dead URL returns 404. The 200s I
 * had seen were signed-in DASHBOARD routes for resources the viewer does not
 * own, which no crawler reaches.
 *
 * THE SOFT 404 THAT IS NOT A BUG. Those dashboard routes return 200 because
 * next/og... because notFound() fires after the response has begun streaming,
 * and Next cannot change a status once headers are sent. It is documented
 * behaviour, and Next injects <meta name="robots" content="noindex"> precisely
 * so a soft 404 stays out of search:
 *
 *   node_modules/next/dist/docs/01-app/02-guides/streaming.md, "Status codes":
 *   "When a <Suspense> fallback renders or a component suspends, the server must
 *    commit to 200 OK in order to start sending the HTML stream. If a notFound()
 *    fires mid-stream, Next.js cannot go back and change the status to 404.
 *    Instead, it injects <meta name="robots" content="noindex">."
 *
 * To get a real 404 there, the check has to run BEFORE the stream, in proxy.
 * That means moving a tenancy check into routing middleware, which is a security
 * boundary and not a change to make casually. It is logged as a decision.
 *
 * Usage: node scripts/verify/not-found-status.mjs [baseUrl]
 */

const BASE = (process.argv[2] || process.env.BASE || 'http://localhost:3311').replace(/\/$/, '')

/** Dead URLs a crawler could plausibly try. Each MUST answer 404. */
const MUST_404 = [
  '/events/this-event-does-not-exist',
  '/city/not-a-city',
  '/city/sydney/not-a-suburb',
  '/community/not-a-community',
  '/organisers/no-such-organiser',
  '/categories/not-a-category',
  '/nonsense-page-that-never-existed',
]

let failures = 0

console.log(`[not-found-status] ${BASE}`)
console.log('')
console.log('1. THE SITEMAP: every URL it promises')

let sitemapCount = 0
let sitemapDead = []
try {
  const xml = await (await fetch(`${BASE}/sitemap.xml`)).text()
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1])
  sitemapCount = locs.length
  const paths = locs
    .map(u => {
      try {
        const parsed = new URL(u)
        return parsed.pathname + parsed.search
      } catch {
        return null
      }
    })
    .filter(Boolean)

  let i = 0
  const worker = async () => {
    while (i < paths.length) {
      const path = paths[i++]
      try {
        const r = await fetch(BASE + path, { redirect: 'manual' })
        if (r.status !== 200) sitemapDead.push(`${r.status} ${path}`)
      } catch (e) {
        sitemapDead.push(`ERR ${path} ${String(e.message).slice(0, 40)}`)
      }
    }
  }
  await Promise.all(Array.from({ length: 8 }, worker))
} catch (e) {
  console.log(`   COULD NOT READ THE SITEMAP: ${String(e.message).slice(0, 80)}`)
  failures++
}

console.log(`   urls promised : ${sitemapCount}`)
console.log(`   not answering 200: ${sitemapDead.length}`)
for (const d of sitemapDead.slice(0, 20)) console.log(`      ${d}`)
if (sitemapCount === 0) {
  console.log('   FAILED: a sitemap with no URLs. Zero is a failure, never a pass.')
  failures++
}
if (sitemapDead.length) failures++

console.log('')
console.log('2. DEAD URLS: a real 404, and marked noindex')
for (const path of MUST_404) {
  let status = 0
  let noindex = false
  try {
    const r = await fetch(BASE + path, { redirect: 'manual' })
    status = r.status
    const html = await r.text()
    noindex = /<meta[^>]+name="robots"[^>]+noindex/i.test(html)
  } catch (e) {
    console.log(`   ERR  ${path}  ${String(e.message).slice(0, 50)}`)
    failures++
    continue
  }
  const ok = status === 404
  if (!ok) failures++
  console.log(`   ${ok ? 'ok  ' : 'FAIL'} HTTP ${status}${noindex ? ' noindex' : ' NO NOINDEX'}  ${path}`)
}

console.log('')
if (failures) {
  console.log(`[not-found-status] FAILED with ${failures} problem(s).`)
  console.log('  A dead URL answering 200 is the platform offering a crawler a page it does not have.')
  process.exit(1)
}
console.log('[not-found-status] PASS. The sitemap resolves and dead URLs answer 404.')
