/**
 * JOURNEY 4: a buyer wants their money back.
 *
 * Buys a real ticket, then goes looking for a refund the way a person does:
 * from their own ticket, not from a support article. Two questions decide it.
 * Can they ASK without emailing anyone? And when they ask, are they told what
 * happens next, or left wondering whether anything was received?
 *
 * A refund is the most anxious thing a buyer does on a ticketing platform, so a
 * silent request is worse here than anywhere else.
 *
 * Usage: node scripts/journeys/j4.mjs [slug]
 */
import {
  chromium,
  BASE,
  makeJourney,
  note,
  attach,
  describe,
  finish,
  messagesOnScreen,
  buyTicket,
} from './harness.mjs'

const SLUG = process.argv[2] ?? 'lineup-loop-proof-night-d6hcae'
const stamp = process.env.RUN_STAMP ?? String(Date.now()).slice(-6)
const BUYER = `refund.${stamp}@example.com`

const j = makeJourney('j4-refund', 'Journey 4: a buyer asks for a refund')
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'en-AU' })
const page = await ctx.newPage()
await attach(j, page)

try {
  const orderId = await buyTicket(j, page, SLUG, BUYER, 'Refund Tester')
  if (!orderId) throw new Error('could not buy a ticket to refund')

  /*
   * THE LINK FROM THE CONFIRMATION EMAIL. In production this arrives by email;
   * the console transport does not run for the Stripe webhook locally, so the
   * journey derives the same token the server would mint, using the documented
   * dev fallback secret. It proves the SERVER honours the link, which is the
   * thing under test.
   */
  const { createHmac } = await import('node:crypto')
  const token = createHmac('sha256', process.env.ORDER_ACCESS_SECRET ?? 'dev-order-access-secret-change-in-prod')
    .update(`order-access-v1:${orderId}`)
    .digest('hex')
    .slice(0, 40)

  // ── The order the buyer is holding ────────────────────────────────────────
  /*
   * Retry the order page. Straight after paying it can render the not-found
   * state for a beat while the order settles, and judging that first paint
   * reports a 404 on an order that is perfectly fine seconds later.
   */
  let settled = false
  for (let attempt = 1; attempt <= 6 && !settled; attempt += 1) {
    await page.goto(`${BASE}/orders/${orderId}/confirmation?t=${token}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.waitForTimeout(3000)
    settled = await page.evaluate(() => !/can.t find that page/i.test(document.querySelector('main')?.innerText || ''))
    if (!settled) note(j, `The order page is not ready yet (attempt ${attempt})`, 'retrying')
  }
  if (!settled) {
    j.blockers.push('the buyer cannot open their own order: it renders the not-found state')
  }
  const conf = await describe(j, page, 'The order the buyer is holding')

  /*
   * "Refund policy" is a LINK TO THE RULES, not a way to ask. Treating it as a
   * refund control clicked it, navigated away, and destroyed the page context
   * mid-inspection. A control that ASKS is a button, or a link that is not
   * merely the policy.
   */
  const isPolicyOnly = t => /^refund policy$/i.test(t.trim())
  const refundRoute = conf.buttons
    .concat(conf.links)
    .find(t => /refund|cancel|money back/i.test(t) && !isPolicyOnly(t))
  note(j, 'Is a refund offered from the order itself?', refundRoute ?? 'NO CONTROL MENTIONING A REFUND')

  // The published policy has to be reachable from here, whether or not a
  // self-serve refund is: a buyer needs to know the rules before they ask.
  const policy = await page.evaluate(() =>
    [...document.querySelectorAll('a')].find(a => /refund/i.test(a.textContent || ''))?.getAttribute('href') ?? null,
  )
  note(j, 'A link to the refund policy', policy ?? 'NONE ON THE ORDER PAGE')

  if (!refundRoute && !policy) {
    j.blockers.push(
      'from their own order a buyer is offered neither a way to ask for a refund nor the refund policy: ' +
        'the only route left is finding an email address',
    )
  }

  // ── Whatever route exists, follow it ──────────────────────────────────────
  if (refundRoute) {
    for (const el of await page.$$('button, a')) {
      const t = ((await el.innerText().catch(() => '')) || '').trim()
      if (/refund|cancel|money back/i.test(t) && (await el.isVisible().catch(() => false))) {
        await el.click().catch(() => {})
        break
      }
    }
    await page.waitForTimeout(4000)
    await describe(j, page, 'Asking for a refund')
    const reason = await page.$('textarea')
    if (reason) await reason.fill('Cannot attend, something came up.').catch(() => {})
    for (const el of await page.$$('button')) {
      const t = ((await el.innerText().catch(() => '')) || '').trim()
      if (/^(request|submit|send|confirm)/i.test(t) && (await el.isVisible().catch(() => false))) {
        await el.click().catch(() => {})
        break
      }
    }
    await page.waitForTimeout(6000)
    const after = await messagesOnScreen(page)
    const body = await page.evaluate(() => (document.querySelector('main')?.innerText || '').replace(/\s+/g, ' ').slice(0, 300))
    note(j, 'After asking', `${after.join(' // ') || 'no message'}\n      ${body.slice(0, 220)}`)
    /*
     * A REFUSAL IS NOT AN ACKNOWLEDGEMENT, and a loose regex cannot tell them
     * apart. The first version of this check matched the word "request" inside
     * "...to request a refund" in the REFUSAL and scored the journey as a pass.
     * Look for the refusal first.
     */
    const said = `${after.join(' ')} ${body}`
    const refused = /need to be signed in|sign in with the email|not authorised|cannot request/i.test(said)
    const acknowledged = !refused && /received|submitted|sent to the organiser|we have your request|pending/i.test(said)

    if (refused) {
      j.blockers.push(
        'a GUEST buyer is offered "Request a refund", fills it in, presses send, and is told to sign in as ' +
          'the person who bought the tickets. Guest checkout creates NO account (user_id is null on the order ' +
          'and no auth user exists for the email), so the remedy the refusal gives is impossible. The control ' +
          'is enabled and cannot succeed.',
      )
    } else if (!acknowledged) {
      j.blockers.push(`a refund request produced no acknowledgement: ${after.join(' // ') || 'NOTHING AT ALL'}`)
    }
    await page.screenshot({ path: `${j.OUT}/after-asking.png`, fullPage: true })
  } else if (policy) {
    const r = await page.goto(BASE + policy, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.waitForTimeout(2500)
    const readable = await page.evaluate(() => (document.querySelector('main')?.innerText || '').replace(/\s+/g, ' ').slice(0, 300))
    note(j, 'The refund policy the buyer is sent to', `HTTP ${r?.status()} ${policy}\n      ${readable.slice(0, 240)}`)
    if ((r?.status() ?? 0) >= 400) j.blockers.push(`the refund policy link from an order is broken: ${policy} -> ${r?.status()}`)
    const howToAsk = /contact|email|organiser|request/i.test(readable)
    note(j, 'Does the policy say HOW to ask?', howToAsk ? 'yes' : 'NO ROUTE GIVEN')
    if (!howToAsk) {
      j.blockers.push('the refund policy does not tell the buyer how to actually ask for one')
    }
  }
} catch (err) {
  note(j, 'THREW', String(err).slice(0, 200))
  j.blockers.push(`threw: ${String(err).slice(0, 140)}`)
} finally {
  await finish(j)
  console.log(`buyer: ${BUYER}`)
  await browser.close()
}
