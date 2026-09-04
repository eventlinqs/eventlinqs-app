/**
 * B1, SCOPE v5 3.13: THE DOOR WITHOUT A SIGNAL.
 *
 * One organiser, three guests and two doors, through the real screens on a
 * local production server against TEST, at the viewport JOURNEY_VIEWPORT names
 * (desktop-1440, tablet-768, mobile-390). Every step is a click, a keystroke or
 * a paste in a real Chromium; the only reads outside the UI are verdicts on the
 * rows the database holds afterwards.
 *
 *   1. THE ORGANISER signs up through the real form, confirms from the inbox,
 *      creates a FREE event through the wizard (capacity 10, a composed cover)
 *      and publishes it. A door does not care what a ticket cost, and a free
 *      ticket is confirmed without Stripe, so the whole night runs on one
 *      server.
 *   2. THREE GUESTS each sign up, take one free ticket from the public page,
 *      and hold the ticket link the confirmation email carries. That link is
 *      exactly what the QR encodes, so pasting it into the scanner's manual
 *      entry is the same thing as the camera reading it.
 *   3. DOOR A (the organiser, signed in on a fresh browser) opens the scanner
 *      and waits for "Offline ready. 3 tickets". The network is cut. Ticket 1
 *      is ADMITTED offline; ticket 1 again is REJECTED as already used just
 *      now; a made-up code is REJECTED as not found; ticket 2 is ADMITTED
 *      offline. The strip says four scans are waiting. The page is RELOADED
 *      with the network still cut and the scanner comes back, from the
 *      service worker, with its door list and its queue.
 *   4. DOOR B (the same organiser on a second browser) opens the scanner
 *      online, downloads the same list (tickets 1 and 2 are still valid on
 *      the server because Door A has not synced), goes offline, and admits
 *      ticket 2 and ticket 3. Two doors have now admitted ticket 2.
 *   5. DOOR A reconnects and syncs: four scans, nothing to review. DOOR B
 *      reconnects and syncs: two scans, one needs review, and the strip says
 *      ticket 2 was admitted at another door first. Door B scans ticket 1
 *      online and is refused with how long ago it was used.
 *   6. THE ROWS ON TEST: exactly one admitted row per ticket, one flagged row
 *      for ticket 2 from Door B, three tickets scanned.
 *   7. THE ORGANISER opens Attendees, reads the Door review panel naming both
 *      doors and both times, writes a note, marks it resolved, and the panel
 *      empties; the row on TEST reads resolved with the note.
 *
 * Usage: powershell -File C:\dev\run-journey.ps1 -Script scripts\journeys\b1-offline-door.mjs
 */
import { copyFileSync, mkdirSync, existsSync, readdirSync, writeFileSync } from 'node:fs'
import { randomBytes, randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { AxeBuilder } from '@axe-core/playwright'
import {
  chromium,
  BASE,
  makeJourney,
  note,
  attach,
  describe,
  finish,
  messagesOnScreen,
  linkFromInbox,
  signIn,
  signUpAndConfirm,
  createEventThroughWizard,
} from './harness.mjs'

const j = makeJourney('b1-offline-door', 'B1: the door without a signal')
const stamp = process.env.RUN_STAMP ?? String(Date.now()).slice(-6)
const viewportLabel = process.env.JOURNEY_VIEWPORT ?? 'desktop-1440'
const VIEWPORTS = {
  'mobile-390': { width: 390, height: 844 },
  'tablet-768': { width: 768, height: 1024 },
  'desktop-1440': { width: 1440, height: 1000 },
}
const viewport = VIEWPORTS[viewportLabel] ?? VIEWPORTS['desktop-1440']

/* Minted per run, never a literal in the tree, never printed. */
const mint = () => randomBytes(12).toString('base64url') + '-Aa1'
const ORGANISER = { name: 'Tomasz Nowak', email: `tomasz.door.${stamp}@example.com`, password: mint() }
const GUESTS = [
  { name: 'Ayesha Rahman', email: `ayesha.door.${stamp}@example.com`, password: mint() },
  { name: 'Liam Kealoha', email: `liam.door.${stamp}@example.com`, password: mint() },
  { name: 'Mei Lin Chen', email: `meilin.door.${stamp}@example.com`, password: mint() },
]
const TITLE = `Door Night ${stamp}`

const browser = await chromium.launch()
const results = []
function verdict(name, ok, detail) {
  results.push({ name, ok, detail })
  note(j, `${ok ? 'PASS' : 'FAIL'}  ${name}`, detail)
  if (!ok) j.blockers.push(`${name}: ${detail ?? ''}`)
}
const run = { viewport: viewportLabel, base: BASE, organiserEmail: ORGANISER.email, title: TITLE }

const db = (() => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !service) return null
  if (/gndnldyfudbytbboxesk/.test(url)) throw new Error('refusing to run a journey against production')
  return createClient(url, service, { auth: { persistSession: false } })
})()

