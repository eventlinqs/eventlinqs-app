/**
 * AUTH-03 ON A DEPLOYED TEST PREVIEW (30 October 2026, car 13; the project manager's 15:24 step 3): an admin with no
 * enrolled second factor signs in through the real /admin/login, reaches enrolment, and is refused everything else.
 *
 *   node --env-file=<a TEST env file> scripts/verify/auth03-unenrolled-admin-drive.mjs https://<a TEST preview of main>
 *
 * Production holds no un-enrolled admin (window 4's read of 30 October 12:28) and making one there would be a production
 * write, so the refusal is proved on a preview deployment that serves main's code against the TEST project. Writes only
 * to TEST: one admin account of its own with no second factor, removed at the end, pass or fail.
 *
 * Checks: sign-in lands on /admin/enrol-2fa and the enrolment page is served; /admin/today and /admin/health each send it
 * back to /admin/enrol-2fa, never an error page and never admin data (fix/w1-auth03-enrol-redirect; car 14's preview, which
 * has no such redirect, is this drive's known positive: it must FAIL there); the account is gone after. Each check prints
 * PASS or FAIL; the last line is the verdict.
 * Evidence: DRIVE_OUT (default C:\dev\EVIDENCE\WI1\auth03-preview), drive.json and a screenshot of each stop.
 */
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { assertNotProduction } from '../lib/production-write-preflight.mjs'
import { tearDownAccountOrFailTheRun } from './lib/teardown-account.mjs'

assertNotProduction()

const TAG = '[auth03-unenrolled-admin]'
const BASE = (process.argv.slice(2).find((a) => a.startsWith('https://')) ?? '').replace(/\/$/, '')
if (!BASE || /eventlinqs\.com(\.au)?$/.test(new URL(BASE).hostname)) throw new Error('give a TEST preview URL (https://...vercel.app), never production')
const OUT = process.env.DRIVE_OUT ?? join('C:', 'dev', 'EVIDENCE', 'WI1', 'auth03-preview')
const CRAWLER = 'EventLinqs-QA-crawler (auth03-unenrolled-admin-drive, window 1)'

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
if (!URL_ || !SERVICE) throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
if (!/vkapkibzokmfaxqogypq/.test(URL_) || /gndnldyfudbytbboxesk/.test(URL_)) throw new Error(`refusing ${URL_}: this drive runs against TEST only`)

const db = createClient(URL_, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } })
const created = { userId: null }
const results = []
let failures = 0
const check = (name, ok, detail) => {
  results.push({ name, ok: Boolean(ok), detail })
  if (!ok) failures++
  console.log(`${TAG} ${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : `: ${JSON.stringify(detail)}`}`)
}

let browser = null
const evidence = { startedAt: new Date().toISOString(), base: BASE }
try {
  mkdirSync(OUT, { recursive: true })
  const email = `w1-auth03-${Date.now().toString(36)}@eventlinqs.test`
  const password = `${randomUUID()}Aa1`
  const made = await db.auth.admin.createUser({ email, password, email_confirm: true })
  if (made.error) throw new Error(`create the admin auth user: ${made.error.message}`)
  created.userId = made.data.user.id
  await db.from('profiles').upsert({ id: created.userId, email, full_name: 'W1 AUTH-03 drive', display_name: 'W1 AUTH-03 drive', is_verified: true })
  const granted = await db.from('admin_users').insert({ id: created.userId, role: 'super_admin', display_name: 'W1 AUTH-03 drive' })
  if (granted.error) throw new Error(`grant the admin role: ${granted.error.message}`)
  const row = await db.from('admin_users').select('totp_secret_encrypted').eq('id', created.userId).single()
  check('the TEST admin has NO enrolled second factor', !row.error && row.data.totp_secret_encrypted === null, row.error?.message ?? row.data)

  browser = await chromium.launch()
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'en-AU', userAgent: `Mozilla/5.0 (iPhone) ${CRAWLER}` })
  const page = await context.newPage()
  await page.goto(`${BASE}/admin/login`, { waitUntil: 'domcontentloaded', timeout: 180000 })
  await page.locator('input[name="email"]').fill(email)
  await page.locator('input[name="password"]').fill(password)
  await page.waitForFunction(() => !document.querySelector('button[type="submit"]')?.disabled, undefined, { timeout: 60000 })
  await page.locator('button[type="submit"]').click()
  await page.waitForURL((u) => !u.pathname.endsWith('/admin/login'), { timeout: 120000 }).catch(() => {})
  const landed = new URL(page.url()).pathname
  await page.screenshot({ path: join(OUT, '1-after-sign-in.png') })
  check('sign-in on the password alone lands on /admin/enrol-2fa', landed === '/admin/enrol-2fa', page.url())
  const enrolBody = (await page.locator('main').innerText().catch(() => '')).toLowerCase()
  check('the enrolment page is served to it (the allowance the bootstrap proof keeps)', /authenticator|qr|six-digit|6-digit/.test(enrolBody), enrolBody.slice(0, 200))

  for (const path of ['/admin/today', '/admin/health']) {
    await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout: 180000 })
    const ended = new URL(page.url()).pathname
    await page.screenshot({ path: join(OUT, `2${path.replace(/\//g, '-')}.png`) })
    const body = (await page.locator('body').innerText().catch(() => '')).toLowerCase()
    check(`${path} REFUSES it: the visit ends on /admin/enrol-2fa`, ended === '/admin/enrol-2fa', page.url())
    check(`${path} shows it no error page`, !/something went wrong|hit a snag/.test(body), body.slice(0, 200))
  }
  await context.close()
} catch (error) {
  check('the drive ran to its end', false, error.message)
} finally {
  if (browser) await browser.close().catch(() => {})
  try {
    if (created.userId) {
      await db.from('admin_users').delete().eq('id', created.userId)
      await tearDownAccountOrFailTheRun(db, created.userId)
      const gone = await db.from('admin_users').select('id').eq('id', created.userId)
      check('the drive left no admin of its own on TEST', !gone.error && (gone.data ?? []).length === 0)
    }
  } catch (error) {
    check('the drive left no admin of its own on TEST', false, `cleanup failed: ${error.message}`)
  }
}

evidence.results = results
evidence.finishedAt = new Date().toISOString()
mkdirSync(OUT, { recursive: true })
writeFileSync(join(OUT, 'drive.json'), JSON.stringify(evidence, null, 2))
console.log(`${TAG} ${failures === 0 ? 'DRIVE PASSED' : `DRIVE FAILED, ${failures} of ${results.length}`} (${results.length} checks; ${join(OUT, 'drive.json')})`)
process.exitCode = failures === 0 ? 0 : 1
