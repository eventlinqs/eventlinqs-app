/**
 * THE INDEXING POLICY, DRIVEN (close-out C19.6 and C19.7, 8 September 2026).
 *
 * scripts/guards/indexing-policy.mjs reads the source and fails the build when
 * the tree stops agreeing with src/lib/seo/indexing-policy.ts. It cannot see
 * what a RUNNING page emits, and the defect that started this item was exactly
 * that: every page declared correct-looking metadata, and Next's field-by-field
 * merge published the homepage as the canonical of 57 of them. Only a fetch
 * shows that.
 *
 * So this drives a running server and reads the tags off the response.
 *
 * WHAT IT ASSERTS, per close-out C19.6:
 *
 *   1. An authenticated or transactional route (class never) is NOT indexable
 *      and is NOT in the sitemap.
 *   2. The sitemap contains no noindex URL, and every URL in it answers 200.
 *   3. Every indexable page emits a canonical.
 *   4. Every indexable public page's canonical points at ITSELF. Only an alias
 *      may point somewhere else, and an alias must be noindex.
 *   5. A conditional page and the sitemap agree: the page is in the sitemap
 *      exactly when the page says it is indexable. This is the check that ties
 *      the threshold to the published artefact, and it is why the two read the
 *      same counts from the same rows.
 *
 * WHAT IT CANNOT DRIVE, said rather than implied: a dynamic route with no real
 * value an anonymous visitor could reach (a bearer ticket, a reservation, a
 * one-time token). Those carry their declaration under the static guard, and
 * this script prints how many it skipped and why, so the number is never
 * mistaken for a pass.
 *
 * Run: node scripts/verify/indexing-drive.mjs [baseUrl]
 *      node scripts/verify/indexing-drive.mjs https://www.eventlinqs.com.au
 */
import { spawnSync } from 'node:child_process'
import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const BASE = (process.argv[2] || process.env.INDEXING_BASE || 'http://127.0.0.1:3000').replace(/\/$/, '')
const OUT = process.env.INDEXING_OUT || ''
const TAG = '[indexing-drive]'
const NEWLINES = /\r?\n/
const faults = []
const fail = (m) => {
  faults.push(m)
  console.error(`${TAG} FAIL: ${m}`)
}

/* ------------------------------------------------- the policy, from the source */

const policyScript = [
  "import { INDEXING_POLICY, DISCOVERY_INDEXING_THRESHOLD } from '@/lib/seo/indexing-policy'",
  'console.log(JSON.stringify({ policy: INDEXING_POLICY, threshold: DISCOVERY_INDEXING_THRESHOLD }))',
  '',
].join('\n')
const loaded = spawnSync(
  process.execPath,
  ['--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', '--import', './scripts/lib/src-alias-loader.mjs', '--input-type=module', '-e', policyScript],
  { cwd: ROOT, encoding: 'utf8' },
)
if (loaded.status !== 0) {
  console.error(`${TAG} could not load the indexing policy: ${(loaded.stderr || loaded.stdout).trim().slice(0, 400)}`)
  process.exit(1)
}
const { policy, threshold } = JSON.parse(loaded.stdout.trim().split('\n').find((l) => l.startsWith('{')))

/* --------------------------------------------------- the sitemap, from the host */

const sitemapRes = await fetch(`${BASE}/sitemap.xml`)
if (!sitemapRes.ok) {
  console.error(`${TAG} ${BASE}/sitemap.xml answered ${sitemapRes.status}; nothing can be asserted against it`)
  process.exit(1)
}
const sitemapXml = await sitemapRes.text()
const sitemapPaths = new Set(
  [...sitemapXml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => {
    try {
      return new URL(m[1]).pathname
    } catch {
      return m[1]
    }
  }),
)

/* ------------------------------------------- the targets, enumerated not guessed */