let connections = 0
async function fresh() {
  connections += 1
  const ctx = await browser.newContext({
    viewport,
    locale: 'en-AU',
    // Each person is a different address to the rate limiters, as they would be.
    extraHTTPHeaders: { 'x-forwarded-for': `203.0.113.${connections}` },
  })
  const p = await ctx.newPage()
  await attach(j, p)
  return { ctx, p }
}

async function keepSession(ctx, name) {
  if (!process.env.EVIDENCE_DIR) return
  const dest = join(process.env.EVIDENCE_DIR, viewportLabel)
  mkdirSync(dest, { recursive: true })
  await ctx.storageState({ path: join(dest, `session-${name}.json`) })
}

async function text(p, sel) {
  return (await p.locator(sel).first().innerText({ timeout: 5000 }).catch(() => '')).replace(/\s+/g, ' ').trim()
}

async function waitForText(p, sel, rx, timeout = 60000) {
  await p.waitForFunction(
    ({ sel, src, flags }) => {
      const el = document.querySelector(sel)
      return Boolean(el) && new RegExp(src, flags).test((el.textContent || '').replace(/\s+/g, ' '))
    },
    { sel, src: rx.source, flags: rx.flags },
    { timeout },
  )
}

/**
 * AXE AT THE MOMENT A STATE IS ON SCREEN. The offline result card, the flag
 * after a sync and the review row cannot be reached by a URL, so the scan runs
 * inside the journey while they are visible: WCAG 2.0 and 2.1 A and AA, every
 * impact counted, one JSON per state beside the screenshots.
 */
async function axeCheck(p, label) {
  const results = await new AxeBuilder({ page: p }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  const violations = results.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.map((n) => ({ target: n.target, html: n.html?.slice(0, 200) })) }))
  writeFileSync(join(j.OUT, `axe-${label}.json`), JSON.stringify({ url: results.url, viewport: viewportLabel, violations }, null, 2))
  verdict(`axe, ${label}: 0 violations at any impact`, violations.length === 0, violations.map((v) => `[${v.impact}] ${v.id}`).join(', ') || 'clean')
}

/** Sign in, open the public page, take one free ticket, land on the confirmation. */
async function takeFreeTicket(p, slug, who) {
  await p.goto(`${BASE}/events/${slug}`, { waitUntil: 'networkidle', timeout: 60000 })
  await p.waitForTimeout(2500)
  // A closed selector opens with Get tickets; an open one already shows the stepper.
  for (const el of await p.$$('button')) {
    const t = ((await el.innerText().catch(() => '')) || '').trim()
    if (/^(get tickets|select tickets)/i.test(t) && (await el.isVisible().catch(() => false)) && !(await p.$('button[aria-label^="Increase"]'))) {
      await el.click().catch(() => {})
      await p.waitForTimeout(1500)
      break
    }
  }
  const plus = p.locator('button[aria-label^="Increase"]').first()
  if (!(await plus.count())) {
    j.blockers.push(`${who}: no quantity control on the event page`)
    return null
  }
  await plus.click()
  await p.waitForTimeout(1200)
  await describe(j, p, `${who} picks one ticket`)
  for (let attempt = 0; attempt < 4 && !/\/orders\//.test(p.url()); attempt += 1) {
    let clicked = null
    for (const el of await p.$$('button')) {
      const t = ((await el.innerText().catch(() => '')) || '').trim()
      if (/^(register|checkout|get tickets|reserve|complete|confirm|continue)/i.test(t) && (await el.isVisible().catch(() => false))) {
        await el.click().catch(() => {})
        clicked = t
        break
      }
    }
    if (!clicked) break
    await p.waitForTimeout(6000)
    if (!/\/orders\//.test(p.url())) {
      for (const el of await p.$$('button')) {
        const t = ((await el.innerText().catch(() => '')) || '').trim()
        if (/use my details for all tickets/i.test(t) && (await el.isVisible().catch(() => false))) {
          await el.click().catch(() => {})
          await p.waitForTimeout(800)
        }
      }
    }
  }
  await describe(j, p, `${who} holds a ticket`)
  return p.url().match(/\/orders\/([0-9a-f-]{36})/)?.[1] ?? null
}

