/**
 * WHAT ARE THE ORDERS ATTACHED TO SEEDED EVENTS, EXACTLY? Per order, with proof.
 *
 * This decides whether the seeded rows can be deleted outright. An order that
 * represents real money must never be destroyed; a synthetic fixture row that
 * represents none is just debris in a database. The difference cannot be
 * assumed, so it is established PER ORDER rather than in aggregate.
 *
 * A CORRECTION THIS FILE EXISTS TO CARRY. The first version of this script
 * reported "orders carrying a Stripe payment intent: 0" and concluded there was
 * no Stripe involvement. That was false, and it was false in the most dangerous
 * way available: it answered a NARROWER question than the one asked and printed
 * the answer as though it were the whole one. `orders` genuinely has no
 * payment-intent column, so the script looked there, found nothing, and stopped.
 * The payment intents are on `payments.gateway_payment_id`, and on TEST 36 of
 * the 38 payment rows behind seeded events carry one. Refund objects exist too,
 * on `refunds.stripe_refund_id`. Anyone acting on the earlier output would have
 * deleted rows believing no payment object had ever been created for them.
 *
 * So this version looks everywhere a Stripe identifier can live, and says which
 * table it read for each answer.
 *
 * HOW "SYNTHETIC" IS DECIDED, and why it is decided this way.
 *
 *   The Stripe id STRING CANNOT TELL YOU. A test-mode payment intent and a live
 *   one both begin `pi_`. There is no prefix, no checksum and no field in the id
 *   that separates them, so any claim that "these are only test objects" that
 *   rests on reading the id is worthless.
 *
 *   What DOES decide it is the API key that created them, because a key is
 *   bound to one mode. So this script reads the MODE of STRIPE_SECRET_KEY in
 *   the environment it has been pointed at (`sk_test_` or `sk_live_`, prefix
 *   only, the key is never printed) and reports every finding against it. On a
 *   `sk_test_` environment a completed payment intent moved no money. On a
 *   `sk_live_` environment the identical row is a real purchase by a real
 *   person, and the purge must not run.
 *
 *   That is the entire reason this script must be run against PRODUCTION before
 *   anything is deleted there, rather than reasoned about from the TEST result.
 *
 * The email test uses RFC 2606, which reserves example.com/net/org and the
 * .test, .example, .invalid and .localhost TLDs precisely so they can never
 * belong to a real person (https://www.rfc-editor.org/rfc/rfc2606, fetched
 * 14 August 2026). Domains outside that set are NOT assumed to be fixtures:
 * they are listed individually and counted as UNKNOWN, so a real buyer cannot
 * be classified away by a regex.
 *
 * READ ONLY. Opens no transaction and issues no write.
 *
 * Usage: node --env-file=.env.test scripts/verify/seeded-order-forensics.mjs
 */
import _pg from 'pg'
import { assertNotProductionDatabase } from '../lib/production-write-preflight.mjs'

/*
 * THE POSTGRES PREFLIGHT, NOT THE SUPABASE-CLIENT ONE. This script connects over
 * SUPABASE_DB_URL as the database OWNER, so the target that has to be judged is
 * that connection string. `assertNotProduction()` judges
 * NEXT_PUBLIC_SUPABASE_URL instead, which is a DIFFERENT variable: it can name
 * TEST while SUPABASE_DB_URL names production, and the run would then pass its
 * preflight and connect somewhere else entirely.
 *
 * It also retires a hand-rolled copy of the connection parser. That parser lives
 * once, in production-write-preflight.mjs, and hands pg DISCRETE fields rather
 * than a connectionString, because the database password is not percent-encoded:
 * the string form makes pg throw ERR_INVALID_URL while printing the input as
 * `*****REDACTED*****`, which reads like an unset placeholder rather than a
 * parse failure. The password is never printed here.
 */
const target = assertNotProductionDatabase()

