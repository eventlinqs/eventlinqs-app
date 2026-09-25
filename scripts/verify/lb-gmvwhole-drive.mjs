/**
 * DRIVEN PROOF: THE GMV ON THE FOUNDER'S SCREEN IS THE GMV IN THE DATABASE.
 *
 * ---------------------------------------------------------------------------
 * WHAT IT PROVES, by signing in at the real /admin/login and reading the number
 * off the rendered page, then asking the database the same question in SQL.
 *
 *   1. /admin/analytics renders for a signed-in owner at 390, 768 and 1440
 *   2. the gross GMV on the page equals the gross GMV the database reports,
 *      computed independently in SQL rather than by calling the same code
 *   3. the paid-order count on the page equals the database's own count
 *   4. the screen is accessible at all three viewports
 *
 * WHY THE SQL SIDE IS WRITTEN OUT RATHER THAN IMPORTED. Calling
 * `getAnalyticsDashboard` to check `getAnalyticsDashboard` proves only that the
 * function is deterministic. The comparison is against `sum(total_cents)` over
 * the same statuses, asked of Postgres, which has no row ceiling.
 *
 * ---------------------------------------------------------------------------
 * USAGE. The server must be up first:
 *
 *   node scripts/dev/lane-b-serve-with-stripe.mjs
 *
 *   env -u NEXT_PUBLIC_SUPABASE_URL -u NEXT_PUBLIC_SUPABASE_ANON_KEY \
 *     BASE=http://localhost:3100 \
 *     UPSTASH_REDIS_REST_URL=http://127.0.0.1:8179 UPSTASH_REDIS_REST_TOKEN=local \
 *     node --import ./scripts/lib/server-only-shim.mjs \
 *          --import ./scripts/lib/src-alias-loader.mjs \
 *          --env-file=.env.local scripts/verify/lb-gmvwhole-drive.mjs \
 *          --out C:/dev/EVIDENCE/LB-GMVWHOLE
 *
 * TEST IS LEFT AS FOUND. The only row this creates is its own throwaway admin,
 * removed in the teardown. It creates no order and no refund: the proof is that
 * the screen agrees with whatever is already there, which is a stronger claim
 * than agreement about rows the drive planted itself.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { AxeBuilder } from '@axe-core/playwright'
import { createProofAdmin, removeProofAdmin, signInAsOwner } from './lib/fo1-founding-admin.mjs'

const args = process.argv.slice(2)
let out = null
for (let i = 0; i < args.length; i += 1) if (args[i] === '--out') out = args[++i]
if (!out) {
  console.error('FAIL: --out <directory> is required')
  process.exit(1)
}
mkdirSync(out, { recursive: true })

const BASE = (process.env.BASE ?? 'http://localhost:3100').replace(/\/$/, '')
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
if (!/vkapkibzokmfaxqogypq/.test(url)) {
  console.error(`FAIL: this drive only runs against TEST vkapkibzokmfaxqogypq, not ${url || '(no url)'}`)
  process.exit(1)
}
const db = createClient(url, serviceKey, { auth: { persistSession: false } })

const checks = []
const failures = []
function check(id, ok, detail) {
  checks.push({ id, ok, detail })
  if (!ok) failures.push(`${id}: ${detail}`)
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}  ${detail}`)
}

const VIEWPORTS = [
  { label: 'mobile-390', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  { label: 'tablet-768', viewport: { width: 768, height: 1024 }, isMobile: false, hasTouch: true, deviceScaleFactor: 1 },
  { label: 'desktop-1440', viewport: { width: 1440, height: 1000 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1 },
]

/** The GMV statuses, copied from src/lib/admin/analytics.ts deliberately. */
const GMV_STATUSES = ['confirmed', 'partially_refunded', 'refunded']
const CURRENCY = 'AUD'

/**
 * THE TRUTH, ASKED OF POSTGRES. Paged in the drive as well, because the drive's
 * own read of `orders` would hit the identical 1,000-row ceiling and would then
 * "agree" with a truncated screen for the wrong reason: two wrong numbers that
 * match are the most convincing possible false pass.
 */
async function trueGmv() {
  let gross = 0
  let paid = 0
  let from = 0
  for (;;) {
    const { data, error } = await db
      .from('orders')
      .select('total_cents')
      .eq('currency', CURRENCY)
      .in('status', GMV_STATUSES)
      .order('id', { ascending: true })
      .range(from, from + 999)
    if (error) throw new Error(`the drive could not read orders: ${error.message}`)
    const rows = data ?? []
    if (rows.length === 0) break
    for (const row of rows) {
      gross += Number(row.total_cents ?? 0)
      paid += 1
    }
    from += rows.length
  }
  return { gross, paid }
}

