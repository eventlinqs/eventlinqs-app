/**
 * B2, SCOPE v5 3.13: TWO DOORS SEE EACH OTHER.
 *
 * One organiser, three guests and two doors on two browsers, through the real
 * screens on a local production server against TEST, at the viewport
 * JOURNEY_VIEWPORT names (desktop-1440, tablet-768, mobile-390).
 *
 *   1. THE ORGANISER signs up, confirms from the inbox, publishes a FREE event
 *      through the wizard. THREE GUESTS take a ticket each and hold the link
 *      the confirmation email carries (the string the QR encodes).
 *   2. DOOR A and DOOR B (the organiser signed in on two fresh browsers) open
 *      the scanner. Both download the door list, both say "Live with the
 *      other doors" and "Checked in 0 of 3".
 *   3. DOOR A admits ticket 1 online. Within seconds Door B's strip names it,
 *      "Door XXXX admitted Ayesha Rahman just now", and counts "Checked in 1
 *      of 3", without Door B syncing anything.
 *   4. DOOR B is cut off and scans ticket 1: REJECT already used, judged by
 *      the device, because the live row had already moved its local record.
 *   5. DOOR B is reconnected, rejoins, and admits ticket 2 online. Door A's
 *      strip names it and reads "Checked in 2 of 3". Door A scans ticket 2
 *      online: REJECT already used, with how long ago.
 *   6. On TEST: exactly one admitted row per ticket, each carrying its door's
 *      own device id, two different doors. The organiser's attendees page
 *      counts 2 checked in.
 *
 * Usage: powershell -File C:\dev\run-journey.ps1 -Script scripts\journeys\b2-live-doors.mjs
 */
import { copyFileSync, mkdirSync, existsSync, readdirSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
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

const j = makeJourney('b2-live-doors', 'B2: two doors see each other')
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
const ORGANISER = { name: 'Priya Natarajan', email: `priya.live.${stamp}@example.com`, password: mint() }
const GUESTS = [
  { name: 'Ayesha Rahman', email: `ayesha.live.${stamp}@example.com`, password: mint() },
  { name: 'Liam Kealoha', email: `liam.live.${stamp}@example.com`, password: mint() },
  { name: 'Mei Lin Chen', email: `meilin.live.${stamp}@example.com`, password: mint() },
]
const TITLE = `Two Doors ${stamp}`
/** How long a live row may take to cross the socket before the verdict fails. */
const LIVE_WAIT_MS = 20000

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
  return p
    .waitForFunction(
      ({ sel, src, flags }) => {
        const el = document.querySelector(sel)
        return Boolean(el) && new RegExp(src, flags).test((el.textContent || '').replace(/\s+/g, ' '))
      },
      { sel, src: rx.source, flags: rx.flags },
      { timeout },
    )
    .then(() => true)
    .catch(() => false)
}

async function axeCheck(p, label) {
  const results = await new AxeBuilder({ page: p }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  const violations = results.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.map((n) => ({ target: n.target, html: n.html?.slice(0, 200) })) }))
  writeFileSync(join(j.OUT, `axe-${label}.json`), JSON.stringify({ url: results.url, viewport: viewportLabel, violations }, null, 2))
  verdict(`axe, ${label}: 0 violations at any impact`, violations.length === 0, violations.map((v) => `[${v.impact}] ${v.id}`).join(', ') || 'clean')
}

