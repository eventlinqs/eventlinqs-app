/**
 * THE PLATFORM FEE HAS ONE WRITER, AND THE FORM MAY NOT OFFER A VALUE THE
 * DATABASE REFUSES.
 *
 * ===========================================================================
 * THE DEFECT, DRIVEN AGAINST TEST ON 20 SEPTEMBER 2026
 * ===========================================================================
 *
 * On 2026-07-27 migration 20260727000002 added
 * uq_pricing_rules_one_open_per_scope and wrote the obligation into the index's
 * own COMMENT:
 *
 *     'Writers must stamp the previous row before inserting the next version.'
 *
 * No writer was changed that day. src/lib/admin/pricing.ts inserted a row with
 * effective_until NULL and left the previous row open, so from that date every
 * save on /admin/pricing was refused by the index it had just been handed:
 *
 *   insert ... ('platform_fee_percentage','AU','AUD',...,4,now(),null,7.5)
 *   ERROR: 23505 duplicate key value violates unique constraint
 *          "uq_pricing_rules_one_open_per_scope"
 *
 * That is the REGION DEFAULT path, carrying the AU launch fee at version 3.
 * The constitution says the founder edits the percentage and the flat amount in
 * /admin/pricing with no code deploy. For fifty five days the screen could not
 * save anything at all, and nothing in the tree could notice, because the
 * obligation lived in a database comment and the breach lived in TypeScript.
 *
 * A SECOND REFUSAL sat on top of it. pricing_rules_value_split_check requires
 * value_percentage > 0, and the override form shipped defaultValue={0} with
 * min="0" on that field, so the form AS RENDERED submitted the one value the
 * database rejects:
 *
 *   insert ... value_percentage 0
 *   ERROR: 23514 ... violates check constraint "pricing_rules_value_split_check"
 *
 * The region form had the same fault for any scope with no rule yet, and on
 * TEST that is IE/EUR, which holds none of the three rules and so rendered a
 * zero the database would refuse.
 *
 * ===========================================================================
 * THE FOUR CLAUSES, AND WHAT EACH ONE STOPS
 * ===========================================================================
 *
 * 1. Every WRITE to pricing_rules in src/ goes through the one database
 *    function. A second writer is how the first one drifted: the rule was in a
 *    comment on an index, which no reviewer of a TypeScript file ever sees.
 *
 * 2. The percentage bound in the code is DERIVED FROM THE MIGRATION, not from
 *    a number typed here. The guard reads the live CHECK out of the migration
 *    that last defines it, and if the constraint says `> 0` then a Zod field
 *    for that column must say `.gt(0)`. Change the constraint and this clause
 *    changes with it.
 *
 * 3. No form control for that column may OFFER a value the constraint refuses:
 *    no min="0", no zero fallback. A screen that proposes an unsavable number
 *    and then blames the user for it is worse than one that asks.
 *
 * 4. The writer is granted to service_role and to nobody else. A browser
 *    session must never reach the fee writer.
 *
 * WHAT THIS GUARD CANNOT SEE, said plainly rather than implied. It reads the
 * tree, never the database. It cannot tell whether the function is actually
 * installed on any project, and it cannot tell whether the CHECK on a live
 * database still matches the migration that last defined it. Those are the job
 * of `supabase db push` and of the types-drift guard. What it holds is the
 * agreement BETWEEN the migration and the code, which is precisely the seam
 * that went unnoticed for fifty five days.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { readSource, sourceFiles, lineAt } from './lib/source.mjs'
import { declareWork } from '../lib/work-report.mjs'

const TAG = '[one-lawful-writer-of-the-fee]'
const ROOT = process.cwd()
const MIGRATIONS = join(ROOT, 'supabase', 'migrations')

const TABLE = 'pricing_rules'
const WRITER = 'write_pricing_rule'
const GUARDED_COLUMN = 'value_percentage'
/** The Zod field name that carries GUARDED_COLUMN into the database. */
const GUARDED_FIELD = 'platform_fee_percentage'

const MUTATORS = ['insert', 'update', 'upsert', 'delete']

/** Migration files, oldest first, so "last defined" means what it says. */
function migrationFiles() {
  return readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => ({ name: f, sql: readFileSync(join(MIGRATIONS, f), 'utf8') }))
}

