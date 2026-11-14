/**
 * THE ORGANISER'S MONEY REACHES THE ORGANISER, AND THE FEE NEVER DECIDES IT.
 *
 * Close-out MONEY FIX, part A. The governing principle is the item's own: "the
 * organiser's money belongs to the organiser and so does the news about it."
 *
 * WHAT THIS PLATFORM ACTUALLY DOES, because the clauses below are unreadable
 * without it. EventLinqs is the merchant of record
 * (docs/PAYMENTS-FUNDS-HOLDING.md): the buyer is charged on the PLATFORM
 * account, with no `transfer_data` and no `application_fee_amount`, and the
 * organiser is paid afterwards by a platform->connected Transfer. So the
 * destination is not a field on the PaymentIntent. It is the connected account
 * RESOLVED AND REQUIRED at charge time, which is what the later transfer is
 * built from. A guard that looked for `transfer_data` on the charge would be
 * checking for the wrong model and would pass while the money went nowhere.
 *
 * THE DEFECT THAT PUT CLAUSE THREE HERE (A1.7). The charge precondition refused
 * ANY zero platform fee as "calculator drift". A founding organiser inside their
 * fee-free window resolves to exactly zero, so every paid ticket for a
 * fee-waived organiser was refused at checkout with "There was a pricing issue
 * with this checkout", forever, and refreshing could not help. The organisers
 * the growth plan exists to recruit were the only ones who could not sell. The
 * fee decided whether money could move, which is precisely what clause three
 * forbids.
 *
 * WHAT IT CANNOT SEE, stated plainly so nobody reads more into a PASS than is
 * there: it reads source text. It pins the structure of the charge path that
 * exists. It cannot prove a charge creator written tomorrow consults anything,
 * and it does not test behaviour: tests/unit/payments/money-chain.test.ts does
 * that. Clause two covers the CHARGE-time refusal: since 14 November 2026
 * (sell first, Lawal's yes of 15:22) only a person's hold or an unsupported
 * currency, and never a missing connected account, which it now forbids.
 * Clause FIVE holds the publish gate to the same rule with no Stripe call.
 * Clause SIX is A4: once the organiser is connected, every ticket charge writes
 * down on the order where its money is owed, before the charge exists; until
 * then the organisation's ledger row is that record, and clause four's
 * reconciliation raises a P0 for any charge without one. Clause SEVEN: the
 * payout goes only to the organisation's own connected, active account. Clause four covers A3 layer three, the
 * daily settlement reconciliation, and covers its SHAPE only: that it exists,
 * is wired to the rule, refuses an unauthorised caller, repairs nothing, and
 * names the charge. Whether it finds anything is a question for the live
 * balance, which no guard can read.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

const failures = []
const passes = []

function read(rel) {
  const p = join(ROOT, rel)
  if (!existsSync(p)) {
    failures.push(`${rel}: file is missing entirely`)
    return null
  }
  return codeOnly(readFileSync(p, 'utf8'))
}

/**
 * Blanks out COMMENTS ONLY, preserving length so every index still points at
 * the same character of the original, and preserving string literals so the
 * named-reason checks below still find them.
 *
 * WHY IT EXISTS: the drill "the charge is created before anybody checks the
 * organiser can be paid" commented the precondition out, and the first version
 * of this guard PASSED, because `indexOf('assertOrganiserCanReceiveFunds(')`
 * happily found the call inside `// assertOrganiserCanReceiveFunds(...)`. A
 * guard that reads commented-out code as if it ran is not guarding anything,
 * and commenting a line out is the single most natural way to disable a check.
 *
 * Strings are SKIPPED rather than blanked, for two reasons: the clauses below
 * assert on reason literals like 'org_not_connected', and a `'https://...'` in
 * source would otherwise have its `//` read as the start of a comment and blank
 * the rest of the line.
 */
