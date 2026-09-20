/**
 * HOW MANY TIMES DOES ONE PAGE VIEW ASK THE DATABASE THE SAME QUESTION?
 *
 * ============================================================================
 * WHY THIS EXISTS (close-out C8, C8B.1 "measure first, and never optimise
 * blind", then C8B.3 "work down the table, one item at a time")
 * ============================================================================
 *
 * The event route's element-render-delay term was closed on 20 September 2026
 * and every event page's observed LCP is now dominated by TIME TO FIRST BYTE:
 * 451 to 700ms of a 682 to 881ms LCP. So the next work is the server render,
 * and the first question to ask of a server render is not "what is slow" but
 * "what is done twice".
 *
 * A Next.js route renders its head and its body from the same request:
 * `generateMetadata` runs for the head, the default export runs for the body,
 * and each of them loads what it needs. Next's own reference is explicit that
 * this is expected to be free - "fetch requests are automatically memoized for
 * the same data across generateMetadata, generateStaticParams, Layouts, Pages,
 * and Server Components. React cache can be used if fetch is unavailable"
 * (node_modules/next/dist/docs/01-app/03-api-reference/04-functions/
 * generate-metadata.md, Next 16.3.0) - and on THIS platform it is not, for a
 * reason that is written down: every Supabase request carries its own
 * AbortSignal so that a retry inside a render is a real second request, and a
 * signal is the documented opt-OUT of the framework's request deduplicator
 * (src/lib/supabase/undeduped-fetch.ts). That was the right trade and it stays.
 * Its consequence is that the head and the body each pay for the row.
 *
 * Nothing had ever counted it. This does.
 *
 * ============================================================================
 * WHAT IT ASSERTS, AND WHY THE MAIN CLAUSE NEEDS NO THRESHOLD
 * ============================================================================
 *
 * CLAUSE 1, THE SAME QUESTION IS ASKED ONCE. For every subject, one page view
 * must produce no two identical PostgREST calls. A call's identity is its
 * method, its table or function, its query string AND a digest of its body,
 * because an RPC's arguments live in the body (see
 * scripts/verify/lib/count-supabase-reads.mjs, which records all four).
 *
 * This is the whole defect expressed without a magic number. A millisecond
 * threshold would need re-tuning on every machine, and this machine runs three
 * build lanes at once; "twice" is exactly true or exactly false.
 *
 * CLAUSE 2, THE PAGE STILL ANSWERS. Every subject must answer 200. A route
 * that stopped rendering would otherwise pass clause 1 perfectly.
 *
 * CLAUSE 3, THE TIME IS REPORTED, NOT THRESHOLDED. Median time to first byte
 * over five warmed samples per subject, written into the report so a before
 * and an after can be compared by a human. C8B.6: the median, never the best.
 *
 * CLAUSE 4, IT IS DRIVEN AT 390, 768 AND 1440. A real browser loads one
 * representative of each changed family at three widths, the page's own
 * landmark must be visible, and a screenshot is kept. A read-count drive that
 * never opened a browser cannot see that it has broken the page.
 *
 * CLAUSE 5, THE ANTI-FALSE-PASS. The route families are DERIVED from the app
 * directory, and a representative URL for each is taken from the platform's own
 * sitemap, never guessed. The drive refuses to report a pass if it measured
 * fewer subjects than it found, and it prints the families for which the
 * sitemap offered nothing so an unmeasured family is visible rather than
 * silently absent.
 *
 * Usage:
 *   node scripts/verify/one-question-per-page-view-drive.mjs --serve --port=3200
 *   node scripts/verify/one-question-per-page-view-drive.mjs http://127.0.0.1:3200
 */
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { startGateServer, envFor } from '../ops/pre-push-gate.mjs'
import { refuseUnlessThePortIsFree } from './lib/port-is-ours.mjs'

const TAG = '[one-question-per-page-view]'
const args = process.argv.slice(2)
const SERVE = args.includes('--serve')
const PORT = Number(args.find((a) => a.startsWith('--port='))?.split('=')[1] ?? 3200)
const LABEL = args.find((a) => a.startsWith('--label='))?.split('=')[1] ?? 'run'
const OUT = process.env.DRIVE_OUT ?? join('C:', 'dev', 'EVIDENCE', 'C8', 'one-question')
let BASE = args.find((a) => a.startsWith('http')) ?? `http://127.0.0.1:${PORT}`
const READ_LOG = resolve('.tmp', `one-question-reads-${LABEL}.jsonl`)

mkdirSync(OUT, { recursive: true })
mkdirSync('.tmp', { recursive: true })

const results = []
let failures = 0
const check = (name, ok, detail) => {
  results.push({ name, ok: Boolean(ok), detail })
  if (!ok) failures += 1
  console.log(`${TAG} ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' - ' + detail : ''}`)
}

