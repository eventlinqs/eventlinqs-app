/**
 * DRIVEN PROOF: THE SLOT LEDGER PRODUCES A REAL CURVE AND THE PANEL RENDERS IT.
 * Close-out D1, the acceptance line that reads:
 *
 *     "Driven proof: pull the complete curve for the [Afro-Fusion] slot
 *      including order EL-9HE57YNV and render it. Captured at 390, 768 and
 *      1440, no overflow."
 *
 * ----------------------------------------------------------------------------
 * WHAT THAT SENTENCE ASKS FOR THAT THIS MACHINE CANNOT GIVE, SAID FIRST.
 *
 * Order EL-9HE57YNV is a PRODUCTION row. It was read (read-only, through the
 * Management API) and it is real: the Afro-Fusion Music Showcase, confirmed,
 * AUD 18.00, 9 September 2026. It is not on TEST and inventing it here would be
 * a fabrication, which is worth less than nothing in a ledger proof.
 *
 * Production also has NO ledger tables: `to_regclass('public.ledger_entries')`
 * answers null there, because 20260910000002 is one of six migrations still
 * pending, and applying a migration to production is the founder's step
 * (CLAUDE.md, Verification and gates, Migrations; Law 10 calls this RESERVED).
 * So the literal instruction is blocked on a command that is not mine to run.
 *
 * THE TWO THINGS DONE INSTEAD, both real, neither a substitute dressed up as
 * the thing itself:
 *
 *   1. A COMPLETE CURVE, DRIVEN, ON REAL ORDERS. The densest real slot on TEST
 *      is enumerated from the database rather than typed, backfilled through
 *      the same adapter a live sale uses, and its panel is opened by a real
 *      signed-in organiser in a real browser at 390, 768 and 1440. Every number
 *      on screen is compared against the ledger the page read it from.
 *   2. THE PRODUCTION ROWS, PROVEN WITHOUT WRITING ONE. The backfill's
 *      `--dry-run` is pointed at production, where it refuses to write by
 *      construction, and reports the exact rows EL-9HE57YNV would produce. That
 *      is what the founder will see the moment the migration lands, established
 *      now rather than promised. It runs from the companion script
 *      `scripts/verify/d1-production-dry-run.mjs`.
 *
 * ----------------------------------------------------------------------------
 * AND THE LIVE PATH IS DRIVEN TOO, because a backfill proves the mapping and
 * says nothing about whether the running product writes anything. So this also
 * takes a REAL free ticket through the real public checkout and reads the sale
 * row back out of the ledger, and opens a real event page and reads the
 * page_view demand row back out of it.
 *
 * ----------------------------------------------------------------------------
 * ONE SETUP ACT IS TAKEN ON TEST AND IS NAMED RATHER THAN HIDDEN. The panel
 * lives behind `resolveEventAccess`, which needs the organisation's OWNER (or a
 * manager member) signed in. The owner of the densest slot is an account a
 * previous journey created, and nothing on this machine knows its password. So
 * the drive sets one, through the service role, on TEST only, on an account it
 * read out of TEST. It refuses to run at all against production, on the URL,
 * before it does anything.
 *
 * Usage (the shell must not carry the production Supabase URL):
 *   BASE=http://localhost:3311 node --env-file=.env.local \
 *     scripts/verify/d1-slot-ledger-proof.mjs --out C:/dev/EVIDENCE/D1
 *
 * JOURNEY_VIEWPORT=mobile-390|tablet-768|desktop-1440 selects the viewport and
 * namespaces the output, so three runs do not overwrite one another.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { chromium } from 'playwright'
import { AxeBuilder } from '@axe-core/playwright'
import { MEASURE_VIEWPORT_FIT, judgeSurface } from './lib/viewport-fit.mjs'

const TAG = '[d1-proof]'
const BASE = process.env.BASE ?? 'http://localhost:3311'

const args = process.argv.slice(2)
let out = 'C:/dev/EVIDENCE/D1'
for (let i = 0; i < args.length; i += 1) if (args[i] === '--out') out = args[++i]

/*
 * PLAYWRIGHT WANTS THE VIEWPORT NESTED, and the first run of this drive proved
 * what happens when it is not: `newContext({ ...{width, height} })` is not a
 * viewport at all, Playwright silently used its 1280x720 default, and the 390
 * run reported `doc.scrollWidth 1280/1280` and a panel whose right edge was at
 * 904 "against a 390 viewport". A measurement that names a width it never set
 * is worse than no measurement, so the width is read back off the page below
 * and a mismatch is a FAULT rather than a footnote.
 */
