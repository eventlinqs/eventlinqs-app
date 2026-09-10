/**
 * WHAT THE SLOT LEDGER WILL HOLD FOR PRODUCTION, ESTABLISHED WITHOUT WRITING A
 * ROW OR HOLDING A CREDENTIAL THAT COULD. Close-out D1.
 *
 * ----------------------------------------------------------------------------
 * THE PROBLEM THIS SOLVES. D1's acceptance line names a production order by its
 * number: "pull the complete curve for the Afro-Fusion slot including order
 * EL-9HE57YNV and render it". That order is real, and it is on production only.
 * Two things stand between it and a rendered curve, and neither is mine:
 *
 *   1. Production has no ledger tables. `to_regclass('public.ledger_entries')`
 *      answers null on gndnldyfudbytbboxesk, because 20260910000002 is pending
 *      along with five others, and applying a migration to production is the
 *      founder's step (CLAUDE.md, Verification and gates, Migrations).
 *   2. The backfill is a WRITE, and a production write needs Lawal's explicit
 *      approval. `judgeBackfillTarget` in the backfill script refuses it by
 *      construction, and that refusal is not softened here.
 *
 * So rather than promise what will appear, this establishes it: the real
 * production orders are READ, and the real `backfillOrder` decides what it
 * would write from them. When the migration lands, this is the answer.
 *
 * ----------------------------------------------------------------------------
 * WHY IT CANNOT WRITE, STRUCTURALLY RATHER THAN BY PROMISE. This process never
 * holds a production service-role key. It reads through the Management API
 * query endpoint with the CLI token, behind a SELECT-only assertion, which is
 * the same read-only route the repository already uses for production checks
 * (scripts/verify/published-url-graveyard.mjs). A `db` SHIM built on that route
 * is handed to `backfillOrder`, and the shim implements reads and nothing else:
 * there is no insert, update, upsert or rpc on it to call.
 *
 * WHY IT IMPORTS `backfillOrder` RATHER THAN DECIDING FOR ITSELF. The whole
 * value of the answer is that it is the SAME decision the real backfill will
 * make. A second implementation here would be a forecast, and a forecast that
 * disagreed with the backfill would be worse than no forecast at all.
 *
 * Usage (the token comes from the Credential Manager helper):
 *   powershell -File scripts/ops/with-supabase-token.ps1 \
 *     node scripts/verify/d1-production-dry-run.mjs --out C:/dev/EVIDENCE/D1
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { backfillOrder, judgeBackfillTarget } from '../ops/backfill-slot-ledger.mjs'

const TAG = '[d1-production-dry-run]'
const PRODUCTION = 'gndnldyfudbytbboxesk'

const args = process.argv.slice(2)
let out = 'C:/dev/EVIDENCE/D1'
for (let i = 0; i < args.length; i += 1) if (args[i] === '--out') out = args[++i]
mkdirSync(out, { recursive: true })

const token = process.env.SUPABASE_ACCESS_TOKEN
if (!token) {
  console.error(`${TAG} SUPABASE_ACCESS_TOKEN is not set, so production cannot be read.`)
  console.error(`${TAG} Run it through the helper: powershell -File scripts/ops/with-supabase-token.ps1 node ${process.argv[1]}`)
  process.exit(1)
}

const lines = []
const say = (s) => {
  lines.push(s)
  console.log(s)
}

/** SELECT-only against production, through the Management API. */
async function query(sql) {
  if (!/^\s*select/i.test(sql)) throw new Error('this script is SELECT-only')
  const res = await fetch(`https://api.supabase.com/v1/projects/${PRODUCTION}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`)
  return res.json()
}

const lit = (v) => `'${String(v).replace(/'/g, "''")}'`

/**
 * A READ-ONLY `db` with exactly the two shapes `backfillOrder` uses in dry-run
 * mode, and nothing else. There is no write method on this object to call.
 */
const db = {
  from(table) {
    const state = { table, columns: '*', where: [] }
    const chain = {
      select(columns) {
        state.columns = columns
        return chain
      },
      eq(column, value) {
        state.where.push(`${column} = ${lit(value)}`)
        return chain
      },
      in(column, values) {
        state.where.push(values.length ? `${column} in (${values.map(lit).join(', ')})` : 'false')
        return chain
      },
      async then(resolve, reject) {
        const where = state.where.length ? ` where ${state.where.join(' and ')}` : ''
        try {
          const rows = await query(`select ${state.columns} from public.${state.table}${where}`)
          resolve({ data: rows, error: null })
        } catch (error) {
          // A table that does not exist yet is the EXPECTED answer on production
          // and must read as "nothing is recorded", not as a crash. Anything
          // else is re-raised, because a swallowed read fault here would silently
          // turn into "every row would be written".
          if (/does not exist/i.test(error.message) && state.table.startsWith('ledger_')) {
            resolve({ data: [], error: null })
            return
          }
          reject(error)
        }
      },
    }
    return chain
  },
}

