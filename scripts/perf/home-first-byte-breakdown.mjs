/**
 * HOW MUCH OF THE HOMEPAGE'S FIRST BYTE IS THE DATABASE, MEASURED RATHER THAN
 * ASSUMED.
 *
 * ============================================================================
 * WHY THIS EXISTS
 * ============================================================================
 *
 * Close-out C8B.1's cost table found that time to first byte is the largest
 * single phase of the homepage's Largest Contentful Paint, in all ten runs
 * across two collections: 402 to 1277 ms of first byte against 136 to 275 ms of
 * element render delay. C8B.3 then says to work down that table one item at a
 * time, and to STATE THE EXPECTED SAVING BEFORE MAKING THE CHANGE.
 *
 * The obvious lever on a first byte, the CDN, is not available on this route:
 * the homepage renders a per-viewer header, so sharing its HTML at the edge
 * changes what a signed-in visitor sees, and that is an owner decision recorded
 * in C:\dev\REVIEW-QUEUE-C.md rather than work a lane may take. What IS
 * available is the origin's own work, and the question nobody had answered is
 * how much of it is spent waiting on Supabase.
 *
 * An answer to that decides whether the next change is worth making at all. If
 * the one blocking query is a tenth of the first byte, no amount of work on it
 * moves the paint and the effort belongs somewhere else. That is the whole
 * point of C8B.1's "never optimise blind".
 *
 * ============================================================================
 * WHAT IT REPORTS
 * ============================================================================
 *
 *   served TTFB   the time to first byte of GET /, N samples, median + spread
 *   query         the ONE query the page awaits before it can render anything,
 *                 run standalone against the same database, median + spread
 *   residual      served TTFB minus query
 *
 * MEDIAN, never the best run (CLAUDE.md, and C8B.6). The full sorted sample
 * list is printed beside each median so a noisy measurement is visibly noisy
 * rather than quietly wrong.
 *
 * THE RESIDUAL IS NOT A MEASUREMENT OF ANY ONE THING and is not labelled as if
 * it were. It contains the framework, React's render, the streaming shell's
 * first flush, and whatever else the server does between accepting the socket
 * and writing the first byte. It is reported because the SHARE matters: it is
 * the part a database change cannot reach.
 *
 * ============================================================================
 * HOW IT AVOIDS GUESSING WHAT THE PAGE DOES
 * ============================================================================
 *
 * The query is the product's own `loadHomeUpcoming`, imported through
 * scripts/lib/src-alias-loader.mjs, so it can never drift from what the page
 * runs. The row LIMIT is read out of src/app/page.tsx by matching the actual
 * call, never retyped here: a hardcoded 60 in this file would go on reporting a
 * confident number the day somebody changed the page to ask for 24.
 *
 * If that call site cannot be found, or its shape has changed, this script
 * REFUSES rather than falling back to a default. A measurement harness that
 * guesses its own subject is a failure this repository has already paid for
 * (scripts/perf/lh-local-median.mjs carries the MSYS path incident).
 *
 * ============================================================================
 * THE ONE STUB, DECLARED RATHER THAN HIDDEN
 * ============================================================================
 *
 * `loadHomeUpcoming` reaches `@sentry/nextjs` through
 * src/lib/dev/fixture-events.ts. Under the bundler that specifier resolves to a
 * build-specific entry point; under plain Node it resolves to one that exports
 * no `isInitialized`, and the import throws before any measurement can start. A
 * resolve hook maps `@sentry/nextjs` to an inert stub FOR THIS PROCESS ONLY.
 *
 * It is declared here, and printed on every run, because a stub nobody mentions
 * is a stub that later gets mistaken for the product. It affects error
 * reporting and nothing else: no query, no predicate and no row is touched by
 * it.
 *
 * ============================================================================
 * WHAT IT CANNOT SEE
 * ============================================================================
 *
 * - The standalone query runs in a DIFFERENT PROCESS from the server, so its
 *   connection reuse is its own. It is warmed first and the warm-up discarded,
 *   which removes the TLS handshake but not the difference. Read the query
 *   median as a LOWER BOUND on what the server pays, never as a copy of it.
 * - `next start` has no CDN and no cold start, so the served TTFB here is the
 *   origin's compute alone. That is what makes it the right place to ask this
 *   particular question and the wrong place to quote an absolute.
 * - It says nothing about whether a change to that query is SAFE. Caching event
 *   ROWS is forbidden by the rule in src/lib/events/cache-tags.ts, for a defect
 *   that reached production, and this script does not adjudicate it.
 *
 * SERVING. `--serve` starts the production build the way the push gate starts
 * it, through `startGateServer`, which is the only function permitted to run
 * `next start` for a measurement (scripts/guards/gate-servers-carry-a-limiter.mjs).
 * It deliberately does NOT also start the Sentry parity sink that
 * scripts/perf/lh-local-median.mjs starts: that sink exists so a BROWSER's SDK
 * request does not error in the console and cost Lighthouse a best-practices
 * point, and there is no browser here. Starting it would only risk colliding
 * with another lane's gate on the shared sink port.
 *
 * Usage (paths carry NO leading slash: MSYS rewrites a leading slash to a
 * Windows path before the process starts):
 *
 *   env -u NEXT_PUBLIC_SUPABASE_URL -u NEXT_PUBLIC_SUPABASE_ANON_KEY \
 *     node --env-file=.env.local --import ./scripts/lib/src-alias-loader.mjs \
 *     scripts/perf/home-first-byte-breakdown.mjs --serve --port=3200 --samples=9
 */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { register } from 'node:module'
