/**
 * PART H's THREE PAGES IN A BROWSER, AT 390, 768 AND 1440, ON TEST (the EventLinqs engine plan of 28 October 2026).
 *
 * /go (the link in bio, signed out), /admin/today (Lawal's one queue, signed in as an admin) and
 * /dashboard/events/[id]/report (the organiser's report after a night, signed in as a manager of that night's
 * organisation), each served by the gate's own production server (startGateServer) from this tree's build.
 *
 * Each page at each width must answer 200 at the address asked for (never a sign-in bounce or a 404), carry one h1,
 * draw nothing wider than the screen, load every image it draws, and show no placeholder words. Each is saved as a
 * full-page screenshot beside the results.
 *
 * WHAT IT NEVER DOES: press a /go/[piece] link, /out, /e or /s (a press is counted; a QA drive is not a person), or
 * submit anything but the sign-in form. The browser is headless Chrome, which src/lib/broadcast/crawler.ts already
 * takes for a crawler, so no view beacon counts it either.
 *
 * WHAT IT MAKES, AND REMOVES IN ITS finally, pass or fail: one auth user (w5-engine-pages-<stamp>@eventlinqs.test),
 * its profile, one admin_users row and one organisation_members row (manager). TEST only, checked twice.
 *
 *   node --env-file=.env.local scripts/verify/engine-h-pages-drive.mjs --port=3205
 *
 * (after `next build` in this tree). The last line is the verdict.
 */
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { startGateServer, envFor } from '../ops/pre-push-gate.mjs'
import { refuseUnlessThePortIsFree } from './lib/port-is-ours.mjs'
import { assertNotProduction } from '../lib/production-write-preflight.mjs'
import { tearDownAccountOrFailTheRun } from './lib/teardown-account.mjs'

assertNotProduction()

const TAG = '[engine-h-pages]'
const args = process.argv.slice(2)
const PORT = Number(args.find((a) => a.startsWith('--port='))?.split('=')[1] ?? 3205)
const OUT = process.env.DRIVE_OUT ?? join('C:', 'dev', 'EVIDENCE', 'ENGINE-H-29OCT', 'pages')
const VIEWPORTS = [
  { label: '390', width: 390, height: 844 },
  { label: '768', width: 768, height: 1024 },
  { label: '1440', width: 1440, height: 900 },
]
const PLACEHOLDER = /lorem ipsum|coming soon|sample event|\bTODO\b|\bFIXME\b|undefined|NaN|\[object Object\]/i

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
if (!URL_ || !SERVICE) throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
if (!/vkapkibzokmfaxqogypq/.test(URL_)) throw new Error(`refusing to write to ${URL_}: this drive runs against TEST only`)
const db = createClient(URL_, SERVICE, { auth: { persistSession: false } })

let failures = 0
const results = []
function check(name, ok, detail = '') {
  if (!ok) failures += 1
  results.push({ name, ok, detail })
  console.log(`${TAG} ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' - ' + detail : ''}`)
}

/** What one page draws, read in the page itself. */
async function measure(page) {
  return page.evaluate(() => {
    const doc = document.documentElement
    const imgs = [...document.images].filter((i) => i.getBoundingClientRect().width > 0)
    const wide = [...document.querySelectorAll('body *')]
      .filter((el) => {
        const r = el.getBoundingClientRect()
        return r.width > 0 && r.right > window.innerWidth + 1
      })
      .slice(0, 3)
      .map((el) => `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : ''}`)
    return {
      scrollWidth: doc.scrollWidth,
      innerWidth: window.innerWidth,
      wide,
      h1: document.querySelectorAll('h1').length,
      imgs: imgs.length,
      broken: imgs.filter((i) => !i.complete || i.naturalWidth === 0).map((i) => i.currentSrc || i.src),
      text: document.body.innerText,
    }
  })
}

async function judge(page, label, path) {
  const res = await page.goto(path, { waitUntil: 'load', timeout: 180000 })
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {})
  const at = new URL(page.url()).pathname
  const status = res?.status() ?? 0
  check(`${label} ${path} answers 200 where it was asked`, status === 200 && at === path.split('?')[0], `status ${status}, at ${at}`)
  const m = await measure(page)
  check(`${label} ${path} draws nothing wider than the screen`, m.scrollWidth <= m.innerWidth + 1, `scrollWidth ${m.scrollWidth} of ${m.innerWidth}${m.wide.length ? ', ' + m.wide.join(', ') : ''}`)
  check(`${label} ${path} carries one h1`, m.h1 === 1, `${m.h1} h1`)
  check(`${label} ${path} loads every image it draws`, m.broken.length === 0, `${m.imgs} drawn${m.broken.length ? ', broken: ' + m.broken.join(' ') : ''}`)
  const hit = m.text.match(PLACEHOLDER)
  check(`${label} ${path} shows no placeholder words`, !hit, hit ? `"${hit[0]}"` : '')
  const file = join(OUT, `${path.replace(/^\//, '').replace(/[/?=&]/g, '_') || 'home'}-${label}.png`)
  await page.screenshot({ path: file, fullPage: true })
  return m
}

