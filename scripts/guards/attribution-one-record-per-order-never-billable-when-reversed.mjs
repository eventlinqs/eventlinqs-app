/**
 * GUARD: ONE ATTRIBUTION RECORD PER ORDER, AND NEVER BILLABLE WHEN REVERSED.
 *
 * Close-out GA3. The attribution table is the basis of an invoice, so two
 * things about it have to be true on every build and neither can be left to the
 * code that wrote the rows.
 *
 *   1. EVERY ORDER HAS EXACTLY ONE RECORD, never zero and never two, and an
 *      order no campaign produced says so with a stored reason rather than
 *      falling off the edge of a query. Zero is the dangerous one: an order
 *      with no record is a sale nobody can account for six months later, and it
 *      is invisible to every report because reports join. Two is impossible
 *      while `order_id` is the primary key, and is checked anyway, because a
 *      guard that trusts a constraint cannot notice the constraint being
 *      dropped.
 *   2. NOTHING REPORTS BILLABLE WHILE A REVERSAL EXISTS FOR IT. A fee charged
 *      on a sale that was handed back is a debt to the client plus the loss of
 *      every number we show them afterwards.
 *
 * It also checks the two clauses that make those two possible: billable is only
 * ever true on a rung that ties the order to a click (1, 2 or 3), and rung 4,
 * which measured over 308 real TEST orders attributed 140 sales no campaign
 * produced, is an observation and never an invoice line.
 *
 * WHAT IT READS. `public.marketing_attribution_invariant_breaches`, one view
 * that defines every clause in SQL, so this guard and a person opening the
 * database read ONE definition rather than two descriptions of it. It also
 * reads the migrations, so the structural halves (the primary key, the two
 * triggers that compute billable, and the view itself) cannot be deleted
 * without this failing even when the data happens to be clean.
 *
 * SKIP OR FAIL, and the distinction is narrow and deliberate: CI's typecheck
 * build carries PLACEHOLDER Supabase values and has no database behind it on
 * purpose, so this SKIPS there, loudly, naming why. With a real project URL it
 * CHECKS, and an unreachable database FAILS, because "could not look" reported
 * as a pass is the shape this repository has spent weeks removing.
 *
 * Run standalone:
 *   node --env-file=.env.local scripts/guards/attribution-one-record-per-order-never-billable-when-reversed.mjs
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { declareWork } from '../lib/work-report.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')
const TAG = '[attribution-one-record-per-order]'
const MIGRATIONS = join(ROOT, 'supabase', 'migrations')

/* ---------------------------------------------------------- the structural half */

function allMigrationSql() {
  if (!existsSync(MIGRATIONS)) return { sql: '', files: 0 }
  const names = readdirSync(MIGRATIONS).filter(n => n.endsWith('.sql')).sort()
  let sql = ''
  for (const n of names) sql += readFileSync(join(MIGRATIONS, n), 'utf8') + '\n'
  return { sql: sql.replace(/\s+/g, ' ').toLowerCase(), files: names.length }
}

const STRUCTURAL_CLAUSES = [
  {
    needle: 'order_id uuid primary key references public.orders(id) on delete cascade, decision text not null',
    problem:
      'no migration makes order_id the PRIMARY KEY of public.marketing_attribution. Without it a second record for one order is refused by nothing, and one order can carry two different decisions.',
  },
  {
    needle: 'before insert or update on public.marketing_attribution for each row execute function public.marketing_attribution_set_billable()',
    problem:
      'no migration puts the billable trigger on public.marketing_attribution. Without it billable becomes a column an application can type, which is the one thing GA3 forbids about it.',
  },
  {
    needle: 'after insert or delete on public.marketing_attribution_reversal for each row execute function public.marketing_attribution_reversal_recompute()',
    problem:
      'no migration puts the recompute trigger on public.marketing_attribution_reversal. Without it a late chargeback leaves billable reading true until somebody runs a backfill, which is exactly the lag GA3 says must not exist.',
  },
  {
    needle: 'create or replace view public.marketing_attribution_invariant_breaches',
    problem:
      'public.marketing_attribution_invariant_breaches is not defined by any migration, so this guard has nothing to read and the invariant is stated nowhere in SQL.',
  },
]

const structural = []
const { sql, files } = allMigrationSql()
for (const clause of STRUCTURAL_CLAUSES) {
  if (!sql.includes(clause.needle)) structural.push(clause.problem)
}

/* ------------------------------------------------------------- the data half */

if (!process.env.NEXT_PUBLIC_SUPABASE_URL && existsSync(join(ROOT, '.env.test'))) {
  for (const line of readFileSync(join(ROOT, '.env.test'), 'utf8').split(String.fromCharCode(10))) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim())
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
  }
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const REAL_PROJECT = /^https:\/\/[a-z0-9]{20,}\.supabase\.co\/?$/
const hasRealProject = typeof url === 'string' && REAL_PROJECT.test(url.trim())

function report(ordersJudged, breaches) {
  declareWork('attribution-one-record-per-order-never-billable-when-reversed', {
    did: {
      'migration read': files,
      'structural clause checked': STRUCTURAL_CLAUSES.length,
      'order judged': ordersJudged,
    },
    found: { 'attribution invariant breach': breaches + structural.length },
    zeroIsFine: {
      /*
       * A platform with no orders has nothing to attribute, and that is the
       * true state rather than a check that failed to look. The structural half
       * is counted separately and is never zero, so this guard can still only
       * pass by having done something.
       */
      'order judged':
        'no order exists on this project yet, so there is nothing to attribute. The structural half still ran.',
    },
  })
}

if (structural.length > 0) {
  report(0, 0)
  for (const problem of structural) console.error(`${TAG} FAIL: ${problem}`)
  process.exit(1)
}

if (url && !hasRealProject) {
  report(0, 0)
  console.log(`${TAG} the primary key, both triggers and the view are all defined by the migrations`)
  console.log('')
  console.log('SKIP: NEXT_PUBLIC_SUPABASE_URL is not a real Supabase project URL')
  console.log(`      (${url.length} characters), so there are no attribution rows to judge.`)
  console.log('      This is the CI typecheck build, which uses placeholders by design.')
  process.exit(0)
}

if (!url || !key) {
  report(0, 0)
  console.error('')
  console.error(`${TAG} FAIL: no Supabase URL or key in the environment, so the stored`)
  console.error('      attributions could not be checked. A check that cannot look is not a')
  console.error('      check that passed.')
  process.exit(1)
}

const db = createClient(url, key, { auth: { persistSession: false } })

const { data: breaches, error } = await db
  .from('marketing_attribution_invariant_breaches')
  .select('breach, order_id, order_reference, detail')

if (error) {
  report(0, 0)
  console.error(`${TAG} FAIL: could not read marketing_attribution_invariant_breaches: ${error.message}`)
  process.exit(1)
}

const { count: orders } = await db.from('orders').select('id', { count: 'exact', head: true })

report(orders ?? 0, (breaches ?? []).length)

console.log(
  `${TAG} the primary key, both triggers and the view are all defined by the migrations; ${orders ?? 0} order(s) judged`,
)

if ((breaches ?? []).length > 0) {
  for (const row of breaches) console.error(`${TAG} FAIL: ${row.breach}: ${row.detail}`)
  console.error(`${TAG} ${breaches.length} breach(es) of the attribution invariant.`)
  process.exit(1)
}

console.log(`${TAG} OK`)