/**
 * THE SEED OWNER, and why this script may not rely on `is_seed_data` alone.
 *
 * DEFECT FOUND 25 AUGUST 2026, on the production run this script exists to
 * authorise. Every query here selected `where e.is_seed_data = true`. On
 * PRODUCTION that column is `false` on all 48 event rows, and it is false as a
 * column DEFAULT rather than as a measurement: migration 20260628000001 added it
 * `NOT NULL DEFAULT false`, and the backfill that sets it true runs in the seeder
 * behind a TEST-only guard, so every production row predates the marker and
 * inherited `false` regardless of what it actually is.
 *
 * The consequence is the worst available shape, and it is the SAME shape this
 * file's header already records itself having had once: the script ran happily
 * against production, printed "0 orders attached to seeded events", answered
 * every one of the five questions with a confident zero, and none of it meant
 * anything. A reader would conclude there was nothing behind the demo catalogue
 * to worry about. There is: the owner-keyed purge rehearsal, run against the same
 * database minutes later, found ONE order and ONE payment row under
 * "Lagos Comedy Tour" that it would delete.
 *
 * A verdict of SAFE TO PURGE from a query that matched nothing is not a verdict.
 *
 * So identification is now the SAME RULE the purge uses, which is the owner, with
 * `is_seed_data` kept as an additional term so TEST (where the marker IS set, and
 * where seeded events are not all owner-keyed) keeps reporting everything it did
 * before. The authorising script and the deleting script must agree about what
 * they are talking about, or the authorisation is for a different set of rows.
 *
 * Kept in step with scripts/verify/seeded-purge-rehearsal.mjs, which declares the
 * same constant for the same reason.
 */
const SEED_OWNER_ID = '00000000-0000-4000-8000-000000000001'

/** Mode only. The key itself is never read into the output. */
const rawKey = process.env.STRIPE_SECRET_KEY ?? ''
const stripeMode = rawKey.startsWith('sk_test_')
  ? 'TEST'
  : rawKey.startsWith('sk_live_')
    ? 'LIVE'
    : rawKey
      ? 'UNRECOGNISED'
      : 'NOT SET'

/** RFC 2606 reserved names, plus domains this business owns. */
const RESERVED_TLDS = ['.test', '.example', '.invalid', '.localhost']
const RESERVED_DOMAINS = ['example.com', 'example.net', 'example.org']
const OWN_DOMAINS = ['eventlinqs.com', 'eventlinqs.com.au']
/** Public throwaway inboxes: nobody's real mailbox, but NOT reserved by an RFC. */
const THROWAWAY = ['mailinator.com']

function classifyEmail(email) {
  if (!email) return { kind: 'NONE', why: 'no email recorded' }
  const at = email.lastIndexOf('@')
  if (at === -1) return { kind: 'UNKNOWN', why: 'not an email address' }
  const d = email.slice(at + 1).toLowerCase()
  if (RESERVED_DOMAINS.includes(d)) return { kind: 'RESERVED', why: `${d} is reserved by RFC 2606` }
  if (RESERVED_TLDS.some(t => d.endsWith(t))) return { kind: 'RESERVED', why: `${d} uses an RFC 2606 reserved TLD` }
  if (OWN_DOMAINS.includes(d)) return { kind: 'OWN', why: `${d} is our own domain` }
  if (THROWAWAY.includes(d)) return { kind: 'THROWAWAY', why: `${d} is a public throwaway inbox` }
  return { kind: 'UNKNOWN', why: `${d} is not a known fixture domain` }
}

const db = await target.connect()

console.log('')
console.log('='.repeat(78))
console.log('SEEDED-ORDER FORENSICS')
console.log('='.repeat(78))
console.log(`Database        : ${target.ref}`)
console.log(`Stripe key mode : ${stripeMode}`)
if (stripeMode === 'LIVE') {
  console.log('')
  console.log('  *** THIS ENVIRONMENT IS ON LIVE STRIPE KEYS. Any completed payment')
  console.log('  *** intent below is REAL MONEY from a REAL PERSON. Do not purge.')
}
if (stripeMode === 'NOT SET' || stripeMode === 'UNRECOGNISED') {
  console.log('')
  console.log('  *** STRIPE_SECRET_KEY is not readable here, so the MODE of any payment')
  console.log('  *** intent below CANNOT be established. Treat every one as possibly real.')
}

/*
 * One row per order, with every dependent this question turns on. Payouts attach
 * to the EVENT, not the order (payouts has no order_id), so they are counted per
 * event and shown against each of that event's orders.
 */
const { rows } = await db.query(`
  select o.id,
         o.order_number,
         o.status::text as status,
         o.total_cents,
         o.guest_email,
         o.user_id,
         e.title as event_title,
         (select count(*)::int from public.tickets  t where t.order_id = o.id) as tickets,
         (select count(*)::int from public.payments p where p.order_id = o.id) as payments,
         (select count(*)::int from public.payments p
           where p.order_id = o.id and p.gateway_payment_id is not null) as payments_with_pi,
         (select string_agg(distinct p.gateway_payment_id, ' ')
            from public.payments p where p.order_id = o.id) as intents,
         (select string_agg(distinct p.status::text, '/')
            from public.payments p where p.order_id = o.id) as pay_status,
         (select count(*)::int from public.refunds r where r.order_id = o.id) as refunds,
         (select string_agg(distinct r.stripe_refund_id, ' ')
            from public.refunds r where r.order_id = o.id) as refund_ids,
         (select count(*)::int from public.payouts  y where y.event_id = e.id) as event_payouts
    from public.orders o
    join public.events e on e.id = o.event_id
    left join public.organisations g on g.id = e.organisation_id
   where e.is_seed_data = true
      or g.owner_id = $1
   order by o.total_cents desc nulls last, o.order_number`, [SEED_OWNER_ID])