import { startGateServer, envFor } from '../ops/pre-push-gate.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

/* The declared stub. See "THE ONE STUB" above. */
const SENTRY_STUB =
  'data:text/javascript,' +
  encodeURIComponent(
    [
      /*
       * The named imports src/lib/observability/sentry.ts actually makes. They
       * are listed rather than guessed, and `isInitialized` returns TRUE so the
       * module's own `ensureServerSentryInitialized` short-circuits and never
       * reaches `init`.
       */
      'export const captureException = () => undefined',
      'export const captureMessage = () => undefined',
      'export const init = () => undefined',
      'export const isInitialized = () => true',
      'export default {}',
    ].join('\n'),
  )

register(
  'data:text/javascript,' +
    encodeURIComponent(
      [
        'export async function resolve(specifier, context, next) {',
        "  if (specifier === '@sentry/nextjs') {",
        `    return { url: ${JSON.stringify(SENTRY_STUB)}, shortCircuit: true }`,
        '  }',
        '  return next(specifier, context)',
        '}',
      ].join('\n'),
    ),
  import.meta.url,
)

const args = process.argv.slice(2)
const SERVE = args.includes('--serve')
const PORT = Number(args.find(a => a.startsWith('--port='))?.split('=')[1] ?? 3200)
const samples = Number(args.find(a => a.startsWith('--samples='))?.split('=')[1] ?? 9)
const outArg = args.find(a => a.startsWith('--out='))?.split('=')[1]

function refuse(why) {
  console.error(`[home-first-byte] REFUSING: ${why}`)
  process.exit(1)
}

/*
 * The subject, read out of the page rather than retyped. The call is
 * `loadHomeUpcoming(supabase, nowIso, 60)`; the third argument is the limit.
 */
const PAGE = join(ROOT, 'src', 'app', 'page.tsx')
let pageSource = ''
try {
  pageSource = readFileSync(PAGE, 'utf8')
} catch (error) {
  refuse(`cannot read ${PAGE}: ${error instanceof Error ? error.message : String(error)}`)
}
const call = pageSource.match(/loadHomeUpcoming\(\s*supabase\s*,\s*nowIso\s*,\s*(\d+)\s*\)/)
if (!call) {
  refuse(
    'src/app/page.tsx no longer contains a `loadHomeUpcoming(supabase, nowIso, <n>)` call.\n' +
      '            Either the homepage stopped awaiting that query, in which case this script is\n' +
      '            measuring the wrong thing, or the call changed shape and this matcher must be\n' +
      '            taught it. Guessing a limit here would report a confident wrong number.',
  )
}
const LIMIT = Number(call[1])

