/**
 * THE ONE PRODUCTION WRITE THE FOUNDER APPROVED, AS ONE COMMAND THAT PROVES
 * ITSELF. Close-out D1, approval given 11 September 2026:
 *
 *   "running scripts/ops/backfill-slot-ledger.mjs against production once,
 *    only after the slot ledger migration is on production, backfilling only
 *    what was genuinely recorded, and reporting the row count it wrote and the
 *    count a second run writes, which must be 0."
 *
 * WHAT THIS DOES, in order, and it stops at the first thing that is not so:
 *
 *   1. REFUSES BEFORE IT ACTS. The approval must be named on the command line
 *      (--approved-by-founder "<who, and the date>") and the production write
 *      preflight must pass, which means ALLOW_PRODUCTION_SUPABASE=1 in the
 *      SHELL for this run, never in a file (scripts/lib/production-write-
 *      preflight.mjs refuses a parked approval by design). Both are checked
 *      before any key is fetched and before any request that could write.
 *   2. OBSERVES BEFORE. Counts the ledger on production through the Management
 *      API query endpoint, SELECT only, and confirms the ledger tables exist.
 *   3. HOLDS THE CREDENTIAL IN MEMORY ONLY. The production service_role key is
 *      read from the Management API (GET /v1/projects/{ref}/api-keys?reveal=true,
 *      https://supabase.com/docs/reference/api/v1-get-project-api-keys, fetched
 *      12 September 2026, scope secrets:read) and handed to the child process
 *      environment. It is never printed, never written to a file, never passed
 *      as an argument.
 *   4. RUNS THE REAL BACKFILL, TWICE. The same scripts/ops/backfill-slot-ledger.mjs
 *      that was proven on TEST, through the same adapter a live sale uses. The
 *      first run writes; the second must write 0, which is the idempotency the
 *      approval asks to see.
 *   5. OBSERVES AFTER. Counts again and refuses to call the run a success unless
 *      the ledger grew by exactly what the first run reported and the second run
 *      left it alone. Then lists the rows the slot D1 names now carries.
 *
 * --dry-run does steps 1 to 3 and one dry-run child, and writes nothing.
 *
 * Usage (PowerShell, from the repository, on mains):
 *   $env:ALLOW_PRODUCTION_SUPABASE = "1"
 *   powershell -File scripts/ops/with-supabase-token.ps1 node scripts/ops/backfill-slot-ledger-production-once.mjs --approved-by-founder "Lawal Adams, 11 September 2026"
 *   Remove-Item Env:ALLOW_PRODUCTION_SUPABASE
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { assertNotProduction } from '../lib/production-write-preflight.mjs'
import { declareWork } from '../lib/work-report.mjs'

const TAG = '[backfill-production-once]'
const PRODUCTION = 'gndnldyfudbytbboxesk'
const PRODUCTION_URL = `https://${PRODUCTION}.supabase.co`
const NAMED_ORDER = 'EL-9HE57YNV'

const argv = process.argv.slice(2)
const DRY_RUN = argv.includes('--dry-run')
const approvedAt = argv.indexOf('--approved-by-founder')
const APPROVED_BY = approvedAt >= 0 ? String(argv[approvedAt + 1] ?? '').trim() : ''
let out = 'C:/dev/EVIDENCE/D1/2026-09-12'
const outAt = argv.indexOf('--evidence')
if (outAt >= 0 && argv[outAt + 1]) out = argv[outAt + 1]

const lines = []
const say = (s) => {
  lines.push(s)
  console.log(s)
}
const refuse = (why) => {
  console.error(`${TAG} REFUSED: ${why}`)
  process.exit(1)
}

/* ----------------------------------------------------- 1. refuse first */

if (!APPROVED_BY) {
  refuse(
    'no approval named. A production backfill is run once, with the founder\'s approval named on the command line: ' +
      '--approved-by-founder "<who, and the date>". Nothing was read and nothing was written.',
  )
}
if (process.env.ALLOW_PRODUCTION_SUPABASE !== '1') {
  refuse(
    'ALLOW_PRODUCTION_SUPABASE=1 is not in the shell. The production write preflight will not pass without it, ' +
      'and it must be given in the shell for this one run, never parked in a file. Nothing was read and nothing was written.',
  )
}
/*
 * The preflight judges the target this process resolves. Point it at production
 * explicitly, and take the PREVIEW pair out of the way so nothing lower down can
 * re-point the write at TEST (src/lib/supabase/env.ts prefers the PREVIEW names
 * when they are present). Then let the preflight decide.
 */
process.env.NEXT_PUBLIC_SUPABASE_URL = PRODUCTION_URL
delete process.env.NEXT_PUBLIC_SUPABASE_URL_PREVIEW
delete process.env.SUPABASE_SERVICE_ROLE_KEY_PREVIEW
delete process.env.SUPABASE_SERVICE_ROLE_KEY
delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY_PREVIEW
assertNotProduction()

