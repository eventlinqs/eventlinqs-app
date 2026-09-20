/**
 * GUARD: THE GENERATED SECTION OF src/types/database.ts IS GENERATED, NOT TYPED.
 *
 * WHY THIS EXISTS, 20 September 2026. A push carrying 234 commits was refused at
 * the types-drift step with six differences on one function:
 *
 *   [types-drift]   UNEXPLAINED  became-nullable
 *   [types-drift]       public.Functions.write_pricing_rule.Args.p_created_by
 *   [types-drift]           committed : string | null
 *   [types-drift]           live      : string
 *
 * The schemas did not disagree. TEST and production hold the SAME single
 * definition of that function, with no defaults on any parameter, and running
 * `supabase gen types` against either emits `p_created_by: string`. The
 * `| null` had been TYPED INTO the generated block by hand. Two more hand-edits
 * were found beside it once the file was regenerated: `organiser_sales_digest_sends`
 * sat between `organiser_api_keys` and `organiser_balance_ledger`, and
 * `group_rate_floor_cents` sat between `resolve_pricing_value` and
 * `event_money_record_counts`. The generator emits every key list in ascending
 * order, so all three had been inserted by a person, in the place a person would
 * think to put them.
 *
 * WHY NOTHING SAW IT. types-drift compares the committed types against
 * PRODUCTION, and reports PENDING rather than FAIL while production is behind
 * the repository's migrations. Production was three days behind, so for three
 * days the hand-edit was invisible to every local gate run, and the two
 * misplaced entries were invisible to types-drift even afterwards, because a
 * correctly-shaped entry in the wrong POSITION is semantically identical and a
 * semantic comparison cannot see it.
 *
 * Nothing consumed the wrong type either, which is why typecheck stayed clean:
 * `createAdminClient()` calls `createClient()` with no generic, so every
 * `.rpc()` argument in the product is `any`. The generated types were wrong and
 * nothing anywhere could notice.
 *
 * WHAT THIS GUARD DOES. It reads the repository and nothing else, so it runs on
 * the Vercel build host, in CI and in the pre-push gate alike, and it fails the
 * commit that types into the generated block rather than the push days later.
 *
 *   CLAUSE ONE   every key list in the generated section is in ascending order,
 *                which is how the generator emits it.
 *   CLAUSE TWO   no function argument carries `| null`. The generator writes an
 *                argument as `name: T` or, when the SQL gives it a default,
 *                `name?: T`. It has no third form.
 *   CLAUSE THREE every public function the migrations declare and the types
 *                expose carries exactly the parameter names the migration
 *                declares, each optional if and only if the migration gives it
 *                a default.
 *
 * WHAT IT DOES NOT DO. It does not judge a column's TYPE, and it does not read a
 * database. Shape against a live schema is types-drift's job and presence
 * against the migrations is types-cover-migrations'; this one judges the three
 * things a hand-edit disturbs that neither of those can see. Functions it cannot
 * judge are printed as SKIPPED by name rather than passed silently.
 *
 * Drilled in scripts/verify/guard-failure-drills.mjs, one drill per clause.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { stripSqlComments } from './lib/types-coverage.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const TYPES = 'src/types/database.ts'
const MIGRATIONS = join(ROOT, 'supabase', 'migrations')
const TAG = '[generated-types-are-generated]'

/** The handwritten appendix below this marker is not the generator's output. */
const LEGACY_MARKER = '// BEGIN LEGACY ALIASES'

const failures = []
const passes = []
const skipped = []

/**
 * Index of the closing brace/paren that matches the opener at `open`.
 * Counting rather than matching, because a parameter list carries
 * `numeric(12, 2)` and a default carries `now()`.
 */
function closing(text, open, o, c) {
  let depth = 0
  for (let i = open; i < text.length; i++) {
    if (text[i] === o) depth++
    else if (text[i] === c) {
      depth--
      if (depth === 0) return i
    }
  }
  return -1
}

const raw = readFileSync(join(ROOT, TYPES), 'utf8').replace(/\r\n/g, '\n')
const markerAt = raw.indexOf(LEGACY_MARKER)
if (markerAt < 0) {
  console.error(`${TAG} FAILED. ${TYPES} has no "${LEGACY_MARKER}" marker, so the generated section cannot be told from the handwritten one.`)
  process.exit(1)
}
const generated = raw.slice(0, markerAt)

// ── CLAUSE ONE ───────────────────────────────────────────────────────────────
// The generator emits every key list in ascending order. A person inserting an
// entry puts it beside its relatives instead, which is how all three of the
// hand-edits that produced this guard were found.

const KEY_LISTS = ['Tables', 'Views', 'Functions', 'Enums', 'CompositeTypes']
let listsJudged = 0
let outOfOrder = 0

