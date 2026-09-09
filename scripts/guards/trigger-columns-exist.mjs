/**
 * GUARD: A TRIGGER MAY NOT NAME A COLUMN THAT DOES NOT EXIST.
 *
 * WHY THIS EXISTS, 10 September 2026 (close-out UX3). Migration
 * 20260909000002 added an AFTER INSERT trigger on public.events whose function
 * read `new.city`. There is no `city` column on events; the columns are
 * `venue_city` and `city_primary`. plpgsql resolves a record field at RUNTIME,
 * so:
 *
 *   the migration applied cleanly
 *   `npx tsc --noEmit` was clean
 *   the whole suite was green
 *   all 92 registered guards passed
 *   `next build` exited 0
 *
 * and the platform could not create an event. An organiser pressing Publish got
 * "Failed to create event: record "new" has no field "city"". Every static gate
 * in this repository was green while event creation was broken, and the only
 * thing that found it was driving the wizard in a browser.
 *
 * A driven proof should not be the FIRST place a typo is caught, so this is the
 * cheap check that catches it at build time.
 *
 * HOW. It reads the migrations in order and works out, for each trigger that is
 * currently installed, which table it sits on and which function it runs; takes
 * the LAST definition of that function (a later `create or replace` supersedes
 * an earlier one); pulls every `new.<field>` and `old.<field>` out of that body;
 * and checks each one against the committed src/types/database.ts, which is the
 * repository's own record of the schema.
 *
 * WHAT IT DELIBERATELY DOES NOT DO. It does not read a database: this must run
 * on the Vercel build host, which has no credentials for one. It judges the
 * repository against the repository, which is exactly the question "did somebody
 * type a column name that this schema does not have".
 *
 * WHAT IT CANNOT SEE, said plainly. A column added by a migration and never
 * regenerated into database.ts reads here as missing, which is a true finding
 * about the types file rather than a false one. A table absent from database.ts
 * (a view, or a table outside the public schema) is reported SKIPPED by name
 * rather than passed silently.
 *
 * Run: node scripts/guards/trigger-columns-exist.mjs
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { declareWork } from '../lib/work-report.mjs'
import { parseGeneratedTypes } from '../ci/types-drift-analyse.mjs'

const ROOT = process.cwd()
const TAG = '[trigger-columns-exist]'
const MIGRATIONS = join(ROOT, 'supabase', 'migrations')
const TYPES = join(ROOT, 'src', 'types', 'database.ts')

/**
 * plpgsql names that are not columns. `new` and `old` also carry these, and a
 * body that reads one is not naming a column at all.
 */
const RECORD_PSEUDO_FIELDS = new Set(['ctid', 'tableoid', 'xmin', 'xmax', 'cmin', 'cmax'])

/**
 * Walk the migrations in order and answer: which triggers are installed now,
 * on what table, running what function.
 *
 * A `drop trigger if exists X on public.T` removes; a `create trigger X ... on
 * public.T ... execute function public.F()` installs. Both appear constantly in
 * this repository because a migration that redefines a trigger drops it first,
 * so the two must be replayed in order rather than counted.
 */
