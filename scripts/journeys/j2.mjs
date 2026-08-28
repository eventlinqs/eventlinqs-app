/**
 * JOURNEY 2: a solo organiser wants to SELL tickets, and has not connected
 * Stripe.
 *
 * This is the moment the platform has to be honest. The organiser has done real
 * work: signed up, built an event, priced it. If publishing is refused, the
 * refusal has to say that money is the reason and point at the fix. If it is
 * NOT refused, the platform has promised to sell tickets it cannot take payment
 * for, which is worse.
 *
 * Usage: node scripts/journeys/j2.mjs
 */
import {
  chromium,
  BASE,
  makeJourney,
  note,
  attach,
  describe,
  finish,
  signUpAndConfirm,
  createEventThroughWizard,
  messagesOnScreen,
} from './harness.mjs'

const j = makeJourney('j2-paid-before-stripe', 'Journey 2: paid event, Stripe not connected')
const stamp = process.env.RUN_STAMP ?? String(Date.now()).slice(-6)
const EMAIL = `sam.paid.${stamp}@example.com`
const PASSWORD = `Str0ng-${stamp}-Pass!`
const TITLE = `Northcote Paid Night ${stamp}`

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'en-AU' })
const page = await ctx.newPage()
await attach(j, page)
page.on('console', (m) => {
  if (m.type() === 'error') j.errors.push(`console ${m.text().slice(0, 140)}`)
})

try {
  if (!(await signUpAndConfirm(j, page, { name: 'Sam Okafor', email: EMAIL, password: PASSWORD }))) {
    throw new Error('could not get an account')
  }

  const review = await createEventThroughWizard(j, page, {
    title: TITLE,
    summary: 'A paid night in Northcote.',
    description: 'A ticketed night at the Wool Exchange. Doors at seven.',
    price: '25',
    uploadCover: 'public/images/hero/afrobeats.jpg',
    wantCover: false,
    orgName: `Okafor Presents ${stamp}`,
  })
  if (!review.reachedReview) throw new Error('never reached review')

  note(j, 'At the review step with a PAID event', `Publish disabled=${review.publishDisabled}`)
  await describe(j, page, 'Review step, paid event, no Stripe')

  // Does the review step name MONEY as the reason, or say nothing about it?
  const mentionsPayouts = /stripe|payout|bank|payment|connect/i.test(review.reviewText)
  const shown = await messagesOnScreen(page)

  if (review.publishDisabled) {
    note(
      j,
      'Publish is refused. Does it say why, in terms of money?',
      `mentions Stripe/payout/bank/payment: ${mentionsPayouts}
      messages: ${shown.join(' // ') || 'NOTHING AT ALL'}`,
    )
    if (!mentionsPayouts) {
      j.blockers.push(
        'a PAID event is refused publication and nothing on the review step mentions payments, ' +
          'Stripe, a payout account or a bank: the refusal is not true about its own cause',
      )
    }
  } else {
    await review.publishButton.click()
    await page.waitForTimeout(12000)
    const url = page.url().replace(BASE, '')
    const after = await messagesOnScreen(page)
    note(j, 'Publish was ALLOWED on a paid event with no Stripe', `landed ${url} :: ${after.join(' // ') || 'no message'}`)

    /*
     * THE THIRD OUTCOME, and the one that actually happens. Publish is neither
     * refused nor honoured: the button is enabled, the press does nothing, no
     * event is created, and NOTHING is said. The organiser has signed up, built
     * an event, priced it, uploaded artwork, and is left on the review step with
     * no idea that money is the problem.
     */
    if (!/\/launch-kit/.test(url)) {
      j.blockers.push(
        'a PAID event with no Stripe: Publish is ENABLED, the press does nothing, no event is created, ' +
          `and nothing is shown. Landed back on ${url} with ${after.length ? after.join(' // ') : 'NO MESSAGE AT ALL'}`,
      )
      await page.screenshot({ path: `${j.OUT}/publish-did-nothing.png`, fullPage: true })
    }

    if (/\/launch-kit/.test(url)) {
      // Now the real test: can a stranger actually buy?
      const anon = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'en-AU' })
      const ap = await anon.newPage()
      await ap.goto(`${BASE}/events?q=${encodeURIComponent(TITLE)}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
      await ap.waitForTimeout(3000)
      const link = await ap.evaluate(
        (t) => [...document.querySelectorAll('a')].find((a) => (a.innerText || '').includes(t))?.getAttribute('href') ?? null,
        TITLE,
      )
      if (link) {
        await ap.goto(BASE + link, { waitUntil: 'domcontentloaded', timeout: 60000 })
        await ap.waitForTimeout(3000)
        const canBuy = await ap.evaluate(() =>
          [...document.querySelectorAll('button,a')].some((b) => /get tickets|buy|select tickets|checkout/i.test(b.textContent || '')),
        )
        const buyerSees = await ap.evaluate(() => (document.querySelector('main')?.innerText || '').replace(/\s+/g, ' ').slice(0, 400))
        note(j, 'What a stranger sees on the paid event page', `a buy control: ${canBuy}\n      ${buyerSees}`)
        if (canBuy) {
          j.blockers.push(
            'a paid event published with NO Stripe account offers a buy control to strangers: ' +
              'the platform is selling tickets it cannot take money for',
          )
        }
        await ap.screenshot({ path: `${j.OUT}/stranger-on-unpayable-event.png`, fullPage: false })
      }
      await anon.close()
    }
  }

  // Where does the organiser go to fix it? The path has to exist and be findable.
  await page.goto(`${BASE}/dashboard/payouts`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(3000)
  const payouts = await describe(j, page, 'The payouts screen, where money gets connected')
  const hasConnect = payouts.buttons.concat(payouts.links).some((t) => /connect|set up|stripe|get paid|start/i.test(t))
  note(j, 'Is there a way to connect payouts from here?', hasConnect ? 'yes' : 'NO CONTROL OFFERED')
  if (!hasConnect) {
    j.blockers.push('the payouts screen offers no way to connect a payout account')
  }
} catch (err) {
  note(j, 'THREW', String(err).slice(0, 200))
  j.blockers.push(`threw: ${String(err).slice(0, 140)}`)
} finally {
  await finish(j)
  console.log(`identity: ${EMAIL} / ${PASSWORD}`)
  await browser.close()
}
