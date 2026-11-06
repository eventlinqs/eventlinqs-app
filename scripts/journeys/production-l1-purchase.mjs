/**
 * LAUNCH READINESS ROWS 9 TO 12 ON PRODUCTION: PREPARED, NOT RUN (the CONTROLLER's 23:42 item 6 and his 23:49 spend limit,
 * 6 November 2026). It runs only after a CONTROLLER line quotes Lawal's yes, and refuses without it.
 *
 *   node scripts/journeys/production-l1-purchase.mjs --yes "<the CONTROLLER line quoting Lawal's yes>" \
 *     --slug <the test event's slug> --title "<the test event's exact title>" --out <evidence folder>
 *
 * THE SPEND LIMIT, held here, never trusted to the operator: the test event's one ticket is A$2.00; the script refuses to go
 * on if the page is not the named test event (its title read on the page), if the ticket shown is not A$2.00, or if the all
 * in total read at ticket selection OR at checkout is above A$5.00; ONE ticket, ONE purchase. Stripe's own page
 * (stripe.com/au/pricing, read by the CONTROLLER on 6 November): '1.65% + A$0.30' for domestic cards, and 'The payment
 * processing, Connect and currency conversion fees from the original transaction are not returned', so the cost is about
 * A$0.33 from EventLinqs' Stripe balance and nothing from the card once the refund lands.
 *
 * THE CARD IS LAWAL'S OWN HAND: the browser is headed, the script stops at the card form and waits (15 minutes at most) for
 * a person to type the card and pay. Nothing here types a card number.
 *
 * ROW 9: the confirmation page, the ticket at /account/tickets (the buyer signed in first, by hand) and at /t/[code].
 * ROW 10: the order refunded from /dashboard/events/[id]/refunds by the organiser (signed in by hand in the second window);
 *   the script then reads the ticket as voided. The confirmation and refund emails are read in the inbox by the person.
 * ROW 11, squad and waitlist, and ROW 12, the door scan: the script prints each step and reads each result, the person
 *   taps; the existing journeys (scripts/journeys/j7-j10.mjs, b1-offline-door.mjs, b2-live-doors.mjs) are their TEST form.
 *
 * Evidence: every step's note, the totals read, screenshots, into --out.
 */
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createInterface } from 'node:readline/promises'

const PRODUCTION = 'https://www.eventlinqs.com.au'
const TICKET_CENTS = 200
const MOST_TOTAL_CENTS = 500
const args = process.argv.slice(2)
const argOf = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined)
const YES = argOf('--yes')
const SLUG = argOf('--slug')
const TITLE = argOf('--title')
const OUT = argOf('--out')
const BASE = (process.env.BASE ?? PRODUCTION).replace(/\/$/, '')

function refuse(why) {
  console.error(`REFUSED, nothing bought: ${why}`)
  process.exit(2)
}
if (!YES || !/CONTROLLER/.test(YES) || !/Lawal/.test(YES) || !/yes/i.test(YES)) refuse("--yes must carry the CONTROLLER line that quotes Lawal's yes")
if (BASE !== PRODUCTION) refuse(`this script is for production only (${PRODUCTION}); the TEST forms are scripts/journeys/j3.mjs and j4.mjs`)
if (!SLUG || !TITLE || !OUT) refuse('--slug, --title and --out are all required')
mkdirSync(OUT, { recursive: true })

const notes = []
const note = (step, detail) => {
  const line = `${new Date().toISOString()} ${step}: ${detail}`
  notes.push(line)
  console.log(line)
  writeFileSync(join(OUT, 'notes.txt'), notes.join('\n') + '\n')
}
/** Dollars in the text as cents, every amount found ('AUD 2.65', '$2.00'). */
const amounts = (text) => [...text.matchAll(/(?:A\$|AUD\s?|\$)\s?(\d{1,4}(?:,\d{3})*(?:\.\d{2})?)/g)].map((m) => Math.round(Number(m[1].replace(/,/g, '')) * 100))
const ask = async (q) => {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const a = await rl.question(q)
  rl.close()
  return a.trim()
}

const browser = await chromium.launch({ headless: false })
const buyer = await browser.newContext({ viewport: { width: 1280, height: 900 } })
const page = await buyer.newPage()
const shot = (name) => page.screenshot({ path: join(OUT, `${name}.png`), fullPage: false }).catch(() => {})

