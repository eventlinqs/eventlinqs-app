/**
 * THE BLINK, DRIVEN. Proof that a read which fails answers "try again" and never
 * "this does not exist", on the production build, at 390, 768 and 1440.
 *
 * Close-out, 12 September 2026, the fourth occurrence of the read-failure class:
 * the gate's checkout drive opened a published event at 768 and the route
 * answered 404 once, because the layout's existence read discarded its error.
 * The fix is src/lib/supabase/read-or-throw.ts and the static half is
 * scripts/guards/read-failure-is-not-not-found.mjs. This is the dynamic half:
 * the served build, a real event enumerated from the database, and a dropped
 * socket injected on cue.
 *
 * HOW THE BLINK IS MADE. The Supabase URL is inlined into the server bundle, so
 * the only seam is the global fetch, which supabase-js resolves at call time.
 * scripts/verify/lib/blink-fetch-preload.mjs is loaded into the server with
 * NODE_OPTIONS=--import and fails the events read for one slug on cue: once, or
 * every time. The real database is on the other side of it for everything else.
 *
 * WHAT IS PROVEN, per width:
 *   1. baseline           the event answers 200
 *   2. one dropped read   still 200, and the injection log shows the drop AND the
 *                         retry that followed it
 *   3. persistent failure 500, NEVER 404, with no not-found copy on the page and
 *                         no horizontal overflow at that width
 *   4. an unknown slug    404, and the server log says the row is genuinely absent
 *
 * Usage:
 *   env -u NEXT_PUBLIC_SUPABASE_URL -u NEXT_PUBLIC_SUPABASE_ANON_KEY \
 *     node scripts/verify/read-failure-blink-proof.mjs
 *   BLINK_OUT=<dir> to keep the evidence somewhere other than .tmp/blink-proof.
 * Needs a production build under .next (npm run build) and the TEST .env.local.
 */
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { envFor, startGateServer } from '../ops/pre-push-gate.mjs'

const TAG = '[blink-proof]'
const ROOT = process.cwd()
const OUT = process.env.BLINK_OUT || join(ROOT, '.tmp', 'blink-proof')
const WIDTHS = (process.env.BLINK_WIDTHS || '390,768,1440').split(',').map((w) => Number(w.trim()))
const NOT_FOUND_COPY = /page not found|could not find|does not exist|doesn.t exist|we can.t find/i

mkdirSync(OUT, { recursive: true })
const faults = []
const notes = []
const fail = (m) => {
  faults.push(m)
  console.error(`${TAG} FAIL: ${m}`)
}
const note = (m) => {
  notes.push(m)
  console.log(`${TAG} ${m}`)
}

if (!existsSync(join(ROOT, '.next', 'BUILD_ID'))) {
  console.error(`${TAG} no production build under .next (no BUILD_ID). Run npm run build first.`)
  process.exit(1)
}

const env = envFor('local')
if (/gndnldyfudbytbboxesk/.test(env.NEXT_PUBLIC_SUPABASE_URL ?? '')) {
  console.error(`${TAG} refusing to run with the production Supabase URL in the environment; this proof enumerates TEST`)
  process.exit(1)
}
if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error(`${TAG} NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required (from .env.local)`)
  process.exit(1)
}

const control = join(OUT, 'blink-control.txt')
const injections = join(OUT, 'blink-injections.txt')
const serverLog = join(OUT, 'server.log')
writeFileSync(control, 'off')
writeFileSync(injections, '')
const setMode = (mode) => writeFileSync(control, mode)
const injectionText = () => readFileSync(injections, 'utf8')

const preload = pathToFileURL(join(ROOT, 'scripts', 'verify', 'lib', 'blink-fetch-preload.mjs')).href
const serverEnv = {
  ...env,
  NODE_OPTIONS: [env.NODE_OPTIONS, `--import=${preload}`].filter(Boolean).join(' '),
  BLINK_CONTROL_FILE: control,
  BLINK_LOG_FILE: injections,
}

/*
 * THE EVENT IS ENUMERATED, NEVER GUESSED: published and public with a future
 * start, oldest start first, and the first one the served build answers 200 for
 * at baseline is the one driven. The candidates are printed so a run can be
 * reproduced.
 */
async function candidateSlugs() {
  const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })
  const { data, error } = await db
    .from('events')
    .select('slug, title')
    .eq('status', 'published')
    .eq('visibility', 'public')
    .gt('start_date', new Date().toISOString())
    .order('start_date', { ascending: true })
    .limit(6)
  if (error) {
    fail(`could not enumerate events: ${error.message}`)
    return []
  }
  return (data ?? []).map((r) => r.slug)
}

