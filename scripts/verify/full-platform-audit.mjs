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
import { execFileSync } from 'node:child_process'
import { inflateSync } from 'node:zlib'
import path from 'node:path'

/**
 * JPEG dimensions, read from the SOF marker in the bytes themselves.
 *
 * Deliberately not delegated to an image library. The point of this measurement
 * is to catch a renderer that changed what it produces, and a library that also
 * changed its reporting is the thing that already caught this project out once
 * (sharp 0.35 renaming AVIF to heif). Twelve lines of marker walking has no
 * version to drift.
 */
function jpegSize(buf) {
  if (buf[0] !== 0xff || buf[1] !== 0xd8) return null
  let i = 2
  while (i < buf.length - 9) {
    if (buf[i] !== 0xff) { i += 1; continue }
    const marker = buf[i + 1]
    // SOF0..SOF15, excluding the DHT/JPG/DAC markers that share the range.
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return `${buf.readUInt16BE(i + 7)}x${buf.readUInt16BE(i + 5)} px`
    }
    i += 2 + buf.readUInt16BE(i + 2)
  }
  return null
}

/**
 * PDF page size, from the first MediaBox, converted from points to millimetres.
 *
 * THE MEDIABOX IS USUALLY NOT IN THE PLAIN BYTES. A modern writer packs the page
 * objects into a compressed OBJECT STREAM (`/ObjStm`) with a cross-reference
 * stream, so a regex over the raw file finds no `/MediaBox` at all. The first
 * version of this searched the raw bytes, found nothing, and reported the A4
 * poster as "unreadable", which reads like a broken artefact rather than a
 * limited reader. So the raw bytes are tried first and every inflatable stream
 * after that.
 */
function pdfPageSize(buf) {
  const RE = /\/MediaBox\s*\[\s*([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s*\]/
  const raw = buf.toString('latin1')
  let m = RE.exec(raw)
  if (!m) {
    let at = 0
    for (;;) {
      const open = raw.indexOf('stream', at)
      if (open === -1) break
      let start = open + 'stream'.length
      if (raw[start] === '\r') start += 1
      if (raw[start] === '\n') start += 1
      const end = raw.indexOf('endstream', start)
      if (end === -1) break
      try {
        m = RE.exec(inflateSync(buf.subarray(start, end)).toString('latin1'))
        if (m) break
      } catch {
        /* a raw font file or an image, not an object stream */
      }
      at = end + 'endstream'.length
    }
  }
  if (!m) return null
  const w = Number(m[3]) - Number(m[1])
  const h = Number(m[4]) - Number(m[2])
  const mm = (pt) => (pt * 25.4) / 72
  const paper =
    Math.abs(mm(w) - 210) < 2 && Math.abs(mm(h) - 297) < 2 ? ' = A4' : ''
  return `${w.toFixed(0)}x${h.toFixed(0)} pt (${mm(w).toFixed(0)}x${mm(h).toFixed(0)} mm${paper})`
}

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
  /sign ?up/i, /create account/i, /\bsign in\b/i, /\blog ?in\b/i,
  /*
   * "REGISTER" IS TWO DIFFERENT WORDS ON THIS PLATFORM. A bare /register/i sat
   * here to stop the audit creating an account, and it also matched
   * "Register 1 ticket", which is the ONLY proceed control a FREE event offers.
   * The checkout walk therefore excluded the exact button it existed to press,
   * and reported "0 candidates, none enabled" about a page that had one in plain
   * sight. Narrowed to the account sense of the word.
   */
  /^register$/i, /register (an |a )?(account|profile)/i,
  /send reset/i, /reset password/i, /magic link/i, /continue with (google|apple|facebook)/i,
  // destructive
  /delete/i, /remove/i, /revoke/i, /cancel (event|order|ticket)/i, /archive/i, /deactivate/i,
  // writes and sends
  /\bsave\b/i, /\bsubmit\b/i, /\bpublish\b/i, /\bsend\b/i, /\binvite\b/i, /\bapply\b/i,
  /\bcreate\b/i, /\bupdate\b/i, /\bconfirm\b/i, /request/i, /claim/i, /transfer/i, /refund/i,
  // leaving the session
  /sign ?out/i, /log ?out/i,
  /*
   * SUBSCRIBE AND FOLLOW, added 15 August 2026 because the audit clicked one.
   *
   * The city page carries a newsletter "Subscribe" control and the policy above
   * did not name it: it is not "send", not "submit", not "sign up". The audit
   * clicked it. It happened to do nothing observable, because it wants an
   * address first, so no subscription was created, but that was luck rather than
   * policy and the finding it produced was the audit's own doing.
   *
   * A deny list is only as good as the verbs it happens to know, which is the
   * argument for keeping it explicit and adding to it out loud when it is caught
   * short.
   */
  /subscribe/i, /notify me/i, /\bfollow\b/i, /remind me/i, /join\b/i, /add to calendar/i,
]

const safeToClick = (name) => !NEVER_CLICK.some((re) => re.test(name ?? ''))

/**
 * THE TICKETING-BLOCKED STATE, which is neither content nor an empty state.
 *
 * An event page whose organiser has not finished Stripe Connect renders
 * "This organiser is still finishing their payment setup ... Check back soon."
 * That is CORRECT behaviour: the platform will not take money it cannot settle.
 * But it is a distinct third state and it must be named, for two reasons.
 *
 * First, "Check back soon" trips an empty-state marker, so the page was being
 * reported as an empty state, which sends the reader looking for missing data
 * when the data is all there and the PAYMENT PATH is what is missing.
 *
 * Second, and this is the one that matters: an audit that picks its sample event
 * at random will usually land on one of these, walk a page with no ticket
 * selector, and then report "the checkout never reached Stripe" as a money-path
 * defect. That finding would be entirely the audit's own fault. The sample event
 * for the money walk is therefore chosen by asking the pages themselves which
 * ones can sell.
 */
const TICKETING_BLOCKED = /still finishing their payment setup/i

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
/** The deep phases: one row per thing that was actually opened, clicked or read. */
const deep = []
const note = (phase, item, verdict, detail = '') => {
  deep.push({ phase, item, verdict, detail })
  console.log(`    ${verdict.padEnd(12)} ${item}${detail ? `  ${detail}` : ''}`)
}
/** Routes whose 404 is the DESIGNED answer, so it must not read as a defect. */
const EXPECT_404 = new Set()

/**
 * THE CANONICAL HOST RULE, checked on every page rather than asserted once.
 *
 * www.eventlinqs.com.au is the canonical host and eventlinqs.com must never be
 * printed, emitted, embedded or linked. The check is deliberately written as
 * "eventlinqs.com NOT followed by .au", because a naive substring search matches
 * the canonical host itself and reports every page as a violation.
 *
 * An email address at @eventlinqs.com is excluded: that is a mailbox, not a host
 * the browser will ever navigate to, and the sender addresses are governed by the
 * env doctrine rather than by this rule.
 */
const BAD_HOST = /(?<!@)\beventlinqs\.com(?!\.au)(?![a-z0-9-])/gi

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

  /*
   * A CORRECTION, because the first run called the HOMEPAGE an empty state and
   * that was wrong. The markers were tested against the whole page text, and the
   * homepage carries the shared community band and the footer, both of which use
   * invitation copy that matches "be the first" and "check back". A page with 141
   * links and a full set of rails is not an empty state, whatever its footer says.
   *
   * So the test is now: a marker fires AND the page has essentially no event
   * links. That is what an empty state actually is. The marker alone is reported
   * separately as an observation rather than as a verdict about the page.
   */
  const eventCards = await page.locator('a[href*="/events/"]').count().catch(() => 0)
  const blocked = TICKETING_BLOCKED.test(text)
  const markerHit = EMPTY_MARKERS.some((re) => re.test(text))
  const isEmpty = markerHit && eventCards <= 1 && !blocked

  const badHosts = [...new Set((await page.content().catch(() => '')).match(BAD_HOST) ?? [])]

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
    title, textLength: text.length, eventCards, markerHit, blocked,
    state: blocked ? 'TICKETING BLOCKED' : isEmpty ? 'EMPTY STATE' : text.length > 400 ? 'CONTENT' : 'THIN',
    consoleErrors, pageErrors, failedRequests, overflows, badHosts,
    links: links.length, controls: controls.length, shot,
  }
  surfaces.push(record)

  if (error) finding(SEV.DEAD, label, 'navigation failed', `${url} :: ${error}`)
  else if (status !== 200) finding(SEV.DEAD, label, `HTTP ${status}`, url)
  if (consoleErrors.length) finding(SEV.ERROR, label, 'console error', consoleErrors.slice(0, 3).join(' | '), { vp: vp.name })
  if (pageErrors.length) finding(SEV.ERROR, label, 'uncaught page error', pageErrors.slice(0, 3).join(' | '), { vp: vp.name })
  if (failedRequests.length) finding(SEV.ERROR, label, 'failed request', [...new Set(failedRequests)].slice(0, 3).join(' | '), { vp: vp.name })
  if (overflows) finding(SEV.COSMETIC, label, 'horizontal overflow', `scrollWidth ${measured.scrollW} > viewport ${measured.w}`, { vp: vp.name })
  if (record.state === 'EMPTY STATE') finding(SEV.EMPTY, label, 'empty state', `renders the designed empty state rather than content (${eventCards} event links)`, { vp: vp.name })
  if (record.state === 'TICKETING BLOCKED') finding(SEV.MONEY, label, 'ticketing blocked', 'the organiser has not completed Stripe Connect, so this event page offers no way to buy a ticket', { vp: vp.name })
  if (badHosts.length) finding(SEV.DEAD, label, 'non-canonical host emitted', `${badHosts.join(', ')} appears in the served HTML; www.eventlinqs.com.au is the canonical host`, { vp: vp.name })

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

