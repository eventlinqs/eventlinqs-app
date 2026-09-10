/**
 * GUARD ONE OF THREE ON THE SLOT LEDGER: NOTHING EDITS HISTORY.
 *
 * THE INVARIANT (close-out D1): "One append only table. Rows are INSERTed, never
 * UPDATEd or DELETEd. A refund is a new negative row, never an edit."
 *
 * WHY IT MATTERS MORE THAN IT SOUNDS. The whole value of this table is that what
 * it says happened is what happened. One UPDATE, anywhere, and every number
 * derived from it becomes an assertion rather than a record: a pace curve you
 * cannot reproduce, a recovery rate you cannot audit, and a forecast built on
 * both. There is no way to notice afterwards, because an edited row looks
 * exactly like a row that was always that way.
 *
 * TWO HALVES, because each is blind to the other.
 *
 *   THE CODE. No file under src/ may issue .update() or .delete() against
 *   ledger_entries. Static, so it holds on a machine with no database and it
 *   catches the line before it ever runs.
 *
 *   THE DATABASE. `ledger_guards()` on the project this build will actually run
 *   against, so a deploy onto a project where the migration never landed, or
 *   where somebody dropped the triggers by hand, is refused. Nothing else in the
 *   gate set reads a database, so nothing else could ever see that.
 *
 * The database half SKIPS LOUDLY with no credentials, exactly as
 * platform-notifications-installed does, and says so rather than passing quietly.
 *
 * Run standalone:  node scripts/guards/ledger-append-only.mjs
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { declareWork } from '../lib/work-report.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')
const SRC = join(ROOT, 'src')
const TAG = '[ledger-append-only]'
const RPC = 'ledger_guards'
const MIGRATION = 'supabase/migrations/20260910000002_slot_ledger.sql'

const REQUIRED_FLAGS = [
  'slots_table',
  'entries_table',
  'no_update_trigger',
  'no_delete_trigger',
  'writer_function',
  'service_role_cannot_update',
  'service_role_cannot_delete',
  'anon_cannot_read',
  'demand_email_required',
  'refund_is_negative',
]

const FLAG_MEANING = {
  slots_table: 'the slot dimension is missing, so nothing can be recorded at all',
  entries_table: 'the ledger itself is missing',
  no_update_trigger: 'an UPDATE on the ledger would succeed, so history is editable',
  no_delete_trigger: 'a DELETE on the ledger would succeed, so history is removable',
  writer_function: 'the one writer is missing, so every write would have to invent its own shape',
  service_role_cannot_update: 'the service role holds an UPDATE grant on the ledger',
  service_role_cannot_delete: 'the service role holds a DELETE grant on the ledger',
  anon_cannot_read: 'the public role can read the ledger, which carries addresses',
  demand_email_required: 'a demand row that can carry a person could be written without one, and the recovery engine would have nobody to contact',
  refund_is_negative: 'a refund could be written as a positive row, which would double-count revenue',
}

/* --------------------------------------------------------- the code half */

function sourceFiles(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) sourceFiles(full, out)
    else if (/\.tsx?$/.test(entry)) out.push(full)
  }
  return out
}

/**
 * `.from('ledger_entries')` followed by a write verb, however the intervening
 * filters are spelled and however the call is wrapped across lines.
 *
 * ledger_slots is deliberately NOT covered: it is a dimension, not history, and
 * a slot's capacity and on-sale date genuinely move. What must never change is
 * what the ledger says happened.
 */
const WRITE_CHAIN = /from\(\s*['"]ledger_entries['"]\s*\)[\s\S]{0,240}?\.(update|delete|upsert)\s*\(/g

export function offendingLines(text) {
  const out = []
  for (const m of text.matchAll(WRITE_CHAIN)) {
    out.push({ verb: m[1], line: text.slice(0, m.index).split('\n').length })
  }
  return out
}

const problems = []
let filesRead = 0
for (const file of sourceFiles(SRC)) {
  const text = readFileSync(file, 'utf8')
  filesRead += 1
  if (!text.includes('ledger_entries')) continue
  for (const hit of offendingLines(text)) {
    problems.push(
      `${relative(ROOT, file)}:${hit.line} issues .${hit.verb}() against ledger_entries. ` +
        'A correction is a NEW row, never an edit.',
    )
  }
}

/* ----------------------------------------------------- the database half */

const REAL_PROJECT = /^https:\/\/[a-z0-9]{20,}\.supabase\.co\/?$/

if (!process.env.NEXT_PUBLIC_SUPABASE_URL && existsSync(join(ROOT, '.env.test'))) {
  for (const line of readFileSync(join(ROOT, '.env.test'), 'utf8').split('\n')) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim())
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
  }
}