/* ---------------------------------------------------------------------------
 * THE FAMILIES ARE DERIVED FROM THE APP DIRECTORY, NEVER TYPED.
 *
 * A route family is any directory under src/app holding a page.tsx. Route
 * groups `(name)` and private folders `_name` contribute no URL segment;
 * `[slug]` matches one segment and `[...rest]` matches the remainder. A list
 * typed by hand would be wrong the first time somebody adds a route, and this
 * drive's whole value is that it sweeps rather than samples.
 * ------------------------------------------------------------------------- */
function routeFamilies(dir = 'src/app', segments = []) {
  const out = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    if (entry.name.startsWith('_') || entry.name.startsWith('.')) continue
    const isGroup = entry.name.startsWith('(') && entry.name.endsWith(')')
    const next = isGroup ? segments : [...segments, entry.name]
    const child = join(dir, entry.name)
    if (existsSync(join(child, 'page.tsx'))) out.push('/' + next.join('/'))
    out.push(...routeFamilies(child, next))
  }
  return out
}

function familyMatcher(pattern) {
  const body = pattern
    .split('/')
    .filter(Boolean)
    .map((s) => (s.startsWith('[...') ? '.+' : s.startsWith('[') ? '[^/]+' : s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    .join('/')
  return new RegExp(`^/${body}$`)
}

const FAMILIES = routeFamilies().filter((p) => p !== '/')
const DYNAMIC = FAMILIES.filter((p) => p.includes('['))

/* ---------------------------------------------------------------------------
 * The server.
 * ------------------------------------------------------------------------- */
let stopServer = null
if (SERVE) {
  try {
    await refuseUnlessThePortIsFree(PORT, 'before the read-count server was started', 'pass --port= for one this lane owns')
  } catch (error) {
    console.error(`${TAG} REFUSING: ${error.message}`)
    process.exit(1)
  }
  if (existsSync(READ_LOG)) rmSync(READ_LOG)
  writeFileSync(READ_LOG, '')
  const env = { ...envFor('local'), SUPABASE_READ_LOG: READ_LOG }
  env.NODE_OPTIONS = `${env.NODE_OPTIONS ?? ''} --import ./scripts/verify/lib/count-supabase-reads.mjs`.trim()
  const started = await startGateServer(env, `.tmp/one-question-server-${LABEL}.log`, { port: PORT })
  if (started.error) {
    console.error(`${TAG} could not serve the build: ${started.error}`)
    process.exit(1)
  }
  BASE = started.base
  stopServer = started.stop
  console.log(`${TAG} serving the production build on ${BASE}`)
} else if (!existsSync(READ_LOG)) {
  console.error(`${TAG} REFUSING: without --serve there is no counted server. ${READ_LOG} does not exist.`)
  process.exit(1)
}

const report = { base: BASE, label: LABEL, takenAt: new Date().toISOString(), subjects: [], unmeasuredFamilies: [], results }

try {
  /* -------------------------------------------------------------------------
   * The subjects: the reviewed gate set, plus one representative per dynamic
   * family taken from the platform's own sitemap.
   * ----------------------------------------------------------------------- */
  const GATE = JSON.parse(readFileSync('lighthouse-gate-urls.json', 'utf8'))
  const gatePaths = [...GATE.static.map((s) => s.path ?? s), ...GATE.eventDetail.map((e) => e.path)]

  const sitemapPaths = await readSitemap(BASE)
  console.log(`${TAG} the sitemap advertises ${sitemapPaths.length} URLs`)

  const subjects = []
  for (const p of gatePaths) subjects.push({ family: 'gate set', path: p })
  for (const family of DYNAMIC) {
    const match = familyMatcher(family)
    const hit = sitemapPaths.find((p) => match.test(p) && !subjects.some((s) => s.path === p))
    if (hit) subjects.push({ family, path: hit })
    else report.unmeasuredFamilies.push(family)
  }
  console.log(`${TAG} ${subjects.length} subjects over ${FAMILIES.length} route families; ${report.unmeasuredFamilies.length} dynamic families are not in the sitemap`)

  /* -------------------------------------------------------------------------
   * CLAUSES 1, 2 and 3.
   * ----------------------------------------------------------------------- */
  for (const subject of subjects) {
    const measured = await measure(subject.path)
    report.subjects.push({ ...subject, ...measured })
    check(
      `${subject.path} asks each question once`,
      measured.duplicated.length === 0,
      `${measured.reads} call(s), ${measured.unique} distinct` +
        (measured.duplicated.length ? ` :: ${measured.duplicated.map((d) => `x${d.n} ${d.q}`).join(' | ')}` : ''),
    )
    check(`${subject.path} answers 200`, measured.status === 200, `status ${measured.status}, ttfb median ${measured.ttfbMedian}ms of ${measured.ttfb.join('/')}`)
  }

  /* -------------------------------------------------------------------------
   * CLAUSE 4. A browser, at three widths, on one representative of each family
   * whose reads this item changed.
   * ----------------------------------------------------------------------- */
  const DRIVEN = subjects.filter((s) => ['/events/[slug]', '/organisers/[handle]', '/venues/[handle]', '/artists/[slug]'].includes(s.family))
  const extraEvent = subjects.find((s) => s.family === 'gate set' && /^\/events\/[^/]+$/.test(s.path))
  if (extraEvent && !DRIVEN.some((s) => s.path === extraEvent.path)) DRIVEN.unshift({ ...extraEvent, family: '/events/[slug]' })
  check('a representative of every changed family is driven in a browser', DRIVEN.length >= 4, DRIVEN.map((s) => s.path).join(' '))

  const browser = await chromium.launch()
  try {
    for (const vp of [
      { label: '390', width: 390, height: 844 },
      { label: '768', width: 768, height: 1024 },
      { label: '1440', width: 1440, height: 900 },
    ]) {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: 1,
        isMobile: vp.width < 768,
        hasTouch: vp.width < 768,
      })
      const page = await context.newPage()
      for (const subject of DRIVEN) {
        await page.goto(BASE + subject.path, { waitUntil: 'load' })
        // The landmark is the page's own <h1>: every one of these families
        // renders one, and asserting the heading rather than a class name
        // keeps this from breaking on a styling change.
        const heading = page.locator('h1').first()
        let text = ''
        let visible = false
        try {
          await heading.waitFor({ state: 'visible', timeout: 15000 })
          visible = true
          text = (await heading.innerText()).trim().replace(/\s+/g, ' ').slice(0, 60)
        } catch {
          visible = false
        }
        check(`${vp.label} ${subject.path} renders its heading`, visible && text.length > 0, text || 'no visible h1')
        await page.screenshot({
          path: join(OUT, `${LABEL}-${vp.label}-${subject.path.replaceAll('/', '-').replace(/^-/, '')}.png`),
          fullPage: false,
        })
      }
      await context.close()
    }
  } finally {
    await browser.close()
  }

  /* CLAUSE 5. A drive that measured nothing is not a drive that passed. */
  const EXPECTED = subjects.length * 2 + 1 + DRIVEN.length * 3
  if (results.length < EXPECTED) {
    check('the drive performed every check it set out to perform', false, `${results.length} checks, expected ${EXPECTED}`)
  }
} finally {
  if (stopServer) await stopServer()
}

