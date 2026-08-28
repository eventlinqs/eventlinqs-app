/**
 * JOURNEY 6: the door.
 *
 * An organiser stands at the entrance with a phone and admits a real ticket,
 * then tries to admit the SAME ticket again. Admit-once is the one rule at a
 * door that cannot be got wrong: a ticket that scans twice is a ticket sold
 * twice, and the second person through the door paid nothing.
 *
 * The second scan must be REFUSED and must say WHY, because the person holding
 * the phone has a queue behind them and no time to guess.
 *
 * Usage: node scripts/journeys/j6.mjs <ticketCode> <secret> <eventId>
 */
import { chromium, BASE, makeJourney, note, attach, describe, finish, messagesOnScreen, fillIf } from './harness.mjs'

const [, , CODE, SECRET, EVENT_ID] = process.argv
if (!CODE || !EVENT_ID) {
  console.error('usage: node scripts/journeys/j6.mjs <ticketCode> <secret> <eventId>')
  process.exit(2)
}

const j = makeJourney('j6-door', 'Journey 6: admitting a ticket, once')
const browser = await chromium.launch()
const ctx = await browser.newContext({
  storageState: '.auth/organiser.json',
  viewport: { width: 1440, height: 1000 },
  locale: 'en-AU',
})
const page = await ctx.newPage()
await attach(j, page)

async function scan(label) {
  await page.goto(`${BASE}/scan/${EVENT_ID}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(3500)
  const landed = new URL(page.url()).pathname
  if (!landed.startsWith('/scan')) {
    return { landed, refusedEntry: true, shown: await messagesOnScreen(page) }
  }
  await fillIf(page, 'input[aria-label*="Ticket code" i]', CODE)
  if (SECRET) await fillIf(page, 'input[aria-label="Ticket key"]', SECRET)
  await page.waitForTimeout(600)
  for (const b of await page.$$('button')) {
    const t = ((await b.innerText().catch(() => '')) || '').trim()
    if (/^(check|admit|scan|submit|look)/i.test(t) && (await b.isVisible().catch(() => false))) {
      await b.click().catch(() => {})
      break
    }
  }
  /*
   * READ THE VERDICT WHILE IT IS ON SCREEN. The door shows ADMIT or its refusal
   * within about 400ms and CLEARS IT AFTER ROUGHLY FIVE SECONDS, which is right
   * for a queue: the next person steps up to a clean screen. Waiting six seconds
   * and then reading found an empty page and nearly reported a door that admits
   * silently, on a scan the database proves had happened.
   */
  let verdict = ''
  const started = Date.now()
  while (Date.now() - started < 5000) {
    const t = await page.evaluate(() => (document.body.innerText || '').replace(/\s+/g, ' '))
    const extra = t.replace('Skip to main content Door check-in', '').replace('Manual entry Check in', '').trim()
    if (extra && !/^Lineup|^Door check-in/.test(extra.replace(/^[^A-Za-z]*/, '')) === false) {
      // keep the richest reading seen
      if (extra.length > verdict.length) verdict = extra
    }
    if (/ADMIT|ALREADY|REFUS|NOT VALID|VOID|REFUND/i.test(extra)) {
      verdict = extra
      break
    }
    await page.waitForTimeout(300)
  }
  const shown = await messagesOnScreen(page)
  /*
   * Read the WHOLE document, not <main>. The scanner renders its verdict in a
   * fixed overlay outside main, so reading main reported "no message" on a scan
   * the database proves had happened, and nearly went in the report as a silent
   * door.
   */
  const body = verdict || (await page.evaluate(() => (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 400)))
  await page.screenshot({ path: `${j.OUT}/${label}.png`, fullPage: true }).catch(() => {})
  return { landed, shown, body }
}

try {
  const first = await scan('first-scan')
  if (first.refusedEntry) {
    j.blockers.push(`the organiser cannot open the scanner: landed ${first.landed}`)
    throw new Error('no scanner')
  }
  await describe(j, page, 'The door, after the first scan')
  note(j, 'FIRST scan', `${first.shown.join(' // ') || 'no message'}\n      ${first.body.slice(0, 200)}`)

  // The door says ADMIT and REJECT, in those words.
  // The verdict renders as one run of text, e.g. "ADMITRefund Tester", so no
  // word boundary: ADMIT is followed immediately by the holder name.
  const admitted = /ADMIT/i.test(`${first.shown.join(' ')} ${first.body}`)
  if (!admitted) {
    j.blockers.push(`a valid ticket was not clearly admitted on the first scan: ${first.shown.join(' // ') || first.body.slice(0, 140)}`)
  }

  // ── THE SAME TICKET, AGAIN ────────────────────────────────────────────────
  const second = await scan('second-scan')
  note(j, 'SECOND scan of the same ticket', `${second.shown.join(' // ') || 'no message'}\n      ${second.body.slice(0, 200)}`)
  const said = `${second.shown.join(' ')} ${second.body}`
  const refused = /already|again|used|checked in|scanned|not valid|refus/i.test(said)
  const saysWhen = /\d{1,2}[:.]\d{2}|ago|earlier|at /i.test(said)

  if (!refused) {
    j.blockers.push(
      `ADMIT-ONCE FAILED: the same ticket scanned twice and the second scan was not refused. Said: ${said.slice(0, 180)}`,
    )
  } else {
    note(j, 'The second scan was refused', said.slice(0, 200))
    note(j, 'Does it say WHEN it was first used?', saysWhen ? 'yes' : 'no time given')
    if (!saysWhen) {
      // Not a blocker: a refusal that names the cause is the bar. Knowing WHEN
      // is what settles an argument at the door, so it is worth recording.
      j.unclear.push('the second-scan refusal does not say when the ticket was first admitted')
    }
  }
} catch (err) {
  note(j, 'THREW', String(err).slice(0, 200))
  j.blockers.push(`threw: ${String(err).slice(0, 140)}`)
} finally {
  await finish(j)
  await browser.close()
}
