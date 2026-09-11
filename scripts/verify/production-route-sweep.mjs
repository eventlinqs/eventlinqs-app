/**
 * EVERY ROUTE THIS APPLICATION DECLARES, DRIVEN, WITH ITS STATUS RECORDED.
 *
 * Close-out C7 ("build the route list from src/app on disk ... drive it ...
 * report every 404 and every 500"), L1 item 14 ("every route enumerated from
 * src/app returns its expected status on production") and C15.3 ("re-drive every
 * route enumerated from src/app on production").
 *
 * WHY THIS IS A SCRIPT IN THE REPOSITORY AND NOT A SESSION'S SHELL HISTORY.
 * C7 was driven on 6 September 2026 and passed, and what survived was the OUTPUT
 * (C:\dev\EVIDENCE\C7\sweep-production.json) and the enumerator, but not the
 * thing that did the driving. C15 has to re-drive the same set, and a check that
 * has to be rebuilt from a report before it can be re-run is a check that will
 * be rebuilt slightly differently. So it lives here.
 *
 * READ ONLY, AND IT REFUSES TO BE ANYTHING ELSE. Every request is a GET (a HEAD
 * would be answered differently by Next.js and would not exercise the render).
 * Nothing is posted, nothing signs in, no account is created. Driving production
 * this way writes nothing, which is what makes it safe to point at the live site
 * without the owner's approval, and that boundary is stated here so nobody
 * extends this file across it.
 *
 * HOW A DYNAMIC ROUTE GETS A REAL VALUE, never a guessed one:
 *   1. THE SITEMAP FIRST. The platform builds sitemap.xml from its own database,
 *      so every url in it is a real row. Each url is matched back to the route
 *      pattern whose segment shape it fits.
 *   2. ANCHORS SECOND, harvested from the STATIC PAGES THIS SWEEP ALREADY
 *      DRIVES, never from a hub url typed here. That matters on this platform
 *      right now: C19 gates the templated families out of the sitemap until each
 *      has enough events, so with two events live the sitemap publishes 38 urls
 *      where it once published 550, and a sweep that trusted it alone would
 *      drive almost no real community, city or category page.
 *   3. A WELL-FORMED UNKNOWN ID LAST, and only for a route whose id is private
 *      to a signed-in person. What is recorded then is the ANONYMOUS answer
 *      (a redirect to login, a designed "this link has expired", a 404 for an
 *      unknown code), which is a real and checkable answer. It is never counted
 *      as having driven the signed-in surface, and the report says so by name.
 *
 * WHAT COUNTS AS A DEFECT: any 5xx, an error boundary inside a 200, a soft 404
 * (a 200 whose body says the page does not exist), a 404 on a REAL value, and a
 * 404 on a static route that IS deployed.
 *
 * WHAT DOES NOT, and both of these were reported as defects by the first version
 * of this file until they were driven:
 *
 *   A 404 FOR A WELL-FORMED UNKNOWN ID IS THE CORRECT ANSWER. /t/zzzzzzzzzzzz
 *   SHOULD be 404. Twenty-six of the first run's twenty-seven "defects" were
 *   that. A 404 on a value the SITEMAP published is the opposite: the platform
 *   said the page exists, so that one is a dead link and is reported.
 *
 *   A ROUTE THIS TREE HAS AND THE DEPLOYED COMMIT DOES NOT cannot answer 200,
 *   and calling that a production defect blames the live site for work that has
 *   not merged. Decided from git, never from the response: a route whose file
 *   is in no commit reachable from origin/main is NOT DEPLOYED and is listed as
 *   such. The first run flagged /admin/requests, which this session had written
 *   twenty minutes earlier.
 *
 * The reviewed list of correct 404s is PRINTED on every run, and an entry that no
 * longer matches anything is reported, so it cannot rot into an unexamined
 * allowlist.
 *
 * Usage:
 *   node scripts/verify/production-route-sweep.mjs --base https://www.eventlinqs.com.au --out <dir> [--all-routes]
 */
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { execFileSync } from 'node:child_process'
import { gitEnv } from '../lib/git-env.mjs'