writeFileSync(join(OUT, `one-question-${LABEL}.json`), JSON.stringify(report, null, 2))
console.log(`${TAG} report written to ${join(OUT, `one-question-${LABEL}.json`)}`)
if (failures) {
  console.error(`${TAG} FAIL - ${failures} of ${results.length}`)
  process.exit(1)
}
console.log(`${TAG} PASS - ${results.length} of ${results.length}`)

/* ------------------------------------------------------------------------ */

async function readSitemap(base) {
  const first = await (await fetch(base + '/sitemap.xml')).text()
  const locs = (xml) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname)
  if (!/<sitemapindex/.test(first)) return locs(first)
  const out = []
  for (const child of locs(first)) {
    const xml = await (await fetch(base + child)).text()
    out.push(...locs(xml))
  }
  return out
}

/**
 * One page view, counted. The log is bracketed by its own line count rather
 * than by a timestamp, so a slow write can never be attributed to the wrong
 * request; the drive makes one request at a time, which is what makes the
 * bracket exact.
 */
async function measure(path) {
  await fetch(BASE + path) // warm: the measurement is the steady state
  await new Promise((r) => setTimeout(r, 400))

  const ttfb = []
  for (let i = 0; i < 5; i += 1) {
    const t0 = Date.now()
    const res = await fetch(BASE + path)
    ttfb.push(Date.now() - t0)
    await res.text()
  }
  await new Promise((r) => setTimeout(r, 500))

  const before = readFileSync(READ_LOG, 'utf8').split('\n').filter(Boolean).length
  const res = await fetch(BASE + path)
  const status = res.status
  await res.text()
  await new Promise((r) => setTimeout(r, 700))
  const lines = readFileSync(READ_LOG, 'utf8').split('\n').filter(Boolean).slice(before).map((l) => JSON.parse(l))

  const counts = new Map()
  for (const l of lines) {
    const key = `${l.method} ${l.table}?${l.query}${l.body ? ` #${l.body}` : ''}`
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  const sorted = [...ttfb].sort((a, b) => a - b)
  return {
    status,
    ttfb,
    ttfbMedian: sorted[Math.floor(sorted.length / 2)],
    reads: lines.length,
    unique: counts.size,
    duplicated: [...counts.entries()]
      .filter(([, n]) => n > 1)
      .map(([q, n]) => ({ n, q: decodeURIComponent(q).slice(0, 200) })),
  }
}
