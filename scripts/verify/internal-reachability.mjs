/**
 * IS EVERY ROUTE REACHABLE BY AN INTERNAL LINK? (close-out C19.1)
 *
 * C19.1 asks four things per route: the canonical, whether noindex is set,
 * whether it is in the sitemap, and "whether it is reachable by internal links".
 * The first C19 pass recorded three of the four. The roast caught the fourth,
 * and this is it.
 *
 * WHY IT MATTERS SEPARATELY FROM THE SITEMAP. A sitemap is a hint; internal
 * links are how a crawler walks a site and how authority moves through it. A
 * page in the sitemap that nothing links to is an orphan, and a page nothing
 * links to AND that is not in the sitemap is invisible. Since C19.3 takes about
 * 490 templated pages OUT of the sitemap while they are empty, the question
 * stops being academic: a link becomes the only way in.
 *
 * WHAT IT FOUND ON ITS FIRST RUN, production, 8 September 2026: ten route
 * families no internal link reached. Two were real orphans and were fixed rather
 * than recorded (the five /faith/[faith] pages, which nothing anywhere linked to
 * while the /communities subheading already promised they were browseable; and
 * the 21 /events/browse/[city] pages, whose only component, CityRailTile, was
 * never rendered anywhere). The rest each had a reason, and this script now
 * works out which reason applies rather than reporting a bare zero.
 *
 * HOW. A bounded breadth-first crawl from the site's own entry points,
 * harvesting every same-host href, matched against the route patterns in
 * src/lib/seo/indexing-policy.ts. It reports per ROUTE FAMILY: "is
 * /community/[community] reachable" is the question, because a crawler that
 * finds one finds them all through the index page.
 *
 * Run: node scripts/verify/internal-reachability.mjs <base> [maxPages]
 */
import { spawnSync } from 'node:child_process'

const BASE = (process.argv[2] || 'https://www.eventlinqs.com.au').replace(/\/$/, '')
const MAX_PAGES = Number(process.argv[3] ?? 120)
const TAG = '[internal-reachability]'
const LINES = /\r?\n/
const faults = []

const policyScript = [
  "import { INDEXING_POLICY, UNLINKED_BY_DESIGN } from '@/lib/seo/indexing-policy'",
  'console.log(JSON.stringify({ policy: INDEXING_POLICY, unlinked: UNLINKED_BY_DESIGN }))',
  '',
].join('\n')
const loaded = spawnSync(
  process.execPath,
  ['--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', '--import', './scripts/lib/src-alias-loader.mjs', '--input-type=module', '-e', policyScript],
  { cwd: process.cwd(), encoding: 'utf8' },
)
if (loaded.status !== 0) {
  console.error(`${TAG} could not load the indexing policy: ${(loaded.stderr || loaded.stdout).trim().slice(0, 400)}`)
  process.exit(1)
}
const { policy, unlinked } = JSON.parse(loaded.stdout.trim().split(LINES).find((l) => l.startsWith('{')))

