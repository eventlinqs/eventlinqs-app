/**
 * SCOPE V5 SECTION 10.3, THE FIVE LOW-BANDWIDTH REQUIREMENTS, AUDITED BY DRIVING
 * THEM RATHER THAN BY READING THE CODE THAT IMPLEMENTS THEM.
 *
 * ============================================================================
 * WHAT THIS IS FOR
 * ============================================================================
 *
 * Close-out C8B.5, verbatim: "Scope v5 section 10.3 also requires aggressive
 * image compression with WebP and a JPEG fallback, lazy loading, a PWA that
 * functions offline, and a checkout that does not fail under poor network
 * conditions. Audit each against what is built and report MET or NOT MET. A
 * ticket buyer at a venue with bad reception is the same problem that section
 * describes."
 *
 * The AFRICA DEFERRAL NARROWED section of close-out pulls these forward out of
 * the deferral explicitly: "Australians on a phone at a venue with bad reception
 * are the same problem as anyone else on a weak network." Nothing here is
 * Africa-specific and nothing here is deferred.
 *
 * ============================================================================
 * WHY IT DRIVES INSTEAD OF READING
 * ============================================================================
 *
 * Every one of these five has a plausible static answer that is wrong:
 *
 *   - `formats: ['image/avif','image/webp']` sits in next.config.ts, which says
 *     what the optimiser is CONFIGURED to negotiate and not one word about what
 *     it returns to a browser that accepts neither. The JPEG fallback half of
 *     the requirement is precisely the half no config line can answer.
 *   - Every media component passes `loading={priority ? 'eager' : 'lazy'}`,
 *     which is a promise about the component and not about the page. A page is
 *     the sum of its callers and one caller passing `priority` on a rail is
 *     invisible to every component-level read.
 *   - A web app manifest and a registered service worker are each necessary for
 *     "a PWA that functions offline" and neither is sufficient. The only
 *     question that matters is whether a navigation succeeds with the network
 *     cut, and the only way to ask it is to cut the network.
 *   - A checkout's resilience lives in what happens to a REJECTED promise, and
 *     the rejection is thrown by the browser's fetch, not by any line in the
 *     repository. No grep can see the consequence.
 *
 * ============================================================================
 * WHAT IT CANNOT SEE, SAID RATHER THAN IMPLIED
 * ============================================================================
 *
 * It judges one running server. It cannot tell you what a CDN in front of that
 * server does to an image, what a real 2G radio does to a TCP handshake, or
 * whether a payment that left the browser was captured. `setOffline` is a clean
 * cut, and a real weak network is a slow one: the clean cut is the harsher and
 * more deterministic case, so passing it is necessary and not sufficient.
 *
 * Run: node --env-file=.env.local scripts/verify/scope-10-3-audit.mjs [baseUrl]
 *      C8B_OUT=C:\dev\EVIDENCE\C8B node ... scope-10-3-audit.mjs
 *      --only r1,r2      (r1 compression, r2 lazy, r3 bundle, r4 pwa, r5 checkout)
 */
import { assertNotProduction } from '../lib/production-write-preflight.mjs'
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

assertNotProduction()