for (const kind of KEY_LISTS) {
  const opener = new RegExp(`\\n    ${kind}: \\{`, 'g')
  let m
  while ((m = opener.exec(generated))) {
    const open = generated.indexOf('{', m.index + m[0].length - 1)
    const end = closing(generated, open, '{', '}')
    if (end < 0) continue
    const body = generated.slice(open, end)
    const names = []
    const entry = /\n      ([a-zA-Z0-9_]+):/g
    let e
    while ((e = entry.exec(body))) {
      names.push(e[1])
      const afterColon = body.indexOf(':', e.index) + 1
      if (body.slice(afterColon).trimStart().startsWith('{')) {
        const vo = body.indexOf('{', afterColon)
        const ve = closing(body, vo, '{', '}')
        if (ve > 0) entry.lastIndex = ve
      }
    }
    listsJudged++
    for (let i = 1; i < names.length; i++) {
      if (names[i - 1] > names[i]) {
        outOfOrder++
        failures.push(
          `${TYPES}: ${kind} lists "${names[i - 1]}" before "${names[i]}". The generator emits this list in ascending order, so this entry was written by hand rather than regenerated.`,
        )
      }
    }
  }
}
if (listsJudged === 0) {
  failures.push(`${TYPES}: no Tables/Views/Functions/Enums block could be read, so clause one judged nothing.`)
} else if (outOfOrder === 0) {
  passes.push(`${listsJudged} key list(s) in the generated section are in the generator's own ascending order`)
}

// ── Read the committed Functions block once, for clauses two and three ───────
// Three emitted shapes, all of which appear in this file today:
//   name: { Args: { p: string }; Returns: boolean }      one line
//   Args: never                                          no parameters
//   Args: {\n  p_a: string\n  p_b?: number\n }           multi-line

function publicFunctionsBlock(text) {
  const anchor = text.indexOf('  public: {')
  if (anchor < 0) return null
  const at = text.indexOf('\n    Functions: {', anchor)
  if (at < 0) return null
  const open = text.indexOf('{', at + '\n    Functions: '.length)
  const end = closing(text, open, '{', '}')
  return end < 0 ? null : text.slice(open, end)
}

