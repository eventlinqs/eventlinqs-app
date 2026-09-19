/**
 * DRIVEN PROOF: NO ROUTE MAKES THE DOCUMENT WIDER THAN THE PHONE.
 *
 * ============================================================================
 * THE DEFECT THIS WAS WRITTEN FOR, and it is not the one anybody looks for.
 * ============================================================================
 *
 * A `<label class="sr-only">` is `position: absolute`. An absolutely positioned
 * element is clipped by an ancestor's `overflow` ONLY when that ancestor is its
 * CONTAINING BLOCK, and `overflow` alone does not create one: a container needs
 * `position: relative` (or a transform, a filter, or `contain`) for that.
 *
 * So a screen-reader label inside a horizontally scrolling table ESCAPES the
 * scroller and is laid out at its position in the FULL table width. Measured on
 * /admin/users at 390 on 19 September 2026:
 *
 *     the scroller               clientWidth 340, scrollWidth 720, overflow-x auto
 *     the sr-only label          left 568, right 569, position absolute
 *     documentElement.scrollWidth 569 against an innerWidth of 390
 *     the same page with `position: relative` on the scroller -> 390
 *
 * /admin/events, whose rows carry a "Reason for ..." label per action, had 65 of
 * them and measured 594. /admin/orders, with byte-identical table markup and no
 * sr-only label inside it, measured 390. That control is what turned a suspicion
 * into a cause.
 *
 * WHAT A PERSON SEES. Under mobile emulation the layout viewport expands to fit
 * the document, so the whole admin screen renders at about 69 per cent and every
 * label, row and control shrinks with it. The accessibility affordance breaks
 * the layout, which is why nobody goes looking for it there.
 *
 * ============================================================================
 * WHAT IT MEASURES, AND WHY NOT THROUGH THE SHARED VIEWPORT-FIT RULE
 * ============================================================================
 *
 * scripts/verify/lib/viewport-fit.mjs answers a different question well: which
 * ELEMENT is cut off. Its exemption 2 passes anything with a horizontally
 * scrolling ANCESTOR, on the correct reasoning that a rail is reachable by
 * swiping the rail. This defect defeats that exemption exactly: the label has a
 * scrolling ancestor and is NOT inside it, so swiping the container never
 * reaches it, and it is the document rather than the element that is wrong.
 *
 * So this drive asserts the document, and when it fails it NAMES the escapees:
 * absolutely positioned elements whose nearest overflow ancestor is not their
 * containing block.
 *
 * The 390 context is deliberately NOT mobile-emulated. A mobile context grows
 * its own layout viewport to fit an oversized document, so `innerWidth` becomes
 * the very number under test and the comparison can never fail. A desktop
 * context at 390 holds the viewport still and lets the document be wrong.
 * A mobile-emulated screenshot is taken beside it, because that zoomed-out page
 * is what the operator actually sees.
 *
 * Usage (the shell must not carry the production Supabase URL):
 *   BASE=http://localhost:3200 node --env-file=.env.local \
 *     scripts/verify/mobile-viewport-width-drive.mjs --out C:/dev/EVIDENCE/VIEWPORT-WIDTH
 *     [--admin] [--url /admin/users] [--shot /admin/users]
 *
 * With no --url it drives its own two lists: every public route without a
 * dynamic segment, and (with --admin) every admin route without one.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { chromium } from 'playwright'

const args = process.argv.slice(2)
let out = 'C:/dev/EVIDENCE/VIEWPORT-WIDTH'
let wantAdmin = false
let label = 'green'
const urls = []
const shots = []
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === '--out') out = args[++i]
  if (args[i] === '--admin') wantAdmin = true
  if (args[i] === '--label') label = args[++i]
  if (args[i] === '--url') urls.push(args[++i])
  if (args[i] === '--shot') shots.push(args[++i])
}
out = join(out, label)
mkdirSync(out, { recursive: true })

const BASE = (process.env.BASE ?? 'http://localhost:3200').replace(/\/$/, '')
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
if (/gndnldyfudbytbboxesk/.test(SUPABASE_URL)) {
  console.error('refusing to run against production')
  process.exit(1)
}

/** Public routes with no dynamic segment, enumerated from src/app rather than guessed. */
const PUBLIC_ROUTES = [
  '/', '/about', '/artists', '/careers', '/cities', '/communities', '/contact',
  '/events', '/feed', '/for-organisers', '/forecast', '/gigs', '/guides', '/help',
  '/legal/accessibility', '/legal/cookies', '/legal/organiser-terms',
  '/legal/privacy', '/legal/refunds', '/legal/terms', '/login', '/organisers',
  '/organisers/signup', '/press', '/pricing', '/signup', '/this-weekend',
  '/waitlist', '/forgot-password',
]

/*
 * TWO PUBLIC ROUTES EXIST AND ANSWER 404 ON TEST BY DESIGN, and they are named
 * here rather than quietly dropped from the list. src/app/artists/page.tsx calls
 * notFound() unless the `artist_showcase` flag is on and src/app/gigs/page.tsx
 * does the same for `gig_board`; both are off on TEST. A 404 from one of these is
 * reported as a NOTE, never as a pass, because a route that was not measured must
 * not be counted as one that was.
 */
