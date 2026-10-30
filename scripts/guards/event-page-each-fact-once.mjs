/**
 * THE EVENT PAGE STATES EACH FACT ONCE AND PROMISES ONLY OUR OWN TICKET. A build-failing guard (the PROJECT MANAGER's
 * 13:10 of 30 October 2026; the master checklist's L2, L6, M18 and M28).
 *
 * WHY THIS EXISTS. Production's event detail page read the date three times (the hero, the When card, Know before you
 * go), the address three times and more (the Where card, Know before you go, the map card twice), the refund twice (the
 * Refund policy block, Know before you go) and the ticket button twice (the hero only jumped to the panel's identical
 * button). Worse, Kate Ceberano's night at Geelong Arts Centre, sold on geelongartscentre.org.au with no ticket type
 * here, promised 'Your QR ticket lives in your email', 'Cancelled events are refunded automatically' and 'The booking
 * fee is not returned': three sentences about a ticket EventLinqs never issues. Each block was written alone and none
 * asked who sells the ticket.
 *
 * WHAT IT HOLDS, reading the source (each clause drilled red on main 985be4de):
 *   1. the page formats the night's start once (formatDateTime(event.start_date ...) exactly once);
 *   2. Know before you go is handed no date and no address, and its own file writes no When row, no Getting there row
 *      and no refund sentence, and its QR sentence sits behind `if (qrTicket)`;
 *   3. the event page draws the venue map `bare`, so the map card does not print the address the Where card prints;
 *   4. the Refund policy block and the trust row render only behind the promise gate (src/lib/events/event-page-promises.ts,
 *      which reads cta.ts's ticketingByEventLinqs);
 *   5. on an outside night the hero carries the one booking link and the panel is told so (bookingInHero).
 *
 * WHAT IT CANNOT SEE: a fact restated through a component it does not name. It names the blocks that repeated on
 * production rather than guessing at every way a sentence could be written twice.
 *
 * Run: node scripts/guards/event-page-each-fact-once.mjs
 */
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { declareWork } from '../lib/work-report.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')
const TAG = '[event-page-each-fact-once]'

const PAGE = 'src/app/events/[slug]/page.tsx'
const KNOW = 'src/components/features/events/know-before-you-go.tsx'
const PANEL = 'src/components/events/external-tickets-panel.tsx'
const GATE = 'src/lib/events/event-page-promises.ts'

const faults = []
const read = {}
for (const rel of [PAGE, KNOW, PANEL, GATE]) {
  try {
    read[rel] = readFileSync(join(ROOT, rel), 'utf8')
  } catch (err) {
    faults.push(`${rel} could not be read (${err.code ?? err.message}); a guard that read less than its files cannot pass`)
  }
}

/** Every index of `needle` in `text`. */
function indexesOf(text, needle) {
  const out = []
  for (let i = text.indexOf(needle); i !== -1; i = text.indexOf(needle, i + 1)) out.push(i)
  return out
}

/** The JSX element opened at `at`, up to its first `/>` or `>` that closes the opening tag. */
function openingTag(text, at) {
  const end = text.indexOf('/>', at)
  return end === -1 ? text.slice(at) : text.slice(at, end)
}

/** True when `gate` is written in the `span` characters before `at` (the `{gate && (` that opens the block). */
function gatedBy(text, at, gate, span = 400) {
  return text.slice(Math.max(0, at - span), at).includes(gate)
}

const page = read[PAGE]
const know = read[KNOW]
const panel = read[PANEL]

if (page) {
  // 1. The start, once.
  const starts = indexesOf(page, 'formatDateTime(event.start_date')
  if (starts.length !== 1) faults.push(`${PAGE} formats the start ${starts.length} times; the hero states it once`)

  // 2. Know before you go is handed no date and no address.
  for (const at of indexesOf(page, '<KnowBeforeYouGo')) {
    const tag = openingTag(page, at)
    for (const prop of ['startLabel', 'fullAddress', 'venueName', 'timezone']) {
      if (tag.includes(`${prop}=`)) faults.push(`${PAGE} hands Know before you go ${prop}, a fact the page already states`)
    }
  }

  // 3. The map on the event page is drawn bare.
  for (const at of indexesOf(page, '<VenueMapLazy')) {
    if (!/\bbare\b/.test(openingTag(page, at))) faults.push(`${PAGE} draws the venue map with its own address; pass bare`)
  }

  // 4. The refund block and the trust row only behind the promise gate.
  for (const fn of ['describeRefundPolicy(', 'refundPolicyBadge(']) {
    for (const at of indexesOf(page, fn)) {
      if (!gatedBy(page, at, 'promises.refundPolicy', 900)) faults.push(`${PAGE} calls ${fn.slice(0, -1)} outside promises.refundPolicy`)
    }
  }
  for (const at of indexesOf(page, '<EventTrustSignals')) {
    if (!gatedBy(page, at, 'promises.trustSignals', 200)) faults.push(`${PAGE} renders the trust row outside promises.trustSignals`)
  }
  if (!page.includes('eventPagePromises(')) faults.push(`${PAGE} never asks eventPagePromises who sells the ticket`)

  // 5. One booking button on an outside night.
  if (!/data-booking-button/.test(page)) faults.push(`${PAGE} has no booking link in the hero for an outside night`)
  if (!/bookingInHero=\{/.test(page)) faults.push(`${PAGE} never tells the outside panel the hero carries its button`)
  if (!/bookingHref=\{/.test(page)) faults.push(`${PAGE} never sends the sticky bar to the booking link`)
}

if (know) {
  if (/label:\s*'When'/.test(know)) faults.push(`${KNOW} writes a When row; the hero states the date`)
  if (/Getting there|Open in Maps/.test(know)) faults.push(`${KNOW} writes the address; the Where card states it`)
  if (/refund/i.test(know)) faults.push(`${KNOW} writes a refund sentence; the Refund policy block is the one`)
  for (const at of indexesOf(know, 'QR')) {
    if (!gatedBy(know, at, 'if (qrTicket)', 300)) faults.push(`${KNOW} promises a QR ticket outside if (qrTicket)`)
  }
}

if (panel && !/bookingInHero/.test(panel)) faults.push(`${PANEL} cannot leave its button to the hero (no bookingInHero)`)

console.log(`${TAG} read ${Object.keys(read).length} of 4 file(s): ${PAGE}, ${KNOW}, ${PANEL}, ${GATE}`)

if (faults.length > 0) {
  console.error('')
  console.error(`${TAG} FAIL - ${faults.length} fault(s):`)
  for (const f of faults) console.error(`    ${f}`)
  console.error('')
  console.error('  Production read the date three times, the address three times, the refund twice and the')
  console.error('  ticket button twice, and an outside night promised a QR ticket, automatic refunds and our')
  console.error('  booking fee. State each fact once; promise the ticket only where EventLinqs issues it.')
  process.exit(1)
}

declareWork('event-page-each-fact-once', {
  did: { 'file read': Object.keys(read).length, 'clause checked': 5 },
  found: { fault: 0 },
  zeroIsFine: { fault: 'an event page that states each fact once and promises only our own ticket is the goal state' },
  exitOnZero: false,
})

console.log(`${TAG} PASS - each fact once; the QR, refund and trust promises only where EventLinqs issues the ticket.`)
process.exit(0)
