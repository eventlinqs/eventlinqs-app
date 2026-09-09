/**
 * UX3.4 DRIVEN PROOF: the admin Notifications screen shows the same events as a
 * readable feed, so the owner can see what happened while away without searching
 * an inbox.
 *
 * The admin signs in through the REAL /admin/login flow. The fixture admin is
 * created without a TOTP secret, which is the product's own documented
 * first-login bootstrap (src/app/admin/actions.ts: an un-enrolled admin is
 * signed in and sent to enrolment, and issueTwoFactorProof still runs). No gate
 * is bypassed and no code is modified. The account is deleted afterwards.
 *
 * The rows it reads are the ones the earlier drive produced by signing up,
 * creating an organisation and publishing an event through the real forms. This
 * script creates no notification of its own.
 *
 * Usage (the shell must not carry the production Supabase URL):
 *   BASE=http://localhost:3311 node --env-file=.env.local \
 *     scripts/verify/ux3-admin-feed-proof.mjs --out C:/dev/EVIDENCE/UX3
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { chromium } from 'playwright'
import { AxeBuilder } from '@axe-core/playwright'

const args = process.argv.slice(2)
let out = 'C:/dev/EVIDENCE/UX3'
for (let i = 0; i < args.length; i += 1) if (args[i] === '--out') out = args[++i]
out = join(out, 'admin-feed')
mkdirSync(out, { recursive: true })

const BASE = process.env.BASE ?? 'http://localhost:3311'
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

const checks = []
const failures = []
function check(id, ok, detail) {
  checks.push({ id, ok, detail })
  if (!ok) failures.push(`${id}: ${detail}`)
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${id}  ${detail}`)
}

// The rows the feed must show, read from the database rather than assumed.
const { data: rows, error } = await db
  .from('platform_notifications')
  .select('id, kind, summary, admin_path, delivery_state, occurred_at')
  .order('occurred_at', { ascending: false })
  .limit(10)
if (error) {
  console.error(`FAIL: could not read platform_notifications: ${error.message}`)
  process.exit(1)
}
check('ux3.4.rows.exist', (rows ?? []).length > 0, `${(rows ?? []).length} notification(s) on TEST to render`)

// GENERATED PER RUN, never a literal. A fixture password written into a file is
// still a password written into a file.
const adminEmail = `ux3-admin-${Date.now().toString(36)}@eventlinqs.test`
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
    full_name: 'UX3 Feed Proof',
    display_name: 'UX3 Feed Proof',
    is_verified: true,
  })
  const { error: auErr } = await db
    .from('admin_users')
    .insert({ id: adminUserId, role: 'super_admin', display_name: 'UX3 Feed Proof' })
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
    // A refusal must be reported as what the network actually did, never as a
    // bare timeout: the first version of this script called a 200 that landed on
    // the enrolment screen a "refusal" and sent a session chasing the product.
    page.on('response', (r) => {
      if (r.request().method() === 'POST') {
        console.log(`    POST ${r.status()} ${r.url().replace(BASE, '')}`)
      }
    })
    page.on('pageerror', (e) => console.log(`    pageerror ${String(e).slice(0, 160)}`))

    await page.goto(`${BASE}/admin/login`, { waitUntil: 'domcontentloaded', timeout: 120000 })
    await page.locator('input[name="email"]').fill(adminEmail)
    await page.locator('input[name="password"]').fill(adminPassword)
    // The submit is disabled until hydration, deliberately, so no native GET can
    // ever carry the password. Wait for that rather than racing it.
    const submit = page.locator('button[type="submit"]')
    await submit.waitFor({ state: 'visible', timeout: 30000 })
    await page.waitForFunction(
      () => !document.querySelector('button[type="submit"]')?.disabled,
      undefined,
      { timeout: 30000 },
    )
    await submit.click()
    /*
     * Settle on the first REAL outcome: the redirect, or a refusal a person can
     * READ.
     *
     * "A refusal a person can read" is the whole point and the first version of
     * this got it wrong. It raced on `[role=alert]` EXISTING, and an empty
     * `[role=alert]` is already on the login page, so the race resolved
     * instantly, the URL was still /admin/login because the action was still in
     * flight, and the script reported "admin sign-in refused: NOTHING SHOWN"
     * three times against a sign-in that works. A harness that resolves on an
     * empty element indicts the product for its own impatience.
     *
     * So the second half waits for an alert with TEXT IN IT.
     */
    await Promise.race([
      page.waitForURL((u) => !u.pathname.endsWith('/admin/login'), { timeout: 60000 }).catch(() => {}),
      page
        .waitForFunction(
          () =>
            [...document.querySelectorAll('[role=alert]')].some(
              (e) => (e.textContent ?? '').trim().length > 0,
            ),
          undefined,
          { timeout: 60000 },
        )
        .catch(() => {}),
    ])
    if (new URL(page.url()).pathname.endsWith('/admin/login')) {
      const shown = await page
        .locator('[role=alert]')
        .allInnerTexts()
        .catch(() => [])
      await page.screenshot({ path: join(out, `admin-login-refused-${vp.label}.png`), fullPage: true })
      check(`ux3.4.${vp.label}.login`, false, `admin sign-in refused: ${shown.join(' // ') || 'NOTHING SHOWN'}`)
      await ctx.close()
      continue
    }

    await page.goto(`${BASE}/admin/notifications`, { waitUntil: 'domcontentloaded', timeout: 120000 })
    await page.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => {})
    await page.screenshot({ path: join(out, `admin-notifications-${vp.label}.png`), fullPage: true })

    const text = (await page.locator('body').innerText()).replace(/\s+/g, ' ')
    check(
      `ux3.4.${vp.label}.heading`,
      /What happened on the platform/i.test(text),
      'the feed section is on the screen',
    )
    for (const row of (rows ?? []).slice(0, 3)) {
      check(
        `ux3.4.${vp.label}.row`,
        text.includes(row.summary),
        `"${row.summary.slice(0, 60)}" is readable on the screen`,
      )
    }
    // Every row is a link into the admin console for that exact record.
    const hrefs = await page.evaluate(() =>
      [...document.querySelectorAll('a')].map((a) => a.getAttribute('href')),
    )
    for (const row of (rows ?? []).slice(0, 3)) {
      check(
        `ux3.4.${vp.label}.link`,
        hrefs.includes(row.admin_path),
        `links straight to ${row.admin_path}`,
      )
    }
    // The backup channel control, and its honest state.
    check(
      `ux3.4.${vp.label}.backup`,
      /Backup channel/i.test(text),
      'the second-channel control is on the same screen as the notifications it backs up',
    )

    // axe at EVERY impact level, which is the completion brief's bar rather
    // than the serious/critical floor the older scans used.
    const axe = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze()
    writeFileSync(
      join(out, `axe-admin-notifications-${vp.label}.json`),
      JSON.stringify({ url: page.url(), violations: axe.violations }, null, 2),
    )
    check(
      `ux3.4.${vp.label}.axe`,
      axe.violations.length === 0,
      axe.violations.length === 0
        ? 'axe: 0 violations at every impact level'
        : `axe: ${axe.violations.map((v) => `${v.id} (${v.impact}, ${v.nodes.length})`).join(', ')}`,
    )
    await ctx.close()
  }
} finally {
  if (browser) await browser.close()
  if (adminUserId) {
    await db.from('admin_users').delete().eq('id', adminUserId)
    await db.auth.admin.deleteUser(adminUserId).catch(() => {})
  }
  writeFileSync(join(out, 'ux3-admin-feed-report.json'), JSON.stringify({ base: BASE, checks, failures }, null, 2))
}

console.log(`\n  ${checks.filter((c) => c.ok).length} of ${checks.length} checks pass`)
if (failures.length > 0) {
  console.log('\n  FAILURES')
  for (const f of failures) console.log(`    ${f}`)
}
process.exit(failures.length === 0 ? 0 : 1)
