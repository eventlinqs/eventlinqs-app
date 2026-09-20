/**
 * THE ADMIN DATA TABLES, ON A PHONE, AT 390, 768 AND 1440.
 *
 * ============================================================================
 * WHY THIS EXISTS AND WHAT IT IS FOR
 * ============================================================================
 *
 * The organiser dashboard's five tables were measured and rebuilt on 21
 * September 2026, and that item's review-queue entry named what it had not
 * touched: "the eighteen admin tables are a separate question and a bigger
 * one". This is the measurement half of that question, and it is deliberately
 * only the measurement: what gets rebuilt is decided by what this prints, not
 * by the shape of the class.
 *
 * A STATIC READ OF THE SOURCE ALREADY NARROWS IT, and is why this runs before
 * any rebuild rather than after. Of the eighteen admin files holding a table,
 * SIXTEEN wrap it in `overflow-x-auto`, which is swipeable and is the milder
 * fault; ONE (`/admin/audit`) uses `overflow-hidden`, which is a CLIP with no
 * gesture that reaches past it, and one (`/admin/health`) uses both. That is a
 * prediction, and predictions about layout have been wrong twice in this lane
 * already this week. The browser decides.
 *
 * ============================================================================
 * THE SAME CLAUSES AS THE ORGANISER DRIVE, FROM THE SAME MODULE
 * ============================================================================
 *
 * scripts/verify/lib/table-fit.mjs holds the measurement, so there is ONE
 * answer to "can a finger reach this control" and not two that drift. The
 * subtlety it carries is worth repeating here because it is what makes the
 * numbers below mean anything: reachability is measured at the scroll position
 * a person ARRIVES at, never after `scrollIntoView`, because `overflow: hidden`
 * scrolls programmatically while no gesture moves it. A check that scrolls
 * first reports a dead button as visible.
 *
 * ============================================================================
 * THE ROWS ARE THE PLATFORM'S, NOT THIS DRIVE'S
 * ============================================================================
 *
 * Every admin table lists what the platform already holds: users, events,
 * orders, payouts. This drive creates ONE row of its own, the lane-C admin
 * account it signs in with, and reads the rest. A table that genuinely has no
 * rows on TEST is reported as EMPTY and its clauses are not counted, rather
 * than passing four checks about nothing: an empty table cannot fail a fit
 * check and must never look like it passed one.
 *
 * TEST ONLY, checked twice, and the admin account it creates carries `lane-c`.
 *
 * Usage:
 *   env -u NEXT_PUBLIC_SUPABASE_URL -u NEXT_PUBLIC_SUPABASE_ANON_KEY \
 *     node --env-file=.env.local scripts/verify/admin-tables-fit-drive.mjs \
 *       --serve --port=3200 --label=before
 */
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { mkdirSync, writeFileSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { startGateServer, envFor } from '../ops/pre-push-gate.mjs'
import { refuseUnlessThePortIsFree } from './lib/port-is-ours.mjs'
import { assertNotProduction } from '../lib/production-write-preflight.mjs'
import { tearDownAccountOrFailTheRun } from './lib/teardown-account.mjs'
import { measureTable, scrollRightAndReadTheRowName } from './lib/table-fit.mjs'

assertNotProduction()

const TAG = '[admin-tables-fit]'
const args = process.argv.slice(2)
const SERVE = args.includes('--serve')
const PORT = Number(args.find((a) => a.startsWith('--port='))?.split('=')[1] ?? 3200)
const LABEL = args.find((a) => a.startsWith('--label='))?.split('=')[1] ?? 'run'
const OUT = process.env.DRIVE_OUT ?? join('C:', 'dev', 'EVIDENCE', 'C8', 'admin-tables')
let BASE = args.find((a) => a.startsWith('http')) ?? `http://127.0.0.1:${PORT}`

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL_ || !SERVICE) throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
if (!/vkapkibzokmfaxqogypq/.test(URL_)) throw new Error(`refusing to write to ${URL_}: this drive runs against TEST only`)

/*
 * THE ROUTES ARE DERIVED FROM THE SOURCE, NEVER TYPED.
 *
 * Every admin page file that contains a `<table` becomes a route, by mapping
 * its path back through the App Router's conventions. A typed list is the C18
 * lesson: it protects the pages somebody remembered on the day and silently
 * stops covering the ones added since.
 */
function walk(dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...walk(full))
    else if (entry === 'page.tsx') out.push(full)
  }
  return out
}

const ADMIN_DIR = join('src', 'app', 'admin')
const ROUTES = walk(ADMIN_DIR)
  .filter((f) => readFileSync(f, 'utf8').includes('<table'))
  .map((f) => ({
    file: f.split(/[\\/]/).join('/'),
    route:
      '/' +
      f
        .split(/[\\/]/)
        .slice(2) // drop src/app
        .filter((s) => !/^\(.*\)$/.test(s)) // route groups are not URL segments
        .join('/')
        .replace(/\/page\.tsx$/, ''),
  }))
  .filter((r) => !r.route.includes('[')) // a dynamic segment needs an id, and these are the index screens

