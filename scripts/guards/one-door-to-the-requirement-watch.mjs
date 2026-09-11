/**
 * GUARD: the monitor's memory has one door, and the clock it keeps cannot be
 * wound back.
 *
 * WHY (11 September 2026, close-out S1). S1 asks for AMBER when "anything sits
 * in pending_verification for more than 3 days". Stripe publishes WHAT is
 * pending and never WHEN it started: the Account object carries no
 * per-requirement timestamp at all (https://docs.stripe.com/api/accounts/object,
 * fetched 2026-09-11). So the age comes from this side, from
 * public.connect_requirement_watch, and the whole value of that table is one
 * column: first_seen_at.
 *
 * An age computed from a timestamp anything can rewrite is an assertion wearing
 * a measurement's clothes. The database refuses the rewrite already (trigger
 * connect_requirement_watch_first_seen_fixed, drilled red on TEST), and this
 * guard stops the SHAPE that would make a caller try: an upsert whose payload
 * carries first_seen_at succeeds silently everywhere the trigger is not, and
 * fails loudly in production, which is the worst of both.
 *
 * THE THREE CLAUSES.
 *
 *   1. ONE DOOR. Exactly one module in src/ names the table in CODE. The
 *      read-only contract of the health layer holds only because the monitor's
 *      writes are confined to its own scratch table; a second writer is a second
 *      place that confinement can be lost, and nobody would notice, because the
 *      table is invisible to every other test.
 *   2. THE CLOCK IS NEVER WOUND. That module never writes first_seen_at: not in
 *      an insert, not in an upsert, not in an update.
 *   3. A FAILED WRITE MUST NOT BREAK THE CHECK. Every call into the table reads
 *      its error and reports it, because a monitor that goes down because its
 *      notebook is full is worse than a monitor with no notebook. This is the
 *      direction S1 exists to fail in: towards silence on one amber clause,
 *      never towards a false alarm or a dead check.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { declareWork } from '../lib/work-report.mjs'

const TABLE = 'connect_requirement_watch'
const DOOR = 'src/lib/stripe/requirement-watch.ts'
const CLOCK = 'first_seen_at'

export function sourceFiles(root, dir) {
  const out = []
  const walk = (current) => {
    for (const entry of readdirSync(current)) {
      const full = join(current, entry)
      if (statSync(full).isDirectory()) {
        walk(full)
        continue
      }
      if (/\.tsx?$/.test(entry)) out.push(relative(root, full).replace(/\\/g, '/'))
    }
  }
  walk(dir)
  return out
}

/**
 * Source with comments removed, so clause 1 judges CODE.
 *
 * THE FALSE POSITIVE THAT FORCED THIS. On its first run the guard accused
 * src/lib/stripe/account-health.ts of being a second door to the table. That
 * file names it once, in a header comment, explaining where the requirement age
 * comes from. Stripping comments is the difference between a guard about what
 * the code DOES and a guard about what the code TALKS ABOUT, and only the first
 * kind survives a month.
 */
export function codeOnly(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split(/\r?\n/)
    .map(line => line.replace(/\/\/.*$/, ''))
    .join('\n')
}

/**
 * Every line that WRITES the clock column, which is not the same as every line
 * that names it.
 *
 * THE SECOND FALSE POSITIVE. The first draft flagged any line containing
 * first_seen_at that did not sit beside a `.select(`, and it accused
 * `perAccount.set(row.requirement, wholeDaysSince(row.first_seen_at, now))` -
 * the READ that the whole age is computed from, three lines below the select
 * that fetched it. A guard that fires on the read it exists to protect is worse
 * than no guard at all.
 *
 * So a write is what a write actually looks like here: an OBJECT KEY,
 * `first_seen_at:`, which is how it would reach an insert, an upsert or an
 * update payload. A property read carries a dot in front of it and is not one,
 * and a select list carries no colon.
 */
export function clockWrites(text) {
  const lines = codeOnly(text).split(/\r?\n/)
  const out = []
  const key = new RegExp(`(^|[^.\\w])${CLOCK}\\s*:`)
  for (let i = 0; i < lines.length; i += 1) {
    const trimmed = lines[i].trim()
    if (!key.test(trimmed)) continue
    out.push({ line: i + 1, text: trimmed })
  }
  return out
}

