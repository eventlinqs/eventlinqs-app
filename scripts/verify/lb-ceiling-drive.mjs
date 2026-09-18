/**
 * THE AUDIENCE SCREEN IS DRIVEN AND ITS NUMBERS ARE COMPARED WITH THE LEDGER.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS DRIVE EXISTS RATHER THAN A UNIT TEST.
 *
 * On 19 September 2026 `/admin/audience` was reporting, on the real TEST
 * database and with no error anywhere:
 *
 *                       screen      ledger
 *     people asked         997       9,364
 *     withdrawn              1          53
 *     declined               0         102
 *     opt-in rate         100%       98.9%
 *
 * The cause was a Supabase project returning at most 1,000 rows per response
 * ("By default, Supabase projects return a maximum of 1,000 rows",
 * https://supabase.com/docs/reference/javascript/select, fetched 2026-09-19),
 * truncating with HTTP 200 and no error, on a read that was ordered OLDEST
 * FIRST, so the rows removed were the decisions.
 *
 * NO UNIT TEST COULD HAVE SEEN IT. Every mock returns what it was asked for;
 * the defect was that the SERVER did not. And the drive that already covers
 * this screen could not see it either, because the one number it checked
 * (`audience_members`, one row) was under the ceiling. So this drive compares
 * the four numbers that come out of the ledger, against a total computed by
 * PAGING that ledger to the end.
 *
 * THE COMPARISON IS THE POINT. A drive that read the screen and asserted "some
 * number is shown" would have passed on the broken build. This one recomputes
 * the answer independently and asserts equality, which is the only form of this
 * check that could ever have gone red.
 *
 *   node --env-file=.env.local scripts/verify/lb-ceiling-drive.mjs
 *
 * Needs: a server on BASE (default http://localhost:3100, lane B's port), and a
 * service-role key for the TEST project. Refuses to run against anything else.
 */
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { answerTheCookieBanner } from './lib/cookie-banner.mjs'
import { assertNotProduction } from '../lib/production-write-preflight.mjs'

/*
 * THE PLATFORM'S OWN REFUSAL, FIRST, BEFORE ANYTHING ELSE RUNS.
 *
 * This drive creates and deletes an admin user, and three lanes share one
 * machine whose shell carries the PRODUCTION Supabase URL. A hand-rolled ref
 * check was written here first and it worked, but `no-unguarded-production-write`
 * was right to refuse it: a refusal the platform cannot recognise is a refusal
 * nobody can audit, and the shared preflight also covers the case this one
 * could not, which is a target it cannot resolve at all.
 */
assertNotProduction()

const BASE = (process.env.BASE || 'http://localhost:3100').replace(/\/$/, '')
const OUT = process.env.OUT || resolve('C:/dev/EVIDENCE/LB-CEILING')
const TEST_PROJECT_REF = 'vkapkibzokmfaxqogypq'

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('REFUSED: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are needed; run with --env-file=.env.local')
  process.exit(2)
}
/*
 * THE REFUSAL IS FIRST AND IT NAMES THE PROJECT. This drive creates and deletes
 * an admin user, and three lanes share one machine whose shell carries the
 * PRODUCTION Supabase URL. Nothing below runs until the ref is the TEST one.
 */
const ref = new URL(url).hostname.split('.')[0]
if (ref !== TEST_PROJECT_REF) {
  console.error(`REFUSED: this drive writes rows and will only ever run against TEST (${TEST_PROJECT_REF}); this shell points at ${ref}`)
  process.exit(2)
}

mkdirSync(OUT, { recursive: true })
const db = createClient(url, key)