const BASE = (process.argv.find(a => /^https?:\/\//.test(a)) || process.env.C8B_BASE || 'http://localhost:3200').replace(/\/$/, '')
const OUT = process.env.C8B_OUT || ''
const TAG = '[scope-10.3]'
const ONLY = (process.argv.find(a => a.startsWith('--only='))?.slice(7) ||
  (process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : '') || '')
  .split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
const wants = id => ONLY.length === 0 || ONLY.includes(id)

/**
 * THE SCOPE'S OWN NUMBER, not a number this script chose. Scope v5 10.3:
 * "minimal JavaScript payloads (<200KB initial bundle)".
 */
const INITIAL_BUNDLE_BUDGET_KB = 200

const VIEWPORTS = [
  { name: 'mobile-390', width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 3 },
  { name: 'tablet-768', width: 768, height: 1024, isMobile: false, hasTouch: true, deviceScaleFactor: 2 },
  { name: 'desktop-1440', width: 1440, height: 1000, isMobile: false, hasTouch: false, deviceScaleFactor: 1 },
]

const log = []
const faults = []
/** One row per scope requirement: { id, requirement, verdict, detail }. */
const verdicts = []
const say = m => { log.push(m); console.log(`${TAG} ${m}`) }
const fail = m => { faults.push(m); log.push(`FAIL: ${m}`); console.log(`${TAG} FAIL: ${m}`) }
const record = (id, requirement, met, detail) => {
  verdicts.push({ id, requirement, verdict: met ? 'MET' : 'NOT MET', detail })
  say(`${id} ${met ? 'MET    ' : 'NOT MET'}  ${requirement}`)
  say(`       ${detail}`)
  if (!met) faults.push(`${id} NOT MET: ${requirement}. ${detail}`)
}

const kb = bytes => `${(bytes / 1024).toFixed(1)} KB`
const decodeEntities = s => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')

/** The pinned gate route set, so this audit and the Lighthouse gate judge the same pages. No slug is guessed. */
function gateRoutes() {
  const spec = JSON.parse(readFileSync(new URL('../../lighthouse-gate-urls.json', import.meta.url), 'utf8'))
  return [...spec.static.map(s => s.path), ...spec.eventDetail.map(s => s.path)]
}

function finish() {
  if (OUT) {
    mkdirSync(OUT, { recursive: true })
    writeFileSync(join(OUT, 'scope-10-3-audit.txt'), log.join('\n') + '\n', 'utf8')
    writeFileSync(join(OUT, 'scope-10-3-audit.json'), JSON.stringify({ base: BASE, when: new Date().toISOString(), verdicts, faults }, null, 2), 'utf8')
  }
  console.log(`\n${TAG} ==================== SCOPE v5 10.3 ====================`)
  for (const v of verdicts) console.log(`${TAG} ${v.verdict.padEnd(7)}  ${v.id}  ${v.requirement}`)
  console.log(`${TAG} =======================================================`)
  if (faults.length) {
    console.log(`${TAG} ${faults.length} fault(s):`)
    for (const f of faults) console.log(`${TAG}   - ${f}`)
    process.exit(1)
  }
  console.log(`${TAG} PASS - every audited requirement of Scope v5 10.3 is MET on ${BASE}.`)
  process.exit(0)
}

/* ==========================================================================
 * R1. AGGRESSIVE IMAGE COMPRESSION: WebP, with a fallback for a browser that
 *     cannot take it.
 * ========================================================================== */
async function r1ImageCompression() {
  /*
   * THE URL IS HARVESTED FROM A SERVED PAGE, never composed here. An optimiser
   * URL composed by this script would prove the optimiser answers a URL this
   * script can write; the question is whether it answers the URLs the platform
   * actually emits, at the widths and qualities the platform actually asks for.
   */
  const html = await (await fetch(`${BASE}/`, { headers: { 'user-agent': 'Mozilla/5.0 lane-c-audit' } })).text()
  const candidates = [...html.matchAll(/\/_next\/image\?url=[^"'\s>]+/g)]
    .map(m => decodeEntities(m[0]))
    .filter(u => /[?&]w=\d+/.test(u) && /[?&]q=\d+/.test(u))
  if (candidates.length === 0) {
    record('R1', 'aggressive image compression (WebP with JPEG fallback)', false,
      'the homepage emitted no /_next/image URL at all, so nothing could be negotiated. Either the optimiser is bypassed or the page served no imagery.')
    return
  }
  // The widest harvested variant: the most expensive byte on the page is the one worth measuring.
  const url = candidates.sort((a, b) => Number(/[?&]w=(\d+)/.exec(b)[1]) - Number(/[?&]w=(\d+)/.exec(a)[1]))[0]
  say(`R1 negotiating the widest harvested optimiser URL: ...${url.slice(url.indexOf('&w='))} (${candidates.length} candidates on the homepage)`)

  const asks = [
    { name: 'avif+webp (modern Chrome)', accept: 'image/avif,image/webp,image/apng,image/svg+xml,*/*;q=0.8', want: /^image\/avif$/ },
    { name: 'webp, no avif (older browser)', accept: 'image/webp,image/apng,*/*;q=0.8', want: /^image\/webp$/ },
    { name: 'neither (the fallback browser)', accept: 'image/jpeg,image/png,*/*;q=0.8', want: /^image\/(jpeg|png)$/ },
  ]
  const seen = []
  for (const ask of asks) {
    const res = await fetch(`${BASE}${url}`, { headers: { accept: ask.accept, 'user-agent': 'Mozilla/5.0 lane-c-audit' } })
    const type = (res.headers.get('content-type') || '').split(';')[0].trim()
    const bytes = (await res.arrayBuffer()).byteLength
    seen.push({ ...ask, status: res.status, type, bytes })
    say(`   ${ask.name.padEnd(36)} -> HTTP ${res.status} ${type.padEnd(11)} ${kb(bytes)}`)
  }
  const wrong = seen.filter(s => s.status !== 200 || !s.want.test(s.type))
  const fallback = seen[2]
  const modern = seen[0].bytes
  /*
   * "AGGRESSIVE" IS JUDGED AGAINST THE FALLBACK IT REPLACES, which is the only
   * comparison that means anything. An AVIF that is bigger than the JPEG it
   * displaced is a correctly negotiated regression.
   */
  const smaller = modern < fallback.bytes
  const saved = fallback.bytes === 0 ? 0 : Math.round((1 - modern / fallback.bytes) * 100)
  record('R1', 'aggressive image compression (WebP with JPEG fallback)',
    wrong.length === 0 && smaller,
    wrong.length
      ? `${wrong.length} of 3 negotiations answered wrongly: ${wrong.map(w => `${w.name} got HTTP ${w.status} ${w.type || '(no type)'}`).join('; ')}`
      : `all three negotiated correctly; the modern variant is ${kb(modern)} against ${kb(fallback.bytes)} for the fallback, ${saved}% smaller${smaller ? '' : ' (LARGER, so the compression is not aggressive)'}`)
}

/* ==========================================================================
 * R2. LAZY LOADING, judged per PAGE rather than per component.
 * ========================================================================== */
async function r2LazyLoading() {
  const routes = gateRoutes()
  const rows = []
  for (const path of routes) {
    const res = await fetch(`${BASE}${path}`, { headers: { 'user-agent': 'Mozilla/5.0 lane-c-audit' } })
    if (res.status !== 200) { fail(`R2: ${path} answered HTTP ${res.status}; it is in the pinned gate set and must resolve`); continue }
    const html = await res.text()
    const imgs = [...html.matchAll(/<img\b[^>]*>/gi)].map(m => m[0])
    const eager = imgs.filter(t => !/loading="lazy"/i.test(t))
    rows.push({ path, total: imgs.length, eager: eager.length })
    say(`   ${path.padEnd(56)} ${String(imgs.length).padStart(4)} img, ${eager.length} not lazy`)
  }
  /*
   * ONE non-lazy image per document is correct and required: it is the LCP
   * candidate, and `scripts/guards/one-priority-image.mjs` already refuses a
   * second. More than one here would mean that guard has been defeated at
   * render time; zero would mean the LCP image is lazy, which delays the paint
   * the whole of C8 exists to bring forward.
   */
  const bad = rows.filter(r => r.total > 0 && r.eager !== 1)
  record('R2', 'lazy loading', bad.length === 0,
    bad.length === 0
      ? `${rows.length} pinned routes, ${rows.reduce((s, r) => s + r.total, 0)} <img> in total, exactly one eager (the LCP candidate) on every page that carries imagery`
      : `${bad.length} route(s) do not carry exactly one eager image: ${bad.map(b => `${b.path} has ${b.eager} of ${b.total}`).join('; ')}`)
}

/* ==========================================================================
 * R3. MINIMAL JAVASCRIPT PAYLOAD: the scope's own sub-200KB initial bundle.
 * ========================================================================== */
async function r3InitialBundle(browser) {
  /*
   * "INITIAL BUNDLE" IS READ AS THE SCRIPT NAMED IN THE DOCUMENT, and the
   * reading is stated here rather than left to the reader, because C8B.4 says
   * byte weight and sequencing are judged together and the two readings differ
   * by more than the budget itself.
   *
   * Named in the document  = what the parser must fetch before it can finish.
   * Total script           = that plus everything a dynamic import pulls later.
   *
   * H3 (8 September) measured 295.8 KB total and 195.6 KB named on the event
   * route. Reporting only the smaller number would be rounding up; both are
   * printed on every row and the budget is judged against the named set, with
   * the total beside it so the gap can never be hidden.
   */
  const routes = ['/', '/events', '/events/cat-indie-sounds-live-at-the-enmore-sydney']
  const rows = []
  for (const path of routes) {
    /*
     * SERVICE WORKERS ARE BLOCKED HERE, and the reason is a measurement this
     * very item broke. Once `public/app-sw.js` landed, this row reported 198.9 KB
     * named in the document and 197.7 KB total, and a total BELOW the named
     * subset is arithmetically impossible: the worker had claimed the page and
     * was answering some of the content-hashed assets out of its own cache, so
     * those responses carried no bytes over the wire and silently left the sum.
     *
     * The budget is about what a buyer's radio must carry, and the buyer this
     * matters most to is the one arriving for the FIRST time, who has no worker
     * yet. Blocking it measures that visit. It also keeps this row comparable
     * with the H3 cost table of 8 September, which was taken before any root
     * worker existed.
     */
    const context = await browser.newContext({ ...VIEWPORTS[0], serviceWorkers: 'block' })
    const page = await context.newPage()
    const scripts = new Map()
    /*
     * TRANSFERRED, NEVER DECOMPRESSED. The first version of this read
     * `content-length` and fell back to `(await res.body()).byteLength`, and it
     * reported 972.4 KB on the event route against the 295.8 KB `chunk-cost-table`
     * measured on the same page in H3. Both numbers were real and they answer
     * different questions: `res.body()` hands back the DECOMPRESSED bytes, and a
     * chunked response carries no content-length at all, so the fallback was
     * always the one that ran. The cost table's own header says it: "the three
     * heaviest chunks are 414 KB, 340 KB and 242 KB on disk and 123 KB, 95 KB and
     * 75 KB over the wire."
     *
     * The scope's budget is a PAYLOAD budget on a weak radio, so the wire size is
     * the only reading of it that means anything, and
     * `request().sizes().responseBodySize` is the same seam the cost table uses.
     */
    page.on('response', async res => {
      const u = res.url()
      if (!/\.js(\?|$)/.test(u)) return
      if (!u.startsWith(BASE)) return
      try {
        const sizes = await res.request().sizes()
        scripts.set(u, sizes.responseBodySize ?? 0)
      } catch { say(`   (a script response was gone before it could be sized: ${u.replace(BASE, '')})`) }
    })
    await page.goto(`${BASE}${path}`, { waitUntil: 'load', timeout: 60_000 })
    await page.waitForTimeout(4000)
    /*
     * THE DOCUMENT IS THE SERVED HTML, NOT THE LIVE DOM.
     *
     * Asking the page for `document.querySelectorAll('script[src]')` after load
     * returned the same total twice (299.5 KB named, 299.5 KB total), which is
     * how the error announced itself: webpack's runtime APPENDS a <script> tag
     * for every chunk a dynamic import pulls, so by the time the DOM can be read
     * the deferred set has joined the named set and the distinction the whole row
     * exists to draw has quietly vanished.
     *
     * The served HTML is the only place the parser's own work list survives.
     */
    const servedHtml = await (await fetch(`${BASE}${path}`, { headers: { 'user-agent': 'Mozilla/5.0 lane-c-audit' } })).text()
    const inDocument = new Set([...servedHtml.matchAll(/<script[^>]+src="([^"]+)"/g)]
      .map(m => new URL(decodeEntities(m[1]), BASE).href))
    let named = 0, total = 0
    for (const [u, len] of scripts) { total += len; if (inDocument.has(u)) named += len }
    rows.push({ path, named, total, count: scripts.size })
    say(`   ${path.padEnd(56)} ${String(scripts.size).padStart(3)} requests, ${kb(named).padStart(9)} named in the document, ${kb(total).padStart(9)} total`)
    await context.close()
  }
  const worst = rows.reduce((a, b) => (b.named > a.named ? b : a))
  const over = worst.named / 1024 > INITIAL_BUNDLE_BUDGET_KB
  record('R3', `minimal JavaScript payloads (under ${INITIAL_BUNDLE_BUDGET_KB}KB initial bundle)`, !over,
    `the heaviest of ${rows.length} routes is ${worst.path} at ${kb(worst.named)} named in the document (${kb(worst.total)} including dynamic imports) against a ${INITIAL_BUNDLE_BUDGET_KB} KB budget`)
}

/* ==========================================================================
 * R4. A PWA THAT FUNCTIONS OFFLINE.
 * ========================================================================== */
async function r4PwaOffline(browser) {
  const detail = []
  let met = true

  // (a) the manifest. Installability is the floor, not the requirement.
  const manifestRes = await fetch(`${BASE}/manifest.webmanifest`, { headers: { 'user-agent': 'Mozilla/5.0 lane-c-audit' } })
  if (manifestRes.status !== 200) {
    detail.push(`the web app manifest answered HTTP ${manifestRes.status}`)
    met = false
  } else {
    const m = await manifestRes.json()
    const sizes = (m.icons ?? []).map(i => i.sizes)
    const missing = ['192x192', '512x512'].filter(s => !sizes.includes(s))
    if (!m.name || !m.start_url || m.display !== 'standalone' || missing.length) {
      detail.push(`the manifest is incomplete: ${[!m.name && 'no name', !m.start_url && 'no start_url', m.display !== 'standalone' && `display is ${m.display}`, missing.length && `no ${missing.join(' or ')} icon`].filter(Boolean).join(', ')}`)
      met = false
    } else {
      detail.push(`the manifest is complete and installable (${m.name}, start_url ${m.start_url}, display ${m.display}, ${sizes.length} icons)`)
    }
  }

  /*
   * (b) and (c) are ONE question asked twice, and the second asking is the one
   * that counts. A registered worker proves a file is running; only a
   * navigation with the network cut proves the buyer sees EventLinqs rather
   * than the browser's own error page.
   */
  const context = await browser.newContext({ ...VIEWPORTS[0] })
  const page = await context.newPage()
  await page.goto(`${BASE}/`, { waitUntil: 'load', timeout: 60_000 })
  // Give any worker its registration and its install a fair chance before judging.
  await page.waitForTimeout(6000)
  const scopes = await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return null
    const regs = await navigator.serviceWorker.getRegistrations()
    return regs.map(r => ({ scope: r.scope, script: (r.active || r.installing || r.waiting)?.scriptURL ?? null }))
  })
  const rootWorker = (scopes ?? []).find(s => new URL(s.scope).pathname === '/')
  detail.push(scopes === null
    ? 'this browser reports no serviceWorker support, so nothing could be asked'
    : `${scopes.length} worker registration(s) on the homepage: ${scopes.length ? scopes.map(s => `${new URL(s.scope).pathname} (${s.script ? new URL(s.script).pathname : 'no script'})`).join(', ') : 'none'}`)
  /*
   * The root worker is required IN ITS OWN RIGHT, not merely implied by the
   * navigation below succeeding. A page can answer offline for reasons that
   * have nothing to do with this platform (an extension, a proxy, a browser
   * cache), and a requirement that only ever checks the visible outcome is a
   * requirement that can be met by accident.
   */
  if (!rootWorker) {
    detail.push('no worker controls the root scope, so nothing can answer a navigation when the network refuses')
    met = false
  }

  await context.setOffline(true)
  let offlineOutcome
  try {
    const res = await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 30_000 })
    const body = (await page.textContent('body').catch(() => '')) ?? ''
    offlineOutcome = { reached: true, status: res?.status() ?? 0, ours: /EVENTLINQS/i.test(body), chars: body.length }
  } catch (error) {
    offlineOutcome = { reached: false, error: String(error).split('\n')[0] }
  }
  await context.setOffline(false)
  await context.close()

  if (offlineOutcome.reached && offlineOutcome.ours) {
    detail.push(`with the network cut, a navigation to / rendered an EventLinqs page (HTTP ${offlineOutcome.status}, ${offlineOutcome.chars} chars of text)`)
  } else {
    detail.push(offlineOutcome.reached
      ? `with the network cut, a navigation to / rendered a page that is not EventLinqs (HTTP ${offlineOutcome.status})`
      : `with the network cut, a navigation to / FAILED: ${offlineOutcome.error}. The buyer sees the browser's own network-error page, not this platform.`)
    met = false
  }

  /*
   * THE OFFLINE PAGE IS A DESIGNED SURFACE, so it is judged at all three widths
   * like any other. A fallback nobody has ever looked at on a phone is how
   * "it works offline" comes to mean a wall of unstyled text.
   */
  const widths = []
  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({ ...vp })
    const p = await ctx.newPage()
    try {
      await p.goto(`${BASE}/`, { waitUntil: 'load', timeout: 60_000 })
      await p.waitForTimeout(6000)
      await ctx.setOffline(true)
      await p.goto(`${BASE}/events/anything-at-all`, { waitUntil: 'domcontentloaded', timeout: 30_000 }).catch(() => {})
      const shot = await p.evaluate(() => ({
        text: document.body.innerText.replace(/\s+/g, ' ').slice(0, 200),
        overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
        heading: document.querySelector('h1')?.textContent?.trim() ?? null,
      }))
      if (OUT) {
        mkdirSync(join(OUT, 'r4'), { recursive: true })
        await p.screenshot({ path: join(OUT, 'r4', `offline-${vp.width}.png`) }).catch(() => {})
      }
      widths.push({ width: vp.width, ...shot })
      say(`   ${String(vp.width).padStart(4)}px offline: h1=${JSON.stringify(shot.heading)} horizontal overflow=${shot.overflow}`)
    } finally {
      await ctx.setOffline(false).catch(() => {})
      await ctx.close()
    }
  }
  const badWidths = widths.filter(w => w.heading !== 'You are offline' || w.overflow)
  if (badWidths.length) {
    detail.push(`the offline page is wrong at ${badWidths.map(w => `${w.width}px (h1 ${JSON.stringify(w.heading)}${w.overflow ? ', horizontal overflow' : ''})`).join(', ')}`)
    met = false
  } else {
    detail.push('the offline page renders its own heading with no horizontal overflow at 390, 768 and 1440')
  }

  record('R4', 'a PWA that functions offline', met, detail.join('. '))
}