const VIEWPORTS = {
  'mobile-390': { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  'tablet-768': { viewport: { width: 768, height: 1024 }, isMobile: false, hasTouch: true, deviceScaleFactor: 1 },
  'desktop-1440': { viewport: { width: 1440, height: 1000 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1 },
}
const viewportName = process.env.JOURNEY_VIEWPORT ?? 'desktop-1440'
const context = VIEWPORTS[viewportName]
const viewport = context?.viewport
if (!context) {
  console.error(`${TAG} JOURNEY_VIEWPORT must be one of ${Object.keys(VIEWPORTS).join(', ')}`)
  process.exit(1)
}
out = join(out, viewportName)
mkdirSync(out, { recursive: true })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
if (/gndnldyfudbytbboxesk/.test(SUPABASE_URL)) {
  console.error(`${TAG} REFUSING: this is the PRODUCTION Supabase project and this drive WRITES.`)
  process.exit(1)
}
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error(`${TAG} NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.`)
  process.exit(1)
}
const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

const checks = []
function check(id, pass, detail) {
  checks.push({ id, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${id}  ${detail}`)
}

const money = (cents) =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(cents / 100)

/* -------------------------------------------------------------------------
 * 1. ENUMERATE THE SLOT. Never typed, never remembered: the densest real slot
 *    on this database, by confirmed paid orders, so the curve has real points
 *    on real days rather than one dot.
 * ---------------------------------------------------------------------- */
async function densestSlot() {
  const { data: orders, error } = await db
    .from('orders')
    .select('id, event_id, total_cents, status')
    .eq('status', 'confirmed')
    .gt('total_cents', 0)
    .limit(2000)
  if (error) throw new Error(`could not read orders: ${error.message}`)

  const byEvent = new Map()
  for (const o of orders ?? []) {
    const seen = byEvent.get(o.event_id) ?? { count: 0, cents: 0 }
    seen.count += 1
    seen.cents += o.total_cents ?? 0
    byEvent.set(o.event_id, seen)
  }
  const ranked = [...byEvent.entries()].sort((a, b) => b[1].count - a[1].count)
  for (const [eventId, tally] of ranked) {
    const { data: event } = await db
      .from('events')
      .select('id, title, slug, organisation_id, start_date, status')
      .eq('id', eventId)
      .maybeSingle()
    if (!event?.organisation_id) continue
    const { data: org } = await db
      .from('organisations')
      .select('id, name, owner_id')
      .eq('id', event.organisation_id)
      .maybeSingle()
    if (!org?.owner_id) continue
    const { data: owner } = await db.from('profiles').select('id, email').eq('id', org.owner_id).maybeSingle()
    if (!owner?.email) continue
    return { event, org, owner, tally }
  }
  throw new Error('no confirmed paid orders on this database belong to an organisation with a reachable owner')
}

/* -------------------------------------------------------------------------
 * 2. THE BACKFILL, FOR REAL, ON TEST. Spawned rather than reimplemented: the
 *    close-out's whole point is that ONE mapping exists, so a proof that wrote
 *    its own rows would be proving the wrong thing.
 * ---------------------------------------------------------------------- */
function runBackfill() {
  const r = spawnSync(
    process.execPath,
    ['--import', './scripts/lib/src-alias-loader.mjs', 'scripts/ops/backfill-slot-ledger.mjs', '--limit', '2000'],
    { encoding: 'utf8', env: process.env, cwd: process.cwd() },
  )
  const text = ((r.stdout ?? '') + (r.stderr ?? '')).trim()
  return { code: r.status, text }
}

/* -------------------------------------------------------------------------
 * 3. WHAT THE LEDGER HOLDS FOR THIS SLOT, read straight out of the two tables
 *    so the page's numbers can be compared against them rather than trusted.
 * ---------------------------------------------------------------------- */
async function ledgerFor(sourceRef) {
  const { data: slot } = await db
    .from('ledger_slots')
    .select('id, category, subcategory, capacity, slot_at, on_sale_at')
    .eq('source_system', 'eventlinqs')
    .eq('source_ref', sourceRef)
    .maybeSingle()
  if (!slot) return null
  const { data: entries } = await db
    .from('ledger_entries')
    .select('kind, occurred_at, days_out, quantity, amount_cents, unit_amount_cents, demand_action, inventory_class')
    .eq('slot_id', slot.id)
    .order('occurred_at', { ascending: true })
    .limit(5000)
  const rows = entries ?? []
  const sales = rows.filter((r) => r.kind === 'sale')
  const refunds = rows.filter((r) => r.kind === 'refund')
  const units = sales.reduce((n, r) => n + (r.quantity ?? 0), 0) + refunds.reduce((n, r) => n + (r.quantity ?? 0), 0)
  const amount =
    sales.reduce((n, r) => n + (r.amount_cents ?? 0), 0) + refunds.reduce((n, r) => n + (r.amount_cents ?? 0), 0)
  const days = new Set(sales.concat(refunds).map((r) => r.days_out))
  return {
    slot,
    rows,
    units,
    amountCents: amount,
    unitsReturned: Math.abs(refunds.reduce((n, r) => n + (r.quantity ?? 0), 0)),
    distinctDays: days.size,
    counts: rows.reduce((acc, r) => {
      acc[r.kind] = (acc[r.kind] ?? 0) + 1
      return acc
    }, {}),
  }
}

/* -------------------------------------------------------------------------
 * 4. THE BROWSER LEGS.
 * ---------------------------------------------------------------------- */
async function clickText(page, rx) {
  for (const el of await page.$$('button, a')) {
    const t = ((await el.innerText().catch(() => '')) || '').trim()
    if (rx.test(t) && (await el.isVisible().catch(() => false))) {
      await el.click().catch(() => {})
      return t
    }
  }
  return null
}

async function fillByLabel(page, rx, value) {
  for (const el of await page.$$('input')) {
    if (!(await el.isVisible().catch(() => false))) continue
    const n = await el.evaluate(
      (e) => e.labels?.[0]?.textContent?.trim() || e.getAttribute('aria-label') || e.getAttribute('placeholder') || '',
    )
    if (rx.test(n)) {
      await el.fill(value).catch(() => {})
      return true
    }
  }
  return false
}

/**
 * Measure the whole document against the viewport, the UX6 way, and shoot it.
 *
 * INVOKED, not merely evaluated: `page.evaluate` given a STRING treats it as an
 * expression, so handing it the arrow function's source returns the FUNCTION and
 * serialises it to undefined. The UX6 drive's own comment records dying on
 * exactly this, and so did the first run of this one.
 *
 * `judgeSurface` returns an ARRAY of fault sentences, empty when the surface is
 * clean. It is not a verdict object.
 */
async function measure(page, label) {
  await page.evaluate(() => document.fonts.ready.then(() => true)).catch(() => {})
  await page.waitForTimeout(500)
  const fit = await page.evaluate(`(${MEASURE_VIEWPORT_FIT})()`)
  /*
   * THE WIDTH THE BROWSER ACTUALLY USED, checked against the width this run
   * claims to be measuring. Without this the drive reported "0 clipped" at 390
   * while the page was laid out at 1280, which is a green run that proves the
   * opposite of what it says.
   */
  if (fit.innerWidth !== viewport.width) {
    check(
      `viewport-was-actually-set@${viewport.width}`,
      false,
      `${label}: the browser reports innerWidth ${fit.innerWidth}, not ${viewport.width}. Nothing measured here is about ${viewport.width}.`,
    )
  }
  const faults = judgeSurface({ label, width: viewport.width, fit, totals: [], totalRequired: false })
  const shot = join(out, `${label}.png`)
  await page.screenshot({ path: shot, fullPage: true })
  return {
    ok: faults.length === 0,
    detail:
      faults.length === 0
        ? `doc.scrollWidth ${fit.docScrollWidth}/${fit.innerWidth}, 0 clipped, ${fit.exempt?.length ?? 0} exempt`
        : faults.join(' // '),
    shot,
    fit,
  }
}

/* -------------------------------------------------------------------------
 * THE RUN
 * ---------------------------------------------------------------------- */
const report = []
const say = (line) => {
  report.push(line)
  console.log(line)
}

say(`${TAG} viewport ${viewportName} (${viewport.width}x${viewport.height}) against ${BASE}`)
say(`${TAG} database ${SUPABASE_URL.replace(/https:\/\/([a-z]+)\..*/, '$1')} (TEST; production is refused above)`)

const picked = await densestSlot()
say(
  `${TAG} slot enumerated from the database: "${picked.event.title}" (${picked.event.id}), ` +
    `${picked.tally.count} confirmed paid order(s), ${money(picked.tally.cents)} taken, ` +
    `organisation "${picked.org.name}", owner ${picked.owner.email}`,
)

const backfill = runBackfill()
say(`${TAG} backfill exit ${backfill.code}`)
for (const line of backfill.text.split(/\r?\n/).slice(-14)) say(`    ${line}`)
check('backfill-ran', backfill.code === 0, `the backfill exited ${backfill.code}`)

const ledger = await ledgerFor(picked.event.id)
check('ledger-has-the-slot', Boolean(ledger), ledger ? `slot ${ledger.slot.id}` : 'the ledger has no row for this slot')
if (!ledger) {
  writeFileSync(join(out, 'report.txt'), report.join('\n'), 'utf8')
  console.error(`${TAG} FAIL: nothing to render`)
  process.exit(1)
}
say(
  `${TAG} ledger: ${ledger.rows.length} row(s) ${JSON.stringify(ledger.counts)}, ` +
    `${ledger.units} unit(s) net, ${money(ledger.amountCents)} net, over ${ledger.distinctDays} distinct day(s) out`,
)
check(
  'the-curve-has-more-than-one-point',
  ledger.distinctDays > 1,
  `${ledger.distinctDays} distinct days-out value(s) carry a sale or a refund`,
)

/*
 * A PASSWORD ON A TEST ACCOUNT, so the real dashboard can be opened by the real
 * owner through the real form. Named in the header; refused against production
 * by the URL check at the top of this file.
 */
const PASSWORD = 'D1Ledger!2026Proof'
const { error: pwError } = await db.auth.admin.updateUserById(picked.org.owner_id, { password: PASSWORD })
check('owner-can-be-signed-in', !pwError, pwError ? pwError.message : `password set on ${picked.owner.email} (TEST)`)

const browser = await chromium.launch()
const ctx = await browser.newContext({ ...context, locale: 'en-AU' })
const page = await ctx.newPage()
const shots = []
/** The console leg creates one, and the outer finally removes it whatever happens. */
let adminUserId = null

try {
  /* ---- LIVE LEG A: the public event page writes a page_view demand row ---- */
  const { data: livePublic } = await db
    .from('events')
    .select('id, slug, title')
    .eq('status', 'published')
    .eq('visibility', 'public')
    .not('slug', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
  const beaconEvent = (livePublic ?? [])[0]
  if (beaconEvent) {
    const before = await db
      .from('ledger_entries')
      .select('id', { count: 'exact', head: true })
      .eq('kind', 'demand')
    const beforeCount = before.count ?? 0
    const res = await page.goto(`${BASE}/events/${beaconEvent.slug}`, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    })
    await page.waitForTimeout(5000)
    const after = await db.from('ledger_entries').select('id', { count: 'exact', head: true }).eq('kind', 'demand')
    const { data: mine } = await db
      .from('ledger_slots')
      .select('id')
      .eq('source_ref', beaconEvent.id)
      .maybeSingle()
    const rowsForIt = mine
      ? await db
          .from('ledger_entries')
          .select('id', { count: 'exact', head: true })
          .eq('slot_id', mine.id)
          .eq('demand_action', 'page_view')
      : { count: 0 }
    check(
      'live-page-view-demand-row',
      res?.status() === 200 && (rowsForIt.count ?? 0) > 0,
      `/events/${beaconEvent.slug} answered ${res?.status()}; page_view rows for that slot: ${rowsForIt.count ?? 0} ` +
        `(demand rows platform-wide ${beforeCount} -> ${after.count ?? 0})`,
    )
    const m = await measure(page, '1-event-page')
    shots.push(m.shot)
    check(`fit-1-event-page@${viewport.width}`, m.ok, m.detail)
  } else {
    check('live-page-view-demand-row', false, 'no published public event exists to open')
  }

  /* ---- LIVE LEG B: a real free ticket writes a real sale row ---- */
  const { data: freeTiers } = await db
    .from('ticket_tiers')
    .select('id, name, price, event_id, total_capacity, sold_count, reserved_count, max_per_order, is_active, is_visible')
    .eq('price', 0)
    .eq('is_active', true)
    .eq('is_visible', true)
    .limit(200)
  let freeEvent = null
  for (const t of freeTiers ?? []) {
    const { data: e } = await db
      .from('events')
      .select('id, slug, title, status, visibility, seat_map_id, start_date')
      .eq('id', t.event_id)
      .maybeSingle()
    if (!e || e.status !== 'published' || e.visibility !== 'public' || !e.slug) continue
    // `seating_type` does not exist on this table; `seat_map_id` is how a
    // reserved-seating event is told apart, which is what the UX6 drive uses.
    if (e.seat_map_id) continue
    if (new Date(e.start_date).getTime() < Date.now()) continue
    if ((t.total_capacity ?? 0) <= 0) continue
    if ((t.total_capacity ?? 0) - (t.sold_count ?? 0) - (t.reserved_count ?? 0) < 2) continue
    freeEvent = { event: e, tier: t }
    break
  }
  if (freeEvent) {
    const slotBefore = await db.from('ledger_slots').select('id').eq('source_ref', freeEvent.event.id).maybeSingle()
    const salesBefore = slotBefore.data
      ? (
          await db
            .from('ledger_entries')
            .select('id', { count: 'exact', head: true })
            .eq('slot_id', slotBefore.data.id)
            .eq('kind', 'sale')
        ).count ?? 0
      : 0

    // Lane-tagged, per the three lane protocol: every row a lane creates on the
    // shared TEST project names the lane that made it.
    const buyer = `d1.lane-a.${viewportName}.${String(Date.now()).slice(-8)}@example.com`
    await page.goto(`${BASE}/events/${freeEvent.event.slug}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await page.waitForTimeout(2500)
    await clickText(page, /^(get tickets|buy tickets|select tickets|register)/i)
    await page.waitForTimeout(2000)
    await clickText(page, /^\+$/)
    await page.waitForTimeout(1500)
    const on = await clickText(page, /^checkout\b/i)
    if (!on) await clickText(page, /^(continue|proceed|register)/i)
    await page.waitForURL(/\/checkout\//, { timeout: 45_000 }).catch(() => {})
    await page.waitForTimeout(4000)
    await fillByLabel(page, /full name/i, 'Robin Ashe')
    await fillByLabel(page, /^email/i, buyer)
    await page.waitForTimeout(800)
    await clickText(page, /use my details for all tickets/i)
    await page.waitForTimeout(1200)
    await clickText(page, /^register for free/i)
    await page.waitForTimeout(12000)
    const landed = page.url().replace(BASE, '')

    const slotAfter = await db.from('ledger_slots').select('id').eq('source_ref', freeEvent.event.id).maybeSingle()
    const salesAfter = slotAfter.data
      ? (
          await db
            .from('ledger_entries')
            .select('id', { count: 'exact', head: true })
            .eq('slot_id', slotAfter.data.id)
            .eq('kind', 'sale')
        ).count ?? 0
      : 0
    check(
      'live-sale-row-from-a-real-purchase',
      /\/orders\//.test(landed) && salesAfter > salesBefore,
      `a real free order landed on ${landed.slice(0, 60)}; sale rows for that slot ${salesBefore} -> ${salesAfter}`,
    )
  } else {
    check('live-sale-row-from-a-real-purchase', false, 'no sellable free general-admission event exists on this database')
  }

  /* ---- THE PANEL, as the organiser, at this viewport ---- */
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.waitForTimeout(1500)
  await page.fill('input[type="email"]', picked.owner.email).catch(() => {})
  await page.fill('input[type="password"]', PASSWORD).catch(() => {})
  await page.click('button[type="submit"]').catch(() => {})
  await page.waitForTimeout(8000)
  const afterLogin = new URL(page.url()).pathname
  check('organiser-signed-in', !afterLogin.startsWith('/login'), `landed on ${afterLogin}`)

  const dash = await page.goto(`${BASE}/dashboard/events/${picked.event.id}`, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  })
  await page.waitForTimeout(4000)
  check('panel-page-answers-200', dash?.status() === 200, `/dashboard/events/${picked.event.id} -> ${dash?.status()}`)

  const panel = await page.evaluate(() => {
    const heads = [...document.querySelectorAll('h2')]
    const h = heads.find((x) => /how your tickets sold/i.test(x.textContent ?? ''))
    if (!h) return null
    const box = h.closest('div')
    const root = box?.parentElement?.closest('div') ?? box
    const svgs = root ? [...root.querySelectorAll('svg')] : []
    const table = root ? root.querySelector('table') : null
    return {
      text: (root?.innerText ?? '').replace(/\s+/g, ' ').trim(),
      plots: svgs.length,
      polylinePoints: svgs.reduce(
        (n, s) => n + [...s.querySelectorAll('path')].reduce((k, p) => k + (p.getAttribute('d')?.split('L').length ?? 0), 0),
        0,
      ),
      tableRows: table ? table.querySelectorAll('tbody tr').length : 0,
      rect: root ? (({ x, y, width, height }) => ({ x, y, width, height }))(root.getBoundingClientRect()) : null,
    }
  })
  check('panel-is-on-the-page', Boolean(panel), panel ? `${panel.plots} plot(s), ${panel.tableRows} table row(s)` : 'no "How your tickets sold" heading')

  if (panel) {
    check(
      'panel-draws-the-curve',
      panel.plots >= 1 && panel.tableRows >= 2,
      `${panel.plots} plot(s) drawn, ${panel.tableRows} row(s) in the readable table beneath`,
    )
    /*
     * THE NUMBERS ON SCREEN ARE THE LEDGER'S NUMBERS. Compared, not trusted:
     * a panel that renders beautifully off the wrong table is the exact failure
     * this whole item exists to make impossible.
     */
    const unitsShown = panel.text.match(/(\d+)\s+sold/i)?.[1]
    const takenShown = panel.text.match(/(A?\$[\d,]+)\s+taken/i)?.[1]
    check(
      'panel-units-equal-the-ledger',
      Number(unitsShown) === ledger.units,
      `panel says "${unitsShown} sold"; the ledger sums to ${ledger.units}`,
    )
    const expectedMoney = money(ledger.amountCents)
    check(
      'panel-money-equals-the-ledger',
      Boolean(takenShown) && expectedMoney.replace(/^A?\$/, '') === (takenShown ?? '').replace(/^A?\$/, ''),
      `panel says "${takenShown} taken"; the ledger sums to ${expectedMoney}`,
    )
    check(
      'panel-fits-the-viewport-box',
      panel.rect !== null && panel.rect.x + panel.rect.width <= viewport.width + 1,
      panel.rect
        ? `panel right edge ${Math.round(panel.rect.x + panel.rect.width)} against a ${viewport.width} viewport`
        : 'no box',
    )
  }

  const m = await measure(page, '2-organiser-dashboard-pace-panel')
  shots.push(m.shot)
  check(`fit-2-dashboard@${viewport.width}`, m.ok, m.detail)

  /* ---- THE SAME CURVE, AS THE PLATFORM OWNER, IN THE CONSOLE ----
   *
   * WHY THIS LEG EXISTS (close-out D1, 13 September 2026). D1's last open leg
   * was the render of the Afro-Fusion slot's curve, and on production that slot
   * belongs to MKLStudios, an outside organiser whose one member is not the
   * founder. There was no surface anywhere on the platform where the person who
   * owns it could read that curve, which is what left the item open; the ledger
   * row for it says so in as many words, "no admin surface renders the panel".
   *
   * So /admin/events/[id] now draws it, and this proves the owner's console and
   * the organiser's dashboard read the SAME numbers out of the SAME ledger in
   * the same run at the same width, rather than two surfaces that happen to look
   * right separately.
   */
  const adminEmail = `d1-lane-a-admin-${Date.now().toString(36)}@eventlinqs.test`
  const adminPassword = `${randomUUID()}Aa1`
  const created = await db.auth.admin.createUser({
    email: adminEmail,
    password: adminPassword,
    email_confirm: true,
  })
  check('console-admin-created', !created.error, created.error ? created.error.message : `lane-A admin on TEST`)
  if (!created.error) {
    adminUserId = created.data.user.id
    await db.from('profiles').upsert({
      id: adminUserId,
      email: adminEmail,
      full_name: 'D1 lane-A console proof',
      display_name: 'D1 lane-A console proof',
      is_verified: true,
    })
    const { error: auErr } = await db
      .from('admin_users')
      .insert({ id: adminUserId, role: 'super_admin', display_name: 'D1 lane-A console proof' })
    check('console-admin-has-the-role', !auErr, auErr ? auErr.message : 'super_admin on TEST')

    /*
     * A FRESH CONTEXT, because the organiser is still signed in on the one above
     * and a proof that reads the owner's screen through the organiser's cookies
     * is not reading the owner's screen.
     */
    const adminCtx = await browser.newContext({ ...context, locale: 'en-AU' })
    const adminPage = await adminCtx.newPage()
    try {
      await adminPage.goto(`${BASE}/admin/login`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
      await adminPage.locator('input[name="email"]').fill(adminEmail)
      await adminPage.locator('input[name="password"]').fill(adminPassword)
      const submit = adminPage.locator('button[type="submit"]')
      await submit.waitFor({ state: 'visible', timeout: 30_000 })
      // The submit is disabled until hydration, deliberately, so no native GET
      // can ever carry the password. Wait for it rather than racing it.
      await adminPage
        .waitForFunction(() => !document.querySelector('button[type="submit"]')?.disabled, undefined, { timeout: 30_000 })
        .catch(() => {})
      await submit.click()
      await adminPage.waitForTimeout(8000)
      const adminLanded = new URL(adminPage.url()).pathname
      check('console-admin-signed-in', !adminLanded.endsWith('/admin/login'), `landed on ${adminLanded}`)

      const consoleRes = await adminPage.goto(`${BASE}/admin/events/${picked.event.id}`, {
        waitUntil: 'domcontentloaded',
        timeout: 60_000,
      })
      await adminPage.waitForTimeout(4000)
      check(
        'console-event-page-answers-200',
        consoleRes?.status() === 200,
        `/admin/events/${picked.event.id} -> ${consoleRes?.status()}`,
      )

      /*
       * THE PANEL, ITS NUMBERS, AND THE CONTRAST OF EVERY WORD IN IT.
       *
       * The contrast half is not ceremony. S1 found TWELVE elements on this exact
       * shell painted white on white while axe reported zero violations at every
       * impact level in the same run, because the cause was a Tailwind token
       * globals.css does not define and the element inherited the shell's own
       * text-white. axe runs below as well, for the classes it IS good at; this
       * measures the RATIO, which is the one that would have caught that.
       */
      const consolePanel = await adminPage.evaluate(() => {
        const canvas = document.createElement('canvas')
        canvas.width = 1
        canvas.height = 1
        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        const SENTINEL = '#ff00ff'
        const unreadable = []
        /*
         * ANY CSS COLOUR TO sRGB WITH ALPHA, THROUGH THE BROWSER'S OWN PARSER AND
         * ITS OWN PIXELS.
         *
         * Hand-written parsing of getComputedStyle's output is what made the first
         * version of this check a FALSE GREEN, on this very page, on 13 September
         * 2026. Tailwind v4 compiles `text-white/60` to
         * `oklab(1 0 5.96046e-8 / 0.6)` (probed on the served build, not guessed),
         * a reader looking for three comma-separated numbers read that as nothing,
         * and every alpha-coloured element was SKIPPED while the check reported
         * "45 text element(s) measured, lowest 17.37:1" - the ratio of solid white,
         * which was the only kind it could read.
         *
         * So the browser parses it, a pixel carries the answer, and anything that
         * cannot be read is COLLECTED AND FAILED rather than passed over. A check
         * that quietly measures less than it says is worse than no check.
         */
        const toRgba = (value) => {
          const text = String(value ?? '').trim()
          if (!text) return null
          ctx.fillStyle = SENTINEL
          ctx.fillStyle = text
          if (ctx.fillStyle === SENTINEL && text.toLowerCase() !== SENTINEL) return null
          ctx.clearRect(0, 0, 1, 1)
          ctx.fillRect(0, 0, 1, 1)
          const pixel = ctx.getImageData(0, 0, 1, 1).data
          return { r: pixel[0], g: pixel[1], b: pixel[2], a: pixel[3] / 255 }
        }
        const channel = (c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))
        const lum = (c) => 0.2126 * channel(c.r / 255) + 0.7152 * channel(c.g / 255) + 0.0722 * channel(c.b / 255)
        const over = (fg, bg) => ({
          r: fg.a * fg.r + (1 - fg.a) * bg.r,
          g: fg.a * fg.g + (1 - fg.a) * bg.g,
          b: fg.a * fg.b + (1 - fg.a) * bg.b,
          a: 1,
        })
        const ratio = (a, b) => {
          const la = lum(a)
          const lb = lum(b)
          return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
        }
        const backdrop = (start) => {
          let node = start
          let acc = null
          while (node) {
            const raw = getComputedStyle(node).backgroundColor
            const bg = toRgba(raw)
            if (bg === null) unreadable.push({ where: 'a background', colour: raw })
            if (bg && bg.a > 0) acc = acc ? over(acc, bg) : bg
            if (acc && acc.a >= 1) return acc
            node = node.parentElement
          }
          return acc ?? { r: 255, g: 255, b: 255, a: 1 }
        }

        const head = [...document.querySelectorAll('h2')].find((x) => /how this event sold/i.test(x.textContent || ''))
        if (!head) return null
        const card = head.closest('div')
        if (!card) return null

        const texts = []
        const walk = document.createTreeWalker(card, NodeFilter.SHOW_ELEMENT)
        for (let el = card; el; el = walk.nextNode()) {
          const own = [...el.childNodes].some((n) => n.nodeType === 3 && (n.textContent || '').trim().length > 0)
          if (!own) continue
          const style = getComputedStyle(el)
          if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') continue
          const fg = toRgba(style.color)
          if (fg === null) {
            unreadable.push({ where: (el.textContent || '').trim().slice(0, 40), colour: style.color })
            continue
          }
          const bg = backdrop(el.parentElement ?? el)
          const size = parseFloat(style.fontSize)
          const bold = parseInt(style.fontWeight, 10) >= 700
          // WCAG large text: 24px, or 18.66px when bold. The floor there is 3:1.
          const floor = size >= 24 || (bold && size >= 18.66) ? 3 : 4.5
          texts.push({
            text: (el.textContent || '').trim().slice(0, 40),
            colour: style.color,
            ratio: Math.round(ratio(over(fg, bg), bg) * 100) / 100,
            floor,
          })
        }

        const strokes = [...card.querySelectorAll('path')].map((drawn) => {
          const style = getComputedStyle(drawn)
          const fg = toRgba(style.stroke)
          if (fg === null) unreadable.push({ where: 'a series stroke', colour: style.stroke })
          const bg = backdrop(drawn.parentElement)
          return {
            colour: style.stroke,
            ratio: fg ? Math.round(ratio(over(fg, bg), bg) * 100) / 100 : 0,
          }
        })

        const table = card.querySelector('table')
        const rect = card.getBoundingClientRect()
        return {
          text: (card.innerText || '').split(/\s+/).join(' ').trim(),
          plots: card.querySelectorAll('svg').length,
          tableRows: table ? table.querySelectorAll('tbody tr').length : 0,
          tableScroll: table ? { scrollWidth: table.scrollWidth, clientWidth: table.parentElement.clientWidth } : null,
          rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
          cardBackground: getComputedStyle(card).backgroundColor,
          texts,
          strokes,
          unreadable,
        }
      })

      check(
        'console-panel-is-on-the-page',
        Boolean(consolePanel),
        consolePanel
          ? `${consolePanel.plots} plot(s), ${consolePanel.tableRows} table row(s), card ${consolePanel.cardBackground}`
          : 'no "How this event sold" heading in the console',
      )

      if (consolePanel) {
        check(
          'console-panel-says-this-event-not-your-tickets',
          !/how your tickets sold/i.test(consolePanel.text),
          'the owner is not the organiser and the heading does not pretend otherwise',
        )
        check(
          'console-panel-draws-the-curve',
          consolePanel.plots >= 1 && consolePanel.tableRows >= 2,
          `${consolePanel.plots} plot(s), ${consolePanel.tableRows} row(s) in the readable table beneath`,
        )
        const consoleUnits = consolePanel.text.match(/(\d+) sold/i)?.[1]
        const consoleTaken = consolePanel.text.match(/(A?\$[\d,]+) taken/i)?.[1]
        check(
          'console-units-equal-the-ledger',
          Number(consoleUnits) === ledger.units,
          `the console says "${consoleUnits} sold"; the ledger sums to ${ledger.units}`,
        )
        check(
          'console-money-equals-the-ledger',
          Boolean(consoleTaken) &&
            money(ledger.amountCents).replace(/^A?\$/, '') === (consoleTaken ?? '').replace(/^A?\$/, ''),
          `the console says "${consoleTaken} taken"; the ledger sums to ${money(ledger.amountCents)}`,
        )
        check(
          'console-panel-fits-the-viewport-box',
          consolePanel.rect.x + consolePanel.rect.width <= viewport.width + 1,
          `panel right edge ${Math.round(consolePanel.rect.x + consolePanel.rect.width)} against a ${viewport.width} viewport`,
        )
        check(
          'console-table-is-not-clipped-inside-its-box',
          consolePanel.tableScroll === null ||
            consolePanel.tableScroll.scrollWidth <= consolePanel.tableScroll.clientWidth + 1,
          consolePanel.tableScroll
            ? `table ${consolePanel.tableScroll.scrollWidth} inside a box of ${consolePanel.tableScroll.clientWidth}`
            : 'no table rendered',
        )
        const dim = consolePanel.texts.filter((item) => item.ratio < item.floor)
        /*
         * A COLOUR THE MEASUREMENT COULD NOT READ IS A FAULT, NOT A SKIP. The
         * first version of this leg reported "45 measured, lowest 17.37:1" while
         * every alpha-coloured element in the panel had been silently passed over,
         * because Tailwind v4 compiles those to oklab() and the reader wanted
         * rgb(). Whatever the next colour syntax is, this goes red rather than
         * quiet.
         */
        check(
          'console-panel-every-colour-was-actually-read',
          consolePanel.unreadable.length === 0,
          consolePanel.unreadable.length === 0
            ? `every colour in the panel parsed, ${consolePanel.texts.length} text element(s) and ${consolePanel.strokes.length} stroke(s)`
            : `${consolePanel.unreadable.length} colour(s) unreadable: ${consolePanel.unreadable
                .map((item) => `${item.where} in ${item.colour}`)
                .join(' | ')}`,
        )
        check(
          'console-panel-every-word-meets-AA',
          dim.length === 0 && consolePanel.unreadable.length === 0,
          dim.length === 0
            ? `${consolePanel.texts.length} text element(s) measured, lowest ${Math.min(
                ...consolePanel.texts.map((item) => item.ratio),
              )}:1 against the card`
            : `${dim.length} under AA: ${dim
                .map((item) => `"${item.text}" ${item.colour} ${item.ratio}:1 < ${item.floor}`)
                .join(' | ')}`,
        )
        const faint = consolePanel.strokes.filter((stroke) => stroke.ratio < 3)
        check(
          'console-panel-series-strokes-meet-3-to-1',
          faint.length === 0,
          faint.length === 0
            ? `${consolePanel.strokes.length} stroke(s), lowest ${Math.min(
                ...consolePanel.strokes.map((stroke) => stroke.ratio),
              )}:1`
            : `${faint.length} under 3:1: ${faint.map((stroke) => `${stroke.colour} ${stroke.ratio}:1`).join(' | ')}`,
        )
      }

      const consoleFit = await measure(adminPage, '3-admin-console-pace-panel')
      shots.push(consoleFit.shot)
      check(`fit-3-admin-console@${viewport.width}`, consoleFit.ok, consoleFit.detail)

      const axe = await new AxeBuilder({ page: adminPage }).analyze()
      check(
        'console-event-page-axe-zero',
        axe.violations.length === 0,
        axe.violations.length === 0
          ? 'zero violations at EVERY impact level'
          : axe.violations.map((v) => `${v.id} (${v.impact}) x${v.nodes.length}`).join(' | '),
      )
    } finally {
      await adminCtx.close()
    }
  }
} finally {
  await browser.close()
  // The lane-A console account never outlives the run that made it.
  if (adminUserId) {
    const removed = await db.auth.admin.deleteUser(adminUserId)
    if (removed.error) console.warn(`${TAG} could not remove the lane-A admin: ${removed.error.message}`)
  }
}

const failed = checks.filter((c) => !c.pass)
say('')
say(`${TAG} ${checks.length - failed.length}/${checks.length} check(s) passed at ${viewportName}`)
for (const c of checks) say(`    ${c.pass ? 'PASS' : 'FAIL'}  ${c.id}  ${c.detail}`)
say('')
say(`${TAG} screenshots: ${shots.join(', ')}`)
writeFileSync(join(out, 'report.txt'), report.join('\n'), 'utf8')
writeFileSync(
  join(out, 'checks.json'),
  JSON.stringify({ viewport: viewportName, width: viewport.width, slot: picked.event, ledger: { counts: ledger.counts, units: ledger.units, amountCents: ledger.amountCents, distinctDays: ledger.distinctDays }, checks }, null, 2),
  'utf8',
)

if (failed.length) {
  console.error(`${TAG} FAIL: ${failed.length} check(s) failed at ${viewportName}`)
  process.exit(1)
}
console.log(`${TAG} PASS at ${viewportName}`)
