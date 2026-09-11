/**
 * A TICKET TYPE IS NEVER DELETED AND RE-CREATED TO SAVE AN EDIT. A build-failing guard.
 *
 * WHY THIS EXISTS, driven on TEST on 10 September 2026. Saving an event ran
 * this, on every save, published or not, sold or not:
 *
 *     await admin.from('ticket_tiers').delete().eq('event_id', input.eventId)
 *     ... then re-insert the tiers from the form
 *
 * and the error from that delete was never read. Two failures, both driven:
 *
 *   SOLD EVENT. order_items carries
 *   CHECK (item_type = 'ticket' AND ticket_tier_id IS NOT NULL), and the
 *   ON DELETE SET NULL on order_items.ticket_tier_id breaks it, so Postgres
 *   raises 23514 and nothing is removed. The re-insert then collides with the
 *   surviving rows and the organiser is shown, on their own live event:
 *       duplicate key value violates unique constraint "ticket_tiers_event_id_name_key"
 *   One sale made an event permanently uneditable, and the explanation was the
 *   name of a database constraint.
 *
 *   UNSOLD EVENT. The delete succeeds and cascades: waitlist, squads,
 *   tier_access_codes and dynamic_pricing_rules all name ticket_tiers with
 *   ON DELETE CASCADE. Fixing a typo emptied the waitlist and cancelled every
 *   squad, silently.
 *
 * WHY A GUARD RATHER THAN A TEST. The defect was one line in one action, and
 * every unit test in the tree passed with it in place, because nothing that runs
 * in the suite has a foreign key. The invariant is a property of the SOURCE:
 * nowhere in the application may an event's ticket types be removed in bulk to
 * save an edit. That is decidable by reading the tree, and only by reading the
 * tree.
 *
 * WHAT IT FAILS ON, in both directions, because a one-way check rots:
 *
 *   1. Any bulk delete of ticket_tiers anywhere under src/. A delete filtered by
 *      event_id (or by nothing at all) is the defect returning under a new name.
 *      A delete of ONE named tier by its own id is a different act and is
 *      allowed, because that is what removing a ticket type genuinely is.
 *   2. updateEvent not calling save_event_ticket_tiers. If the reconciliation
 *      call disappears, the tiers stop being saved at all, which is quieter than
 *      the defect it replaced.
 *   3. The database function missing from the migrations, or missing either of
 *      its two refusals. The function IS the fix; a version of it that no longer
 *      refuses to delete a sold ticket type is worse than no function.
 *   4. The form dropping the tier id again. The id is what makes an update an
 *      update; without it every save is an insert of something that already
 *      exists.
 *
 * WHAT IT DELIBERATELY DOES NOT CHECK. Whether the reconciliation is CORRECT.
 * That is proved by driving it (scripts/verify/tier-identity-proof.mjs) and by
 * the unit tests on the payload and the refusal words. A guard that tried to
 * judge the SQL would be a second, worse copy of the SQL.
 *
 * Run standalone:  node scripts/guards/tier-identity-preserved.mjs
 */
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { declareWork } from '../lib/work-report.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')
const SRC = join(ROOT, 'src')
const MIGRATIONS = join(ROOT, 'supabase', 'migrations')
const TAG = '[tier-identity-preserved]'

const ACTION = join(SRC, 'app', '(dashboard)', 'dashboard', 'events', 'actions.ts')
const FORM = join(SRC, 'components', 'features', 'events', 'event-form.tsx')
const RPC = 'save_event_ticket_tiers'

const problems = []
let filesRead = 0

/** Every .ts and .tsx file under src/, so a new file cannot escape by being new. */
function sourceFiles(dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const stat = statSync(full)
    if (stat.isDirectory()) {
      out.push(...sourceFiles(full))
    } else if (/\.tsx?$/.test(entry)) {
      out.push(full)
    }
  }
  return out
}

/*
 * 1. NO BULK DELETE OF TICKET TYPES.
 *
 * Matched on the chain rather than on the word, so `.from('ticket_tiers')`
 * followed by `.delete()` is caught however the intervening filters are spelled
 * and however the call is wrapped across lines. A delete narrowed to ONE row by
 * its own id is allowed: that is a person removing a ticket type, not a save
 * replacing the lot.
 */