/* ==========================================================================
 * R5. A CHECKOUT THAT DOES NOT FAIL UNDER POOR NETWORK CONDITIONS.
 * ========================================================================== */

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const createdEvents = []
const madeReservations = new Set()

/**
 * A SALE-READY organisation, its creator, a category and a cover.
 *
 * THE FIRST VERSION OF THIS ASKED ONLY FOR A PUBLISHED EVENT and the drive
 * reported "Checkout - AUD 34.11 did not reach checkout" at all three widths,
 * which reads exactly like a broken checkout button and was a borrowed row.
 * Without `stripe_charges_enabled` the tier is visible and the reservation is
 * refused, so the page correctly stays where it is. SEO4's drive recorded the
 * same trap on 14 September; this is its donor query, reused rather than
 * rediscovered, and the gate fails CLOSED on any of these five being unset.
 */
async function borrowDonor() {
  const { data: seedEvent, error } = await db
    .from('events')
    .select('organisation_id, created_by, category_id, organisation:organisations!inner(id, status, stripe_account_id, stripe_charges_enabled, stripe_payouts_enabled, stripe_account_country, payout_status)')
    .eq('status', 'published')
    .eq('organisation.status', 'active')
    .eq('organisation.stripe_charges_enabled', true)
    .eq('organisation.stripe_payouts_enabled', true)
    .not('organisation.stripe_account_id', 'is', null)
    .not('organisation.stripe_account_country', 'is', null)
    .eq('organisation.payout_status', 'active')
    .not('category_id', 'is', null)
    .limit(1)
    .maybeSingle()
  if (error || !seedEvent) throw new Error(`no event on TEST belongs to a sale-ready organisation: ${error?.message ?? 'none found'}`)
  // The cover is borrowed separately: the sale-ready organisation's own events need not carry one.
  const { data: cover } = await db
    .from('events')
    .select('cover_image_url')
    .not('cover_image_url', 'is', null)
    .limit(1)
    .maybeSingle()
  if (!cover?.cover_image_url) throw new Error('no published event on TEST carries a cover image to borrow')
  return {
    organisation_id: seedEvent.organisation_id,
    created_by: seedEvent.created_by,
    category_id: seedEvent.category_id,
    cover_image_url: cover.cover_image_url,
  }
}