/** Paste a ticket link into manual entry and read the result card. */
async function scanLink(p, link, axeLabel = null) {
  await p.fill('input[aria-label="Ticket code or ticket link"]', link)
  await p.click('button:has-text("Check in")')
  await p.waitForSelector('[data-testid="scan-result"]', { timeout: 20000 }).catch(() => {})
  const card = await text(p, '[data-testid="scan-result"]')
  const judged = await text(p, '[data-testid="scan-result-judged"]')
  const errors = await messagesOnScreen(p)
  const label = /^ADMIT/.test(card) ? 'ADMIT' : /^REJECT/.test(card) ? 'REJECT' : 'NONE'
  if (axeLabel) await axeCheck(p, axeLabel)
  // The result holds 4 s and the same code is debounced for 3 s.
  await p.waitForTimeout(4500)
  return { label, card, judged, errors }
}

async function openDoor(who) {
  const door = await fresh()
  await signIn(j, door.p, ORGANISER.email, ORGANISER.password)
  await door.p.goto(`${BASE}/scan/${run.eventId}`, { waitUntil: 'networkidle', timeout: 60000 })
  await waitForText(door.p, '[data-testid="door-set"]', /Offline ready\./, 90000).catch(() => {})
  const line = await text(door.p, '[data-testid="door-set"]')
  verdict(`${who} downloaded the door list: 3 tickets`, /Offline ready\. 3 tickets,/.test(line), line)
  // The worker controls the page and the shell is kept before the signal is cut.
  const shell = await door.p
    .waitForFunction(
      async (cacheName) => {
        if (!navigator.serviceWorker.controller) return false
        const cache = await caches.open(cacheName)
        return (await cache.keys()).length >= 2
      },
      'eventlinqs-door-shell-v1',
      { timeout: 30000 },
    )
    .then(() => true)
    .catch(() => false)
  verdict(`${who}: the service worker controls the scanner and the shell is kept`, shell)
  return door
}

async function scanRows() {
  if (!db) return null
  const { data } = await db
    .from('ticket_scans')
    .select('ticket_id, result, review_status, review_note, scanned_offline, device_id, client_scan_id')
    .eq('event_id', run.eventId)
    .order('scanned_at', { ascending: true })
  return data ?? []
}