function codeOnly(src) {
  const out = src.split('')
  const blank = (from, to) => {
    for (let k = from; k < to && k < out.length; k += 1) if (out[k] !== '\n') out[k] = ' '
  }
  let i = 0
  while (i < src.length) {
    const ch = src[i]
    if (ch === '"' || ch === "'" || ch === '`') {
      let j = i + 1
      while (j < src.length) {
        if (src[j] === '\\') { j += 2; continue }
        if (src[j] === ch) break
        j += 1
      }
      i = j + 1
      continue
    }
    const two = src.slice(i, i + 2)
    if (two === '//') {
      const end = src.indexOf('\n', i)
      const stop = end === -1 ? src.length : end
      blank(i, stop)
      i = stop
      continue
    }
    if (two === '/*') {
      const end = src.indexOf('*/', i + 2)
      const stop = end === -1 ? src.length : end + 2
      blank(i, stop)
      i = stop
      continue
    }
    i += 1
  }
  return out.join('')
}

/** Every .ts/.tsx file under src/, so "anywhere" means anywhere. */
function sourceFiles(dir, acc = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) sourceFiles(full, acc)
    else if (/\.tsx?$/.test(entry.name)) acc.push(full)
  }
  return acc
}

// ── CLAUSE ONE ───────────────────────────────────────────────────────────────
// No ticket charge may be constructed anywhere without a destination connected
// account. Enforced as: the ONLY thing that creates a ticket PaymentIntent is
// createPlatformCharge, and it resolves the connected account and runs the
// precondition before it calls the gateway.

const CHARGE_CREATOR = 'src/lib/payments/create-platform-charge.ts'
const creator = read(CHARGE_CREATOR)

if (creator) {
  const preconditionAt = creator.indexOf('assertOrganiserCanTakeSales(')
  const gatewayAt = creator.indexOf('.createPaymentIntent(')

  if (preconditionAt === -1) {
    failures.push(
      `${CHARGE_CREATOR}: does not call assertOrganiserCanTakeSales, so a charge could be created for an organisation on hold or in a country we cannot settle in`,
    )
  } else if (gatewayAt === -1) {
    failures.push(`${CHARGE_CREATOR}: no createPaymentIntent call found; this guard is reading the wrong file`)
  } else if (preconditionAt > gatewayAt) {
    failures.push(
      `${CHARGE_CREATOR}: assertOrganiserCanTakeSales runs AFTER createPaymentIntent. The buyer would already have been charged before the platform checked the sale may be taken.`,
    )
  } else {
    passes.push('the one charge creator runs the take-sales precondition BEFORE it calls Stripe')
  }

  if (!/const connectedAccountId = org\.stripe_account_id/.test(creator)) {
    failures.push(
      `${CHARGE_CREATOR}: the connected account id is no longer resolved from the organisation row, so the later transfer has no destination to be built from`,
    )
  } else {
    passes.push('the charge resolves the destination connected account from the organisation row')
  }

  if (!/connectedAccountId,/.test(creator)) {
    failures.push(
      `${CHARGE_CREATOR}: the resolved connected account is not returned to the caller, so nothing downstream can record where the money is owed`,
    )
  } else {
    passes.push('the charge returns the destination connected account to its caller')
  }
}

