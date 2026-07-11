/**
 * Seated-checkout user-attachment proofs (TEST only, guarded). Against staging:
 *   A. LOGGED-IN SEATED: real login, seat pick, card 4242; the order row must
 *      carry the buyer's user_id (guest fields null) and the ticket must appear
 *      in that account's My Tickets through the real UI.
 *   B. GUEST SEATED: no session; user_id stays null, guest_email correct.
 *   C. LOGGED-IN GA: control; attaches identically.
 *   D. TRANSFER: the newly attached seated ticket transfers through the real
 *      /tickets UI (holder reassigned, secret rotated, transfer logged).
 * Writes screenshots + proofs.json to docs/verification/seated-attachment-2026-07-11/.
 *
 * Usage: node scripts/verify/seated-attachment-e2e.mjs <baseUrl>
 */
import fs from 'node:fs'
import { chromium } from 'playwright'

const BASE = process.argv[2]
if (!BASE) throw new Error('usage: node scripts/verify/seated-attachment-e2e.mjs <baseUrl>')
const OUT = 'docs/verification/seated-attachment-2026-07-11'
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
const svcH = { apikey: SVC, authorization: `Bearer ${SVC}` }

const TEST_EMAIL = 'test-user@eventlinqs.com'
const TEST_PASSWORD = 'TestUser2026!Secure'
const TEST_USER_ID = '57101100-eec8-4e72-a464-97e11e66bea1'
const SEATED_SLUG = 'cellar-comedy-night-seated-season-opener'
const GA_SLUG = 'harbour-lights-live-geelong-waterfront-sessions-4muhm2'
const GUEST_EMAIL = 'guest-attach-proof@mailinator.com'
const TRANSFER_EMAIL = 'transfer-attach-proof@mailinator.com'

// Re-runnable: STAGES=c,d re-drives only those stages; skipped purchase stages
// reload their proof from the database rows the earlier run created.
const STAGES = new Set((process.env.STAGES ?? 'a,b,c,d').split(','))

const proofs = { base: BASE, startedAt: new Date().toISOString(), stages: [...STAGES] }

async function q(path) {
  const res = await fetch(`${URL_}/rest/v1/${path}`, { headers: svcH })
  if (!res.ok) throw new Error(`${path} -> ${res.status}: ${await res.text()}`)
  return res.json()
}
async function shot(page, name) {
  await page.waitForTimeout(600)
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true })
  console.log(`[proof] shot ${name}`)
}
async function pollOrderConfirmed(orderId, ms = 45000) {
  const until = Date.now() + ms
  while (Date.now() < until) {
    const rows = await q(`orders?id=eq.${orderId}&select=id,order_number,status,user_id,guest_email,guest_name,total_cents,currency`)
    if (rows[0]?.status === 'confirmed') return rows[0]
    await new Promise(r => setTimeout(r, 3000))
  }
  const rows = await q(`orders?id=eq.${orderId}&select=id,order_number,status,user_id,guest_email,guest_name,total_cents,currency`)
  return rows[0]
}

async function fillBuyerDetailsIfEmpty(page, name, email) {
  const nameInput = page.getByPlaceholder('Jane Smith')
  if (await nameInput.count()) {
    if (!(await nameInput.inputValue())) await nameInput.fill(name)
  }
  const emailInput = page.getByPlaceholder('you@example.com').first()
  if (await emailInput.count()) {
    if (!(await emailInput.inputValue())) await emailInput.fill(email)
  }
}

async function payWithTestCard(page) {
  await page.getByRole('button', { name: /continue to payment/i }).click()
  const stripeFrame = page.frameLocator('iframe[name^="__privateStripeFrame"]').first()
  await stripeFrame.locator('input[name="number"]').fill('4242424242424242', { timeout: 60000 })
  await stripeFrame.locator('input[name="expiry"]').fill('12/30')
  await stripeFrame.locator('input[name="cvc"]').fill('123')
  const postal = stripeFrame.locator('input[name="postalCode"]')
  if (await postal.count()) await postal.fill('3220')
  await page.waitForTimeout(800)
  await page.getByRole('button', { name: /pay/i }).first().click()
  await page.waitForURL(/confirmation/, { timeout: 120000 })
}

