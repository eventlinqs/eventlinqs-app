/**
 * ONE SOURCE OF TRUTH FOR SELLABILITY, AND NEVER A LIVE BUTTON BESIDE A REFUSAL.
 *
 * THE OUTAGE THIS GUARDS, 18 August 2026. Every paid event on production refused
 * to sell. The buyer was shown "Tickets for this event are not on sale yet"
 * directly above an enabled, priced, clickable "Checkout AUD 2.03". The founder
 * believed the button, went looking for the sale window it named, and spent
 * hours editing a field that does not exist in this codebase.
 *
 * The cause was none of the things the message suggested. `events.
 * external_ticket_url` did not exist on production because 20260815000001 had
 * not been applied. The reservation guard names that column in a select, so
 * PostgREST failed the whole request, the call site destructured only `data`,
 * and the discarded error became a null event. A null event meant the
 * organisation was never read, and a null organisation is correctly refused.
 *
 * THREE PROPERTIES ARE PINNED HERE, each of which was violated that night:
 *
 *   A. A SALE-GATE READ MAY NOT DISCARD ITS ERROR. A failed read and a refused
 *      sale are different events, and collapsing them turns a schema problem
 *      into a business answer that sends a human to the wrong screen.
 *   B. A CHECKOUT CONTROL MUST BE DISARMED BY THE REFUSAL. Not accompanied by a
 *      sentence: disarmed. This is Law 5's dead-end class arriving on the money
 *      path, where it is worst.
 *   C. SELLABILITY IS DECIDED IN ONE PLACE. A surface that re-derives the
 *      five-field rule inline is a second source that will drift, and the drift
 *      is invisible because both answers look reasonable.
 *
 * WHAT IT CANNOT SEE, stated plainly rather than implied. It reads source text.
 * It cannot prove a NEW checkout surface written tomorrow consults the gate at
 * all, and it cannot evaluate a predicate's runtime truth. It pins the shapes
 * that failed. The behavioural cover is
 * tests/unit/payments/sale-refusal-truthfulness.test.ts.
 *
 * IT PRINTS WHAT IT SCANNED, on every run, passing or failing. A guard that can
 * pass while reading nothing is worse than no guard, because it reports safety
 * it never checked. Three times on this project a file that failed to collect
 * was reported as zero failures. The counts below are how you tell a real pass
 * from an empty one.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const SRC = join(ROOT, 'src')

const failures = []
const notes = []

/** Every .ts / .tsx under src, so the scan counts are real numbers. */
function walk(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const st = statSync(full)
    if (st.isDirectory()) walk(full, acc)
    else if (/\.tsx?$/.test(entry)) acc.push(full)
  }
  return acc
}

const files = walk(SRC)
const rel = (f) => relative(ROOT, f).replace(/\\/g, '/')

console.log(`[one-sellability-source] scanned ${files.length} TypeScript file(s) under src`)

/* ===========================================================================
 * A. A SALE-GATE READ MAY NOT DISCARD ITS ERROR.
 * ========================================================================= */
const GATE_TABLES = ['events', 'organisations']
let gateReadsChecked = 0

for (const file of files) {
  const src = readFileSync(file, 'utf8')
  // Only files that actually participate in the sale decision.
  if (!/sale-status|ticketsOnSale|isOrganiserSellable/.test(src)) continue

  for (const table of GATE_TABLES) {
    // A supabase read of a gate table, capturing how it was destructured.
    const pattern = new RegExp(
      String.raw`const\s*\{([^}]*)\}\s*=\s*await\s+\w+[\s\S]{0,80}?\.from\(['"]${table}['"]\)`,
      'g',
    )
    let m
    while ((m = pattern.exec(src)) !== null) {
      gateReadsChecked += 1
      const destructured = m[1]
      // A read that takes data but not error is the exact outage shape.
      if (/\bdata\b/.test(destructured) && !/\berror\b/.test(destructured)) {
        failures.push(
          `${rel(file)}: a read of "${table}" feeding the sale gate destructures data but NOT error. ` +
            `A failed read then arrives as a null row and is reported to a human as a refused sale. ` +
            `This is the exact shape that refused every paid event on production on 18 August 2026.`,
        )
      }
    }
  }
}

console.log(
  `[one-sellability-source] checked ${gateReadsChecked} sale-gate table read(s) for a discarded error`,
)
if (gateReadsChecked === 0) {
  failures.push(
    'the error-discard check matched ZERO sale-gate reads. Either the gate moved or this ' +
      'guard has gone blind; both are failures, because a guard that reads nothing passes everything.',
  )
}

/* ===========================================================================
 * B. A CHECKOUT CONTROL MUST BE DISARMED BY THE REFUSAL.
 * ========================================================================= */
let checkoutControls = 0

