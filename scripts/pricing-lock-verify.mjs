/**
 * Pricing, margin and giving lock: money-path verification (TEST only).
 *   1. FREE seated purchase, anonymous, end to end (post venue-share
 *      removal): order totals zero, no ledger entry (free orders skip the
 *      funds-holding ledger by design), no venue share rows.
 *   2. PAID GA purchase, card 4242, end to end via the forwarded webhook:
 *      displayed all-in equals charged to the cent, organiser ledger credit
 *      equals FACE VALUE (no revenue-share deduction), platform +
 *      processing fees retained in full, zero venue_share_ledger rows.
 * Writes docs/surpass/evidence/pricing-lock-proofs.json + screenshots.
 *
 * Usage: node scripts/pricing-lock-verify.mjs <baseUrl>
 */
import fs from 'node:fs'
import { chromium } from 'playwright'

const BASE = process.argv[2]
if (!BASE) throw new Error('usage: node scripts/pricing-lock-verify.mjs <baseUrl>')
const OUT = 'docs/surpass/evidence'
fs.mkdirSync(OUT, { recursive: true })

const PROD_REF = 'gndnldyfudbytbboxesk'
const env = {}
for (const line of fs.readFileSync('.env.test', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '')
}
const URL_ = (env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/+$/, '')
if (URL_.includes(PROD_REF)) throw new Error('SAFETY STOP: prod')
const svcH = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` }
async function q(path) {
  const res = await fetch(`${URL_}/rest/v1/${path}`, { headers: svcH })
  return res.json()
}

const TEST_EMAIL = 'test-user@eventlinqs.com'
const TEST_PASSWORD = 'TestUser2026!Secure'
const FREE_SEATED_SLUG = 'cellar-free-night-on-the-builder-chart'
const PAID_GA_SLUG = 'harbour-lights-live-geelong-waterfront-sessions-4muhm2'

const proofs = { startedAt: new Date().toISOString() }
const browser = await chromium.launch()
const DESKTOP = { viewport: { width: 1440, height: 900 } }

async function orderMoney(orderId) {
  const order = (await q(`orders?id=eq.${orderId}&select=id,order_number,status,subtotal_cents,platform_fee_cents,processing_fee_cents,total_cents,currency`))[0]
  const ledger = await q(`organiser_balance_ledger?reference_id=eq.${orderId}&reference_type=eq.order&select=reason,delta_cents`)
  const venueShare = await q(`venue_share_ledger?order_id=eq.${orderId}&select=id`)
  return { order, ledger, venueShareRows: Array.isArray(venueShare) ? venueShare.length : 'table-query-failed' }
}

// ── 1. FREE seated purchase, anonymous ───────────────────────────────────────
if (process.env.SKIP_FREE) {
  // Re-runs after a paid-leg flake reuse the already-proven free purchase.
  const prior = JSON.parse(fs.readFileSync(`${OUT}/pricing-lock-proofs.json`, 'utf8'))
  proofs.freePurchase = prior.freePurchase
} else {
  const ctx = await browser.newContext(DESKTOP)
  const page = await ctx.newPage()
  await page.goto(`${BASE}/events/${FREE_SEATED_SLUG}`, { waitUntil: 'load', timeout: 90000 })
  await page.waitForSelector('svg[aria-label="Seat map"]', { timeout: 30000 })
  await page.locator('svg[aria-label="Seat map"] g[style*="pointer"]').first().click()
  await page.getByRole('button', { name: /Reserve 1 seat/ }).click()
  await page.waitForURL(/\/checkout\//, { timeout: 45000 })
  await page.getByPlaceholder('Jane Smith').fill('Lock Verify Guest')
  await page.getByPlaceholder('you@example.com').first().fill('lock-verify@eventlinqs.com')
  await page.getByRole('button', { name: 'Register for free' }).click()
  await page.waitForURL(/confirmation/, { timeout: 60000 })
  const orderId = page.url().match(/orders\/([0-9a-f-]+)\//)?.[1]
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `${OUT}/lock-free-confirmation.png`, fullPage: true })
  proofs.freePurchase = await orderMoney(orderId)
  await ctx.close()
  console.log('[lock] free purchase:', JSON.stringify(proofs.freePurchase.order))
}

// ── 2. PAID GA purchase, card 4242 ───────────────────────────────────────────
{
  const ctx = await browser.newContext(DESKTOP)
  const page = await ctx.newPage()
  await page.goto(`${BASE}/login`, { waitUntil: 'load', timeout: 90000 })
  await page.fill('input[type="email"]', TEST_EMAIL)
  await page.fill('input[type="password"]', TEST_PASSWORD)
  await Promise.all([
    page.waitForURL(u => !String(u).includes('/login'), { timeout: 45000 }),
    page.click('button[type="submit"]'),
  ])

  await page.goto(`${BASE}/events/${PAID_GA_SLUG}`, { waitUntil: 'load', timeout: 90000 })
  await page.waitForTimeout(1200)
  await page.locator('button[aria-label="Increase General Admission quantity"]').first().click()
  await page.waitForTimeout(500)
  const cta = page.locator('#tickets button').filter({ hasText: /checkout/i }).first()
  const displayedCta = (await cta.textContent())?.trim()
  await cta.click()
  await page.waitForURL(/\/checkout\//, { timeout: 45000 })
  await page.waitForTimeout(2500)
  const displayedTotal = (await page.locator('text=/^AUD \\d+\\.\\d{2}$/').last().textContent())?.trim()
  await page.screenshot({ path: `${OUT}/lock-paid-checkout.png`, fullPage: true })

  // Prefill is async for signed-in buyers and absent when it misses; fill
  // explicitly so Continue always passes validation.
  const nameField = page.getByPlaceholder('Jane Smith')
  if ((await nameField.inputValue().catch(() => '')) === '') {
    await nameField.fill('Test User')
  }
  const emailField = page.getByPlaceholder('you@example.com').first()
  if ((await emailField.inputValue().catch(() => '')) === '') {
    await emailField.fill(TEST_EMAIL)
  }
  // GA orders collect per-attendee details (the seated path does not);
  // the form's own shortcut copies the buyer into every ticket.
  const copyDetails = page.getByRole('button', { name: /use my details for all tickets/i })
  if (await copyDetails.count()) await copyDetails.click()
  await page.waitForTimeout(400)
  await page.getByRole('button', { name: /continue to payment/i }).click()
  // The Payment Element mounts several Stripe frames; find the one carrying
  // the card number input rather than assuming the first.
  await page.waitForTimeout(5000)
  let stripeFrame = null
  for (let attempt = 0; attempt < 20 && !stripeFrame; attempt++) {
    for (const frame of page.frames()) {
      if (!/stripe/i.test(frame.url())) continue
      const count = await frame.locator('input[name="number"]').count().catch(() => 0)
      if (count > 0) {
        stripeFrame = frame
        break
      }
    }
    if (!stripeFrame) await page.waitForTimeout(1500)
  }
  if (!stripeFrame) {
    await page.screenshot({ path: `${OUT}/lock-paid-FAILURE.png`, fullPage: true })
    const frames = page.frames().map(f => f.url()).filter(u => u && u !== 'about:blank')
    const bodyText = await page.locator('body').innerText().catch(() => '')
    fs.writeFileSync(
      `${OUT}/lock-paid-FAILURE.txt`,
      `frames:\n${frames.join('\n')}\n\nbody:\n${bodyText.slice(0, 3000)}`,
    )
    throw new Error('Stripe card frame never appeared (diagnostics written)')
  }
  await stripeFrame.locator('input[name="number"]').fill('4242424242424242', { timeout: 30000 })
  await stripeFrame.locator('input[name="expiry"]').fill('12/30')
  await stripeFrame.locator('input[name="cvc"]').fill('123')
  const postal = stripeFrame.locator('input[name="postalCode"]')
  if (await postal.count()) await postal.fill('3220')
  await page.getByRole('button', { name: /pay/i }).first().click()
  await page.waitForURL(/confirmation/, { timeout: 120000 })
  await page.waitForTimeout(9000)
  await page.reload({ waitUntil: 'load' })
  await page.waitForTimeout(2000)
  await page.screenshot({ path: `${OUT}/lock-paid-confirmation.png`, fullPage: true })

  const orderId = page.url().match(/orders\/([0-9a-f-]+)\//)?.[1]
  proofs.paidPurchase = {
    displayedCta,
    displayedCheckoutTotal: displayedTotal,
    ...(await orderMoney(orderId)),
  }
  await ctx.close()
  console.log('[lock] paid purchase:', JSON.stringify(proofs.paidPurchase.order))
  console.log('[lock] ledger:', JSON.stringify(proofs.paidPurchase.ledger))
}

await browser.close()

// ── Assertions ───────────────────────────────────────────────────────────────
const paid = proofs.paidPurchase
const o = paid.order
const credit = (paid.ledger ?? []).find(l => l.reason === 'order_confirmed')
const creditCents = credit?.delta_cents ?? null
proofs.assertions = {
  paidConfirmed: o?.status === 'confirmed',
  displayedEqualsCharged:
    paid.displayedCta?.includes((o.total_cents / 100).toFixed(2)) === true,
  totalEqualsSubtotalPlusFees:
    o.total_cents === o.subtotal_cents + o.platform_fee_cents + o.processing_fee_cents,
  organiserCreditEqualsFaceValue: creditCents !== null && creditCents === o.subtotal_cents,
  organiserCreditCents: creditCents,
  noVenueShareRows: paid.venueShareRows === 0 && proofs.freePurchase.venueShareRows === 0,
  freeOrderZeroTotal:
    proofs.freePurchase.order.total_cents === 0 &&
    proofs.freePurchase.order.platform_fee_cents === 0,
}
proofs.finishedAt = new Date().toISOString()
fs.writeFileSync(`${OUT}/pricing-lock-proofs.json`, JSON.stringify(proofs, null, 2))
console.log(JSON.stringify(proofs.assertions, null, 2))
const green = Object.entries(proofs.assertions).every(([k, v]) => k === 'organiserCreditCents' || v === true)
console.log(green ? 'ALL_GREEN' : 'ASSERTIONS_FAILED')
if (!green) process.exit(1)