try {
  // ── THE ORGANISER ─────────────────────────────────────────────────────────
  const org = await fresh()
  if (!(await signUpAndConfirm(j, org.p, ORGANISER))) throw new Error('organiser signup failed')
  const review = await createEventThroughWizard(j, org.p, {
    title: TITLE,
    summary: 'A free night whose door keeps working without a signal.',
    description:
      'Three guests, two doors and one list. The door list is downloaded before the gates open, so the phones admit people whether or not the paddock has reception, and the doors reconcile when they come back online.',
    price: null,
    capacity: '10',
    wantCover: true,
  })
  verdict('the organiser reached Review with Publish enabled', Boolean(review.reachedReview) && !review.publishDisabled, (review.reviewText ?? '').slice(0, 120))
  if (!review.publishButton) throw new Error('no publish button')
  await review.publishButton.click()
  await org.p.waitForTimeout(12000)
  const afterPublish = org.p.url()
  run.eventId = afterPublish.match(/\/dashboard\/events\/([0-9a-f-]{36})/)?.[1] ?? null
  run.slug = await org.p.evaluate(() => {
    const skip = new Set(['create', 'browse', 'map', 'search'])
    for (const a of document.querySelectorAll('a[href]')) {
      const m = a.getAttribute('href')?.match(/^(?:https?:\/\/[^/]+)?\/events\/([a-z0-9-]+)\/?$/)
      if (m && !skip.has(m[1])) return m[1]
    }
    return null
  })
  verdict('the free event published', Boolean(run.eventId && run.slug), `${afterPublish.replace(BASE, '')} slug=${run.slug}`)
  await describe(j, org.p, 'After publish')
  if (!run.eventId || !run.slug) throw new Error('no event')
  await keepSession(org.ctx, 'organiser')

  // ── THREE GUESTS ──────────────────────────────────────────────────────────
  const tickets = []
  for (const guest of GUESTS) {
    const g = await fresh()
    if (!(await signUpAndConfirm(j, g.p, guest))) throw new Error(`${guest.name} could not sign up`)
    const orderId = await takeFreeTicket(g.p, run.slug, guest.name)
    const link = linkFromInbox(guest.email, /\/t\/[^/?]+\?k=/)
    const code = link ? decodeURIComponent(link.match(/\/t\/([^?/]+)/)?.[1] ?? '') : null
    verdict(`${guest.name} holds a ticket and its link from the confirmation email`, Boolean(orderId && link && code), link ? link.replace(BASE, '') : `order ${orderId ?? 'none'}, no link`)
    tickets.push({ guest, link, code, orderId })
    await g.ctx.close()
  }
  if (tickets.some((t) => !t.link)) throw new Error('a guest has no ticket link')
  run.tickets = tickets.map((t) => ({ name: t.guest.name, code: t.code }))
  const [t1, t2, t3] = tickets

  // ── DOOR A ────────────────────────────────────────────────────────────────
  const doorA = await openDoor('Door A')
  await describe(j, doorA.p, 'Door A ready')
  await axeCheck(doorA.p, 'door-ready-online')
  await doorA.ctx.setOffline(true)
  await doorA.p.waitForTimeout(1500)
  const modeA = await text(doorA.p, '[data-testid="door-mode"]')
  verdict('Door A knows the signal is gone', /Offline, scanning against the door list/.test(modeA), modeA)

  const a1 = await scanLink(doorA.p, t1.link, 'door-offline-admit')
  verdict(`ticket 1 (${t1.guest.name}) is ADMITTED offline`, a1.label === 'ADMIT' && /offline/i.test(a1.judged) && a1.card.includes(t1.guest.name), `${a1.card} :: ${a1.judged}`)
  await describe(j, doorA.p, 'Door A admits ticket 1 offline')
  const a1b = await scanLink(doorA.p, t1.link, 'door-offline-reject')
  verdict('ticket 1 again is REJECTED as already used just now', a1b.label === 'REJECT' && /Already used just now/.test(a1b.card), a1b.card)
  await describe(j, doorA.p, 'Door A refuses ticket 1 a second time')
  const ghost = await scanLink(doorA.p, `${BASE}/t/EL-ZZZZ-ZZZZ?k=${randomUUID()}`)
  verdict('a made-up code is REJECTED as not found offline', ghost.label === 'REJECT' && /Not found/.test(ghost.card) && /offline/i.test(ghost.judged), ghost.card)
  const a2 = await scanLink(doorA.p, t2.link)
  verdict(`ticket 2 (${t2.guest.name}) is ADMITTED offline`, a2.label === 'ADMIT' && /offline/i.test(a2.judged), `${a2.card} :: ${a2.judged}`)
  const pendingA = await text(doorA.p, '[data-testid="door-pending"]')
  verdict('Door A shows 4 scans waiting to sync', /4 scans waiting to sync/.test(pendingA), pendingA)
  await describe(j, doorA.p, 'Door A with four scans waiting')

  // Reload with the network still cut: the service worker serves the scanner.
  await doorA.p.reload({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch((e) => note(j, 'Reload while offline threw', String(e).slice(0, 160)))
  await doorA.p.waitForTimeout(4000)
  const reloadedSet = await text(doorA.p, '[data-testid="door-set"]')
  const reloadedPending = await text(doorA.p, '[data-testid="door-pending"]')
  const reloadedMode = await text(doorA.p, '[data-testid="door-mode"]')
  verdict('the scanner reopens with no signal, from the service worker, with its door list', /Offline ready\. 3 tickets,/.test(reloadedSet) && /Offline, scanning/.test(reloadedMode), `${reloadedMode} :: ${reloadedSet}`)
  verdict('the queue survives the reload', /4 scans waiting to sync/.test(reloadedPending), reloadedPending)
  await describe(j, doorA.p, 'Door A reloaded offline')
  await axeCheck(doorA.p, 'door-reloaded-offline')

  // ── DOOR B ────────────────────────────────────────────────────────────────
  const doorB = await openDoor('Door B')
  await doorB.ctx.setOffline(true)
  await doorB.p.waitForTimeout(1500)
  const b2 = await scanLink(doorB.p, t2.link)
  verdict('Door B, also offline, admits ticket 2 as well (the conflict)', b2.label === 'ADMIT' && /offline/i.test(b2.judged), `${b2.card} :: ${b2.judged}`)
  const b3 = await scanLink(doorB.p, t3.link)
  verdict(`Door B admits ticket 3 (${t3.guest.name}) offline`, b3.label === 'ADMIT' && /offline/i.test(b3.judged), `${b3.card} :: ${b3.judged}`)
  await describe(j, doorB.p, 'Door B offline with two admissions')

  // ── DOOR A RECONNECTS: FIRST SYNC WINS ────────────────────────────────────
  await doorA.ctx.setOffline(false)
  await waitForText(doorA.p, '[data-testid="door-sync"]', /synced/, 90000).catch(() => {})
  const syncA = await text(doorA.p, '[data-testid="door-sync"]')
  const flagsA = await doorA.p.$$('[data-testid="door-flag"]')
  verdict('Door A synced its four scans with nothing to review', /4 scans synced\.$/.test(syncA) && flagsA.length === 0, `${syncA} (${flagsA.length} flags)`)
  const modeAfterA = await text(doorA.p, '[data-testid="door-mode"]')
  verdict('Door A is online again with an empty queue', /^Online/.test(modeAfterA) && (await text(doorA.p, '[data-testid="door-pending"]')) === '', modeAfterA)
  await describe(j, doorA.p, 'Door A synced')

  // ── DOOR B RECONNECTS: THE SECOND IS FLAGGED ──────────────────────────────
  await doorB.ctx.setOffline(false)
  await waitForText(doorB.p, '[data-testid="door-sync"]', /synced/, 90000).catch(() => {})
  const syncB = await text(doorB.p, '[data-testid="door-sync"]')
  const flagB = await text(doorB.p, '[data-testid="door-flag"]')
  verdict('Door B synced two scans and one needs review', /2 scans synced, 1 needs review\./.test(syncB), syncB)
  verdict('Door B is told ticket 2 was admitted at another door first', flagB.includes(t2.code) && /was admitted at another door first/.test(flagB), flagB)
  await describe(j, doorB.p, 'Door B synced with a flag')
  await axeCheck(doorB.p, 'door-synced-with-flag')
  const online1 = await scanLink(doorB.p, t1.link)
  // "just now" IS a time: the first drive ran the whole door sequence in under a
  // minute (Door A admitted at 20:19:58, Door B asked at 20:20:50), so the
  // relative words are read as the door reads them, from seconds to days.
  verdict('Door B, online, refuses ticket 1 as already used, with how long ago', online1.label === 'REJECT' && /Already used (just now|\d+ (second|minute|hour|day)s? ago)/.test(online1.card) && /online/i.test(online1.judged), `${online1.card} :: ${online1.judged}`)
  await describe(j, doorB.p, 'Door B refuses ticket 1 online')

  // ── THE ROWS ON TEST ──────────────────────────────────────────────────────
  const rows = await scanRows()
  if (rows) {
    const { data: ticketRows } = await db.from('tickets').select('id, ticket_code, status, scan_count').eq('event_id', run.eventId)
    const idOf = (code) => ticketRows?.find((t) => t.ticket_code === code)?.id
    const admitted = (code) => rows.filter((r) => r.ticket_id === idOf(code) && r.result === 'admitted').length
    verdict('exactly one admitted row per ticket on TEST', admitted(t1.code) === 1 && admitted(t2.code) === 1 && admitted(t3.code) === 1, `${admitted(t1.code)}, ${admitted(t2.code)}, ${admitted(t3.code)}`)
    const flagged = rows.filter((r) => r.review_status === 'needs_review')
    verdict('one flagged row, for ticket 2, from an offline scan', flagged.length === 1 && flagged[0].ticket_id === idOf(t2.code) && flagged[0].scanned_offline === true && flagged[0].result === 'already_scanned', JSON.stringify(flagged.map((f) => [f.result, f.scanned_offline])))
    verdict('all three tickets are scanned once', (ticketRows ?? []).every((t) => t.status === 'scanned' && t.scan_count === 1), JSON.stringify(ticketRows?.map((t) => [t.ticket_code, t.status, t.scan_count])))
    run.deviceIds = [...new Set(rows.map((r) => r.device_id).filter(Boolean))]
  }
  await doorA.ctx.close()
  await doorB.ctx.close()

  // ── THE ORGANISER REVIEWS ─────────────────────────────────────────────────
  await org.p.goto(`${BASE}/dashboard/events/${run.eventId}/attendees`, { waitUntil: 'networkidle', timeout: 60000 })
  await org.p.waitForTimeout(1500)
  const reviewRows = await org.p.$$('[data-testid="door-review-row"]')
  const reviewText = await text(org.p, '[data-testid="door-review"]')
  verdict('the Door review panel lists the one flagged scan with both doors', reviewRows.length === 1 && reviewText.includes(t2.code) && /admitted this ticket at .* while offline/.test(reviewText) && /had admitted it offline at/.test(reviewText), reviewText.slice(0, 260))
  await org.p.locator('[data-testid="door-review"]').scrollIntoViewIfNeeded().catch(() => {})
  await describe(j, org.p, 'Door review before resolving')
  await axeCheck(org.p, 'attendees-review-row')
  await org.p.fill('input[id^="review-note-"]', 'Same guest came back through the second door')
  await org.p.click('button:has-text("Mark resolved")')
  await org.p.waitForSelector('[data-testid="door-review-empty"]', { timeout: 20000 }).catch(() => {})
  verdict('Mark resolved clears the panel', (await org.p.$$('[data-testid="door-review-row"]')).length === 0 && Boolean(await org.p.$('[data-testid="door-review-empty"]')))
  await describe(j, org.p, 'Door review resolved')
  await axeCheck(org.p, 'attendees-review-empty')
  await org.p.reload({ waitUntil: 'networkidle', timeout: 60000 })
  await org.p.waitForTimeout(1500)
  verdict('the panel stays empty after a reload', (await org.p.$$('[data-testid="door-review-row"]')).length === 0)
  const rowsAfter = await scanRows()
  if (rowsAfter) {
    const resolved = rowsAfter.filter((r) => r.review_status === 'resolved')
    verdict('the row on TEST reads resolved with the note', resolved.length === 1 && resolved[0].review_note === 'Same guest came back through the second door' && rowsAfter.every((r) => r.review_status !== 'needs_review'), JSON.stringify(resolved.map((r) => r.review_note)))
  }
  await org.ctx.close()
} catch (err) {
  j.blockers.push(`journey stopped: ${err instanceof Error ? err.message : String(err)}`)
} finally {
  const passed = results.filter((r) => r.ok).length
  note(j, 'Verdicts', `${passed} of ${results.length} passed`)
  if (process.env.EVIDENCE_DIR) {
    const dest = join(process.env.EVIDENCE_DIR, viewportLabel)
    mkdirSync(dest, { recursive: true })
    for (const f of readdirSync(j.OUT)) copyFileSync(join(j.OUT, f), join(dest, f))
    run.verdicts = results
    writeFileSync(join(dest, 'run.json'), JSON.stringify(run, null, 2))
    note(j, 'Evidence copied', dest)
  }
  await finish(j, browser)
  if (!existsSync(j.OUT)) process.exit(1)
  process.exit(results.some((r) => !r.ok) || j.blockers.length > 0 ? 1 : 0)
}