/** name -> array of { name, optional }, or null when the Args shape is unknown. */
function committedArgs(block) {
  const found = new Map()
  const entry = /\n      ([a-z0-9_]+): \{/g
  let e
  while ((e = entry.exec(block))) {
    const bodyOpen = block.indexOf('{', e.index + e[0].length - 1)
    const bodyEnd = closing(block, bodyOpen, '{', '}')
    if (bodyEnd < 0) break
    const body = block.slice(bodyOpen, bodyEnd)
    const at = body.indexOf('Args:')
    let args = null
    if (at >= 0) {
      const value = body.slice(at + 'Args:'.length).trimStart()
      if (value.startsWith('never')) args = []
      else if (value.startsWith('{')) {
        const o = body.indexOf('{', at)
        const c = closing(body, o, '{', '}')
        if (c > 0) {
          args = body
            .slice(o + 1, c)
            .split(/[;\n]/)
            .map((s) => s.trim())
            .filter(Boolean)
            .map((s) => {
              const p = /^([a-z0-9_]+)(\?)?:\s*(.*)$/i.exec(s)
              return p ? { name: p[1], optional: Boolean(p[2]), type: p[3] } : null
            })
            .filter(Boolean)
        }
      }
    }
    found.set(e[1], args)
    entry.lastIndex = bodyEnd
  }
  return found
}

const fnBlock = publicFunctionsBlock(generated)
const committed = fnBlock ? committedArgs(fnBlock) : new Map()
if (!fnBlock) {
  failures.push(`${TYPES}: the public Functions block could not be read, so clauses two and three judged nothing.`)
}

// ── CLAUSE TWO ───────────────────────────────────────────────────────────────
// An argument is `name: T` or `name?: T`. `| null` is not a form the generator
// has, so it is always a person's edit, and it is the exact edit that refused
// the push of 20 September.

let nullableArgs = 0
for (const [name, args] of committed) {
  if (!args) continue
  for (const a of args) {
    if (/\|\s*null/.test(a.type)) {
      nullableArgs++
      failures.push(
        `${TYPES}: ${name}.Args.${a.name} is typed "${a.type}". The generator never writes "| null" for an argument, so this was typed in by hand and the committed types no longer describe the database.`,
      )
    }
  }
}
if (fnBlock && nullableArgs === 0) {
  passes.push(`no argument in ${committed.size} exposed function(s) carries a hand-written "| null"`)
}

// ── CLAUSE THREE ─────────────────────────────────────────────────────────────
// The parameter NAMES, and which of them are optional, are decided by the SQL.
// The types must say the same thing.

/** The last declaration of a public function wins, exactly as a replay leaves it. */
function declaredFunctions() {
  const declared = new Map()
  for (const file of readdirSync(MIGRATIONS).filter((n) => n.endsWith('.sql')).sort()) {
    const sql = stripSqlComments(readFileSync(join(MIGRATIONS, file), 'utf8'))
    const re = /\bcreate\s+(?:or\s+replace\s+)?function\s+(?:"?([a-z0-9_]+)"?\.)?"?([a-z0-9_%]+)"?\s*\(/gi
    let m
    while ((m = re.exec(sql))) {
      if ((m[1] ?? 'public').toLowerCase() !== 'public') continue
      if (m[2].includes('%')) continue
      const open = m.index + m[0].length - 1
      const close = closing(sql, open, '(', ')')
      if (close < 0) continue
      const returns = /^\s*returns\s+(?:setof\s+)?(?:"?([a-z0-9_]+)"?\.)?"?([a-z0-9_]+)"?/i.exec(sql.slice(close, close + 400))
      const kind = (returns?.[2] ?? '').toLowerCase()
      // A trigger function is not callable through PostgREST and the generator
      // does not emit it, exactly as types-coverage reasons about it.
      if (kind === 'trigger' || kind === 'event_trigger') continue
      declared.set(m[2].toLowerCase(), { params: sql.slice(open + 1, close), file })
    }
  }
  return declared
}

/** Split a parameter list on top-level commas only. */
function parameters(params) {
  const parts = []
  let depth = 0
  let cur = ''
  for (const ch of params) {
    if (ch === '(') depth++
    if (ch === ')') depth--
    if (ch === ',' && depth === 0) {
      parts.push(cur)
      cur = ''
    } else cur += ch
  }
  if (cur.trim()) parts.push(cur)
  return parts.map((p) => {
    const t = p.trim()
    const named = /^"?([a-z0-9_]+)"?\s+\S/i.exec(t)
    return { name: named ? named[1].toLowerCase() : null, optional: /\bdefault\b/i.test(t) }
  })
}

let judged = 0
let mismatches = 0
if (fnBlock) {
  for (const [name, { params, file }] of declaredFunctions()) {
    const args = committed.get(name)
    if (args === undefined) {
      // The generator only emits functions PostgREST can reach, so an absence
      // here is ordinary and is not this guard's business.
      continue
    }
    if (args === null) {
      skipped.push(`${name}: its Args shape is not one this guard recognises`)
      continue
    }
    if (/(^|,)\s*(out|inout|variadic)\s+/i.test(params)) {
      skipped.push(`${name}: declared with an out, inout or variadic parameter`)
      continue
    }
    const expected = parameters(params)
    if (expected.some((p) => p.name === null)) {
      skipped.push(`${name}: a parameter name could not be read from ${file}`)
      continue
    }
    judged++
    const got = args.map((a) => a.name).sort()
    const want = expected.map((p) => p.name).sort()
    if (got.join(',') !== want.join(',')) {
      mismatches++
      failures.push(
        `${TYPES}: ${name} takes [${want.join(', ') || 'no parameters'}] in ${file} but the committed types say [${got.join(', ') || 'no parameters'}].`,
      )
      continue
    }
    for (const p of expected) {
      const a = args.find((x) => x.name === p.name)
      if (a.optional !== p.optional) {
        mismatches++
        failures.push(
          p.optional
            ? `${TYPES}: ${name}.Args.${p.name} is required in the types, but ${file} gives that parameter a default, so the generator would write it optional.`
            : `${TYPES}: ${name}.Args.${p.name} is optional in the types, but ${file} gives that parameter no default, so the generator would write it required.`,
        )
      }
    }
  }
  if (judged === 0) {
    failures.push(`${TYPES}: clause three judged no function at all, so it is not checking anything.`)
  } else if (mismatches === 0) {
    passes.push(`${judged} exposed function(s) carry exactly the parameters their migration declares`)
  }
}

console.log(`${TAG} ${passes.length} structural guarantee(s) verified:`)
for (const p of passes) console.log(`    PASS  ${p}`)
for (const s of skipped) console.log(`    SKIPPED  ${s}`)
console.log(
  '    NOTE  this guard reads the repository only. A column TYPE against the live schema is',
)
console.log(
  '          the types-drift guard\'s job, and presence of every migrated object is',
)
console.log('          types-cover-migrations\'. This one judges what a hand-edit disturbs.')

if (failures.length > 0) {
  console.error(`\n${TAG} FAILED. ${failures.length} sign(s) that the generated section was written rather than generated.\n`)
  for (const f of failures) console.error(`    ${f}`)
  console.error(
    '\n    Regenerate it rather than correcting it by hand:' +
      '\n      npx supabase gen types --lang=typescript --project-id <production ref>' +
      `\n    and replace everything above "${LEGACY_MARKER}" in ${TYPES}.` +
      '\n    A generated file that somebody has typed into is a file nothing can verify.\n',
  )
  process.exit(1)
}

console.log(
  `${TAG} PASS - the generated section is in the generator's own order, no argument carries a hand-written null, and every judged function matches its migration.`,
)
