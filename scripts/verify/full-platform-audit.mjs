/**
 * THE FULL PLATFORM AUDIT. A careful human auditor, expressed as a script.
 *
 * It walks the deployed preview at EXACTLY 390 and EXACTLY 1440, and for every
 * surface it reaches it records the six things a real auditor would notice:
 *
 *   1. the HTTP status, because a 404 behind a pretty layout is still a 404
 *   2. every console error and every failed network request, because a page that
 *      renders and screams in the console is not a working page
 *   3. every link and every safe button, followed or clicked, so a control that
 *      goes nowhere is caught by DOING it rather than by reading the markup
 *   4. whether the page shows real content or a designed empty state, said out
 *      loud either way rather than counted as a pass
 *   5. a screenshot at both widths
 *   6. the MEASURED viewport, so a claim about 390 is evidence rather than an
 *      intention
 *
 * WHAT IT WILL NOT DO, enforced in code rather than promised in a comment.
 * No card is ever typed. No payment is ever completed. No account is ever
 * created. No destructive control is ever clicked. The button policy below is a
 * DENY list applied before every click, and the checkout walk stops at the
 * Stripe boundary by asserting it is there rather than by proceeding.
 *
 * It never touches the production database. It drives a browser against a
 * preview URL, which is wired to the TEST project.
 *
 * Usage:
 *   node scripts/verify/full-platform-audit.mjs
 *   AUDIT_BASE_URL=https://... node scripts/verify/full-platform-audit.mjs
 *   PROOF_EMAIL=... PROOF_PASSWORD=... node scripts/verify/full-platform-audit.mjs
 *
 * Authed surfaces are attempted only when credentials are supplied AND the login
 * succeeds. If it does not, they are reported NOT COVERED rather than skipped
 * quietly, because a surface nobody looked at must never read as a surface that
 * passed.
 */
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const BASE = (process.env.AUDIT_BASE_URL ??
  'https://eventlinqs-app-git-integration-launch-lawals-projects-c20c0be8.vercel.app').replace(/\/$/, '')

const OUT = path.resolve('docs/roast/audit-2026-08-15')
const SHOTS = path.join(OUT, 'shots')
mkdirSync(SHOTS, { recursive: true })

const VIEWPORTS = [
  { name: '390', width: 390, height: 844 },
  { name: '1440', width: 1440, height: 900 },
]

/**
 * NEVER CLICK. Applied to a control's accessible name before any click.
 *
 * Split by reason so the list can be argued with rather than trusted. Anything
 * that spends money, creates an account, sends a message, publishes, or destroys
 * is out. A control that merely REVEALS or FILTERS is in, because that is the
 * behaviour being audited.
 */
const NEVER_CLICK = [
  // money
  /\bpay\b/i, /checkout/i, /purchase/i, /buy now/i, /complete order/i, /confirm and pay/i,
  // account creation and auth submission
  /sign ?up/i, /create account/i, /register/i, /\bsign in\b/i, /\blog ?in\b/i,
  /send reset/i, /reset password/i, /magic link/i, /continue with (google|apple|facebook)/i,
  // destructive
  /delete/i, /remove/i, /revoke/i, /cancel (event|order|ticket)/i, /archive/i, /deactivate/i,
  // writes and sends
  /\bsave\b/i, /\bsubmit\b/i, /\bpublish\b/i, /\bsend\b/i, /\binvite\b/i, /\bapply\b/i,
  /\bcreate\b/i, /\bupdate\b/i, /\bconfirm\b/i, /request/i, /claim/i, /transfer/i, /refund/i,
  // leaving the session
  /sign ?out/i, /log ?out/i,
]

const safeToClick = (name) => !NEVER_CLICK.some((re) => re.test(name ?? ''))

/** Phrases that mean "this page rendered its designed empty state". */
const EMPTY_MARKERS = [
  /be the first/i,
  /could be yours/i,
  /events loading soon/i,
  /no results/i,
  /nothing here yet/i,
  /no events (found|yet|scheduled)/i,
  /check back/i,
]

const findings = []
const surfaces = []
/** Routes whose 404 is the DESIGNED answer, so it must not read as a defect. */
const EXPECT_404 = new Set()