async function takeFreeTicket(p, slug, who) {
  await p.goto(`${BASE}/events/${slug}`, { waitUntil: 'networkidle', timeout: 60000 })
  await p.waitForTimeout(2500)
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

async function scanLink(p, link) {
  await p.fill('input[aria-label="Ticket code or ticket link"]', link)
  await p.click('button:has-text("Check in")')
  await p.waitForSelector('[data-testid="scan-result"]', { timeout: 20000 }).catch(() => {})
  const card = await text(p, '[data-testid="scan-result"]')
  const judged = await text(p, '[data-testid="scan-result-judged"]')
  const errors = await messagesOnScreen(p)
  const label = /^ADMIT/.test(card) ? 'ADMIT' : /^REJECT/.test(card) ? 'REJECT' : 'NONE'
  await p.waitForTimeout(4500)
  return { label, card, judged, errors }
}

async function openDoor(who) {
  const door = await fresh()
  await signIn(j, door.p, ORGANISER.email, ORGANISER.password)
  await door.p.goto(`${BASE}/scan/${run.eventId}`, { waitUntil: 'networkidle', timeout: 60000 })
  const ready = await waitForText(door.p, '[data-testid="door-set"]', /Offline ready\. 3 tickets,/, 90000)
  verdict(`${who} downloaded the door list: 3 tickets`, ready, await text(door.p, '[data-testid="door-set"]'))
  const live = await waitForText(door.p, '[data-testid="door-live-status"]', /Live with the other doors/, LIVE_WAIT_MS)
  verdict(`${who} is live with the other doors`, live, await text(door.p, '[data-testid="door-live-status"]'))
  const count = await text(door.p, '[data-testid="door-checked-in"]')
  verdict(`${who} counts nobody through the door yet`, /Checked in 0 of 3/.test(count), count)
  return door
}

try {
  // ── THE ORGANISER ─────────────────────────────────────────────────────────
  const org = await fresh()
  if (!(await signUpAndConfirm(j, org.p, ORGANISER))) throw new Error('organiser signup failed')
  const review = await createEventThroughWizard(j, org.p, {
    title: TITLE,
    summary: 'A free night with two doors that know what each other admitted.',
    description:
      'Three guests, two doors on two phones. Whatever one door admits, the other knows within seconds, so a ticket cannot walk in twice even when one phone loses its signal straight after.',
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

  // ── TWO DOORS, BOTH LIVE ──────────────────────────────────────────────────
  const doorA = await openDoor('Door A')
  const doorB = await openDoor('Door B')
  await describe(j, doorA.p, 'Door A live')
  await axeCheck(doorA.p, 'door-live-ready')

  // ── DOOR A ADMITS, DOOR B SEES IT ─────────────────────────────────────────
  const a1 = await scanLink(doorA.p, t1.link)
  verdict(`Door A admits ticket 1 (${t1.guest.name}) online`, a1.label === 'ADMIT' && /online/i.test(a1.judged), `${a1.card} :: ${a1.judged}`)
  const sawA1 = await waitForText(doorB.p, '[data-testid="door-live"]', new RegExp(`Door [0-9A-F]{4} admitted ${t1.guest.name}`), LIVE_WAIT_MS)
  const feedB = await text(doorB.p, '[data-testid="door-live"]')
  verdict(`Door B's strip names Door A's admission within ${LIVE_WAIT_MS / 1000} seconds`, sawA1, feedB)
  const countB1 = await waitForText(doorB.p, '[data-testid="door-checked-in"]', /Checked in 1 of 3/, LIVE_WAIT_MS)
  verdict('Door B counts 1 of 3 through the door, having synced nothing', countB1, await text(doorB.p, '[data-testid="door-checked-in"]'))
  await describe(j, doorB.p, 'Door B sees Door A admit ticket 1')
  await axeCheck(doorB.p, 'door-live-feed')

  // ── DOOR B LOSES ITS SIGNAL AND STILL KNOWS ───────────────────────────────
  await doorB.ctx.setOffline(true)
  await doorB.p.waitForTimeout(1500)
  const pausedB = await text(doorB.p, '[data-testid="door-live-status"]')
  verdict('Door B says the live feed is paused while offline', /Live feed paused while offline/.test(pausedB), pausedB)
  const b1 = await scanLink(doorB.p, t1.link)
  verdict('Door B, offline, refuses ticket 1 as already used, from what it learned live', b1.label === 'REJECT' && /Already used/.test(b1.card) && /offline/i.test(b1.judged), `${b1.card} :: ${b1.judged}`)
  await describe(j, doorB.p, 'Door B refuses ticket 1 offline')

  // ── DOOR B RETURNS AND ADMITS, DOOR A SEES IT ─────────────────────────────
  await doorB.ctx.setOffline(false)
  const backB = await waitForText(doorB.p, '[data-testid="door-live-status"]', /Live with the other doors/, LIVE_WAIT_MS)
  verdict('Door B rejoins the other doors when the signal returns', backB, await text(doorB.p, '[data-testid="door-live-status"]'))
  const b2 = await scanLink(doorB.p, t2.link)
  verdict(`Door B admits ticket 2 (${t2.guest.name}) online`, b2.label === 'ADMIT' && /online/i.test(b2.judged), `${b2.card} :: ${b2.judged}`)
  const sawB2 = await waitForText(doorA.p, '[data-testid="door-live"]', new RegExp(`Door [0-9A-F]{4} admitted ${t2.guest.name}`), LIVE_WAIT_MS)
  verdict("Door A's strip names Door B's admission", sawB2, await text(doorA.p, '[data-testid="door-live"]'))
  const countA2 = await waitForText(doorA.p, '[data-testid="door-checked-in"]', /Checked in 2 of 3/, LIVE_WAIT_MS)
  verdict('Door A counts 2 of 3 through the door', countA2, await text(doorA.p, '[data-testid="door-checked-in"]'))
  await describe(j, doorA.p, 'Door A sees Door B admit ticket 2')
  const a2 = await scanLink(doorA.p, t2.link)
  verdict('Door A, online, refuses ticket 2 as already used, with how long ago', a2.label === 'REJECT' && /Already used (just now|\d+ (second|minute|hour|day)s? ago)/.test(a2.card) && /online/i.test(a2.judged), `${a2.card} :: ${a2.judged}`)
  const feedA = await doorA.p.$$('[data-testid="door-live-entry"]')
  verdict("Door A's feed carries only the other door's scans, never its own echo", feedA.length >= 1 && !(await text(doorA.p, '[data-testid="door-live"]')).includes(t1.guest.name), `${feedA.length} line(s)`)
  await describe(j, doorA.p, 'Door A refuses ticket 2 online')

  // ── THE ROWS ON TEST ──────────────────────────────────────────────────────
  if (db) {
    const { data: ticketRows } = await db.from('tickets').select('id, ticket_code, status').eq('event_id', run.eventId)
    const idOf = (code) => ticketRows?.find((t) => t.ticket_code === code)?.id
    const { data: rows } = await db.from('ticket_scans').select('ticket_id, result, device_id, scanned_offline').eq('event_id', run.eventId).order('scanned_at')
    const admitted = (code) => (rows ?? []).filter((r) => r.ticket_id === idOf(code) && r.result === 'admitted')
    verdict('exactly one admitted row for ticket 1 and for ticket 2, none for ticket 3', admitted(t1.code).length === 1 && admitted(t2.code).length === 1 && admitted(t3.code).length === 0, JSON.stringify(rows?.map((r) => [r.result, r.device_id?.slice(0, 4)])))
    const doors = new Set([admitted(t1.code)[0]?.device_id, admitted(t2.code)[0]?.device_id].filter(Boolean))
    verdict('the two admissions carry two different door ids', doors.size === 2, [...doors].map((d) => d.slice(0, 8)).join(', '))
    verdict('the refusals were recorded online with their door ids too', (rows ?? []).filter((r) => r.result === 'already_scanned' && !r.scanned_offline && r.device_id).length >= 1)
    run.deviceIds = [...doors]
  }
  await doorA.ctx.close()
  await doorB.ctx.close()

  // ── THE ORGANISER'S COUNT ─────────────────────────────────────────────────
  await org.p.goto(`${BASE}/dashboard/events/${run.eventId}/attendees`, { waitUntil: 'networkidle', timeout: 60000 })
  await org.p.waitForTimeout(1500)
  const attendees = (await org.p.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ')
  verdict('the attendees page counts 2 checked in and 1 not', /Checked in\s*2/i.test(attendees) && /Not checked in\s*1/i.test(attendees), attendees.match(/Attendees\s*\d+.*?Not checked in\s*\d+/i)?.[0] ?? attendees.slice(0, 160))
  await describe(j, org.p, 'Attendees after two doors')
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
