/**
 * JOURNEY 3: a stranger buys a ticket.
 *
 * Signed out, from the public event page, with a real card (Stripe test 4242),
 * through to a ticket they can show at the door. No account is created first:
 * the guest path is the one most buyers take and the one least often driven.
 *
 * Usage: node scripts/journeys/j3.mjs [slug]
 */
import { chromium, BASE, makeJourney, note, attach, describe, finish, messagesOnScreen, fillIf } from './harness.mjs'

const SLUG = process.argv[2] ?? 'lineup-loop-proof-night-d6hcae'
const stamp = process.env.RUN_STAMP ?? String(Date.now()).slice(-6)
const BUYER = `buyer.${stamp}@example.com`

const j = makeJourney('j3-buyer-purchase', 'Journey 3: a stranger buys a ticket')
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'en-AU' })
const page = await ctx.newPage()
await attach(j, page)
page.on('console', (m) => {
  if (m.type() === 'error') j.errors.push(`console ${m.text().slice(0, 140)}`)
})

const clickAny = async (rx) => {
  const els = await page.$$('button, a[role=button], a')
  for (const el of els) {
    const t = ((await el.innerText().catch(() => '')) || '').trim()
    if (rx.test(t) && (await el.isVisible().catch(() => false))) {
      await el.click().catch(() => {})
      return t
    }
  }
  return null
}