const args = process.argv.slice(2)
const argOf = name => (args.includes(name) ? args[args.indexOf(name) + 1] : null)
const BASE = (argOf('--base') ?? 'https://www.eventlinqs.com.au').replace(/\/$/, '')
const OUT = argOf('--out')
/*
 * --all-routes: drive every route in THIS tree, whether or not origin/main has
 * seen it. The default filter exists for PRODUCTION, where a route main never
 * merged cannot answer and must not be counted against the live site. Run
 * against a local build of this tree, that filter is exactly wrong: it skips the
 * newest routes, which are the ones no sweep has ever driven. On 12 September
 * 2026 the recovery engine's unsubscribe route reached production unswept and
 * answered 500 on its first malformed token. The pre-push gate passes this
 * flag; the production smoke does not.
 */
const ALL_ROUTES = args.includes('--all-routes')
if (!OUT) {
  console.error('FAIL: --out <directory> is required')
  process.exit(1)
}
mkdirSync(OUT, { recursive: true })

/* ------------------------------------------- 1. the routes, from src/app */

const APP = join(process.cwd(), 'src', 'app')

/**
 * A route is a directory holding page.tsx (a page) or route.ts (a handler).
 * Route groups in parentheses are stripped, parallel slots are skipped, and a
 * dynamic segment is kept exactly as written so the report can show which ones
 * needed a real value.
 */
/**
 * Is this route's own file in a commit reachable from origin/main?
 *
 * `git log origin/main -- <path>` is empty for a file that exists only on this
 * branch, which is the whole question: the deployed site is built from main, so
 * a route main has never seen CANNOT answer 200 and must not be counted against
 * production. Decided from git rather than from the response, because "it 404s"
 * is equally true of a route that is broken.
 */
function deployedOnMain(filePath) {
  try {
    const out = execFileSync('git', ['log', '--oneline', '-1', 'origin/main', '--', relative(process.cwd(), filePath)], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      // gitEnv() clears the GIT_DIR family a hook would inherit. Without it this
      // would run against whichever repository the hook is acting on rather than
      // this one, which is how core.bare=true reached the shared config once.
      env: gitEnv(),
    })
    return out.trim().length > 0
  } catch (error) {
    // No git, no origin/main, or a detached checkout. Treated as DEPLOYED so the
    // sweep stays STRICT: an unknown must never become a free pass for a 404.
    // Said out loud, because silently choosing the strict branch still means the
    // "not deployed yet" list is empty for a reason nobody can see.
    console.warn(
      `[sweep] could not ask git whether ${relative(process.cwd(), filePath)} is on origin/main ` +
        `(${error instanceof Error ? error.message.split(String.fromCharCode(10))[0] : String(error)}); ` +
        'treating it as DEPLOYED, so a 404 there will still be reported',
    )
    return true
  }
}

function enumerateRoutes() {
  const pages = []
  const handlers = []
  const notDeployed = new Set()
  const walk = (dir, segs) => {
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch (error) {
      // A directory that cannot be read is a set of routes this sweep will
      // never drive, and a walker that swallows that reports a clean run over a
      // smaller application than the one that exists. Said out loud, which is
      // the direction that matters in a SCANNER.
      console.warn(`[sweep] could not read ${dir}, so any route under it is NOT driven: ${error instanceof Error ? error.message : String(error)}`)
      return
    }
    for (const e of entries) {
      if (e.isDirectory()) {
        if (e.name.startsWith('_') || e.name.startsWith('.') || e.name.startsWith('@')) continue
        const isGroup = e.name.startsWith('(') && e.name.endsWith(')')
        walk(join(dir, e.name), isGroup ? segs : [...segs, e.name])
      } else {
        const route = segs.length === 0 ? '/' : `/${segs.join('/')}`
        const isRoute =
          e.name === 'page.tsx' || e.name === 'page.ts' || e.name === 'route.ts' || e.name === 'route.tsx'
        if (isRoute && !ALL_ROUTES && !deployedOnMain(join(dir, e.name))) notDeployed.add(route)
        if (e.name === 'page.tsx' || e.name === 'page.ts') pages.push(route)
        if (e.name === 'route.ts' || e.name === 'route.tsx') handlers.push(route)
      }
    }
  }
  walk(APP, [])
  const dynamic = r => r.includes('[')
  return {
    staticPages: [...new Set(pages.filter(r => !dynamic(r)))].sort(),
    dynamicPages: [...new Set(pages.filter(dynamic))].sort(),
    staticHandlers: [...new Set(handlers.filter(r => !dynamic(r)))].sort(),
    dynamicHandlers: [...new Set(handlers.filter(dynamic))].sort(),
    notDeployed: [...notDeployed].sort(),
  }
}

