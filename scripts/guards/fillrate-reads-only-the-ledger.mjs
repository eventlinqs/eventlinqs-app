/**
 * GUARD ONE OF TWO ON THE RECOVERY ENGINE: IT KNOWS NO INDUSTRY.
 *
 * THE INVARIANT (close-out D2, quoted because it is the whole reason the engine
 * is a separate directory rather than a folder inside the ticketing code):
 *
 *     "The engine reads the ledger and nothing else. It must never import from,
 *      query, or reference an EventLinqs table, model or type. If it cannot be
 *      pointed at a gym's ledger rows tomorrow with only a new adapter, it is
 *      built wrong. A registered guard asserts this."
 *
 *     "All customer facing copy is parameterised by slot category. The word for
 *      a unit comes from a category lookup: ticket, class, appointment, seat,
 *      place, booking. No user facing string hard codes 'ticket'."
 *
 * WHY IT IS WORTH A BUILD-FAILING GATE. The engine is the part of this platform
 * that has value outside ticketing, and the boundary that gives it that value is
 * invisible: nothing breaks the day somebody imports an event type into it, and
 * six months later the whole engine has to be rebuilt to leave. The cost of
 * holding the line is a naming rule. The cost of losing it is the product.
 *
 * FOUR CLAUSES.
 *   1. no file in src/lib/fillrate imports from a module outside a small
 *      allowed set. The set is DECLARED here, so adding to it is a decision
 *      somebody makes on purpose rather than an import somebody types.
 *   2. no file in src/lib/fillrate names a table that is not the ledger's or the
 *      engine's own. Read from the .from('...') calls, which is where a coupling
 *      to a schema actually happens.
 *   3. no file in src/lib/fillrate uses an industry word as an identifier or in
 *      a user facing string. `words.ts` is the ONE exception and only for the
 *      six nouns it is the lookup for.
 *   4. the engine's own migrations declare no industry identifier, judged the
 *      same way the ledger's are.
 *
 * Run standalone:  node scripts/guards/fillrate-reads-only-the-ledger.mjs
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { declareWork } from '../lib/work-report.mjs'
import { industryWordsIn } from './lib/industry-words.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')
const TAG = '[fillrate-reads-only-the-ledger]'

const ENGINE_DIR = join(ROOT, 'src', 'lib', 'fillrate')

/**
 * THE ONLY FILE ALLOWED TO SAY THE SIX NOUNS, and only as the values of the
 * lookup it exists to be. The close-out names "ticket" as one of the six words a
 * category can map to, so the lookup cannot be written without it.
 */
const THE_LOOKUP = 'words.ts'

/**
 * WHAT THE ENGINE MAY IMPORT, declared rather than inferred.
 *
 * Everything here is INFRASTRUCTURE, never domain: a database client, a mail
 * transport, the site's own base URL, the ledger's neutral vocabulary and its
 * neutral identity hash. Point the engine at a gym and every one of these is
 * still exactly what it needs. `@/lib/ledger/adapter` is deliberately NOT here,
 * because that is the file that speaks this platform's language.
 */
const ALLOWED_IMPORTS = new Set([
  '@/lib/supabase/admin',
  '@/lib/ledger/types',
  '@/lib/ledger/identity',
  '@/lib/email/send',
  '@/lib/email/escape',
  '@/lib/site-url',
  '@/lib/observability/sentry',
])

/** The tables the engine owns or reads. Anything else is a coupling. */
const ALLOWED_TABLES = new Set([
  'ledger_slots',
  'ledger_entries',
  'recovery_sends',
  'recovery_suppressions',
  'recovery_contacts',
  'recovery_holds',
])

const MIGRATIONS = [
  join(ROOT, 'supabase', 'migrations', '20260910000003_recovery_engine.sql'),
  join(ROOT, 'supabase', 'migrations', '20260910000004_recovery_holds.sql'),
]

const problems = []
let filesRead = 0
let importsJudged = 0
let tablesJudged = 0
let identifiersJudged = 0

function engineFiles() {
  if (!existsSync(ENGINE_DIR)) return []
  return readdirSync(ENGINE_DIR)
    .filter(name => name.endsWith('.ts'))
    .map(name => ({ name, path: join(ENGINE_DIR, name) }))
}

const files = engineFiles()
if (files.length === 0) {
  problems.push(`there is no engine at ${relative(ROOT, ENGINE_DIR)}, so nothing can be judged`)
}