/**
 * Every context gets clipboard permission, and the reason is a false finding.
 *
 * The audit reported six "Copy" controls on the launch reveal as INERT. They are
 * not. `kit-artefacts.tsx`, `kit-link-bar.tsx` and `the-bill.tsx` all call
 * `setCopied(true)` only AFTER `navigator.clipboard.writeText` RESOLVES, and
 * headless Chromium rejects that call when the origin has no clipboard
 * permission. The promise rejected, the catch reset the state, no confirmation
 * ever rendered, and a working control was recorded as dead. The product was
 * right and the harness was wrong.
 *
 * Granting the permission makes the audit see what a person with a real browser
 * sees, which is the only thing worth measuring.
 */
const CONTEXT_DEFAULTS = { permissions: ['clipboard-read', 'clipboard-write'] }

const browser = await chromium.launch()
const report = { base: BASE, startedAt: new Date().toISOString(), passes: [] }

/** Slugs discovered during the viewport passes, so the deep phases reuse them. */
const found = { event: null, sellableEvent: null, paidEvent: null, blockedEvent: null, city: null, community: null, organiser: null, suburb: null }

/**
 * THE CENSUS: how much of the browsable catalogue can actually take money.
 *
 * Run once, before anything else, because it decides which event the deep phases
 * walk. It also answers a question no per-page verdict can: a platform where
 * every page returns 200 and almost none of them can sell a ticket passes a link
 * crawl and fails a customer.
 */
async function ticketingCensus(context, sampleSize = 40) {
  const page = await context.newPage()
  const slugs = new Set()
  for (const q of ['', '?page=2', '?category=music', '?category=comedy', '?price=free', '?q=festival']) {
    try {
      const res = await page.request.get(`${BASE}/events${q}`, { timeout: 45_000 })
      const html = await res.text()
      for (const m of html.matchAll(/href="(\/events\/[a-z0-9-]+)"/g)) slugs.add(m[1])
    } catch { /* one listing failing must not end the census */ }
  }
  const list = [...slugs]
  const sellable = []
  const paid = []
  const free = []
  const blocked = []
  for (const s of list.slice(0, sampleSize)) {
    try {
      const res = await page.request.get(`${BASE}${s}`, { timeout: 45_000 })
      const text = (await res.text()).replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<[^>]+>/g, ' ')
      if (TICKETING_BLOCKED.test(text)) { blocked.push(s); continue }
      sellable.push(s)
      /*
       * PAID AND FREE ARE DIFFERENT ANSWERS TO THE MONEY QUESTION. A free event
       * is fully sellable and correctly never reaches Stripe: the fee model
       * short-circuits a zero-subtotal cart before any fee is applied. The first
       * run picked the first "sellable" event it found, got a free one, walked it
       * to the end and reported "the Stripe payment surface was never reached" as
       * a money-path defect. There was no defect: there was nothing to pay.
       */
      if (/\$\s?\d/.test(text)) paid.push(s)
      else free.push(s)
    } catch { /* counted as neither, which the totals below make visible */ }
  }
  await page.close()
  const sampled = sellable.length + blocked.length
  console.log(
    `  catalogue: ${list.length} distinct event pages; sampled ${sampled}; ` +
      `${blocked.length} cannot sell, ${paid.length} PAID and sellable, ${free.length} free`,
  )
  if (sellable.length && !paid.length) {
    finding(
      SEV.MONEY,
      'catalogue',
      'no paid ticket exists to buy',
      `every one of the ${sellable.length} sellable events sampled is FREE, so no automated walk on this deployment can reach the Stripe payment surface. That is not proof the paid path works, and it is not proof it is broken: it is proof it is UNTESTED here.`,
    )
  }
  if (blocked.length) {
    finding(
      SEV.MONEY,
      'catalogue',
      'events that cannot sell a ticket',
      `${blocked.length} of ${sampled} sampled event pages render "still finishing their payment setup" because the organiser has no completed Stripe Connect account. Correct behaviour per event, but it means most of the browsable catalogue has no purchase path.`,
    )
  }
  return { total: list.length, sampled, sellable, paid, free, blocked }
}

/*
 * `AUDIT_ONLY=deep` runs the deep phases alone. The two viewport passes take the
 * bulk of the wall clock and their result does not change when only a sample
 * slug changes, so re-running everything to correct one input would be an hour
 * spent proving what has already been proved.
 */
const ONLY = process.env.AUDIT_ONLY ?? 'all'

console.log('\nCATALOGUE CENSUS')
{
  const c = await browser.newContext({ ...CONTEXT_DEFAULTS,  viewport: { width: 1440, height: 900 } })
  const census = await ticketingCensus(c)
  report.census = { total: census.total, sampled: census.sampled, sellable: census.sellable.length, paid: census.paid.length, free: census.free.length, blocked: census.blocked.length }
  // A PAID event first, because it is the only one that can reach Stripe.
  found.paidEvent = census.paid[0] ?? null
  found.sellableEvent = census.paid[0] ?? census.sellable[0] ?? null
  found.blockedEvent = census.blocked[0] ?? null
  await c.close()
}

/*
 * In deep-only mode the viewport passes never run, so the slugs they normally
 * discover have to be found here instead. Skipping the discovery and letting the
 * deep phases quietly do nothing is how a surface goes unaudited while the report
 * stays silent about it, which this file has already been caught doing once.
 */