/**
 * ONE lane-C paid event with one tier, created here and deleted in a finally.
 *
 * IT IS NOT BORROWED, for the reason SEO4 recorded on 14 September: every
 * sale-ready paid event on TEST carries a dynamic pricing rule, so a borrowed
 * fixture makes this drive's arithmetic depend on somebody else's row. It is
 * also tagged lane-C in its slug and its title so the other two lanes building
 * on this machine can see whose it is at a glance.
 */
async function createFixture() {
  const donor = await borrowDonor()
  const stamp = Date.now().toString(36)
  const slug = `lane-c-c8b-offline-checkout-${stamp}`
  const start = new Date(Date.now() + 30 * 24 * 3600_000).toISOString()
  const { data: event, error } = await db
    .from('events')
    .insert({
      title: 'Lane C C8B offline checkout probe',
      slug,
      organisation_id: donor.organisation_id,
      created_by: donor.created_by,
      category_id: donor.category_id,
      cover_image_url: donor.cover_image_url,
      start_date: start,
      end_date: new Date(Date.parse(start) + 4 * 3600_000).toISOString(),
      timezone: 'Australia/Melbourne',
      status: 'published',
      published_at: new Date().toISOString(),
      visibility: 'public',
      venue_name: 'Lane C Proof Room',
      venue_address: '1 Lane C Street',
      venue_city: 'Melbourne',
      venue_country: 'Australia',
      description: 'A lane-C verification row. Created and deleted by scripts/verify/scope-10-3-audit.mjs.',
    })
    .select('id, slug')
    .single()
  if (error) throw new Error(`could not insert the lane-C fixture event: ${error.message}`)
  createdEvents.push(event.id)
  const { error: tierError } = await db.from('ticket_tiers').insert({
    event_id: event.id,
    name: 'Lane C general admission',
    price: 3200,
    currency: 'AUD',
    total_capacity: 50,
    sold_count: 0,
    max_per_order: 10,
  })
  if (tierError) throw new Error(`could not insert the lane-C fixture tier: ${tierError.message}`)
  say(`R5 fixture: /events/${event.slug} (paid, one tier at $32.00, 50 places)`)
  return event.slug
}