try {
  // ── 1. the public event page ──────────────────────────────────────────────
  const res = await page.goto(`${BASE}/events/${SLUG}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(3000)
  note(j, 'A stranger opens the event page', `HTTP ${res?.status()} ${SLUG}`)
  const ev = await describe(j, page, 'The event page, signed out')
  const priceShown = await page.evaluate(() => {
    const t = document.querySelector('main')?.innerText || ''
    const m = t.match(/\$[\d,]+(\.\d{2})?/g)
    return m ? [...new Set(m)].slice(0, 6) : []
  })
  note(j, 'Prices visible before any click', priceShown.join(' , ') || 'NONE SHOWN')
  if (!priceShown.length) {
    j.blockers.push('no price is visible on the event page before clicking through (ACCC all-in display)')
  }

  // ── 2. into ticket selection ──────────────────────────────────────────────
  const got = await clickAny(/^(get tickets|buy tickets|select tickets|book now|get your tickets)/i)
  if (!got) {
    j.blockers.push('no way to start buying from the event page')
    throw new Error('no buy control')
  }
  await page.waitForTimeout(4000)
  await describe(j, page, 'Ticket selection')

  /*
   * Add one ticket with the quantity stepper. NOT with the first <select> on the
   * page: that is the footer language picker, and choosing from it set the site
   * language while leaving the cart empty, so the CTA stayed "Select tickets to
   * continue" and the journey reported a missing card field three steps later.
   */
  const plus = await page.$('button[aria-label*="ncrease" i], button[aria-label*="add" i]')
  if (plus) {
    await plus.click()
  } else {
    const buttons = await page.$$('button')
    for (const b of buttons) {
      const t = ((await b.innerText().catch(() => '')) || '').trim()
      if ((t === '+' || t === '−+') && (await b.isVisible().catch(() => false))) {
        await b.click()
        break
      }
    }
  }
  await page.waitForTimeout(2500)
  const qty = await page.evaluate(() => (document.querySelector('main')?.innerText || '').replace(/\s+/g, ' ').slice(0, 220))
  note(j, 'Added a ticket', qty)

  const allIn = await page.evaluate(() => (document.querySelector('main')?.innerText || '').replace(/\s+/g, ' ').slice(0, 500))
  note(j, 'What the buyer is told the total is', allIn.slice(0, 300))

  // The real CTA carries the all-in total, e.g. "Checkout · AUD 26.87". Match it
  // FIRST: a loose /checkout|continue|get tickets/ matched the page's own "Get
  // tickets" heading-button and went nowhere.
  const next = (await clickAny(/^checkout\b/i)) ?? (await clickAny(/continue|proceed|place order/i))
  note(j, 'Moving to checkout', next ?? 'NO CONTROL FOUND')
  if (!next) {
    j.blockers.push('ticket selection offers no way to continue to checkout')
    throw new Error('no checkout control')
  }
  await page.waitForTimeout(6000)
  await describe(j, page, 'Checkout')

  // ── 3. buyer details ──────────────────────────────────────────────────────
  /*
   * Checkout asks twice: once for the BUYER and once for each ATTENDEE. Filling
   * only the first email and first name leaves required attendee fields empty,
   * and "Continue to payment" then does nothing. There is a shortcut on screen
   * for exactly this, so use it the way a person would.
   */
  const byLabel = async (rx, value) => {
    const inputs = await page.$$('input')
    for (const el of inputs) {
      if (!(await el.isVisible().catch(() => false))) continue
      const name = await el.evaluate(
        (e) => e.labels?.[0]?.textContent?.trim() || e.getAttribute('aria-label') || e.getAttribute('placeholder') || '',
      )
      if (rx.test(name)) {
        await el.fill(value).catch(() => {})
        return true
      }
    }
    return false
  }
  await byLabel(/full name/i, 'Robin Ashe')
  await byLabel(/^email/i, BUYER)
  await page.waitForTimeout(800)
  const reused = await clickAny(/use my details for all tickets/i)
  note(j, 'Attendee details', reused ? 'used the buyer details for the ticket' : 'filling the attendee by hand')
  if (!reused) {
    await byLabel(/first name/i, 'Robin')
    await byLabel(/last name/i, 'Ashe')
    const emails = await page.$$('input[type="email"]')
    for (const e of emails) await e.fill(BUYER).catch(() => {})
  }
  await page.waitForTimeout(1500)
  const cont = await clickAny(/^continue to payment/i)
  note(j, 'Submitted buyer details', cont ?? 'no control')
  await page.waitForTimeout(8000)
  await describe(j, page, 'Payment step')

  // ── 4. the card ───────────────────────────────────────────────────────────
  // Stripe Elements live in iframes; fill by frame, the way a person types.
  let filledCard = false
  for (const frame of page.frames()) {
    const num = await frame.$('input[name="number"], input[placeholder*="1234"], input[autocomplete="cc-number"]')
    if (!num) continue
    await num.fill('4242424242424242').catch(() => {})
    await frame.$eval('input[name="expiry"], input[autocomplete="cc-exp"]', (e) => e.focus()).catch(() => {})
    const exp = await frame.$('input[name="expiry"], input[autocomplete="cc-exp"]')
    if (exp) await exp.fill('12 / 34').catch(() => {})
    const cvc = await frame.$('input[name="cvc"], input[autocomplete="cc-csc"]')
    if (cvc) await cvc.fill('123').catch(() => {})
    const zip = await frame.$('input[name="postalCode"], input[autocomplete="postal-code"]')
    if (zip) await zip.fill('3000').catch(() => {})
    filledCard = true
    break
  }
  note(j, 'Card entered', filledCard ? 'test card 4242 into the Stripe frame' : 'NO CARD FIELD FOUND')
  if (!filledCard) {
    const shown = await messagesOnScreen(page)
    j.blockers.push(`no card field on the payment step: ${shown.join(' // ') || 'no message shown'}`)
    throw new Error('no card field')
  }

  const paid = await clickAny(/pay|complete|confirm|place order/i)
  note(j, 'Pressed pay', paid ?? 'NO PAY CONTROL')
  await page.waitForTimeout(20000)
  const after = await describe(j, page, 'After paying')
  const url = page.url().replace(BASE, '')
  const shown = await messagesOnScreen(page)
  note(j, 'Where the buyer ends up', `${url} :: ${shown.join(' // ') || 'no message'}`)

  const looksConfirmed = /confirm|order|ticket|success|thank/i.test(url + ' ' + (after.h ?? ''))
  if (!looksConfirmed) {
    j.blockers.push(
      `after paying, the buyer is on ${url} with ${shown.length ? shown.join(' // ') : 'NO MESSAGE AT ALL'}`,
    )
  } else {
    note(j, 'The buyer has a ticket', `${url}`)
    await page.screenshot({ path: `${j.OUT}/buyer-has-a-ticket.png`, fullPage: true })
  }
} catch (err) {
  note(j, 'THREW', String(err).slice(0, 200))
  j.blockers.push(`threw: ${String(err).slice(0, 140)}`)
} finally {
  await finish(j)
  console.log(`buyer: ${BUYER}`)
  await browser.close()
}