const FLAG_GATED = new Map([
  ['/artists', 'src/app/artists/page.tsx: notFound() unless the artist_showcase flag is on'],
  ['/gigs', 'src/app/gigs/page.tsx: notFound() unless the gig_board flag is on'],
])

/** Admin routes with no dynamic segment. Every one needs the session below. */
const ADMIN_ROUTES = [
  '/admin', '/admin/analytics', '/admin/attribution', '/admin/audience',
  '/admin/audit', '/admin/campaigns', '/admin/disputes', '/admin/events',
  '/admin/events?q=' + encodeURIComponent('Night, Geelong'),
  '/admin/flags', '/admin/health', '/admin/kyc', '/admin/marketplace',
  '/admin/matches', '/admin/network', '/admin/notifications', '/admin/orders',
  '/admin/orders/unfulfilled', '/admin/organisers', '/admin/payouts',
  '/admin/pricing', '/admin/refunds', '/admin/search?q=a', '/admin/staff',
  '/admin/users', '/admin/users?q=' + encodeURIComponent('Smith, John'),
  '/admin/venues',
]

const routes = urls.length > 0 ? urls : [...PUBLIC_ROUTES, ...(wantAdmin ? ADMIN_ROUTES : [])]

const WIDTHS = [390, 768, 1440]

