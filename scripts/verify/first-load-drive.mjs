/**
 * THE DRIVEN HALF OF THE INITIAL-BUNDLE BUDGET (close-out C8B.3, 15 September 2026).
 *
 * ============================================================================
 * WHAT A STATIC MEASUREMENT CANNOT SETTLE
 * ============================================================================
 *
 * `scripts/perf/first-load-budget.mjs` weighs the build output and is exact
 * about files. It cannot answer the two questions that actually matter:
 *
 *   1. Does a BROWSER fetch what the manifest says it fetches? A number derived
 *      from a manifest is a claim about a build, not about a buyer.
 *   2. Does the platform still WORK after 51.4 KB was moved off four routes?
 *      The four are /login, /signup, /auth/reset-password and /scan, so the
 *      thing being deferred is the code that signs people in. A byte saving
 *      that breaks authentication is not a saving.
 *
 * So this drives a real browser against a real production build at 390, 768 and
 * 1440, and it does the one thing no static reading can: it SIGNS A REAL USER
 * IN, on TEST, at every viewport, after the change.
 *
 * ============================================================================
 * THE FOUR CHECKS
 * ============================================================================
 *
 * D1  The auth client is NOT fetched before anyone touches the page. Loading
 *     /login and waiting proves the deferral is real rather than a chunk that
 *     arrives a moment later under a different name.
 *
 * D2  It IS fetched once somebody interacts, and BEFORE they press Sign in, so
 *     the deferral costs nobody a wait at the worst possible moment. This is
 *     what the warm on first focus is for.
 *
 * D3  A real sign-in still succeeds, at all three viewports, with a real TEST
 *     account, landing on a signed-in page. This is the check the whole change
 *     is answerable to.
 *
 * D4  What the browser actually fetches agrees with what the build manifest
 *     said it would. Two independent measurements of the same thing; if they
 *     disagree the static one is not evidence about buyers and the guard built
 *     on it is measuring the wrong world.
 *
 * ============================================================================
 * USAGE
 * ============================================================================
 *
 *     node --env-file=.env.local scripts/verify/first-load-drive.mjs [baseUrl]
 *
 * Lane C runs on port 3200 and nothing else. The account is created on TEST,
 * carries lane-c in its address, and is deleted at the end of the run.
 */

import { assertNotProduction } from '../lib/production-write-preflight.mjs'
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { mkdirSync, writeFileSync, readFileSync, readdirSync } from 'node:fs'
import { join, sep } from 'node:path'
import { gzipSync } from 'node:zlib'