/* ------------------------------------ 2. the reviewed non-200 expectations */

/**
 * A 404 or a refusal that is CORRECT, each with the reason and the source that
 * causes it. Reviewed, printed on every run, and reported when an entry stops
 * matching anything, because an allowlist nobody re-reads is a list of defects
 * with a note attached.
 *
 * Every entry was read off the source named beside it, never inferred from the
 * response.
 */
const DELIBERATE = [
  { route: '/artists', why: 'the artist_showcase flag is off on production', source: 'src/lib/flags.ts' },
  { route: '/artist/dashboard', why: 'the broadcast_artists flag is off on production', source: 'src/lib/flags/broadcast.ts' },
  { route: '/gigs', why: 'the gig_board flag is off on production', source: 'src/lib/flags.ts' },
  { route: '/design/cards', why: 'a preview route, gated off production', source: 'src/lib/dev/preview-route.ts' },
  { route: '/dev/logo-preview', why: 'a preview route, gated off production', source: 'src/lib/dev/preview-route.ts' },
  { route: '/dev/shell-preview', why: 'a preview route, gated off production', source: 'src/lib/dev/preview-route.ts' },
  { route: '/dev/connect-onboarding-preview', why: 'a preview route, gated off production', source: 'src/lib/dev/preview-route.ts' },
]
const deliberateFor = route => DELIBERATE.find(d => d.route === route) ?? null
const deliberateHit = new Set()

/** A route whose id belongs to a signed-in person: an anonymous drive is the answer. */
const PRIVATE_PREFIXES = ['/dashboard', '/admin', '/account', '/checkout', '/orders', '/scan', '/api']

/**
 * WHY A PUBLIC DYNAMIC PATTERN HAS NO REAL VALUE TO DRIVE ANONYMOUSLY.
 *
 * Reviewed, and printed beside the pattern, because the first run of this sweep
 * produced a bare list of eighteen and the next person to read it would have had
 * to re-derive every line. Three of them are the same finding restated: the
 * anonymous internet cannot mint a bearer token, so those surfaces are driven by
 * the buyer journey (L1 items 9 to 12), not by a crawler.
 *
 * A pattern that is NOT in this map and still has no value is left unexplained on
 * purpose: an unexplained gap should read as a gap.
 */
const NO_ANONYMOUS_VALUE = {
  '/t/[code]': 'a ticket bearer code, minted by a purchase. Driven by the buyer journey',
  '/t/[code]/watch': 'the same bearer code, for a streamed event',
  '/e/[code]': 'a short link minted when an organiser shares',
  '/join/[code]': 'a squad invite code, minted by a buyer',
  '/squad/[token]': 'a squad token, minted by a buyer',
  '/squad/[token]/pay/[member_id]': 'the same squad token plus a member id',
  '/queue/[slug]': 'a waiting-room slug, live only while a queue is on',
  '/unsubscribe/[token]': 'an unsubscribe token, minted per recipient per send',
  '/unsubscribe/digest/[token]': 'the same, for the digest',
  '/waitlist/unsubscribe/[token]': 'the same, for a waitlist',
  '/unsubscribe/recovery/[token]':
    'the same, for the recovery engine (close-out D2). A malformed one answered 500 on production on 12 September 2026 and is now not found',
  '/launch/k/[code]': 'a Launch Kit code, minted when an organiser publishes',
  '/launch/with/[code]': 'the same Launch Kit code',
  '/events/[slug]/holder': 'the holder view of an event, reached with a bearer ticket',
  '/artists/[slug]': 'the artist_showcase flag is off on production, so no artist page is linked',
  '/artists/claim/[token]': 'a claim token, and the same flag',
  '/events/[slug]/with/[artist]': 'the broadcast_artists flag is off on production',
  '/gigs/[id]': 'the gig_board flag is off on production',
  '/categories/[slug]': [
    'seven slugs exist (src/lib/hero-categories.ts) and NOTHING on the platform links to any of them:',
    'the homepage tiles go to /events?category=<slug> instead. Driven by hand on 8 September 2026,',
    'enumerated from that file: six 308 to /community/* and /faith/christian by the C18 decision',
    '(src/lib/seo/permanent-redirects.ts) and /categories/networking answers 200 with real content.',
    'Correct, and recorded here so it is not re-investigated as a dead route.',
  ].join(' '),
}

/* ------------------------------------------------------- 3. driving them */

