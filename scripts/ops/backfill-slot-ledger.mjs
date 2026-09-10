/**
 * BACKFILL THE SLOT LEDGER FROM ORDERS THAT WERE ALREADY CONFIRMED.
 *
 * Close-out D1: "Backfill from existing completed orders through the same
 * adapter. Backfill only what was genuinely recorded. Invent nothing."
 *
 * WHY IT GOES THROUGH THE ADAPTER RATHER THAN WRITING ROWS ITSELF. The adapter
 * IS the mapping, and a backfill that reimplemented it would be a second
 * mapping, which would drift from the first the week after it was written. The
 * boundary is the entire portability of the business
 * (scripts/guards/ledger-writes-through-the-adapter.mjs holds it for src/; this
 * file holds it by choice, because a one-off script is exactly where a shortcut
 * feels harmless).
 *
 * WHAT IT INVENTS: NOTHING.
 *   - a sale is written from the order item that exists, at the price that is
 *     recorded on it, timestamped `confirmed_at`;
 *   - a refund is written per unit whose `refunded_at` is set;
 *   - attribution and returning-buyer are read where they exist and left NULL
 *     where they do not, because a plausible guess in a ledger is worse than a
 *     gap: a gap is visible and a guess is not.
 *   - NO demand rows are backfilled at all. Nobody recorded who reached
 *     checkout before this existed, so there is nothing to write, and writing
 *     zero abandonment for a period nobody measured would be a lie the recovery
 *     engine would then act on.
 *
 * SAFETY. It is idempotent: every row is keyed on its occurrence, so a re-run
 * writes nothing twice. `--dry-run` reads and reports without writing a row, and
 * is the only mode that may be pointed at production, which it refuses to write
 * to regardless (that refusal is the shared preflight's, not this file's).
 *
 * USAGE
 *   node --import ./scripts/lib/src-alias-loader.mjs scripts/ops/backfill-slot-ledger.mjs [--dry-run] [--limit N]
 *
 * The environment must carry NEXT_PUBLIC_SUPABASE_URL and
 * SUPABASE_SERVICE_ROLE_KEY for the project being filled.
 */
import { createClient } from '@supabase/supabase-js'

const argv = process.argv.slice(2)
const DRY_RUN = argv.includes('--dry-run')
const LIMIT = Number(argv[argv.indexOf('--limit') + 1]) || 500
const TAG = '[backfill-slot-ledger]'
const PRODUCTION = 'gndnldyfudbytbboxesk'

/**
 * May this run write? Pure, and exported, so the refusal is testable without a
 * database and without anybody having to point a script at production to find
 * out what it would do.
 */
export function judgeBackfillTarget({ url: target, dryRun }) {
  if (String(target ?? '').includes(PRODUCTION) && !dryRun) {
    return {
      allowed: false,
      reason:
        'this is the PRODUCTION project and --dry-run was not given. A production backfill is ' +
        "Lawal's decision and is run with his approval, never by default.",
    }
  }
  return {
    allowed: true,
    reason: dryRun ? 'dry run: nothing is written anywhere' : 'a project that is not production',
  }
}

/**
 * ONE ORDER'S WORTH OF BACKFILL, exported so the rule is testable.
 *
 * It takes the adapter as an argument rather than importing it, for the same
 * reason the judgement above is exported: the two claims this file makes that
 * are worth anything are "a re-run writes nothing twice" and "it invents
 * nothing", and neither could be tested if the only way to reach them were to
 * point the whole script at a database.
 *
 * It does NOT reimplement the mapping. In writing mode it calls exactly the two
 * adapter functions a live sale and a live refund call, so a backfilled row and
 * a live one are the same row written by the same code.
 */