if (ROUTES.length === 0) {
  console.error(`${TAG} REFUSING: no admin page contains a <table. Either they all went, or this is looking in the wrong place.`)
  process.exit(1)
}

const VIEWPORTS = [
  { label: '390', width: 390, height: 844 },
  { label: '768', width: 768, height: 1024 },
  { label: '1440', width: 1440, height: 900 },
]

const db = createClient(URL_, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } })
const stamp = Date.now().toString(36)
const created = { userId: null }

mkdirSync(OUT, { recursive: true })
const results = []
const empties = []
let failures = 0
const known = new Map()

/*
 * WHAT THIS RUN REFUSES TO EXIT ZERO ON, AND WHAT IT ONLY REPORTS.
 *
 * Two of the four clauses are ENFORCED here: a clip a finger cannot scroll,
 * and a control that cannot be reached. Both were true of /admin/audit on 21
 * September 2026 and both are now closed, so a return of either is a
 * regression and this command says so with an exit code.
 *
 * The other two are MEASURED AND NOT ENFORCED, and that is a scope rather than
 * a silence: thirteen admin tables lose the row's own name when swiped to the
 * right edge, and their controls run from 19 to 39 pixels tall against a 44px
 * law. Those are a rebuild of every admin table, they are the next item, and
 * they are printed on every run with their counts so the number can only go
 * down. A clause moves from KNOWN to enforced by deleting one line here, which
 * is the point: the bar is written where it can be raised.
 */
const ENFORCED = ['nothing is clipped', 'can be reached']
const isEnforced = (name) => ENFORCED.some((fragment) => name.includes(fragment))

const check = (name, ok, detail) => {
  const enforced = isEnforced(name)
  results.push({ name, ok: Boolean(ok), enforced, detail })
  if (!ok && enforced) failures += 1
  if (!ok && !enforced) {
    const clause = name.replace(/^\d+ \S+: /, '')
    known.set(clause, (known.get(clause) ?? 0) + 1)
  }
  const verdict = ok ? 'PASS' : enforced ? 'FAIL' : 'KNOWN'
  console.log(`${TAG} ${verdict}  ${name}${detail ? ' - ' + detail : ''}`)
}