const started = await startGateServer(serverEnv, serverLog)
if (started.error) process.exit(1)
const { base, stop } = started
note(`base ${base}`)

let slug = null
const browser = await chromium.launch()
try {
  const candidates = await candidateSlugs()
  note(`candidates: ${candidates.join(', ') || 'none'}`)
  const probe = await browser.newPage()
  for (const c of candidates) {
    const r = await probe.goto(`${base}/events/${c}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    if (r?.status() === 200) {
      slug = c
      break
    }
    note(`candidate ${c} answered ${r?.status()} at baseline; not this one`)
  }
  await probe.close()
  if (!slug) {
    fail('no enumerated event answers 200 at baseline, so nothing can be driven')
  } else {
    note(`driving /events/${slug}`)
  }

  let nonceCounter = 0
  for (const width of slug ? WIDTHS : []) {
    const context = await browser.newContext({ viewport: { width, height: width < 800 ? 844 : 900 } })
    const page = await context.newPage()
    const url = `${base}/events/${slug}`
    const shot = (name) => page.screenshot({ path: join(OUT, `${width}-${name}.png`) })

    // 1. baseline
    setMode('off')
    const r1 = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    if (r1?.status() !== 200) fail(`${width}: baseline answered ${r1?.status()}`)
    else note(`${width}: baseline 200`)
    await shot('1-baseline-200')

    // 2. one dropped read
    nonceCounter += 1
    const nonce = `w${width}-${nonceCounter}`
    setMode(`once ${slug} ${nonce}`)
    const before = injectionText().length
    const r2 = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    const seen = injectionText().slice(before)
    const injected = seen.includes(`INJECTED once ${nonce}`)
    const retried = seen.includes(`PASSED once ${nonce}`)
    if (!injected) fail(`${width}: no read was dropped, so nothing about a blink was proven`)
    if (injected && !retried) fail(`${width}: after the dropped read no retry reached the database`)
    if (r2?.status() !== 200) fail(`${width}: one dropped read answered ${r2?.status()} instead of 200`)
    if (injected && retried && r2?.status() === 200) note(`${width}: one dropped read, one retry, 200`)
    await shot('2-after-one-dropped-read-200')

    // 3. persistent failure
    setMode(`always ${slug}`)
    const r3 = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    const s3 = r3?.status()
    if (s3 === 404) fail(`${width}: a persistent read failure answered 404, the false answer this proof exists to refuse`)
    else if (s3 !== 500) fail(`${width}: a persistent read failure answered ${s3}; expected 500`)
    else note(`${width}: persistent failure 500`)
    const body3 = await page.locator('body').innerText()
    if (NOT_FOUND_COPY.test(body3)) fail(`${width}: the failure page carries not-found copy`)
    const fit = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }))
    if (fit.sw > fit.iw) fail(`${width}: the failure page overflows, scrollWidth ${fit.sw} > ${fit.iw}`)
    else note(`${width}: failure page fits, scrollWidth ${fit.sw}/${fit.iw}`)
    await shot('3-persistent-failure-500')

    // 4. a slug with no row
    setMode('off')
    const missing = `no-such-event-${nonce}`
    const r4 = await page.goto(`${base}/events/${missing}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    if (r4?.status() !== 404) fail(`${width}: an unknown slug answered ${r4?.status()} instead of 404`)
    else note(`${width}: unknown slug 404`)
    await shot('4-unknown-slug-404')

    await context.close()
  }
} finally {
  await browser.close()
  stop()
}

const log = existsSync(serverLog) ? readFileSync(serverLog, 'utf8') : ''
if (slug) {
  if (!log.includes('[event-route] read failed; answering 500 rather than 404')) {
    fail('the server log never recorded the refused read as a 500 decision')
  }
  if (!log.includes('[event-route] no public row for no-such-event-')) {
    fail('the server log never recorded the genuinely absent slug')
  }
  if (log.includes('[event-route] no public row for ' + slug)) {
    fail(`the server log called ${slug} absent, which is the false answer`)
  }
}

writeFileSync(
  join(OUT, 'blink-proof-report.json'),
  JSON.stringify({ base, slug, widths: WIDTHS, notes, faults, verdict: faults.length === 0 ? 'PASS' : 'FAIL' }, null, 2),
)
console.log(`\n${TAG} ${faults.length} fault(s) across ${WIDTHS.length} width(s). Evidence: ${OUT}`)
console.log(`${TAG} ${faults.length === 0 ? 'PASS' : 'FAIL'}`)
process.exit(faults.length === 0 ? 0 : 1)