const VIEWPORTS = [
  { label: 'mobile-390', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  { label: 'tablet-768', viewport: { width: 768, height: 1024 }, isMobile: false, hasTouch: true, deviceScaleFactor: 1 },
  { label: 'desktop-1440', viewport: { width: 1440, height: 1000 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1 },
]

const LANE = `lane-b-ceiling-${Date.now().toString(36)}`
const adminEmail = `${LANE}-admin@eventlinqs.test`
const adminPassword = `${randomUUID()}Aa1`
let adminId = null

const checks = []
const check = (id, ok, detail) => {
  checks.push({ id, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}  ${detail}`)
}

/**
 * THE TRUTH, COMPUTED THE LONG WAY ROUND.
 *
 * Deliberately NOT by importing the application's own reader: a drive that
 * asks the code under test what the answer is cannot catch the code under test
 * being wrong. This pages the ledger with an explicit range, oldest first, and
 * applies the same stated rule ("the latest event per address wins") by hand.
 */
async function ledgerTruth() {
  const rows = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from('consent_events')
      .select('subject_email, decision, occurred_at')
      .order('occurred_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + 999)
    if (error) throw new Error(`could not page the ledger: ${error.message}`)
    rows.push(...data)
    if (data.length === 0) break
  }

  const latest = new Map()
  for (const r of rows) latest.set(r.subject_email, r.decision)
  const states = [...latest.values()]
  const granted = states.filter(d => d === 'granted').length
  const withdrawn = states.filter(d => d === 'withdrawn').length
  const declined = states.filter(d => d === 'declined').length
  const asked = granted + withdrawn + declined
  const { count: members } = await db.from('audience_members').select('id', { count: 'exact', head: true })

  return {
    rowsInLedger: rows.length,
    granted,
    withdrawn,
    declined,
    asked,
    optInPercent: asked === 0 ? null : Math.round(((granted + withdrawn) / asked) * 1000) / 10,
    members: members ?? 0,
  }
}

/** Read the four ledger-derived figures off the rendered screen. */
async function readScreen(page) {
  return page.evaluate(() => {
    const out = { granted: null, withdrawn: null, declined: null, optInRate: null, inAudience: null }
    for (const dt of document.querySelectorAll('dt')) {
      const label = dt.textContent?.trim()
      const value = dt.parentElement?.querySelector('dd')?.textContent?.trim()
      if (!value) continue
      if (label === 'Granted') out.granted = Number(value)
      if (label === 'Withdrawn') out.withdrawn = Number(value)
      if (label === 'Declined') out.declined = Number(value)
    }
    for (const p of document.querySelectorAll('p')) {
      const label = p.textContent?.trim()
      /*
       * THE TILE, NOT THE ROW THE LABEL SITS IN. AdminStatTile wraps its label
       * in a flex row beside the status dot, so `parentElement` is that row and
       * its text is the label alone. The first run of this drive read null for
       * both tiles and the screenshot showed 98.9% on the screen: the harness
       * was wrong, not the page.
       */
      const tile = p.closest('div.rounded-xl')
      if (!tile) continue
      const text = tile.textContent ?? ''
      if (label === 'Opt-in rate') {
        const m = text.match(/(\d+(?:\.\d+)?)%/)
        out.optInRate = m ? Number(m[1]) : null
      }
      if (label === 'In the audience') {
        const m = text.replace('In the audience', '').match(/\d+/)
        out.inAudience = m ? Number(m[0]) : null
      }
    }
    return out
  })
}

async function setup() {
  const created = await db.auth.admin.createUser({ email: adminEmail, password: adminPassword, email_confirm: true })
  if (created.error) throw new Error(`create admin: ${created.error.message}`)
  adminId = created.data.user.id
  await db.from('profiles').upsert({ id: adminId, email: adminEmail, full_name: 'Lane B ceiling drive' })
  const staff = await db.from('admin_users').insert({ id: adminId, role: 'super_admin', display_name: 'Lane B ceiling drive' })
  if (staff.error) throw new Error(`admin_users insert: ${staff.error.message}`)
  console.log(`fixture: admin ${adminEmail} created`)
}

async function teardown() {
  if (!adminId) return
  await db.from('admin_users').delete().eq('id', adminId)
  await db.auth.admin.deleteUser(adminId).catch(() => {})
  console.log(`fixture: admin ${adminEmail} deleted`)
}

const browser = await chromium.launch({ headless: true })
let truth = null
try {
  await setup()
  truth = await ledgerTruth()
  console.log(
    `the ledger, paged to the end: ${truth.rowsInLedger} rows, ${truth.asked} people asked, ` +
      `${truth.granted} granted, ${truth.withdrawn} withdrawn, ${truth.declined} declined, ${truth.optInPercent}%`,
  )
  check(
    'the ledger is larger than one response',
    truth.rowsInLedger > 1000,
    `${truth.rowsInLedger} rows, and a single Supabase response returns at most 1,000. Below that this drive cannot tell a fixed screen from a broken one.`,
  )

  for (const vp of VIEWPORTS) {
    const context = await browser.newContext(vp)
    const page = await context.newPage()
    try {
      await page.goto(`${BASE}/admin/login`, { waitUntil: 'domcontentloaded', timeout: 120000 })
      await page.waitForTimeout(1200)
      await answerTheCookieBanner(page)
      await page.locator('input[name="email"]').fill(adminEmail)
      await page.locator('input[name="password"]').fill(adminPassword)
      await Promise.all([
        page.waitForURL(u => !u.pathname.endsWith('/admin/login'), { timeout: 60000 }).catch(() => {}),
        page.locator('button[type="submit"]').first().click(),
      ])
      await page.waitForTimeout(2500)

      await page.goto(`${BASE}/admin/audience`, { waitUntil: 'domcontentloaded', timeout: 120000 })
      await page.waitForTimeout(2500)
      await answerTheCookieBanner(page)

      const shown = await readScreen(page)
      await page.screenshot({ path: resolve(OUT, `audience-${vp.label}.png`), fullPage: true })

      check(
        `${vp.label}.the screen reached the audience page`,
        shown.granted !== null,
        `granted tile ${shown.granted === null ? 'was not found; the page may not have rendered' : 'read'}`,
      )
      check(
        `${vp.label}.granted equals the ledger`,
        shown.granted === truth.granted,
        `screen ${shown.granted}, ledger ${truth.granted}`,
      )
      check(
        `${vp.label}.withdrawn equals the ledger`,
        shown.withdrawn === truth.withdrawn,
        `screen ${shown.withdrawn}, ledger ${truth.withdrawn}`,
      )
      check(
        `${vp.label}.declined equals the ledger`,
        shown.declined === truth.declined,
        `screen ${shown.declined}, ledger ${truth.declined}`,
      )
      check(
        `${vp.label}.the opt-in rate equals the ledger`,
        shown.optInRate === truth.optInPercent,
        `screen ${shown.optInRate}%, ledger ${truth.optInPercent}%`,
      )
      check(
        `${vp.label}.the audience total equals a direct count`,
        shown.inAudience === truth.members,
        `screen ${shown.inAudience}, a direct count ${truth.members}`,
      )

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)
      check(`${vp.label}.no sideways scroll`, !overflow, overflow ? 'the surface overflows sideways' : 'no horizontal overflow')
    } finally {
      await context.close()
    }
  }
} finally {
  await browser.close()
  await teardown()
}

const failed = checks.filter(c => !c.ok)
writeFileSync(
  resolve(OUT, 'report.json'),
  JSON.stringify({ base: BASE, ranAt: new Date().toISOString(), truth, checks }, null, 2),
  'utf8',
)
console.log(`\n${checks.length - failed.length} of ${checks.length} checks passed`)
if (failed.length) {
  console.log('\nFAILED:')
  for (const f of failed) console.log(`  ${f.id}: ${f.detail}`)
  process.exit(1)
}