/**
 * A concrete path per route. Static routes are themselves. A dynamic route takes
 * the first path the SITEMAP publishes for its family (the sitemap is built from
 * the platform's own database, so nothing here is typed from memory), and where
 * the sitemap publishes none, the route is skipped and counted.
 */
const FAMILY = {
  '/events/[slug]': (p) => /^\/events\/[^/]+$/.test(p) && !p.startsWith('/events/browse'),
  '/events/browse/[city]': (p) => /^\/events\/browse\/[^/]+$/.test(p),
  '/community/[community]': (p) => /^\/community\/[^/]+$/.test(p),
  '/community/[community]/[city]': (p) => /^\/community\/[^/]+\/[^/]+$/.test(p),
  '/city/[slug]': (p) => /^\/city\/[^/]+$/.test(p),
  '/city/[slug]/[suburb]': (p) => /^\/city\/[^/]+\/[^/]+$/.test(p),
  '/categories/[slug]': (p) => /^\/categories\/[^/]+$/.test(p),
  '/faith/[faith]': (p) => /^\/faith\/[^/]+$/.test(p),
  '/guides/[slug]': (p) => /^\/guides\/[^/]+$/.test(p),
  '/help/[slug]': (p) => /^\/help\/[^/]+$/.test(p),
  '/organisers/[handle]': (p) => /^\/organisers\/[^/]+$/.test(p),
  '/venues/[handle]': (p) => /^\/venues\/[^/]+$/.test(p),
  '/artists/[slug]': (p) => /^\/artists\/[^/]+$/.test(p) && p !== '/artists/claim',
}

const paths = [...sitemapPaths]
const targets = []
const skipped = []
for (const entry of policy) {
  const { route, klass } = entry
  if (!route.includes('[')) {
    targets.push({ route, klass, path: route, from: 'static route' })
    continue
  }
  const match = FAMILY[route]
  if (!match) {
    skipped.push({ route, klass, why: 'no anonymous value exists (bearer token, reservation, one-time code or authenticated id)' })
    continue
  }
  const found = paths.find(match)
  if (!found) {
    skipped.push({ route, klass, why: 'the sitemap publishes none of this family right now, so there is no real value to drive' })
    continue
  }
  targets.push({ route, klass, path: found, from: 'the running sitemap' })
}

/*
 * EVERY CONDITIONAL FAMILY IS ALSO DRIVEN ON A MEMBER THE SITEMAP DOES NOT
 * PUBLISH, so the EMPTY half of the threshold is proven and not only the full
 * half. A check that only ever sees pages above the threshold would pass on a
 * platform where the threshold had stopped working altogether.
 *
 * The members are enumerated from the same source lists the routes' own
 * generateStaticParams read, never typed, and the first one absent from the
 * sitemap is used.
 */
const membersScript = [
  "import { getAllCommunities } from '@/lib/communities/data'",
  "import { getAllCities, getSuburbsForCity } from '@/lib/cities/data'",
  "import { getAllFaiths } from '@/lib/faiths/data'",
  "import { getAllHeroCategories } from '@/lib/hero-categories'",
  'const cities = getAllCities()',
  'console.log(JSON.stringify({',
  "  '/community/[community]': getAllCommunities().map((c) => `/community/${c.slug}`),",
  "  '/community/[community]/[city]': getAllCommunities().flatMap((c) => cities.map((y) => `/community/${c.slug}/${y.slug}`)),",
  "  '/city/[slug]': cities.map((c) => `/city/${c.slug}`),",
  "  '/city/[slug]/[suburb]': cities.flatMap((c) => getSuburbsForCity(c.slug).map((s) => `/city/${c.slug}/${s.slug.startsWith(c.slug + '-') ? s.slug.slice(c.slug.length + 1) : s.slug}`)),",
  "  '/categories/[slug]': getAllHeroCategories().map((c) => `/categories/${c.slug}`),",
  "  '/faith/[faith]': getAllFaiths().map((f) => `/faith/${f.slug}`),",
  '}))',
  '',
].join('\n')
const membersRun = spawnSync(
  process.execPath,
  ['--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', '--import', './scripts/lib/src-alias-loader.mjs', '--input-type=module', '-e', membersScript],
  { cwd: ROOT, encoding: 'utf8' },
)
let members = {}
if (membersRun.status !== 0) {
  fail(`could not enumerate the conditional families from source: ${(membersRun.stderr || membersRun.stdout).trim().slice(0, 300)}`)
} else {
  members = JSON.parse(membersRun.stdout.trim().split(NEWLINES).find((l) => l.startsWith('{')))
}

