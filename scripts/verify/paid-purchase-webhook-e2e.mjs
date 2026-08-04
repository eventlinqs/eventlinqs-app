/**
 * PAID PURCHASE -> WEBHOOK CONFIRMATION, end to end (TEST only, guarded).
 *
 * The recurring incident this proves against (2026-07-12, 2026-07-19,
 * 2026-07-25) is webhook SECRET DRIFT: the payment succeeds at Stripe, the
 * delivery fails signature verification and 400s, and the order sits `pending`
 * forever. Nothing on any surface errors, so a purchase looks fine to the buyer
 * right up until the ticket never arrives.
 *
 * A signature probe alone cannot catch that: it proves the route ACCEPTS a
 * secret, not that STRIPE signs with one the route holds, and not that the
 * confirmation path actually runs. So this drives a real card-4242 purchase
 * through the real UI, then polls the order row until Stripe's own delivery
 * flips it to `confirmed`. The order leaving `pending` is the proof, because
 * ONLY the webhook can move it.
 *
 * Usage: node scripts/verify/paid-purchase-webhook-e2e.mjs <baseUrl>
 * SAFETY: refuses to run unless the Supabase project is the TEST one.
 */
import fs from 'node:fs'
import { chromium } from 'playwright'

const BASE = (process.argv[2] ?? 'https://eventlinqs-staging.vercel.app').replace(/\/+$/, '')

const PROD_REF = 'gndnldyfudbytbboxesk'
const TEST_REF = 'vkapkibzokmfaxqogypq'

const env = {}
for (const line of fs.readFileSync('.env.test', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '')
}
const SB = (env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/+$/, '')
const SVC = env.SUPABASE_SERVICE_ROLE_KEY
if (SB.includes(PROD_REF)) throw new Error('SAFETY STOP: pointed at the PRODUCTION project')
if (!SB.includes(TEST_REF)) throw new Error('SAFETY STOP: not the TEST project')
const H = { apikey: SVC, authorization: `Bearer ${SVC}` }

const q = async (path) => {
  const r = await fetch(`${SB}/rest/v1/${path}`, { headers: H })
  if (!r.ok) throw new Error(`supabase ${r.status}: ${(await r.text()).slice(0, 200)}`)
  return r.json()
}

const GUEST_EMAIL = `webhook-proof-${Date.now()}@mailinator.com`
const OUT = 'docs/verification/blockers-round-2-2026-07-25'
fs.mkdirSync(OUT, { recursive: true })
const shot = (page, name) => page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false })

/**
 * Pick a published, paid, general-admission event whose ORGANISER can actually
 * take a charge.
 *
 * Selecting on the event alone is not enough. Many seeded organisations have
 * `stripe_account_country = null`, and assertCanCreateDestinationCharge rejects
 * those with `org_country_unsupported` ("Payments for this region are not yet
 * supported") before Stripe is ever called, so the payment element never
 * mounts. That is correct behaviour guarding an incomplete Connect setup, not a
 * platform defect, but a harness that picks such an event fails for a reason
 * that has nothing to do with what it is testing.
 */
async function pickEvent() {
  const orgs = await q(
    'organisations?stripe_charges_enabled=is.true&stripe_payouts_enabled=is.true&payout_status=eq.active&stripe_account_country=not.is.null&select=id,name&limit=50',
  )
  if (!orgs.length) throw new Error('no charge-ready organisation on TEST')
  const ids = orgs.map((o) => o.id).join(',')
  const rows = await q(
    `events?status=eq.published&has_reserved_seating=is.false&organiser_assigns_seats=is.false&is_free=is.false&organisation_id=in.(${ids})&select=slug,title&order=slug&limit=40`,
  )
  if (!rows.length) throw new Error('no published paid GA event under a charge-ready organisation')
  console.log(`[proof] ${rows.length} candidate event(s) under ${orgs.length} charge-ready organisation(s)`)
  return rows
}

const result = { base: BASE, startedAt: new Date().toISOString(), guestEmail: GUEST_EMAIL }
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()

