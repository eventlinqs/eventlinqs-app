/**
 * /admin/collected, ON A PHONE, A TABLET AND A DESK: 390, 768 AND 1440 (the engine plan of 28 October 2026,
 * part E; window 4). TEST ONLY.
 *
 *   node --env-file=.env.local scripts/verify/admin-collected-pages-drive.mjs http://localhost:3344 (localhost, not 127.0.0.1: next dev refuses its own chunks to another origin)
 *
 * Signs in as a throwaway TEST admin (made here, removed in the finally, as admin-tables-fit-drive.mjs does), opens
 * the exception queue and the source register at each width, and judges what a person meets: the three sections
 * (the queue, the partner feed form, the register) are there; nothing is wider than the screen; every control in the
 * partner feed form has a label; and every link the page draws answers 200 or a redirect. A full page screenshot of
 * each width lands in the evidence folder. It reads TEST's own rows and plants none, so the counts it prints are
 * TEST's real queue and register at the minute it ran.
 */
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { assertNotProduction } from '../lib/production-write-preflight.mjs'
import { tearDownAccountOrFailTheRun } from './lib/teardown-account.mjs'

assertNotProduction()

const TAG = '[admin-collected-pages]'
const BASE = process.argv.slice(2).find((a) => a.startsWith('http')) ?? 'http://localhost:3344'
const OUT = process.env.DRIVE_OUT ?? join('C:', 'dev', 'EVIDENCE', 'SUPPLY-29OCT', 'pages')
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL_ || !SERVICE) throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
if (!/vkapkibzokmfaxqogypq/.test(URL_)) throw new Error(`refusing to write to ${URL_}: this drive runs against TEST only`)

const VIEWPORTS = [
  { label: '390', width: 390, height: 844 },
  { label: '768', width: 768, height: 1024 },
  { label: '1440', width: 1440, height: 900 },
]

const db = createClient(URL_, SERVICE, { auth: { persistSession: false } })
const results = []
let failures = 0
function check(name, ok, detail = '') {
  results.push({ name, ok, detail })
  if (!ok) failures += 1
  console.log(`${TAG} ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' - ' + detail : ''}`)
}