const results = []
const defects = []

/** How a concrete value was obtained. REAL means the platform itself produced it. */
const REAL = 'real'

/** Internal paths harvested off the pages this sweep drives, filled as it goes. */
const harvested = new Set()
const notDeployed = new Set()

function harvestLinks(html) {
  for (const m of html.matchAll(/href="(\/[^"#?]*)/g)) {
    const path = m[1].replace(/\/$/, '')
    if (path.length > 1) harvested.add(path)
  }
}

async function drive(url, { pattern, how }) {
  const started = Date.now()
  let res
  let body = ''
  try {
    res = await fetch(url, { redirect: 'manual', headers: { 'user-agent': 'EventLinqs route sweep (read only)' } })
  } catch (error) {
    const row = { url, pattern, how, status: 0, error: error instanceof Error ? error.message : String(error) }
    results.push(row)
    defects.push(`${url}: the request failed outright (${row.error})`)
    return row
  }
  const location = res.headers.get('location')
  let finalStatus = res.status
  let finalUrl = url
  if (res.status >= 300 && res.status < 400 && location) {
    const target = new URL(location, url).toString()
    try {
      const followed = await fetch(target, { headers: { 'user-agent': 'EventLinqs route sweep (read only)' } })
      finalStatus = followed.status
      finalUrl = target
      body = await followed.text()
    } catch (error) {
      // The redirect target could not be fetched at all. finalStatus 0 is picked
      // up as a defect below; the reason is printed here so the report is not a
      // bare zero.
      console.warn(`[sweep] ${url} redirected to ${target} which could not be fetched: ${error instanceof Error ? error.message : String(error)}`)
      finalStatus = 0
    }
  } else {
    body = await res.text()
  }

  if (finalStatus === 200 && body) harvestLinks(body)

  const row = {
    url,
    pattern,
    how,
    status: res.status,
    redirectedTo: location ?? null,
    finalStatus,
    finalUrl,
    ms: Date.now() - started,
  }

  /*
   * THREE DEFECT SHAPES, and the second and third are the ones a status code
   * alone will not show you.
   */
  if (res.status >= 500 || finalStatus >= 500) {
    defects.push(`${url}: server error ${res.status}${finalStatus !== res.status ? ` then ${finalStatus}` : ''}`)
    row.defect = 'server error'
  } else if (finalStatus === 200 && /We hit a snag loading this page|SOMETHING WENT WRONG/i.test(body)) {
    defects.push(`${url}: 200 with the error boundary rendered inside it`)
    row.defect = 'error boundary inside a 200'
  } else if (finalStatus === 200 && /this page could not be found|404 - not found/i.test(body)) {
    defects.push(`${url}: 200 whose body says the page does not exist (a soft 404)`)
    row.defect = 'soft 404'
  } else if (res.status === 404) {
    const known = deliberateFor(pattern) ?? deliberateFor(new URL(url).pathname)
    if (known) {
      deliberateHit.add(known.route)
      row.deliberate = known.why
    } else if (notDeployed.has(pattern)) {
      // This tree has the route and main has never seen it. Not production's fault.
      row.deliberate = 'the route is in this tree and not in origin/main, so the deployed site cannot serve it'
    } else if (how === REAL) {
      // The platform published this url. A 404 here is a dead link (Law 5).
      defects.push(`${url}: 404 on a value the platform itself published (pattern ${pattern})`)
      row.defect = '404 on a real value'
    } else {
      // A well-formed UNKNOWN id SHOULD 404. That is the product answering
      // correctly, and counting it as a defect is what the first run did.
      row.deliberate = 'a well-formed unknown value, for which 404 is the correct answer'
    }
  }
  results.push(row)
  return row
}

/* ------------------------------- 4. real values for the dynamic patterns */

/** Every url the platform publishes about itself, which it builds from its own database. */
async function sitemapUrls() {
  const seen = new Set()
  const queue = [`${BASE}/sitemap.xml`]
  const urls = []
  while (queue.length > 0 && urls.length < 4000) {
    const next = queue.shift()
    if (seen.has(next)) continue
    seen.add(next)
    let xml
    try {
      xml = await (await fetch(next)).text()
    } catch (error) {
      // A sitemap that cannot be read means the dynamic patterns lose their best
      // source of real values, which would quietly turn this sweep into an
      // unknown-id sweep. Said out loud rather than skipped in silence.
      console.warn(`[sweep] ${next} could not be read: ${error instanceof Error ? error.message : String(error)}`)
      continue
    }
    const isIndex = /<sitemapindex/i.test(xml)
    for (const m of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) {
      if (isIndex) queue.push(m[1].trim())
      else urls.push(m[1].trim())
    }
  }
  return urls
}

/** Does this concrete path fit this route pattern, segment for segment? */
function fits(pathname, pattern) {
  const p = pathname.split('/').filter(Boolean)
  const t = pattern.split('/').filter(Boolean)
  if (t.some(s => s.startsWith('[...'))) {
    const fixed = t.filter(s => !s.startsWith('[...'))
    return p.length >= fixed.length
  }
  if (p.length !== t.length) return false
  return t.every((seg, i) => (seg.startsWith('[') ? true : seg === p[i]))
}

const UNKNOWN = {
  uuid: '00000000-0000-4000-8000-000000000000',
  code: 'zzzzzzzzzzzz',
}

/** A concrete url for a pattern whose id is private, using a well-formed unknown value. */
function unknownFor(pattern) {
  return (
    BASE +
    pattern
      .replace(/\[\.\.\.[^\]]+\]/g, UNKNOWN.code)
      .replace(/\[([^\]]+)\]/g, (_, name) => (/id$/i.test(name) ? UNKNOWN.uuid : UNKNOWN.code))
  )
}

