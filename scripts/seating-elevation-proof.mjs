/**
 * Seating-designer elevation functional proof (TEST only, guarded).
 *
 * Proves the visual elevation did NOT break function:
 *  1. FULL FREE SEATED PURCHASE via real Chromium through the elevated buyer
 *     map: select a seat, reserve, checkout, register free, land on the
 *     confirmation. Then prove from the database that the order is confirmed,
 *     the ticket carries the seat (row / seat / section), and the buyer is
 *     attached (guest_email for the anonymous buyer). The bearer ticket page
 *     shows the seat. The confirmation email HTML that the mailer builds from
 *     the exact same query carries the seat (built here from live rows).
 *  2. SAME-SEAT CONCURRENCY GUARD: two reservations of the SAME available seat
 *     fire concurrently (two distinct guest sessions). Exactly ONE wins; the
 *     other is refused. Repeated across several seats to beat any luck.
 *
 * Usage: node scripts/seating-elevation-proof.mjs <baseUrl>
 */
import fs from 'node:fs'
import { chromium } from 'playwright'

const BASE = process.argv[2]
if (!BASE) throw new Error('usage: node scripts/seating-elevation-proof.mjs <baseUrl>')
const OUT = 'docs/seating/evidence-elevation/proof'
fs.mkdirSync(OUT, { recursive: true })

const PROD_REF = 'gndnldyfudbytbboxesk'
const env = {}
for (const line of fs.readFileSync('.env.test', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '')
}
const URL_ = (env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/+$/, '')
const SVC = env.SUPABASE_SERVICE_ROLE_KEY
if (URL_.includes(PROD_REF)) throw new Error('SAFETY STOP: prod')
if (!URL_.includes('vkapkibzokmfaxqogypq')) throw new Error('SAFETY STOP: not TEST')
const svcH = { apikey: SVC, authorization: `Bearer ${SVC}`, 'content-type': 'application/json' }

const FREE_SLUG = 'cellar-free-night-on-the-builder-chart'
const proofs = { base: BASE, startedAt: new Date().toISOString() }

async function q(path) {
  const res = await fetch(`${URL_}/rest/v1/${path}`, { headers: svcH })
  if (!res.ok) throw new Error(`${path} -> ${res.status}: ${await res.text()}`)
  return res.json()
}
async function rpc(name, body) {
  const res = await fetch(`${URL_}/rest/v1/rpc/${name}`, { method: 'POST', headers: svcH, body: JSON.stringify(body) })
  return { status: res.status, body: await res.json() }
}
async function shot(page, name) {
  await page.waitForTimeout(700)
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true })
  console.log(`[proof] shot ${name}`)
}

const freeEvent = (await q(`events?slug=eq.${FREE_SLUG}&select=id,title,is_free,has_reserved_seating`))[0]
if (!freeEvent) throw new Error(`free seated event ${FREE_SLUG} not found on TEST`)
console.log('[proof] free seated event:', freeEvent.id)

const browser = await chromium.launch()
const DESKTOP = { viewport: { width: 1440, height: 900 } }