async function cleanUpFixture() {
  /*
   * THE RESERVATIONS THIS RUN MADE ARE EXPIRED BEFORE THE EVENT IS DELETED, so
   * the places go back to the tier rather than being orphaned by a cascade.
   * Three lanes share this database and a held place nobody can see is exactly
   * the kind of residue that makes another lane's gate fail for no reason.
   */
  if (madeReservations.size) {
    const { error } = await db.from('reservations').update({ expires_at: new Date(Date.now() - 60_000).toISOString() }).in('id', [...madeReservations])
    if (error) say(`could not expire this run's reservations: ${error.message}`)
    const { error: sweepError } = await db.rpc('expire_stale_reservations')
    if (sweepError) say(`the reservation sweep failed: ${sweepError.message}`)
  }
  /*
   * A DELETE THIS DRIVE'S OWN WORK HAS MADE IMPOSSIBLE IS ARCHIVED, NOT LEFT.
   *
   * The first version deleted and reported the attempt as the outcome. On
   * 15 September it printed "1 fixture event(s) deleted" on the same run whose
   * previous line read "event has money records and cannot be deleted: 3
   * orders". The database was right: `docs/EVENT-LIFECYCLE.md` records the rule
   * it enforces, and the rule says archive instead. THIS DRIVE CREATES THOSE
   * ORDERS ITSELF, one per viewport, because reaching the payment step is the
   * whole point of R5, so the refusal is the normal path here rather than an
   * edge case.
   *
   * Left alone, a published lane-C fixture sits on a TEST database three lanes
   * share, in the sitemap, inside Law 5's zero-dead-links contract, until
   * somebody notices. Archiving takes it off every public surface and keeps
   * every record, which is exactly what the lifecycle intends.
   */
  let deleted = 0
  let archived = 0
  const stuck = []
  for (const id of createdEvents) {
    await db.from('ticket_tiers').delete().eq('event_id', id)
    const { error } = await db.from('events').delete().eq('id', id)
    if (!error) { deleted += 1; continue }
    const { error: archiveError } = await db
      .from('events')
      .update({ status: 'archived', archived_at: new Date().toISOString(), archived_from_status: 'published' })
      .eq('id', id)
    if (archiveError) stuck.push(`${id} (${archiveError.message})`)
    else {
      archived += 1
      say(`the fixture event ${id} carries money records this run created, so it was ARCHIVED rather than deleted: ${error.message.split('.')[0]}`)
    }
  }
  say(`cleanup: ${madeReservations.size} reservation(s) expired and swept, ${deleted} fixture event(s) deleted, ${archived} archived`)
  for (const s of stuck) fail(`a lane-C fixture event could neither be deleted nor archived and is STILL PUBLISHED on TEST: ${s}`)
}

