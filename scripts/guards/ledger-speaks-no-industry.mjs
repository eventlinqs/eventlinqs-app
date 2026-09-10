/**
 * GUARD TWO OF THREE ON THE SLOT LEDGER: IT SPEAKS NO INDUSTRY.
 *
 * THE INVARIANT (close-out D1, and it is quoted here because it is unusual
 * enough to be mistaken for pedantry): "Nothing in the ledger schema, the column
 * names, the enums or the engine may use the words event, ticket or tier."
 *
 * WHY. This ledger is the foundation of a business that will later run for gyms,
 * clinics, tour operators, studios and venues. A ledger that speaks one industry
 * has to be REBUILT to leave it, and rebuilding a ledger means the history does
 * not come with you: the pace curves, the recovery rates and everything derived
 * from them start again from zero on the day you generalise. The cost of holding
 * the line now is a naming rule. The cost of not holding it is the data.
 *
 * WHAT IT READS.
 *   1. The ledger's own schema: every column and every enum value the migration
 *      declares. A column named for one industry is the hardest thing here to
 *      undo, because it is in every row ever written.
 *   2. Every engine file: src/lib/ledger/* EXCEPT the adapter, which is the
 *      boundary and is supposed to speak both languages. Comments count. A
 *      comment is where the vocabulary comes back first, one explanation at a
 *      time, and six months later the types have followed it.
 *
 * WHOLE WORDS, SPLIT THE WAY IDENTIFIERS ARE WRITTEN. See industryWordsIn
 * below: substring matching would fire on the source system's own name, and a
 * plain `\b` boundary misses `ticket_hash` and `eventId`, which is exactly what
 * this file's own drill caught it doing on its first run.
 *
 * Run standalone:  node scripts/guards/ledger-speaks-no-industry.mjs
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { declareWork } from '../lib/work-report.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')
const TAG = '[ledger-speaks-no-industry]'

const ENGINE_DIR = join(ROOT, 'src', 'lib', 'ledger')
/** The one file allowed to speak both languages, because that is its whole job. */
const THE_BOUNDARY = 'adapter.ts'
const MIGRATION = join(ROOT, 'supabase', 'migrations', '20260910000002_slot_ledger.sql')

/** The words the close-out names. */
const BANNED = new Set(['event', 'events', 'ticket', 'tickets', 'tier', 'tiers'])

/**
 * THE WORDS IN A PIECE OF TEXT, SPLIT THE WAY IDENTIFIERS ARE ACTUALLY WRITTEN.
 *
 * The first version of this matched on `\b(event|ticket|tier)\b`, and its own
 * drill caught it in one run: an underscore is a WORD character, so `\b` does
 * NOT sit between `ticket` and `_hash`, and a column renamed `ticket_hash`
 * walked straight past a guard written to catch exactly that. The same hole
 * swallows `eventId`, where the boundary is a case change rather than a
 * separator.
 *
 * So: split on anything that is not a letter, split again at every lower-to-upper
 * transition, and compare whole words.
 *
 * `eventlinqs` is removed FIRST. It is the source system's own name, it is a
 * legitimate VALUE in this schema, and camel-splitting `EventLinqs` would
 * otherwise report the brand as a breach on every line that names it.
 */
export function industryWordsIn(text) {
  return String(text)
    .replace(/eventlinqs/gi, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^A-Za-z]+/)
    .map(w => w.toLowerCase())
    .filter(w => BANNED.has(w))
}

const problems = []
let filesRead = 0
let identifiersJudged = 0

/* ------------------------------------------------- 1. the ledger's schema */

if (!existsSync(MIGRATION)) {
  problems.push(`the ledger migration is not at ${relative(ROOT, MIGRATION)}, so its schema cannot be judged`)
} else {
  const sql = readFileSync(MIGRATION, 'utf8')
  filesRead += 1

  // Every identifier the migration DECLARES: table names, column names and enum
  // values. Read from the declarations rather than from the whole file, so a
  // comment explaining the rule is not itself a breach of it.
  const identifiers = []

  for (const m of sql.matchAll(/create table if not exists public\.(\w+)\s*\(([\s\S]*?)\n\);/gi)) {
    identifiers.push({ what: 'table', name: m[1] })
    for (const line of m[2].split('\n')) {
      const col = /^\s{2}(\w+)\s+[a-z]/i.exec(line)
      if (col) identifiers.push({ what: `column of ${m[1]}`, name: col[1] })
    }
  }
  for (const m of sql.matchAll(/create type public\.(\w+) as enum\s*\(([\s\S]*?)\);/gi)) {
    identifiers.push({ what: 'enum', name: m[1] })
    for (const v of m[2].matchAll(/'([^']+)'/g)) {
      identifiers.push({ what: `value of ${m[1]}`, name: v[1] })
    }
  }

  identifiersJudged = identifiers.length
  if (identifiersJudged === 0) {
    problems.push(
      `no table, column or enum could be read out of ${relative(ROOT, MIGRATION)}. ` +
        'A guard that reads nothing reports no problems, which is a failure and not a pass.',
    )
  }
  for (const id of identifiers) {
    const hit = industryWordsIn(id.name)[0]
    if (hit) {
      problems.push(
        `${relative(ROOT, MIGRATION)}: the ${id.what} "${id.name}" says "${hit}". ` +
          'A column named for one industry is in every row ever written and is the hardest thing here to undo.',
      )
    }
  }
}

/* ------------------------------------------------------ 2. the engine files */

if (!existsSync(ENGINE_DIR)) {
  problems.push(`the engine is not at ${relative(ROOT, ENGINE_DIR)}, so this guard cannot judge it`)
} else {
  const files = readdirSync(ENGINE_DIR).filter(f => f.endsWith('.ts'))
  if (files.length <= 1) {
    problems.push(`only ${files.length} file(s) in the engine directory, which is fewer than the engine has ever had`)
  }
  for (const file of files) {
    if (file === THE_BOUNDARY) continue
    const text = readFileSync(join(ENGINE_DIR, file), 'utf8')
    filesRead += 1
    const lines = text.split('\n')
    for (let i = 0; i < lines.length; i += 1) {
      const hit = industryWordsIn(lines[i])[0]
      if (!hit) continue
      problems.push(
        `src/lib/ledger/${file}:${i + 1} says "${hit}": ${lines[i].trim().slice(0, 90)}. ` +
          `Only ${THE_BOUNDARY} speaks the source system's language.`,
      )
    }
  }
}

console.log(`${TAG} ${filesRead} file(s) read, ${identifiersJudged} schema identifier(s) judged`)

if (problems.length > 0) {
  console.error('')
  console.error(`${TAG} FAIL - ${problems.length} problem(s):`)
  for (const p of problems) console.error(`    ${p}`)
  console.error('')
  console.error('  A ledger that speaks one industry has to be rebuilt to leave it, and')
  console.error('  rebuilding a ledger means the history does not come with you.')
  process.exit(1)
}

declareWork('ledger-speaks-no-industry', {
  did: { 'file read': filesRead, 'schema identifier judged': identifiersJudged },
  found: { 'industry word in the ledger or its engine': problems.length },
  zeroIsFine: {
    'industry word in the ledger or its engine':
      'zero is the goal state; the guard exists because the vocabulary comes back one comment at a time',
  },
  exitOnZero: false,
})

console.log(`${TAG} PASS - the schema and the engine speak the general language only.`)
process.exit(0)
