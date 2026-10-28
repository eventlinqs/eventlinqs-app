/**
 * H1 ON TEST, THROUGH THE FORM AND THE ADMIN SCREEN THEMSELVES (release checklist H1, window 2, 28 October 2026).
 *
 *   node --env-file=<a TEST env file> scripts/verify/submit-event-drive.mjs <out dir> [--port=3342]
 *
 * It serves this tree against TEST (webpack, as social-admin-drive.mjs does) and, as a visitor with no account:
 * photographs /submit-event at 390, 768 and 1440 (each fits its width); sends one event with a photo it makes, at 390,
 * and reads "Your event has reached us"; sends one with an http booking page past the browser's own check and reads
 * the refusal, with no row written. Then it reads the row as the database holds it (waiting, the permission line word
 * for word, the photo in the private bucket and not public), proves an anonymous request for /admin/submissions is
 * sent to the sign in, signs in as a TEST admin it makes, sees the event with its photo drawn at 390, 768 and 1440,
 * presses Accept and reads the row accepted with an audit line. Everything it made is removed in the end and read
 * back gone, except the audit lines, which are append only. TEST only: it refuses any other database.
 */
import { spawn, spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import sharp from 'sharp'
import { createClient } from '@supabase/supabase-js'
import { chromium } from 'playwright'
import { assertNotProduction } from '../lib/production-write-preflight.mjs'
import { tearDownAccount } from './lib/teardown-account.mjs'

const TEST_REF = 'vkapkibzokmfaxqogypq'
assertNotProduction()
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
if (!url.includes(TEST_REF) || !(process.env.NEXT_PUBLIC_SUPABASE_URL_PREVIEW ?? url).includes(TEST_REF)) {
  console.error('submit-event-drive runs on TEST only')
  process.exit(2)
}
const out = process.argv[2] ?? 'evidence-submit-event'
const PORT = Number((process.argv.find((a) => a.startsWith('--port=')) ?? '--port=3342').slice(7))
const BASE = `http://localhost:${PORT}`
mkdirSync(out, { recursive: true })

const db = createClient(url, key, { auth: { persistSession: false } })
let fails = 0
const check = (name, ok, seen = null) => {
  if (!ok) fails += 1
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : `: ${JSON.stringify(seen)}`}`)
}
const fits = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)

const stamp = Date.now().toString(36)
const TITLE = `w2 drive night ${stamp}`
const BAD_TITLE = `w2 drive refused ${stamp}`
const BARE_TITLE = `w2 drive no photo ${stamp}`
const photoFile = join(out, 'drive-photo.jpg')
let server = null
let browser = null
let adminId = null
try {
  /* ---- a photo of its own: 1600 by 1000, a gradient, so nothing borrowed is sent ---- */
  const w = 1600
  const h = 1000
  const raw = Buffer.alloc(w * h * 3)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 3
    raw[i] = Math.round((x / w) * 200)
    raw[i + 1] = Math.round((y / h) * 160)
    raw[i + 2] = 120
  }
  await sharp(raw, { raw: { width: w, height: h, channels: 3 } }).jpeg({ quality: 85 }).toFile(photoFile)

  /* ---- the server: this tree, against TEST ---- */
  server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '--webpack', '-p', String(PORT)], {
    env: { ...process.env, PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let serverLog = ''
  server.stdout.on('data', (d) => (serverLog += d))
  server.stderr.on('data', (d) => (serverLog += d))
  let up = false
  for (let i = 0; i < 180 && !up; i++) {
    await new Promise((r) => setTimeout(r, 2000))
    up = await fetch(`${BASE}/submit-event`).then((r) => r.status === 200, () => false)
  }
  writeFileSync(join(out, 'server.log'), serverLog)
  if (!up) throw new Error('the server did not answer /submit-event within six minutes')
  console.log(`serving this tree against TEST on ${BASE}`)

  browser = await chromium.launch()
  const visitor = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'en-AU' })
  const page = await visitor.newPage()

  /* ---- the form at each width ---- */
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: width < 768 ? 844 : 1000 })
    await page.goto(`${BASE}/submit-event`, { waitUntil: 'load', timeout: 300000 })
    const overflow = await fits(page)
    await page.screenshot({ path: join(out, `submit-event-${width}.png`), fullPage: true })
    check(`/submit-event at ${width} fits its width (overflow ${overflow}px)`, overflow <= 0, overflow)
  }
  const said = await page.locator('[data-permission-words]').innerText()
  check('the form shows the permission line', said.length > 100, said)

  /* ---- one event sent, as an organiser would, at 390 ---- */
  const fill = async (title, booking, withPhoto = true) => {
    await page.goto(`${BASE}/submit-event`, { waitUntil: 'load', timeout: 300000 })
    await page.fill('#se-title', title)
    await page.fill('#se-starts', '2026-12-05T18:30')
    await page.fill('#se-ends', '2026-12-05T22:00')
    await page.fill('#se-venue-name', 'w2 drive hall')
    await page.fill('#se-venue-address', '1 Drive Street, Ballarat VIC 3350')
    await page.selectOption('#se-city', 'ballarat')
    await page.fill('#se-booking-url', booking)
    await page.selectOption('#se-entry', 'paid')
    await page.fill('#se-price', '25')
    await page.fill('#se-description', 'A night made by the H1 drive on TEST.')
    if (withPhoto) {
      await page.setInputFiles('#se-photo', photoFile)
      await page.check('input[name="photo_owned"]')
    }
    await page.fill('#se-name', 'w2 drive organiser')
    await page.fill('#se-email', `w2-drive-${stamp}@eventlinqs.test`)
    await page.selectOption('#se-role', 'organiser')
    await page.check('input[name="authority"]')
    await page.check('input[name="permission"]')
  }
  await fill(TITLE, 'https://www.humanitix.com/au/events/w2-drive-night')
  await page.locator('[data-submit-event] button[type="submit"]').click()
  await page.waitForSelector('[data-said="sent"], [data-said="problem"]', { timeout: 300000 })
  await page.screenshot({ path: join(out, 'sent-390.png'), fullPage: false })
  const sentText = await page.locator('[data-said]').first().innerText()
  check(`the visitor reads that the event reached us ("${sentText}")`, /reached us/.test(sentText), sentText)

  /* ---- one with an http booking page, past the browser's own check ---- */
  await fill(BAD_TITLE, 'http://example.com/w2-drive')
  await page.evaluate(() => document.querySelector('[data-submit-event]')?.setAttribute('novalidate', ''))
  await page.locator('[data-submit-event] button[type="submit"]').click()
  await page.waitForSelector('[data-said="problem"], [data-said="sent"]', { timeout: 300000 })
  const refused = await page.locator('[data-said]').first().innerText()
  check(`an http booking page is refused with its reason ("${refused}")`, /https/.test(refused), refused)

  /* ---- one with no photo: discovery never waits for an image (the checklist's section K) ---- */
  await fill(BARE_TITLE, 'https://www.humanitix.com/au/events/w2-drive-no-photo', false)
  await page.locator('[data-submit-event] button[type="submit"]').click()
  await page.waitForSelector('[data-said="sent"], [data-said="problem"]', { timeout: 300000 })
  const bareText = await page.locator('[data-said]').first().innerText()
  check(`an event with no photo reaches us too ("${bareText}")`, /reached us/.test(bareText), bareText)
  const bare = (await db.from('listing_submissions').select('photo_path, photo_owned, authority_confirmed').eq('title', BARE_TITLE).maybeSingle()).data
  check('its row has no photo and its authority confirmed', !!bare && bare.photo_path === null && bare.photo_owned === false && bare.authority_confirmed === true, bare)

  /* ---- the rows as the database holds them ---- */
  const { data: rows } = await db.from('listing_submissions').select('*').in('title', [TITLE, BAD_TITLE, BARE_TITLE])
  const row = (rows ?? []).find((r) => r.title === TITLE)
  check('one row was written for the event with a photo, and none for the refused one', !!row && !(rows ?? []).some((r) => r.title === BAD_TITLE), (rows ?? []).map((r) => r.title))
  if (!row) throw new Error('no row to review')
  check(`the row waits, Ballarat, paid from 2500 cents, starting 07:30 UTC (${row.starts_at})`, row.status === 'waiting' && row.city_slug === 'ballarat' && row.entry === 'paid' && row.price_from_cents === 2500 && row.starts_at.startsWith('2026-12-05T07:30'), row)
  check('the permission line is kept word for word, with its moment', row.permission_words === said && !!row.permission_given_at, row.permission_words)
  const { data: stored } = await db.storage.from('listing-submissions').download(row.photo_path)
  check(`the photo is in the private bucket (${row.photo_path}, ${stored?.size ?? 0} bytes)`, !!stored && stored.size > 10000, row.photo_path)
  const open = await fetch(`${url}/storage/v1/object/public/listing-submissions/${row.photo_path}`)
  check(`the photo has no public address (${open.status})`, open.status >= 400, open.status)

  /* ---- the review: anonymous first, then a TEST admin ---- */
  const anon = await fetch(`${BASE}/admin/submissions`, { redirect: 'manual' })
  check(`an anonymous request for /admin/submissions is sent to the sign in (${anon.status})`, anon.status >= 300 && anon.status < 400 && (anon.headers.get('location') ?? '').includes('/admin/login'), anon.status)

  const email = `w2-submissions-admin-${stamp}@eventlinqs.test`
  const password = `${randomUUID()}Aa1`
  const made = await db.auth.admin.createUser({ email, password, email_confirm: true })
  if (made.error) throw new Error(`create the TEST admin: ${made.error.message}`)
  adminId = made.data.user.id
  console.log(`MADE admin ${adminId}`)
  await db.from('profiles').upsert({ id: adminId, email, full_name: 'Window 2 submissions drive', display_name: 'Window 2 submissions drive', is_verified: true })
  const granted = await db.from('admin_users').insert({ id: adminId, role: 'super_admin', display_name: 'Window 2 submissions drive' })
  if (granted.error) throw new Error(`grant the admin role: ${granted.error.message}`)

  const staff = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'en-AU' })
  const admin = await staff.newPage()
  await admin.goto(`${BASE}/admin/login`, { waitUntil: 'domcontentloaded', timeout: 300000 })
  await admin.locator('input[name="email"]').fill(email)
  await admin.locator('input[name="password"]').fill(password)
  await admin.waitForFunction(() => !document.querySelector('button[type="submit"]')?.disabled, undefined, { timeout: 60000 })
  await admin.locator('button[type="submit"]').click()
  await admin.waitForURL((u) => !u.pathname.endsWith('/admin/login'), { timeout: 180000 }).catch(() => {})
  check('the TEST admin signed in', !new URL(admin.url()).pathname.endsWith('/admin/login'), admin.url())

  for (const width of [1440, 768, 390]) {
    await admin.setViewportSize({ width, height: width < 768 ? 844 : 1000 })
    await admin.goto(`${BASE}/admin/submissions`, { waitUntil: 'load', timeout: 300000 })
    const card = admin.locator(`[data-submission="${row.id}"]`)
    const drawn = await card.locator('img').evaluate((img) => img.complete && img.naturalWidth > 0).catch(() => false)
    const overflow = await fits(admin)
    await admin.screenshot({ path: join(out, `admin-submissions-${width}.png`), fullPage: false })
    check(`at ${width} the admin sees the event with its photo drawn (overflow ${overflow}px)`, (await card.count()) === 1 && drawn && overflow <= 0, { drawn, overflow })
  }
  await admin.locator(`[data-submission="${row.id}"] form`).first().locator('button[type="submit"]').click()
  await admin.waitForSelector('[role="status"]', { timeout: 300000 })
  const after = (await db.from('listing_submissions').select('status, reviewed_by, reviewed_at').eq('id', row.id).single()).data
  check('Accept writes the row accepted, by the admin, with its moment', after?.status === 'accepted' && after?.reviewed_by === adminId && !!after?.reviewed_at, after)
  const { count: audited } = await db.from('audit_log').select('id', { count: 'exact', head: true }).eq('action', 'admin.submissions.accept').eq('target_id', row.id)
  check(`the acceptance is in the audit log (${audited})`, audited === 1, audited)
} catch (e) {
  fails += 1
  console.log(`FAIL the drive stopped: ${e instanceof Error ? e.message : String(e)}`)
} finally {
  if (browser) await browser.close().catch(() => {})
  if (server?.pid) spawnSync('taskkill', ['/PID', String(server.pid), '/T', '/F'], { stdio: 'ignore' })
  /* ---- everything it made, removed and read back gone ---- */
  const { data: mine } = await db.from('listing_submissions').select('id, photo_path').in('title', [TITLE, BAD_TITLE, BARE_TITLE])
  if ((mine ?? []).length > 0) {
    await db.storage.from('listing-submissions').remove(mine.map((r) => r.photo_path).filter(Boolean))
    await db.from('listing_submissions').delete().in('id', mine.map((r) => r.id))
  }
  if (adminId) {
    // The audit log is append only and keeps its lines; deleting the user sets their actor to null.
    await db.from('admin_users').delete().eq('id', adminId)
    await db.from('profiles').delete().eq('id', adminId)
    const gone = await tearDownAccount(db, adminId)
    console.log(`${gone.gone ? 'PASS' : 'FAIL'} ${gone.detail}`)
    if (!gone.gone) fails += 1
  }
  const { count: left } = await db.from('listing_submissions').select('id', { count: 'exact', head: true }).in('title', [TITLE, BAD_TITLE, BARE_TITLE])
  const adminLeft = adminId ? (await db.from('admin_users').select('id', { count: 'exact', head: true }).eq('id', adminId)).count : 0
  console.log(`CLEANED rows_left ${left ?? 'unread'}, admin_left ${adminLeft ?? 'unread'}`)
  if (left !== 0 || adminLeft !== 0) fails += 1
}
console.log(fails === 0 ? 'DRIVE PASSED' : `DRIVE FAILED, ${fails} check(s)`)
process.exit(fails === 0 ? 0 : 1)
