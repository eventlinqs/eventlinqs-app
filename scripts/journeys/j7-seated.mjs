/**
 * JOURNEY 7: a stranger buys a RESERVED SEAT, end to end, with a real card.
 *
 * WHY THIS EXISTED AS "UNPROVEN" RATHER THAN "PASSED". The seat map is a
 * canvas: one element, no per-seat DOM node, so there is no selector to click
 * and every previous attempt stopped at "the map renders". A map that renders
 * is not a seat that sells, and a seated ticket is the most valuable thing on
 * the platform.
 *
 * HOW THIS DRIVES IT. Not by synthesising mouse coordinates against a
 * hit-test, which would be testing my arithmetic rather than the product. The
 * canvas already carries a real, complete user path: role="application",
 * tabIndex 0, arrow keys walk a seat cursor through the room and Enter selects
 * (src/components/seating/seat-canvas.tsx). That is how a keyboard user buys a
 * seat, so driving it proves the purchase AND proves the map is operable
 * without a mouse, which the mouse path could never tell us.
 *
 * The verdict is taken from the DATABASE at the end: a ticket row, attached to
 * a seat, on a confirmed order. Not from what the screen said.
 *
 * Usage: node scripts/journeys/j7-seated.mjs [slug]
 */
import { chromium, BASE, makeJourney, note, attach, describe, finish } from './harness.mjs'
import { createClient } from '@supabase/supabase-js'

const SLUG = process.argv[2] ?? 'grand-hall-proof-the-full-house'
const stamp = process.env.RUN_STAMP ?? String(Date.now()).slice(-6)
const BUYER = `seated.${stamp}@example.com`

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const j = makeJourney('j7-seated', 'Journey 7: a stranger buys a reserved seat')
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'en-AU' })
const page = await ctx.newPage()
await attach(j, page)
page.on('console', m => {
  if (m.type() === 'error') j.errors.push(`console ${m.text().slice(0, 140)}`)
})

/*
 * SURVIVES A NAVIGATION THAT IS ALREADY IN FLIGHT.
 *
 * page.$$ resolves against the live document, so if the page starts navigating
 * between the call and its result, Playwright throws "Execution context was
 * destroyed" and, because this is the first thing the journey does after
 * landing on the event page, it took the whole run down at step 10 on
 * 29 August with a stack trace and no verdict. The event page fires RSC
 * prefetches for several seconds after it settles, so the race is ordinary
 * rather than exotic.
 *
 * A destroyed context is not a product failure and must not be reported as
 * one: it means "the page moved, look again". So it looks again, up to three
 * times, and only a genuinely different error is allowed to escape.
 */
const clickAny = async rx => {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      for (const el of await page.$$('button, a[role=button], a')) {
        const t = ((await el.innerText().catch(() => '')) || '').trim()
        if (rx.test(t) && (await el.isVisible().catch(() => false))) {
          await el.click().catch(() => {})
          return t
        }
      }
      return null
    } catch (err) {
      if (!/Execution context was destroyed|Target closed|Navigation/i.test(String(err?.message ?? err))) throw err
      await page.waitForTimeout(2000)
    }
  }
  return null
}