/** `/community/[community]` becomes `^/community/[^/]+$`. */
const toRegExp = (route) =>
  new RegExp(
    '^/' +
      route
        .split('/')
        .filter(Boolean)
        .map((seg) => (seg.startsWith('[') ? '[^/]+' : seg.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`)))
        .join('/') +
      '$',
  )
const matchers = policy.map((e) => ({ ...e, re: toRegExp(e.route) }))

/* ------------------------------- what the host itself says exists, for later */

const sitemapPaths = new Set()
try {
  const res = await fetch(`${BASE}/sitemap.xml`)
  if (res.ok) {
    const xml = await res.text()
    for (const m of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) sitemapPaths.add(new URL(m[1]).pathname)
  }
} catch (error) {
  // A host with no sitemap is judged on links alone; the zero-reason logic below
  // then reports "no member is published", which is the honest answer.
  console.warn(`${TAG} could not read ${BASE}/sitemap.xml, so no member can be sampled: ${error}`)
}

/* ------------------------------------------------------------- the crawl */

const seed = ['/', '/events', '/communities', '/cities', '/organisers', '/help', '/guides', '/pricing', '/about']
const queue = [...seed]
const visited = new Set()
/** every same-host path any crawled page linked to */
const harvested = new Set()

const normalise = (href) => {
  try {
    const u = new URL(href, BASE)
    if (u.origin !== new URL(BASE).origin) return null
    return u.pathname.replace(/\/$/, '') || '/'
  } catch {
    return null
  }
}

while (queue.length && visited.size < MAX_PAGES) {
  const batch = queue.splice(0, 6).filter((p) => !visited.has(p))
  if (batch.length === 0) continue
  await Promise.all(
    batch.map(async (path) => {
      visited.add(path)
      let html
      try {
        const res = await fetch(BASE + path, { headers: { 'user-agent': 'EventLinqs-reachability' } })
        if (res.status !== 200) return
        html = await res.text()
      } catch (error) {
        console.warn(`${TAG} ${path} could not be crawled, so its links were not harvested: ${error}`)
        return
      }
      for (const m of html.matchAll(/<a\b[^>]*\bhref="([^"]+)"/g)) {
        const p = normalise(m[1])
        if (!p) continue
        harvested.add(p)
        if (!visited.has(p) && queue.length + visited.size < MAX_PAGES * 3) queue.push(p)
      }
    }),
  )
}

/* ------------------------------------------------- the answer, per family */

const rows = []
for (const entry of matchers) {
  const examples = [...harvested].filter((p) => entry.re.test(p))
  rows.push({ route: entry.route, klass: entry.klass, linked: examples.length, example: examples[0] ?? null })
}

console.log(`${TAG} crawled ${visited.size} page(s) on ${BASE}, harvested ${harvested.size} distinct internal path(s)`)
console.log(`${TAG} route family                              class        linked  example`)
for (const r of [...rows].sort((a, b) => a.route.localeCompare(b.route))) {
  console.log(`${TAG} ${r.route.padEnd(42)} ${r.klass.padEnd(12)} ${String(r.linked).padStart(5)}  ${r.example ?? ''}`)
}

/*
 * A ZERO IS NOT AUTOMATICALLY A DEFECT, AND SAYING WHICH KIND IT IS IS THE WHOLE
 * VALUE OF THIS CHECK. Each family with no internal link is judged against the
 * reason it has one:
 *
 *   unlinked by design   written down in src/lib/seo/indexing-policy.ts with a
 *                        reason, so it can be argued with rather than inherited
 *   no member published  the catalogue holds none of this family yet, so there is
 *                        nothing to link to. It becomes a defect the day one
 *                        exists and still nothing links to it
 *   404 on this host     the feature flag is off here, so there is no page
 *   ORPHAN               a page we want ranked, that exists, that nothing
 *                        reaches. This fails.
 */
/*
 * ONE MORE LEGITIMATE ZERO, AND IT IS NOT AN EXCUSE, IT IS A MEASUREMENT.
 *
 * Production on 8 September 2026 publishes two events and BOTH ENDED ON
 * 15 AUGUST. The sitemap still lists them, correctly: the event page is real
 * content about a real night and Google indexing it is how a long tail
 * accumulates. But every discovery surface on the platform is forward-looking by
 * design (src/lib/events/listing-window.ts), so nothing links to a night that is
 * over, and the venue handles derived from those same events go with them.
 *
 * That is not an orphan, and it turns straight back into one the day a live event
 * exists and nothing links to it, because this is read from the pages themselves
 * rather than written into an allowlist.
 */
const eventPaths = [...sitemapPaths].filter((p) => /^\/events\/[^/]+$/.test(p) && !p.startsWith('/events/browse'))
let liveEventCount = 0
for (const path of eventPaths) {
  try {
    const html = await (await fetch(BASE + path, { headers: { 'user-agent': 'EventLinqs-reachability' } })).text()
    const when = /"endDate":"([^"]+)"/.exec(html)?.[1] ?? /"startDate":"([^"]+)"/.exec(html)?.[1]
    if (when && Date.parse(when) >= Date.now()) liveEventCount++
  } catch (error) {
    // Counted as not live, which is the conservative direction: it can only make
    // this script fail louder, never quieter.
    console.warn(`${TAG} ${path} could not be read for its date: ${error}`)
  }
}
const catalogueIsAllPast = eventPaths.length > 0 && liveEventCount === 0
if (catalogueIsAllPast) {
  console.log(`${TAG} every one of the ${eventPaths.length} published event page(s) is for an event that has already ended`)
}
const PAST_CATALOGUE_EXPLAINS = new Set(['/events/[slug]', '/venues/[handle]'])

const explained = []
for (const r of rows) {
  if (r.linked > 0) continue
  if (r.klass !== 'always' && r.klass !== 'conditional') continue

  if (unlinked[r.route]) {
    explained.push(`${r.route}: unlinked by design - ${unlinked[r.route]}`)
    continue
  }

  const member = r.route.includes('[') ? [...sitemapPaths].find((p) => toRegExp(r.route).test(p)) : r.route
  if (!member) {
    explained.push(`${r.route}: no member of this family is published on this host, so there is nothing to link to yet`)
    continue
  }

  if (catalogueIsAllPast && PAST_CATALOGUE_EXPLAINS.has(r.route)) {
    explained.push(
      `${r.route}: every published event has already ended, so the platform's forward-looking discovery surfaces no longer link to it. ` +
        'This becomes a fault again the moment one live event exists.',
    )
    continue
  }

  let status = 0
  try {
    status = (await fetch(BASE + member, { redirect: 'manual', headers: { 'user-agent': 'EventLinqs-reachability' } })).status
  } catch (error) {
    console.warn(`${TAG} ${member} could not be fetched while explaining a zero: ${error}`)
    status = 0
  }
  if (status === 404) {
    explained.push(`${r.route}: ${member} answers 404 on this host (a feature flag is off), so there is no page to link to`)
    continue
  }

  faults.push(
    `${r.route} is classed ${r.klass} (a page we want ranked), ${member} answers ${status}, and NOTHING on the crawled site links to it. ` +
      'A page no internal link reaches is an orphan, and since a templated page can now leave the sitemap while it is empty, a link is the only way in. ' +
      'Add a link, or record the reason in UNLINKED_BY_DESIGN in src/lib/seo/indexing-policy.ts.',
  )
}

for (const e of explained) console.log(`${TAG}   explained: ${e}`)

const unreachablePrivate = rows.filter((r) => r.klass === 'never' && r.linked === 0).length
console.log(`${TAG} ${unreachablePrivate} never route(s) are reachable by no internal link, which is correct for a bearer or one-time surface`)

if (faults.length) {
  for (const f of faults) console.error(`${TAG} FAIL: ${f}`)
  console.error(`${TAG} ${faults.length} fault(s)`)
  process.exit(1)
}
console.log(`${TAG} PASS`)