/* -------------------------------------------------------------------------
 * THE RUN
 * ---------------------------------------------------------------------- */
say(`${TAG} project ${PRODUCTION} (PRODUCTION), read only, through the Management API query endpoint`)

const refusal = judgeBackfillTarget({ url: `https://${PRODUCTION}.supabase.co`, dryRun: false })
say(
  `${TAG} the backfill's own judgement on a production WRITE: ${refusal.allowed ? 'ALLOWED' : 'REFUSED'} - ${refusal.reason}`,
)
if (refusal.allowed) {
  console.error(`${TAG} FAULT: judgeBackfillTarget would allow a production write without --dry-run.`)
  process.exit(1)
}

const installed = await query(
  "select to_regclass('public.ledger_entries')::text as entries, to_regclass('public.ledger_slots')::text as slots",
)
const haveLedger = Boolean(installed[0]?.entries)
say(
  `${TAG} ledger tables on production: entries=${installed[0]?.entries ?? 'ABSENT'}, slots=${installed[0]?.slots ?? 'ABSENT'}` +
    (haveLedger ? '' : ' (migration 20260910000002 is pending; applying it is the founder\'s step)'),
)

const orders = await query(
  "select o.id, o.order_number, o.event_id, o.confirmed_at, o.total_cents, o.status, e.title, e.slug, e.start_date " +
    'from public.orders o join public.events e on e.id = o.event_id ' +
    "where o.status = 'confirmed' order by o.confirmed_at",
)
say(`${TAG} ${orders.length} confirmed production order(s) to consider`)

let would = 0
let already = 0
const perSlot = new Map()
for (const order of orders) {
  const tally = await backfillOrder({ db, order, adapter: null, dryRun: true })
  would += tally.written
  already += tally.alreadyThere
  const seen = perSlot.get(order.event_id) ?? { title: order.title, slug: order.slug, startDate: order.start_date, rows: [] }
  seen.rows.push(...tally.wouldWrite)
  perSlot.set(order.event_id, seen)
  for (const line of tally.wouldWrite) say(`${TAG}   WOULD WRITE  ${line}`)
}

say('')
say(`${TAG} would write ${would} sale row(s); ${already} already recorded`)

/*
 * THE ORDER THE CLOSE-OUT NAMES, called out by name rather than left for a
 * reader to find in a list. It is not typed as a filter anywhere above: every
 * order production holds was considered, and this only reports which one it is.
 */
const named = orders.find((o) => o.order_number === 'EL-9HE57YNV')
say('')
if (named) {
  const slot = perSlot.get(named.event_id)
  say(`${TAG} THE ORDER D1 NAMES: ${named.order_number}`)
  say(`${TAG}   slot        "${named.title}"`)
  say(`${TAG}   slot id     ${named.event_id}`)
  say(`${TAG}   slot at     ${named.start_date}`)
  say(`${TAG}   confirmed   ${named.confirmed_at}`)
  say(`${TAG}   paid        ${(named.total_cents / 100).toFixed(2)} AUD`)
  say(`${TAG}   the ledger rows this slot would carry, in full:`)
  for (const row of slot?.rows ?? []) say(`${TAG}     ${row}`)
  if (!slot?.rows.length) say(`${TAG}     none, which would be a fault: this order is confirmed and has ticket items`)
} else {
  say(`${TAG} EL-9HE57YNV is NOT among production's confirmed orders. Reported rather than assumed away.`)
}

writeFileSync(join(out, 'production-dry-run.txt'), lines.join('\n'), 'utf8')
say('')
say(`${TAG} written to ${join(out, 'production-dry-run.txt')}`)

const ok = Boolean(named) && (perSlot.get(named?.event_id)?.rows.length ?? 0) > 0
if (!ok) {
  console.error(`${TAG} FAIL: the order D1 names produced no ledger rows.`)
  process.exit(1)
}
console.log(`${TAG} PASS`)