// Nothing else may create a ticket PaymentIntent. The adapter is the one place
// allowed to call Stripe itself; every other caller must go through
// createPlatformCharge so the precondition cannot be skipped.
const ADAPTER = join('src', 'lib', 'payments', 'stripe-adapter.ts').replace(/\\/g, '/')
const intentCreators = []
for (const file of sourceFiles(join(ROOT, 'src'))) {
  const rel = relative(ROOT, file).replace(/\\/g, '/')
  if (rel === ADAPTER) continue
  const src = codeOnly(readFileSync(file, 'utf8'))
  if (/\bstripe\s*\.\s*paymentIntents\s*\.\s*create\s*\(/.test(src)) intentCreators.push(rel)
}
if (intentCreators.length > 0) {
  for (const rel of intentCreators) {
    failures.push(
      `${rel}: creates a Stripe PaymentIntent directly, bypassing createPlatformCharge and therefore the can-be-paid precondition`,
    )
  }
} else {
  passes.push('no source file outside the adapter creates a PaymentIntent directly')
}

// ── CLAUSE TWO ───────────────────────────────────────────────────────────────
// SELL FIRST (Lawal's yes, 15:22 on 14 November 2026: "you let organisers publish
// and sell straight away"). The charge refuses an organisation a person at
// EventLinqs has put on hold, and one whose sale has no settlement currency, each
// with its own named reason. It NEVER refuses for want of a connected account:
// the money is held until after the event and the payout waits for one (clause
// SEVEN). The old wall's three tests are named so they cannot come back quietly.

const PRECONDITION = 'src/lib/payments/application-fee.ts'
const precondition = read(PRECONDITION)

/** The precondition's own body, bounded at the next export so a neighbour's checks are never counted as its own. */
function preconditionBody() {
  const start = precondition.indexOf('export function assertOrganiserCanTakeSales(')
  if (start === -1) return ''
  const next = precondition.indexOf('\nexport ', start + 1)
  return precondition.slice(start, next === -1 ? undefined : next)
}

if (precondition) {
  const body = preconditionBody()
  if (!body) {
    failures.push(`${PRECONDITION}: assertOrganiserCanTakeSales is gone, so nothing refuses a sale for an organisation on hold`)
  }
  const required = [
    ["org.payout_status === 'on_hold'", 'org_on_hold'],
    ['getCurrencyForCountry(saleCountryOf(org))', 'org_country_unsupported'],
  ]
  for (const [check, reason] of required) {
    if (!body.includes(check)) {
      failures.push(
        `${PRECONDITION}: assertOrganiserCanTakeSales no longer tests \`${check}\`, so a sale could be taken that must be refused`,
      )
    } else if (!body.includes(`'${reason}'`)) {
      failures.push(
        `${PRECONDITION}: the \`${check}\` refusal no longer raises the named reason ${reason}, so the buyer gets a generic error and nobody can tell what is wrong`,
      )
    } else {
      passes.push(`a charge is refused with the named reason ${reason}`)
    }
  }
  const wall = ['!org.stripe_account_id', '!org.stripe_payouts_enabled', "org.payout_status !== 'active'"]
  const back = wall.filter((check) => body.includes(check))
  if (back.length > 0) {
    failures.push(
      `${PRECONDITION}: assertOrganiserCanTakeSales tests ${back.map((c) => `\`${c}\``).join(', ')} again, which is the wall Lawal removed on 14 November 2026: an organiser who has not connected payouts would be refused a sale the platform holds the money for.`,
    )
  } else {
    passes.push('a sale is never refused for want of a connected account (sell first)')
  }
}

// ── CLAUSE THREE ─────────────────────────────────────────────────────────────
// The routing decision may not depend on the fee amount. A waived fee is a
// legitimate zero and must not refuse the sale; an unexplained zero still must.

if (precondition) {
  const body = preconditionBody()

  if (/inclusiveKeep\s*<=\s*0/.test(body)) {
    failures.push(
      `${PRECONDITION}: assertOrganiserCanTakeSales refuses on \`inclusiveKeep <= 0\`, which refuses a DELIBERATELY WAIVED fee. That is the A1.7 defect: every paid ticket for a founding organiser is refused at checkout.`,
    )
  } else {
    passes.push('a zero platform fee is not refused on the amount alone')
  }

  if (!/inclusiveKeep === 0 && !fees\.fee_waived/.test(body)) {
    failures.push(
      `${PRECONDITION}: the zero-fee refusal no longer consults fees.fee_waived, so either a waived organiser cannot sell or an unexplained zero fee sells at a silent zero take-rate`,
    )
  } else {
    passes.push('a zero platform fee is refused only when no waiver explains it')
  }

  if (!/inclusiveKeep\s*<\s*0/.test(body)) {
    failures.push(
      `${PRECONDITION}: nothing refuses a NEGATIVE platform fee, so the platform could pay the buyer to attend`,
    )
  } else {
    passes.push('a negative platform fee is still refused')
  }
}