try {
  const candidates = await pickEvent()
  let orderId = null
  let usedSlug = null

  for (const ev of candidates.slice(0, 6)) {
    console.log(`[proof] trying ${ev.slug}`)
    await page.goto(`${BASE}/events/${ev.slug}`, { waitUntil: 'load', timeout: 90000 })

    // Add one ticket of the first available tier.
    const plus = page.getByRole('button', { name: /^(\+|increase|add)/i }).first()
    if (!(await plus.count())) { console.log('  no quantity control, skipping'); continue }
    await plus.click()
    await page.waitForTimeout(500)

    const reserve = page.getByRole('button', { name: /reserve|get tickets|checkout/i }).first()
    if (!(await reserve.count())) { console.log('  no reserve button, skipping'); continue }
    await shot(page, 'job4-1-tickets-selected')
    await reserve.click()

    try {
      await page.waitForURL(/\/checkout\//, { timeout: 20000 })
    } catch {
      console.log('  did not reach checkout, skipping')
      continue
    }
    usedSlug = ev.slug
    await page.waitForTimeout(2000)

    // Attendee details. The form has moved between a single "Jane Smith"
    // placeholder and split First/Last name fields, so try label first and fall
    // back to placeholder rather than pinning one shape.
    const fillField = async (labelRe, placeholder, value) => {
      let el = page.getByLabel(labelRe).first()
      if (!(await el.count()) && placeholder) el = page.getByPlaceholder(placeholder).first()
      if (!(await el.count())) return false
      if (!(await el.inputValue())) await el.fill(value)
      return true
    }
    const gotFirst = await fillField(/first name/i, null, 'Webhook')
    if (gotFirst) {
      await fillField(/last name/i, null, 'Proof')
    } else {
      await fillField(/full name|^name$/i, 'Jane Smith', 'Webhook Proof')
    }
    await fillField(/e-?mail/i, 'you@example.com', GUEST_EMAIL)

    // Any remaining required text input left blank blocks native validation and
    // the form silently never advances.
    for (const el of await page.locator('input[required]:not([type=checkbox])').all()) {
      if (!(await el.inputValue())) {
        const type = await el.getAttribute('type')
        await el.fill(type === 'email' ? GUEST_EMAIL : 'Proof')
      }
    }
    await shot(page, 'job4-2-checkout')

    // Checkout is two-step: details, then the Stripe element.
    await page.getByRole('button', { name: /continue to payment/i }).click()
    const frame = page.frameLocator('iframe[name^="__privateStripeFrame"]').first()
    await frame.locator('input[name="number"]').fill('4242424242424242', { timeout: 60000 })
    await frame.locator('input[name="expiry"]').fill('12/30')
    await frame.locator('input[name="cvc"]').fill('123')
    const postal = frame.locator('input[name="postalCode"]')
    if (await postal.count()) await postal.fill('3220')
    await page.waitForTimeout(800)
    await page.getByRole('button', { name: /pay/i }).first().click()
    await page.waitForURL(/confirmation/, { timeout: 120000 })

    orderId = page.url().match(/orders\/([0-9a-f-]+)\//)?.[1] ?? null
    break
  }

  if (!orderId) throw new Error('could not complete a purchase on any candidate event')
  result.orderId = orderId
  result.slug = usedSlug
  console.log(`[proof] paid. order ${orderId} on ${usedSlug}`)

  // THE ASSERTION. Only the webhook can move an order out of `pending`, so a
  // transition to `confirmed` proves Stripe's delivery was signature-verified
  // AND processed. This is what sat broken while the secret had drifted.
  const started = Date.now()
  let order = null
  while (Date.now() - started < 150000) {
    order = (await q(`orders?id=eq.${orderId}&select=id,order_number,status,total_cents,currency,guest_email`))[0]
    if (order?.status === 'confirmed') break
    await new Promise((r) => setTimeout(r, 3000))
  }
  result.secondsToConfirm = Math.round((Date.now() - started) / 1000)
  result.order = order

  const tickets = await q(`tickets?order_id=eq.${orderId}&select=ticket_code,status,holder_email`)
  result.tickets = tickets

  await page.reload({ waitUntil: 'load' })
  await shot(page, 'job4-3-confirmation')

  result.confirmed = order?.status === 'confirmed'
  result.ticketsIssued = tickets.length > 0

  console.log(`\norder_number : ${order?.order_number}`)
  console.log(`status       : ${order?.status}  (after ${result.secondsToConfirm}s)`)
  console.log(`total        : ${order?.total_cents} ${order?.currency}`)
  console.log(`tickets      : ${tickets.length}`)
  console.log(`\nverdict: ${result.confirmed && result.ticketsIssued ? 'PASS - the webhook confirmed the order and issued tickets' : 'FAIL - the order did not leave pending (drift signature)'}`)
  process.exitCode = result.confirmed && result.ticketsIssued ? 0 : 2
} catch (err) {
  result.error = String(err)
  console.error('FAILED:', err)
  await shot(page, 'job4-error').catch(() => {})
  process.exitCode = 2
} finally {
  result.finishedAt = new Date().toISOString()
  fs.writeFileSync(`${OUT}/job4-paid-purchase.json`, JSON.stringify(result, null, 2))
  await browser.close()
}