/**
 * The comparison the live CHECK makes on GUARDED_COLUMN, read out of the
 * migration that LAST defines pricing_rules_value_split_check.
 *
 * Returns { op, bound } e.g. { op: '>', bound: 0 }, or null when no migration
 * defines it, which is itself a failure: a guard that silently finds no
 * constraint would pass every tree.
 */
function liveLowerBound(files) {
  let found = null
  for (const { name, sql } of files) {
    const add = sql.match(
      new RegExp(`add\\s+constraint\\s+${TABLE}_value_split_check\\s+check\\s*\\(([\\s\\S]*?)\\)\\s*(?:not\\s+valid)?\\s*;`, 'i'),
    )
    if (!add) continue
    const body = add[1]
    const cmp = body.match(new RegExp(`${GUARDED_COLUMN}\\s*(>=|>)\\s*([0-9.]+)`, 'i'))
    if (cmp) found = { op: cmp[1], bound: Number(cmp[2]), migration: name }
  }
  return found
}

/**
 * Writes to TABLE, found in code with comments and string bodies intact for the
 * table name but comments blanked, so the long explanations above a fixed call
 * site cannot be mistaken for the call site itself.
 *
 * The window stops at the NEXT `.from(` so a mutating call on a different table
 * further down the file can never be attributed to this one.
 */
function directWrites(file, withStrings) {
  const out = []
  const needle = new RegExp(`from\\(['"\`]${TABLE}['"\`]\\)`, 'g')
  let m
  while ((m = needle.exec(withStrings)) !== null) {
    const start = m.index
    const nextFrom = withStrings.indexOf('.from(', start + m[0].length)
    const end = nextFrom === -1 ? Math.min(start + 400, withStrings.length) : nextFrom
    const window = withStrings.slice(start, end)
    for (const verb of MUTATORS) {
      if (window.includes(`.${verb}(`)) {
        out.push({ file, line: lineAt(withStrings, start), verb })
        break
      }
    }
  }
  return out
}

