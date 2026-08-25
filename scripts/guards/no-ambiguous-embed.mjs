/**
 * A POSTGREST EMBED THAT CANNOT NAME ITS FOREIGN KEY IS A RUNTIME FAILURE THAT
 * COMPILES AND TESTS CLEAN.
 *
 * WHAT HAPPENED, 20 August 2026, and it is the reason this guard exists.
 *
 * Migration 20260820000001 added `tickets.released_seat_id` so a refund could
 * remember which seat it gave back. That gave `tickets` a SECOND foreign key to
 * `seats`. Every existing query that embedded seats by table name, like
 *
 *     .select('..., seat:seats(row_label, seat_number, ...)')
 *
 * became ambiguous, and PostgREST does not degrade: it fails the WHOLE query with
 * "Could not embed because more than one relationship was found for 'tickets' and
 * 'seats'". Four surfaces broke at once, and all four are the product:
 *
 *     /tickets                              the buyer's wallet, rendered "No tickets yet"
 *     /t/[code]                             the QR page shown at the door
 *     /orders/[id]/confirmation             the order page, so no QR codes
 *     src/lib/email/order-confirmation.ts   the confirmation email, so no QR codes
 *
 * NOTHING CAUGHT IT. `tsc` passed, 2579 tests passed, 39 guards passed, and the
 * production build compiled, because the failure lives in a string that only
 * PostgREST parses, and only at runtime. It was found by LOADING the page as a
 * real signed-in buyer, which is the whole argument for driving surfaces instead
 * of reading them.
 *
 * WHAT THIS GUARD DOES. For every table that has more than one foreign key into
 * another table, any embed of the target BY BARE NAME is a defect: it must name
 * the constraint, `seats!tickets_seat_id_fkey(...)`. The ambiguous pairs are read
 * out of the migrations rather than hardcoded, so the next column that creates a
 * second path is covered the day it lands.
 *
 * IT PRINTS WHAT IT SCANNED, because a guard that only says PASS is one nobody
 * can tell apart from a guard that scanned nothing.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, relative } from 'node:path'
import { declareWork } from '../lib/work-report.mjs'

const ROOT = process.cwd()
const SRC = join(ROOT, 'src')
const MIGRATIONS = join(ROOT, 'supabase', 'migrations')

const failures = []
const notes = []
const note = (m) => notes.push(m)

function walk(dir, out = []) {
  let entries
  try { entries = readdirSync(dir, { withFileTypes: true }) } catch (error) {
    console.warn('[scripts/guards/no-ambiguous-embed:51]', error instanceof Error ? error.message : error)
    return out }
  for (const e of entries) {
    const full = join(dir, e.name)
    if (e.isDirectory()) { walk(full, out); continue }
    if (/\.(ts|tsx)$/.test(e.name)) out.push(full)
  }
  return out
}

if (!existsSync(MIGRATIONS)) {
  console.error('[no-ambiguous-embed] supabase/migrations is missing')
  process.exit(1)
}

/*
 * WHICH (source table -> target table) PAIRS HAVE MORE THAN ONE FOREIGN KEY.
 *
 * Read from the migrations so this is not a hand-kept list. Both spellings are
 * matched: an inline column reference on CREATE TABLE, and a later ADD COLUMN.
 */
const migrationFiles = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()
const fkCount = new Map() // "source>target" -> Set of column names

/*
 * BLOCK-AWARE, and the first version was not, which is why this comment exists.
 *
 * That version kept a single `currentTable` that survived from one statement to
 * the next, so every REFERENCES line after a CREATE TABLE was attributed to
 * whatever table was last seen. It concluded that half the schema had multiple
 * foreign keys to `organisations` and flagged nine embeds that have been serving
 * traffic for months. A guard with false positives is a guard somebody switches
 * off, which this repository has already learned the hard way on the rate-limit
 * audit. So the table a column belongs to is now tracked by STATEMENT:
 *
 *   * CREATE TABLE public.X ( ... );   columns belong to X until the block closes
 *   * ALTER TABLE public.X ... ;       columns belong to X until the statement ends
 *
 * Anything outside a statement belongs to nothing and is ignored.
 */
