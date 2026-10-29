/**
 * /ADMIN/SOCIAL FROM THE FOUNDER'S PHONE, AND AT 768 AND 1440 (the release checklist of 28 October 2026, A1's
 * browser half and A6, B4): one admin, signed in through the real login, presses Plan this week twice and the week
 * still holds ONE campaign with the same pieces; then every approved-or-waiting asset is usable from a 390 wide
 * screen: each slide and card downloads as an image at its native size, each caption and message copies exactly,
 * and each piece's link opens.
 *
 *   node --env-file=<a TEST env file> scripts/verify/social-admin-phone-drive.mjs --serve --port=3310
 *
 * Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY for the TEST project (vkapkibzokmfaxqogypq), a
 * production build in this tree (next build) when --serve is given, and Playwright's chromium. Writes only to TEST:
 * one admin account of its own (removed at the end, pass or fail), the plan presses (which find the week's campaign
 * and plan any missing posts, as Lawal's press would) and their audit rows.
 *
 * LINKS ARE JUDGED WITHOUT COUNTING ANYTHING. A piece links to https://www.eventlinqs.com.au; nothing of production
 * is fetched. A page link is opened at the same path on the local TEST server, with a crawler user agent. A tracked
 * /e/ link is never followed (it would count a click): its code is read back from TEST's share_links, its night
 * published. /out, /s and /go are never requested.
 *
 * Evidence: DRIVE_OUT (default C:\dev\EVIDENCE\CREATIVE-ENGINE-28OCT\admin-social-phone): a screenshot per width,
 * drive.json with every check. Each check prints PASS or FAIL; the last line is the verdict.
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

const TAG = '[admin-social-phone]'
const args = process.argv.slice(2)
const SERVE = args.includes('--serve')
const PORT = Number(args.find((a) => a.startsWith('--port='))?.split('=')[1] ?? 3310)
const OUT = process.env.DRIVE_OUT ?? join('C:', 'dev', 'EVIDENCE', 'CREATIVE-ENGINE-28OCT', 'admin-social-phone')
let BASE = args.find((a) => a.startsWith('http')) ?? `http://127.0.0.1:${PORT}`
const CRAWLER = 'EventLinqs-QA-crawler (admin-social-phone-drive)'
const SITE = 'https://www.eventlinqs.com.au'

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
if (!URL_ || !SERVICE) throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
if (!/vkapkibzokmfaxqogypq/.test(URL_) || /gndnldyfudbytbboxesk/.test(URL_)) throw new Error(`refusing ${URL_}: this drive runs against TEST only`)

const VIEWPORTS = [
  { label: '390', width: 390, height: 844 },
  { label: '768', width: 768, height: 1024 },
  { label: '1440', width: 1440, height: 900 },
]
/*
 * The sizes each download is drawn at. The 4:5 portrait is laid out at 1080 x 1350 and rastered at 1440 x 1800, the
 * resolution src/lib/broadcast/social-card-spec.ts cites for a 4:5 feed image
 * (https://www.facebook.com/business/help/469767027114079, and the Graph API's 1440 maximum width); square and story
 * as laid out. The first run expected 1080 x 1350 from the directive's presets and was wrong about the product.
 */
const SIZE = { feed: [1440, 1800], square: [1080, 1080], story: [1080, 1920] }

const db = createClient(URL_, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } })
const created = { userId: null }
const results = []
let failures = 0
function check(name, ok, detail = '') {
  results.push({ name, ok: Boolean(ok), detail })
  if (!ok) failures++
  console.log(`${TAG} ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' - ' + detail : ''}`)
}

/** Width and height of a PNG or JPEG from its own bytes, or null. */
export function imageSize(buf) {
  if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) return [buf.readUInt32BE(16), buf.readUInt32BE(20)]
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) return null
      const marker = buf[i + 1]
      const len = buf.readUInt16BE(i + 2)
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return [buf.readUInt16BE(i + 7), buf.readUInt16BE(i + 5)]
      i += 2 + len
    }
  }
  return null
}

