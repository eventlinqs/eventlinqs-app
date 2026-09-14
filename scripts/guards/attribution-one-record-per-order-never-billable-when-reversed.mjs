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
 * ONE THING IT CANNOT SEE, recorded 14 September 2026 because it took a run to
 * work out and will take another one otherwise. This guard judges whatever
 * database the environment points at, and on THIS machine that is a TEST
 * project three worktrees sell tickets into. Only lane B's tree carries the
 * checkout writer, so an order sold by another lane arrives with no record
 * through no fault of anything, and seven did on 14 September. The guard is not
 * weakened for it and must not be: the remedy is the backfill, which it prints
 * on every such failure, and the condition ends the moment lane B is merged and
 * every tree carries the writer. What IS handled below is the resolution window,
 * which is a real race in the product rather than a fact about this laptop.
 *
 * Run standalone:
 *   node --env-file=.env.local scripts/guards/attribution-one-record-per-order-never-billable-when-reversed.mjs
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { declareWork } from '../lib/work-report.mjs'
import { resolutionGraceMs } from './lib/attribution-grace.mjs'

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

/*
 * THE RESOLUTION GRACE IS A STRUCTURAL CLAIM TOO, and it is read HERE, before a
 * database client exists, for a reason that cost a drill run to find. Read
 * later, a failure has to exit while the supabase client's socket is still in
 * flight, and `process.exit` at that moment aborts Node on Windows with
 * `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)` and the code
 * 3221226505. The guard refused either way, but an abnormal-termination code is
 * not a verdict: it reads as the guard breaking rather than as the guard
 * finding something. Every other source-level claim in this file is settled
 * before the network is touched; this one now is as well.
 */
let RESOLUTION_GRACE_MS = 0
try {
  RESOLUTION_GRACE_MS = resolutionGraceMs()
} catch (error) {
  structural.push(error.message)
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

const { data: rawBreaches, error } = await db
  .from('marketing_attribution_invariant_breaches')
  .select('breach, order_id, order_reference, detail')

if (error) {
  report(0, 0)
  console.error(`${TAG} FAIL: could not read marketing_attribution_invariant_breaches: ${error.message}`)
  process.exit(1)
}

/*
 * THE ONE TOLERANCE, AND IT IS CORRECTNESS RATHER THAN LENIENCY.
 *
 * `recordClickSignalForOrder` writes the signal inside the request and hands the
 * RESOLUTION to `afterResponse`, deliberately: six reads are not something a
 * buyer should wait on to be told about their own purchase. So between the order
 * insert and the resolver finishing there is a window, BY DESIGN, in which an
 * order genuinely has no record and nothing is wrong.
 *
 * The view reports raw truth and is right to; it has no business knowing about a
 * scheduling decision in the application. This guard applies the tolerance,
 * because it is the thing that has to decide whether to fail a build, and a gate
 * that reds on a race it was told to expect is a gate somebody switches off.
 *
 * It is scoped as tightly as it can be: the grace applies ONLY to the
 * no-record clause, only to orders younger than the window, and the count is
 * PRINTED on every run, so a number that starts growing is visible rather than
 * absorbed. An order that is still unresolved after this long is not racing, it
 * is missing, and it fails.
 *
 * THE NUMBER IS NOT WRITTEN HERE. It is read out of
 * `src/lib/attribution/backstop.ts`, which is the one place it is declared and
 * which the scheduled healer imports directly. A guard carrying its own copy
 * would eventually tolerate a different window from the healer, and the failure
 * that produces is a build going red on an order the healer was deliberately
 * leaving alone.
 */
const NO_RECORD = 'order has no attribution record'

let stillResolving = 0
let breaches = rawBreaches ?? []
const unrecorded = breaches.filter(b => b.breach === NO_RECORD).map(b => b.order_id)
if (unrecorded.length > 0) {
  const cutoff = new Date(Date.now() - RESOLUTION_GRACE_MS).toISOString()
  const young = new Set()
  for (let i = 0; i < unrecorded.length; i += 200) {
    const { data } = await db
      .from('orders')
      .select('id')
      .in('id', unrecorded.slice(i, i + 200))
      .gt('created_at', cutoff)
    for (const row of data ?? []) young.add(row.id)
  }
  stillResolving = young.size
  breaches = breaches.filter(b => !(b.breach === NO_RECORD && young.has(b.order_id)))
}

const { count: orders } = await db.from('orders').select('id', { count: 'exact', head: true })

report(orders ?? 0, breaches.length)

console.log(
  `${TAG} the primary key, both triggers and the view are all defined by the migrations; ${orders ?? 0} order(s) judged`,
)
console.log(
  `${TAG} ${stillResolving} order(s) are inside the ${RESOLUTION_GRACE_MS / 60000}-minute resolution window and are not judged yet; the resolver runs after the response by design.`,
)

if (breaches.length > 0) {
  for (const row of breaches) console.error(`${TAG} FAIL: ${row.breach}: ${row.detail}`)
  console.error(`${TAG} ${breaches.length} breach(es) of the attribution invariant.`)

  /*
   * THE ONE BREACH THAT HAS A COMMAND, so the guard hands it over instead of
   * making the reader find it (Law 10).
   *
   * "No attribution record" is the only clause that is routinely a GAP rather
   * than a fault: an order written by any code path that predates the checkout
   * writer has no record and never will until something resolves it. On this
   * machine that happens whenever another lane's worktree, whose tree does not
   * carry the writer, sells a ticket into the shared TEST project - seven
   * arrived that way on 14 September. The remedy is the product's own backfill,
   * it is idempotent, and it only ever fills gaps.
   *
   * The other three clauses have no command: billable-while-reversed, billable
   * on a rung that is not evidence, and a `none` with no reason are all wrong
   * DECISIONS rather than absent ones, and re-running a resolver over them is
   * how a wrong number gets laundered into a confident one.
   */
  if (breaches.some(row => row.breach === 'order has no attribution record')) {
    console.error('')
    console.error(`${TAG} Every one of those is an order with NO record, which the backfill fills:`)
    console.error('')
    console.error('    node --import ./scripts/lib/server-only-shim.mjs \\')
    console.error('         --import ./scripts/lib/src-alias-loader.mjs --env-file=.env.local \\')
    console.error('      scripts/ops/attribution-backfill.mjs')
    console.error('')
    console.error(`${TAG} It refuses production, writes only the orders that have no record, and`)
    console.error('      records "none" with a reason for the ones no campaign produced.')
  }
  process.exit(1)
}

console.log(`${TAG} OK`)
