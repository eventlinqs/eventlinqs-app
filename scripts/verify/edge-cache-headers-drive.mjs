/**
 * A PUBLICLY CACHED ROUTE RENDERS NOBODY'S NAME, ASKED OF A REAL SERVER AND A
 * REAL SIGNED-IN BROWSER AT 390, 768 AND 1440.
 *
 * ============================================================================
 * WHAT THIS PROVES THAT THE GUARD AND THE TESTS CANNOT
 * ============================================================================
 *
 * `scripts/guards/edge-cache-is-viewer-independent.mjs` reads source text: it
 * proves the rule carries the exclusion and the page passes `staticSafe`. It
 * cannot prove Next actually withholds the header for a request carrying the
 * marker, and it cannot prove the page renders differently for a real session.
 * `tests/unit/security/edge-cache-viewer-independence.test.ts` holds the same
 * shapes in the suite. Neither has a server or a session.
 *
 * So this asks the only two sources that can settle it: the served production
 * build, and a browser holding a real Supabase session.
 *
 * ============================================================================
 * THE ANTI-VACUITY RULE, WHICH IS THE WHOLE DESIGN
 * ============================================================================
 *
 * The assertion that matters is an ABSENCE: signed in, /events must carry no
 * trace of who you are. An absence proves nothing on its own, because a drive
 * that failed to sign in, or that looked for a string the page never contains,
 * reports the same clean absence as a fixed product.
 *
 * So every absence here is earned by first turning it into a PRESENCE:
 *
 *   1. the same session, on /account, MUST show the visitor's display name.
 *      If it does not, the session is not real and nothing below is asserted.
 *   2. only then is that exact same string required to be ABSENT from /events.
 *
 * The string is not invented either: it is what `deriveAccountUser` produces for
 * this account (the local part of the email, because the account deliberately
 * carries no full name), which is precisely the value that was cacheable.
 *
 * Run: node --env-file=.env.local scripts/verify/edge-cache-headers-drive.mjs [baseUrl]
 */
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { stripCommentsAndStrings, headerRules, isPublicEdgeCacheRule, sourceOf } from '../guards/edge-cache-is-viewer-independent.mjs'
import { startGateServer, envFor } from '../ops/pre-push-gate.mjs'
import { ensureLaneCProofUser, expectedDisplayName, LANE_C_PROOF_EMAIL } from './lib/lane-c-proof-user.mjs'

/*
 * THIS DRIVE SERVES ITS OWN BUILD. Handing it a base URL somebody else started
 * is how a drive ends up asserting against another lane's tree on a machine
 * running three of them, and `--serve` goes through `startGateServer`, the one
 * function permitted to run `next start` for a check, which also brings up the
 * rate-limit stub and the Sentry parity sink the gate's own steps get.
 */
const SERVE = process.argv.includes('--serve')
const portArg = process.argv.find((a) => a.startsWith('--port='))
const PORT = portArg ? Number(portArg.split('=')[1]) : 3200
let BASE = process.argv.find((a) => a.startsWith('http')) ?? `http://localhost:${PORT}`
/*
 * Where the evidence lands. Overridable because this drive is re-run by later
 * items against later trees (C8B.3 added /events/browse/:city to the set it
 * covers), and a second run writing over the first one's screenshots destroys
 * the evidence a closed item's ledger block cites.
 */
const outArg = process.argv.find((a) => a.startsWith('--out='))
const OUT = outArg ? outArg.slice('--out='.length) : 'C:/dev/EVIDENCE/C8-RUN6/driven'
const TAG = '[edge-cache-headers-drive]'
const MARKER = 'el-signed-in'
const WIDTHS = [390, 768, 1440]