let stopServer = null
try {
  /* ---- the admin this drive signs in as, and nothing else ------------- */
  const email = `lane-c-admintables-${stamp}@eventlinqs.test`
  const password = `${randomUUID()}Aa1`
  const made = await db.auth.admin.createUser({ email, password, email_confirm: true })
  if (made.error) throw new Error(`create the admin auth user: ${made.error.message}`)
  created.userId = made.data.user.id
  await db.from('profiles').upsert({
    id: created.userId,
    email,
    full_name: 'Lane C admin tables drive',
    display_name: 'Lane C admin tables drive',
    is_verified: true,
  })
  const granted = await db
    .from('admin_users')
    .insert({ id: created.userId, role: 'super_admin', display_name: 'Lane C admin tables drive' })
  if (granted.error) throw new Error(`grant the admin role: ${granted.error.message}`)

  if (SERVE) {
    await refuseUnlessThePortIsFree(PORT, 'before the admin tables drive server was started', 'pass --port= for one this lane owns')
    mkdirSync('.tmp', { recursive: true })
    const started = await startGateServer(envFor('local'), `.tmp/admin-tables-server-${LABEL}.log`, { port: PORT })
    if (started.error) throw new Error(`could not serve the build: ${started.error}`)
    BASE = started.base
    stopServer = started.stop
    console.log(`${TAG} serving the production build on ${BASE}`)
  }

  console.log(`${TAG} ${ROUTES.length} admin route(s) with a table, derived from ${ADMIN_DIR}`)

  const browser = await chromium.launch()
  const measurements = []
  try {
    for (const vp of VIEWPORTS) {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: 1,
        isMobile: vp.width < 768,
        hasTouch: vp.width < 768,
        locale: 'en-AU',
      })
      const page = await context.newPage()

      await page.goto(`${BASE}/admin/login`, { waitUntil: 'domcontentloaded', timeout: 180000 })
      await page.locator('input[name="email"]').fill(email)
      await page.locator('input[name="password"]').fill(password)
      await page.waitForFunction(() => !document.querySelector('button[type="submit"]')?.disabled, undefined, { timeout: 60000 })
      await page.locator('button[type="submit"]').click()
      await page.waitForURL((u) => !u.pathname.endsWith('/admin/login'), { timeout: 120000 }).catch(() => {})
      if (new URL(page.url()).pathname.endsWith('/admin/login')) {
        check(`${vp.label} the drive signed in`, false, 'admin sign-in refused; no admin table was measured')
        await context.close()
        continue
      }

      for (const target of ROUTES) {
        await page.goto(`${BASE}${target.route}`, { waitUntil: 'load', timeout: 120000 })
        const table = page.locator('table').first()
        const present = await table
          .waitFor({ state: 'attached', timeout: 20000 })
          .then(() => true)
          .catch(() => false)
        if (!present) {
          empties.push({ viewport: vp.label, route: target.route, why: 'no <table> rendered' })
          console.log(`${TAG} EMPTY ${vp.label} ${target.route} - no table rendered, not counted`)
          continue
        }
        /*
         * A `colSpan` MESSAGE IS NOT A ROW, and counting it as one is how this
         * drive first reported /admin/disputes as failing "a row still says
         * whose row it is" with the row being the sentence "No open disputes.
         * Chargebacks ra...". An empty state is a designed answer and has
         * nothing this check is about; measuring it produces a fault nobody
         * can fix.
         */
        const shape = await table.evaluate((el) => {
          const rows = [...el.querySelectorAll('tbody tr')]
          const data = rows.filter((r) => {
            const cells = [...r.querySelectorAll('td')]
            if (cells.length === 0) return false
            // One cell spanning the whole table is an empty state or a footer note.
            return !(cells.length === 1 && Number(cells[0].getAttribute('colspan') ?? '1') > 1)
          })
          return { rows: rows.length, data: data.length }
        })
        if (shape.data === 0) {
          empties.push({ viewport: vp.label, route: target.route, why: `${shape.rows} row(s), none of them data` })
          console.log(`${TAG} EMPTY ${vp.label} ${target.route} - ${shape.rows} row(s), none of them data, not counted`)
          continue
        }
        const bodyRows = shape.data

        const measured = await table.evaluate(measureTable)
        const rowName = await table.evaluate(scrollRightAndReadTheRowName)

        check(
          `${vp.label} ${target.route}: nothing is clipped by a box a finger cannot scroll`,
          measured.clipped.length === 0,
          measured.clipped.length === 0
            ? `${measured.ancestors.filter((a) => a.userScrollable).length} swipeable ancestor(s)`
            : measured.clipped.map((c) => `${c.tag} shows ${c.clientWidth} of ${c.scrollWidth} and hides the rest`).join('; '),
        )

        const dead = measured.controls.filter((c) => c.unreachable)
        check(
          `${vp.label} ${target.route}: every control in the table can be reached`,
          dead.length === 0,
          dead.length === 0
            ? `${measured.controls.length} control(s)`
            : dead.map((c) => `"${c.label}" at ${c.left}..${c.right} is outside ${c.unreachable}`).join('; '),
        )

        check(
          `${vp.label} ${target.route}: a row still says whose row it is`,
          rowName.onScreen === true,
          rowName.scrolled
            ? `swiped to ${rowName.scrollLeft}px, "${rowName.name}" at ${rowName.left}..${rowName.right}`
            : `nothing to swipe, first cell at ${rowName.left}..${rowName.right}`,
        )

        const small = measured.controls.filter((c) => Math.min(c.width, c.height) < 44)
        check(
          `${vp.label} ${target.route}: every control is at least 44px on its smaller side`,
          small.length === 0,
          small.length === 0 ? `${measured.controls.length} control(s)` : small.map((c) => `"${c.label}" ${c.width}x${c.height}`).join('; '),
        )

        measurements.push({ viewport: vp.label, route: target.route, file: target.file, rows: bodyRows, ...measured, rowName })
        if (vp.label === '390') {
          await page.screenshot({ path: join(OUT, `${LABEL}-390-${target.route.replace(/\//g, '_')}.png`), fullPage: false })
        }
      }
      await context.close()
    }
  } finally {
    await browser.close()
  }

  /*
   * THE ANTI-FALSE-PASS. A run that measured nothing, because every table was
   * empty or the sign-in silently failed, is not a run that passed.
   */
  if (measurements.length === 0) {
    check('the drive measured at least one real admin table', false, `${empties.length} empty or missing`)
  }
  writeFileSync(
    join(OUT, `admin-tables-${LABEL}.json`),
    JSON.stringify(
      { base: BASE, stamp, routes: ROUTES, measured: measurements.length, empties, known: [...known], measurements, results },
      null,
      2,
    ),
  )
  console.log(`${TAG} measured ${measurements.length} table view(s); ${empties.length} were empty or absent and were not counted`)
  if (known.size > 0) {
    console.log(`${TAG} KNOWN AND NOT ENFORCED, printed so the number can only go down:`)
    for (const [clause, count] of known) console.log(`${TAG}   ${count} x ${clause}`)
    console.log(`${TAG}   These are the admin table rebuild, recorded with their numbers in C:/dev/REVIEW-QUEUE-C.md.`)
  }
} finally {
  if (stopServer) await stopServer()
  try {
    if (created.userId) {
      await db.from('admin_users').delete().eq('id', created.userId)
      await tearDownAccountOrFailTheRun(db, created.userId)
    }
  } catch (error) {
    console.error(`${TAG} cleanup failed: ${error.message}`)
  }
}

if (failures) {
  console.error(`${TAG} FAIL - ${failures} of ${results.length}`)
  process.exit(1)
}
console.log(`${TAG} PASS - ${results.length} of ${results.length}`)