async function seatedPurchase(page, buyerName, buyerEmail, shotPrefix) {
  // The map can render cached availability (a seat sold seconds ago still shows
  // open); the server refuses the stale hold, so reselect a different seat on
  // refusal, exactly as a real buyer would.
  let reserved = false
  for (let attempt = 0; attempt < 6 && !reserved; attempt++) {
    await page.goto(`${BASE}/events/${SEATED_SLUG}`, { waitUntil: 'load', timeout: 90000 })
    await page.waitForSelector('svg[aria-label="Seat map"]', { timeout: 45000 })
    await page.locator('svg[aria-label="Seat map"] g[style*="pointer"]').nth(attempt).click()
    await shot(page, `${shotPrefix}-seat-picked`)
    await page.getByRole('button', { name: /Reserve 1 seat/ }).click()
    try {
      await page.waitForURL(/\/checkout\//, { timeout: 15000 })
      reserved = true
    } catch {
      console.log(`[proof] ${shotPrefix}: seat ${attempt} refused (stale availability), reselecting`)
    }
  }
  if (!reserved) throw new Error(`${shotPrefix}: no reservable seat after 6 attempts`)
  await page.waitForTimeout(2000)
  await fillBuyerDetailsIfEmpty(page, buyerName, buyerEmail)
  await shot(page, `${shotPrefix}-checkout`)
  await payWithTestCard(page)
  await page.waitForTimeout(9000)
  await page.reload({ waitUntil: 'load' })
  await shot(page, `${shotPrefix}-confirmation`)
  const orderId = page.url().match(/orders\/([0-9a-f-]+)\//)?.[1]
  if (!orderId) throw new Error(`${shotPrefix}: no order id in ${page.url()}`)
  return orderId
}

const browser = await chromium.launch()
const DESKTOP = { viewport: { width: 1440, height: 900 } }

// ── Login once, keep the authed state ────────────────────────────────────────
const authed = await browser.newContext(DESKTOP)
{
  const page = await authed.newPage()
  await page.goto(`${BASE}/login`, { waitUntil: 'load', timeout: 90000 })
  await page.fill('input[type="email"]', TEST_EMAIL)
  await page.fill('input[type="password"]', TEST_PASSWORD)
  await Promise.all([
    page.waitForURL(u => !String(u).includes('/login'), { timeout: 60000 }),
    page.click('button[type="submit"]'),
  ])
  await page.close()
  console.log('[proof] login ok')
}

// ── A. Logged-in seated purchase ─────────────────────────────────────────────
{
  const page = await authed.newPage()
  let orderId
  if (STAGES.has('a')) {
    orderId = await seatedPurchase(page, 'Test User', TEST_EMAIL, 'a-loggedin-seated')
  } else {
    // Reuse the seated order the earlier run purchased for this account.
    const seatTix = await q(`tickets?seat_id=not.is.null&select=order_id,created_at&order=created_at.desc&limit=50`)
    for (const t of seatTix) {
      const o = (await q(`orders?id=eq.${t.order_id}&user_id=eq.${TEST_USER_ID}&select=id`))[0]
      if (o) { orderId = o.id; break }
    }
    if (!orderId) throw new Error('STAGES skipped a but no prior seated order found for the test user')
  }
  const order = await pollOrderConfirmed(orderId)
  const tickets = await q(
    `tickets?order_id=eq.${orderId}&select=id,ticket_code,secret,status,holder_email,seat:seats(row_label,seat_number,section:seat_map_sections(name))`,
  )
  proofs.a_loggedInSeated = {
    order,
    tickets,
    userAttached: order?.user_id === TEST_USER_ID,
    guestFieldsNull: order?.guest_email === null && order?.guest_name === null,
    confirmed: order?.status === 'confirmed',
  }
  console.log('[proof] A order', order?.order_number, 'user_id', order?.user_id)

  // My Tickets through the real UI must show the new ticket.
  await page.goto(`${BASE}/tickets`, { waitUntil: 'load', timeout: 90000 })
  await page.waitForTimeout(1500)
  const code = tickets[0]?.ticket_code ?? ''
  const visible = code ? await page.locator(`text=${code}`).count() : 0
  proofs.a_loggedInSeated.myTicketsShowsTicket = visible > 0
  await shot(page, 'a-loggedin-seated-my-tickets')
  await page.close()
}

// ── B. Guest seated purchase (no session) ────────────────────────────────────
{
  const guestCtx = await browser.newContext(DESKTOP)
  const page = await guestCtx.newPage()
  let orderId
  if (STAGES.has('b')) {
    orderId = await seatedPurchase(page, 'Guest Proof', GUEST_EMAIL, 'b-guest-seated')
  } else {
    const prior = await q(`orders?guest_email=eq.${GUEST_EMAIL}&select=id&order=created_at.desc&limit=1`)
    orderId = prior[0]?.id
    if (!orderId) throw new Error('STAGES skipped b but no prior guest seated order found')
  }
  const order = await pollOrderConfirmed(orderId)
  const tickets = await q(`tickets?order_id=eq.${orderId}&select=ticket_code,status,holder_email`)
  proofs.b_guestSeated = {
    order,
    tickets,
    userIdNull: order?.user_id === null,
    guestEmailCorrect: order?.guest_email === GUEST_EMAIL,
    confirmed: order?.status === 'confirmed',
  }
  console.log('[proof] B order', order?.order_number, 'user_id', order?.user_id, 'guest_email', order?.guest_email)
  await guestCtx.close()
}

// ── C. Logged-in GA purchase (control) ───────────────────────────────────────
{
  const page = await authed.newPage()
  await page.goto(`${BASE}/events/${GA_SLUG}`, { waitUntil: 'load', timeout: 90000 })
  // The PAID tier, not the free community pass: the control must exercise the
  // paid GA checkout exactly as the original smoke did.
  await page.locator('button[aria-label="Increase General Admission quantity"]').click()
  await shot(page, 'c-loggedin-ga-selected')
  await page.getByRole('button', { name: /^Checkout/ }).click()
  await page.waitForURL(/\/checkout\//, { timeout: 60000 })
  await page.waitForTimeout(2000)
  await fillBuyerDetailsIfEmpty(page, 'Test User', TEST_EMAIL)
  const useMine = page.getByText('Use my details for all tickets')
  if (await useMine.count()) await useMine.click()
  await shot(page, 'c-loggedin-ga-checkout')
  await payWithTestCard(page)
  await page.waitForTimeout(9000)
  const orderId = page.url().match(/orders\/([0-9a-f-]+)\//)?.[1]
  await shot(page, 'c-loggedin-ga-confirmation')
  const order = await pollOrderConfirmed(orderId)
  proofs.c_loggedInGA = {
    order,
    userAttached: order?.user_id === TEST_USER_ID,
    confirmed: order?.status === 'confirmed',
  }
  console.log('[proof] C order', order?.order_number, 'user_id', order?.user_id)
  await page.close()
}

// ── D. Transfer the newly attached seated ticket via the real UI ────────────
{
  const ticketBefore = proofs.a_loggedInSeated.tickets[0]
  const page = await authed.newPage()
  await page.goto(`${BASE}/tickets`, { waitUntil: 'load', timeout: 90000 })
  await page.waitForTimeout(1500)
  // The newest ticket (A's seated ticket) is first in the created_at desc list;
  // scope the transfer form to the list item that carries its ticket code.
  const item = page.locator('li').filter({ hasText: ticketBefore.ticket_code })
  await item.getByRole('button', { name: 'Transfer or gift this ticket' }).click()
  await item.getByPlaceholder('New holder name').fill('Transfer Proof')
  await item.getByPlaceholder('New holder email').fill(TRANSFER_EMAIL)
  await shot(page, 'd-transfer-form')
  await item.getByRole('button', { name: 'Send ticket' }).click()
  await page.waitForSelector('[role="status"]', { timeout: 45000 })
  const statusText = await page.locator('[role="status"]').first().textContent()
  await shot(page, 'd-transfer-sent')

  const after = (await q(
    `tickets?id=eq.${ticketBefore.id}&select=id,ticket_code,secret,status,holder_email,holder_name,transferred_to_email`,
  ))[0]
  const log = await q(`ticket_transfers?ticket_id=eq.${ticketBefore.id}&select=from_user_id,from_email,to_email,created_at`)
  proofs.d_transfer = {
    uiStatus: statusText,
    before: { holder_email: ticketBefore.holder_email, secret_prefix: ticketBefore.secret.slice(0, 8) },
    after,
    log,
    holderReassigned: after?.holder_email === TRANSFER_EMAIL,
    secretRotated: after?.secret !== ticketBefore.secret,
    transferLogged: log.length === 1 && log[0].to_email === TRANSFER_EMAIL && log[0].from_user_id === TEST_USER_ID,
  }
  console.log('[proof] D transfer:', statusText?.trim())
  await page.close()
}

await browser.close()
proofs.finishedAt = new Date().toISOString()

// Never persist bearer secrets in the evidence file.
if (proofs.a_loggedInSeated?.tickets) {
  for (const t of proofs.a_loggedInSeated.tickets) delete t.secret
}
if (proofs.d_transfer?.after) delete proofs.d_transfer.after.secret
fs.writeFileSync(`${OUT}/proofs.json`, JSON.stringify(proofs, null, 2))

const pass =
  proofs.a_loggedInSeated.userAttached &&
  proofs.a_loggedInSeated.guestFieldsNull &&
  proofs.a_loggedInSeated.confirmed &&
  proofs.a_loggedInSeated.myTicketsShowsTicket &&
  proofs.b_guestSeated.userIdNull &&
  proofs.b_guestSeated.guestEmailCorrect &&
  proofs.b_guestSeated.confirmed &&
  proofs.c_loggedInGA.userAttached &&
  proofs.c_loggedInGA.confirmed &&
  proofs.d_transfer.holderReassigned &&
  proofs.d_transfer.secretRotated &&
  proofs.d_transfer.transferLogged
console.log(JSON.stringify({
  A_seatedAttached: proofs.a_loggedInSeated.userAttached,
  A_guestFieldsNull: proofs.a_loggedInSeated.guestFieldsNull,
  A_confirmed: proofs.a_loggedInSeated.confirmed,
  A_myTickets: proofs.a_loggedInSeated.myTicketsShowsTicket,
  B_guestNullUser: proofs.b_guestSeated.userIdNull,
  B_guestEmail: proofs.b_guestSeated.guestEmailCorrect,
  B_confirmed: proofs.b_guestSeated.confirmed,
  C_gaAttached: proofs.c_loggedInGA.userAttached,
  C_confirmed: proofs.c_loggedInGA.confirmed,
  D_holderReassigned: proofs.d_transfer.holderReassigned,
  D_secretRotated: proofs.d_transfer.secretRotated,
  D_transferLogged: proofs.d_transfer.transferLogged,
  ALL_GREEN: pass,
}, null, 2))
if (!pass) process.exit(1)