// The flag must be a FACT carried on the breakdown the charge is built from,
// read from the same waiver that zeroed the rates. A second lookup would be a
// second source of truth and the two could disagree.
const CALCULATOR = 'src/lib/payments/payment-calculator.ts'
const calculator = read(CALCULATOR)
if (calculator) {
  if (!/fee_waived:\s*waiver\.active/.test(calculator)) {
    failures.push(
      `${CALCULATOR}: the breakdown does not set fee_waived from waiver.active, so the flag and the zeroed rates can drift apart and the precondition is deciding on a stale fact`,
    )
  } else {
    passes.push('the breakdown records the waiver from the same source that zeroed the rates')
  }

  if (!/fee_waived:\s*false/.test(calculator)) {
    failures.push(
      `${CALCULATOR}: the free-cart breakdown does not declare fee_waived, so a zero-total cart would carry an undefined waiver state into the charge precondition`,
    )
  } else {
    passes.push('the free-cart breakdown declares fee_waived explicitly')
  }
}

// -- CLAUSE FOUR ------------------------------------------------------------
// A3 LAYER THREE. THE DAILY SETTLEMENT RECONCILIATION IS REAL, READ ONLY, AND
// NAMES THE MONEY.
//
// WHY A GUARD AND NOT ONLY A TEST. This reconciliation is the only thing that
// would notice the MKLStudios condition happening again, and it is a SCHEDULED
// job, which is the one kind of code whose absence is silent: a route nobody
// invokes emits no error and passes every test that calls it directly. The unit
// tests prove the rule. They cannot prove the rule is still wired to a caller,
// still refuses an unauthorised one, still reads rather than repairs, and still
// prints the charge id that identifies the money in Stripe's own dashboard.
//
// THE SCHEDULE ITSELF is checked by scripts/guards/cron-routes-scheduled.mjs,
// which owns that invariant for every cron route. This clause asserts the route
// EXISTS and does its job, which is the half that guard would pass vacuously on
// if the route and its schedule were deleted together.

const RECONCILER = 'src/lib/payments/platform-settlement-reconcile.ts'
const LISTER = 'src/lib/stripe/settled-charges.ts'
const SETTLEMENT_CRON = 'src/app/api/cron/platform-settlement-reconcile/route.ts'

const reconciler = read(RECONCILER)
if (reconciler) {
  const writeVerbs = ['.insert(', '.update(', '.upsert(', '.delete(', '.rpc(']
  const writesFound = writeVerbs.filter((v) => reconciler.includes(v))
  if (writesFound.length > 0) {
    failures.push(
      `${RECONCILER}: calls ${writesFound.join(', ')}. The settlement reconciliation must only READ. One that repaired what it found would destroy the evidence of how the money came to be adrift, which is the only reason it exists.`,
    )
  } else {
    passes.push('the settlement reconciliation only reads; it repairs nothing')
  }

  const describeAt = reconciler.indexOf('export function describeFinding(')
  const formatAt = reconciler.indexOf('function formatMoney(')
  if (describeAt === -1 || formatAt === -1 || formatAt < describeAt) {
    failures.push(
      `${RECONCILER}: describeFinding is gone or has moved, so this clause cannot check that a finding names its charge`,
    )
  } else {
    const describeBody = reconciler.slice(describeAt, formatAt)
    // Counted rather than parsed: there is one branch per finding kind and each
    // must name the charge. Counting survives a reworded sentence; a parser
    // would not.
    const named = describeBody.split('${chargeId}').length - 1
    if (!describeBody.includes('unrouted_ticket_charge')) {
      failures.push(
        `${RECONCILER}: describeFinding no longer distinguishes unrouted_ticket_charge, so the two findings can no longer be told apart`,
      )
    } else if (named < 2) {
      failures.push(
        `${RECONCILER}: only ${named} describeFinding branch(es) name the charge id. A P0 that does not name the charge cannot be matched to money in Stripe, which makes it unactionable.`,
      )
    } else {
      passes.push('every settlement finding names the charge id')
    }
  }
}