const isPrivate = route => PRIVATE_PREFIXES.some(p => route === p || route.startsWith(`${p}/`))

/* --------------------------------------------------------------- 5. run */

const routes = enumerateRoutes()
for (const r of routes.notDeployed) notDeployed.add(r)
console.log(
  `[sweep] ${routes.staticPages.length} static pages, ${routes.dynamicPages.length} dynamic pages, ` +
    `${routes.staticHandlers.length} static handlers, ${routes.dynamicHandlers.length} dynamic handlers`,
)
console.log(`[sweep] base ${BASE}, read only, GET only, nothing is written`)
if (routes.notDeployed.length > 0) {
  console.log(
    `[sweep] ${routes.notDeployed.length} route(s) exist in THIS TREE and in no commit reachable from origin/main, ` +
      'so the deployed site cannot serve them and a 404 there is not a production defect:',
  )
  for (const r of routes.notDeployed) console.log(`         ${r}`)
}

console.log('\n[sweep] static pages')
for (const route of routes.staticPages) {
  const row = await drive(`${BASE}${route}`, { pattern: route, how: REAL })
  console.log(`  ${String(row.status).padEnd(4)} ${row.finalStatus !== row.status ? `-> ${row.finalStatus} ` : ''}${route}`)
}

console.log('\n[sweep] static route handlers')
for (const route of routes.staticHandlers) {
  const row = await drive(`${BASE}${route}`, { pattern: route, how: REAL })
  console.log(`  ${String(row.status).padEnd(4)} ${route}`)
}

const published = await sitemapUrls()
console.log(`\n[sweep] the sitemap publishes ${published.length} urls, all built by the platform from its own data`)

const PER_PATTERN = 3

/**
 * Concrete urls for one pattern, from the sitemap first and then from the
 * anchors harvested off every page already driven. Both sources are the
 * PLATFORM'S OWN output, so nothing here is a slug somebody typed.
 */
function realValuesFor(pattern) {
  const fromSitemap = published
    .filter(u => {
      try {
        return fits(new URL(u).pathname, pattern)
      } catch {
        return false
      }
    })
    // The sitemap publishes absolute urls on the canonical host. Driven against
    // a local build (--all-routes, the pre-push gate) those urls would send the
    // sweep to production, where the local build's rows do not exist: on
    // 12 September 2026 twelve TEST rows came back 404 from the live site and
    // were reported as dead links. Every value is rebased onto the base under
    // test; on production that is a no-op.
    .map(u => `${BASE}${new URL(u).pathname}`)
  const fromAnchors = [...harvested].filter(p => fits(p, pattern)).map(p => `${BASE}${p}`)
  return [...new Set([...fromSitemap, ...fromAnchors])].slice(0, PER_PATTERN)
}