for (const entry of policy.filter((e) => e.klass === 'conditional')) {
  const list = members[entry.route]
  if (!list) {
    // /events/browse/[city] draws its cities from the database at request time,
    // so there is no static list to read; the sitemap half above still covers it.
    skipped.push({ route: entry.route, klass: entry.klass, why: 'no static member list to draw an absent-from-sitemap example from' })
    continue
  }
  const absent = list.find((path) => !sitemapPaths.has(path))
  if (!absent) continue
  targets.push({ route: entry.route, klass: entry.klass, path: absent, from: 'a family member the sitemap does NOT publish' })
}

/* ------------------------------------------------------------------ the drive */

const pick = (html, re) => {
  const m = html.match(re)
  return m ? m[1] : null
}

async function drive(t) {
  const url = BASE + t.path
  let res
  try {
    res = await fetch(url, { redirect: 'manual', headers: { 'user-agent': 'EventLinqs-indexing-drive' } })
  } catch (error) {
    return { ...t, error: String(error) }
  }
  const redirect = res.status >= 300 && res.status < 400 ? res.headers.get('location') : null
  if (redirect) {
    return { ...t, status: res.status, redirect, robots: null, canonical: null, inSitemap: sitemapPaths.has(t.path) }
  }
  const html = await res.text()
  const canonicalRaw = pick(html, /<link rel="canonical" href="([^"]*)"/)
  let canonical = canonicalRaw
  try {
    canonical = canonicalRaw ? new URL(canonicalRaw, BASE).pathname : null
  } catch {
    /* leave it raw so the failure names what was actually emitted */
  }
  return {
    ...t,
    status: res.status,
    redirect: null,
    xRobotsTag: res.headers.get('x-robots-tag'),
    robots: pick(html, /<meta name="robots" content="([^"]*)"/),
    canonical,
    canonicalRaw,
    inSitemap: sitemapPaths.has(t.path),
  }
}

const results = []
const CONC = 6
for (let i = 0; i < targets.length; i += CONC) {
  results.push(...(await Promise.all(targets.slice(i, i + CONC).map(drive))))
}

/* ----------------------------------------------------------------- the rules */

const isNoindex = (r) => /noindex/i.test(r.robots ?? '')