const BASE = (process.argv.find((a) => /^https?:\/\//.test(a)) || process.env.C8C_BASE || 'http://localhost:3200').replace(/\/$/, '')
const OUT = process.env.C8C_OUT || join('C:', 'dev', 'EVIDENCE', 'C8C', 'after')
const TAG = '[first-load-drive]'

const VIEWPORTS = [
  { name: '390', width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  { name: '768', width: 768, height: 1024, isMobile: false, hasTouch: false, deviceScaleFactor: 1 },
  { name: '1440', width: 1440, height: 900, isMobile: false, hasTouch: false, deviceScaleFactor: 1 },
]

const checks = []
const faults = []
const say = (m) => console.log(`${TAG} ${m}`)
const record = (id, what, ok, detail) => {
  checks.push({ id, what, ok: Boolean(ok), detail })
  if (!ok) faults.push(`${id}: ${what} - ${detail}`)
  console.log(`${TAG} ${ok ? 'PASS' : 'FAIL'}  ${id}  ${what}${detail ? `\n${TAG}        ${detail}` : ''}`)
}
const kb = (b) => `${(b / 1024).toFixed(1)} KB`

/**
 * The auth client chunk, identified from the BUILD rather than by guessing a
 * hash: the chunk whose body carries the Supabase client's own class names.
 *
 * A hardcoded filename would go stale on the next build and the drive would
 * then report a pass because it was looking for something that no longer
 * exists, which is the failure this repository has already been bitten by
 * twice: a check that cannot fail is not a check.
 */
function authChunkNames() {
  const dir = join('.next', 'static', 'chunks')
  const names = new Set()
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.js'))) {
    if (/GoTrueClient|PostgrestClient/.test(readFileSync(join(dir, file), 'utf8'))) names.add(file)
  }
  say(`auth client chunk(s) in this build: ${[...names].join(', ') || 'NONE FOUND'}`)
  return names
}

/** First-load chunk names for a route, from the build's own diagnostic. */
function manifestChunks(route) {
  const stats = JSON.parse(readFileSync(join('.next', 'diagnostics', 'route-bundle-stats.json'), 'utf8'))
  const row = stats.find((r) => r.route === route)
  if (!row) throw new Error(`no such route in the build: ${route}`)
  const BACKSLASH = String.fromCharCode(92)
  return new Set(row.firstLoadChunkPaths.map((p) => p.split(BACKSLASH).join('/').split('/').pop()))
}

function manifestGzip(route) {
  const stats = JSON.parse(readFileSync(join('.next', 'diagnostics', 'route-bundle-stats.json'), 'utf8'))
  const row = stats.find((r) => r.route === route)
  const BACKSLASH = String.fromCharCode(92)
  let total = 0
  for (const p of row.firstLoadChunkPaths) {
    total += gzipSync(readFileSync(p.split(BACKSLASH).join('/').split('/').join(sep)), { level: 9 }).length
  }
  return total
}

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const stamp = String(Date.now()).slice(-9)
const EMAIL = `lane-c-c8c-${stamp}@example.com`
const PASSWORD = `LaneC-c8c-${stamp}-aA1`
let userId = null

async function createSignInAccount() {
  const { data, error } = await db.auth.admin.createUser({
    email: EMAIL,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: 'Lane C C8C Drive' },
  })
  if (error) throw new Error(`could not create the TEST sign-in account: ${error.message}`)
  userId = data.user.id
  say(`TEST account ${EMAIL} created (${userId})`)
}

async function deleteSignInAccount() {
  if (!userId) return
  const { error } = await db.auth.admin.deleteUser(userId)
  say(error ? `could not delete ${EMAIL}: ${error.message}` : `TEST account ${EMAIL} deleted`)
}

/** An event slug enumerated from the database, never typed. */
async function anEventSlug() {
  const { data, error } = await db
    .from('events')
    .select('slug')
    .eq('status', 'published')
    .order('start_date', { ascending: true })
    .limit(1)
  if (error) throw new Error(`could not read a published event: ${error.message}`)
  if (!data?.length) throw new Error('no published event on TEST to load')
  return data[0].slug
}

async function main() {
  assertNotProduction('first-load-drive')
  mkdirSync(OUT, { recursive: true })

  const authChunks = authChunkNames()
  if (authChunks.size === 0) {
    record('D0', 'the auth client chunk can be identified in this build', false, 'no chunk carries GoTrueClient or PostgrestClient')
    return finish()
  }

  await createSignInAccount()
  const slug = await anEventSlug()
  say(`event slug harvested from TEST: ${slug}`)

  const browser = await chromium.launch()
  try {
    for (const vp of VIEWPORTS) {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        isMobile: vp.isMobile,
        hasTouch: vp.hasTouch,
        deviceScaleFactor: vp.deviceScaleFactor,
        // A service worker answering content-hashed assets from cache would
        // make every byte measurement here smaller than a first-time buyer's.
        serviceWorkers: 'block',
      })
      const page = await context.newPage()
      const fetched = new Set()
      const bytes = new Map()
      page.on('requestfinished', async (req) => {
        if (req.resourceType() !== 'script') return
        const name = new URL(req.url()).pathname.split('/').pop()
        fetched.add(name)
        try {
          const sizes = await req.sizes()
          bytes.set(name, sizes.responseBodySize)
        } catch (cause) {
          say(`could not size ${name}: ${cause instanceof Error ? cause.message : String(cause)}`)
        }
      })

      // ---- D1: nothing touched, the auth client must not arrive ----
      await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
      await page.waitForTimeout(3000)
      const earlyAuth = [...authChunks].filter((c) => fetched.has(c))
      record(
        `D1@${vp.name}`,
        'the auth client is not fetched before anyone touches /login',
        earlyAuth.length === 0,
        earlyAuth.length === 0
          ? `${fetched.size} script(s) fetched, none of them the auth client`
          : `fetched without any interaction: ${earlyAuth.join(', ')}`,
      )

      // ---- D4: the browser and the manifest agree ----
      const expected = manifestChunks('/login')
      const missing = [...expected].filter((c) => !fetched.has(c))
      const overWire = [...fetched].filter((c) => expected.has(c)).reduce((a, c) => a + (bytes.get(c) ?? 0), 0)
      const fromManifest = manifestGzip('/login')
      const drift = Math.abs(overWire - fromManifest)
      record(
        `D4@${vp.name}`,
        'what the browser fetched on /login agrees with the build manifest',
        missing.length === 0 && drift < 8 * 1024,
        `manifest ${kb(fromManifest)} gzip over ${expected.size} chunks; browser fetched ${kb(overWire)} of them, ` +
          `drift ${kb(drift)}${missing.length ? `; NOT fetched: ${missing.join(', ')}` : ''}`,
      )

      // ---- D2: the warm brings it in before the person presses anything ----
      await page.locator('#email').focus()
      const warmed = await page
        .waitForResponse((r) => [...authChunks].some((c) => r.url().endsWith(c)), { timeout: 15000 })
        .then(() => true)
        .catch(() => false)
      record(
        `D2@${vp.name}`,
        'focusing the form warms the auth client, so pressing Sign in waits for nothing',
        warmed,
        warmed ? 'the auth client chunk arrived on focus' : 'no auth client chunk arrived within 15s of focus',
      )

      // ---- D3: a real sign-in still works ----
      await page.locator('#email').fill(EMAIL)
      await page.locator('#password').fill(PASSWORD)
      await page.screenshot({ path: join(OUT, `login-${vp.name}.png`), fullPage: false })
      await Promise.all([
        page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30000 }).catch(() => null),
        page.getByRole('button', { name: /sign in/i }).first().click(),
      ])
      await page.waitForTimeout(1500)
      const landed = new URL(page.url()).pathname
      const signedIn = !landed.startsWith('/login')
      await page.screenshot({ path: join(OUT, `signed-in-${vp.name}.png`), fullPage: false })
      record(
        `D3@${vp.name}`,
        'a real TEST account still signs in with the auth client deferred',
        signedIn,
        signedIn ? `landed on ${landed}` : `still on ${landed}: ${(await page.locator('[role="alert"]').allTextContents()).join(' | ') || 'no alert rendered'}`,
      )

      await context.close()
    }

    // ---- the event page, measured the same way, for the record ----
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' })
    const page = await context.newPage()
    const fetched = new Map()
    page.on('requestfinished', async (req) => {
      if (req.resourceType() !== 'script') return
      const name = new URL(req.url()).pathname.split('/').pop()
      try {
        fetched.set(name, (await req.sizes()).responseBodySize)
      } catch (cause) {
        say(`could not size ${name}: ${cause instanceof Error ? cause.message : String(cause)}`)
      }
    })
    await page.goto(`${BASE}/events/${slug}`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(2000)
    const expectedEvent = manifestChunks('/events/[slug]')
    const eventWire = [...fetched].filter(([n]) => expectedEvent.has(n)).reduce((a, [, b]) => a + b, 0)
    const eventManifest = manifestGzip('/events/[slug]')
    record(
      'D5@390',
      'the event page measured in a browser agrees with the manifest',
      Math.abs(eventWire - eventManifest) < 8 * 1024,
      `manifest ${kb(eventManifest)} gzip; browser ${kb(eventWire)} over the same ${expectedEvent.size} chunks`,
    )
    await context.close()
  } finally {
    await browser.close()
    await deleteSignInAccount()
  }
  finish()
}

function finish() {
  writeFileSync(join(OUT, 'first-load-drive.json'), `${JSON.stringify({ base: BASE, checks }, null, 2)}\n`, 'utf8')
  const passed = checks.filter((c) => c.ok).length
  console.log(`\n${TAG} ${passed} of ${checks.length} check(s) passed, ${faults.length} fault(s).`)
  for (const f of faults) console.log(`${TAG} FAULT ${f}`)
  process.exit(faults.length ? 1 : 0)
}

await main()