console.log('\n[sweep] dynamic pages')
const unresolved = []
for (const pattern of routes.dynamicPages) {
  const real = realValuesFor(pattern)

  if (real.length > 0) {
    for (const url of real) {
      const row = await drive(url, { pattern, how: REAL })
      console.log(`  ${String(row.status).padEnd(4)} ${new URL(url).pathname}   [${pattern}]`)
    }
    continue
  }

  if (isPrivate(pattern)) {
    const row = await drive(unknownFor(pattern), { pattern, how: 'a well-formed UNKNOWN id: the anonymous answer only' })
    console.log(
      `  ${String(row.status).padEnd(4)} ${row.finalStatus !== row.status ? `-> ${row.finalStatus} ` : ''}${pattern}   [private id, anonymous answer]`,
    )
    continue
  }

  unresolved.push(pattern)
  const row = await drive(unknownFor(pattern), { pattern, how: 'no real value found: a well-formed UNKNOWN value' })
  console.log(`  ${String(row.status).padEnd(4)} ${pattern}   [no real value in the sitemap]`)
}

console.log('\n[sweep] dynamic route handlers')
for (const pattern of routes.dynamicHandlers) {
  const real = realValuesFor(pattern).slice(0, 1)
  const url = real[0] ?? unknownFor(pattern)
  const row = await drive(url, { pattern, how: real[0] ? REAL : 'a well-formed UNKNOWN value' })
  console.log(`  ${String(row.status).padEnd(4)} ${pattern}`)
}

/* ------------------------------------------------------------ 6. report */

console.log('\n[sweep] the reviewed list of correct non-200 answers, printed so it cannot rot unread')
for (const d of DELIBERATE) {
  const matched = deliberateHit.has(d.route)
  console.log(`  ${matched ? 'matched  ' : 'UNMATCHED'} ${d.route.padEnd(34)} ${d.why} (${d.source})`)
  if (!matched) {
    const sentence = `the reviewed entry ${d.route} matched nothing this run: either the route answers 200 now and the entry is stale, or the route is gone`
    // The entries name PRODUCTION flag states. A local build under --all-routes
    // may have the flag on, so there it is a note; against the live site it is
    // the stale allowlist the list exists to catch.
    if (ALL_ROUTES) console.log(`[sweep] note (local build, flags differ): ${sentence}`)
    else defects.push(sentence)
  }
}

const byStatus = results.reduce((acc, r) => {
  const key = r.finalStatus === r.status ? String(r.status) : `${r.status} -> ${r.finalStatus}`
  acc[key] = (acc[key] ?? 0) + 1
  return acc
}, {})

writeFileSync(
  join(OUT, 'route-sweep.json'),
  JSON.stringify({ base: BASE, driven: new Date().toISOString(), routes, byStatus, unresolved, results, defects }, null, 2),
)

console.log('\n[sweep] status summary')
for (const [status, count] of Object.entries(byStatus).sort()) console.log(`  ${String(count).padStart(4)}  ${status}`)
console.log(`\n[sweep] ${results.length} request(s) driven against ${BASE}`)
if (unresolved.length > 0) {
  console.log(`[sweep] ${unresolved.length} PUBLIC dynamic pattern(s) had no real value to drive anonymously:`)
  for (const p of unresolved) {
    const why = NO_ANONYMOUS_VALUE[p]
    console.log(`         ${p}`)
    console.log(`             ${why ?? 'UNEXPLAINED. Work out why, then record it in NO_ANONYMOUS_VALUE in this file.'}`)
  }
  const unexplained = unresolved.filter(p => !NO_ANONYMOUS_VALUE[p])
  if (unexplained.length > 0) {
    console.log(`[sweep] ${unexplained.length} of them are UNEXPLAINED and are a real coverage gap, not a note.`)
    // A gap nobody has explained is a defect, not a printed line: the recovery
    // route sat in this list on 12 September 2026 while answering 500.
    for (const p of unexplained) {
      defects.push(`${p}: a public dynamic pattern with no real value to drive and no note in NO_ANONYMOUS_VALUE (a coverage gap)`)
    }
  }
}
for (const p of Object.keys(NO_ANONYMOUS_VALUE)) {
  if (!unresolved.includes(p)) {
    console.log(`[sweep] the note for ${p} matched nothing this run: it has a real value now, so delete the note.`)
  }
}

if (defects.length > 0) {
  console.error(`\n[sweep] ${defects.length} DEFECT(S):`)
  for (const d of defects) console.error(`  ${d}`)
  process.exit(1)
}
console.log('\n[sweep] PASS - no server error, no error boundary inside a 200, no soft 404, no undeliberate 404.')
