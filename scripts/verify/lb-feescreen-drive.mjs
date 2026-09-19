/**
 * DRIVEN PROOF: A LIVE FEE OVERRIDE IS VISIBLE ON THE SCREEN THAT LISTS THEM.
 *
 * ---------------------------------------------------------------------------
 * WHAT IT PROVES, by writing a real override through the one lawful writer and
 * then reading the real screen, signed in at the real /admin/login.
 *
 *   1. before anything is written, the screen says there are no overrides
 *   2. an override written through `write_pricing_rule` appears on the screen,
 *      by target id and by value, at 390, 768 and 1440
 *   3. the screen is accessible at all three viewports
 *   4. the override is removed again and the screen returns to saying none
 *
 * WHY THIS IS THE PROOF THAT MATTERS FOR `readActiveOverrides`. That reducer
 * keeps the FIRST row it sees per target, so a truncated read does not
 * under-count, it makes a target VANISH: a per-organiser or per-event fee that
 * IS being charged, missing from the only screen that lists what overrides the
 * platform default. The screen either shows a live override or it does not, and
 * this presses on exactly that.
 *
 * WHAT IT CANNOT PROVE, stated rather than implied: the 1,000-row ceiling
 * itself. `pricing_rules` holds 79 rows on TEST, so an unbounded read returns
 * all of them and a drive cannot tell the fixed tree from the broken one. The
 * ceiling is proven by `tests/unit/admin/the-fee-screen-reads-every-override.test.ts`,
 * which drives 2,500 override rows through a faked 1,000-row cap, and by the
 * guard drills. Seeding a thousand real pricing rules to strengthen a drive
 * would permanently inflate an append-only money table, which is worse than the
 * gap it would close.
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
 *          --env-file=.env.local scripts/verify/lb-feescreen-drive.mjs \
 *          --out C:/dev/EVIDENCE/LB-FEESCREEN
 *
 * TEST IS LEFT AS FOUND. The override is written against a LANE B organisation,
 * enumerated from the database rather than hardcoded, and its rows are deleted
 * in the teardown. No region default is touched, so AU, the launch fee, is
 * never in play.
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

/** Distinctive enough that finding it on the page cannot be a coincidence. */
const OVERRIDE_PERCENTAGE = 1.23

let exitCode = 0
let browser = null
let admin = null
let org = null