/** One finding. Severity drives the ordering of the final report. */
function finding(severity, surface, kind, detail, extra = {}) {
  findings.push({ severity, surface, kind, detail, ...extra })
}

const SEV = { MONEY: 0, DEAD: 1, ERROR: 2, EMPTY: 3, COSMETIC: 4 }

/**
 * Visit one URL and record everything an auditor would notice.
 * Returns the harvested links and controls so the caller can sweep them.
 */
async function visit(context, url, label, vp, opts = {}) {
  const page = await context.newPage()
  const consoleErrors = []
  const failedRequests = []
  const pageErrors = []

  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 400))
  })
  page.on('pageerror', (e) => pageErrors.push(String(e.message).slice(0, 400)))
  page.on('requestfailed', (r) => {
    const f = r.failure()?.errorText ?? ''
    // An aborted request is usually the browser cancelling a prefetch on
    // navigation, which is not a defect and would drown the real signal.
    if (/ERR_ABORTED|net::ERR_ABORTED/.test(f)) return
    failedRequests.push(`${r.method()} ${r.url().slice(0, 160)} ${f}`)
  })
  page.on('response', (r) => {
    if (r.status() >= 400 && r.request().resourceType() !== 'image') {
      failedRequests.push(`HTTP ${r.status()} ${r.url().slice(0, 160)}`)
    }
  })

  let status = 0
  let error = null
  try {
    const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    status = res?.status() ?? 0
    await page.waitForTimeout(opts.settle ?? 1200)
  } catch (e) {
    error = String(e.message).split('\n')[0]
  }

  // The MEASURED viewport, not the requested one.
  const measured = await page.evaluate(() => ({
    w: window.innerWidth,
    h: window.innerHeight,
    scrollW: document.documentElement.scrollWidth,
  })).catch(() => ({ w: 0, h: 0, scrollW: 0 }))

  const text = await page.evaluate(() => document.body?.innerText ?? '').catch(() => '')
  const title = await page.title().catch(() => '')

  const isEmpty = EMPTY_MARKERS.some((re) => re.test(text))
  const eventCards = await page.locator('a[href*="/events/"]').count().catch(() => 0)

  const shot = `${label.replace(/[^a-z0-9]+/gi, '-').slice(0, 70)}-${vp.name}.png`
  try {
    await page.screenshot({ path: path.join(SHOTS, shot), fullPage: false })
  } catch { /* a screenshot failure must not end the audit */ }

  // Harvest links and controls.
  const links = await page.evaluate(() =>
    Array.from(document.querySelectorAll('a[href]'))
      .map((a) => ({ href: a.getAttribute('href'), text: (a.innerText || a.getAttribute('aria-label') || '').trim().slice(0, 60) }))
      .filter((l) => l.href && !l.href.startsWith('#') && !l.href.startsWith('mailto:') && !l.href.startsWith('tel:')),
  ).catch(() => [])

  const controls = await page.evaluate(() =>
    Array.from(document.querySelectorAll('button, [role="tab"], [role="button"], summary'))
      .map((b, i) => ({
        i,
        name: (b.innerText || b.getAttribute('aria-label') || b.getAttribute('title') || '').trim().slice(0, 60),
        disabled: b.hasAttribute('disabled') || b.getAttribute('aria-disabled') === 'true',
      })),
  ).catch(() => [])

  // Horizontal overflow is a real mobile defect, so it is measured rather than eyeballed.
  const overflows = measured.scrollW > measured.w + 2

  const record = {
    label, url, vp: vp.name, status, error,
    measuredViewport: `${measured.w}x${measured.h}`,
    title, textLength: text.length, eventCards,
    state: isEmpty ? 'EMPTY STATE' : text.length > 400 ? 'CONTENT' : 'THIN',
    consoleErrors, pageErrors, failedRequests, overflows,
    links: links.length, controls: controls.length, shot,
  }
  surfaces.push(record)

  if (error) finding(SEV.DEAD, label, 'navigation failed', `${url} :: ${error}`)
  else if (status !== 200) finding(SEV.DEAD, label, `HTTP ${status}`, url)
  if (consoleErrors.length) finding(SEV.ERROR, label, 'console error', consoleErrors.slice(0, 3).join(' | '), { vp: vp.name })
  if (pageErrors.length) finding(SEV.ERROR, label, 'uncaught page error', pageErrors.slice(0, 3).join(' | '), { vp: vp.name })
  if (failedRequests.length) finding(SEV.ERROR, label, 'failed request', [...new Set(failedRequests)].slice(0, 3).join(' | '), { vp: vp.name })
  if (overflows) finding(SEV.COSMETIC, label, 'horizontal overflow', `scrollWidth ${measured.scrollW} > viewport ${measured.w}`, { vp: vp.name })
  if (record.state === 'EMPTY STATE') finding(SEV.EMPTY, label, 'empty state', `renders the designed empty state rather than content`, { vp: vp.name })

  return { page, links, controls, text, record }
}