const checks = []
const failures = []
const notes = []
function check(id, ok, detail) {
  checks.push({ id, ok, detail })
  if (!ok) failures.push(`${id}: ${detail}`)
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${id}  ${detail}`)
}

/**
 * Evaluated in the page. Returns the document width against the viewport and,
 * when they disagree, the absolutely positioned elements that escaped a
 * scroller because the scroller is not their containing block.
 */
const MEASURE = `() => {
  const iw = window.innerWidth
  const doc = document.documentElement.scrollWidth
  const body = document.body.scrollWidth
  const CREATES_A_CONTAINING_BLOCK = (cs) =>
    cs.position !== 'static' ||
    cs.transform !== 'none' ||
    cs.filter !== 'none' ||
    cs.perspective !== 'none' ||
    (cs.contain || '').includes('paint') ||
    (cs.contain || '').includes('layout') ||
    cs.willChange === 'transform'
  const escapees = []
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el)
    if (cs.position !== 'absolute') continue
    const box = el.getBoundingClientRect()
    if (box.right + window.scrollX <= iw + 1) continue
    let clipper = null
    for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
      const ncs = getComputedStyle(n)
      if (ncs.overflowX !== 'visible') { clipper = { node: n, cs: ncs }; break }
    }
    if (!clipper) continue
    if (CREATES_A_CONTAINING_BLOCK(clipper.cs)) continue
    const cls = typeof el.className === 'string' ? el.className.slice(0, 50) : ''
    const clipperCls = typeof clipper.node.className === 'string' ? clipper.node.className.slice(0, 60) : ''
    escapees.push({
      tag: el.tagName.toLowerCase(),
      cls,
      text: (el.textContent || '').trim().slice(0, 40),
      right: Math.round(box.right + window.scrollX),
      clipper: clipper.node.tagName.toLowerCase() + ' class="' + clipperCls + '"',
      clipperOverflowX: clipper.cs.overflowX,
    })
  }
  const seen = new Set()
  const unique = []
  for (const e of escapees) {
    const key = e.clipper + '|' + e.cls
    if (seen.has(key)) continue
    seen.add(key)
    unique.push({ ...e, sameClipper: escapees.filter((o) => o.clipper === e.clipper).length })
  }
  return { iw, doc, body, escapees: unique.slice(0, 5), escapeeCount: escapees.length }
}`

let adminEmail = null
let adminUserId = null
let db = null
let browser = null

try {
  if (wantAdmin) {
    if (!SUPABASE_URL || !SERVICE_KEY) {
      console.error('FAIL: --admin needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY')
      process.exit(1)
    }
    db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
    adminEmail = `lane-c-viewport-${Date.now().toString(36)}@eventlinqs.test`
    const password = `${randomUUID()}Aa1`
    const created = await db.auth.admin.createUser({ email: adminEmail, password, email_confirm: true })
    if (created.error) throw new Error(`create admin auth user: ${created.error.message}`)
    adminUserId = created.data.user.id
    await db.from('profiles').upsert({
      id: adminUserId,
      email: adminEmail,
      full_name: 'Lane C viewport drive',
      display_name: 'Lane C viewport drive',
      is_verified: true,
    })
    const { error: auErr } = await db
      .from('admin_users')
      .insert({ id: adminUserId, role: 'super_admin', display_name: 'Lane C viewport drive' })
    if (auErr) throw new Error(`admin_users insert: ${auErr.message}`)
    globalThis.__adminPassword = password
  }

  browser = await chromium.launch()
  for (const width of WIDTHS) {
    // NOT mobile-emulated: see the header. A mobile context grows its own layout
    // viewport to fit an oversized document, which is the number under test.
    const ctx = await browser.newContext({ viewport: { width, height: 900 }, locale: 'en-AU' })
    const page = await ctx.newPage()

    if (wantAdmin) {
      await page.goto(`${BASE}/admin/login`, { waitUntil: 'domcontentloaded', timeout: 180000 })
      await page.locator('input[name="email"]').fill(adminEmail)
      await page.locator('input[name="password"]').fill(globalThis.__adminPassword)
      await page.waitForFunction(
        () => !document.querySelector('button[type="submit"]')?.disabled,
        undefined,
        { timeout: 60000 },
      )
      await page.locator('button[type="submit"]').click()
      await page.waitForURL(u => !u.pathname.endsWith('/admin/login'), { timeout: 120000 }).catch(() => {})
      if (new URL(page.url()).pathname.endsWith('/admin/login')) {
        check(`${width}.login`, false, 'admin sign-in refused; no admin route was measured')
        await ctx.close()
        continue
      }
    }

    for (const route of routes) {
      const response = await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded', timeout: 180000 })
      const status = response?.status() ?? 0
      if (status !== 200) {
        const gated = FLAG_GATED.get(route)
        if (gated && status === 404) {
          notes.push(`${width}${route}: 404 and NOT MEASURED. ${gated}`)
          console.log(`  NOTE  ${width}${route}  404 and NOT MEASURED. ${gated}`)
          continue
        }
        check(`${width}${route}`, false, `answered ${status} and could not be measured`)
        continue
      }
      await page.waitForLoadState('networkidle', { timeout: 45000 }).catch(() => {})
      // A string is evaluated as an EXPRESSION, so it is invoked here rather
      // than handed over as a function object. The first version passed the bare
      // string and read `.doc` off a function.
      const m = await page.evaluate(`(${MEASURE})()`)
      const ok = m.doc <= m.iw + 1
      const escaped = m.escapeeCount > 0
        ? ` ${m.escapeeCount} escapee(s), worst ${m.escapees.map(e => `<${e.tag} class="${e.cls}"> right=${e.right} out of ${e.clipper} (overflow-x ${e.clipperOverflowX})`).join(' | ')}`
        : ''
      check(
        `${width}${route}`,
        ok,
        `documentElement.scrollWidth ${m.doc} against innerWidth ${m.iw}${escaped}`,
      )
    }
    await ctx.close()
  }

  /* The mobile-emulated picture, for the routes named with --shot. */
  if (shots.length > 0) {
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      locale: 'en-AU',
      isMobile: true,
      hasTouch: true,
    })
    const page = await ctx.newPage()
    if (wantAdmin) {
      await page.goto(`${BASE}/admin/login`, { waitUntil: 'domcontentloaded', timeout: 180000 })
      await page.locator('input[name="email"]').fill(adminEmail)
      await page.locator('input[name="password"]').fill(globalThis.__adminPassword)
      await page.waitForFunction(() => !document.querySelector('button[type="submit"]')?.disabled, undefined, { timeout: 60000 })
      await page.locator('button[type="submit"]').click()
      await page.waitForURL(u => !u.pathname.endsWith('/admin/login'), { timeout: 120000 }).catch(() => {})
    }
    for (const route of shots) {
      await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded', timeout: 180000 })
      await page.waitForLoadState('networkidle', { timeout: 45000 }).catch(() => {})
      const inner = await page.evaluate(() => window.innerWidth)
      const name = route.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'root'
      await page.screenshot({ path: join(out, `mobile-${name}.png`), fullPage: true })
      check(
        `mobile390${route}.layout-viewport`,
        inner === 390,
        `a 390 phone laid the page out at ${inner} CSS pixels${inner === 390 ? '' : `, so it renders at ${Math.round((390 / inner) * 100)} per cent`}`,
      )
    }
    await ctx.close()
  }
} finally {
  if (browser) await browser.close().catch(() => {})
  if (db && adminUserId) {
    await db.from('admin_users').delete().eq('id', adminUserId)
    await db.from('profiles').delete().eq('id', adminUserId)
    await db.auth.admin.deleteUser(adminUserId).catch(() => {})
    const { data: left } = await db.from('admin_users').select('id').eq('id', adminUserId)
    check('cleanup.admin', (left ?? []).length === 0, `${(left ?? []).length} fixture admin row(s) left`)
  }
}

writeFileSync(join(out, 'drive.json'), `${JSON.stringify({ base: BASE, label, checks, failures, notes }, null, 2)}\n`)
for (const n of notes) console.log(`  NOTE ${n}`)
const passed = checks.filter(c => c.ok).length
console.log(`\n[mobile-viewport-width-drive] ${passed} of ${checks.length} checks passed`)
if (failures.length > 0) {
  for (const f of failures) console.error(`  FAIL ${f}`)
  process.exit(1)
}