/*
 * THE HASH KEY IS PART OF THE WRITE. Found on the approved run of 12 September
 * 2026, after it had written: the adapter keys every buyer_hash with the
 * deployment's ORDER_ACCESS_SECRET, this process had none in its shell, and the
 * child printed "buyer hashes are unsalted on this deployment". The three rows
 * are correct in every recorded fact and carry a hash keyed with an EMPTY
 * secret, which production's live rows are not. The engine now recognises both
 * (src/lib/ledger/identity.ts, identityFingerprints), so nothing is lost, but a
 * write must never again run without the target deployment's own key: the
 * founder supplies it in the shell for the one run, and this refuses otherwise.
 * A dry run writes no hash and needs no key.
 */
if (!DRY_RUN && !(process.env.ORDER_ACCESS_SECRET ?? '').trim()) {
  refuse(
    'ORDER_ACCESS_SECRET is not in the shell. The adapter keys every buyer_hash with the deployment\'s own secret, so a backfill ' +
      'written without it hashes buyers differently from the live rows beside them. Supply the production value in the shell for this ' +
      'one run (it is never printed and never read from a file). Nothing was read and nothing was written.',
  )
}

const token = process.env.SUPABASE_ACCESS_TOKEN
if (!token) {
  refuse(
    `SUPABASE_ACCESS_TOKEN is not set. Run through the helper: powershell -File scripts/ops/with-supabase-token.ps1 node ${process.argv[1]} ...`,
  )
}

say(`${TAG} target ${PRODUCTION} (PRODUCTION), mode ${DRY_RUN ? 'DRY RUN, nothing is written' : 'WRITING, ONCE'}`)
say(`${TAG} approval named on the command line: ${APPROVED_BY}`)

/* ------------------------------------------------ 2. observe before */

/** SELECT-only against production, through the Management API. */
async function query(sql) {
  if (!/^\s*select/i.test(sql)) throw new Error('this script reads production with SELECT only; the write goes through the backfill and its adapter')
  const res = await fetch(`https://api.supabase.com/v1/projects/${PRODUCTION}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`)
  return res.json()
}

async function observe() {
  const [tables] = await query(
    "select to_regclass('public.ledger_entries')::text as entries, to_regclass('public.ledger_slots')::text as slots",
  )
  if (!tables?.entries || !tables?.slots) {
    refuse(`the ledger tables are not on production (entries=${tables?.entries ?? 'ABSENT'}, slots=${tables?.slots ?? 'ABSENT'}); the migration is the founder's step and has not landed`)
  }
  const [totals] = await query('select count(*)::int as entries from public.ledger_entries')
  const byKind = await query('select kind::text as kind, count(*)::int as n from public.ledger_entries group by kind order by kind')
  const [slots] = await query('select count(*)::int as slots from public.ledger_slots')
  return {
    entries: totals.entries,
    slots: slots.slots,
    byKind: Object.fromEntries(byKind.map((r) => [r.kind, r.n])),
  }
}

const before = await observe()
say(`${TAG} BEFORE: ${before.entries} ledger entr${before.entries === 1 ? 'y' : 'ies'} (${JSON.stringify(before.byKind)}), ${before.slots} slot(s)`)

/* --------------------------------------------- 3. the credential */

const keysRes = await fetch(`https://api.supabase.com/v1/projects/${PRODUCTION}/api-keys?reveal=true`, {
  headers: { Authorization: `Bearer ${token}` },
})
if (!keysRes.ok) refuse(`could not read the project's API keys (HTTP ${keysRes.status}); the token lacks secrets:read or the endpoint moved`)
const keys = await keysRes.json()
const serviceRole = (Array.isArray(keys) ? keys : []).find((k) => k?.name === 'service_role' && typeof k.api_key === 'string' && k.api_key.length > 0)
if (!serviceRole) refuse('no service_role key was returned for the project; nothing was written')
say(`${TAG} service_role key read for ${PRODUCTION} (length ${serviceRole.api_key.length}); held in memory for the child process only`)

/* ------------------------------------------------ 4. run it, twice */