console.log('')
console.log(`===== ${rows.length} orders attached to seeded events, one line each =====`)
console.log('')
console.log('  ORDER        STATUS     AMOUNT  TKT PAY PI RFD PO  EMAIL CLASS   PAYMENT INTENT')
console.log('  ' + '-'.repeat(94))

const tally = { RESERVED: 0, OWN: 0, THROWAWAY: 0, NONE: 0, UNKNOWN: 0 }
const unknownRows = []
let ordersWithIntent = 0
let ordersWithTicket = 0
let ordersWithRefund = 0
let ordersWithRefundId = 0

for (const r of rows) {
  const cls = classifyEmail(r.guest_email)
  tally[cls.kind] += 1
  if (cls.kind === 'UNKNOWN') unknownRows.push({ r, cls })
  if (r.payments_with_pi > 0) ordersWithIntent += 1
  if (r.tickets > 0) ordersWithTicket += 1
  if (r.refunds > 0) ordersWithRefund += 1
  if (r.refund_ids) ordersWithRefundId += 1

  console.log(
    '  ' +
      String(r.order_number ?? '(none)').padEnd(12) +
      String(r.status).padEnd(10) +
      String(((r.total_cents ?? 0) / 100).toFixed(2)).padStart(8) + ' ' +
      String(r.tickets).padStart(3) +
      String(r.payments).padStart(4) +
      String(r.payments_with_pi).padStart(3) +
      String(r.refunds).padStart(4) +
      String(r.event_payouts).padStart(3) + '  ' +
      cls.kind.padEnd(13) + ' ' +
      (r.intents ?? '-'),
  )
}

console.log('')
console.log('  Legend: TKT tickets issued, PAY payment rows, PI payment rows carrying a')
console.log('          Stripe payment intent, RFD refund rows, PO payouts on that event.')

console.log('')
console.log('===== THE FIVE QUESTIONS, ANSWERED FROM THE TABLE THAT HOLDS EACH =====')
console.log('')
console.log(`  1. Stripe payment intent   : ${ordersWithIntent} of ${rows.length} orders`)
console.log('                                 read from payments.gateway_payment_id')
console.log('                                 (orders has NO payment-intent column, which is')
console.log('                                  what the earlier version of this script missed)')
console.log(`  2. Real buyer or guest email: ${tally.UNKNOWN} of ${rows.length} orders carry a domain that is not`)
console.log('                                 a known fixture domain (see the breakdown below)')
console.log(`  3. Issued ticket            : ${ordersWithTicket} of ${rows.length} orders`)
console.log(`  4. Payout row               : payouts attach to the EVENT, not the order;`)
console.log(`                                 the PO column above is per event`)
console.log(`  5. Refund                   : ${ordersWithRefund} orders have a refund row,`)
console.log(`                                 of which ${ordersWithRefundId} carry a Stripe refund id`)

console.log('')
console.log('===== EMAIL CLASSIFICATION =====')
for (const [k, n] of Object.entries(tally)) {
  if (n === 0) continue
  const note =
    k === 'RESERVED' ? 'RFC 2606 reserved, cannot belong to a real person'
    : k === 'OWN' ? 'a domain this business owns'
    : k === 'THROWAWAY' ? 'a public throwaway inbox'
    : k === 'NONE' ? 'no email recorded at all'
    : 'NOT a known fixture domain, listed individually below'
  console.log(`   ${k.padEnd(11)} ${String(n).padStart(4)}   ${note}`)
}

if (unknownRows.length > 0) {
  console.log('')
  console.log('   Every UNKNOWN address, in full, because a real buyer must never be')
  console.log('   classified away by a pattern:')
  for (const { r, cls } of unknownRows) {
    console.log(`     ${String(r.order_number).padEnd(12)} ${r.guest_email}   (${cls.why})`)
  }
}

/* Payouts and the Stripe refund objects, counted directly. */
const payoutRows = await db.query(`
  select count(*)::int n, count(stripe_payout_id)::int with_payout_id,
         count(stripe_transfer_id)::int with_transfer_id
    from public.payouts
   where event_id in (
     select e.id from public.events e
     left join public.organisations g on g.id = e.organisation_id
     where e.is_seed_data = true or g.owner_id = $1)`, [SEED_OWNER_ID])