/** The Monday of this week in Melbourne, as the planner keys its campaign (campaign.ts weekStartOf). */
function weekStartMelbourne(now) {
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Melbourne', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
  const d = new Date(`${day}T00:00:00Z`)
  const back = (d.getUTCDay() + 6) % 7
  d.setUTCDate(d.getUTCDate() - back)
  return d.toISOString().slice(0, 10)
}

async function weekState(weekStart) {
  const camp = await db.from('social_campaigns').select('id').eq('week_start', weekStart)
  if (camp.error) throw new Error(`read social_campaigns: ${camp.error.message}`)
  const ids = (camp.data ?? []).map((c) => c.id)
  let pieces = []
  if (ids.length > 0) {
    const p = await db.from('social_pieces').select('id').in('campaign_id', ids)
    if (p.error) throw new Error(`read social_pieces: ${p.error.message}`)
    pieces = (p.data ?? []).map((r) => r.id).sort()
  }
  const posts = await db.from('social_posts').select('id', { count: 'exact', head: true })
  if (posts.error) throw new Error(`read social_posts: ${posts.error.message}`)
  return { campaigns: ids.length, pieces, posts: posts.count ?? 0 }
}

let stopServer = null
let browser = null
const evidence = { startedAt: new Date().toISOString(), base: null, plan: null, widths: {} }
try {
  mkdirSync(OUT, { recursive: true })
  const email = `w3-adminsocial-${Date.now().toString(36)}@eventlinqs.test`
  const password = `${randomUUID()}Aa1`
  const made = await db.auth.admin.createUser({ email, password, email_confirm: true })
  if (made.error) throw new Error(`create the admin auth user: ${made.error.message}`)
  created.userId = made.data.user.id
  await db.from('profiles').upsert({ id: created.userId, email, full_name: 'W3 admin social drive', display_name: 'W3 admin social drive', is_verified: true })
  const granted = await db.from('admin_users').insert({ id: created.userId, role: 'super_admin', display_name: 'W3 admin social drive' })
  if (granted.error) throw new Error(`grant the admin role: ${granted.error.message}`)

  if (SERVE) {
    await refuseUnlessThePortIsFree(PORT, 'before the admin social drive server was started', 'pass --port= for one this window owns')
    mkdirSync('.tmp', { recursive: true })
    const started = await startGateServer(envFor('local'), '.tmp/admin-social-phone-server.log', { port: PORT })
    if (started.error) throw new Error(`could not serve the build: ${started.error}`)
    BASE = started.base
    stopServer = started.stop
  }
  evidence.base = BASE
  console.log(`${TAG} serving ${BASE}, TEST ${URL_}`)

  browser = await chromium.launch()
  const weekStart = weekStartMelbourne(new Date())

  for (const vp of VIEWPORTS) {
    const phone = vp.width < 768
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 1,
      isMobile: phone,
      hasTouch: phone,
      locale: 'en-AU',
      userAgent: `Mozilla/5.0 (${phone ? 'iPhone' : 'Windows NT 10.0'}) ${CRAWLER}`,
    })
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE })
    const page = await context.newPage()
    const w = (evidence.widths[vp.label] = { downloads: [], copies: [], links: [] })

    await page.goto(`${BASE}/admin/login`, { waitUntil: 'domcontentloaded', timeout: 180000 })
    await page.locator('input[name="email"]').fill(email)
    await page.locator('input[name="password"]').fill(password)
    await page.waitForFunction(() => !document.querySelector('button[type="submit"]')?.disabled, undefined, { timeout: 60000 })
    await page.locator('button[type="submit"]').click()
    await page.waitForURL((u) => !u.pathname.endsWith('/admin/login'), { timeout: 120000 }).catch(() => {})
    const signedIn = !new URL(page.url()).pathname.endsWith('/admin/login')
    check(`${vp.label} the admin signed in through /admin/login`, signedIn, page.url())
    if (!signedIn) {
      await context.close()
      continue
    }

    await page.goto(`${BASE}/admin/social`, { waitUntil: 'networkidle', timeout: 240000 })

    /* ---- A1: Plan this week, pressed twice, at the phone width ---- */
    if (phone) {
      const before = await weekState(weekStart)
      const said = []
      for (const n of [1, 2]) {
        const press = page.locator('[data-press="plan-campaign"]')
        await press.scrollIntoViewIfNeeded()
        await Promise.all([page.waitForURL((u) => u.searchParams.has('said'), { timeout: 300000 }), press.click()])
        await page.waitForLoadState('networkidle', { timeout: 240000 })
        said.push(new URL(page.url()).searchParams.get('said'))
        const after = await weekState(weekStart)
        if (n === 1) evidence.plan = { weekStart, before, afterFirst: after }
        else evidence.plan.afterSecond = after
      }
      evidence.plan.said = said
      const { afterFirst, afterSecond } = evidence.plan
      check('A1 the week holds one campaign after the first press', afterFirst.campaigns === 1, `${before.campaigns} before, ${afterFirst.campaigns} after; said "${said[0]}"`)
      check('A1 a second press makes nothing new: one campaign, the same pieces, the same posts',
        afterSecond.campaigns === 1 && afterSecond.pieces.join() === afterFirst.pieces.join() && afterSecond.posts === afterFirst.posts,
        `${afterSecond.campaigns} campaign, pieces ${afterFirst.pieces.length} then ${afterSecond.pieces.length}, posts ${afterFirst.posts} then ${afterSecond.posts}; said "${said[1]}"`)
      check('A1 the second press says the campaign was planned already', /planned already/.test(said[1] ?? ''), said[1] ?? '')
      /* Run 3 said "(24 pieces)" of a week holding 25: it counted today's plan, not the week. */
      check('A1 the count it says is the pieces the week holds', (said[1] ?? '').includes(`(${afterSecond.pieces.length} pieces)`), `${afterSecond.pieces.length} held; said "${said[1]}"`)
      await page.goto(`${BASE}/admin/social`, { waitUntil: 'networkidle', timeout: 240000 })
    }

    /* ---- the page fits its width ---- */
    const fit = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth }))
    check(`${vp.label} nothing wider than the screen`, fit.scroll <= fit.inner + 1, `scrollWidth ${fit.scroll}, innerWidth ${fit.inner}`)
    await page.screenshot({ path: join(OUT, `admin-social-${vp.label}.png`), fullPage: true })

    const pieces = await page.locator('li[data-piece]').evaluateAll((els) =>
      els.map((el) => ({
        id: el.getAttribute('data-piece'),
        kind: el.getAttribute('data-kind'),
        state: el.getAttribute('data-state'),
        slides: [...el.querySelectorAll('a[data-press="slide"]')].map((a) => a.getAttribute('href')),
        squares: [...el.querySelectorAll('a[data-press="slide-square"]')].map((a) => a.getAttribute('href')),
        link: el.querySelector('a[data-press="open"]')?.getAttribute('href') ?? null,
      })),
    )
    check(`${vp.label} the week's pieces are on the page`, pieces.length > 0, `${pieces.length} piece(s)`)
    const posts = await page.locator('li[data-post]').evaluateAll((els) =>
      els.map((el) => ({ id: el.getAttribute('data-post'), format: el.getAttribute('data-format'), card: el.querySelector('a[data-press="download"]')?.getAttribute('href') ?? null })),
    )

    /* ---- every control a thumb presses is reachable and big enough, at every width ---- */
    const controls = await page.locator('[data-section="campaign"] a[data-press], [data-section="campaign"] button').evaluateAll((els) =>
      els
        .filter((el) => el.getClientRects().length > 0)
        .map((el) => {
          const r = el.getBoundingClientRect()
          const scroller = el.closest('[aria-label="Slides"]')
          return { press: el.getAttribute('data-press') ?? el.textContent.trim().slice(0, 30), h: Math.round(r.height), right: Math.round(r.right + window.scrollX), inScroller: Boolean(scroller) }
        }),
    )
    const tooSmall = controls.filter((c) => c.press !== 'slide' && c.h < 44)
    const offScreen = controls.filter((c) => !c.inScroller && c.right > vp.width + 1)
    check(`${vp.label} every campaign control is at least 44 px tall`, tooSmall.length === 0, `${controls.length} control(s); under 44: ${JSON.stringify(tooSmall.slice(0, 5))}`)
    check(`${vp.label} no campaign control sits off the screen`, offScreen.length === 0, JSON.stringify(offScreen.slice(0, 5)))

    if (!phone) {
      await context.close()
      continue
    }

    /* ---- A6: download each image, from the phone ---- */
    const downloads = []
    for (const p of pieces) {
      const native = p.squares.length > 0 ? 'feed' : 'story'
      for (const href of p.slides) downloads.push({ piece: p.id, kind: p.kind, href, want: SIZE[native] })
      for (const href of p.squares) downloads.push({ piece: p.id, kind: p.kind, href, want: SIZE.square })
    }
    for (const p of posts) if (p.card) downloads.push({ post: p.id, href: p.card, want: null })
    /*
     * FETCHED FROM INSIDE THE SIGNED-IN PAGE, as the founder's tap is. The 2FA proof cookie is Secure on a production
     * build (src/lib/admin/two-factor.ts); Chromium sends it to http://127.0.0.1, Playwright's request context does
     * not, so the first run read 401 on all 238 from a request the phone never makes.
     */
    let downloadFaults = 0
    for (const d of downloads) {
      const got = await page.evaluate(async (href) => {
        const res = await fetch(href, { credentials: 'same-origin' })
        const buf = new Uint8Array(await res.arrayBuffer())
        return { status: res.status, type: res.headers.get('content-type') ?? '', disposition: res.headers.get('content-disposition') ?? '', bytes: buf.length, head: Array.from(buf.subarray(0, 65536)) }
      }, d.href)
      const body = Buffer.from(got.head)
      const { status, type, disposition } = got
      const size = imageSize(body)
      const ok = status === 200 && /^image\//.test(type) && /attachment/i.test(disposition) && size !== null && (d.want === null || (size[0] === d.want[0] && size[1] === d.want[1]))
      if (!ok) downloadFaults++
      w.downloads.push({ ...d, status, type, disposition, bytes: got.bytes, size, ok })
      if (!ok) console.log(`${TAG}   download fault ${d.href}: ${status} ${type} "${disposition}" ${JSON.stringify(size)} want ${JSON.stringify(d.want)}`)
    }
    check('A6 every slide and card downloads as an image at its native size, as an attachment', downloads.length > 0 && downloadFaults === 0, `${downloads.length - downloadFaults} of ${downloads.length}`)

    /* ---- A6: copy each caption and message, from the phone ---- */
    const copyButtons = page.locator('[data-section="campaign"] li[data-piece] button', { hasText: /^Copy the / })
    const nCopy = await copyButtons.count()
    let copyFaults = 0
    for (let i = 0; i < nCopy; i++) {
      const btn = copyButtons.nth(i)
      const expected = await btn.evaluate((el) => {
        const form = el.closest('form[data-version]')
        if (form) return form.querySelector('textarea[name="caption"]')?.defaultValue ?? null
        return el.closest('[data-message]')?.querySelector('textarea')?.defaultValue ?? null
      })
      await page.evaluate(() => navigator.clipboard.writeText(''))
      await btn.scrollIntoViewIfNeeded()
      await btn.tap()
      await page.waitForFunction((b) => b.textContent.includes('Copied'), await btn.elementHandle(), { timeout: 5000 }).catch(() => {})
      const got = await page.evaluate(() => navigator.clipboard.readText())
      /*
       * Windows' clipboard stores a line feed as CRLF, so readText on this machine returns "\r\n" for every "\n" the
       * button wrote (run 2: '"\r\n\r\n📍 Wed 2"' against '"\n\n📍 Wed 28 "'). A phone keeps "\n". The words must
       * match exactly once that one translation is undone, and it is recorded per copy, never hidden.
       */
      const crlfOnly = got !== expected && got.replace(/\r\n/g, '\n') === expected
      const ok = expected !== null && expected.length > 0 && (got === expected || crlfOnly)
      if (!ok) copyFaults++
      let firstDiff = null
      if (!ok && expected !== null) {
        let i = 0
        while (i < got.length && i < expected.length && got[i] === expected[i]) i++
        firstDiff = { at: i, got: JSON.stringify(got.slice(i, i + 12)), expected: JSON.stringify(expected.slice(i, i + 12)), gotChars: got.length, expectedChars: expected.length }
      }
      w.copies.push({ label: (await btn.textContent())?.trim(), chars: got.length, ok, lineEndingsOnly: crlfOnly, firstDiff })
      if (firstDiff && copyFaults <= 3) console.log(`${TAG}   copy fault "${(await btn.textContent())?.trim()}": ${JSON.stringify(firstDiff)}`)
    }
    check('A6 every caption and message copies exactly, from the phone', nCopy > 0 && copyFaults === 0,
      `${nCopy - copyFaults} of ${nCopy}; ${w.copies.filter((c) => c.lineEndingsOnly).length} came back with Windows' CRLF line endings and otherwise identical`)

    /* ---- A6: open each link (judged on TEST, nothing counted) ---- */
    let linkFaults = 0
    for (const p of pieces) {
      if (!p.link) {
        linkFaults++
        w.links.push({ piece: p.id, link: null, ok: false, why: 'no link' })
        continue
      }
      const u = new URL(p.link)
      const entry = { piece: p.id, kind: p.kind, link: p.link }
      if (u.origin !== SITE) {
        entry.ok = false
        entry.why = `not ${SITE}`
      } else if (/^\/(out|s|go)(\/|$)/.test(u.pathname)) {
        entry.ok = false
        entry.why = 'a counted route a piece should not carry'
      } else if (u.pathname.startsWith('/e/')) {
        const code = u.pathname.split('/')[2]
        const row = await db.from('share_links').select('id, event_id, events(status, visibility)').eq('code', code).maybeSingle()
        entry.ok = !row.error && row.data !== null && row.data.events?.status === 'published'
        entry.why = row.error ? row.error.message : row.data === null ? 'no share_links row on TEST' : `share_links ${row.data.id}, its night ${row.data.events?.status} (not followed: it would count)`
      } else {
        const res = await context.request.get(`${BASE}${u.pathname}${u.search}`, { timeout: 180000, maxRedirects: 0 })
        entry.ok = res.status() === 200
        entry.why = `${res.status()} on TEST at ${u.pathname}`
      }
      if (!entry.ok) linkFaults++
      w.links.push(entry)
    }
    check('A6 every piece link opens (pages answered 200 on TEST; tracked links read back, never followed)', pieces.length > 0 && linkFaults === 0, `${pieces.length - linkFaults} of ${pieces.length}`)
    await context.close()
  }
} catch (error) {
  check('the drive ran to its end', false, error.message)
} finally {
  if (browser) await browser.close().catch(() => {})
  if (stopServer) await stopServer()
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
writeFileSync(join(OUT, 'drive.json'), JSON.stringify(evidence, null, 2))
console.log(`${TAG} ${failures === 0 ? 'DRIVE PASSED' : `DRIVE FAILED, ${failures} of ${results.length}`} (${results.length} checks; ${join(OUT, 'drive.json')})`)
process.exitCode = failures === 0 ? 0 : 1