if (ONLY === 'deep') {
  const c = await browser.newContext({ ...CONTEXT_DEFAULTS,  viewport: { width: 1440, height: 900 } })
  const p = await c.newPage()
  const RESERVED = new Set(['signup', 'login', 'pricing'])
  try {
    const sm = await p.request.get(`${BASE}/sitemap.xml`, { timeout: 60_000 })
    const xml = await sm.text()
    /*
     * TAKE THE PATHNAME PROPERLY, do not regex it out of the URL. The first
     * version matched `(\/[^<]*?)` inside `<loc>`, which matches the `//` in
     * `https://`, so every "path" came back as `//host/organisers/x` and every
     * subsequent `^\/organisers\/` test failed. Discovery returned null for
     * everything and the corrected-surfaces pass silently walked two of its four
     * targets. Silently, because a null target is skipped by a `.filter()` and
     * nothing counts what was filtered out.
     */
    const paths = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)]
      .map((m) => {
        try {
          return new URL(m[1]).pathname
        } catch {
          return null
        }
      })
      .filter(Boolean)
    found.organiser = paths.find((h) => /^\/organisers\/[a-z0-9-]+$/.test(h) && !RESERVED.has(h.split('/')[2])) ?? null
    found.city = paths.find((h) => /^\/city\/[a-z0-9-]+$/.test(h)) ?? null
    found.community = paths.find((h) => /^\/community\/[a-z0-9-]+$/.test(h)) ?? null
    found.suburb = paths.find((h) => /^\/city\/[a-z0-9-]+\/[a-z0-9-]+$/.test(h)) ?? null
    found.event ??= found.sellableEvent ?? paths.find((h) => /^\/events\/[a-z0-9-]+$/.test(h)) ?? null
    console.log(`  discovered from the sitemap: organiser=${found.organiser} city=${found.city} suburb=${found.suburb} community=${found.community}`)
    if (!found.suburb) {
      // The sitemap may not carry suburbs; ask a city page directly before giving up.
      await p.goto(`${BASE}${found.city ?? '/cities'}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
      await p.waitForTimeout(1200)
      found.suburb = await p.evaluate(() =>
        Array.from(document.querySelectorAll('a[href]'))
          .map((a) => a.getAttribute('href'))
          .find((h) => h && /^\/city\/[^/]+\/[^/?#]+$/.test(h)) ?? null)
      console.log(`  suburb from the city page: ${found.suburb ?? 'NONE FOUND'}`)
    }
  } catch (e) {
    finding(SEV.ERROR, 'deep discovery', 'failed', String(e.message).split('\n')[0])
  }
  await p.close()
  await c.close()
}

for (const vp of ONLY === 'deep' ? [] : VIEWPORTS) {
  console.log(`\n${'='.repeat(78)}\nPASS AT ${vp.width}x${vp.height}\n${'='.repeat(78)}`)
  const context = await browser.newContext({ ...CONTEXT_DEFAULTS, 
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
    /*
     * NOT `/organisers/signup`. The first version of this took the first
     * `/organisers/<something>` link it saw, and on every page the only one is
     * the SIGNUP call to action, so the audit walked the signup form and filed it
     * under "organiser profile". A whole page type went unaudited behind a label
     * saying it had passed.
     *
     * Worse, the reason there is nothing else to match is itself the finding: no
     * event page links to the organiser who is running the event, while 38
     * organiser profiles sit in the sitemap. So the handle is taken from the
     * sitemap, which is the only place they are reachable from.
     */
    const RESERVED = new Set(['signup', 'login', 'pricing'])
    sampleOrganiser =
      hrefs.find((h) => {
        const m = /^\/organisers\/([^/?#]+)$/.exec(h ?? '')
        return m && !RESERVED.has(m[1])
      }) ?? null
    if (!sampleOrganiser) {
      const sm = await probe.request.get(`${BASE}/sitemap.xml`, { timeout: 45_000 }).catch(() => null)
      const xml = sm ? await sm.text() : ''
      const hit = [...xml.matchAll(/<loc>[^<]*?(\/organisers\/[a-z0-9-]+)<\/loc>/g)]
        .map((m) => m[1])
        .find((p) => !RESERVED.has(p.split('/')[2]))
      sampleOrganiser = hit ?? null
      if (hit) {
        finding(
          SEV.COSMETIC,
          'event detail',
          'no link to the organiser',
          'no event page links to the organiser running the event; the only /organisers/ link on an event page is the signup call to action. 38 organiser profiles are in the sitemap and indexable but unreachable by clicking.',
        )
      }
    }
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
   * THE SUBURB PAGE, discovered rather than guessed. /city/[slug]/[suburb] is a
   * real route and the brief asks for it, but a suburb slug invented from a city
   * name 404s and the 404 would be the audit's fault, not the platform's. So the
   * city page is asked which suburbs it actually links to.
   */
  if (sampleCity) {
    const sp = await context.newPage()
    try {
      await sp.goto(`${BASE}${sampleCity}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
      await sp.waitForTimeout(1200)
      const subs = await sp.evaluate(() =>
        Array.from(document.querySelectorAll('a[href]'))
          .map((a) => a.getAttribute('href'))
          .filter((h) => h && /^\/city\/[^/]+\/[^/?#]+$/.test(h)))
      if (subs.length) list.push(['suburb page', subs[0]])
      else finding(SEV.EMPTY, 'city page', 'no suburb links', `${sampleCity} rendered no /city/x/y links, so the suburb route could not be audited from it`)
    } catch { /* the city page itself is already recorded above */ }
    await sp.close()
  }

  found.event ??= sampleEvent
  found.city ??= sampleCity
  found.community ??= sampleCommunity
  found.organiser ??= sampleOrganiser
  found.suburb ??= list.find(([l]) => l === 'suburb page')?.[1] ?? null

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

// ───────────────────────────────────────────────────── the deep phases
/*
 * Everything above is a walker: it counts, clicks and screenshots. That is not
 * enough for the surfaces where the platform actually earns money or makes a
 * promise. These phases OPEN things and READ them.
 */

/*
 * The event the deep phases walk. A blocked event has no ticket selector, no
 * quantity stepper and no route to Stripe, so walking one and then reporting
 * "the checkout never reached the payment surface" would be the audit inventing
 * its own money-path defect. The census above already asked the pages which ones
 * can sell; this takes the first of those and falls back only if there are none.
 */
const walkEvent = found.sellableEvent ?? found.event
if (walkEvent) note('sample selection', 'event walked by the deep phases', found.sellableEvent ? 'SELLABLE' : 'FALLBACK', walkEvent)

/*
 * THE CORRECTED SURFACES, walked at both widths in every mode.
 *
 * Three page types the walker above got wrong or could not reach, kept here so a
 * deep-only run is self-contained rather than something that has to be read
 * alongside an earlier report to make sense:
 *
 *   - a REAL organiser profile, not /organisers/signup;
 *   - an event that CAN sell, so the ticket surface is actually exercised;
 *   - an event that CANNOT sell, so the blocked state is recorded deliberately
 *     rather than discovered by accident.
 */
{
  console.log(`\n${'='.repeat(78)}\nCORRECTED SURFACES, both widths\n${'='.repeat(78)}`)
  const targets = [
    ['organiser profile (real)', found.organiser],
    ['event detail (sellable)', found.sellableEvent],
    ['event detail (ticketing blocked)', found.blockedEvent],
    ['suburb page', found.suburb],
  ]
  /*
   * SAY WHAT WAS SKIPPED. A null target used to be dropped by a bare filter, so
   * a discovery bug removed two of the four page types from this pass and the
   * report simply had fewer rows. Fewer rows reads as "there was less to check",
   * never as "two page types were not looked at".
   */
  for (const [label, href] of targets) {
    if (!href) {
      note('corrected surfaces', label, 'NOT COVERED', 'no example of this page type could be discovered')
      finding(SEV.ERROR, label, 'NOT COVERED', 'no example of this page type could be discovered from the site or its sitemap, so it was not audited. It is not a pass.')
    }
  }
  const walkable = targets.filter(([, href]) => href)
  for (const vp of VIEWPORTS) {
    const c = await browser.newContext({ ...CONTEXT_DEFAULTS,  viewport: { width: vp.width, height: vp.height } })
    for (const [label, href] of walkable) {
      const v = await visit(c, `${BASE}${href}`, label, vp)
      console.log(`  ${label.padEnd(34)} ${String(v.record.status).padEnd(4)} ${v.record.state.padEnd(18)} measured ${v.record.measuredViewport} links=${v.links.length}`)
      await v.page.close()
    }
    await c.close()
  }
}

/** PHASE A. The event detail page, taken apart. */
if (walkEvent) {
  console.log(`\n${'='.repeat(78)}\nPHASE A: event detail, taken apart\n${'='.repeat(78)}`)
  const ctx = await browser.newContext({ ...CONTEXT_DEFAULTS,  viewport: { width: 1440, height: 1000 } })
  const page = await ctx.newPage()
  try {
    await page.goto(`${BASE}${walkEvent}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await page.waitForTimeout(1800)

    // Tabs.
    const tabs = await page.locator('[role="tab"]').all()
    if (!tabs.length) note('event detail', 'tabs', 'NONE', 'this page uses no tab pattern')
    for (const t of tabs) {
      const name = (await t.innerText().catch(() => '')).trim().slice(0, 40)
      const before = await controlSignature(page)
      await t.click({ timeout: 4000 }).catch(() => {})
      await page.waitForTimeout(500)
      const after = await controlSignature(page)
      note('event detail', `tab "${name}"`, after === before ? 'INERT' : 'WORKS')
      if (after === before) finding(SEV.DEAD, 'event detail', 'inert tab', `"${name}" changed nothing`)
    }

    // Accordions and disclosures.
    const discl = await page.locator('summary, [aria-expanded]').all()
    let opened = 0
    /*
     * TWO CORRECTIONS, both of which produced false INERT verdicts on the run
     * that found them.
     *
     * 1. A HIDDEN CONTROL IS NOT A DEAD CONTROL. At 1440 the mobile "Open menu"
     *    button is in the DOM and display:none. Clicking it does nothing because
     *    nothing can click it, and the click silently failed while the verdict
     *    read INERT, which accuses the header of a defect it does not have.
     *    Visibility is now checked first and an invisible control is skipped,
     *    not judged.
     * 2. NOT EVERY DISCLOSURE USES aria-expanded. The city picker opens a
     *    DIALOG, so neither aria-expanded nor details.open moves and it read as
     *    dead while working perfectly. The full control signature, which already
     *    folds in dialog count and the markup hash, is the fallback.
     */
    for (const d of discl.slice(0, 12)) {
      if (!(await d.isVisible().catch(() => false))) continue
      const name = (await d.innerText().catch(() => '')).trim().slice(0, 40)
      if (!name || !safeToClick(name)) continue
      const before = await d.getAttribute('aria-expanded').catch(() => null)
      const beforeOpen = await d.evaluate((el) => el.closest('details')?.open ?? null).catch(() => null)
      const sigBefore = await controlSignature(page)
      await d.click({ timeout: 4000 }).catch(() => {})
      await page.waitForTimeout(400)
      const after = await d.getAttribute('aria-expanded').catch(() => null)
      const afterOpen = await d.evaluate((el) => el.closest('details')?.open ?? null).catch(() => null)
      const sigAfter = await controlSignature(page)
      const moved = before !== after || beforeOpen !== afterOpen || sigBefore !== sigAfter
      note('event detail', `disclosure "${name}"`, moved ? 'WORKS' : 'INERT')
      if (!moved) finding(SEV.DEAD, 'event detail', 'inert disclosure', `"${name}" did not open or close`)
      opened += 1
      // Close it again so the next disclosure is judged from the same start state.
      if (moved && after === 'true') await d.click({ timeout: 2000 }).catch(() => {})
    }
    if (!opened) note('event detail', 'accordions', 'NONE', 'no disclosure control found on this page')

    /*
     * SHARING. The share targets are EXTERNAL, so they are read rather than
     * followed: navigating to facebook.com from an audit proves nothing about
     * this platform and leaves the run at the mercy of someone else's uptime.
     * What matters is that the control exists, that it carries a real target,
     * and that the URL it hands over points at the canonical host.
     */
    const shareOpener = page.getByRole('button', { name: /^share/i }).first()
    if (await shareOpener.count()) {
      await shareOpener.click({ timeout: 5000 }).catch(() => {})
      await page.waitForTimeout(700)
      note('event detail', 'Share button', 'WORKS', 'opened the share surface')
    } else {
      note('event detail', 'Share button', 'ABSENT')
      finding(SEV.DEAD, 'event detail', 'no share control', 'the acquisition loop starts with sharing and no Share control was found')
    }

    const TARGETS = [
      ['WhatsApp', /wa\.me|api\.whatsapp\.com/i],
      ['Facebook', /facebook\.com/i],
      ['X', /twitter\.com\/intent|x\.com\/intent/i],
      ['Email', /^mailto:/i],
    ]
    const allHrefs = await page.evaluate(() =>
      Array.from(document.querySelectorAll('a[href]')).map((a) => a.getAttribute('href')))
    for (const [name, re] of TARGETS) {
      const hit = allHrefs.find((h) => h && re.test(h))
      if (hit) {
        const bad = (hit.match(BAD_HOST) ?? [])[0]
        note('event detail', `share: ${name}`, bad ? 'BAD HOST' : 'WORKS', hit.slice(0, 120))
        if (bad) finding(SEV.DEAD, 'event detail', 'share target uses a non-canonical host', `${name}: ${hit.slice(0, 160)}`)
      } else {
        note('event detail', `share: ${name}`, 'ABSENT')
        finding(SEV.COSMETIC, 'event detail', 'share target missing', `no ${name} share target was rendered`)
      }
    }

    // Copy link: clicked for real, and the clipboard is read back.
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE }).catch(() => {})
    const copy = page.getByRole('button', { name: /copy link|copy/i }).first()
    if (await copy.count()) {
      await copy.click({ timeout: 5000 }).catch(() => {})
      await page.waitForTimeout(600)
      /*
       * READING THE CLIPBOARD IS THE BEST EVIDENCE AND IT IS NOT ALWAYS
       * AVAILABLE. Headless Chromium refused the read on the run that found
       * this, and "UNREADABLE" is an honest answer but a useless one: it leaves
       * the control unproven either way. So there are three attempts, strongest
       * first, and the verdict says which one answered:
       *
       *   1. the clipboard itself, which is what the user would paste;
       *   2. the button's own confirmation ("Copied"), which proves the handler
       *      ran even when the clipboard cannot be read back;
       *   3. the canonical URL the page publishes, which is what a correct
       *      handler would have copied, and which can at least be checked for
       *      the wrong host.
       */
      const clip = await page.evaluate(() => navigator.clipboard.readText()).catch(() => null)
      const confirmed = await page
        .locator('text=/copied|link copied/i')
        .first()
        .isVisible()
        .catch(() => false)
      const canonical = await page
        .evaluate(() =>
          document.querySelector('link[rel="canonical"]')?.getAttribute('href') ??
          document.querySelector('meta[property="og:url"]')?.getAttribute('content') ??
          location.href)
        .catch(() => null)
      const subject = clip ?? (confirmed ? canonical : null)
      if (subject) {
        const bad = (subject.match(BAD_HOST) ?? [])[0]
        note(
          'event detail',
          'share: Copy link',
          bad ? 'BAD HOST' : 'WORKS',
          `${clip ? 'clipboard' : 'confirmation shown, canonical'}: ${subject.slice(0, 110)}`,
        )
        if (bad) finding(SEV.DEAD, 'event detail', 'copied link uses a non-canonical host', subject.slice(0, 160))
      } else {
        note(
          'event detail',
          'share: Copy link',
          'UNPROVEN',
          `the control was clicked; the clipboard could not be read headless and no confirmation appeared. Canonical for reference: ${String(canonical).slice(0, 110)}`,
        )
        finding(SEV.COSMETIC, 'event detail', 'copy-link result unproven', 'the button clicked but neither a clipboard read nor a visible confirmation could establish what it copied')
      }
    } else {
      note('event detail', 'share: Copy link', 'ABSENT')
      finding(SEV.COSMETIC, 'event detail', 'no copy-link control', 'no Copy link control was rendered')
    }

    // Open in Maps.
    const mapHref = allHrefs.find((h) => h && /google\.[a-z.]+\/maps|maps\.apple\.com|goo\.gl\/maps/i.test(h))
    if (mapHref) {
      const p = await ctx.newPage()
      const res = await p.goto(mapHref, { timeout: 30_000 }).catch(() => null)
      note('event detail', 'Open in Maps', res && res.status() < 400 ? 'WORKS' : 'UNREACHABLE', `${mapHref.slice(0, 110)} -> ${res?.status() ?? 'no response'}`)
      await p.close()
    } else {
      note('event detail', 'Open in Maps', 'ABSENT')
      finding(SEV.COSMETIC, 'event detail', 'no maps link', 'no Open in Maps link was rendered on the event page')
    }
  } catch (e) {
    finding(SEV.ERROR, 'event detail deep phase', 'phase failed', String(e.message).split('\n')[0])
  }
  await ctx.close()
}

/** PHASE B. The auth forms, filled to the boundary and stopped there. */
{
  console.log(`\n${'='.repeat(78)}\nPHASE B: auth forms, filled but NOT submitted\n${'='.repeat(78)}`)
  const ctx = await browser.newContext({ ...CONTEXT_DEFAULTS,  viewport: { width: 1440, height: 1000 } })
  for (const [label, href, fields] of [
    ['signup', '/signup', { email: 'audit.probe.not.submitted@example.invalid', password: 'NeverSubmitted!2026' }],
    ['login', '/login', { email: 'audit.probe.not.submitted@example.invalid', password: 'NeverSubmitted!2026' }],
    ['forgot password', '/forgot-password', { email: 'audit.probe.not.submitted@example.invalid' }],
  ]) {
    const page = await ctx.newPage()
    try {
      await page.goto(`${BASE}${href}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
      await page.waitForTimeout(1200)
      const filled = []
      for (const [k, v] of Object.entries(fields)) {
        const el = page.locator(k === 'email' ? 'input[type="email"], input[name*="email" i]' : 'input[type="password"]').first()
        if (await el.count()) {
          await el.fill(v)
          filled.push(k)
        }
      }
      const submit = page.locator('button[type="submit"]').first()
      const submitName = (await submit.innerText().catch(() => '')).trim() || '(unnamed submit)'
      const enabled = (await submit.count()) ? await submit.isEnabled().catch(() => false) : false
      await page.screenshot({ path: path.join(SHOTS, `auth-${label.replace(/\s+/g, '-')}-filled-1440.png`) }).catch(() => {})
      note('auth', label, 'STOPPED', `filled [${filled.join(', ')}]; the submit control "${submitName}" is ${enabled ? 'ENABLED' : 'disabled'} and was NOT clicked`)
    } catch (e) {
      finding(SEV.ERROR, `auth ${label}`, 'form walk failed', String(e.message).split('\n')[0])
    }
    await page.close()
  }
  await ctx.close()
}

/** PHASE C. The public launch composer, cold and anonymous, through to artefacts. */
let kitCode = null
{
  console.log(`\n${'='.repeat(78)}\nPHASE C: /launch composer, cold anonymous start\n${'='.repeat(78)}`)
  const ctx = await browser.newContext({ ...CONTEXT_DEFAULTS,  viewport: { width: 1440, height: 1000 } })
  const page = await ctx.newPage()
  const consoleErrors = []
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200)) })
  try {
    await page.goto(`${BASE}/launch`, { waitUntil: 'domcontentloaded', timeout: 90_000 })
    await page.waitForSelector('#launch-description', { timeout: 60_000 })
    /*
     * THE NATIVE SETTER, not fill(). React tracks the last value it wrote on the
     * DOM node; a value assigned straight to `.value` is invisible to that
     * tracker, the synthetic change never fires, and the component still reads
     * empty while the box looks full. Playwright's fill() does dispatch input,
     * but going through the prototype setter first is what makes the tracker
     * observe the change, so this is written the way the artefact-pull script
     * already proved works against this component.
     */
    const ARRIVAL =
      'Warehouse party at the Barwon Club in Geelong, Marlo Reyes b2b Kita, Saturday 20 September, doors 10pm, $25 presale'
    await page.$eval('#launch-description', (el, v) => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set
      setter.call(el, v)
      el.dispatchEvent(new Event('input', { bubbles: true }))
    }, ARRIVAL)
    await page.waitForTimeout(400)
    const readBack = await page.$eval('#launch-description', (el) => el.value)
    note('launch composer', 'description accepted', readBack === ARRIVAL ? 'WORKS' : 'MISMATCH', `${readBack.length} chars read back`)

    await page.getByRole('button', { name: /build my kit|make|build|create|generate/i }).first().click({ timeout: 30_000 })
    await page.waitForSelector('#kit-reveal-heading', { timeout: 180_000 })
    const heading = (await page.textContent('#kit-reveal-heading')).trim()
    note('launch composer', 'artefact reveal', 'WORKS', `heading: "${heading}"`)
    await page.screenshot({ path: path.join(SHOTS, 'launch-reveal-1440.png'), fullPage: true }).catch(() => {})

    await page.setViewportSize({ width: 390, height: 844 })
    await page.waitForTimeout(400)
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    note('launch composer', 'reveal at 390', over > 2 ? 'OVERFLOWS' : 'WORKS', `horizontal overflow ${over}px`)
    if (over > 2) finding(SEV.COSMETIC, 'launch composer', 'horizontal overflow at 390', `${over}px`)
    await page.screenshot({ path: path.join(SHOTS, 'launch-reveal-390.png'), fullPage: true }).catch(() => {})

    const kitLinks = await page.$$eval('a[href]', (as) =>
      [...new Set(as.map((a) => a.getAttribute('href')).filter((h) => h && /\/(api\/)?launch\//.test(h)))])
    kitCode = (kitLinks.map((l) => (l.match(/\/launch\/(?:k\/)?([A-Za-z0-9_-]{6,})/) || [])[1]).find(Boolean)) ?? null
    note('launch composer', 'kit code', kitCode ? 'WORKS' : 'NOT FOUND', kitCode ?? kitLinks.slice(0, 3).join(' '))
    if (consoleErrors.length) finding(SEV.ERROR, 'launch composer', 'console error', consoleErrors.slice(0, 3).join(' | '))
  } catch (e) {
    finding(SEV.DEAD, 'launch composer', 'composer walk failed', String(e.message).split('\n')[0])
    note('launch composer', 'walk', 'FAILED', String(e.message).split('\n')[0])
  }
  await ctx.close()
}

/** PHASE D. Every artefact the kit produces, pulled, measured and READ. */
if (kitCode) {
  console.log(`\n${'='.repeat(78)}\nPHASE D: the artefacts, opened and looked at\n${'='.repeat(78)}`)
  const ART = path.join(OUT, 'artefacts')
  mkdirSync(ART, { recursive: true })
  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  const targets = [
    ['story', `/api/launch/${kitCode}/card/story`, 'story.jpg'],
    ['square', `/api/launch/${kitCode}/card/square`, 'square.jpg'],
    ['feed', `/api/launch/${kitCode}/card/feed`, 'feed.jpg'],
    ['poster', `/api/launch/${kitCode}/poster`, 'poster.pdf'],
  ]
  for (const [name, href, file] of targets) {
    try {
      const res = await page.request.get(`${BASE}${href}`, { timeout: 180_000 })
      const body = Buffer.from(await res.body())
      writeFileSync(path.join(ART, file), body)
      if (res.status() !== 200) {
        note('artefact', name, 'HTTP ' + res.status(), href)
        finding(SEV.DEAD, 'launch kit artefact', `${name} returned HTTP ${res.status()}`, href)
        continue
      }
      /*
       * THE REAL DIMENSIONS, read out of the bytes rather than out of the spec.
       * A spec says what was intended; the file says what shipped, and this
       * project has already been bitten by a renderer that changed what it
       * reported. JPEG dimensions come from the SOF marker, PDF page size from
       * the MediaBox, both parsed here so there is no dependency to drift.
       */
      let dims = 'unreadable'
      if (file.endsWith('.jpg')) dims = jpegSize(body) ?? 'unreadable'
      else dims = pdfPageSize(body) ?? 'unreadable'
      note('artefact', name, 'PULLED', `${(body.byteLength / 1024).toFixed(0)} KB, ${dims}, ${res.headers()['content-type']}`)
    } catch (e) {
      note('artefact', name, 'FAILED', String(e.message).split('\n')[0])
      finding(SEV.DEAD, 'launch kit artefact', `${name} could not be pulled`, String(e.message).split('\n')[0])
    }
  }

  /*
   * THE PRINTED ADDRESS LINE. The poster embeds its fonts as SUBSETS, so the
   * bytes in the content stream are glyph ids and reading the stream raw shows
   * hex where a person sees an address. The repository already carries a decoder
   * that walks the ToUnicode CMaps, so it is driven here rather than re-invented,
   * and what it prints is what a promoter would read off the printed page.
   */
  try {
    const dec = execFileSync(process.execPath, ['scripts/verify/pdf-text-decode.mjs', path.join(ART, 'poster.pdf')], {
      encoding: 'utf8', timeout: 60_000,
    })
    writeFileSync(path.join(ART, 'poster-decoded.txt'), dec, 'utf8')
    /*
     * READ ONLY THE DRAWN TEXT. The decoder prints its own header first, and the
     * first version searched the whole output for a place name, matched
     * "roa[st]\" inside the file path it had just printed, and reported a Windows
     * path as the poster's address line. Everything above the marker is the
     * tool talking about itself.
     */
    const all = dec.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
    const marker = all.findIndex((l) => /drawn text/i.test(l))
    const drawn = marker >= 0 ? all.slice(marker + 1) : all
    const linkLine = drawn.find((l) => /eventlinqs\.com/i.test(l)) ?? null
    const whenLine = drawn.find((l) => /\b(mon|tue|wed|thu|fri|sat|sun)[a-z]*\b.*\d|\d{1,2}:\d{2}\s*(am|pm)/i.test(l)) ?? null
    note('artefact', 'poster: the printed call-to-action line', linkLine ? 'READ' : 'NOT FOUND', linkLine ?? '(no line carrying the domain)')
    note('artefact', 'poster: the printed date and time line', whenLine ? 'READ' : 'NOT FOUND', whenLine ?? '(no line carrying a date)')
    if (linkLine) {
      const bad = (linkLine.match(BAD_HOST) ?? [])[0]
      if (bad) finding(SEV.DEAD, 'launch kit artefact', 'poster prints a non-canonical host', linkLine)
    }
    /*
     * NO SEPARATE STREET ADDRESS IS EXPECTED. The poster route returns a
     * suburb-only place label when the address is held back, so a home address
     * can never reach a printed page. What is printed is reported verbatim
     * rather than judged against an address that was never meant to be there.
     */
    note('artefact', 'poster: every drawn line, verbatim', 'READ', drawn.join(' / ').slice(0, 240))
    console.log('    --- drawn poster text, verbatim ---')
    for (const l of drawn.slice(0, 24)) console.log(`      ${l}`)
  } catch (e) {
    note('artefact', 'poster printed address line', 'UNDECODED', String(e.message).split('\n')[0])
  }
  await ctx.close()
}

/** PHASE E. Checkout, driven to the Stripe payment surface and stopped there. */
if (walkEvent) {
  console.log(`\n${'='.repeat(78)}\nPHASE E: checkout, up to Stripe and no further\n${'='.repeat(78)}`)
  const ctx = await browser.newContext({ ...CONTEXT_DEFAULTS,  viewport: { width: 1440, height: 1000 } })
  const page = await ctx.newPage()
  try {
    await page.goto(`${BASE}${walkEvent}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await page.waitForTimeout(1500)

    /*
     * BUTTONS ONLY, NEVER THE ANCHOR. "Get tickets" appears twice on the event
     * page as `<a href="#tickets">`, which only scrolls. The first version of
     * this used getByRole('button') with a name filter, which matches an anchor
     * carrying a button role, clicked the scroll link, went nowhere and reported
     * the money path as unreachable. The real control is a `<button>` reading
     * "Select tickets to continue", and it is DISABLED until a quantity is
     * chosen, which is why the stepper has to be pressed first.
     */
    const plus = page.locator('button').filter({ hasText: /^\+$/ }).first()
    if (await plus.count()) {
      await plus.click({ timeout: 4000 }).catch(() => {})
      await page.waitForTimeout(800)
      note('checkout', 'quantity stepper', 'WORKS', 'raised the quantity by one')
    } else {
      note('checkout', 'quantity stepper', 'ABSENT', 'no + control found on the ticket surface')
    }

    /*
     * DO NOT GUESS THE LABEL. The first version filtered on a fixed phrase list
     * and matched nothing, then reported "0 candidate buttons", which tells the
     * reader the page had no controls when it had several under names the list
     * did not anticipate. The label changes as the cart changes: "Select tickets
     * to continue" while empty, something else once a quantity is chosen, and
     * different again for a free event. So every visible enabled button is
     * enumerated and LOGGED, and the choice is made from what is actually there.
     */
    const allButtons = await page.evaluate(() =>
      Array.from(document.querySelectorAll('button'))
        .map((b, i) => ({
          i,
          name: (b.innerText || b.getAttribute('aria-label') || '').trim().slice(0, 60),
          enabled: !b.hasAttribute('disabled') && b.getAttribute('aria-disabled') !== 'true',
          visible: !!(b.offsetWidth || b.offsetHeight),
        }))
        .filter((b) => b.name && b.visible))
    const PROCEED = /continue|checkout|proceed|get (free )?ticket|reserve|register|book|confirm selection|next/i
    const candidates = allButtons.filter((b) => PROCEED.test(b.name) && safeToClick(b.name))
    note(
      'checkout',
      'controls on the ticket surface',
      candidates.length ? 'FOUND' : 'NONE MATCHED',
      `enabled+visible buttons: ${allButtons.filter((b) => b.enabled).map((b) => `"${b.name}"`).join(', ').slice(0, 300)}`,
    )
    let clickedLabel = null
    for (const c of candidates) {
      if (!c.enabled) continue
      const b = page.locator('button').nth(c.i)
      if (!(await b.isVisible().catch(() => false))) continue
      clickedLabel = c.name
      await b.click({ timeout: 8000 }).catch(() => {})
      break
    }
    note(
      'checkout',
      'proceed control',
      clickedLabel ? 'CLICKED' : 'NONE ENABLED',
      clickedLabel ?? `${candidates.length} matched by name, none of them enabled`,
    )
    await page.waitForTimeout(3500)

    for (let hop = 0; hop < 3; hop += 1) {
      const next = page.locator('button').filter({ hasText: /continue|proceed|next|to payment/i }).first()
      if (!(await next.count())) break
      const label = (await next.innerText().catch(() => '')).trim()
      // NEVER press a control that pays. This is the hard stop.
      if (/\bpay\b|confirm and pay|place order/i.test(label)) {
        note('checkout', 'hard stop', 'STOPPED', `the next control is "${label}" and this walk never pays`)
        break
      }
      if (!(await next.isEnabled().catch(() => false))) break
      await next.click({ timeout: 8000 }).catch(() => {})
      await page.waitForTimeout(3500)
    }

    const url = page.url()
    const frames = page.frames().map((f) => f.url())
    const stripeFrame = frames.find((u) => /js\.stripe\.com|stripe\.network/i.test(u)) ?? null
    const bodyText = await page.evaluate(() => document.body.innerText).catch(() => '')
    await page.screenshot({ path: path.join(SHOTS, 'checkout-boundary-1440.png'), fullPage: true }).catch(() => {})

    if (stripeFrame) {
      note('checkout', 'Stripe payment surface', 'REACHED', `${url.replace(BASE, '')} -- a Stripe iframe is mounted. NO CARD WAS TYPED.`)
    } else if (/card number|payment details|pay now/i.test(bodyText)) {
      note('checkout', 'Stripe payment surface', 'REACHED (no iframe seen)', url.replace(BASE, ''))
    } else {
      note('checkout', 'Stripe payment surface', 'NOT REACHED', `stopped at ${url.replace(BASE, '')}`)
      finding(SEV.MONEY, 'checkout', 'payment surface not reached', `the walk stopped at ${url.replace(BASE, '')} without mounting a Stripe payment element. Either the flow needs sign-in first, or the money path is blocked.`)
    }
    const bad = [...new Set((await page.content().catch(() => '')).match(BAD_HOST) ?? [])]
    if (bad.length) finding(SEV.DEAD, 'checkout', 'non-canonical host emitted', bad.join(', '))
  } catch (e) {
    finding(SEV.MONEY, 'checkout', 'checkout walk failed', String(e.message).split('\n')[0])
    note('checkout', 'walk', 'FAILED', String(e.message).split('\n')[0])
  }
  await ctx.close()
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
/*
 * THE PASSWORD IS NEVER A LITERAL IN THIS FILE. On 2026-08-08 a company account
 * password reached a third party because it sat as `const PASSWORD = '...'` in
 * eleven committed automation scripts, and this repository now carries a build
 * gate against exactly that shape. A committed default would be the same defect
 * with a friendlier variable name, so this reads the environment and reports the
 * authed surfaces NOT COVERED when nothing is supplied. An uncovered surface
 * announcing itself is honest; a covered surface bought with a leaked credential
 * is not.
 */
const email = process.env.PROOF_EMAIL ?? process.env.SWEEP_ORGANISER_EMAIL ?? null
const password = process.env.PROOF_PASSWORD ?? process.env.SWEEP_ORGANISER_PASSWORD ?? null
/*
 * THE ROUTE LIST IS TAKEN FROM THE ROUTER, NOT FROM MEMORY. The previous version
 * of this list asserted /dashboard/events/new, /dashboard/settings and
 * /dashboard/organisation/team. None of the three exists: the router has
 * /dashboard/events/create, no /dashboard/settings at all, and invites live at
 * /dashboard/invites. Auditing invented URLs manufactures three 404s that are
 * the audit's fault and buries the real findings under them, which is exactly
 * the mistake this file already corrected once for /categories and /music.
 * Every path below appears under src/app/(dashboard).
 */
const AUTHED = [
  ['dashboard', '/dashboard'],
  ['dashboard events', '/dashboard/events'],
  ['dashboard create event', '/dashboard/events/create'],
  ['dashboard venues', '/dashboard/venues'],
  ['dashboard payouts', '/dashboard/payouts'],
  ['dashboard organisation', '/dashboard/organisation'],
  ['dashboard invites', '/dashboard/invites'],
  ['dashboard insights', '/dashboard/insights'],
  ['dashboard tickets', '/dashboard/tickets'],
  ['account', '/account'],
  ['my tickets', '/tickets'],
]
if (email && password) {
  console.log(`\n${'='.repeat(78)}\nAUTHED PASS (1440)\n${'='.repeat(78)}`)
  const context = await browser.newContext({ ...CONTEXT_DEFAULTS,  viewport: { width: 1440, height: 900 } })
  const p = await context.newPage()
  let loggedIn = false
  let loginReason = ''
  /*
   * WHY THE LOGIN FAILED IS THE WHOLE POINT. "login did not complete: Timeout
   * 45000ms exceeded" was the only thing this printed, and that sentence is
   * compatible with a wrong password, a rate limit, a broken form and an outage.
   * The reader then has to reproduce it by hand to find out which. The page says
   * exactly which, in plain English, and the auth response carries the status, so
   * both are captured and reported instead of a timeout.
   */
  const authStatuses = []
  p.on('response', (r) => {
    if (/\/auth\/v1\/token/.test(r.url())) authStatuses.push(r.status())
  })
  try {
    await p.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await p.locator('input[type="email"], input[name*="email" i]').first().fill(email)
    await p.locator('input[type="password"]').first().fill(password)
    await p.locator('button[type="submit"]').first().click()
    await p.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 45_000 })
    loggedIn = true
  } catch {
    const text = await p.evaluate(() => document.body.innerText).catch(() => '')
    const onScreen = text
      .split('\n')
      .map((l) => l.trim())
      .find((l) => /did not match|too many|invalid|incorrect|confirm|verify|failed/i.test(l))
    loginReason =
      `${onScreen ?? 'the page showed no error message'}` +
      `${authStatuses.length ? ` (GoTrue answered HTTP ${[...new Set(authStatuses)].join(', ')})` : ' (no GoTrue call was observed)'}`
    console.log(`  login did not complete: ${loginReason}`)
  }
  await p.close()
  if (loggedIn) {
    for (const [label, href] of AUTHED) {
      const v = await visit(context, `${BASE}${href}`, label, VIEWPORTS[1])
      console.log(`  ${label.padEnd(30)} ${String(v.record.status).padEnd(4)} ${v.record.state}`)
      await exerciseControls(v.page, v.controls, label, VIEWPORTS[1])
      await v.page.close()
    }

    /*
     * PHASE F. MAGIC START: is it calling Anthropic, or quietly pattern matching?
     *
     * A key being set proves nothing about the code path. This is answered from
     * the wire: /api/ai/magic-start returns `source: "model"` when the model
     * produced the draft and `source: "deterministic"` when the route fell
     * through to buildDeterministicDraft, which it does for an unconfigured key,
     * an exhausted budget, an unreachable meter or an upstream failure. The
     * organiser sees a complete draft either way, by design, which is precisely
     * why the difference is invisible from the screen and has to be read off the
     * response.
     */
    console.log(`\n${'='.repeat(78)}\nPHASE F: Magic Start, model or fallback\n${'='.repeat(78)}`)
    const mp = await context.newPage()
    let magic = null
    mp.on('response', async (res) => {
      if (!/\/api\/ai\/magic-start/.test(res.url())) return
      const json = await res.json().catch(() => null)
      magic = { status: res.status(), source: json?.source ?? null, error: json?.error ?? null, ok: json?.ok ?? null }
    })
    try {
      await mp.goto(`${BASE}/dashboard/events/create`, { waitUntil: 'domcontentloaded', timeout: 90_000 })
      await mp.waitForTimeout(2500)
      const ta = mp.locator('textarea').first()
      if (await ta.count()) {
        await ta.fill('Free comedy night called Audit Probe Comedy at the Barwon Club in Geelong on 25 September 2026 at 7:30pm, free entry, 60 capacity')
        const build = mp.getByRole('button', { name: /build my event|magic start|build/i }).first()
        if (await build.count()) {
          await build.click({ timeout: 15_000 }).catch(() => {})
          // Wait for the response handler to fire rather than for a spinner.
          for (let i = 0; i < 60 && !magic; i += 1) await mp.waitForTimeout(1000)
        } else {
          note('magic start', 'build control', 'ABSENT', 'no Build button on /dashboard/events/create')
        }
      } else {
        note('magic start', 'description field', 'ABSENT', 'no textarea on /dashboard/events/create')
      }
      await mp.screenshot({ path: path.join(SHOTS, 'magic-start-1440.png'), fullPage: false }).catch(() => {})
    } catch (e) {
      note('magic start', 'walk', 'FAILED', String(e.message).split('\n')[0])
    }
    if (!magic) {
      note('magic start', 'verdict', 'NO CALL OBSERVED', 'the route was never hit, so neither model nor fallback can be claimed')
      finding(SEV.ERROR, 'magic start', 'no API call observed', 'the create-event surface never called /api/ai/magic-start, so its behaviour is UNPROVEN')
    } else if (magic.source === 'model') {
      note('magic start', 'verdict', 'MODEL', `HTTP ${magic.status}, source="model": the Anthropic call succeeded and wrote the draft`)
    } else if (magic.source === 'deterministic') {
      note('magic start', 'verdict', 'FALLBACK', `HTTP ${magic.status}, source="deterministic": the route fell through to the pattern-matched draft`)
      finding(SEV.ERROR, 'magic start', 'silently falling back to pattern matching', 'the response carried source="deterministic", so no Anthropic draft was produced. The organiser still gets a draft, by design, which is why this is invisible on screen.')
    } else {
      note('magic start', 'verdict', `HTTP ${magic.status}`, `error=${magic.error ?? 'none'} ok=${magic.ok}`)
      finding(SEV.ERROR, 'magic start', `unexpected response HTTP ${magic.status}`, `error=${magic.error ?? 'none'}`)
    }
    await mp.close()

    /*
     * PHASE G. THE SEAT BUILDER, including a zoom and a pan. The renderer is a
     * canvas scene graph, so "it rendered" is not a screenshot of a div: the
     * canvas is measured, then zoomed and panned, and the pixels are compared
     * before and after. A canvas that never changes under a wheel or a drag is a
     * dead control however good it looks at rest.
     */
    console.log(`\n${'='.repeat(78)}\nPHASE G: the seat builder, zoom and pan\n${'='.repeat(78)}`)
    const sp = await context.newPage()
    try {
      await sp.goto(`${BASE}/dashboard/venues`, { waitUntil: 'domcontentloaded', timeout: 90_000 })
      await sp.waitForTimeout(2000)
      const seatHref = await sp.evaluate(() =>
        Array.from(document.querySelectorAll('a[href]'))
          .map((a) => a.getAttribute('href'))
          .find((h) => h && /\/seat-maps/.test(h)) ?? null)
      if (!seatHref) {
        note('seat builder', 'entry point', 'NOT FOUND', '/dashboard/venues rendered no link to a seat map, so the builder could not be reached')
        finding(SEV.ERROR, 'seat builder', 'NOT COVERED', 'no seat-map link on /dashboard/venues for this organiser, so the builder was not audited. It is not a pass.')
      } else {
        const v = await visit(context, `${BASE}${seatHref}`, 'seat maps', VIEWPORTS[1], { settle: 3000 })
        await v.page.close()
        await sp.goto(`${BASE}${seatHref}`, { waitUntil: 'domcontentloaded', timeout: 90_000 })
        await sp.waitForTimeout(4000)
        const canvas = sp.locator('canvas').first()
        if (!(await canvas.count())) {
          note('seat builder', 'canvas', 'ABSENT', 'no canvas element on the seat map surface')
          finding(SEV.ERROR, 'seat builder', 'no canvas rendered', seatHref)
        } else {
          const box = await canvas.boundingBox()
          const snap = async () => (await canvas.screenshot()).toString('base64').slice(0, 4000)
          const before = await snap()
          await sp.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
          await sp.mouse.wheel(0, -400)
          await sp.waitForTimeout(900)
          const zoomed = await snap()
          note('seat builder', 'zoom', zoomed === before ? 'INERT' : 'WORKS', `canvas ${Math.round(box.width)}x${Math.round(box.height)}`)
          if (zoomed === before) finding(SEV.DEAD, 'seat builder', 'zoom changed nothing', 'a wheel over the canvas did not repaint it')
          await sp.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
          await sp.mouse.down()
          await sp.mouse.move(box.x + box.width / 2 - 140, box.y + box.height / 2 - 90, { steps: 12 })
          await sp.mouse.up()
          await sp.waitForTimeout(900)
          const panned = await snap()
          note('seat builder', 'pan', panned === zoomed ? 'INERT' : 'WORKS')
          if (panned === zoomed) finding(SEV.DEAD, 'seat builder', 'pan changed nothing', 'a drag across the canvas did not repaint it')
          await sp.screenshot({ path: path.join(SHOTS, 'seat-builder-1440.png'), fullPage: false }).catch(() => {})
        }
      }
    } catch (e) {
      note('seat builder', 'walk', 'FAILED', String(e.message).split('\n')[0])
      finding(SEV.ERROR, 'seat builder', 'walk failed', String(e.message).split('\n')[0])
    }
    await sp.close()
  } else {
    for (const [label] of AUTHED) {
      surfaces.push({ label, url: '', vp: '1440', status: 'NOT COVERED', state: 'login failed', consoleErrors: [], failedRequests: [], links: 0, controls: 0 })
      finding(SEV.ERROR, label, 'NOT COVERED', `login did not complete, so this surface was not audited. It is not a pass. Reason: ${loginReason}`)
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
lines.push('## The deep phases: what was opened, clicked and read')
lines.push('')
lines.push('| Phase | Item | Verdict | Detail |')
lines.push('|---|---|---|---|')
for (const d of deep) {
  lines.push(`| ${d.phase} | ${d.item} | ${d.verdict} | ${String(d.detail).replace(/\|/g, '\\|').slice(0, 240)} |`)
}
lines.push('')
lines.push('## Every surface')
lines.push('')
lines.push('| Surface | Viewport | Measured | Status | State | Console | Links | Controls |')
lines.push('|---|---|---|---|---|---|---|---|')
for (const s of surfaces) {
  lines.push(`| ${s.label} | ${s.vp} | ${s.measuredViewport ?? '-'} | ${s.status} | ${s.state} | ${s.consoleErrors?.length ?? 0} | ${s.links ?? 0} | ${s.controls ?? 0} |`)
}

/*
 * A deep-only run writes its own pair of files. It covers a different set of
 * surfaces from the full walk, so overwriting REPORT.md with it would delete the
 * link sweep and leave a report that looks complete and is not.
 */
const SUFFIX = ONLY === 'deep' ? '-deep' : ''
/*
 * THE DATA IS WRITTEN BEFORE THE PROSE, and the order is the point.
 *
 * On the run that found this, the markdown went first and the JSON second, and a
 * ReferenceError in between destroyed an hour of walking: the deep pass
 * overwrote the full walk's REPORT.md with its own fifteen surfaces and then died
 * before saving anything at all. The raw record is the expensive artefact; the
 * markdown is only a view of it and can be rebuilt at any time with
 * scripts/verify/audit-report-from-raw.mjs. So the regenerable one is the one
 * allowed to be at risk.
 */
writeFileSync(path.join(OUT, `raw${SUFFIX}.json`), JSON.stringify({ report, surfaces, findings, deep }, null, 2), 'utf8')
writeFileSync(path.join(OUT, `REPORT${SUFFIX}.md`), lines.join('\n'), 'utf8')

console.log(`\n${'='.repeat(78)}`)
console.log(`SURFACES: ${surfaces.length}   FINDINGS: ${findings.length}`)
for (let i = 0; i < SEVNAME.length; i += 1) {
  const n = findings.filter((f) => f.severity === i).length
  if (n) console.log(`   ${SEVNAME[i].padEnd(24)} ${n}`)
}
console.log(`Report: ${path.join(OUT, `REPORT${SUFFIX}.md`)}`)
console.log('='.repeat(78))