let stopServer = null
const results = []
function record(name, ok, detail) {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `\n        ${detail}` : ''}`)
}

/**
 * The routes to drive, DERIVED from next.config.ts through the guard's own
 * readers rather than typed here. A hand-typed list would go stale the first
 * time a rule is added and would then prove nothing about the new one.
 */
function cachedRoutes() {
  const rules = headerRules(stripCommentsAndStrings(readFileSync('next.config.ts', 'utf8'))) ?? []
  return rules.filter(isPublicEdgeCacheRule).map(sourceOf).filter(Boolean)
}

/** A concrete URL for a route pattern, harvested from the running app. */
async function concreteUrl(routeSource) {
  if (!routeSource.includes(':')) return `${BASE}${routeSource}`
  if (routeSource === '/events/:slug') {
    const html = await fetch(`${BASE}/events`, { headers: { Cookie: 'el-audit=1' } }).then((r) => r.text())
    const slugs = [...html.matchAll(/href="\/events\/([a-z0-9-]+)"/g)].map((m) => m[1])
    const slug = slugs.find((s) => s !== 'browse')
    if (!slug) throw new Error('no event slug could be harvested from /events; nothing is guessed here')
    return `${BASE}/events/${slug}`
  }
  if (routeSource === '/events/browse/:city') {
    /*
     * ENUMERATED FROM THE RUNNING APP, NEVER TYPED. "melbourne" would work
     * today and is exactly the kind of literal that keeps a drive green after
     * the thing it was aimed at has moved.
     *
     * The sitemap is the platform's own published list of these URLs, and it is
     * tried first. It can legitimately be EMPTY: close-out SEO3 made a
     * templated discovery page publish itself only while it holds real events,
     * so a thin local catalogue yields nothing here and that is correct
     * behaviour rather than a fault.
     *
     * The second source is the one internal link these pages have. A production
     * crawl on 8 September 2026 found nothing on the platform linking to them;
     * CityLandingPage now carries the door, and harvesting through it proves
     * that door is open as a side effect.
     */
    const sitemap = await fetch(`${BASE}/sitemap.xml`).then((r) => r.text()).catch(() => '')
    const published = [...sitemap.matchAll(/\/events\/browse\/([a-z0-9-]+)/g)].map((m) => m[1])
    if (published.length > 0) return `${BASE}/events/browse/${published[0]}`

    const citiesPage = await fetch(`${BASE}/cities`, { headers: { Cookie: 'el-audit=1' } }).then((r) => r.text())
    const citySlugs = [...new Set([...citiesPage.matchAll(/href="\/city\/([a-z0-9-]+)"/g)].map((m) => m[1]))]
    for (const slug of citySlugs) {
      const cityHtml = await fetch(`${BASE}/city/${slug}`, { headers: { Cookie: 'el-audit=1' } }).then((r) => r.text())
      const link = cityHtml.match(/href="\/events\/browse\/([a-z0-9-]+)"/)
      if (link) return `${BASE}/events/browse/${link[1]}`
    }
    throw new Error(
      'no /events/browse/<city> URL could be harvested from the sitemap or from any of the ' +
        `${citySlugs.length} city page(s) reached from /cities. Nothing is guessed here.`,
    )
  }
  throw new Error(`no harvester for ${routeSource}; add one rather than guessing a value`)
}

async function headerFor(url, cookie) {
  const res = await fetch(url, { headers: cookie ? { Cookie: cookie } : {}, redirect: 'manual' })
  return { status: res.status, cdn: res.headers.get('cdn-cache-control') }
}

async function main() {
  mkdirSync(OUT, { recursive: true })

  if (SERVE) {
    mkdirSync('.tmp', { recursive: true })
    const started = await startGateServer(envFor('local'), '.tmp/edge-cache-drive-server.log', {
      also: [['scripts/verify/sentry-parity-sink.mjs']],
      port: PORT,
    })
    if (started.error) {
      console.error(`${TAG} could not serve the build: ${started.error}`)
      process.exit(1)
    }
    BASE = started.base
    stopServer = started.stop
    console.log(`${TAG} serving this tree's build on ${BASE}`)
  }

  // THE SERVER MUST BE THIS TREE'S BUILD. Three lanes run on this machine and a
  // drive against another lane's server reports a fault that belongs to the
  // machine rather than to the product.
  const buildId = existsSync('.next/BUILD_ID') ? readFileSync('.next/BUILD_ID', 'utf8').trim() : null
  if (!buildId) {
    console.error(`${TAG} no .next/BUILD_ID in this worktree. Build before driving.`)
    process.exit(1)
  }
  const probe = await fetch(`${BASE}/_next/static/${buildId}/_ssgManifest.js`).then((r) => r.status).catch(() => 0)
  if (probe !== 200) {
    console.error(`${TAG} ${BASE} is not serving this tree's build ${buildId} (probe answered ${probe}).`)
    process.exit(1)
  }
  console.log(`${TAG} ${BASE} is serving this tree's build ${buildId}`)

  const routes = cachedRoutes()
  if (routes.length === 0) {
    console.error(`${TAG} no publicly cached route found in next.config.ts. This drive would assert nothing.`)
    process.exit(1)
  }
  console.log(`${TAG} publicly cached routes, derived from next.config.ts: ${routes.join(', ')}`)

  // ── A. the header is offered to a stranger and withheld from a session ──────
  for (const route of routes) {
    const url = await concreteUrl(route)
    const anon = await headerFor(url, 'el-audit=1')
    const marked = await headerFor(url, `${MARKER}=1`)
    record(
      `${route}: a request with no ${MARKER} is offered the shared cache`,
      anon.status === 200 && /public,\s*s-maxage/.test(anon.cdn ?? ''),
      `${url} -> ${anon.status}, CDN-Cache-Control: ${anon.cdn ?? '(none)'}`,
    )
    record(
      `${route}: a request carrying ${MARKER} is NOT offered the shared cache`,
      marked.cdn === null,
      `${url} -> ${marked.status}, CDN-Cache-Control: ${marked.cdn ?? '(withheld, correct)'}`,
    )
  }

  // ── B. a real session, and what it can and cannot see ──────────────────────
  const user = await ensureLaneCProofUser()
  const name = expectedDisplayName()
  console.log(`${TAG} proof visitor ${user.email} (${user.created ? 'created now' : 'already existed'}); the header would render "${name}"`)

  const browser = await chromium.launch()
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    const page = await context.newPage()
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 120_000 })
    /*
     * WAIT FOR THE BUTTON TO ENABLE, AND DO NOT SKIP THIS.
     *
     * `login-form.tsx` renders `disabled={loading || !hydrated}`, so the submit
     * button is dead until React has hydrated. The first version of this drive
     * filled both fields and clicked immediately; the click hit a disabled
     * button, no request was made, no cookie was set, and the drive reported
     * "the sign-in did not take" against a product that signs in perfectly well.
     * A drive that races hydration accuses the page of its own impatience.
     */
    await page.waitForSelector('button[type="submit"]:not([disabled])', { timeout: 120_000 })
    await page.fill('input[name="email"]', LANE_C_PROOF_EMAIL)
    await page.fill('input[name="password"]', user.password)
    await page.click('button[type="submit"]')
    await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 120_000 }).catch(() => {})
    if (new URL(page.url()).pathname.startsWith('/login')) {
      // Whatever the page says about it beats a guess, so it is read and printed
      // rather than inferred from the absence of a cookie.
      const said = await page.locator('[role="alert"], .text-red-600, [aria-live]').allTextContents().catch(() => [])
      console.log(`${TAG} still on /login after submitting. The page says: ${JSON.stringify(said.filter(Boolean))}`)
    }

    const cookies = await context.cookies()
    const hasMarker = cookies.some((c) => c.name === MARKER)
    record(
      `signing in sets the ${MARKER} cookie, which is what every rule above keys on`,
      hasMarker,
      `cookies: ${cookies.map((c) => c.name).join(', ') || '(none)'}`,
    )

    // B1. THE PRESENCE THAT EARNS THE ABSENCE. On a page that is NOT publicly
    // cached, this session must show its own name. If it does not, the sign-in
    // failed and every absence below would be meaningless.
    await page.goto(`${BASE}/account`, { waitUntil: 'domcontentloaded', timeout: 120_000 })
    const accountHtml = await page.content()
    const showsName = accountHtml.includes(name)
    record(
      `the session is real: /account renders "${name}", so an absence elsewhere means something`,
      showsName,
      showsName ? 'present, as it must be' : 'NOT PRESENT - the sign-in did not take, so nothing below is asserted',
    )
    if (!showsName) {
      writeFileSync(join(OUT, 'account-html-when-name-missing.html'), accountHtml)
      throw new Error('the proof session did not render its own name on /account; refusing to assert a vacuous absence')
    }

    /*
     * B1b. THE BYTES A CACHE WOULD ACTUALLY STORE, which is not the same thing
     * as the DOM.
     *
     * `page.content()` returns the document AFTER hydration, so a name that a
     * client component put there in the browser reads identically to one the
     * server sent. Only the second can ever be stored and handed to a stranger.
     * So the response is ALSO fetched raw, with this session's real cookies, and
     * that is the copy the assertions below are made against.
     */
    const cookieHeader = (await context.cookies())
      .map((c) => `${c.name}=${c.value}`)
      .join('; ')
    /*
     * EVERY publicly cached route is probed, plus the CONTROL that makes the
     * result readable rather than a bare pass or fail:
     *
     *   /   renders the ordinary per-viewer header and is NOT cached, so it
     *       MUST carry the identity. If it does not, this whole section is
     *       measuring a session that is not being applied, and every clean
     *       result above it is meaningless rather than reassuring.
     *
     * THERE USED TO BE A SECOND CONTROL AND IT HAS BEEN RETIRED HONESTLY.
     * `/events/browse/melbourne` sat here as "staticSafe, and NOT cached",
     * to show `staticSafe` working at runtime on a route whose cleanliness the
     * cache could not explain. Close-out C8B.3 gave that route a public rule,
     * so the sentence stopped being true, and a control that describes the
     * platform as it was is worse than no control: it is a false statement the
     * drive prints as a PASS. No indexable page renders the anonymous header
     * and stays uncached any more, so the control is gone rather than
     * re-pointed at a page that would not carry the property either. The `/`
     * control is the one that guards against vacuity, and it remains.
     */
    const probes = [
      ...routes.map((r) => ({ route: r, mustBeClean: true })),
      { route: '/', mustBeClean: false, control: 'per-viewer header, not cached' },
    ]
    for (const probe of probes) {
      const url = await concreteUrl(probe.route)
      const res = await fetch(url, { headers: { Cookie: cookieHeader } })
      const body = await res.text()
      const slug = probe.route.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'root'
      writeFileSync(join(OUT, `signed-in-server-response-${slug}.html`), body)
      const occurrences = []
      for (let i = body.indexOf(name); i !== -1; i = body.indexOf(name, i + 1)) {
        occurrences.push(body.slice(Math.max(0, i - 140), i + 80).replace(/\s+/g, ' '))
        if (occurrences.length >= 3) break
      }
      const clean = occurrences.length === 0
      record(
        probe.mustBeClean
          ? `the SERVER response to a signed-in request for ${probe.route} carries no identity${probe.control ? ` [control: ${probe.control}]` : ''}`
          : `CONTROL: the SERVER response for ${probe.route} DOES carry the identity, so this section is really signed in`,
        clean === probe.mustBeClean,
        clean
          ? `${body.length} bytes, and "${name}" appears in none of them`
          : `${occurrences.length}+ occurrence(s):\n        ${occurrences.join('\n        ')}`,
      )
      if (routes.includes(probe.route)) {
        record(
          `and ${probe.route} is not offered to the shared cache for this session`,
          res.headers.get('cdn-cache-control') === null,
          `CDN-Cache-Control: ${res.headers.get('cdn-cache-control') ?? '(withheld, correct)'}`,
        )

        /*
         * THE PROPERTY THE WHOLE ARRANGEMENT RESTS ON, MEASURED RATHER THAN
         * ARGUED (close-out C8B.3).
         *
         * `missing` stops a signed-in render being STORED, but it cannot stop a
         * signed-in visitor being SERVED a stored anonymous copy: the edge looks
         * a URL up before any function runs and cookies are not part of its key
         * (src/lib/auth/signed-in-marker.ts, measured on the C13 preview). So
         * being served the cached copy is the NORMAL case for a signed-in
         * visitor, not an edge case, and the only thing that makes it harmless
         * is that the two documents are the same document.
         *
         * Everything above proves the cached copy carries no identity. That is
         * weaker than what is needed: a page could also drop a whole section for
         * anonymous visitors and still contain no name. This compares the bytes
         * the edge would store against the bytes this real session is rendered,
         * so "they see what they would have seen anyway" is a measurement.
         *
         * TWO PER-REQUEST VALUES ARE NORMALISED, NAMED HERE RATHER THAN WAVED
         * AT, because the first version of this check compared raw bytes and
         * failed - and the reason it failed is worth knowing.
         *
         * Two IDENTICAL anonymous requests to the same URL returned 401475 and
         * 401527 bytes. The divergence was located rather than assumed: it
         * begins at character 4897, at
         * `<meta name="sentry-trace" content="...">` and the `baggage` tag
         * beside it. Those carry a fresh distributed-tracing id per response,
         * and the trailing sampling flag (`-0` or `-1`) changes the length of
         * `baggage` with it. React's generated ids vary too.
         *
         * With exactly those three neutralised, two anonymous renders are
         * byte-identical (379822 = 379822), so the page is deterministic and
         * this comparison is meaningful rather than lucky.
         *
         * WORTH KNOWING AND NOT A DEFECT: a cached response therefore carries
         * ONE visitor's trace id to everybody served it. That is a monitoring
         * accuracy point, not a privacy one - the tags hold an environment, a
         * release, a public key and a random id, and nothing about a person -
         * and it has been true of /events and /events/:slug since they were
         * cached. It is written up in REVIEW-QUEUE-C.md.
         */
        const anonBody = await fetch(url).then((r) => r.text())
        const neutralise = (s) =>
          s
            .replace(/<meta name="sentry-trace" content="[^"]*"\/>/g, '<meta name="sentry-trace"/>')
            .replace(/<meta name="baggage" content="[^"]*"\/>/g, '<meta name="baggage"/>')
            .replace(/[0-9a-f]{8,}/g, '#')
        const anon = neutralise(anonBody)
        const signedIn = neutralise(body)
        // Length is compared on the NORMALISED text, so a section that is
        // present for one visitor and absent for the other still moves it.
        const same = anon.length === signedIn.length && anon === signedIn
        record(
          `${probe.route}: the copy the edge would store IS the copy this session renders`,
          same,
          same
            ? `${anon.length} normalised bytes either way, identical character for character`
            : `anonymous ${anon.length} normalised bytes vs signed-in ${signedIn.length}. A signed-in visitor served ` +
              'the cached copy would see a different page from the one this route renders for them.',
        )
      }
    }

    /*
     * B2. THE ABSENCE, now earned, at all three widths, ON EVERY CACHED ROUTE.
     *
     * This loop used to drive `/events` alone, because `/events` was the route
     * the defect was found on. That is the shape that lets the NEXT route join
     * the shared set with no eyes on it at any width, which is precisely how
     * `/events/[slug]` carried an identity from C13 until somebody looked. The
     * route list is derived from next.config.ts, so a rule added tomorrow is
     * driven tomorrow without anybody remembering to add it here.
     */
    for (const route of routes) {
    const routeSlug = route.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'root'
    const routeUrl = await concreteUrl(route)
    for (const width of WIDTHS) {
      const view = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 1000 }, storageState: await context.storageState() })
      const p = await view.newPage()
      const response = await p.goto(routeUrl, { waitUntil: 'domcontentloaded', timeout: 120_000 })
      const html = await p.content()
      const cdn = response?.headers()['cdn-cache-control'] ?? null

      /*
       * WHEN THE NAME IS THERE, SAY WHERE. A drive that reports "the identity is
       * in the response" and stops sends the next reader to search a 400 KB
       * document by hand. Every occurrence is located with enough surrounding
       * text to name the component that put it there.
       */
      const where = []
      for (let i = html.indexOf(name); i !== -1; i = html.indexOf(name, i + 1)) {
        where.push(html.slice(Math.max(0, i - 120), i + 60).replace(/\s+/g, ' '))
        if (where.length >= 4) break
      }
      if (where.length > 0) writeFileSync(join(OUT, `${routeSlug}-signed-in-${width}-occurrences.txt`), where.join('\n\n'))
      record(
        `@${width}: signed in, ${route} renders no trace of "${name}"`,
        where.length === 0,
        where.length > 0
          ? `THE VISITOR'S IDENTITY IS IN A SHARED RESPONSE, ${where.length} occurrence(s):\n        ${where.join('\n        ')}`
          : 'absent, and the same string is present on /account',
      )
      record(
        `@${width}: signed in, ${route} is not offered the shared cache`,
        cdn === null,
        `CDN-Cache-Control: ${cdn ?? '(withheld, correct)'}`,
      )
      /*
       * THE PAGE MUST STILL WORK. A blank page also contains no name, so the
       * absence above is only worth having beside a page that rendered.
       *
       * The link selector is `a[href^="/"]` and not `a[href^="/events/"]`,
       * DELIBERATELY. This loop now covers every cached route rather than
       * /events alone, and an event DETAIL page is not obliged to link to other
       * events; the narrower selector would have failed it for being the wrong
       * kind of page rather than for being broken.
       */
      const heading = await p.locator('h1').first().textContent().catch(() => null)
      const links = await p.locator('a[href^="/"]').count()
      record(
        `@${width}: ${route} is still a working page for a signed-in visitor`,
        Boolean(heading && heading.trim().length > 0) && links > 0,
        `h1 ${JSON.stringify((heading ?? '').trim().slice(0, 60))}, ${links} internal link(s)`,
      )
      await p.screenshot({ path: join(OUT, `${routeSlug}-signed-in-${width}.png`), fullPage: false })
      await view.close()
    }
    }

    /*
     * B2b. THE 404 ITSELF, because its chrome is what this change actually
     * edited. A page whose header was swapped has to be looked at, not just
     * reasoned about: an anonymous header on a signed-in visitor's 404 is the
     * accepted cost, a BROKEN 404 is not.
     */
    for (const width of WIDTHS) {
      const view = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 1000 }, storageState: await context.storageState() })
      const p = await view.newPage()
      const response = await p.goto(`${BASE}/this-page-does-not-exist-lane-c`, { waitUntil: 'domcontentloaded', timeout: 120_000 })
      const html = await p.content()
      const heading = await p.locator('h1').first().textContent().catch(() => null)
      record(
        `@${width}: the 404 still renders its own page, with a real heading and a way out`,
        response?.status() === 404 && Boolean(heading && heading.trim()) && (await p.locator('a[href="/"]').count()) > 0,
        `HTTP ${response?.status()}, h1 ${JSON.stringify((heading ?? '').trim().slice(0, 60))}`,
      )
      record(
        `@${width}: the 404 carries no identity, which is what keeps it out of every other page`,
        !html.includes(name),
        html.includes(name) ? 'the 404 still renders the visitor' : 'absent',
      )
      await p.screenshot({ path: join(OUT, `not-found-signed-in-${width}.png`), fullPage: false })
      await view.close()
    }

    // B3. THE CHROME IS NOT LOST EVERYWHERE, only where it must be. A page that
    // is not publicly cached still shows this visitor their account.
    const home = await context.newPage()
    await home.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 120_000 })
    const homeHtml = await home.content()
    record(
      'the homepage, which is not publicly cached, still shows the signed-in visitor their account',
      homeHtml.includes(name),
      homeHtml.includes(name) ? 'present' : 'ABSENT - staticSafe has leaked onto a route that should not have it',
    )
    await home.screenshot({ path: join(OUT, 'home-signed-in-1440.png') })
  } finally {
    await browser.close()
  }

  writeFileSync(join(OUT, 'edge-cache-drive.json'), JSON.stringify({ base: BASE, buildId, routes, results, takenAt: new Date().toISOString() }, null, 2))
  const failed = results.filter((r) => !r.ok)
  console.log('')
  console.log(`${TAG} ${results.length - failed.length}/${results.length} checks passed`)
  if (failed.length > 0) {
    for (const f of failed) console.error(`  FAILED: ${f.name}`)
    process.exitCode = 1
  }
}

main()
  .catch((error) => {
    console.error(`${TAG} ${error.stack ?? error.message}`)
    process.exitCode = 1
  })
  .finally(() => {
    // The server is stopped whichever way this ended, so a failed drive never
    // leaves a process holding this lane's port against the next run.
    if (stopServer) stopServer()
  })