async function clickText(page, re) {
  for (const el of await page.$$('button, a, [role="button"]')) {
    if (!(await el.isVisible().catch(() => false))) continue
    const t = ((await el.textContent().catch(() => '')) ?? '').trim()
    if (re.test(t)) { await el.click().catch(() => {}); return t }
  }
  return null
}

/**
 * THE LABEL WINS OVER THE PLACEHOLDER, and the order is the whole point.
 *
 * The version copied from the UX6 drive read `aria-label ?? placeholder` and
 * only consulted the `<label>` element when both were absent. The buyer's name
 * field is `<label for="buyer-name">Full name</label>` with
 * `placeholder="Jane Smith"`, so the placeholder answered first, `/full name/i`
 * missed it, and this drive reported "the checkout form could not be filled" at
 * all three widths against a form that fills perfectly by hand.
 *
 * A placeholder is a hint; a label is the accessible name. Asking in that order
 * is also what a screen reader does.
 */
async function fillByLabel(page, re, value) {
  for (const el of await page.$$('input')) {
    if (!(await el.isVisible().catch(() => false))) continue
    const id = await el.getAttribute('id')
    const fromLabel = id ? ((await page.textContent(`label[for="${id}"]`).catch(() => '')) ?? '') : ''
    const candidates = [fromLabel, await el.getAttribute('aria-label'), await el.getAttribute('placeholder')]
    if (candidates.some(c => c && re.test(c.trim()))) { await el.fill(value); return true }
  }
  return false
}