export function installedTriggers(files) {
  const live = new Map()
  for (const { name, sql } of files) {
    const lower = sql.toLowerCase()
    for (const m of lower.matchAll(/drop\s+trigger\s+(?:if\s+exists\s+)?([a-z0-9_]+)\s+on\s+[a-z0-9_.]+/g)) {
      live.delete(m[1])
    }
    for (const m of lower.matchAll(
      /create\s+trigger\s+([a-z0-9_]+)\b([\s\S]*?)execute\s+(?:function|procedure)\s+(?:public\.)?([a-z0-9_]+)\s*\(/g,
    )) {
      // The schema is captured with the name, so a trigger on auth.users is
      // reported as auth.users rather than as a table called "auth".
      const on = /\son\s+([a-z0-9_]+(?:\.[a-z0-9_]+)?)/.exec(m[2])?.[1]
      if (!on) continue
      const [schema, bare] = on.includes('.') ? on.split('.') : ['public', on]
      live.set(m[1], { schema, table: bare, fn: m[3], migration: name })
    }
  }
  return live
}

/**
 * The LAST body of every `returns trigger` function, keyed by function name.
 *
 * The dollar-quote tag is captured and matched, so a body containing `$$` inside
 * a nested block cannot end the match early.
 */
export function triggerFunctionBodies(files) {
  const bodies = new Map()
  for (const { name, sql } of files) {
    const re =
      /create\s+or\s+replace\s+function\s+(?:public\.)?([a-z0-9_]+)\s*\(\s*\)\s*\n?\s*returns\s+trigger\b[\s\S]*?\bas\s+(\$[a-z0-9_]*\$)([\s\S]*?)\2\s*;/gi
    for (const m of sql.matchAll(re)) {
      bodies.set(m[1].toLowerCase(), { body: m[3], migration: name })
    }
  }
  return bodies
}

/** Every `new.x` and `old.x` a body reads, deduplicated. */
export function recordFieldsIn(body) {
  const fields = new Set()
  for (const m of body.matchAll(/\b(?:new|old)\.([a-z_][a-z0-9_]*)/gi)) {
    const field = m[1].toLowerCase()
    if (!RECORD_PSEUDO_FIELDS.has(field)) fields.add(field)
  }
  return [...fields].sort()
}

/** The column names database.ts records for one public table, or null. */
export function columnsOf(leaves, table) {
  const prefix = `public.Tables.${table}.Row.`
  const columns = new Set()
  for (const key of leaves.keys()) {
    if (key.startsWith(prefix)) columns.add(key.slice(prefix.length))
  }
  return columns.size > 0 ? columns : null
}

const files = readdirSync(MIGRATIONS)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((name) => ({ name, sql: readFileSync(join(MIGRATIONS, name), 'utf8') }))

const leaves = parseGeneratedTypes(readFileSync(TYPES, 'utf8'))
const live = installedTriggers(files)
const bodies = triggerFunctionBodies(files)

const faults = []
const skipped = []
let judged = 0
let fieldsChecked = 0

for (const [trigger, { schema, table, fn }] of [...live.entries()].sort()) {
  const definition = bodies.get(fn)
  if (!definition) {
    // The function is defined by something other than a `create or replace
    // ... returns trigger` in a migration (the baseline schema uses a different
    // spelling). Nothing to judge, and saying so beats passing silently.
    skipped.push(`${trigger}: no trigger-function body found for public.${fn}()`)
    continue
  }
  const columns = schema === 'public' ? columnsOf(leaves, table) : null
  if (!columns) {
    skipped.push(
      `${trigger}: ${schema}.${table} is not in src/types/database.ts, so its columns are unknown here`,
    )
    continue
  }
  judged += 1
  for (const field of recordFieldsIn(definition.body)) {
    fieldsChecked += 1
    if (!columns.has(field)) {
      faults.push(
        `${trigger} on public.${table} runs public.${fn}() (${definition.migration}), which reads new.${field} or old.${field}. ` +
          `public.${table} has no column "${field}". plpgsql resolves a record field at RUNTIME, so this applies cleanly and then ` +
          `raises "record has no field" on the first write, breaking the very state change the trigger is watching.`,
      )
    }
  }
}

declareWork('trigger-columns-exist', {
  did: { 'migration read': files.length, 'installed trigger judged': judged },
  found: { 'record field checked': fieldsChecked, 'column that does not exist': faults.length },
  zeroIsFine: {
    'column that does not exist': 'every installed trigger reads only columns the committed types carry',
  },
})

for (const s of skipped) console.log(`${TAG} SKIPPED ${s}`)
if (faults.length > 0) {
  for (const f of faults) console.error(`${TAG} FAIL: ${f}`)
  console.error(`${TAG} ${faults.length} fault(s).`)
  process.exitCode = 1
} else {
  console.log(
    `${TAG} PASS - ${judged} installed trigger(s), ${fieldsChecked} record field(s), every one a real column.`,
  )
}
