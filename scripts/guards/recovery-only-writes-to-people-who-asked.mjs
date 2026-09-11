/**
 * GUARD TWO OF TWO ON THE RECOVERY ENGINE: NOBODY IS WRITTEN TO OUT OF NOWHERE.
 *
 * THE INVARIANT (close-out D2):
 *
 *     "Only ever contact a person about the specific slot they themselves
 *      started buying. Never another slot, never another organisation."
 *
 *     "Guard: no path can contact a person about a slot they never engaged
 *      with."
 *
 * WHY A GUARD RATHER THAN A TEST. A test proves the path that exists behaves.
 * This proves that no OTHER path can exist: it reads the source for anything
 * that sends, and refuses a send that is not derived from a recorded engagement.
 * The rule is not "the current sweep is careful", it is "carelessness is
 * unavailable", and only a check over the whole tree can say that.
 *
 * FIVE CLAUSES.
 *
 *   1. THE DATABASE IS THE REAL ENFORCEMENT, and the migration must keep saying
 *      so. `recovery_sends.demand_entry_id` and `recovery_holds.demand_entry_id`
 *      are both NOT NULL and both REFERENCE `ledger_entries`. A send therefore
 *      cannot exist without naming the exact recorded engagement that authorised
 *      it, whatever any caller does.
 *   2. EVERY INSERT INTO THE SEND RECORD NAMES ONE. Read from the source, so a
 *      new call site that forgets fails the build rather than the database at
 *      three in the morning.
 *   3. ONLY THE ENGINE SENDS. No file outside `src/lib/fillrate` may insert into
 *      `recovery_sends` or `recovery_holds`. One door, exactly as the ledger has
 *      one door.
 *   4. THE SEQUENCE STOPS. `due.ts` must still refuse an unsubscribed address, a
 *      buyer, a refunded buyer, a started slot, a sold out slot and an organiser
 *      who switched it off. Six refusals, named, because deleting one is a
 *      one-line change that no type and no test signature would notice.
 *   5. EVERY MESSAGE CARRIES A WORKING STOP. The send path must refuse when no
 *      unsubscribe link could be minted: the Spam Act 2003 (Cth) requires a
 *      functional unsubscribe on every commercial message, and a build that
 *      treated it as best effort would send unlawful mail the first time the
 *      token table was unreachable.
 *
 * Run standalone:  node scripts/guards/recovery-only-writes-to-people-who-asked.mjs
 */
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { declareWork } from '../lib/work-report.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')
const TAG = '[recovery-only-writes-to-people-who-asked]'

const ENGINE_DIR = join(ROOT, 'src', 'lib', 'fillrate')
const SRC = join(ROOT, 'src')
const SENDS_MIGRATION = join(ROOT, 'supabase', 'migrations', '20260910000003_recovery_engine.sql')
const HOLDS_MIGRATION = join(ROOT, 'supabase', 'migrations', '20260910000004_recovery_holds.sql')

/**
 * HOW MANY PLACES THE ENGINE WRITES TO A PERSON: the abandoned checkout
 * sequence, and the waiting list offer. Every one of them must refuse to send
 * when no unsubscribe link could be minted, so the count is the check.
 */
const SEND_PATHS = 2

/** The tables that are a record of writing to a real person. */
const CONTACT_TABLES = ['recovery_sends', 'recovery_holds']

/**
 * THE SIX REFUSALS, by the words they are written in.
 *
 * Matched on the REASON STRING rather than on a function name, because the
 * reason is what a log carries and what a person reading a sweep sees, so a
 * refusal whose words changed is a refusal somebody deliberately edited.
 */
const REQUIRED_REFUSALS = [
  { what: 'an address that has unsubscribed', says: 'has unsubscribed' },
  { what: 'somebody who already bought', says: 'already bought' },
  { what: 'somebody whose money came back', says: 'money came back' },
  { what: 'a slot that has already started', says: 'has already started' },
  { what: 'a slot that has sold out', says: 'sold out' },
  { what: 'an organiser who switched it off', says: 'switched recovery off' },
  { what: 'a row belonging to another slot', says: 'belongs to another slot' },
]

const problems = []
let filesRead = 0
let insertsJudged = 0
let clausesJudged = 0

/**
 * THE SOURCE WITH ITS COMMENTS TAKEN OUT.
 *
 * WHY THIS EXISTS, and it is not tidiness. The first version of clauses 4 and 5
 * matched a refusal by searching the WHOLE FILE for the words it is written in,
 * and both files explain their own rules in a header comment using those exact
 * words. So the drill that deleted the refusal from the code left the sentence
 * describing it in the comment, and this guard read the comment and passed. Two
 * of its six drills reported DID NOT FAIL on the first run, which is the only
 * reason that is not in the tree as a check that could never fire.
 *
 * A guard that can be satisfied by a comment is a guard that measures
 * documentation. Comments are removed before anything is judged.
 */
function withoutComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

function walk(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) {
      out.push(...walk(path))
      continue
    }
    if (/\.(ts|tsx)$/.test(name)) out.push(path)
  }
  return out
}

/* ------------------------------------------- 1. the database's own refusal */

for (const [migration, table] of [
  [SENDS_MIGRATION, 'recovery_sends'],
  [HOLDS_MIGRATION, 'recovery_holds'],
]) {
  clausesJudged += 1
  if (!existsSync(migration)) {
    problems.push(`the migration declaring ${table} is missing at ${relative(ROOT, migration)}`)
    continue
  }
  const sql = readFileSync(migration, 'utf8')
  filesRead += 1
  const declaration = sql.match(
    new RegExp(`create table[^;]*?${table}[\\s\\S]*?\\n  demand_entry_id\\s+bigint\\s+not null\\s+references\\s+public\\.ledger_entries`, 'i'),
  )
  if (!declaration) {
    problems.push(
      `${relative(ROOT, migration)} no longer declares ${table}.demand_entry_id as "bigint not null references public.ledger_entries". ` +
        `That column is the receipt: without it a row can exist that names no recorded engagement, and the rule stops being enforced by anything.`,
    )
  }
}