/** The text the checkout error boundary renders. If a buyer sees this, the checkout failed. */
const BOUNDARY_MARKER = /We hit a snag with your checkout/i

/**
 * THE REFUSAL THAT IS THE MACHINE'S AND NOT THE PRODUCT'S.
 *
 * `checkout-reserve` is 20 per IP per 60 seconds, fail-CLOSED, and it covers
 * reservation plus checkout plus squad payment-intent creation
 * (src/lib/rate-limit/policies.ts, read rather than remembered). This drive
 * reserves once per viewport and once more on the retry leg, so a single run is
 * nowhere near it; three runs inside a minute while a harness is being debugged
 * are, and on 15 September 2026 they were.
 *
 * The first version reported that as `"Checkout - AUD 34.11" did not reach
 * checkout` at all three widths, which reads exactly like a broken checkout
 * button. That is the same class of mistake the SEO2 drive made twice on
 * 14 September: a harness accusing the product of a fault that belongs to the
 * machine, which is the most expensive kind of finding because it is
 * investigated as a defect before it is recognised as noise.
 */
const RATE_LIMITED = /too many attempts/i

/** Wait out one `checkout-reserve` window, once, and say so. */
async function waitOutTheRateLimit(page, where) {
  say(`   the platform refused ${where} with its own rate limit (checkout-reserve, 20 per IP per 60s). Waiting 65s and asking once more; this is the machine, not the product.`)
  await page.waitForTimeout(65_000)
}