for (const file of migrationFiles) {
  const text = readFileSync(join(MIGRATIONS, file), 'utf8')
  let table = null
  let depth = 0
  let inAlter = false

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/--.*$/, '')

    if (table === null && !inAlter) {
      const create = /CREATE TABLE (?:IF NOT EXISTS )?public\.([a-z_]+)\s*\(/i.exec(line)
      if (create) {
        table = create[1]
        depth = (line.match(/\(/g) ?? []).length - (line.match(/\)/g) ?? []).length
        continue
      }
      const alter = /ALTER TABLE (?:ONLY )?public\.([a-z_]+)/i.exec(line)
      if (alter) {
        table = alter[1]
        inAlter = true
        // An ALTER that ends on its own line owns only this line.
        if (line.includes(';')) { collect(line, table); table = null; inAlter = false }
        continue
      }
      continue
    }

    collect(line, table)

    if (inAlter) {
      if (line.includes(';')) { table = null; inAlter = false }
    } else {
      depth += (line.match(/\(/g) ?? []).length - (line.match(/\)/g) ?? []).length
      if (depth <= 0) { table = null }
    }
  }

  function collect(line, source) {
    if (!source) return
    // `col UUID ... REFERENCES public.target(...)`, inline or via ADD COLUMN.
    const ref = /(?:ADD COLUMN\s+(?:IF NOT EXISTS\s+)?)?\b([a-z_][a-z0-9_]*)\s+UUID\b[^,;]*?REFERENCES\s+public\.([a-z_]+)/i.exec(line)
    if (!ref) return
    const [, column, target] = ref
    if (['references', 'constraint', 'foreign', 'add'].includes(column.toLowerCase())) return
    const key = `${source}>${target}`
    if (!fkCount.has(key)) fkCount.set(key, new Set())
    fkCount.get(key).add(column)
  }
}

const ambiguous = [...fkCount.entries()].filter(([, cols]) => cols.size > 1)
note(`${migrationFiles.length} migration file(s) parsed for foreign keys`)
note(`${ambiguous.length} table pair(s) have MORE THAN ONE foreign key and are therefore ambiguous to embed by name:`)
for (const [pair, cols] of ambiguous) {
  note(`    ${pair.replace('>', ' -> ')}  via ${[...cols].sort().join(', ')}`)
}

/*
 * THE SOURCE TABLE IS THE HALF THAT MATTERS, and leaving it out was the second
 * false-positive round. `organisations` is the target of an ambiguous pair
 * (founding_invites has two foreign keys to it), but `events -> organisations`
 * has exactly one, so `from('events').select('organisation:organisations(name)')`
 * is perfectly legal and has been serving traffic for months. Flagging every
 * embed of a target that is ambiguous from SOME table condemned nine working
 * queries. An embed is only ambiguous when the table being selected FROM is the
 * one with two paths, so the `.from()` is read and the pair is checked.
 */
const ambiguousPairs = new Map() // source -> Map(target -> columns[])
for (const [pair, cols] of ambiguous) {
  const [source, target] = pair.split('>')
  if (!ambiguousPairs.has(source)) ambiguousPairs.set(source, new Map())
  ambiguousPairs.get(source).set(target, [...cols].sort())
}

const files = walk(SRC)
note(`${files.length} TypeScript file(s) scanned under src/`)

let queriesChecked = 0
for (const abs of files) {
  const rel = relative(ROOT, abs).split('\\').join('/')
  const text = readFileSync(abs, 'utf8')

  const fromRe = /\.from\(\s*['"`]([a-z_]+)['"`]\s*\)/g
  let fm
  while ((fm = fromRe.exec(text)) !== null) {
    const source = fm[1]
    const pairs = ambiguousPairs.get(source)
    if (!pairs) continue

    // The select that belongs to this from(). Bounded so the next query's
    // select is not attributed to this one.
    const window = text.slice(fm.index, fm.index + 1200)
    const selectMatch = /\.select\(\s*([`'"])([\s\S]*?)\1/.exec(window)
    if (!selectMatch) continue
    const selectBody = selectMatch[2]
    queriesChecked += 1

    for (const [target, cols] of pairs) {
      // An embed already naming its constraint contains `target!`.
      const bare = new RegExp(`(?:^|[,\\s(])(?:[a-z_]+\\s*:\\s*)?${target}\\s*\\(`)
      const named = new RegExp(`${target}\\s*!`)
      if (bare.test(selectBody) && !named.test(selectBody)) {
        failures.push(
          `${rel}: \`from('${source}')\` embeds \`${target}\` by bare name, but ${source} has `
          + `${cols.length} foreign keys to ${target} (${cols.join(', ')}), so PostgREST fails the WHOLE `
          + `query with "Could not embed because more than one relationship was found". `
          + `Name the constraint, for example \`${target}!${source}_${cols[cols.length - 1]}_fkey(...)\`. `
          + `select: ${selectBody.trim().slice(0, 160)}`,
        )
      }
    }
  }
}
note(`${queriesChecked} query/queries selected FROM a table with an ambiguous relationship`)
note(`${failures.length} of them embed it by bare name`)

console.log('[no-ambiguous-embed] what this guard scanned:')
for (const n of notes) console.log(`    - ${n}`)

if (failures.length) {
  console.error('\n[no-ambiguous-embed] FAILED\n')
  for (const f of failures) console.error(`    ${f}\n`)
  console.error('    This class of defect compiles, typechecks and unit-tests clean. It only')
  console.error('    appears when a real page runs the query, which is why it needs a guard.')
  process.exit(1)
}

declareWork('no-ambiguous-embed', {
  did: { 'source file read': files.length },
  found: { 'ambiguous embed': 0 },
})
console.log('[no-ambiguous-embed] OK: every embed of an ambiguous relationship names its foreign key.')
