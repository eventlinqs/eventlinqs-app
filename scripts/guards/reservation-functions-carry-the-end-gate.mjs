/**
 * GUARD: THE FUNCTIONS THAT SELL A TICKET REFUSE AN EVENT THAT HAS ENDED.
 *
 * Window 4, 23 October 2026, on the project manager's 02:05 order: "make it a
 * guard, not a note."
 *
 * WHY IT EXISTS. Until 20261023000001 nothing judged an event's END before a
 * sale: create_reservation and create_seat_reservation refused an unpublished
 * event and then each tier's own sale window, so a tier with no sale_end sold
 * after its event was over (proved on TEST that night: main's own function sold
 * an ended fixture a ticket). The fix added one gate to both, "This event has
 * ended." Then the same night showed how it would be lost: lane/b-growth's
 * unmerged migration 20260921000050 DROPS the five-argument create_reservation
 * and makes a six-argument one (p_group_hold) without the gate. If that file
 * ever reaches main after the fix, it becomes the function every ticket path
 * calls, the gate is gone, and nothing anywhere would say so.
 *
 * THE RULE, TWO HALVES.
 *   1. Every definition of either function in any migration that is not HISTORY
 *      must carry the end gate: the sentence "This event has ended." returned
 *      when the event's end has passed. This is the half that catches
 *      lane/b-growth's file AS IT STANDS: its version, 20260921000050, sorts
 *      BEFORE the fix, so judged by version order alone the fix would look
 *      effective and the guard would pass, while a later `db push` that includes
 *      it would drop the gated function and make an ungated one. Apply order is
 *      not version order once an older-numbered file lands late.
 *   2. The EFFECTIVE definition (the last migration in version order that
 *      creates or replaces it, the same way event-lifecycle-total and the drill
 *      harness find it) must carry the gate as well.
 *
 * HISTORY is the dated list of the four files that defined these functions
 * before the gate existed, read off main on 23 October 2026. They are not
 * judged: they have no gate and never will, which is correct, because each was
 * replaced in turn. A file added from now on is never history.
 *
 * WHAT IT DOES NOT SEE: a function created outside supabase/migrations, or a
 * gate that is present but unreachable. The TEST proof
 * (scripts/verify/an-ended-event-sells-nothing-proof.mjs) is what shows the gate
 * actually refuses.
 *
 * Run: node scripts/guards/reservation-functions-carry-the-end-gate.mjs
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { declareWork } from '../lib/work-report.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')
const TAG = '[reservation-functions-carry-the-end-gate]'

export const SELLING_FUNCTIONS = ['create_reservation', 'create_seat_reservation']
export const END_GATE = 'This event has ended.'

/** Read off main on 23 October 2026: every file that defined either function before the gate. */
export const HISTORY = [
  '20260101000001_baseline_schema.sql',
  '20260704000005_sale_window_enforcement.sql',
  '20260705000002_seat_reservation_guest_session.sql',
  '20260906000002_event_lifecycle_archive_delete.sql',
]

const definitionStart = (fn) => new RegExp(`CREATE\\s+(?:OR\\s+REPLACE\\s+)?FUNCTION\\s+(?:public\\.)?${fn}\\s*\\(`, 'gi')

/**
 * Every definition of `fn` in `sql`, each from its CREATE to the closing dollar
 * quote of its body, in the order they appear.
 */
export function definitionsIn(sql, fn) {
  const out = []
  const re = definitionStart(fn)
  for (let m = re.exec(sql); m !== null; m = re.exec(sql)) {
    const start = m.index
    const open = /AS\s+(\$[A-Za-z0-9_]*\$)/i.exec(sql.slice(start))
    if (!open) {
      out.push(sql.slice(start))
      continue
    }
    const tag = open[1]
    const bodyFrom = start + open.index + open[0].length
    const close = sql.indexOf(tag, bodyFrom)
    out.push(sql.slice(start, close < 0 ? undefined : close + tag.length))
  }
  return out
}

/**
 * Judge a set of migrations, given as [{ name, sql }] in any order. Returns the
 * failures, each naming the function and the file, and the effective file of
 * each function.
 */
export function judgeMigrations(files, history = HISTORY) {
  const ordered = [...files].filter((f) => f.name.endsWith('.sql')).sort((a, b) => a.name.localeCompare(b.name))
  const failures = []
  const effective = {}
  for (const fn of SELLING_FUNCTIONS) {
    for (const f of ordered) {
      const defs = definitionsIn(f.sql, fn)
      if (defs.length === 0) continue
      effective[fn] = { file: f.name, gated: defs[defs.length - 1].includes(END_GATE) }
      if (history.includes(f.name)) continue
      defs.forEach((def, i) => {
        if (!def.includes(END_GATE)) {
          failures.push({ fn, file: f.name, reason: `${f.name} defines ${fn}${defs.length > 1 ? ` (definition ${i + 1} of ${defs.length})` : ''} without refusing an event that has ended ("${END_GATE}")` })
        }
      })
    }
    const e = effective[fn]
    if (!e) failures.push({ fn, file: null, reason: `no migration defines ${fn}` })
    else if (!e.gated && !failures.some((x) => x.fn === fn && x.file === e.file)) {
      failures.push({ fn, file: e.file, reason: `the effective definition of ${fn} (${e.file}) does not refuse an event that has ended ("${END_GATE}")` })
    }
  }
  return { failures, effective }
}

function main() {
  const dir = join(ROOT, 'supabase', 'migrations')
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .map((name) => ({ name, sql: readFileSync(join(dir, name), 'utf8') }))
  const { failures, effective } = judgeMigrations(files)

  declareWork('reservation-functions-carry-the-end-gate', {
    did: { 'migration file read': files.length, 'selling function judged': Object.keys(effective).length },
    found: { 'definition without the end gate': failures.length },
    exitOnZero: false,
  })

  if (failures.length > 0) {
    console.error(`${TAG} FAIL: a function that sells a ticket would sell one for an event that has ended.`)
    for (const f of failures) console.error(`${TAG}   ${f.reason}`)
    console.error(`${TAG}   Carry the end gate from 20261023000001 into that definition: refuse with "${END_GATE}" when the event's end has passed, before any inventory is touched.`)
    process.exitCode = 1
    return
  }
  for (const [fn, e] of Object.entries(effective)) console.log(`${TAG} ${fn}: effective definition ${e.file} carries the end gate`)
  console.log(`${TAG} PASS - both functions that sell a ticket refuse an event that has ended.`)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main()
