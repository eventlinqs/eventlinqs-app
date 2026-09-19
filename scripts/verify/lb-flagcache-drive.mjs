/**
 * LB-FLAGCACHE, DRIVEN: A STALE FLAG IN THE SERVER'S CACHE, PLANTED ON PURPOSE.
 *
 * ---------------------------------------------------------------------------
 * WHY THE STALE VALUE IS PLANTED RATHER THAN WAITED FOR.
 *
 * The defect is a RACE. `scripts/verify/ga2-matcher-drive.mjs` failed three
 * consecutive runs on `locator.click: Timeout 30000ms exceeded` at a disabled
 * "Produce a match", while `feature_flags.enabled` read TRUE and the cache key
 * read null by the time anybody looked. Reproducing that by running the drive
 * and hoping is not a proof, it is a coin toss, and the drive's own header
 * records a fix from 14 September that "passed at closure ... with a TTL and no
 * invalidation, whether a read straddles an expiry is a matter of WHEN it
 * runs."
 *
 * So this writes the stale value straight into the store the SERVER reads,
 * which makes the failure deterministic:
 *
 *   the key      vkapkibzokmfaxqogypq:ff:v2:marketing_matcher_enabled
 *                (src/lib/flags/broadcast.ts cacheKey, namespaced by
 *                 src/lib/redis/client.ts namespacedKey)
 *   the store    http://127.0.0.1:8179, the local shim the serve script gives
 *                the server, and which a drive process cannot reach because
 *                .env.local carries an EMPTY UPSTASH_REDIS_REST_URL
 *
 * ---------------------------------------------------------------------------
 * WHAT IT PROVES, at 390, 768 and 1440:
 *
 *   1. the flag ROW says enabled, so nothing about the product is switched off;
 *   2. with a stale `false` planted, ONE render shows the button DISABLED -
 *      this is the defect, and it is the state the old drive clicked at for
 *      thirty seconds;
 *   3. RELOADING until the server agrees recovers within the TTL, which is what
 *      `waitForProduceButton` now does;
 *   4. the recovered page really is pressable: the hidden event_id is set and
 *      the button is enabled.
 *
 * It plants nothing in the database except one admin, which it deletes, and it
 * deletes the cache key it wrote.
 *
 * Run (dev server on 3100 against TEST):
 *   node --env-file=.env.local scripts/verify/lb-flagcache-drive.mjs \
 *        --out C:/dev/EVIDENCE/LB-FLAGCACHE
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { answerTheCookieBanner } from './lib/cookie-banner.mjs'

const args = process.argv.slice(2)
let out = null
for (let i = 0; i < args.length; i += 1) if (args[i] === '--out') out = args[++i]
if (!out) {
  console.error('FAIL: --out <directory> is required')
  process.exit(1)
}
mkdirSync(out, { recursive: true })

const BASE = process.env.LB_BASE_URL ?? 'http://localhost:3100'
const SHIM = process.env.LB_SHIM_URL ?? 'http://127.0.0.1:8179'
const FLAG = 'marketing_matcher_enabled'
const TTL_SECONDS = 30

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
if (!/vkapkibzokmfaxqogypq/.test(url)) {
  console.error(`FAIL: this drive only touches TEST vkapkibzokmfaxqogypq, not ${url}`)
  process.exit(1)
}
const db = createClient(url, serviceKey, { auth: { persistSession: false } })

/** The exact key the server reads, namespaced the way the client namespaces it. */
const namespace = /https?:\/\/([a-z0-9]+)\.supabase\./i.exec(url)?.[1] ?? 'unknown'
const CACHE_KEY = `${namespace}:ff:v2:${FLAG}`

const VIEWPORTS = [
  { label: 'mobile-390', width: 390, height: 844 },
  { label: 'tablet-768', width: 768, height: 1024 },
  { label: 'desktop-1440', width: 1440, height: 900 },
]