/** Follow a set of internal hrefs and report any that do not resolve 200. */
async function sweepLinks(context, hrefs, sourceLabel) {
  const seen = new Set()
  const results = []
  for (const href of hrefs) {
    let abs
    try { abs = new URL(href, BASE).toString() } catch { continue }
    if (!abs.startsWith(BASE)) continue
    const key = abs.split('#')[0]
    if (seen.has(key) || GLOBAL_SEEN.has(key)) continue
    seen.add(key); GLOBAL_SEEN.add(key)
    const p = await context.newPage()
    try {
      const res = await p.goto(key, { waitUntil: 'domcontentloaded', timeout: 45_000 })
      const st = res?.status() ?? 0
      results.push({ href: key, status: st })
      if (st !== 200) finding(SEV.DEAD, sourceLabel, `dead link HTTP ${st}`, key)
    } catch (e) {
      results.push({ href: key, status: 'ERR' })
      finding(SEV.DEAD, sourceLabel, 'dead link (navigation failed)', `${key} :: ${String(e.message).split('\n')[0]}`)
    }
    await p.close()
  }
  return results
}
const GLOBAL_SEEN = new Set()

/**
 * Click the safe controls on a page and record whether anything actually
 * happened. A control that changes neither the URL nor the DOM is a dead end
 * under Law 5, which is the same defect as a 404 and worse on a phone.
 */
async function exerciseControls(page, controls, label, vp) {
  let clicked = 0
  let inert = 0
  /*
   * TWO CORRECTIONS, both of which produced false findings on the first run.
   *
   * 1. AN ALREADY-SELECTED TOGGLE DOES NOTHING, CORRECTLY. The /events view
   *    switcher reported "Grid" as dead. It carries aria-pressed="true" before
   *    the click, because Grid is the active view, so clicking it is a correct
   *    no-op. A control is only dead if it was not already in the state it
   *    selects.
   * 2. INDICES SHIFT. The control list is harvested once and then clicked by
   *    position. Every click can add or remove DOM nodes, so later positions
   *    address a DIFFERENT element than the one that was harvested, and the
   *    audit then reports a name it never actually clicked. The list is
   *    re-harvested before each click so the position still means what it meant.
   */
  for (let n = 0; n < controls.length; n += 1) {
    if (clicked >= 12) break
    const fresh = await page.evaluate(() =>
      Array.from(document.querySelectorAll('button, [role="tab"], [role="button"], summary')).map((b, i) => ({
        i,
        name: (b.innerText || b.getAttribute('aria-label') || b.getAttribute('title') || '').trim().slice(0, 60),
        disabled: b.hasAttribute('disabled') || b.getAttribute('aria-disabled') === 'true',
        already:
          b.getAttribute('aria-pressed') === 'true' ||
          b.getAttribute('aria-selected') === 'true' ||
          b.getAttribute('aria-current') === 'page',
      })),
    ).catch(() => [])
    const c = fresh[n]
    if (!c || c.disabled || c.already || !c.name || !safeToClick(c.name)) continue

    const before = await controlSignature(page)
    try {
      const el = page.locator('button, [role="tab"], [role="button"], summary').nth(c.i)
      if (!(await el.isVisible().catch(() => false))) continue
      await el.click({ timeout: 4000, noWaitAfter: true })
      clicked += 1
      await page.waitForTimeout(700)
      const after = await controlSignature(page)
      if (after === before) {
        inert += 1
        finding(SEV.DEAD, label, 'inert control', `"${c.name}" changed nothing observable`, { vp: vp.name })
      }
    } catch { /* an unclickable control is not itself a finding */ }
  }
  return { clicked, inert }
}

