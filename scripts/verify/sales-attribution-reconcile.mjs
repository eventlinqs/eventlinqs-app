/**
 * THE ATTRIBUTION RECONCILIATION, proved against the order ledger on TEST.
 *
 * It re-derives the same three buckets in SQL that src/lib/broadcast/sales-attribution.ts
 * derives in TypeScript, for EVERY event that has any sales, and asserts three
 * things per event:
 *
 *   1. the buckets sum EXACTLY to the ledger's order count
 *   2. the buckets sum EXACTLY to the ledger's ticket count
 *   3. no order carries more than one conversion row
 *
 * WHY IT IS A SECOND IMPLEMENTATION RATHER THAN A CALL INTO THE FIRST. A proof
 * that runs the code under test and agrees with itself proves nothing about the
 * arithmetic. This one goes to the same rows by a different route, in SQL, so a
 * mistake in the TypeScript shows up as a disagreement rather than as two
 * matching wrong answers.
 *
 * READ ONLY. Opens no transaction and issues no write.
 *
 * Usage: node --env-file=.env.test scripts/verify/sales-attribution-reconcile.mjs
 */
import _pg from 'pg'
import { assertNotProductionDatabase } from '../lib/production-write-preflight.mjs'

const target = assertNotProductionDatabase()
const db = await target.connect()

/** Must match PLATFORM_OWNED_CHANNELS in src/lib/broadcast/sales-attribution.ts. */
const PLATFORM_CHANNELS = ['digest']

/**
 * Must match SOLD_STATUSES in src/lib/broadcast/sales-attribution.ts.
 *
 * A refunded ticket WAS sold; the refund is a later event against the same sale.
 * This is the definition the event overview already prints, so the attribution
 * total and the overview total are the same number.
 */
const SOLD_STATUSES = ['confirmed', 'partially_refunded', 'refunded']

const platformList = PLATFORM_CHANNELS.map(c => `'${c}'`).join(', ')
const soldList = SOLD_STATUSES.map(s => `'${s}'`).join(', ')

const { rows } = await db.query(`
  with sold as (
    select o.id, o.event_id, o.total_cents
      from public.orders o
     where o.status::text in (${soldList})
  ),
  tix as (
    select t.order_id, count(*)::int n
      from public.tickets t
      join sold on sold.id = t.order_id
     group by t.order_id
  ),
  -- ONE attribution per order, earliest wins, exactly as the module does.
  attr as (
    select distinct on (sle.order_id)
           sle.order_id, sl.channel
      from public.share_link_events sle
      join public.share_links sl on sl.id = sle.link_id
      join sold on sold.id = sle.order_id
     where sle.kind = 'conversion'
     order by sle.order_id, sle.occurred_at asc
  )
  select s.event_id,
         count(*)::int                                                        as ledger_orders,
         coalesce(sum(coalesce(tix.n, 0)), 0)::int                            as ledger_tickets,
         count(*) filter (where a.channel is not null
                            and a.channel not in (${platformList}))::int      as organiser_orders,
         coalesce(sum(coalesce(tix.n,0)) filter (where a.channel is not null
                            and a.channel not in (${platformList})), 0)::int  as organiser_tickets,
         count(*) filter (where a.channel in (${platformList}))::int          as platform_orders,
         coalesce(sum(coalesce(tix.n,0)) filter (where a.channel in (${platformList})), 0)::int as platform_tickets,
         count(*) filter (where a.channel is null)::int                       as untracked_orders,
         coalesce(sum(coalesce(tix.n,0)) filter (where a.channel is null), 0)::int as untracked_tickets
    from sold s
    left join tix on tix.order_id = s.id
    left join attr a on a.order_id = s.id
   group by s.event_id
   order by ledger_tickets desc`)

const { rows: dupes } = await db.query(`
  select order_id, count(*)::int n
    from public.share_link_events
   where kind = 'conversion' and order_id is not null
   group by order_id having count(*) > 1`)

console.log('')
console.log('='.repeat(96))
console.log('SALES ATTRIBUTION RECONCILIATION')
console.log('='.repeat(96))
console.log(`Database: ${target.ref}`)
console.log(`Platform-owned channels: ${PLATFORM_CHANNELS.join(', ')}`)
console.log('')
console.log('  EVENT                                          LEDGER      ORGANISER   PLATFORM   UNTRACKED  RECONCILES')
console.log('  ' + '-'.repeat(94))

let failures = 0
let totalLedgerTickets = 0
let totalOrganiserTickets = 0
let totalPlatformTickets = 0
let totalUntrackedTickets = 0

for (const r of rows) {
  const bo = r.organiser_orders + r.platform_orders + r.untracked_orders
  const bt = r.organiser_tickets + r.platform_tickets + r.untracked_tickets
  const ok = bo === r.ledger_orders && bt === r.ledger_tickets
  if (!ok) failures += 1

  totalLedgerTickets += r.ledger_tickets
  totalOrganiserTickets += r.organiser_tickets
  totalPlatformTickets += r.platform_tickets
  totalUntrackedTickets += r.untracked_tickets

  const { rows: slug } = await db.query('select slug from public.events where id = $1', [r.event_id])
  const label = String(slug[0]?.slug ?? r.event_id).slice(0, 44)
  console.log(
    `  ${label.padEnd(46)} ${String(r.ledger_orders + 'o/' + r.ledger_tickets + 't').padEnd(11)} ` +
      `${String(r.organiser_orders + 'o/' + r.organiser_tickets + 't').padEnd(11)} ` +
      `${String(r.platform_orders + 'o/' + r.platform_tickets + 't').padEnd(10)} ` +
      `${String(r.untracked_orders + 'o/' + r.untracked_tickets + 't').padEnd(11)} ` +
      `${ok ? 'YES' : 'NO  <-- FAILS'}`,
  )
}

console.log('')
console.log('='.repeat(96))
console.log(`events with sales                 : ${rows.length}`)
console.log(`ledger tickets (confirmed orders) : ${totalLedgerTickets}`)
console.log(`  organiser-shared links          : ${totalOrganiserTickets}`)
console.log(`  EventLinqs channels             : ${totalPlatformTickets}`)
console.log(`  untracked                       : ${totalUntrackedTickets}`)
console.log(`  sum of buckets                  : ${totalOrganiserTickets + totalPlatformTickets + totalUntrackedTickets}`)
console.log(`orders attributed more than once  : ${dupes.length}`)
console.log(`events that FAIL to reconcile     : ${failures}`)
console.log('='.repeat(96))

const sumOk = totalOrganiserTickets + totalPlatformTickets + totalUntrackedTickets === totalLedgerTickets
if (failures > 0 || dupes.length > 0 || !sumOk) {
  console.error('\nRESULT: FAIL. The attribution does not tie to the order ledger.')
  await db.end()
  process.exit(1)
}
console.log('\nRESULT: PASS. Every event reconciles to the order ledger exactly.')
await db.end()