function main() {
  const here = dirname(fileURLToPath(import.meta.url))
  const root = resolve(here, '..', '..')
  const tag = '[one-door-to-the-requirement-watch]'
  const problems = []

  const files = sourceFiles(root, join(root, 'src'))

  /* ---- clause 1: one door ---- */
  /*
   * THE SCHEMA RECORD IS NOT A DOOR. src/types/database.ts is generated from
   * the database and names every table by definition; it reads nothing and
   * writes nothing, so it can be neither a second door nor a wound clock.
   *
   * It was absent from this list for the first day of the guard's life only
   * because the types had never been regenerated for the migration that
   * creates the table: the first push after the founder applied that migration
   * was refused by the types-drift guard (11 September 2026), the regeneration
   * put connect_requirement_watch into the types, and this guard promptly
   * accused the types file. Its first green was a symptom of the defect the
   * types-cover-migrations guard now refuses. Excluded by name, and printed on
   * every run, so the exclusion cannot widen quietly.
   */
  const SCHEMA_RECORD = 'src/types/database.ts'
  console.log(`${tag} ${SCHEMA_RECORD} is the generated schema record: it names every table and is not a door`)
  const namers = files.filter(
    f => f !== SCHEMA_RECORD && codeOnly(readFileSync(join(root, f), 'utf8')).includes(TABLE),
  )
  for (const file of namers) {
    if (file === DOOR) continue
    problems.push(
      `${file} names ${TABLE} in code. Only ${DOOR} may read or write it. The health layer is read-only against orders, seats and money, and that contract survives only while the monitor's writes stay inside its own scratch table.`,
    )
  }
  if (!namers.includes(DOOR)) {
    problems.push(
      `${DOOR} no longer names ${TABLE}, so this guard is judging nothing. Either the door moved, in which case point this at it, or the age rule was dropped, in which case close-out S1 has a requirement back on it.`,
    )
  }

  /* ---- clauses 2 and 3: the clock, and the failure direction ---- */
  let doorText = ''
  try {
    doorText = readFileSync(join(root, DOOR), 'utf8')
  } catch (error) {
    problems.push(`${DOOR} is unreadable (${error.message}), so clauses 2 and 3 could not run.`)
  }

  if (doorText) {
    for (const hit of clockWrites(doorText)) {
      problems.push(
        `${DOOR}:${hit.line} writes ${CLOCK} (${hit.text}). ` +
          `It is the one column that must never move: "more than 3 days" is only a measurement while the first sighting is fixed. ` +
          `An upsert payload carrying it would rewrite the age on every run, everywhere the database trigger is absent.`,
      )
    }
    const handled = (doorText.match(/const\s*\{[^}]*error[^}]*\}\s*=\s*await/g) ?? []).length
    if (handled === 0) {
      problems.push(
        `${DOOR} reads no \`error\` from any Supabase call, so a failed write would either throw into the health check or pass unnoticed. Neither is allowed: report it and carry on with the age unknown.`,
      )
    }
    if (!/console\.warn\(/.test(doorText)) {
      problems.push(
        `${DOOR} never warns. A write that fails must leave a line somebody can find, or the age silently becomes zero for ever and the amber clause quietly stops existing.`,
      )
    }
  }

  declareWork('one-door-to-the-requirement-watch', {
    did: {
      'source file scanned': files.length,
      'module naming the watch table judged': namers.length,
      'clause checked': 3,
    },
    found: { 'second door or wound clock': problems.length },
  })

  if (problems.length > 0) {
    console.error('')
    console.error(`${tag} FAIL - ${problems.length} problem(s):`)
    for (const p of problems) console.error(`    ${p}`)
    process.exitCode = 1
    return
  }
  console.log(
    `${tag} PASS - ${DOOR} is the only door to ${TABLE}, ${CLOCK} is read and never written, and a failed write degrades the age rather than the check.`,
  )
}

const invokedDirectly = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(resolve(process.argv[1])).href
if (invokedDirectly) main()