async function r5CheckoutOnAPoorNetwork(browser, slug) {
  const perWidth = []
  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({ ...vp })
    const page = await context.newPage()
    const label = `R5 @ ${vp.width}`
    try {
      const res = await page.goto(`${BASE}/events/${slug}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
      if (res?.status() !== 200) { fail(`${label}: the fixture event page answered HTTP ${res?.status()}`); continue }
      await page.waitForTimeout(2500)

      const plus = await clickText(page, /^\+$/)
      if (!plus) { fail(`${label}: no quantity control on the fixture event page`); continue }
      await page.waitForTimeout(900)

      const toCheckout = (await clickText(page, /^checkout\b/i)) ?? (await clickText(page, /^(continue|proceed)/i))
      if (!toCheckout) { fail(`${label}: ticket selection offers no way to continue to checkout`); continue }
      await page.waitForURL(/\/checkout\//, { timeout: 45_000 }).catch(() => {})
      await page.waitForTimeout(4000)

      // See RATE_LIMITED: one retry, after the window, before anything is alleged.
      if (!/\/checkout\//.test(page.url()) && RATE_LIMITED.test(await page.evaluate(() => document.body.innerText))) {
        await waitOutTheRateLimit(page, 'the reservation')
        await clickText(page, /^checkout\b/i)
        await page.waitForURL(/\/checkout\//, { timeout: 45_000 }).catch(() => {})
        await page.waitForTimeout(4000)
      }

      const reservationId = /\/checkout\/([0-9a-f-]{36})/i.exec(page.url())?.[1]
      if (reservationId) madeReservations.add(reservationId)
      if (!reservationId) {
        const why = RATE_LIMITED.test(await page.evaluate(() => document.body.innerText))
          ? 'the platform refused the reservation with its own rate limit TWICE, a minute apart. Nothing about the checkout was judged; run this again on a quieter machine.'
          : `ended on ${page.url().replace(BASE, '')}`
        fail(`${label}: "${toCheckout}" did not reach checkout; ${why}`)
        continue
      }

      const buyer = `lane-c-c8b-${Date.now().toString(36)}@example.com`
      const filledName = await fillByLabel(page, /full name/i, 'Robin Ashe')
      const filledEmail = await fillByLabel(page, /^email/i, buyer)
      if (!filledName || !filledEmail) { fail(`${label}: the checkout form could not be filled (name ${filledName}, email ${filledEmail})`); continue }
      await page.waitForTimeout(600)
      const reused = await clickText(page, /use my details for all tickets/i)
      if (!reused) {
        await fillByLabel(page, /first name/i, 'Robin')
        await fillByLabel(page, /last name/i, 'Ashe')
        for (const e of await page.$$('input[type="email"]')) await e.fill(buyer).catch(() => {})
      }
      await page.waitForTimeout(1200)

      /* ---- the poor network arrives exactly where a buyer's does: at submit ---- */
      await context.setOffline(true)
      const submitted = await clickText(page, /^continue to payment/i)
      if (!submitted) { fail(`${label}: no way to submit the checkout details`); await context.setOffline(false); continue }
      await page.waitForTimeout(9000)

      const bodyText = ((await page.textContent('body').catch(() => '')) ?? '')
      const onBoundary = BOUNDARY_MARKER.test(bodyText)
      const keptName = await page.inputValue('input#buyer-name').catch(() => null)
      const keptEmail = await page.inputValue('input#buyer-email').catch(() => null)
      /*
       * A MESSAGE THAT NAMES THE NETWORK, not merely any message. "Payment
       * failed, please try again" on a dropped connection sends the buyer to
       * their bank; "you appear to be offline" sends them to their signal.
       */
      const namesTheNetwork = /\b(offline|connection|internet|network)\b/i.test(bodyText)

      /*
       * THE PICTURE IS TAKEN HERE, at the offline submit, and not at the end of
       * the walk. The first version shot the page after the retry had already
       * recovered, so the evidence for "the buyer keeps their form and is told
       * why" was a screenshot of a working payment step, which shows neither.
       */
      if (OUT) {
        mkdirSync(join(OUT, 'r5'), { recursive: true })
        await page.screenshot({ path: join(OUT, 'r5', `checkout-offline-${vp.width}.png`), fullPage: false }).catch(() => {})
      }

      await context.setOffline(false)
      await page.waitForTimeout(1500)

      /* ---- and it must RECOVER, which is the whole of "does not fail" ---- */
      let recovered = false
      if (!onBoundary) {
        const retried = (await clickText(page, /^(try again|continue to payment|retry)/i))
        if (retried) {
          await page.waitForTimeout(12_000)
          recovered = await page.evaluate(() =>
            [...document.querySelectorAll('h3')].some(h => /^payment$/i.test(h.textContent?.trim() ?? '')))
        }
      }

      /*
       * ONE OBSERVATION ACROSS THE LANE BORDER, RECORDED AND NOT JUDGED.
       *
       * `stripe.confirmPayment` is lane A's (money and payment code), so this
       * neither asserts on it nor fails on it. It only looks, because a BORDER
       * line carrying a measurement is worth more than one carrying a
       * hypothesis: the Pay handler sets `paying` true, awaits confirmPayment,
       * and clears `paying` only inside `if (error)`. If that promise ever
       * REJECTS rather than resolving with an error, the button stays disabled
       * reading "Processing" with no way back. Whether it rejects is a fact
       * about Stripe.js, so it is asked rather than reasoned about.
       */
      let payStepNote = 'not reached'
      if (recovered) {
        await context.setOffline(true)
        const paid = await clickText(page, /^pay\b/i)
        if (!paid) payStepNote = 'reached the payment step but found no Pay button'
        else {
          await page.waitForTimeout(12_000)
          const stuck = await page.evaluate(() => {
            const btn = [...document.querySelectorAll('button')].find(b => /processing|^pay\b/i.test(b.textContent ?? ''))
            return { label: btn?.textContent?.trim() ?? null, disabled: btn?.hasAttribute('disabled') ?? null }
          })
          const said = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '))
          const spoke = /(declin|error|fail|offline|connection|try again)/i.test(said)
          payStepNote = `Pay pressed offline: button reads ${JSON.stringify(stuck.label)}, disabled=${stuck.disabled}, page says something about the failure=${spoke}`
        }
        await context.setOffline(false)
      }
      say(`   ${String(vp.width).padStart(4)}px payment step (OBSERVED, lane A's code, not judged here): ${payStepNote}`)

      perWidth.push({ width: vp.width, onBoundary, keptName, keptEmail, namesTheNetwork, recovered })
      say(`   ${String(vp.width).padStart(4)}px: boundary=${onBoundary} keptName=${JSON.stringify(keptName)} keptEmail=${keptEmail ? 'yes' : 'no'} namesTheNetwork=${namesTheNetwork} recovered=${recovered}`)
    } finally {
      await context.setOffline(false).catch(() => {})
      await context.close()
    }
  }

  if (perWidth.length === 0) {
    record('R5', 'a checkout that does not fail under poor network conditions', false,
      'no viewport reached the checkout details step, so nothing could be judged')
    return
  }
  const broken = perWidth.filter(r => r.onBoundary || r.keptName !== 'Robin Ashe' || !r.namesTheNetwork || !r.recovered)
  record('R5', 'a checkout that does not fail under poor network conditions', broken.length === 0,
    broken.length === 0
      ? `at 390, 768 and 1440 the buyer stayed on the checkout with their details intact, was told the connection was the problem, and completed the step on a retry once the network returned`
      : broken.map(b => `at ${b.width}px: ${[
          b.onBoundary && 'thrown to the checkout error boundary',
          b.keptName !== 'Robin Ashe' && `the typed name was lost (input reads ${JSON.stringify(b.keptName)})`,
          !b.namesTheNetwork && 'nothing on the page named the connection',
          !b.recovered && 'the step did not complete on a retry once the network returned',
        ].filter(Boolean).join(', ')}`).join('; '))
}

/* ========================================================================== */
async function main() {
  say(`auditing ${BASE}`)
  const browser = await chromium.launch()
  let slug = null
  try {
    if (wants('r1')) await r1ImageCompression()
    if (wants('r2')) await r2LazyLoading()
    if (wants('r3')) await r3InitialBundle(browser)
    if (wants('r4')) await r4PwaOffline(browser)
    if (wants('r5')) {
      slug = await createFixture()
      await r5CheckoutOnAPoorNetwork(browser, slug)
    }
  } finally {
    await browser.close().catch(() => {})
    if (slug) await cleanUpFixture()
  }
  finish()
}

main().catch(async error => {
  console.error(`${TAG} the audit threw: ${String(error?.stack ?? error)}`)
  await cleanUpFixture().catch(() => {})
  process.exit(1)
})