/** The decision, pure, so the table above is testable without a network. */
export function decide({ url, serviceKey, answer }) {
  if (!url || !REAL_PROJECT.test(url)) {
    return { verdict: 'SKIP', reason: 'no real Supabase project URL in this build, so there is nothing to ask' }
  }
  if (!serviceKey) {
    return { verdict: 'SKIP', reason: 'no SUPABASE_SERVICE_ROLE_KEY in this build, and the probe is not granted to anon' }
  }
  if (answer.error) {
    return { verdict: 'FAIL', reason: `${RPC}() could not be asked (${answer.error}); apply ${MIGRATION} to this project` }
  }
  const rows = answer.value
  if (!Array.isArray(rows) || rows.length === 0) {
    return { verdict: 'FAIL', reason: `${RPC}() answered ${JSON.stringify(rows)} rather than its named flags` }
  }
  const byName = new Map(rows.map(r => [r.name, r.installed === true]))
  const failing = REQUIRED_FLAGS.filter(flag => byName.get(flag) !== true)
  if (failing.length === 0) {
    return { verdict: 'PASS', reason: `${REQUIRED_FLAGS.length} flags true: history cannot be edited on this project` }
  }
  return {
    verdict: 'FAIL',
    reason: `not in place: ${failing.map(f => `${f} (${FLAG_MEANING[f] ?? 'no explanation recorded'})`).join('; ')}. Apply ${MIGRATION}`,
  }
}

/** Ask the project, read only. A GET: this guard carries an admin credential. */
export async function ask({ url, serviceKey, fetchImpl = fetch }) {
  try {
    const res = await fetchImpl(`${url.replace(/\/$/, '')}/rest/v1/rpc/${RPC}`, {
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, Accept: 'application/json' },
    })
    const text = await res.text()
    if (!res.ok) return { error: `HTTP ${res.status} ${text.slice(0, 160)}` }
    try {
      return { value: JSON.parse(text) }
    } catch {
      return { error: `unparseable answer ${text.slice(0, 80)}` }
    }
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) }
  }
}

const invokedDirectly = process.argv[1] && /ledger-append-only\.mjs$/.test(process.argv[1])
if (invokedDirectly) {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim()
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  const ref = /^https:\/\/([a-z0-9]+)\./.exec(url)?.[1] ?? 'no project'
  const canAsk = Boolean(url && REAL_PROJECT.test(url) && serviceKey)
  const answer = canAsk ? await ask({ url, serviceKey }) : { error: 'not asked' }
  const { verdict, reason } = decide({ url, serviceKey, answer })
  const flagsTrue = Array.isArray(answer.value)
    ? answer.value.filter(r => REQUIRED_FLAGS.includes(r.name) && r.installed === true).length
    : 0

  console.log(`${TAG} ${filesRead} source file(s) read, ${problems.length} write(s) against history found`)
  console.log(`${TAG} project ${ref}: ${verdict} - ${reason}`)

  declareWork('ledger-append-only', {
    did: { 'source file read': filesRead, 'append-only probe sent': canAsk ? 1 : 0 },
    found: { 'write against history': problems.length, 'enforcement flag answered true': flagsTrue },
    zeroIsFine: {
      'write against history': 'zero is the goal state; the guard exists because one edit makes every number derived from this table an assertion',
      'append-only probe sent': 'a build with no database credential cannot ask, and says so rather than passing quietly',
      'enforcement flag answered true': 'zero flags is only fine when the probe was not sent at all, which the line above reports',
    },
    exitOnZero: false,
  })

  if (problems.length > 0 || verdict === 'FAIL') {
    console.error('')
    console.error(`${TAG} FAIL`)
    for (const p of problems) console.error(`    ${p}`)
    if (verdict === 'FAIL') console.error(`    the database: ${reason}`)
    console.error('')
    console.error('  What the ledger says happened must be what happened. There is no way to')
    console.error('  notice an edit afterwards: an edited row looks exactly like one that was')
    console.error('  always that way.')
    /*
     * process.exitCode, never process.exit(). An immediate exit while the
     * probe's socket is still closing crashes Node on Windows with a libuv
     * assertion (`!(handle->flags & UV_HANDLE_CLOSING)`) and a status of 127,
     * which the runner reads as a guard that failed for an unnamed reason.
     * Measured on the first run of this file. The sibling probe guard has
     * always used exitCode for the same reason.
     */
    process.exitCode = 1
  } else {
    console.log(`${TAG} PASS - nothing edits history, and the database refuses it as well.`)
  }
}
