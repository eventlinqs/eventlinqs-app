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
/** The second surface that draws a curve, added 13 September 2026 (clause three). */
const ADMIN_EVENT = 'src/app/admin/(authed)/events/[id]/page.tsx'

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
  /*
   * THE CALL SITE THESE THREE MUTATE HAD MOVED, AND ALL THREE HAD STOPPED
   * PROVING ANYTHING (found 13 September 2026 by running this harness). They
   * anchored on `  await recordConfirmedOrder(order_id)`, and D1's own reversal
   * condition moved that write off the request path into
   * `afterResponse(..., () => recordConfirmedOrder(order_id))`. All three then
   * reported THE BREAK DID NOTHING, which this harness says loudly and exits
   * non-zero for, so it was findable; nothing had run it since the move. The
   * anchor is now the arrow function, which is the shape of the CALL rather than
   * the shape of the line around it.
   */
  {
    guard: ONE_DOOR,
    name: 'a module outside the engine writes to the ledger',
    file: WEBHOOK,
    break: t =>
      t.replace(
        '() => recordConfirmedOrder(order_id))',
        "() => { void adminClient.from('ledger_entries').insert({ kind: 'sale' }); return recordConfirmedOrder(order_id) })",
      ),
  },
  {
    guard: ONE_DOOR,
    name: 'a confirm site stops recording the sale',
    file: WEBHOOK,
    break: t => t.replace('() => recordConfirmedOrder(order_id))', '() => Promise.resolve())'),
  },
  {
    guard: ONE_DOOR,
    name: 'a module outside the engine calls the writer function',
    file: WEBHOOK,
    break: t =>
      t.replace(
        '() => recordConfirmedOrder(order_id))',
        "() => { void adminClient.rpc('record_ledger_entry', { p_slot: {}, p_entry: {} }); return recordConfirmedOrder(order_id) })",
      ),
  },
  /*
   * CLAUSE THREE, the reading, added with the second surface on 13 September
   * 2026. /admin/events/[id] now draws the same curve for the platform owner,
   * because the one real production event belongs to an outside organiser and
   * the owner had nowhere to read it.
   */
  {
    guard: ONE_DOOR,
    name: 'a surface draws the curve and stops reading the ledger for it',
    file: ADMIN_EVENT,
    break: t => t.replace('const paceCurve = await paceForSlot(id)', 'const paceCurve = null'),
  },
  {
    guard: ONE_DOOR,
    name: 'a surface composes a curve out of literals to make the panel look right',
    file: ADMIN_EVENT,
    break: t =>
      t.replace(
        '<SalesPacePanel curve={paceCurve} tone="console" />',
        '<SalesPacePanel curve={paceCurve ?? { points: [], priceMoves: [], totals: { units: 7, amountCents: 12300, unitsReturned: 0 } }} tone="console" />',
      ),
  },
  {
    /*
     * The blindness clause. The only way to make clause three judge nothing from
     * a single file is to change what it looks for, so this mutates the guard's
     * own constant, exactly as the confirm-site blindness clause would have to.
     * A guard that silently stops judging is the failure mode every baseline in
     * this repository is written to avoid.
     */
    guard: ONE_DOOR,
    name: 'clause three goes blind because the panel it looks for was renamed',
    file: ONE_DOOR,
    break: t => t.replace("const PACE_PANEL = 'SalesPacePanel'", "const PACE_PANEL = 'SalesPacePanelRenamed'"),
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