const median = xs => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]
const show = xs => [...xs].sort((a, b) => a - b).map(x => Math.round(x)).join(' ')

/** Time to the FIRST BYTE of the body, not to the complete response. */
async function ttfb(url) {
  const started = performance.now()
  const res = await fetch(url, {
    headers: { 'user-agent': 'eventlinqs-home-first-byte' },
    cache: 'no-store',
  })
  if (!res.ok) refuse(`${url} answered ${res.status}; a TTFB from an error page measures nothing`)
  const reader = res.body.getReader()
  await reader.read()
  const elapsed = performance.now() - started
  await reader.cancel()
  return elapsed
}

let stopServer = null
let base = (args.find(a => a.startsWith('http')) ?? `http://127.0.0.1:${PORT}`).replace(/\/$/, '')
if (SERVE) {
  mkdirSync('.tmp', { recursive: true })
  const started = await startGateServer(envFor('local'), '.tmp/home-first-byte-server.log', {
    port: PORT,
  })
  if (started.error) {
    console.error(`[home-first-byte] could not serve the build: ${started.error}`)
    process.exit(1)
  }
  base = started.base
  stopServer = started.stop
  console.log(`[home-first-byte] serving the production build on ${base}`)
}

console.log(
  `[home-first-byte] base ${base}, ${samples} samples, limit ${LIMIT} read from src/app/page.tsx`,
)
console.log('[home-first-byte] @sentry/nextjs is stubbed in THIS PROCESS ONLY (see the header)')

await ttfb(`${base}/`) // warm-up, discarded
const ttfbs = []
for (let i = 0; i < samples; i++) ttfbs.push(await ttfb(`${base}/`))

/*
 * THE LADDER, and it is here because the residual below is 75% of the first
 * byte and "framework, render, first flush" names three things rather than
 * measuring any of them.
 *
 * The residual cannot be broken down from inside this process. It CAN be
 * bracketed, by asking the SAME server for pages that render progressively more
 * of the same tree and sampling them identically:
 *
 *   a credential form   the shared chrome and almost nothing else
 *   a prose page        the chrome plus a long static body, no images, no query
 *   a results grid      the chrome plus ~24 cards behind one query
 *   the homepage        the chrome plus ~124 images across twenty rails
 *
 * The difference between the first and the last is the closest thing to "what
 * the rails cost the origin" that can be had without instrumenting the render,
 * and the document size is printed beside each one so a reader can see whether
 * the two move together.
 *
 * WHAT IT IS NOT: an attribution. A page is not a sum of its parts and these
 * four differ in more than their card count. It brackets the residual; it does
 * not explain it.
 */
const ladderPaths = args.filter(a => a.startsWith('--path=')).map(a => a.split('=')[1])
const ladder = []
for (const raw of ladderPaths) {
  if (raw.startsWith('/') || /^[A-Za-z]:/.test(raw)) {
    refuse(`--path=${raw} arrived with a leading slash or a drive letter; MSYS rewrote it`)
  }
  const path = raw === 'home' ? '/' : `/${raw}`
  const url = `${base}${path}`
  await ttfb(url) // warm-up, discarded
  const runs = []
  for (let i = 0; i < samples; i++) runs.push(await ttfb(url))
  const bytes = (await (await fetch(url, { cache: 'no-store' })).text()).length
  ladder.push({ path, medianMs: median(runs), runs, documentBytes: bytes })
}

const { createClient } = await import('@supabase/supabase-js')
const { loadHomeUpcoming } = await import('@/lib/events/home-queries.ts')
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
if (!url || !key) {
  refuse('NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY are not in the environment')
}
const supabase = createClient(url, key, { auth: { persistSession: false } })