const DELETE_CHAIN = /from\(\s*['"]ticket_tiers['"]\s*\)([\s\S]{0,240}?)\.delete\s*\(/g
const NARROWED_TO_ONE = /\.eq\(\s*['"]id['"]|\.in\(\s*['"]id['"]/

for (const file of sourceFiles(SRC)) {
  const text = readFileSync(file, 'utf8')
  filesRead += 1
  if (!text.includes('ticket_tiers')) continue
  for (const m of text.matchAll(DELETE_CHAIN)) {
    if (NARROWED_TO_ONE.test(m[1])) continue
    const line = text.slice(0, m.index).split('\n').length
    problems.push(
      `${relative(ROOT, file)}:${line} deletes ticket_tiers in bulk. ` +
        `Saving an edit reconciles through ${RPC}; it never replaces the rows.`,
    )
  }
}

/* 2. THE ACTION STILL RECONCILES. */
if (!existsSync(ACTION)) {
  problems.push(`the event actions file is not at ${relative(ROOT, ACTION)}, so this guard cannot judge it`)
} else {
  const text = readFileSync(ACTION, 'utf8')
  filesRead += 1
  /*
   * The QUOTED name, in an rpc call. `text.includes(RPC)` was the first version
   * and the drill caught it in its own first run: renaming the function to
   * `save_event_ticket_tiers_GONE` still contains the string, so the guard went
   * green on an action that called something that does not exist.
   */
  if (!new RegExp(`rpc\\(\\s*['"]${RPC}['"]`).test(text)) {
    problems.push(
      `${relative(ROOT, ACTION)} no longer calls ${RPC}. ` +
        'Without it an edit either replaces every ticket type or saves none of them.',
    )
  }
}

/* 3. THE DATABASE FUNCTION, AND BOTH ITS REFUSALS. */
const migrationText = existsSync(MIGRATIONS)
  ? readdirSync(MIGRATIONS)
      .filter((f) => f.endsWith('.sql'))
      .map((f) => {
        filesRead += 1
        return readFileSync(join(MIGRATIONS, f), 'utf8')
      })
      .join('\n')
  : ''

if (!new RegExp(`FUNCTION\\s+public\\.${RPC}\\s*\\(`, 'i').test(migrationText)) {
  problems.push(`no migration defines public.${RPC}. The reconciliation IS that function.`)
} else {
  for (const [refusal, why] of [
    ['sold', 'a ticket type somebody has already bought must never be removed by a save'],
    ['capacity', 'capacity must never be cut below what is already sold or held'],
    ['repeated_name', 'two ticket types sharing a name reach the duplicate-key message by another road'],
  ]) {
    if (!new RegExp(`'refusal'\\s*,\\s*'${refusal}'`).test(migrationText)) {
      problems.push(`public.${RPC} no longer answers the '${refusal}' refusal: ${why}.`)
    }
  }
}

/* 4. THE FORM STILL SENDS THE ID OF A SAVED TICKET TYPE. */
if (!existsSync(FORM)) {
  problems.push(`the event form is not at ${relative(ROOT, FORM)}, so this guard cannot judge it`)
} else {
  const text = readFileSync(FORM, 'utf8')
  filesRead += 1
  if (!/isSavedTierId\(/.test(text)) {
    problems.push(
      `${relative(ROOT, FORM)} no longer decides which ticket types are already saved. ` +
        'The id it drops is the one thing that makes an update an update.',
    )
  }
}

console.log(`${TAG} ${filesRead} file(s) read`)

if (problems.length > 0) {
  console.error('')
  console.error(`${TAG} FAIL - ${problems.length} problem(s):`)
  for (const p of problems) console.error(`    ${p}`)
  console.error('')
  console.error('  One sale used to make an event permanently uneditable, and the organiser')
  console.error('  was shown the name of a database constraint. Do not put that back.')
  process.exit(1)
}

declareWork('tier-identity-preserved', {
  did: { 'source and migration file read': filesRead },
  found: { 'ticket type replaced rather than reconciled': problems.length },
  zeroIsFine: {
    'ticket type replaced rather than reconciled':
      'zero is the goal state; the guard exists because one bulk delete made every sold event uneditable',
  },
  exitOnZero: false,
})

console.log(`${TAG} PASS - no bulk delete of ticket types, and the reconciliation is wired end to end.`)
process.exit(0)