export async function backfillOrder({ db, order, adapter, dryRun }) {
  const tally = { written: 0, alreadyThere: 0, failed: 0, wouldWrite: [] }

  if (dryRun) {
    const { data: items } = await db
      .from('order_items')
      .select('id, item_type, item_name, quantity, unit_price_cents, total_cents')
      .eq('order_id', order.id)
    // An add-on is not a unit of the slot's capacity, so it is not a sale here
    // either. The same rule the adapter applies, for the same reason.
    const ticketed = (items ?? []).filter(i => i.item_type === 'ticket')
    const keys = ticketed.map(i => `sale:${i.id}`)
    const { data: have } = keys.length
      ? await db.from('ledger_entries').select('occurrence_key').in('occurrence_key', keys)
      : { data: [] }
    const present = new Set((have ?? []).map(r => r.occurrence_key))
    for (const item of ticketed) {
      if (present.has(`sale:${item.id}`)) {
        tally.alreadyThere += 1
        continue
      }
      tally.written += 1
      tally.wouldWrite.push(
        `${order.order_number}  ${item.item_name} x${item.quantity}  ` +
          `${(item.total_cents / 100).toFixed(2)}  at ${order.confirmed_at}`,
      )
    }
    return tally
  }

  /*
   * A ROW THAT WAS ALREADY THERE IS NOT A ROW THIS RUN WROTE.
   *
   * The first version added `outcome.ok` into `written`, and `write` returns
   * ok for the idempotent path too, so a second run over 244 orders reported
   * "wrote 264 row(s)" having written 34. On a build whose rule is that a
   * save which quietly did nothing is never reported as success, the inverse
   * is the same defect: a no-op reported as work.
   */
  const sale = await adapter.recordConfirmedOrder(order.id)
  tally.written += sale.written
  tally.alreadyThere += sale.alreadyThere ?? 0
  tally.failed += sale.failed

  // Every refund on this order, through the same adapter a live one uses.
  const { data: refunds } = await db.from('refunds').select('id').eq('order_id', order.id)
  for (const refund of refunds ?? []) {
    const back = await adapter.recordRefundedOrder(refund.id)
    tally.written += back.written
    tally.alreadyThere += back.alreadyThere ?? 0
    tally.failed += back.failed
  }
  return tally
}

/*
 * Everything below runs only when this file is the thing that was invoked, so a
 * test can import the judgement above without the script reading a database.
 */
const invokedDirectly = process.argv[1] && /backfill-slot-ledger\.mjs$/.test(process.argv[1])

if (invokedDirectly) {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim()
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  if (!url || !serviceKey) {
    console.error(`${TAG} NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.`)
    process.exit(1)
  }

  const verdict = judgeBackfillTarget({ url, dryRun: DRY_RUN })
  if (!verdict.allowed) {
    console.error(`${TAG} REFUSED: ${verdict.reason}`)
    process.exit(1)
  }

  const db = createClient(url, serviceKey, { auth: { persistSession: false } })
  const adapter = await import('../../src/lib/ledger/adapter.ts')

  console.log(`${TAG} project ${/https:\/\/([a-z0-9]+)\./.exec(url)?.[1] ?? url}`)
  console.log(`${TAG} mode ${DRY_RUN ? 'DRY RUN, nothing is written' : 'WRITING'}, limit ${LIMIT}`)

  const { data: orders, error } = await db
    .from('orders')
    .select('id, order_number, event_id, confirmed_at, total_cents')
    .eq('status', 'confirmed')
    .order('confirmed_at', { ascending: true })
    .limit(LIMIT)

  if (error) {
    console.error(`${TAG} could not read the orders: ${error.message}`)
    process.exit(1)
  }

  const rows = orders ?? []
  console.log(`${TAG} ${rows.length} confirmed order(s) to consider`)

  let written = 0
  let alreadyThere = 0
  let failed = 0

  for (const order of rows) {
    const tally = await backfillOrder({ db, order, adapter, dryRun: DRY_RUN })
    written += tally.written
    alreadyThere += tally.alreadyThere
    failed += tally.failed
    for (const line of tally.wouldWrite) console.log(`${TAG}   WOULD WRITE  ${line}`)
  }

  console.log('')
  console.log(`${TAG} ${DRY_RUN ? 'would write' : 'wrote'} ${written} row(s)`)
  console.log(
    `${TAG} ${alreadyThere} row(s) were already recorded and were left alone` +
      `${DRY_RUN ? ', which a re-run would leave alone too' : ''}`,
  )
  if (failed > 0) console.log(`${TAG} ${failed} row(s) FAILED; the reason is printed above each one`)

  if (written === 0 && alreadyThere === 0 && rows.length > 0) {
    console.log('')
    console.log(`${TAG} IT READ ${rows.length} CONFIRMED ORDER(S) AND WROTE NOTHING, which is a fault, not a pass.`)
    process.exitCode = 1
  }

  if (failed > 0) process.exitCode = 1
}