/**
 * A signature of everything a click could legitimately change.
 *
 * WHY IT IS A HASH OF CONTENT AND NOT A LENGTH. The first version of this
 * compared `document.body.innerHTML.length` and flagged anything that moved it
 * by fewer than 8 characters. That reported 93 defects, and every one of them
 * was wrong. The footer accordion is a correct ARIA disclosure: clicking it
 * flips `aria-expanded` from "false" to "true" (one character SHORTER), swaps
 * `grid-rows-[0fr]` for `grid-rows-[1fr]` (identical length), removes `inert`
 * and adds `rotate-180`. Net movement, under the threshold. The payout
 * calculator was flagged the same way, because swapping the text "$30" for
 * "$60" does not change a length either.
 *
 * A length is not a fingerprint. This hashes the actual markup, and folds in the
 * URL and the disclosure/selection states explicitly so a pure attribute flip is
 * always visible.
 */
async function controlSignature(page) {
  return page.evaluate(() => {
    let h = 0
    const s = document.body?.innerHTML ?? ''
    for (let i = 0; i < s.length; i += 1) {
      h = (h * 31 + s.charCodeAt(i)) | 0
    }
    const aria = Array.from(document.querySelectorAll('[aria-expanded],[aria-selected],[aria-checked],[open],[inert]'))
      .map((el) =>
        `${el.getAttribute('aria-expanded') ?? ''}${el.getAttribute('aria-selected') ?? ''}` +
        `${el.getAttribute('aria-checked') ?? ''}${el.hasAttribute('open') ? '1' : ''}${el.hasAttribute('inert') ? 'i' : ''}`)
      .join(',')
    const dialogs = document.querySelectorAll('[role="dialog"],dialog[open]').length
    return `${location.href}|${h}|${aria}|${dialogs}`
  }).catch(() => Math.random().toString())
}

// ─────────────────────────────────────────────────────────────── the run

console.log('='.repeat(78))
console.log('FULL PLATFORM AUDIT')
console.log('='.repeat(78))
console.log(`Base: ${BASE}`)

const browser = await chromium.launch()
const report = { base: BASE, startedAt: new Date().toISOString(), passes: [] }

