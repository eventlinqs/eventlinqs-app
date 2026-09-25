/**
 * DRIVEN PROOF: THE AUDIT LOG RECORDS WHAT THE FOUNDER DID, AND THE SCREEN
 * SHOWS IT.
 *
 * ---------------------------------------------------------------------------
 * WHAT IT PROVES, by taking real admin actions in a real browser and then
 * asking the database and the screen, never the code.
 *
 *   1. a throwaway owner starts with NO audit entries at all
 *   2. signing in and opening the demand signal writes real entries, with the
 *      actor's own address on them
 *   3. those entries are on /admin/audit, by action and by actor, at 390, 768
 *      and 1440
 *   4. the screen is accessible at every width, at every impact level
 *   5. the entries are removed again and the actor is back to none
 *
 * WHAT IT CANNOT PROVE, stated rather than implied: the half of this item that
 * matters most, a write that FAILS being reported. A refusal cannot be induced
 * through a browser without breaking the table for the other two lanes, so it
 * is proven by `tests/unit/admin/the-audit-log-says-when-it-could-not-write.test.ts`,
 * which drives a refused insert, a thrown `headers()`, and production
 * specifically, and by the five guard drills.
 *
 * THE REMOVABILITY WAS CHECKED BEFORE ANYTHING WAS WRITTEN, which is the rule
 * the LB-RECOVERYWHOLE drive learned the expensive way: one probe row into
 * `audit_log`, deleted again, before this drive existed. That table takes a row
 * back; `recovery_sends` does not.
 *
 * USAGE. The server must be up first:
 *
 *   node scripts/dev/lane-b-serve-with-stripe.mjs
 *
 *   env -u NEXT_PUBLIC_SUPABASE_URL -u NEXT_PUBLIC_SUPABASE_ANON_KEY \
 *     BASE=http://localhost:3100 \
 *     node --env-file=.env.local scripts/verify/lb-auditloud-drive.mjs \
 *       --out C:/dev/EVIDENCE/LB-AUDITLOUD
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

/** The action the demand signal records on every view. */
const ACTION = 'admin.network.view'

/** Every audit entry this actor has, asked for by the drive itself, paged. */
async function entriesFor(email) {
  const rows = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from('audit_log')
      .select('id, action, actor_email_snapshot, ip')
      .eq('actor_email_snapshot', email)
      .order('id', { ascending: true })
      .range(from, from + 999)
    if (error) throw new Error(`the drive could not read audit_log: ${error.message}`)
    if (!data || data.length === 0) return rows
    rows.push(...data)
  }
}

let exitCode = 0
let browser = null
let admin = null

try {
  admin = await createProofAdmin(db, { label: 'Lane B audit proof' })
  check('auditloud.setup.a-throwaway-owner-exists', Boolean(admin?.email), admin?.email ?? 'MISSING')

  const before = await entriesFor(admin.email)
  check(
    'auditloud.before.the-new-owner-has-no-audit-entries',
    before.length === 0,
    `${before.length} entr(ies) for ${admin.email} before they have done anything`,
  )

  browser = await chromium.launch({ headless: true })

  for (const vp of VIEWPORTS) {
    const context = await browser.newContext(vp)
    const page = await context.newPage()

    const signedIn = await signInAsOwner(page, BASE, admin)
    check(`auditloud.${vp.label}.signed-in-at-the-real-admin-login`, signedIn, page.url())

    // A real admin action: opening the demand signal records admin.network.view.
    const res = await page.goto(`${BASE}/admin/network`, { waitUntil: 'networkidle', timeout: 180_000 })
    check(`auditloud.${vp.label}.the-action-was-taken`, res?.status() === 200, `HTTP ${res?.status()} on /admin/network`)

    const written = await entriesFor(admin.email)
    const views = written.filter(r => r.action === ACTION)
    check(
      `auditloud.${vp.label}.the-action-is-in-the-database-with-the-actor-on-it`,
      views.length > 0 && views.every(r => r.actor_email_snapshot === admin.email),
      `${views.length} ${ACTION} entr(ies) for ${admin.email}, of ${written.length} total`,
    )

    // ------------------------------------------------------- the audit screen
    const auditRes = await page.goto(`${BASE}/admin/audit`, { waitUntil: 'networkidle', timeout: 180_000 })
    check(`auditloud.${vp.label}.the-audit-screen-answers-200`, auditRes?.status() === 200, `HTTP ${auditRes?.status()}`)
    await page.screenshot({ path: join(out, `${vp.label}-audit.png`), fullPage: true })

    const text = await page.locator('body').innerText()
    check(
      `auditloud.${vp.label}.the-entry-is-on-the-screen-by-action-and-by-actor`,
      text.includes(ACTION) && text.includes(admin.email),
      text.includes(ACTION)
        ? `"${ACTION}" and ${admin.email} are both on the screen`
        : `"${ACTION}" is NOT on the audit screen, so an action that was recorded cannot be read back`,
    )

    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    check(
      `auditloud.${vp.label}.no-axe-violation-at-any-impact-level`,
      axe.violations.length === 0,
      axe.violations.length === 0
        ? '0 violations at any impact level'
        : axe.violations.map(v => `${v.impact}: ${v.id} x${v.nodes.length}`).join(' | '),
    )

    await context.close()
  }
} catch (err) {
  check('auditloud.the-drive-ran-to-the-end', false, String(err && err.stack ? err.stack.split('\n')[0] : err))
  exitCode = 1
} finally {
  if (browser) await browser.close().catch(() => {})

  let removedEntries = 0
  try {
    if (admin?.email) {
      const { count, error } = await db
        .from('audit_log')
        .delete({ count: 'exact' })
        .eq('actor_email_snapshot', admin.email)
      if (error) console.error(`teardown could not remove the audit entries: ${error.message}`)
      removedEntries = count ?? 0
    }
  } catch (err) {
    console.error(`teardown threw: ${err}`)
  }

  let removedAdmin = false
  try {
    if (admin) {
      await removeProofAdmin(db, admin)
      removedAdmin = true
    }
  } catch (err) {
    console.error(`teardown could not remove the throwaway owner: ${err}`)
  }

  const left = admin?.email ? await entriesFor(admin.email).catch(() => []) : []
  check(
    'auditloud.teardown.test-is-left-as-found-observed-not-claimed',
    left.length === 0 && removedAdmin,
    `removed ${removedEntries} audit entr(ies); ${left.length} remain; throwaway owner removed: ${removedAdmin}`,
  )

  const passed = checks.filter(c => c.ok).length
  console.log(`\n${passed} of ${checks.length} checks passed`)
  for (const f of failures) console.log(`  FAILED: ${f}`)
  writeFileSync(
    join(out, 'auditloud-report.json'),
    JSON.stringify({ base: BASE, actor: admin?.email ?? null, passed, total: checks.length, checks }, null, 2),
  )
  process.exit(failures.length > 0 ? 1 : exitCode)
}