for (const file of files) {
  const src = readFileSync(file, 'utf8')
  if (!/createReservation\(/.test(src)) continue
  // The module that DEFINES the action is the server half. It renders nothing,
  // so it has no control to disarm; it is covered by check A instead.
  if (/export async function createReservation\(/.test(src)) continue

  // The control that starts a paid checkout.
  const handlerName = /onClick=\{(\w+)\}/.exec(src)?.[1] ?? null
  const disabledPredicates = [...src.matchAll(/disabled=\{([^}]*)\}/g)].map((m) => m[1])
  const submitControls = disabledPredicates.filter((p) => /totalTickets|isPending/.test(p))

  for (const predicate of submitControls) {
    checkoutControls += 1
    if (!/refusal|saleBlocked|notOnSale|refused/i.test(predicate)) {
      failures.push(
        `${rel(file)}: a checkout control is disabled by "${predicate.trim()}", which does not ` +
          `include the sale refusal. A server refusal therefore leaves a live, priced checkout ` +
          `button sitting beside the message that refuses it.`,
      )
    }
  }

  // The refusal must also LATCH: the server's verdict at click time is
  // authoritative, and printing its prose beside a live control is not enough.
  if (/result\.error/.test(src) && !/result\.reason/.test(src)) {
    failures.push(
      `${rel(file)}: this surface renders a reservation error but never reads result.reason, ` +
        `so a sellability refusal is shown as text while the checkout stays offered.`,
    )
  }
  if (handlerName) notes.push(`${rel(file)}: checkout handler ${handlerName}`)
}

console.log(
  `[one-sellability-source] checked ${checkoutControls} checkout control predicate(s) across ${notes.length} checkout surface(s)`,
)
for (const n of notes) console.log(`    ${n}`)
if (checkoutControls === 0) {
  failures.push(
    'the checkout-control check matched ZERO controls. The money path cannot have no ' +
      'checkout button, so this guard is no longer looking where the button is.',
  )
}

/* ===========================================================================
 * C. SELLABILITY IS DECIDED IN ONE PLACE.
 * ========================================================================= */
const FIVE_FIELDS = [
  'stripe_account_id',
  'stripe_charges_enabled',
  'stripe_payouts_enabled',
  'stripe_account_country',
  'payout_status',
]
const SOURCE_OF_TRUTH = 'src/lib/payments/sale-status.ts'

/**
 * THE REVIEWED BASELINE. Every entry was read and judged, and the reason is
 * recorded beside it so the next person inherits the judgement rather than the
 * verdict. It is PRINTED on every run and an entry that stops matching anything
 * FAILS the guard, so this list cannot rot into an unexamined allowlist.
 *
 * A file is here because it inspects these columns for a DIFFERENT question than
 * "may this buyer check out right now". None of them is a second copy of the
 * buyer gate.
 */
const REVIEWED = new Map([
  [
    SOURCE_OF_TRUTH,
    'the source of truth itself',
  ],
  [
    'src/lib/payments/application-fee.ts',
    'the CHARGE precondition, the deliberate second half of the same rule; sale-status imports its currency map rather than copying it',
  ],
  [
    'src/lib/admin/organisers.ts',
    'admin display; the stripe_account_id test is a null check before a Stripe call, not a sale decision',
  ],
  [
    'src/lib/admin/venues.ts',
    'admin display; same null-check shape, no buyer-facing decision',
  ],
  [
    'src/lib/stripe/connect-divergence.ts',
    'the divergence detector, whose entire job is to compare what the platform believes with what Stripe says; inspecting these fields IS its function',
  ],
  [
    'src/lib/events/publish-gate.ts',
    'RESOLVED 19 August 2026 (founder ruling). It now reads ORG_SALE_FIELDS_SELECT and runs isOrganiserSellable, the predicate the sale gate itself uses, so it names these fields because it DELEGATES to that gate rather than re-deriving it. The former divergence admitted payout_status <> restricted where the sale gate requires = active, and ignored payouts_enabled and the country map, so an organiser on hold could publish a paid event that could never sell. tests/unit/events/publish-gate-matches-sale-gate.test.ts now enumerates all 96 column combinations and fails if the two verdicts ever disagree again.',
  ],
])

let rederivationSitesChecked = 0
const baselineHits = new Set()
for (const file of files) {
  const r = rel(file)
  if (REVIEWED.has(r)) {
    baselineHits.add(r)
    continue
  }
  const src = readFileSync(file, 'utf8')
  // A SELECT listing the columns is how a caller correctly feeds the gate, and
  // is not a re-derivation. A comparison against them in a conditional is.
  const decidesInline = FIVE_FIELDS.filter((f) =>
    new RegExp(String.raw`(if\s*\(|&&|\|\|)[^\n]*\b${f}\b`).test(src),
  )
  rederivationSitesChecked += 1
  if (decidesInline.length >= 2) {
    failures.push(
      `${r}: decides sellability inline on ${decidesInline.join(', ')} instead of calling ` +
        `ticketsOnSaleDetailed. A second copy of this rule drifts from the charge precondition, ` +
        `and the drift strands a buyer at the payment step with the button still enabled.`,
    )
  }
}
console.log(
  `[one-sellability-source] checked ${rederivationSitesChecked} file(s) for an inline re-derivation of the five-field rule`,
)
console.log(
  `[one-sellability-source] reviewed baseline, ${REVIEWED.size} entr(ies), printed so it cannot rot:`,
)
for (const [entry, reason] of REVIEWED) {
  const present = baselineHits.has(entry)
  console.log(`    ${present ? 'still present' : 'MISSING     '}  ${entry}`)
  console.log(`        ${reason}`)
  if (!present) {
    failures.push(
      `reviewed-baseline entry "${entry}" no longer matches any file. An allowlist entry that ` +
        `stops matching is either a stale exemption or a file that moved, and both must be ` +
        `re-judged rather than left in the list.`,
    )
  }
}

/* ========================================================================= */
if (failures.length > 0) {
  console.error(
    `\n[one-sellability-source] FAILED. ${failures.length} way(s) the platform can refuse a sale ` +
      `without saying so honestly, or offer one it will refuse.\n`,
  )
  for (const f of failures) console.error(`    ${f}\n`)
  process.exit(1)
}

console.log('[one-sellability-source] PASS - one sellability rule, no live button beside a refusal.')