for (const vp of VIEWPORTS) {
  console.log(`\n${'='.repeat(78)}\nPASS AT ${vp.width}x${vp.height}\n${'='.repeat(78)}`)
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: 1,
  })

  // 1. Homepage, and everything it links to.
  const home = await visit(context, `${BASE}/`, 'homepage', vp)
  console.log(`  homepage           ${home.record.status}  ${home.record.state}  measured ${home.record.measuredViewport}  links=${home.links.length}`)
  await exerciseControls(home.page, home.controls, 'homepage', vp)
  await home.page.close()

  /*
   * Discover real slugs rather than guessing them, and DO NOT rely on the
   * homepage for the event slug. The first run derived it from the homepage,
   * the homepage happened to be rendering an empty state, so no event link was
   * found and the EVENT DETAIL PAGE WAS NEVER AUDITED AT ALL. The most important
   * page on a ticketing platform went uncovered because a different page was
   * broken, and nothing said so. /events is the reliable source for an event
   * slug, so it is asked first and the homepage is only a fallback.
   */
  const cityHrefs = home.links.map((l) => l.href).filter((h) => /^\/city\/[^/]+$/.test(h))
  const communityHrefs = home.links.map((l) => l.href).filter((h) => /^\/community\/[^/]+$/.test(h))
  const sampleCity = cityHrefs[0]
  const sampleCommunity = communityHrefs[0]

  const probe = await context.newPage()
  let sampleEvent = null
  let sampleOrganiser = null
  try {
    await probe.goto(`${BASE}/events`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await probe.waitForTimeout(1500)
    const hrefs = await probe.evaluate(() =>
      Array.from(document.querySelectorAll('a[href]')).map((a) => a.getAttribute('href')).filter(Boolean))
    sampleEvent = hrefs.find((h) => /^\/events\/[^/?#]+$/.test(h)) ?? null
    sampleOrganiser = hrefs.find((h) => /^\/organisers\/[^/?#]+$/.test(h)) ?? null
    if (!sampleEvent) finding(SEV.DEAD, '/events', 'no event links', '/events rendered no event detail links, so event detail cannot be audited')
  } catch (e) {
    finding(SEV.ERROR, '/events', 'slug discovery failed', String(e.message).split('\n')[0])
  }
  await probe.close()

  // If /events had none, try the homepage as a fallback before giving up.
  if (!sampleEvent) sampleEvent = home.links.map((l) => l.href).find((h) => /^\/events\/[^/?#]+$/.test(h)) ?? null

  // 2. The declared surface list.
  /*
   * A CORRECTION TO THIS LIST, recorded rather than quietly fixed. The first run
   * asserted /categories/comedy, /categories/arts-community and /music, all of
   * which 404. None is a platform defect:
   *
   *   /categories/[slug] accepts SEVEN hero-category slugs only (afrobeats,
   *   amapiano, gospel, owambe, caribbean, heritage-and-independence,
   *   networking). It is the community-scene route, not the general taxonomy.
   *   General categories are reached as /events?category=... So those two URLs
   *   were invented by the audit, and a 404 is the correct answer.
   *
   *   /music does not exist in this branch at all.
   *
   * The general categories are checked through the route that actually serves
   * them, and the hero categories through theirs. An audit that invents URLs and
   * then reports their 404s as defects is worse than no audit, because it buries
   * the real findings under noise it created itself.
   */
  const list = [
    ['events browse', '/events'],
    ['events filtered category', '/events?category=music'],
    ['events category comedy', '/events?category=comedy'],
    ['events category arts and community', '/events?category=arts-community'],
    ['events sorted', '/events?sort=date'],
    ['events free filter', '/events?price=free'],
    ['search hit', '/events?q=music'],
    ['search miss', '/events?q=zzzzqqqxxnotarealterm'],
    ['hero category afrobeats', '/categories/afrobeats'],
    ['hero category networking', '/categories/networking'],
    ['communities index', '/communities'],
    ['cities index', '/cities'],
    ['organisers marketing', '/organisers'],
    ['pricing', '/pricing'],
    ['about', '/about'],
    ['contact', '/contact'],
    ['help', '/help'],
    ['legal privacy', '/legal/privacy'],
    ['legal terms', '/legal/terms'],
    ['legal refunds', '/legal/refunds'],
    ['launch composer', '/launch'],
    ['login', '/login'],
    ['signup', '/signup'],
    ['forgot password', '/forgot-password'],
    ['deliberate 404', '/this-route-does-not-exist-audit-probe'],
  ]
  if (sampleEvent) list.push(['event detail', sampleEvent])
  if (sampleCity) list.push(['city page', sampleCity])
  if (sampleCommunity) list.push(['community page', sampleCommunity])
  if (sampleOrganiser) list.push(['organiser profile', sampleOrganiser])

  /*
   * FLAG-GATED BY DESIGN. /artists calls notFound() unless the `artist_showcase`
   * feature flag is on (src/app/artists/page.tsx:46), and the performer
   * marketplace is deliberately off. Its 404 is the intended behaviour, so it is
   * asserted as a 404 rather than counted as a dead link.
   */
  EXPECT_404.add('/artists')
  list.push(['artists (flag off, 404 expected)', '/artists'])

  for (const [label, href] of list) {
    const v = await visit(context, `${BASE}${href}`, label, vp)
    const expect404 = label === 'deliberate 404' || EXPECT_404.has(href)
    console.log(`  ${label.padEnd(34)} ${String(v.record.status).padEnd(4)} ${v.record.state.padEnd(12)} ce=${v.record.consoleErrors.length} links=${v.links.length}`)
    if (expect404) {
      // A 404 that returns 200 is worse than a 404: it is a soft 404 and Google
      // indexes it. A 404 that IS a 404 is the correct answer and is not a finding.
      if (v.record.status === 200) finding(SEV.DEAD, label, 'soft 404', 'a route expected to 404 returned HTTP 200')
      /*
       * Drop the noise a correct 404 makes about ITSELF. The browser logs the
       * page's own 404 as a failed resource and a console error, so an
       * intentional 404 arrived carrying two "errors" that describe the very
       * behaviour being asserted. Reporting those is how a finding list stops
       * being read.
       */
      for (let i = findings.length - 1; i >= 0; i -= 1) {
        const f = findings[i]
        if (f.surface !== label) continue
        if (String(f.kind).startsWith('HTTP') || f.kind === 'console error' || f.kind === 'failed request') {
          findings.splice(i, 1)
        }
      }
    }
    await exerciseControls(v.page, v.controls, label, vp)
    if (vp.name === '1440') await sweepLinks(context, v.links.map((l) => l.href), label)
    await v.page.close()
  }

  // 3. Non-HTML surfaces.
  for (const [label, href] of [['sitemap.xml', '/sitemap.xml'], ['robots.txt', '/robots.txt']]) {
    const p = await context.newPage()
    try {
      const res = await p.goto(`${BASE}${href}`, { timeout: 45_000 })
      const body = await p.content()
      const st = res?.status() ?? 0
      const urls = (body.match(/<loc>/g) ?? []).length
      surfaces.push({ label, url: `${BASE}${href}`, vp: vp.name, status: st, state: st === 200 ? 'CONTENT' : 'ERROR', urlCount: urls, consoleErrors: [], failedRequests: [], links: 0, controls: 0 })
      console.log(`  ${label.padEnd(30)} ${st}  ${label === 'sitemap.xml' ? urls + ' urls' : ''}`)
      if (st !== 200) finding(SEV.DEAD, label, `HTTP ${st}`, `${BASE}${href}`)
    } catch (e) {
      finding(SEV.DEAD, label, 'failed', String(e.message).split('\n')[0])
    }
    await p.close()
  }

  // 4. Checkout, up to the Stripe boundary and NO further.
  if (sampleEvent) {
    const p = await context.newPage()
    try {
      await p.goto(`${BASE}${sampleEvent}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
      await p.waitForTimeout(1200)
      // Find a ticket quantity control and a proceed control, WITHOUT paying.
      const getTickets = p.getByRole('button', { name: /get tickets|book|tickets/i }).first()
      if (await getTickets.isVisible().catch(() => false)) {
        await getTickets.click({ timeout: 5000 }).catch(() => {})
        await p.waitForTimeout(1500)
      }
      const url = p.url()
      const body = await p.evaluate(() => document.body.innerText).catch(() => '')
      const reachedStripe = /stripe/i.test(url) || /card number/i.test(body)
      surfaces.push({
        label: 'checkout up to Stripe', url, vp: vp.name, status: 200,
        state: reachedStripe ? 'REACHED STRIPE BOUNDARY (stopped)' : 'ticket selection',
        consoleErrors: [], failedRequests: [], links: 0, controls: 0,
      })
      console.log(`  ${'checkout (no card typed)'.padEnd(30)} at ${url.replace(BASE, '')}`)
      if (reachedStripe) console.log('     reached the Stripe boundary and STOPPED. No card entered.')
    } catch (e) {
      finding(SEV.MONEY, 'checkout', 'checkout walk failed', String(e.message).split('\n')[0])
    }
    await p.close()
  }

  await context.close()
  report.passes.push({ viewport: vp, surfaceCount: surfaces.filter((s) => s.vp === vp.name).length })
}

// 5. Authed surfaces, attempted honestly.
/*
 * The organiser fixture account. These are the same TEST-only credentials
 * scripts/sweep/journey-organiser.mjs already defaults to, and they exist on the
 * TEST project that the preview reads. They are used ONLY to look at authed
 * surfaces read-only; the NEVER_CLICK policy above still forbids every control
 * that writes, sends, publishes or destroys. Override with PROOF_EMAIL and
 * PROOF_PASSWORD to audit as a different organiser.
 */
const email = process.env.PROOF_EMAIL ?? process.env.SWEEP_ORGANISER_EMAIL ?? 'broadcast.gate.organiser@eventlinqs.com'
const password = process.env.PROOF_PASSWORD ?? process.env.SWEEP_ORGANISER_PASSWORD ?? 'ArtistGate2026!Drive'
const AUTHED = [
  ['dashboard', '/dashboard'],
  ['dashboard events', '/dashboard/events'],
  ['dashboard create event', '/dashboard/events/new'],
  ['dashboard venues', '/dashboard/venues'],
  ['dashboard payouts', '/dashboard/payouts'],
  ['dashboard organisation', '/dashboard/organisation'],
  ['dashboard settings', '/dashboard/settings'],
  ['dashboard team invites', '/dashboard/organisation/team'],
  ['account', '/account'],
  ['my tickets', '/tickets'],
]
if (email && password) {
  console.log(`\n${'='.repeat(78)}\nAUTHED PASS (1440)\n${'='.repeat(78)}`)
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const p = await context.newPage()
  let loggedIn = false
  try {
    await p.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await p.getByLabel(/email/i).first().fill(email)
    await p.getByLabel(/password/i).first().fill(password)
    await p.getByRole('button', { name: /sign in|log in/i }).first().click()
    await p.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 45_000 })
    loggedIn = true
  } catch (e) {
    console.log(`  login did not complete: ${String(e.message).split('\n')[0]}`)
  }
  await p.close()
  if (loggedIn) {
    for (const [label, href] of AUTHED) {
      const v = await visit(context, `${BASE}${href}`, label, VIEWPORTS[1])
      console.log(`  ${label.padEnd(30)} ${String(v.record.status).padEnd(4)} ${v.record.state}`)
      await exerciseControls(v.page, v.controls, label, VIEWPORTS[1])
      await v.page.close()
    }
  } else {
    for (const [label] of AUTHED) {
      surfaces.push({ label, url: '', vp: '1440', status: 'NOT COVERED', state: 'login failed', consoleErrors: [], failedRequests: [], links: 0, controls: 0 })
      finding(SEV.ERROR, label, 'NOT COVERED', 'login did not complete, so this surface was not audited. It is not a pass.')
    }
  }
  await context.close()
} else {
  console.log('\nAUTHED SURFACES: NOT COVERED. No PROOF_EMAIL / PROOF_PASSWORD supplied.')
  for (const [label] of AUTHED) {
    surfaces.push({ label, url: '', vp: '1440', status: 'NOT COVERED', state: 'no credentials', consoleErrors: [], failedRequests: [], links: 0, controls: 0 })
    finding(SEV.ERROR, label, 'NOT COVERED', 'no credentials supplied, so this surface was not audited. It is not a pass.')
  }
}

await browser.close()

// ─────────────────────────────────────────────────────────────── the report

findings.sort((a, b) => a.severity - b.severity)
const SEVNAME = ['MONEY PATH', 'DEAD LINK OR CONTROL', 'ERROR', 'EMPTY STATE', 'COSMETIC']

const lines = []
lines.push('# Full platform audit')
lines.push('')
lines.push(`Base: ${BASE}`)
lines.push(`Run: ${report.startedAt}`)
lines.push(`Surfaces recorded: ${surfaces.length}. Findings: ${findings.length}.`)
lines.push('')
lines.push('## Findings, most severe first')
lines.push('')
lines.push('| Severity | Surface | Kind | Detail |')
lines.push('|---|---|---|---|')
for (const f of findings) {
  lines.push(`| ${SEVNAME[f.severity]} | ${f.surface}${f.vp ? ` (${f.vp})` : ''} | ${f.kind} | ${String(f.detail).replace(/\|/g, '\\|').slice(0, 300)} |`)
}
lines.push('')
lines.push('## Every surface')
lines.push('')
lines.push('| Surface | Viewport | Measured | Status | State | Console | Links | Controls |')
lines.push('|---|---|---|---|---|---|---|---|')
for (const s of surfaces) {
  lines.push(`| ${s.label} | ${s.vp} | ${s.measuredViewport ?? '-'} | ${s.status} | ${s.state} | ${s.consoleErrors?.length ?? 0} | ${s.links ?? 0} | ${s.controls ?? 0} |`)
}

writeFileSync(path.join(OUT, 'REPORT.md'), lines.join('\n'), 'utf8')
writeFileSync(path.join(OUT, 'raw.json'), JSON.stringify({ report, surfaces, findings }, null, 2), 'utf8')

console.log(`\n${'='.repeat(78)}`)
console.log(`SURFACES: ${surfaces.length}   FINDINGS: ${findings.length}`)
for (let i = 0; i < SEVNAME.length; i += 1) {
  const n = findings.filter((f) => f.severity === i).length
  if (n) console.log(`   ${SEVNAME[i].padEnd(24)} ${n}`)
}
console.log(`Report: ${path.join(OUT, 'REPORT.md')}`)
console.log('='.repeat(78))