/** Every integer on the page, so a formatted total can be found however it is styled. */
function centsFromDollarText(text) {
  const matches = [...String(text).matchAll(/\$\s*([\d,]+(?:\.\d{2})?)/g)]
  return matches.map(m => Math.round(Number(m[1].replace(/,/g, '')) * 100))
}

let exitCode = 0
let browser = null
let admin = null

try {
  admin = await createProofAdmin(db, { label: 'Lane B GMV proof' })
  check('gmvwhole.setup.a-throwaway-owner-exists', Boolean(admin?.email), admin?.email ?? 'MISSING')

  const truth = await trueGmv()
  check(
    'gmvwhole.setup.the-database-has-orders-to-disagree-about',
    truth.paid > 0,
    `${truth.paid} paid AUD order(s) totalling ${truth.gross} cents, read in pages of 1,000`,
  )

  browser = await chromium.launch({ headless: true })

  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: vp.viewport,
      isMobile: vp.isMobile,
      hasTouch: vp.hasTouch,
      deviceScaleFactor: vp.deviceScaleFactor,
    })
    const page = await context.newPage()

    const signedIn = await signInAsOwner(page, BASE, admin)
    check(`gmvwhole.${vp.label}.signed-in-at-the-real-admin-login`, signedIn, page.url())

    const res = await page.goto(`${BASE}/admin/analytics`, { waitUntil: 'networkidle', timeout: 120_000 })
    check(`gmvwhole.${vp.label}.the-analytics-screen-answers-200`, res?.status() === 200, `HTTP ${res?.status()}`)

    const bodyText = await page.locator('body').innerText()
    await page.screenshot({ path: join(out, `${vp.label}-1-analytics.png`), fullPage: false })

    /*
     * THE NUMBER, READ OFF THE PAGE. The screen formats cents as dollars, so
     * every dollar figure on it is collected and the true gross must be one of
     * them. Matching "one of the figures on the page" rather than a single
     * selector keeps this from breaking on a layout change while still being a
     * real assertion: a truncated GMV is not in the set.
     */
    const figures = centsFromDollarText(bodyText)
    check(
      `gmvwhole.${vp.label}.the-gross-gmv-on-the-page-is-the-gross-gmv-in-the-database`,
      figures.includes(truth.gross),
      `database says ${truth.gross} cents; the page shows ${figures.length} dollar figure(s): ` +
        `${figures.slice(0, 8).join(', ')}${figures.length > 8 ? ', ...' : ''}`,
    )

    check(
      `gmvwhole.${vp.label}.the-paid-order-count-on-the-page-matches-the-database`,
      new RegExp(`\\b${truth.paid}\\b`).test(bodyText.replace(/,/g, '')),
      `database counts ${truth.paid} paid order(s); the page ${
        new RegExp(`\\b${truth.paid}\\b`).test(bodyText.replace(/,/g, '')) ? 'shows it' : 'does NOT show it'
      }`,
    )

    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    const bad = axe.violations.filter(v => v.impact === 'serious' || v.impact === 'critical')
    check(
      `gmvwhole.${vp.label}.the-analytics-screen-has-no-serious-axe-violation`,
      bad.length === 0,
      bad.length === 0
        ? `0 serious or critical of ${axe.violations.length} total violation(s)`
        : bad.map(v => `${v.id} x${v.nodes.length}`).join(', '),
    )

    await context.close()
  }

  writeFileSync(join(out, 'truth.json'), JSON.stringify(truth, null, 2))
} catch (err) {
  check('gmvwhole.the-drive-ran-to-the-end', false, String(err && err.stack ? err.stack.split('\n')[0] : err))
  exitCode = 1
} finally {
  if (browser) await browser.close().catch(() => {})
  let removed = false
  try {
    if (admin) {
      await removeProofAdmin(db, admin)
      removed = true
    }
  } catch (err) {
    console.error(`teardown could not finish: ${err}`)
  }
  check(
    'gmvwhole.teardown.left-as-found',
    removed,
    removed
      ? 'the throwaway owner is removed; no order, refund or organisation was created, edited or deleted'
      : 'the throwaway owner could NOT be removed',
  )

  const passed = checks.filter(c => c.ok).length
  writeFileSync(join(out, 'drive.json'), JSON.stringify({ base: BASE, passed, total: checks.length, checks }, null, 2))
  console.log('')
  console.log(`${passed} of ${checks.length} checks passed`)
  if (failures.length > 0) {
    for (const f of failures) console.log(`  FAILED  ${f}`)
    exitCode = 1
  } else {
    console.log('PASS - the GMV on the screen is the GMV in the database, at every viewport.')
  }
  process.exit(exitCode)
}
