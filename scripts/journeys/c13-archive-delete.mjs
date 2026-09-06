/**
 * C13: ARCHIVE, RESTORE AND DELETE AN EVENT, driven the way an organiser, a
 * ticket holder and a stranger reach it, at one viewport per run
 * (JOURNEY_VIEWPORT=mobile-390 | tablet-768 | desktop-1440).
 *
 *   1. The ORGANISER signs up through the form, publishes a free event A
 *      through the wizard, and a GUEST signs up and takes a free ticket to it.
 *   2. The organiser ARCHIVES A from the events list: the row offers Archive
 *      and no Delete (A has a ticket), the designed dialog confirms it, A leaves
 *      the default list and appears under Archived.
 *   3. A STRANGER gets 404 at A's address; A is absent from /events, the city
 *      browse, on-site search and the sitemap.
 *   4. The GUEST still sees A at /tickets (with the archived note), opens the
 *      bearer ticket, and sees A's page with the archived banner.
 *   5. The organiser's SCANNER admits the guest's ticket on the archived event.
 *   6. The organiser RESTORES A; the stranger gets 200 again.
 *   7. The organiser publishes a zero-sales event B and DELETES it through the
 *      typed dialog (the wrong name keeps the control disabled); its address
 *      answers 410 with the branded page; the database holds a tombstone and
 *      zero referencing rows; both storage prefixes are empty.
 *   8. The organiser CANCELS A; the cancelled row still offers Archive (the
 *      production dead end, gone). The event overview shows why Delete is not
 *      offered.
 *
 * axe runs at every designed state. Screenshots land in the harness folder and
 * are copied to EVIDENCE_DIR/<viewport>/ when that variable is set.
 *
 * Usage (from C:\dev\EVIDENCE\C13\drive-all.sh; the shell must not carry a
 * production NEXT_PUBLIC_SUPABASE_URL, Node's --env-file never overrides one):
 *   JOURNEY_VIEWPORT=desktop-1440 EVIDENCE_DIR=C:/dev/EVIDENCE/C13 BASE=http://localhost:3311 \
 *     node --env-file=.env.local scripts/journeys/c13-archive-delete.mjs
 */
import { copyFileSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
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
  linkFromInbox,
  signUpAndConfirm,
  createEventThroughWizard,
} from './harness.mjs'

const j = makeJourney('c13-archive-delete', 'C13: archive, restore and delete an event')
const stamp = String(Date.now()).slice(-7)
const viewportLabel = process.env.JOURNEY_VIEWPORT ?? 'desktop-1440'
const VIEWPORTS = {
  'mobile-390': { width: 390, height: 844 },
  'tablet-768': { width: 768, height: 1024 },
  'desktop-1440': { width: 1440, height: 1000 },
}
const viewport = VIEWPORTS[viewportLabel] ?? VIEWPORTS['desktop-1440']

/* Minted per run, never a literal in the tree, never printed. */
const mint = () => randomBytes(12).toString('base64url') + '-Aa1'
const ORGANISER = { name: 'Priya Natarajan', email: `priya.lifecycle.${stamp}@example.com`, password: mint() }
const GUEST = { name: 'Oscar Whitlam', email: `oscar.lifecycle.${stamp}@example.com`, password: mint() }
const TITLE_A = `Harbour Sessions ${stamp}`
const TITLE_B = `Empty Room ${stamp}`

const browser = await chromium.launch()
const results = []
function verdict(name, ok, detail) {
  results.push({ name, ok, detail: String(detail ?? '') })
  note(j, `${ok ? 'PASS' : 'FAIL'}  ${name}`, detail)
  if (!ok) j.blockers.push(`${name}: ${detail ?? ''}`)
}
const run = { viewport: viewportLabel, base: BASE, organiserEmail: ORGANISER.email, guestEmail: GUEST.email, titleA: TITLE_A, titleB: TITLE_B }

const db = (() => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !service) throw new Error('the journey needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to read the database it drives')
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

async function text(p, sel) {
  return (await p.locator(sel).first().innerText({ timeout: 5000 }).catch(() => '')).replace(/\s+/g, ' ').trim()
}

async function bodyHas(p, needle) {
  const body = await p.evaluate(() => document.body.innerText)
  return body.includes(needle)
}