try {
  // ── 1. the event page ────────────────────────────────────────────────────
  const res = await page.goto(`${BASE}/events/${SLUG}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(3000)
  note(j, 'A stranger opens the seated event', `HTTP ${res?.status()} ${SLUG}`)
  await describe(j, page, 'The seated event page')

  const entered = await clickAny(/get tickets|buy|select seats|choose/i)
  note(j, 'Entered the seat map', entered ?? 'no entry control found')
  await page.waitForTimeout(3000)

  // ── 2. the canvas ────────────────────────────────────────────────────────
  /*
   * SCROLL TO IT FIRST, and this is not a workaround.
   *
   * SeatSelectorLazy fetches the seat plan only when the chart comes within
   * 600px of the viewport, so the seats are not in the document and are not in
   * the load. A probe that never scrolls sees the skeleton for ever and reports
   * "no seat canvas", which is what made this journey look broken when it was
   * only unvisited. A buyer scrolls; so does this.
   */
  await page.evaluate(() => {
    const heading = [...document.querySelectorAll('h1,h2,h3')].find(h => /choose your seats/i.test(h.textContent || ''))
    ;(heading ?? document.body).scrollIntoView({ block: 'center' })
  })
  await page.waitForTimeout(1200)
  await page
    .locator('[data-testid="seat-selector"] canvas')
    .first()
    .waitFor({ state: 'attached', timeout: 30000 })
    .catch(() => {})

  const canvas = page.locator('[data-testid="seat-selector"] canvas').first()
  const present = await canvas.count()
  if (!present) {
    j.blockers.push('the seat map canvas never rendered, so no seat could be chosen')
    throw new Error('no seat canvas')
  }
  const shape = await page.evaluate(() => {
    const c = document.querySelector('[data-testid="seat-selector"] canvas')
    const host = c?.closest('[role="application"]') ?? c?.parentElement
    return {
      role: host?.getAttribute('role') ?? null,
      tabIndex: host?.getAttribute('tabindex') ?? null,
      label: (host?.getAttribute('aria-label') ?? '').slice(0, 90),
    }
  })
  note(j, 'The map is reachable without a mouse', `role=${shape.role} tabindex=${shape.tabIndex} :: ${shape.label}`)
  if (shape.role !== 'application' || shape.tabIndex !== '0') {
    j.blockers.push('the seat map is not keyboard reachable, so a keyboard user cannot buy a seat at all')
  }

  // ── 3. walk the first-run coach to the end, which is what a buyer does ───
  /*
   * A three-step coach sequence is anchored over the map on a first visit and
   * it OWNS THE KEYBOARD: ArrowRight and Enter drove its "Next" button, so the
   * seat cursor never moved and this journey reported "no seat could be
   * selected" when the map was working perfectly.
   *
   * Two things were wrong in the first attempt and both are worth recording.
   * Clicking "Got it" did nothing, because "Got it" only appears on the LAST
   * step; step one offers "Next". And Escape, pressed before the dialog had
   * focus, went nowhere. So this walks the sequence the way a person does.
   */
  const coachSteps = []
  for (let i = 0; i < 6; i++) {
    const clicked = await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find(x => /^(next|got it)$/i.test((x.textContent || '').trim()))
      if (!b) return null
      const t = b.textContent.trim()
      b.click()
      return t
    })
    if (!clicked) break
    coachSteps.push(clicked)
    await page.waitForTimeout(500)
  }
  note(j, 'Walked the first-run coach', coachSteps.length ? coachSteps.join(' -> ') : 'no coach was shown')

  // ── 4. walk the room and take a seat ─────────────────────────────────────
  const host = page.locator('[role="application"]').first()
  await host.focus()
  await page.waitForTimeout(400)

  // The first arrow press places the cursor on the seat nearest the stage.
  await page.keyboard.press('ArrowRight')
  await page.waitForTimeout(700)

  let selected = false
  for (let attempt = 0; attempt < 8 && !selected; attempt++) {
    await page.keyboard.press('Enter')
    await page.waitForTimeout(1200)
    selected = await page.evaluate(() => {
      const t = document.body.innerText
      // The selection summary names the seat and the CTA stops being inert.
      // The live CTA reads "Reserve N seat(s) . AUD ...", not "Checkout".
      const cta = [...document.querySelectorAll('button')].find(b => /^reserve\s+\d+\s+seat/i.test((b.textContent || '').trim()))
      return /\b(row|seat)\b/i.test(t) && !!cta && !cta.disabled
    })
    if (!selected) {
      await page.keyboard.press('ArrowRight')
      await page.waitForTimeout(500)
    }
  }
  note(j, 'Took a seat with the keyboard', selected ? 'a seat is selected and the CTA is live' : 'NO SEAT COULD BE SELECTED')
  if (!selected) {
    j.blockers.push('arrow keys moved the seat cursor but Enter never produced a selection the checkout would accept')
    throw new Error('no seat selected')
  }

  // Read the seat out of the SELECTOR, not the whole document: matching on
  // document.innerText found "Browse Events" in the nav and logged the seat
  // the buyer chose as "rowse Events".
  const chosen = await page.evaluate(() => {
    const panel = document.querySelector('[data-testid="seat-selector"]')
    const m = (panel?.innerText || '').match(/([^\n]*Row\s*\w+,\s*Seat\s*\w+[^\n]{0,24})/i)
    return m ? m[1].trim() : null
  })
  note(j, 'The seat the buyer chose', chosen ?? '(the summary did not name it)')

  // ── 5. checkout ──────────────────────────────────────────────────────────
  const toCheckout = await clickAny(/^reserve\s+\d+\s+seat|checkout|continue to payment/i)
  note(j, 'Moving to checkout', toCheckout ?? 'no checkout control')
  await page.waitForTimeout(3500)
  await describe(j, page, 'Checkout, holding a seat')

  /*
   * Buyer details, filled by LABEL rather than by a name attribute. The
   * checkout names its fields "Full name" and "Email" through placeholders and
   * labels, not `name=`, so a name-attribute selector filled nothing, the form
   * refused to advance, and the journey reported "no card field" as though the
   * payment step were broken. The same helper j3 uses.
   */
  const byLabel = async (rx, value) => {
    for (const el of await page.$$('input')) {
      if (!(await el.isVisible().catch(() => false))) continue
      const label = await el.evaluate(
        e => e.labels?.[0]?.textContent?.trim() || e.getAttribute('aria-label') || e.getAttribute('placeholder') || '',
      )
      if (rx.test(label)) {
        await el.fill(value).catch(() => {})
        return true
      }
    }
    return false
  }
  await byLabel(/full name/i, 'Seated Stranger')
  await byLabel(/first name/i, 'Seated')
  await byLabel(/last name/i, 'Stranger')
  for (const e of await page.$$('input[type="email"]')) await e.fill(BUYER).catch(() => {})
  await page.waitForTimeout(1200)

  const cont = await clickAny(/^continue to payment/i)
  note(j, 'Submitted buyer details', cont ?? 'no control')

  /*
   * WAIT FOR THE CARD FIELD, NOT FOR A CLOCK.
   *
   * This was waitForTimeout(9000). The step advances only after the server has
   * created the payment intent, and Stripe then loads its own iframe, so on a
   * cold local server nine seconds regularly lands while the button still says
   * "Processing…". The journey then looked for a card field, correctly found
   * none, and reported "NO CARD FIELD FOUND" against a checkout that was
   * working perfectly and simply had not finished. It did exactly that on
   * 29 August, twice, and the blocker it filed named the wrong thing.
   *
   * Sixty seconds is generous on purpose: a slow local payment intent is not a
   * product defect, and a false blocker on the money path is far more expensive
   * than a wait.
   */
  let paid = false
  const deadline = Date.now() + 60000
  while (Date.now() < deadline && !paid) {
    for (const frame of page.frames()) {
      const num = frame.locator('input[name="number"], input[placeholder*="1234"]').first()
      if (await num.count().catch(() => 0)) {
        await num.fill('4242424242424242').catch(() => {})
        await frame.locator('input[name="expiry"]').first().fill('12/34').catch(() => {})
        await frame.locator('input[name="cvc"]').first().fill('123').catch(() => {})
        await frame.locator('input[name="postalCode"]').first().fill('3000').catch(() => {})
        paid = true
        break
      }
    }
    if (!paid) await page.waitForTimeout(2000)
  }
  await describe(j, page, 'Payment step, holding a seat')
  note(j, 'Card entered', paid ? 'test card 4242 into the Stripe frame' : 'NO CARD FIELD FOUND')
  if (!paid) {
    const said = await page.evaluate(() => document.body.innerText.slice(0, 200))
    j.blockers.push(`no card field on the seated payment step: ${said.replace(/\s+/g, ' ').slice(0, 120)}`)
    throw new Error('no card field')
  }

  await clickAny(/^pay\b/i)
  await page.waitForTimeout(12000)
  note(j, 'After paying', page.url())

  // ── 7. THE DATABASE DECIDES ──────────────────────────────────────────────
  const orderId = page.url().match(/\/orders\/([0-9a-f-]{36})\//i)?.[1] ?? null
  if (!orderId) {
    j.blockers.push('paying did not land on an order confirmation, so no seat was sold')
    throw new Error('no order id in the landing url')
  }

  // The webhook is asynchronous; give it a moment to confirm and issue.
  let verdict = null
  for (let i = 0; i < 12 && !verdict; i++) {
    const { data: order } = await db.from('orders').select('status').eq('id', orderId).maybeSingle()
    const { data: tickets } = await db
      .from('tickets')
      .select('ticket_code, status, seat_id, seat:seats!tickets_seat_id_fkey(row_label, seat_number)')
      .eq('order_id', orderId)
    if (order?.status === 'confirmed' && tickets?.length) verdict = { order, tickets }
    else await new Promise(r => setTimeout(r, 2500))
  }

  if (!verdict) {
    j.blockers.push(`order ${orderId} never reached confirmed with an issued ticket`)
  } else {
    const t = verdict.tickets[0]
    const seat = t.seat ? `${t.seat.row_label}${t.seat.seat_number}` : null
    note(
      j,
      'THE DATABASE: what the buyer actually owns',
      `order ${verdict.order.status}; ticket ${t.ticket_code} (${t.status}); seat ${seat ?? 'NONE ATTACHED'}`,
    )
    if (!t.seat_id) {
      j.blockers.push('the ticket was issued with NO seat attached, so nobody knows where this buyer sits')
    }
  }
} catch (err) {
  note(j, 'THREW', String(err).slice(0, 200))
} finally {
  await finish(j, browser)
  console.log(`buyer: ${BUYER}`)
}