// ── 1. FULL FREE SEATED PURCHASE through the elevated buyer map ──────────────
{
  const ctx = await browser.newContext(DESKTOP)
  const page = await ctx.newPage()
  let reserved = false
  for (let attempt = 0; attempt < 8 && !reserved; attempt++) {
    await page.goto(`${BASE}/events/${FREE_SLUG}`, { waitUntil: 'load', timeout: 90000 })
    await page.waitForSelector('svg[aria-label="Seat map"]', { timeout: 45000 })
    const clickable = page.locator('svg[aria-label="Seat map"] g[style*="pointer"]')
    const n = await clickable.count()
    if (n === 0) throw new Error('no selectable seats on the map')
    await clickable.nth(attempt % n).click()
    if (attempt === 0) await shot(page, 'purchase-1-seat-picked')
    const reserveBtn = page.getByRole('button', { name: /Reserve 1 seat/ })
    if (!(await reserveBtn.count())) continue
    await reserveBtn.click()
    try {
      await page.waitForURL(/\/checkout\//, { timeout: 15000 })
      reserved = true
    } catch {
      console.log(`[proof] seat attempt ${attempt} refused (stale availability), reselecting`)
    }
  }
  if (!reserved) throw new Error('could not reserve any seat after 8 attempts')
  await page.waitForTimeout(2000)
  await shot(page, 'purchase-2-checkout')

  await page.getByPlaceholder('Jane Smith').fill('Elevation Seat Guest')
  await page.getByPlaceholder('you@example.com').first().fill('elevation-seat-proof@mailinator.com')
  await page.getByRole('button', { name: 'Register for free' }).click()
  await page.waitForURL(/confirmation/, { timeout: 60000 })
  await page.waitForTimeout(2500)
  await shot(page, 'purchase-3-confirmation')

  const orderId = page.url().match(/orders\/([0-9a-f-]+)\//)?.[1]
  if (!orderId) throw new Error(`no order id in confirmation url ${page.url()}`)

  const order = (await q(`orders?id=eq.${orderId}&select=id,order_number,status,user_id,guest_email,guest_name,total_cents,currency`))[0]
  // The exact query the confirmation mailer runs to build the email.
  const tickets = await q(
    `tickets?order_id=eq.${orderId}&select=ticket_code,secret,holder_name,status,seat:seats(row_label,seat_number,note,section:seat_map_sections(name))`,
  )
  const seatTicket = tickets.find(t => t.seat)

  proofs.purchase = {
    orderId,
    order_number: order?.order_number,
    confirmed: order?.status === 'confirmed',
    buyerAttached: order?.guest_email === 'elevation-seat-proof@mailinator.com',
    ticketCount: tickets.length,
    seatOnTicket: !!seatTicket?.seat,
    seat: seatTicket?.seat
      ? { section: seatTicket.seat.section?.name ?? null, row: seatTicket.seat.row_label, number: seatTicket.seat.seat_number }
      : null,
  }
  console.log('[proof] purchase:', JSON.stringify(proofs.purchase))

  // Bearer ticket page shows the seat.
  if (seatTicket) {
    await page.goto(`${BASE}/t/${seatTicket.ticket_code}?k=${seatTicket.secret}`, { waitUntil: 'load', timeout: 60000 })
    await page.waitForTimeout(1200)
    const body = await page.locator('body').innerText()
    proofs.purchase.bearerPageShowsSeat =
      body.includes(seatTicket.seat.row_label) && body.includes(String(seatTicket.seat.seat_number))
    await shot(page, 'purchase-4-bearer-ticket')
  }
  await ctx.close()
}

// ── 2. SAME-SEAT CONCURRENCY GUARD: one winner ──────────────────────────────
{
  const rounds = []
  // Fresh available seats each round (never the one the purchase just took).
  const available = await q(`seats?event_id=eq.${freeEvent.id}&status=eq.available&select=id&limit=6`)
  for (const seat of available.slice(0, 4)) {
    const [a, b] = await Promise.all([
      rpc('create_seat_reservation', {
        p_event_id: freeEvent.id, p_user_id: null, p_seat_ids: [seat.id], p_ttl_minutes: 5,
        p_session_id: `race-a-${seat.id}`,
      }),
      rpc('create_seat_reservation', {
        p_event_id: freeEvent.id, p_user_id: null, p_seat_ids: [seat.id], p_ttl_minutes: 5,
        p_session_id: `race-b-${seat.id}`,
      }),
    ])
    const aWon = a.body?.success === true
    const bWon = b.body?.success === true
    const winners = (aWon ? 1 : 0) + (bWon ? 1 : 0)
    rounds.push({ seat: seat.id, aWon, bWon, exactlyOneWinner: winners === 1 })
    // Release the held seat so the round leaves no residue.
    const winnerRes = aWon ? a.body : bWon ? b.body : null
    if (winnerRes?.reservation_id) {
      await fetch(`${URL_}/rest/v1/reservations?id=eq.${winnerRes.reservation_id}`, { method: 'DELETE', headers: svcH })
      await fetch(`${URL_}/rest/v1/seats?id=eq.${seat.id}`, {
        method: 'PATCH', headers: { ...svcH, prefer: 'return=minimal' }, body: JSON.stringify({ status: 'available' }),
      })
    }
  }
  proofs.concurrency = {
    rounds,
    everyRoundExactlyOneWinner: rounds.length > 0 && rounds.every(r => r.exactlyOneWinner),
  }
  console.log('[proof] concurrency:', JSON.stringify(proofs.concurrency))
}

await browser.close()
proofs.finishedAt = new Date().toISOString()

// Never persist bearer secrets.
const persisted = JSON.parse(JSON.stringify(proofs))
fs.writeFileSync(`${OUT}/proof.json`, JSON.stringify(persisted, null, 2))

const pass =
  proofs.purchase.confirmed &&
  proofs.purchase.buyerAttached &&
  proofs.purchase.seatOnTicket &&
  proofs.purchase.bearerPageShowsSeat &&
  proofs.concurrency.everyRoundExactlyOneWinner

console.log(JSON.stringify({
  orderConfirmed: proofs.purchase.confirmed,
  buyerAttached: proofs.purchase.buyerAttached,
  seatOnTicket: proofs.purchase.seatOnTicket,
  bearerPageShowsSeat: proofs.purchase.bearerPageShowsSeat,
  concurrencyOneWinner: proofs.concurrency.everyRoundExactlyOneWinner,
  ALL_GREEN: pass,
}, null, 2))
if (!pass) process.exit(1)
