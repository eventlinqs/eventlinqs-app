/**
 * DRIVEN PROOF: EVERY ADMIN SEARCH BOX ANSWERS A NAME WITH A COMMA IN IT.
 *
 * ============================================================================
 * THE DEFECT, MEASURED BEFORE ANYTHING WAS CHANGED
 * ============================================================================
 *
 * Inside a PostgREST `or(...)` the characters `,` `.` `(` `)` are GRAMMAR. Four
 * admin reads dropped the typed term into a template literal, so a term with a
 * comma was parsed as MORE CLAUSES. Against TEST:
 *
 *     .or(`title.ilike.%Night, Geelong%,slug.ilike.%Night, Geelong%`)
 *       -> PGRST100 failed to parse logic tree
 *
 * THE TWO OUTCOMES ARE DIFFERENT AND THIS DRIVE ASSERTS BOTH SHAPES:
 *
 *   /admin/events, /admin/organisers and /admin/users read through functions
 *   that end `if (error) throw error`. The document answered 500 and the
 *   operator saw a crashed screen.
 *
 *   /admin/search reads `res.data ?? []`. The document answered 200 and said
 *   "Nothing matched", which is WORSE, because it looks like an answer.
 *
 * So a 200 alone is not the proof. Each screen is judged on the ROW BEING
 * THERE, by name, and the topbar search is additionally judged on not saying
 * "Nothing matched" about a row that exists.
 *
 * ============================================================================
 * HOW IT SIGNS IN, AND WHAT IT DOES NOT BYPASS
 * ============================================================================
 *
 * The admin signs in through the REAL /admin/login flow. The fixture admin is
 * created without a TOTP secret, which is the product's own documented
 * first-login bootstrap (src/app/admin/actions.ts signs in an un-enrolled admin
 * and sends them to enrolment; issueTwoFactorProof still runs). No gate is
 * bypassed and no code is modified. The account is deleted afterwards, in a
 * `finally`, and the removal is OBSERVED rather than assumed.
 *
 * The three rows it searches for are lane C's own, seeded by
 * scripts/ops/seed-admin-search-comma-fixture.mjs, which publishes nothing.
 *
 * Usage (the shell must not carry the production Supabase URL):
 *   BASE=http://localhost:3200 node --env-file=.env.local \
 *     scripts/verify/admin-search-comma-drive.mjs --out C:/dev/EVIDENCE/OR-FILTER
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { chromium } from 'playwright'
import { AxeBuilder } from '@axe-core/playwright'

const args = process.argv.slice(2)
let out = 'C:/dev/EVIDENCE/OR-FILTER'
let label = 'green'
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === '--out') out = args[++i]
  if (args[i] === '--label') label = args[++i]
}
out = join(out, `drive-${label}`)
mkdirSync(out, { recursive: true })

const BASE = (process.env.BASE ?? 'http://localhost:3200').replace(/\/$/, '')
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
if (/gndnldyfudbytbboxesk/.test(SUPABASE_URL)) {
  console.error('refusing to run against production')
  process.exit(1)
}
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('FAIL: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
  process.exit(1)
}
const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

const VIEWPORTS = [
  { label: '390', width: 390, height: 844 },
  { label: '768', width: 768, height: 1024 },
  { label: '1440', width: 1440, height: 1000 },
]

/**
 * The four screens, the term a person types, and the row that must come back.
 * Every path and every column is taken from the source, never guessed: the
 * readers are listEvents, listOrganisations, listProfiles and globalAdminSearch.
 */