/* ------------------------------------ 2 and 3. who may write, and with what */

const sourceFiles = walk(SRC)
for (const path of sourceFiles) {
  const source = readFileSync(path, 'utf8')
  const where = relative(ROOT, path).replace(/\\/g, '/')
  const insideEngine = path.startsWith(ENGINE_DIR)

  for (const table of CONTACT_TABLES) {
    const inserts = [...source.matchAll(new RegExp(`\\.from\\(\\s*['"]${table}['"]\\s*\\)\\s*\\n?\\s*\\.(insert|upsert)\\(([\\s\\S]{0,700}?)\\n\\s{2}\\}\\)`, 'g'))]
    for (const insert of inserts) {
      insertsJudged += 1
      if (!insideEngine) {
        problems.push(
          `${where} writes to ${table} from outside the engine. There is ONE door into the record of ` +
            `writing to a person, and it is src/lib/fillrate, for the same reason the ledger has one door.`,
        )
        continue
      }
      if (!/demand_entry_id\s*:/.test(insert[2])) {
        problems.push(
          `${where} inserts into ${table} without naming demand_entry_id. Every send and every offer ` +
            `has to name the recorded engagement that authorised it.`,
        )
      }
    }
    // A write with no recognisable object still has to be caught: a call that
    // this guard cannot read is a call this guard cannot clear.
    const anyWrite = new RegExp(`\\.from\\(\\s*['"]${table}['"]\\s*\\)\\s*\\n?\\s*\\.(insert|upsert)\\(`, 'g')
    const total = [...source.matchAll(anyWrite)].length
    if (total > inserts.length) {
      problems.push(
        `${where} writes to ${table} in a shape this guard cannot read (${total - inserts.length} of ${total}). ` +
          `Write the object inline so the receipt can be seen, or the check cannot clear it.`,
      )
    }
  }
  if (insideEngine) filesRead += 1
}

/* ------------------------------------------------ 4. the sequence still stops */

const dueFile = join(ENGINE_DIR, 'due.ts')
if (!existsSync(dueFile)) {
  problems.push('src/lib/fillrate/due.ts is missing, so the refusals cannot be judged')
} else {
  const due = withoutComments(readFileSync(dueFile, 'utf8'))
  filesRead += 1
  /*
   * READ FROM THE `refuse(...)` CALLS, not from the file. A reason that appears
   * only in prose is a rule somebody wrote down and then deleted.
   */
  const refusalsInCode = [...due.matchAll(/refuse\(\s*row\s*,\s*([`'"])([\s\S]*?)\1/g)].map(m => m[2])
  for (const refusal of REQUIRED_REFUSALS) {
    clausesJudged += 1
    if (refusalsInCode.some(said => said.includes(refusal.says))) continue
    problems.push(
      `src/lib/fillrate/due.ts no longer refuses ${refusal.what}: no refuse() call in it says "${refusal.says}". ` +
        `Deleting one of these is a one line change that no type and no test signature would notice.`,
    )
  }
}

/* --------------------------------- 5. every message carries a working stop */

const engineFile = join(ENGINE_DIR, 'engine.ts')
clausesJudged += 1
if (!existsSync(engineFile)) {
  problems.push('src/lib/fillrate/engine.ts is missing, so the send path cannot be judged')
} else {
  const engine = withoutComments(readFileSync(engineFile, 'utf8'))
  filesRead += 1
  /*
   * BOTH SEND PATHS, COUNTED, not "does the phrase appear anywhere". The engine
   * writes to a person in two places, the abandoned checkout sequence and the
   * waiting list offer, and a check that only asks whether the sentence exists
   * somewhere passes while one of them is deleted. Its own drill proved that.
   */
  const stops = [...engine.matchAll(/no unsubscribe link could be minted, so nothing was sent/g)].length
  const sendPaths = SEND_PATHS
  if (stops < sendPaths) {
    problems.push(
      `src/lib/fillrate/engine.ts refuses to send without an unsubscribe link in ${stops} of its ${sendPaths} send path(s). ` +
        `The Spam Act 2003 (Cth) requires a functional unsubscribe on every commercial message, so a ` +
        `message without one is not a degraded message, it is one that must not go.`,
    )
  }
}

console.log(
  `${TAG} ${filesRead} file(s) read, ${sourceFiles.length} source file(s) swept, ${insertsJudged} contact write(s) and ${clausesJudged} clause(s) judged`,
)

if (problems.length > 0) {
  console.error(`${TAG} FAIL - ${problems.length} way(s) a person could be written to who never asked.`)
  for (const problem of problems) console.error(`${TAG}   ${problem}`)
  console.error('')
  console.error('  Writing to somebody about something they never engaged with is the difference')
  console.error('  between a recovery engine and a spam sender, and the receiving side draws it.')
  process.exit(1)
}

declareWork('recovery-only-writes-to-people-who-asked', {
  did: {
    'file read': filesRead,
    'source file swept': sourceFiles.length,
    'contact write judged': insertsJudged,
    'clause judged': clausesJudged,
  },
  found: { 'unauthorised contact path': problems.length },
  zeroIsFine: {
    'unauthorised contact path':
      'zero is the goal state; the guard exists because a send with no receipt looks exactly like a send with one until somebody complains',
  },
  exitOnZero: false,
})

console.log(`${TAG} PASS - every send and every offer names the engagement that authorised it.`)
process.exit(0)