const checks = []
function check(name, ok, detail) {
  checks.push({ name, ok: Boolean(ok), detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${detail}`)
}

async function shim(path) {
  const res = await fetch(`${SHIM}${path}`)
  if (!res.ok) throw new Error(`the shim answered ${res.status} to ${path}`)
  return res.json()
}

const adminPassword = `${randomUUID()}Aa1`
const adminEmail = `lane-b-flagcache-${Date.now()}@eventlinqs.test`
let adminId = null
let browser = null
let eventId = null

try {
  // The shim has to be the store the server actually uses, or this drive is
  // planting a value nobody reads and would report a pass over nothing.
  await shim('/get/_probe')

  const { data: flagRow } = await db.from('feature_flags').select('flag, enabled').eq('flag', FLAG).maybeSingle()
  check(
    'flagcache.the-row-says-the-matcher-is-on',
    flagRow?.enabled === true,
    `feature_flags.${FLAG} = ${flagRow?.enabled}, so nothing below is the product being switched off`,
  )
  if (flagRow?.enabled !== true) throw new Error('this drive needs the matcher flag on to plant a stale off')

  const { data: event } = await db
    .from('events')
    .select('id')
    .eq('status', 'published')
    .eq('visibility', 'public')
    .gt('start_date', new Date().toISOString())
    .order('start_date', { ascending: true })
    .limit(1)
    .single()
  eventId = event.id

  const created = await db.auth.admin.createUser({ email: adminEmail, password: adminPassword, email_confirm: true })
  if (created.error) throw new Error(created.error.message)
  adminId = created.data.user.id
  await db.from('profiles').upsert({ id: adminId, email: adminEmail, full_name: 'Lane B flagcache' })
  const staff = await db.from('admin_users').insert({ id: adminId, role: 'super_admin', display_name: 'Lane B flagcache' })
  if (staff.error) throw new Error(staff.error.message)

  browser = await chromium.launch({ headless: true })
  const pageUrl = `${BASE}/admin/matches?event=${eventId}`

  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } })
    const page = await context.newPage()
    await page.goto(`${BASE}/admin/login`, { waitUntil: 'domcontentloaded', timeout: 120000 })
    await page.waitForTimeout(1200)
    await answerTheCookieBanner(page)
    await page.locator('input[name="email"]').fill(adminEmail)
    await page.locator('input[name="password"]').fill(adminPassword)
    await Promise.all([
      page.waitForURL(u => !u.pathname.endsWith('/admin/login'), { timeout: 60000 }).catch(() => {}),
      page.locator('button[type="submit"]').first().click(),
    ])
    await page.waitForTimeout(2000)

    /* ---- the defect: one render, made from a stale cached value ---- */
    /*
     * SETEX, NOT SET WITH A QUERY STRING. The shim builds its command by
     * splitting the decoded path on "/", so `/set/key/false?EX=30` stores the
     * literal value "false?EX=30" and the server reads an unrecognised value,
     * which `readCache` correctly treats as "I do not know" rather than as off.
     * The first run of this drive did exactly that and the planting assertion
     * caught it, which is why that assertion is here at all.
     */
    await shim(`/setex/${encodeURIComponent(CACHE_KEY)}/${TTL_SECONDS}/false`)
    const planted = await shim(`/get/${encodeURIComponent(CACHE_KEY)}`)
    check(
      `flagcache.${vp.label}.the-stale-value-is-in-the-store-the-server-reads`,
      String(planted.result) === 'false',
      `${CACHE_KEY} now reads "${planted.result}" while the database row reads true`,
    )

    await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 120000 })
    await page.waitForTimeout(1500)
    await answerTheCookieBanner(page)
    const button = page.getByRole('button', { name: /produce a match/i })
    const disabledOnFirstRender = await button.isDisabled().catch(() => null)
    check(
      `flagcache.${vp.label}.one-render-shows-the-button-disabled`,
      disabledOnFirstRender === true,
      disabledOnFirstRender === true
        ? 'this is the defect: the old drive clicked at exactly this render for thirty seconds and the page never changed its mind'
        : `the button was ${disabledOnFirstRender}, so the stale value did not reach the server and this drive proves nothing`,
    )
    await page.screenshot({ path: join(out, `${vp.label}-1-stale-disabled.png`), fullPage: false })

    /* ---- the fix: reload until the server agrees ---- */
    const deadline = Date.now() + (TTL_SECONDS + 20) * 1000
    let reloads = 0
    let recovered = false
    for (;;) {
      await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 120000 })
      await page.waitForTimeout(1200)
      await answerTheCookieBanner(page)
      reloads += 1
      if ((await button.isDisabled().catch(() => true)) === false) {
        recovered = true
        break
      }
      if (Date.now() > deadline) break
      await page.waitForTimeout(2000)
    }
    check(
      `flagcache.${vp.label}.reloading-recovers-within-the-ttl`,
      recovered,
      recovered
        ? `the button became pressable after ${reloads} reload(s), inside the ${TTL_SECONDS}s cache window`
        : `still disabled after ${reloads} reload(s) and ${TTL_SECONDS + 20}s`,
    )

    const eventIdField = await page.locator('input[name="event_id"]').inputValue().catch(() => '')
    check(
      `flagcache.${vp.label}.the-recovered-page-is-really-pressable`,
      recovered && eventIdField === eventId,
      `the hidden event_id is "${eventIdField}", so the button is enabled for the event the address named`,
    )
    await page.screenshot({ path: join(out, `${vp.label}-2-recovered.png`), fullPage: false })
    await context.close()
  }
} catch (error) {
  check('flagcache.drive.completed', false, error instanceof Error ? error.message : String(error))
  console.error(error)
} finally {
  if (browser) await browser.close().catch(() => {})
  try {
    await shim(`/del/${encodeURIComponent(CACHE_KEY)}`).catch(() => {})
    const left = await shim(`/get/${encodeURIComponent(CACHE_KEY)}`).catch(() => ({ result: 'unreadable' }))
    if (adminId) {
      await db.from('admin_users').delete().eq('id', adminId)
      await db.auth.admin.deleteUser(adminId).catch(() => {})
    }
    const { count } = await db
      .from('admin_users')
      .select('id', { count: 'exact', head: true })
      .eq('id', adminId ?? '00000000-0000-0000-0000-000000000000')
    check(
      'flagcache.teardown.left-as-found',
      (count ?? 0) === 0 && left.result === null,
      `${count ?? 0} probe admin row(s) remain and the planted cache key reads ${JSON.stringify(left.result)}`,
    )
  } catch (error) {
    check('flagcache.teardown.left-as-found', false, error instanceof Error ? error.message : String(error))
  }
}

const failed = checks.filter(c => !c.ok)
writeFileSync(
  join(out, 'lb-flagcache-drive-report.json'),
  JSON.stringify({ generatedAt: new Date().toISOString(), base: BASE, cacheKey: CACHE_KEY, checks, failed: failed.length }, null, 2),
)
console.log('')
console.log(`LB-FLAGCACHE DRIVE: ${checks.length - failed.length} of ${checks.length} checks passed`)
for (const f of failed) console.log(`  FAILED  ${f.name}  ${f.detail}`)
process.exit(failed.length === 0 ? 0 : 1)