for (const file of files) {
  const source = readFileSync(file.path, 'utf8')
  filesRead += 1
  const where = relative(ROOT, file.path).replace(/\\/g, '/')

  /* ------------------------------------------------- 1. what it imports */
  for (const match of source.matchAll(/(?:^|\n)\s*(?:import|export)[^\n]*?from\s+['"]([^'"]+)['"]/g)) {
    const specifier = match[1]
    importsJudged += 1
    // A relative import stays inside the engine, which is the point.
    if (specifier.startsWith('.')) continue
    // node: builtins are infrastructure by definition.
    if (specifier.startsWith('node:')) continue
    if (ALLOWED_IMPORTS.has(specifier)) continue
    problems.push(
      `${where} imports ${specifier}, which is not on the engine's allowed list. ` +
        `The engine may read the ledger and infrastructure and nothing else. If this really is ` +
        `infrastructure rather than this platform's domain, add it to ALLOWED_IMPORTS in this guard ` +
        `with a reason, on purpose.`,
    )
  }

  /* -------------------------------------------------- 2. what it queries */
  for (const match of source.matchAll(/\.from\(\s*['"]([a-z_]+)['"]\s*\)/g)) {
    const table = match[1]
    tablesJudged += 1
    if (ALLOWED_TABLES.has(table)) continue
    problems.push(
      `${where} queries the table "${table}", which is not the ledger's and not the engine's own. ` +
        `The engine reads the ledger and nothing else.`,
    )
  }

  /* -------------------------------------- 3. what it says, and calls things */
  const lines = source.split(/\r?\n/)
  lines.forEach((line, index) => {
    identifiersJudged += 1
    if (file.name === THE_LOOKUP) return
    const found = industryWordsIn(line)
    if (found.length === 0) return
    problems.push(
      `${where}:${index + 1} says ${[...new Set(found)].join(', ')}. The engine speaks no industry: ` +
        `the word for one unit comes from the category lookup in ${THE_LOOKUP}, keyed on the slot's own ` +
        `category, so the same code offers a class to a gym.`,
    )
  })
}

/* ------------------------------------------------ 4. the engine's schema */

for (const migration of MIGRATIONS) {
  if (!existsSync(migration)) {
    problems.push(`the engine migration ${relative(ROOT, migration)} is missing, so its schema cannot be judged`)
    continue
  }
  const sql = readFileSync(migration, 'utf8')
  filesRead += 1
  const where = relative(ROOT, migration).replace(/\\/g, '/')

  // Read from the DECLARATIONS, so a comment explaining the rule is not itself
  // a breach of it. Same reading as the ledger's own guard.
  const declared = []
  for (const match of sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?([a-z_.]+)\s*\(([\s\S]*?)\n\)/gi)) {
    declared.push(match[1])
    for (const columnLine of match[2].split(/\r?\n/)) {
      const column = columnLine.match(/^\s{2}([a-z_]+)\s+[a-z]/i)
      if (column) declared.push(column[1])
    }
  }
  for (const match of sql.matchAll(/create\s+type\s+([a-z_.]+)\s+as\s+enum\s*\(([\s\S]*?)\)/gi)) {
    declared.push(match[1])
    for (const value of match[2].matchAll(/'([a-z_]+)'/gi)) declared.push(value[1])
  }
  for (const match of sql.matchAll(/alter\s+table\s+[a-z_.]+\s+add\s+column\s+(?:if\s+not\s+exists\s+)?([a-z_]+)/gi)) {
    declared.push(match[1])
  }

  for (const identifier of declared) {
    identifiersJudged += 1
    const found = industryWordsIn(identifier)
    if (found.length === 0) continue
    problems.push(
      `${where} declares "${identifier}", which says ${[...new Set(found)].join(', ')}. ` +
        `A column named for one industry is the hardest thing here to undo, because it is in every row ever written.`,
    )
  }
}

console.log(
  `${TAG} ${filesRead} file(s), ${importsJudged} import(s), ${tablesJudged} table reference(s), ${identifiersJudged} line(s) and identifier(s) judged`,
)
console.log(`${TAG} allowed imports: ${[...ALLOWED_IMPORTS].join(', ')}`)
console.log(`${TAG} allowed tables:  ${[...ALLOWED_TABLES].join(', ')}`)

if (problems.length > 0) {
  console.error(`${TAG} FAIL - ${problems.length} breach(es) of the engine boundary.`)
  for (const problem of problems) console.error(`${TAG}   ${problem}`)
  console.error('')
  console.error('  The engine is the part of this platform with value outside ticketing, and the')
  console.error('  boundary that gives it that value is invisible: nothing breaks the day somebody')
  console.error('  imports an event type into it, and six months later it has to be rebuilt to leave.')
  process.exit(1)
}

declareWork('fillrate-reads-only-the-ledger', {
  did: {
    'engine file read': filesRead,
    'import judged': importsJudged,
    'table reference judged': tablesJudged,
    'line and identifier judged': identifiersJudged,
  },
  found: { 'breach of the engine boundary': problems.length },
  zeroIsFine: {
    'breach of the engine boundary':
      'zero is the goal state; the guard exists because an import that couples the engine to this platform breaks nothing on the day it is typed',
  },
  exitOnZero: false,
})

console.log(`${TAG} PASS - the engine reads the ledger and nothing else, and it speaks no industry.`)
process.exit(0)