let rowCount = null
const queries = []
await loadHomeUpcoming(supabase, new Date().toISOString(), LIMIT) // warm-up, discarded
for (let i = 0; i < samples; i++) {
  const started = performance.now()
  const rows = await loadHomeUpcoming(supabase, new Date().toISOString(), LIMIT)
  queries.push(performance.now() - started)
  rowCount = rows.length
}

/*
 * THE WIRE FLOOR, and it is the number that decides whether the query above is
 * worth attacking AT ALL from this machine.
 *
 * A query median is `round trip + work`, and on a developer laptop reaching a
 * hosted database over a domestic connection the round trip can be most of it.
 * Optimising against a number that is mostly somebody's internet is how a
 * session spends a day making a query 20 ms faster inside a 180 ms wire.
 *
 * So the cheapest possible request is timed through the SAME warm client: one
 * column, one row, no predicate worth planning. What is left after subtracting
 * it is the closest honest estimate of the query's own work, and the estimate
 * is labelled as an estimate rather than printed as a fact.
 *
 * It CANNOT be subtracted from the served TTFB. The server is a different
 * process with its own connection, and on Vercel the function and the database
 * are in one region while this laptop is not. Production's wire is smaller than
 * this one and nothing here measures it.
 */
const floors = []
await supabase.from('events').select('id').limit(1) // warm-up, discarded
for (let i = 0; i < samples; i++) {
  const started = performance.now()
  const { error } = await supabase.from('events').select('id').limit(1)
  if (error) refuse(`the wire-floor probe failed: ${error.message}`)
  floors.push(performance.now() - started)
}

const ttfbMedian = median(ttfbs)
const queryMedian = median(queries)
const floorMedian = median(floors)
const residual = ttfbMedian - queryMedian
const queryWork = queryMedian - floorMedian

console.log('')
console.log(`  database host        ${new URL(url).host}`)
console.log(`  rows returned        ${rowCount}`)
console.log('')
console.log(`  served TTFB  median  ${Math.round(ttfbMedian)} ms   samples ${show(ttfbs)}`)
console.log(`  query        median  ${Math.round(queryMedian)} ms   samples ${show(queries)}`)
console.log(
  `  residual             ${Math.round(residual)} ms   (framework, render, first flush: not one thing)`,
)
console.log(`  query share          ${((queryMedian / ttfbMedian) * 100).toFixed(1)}%`)
if (ladder.length > 0) {
  console.log('')
  console.log('  the ladder, same server, same sampling, brackets the residual:')
  for (const rung of ladder) {
    console.log(
      `    ${rung.path.padEnd(28)} TTFB ${String(Math.round(rung.medianMs)).padStart(5)} ms   ` +
        `document ${String(rung.documentBytes).padStart(8)} B   samples ${show(rung.runs)}`,
    )
  }
}
console.log('')
console.log(`  wire floor   median  ${Math.round(floorMedian)} ms   samples ${show(floors)}`)
console.log(
  `    of the query median, about ${Math.round(floorMedian)} ms is the round trip from THIS machine ` +
    `and about ${Math.round(queryWork)} ms is the query's own work (an estimate, not a fact: same ` +
    'client, different statement).',
)
if (floorMedian > queryMedian * 0.5) {
  console.log(
    '    MORE THAN HALF THE QUERY MEDIAN IS THE WIRE. This machine cannot rank a change to',
    "    that query: the signal is smaller than this connection's own spread. Rank it on the runner.",
  )
}

if (outArg) {
  const out = resolve(outArg)
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(
    out,
    JSON.stringify(
      {
        base,
        samples,
        limit: LIMIT,
        host: new URL(url).host,
        rowCount,
        ttfbMs: ttfbs,
        queryMs: queries,
        ladder,
        wireFloorMs: floors,
        ttfbMedianMs: ttfbMedian,
        queryMedianMs: queryMedian,
        wireFloorMedianMs: floorMedian,
        queryWorkEstimateMs: queryWork,
        residualMs: residual,
        takenAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  )
  console.log(`\n  written ${out}`)
}

if (stopServer) stopServer()