function main() {
  const files = migrationFiles()
  if (files.length === 0) {
    console.error(`${TAG} FAIL: no migration files under supabase/migrations`)
    process.exit(1)
  }

  const bound = liveLowerBound(files)
  if (!bound) {
    console.error(
      `${TAG} FAIL: no migration defines ${TABLE}_value_split_check, so the bound this guard ` +
        `holds the code against cannot be derived. It is never assumed.`,
    )
    process.exit(1)
  }

  const problems = []
  const sources = sourceFiles(ROOT)
  let tableReads = 0
  let rpcCalls = 0
  let fieldsChecked = 0
  let inputsChecked = 0

  for (const file of sources) {
    const { withStrings } = readSource(join(ROOT, file))
    if (!withStrings.includes(TABLE) && !withStrings.includes(WRITER) && !withStrings.includes(GUARDED_FIELD)) continue

    // ---- Clause 1: one writer -------------------------------------------
    const reads = withStrings.match(new RegExp(`from\\(['"\`]${TABLE}['"\`]\\)`, 'g'))
    if (reads) tableReads += reads.length
    for (const w of directWrites(file, withStrings)) {
      problems.push(
        `${w.file}:${w.line} calls .${w.verb}() on ${TABLE} directly. The one lawful writer is ` +
          `rpc('${WRITER}'), which stamps the open row and inserts the next version in one ` +
          `transaction. A direct write leaves the previous row open and is refused by ` +
          `uq_pricing_rules_one_open_per_scope.`,
      )
    }
    const rpc = withStrings.match(new RegExp(`rpc\\(['"\`]${WRITER}['"\`]`, 'g'))
    if (rpc) rpcCalls += rpc.length

    // ---- Clause 2: the Zod bound matches the migration -------------------
    const fieldRe = new RegExp(`${GUARDED_FIELD}\\s*:\\s*z\\.[^,\\n]*`, 'g')
    let f
    while ((f = fieldRe.exec(withStrings)) !== null) {
      fieldsChecked += 1
      const chain = f[0]
      const wants = bound.op === '>' ? `.gt(${bound.bound})` : `.min(${bound.bound})`
      const forbids = bound.op === '>' ? `.min(${bound.bound})` : null
      if (!chain.includes(wants) || (forbids && chain.includes(forbids))) {
        problems.push(
          `${file}:${lineAt(withStrings, f.index)} bounds ${GUARDED_FIELD} as \`${chain.trim()}\`, but ` +
            `${bound.migration} constrains ${GUARDED_COLUMN} to \`${bound.op} ${bound.bound}\`, so the ` +
            `schema must use ${wants}. A value this accepts and the database refuses reaches the ` +
            `founder as a 23514 with no sentence attached.`,
        )
      }
    }

    // ---- Clause 3: no control offers a refused value ---------------------
    if (file.endsWith('.tsx')) {
      const nameRe = new RegExp(`name=["'\`]${GUARDED_FIELD}["'\`]`, 'g')
      let n
      while ((n = nameRe.exec(withStrings)) !== null) {
        inputsChecked += 1
        const open = withStrings.lastIndexOf('<input', n.index)
        const close = withStrings.indexOf('/>', n.index)
        if (open === -1 || close === -1) continue
        const el = withStrings.slice(open, close)
        const line = lineAt(withStrings, open)
        const minAttr = el.match(/min=["']([0-9.]+)["']/)
        if (minAttr && !(Number(minAttr[1]) > bound.bound)) {
          problems.push(
            `${file}:${line} offers min="${minAttr[1]}" on ${GUARDED_FIELD}, which the database refuses ` +
              `(${GUARDED_COLUMN} ${bound.op} ${bound.bound}). The control must not propose a value that ` +
              `cannot be saved.`,
          )
        }
        if (/defaultValue=\{\s*0\s*\}/.test(el) || /\?\?\s*0\s*\}/.test(el)) {
          problems.push(
            `${file}:${line} defaults ${GUARDED_FIELD} to 0, which ${bound.migration} refuses. A scope ` +
              `with no rule yet must render EMPTY and required, so the founder is asked for a rate ` +
              `rather than handed one the save will reject. Zero fee is the Founding Organiser waiver.`,
          )
        }
      }
    }
  }

  // ---- Clause 4: the writer exists and is granted to service_role only ----
  const declaring = files.filter((f) =>
    new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${WRITER}\\b`, 'i').test(f.sql),
  )
  if (declaring.length === 0) {
    problems.push(
      `no migration declares public.${WRITER}, yet the code is required to write through it. ` +
        `The function and the rule that points at it must land together.`,
    )
  }
  let grantsSeen = 0
  for (const { name, sql } of files) {
    const grantRe = new RegExp(`grant\\s+execute\\s+on\\s+function\\s+public\\.${WRITER}[\\s\\S]*?to\\s+([^;]+);`, 'gi')
    let g
    while ((g = grantRe.exec(sql)) !== null) {
      grantsSeen += 1
      const roles = g[1].toLowerCase()
      for (const role of ['anon', 'authenticated', 'public']) {
        if (new RegExp(`\\b${role}\\b`).test(roles)) {
          problems.push(
            `${name} grants execute on public.${WRITER} to ${role}. The fee writer is reachable by the ` +
              `service-role client behind /admin/pricing and by nothing else.`,
          )
        }
      }
    }
  }
  if (declaring.length > 0 && grantsSeen === 0) {
    problems.push(
      `public.${WRITER} is declared but no migration grants execute on it, so the admin client cannot ` +
        `call it and every save would fail with 42501.`,
    )
  }

  declareWork('one-lawful-writer-of-the-fee', {
    did: {
      'migration read': files.length,
      'source file scanned': sources.length,
      // The head noun leads, so the pluraliser has something to pluralise:
      // "7 read sites on pricing_rules", never "7 pricing_ruleses".
      [`read site on ${TABLE}`]: tableReads,
      'write through the one writer': rpcCalls,
      'percentage bound checked': fieldsChecked,
      'percentage control checked': inputsChecked,
      'execute grant checked': grantsSeen,
    },
    found: { 'way to write a fee the database would refuse': problems.length },
  })

  if (problems.length > 0) {
    console.error(`${TAG} FAIL: ${problems.length} fault(s)`)
    for (const p of problems) console.error(`  ${p}`)
    process.exit(1)
  }

  console.log(
    `${TAG} PASS: every ${TABLE} write in src/ goes through rpc('${WRITER}') (${rpcCalls} call site(s)); ` +
      `${fieldsChecked} percentage bound(s) and ${inputsChecked} control(s) agree with ` +
      `${bound.migration} (${GUARDED_COLUMN} ${bound.op} ${bound.bound}); the writer is granted to ` +
      `service_role only`,
  )
}

if (process.argv[1] && process.argv[1].endsWith('one-lawful-writer-of-the-fee.mjs')) main()