const lister = read(LISTER)
if (lister) {
  const stripeWrite = /stripe\s*\.\s*\w+\s*\.\s*(create|update|del|cancel|capture)\s*\(/.exec(lister)
  if (stripeWrite) {
    failures.push(
      `${LISTER}: calls stripe.*.${stripeWrite[1]}(). The reader of the platform balance must never write to Stripe.`,
    )
  } else {
    passes.push('the platform balance reader makes no Stripe write')
  }
}

const settlementCron = read(SETTLEMENT_CRON)
if (settlementCron) {
  if (!/scanPlatformSettlement\s*\(/.test(settlementCron)) {
    failures.push(
      `${SETTLEMENT_CRON}: does not call scanPlatformSettlement, so the daily schedule points at a job that judges nothing and the platform balance goes unreconciled for ever`,
    )
  } else {
    passes.push('the daily settlement reconciliation is wired to the rule')
  }
  if (!/requireCronAuth\s*\(/.test(settlementCron)) {
    failures.push(
      `${SETTLEMENT_CRON}: does not call requireCronAuth, so a money reconciliation naming charge ids and organisation names is publicly triggerable`,
    )
  } else {
    passes.push('the settlement reconciliation refuses an unauthorised caller')
  }
}

// -- CLAUSE FIVE -------------------------------------------------------------
// MONEY FIX A3 LAYER TWO. An event may not be published for an organiser on a
// cached "yes" that nobody can date.
//
// WHAT THE FIVE SALE COLUMNS ARE. They are a CACHE of what Stripe last said,
// kept current by the account.updated webhook. Before this clause nothing
// recorded WHEN they were last read, so a row that said enabled six weeks ago
// and has heard nothing since was indistinguishable from one confirmed a minute
// ago, and the publish gate believed both. A webhook that stops arriving
// changes nothing on screen and raises nothing anywhere: the event publishes,
// tickets sell, and the organiser finds out when the transfer fails.

const PUBLISH_GATE = 'src/lib/events/publish-gate.ts'
const FRESHNESS = 'src/lib/events/connect-verification-freshness.ts'
const CONNECT_RECONCILER = 'src/lib/stripe/reconcile-connect.ts'
const CONNECT_WEBHOOK = 'src/lib/stripe/connect-handlers.ts'

const publishGate = read(PUBLISH_GATE)
const freshness = read(FRESHNESS)
// CODE ONLY, for the same reason the publish gate is read that way: both of
// these files EXPLAIN stripe_status_verified_at at length, and a clause that
// counted the explanation would pass a file that had stopped writing it.
const reconcilerRaw = read(CONNECT_RECONCILER)
const reconcilerSrc = reconcilerRaw ? codeOnly(reconcilerRaw) : reconcilerRaw
const connectWebhookRaw = read(CONNECT_WEBHOOK)
const connectWebhook = connectWebhookRaw ? codeOnly(connectWebhookRaw) : connectWebhookRaw

if (!freshness) {
  failures.push(
    `${FRESHNESS}: missing. Nothing decides how old a cached Stripe verification may be, so every cached yes is as good as a fresh one.`,
  )
} else if (!/export const CONNECT_VERIFICATION_MAX_AGE_MS\s*=/.test(freshness)) {
  failures.push(
    `${FRESHNESS}: no longer exports CONNECT_VERIFICATION_MAX_AGE_MS, so the window is written somewhere else or nowhere`,
  )
} else if (!/export function connectVerificationIsFresh\s*\(/.test(freshness)) {
  failures.push(`${FRESHNESS}: no longer exports connectVerificationIsFresh, so the gate has nothing to ask`)
} else {
  passes.push('how old a cached Stripe verification may be is written in exactly one place')
}

if (publishGate) {
  /*
   * SELL FIRST (Lawal's yes, 15:22 on 14 November 2026). A paid event publishes
   * on the ONE rule the sale and the charge use, and no Stripe posture decides
   * it, so the gate can neither refuse a publish the checkout would take money
   * for nor grant one it would refuse. Read as code (comments blanked), so a
   * sentence explaining the old reconciler does not count as a call to it. The
   * A3 layer two freshness rule guarded a publish that depended on Stripe;
   * nothing here does now, and the stamp the reconciler and the webhook write
   * is still held below for the payouts page that reads it.
   */
  if (!/if \(isOrganiserSellable\(saleFields\.org\)\) return \{ ok: true \}/.test(publishGate)) {
    failures.push(
      `${PUBLISH_GATE}: no longer grants a paid publish on isOrganiserSellable, so publish and sale can disagree about the same organiser`,
    )
  } else {
    passes.push('a paid event publishes on the same rule the sale and the charge use')
  }
  if (/reconcileConnectedAccount|\breconcile\s*\(/.test(publishGate)) {
    failures.push(
      `${PUBLISH_GATE}: asks Stripe again before publishing. Since 14 November 2026 no Stripe posture decides a publish: an organiser publishes and sells, and connects payouts before the payout.`,
    )
  } else {
    passes.push('the publish gate makes no Stripe call')
  }
}

if (reconcilerSrc) {
  /*
   * THE PAYLOAD, NOT THE FILE, and the drill for this clause is why. Deleting
   * the stamp from the written payload left the identifier behind in the change
   * test that EXCLUDES it (`if (k === 'stripe_status_verified_at') return
   * false`), so a file that had stopped writing the column still mentioned it
   * and the clause passed. The subject is the object that is written.
   */
  const payloadAt = reconcilerSrc.indexOf('const payload: Record<string, unknown> = {')
  const changedAt = reconcilerSrc.indexOf('const changed =')
  const payloadBlock =
    payloadAt !== -1 && changedAt > payloadAt ? reconcilerSrc.slice(payloadAt, changedAt) : ''
  if (payloadAt === -1 || changedAt === -1) {
    failures.push(
      `${CONNECT_RECONCILER}: the payload and the change test are no longer both present in the shape this clause reads; it is reading the wrong file`,
    )
  } else if (!/stripe_status_verified_at\s*:/.test(payloadBlock)) {
    failures.push(
      `${CONNECT_RECONCILER}: never writes stripe_status_verified_at into the payload BEFORE the change test. An account that is verified and UNCHANGED is the commonest case there is, so stamping it later, or not at all, would let the date age out while the verification was happening daily.`,
    )
  } else {
    passes.push('every successful read of a connected account records that it happened, changed or not')
  }

  if (!/isOrganiserPayable\(/.test(reconcilerSrc)) {
    failures.push(
      `${CONNECT_RECONCILER}: does not compute its payable verdict with isOrganiserPayable, so the reconciler and the payout can disagree about the same row`,
    )
  } else {
    passes.push('the reconciler reports payability through the payout’s own predicate')
  }
}

if (connectWebhook && !/stripe_status_verified_at/.test(connectWebhook)) {
  failures.push(
    `${CONNECT_WEBHOOK}: account.updated writes the Stripe posture and does not stamp stripe_status_verified_at, so the webhook keeps the columns current while the date goes stale and every publish pays for a Stripe call it does not need.`,
  )
} else if (connectWebhook) {
  passes.push('the account.updated webhook stamps the verification it performed')
}

// -- CLAUSE SIX --------------------------------------------------------------
// MONEY FIX A4. Every ticket charge writes down where its money is owed, on the
// order, BEFORE the charge exists.
//
// THE FAILURE IT ENDS. Two charges for the Afro-Fusion Music Showcase settled
// into the platform account on 10 September 2026 and paid out to the platform
// owner's personal bank. The organiser's connected account was live and enabled
// and this platform had created it. Nothing recorded that those orders were owed
// onward to anybody.
//
// BEFORE, NOT AFTER, and that ordering is the fail-closed part: if the record
// cannot be written there is no charge, rather than a charge nobody can
// attribute. An intent created and never confirmed costs nobody anything.
//
// SELL FIRST (14 November 2026). An organiser who has not connected yet has no
// account to name, and the database takes all four facts or none
// (orders_destination_is_whole), so the record waits for the account. The
// organisation's ledger row (order_confirmed) is the record meanwhile, and the
// daily reconciliation (clause four) raises a P0 for any charge without one.

const DESTINATION = 'src/lib/payments/order-destination.ts'
const destination = read(DESTINATION)

const A4_COLUMNS = [
  'destination_account_id',
  'platform_fee_retained_cents',
  'stripe_processing_estimate_cents',
  'organiser_amount_due_cents',
  'destination_recorded_at',
]

if (creator) {
  const recordAt = creator.indexOf('recordOrderDestination(')
  const intentAt = creator.indexOf('.createPaymentIntent(')
  if (recordAt === -1) {
    failures.push(
      `${CHARGE_CREATOR}: does not record where this order's money is owed. A charge nobody can attribute is exactly the Afro-Fusion failure.`,
    )
  } else if (intentAt !== -1 && recordAt > intentAt) {
    failures.push(
      `${CHARGE_CREATOR}: records the destination AFTER the charge is created, so a failure to record leaves a charge that exists and is owed to nobody.`,
    )
  } else {
    passes.push('the destination of every ticket charge is written down before the charge exists')
  }
}

if (!destination) {
  failures.push(`${DESTINATION}: missing. Nothing records where an order's money is owed.`)
} else {
  /*
   * WRITTEN, NOT DECLARED. The drill renamed `destination_recorded_at` in the
   * row the writer composes and the clause PASSED, because the name survived in
   * the `OrderDestinationRow` type above it. A type is a promise; the object
   * literal is the fact. Each column must appear as a KEY being assigned.
   */
  const composed = destination.split('export function composeOrderDestination')[1] ?? ''
  // String.raw, because a template literal eats the backslash in `\s` and the
  // regex silently becomes `...s*:s*S`, which matches nothing and passes every
  // column. The clause was doing exactly that until it was run.
  const missing = A4_COLUMNS.filter((c) => !new RegExp(c + String.raw`\s*:\s*\S`).test(composed))
  if (missing.length > 0) {
    failures.push(
      `${DESTINATION}: the order record is missing ${missing.join(', ')}, so the four facts MONEY FIX A4 asks for are not all stored`,
    )
  } else {
    passes.push('the order records the destination account, the fee retained, the Stripe estimate and the amount due')
  }

  if (!/destination_not_recorded/.test(destination)) {
    failures.push(
      `${DESTINATION}: a failure to record the destination no longer raises the named refusal destination_not_recorded, so it could be logged and walked past`,
    )
  } else {
    passes.push('a destination that cannot be recorded refuses the charge by name')
  }

  // An UPDATE that matches nothing SUCCEEDS. Checking only `error` would report
  // success while the order carried no destination.
  if (!/data\.length !== 1|length !== 1/.test(destination)) {
    failures.push(
      `${DESTINATION}: does not assert that exactly one order row was updated. An UPDATE matching nothing returns no error, so the write would be reported as a success while the order carried no destination.`,
    )
  } else {
    passes.push('recording the destination insists on exactly one order row, because an UPDATE that matches nothing is not an error')
  }
}

/*
 * ONE WRITER, AND THE CLAUSE HAD TO LEARN WHAT IT MEANT.
 *
 * Its first run named five files and every one was innocent:
 * `destination_account_id` is also a Stripe TRANSFER parameter
 * (event-transfer.ts, venue-transfer.ts), a field on the gateway's transfer
 * type, and a column on the venue payout type. None of them touches an order.
 *
 * So the subject is the PAIR. `destination_recorded_at` exists only for the
 * order record, so a file writing BOTH is writing the order's destination and a
 * file writing one or neither is doing something else. The generated types
 * carry both by construction and are excluded by name.
 */
const GENERATED_TYPES = 'src/types/database.ts'
const destinationWriters = []
for (const file of sourceFiles(join(ROOT, 'src'))) {
  const rel = relative(ROOT, file).replace(/\\/g, '/')
  if (rel === DESTINATION || rel === GENERATED_TYPES) continue
  const src = codeOnly(readFileSync(file, 'utf8'))
  if (/destination_account_id\s*:/.test(src) && /destination_recorded_at\s*:/.test(src)) {
    destinationWriters.push(rel)
  }
}
if (destinationWriters.length > 0) {
  for (const rel of destinationWriters) {
    failures.push(
      `${rel}: writes orders.destination_account_id. Only ${DESTINATION} may, so that "the destination is recorded before the charge" is a statement about every charge.`,
    )
  }
} else {
  passes.push('only one module writes where an order’s money is owed')
}

// EVERY CALL SITE HANDS THE CHARGE ITS ORDER ID. The recorder finds the order
// through `transferGroup`, which all three checkout paths set to the order id;
// a call site that passed anything else would write the destination onto the
// wrong order, or onto none.
const CHECKOUT_SITES = ['src/app/actions/checkout.ts', 'src/app/actions/squad-checkout.ts']
let transferGroupSites = 0
for (const rel of CHECKOUT_SITES) {
  const src = read(rel)
  if (!src) continue
  transferGroupSites += (src.match(/transferGroup:\s*order_id\b/g) ?? []).length
}
if (transferGroupSites !== 3) {
  failures.push(
    `the three checkout call sites pass transferGroup: order_id ${transferGroupSites} time(s), not 3. The destination is recorded against that value, so a call site passing anything else writes it onto the wrong order or onto none.`,
  )
} else {
  passes.push('all three checkout call sites hand the charge its own order id')
}

// -- CLAUSE SEVEN ------------------------------------------------------------
// SELL FIRST'S OTHER HALF (Lawal, 10 October 2026: money only ever goes to the
// organiser's own connected account). The post-event payout selects only
// organisations that are active and connected, and pays the account on the
// organisation's own row, so money held for an organiser who has not connected
// waits for them and goes nowhere else.
const PAYOUT = 'src/lib/payments/event-transfer.ts'
const payout = read(PAYOUT)
if (payout) {
  const needs = [
    [/\.eq\('organisations\.payout_status', 'active'\)/, 'pays an organisation that is not active (on hold or restricted)'],
    [/\.not\('organisations\.stripe_account_id', 'is', null\)/, 'selects organisations with no connected account, so a transfer could be attempted with no destination'],
    [/const destinationAccountId = orgEmbed\?\.stripe_account_id/, "no longer pays the account on the organisation's own row"],
  ]
  const missing = needs.filter(([re]) => !re.test(payout))
  for (const [, why] of missing) failures.push(`${PAYOUT}: the post-event payout ${why}`)
  if (missing.length === 0) passes.push("the payout goes only to the organisation's own connected, active account")
}

console.log(`[funds-reach-the-organiser] ${passes.length} structural guarantee(s) verified:`)
for (const p of passes) console.log(`    PASS  ${p}`)
console.log(
  '    NOTE  clause two covers the CHARGE-time refusal and clause five the PUBLISH-time one:',
)
console.log(
  '          the same rule, with no Stripe call (sell first, 14 November 2026); clause seven',
)
console.log("          holds the payout to the organisation's own connected, active account.")
console.log(
  '    NOTE  clause four covers A3 layer three, the daily settlement reconciliation, and covers',
)
console.log(
  '          its SHAPE only. Whether it FINDS anything is a question for the live balance, which',
)
console.log('          no guard can read; scripts/verify/platform-settlement-reconcile-proof.mjs does.')

if (failures.length > 0) {
  console.error(
    `\n[funds-reach-the-organiser] FAILED. ${failures.length} way(s) the organiser's money could fail to reach the organiser.\n`,
  )
  for (const f of failures) console.error(`    ${f}`)
  console.error(
    '\n    A ticket charge exists to pay an organiser. A charge that cannot name its' +
      '\n    destination, or that a fee amount can refuse, is money the platform has' +
      '\n    taken and nobody can be sure is owed onward. The fee never decides whether' +
      '\n    the money moves; it decides only how much of it the platform keeps.\n',
  )
  process.exit(1)
}

console.log(
  '[funds-reach-the-organiser] PASS - every ticket charge refuses only a hold or an unsupported currency and never the fee amount alone, names its destination once the organiser is connected, the payout goes only to their own connected account, and the daily settlement reconciliation is wired, read-only and names every charge.',
)
