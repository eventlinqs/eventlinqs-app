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
 * Usage: node scripts/journeys/j6.mjs [ticketCode] [secret] [eventId]
 *
 * With no arguments it FINDS a ticket to admit for itself, so that a runner
 * which cannot know a ticket code can still drive this journey. See below.
 */
import { chromium, BASE, makeJourney, note, attach, describe, finish, messagesOnScreen, fillIf } from './harness.mjs'
import { createClient } from '@supabase/supabase-js'
import { assertNotProduction } from '../lib/production-write-preflight.mjs'

/*
 * SELF PROVISION WHEN NOTHING IS PASSED IN.
 *
 * WHY, 3 September 2026. This journey required three arguments, a ticket code,
 * its secret and an event id. No generic runner can know those, so when the
 * sweep ran the whole set, j6 exited(2) in under a second and reported nothing.
 * The door, which is the one place where a mistake means a stranger walks in on
 * somebody else's ticket, was the single journey never actually driven.
 *
 * Explicit arguments still win, so an operator can aim it at one exact ticket.
 * With none, it finds a valid unscanned ticket for itself.
 *
 * WHY THIS REFUSES ON PRODUCTION. Scanning CONSUMES a ticket: it sets
 * first_scanned_at, and the second scan of that pair is then refused forever.
 * Picking a ticket at random out of the production database would burn a real
 * customer's admission to a real event, and .env.local in this repository points
 * at production deliberately. So the discovery path calls assertNotProduction()
 * before it reads anything, and only ever selects a ticket on a SEED event.
 * An explicitly supplied ticket is left alone: that is an operator's decision.
 */
let [, , CODE, SECRET, EVENT_ID] = process.argv
const SELF_PROVISION = !CODE || !EVENT_ID

/**
 * Find a ticket this organiser is actually allowed to admit.
 *
 * It reads the organiser's OWN event list from the dashboard first, using the
 * saved session, and only then looks for a ticket on one of those events. An
 * earlier version picked any seed ticket and hit "You do not have permission to
 * scan tickets for this event", which is the product being correct and the
 * harness being wrong: a door journey has to stand at a door it owns.
 */
async function discoverTicket(page) {
  await page.goto(`${BASE}/dashboard/events`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(2500)
  const ids = await page.evaluate(() =>
    [...new Set(
      [...document.querySelectorAll('a[href*="/dashboard/events/"]')]
        .map((a) => (a.getAttribute('href') || '').match(/\/dashboard\/events\/([0-9a-f-]{36})/)?.[1])
        .filter(Boolean),
    )],
  )
  if (ids.length === 0) return { error: 'the saved organiser session owns no events on this server' }

  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  const { data, error } = await db
    .from('tickets')
    .select('ticket_code, secret, event_id, status, first_scanned_at')
    .eq('status', 'valid')
    .is('first_scanned_at', null)
    .in('event_id', ids)
    .limit(1)
    .maybeSingle()

  if (error) return { error: `could not look for a ticket: ${error.message}` }
  if (!data) return { error: `none of the ${ids.length} event(s) this organiser owns has an unscanned valid ticket` }
  return { ticket: data }
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

if (SELF_PROVISION) {
  /* Scanning CONSUMES a ticket: it sets first_scanned_at and every later scan of
   * that pair is refused. Choosing one at random out of PRODUCTION would burn a
   * real customer's admission, and .env.local here points at production on
   * purpose, so discovery refuses there. An explicitly supplied ticket is left
   * alone: that is an operator's decision, not a guess. */
  assertNotProduction()
  const found = await discoverTicket(page)
  if (found.error) {
    console.error(`j6: ${found.error}.`)
    console.error('    Pass one explicitly: node scripts/journeys/j6.mjs <ticketCode> <secret> <eventId>')
    await browser.close()
    process.exit(2)
  }
  CODE = found.ticket.ticket_code
  SECRET = found.ticket.secret
  EVENT_ID = found.ticket.event_id
  console.log(`j6: admitting ${CODE} on event ${EVENT_ID}, chosen from this organiser's own events`)
}

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