mkdirSync(OUT, { recursive: true })
const created = { userId: null }
try {
  const stamp = Date.now()
  const email = `w4-collected-pages-${stamp}@eventlinqs.test`
  const password = `${randomUUID()}Aa1`
  const made = await db.auth.admin.createUser({ email, password, email_confirm: true })
  if (made.error) throw new Error(`create the admin auth user: ${made.error.message}`)
  created.userId = made.data.user.id
  const profile = await db.from('profiles').upsert({ id: created.userId, email, full_name: 'Window 4 collected pages drive', display_name: 'Window 4 collected pages drive', is_verified: true })
  if (profile.error) throw new Error(`write the admin profile: ${profile.error.message}`)
  const granted = await db.from('admin_users').insert({ id: created.userId, role: 'super_admin', display_name: 'Window 4 collected pages drive' })
  if (granted.error) throw new Error(`grant the admin role: ${granted.error.message}`)

  const { count: waitingInDb, error: countError } = await db.from('listing_candidates').select('id', { count: 'exact', head: true }).eq('status', 'waiting')
  if (countError) throw new Error(`count TEST's waiting rows: ${countError.message}`)
  console.log(`${TAG} TEST holds ${waitingInDb} waiting row(s), read before the page`)

  const browser = await chromium.launch()
  const hrefs = new Set()
  try {
    for (const vp of VIEWPORTS) {
      const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1, isMobile: vp.width < 768, hasTouch: vp.width < 768, locale: 'en-AU' })
      const page = await context.newPage()
      await page.goto(`${BASE}/admin/login`, { waitUntil: 'domcontentloaded', timeout: 180000 })
      await page.locator('input[name="email"]').fill(email)
      await page.locator('input[name="password"]').fill(password)
      await page.waitForFunction(() => !document.querySelector('button[type="submit"]')?.disabled, undefined, { timeout: 60000 })
      await page.locator('button[type="submit"]').click()
      await page.waitForURL((u) => !u.pathname.endsWith('/admin/login'), { timeout: 120000 }).catch(() => {})
      if (new URL(page.url()).pathname.endsWith('/admin/login')) {
        check(`${vp.label} the drive signed in`, false, 'admin sign-in refused; nothing was judged at this width')
        await context.close()
        continue
      }

      const res = await page.goto(`${BASE}/admin/collected`, { waitUntil: 'load', timeout: 180000 })
      check(`${vp.label} /admin/collected answers 200`, res?.status() === 200, `status ${res?.status()}`)
      const read = await page.evaluate(() => {
        const h2 = [...document.querySelectorAll('h2')].map((h) => h.textContent?.trim() ?? '')
        const form = document.querySelector('[data-partner-feed-form]')
        const controls = form ? [...form.querySelectorAll('input:not([type="hidden"]), select, textarea')] : []
        const unlabelled = controls
          .filter((c) => {
            const id = c.getAttribute('id')
            const byFor = id ? document.querySelector(`label[for="${CSS.escape(id)}"]`) : null
            return !(byFor || c.closest('label') || c.getAttribute('aria-label') || c.getAttribute('aria-labelledby'))
          })
          .map((c) => c.getAttribute('name') ?? c.tagName)
        const wide = [...document.querySelectorAll('body *')]
          .filter((el) => {
            const r = el.getBoundingClientRect()
            if (r.width === 0 || r.right <= document.documentElement.clientWidth + 1) return false
            for (let p = el.parentElement; p; p = p.parentElement) {
              const o = getComputedStyle(p).overflowX
              if (o === 'auto' || o === 'scroll' || o === 'hidden') return false
            }
            return true
          })
          .slice(0, 5)
          .map((el) => `${el.tagName.toLowerCase()}${el.className ? '.' + String(el.className).split(' ')[0] : ''}`)
        const num = (t) => Number((/(\d+)/.exec(t ?? '') ?? [])[1] ?? NaN)
        const note = document.querySelector('[data-queue-note]')?.textContent ?? ''
        return {
          heading: num([...document.querySelectorAll('h2')].find((h) => h.textContent?.startsWith('Waiting for review'))?.textContent?.replace(/^[^(]*/, '')),
          tiles: [...document.querySelectorAll('[data-horizons] [data-horizon]')].map((li) => num(li.textContent?.split(':').pop())),
          beyond: num((/(\d+) more than 90 days ahead/.exec(note) ?? [])[1]),
          past: num((/(\d+) whose night has passed/.exec(note) ?? [])[1]),
          pastRowsDrawn: document.querySelectorAll('[data-candidate][data-horizon="past"]').length,
          rowsDrawn: document.querySelectorAll('[data-candidate]').length,
          h1: document.querySelector('h1')?.textContent?.trim() ?? '',
          h2,
          controls: controls.length,
          unlabelled,
          pageWider: document.documentElement.scrollWidth > document.documentElement.clientWidth,
          wide,
          links: [...document.querySelectorAll('a[href]')].map((a) => a.getAttribute('href')),
        }
      })
      check(`${vp.label} the page is "Collected events"`, read.h1 === 'Collected events', read.h1)
      const beyond = Number.isNaN(read.beyond) ? 0 : read.beyond
      const past = Number.isNaN(read.past) ? 0 : read.past
      const tileSum = read.tiles.reduce((a, n) => a + n, 0)
      check(`${vp.label} the heading's figure is the three horizons plus those beyond 90 days`, read.heading === tileSum + beyond, `heading ${read.heading}, tiles ${read.tiles.join('+')}, beyond ${beyond}`)
      check(`${vp.label} no night that has passed is offered for review`, read.pastRowsDrawn === 0, `${read.pastRowsDrawn} drawn`)
      check(`${vp.label} the heading and the passed nights add up to every waiting row in the database`, read.heading + past === waitingInDb, `heading ${read.heading} + passed ${past}, database ${waitingInDb}`)
      check(`${vp.label} the rows drawn never exceed the figure stated`, read.rowsDrawn <= read.heading, `${read.rowsDrawn} drawn`)
      const queue = read.h2.find((t) => t.startsWith('Waiting for review'))
      const register = read.h2.find((t) => t.startsWith('The source register'))
      check(`${vp.label} the exception queue is drawn`, Boolean(queue), queue ?? 'absent')
      check(`${vp.label} the partner feed form is drawn with its controls`, read.h2.includes("Add a partner's own feed") && read.controls > 0, `${read.controls} control(s)`)
      check(`${vp.label} every partner feed control has a label`, read.unlabelled.length === 0, read.unlabelled.join(', '))
      check(`${vp.label} the source register is drawn`, Boolean(register), register ?? 'absent')
      check(`${vp.label} nothing is wider than the screen`, !read.pageWider && read.wide.length === 0, read.wide.join(', '))
      for (const h of read.links) if (h && h.startsWith('/') && !h.startsWith('//')) hrefs.add(h.split('#')[0])
      await page.screenshot({ path: join(OUT, `admin-collected-${vp.label}.png`), fullPage: true })
      console.log(`${TAG} ${vp.label} ${queue}; ${register}; screenshot ${join(OUT, `admin-collected-${vp.label}.png`)}`)

      if (vp.label === '1440') {
        const cookies = await context.cookies()
        const cookie = cookies.map((c) => `${c.name}=${c.value}`).join('; ')
        for (const href of [...hrefs].sort()) {
          const r = await fetch(`${BASE}${href}`, { redirect: 'manual', headers: { cookie } })
          check(`link ${href} answers`, r.status === 200 || (r.status >= 300 && r.status < 400), `status ${r.status}`)
        }
      }
      await context.close()
    }
  } finally {
    await browser.close()
  }
} finally {
  try {
    if (created.userId) {
      const gone = await db.from('admin_users').delete().eq('id', created.userId)
      if (gone.error) console.error(`${TAG} cleanup: admin_users row: ${gone.error.message}`)
      await tearDownAccountOrFailTheRun(db, created.userId)
    }
  } catch (error) {
    console.error(`${TAG} cleanup failed: ${error.message}`)
    failures += 1
  }
}

writeFileSync(join(OUT, 'admin-collected-result.json'), JSON.stringify({ base: BASE, results }, null, 2))
if (failures) {
  console.error(`${TAG} FAIL - ${failures} of ${results.length}`)
  process.exit(1)
}
console.log(`${TAG} PASS - ${results.length} of ${results.length}`)