function runBackfill(label, dryRun) {
  const args = ['--import', './scripts/lib/src-alias-loader.mjs', 'scripts/ops/backfill-slot-ledger.mjs', '--approved-by-founder', APPROVED_BY, '--limit', '2000']
  if (dryRun) args.push('--dry-run')
  const env = { ...process.env }
  delete env.NEXT_PUBLIC_SUPABASE_URL_PREVIEW
  delete env.SUPABASE_SERVICE_ROLE_KEY_PREVIEW
  delete env.NEXT_PUBLIC_SUPABASE_ANON_KEY_PREVIEW
  env.NEXT_PUBLIC_SUPABASE_URL = PRODUCTION_URL
  env.SUPABASE_SERVICE_ROLE_KEY = serviceRole.api_key
  env.ALLOW_PRODUCTION_SUPABASE = '1'
  const r = spawnSync(process.execPath, args, { encoding: 'utf8', env, maxBuffer: 64 * 1024 * 1024 })
  const text = `${r.stdout ?? ''}${r.stderr ?? ''}`
  say(`${TAG} ---- ${label} (exit ${r.status}) ----`)
  for (const line of text.split(/\r?\n/)) {
    if (line.trim() === '' || /MODULE_TYPELESS_PACKAGE_JSON|Reparsing as ES module|To eliminate this warning|--trace-warnings/.test(line)) continue
    say(`${TAG}   ${line}`)
  }
  const wrote = Number(/\b(?:wrote|would write) (\d+) row\(s\)/.exec(text)?.[1] ?? NaN)
  const already = Number(/\b(\d+) row\(s\) were already recorded/.exec(text)?.[1] ?? NaN)
  const failed = Number(/\b(\d+) row\(s\) FAILED/.exec(text)?.[1] ?? 0)
  return { status: r.status, wrote, already, failed }
}

const faults = []
const first = runBackfill(DRY_RUN ? 'dry run' : 'run 1, the write', DRY_RUN)
if (first.status !== 0) faults.push(`the ${DRY_RUN ? 'dry run' : 'first run'} exited ${first.status}`)
if (!Number.isFinite(first.wrote)) faults.push('the first run did not report how many rows it wrote')
if (first.failed > 0) faults.push(`the first run reported ${first.failed} failed row(s)`)

let second = null
if (!DRY_RUN) {
  second = runBackfill('run 2, must write 0', false)
  if (second.status !== 0) faults.push(`the second run exited ${second.status}`)
  if (second.wrote !== 0) faults.push(`the second run wrote ${second.wrote} row(s); the approval requires 0`)
}

/* ------------------------------------------------- 5. observe after */

const after = await observe()
say(`${TAG} AFTER:  ${after.entries} ledger entr${after.entries === 1 ? 'y' : 'ies'} (${JSON.stringify(after.byKind)}), ${after.slots} slot(s)`)
const grewBy = after.entries - before.entries
if (DRY_RUN) {
  if (grewBy !== 0) faults.push(`a dry run changed the ledger by ${grewBy} row(s)`)
} else {
  if (grewBy !== first.wrote) faults.push(`the ledger grew by ${grewBy} row(s) but the first run reported ${first.wrote}`)
}

const slotRows = await query(
  "select s.source_ref, e.kind::text as kind, e.occurred_at, e.days_out, e.quantity, e.amount_cents, e.inventory_class " +
    'from public.ledger_entries e join public.ledger_slots s on s.id = e.slot_id ' +
    // Compared as text on both sides: source_ref is the slot's own reference
    // column and the order's event_id is a uuid, and Postgres will not compare
    // the two without being told to (42883 on the first dry run).
    `where s.source_ref::text = (select event_id::text from public.orders where order_number = '${NAMED_ORDER}' limit 1) ` +
    'order by e.occurred_at',
)
say(`${TAG} the slot of ${NAMED_ORDER} now carries ${slotRows.length} ledger row(s):`)
for (const r of slotRows) {
  say(`${TAG}   ${r.kind}  ${r.occurred_at}  days_out ${r.days_out}  x${r.quantity}  ${(r.amount_cents / 100).toFixed(2)}  ${r.inventory_class ?? ''}`)
}
if (!DRY_RUN && slotRows.length === 0) faults.push(`the slot of ${NAMED_ORDER} carries no ledger row after the write`)

declareWork('backfill-production-once', {
  did: {
    'production read taken': 2,
    'backfill run': DRY_RUN ? 1 : 2,
    'ledger row written': DRY_RUN ? 0 : first.wrote,
  },
  found: { 'assertion that did not hold': faults.length },
  zeroIsFine: { 'ledger row written': 'a dry run writes nothing by definition' },
  exitOnZero: false,
})

say('')
say(`${TAG} SUMMARY: before ${before.entries}, first run ${DRY_RUN ? 'would write' : 'wrote'} ${first.wrote}, ` +
  `${second ? `second run wrote ${second.wrote}, ` : ''}after ${after.entries}, grew by ${grewBy}`)
for (const f of faults) console.error(`${TAG} FAIL: ${f}`)

mkdirSync(out, { recursive: true })
const file = join(out, DRY_RUN ? 'production-backfill-dry-run.txt' : 'production-backfill.txt')
writeFileSync(file, lines.join('\n') + '\n', 'utf8')
say(`${TAG} written to ${file}`)
if (faults.length > 0) process.exit(1)
say(`${TAG} PASS`)