for (const r of results) {
  const where = `${r.path} (${r.route}, ${r.klass})`
  if (r.error) {
    fail(`${where} could not be fetched: ${r.error}`)
    continue
  }
  if (r.redirect) {
    // A redirect has no document. The only thing to assert is that it is not
    // being advertised in the sitemap, which would publish a redirect to Google
    // against its own guidance for sitemaps.
    if (r.inSitemap) fail(`${where} redirects to ${r.redirect} and is published in the sitemap`)
    continue
  }
  if (r.status >= 500) {
    fail(`${where} answered ${r.status}`)
    continue
  }
  // A 404 carries the not-found document, whose metadata is deliberately its own.
  if (r.status === 404) continue

  if (r.klass === 'never') {
    if (!isNoindex(r)) fail(`RULE 1: ${where} is INDEXABLE. robots=${r.robots ?? 'none'}. A never route must be noindex.`)
    if (r.inSitemap) fail(`RULE 1: ${where} is published in the sitemap. A never route must never be in it.`)
    if (r.canonical) fail(`RULE 1: ${where} emits a canonical (${r.canonical}). A noindex page should not also name one.`)
    continue
  }

  if (r.klass === 'alias') {
    if (!isNoindex(r)) fail(`RULE 4: ${where} is an alias and is INDEXABLE. robots=${r.robots ?? 'none'}`)
    if (r.canonical && r.canonical === r.path) fail(`RULE 4: ${where} is an alias whose canonical points at itself; it must point at the page it aliases`)
    if (r.inSitemap) fail(`RULE 4: ${where} is an alias published in the sitemap`)
    continue
  }

  // always and conditional
  if (!r.canonical) {
    fail(`RULE 3: ${where} emits NO canonical. Every indexable page must name itself.`)
  } else if (r.canonical !== r.path) {
    fail(
      `RULE 4: ${where} emits a canonical pointing somewhere else: ${r.canonicalRaw}.\n` +
        '        This is the defect Search Console reports as "duplicate, Google chose different\n' +
        '        canonical than user". Only an alias may point elsewhere.',
    )
  }

  if (r.klass === 'always' && isNoindex(r)) {
    fail(`${where} is classified always and is NOINDEX. robots=${r.robots}. A public page carrying noindex by accident is a defect too.`)
  }

  if (r.klass === 'conditional') {
    const indexable = !isNoindex(r)
    if (indexable !== r.inSitemap) {
      fail(
        `RULE 5: ${where} says ${indexable ? 'INDEXABLE' : 'noindex'} and the sitemap says ${r.inSitemap ? 'PUBLISHED' : 'absent'}.\n` +
          '        The page and the sitemap read the same counts through\n' +
          '        src/lib/seo/discovery-counts.ts, so a disagreement means one of them stopped.',
      )
    }
  }
}

/* -------------------------- RULE 2: every sitemap URL is 200 and is indexable */

const sitemapSample = [...sitemapPaths]
let sitemapChecked = 0
for (let i = 0; i < sitemapSample.length; i += CONC) {
  const batch = sitemapSample.slice(i, i + CONC)
  await Promise.all(
    batch.map(async (path) => {
      let res
      try {
        res = await fetch(BASE + path, { redirect: 'manual', headers: { 'user-agent': 'EventLinqs-indexing-drive' } })
      } catch (error) {
        fail(`RULE 2: ${path} is in the sitemap and could not be fetched: ${error}`)
        return
      }
      sitemapChecked++
      if (res.status !== 200) {
        fail(`RULE 2: ${path} is in the sitemap and answered ${res.status}${res.status >= 300 && res.status < 400 ? ` -> ${res.headers.get('location')}` : ''}`)
        return
      }
      const html = await res.text()
      const robots = pick(html, /<meta name="robots" content="([^"]*)"/)
      if (/noindex/i.test(robots ?? '')) {
        fail(`RULE 2: ${path} is in the sitemap and is NOINDEX (robots=${robots}). A sitemap of pages we ask not to be indexed is the contradiction Search Console reports.`)
      }
      if (!pick(html, /<link rel="canonical" href="([^"]*)"/)) {
        fail(`RULE 3: ${path} is in the sitemap and emits no canonical`)
      }
    }),
  )
}

/* ------------------------------------------------------------------- report */

console.log(`${TAG} base ${BASE}, threshold ${threshold}`)
console.log(`${TAG} ${targets.length} route(s) driven, ${skipped.length} skipped, ${sitemapPaths.size} sitemap URL(s) of which ${sitemapChecked} answered`)
for (const s of skipped) console.log(`${TAG}   skipped ${s.route} (${s.klass}): ${s.why}`)

if (OUT) {
  mkdirSync(join(OUT, '..'), { recursive: true })
  writeFileSync(OUT, JSON.stringify({ base: BASE, threshold, results, skipped, faults }, null, 1))
  console.log(`${TAG} wrote ${OUT}`)
}

if (faults.length) {
  console.error(`${TAG} ${faults.length} fault(s)`)
  process.exit(1)
}
console.log(`${TAG} PASS`)