const stamp = Date.now().toString(36)
const made = { userId: null, memberId: null }
let stopServer = null
try {
  mkdirSync(OUT, { recursive: true })

  /* ---- the night whose report is read: an ended TEST night with a kept report, else any ended night with an owner */
  const { data: kept, error: kerr } = await db
    .from('organiser_night_reports')
    .select('event_id, organisation_id')
    .order('night_ended_at', { ascending: false })
    .limit(1)
  if (kerr) throw new Error(`read the kept reports: ${kerr.message}`)
  let night = kept?.[0] ? { id: kept[0].event_id, organisation_id: kept[0].organisation_id } : null
  if (!night) {
    const { data: ended, error: eerr } = await db
      .from('events')
      .select('id, organisation_id')
      .not('organisation_id', 'is', null)
      .lt('end_date', new Date().toISOString())
      .order('end_date', { ascending: false })
      .limit(1)
    if (eerr) throw new Error(`read an ended night: ${eerr.message}`)
    night = ended?.[0] ?? null
  }
  check('a TEST night to read the report of', Boolean(night?.id && night?.organisation_id), JSON.stringify(night))
  if (!night) throw new Error('no ended TEST night with an organisation')
  console.log(`${TAG} the report read is /dashboard/events/${night.id}/report (${kept?.[0] ? 'a kept report' : 'no kept report yet'})`)

  /* ---- the one person this drive signs in as ---------------------------------------------------------------- */
  const email = `w5-engine-pages-${stamp}@eventlinqs.test`
  const password = `${randomUUID()}Aa1`
  const user = await db.auth.admin.createUser({ email, password, email_confirm: true })
  if (user.error) throw new Error(`create the auth user: ${user.error.message}`)
  made.userId = user.data.user.id
  await db.from('profiles').upsert({ id: made.userId, email, full_name: 'Window 5 engine pages drive', display_name: 'Window 5 engine pages drive', is_verified: true })
  const granted = await db.from('admin_users').insert({ id: made.userId, role: 'super_admin', display_name: 'Window 5 engine pages drive' })
  if (granted.error) throw new Error(`grant the admin role: ${granted.error.message}`)
  const member = await db.from('organisation_members').insert({ organisation_id: night.organisation_id, user_id: made.userId, role: 'manager' }).select('id').single()
  if (member.error) throw new Error(`make the drive a manager of the night's organisation: ${member.error.message}`)
  made.memberId = member.data.id

  await refuseUnlessThePortIsFree(PORT, 'before the engine pages drive server was started', 'pass --port= for one this window owns')
  mkdirSync('.tmp', { recursive: true })
  const started = await startGateServer(envFor('local'), `.tmp/engine-h-pages-server-${stamp}.log`, { port: PORT })
  if (started.error) throw new Error(`could not serve the build: ${started.error}`)
  stopServer = started.stop
  const BASE = started.base
  console.log(`${TAG} serving the production build on ${BASE}`)

  const browser = await chromium.launch()
  try {
    for (const vp of VIEWPORTS) {
      const context = await browser.newContext({
        baseURL: BASE,
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: 1,
        isMobile: vp.width < 768,
        hasTouch: vp.width < 768,
        locale: 'en-AU',
      })
      const page = await context.newPage()

      const go = await judge(page, vp.label, '/go')
      const hrefs = await page.$$eval('a[href]', (as) => as.map((a) => a.getAttribute('href')))
      const pressLinks = hrefs.filter((h) => h?.startsWith('/go/'))
      check(`${vp.label} /go lists each live post through its counted hop only`, hrefs.every((h) => !/^https?:/.test(h ?? '') || h.includes('eventlinqs')), `${pressLinks.length} /go/ link(s), none pressed`)
      if (vp.label === '390') console.log(`${TAG} /go says: ${go.text.replace(/\s+/g, ' ').slice(0, 300)}`)

      await page.goto('/admin/login', { waitUntil: 'domcontentloaded', timeout: 180000 })
      await page.locator('input[name="email"]').fill(email)
      await page.locator('input[name="password"]').fill(password)
      await page.waitForFunction(() => !document.querySelector('button[type="submit"]')?.disabled, undefined, { timeout: 60000 })
      await page.locator('button[type="submit"]').click()
      await page.waitForURL((u) => !u.pathname.endsWith('/admin/login'), { timeout: 120000 }).catch(() => {})
      const signedIn = !new URL(page.url()).pathname.endsWith('/admin/login')
      check(`${vp.label} the drive signed in`, signedIn, `at ${new URL(page.url()).pathname}`)
      if (signedIn) {
        const today = await judge(page, vp.label, '/admin/today')
        if (vp.label === '1440') console.log(`${TAG} /admin/today says: ${today.text.replace(/\s+/g, ' ').slice(0, 600)}`)
        const report = await judge(page, vp.label, `/dashboard/events/${night.id}/report`)
        if (vp.label === '1440') console.log(`${TAG} the report says: ${report.text.replace(/\s+/g, ' ').slice(0, 600)}`)
      }
      await context.close()
    }
  } finally {
    await browser.close()
  }
} catch (error) {
  check('the drive ran to its end', false, error instanceof Error ? error.message : String(error))
} finally {
  if (stopServer) await stopServer()
  try {
    if (made.memberId) await db.from('organisation_members').delete().eq('id', made.memberId)
    if (made.userId) {
      await db.from('admin_users').delete().eq('id', made.userId)
      await tearDownAccountOrFailTheRun(db, made.userId)
    }
    const { count } = await db.from('organisation_members').select('id', { count: 'exact', head: true }).eq('user_id', made.userId ?? '00000000-0000-0000-0000-000000000000')
    check('nothing the drive made is left', (count ?? 0) === 0, `${count ?? 0} membership row(s) left`)
  } catch (error) {
    check('nothing the drive made is left', false, `cleanup failed: ${error instanceof Error ? error.message : String(error)}`)
  }
  writeFileSync(join(OUT, `results-${stamp}.json`), JSON.stringify({ stamp, results }, null, 2))
}

console.log(`${TAG} ${failures === 0 ? 'DRIVE PASSED' : `DRIVE FAILED, ${failures} check(s)`} (${results.length} checks; ${OUT})`)
process.exit(failures === 0 ? 0 : 1)