try {
  // 0. The buyer signs in by hand, so the ticket lands in an account (row 9's /account/tickets).
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await ask('Sign in as the BUYER in the browser window, then press Enter here: ')
  note('buyer signed in', page.url())

  // 1. The named test event, and nothing else.
  const res = await page.goto(`${BASE}/events/${SLUG}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(2500)
  const h1 = ((await page.locator('h1').first().innerText().catch(() => '')) || '').trim()
  note('the event page', `HTTP ${res?.status()} title '${h1}'`)
  if (h1 !== TITLE) refuse(`the page's title is '${h1}', not the named test event '${TITLE}'`)
  const main = async () => (await page.locator('main').innerText().catch(() => '')).replace(/\s+/g, ' ')
  if (!amounts(await main()).includes(TICKET_CENTS)) refuse('the event page shows no A$2.00 ticket')
  await shot('1-event')

  // 2. One ticket, and the all in total read at selection.
  const buy = page.getByRole('button', { name: /^(get tickets|buy tickets|select tickets|book now)/i }).first()
  await buy.click()
  await page.waitForTimeout(3000)
  const plus = page.locator('button[aria-label*="ncrease" i], button[aria-label*="add" i]').first()
  await plus.click()
  await page.waitForTimeout(2000)
  const cta = page.getByRole('button', { name: /^checkout\b/i }).first()
  const ctaText = (await cta.innerText().catch(() => '')) || ''
  const selTotal = Math.max(0, ...amounts(ctaText))
  note('all in total at selection', `${ctaText.replace(/\s+/g, ' ')} -> ${selTotal} cents`)
  if (!selTotal || selTotal > MOST_TOTAL_CENTS) refuse(`the total at selection is ${selTotal} cents, above the A$5.00 limit or unread`)
  await shot('2-selection')
  await cta.click()
  await page.waitForTimeout(5000)

  // 3. Checkout: the total read again before any card; then the person pays.
  const coText = await main()
  const coTotal = Math.max(0, ...amounts(coText.match(/total[^$A]{0,40}(?:A\$|AUD|\$)\s?[\d.,]+/i)?.[0] ?? coText))
  note('all in total at checkout', `${coTotal} cents`)
  if (!coTotal || coTotal > MOST_TOTAL_CENTS) refuse(`the total at checkout is ${coTotal} cents, above the A$5.00 limit or unread`)
  await shot('3-checkout')
  note('STOPPED AT THE CARD FORM', "Lawal's own card, typed by him in the browser window; the script waits up to 15 minutes")
  await page.waitForURL(/\/orders\/[^/]+\/confirmation/, { timeout: 15 * 60 * 1000 })
  const orderUrl = page.url()
  note('row 9: confirmation', orderUrl)
  await page.waitForTimeout(3000)
  await shot('4-confirmation')
  const ticketHref = await page.locator('a[href^="/t/"]').first().getAttribute('href').catch(() => null)

  // Row 9: the ticket in the account and at its own address.
  await page.goto(`${BASE}/account/tickets`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2500)
  note('row 9: /account/tickets', (await main()).includes(TITLE) ? `holds '${TITLE}'` : `DOES NOT SHOW '${TITLE}'`)
  await shot('5-account-tickets')
  if (ticketHref) {
    const t = await page.goto(`${BASE}${ticketHref}`, { waitUntil: 'domcontentloaded' })
    note('row 9: the ticket page', `HTTP ${t?.status()} ${ticketHref}`)
    await shot('6-ticket')
  } else note('row 9: the ticket page', 'NO /t/ LINK ON THE CONFIRMATION')
  await ask('Read the confirmation email in the buyer inbox (row 9), then press Enter: ')

  // Row 10: the refund, by the organiser, in a second window.
  const organiser = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const op = await organiser.newPage()
  await op.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await ask(`Sign in as the test event's ORGANISER in the new window, open the event's Refunds page, refund the order ${orderUrl.split('/orders/')[1]?.split('/')[0] ?? ''} in full, then press Enter: `)
  note('row 10: refund pressed', op.url())
  if (ticketHref) {
    await page.goto(`${BASE}${ticketHref}`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2500)
    const words = await main()
    note('row 10: the ticket after the refund', /refunded|voided|no longer/i.test(words) ? 'reads refunded or voided' : `READS: ${words.slice(0, 160)}`)
    await shot('7-ticket-after-refund')
  }
  await ask('Read the refund email and the card statement line when it lands (row 10), then press Enter: ')

  // Rows 11 and 12: each step printed, the person taps, the script reads.
  note('row 11', 'squad: from the test event page, start a squad and invite a second address; waitlist: join the sold out tier. The TEST form: scripts/journeys/j7-j10.mjs')
  await ask('Do row 11 in the buyer window, then press Enter: ')
  await shot('8-row-11')
  note('row 12', 'the door: open /scan/<eventId> as the organiser, scan the issued ticket once (validates), again (refused), then offline and a second scanner. The TEST forms: b1-offline-door.mjs, b2-live-doors.mjs')
  await ask('Do row 12 in the organiser window, then press Enter: ')
  await op.screenshot({ path: join(OUT, '9-row-12.png') }).catch(() => {})
  note('done', `evidence in ${OUT}`)
} catch (err) {
  note('STOPPED', String(err).slice(0, 300))
  process.exitCode = 1
} finally {
  await browser.close()
}