try {
  /*
   * THE TARGET IS ENUMERATED, NEVER GUESSED. A lane B organisation, chosen from
   * the database at run time, so this drive never attaches a fee override to a
   * row belonging to another lane or to a region default.
   */
  const { data: orgs, error: orgError } = await db
    .from('organisations')
    .select('id, name, slug')
    .like('slug', 'lane-b-%')
    .order('created_at', { ascending: true })
    .limit(1)
  if (orgError) throw new Error(`could not enumerate a lane B organisation: ${orgError.message}`)
  org = (orgs ?? [])[0] ?? null
  check(
    'feescreen.setup.a-lane-b-organisation-was-enumerated-not-guessed',
    Boolean(org?.id),
    org ? `${org.slug} (${org.id})` : 'NO lane-b- organisation exists on TEST',
  )
  if (!org) throw new Error('no lane B organisation to attach an override to')

  admin = await createProofAdmin(db, { label: 'Lane B fee screen proof' })
  check('feescreen.setup.a-throwaway-owner-exists', Boolean(admin?.email), admin?.email ?? 'MISSING')

  const { count: existing } = await db
    .from('pricing_rules')
    .select('id', { count: 'exact', head: true })
    .not('organisation_id', 'is', null)
  check(
    'feescreen.setup.no-organisation-override-exists-yet',
    (existing ?? 0) === 0,
    `${existing ?? 0} per-organiser override(s) on TEST before this drive writes one`,
  )

  browser = await chromium.launch({ headless: true })

  // ------------------------------------------------- the screen, before
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    const page = await context.newPage()
    await signInAsOwner(page, BASE, admin)
    const res = await page.goto(`${BASE}/admin/pricing`, { waitUntil: 'networkidle', timeout: 120_000 })
    const text = await page.locator('body').innerText()
    check(
      'feescreen.before.the-screen-says-there-are-no-overrides',
      res?.status() === 200 && /No overrides set/i.test(text),
      `HTTP ${res?.status()}; ${/No overrides set/i.test(text) ? 'the empty state is shown' : 'the empty state is NOT shown'}`,
    )
    await page.screenshot({ path: join(out, 'desktop-1440-1-before.png') })
    await context.close()
  }

  // --------------------------------- write one, through the lawful writer
  const { data: written, error: writeError } = await db.rpc('write_pricing_rule', {
    p_rule_type: 'platform_fee_percentage',
    p_country_code: 'AU',
    p_currency: 'AUD',
    p_organisation_id: org.id,
    p_event_id: null,
    p_value_type: 'percentage',
    p_value_percentage: OVERRIDE_PERCENTAGE,
    p_value_cents: null,
    p_value_integer: null,
    p_created_by: admin.userId ?? null,
  })
  check(
    'feescreen.the-override-was-written-through-the-one-lawful-writer',
    !writeError && Boolean(written),
    writeError ? writeError.message : `write_pricing_rule returned ${JSON.stringify(written)}`,
  )

  // -------------------------------------------------- the screen, after
  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: vp.viewport,
      isMobile: vp.isMobile,
      hasTouch: vp.hasTouch,
      deviceScaleFactor: vp.deviceScaleFactor,
    })
    const page = await context.newPage()

    const signedIn = await signInAsOwner(page, BASE, admin)
    check(`feescreen.${vp.label}.signed-in-at-the-real-admin-login`, signedIn, page.url())

    const res = await page.goto(`${BASE}/admin/pricing`, { waitUntil: 'networkidle', timeout: 120_000 })
    check(`feescreen.${vp.label}.the-fee-screen-answers-200`, res?.status() === 200, `HTTP ${res?.status()}`)

    const text = await page.locator('body').innerText()
    await page.screenshot({ path: join(out, `${vp.label}-2-override-listed.png`), fullPage: false })

    check(
      `feescreen.${vp.label}.the-live-override-is-listed-by-its-target`,
      text.includes(org.id),
      text.includes(org.id)
        ? `the organisation id ${org.id} appears in the overrides table`
        : `the organisation id ${org.id} is NOT on the screen, so a live override is invisible`,
    )
    check(
      `feescreen.${vp.label}.the-override-shows-the-value-that-is-charged`,
      text.includes(String(OVERRIDE_PERCENTAGE)),
      text.includes(String(OVERRIDE_PERCENTAGE))
        ? `${OVERRIDE_PERCENTAGE} is shown beside it`
        : `${OVERRIDE_PERCENTAGE} is NOT shown, so the screen names the target and not the fee`,
    )

    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    const bad = axe.violations.filter(v => v.impact === 'serious' || v.impact === 'critical')
    check(
      `feescreen.${vp.label}.the-fee-screen-has-no-serious-axe-violation`,
      bad.length === 0,
      bad.length === 0
        ? `0 serious or critical of ${axe.violations.length} total violation(s)`
        : bad.map(v => `${v.id} x${v.nodes.length}`).join(', '),
    )

    await context.close()
  }
} catch (err) {
  check('feescreen.the-drive-ran-to-the-end', false, String(err && err.stack ? err.stack.split('\n')[0] : err))
  exitCode = 1
} finally {
  // ---------------------------------------------------------- teardown
  let removedRules = 0
  try {
    if (org) {
      const { count } = await db
        .from('pricing_rules')
        .delete({ count: 'exact' })
        .eq('organisation_id', org.id)
      removedRules = count ?? 0
    }
  } catch (err) {
    console.error(`teardown could not remove the override: ${err}`)
  }

  const { count: leftBehind } = await db
    .from('pricing_rules')
    .select('id', { count: 'exact', head: true })
    .not('organisation_id', 'is', null)

  // The screen must go back to saying there are none.
  if (browser && admin) {
    try {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
      const page = await context.newPage()
      await signInAsOwner(page, BASE, admin)
      await page.goto(`${BASE}/admin/pricing`, { waitUntil: 'networkidle', timeout: 120_000 })
      const text = await page.locator('body').innerText()
      check(
        'feescreen.after.the-screen-returns-to-saying-there-are-none',
        /No overrides set/i.test(text),
        /No overrides set/i.test(text) ? 'the empty state is back' : 'the override is STILL listed after teardown',
      )
      await page.screenshot({ path: join(out, 'desktop-1440-3-after.png') })
      await context.close()
    } catch (err) {
      console.error(`could not re-read the screen after teardown: ${err}`)
    }
  }

  if (browser) await browser.close().catch(() => {})

  let removedAdmin = false
  try {
    if (admin) {
      await removeProofAdmin(db, admin)
      removedAdmin = true
    }
  } catch (err) {
    console.error(`teardown could not remove the owner: ${err}`)
  }

  check(
    'feescreen.teardown.left-as-found',
    removedRules > 0 && (leftBehind ?? 0) === 0 && removedAdmin,
    `removed ${removedRules} pricing_rules row(s) for the lane B organisation and the throwaway owner; ` +
      `${leftBehind ?? 0} per-organiser override(s) remain on TEST. No region default was touched, so AU is untouched`,
  )

  const passed = checks.filter(c => c.ok).length
  writeFileSync(join(out, 'drive.json'), JSON.stringify({ base: BASE, passed, total: checks.length, checks }, null, 2))
  console.log('')
  console.log(`${passed} of ${checks.length} checks passed`)
  if (failures.length > 0) {
    for (const f of failures) console.log(`  FAILED  ${f}`)
    exitCode = 1
  } else {
    console.log('PASS - a live fee override is visible on the screen that lists them, at every viewport.')
  }
  process.exit(exitCode)
}
