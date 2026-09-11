/**
 * Drills the three slot-ledger guards RED on every clause and GREEN again after
 * every restore. Writes the transcript to the evidence path so both directions
 * are on the record rather than asserted.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'

const OUT = process.argv[2] ?? 'C:/dev/EVIDENCE/D1'
mkdirSync(OUT, { recursive: true })

const APPEND_ONLY = 'scripts/guards/ledger-append-only.mjs'
const NO_INDUSTRY = 'scripts/guards/ledger-speaks-no-industry.mjs'
const ONE_DOOR = 'scripts/guards/ledger-writes-through-the-adapter.mjs'

const MIGRATION = 'supabase/migrations/20260910000002_slot_ledger.sql'

const TYPES = 'src/lib/ledger/types.ts'
const WEBHOOK = 'src/app/api/webhooks/stripe/route.ts'
const READER = 'src/lib/ledger/pace.ts'

const run = guard => {
  const r = spawnSync(process.execPath, [guard], { encoding: 'utf8', env: process.env })
  return { code: r.status, text: ((r.stdout ?? '') + (r.stderr ?? '')).trim() }
}

const drills = [
  {
    guard: APPEND_ONLY,
    name: 'a code path edits history',
    file: READER,
    break: t => t.replace('.from(LEDGER_ENTRIES)', ".from('ledger_entries').update({ quantity: 0 })\n    .from('ledger_entries')"),
  },
  {
    guard: NO_INDUSTRY,
    name: 'an engine file says the industry word',
    file: TYPES,
    break: t => t.replace('/** Which platform a row came from.', '/** Which ticket platform a row came from.'),
  },
  {
    guard: NO_INDUSTRY,
    name: 'a ledger column is named for the industry',
    file: MIGRATION,
    break: t => t.replace('  buyer_hash text,', '  ticket_hash text,'),
  },
  {
    guard: ONE_DOOR,
    name: 'a module outside the engine writes to the ledger',
    file: WEBHOOK,
    break: t =>
      t.replace(
        '  await recordConfirmedOrder(order_id)',
        "  await adminClient.from('ledger_entries').insert({ kind: 'sale' })\n  await recordConfirmedOrder(order_id)",
      ),
  },
  {
    guard: ONE_DOOR,
    name: 'a confirm site stops recording the sale',
    file: WEBHOOK,
    break: t => t.replace('  await recordConfirmedOrder(order_id)', '  // await recordConfirmedOrder(order_id)'),
  },
  {
    guard: ONE_DOOR,
    name: 'a module outside the engine calls the writer function',
    file: WEBHOOK,
    break: t =>
      t.replace(
        '  await recordConfirmedOrder(order_id)',
        "  await adminClient.rpc('record_ledger_entry', { p_slot: {}, p_entry: {} })\n  await recordConfirmedOrder(order_id)",
      ),
  },
]

const lines = ['THE THREE SLOT-LEDGER GUARDS, DRILLED BOTH WAYS', '='.repeat(47), '']
let ok = true

for (const guard of [APPEND_ONLY, NO_INDUSTRY, ONE_DOOR]) {
  const green = run(guard)
  lines.push(`BASELINE ${guard}  exit ${green.code}`, ...green.text.split('\n').map(l => `    ${l}`), '')
  if (green.code !== 0) ok = false
}

for (const drill of drills) {
  const original = readFileSync(drill.file, 'utf8')
  const broken = drill.break(original)
  if (broken === original) {
    lines.push(`DRILL ${drill.guard} :: ${drill.name}: THE BREAK DID NOTHING, so nothing was proved.`, '')
    ok = false
    continue
  }
  writeFileSync(drill.file, broken)
  const red = run(drill.guard)
  writeFileSync(drill.file, original)
  const back = run(drill.guard)
  lines.push(
    `DRILL ${drill.guard}`,
    `  ${drill.name}`,
    `  broken   exit ${red.code}   ${red.code === 1 ? 'RED, as required' : 'DID NOT FAIL'}`,
    ...red.text.split('\n').map(l => `      ${l}`),
    `  restored exit ${back.code}  ${back.code === 0 ? 'GREEN again' : 'STILL RED'}`,
    '',
  )
  if (red.code !== 1 || back.code !== 0) ok = false
}

lines.push(ok ? `ALL ${drills.length} CLAUSES DRILLED RED AND GREEN.` : 'A CLAUSE DID NOT DRILL. See above.')
const text = lines.join('\n') + '\n'
writeFileSync(join(OUT, 'guard-ledger-drill.txt'), text)
console.log(text)
process.exit(ok ? 0 : 1)