const pr = payoutRows.rows[0]
console.log('')
console.log('===== PAYOUTS ON SEEDED EVENTS =====')
console.log(`   ${pr.n} payout row(s); ${pr.with_payout_id} carry a stripe_payout_id, ${pr.with_transfer_id} a stripe_transfer_id`)

console.log('')
console.log('='.repeat(78))
console.log('VERDICT')
console.log('='.repeat(78))

const problems = []
if (tally.UNKNOWN > 0) problems.push(`${tally.UNKNOWN} order(s) carry an email domain that is not a known fixture domain`)
if (stripeMode === 'LIVE' && ordersWithIntent > 0) problems.push(`${ordersWithIntent} order(s) carry a payment intent created with LIVE keys, which is real money`)
/*
 * AN UNREADABLE KEY MODE ONLY MATTERS IF THERE IS A STRIPE OBJECT TO JUDGE.
 *
 * This used to block unconditionally, and on the 25 August 2026 production run
 * that was the ONLY thing blocking: one order, carrying ZERO payment intents and
 * ZERO refund ids, was refused because the mode of a Stripe object that does not
 * exist could not be established. The reason printed was true and completely
 * immaterial, and a verdict that says STOP for an immaterial reason is a verdict
 * people learn to talk themselves past, which is far more dangerous than one
 * that is precise.
 *
 * The condition is now: an unreadable mode blocks when, and only when, at least
 * one Stripe identifier is actually present. With identifiers present the
 * refusal is unchanged and absolute. With none present there is nothing whose
 * mode could make a difference, because no Stripe object was ever created, and
 * therefore no card was ever charged in any mode.
 *
 * This is strictly narrower than the old rule and strictly wider than eyeballing
 * it. Every other refusal is untouched.
 */
const stripeObjects = ordersWithIntent + ordersWithRefundId
if ((stripeMode === 'NOT SET' || stripeMode === 'UNRECOGNISED') && stripeObjects > 0) {
  problems.push(`the Stripe key mode could not be read, so the ${stripeObjects} Stripe object(s) here cannot be shown to be test-mode`)
}

if (problems.length === 0) {
  console.log('')
  console.log('  SYNTHETIC FIXTURE ORDERS. Nothing here can be a real purchase.')
  console.log('')
  console.log(`  Every one of the ${rows.length} orders carries a fixture identity: an RFC 2606`)
  console.log('  reserved address, a domain this business owns, a public throwaway inbox,')
  console.log('  or no address at all. None can reach a member of the public.')
  console.log('')
  if (stripeObjects === 0) {
    // Say WHY it is safe in this case, rather than reusing the key-mode sentence
    // and printing "a NOT SET-mode key", which reads like a bug and invites the
    // reader to distrust the whole verdict.
    console.log('  NO STRIPE OBJECT EXISTS behind any of these orders: zero payment intents')
    console.log('  and zero refund ids, read from payments.gateway_payment_id and')
    console.log('  refunds.stripe_refund_id. The key mode is therefore irrelevant here, because')
    console.log('  a card cannot have been charged in any mode by a payment intent that was')
    console.log('  never created.')
  } else {
    console.log(`  The ${ordersWithIntent} Stripe payment intents and the refund objects are REAL Stripe`)
    console.log(`  OBJECTS, but they were created with a ${stripeMode}-mode key, so no money ever`)
    console.log('  moved and no card was ever charged. That is established from the key mode,')
    console.log('  not from the shape of the id, because the id cannot tell you.')
  }
  console.log('')
  console.log('  SAFE TO PURGE on this environment.')
} else {
  console.log('')
  console.log('  STOP. This does NOT read as purely synthetic:')
  console.log('')
  for (const p of problems) console.log(`    - ${p}`)
  console.log('')
  console.log('  Do not purge. Each item above must be explained individually before any')
  console.log('  deletion is considered on this environment.')
}

console.log('')
console.log('  HOW TO MAKE THIS DETERMINATION ON PRODUCTION, before running anything:')
console.log('    1. Point this script at production, READ ONLY, with production Stripe keys')
console.log('       present so the mode can be read.')
console.log('    2. Require the line above to read SAFE TO PURGE.')
console.log('    3. If the Stripe key mode prints LIVE and any order shows a payment intent,')
console.log('       that is a real purchase by a real person. Stop and keep the row.')
console.log('  The runbook carries this as a numbered, gated step.')
console.log('')

await db.end()