const SCREENS = [
  {
    id: 'events',
    path: '/admin/events',
    term: 'Night, Geelong',
    expect: 'Lane C Launch Night, Geelong',
    emptyCopy: 'No events match.',
    crashes: true,
  },
  {
    id: 'organisers',
    path: '/admin/organisers',
    term: 'Rock, Paper',
    expect: 'Lane C Rock, Paper',
    emptyCopy: 'No organisers match.',
    crashes: true,
  },
  {
    id: 'users',
    path: '/admin/users',
    term: 'Smith, John',
    expect: 'Lane-C Smith, John',
    emptyCopy: 'No users match.',
    crashes: true,
  },
  {
    id: 'search',
    path: '/admin/search',
    term: 'Night, Geelong',
    expect: 'Lane C Launch Night, Geelong',
    emptyCopy: 'Nothing matched',
    crashes: false,
  },
]

/** A term no row on TEST can match, to prove the empty state is a state. */
const NOTHING_TERM = 'zzz-lane-c-matches-nothing, ever'

const checks = []
const failures = []
function check(id, ok, detail) {
  checks.push({ id, ok, detail })
  if (!ok) failures.push(`${id}: ${detail}`)
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${id}  ${detail}`)
}

const adminEmail = `lane-c-orfilter-admin-${Date.now().toString(36)}@eventlinqs.test`
const adminPassword = `${randomUUID()}Aa1`
let adminUserId = null
let browser = null

try {
  const created = await db.auth.admin.createUser({
    email: adminEmail,
    password: adminPassword,
    email_confirm: true,
  })
  if (created.error) throw new Error(`create admin auth user: ${created.error.message}`)
  adminUserId = created.data.user.id
  await db.from('profiles').upsert({
    id: adminUserId,
    email: adminEmail,
    full_name: 'Lane C or-filter drive',
    display_name: 'Lane C or-filter drive',
    is_verified: true,
  })
  const { error: auErr } = await db
    .from('admin_users')
    .insert({ id: adminUserId, role: 'super_admin', display_name: 'Lane C or-filter drive' })
  if (auErr) throw new Error(`admin_users insert: ${auErr.message}`)

  browser = await chromium.launch()
  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      locale: 'en-AU',
      isMobile: vp.width < 768,
      hasTouch: vp.width < 1024,
    })
    const page = await ctx.newPage()
    page.on('pageerror', e => console.log(`    pageerror ${String(e).slice(0, 160)}`))

    await page.goto(`${BASE}/admin/login`, { waitUntil: 'domcontentloaded', timeout: 180000 })
    await page.locator('input[name="email"]').fill(adminEmail)
    await page.locator('input[name="password"]').fill(adminPassword)
    const submit = page.locator('button[type="submit"]')
    await submit.waitFor({ state: 'visible', timeout: 60000 })
    // The submit is disabled until hydration, deliberately, so no native GET can
    // ever carry the password. Wait for that rather than racing it.
    await page.waitForFunction(
      () => !document.querySelector('button[type="submit"]')?.disabled,
      undefined,
      { timeout: 60000 },
    )
    await submit.click()
    await Promise.race([
      page.waitForURL(u => !u.pathname.endsWith('/admin/login'), { timeout: 120000 }).catch(() => {}),
      page
        .waitForFunction(
          () =>
            [...document.querySelectorAll('[role=alert]')].some(
              e => (e.textContent ?? '').trim().length > 0,
            ),
          undefined,
          { timeout: 120000 },
        )
        .catch(() => {}),
    ])
    if (new URL(page.url()).pathname.endsWith('/admin/login')) {
      const shown = await page.locator('[role=alert]').allInnerTexts().catch(() => [])
      await page.screenshot({ path: join(out, `login-refused-${vp.label}.png`), fullPage: true })
      check(`${vp.label}.login`, false, `admin sign-in refused: ${shown.join(' // ') || 'NOTHING SHOWN'}`)
      await ctx.close()
      continue
    }
    check(`${vp.label}.login`, true, 'signed in through the real /admin/login form')

    for (const screen of SCREENS) {
      const url = `${BASE}${screen.path}?q=${encodeURIComponent(screen.term)}`
      const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 180000 })
      const status = response?.status() ?? 0
      await page.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => {})

      /*
       * THE STATUS IS THE FIRST CHECK BECAUSE IT IS THE SHAPE THE DEFECT TOOK
       * on three of the four screens: a thrown PGRST100 in a Server Component
       * is a 500 document, not an empty table.
       */
      check(
        `${vp.label}.${screen.id}.status`,
        status === 200,
        `${screen.path}?q=${screen.term} answered ${status}`,
      )

      const body = (await page.locator('body').innerText().catch(() => '')) || ''
      check(
        `${vp.label}.${screen.id}.row`,
        body.includes(screen.expect),
        body.includes(screen.expect)
          ? `the screen lists ${JSON.stringify(screen.expect)}`
          : `the screen does NOT list ${JSON.stringify(screen.expect)}; it showed ${JSON.stringify(body.slice(0, 200))}`,
      )
      check(
        `${vp.label}.${screen.id}.not-empty-state`,
        !body.includes(screen.emptyCopy),
        !body.includes(screen.emptyCopy)
          ? `it does not claim ${JSON.stringify(screen.emptyCopy)} about a row that exists`
          : `it claims ${JSON.stringify(screen.emptyCopy)} about a row that exists`,
      )
      await page.screenshot({
        path: join(out, `${screen.id}-${vp.label}.png`),
        fullPage: true,
      })

      /*
       * THE CONTROL. A comma search that genuinely matches nothing must reach
       * the DESIGNED empty state, not an error and not a blank. Without this the
       * drive would pass on a screen that answered 200 with nothing on it.
       */
      const emptyUrl = `${BASE}${screen.path}?q=${encodeURIComponent(NOTHING_TERM)}`
      const emptyResponse = await page.goto(emptyUrl, { waitUntil: 'domcontentloaded', timeout: 180000 })
      const emptyStatus = emptyResponse?.status() ?? 0
      const emptyBody = (await page.locator('body').innerText().catch(() => '')) || ''
      check(
        `${vp.label}.${screen.id}.control`,
        emptyStatus === 200 && emptyBody.includes(screen.emptyCopy),
        `a term matching nothing answered ${emptyStatus} and showed ${
          emptyBody.includes(screen.emptyCopy) ? 'the designed empty state' : 'NEITHER the empty state nor a row'
        }`,
      )
      if (vp.label === '390') {
        await page.screenshot({ path: join(out, `${screen.id}-empty-390.png`), fullPage: true })
      }
    }

    /* Accessibility on the screen the operator spends the most time on. */
    await page.goto(`${BASE}/admin/users?q=${encodeURIComponent('Smith, John')}`, {
      waitUntil: 'domcontentloaded',
      timeout: 180000,
    })
    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
    const serious = axe.violations.filter(v => v.impact === 'serious' || v.impact === 'critical')
    check(
      `${vp.label}.axe`,
      serious.length === 0,
      `${axe.violations.length} violation(s), ${serious.length} serious or critical`,
    )

    await ctx.close()
  }
} finally {
  if (browser) await browser.close().catch(() => {})
  if (adminUserId) {
    await db.from('admin_users').delete().eq('id', adminUserId)
    await db.from('profiles').delete().eq('id', adminUserId)
    await db.auth.admin.deleteUser(adminUserId).catch(() => {})
    const { data: left } = await db.from('admin_users').select('id').eq('id', adminUserId)
    // OBSERVED, not assumed: a fixture admin left behind on a shared TEST
    // database is a standing credential nobody remembers creating.
    check('cleanup.admin', (left ?? []).length === 0, `${(left ?? []).length} fixture admin row(s) left`)
  }
}

writeFileSync(
  join(out, 'drive.json'),
  `${JSON.stringify({ base: BASE, label, checks, failures }, null, 2)}\n`,
)
const passed = checks.filter(c => c.ok).length
console.log(`\n[admin-search-comma-drive] ${passed} of ${checks.length} checks passed`)
if (failures.length > 0) {
  for (const f of failures) console.error(`  FAIL ${f}`)
  process.exit(1)
}