async function axeCheck(p, label) {
  const res = await new AxeBuilder({ page: p }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  const violations = res.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.map((n) => ({ target: n.target, html: n.html?.slice(0, 200) })) }))
  writeFileSync(join(j.OUT, `axe-${label}.json`), JSON.stringify({ url: res.url, viewport: viewportLabel, violations }, null, 2))
  verdict(`axe, ${label}: 0 violations at any impact`, violations.length === 0, violations.map((v) => `[${v.impact}] ${v.id}`).join(', ') || 'clean')
}

/** Open the public page, take one free ticket, land on the confirmation. */
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

/** Publish a free event through the wizard and return its id and slug. */
async function publishFreeEvent(p, title, summary) {
  const review = await createEventThroughWizard(j, p, {
    title,
    summary,
    description: 'A free community night in Geelong, published through the wizard so the lifecycle can be driven end to end: archive, restore and delete, exactly as an organiser reaches them.',
    price: null,
    capacity: '20',
    wantCover: true,
  })
  verdict(`"${title}" reached Review with Publish enabled`, Boolean(review.reachedReview) && !review.publishDisabled, (review.reviewText ?? '').slice(0, 120))
  if (!review.publishButton) throw new Error('no publish button')
  await review.publishButton.click()
  await p.waitForTimeout(12000)
  const eventId = p.url().match(/\/dashboard\/events\/([0-9a-f-]{36})/)?.[1] ?? null
  const slug = await p.evaluate(() => {
    const skip = new Set(['create', 'browse', 'map', 'search'])
    for (const a of document.querySelectorAll('a[href]')) {
      const m = a.getAttribute('href')?.match(/^(?:https?:\/\/[^/]+)?\/events\/([a-z0-9-]+)\/?$/)
      if (m && !skip.has(m[1])) return m[1]
    }
    return null
  })
  verdict(`"${title}" published`, Boolean(eventId && slug), `${p.url().replace(BASE, '')} slug=${slug}`)
  if (!eventId || !slug) throw new Error(`no event for ${title}`)
  return { eventId, slug }
}

const rowFor = (p, title) => p.locator('tbody tr').filter({ hasText: title }).first()

async function waitGone(p, title, timeout = 25000) {
  await p.waitForFunction((t) => !document.body.innerText.includes(t), title, { timeout })
}

async function statusOf(p, path) {
  const res = await p.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await p.waitForTimeout(1200)
  return res ? res.status() : 0
}

let org = null
let guest = null
let stranger = null
try {
  // ── 1. THE ORGANISER AND EVENT A, THE GUEST AND A TICKET ────────────────
  org = await fresh()
  if (!(await signUpAndConfirm(j, org.p, ORGANISER))) throw new Error('organiser signup failed')
  const a = await publishFreeEvent(org.p, TITLE_A, 'A free night on the water, and the event this drive archives and restores.')
  run.eventIdA = a.eventId
  run.slugA = a.slug
  await describe(j, org.p, 'Event A published')

  guest = await fresh()
  if (!(await signUpAndConfirm(j, guest.p, GUEST))) throw new Error('guest signup failed')
  const orderId = await takeFreeTicket(guest.p, a.slug, GUEST.name)
  const ticketLink = linkFromInbox(GUEST.email, /\/t\/[^/?]+\?k=/)
  verdict('the guest holds a free ticket to A and its link from the confirmation email', Boolean(orderId && ticketLink), ticketLink ? ticketLink.replace(BASE, '') : `order ${orderId ?? 'none'}, no link`)
  if (!ticketLink) throw new Error('no ticket link')
  // The confirmation email carries the canonical host (NEXT_PUBLIC_APP_URL), not
  // the local server's, so only the path and query are kept for navigation.
  const ticketUrl = new URL(ticketLink)
  run.ticketLink = `${ticketUrl.pathname}${ticketUrl.search}`

  // ── 2. ARCHIVE FROM THE LIST ─────────────────────────────────────────────
  await org.p.goto(`${BASE}/dashboard/events`, { waitUntil: 'networkidle', timeout: 60000 })
  await org.p.waitForTimeout(1500)
  await describe(j, org.p, 'Events list before archive')
  const rowA = rowFor(org.p, TITLE_A)
  verdict('the row for A offers Archive', (await rowA.getByRole('button', { name: /^Archive$/ }).count()) === 1)
  verdict('the row for A offers NO Delete (it has a ticket)', (await rowA.getByRole('button', { name: /^Delete$/ }).count()) === 0)
  await rowA.getByRole('button', { name: /^Archive$/ }).click()
  await org.p.waitForSelector('[role="dialog"]', { timeout: 10000 })
  const archiveDialog = await text(org.p, '[role="dialog"]')
  verdict('the archive dialog says what happens and that ticket holders keep their tickets', /comes off every public page/.test(archiveDialog) && /keeps it/.test(archiveDialog), archiveDialog.slice(0, 160))
  await describe(j, org.p, 'Archive dialog')
  await axeCheck(org.p, 'archive-dialog')
  await org.p.getByRole('button', { name: 'Archive event' }).click()
  await waitGone(org.p, TITLE_A)
  await describe(j, org.p, 'List after archive')
  verdict('A left the default list', !(await bodyHas(org.p, TITLE_A)))
  await org.p.goto(`${BASE}/dashboard/events?tab=archived`, { waitUntil: 'networkidle', timeout: 60000 })
  await org.p.waitForTimeout(1200)
  const archivedRow = rowFor(org.p, TITLE_A)
  verdict('A appears under Archived with Restore', (await archivedRow.count()) === 1 && (await archivedRow.getByRole('button', { name: /^Restore$/ }).count()) === 1)
  await describe(j, org.p, 'Archived tab')
  await axeCheck(org.p, 'archived-tab')

  // ── 3. THE STRANGER ──────────────────────────────────────────────────────
  stranger = await fresh()
  const archivedStatus = await statusOf(stranger.p, `/events/${a.slug}`)
  verdict('a stranger gets 404 at the archived event', archivedStatus === 404, `HTTP ${archivedStatus}`)
  await describe(j, stranger.p, 'Archived event as a stranger')
  // A listing is judged by the LINK to the event, never by its title in the body:
  // the search page echoes the query in its own heading, so the title is always
  // on the page whether or not a result is.
  const listsEvent = async (p, slug) => (await p.$(`a[href*="/events/${slug}"]`)) !== null
  await stranger.p.goto(`${BASE}/events?q=${encodeURIComponent(TITLE_A)}`, { waitUntil: 'networkidle', timeout: 60000 })
  verdict('on-site search does not list the archived event', !(await listsEvent(stranger.p, a.slug)))
  await describe(j, stranger.p, 'Search for the archived event')
  await stranger.p.goto(`${BASE}/events/browse/geelong`, { waitUntil: 'networkidle', timeout: 60000 })
  verdict('the city browse does not list the archived event', !(await listsEvent(stranger.p, a.slug)))
  await stranger.p.goto(`${BASE}/events`, { waitUntil: 'networkidle', timeout: 60000 })
  verdict('the events browse does not list the archived event', !(await listsEvent(stranger.p, a.slug)))
  const sitemap = await (await stranger.p.request.get(`${BASE}/sitemap.xml`)).text()
  verdict('the sitemap does not carry the archived event', !sitemap.includes(`/events/${a.slug}`), `${sitemap.length} bytes`)

  // ── 4. THE HOLDER ────────────────────────────────────────────────────────
  await guest.p.goto(`${BASE}/tickets`, { waitUntil: 'networkidle', timeout: 60000 })
  verdict('the holder still sees the archived event in their tickets, with the note', (await bodyHas(guest.p, TITLE_A)) && (await bodyHas(guest.p, 'archived this event')))
  await describe(j, guest.p, 'Holder tickets with archived event')
  await axeCheck(guest.p, 'holder-tickets')
  const bearerStatus = await statusOf(guest.p, run.ticketLink)
  verdict('the bearer ticket page still opens', bearerStatus === 200 && (await bodyHas(guest.p, TITLE_A)), `HTTP ${bearerStatus}`)
  await describe(j, guest.p, 'Bearer ticket on archived event')
  const holderPage = await statusOf(guest.p, `/events/${a.slug}`)
  verdict('the holder still reaches the event page, with the archived banner', holderPage === 200 && (await bodyHas(guest.p, 'archived this event')), `HTTP ${holderPage}`)
  await describe(j, guest.p, 'Archived event page as the holder')
  await axeCheck(guest.p, 'holder-archived-page')

  // ── 5. THE DOOR ──────────────────────────────────────────────────────────
  await org.p.goto(`${BASE}/scan/${a.eventId}`, { waitUntil: 'networkidle', timeout: 60000 })
  await org.p.waitForFunction(() => /Offline ready\./.test(document.querySelector('[data-testid="door-set"]')?.textContent ?? ''), null, { timeout: 90000 }).catch(() => {})
  await org.p.fill('input[aria-label="Ticket code or ticket link"]', ticketLink)
  await org.p.click('button:has-text("Check in")')
  await org.p.waitForSelector('[data-testid="scan-result"]', { timeout: 20000 }).catch(() => {})
  const scanCard = await text(org.p, '[data-testid="scan-result"]')
  verdict('the scanner ADMITS the ticket on the archived event', /^ADMIT/.test(scanCard), scanCard.slice(0, 120))
  await describe(j, org.p, 'Door admits archived event ticket')

  // ── 6. RESTORE ───────────────────────────────────────────────────────────
  await org.p.goto(`${BASE}/dashboard/events?tab=archived`, { waitUntil: 'networkidle', timeout: 60000 })
  await rowFor(org.p, TITLE_A).getByRole('button', { name: /^Restore$/ }).click()
  await waitGone(org.p, TITLE_A)
  await org.p.goto(`${BASE}/dashboard/events`, { waitUntil: 'networkidle', timeout: 60000 })
  const restoredRow = rowFor(org.p, TITLE_A)
  verdict('A is back in the default list as published', (await restoredRow.count()) === 1 && /published/i.test(await restoredRow.innerText()))
  await describe(j, org.p, 'List after restore')
  const restoredStatus = await statusOf(stranger.p, `/events/${a.slug}`)
  verdict('a stranger gets 200 at the restored event', restoredStatus === 200, `HTTP ${restoredStatus}`)

  // ── 7. EVENT B: DELETE ───────────────────────────────────────────────────
  const b = await publishFreeEvent(org.p, TITLE_B, 'A published event nobody has bought into, so it can be deleted for good.')
  run.eventIdB = b.eventId
  run.slugB = b.slug
  const { data: rowB } = await db.from('events').select('id, created_by, cover_image_url').eq('id', b.eventId).single()
  const prefixes = [`${rowB?.created_by}/${b.eventId}`, `generated-covers/${b.eventId}`]
  let objectsBefore = 0
  for (const prefix of prefixes) {
    const { data } = await db.storage.from('event-images').list(prefix, { limit: 100 })
    objectsBefore += data?.length ?? 0
  }
  await org.p.goto(`${BASE}/dashboard/events`, { waitUntil: 'networkidle', timeout: 60000 })
  const rowBLoc = rowFor(org.p, TITLE_B)
  verdict('the row for B offers Delete (zero sales)', (await rowBLoc.getByRole('button', { name: /^Delete$/ }).count()) === 1)
  await rowBLoc.getByRole('button', { name: /^Delete$/ }).click()
  await org.p.waitForSelector('[role="dialog"]', { timeout: 10000 })
  const deleteDialog = await text(org.p, '[role="dialog"]')
  // innerText applies the label's CSS text-transform, so the prompt reads in capitals.
  verdict('the delete dialog says permanent, no undo, and asks for the name', /permanent/.test(deleteDialog) && /no undo/.test(deleteDialog) && /type the event name/i.test(deleteDialog), deleteDialog.slice(0, 160))
  await describe(j, org.p, 'Delete dialog')
  await axeCheck(org.p, 'delete-dialog')
  const confirmBtn = org.p.getByRole('button', { name: 'Delete permanently' })
  verdict('the confirm control is disabled before the name is typed', await confirmBtn.isDisabled())
  await org.p.fill('[role="dialog"] input[type="text"]', 'Wrong Name')
  verdict('a wrong name keeps the confirm control disabled', await confirmBtn.isDisabled())
  await org.p.fill('[role="dialog"] input[type="text"]', TITLE_B)
  verdict('the right name enables it', !(await confirmBtn.isDisabled()))
  await describe(j, org.p, 'Delete dialog with the name typed')
  await confirmBtn.click()
  await waitGone(org.p, TITLE_B)
  await describe(j, org.p, 'List after delete')
  verdict('B left the list', !(await bodyHas(org.p, TITLE_B)))
  const goneStatus = await statusOf(stranger.p, `/events/${b.slug}`)
  verdict('a stranger gets 410 Gone at the deleted event', goneStatus === 410 && (await bodyHas(stranger.p, 'This event has been removed')), `HTTP ${goneStatus}`)
  await describe(j, stranger.p, 'Deleted event answers 410')
  await axeCheck(stranger.p, 'gone-page')
  const { data: tomb } = await db.from('event_tombstones').select('slug, event_id').eq('slug', b.slug).maybeSingle()
  verdict('the database holds a tombstone for B', tomb?.event_id === b.eventId, JSON.stringify(tomb))
  const { data: referencing } = await db.rpc('event_referencing_tables')
  const orphans = []
  for (const r of referencing ?? []) {
    const { count, error } = await db.from(r.table).select('*', { count: 'exact', head: true }).eq(r.column, b.eventId)
    if (error) orphans.push(`${r.table}.${r.column}: ${error.message}`)
    else if ((count ?? 0) > 0) orphans.push(`${r.table}.${r.column}: ${count}`)
  }
  verdict(`zero orphan rows for B across ${referencing?.length ?? 0} referencing columns`, Array.isArray(referencing) && referencing.length >= 30 && orphans.length === 0, orphans.join('; ') || 'all zero')
  let objectsAfter = 0
  for (const prefix of prefixes) {
    const { data } = await db.storage.from('event-images').list(prefix, { limit: 100 })
    objectsAfter += data?.length ?? 0
  }
  verdict("B's storage prefixes are empty after the delete", objectsAfter === 0, `objects before ${objectsBefore} (cover ${rowB?.cover_image_url ? 'set' : 'none'}), after ${objectsAfter}`)

  // ── 8. CANCELLED IS NOT A DEAD END ───────────────────────────────────────
  await org.p.goto(`${BASE}/dashboard/events`, { waitUntil: 'networkidle', timeout: 60000 })
  org.p.once('dialog', (d) => d.accept())
  await rowFor(org.p, TITLE_A).getByRole('button', { name: /^Cancel$/ }).click()
  await org.p.waitForFunction((t) => {
    const row = [...document.querySelectorAll('tbody tr')].find((tr) => tr.innerText.includes(t))
    return Boolean(row && /cancelled/i.test(row.innerText))
  }, TITLE_A, { timeout: 25000 })
  const cancelledRow = rowFor(org.p, TITLE_A)
  verdict('the cancelled event still offers Archive', (await cancelledRow.getByRole('button', { name: /^Archive$/ }).count()) === 1)
  verdict('the cancelled event offers no Delete (it has a ticket)', (await cancelledRow.getByRole('button', { name: /^Delete$/ }).count()) === 0)
  await describe(j, org.p, 'Cancelled event keeps Archive')
  await axeCheck(org.p, 'cancelled-row')
  await org.p.goto(`${BASE}/dashboard/events/${a.eventId}`, { waitUntil: 'networkidle', timeout: 60000 })
  const panel = await text(org.p, '[data-testid="lifecycle-panel"]')
  verdict('the event overview offers Archive and explains why Delete is not offered', /Archive/.test(panel) && /cannot be deleted/.test(panel) && !/Delete\b/.test(panel.replace(/cannot be deleted/g, '')), panel.slice(0, 200))
  await describe(j, org.p, 'Event overview lifecycle panel')
  await axeCheck(org.p, 'overview-panel')
} catch (err) {
  j.blockers.push(`ABORTED: ${err instanceof Error ? err.message : String(err)}`)
  for (const ctx of [org, guest, stranger]) {
    if (ctx?.p) await describe(j, ctx.p, 'State at abort').catch(() => {})
  }
} finally {
  const passed = results.filter((r) => r.ok).length
  run.results = results
  run.passed = passed
  run.total = results.length
  writeFileSync(join(j.OUT, 'results.json'), JSON.stringify(run, null, 2))
  console.log(`\n--- ${passed} of ${results.length} passed at ${viewportLabel}`)
  if (process.env.EVIDENCE_DIR) {
    const dest = join(process.env.EVIDENCE_DIR, viewportLabel)
    mkdirSync(dest, { recursive: true })
    for (const f of readdirSync(j.OUT)) copyFileSync(join(j.OUT, f), join(dest, f))
    console.log(`--- evidence copied to ${dest}`)
  }
  await finish(j, browser)
  if (j.blockers.length > 0 || passed !== results.length) process.exitCode = 1
}
