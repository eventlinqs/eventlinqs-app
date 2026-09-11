/**
 * THE COMMITTED TYPES COVER EVERY MIGRATION IN THE TREE: the pure half.
 *
 * WHY THIS EXISTS, 11 September 2026. Five migrations (20260910000001 to
 * 20260911000001: the ticket-tier identity function, the slot ledger, the
 * recovery engine, the recovery holds and the connect requirement watch) were
 * written, applied to TEST, driven and committed, and src/types/database.ts was
 * never regenerated for any of them. Nothing noticed for two days:
 *
 *   - the types-drift guard compares the committed file with PRODUCTION, and
 *     production had not been given the migrations yet, so the committed file
 *     and the live schema were stale in exactly the same way and it said IN SYNC
 *     on twenty-six consecutive runs;
 *   - typecheck was clean, because supabase-js answers `.from()` on a table name
 *     the types do not know with `any`, so seven tables of new code compiled
 *     without a single typed row;
 *   - the moment the founder applied the migrations, the same guard refused the
 *     push with 285 unexplained differences, every one of them an object the
 *     tree's own migration files had created.
 *
 * That guard needs a database and a token, so it can only ask "does the
 * committed file match what is live". THIS module asks the question that was
 * unanswerable offline: does the committed file carry every object that the
 * migrations in this repository create. It reads nothing but the repository,
 * so it runs on the Vercel build host, in CI and in the pre-push gate alike,
 * and it would have refused the commit that introduced the staleness.
 *
 * WHAT IT REPLAYS, in migration order, statement by statement as they appear:
 *
 *   create table            public.Tables.<name>
 *   create [materialized] view   public.Views.<name>
 *   create type ... as enum public.Enums.<name>
 *   create function         public.Functions.<name>, unless it RETURNS TRIGGER
 *                           or EVENT_TRIGGER, which the generator never emits
 *   alter table add column  public.Tables.<table>.Row.<column>
 *   rename / drop           the entry moves or goes, so a superseded name is
 *                           never demanded
 *
 * WHAT IT CANNOT SEE, said plainly rather than passed over:
 *
 *   - a table or type in any schema other than public. The generator emits
 *     public only, so those are reported as not judged, by name;
 *   - a name built at runtime (`format('ALTER TABLE public.%I ...')`), which is
 *     reported as skipped rather than guessed at;
 *   - a column type that changed. Presence is judged, not shape; shape is the
 *     types-drift guard's job, against a real database;
 *   - a function whose grants make it unreachable from PostgREST. The generator
 *     emits it regardless of grants, so it is demanded here regardless too.
 */

const NL = String.fromCharCode(10)

const q = (schema, name) => `${(schema || 'public').toLowerCase()}.${name.toLowerCase()}`

/** `--` line comments and block comments, gone. Strings are left alone. */
export function stripSqlComments(sql) {
  return String(sql)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\n]*/g, '')
}

/**
 * The index just past the parenthesis that closes the one at `open`, or -1.
 * A function signature can carry `default now()` or `numeric(12, 2)` inside
 * its own parentheses, so a regex that stops at the first `)` reads the wrong
 * return type; this counts depth instead.
 */
function closingParen(text, open) {
  let depth = 0
  for (let i = open; i < text.length; i++) {
    const ch = text[i]
    if (ch === '(') depth += 1
    else if (ch === ')') {
      depth -= 1
      if (depth === 0) return i + 1
    }
  }
  return -1
}

const NOT_A_COLUMN = new Set(['constraint', 'primary', 'unique', 'foreign', 'check', 'exclude', 'column'])

/**
 * Replay the migrations and answer what the schema holds NOW, by name.
 *
 * `files` is `[{ name, sql }]` in version order. Every map is keyed
 * `schema.name` (columns `schema.table.column`) and valued with the migration
 * that most recently created or moved the object, so a finding can say which
 * file to look at.
 */
export function migrationSchemaObjects(files) {
  const tables = new Map()
  const views = new Map()
  const enums = new Map()
  const functions = new Map()
  const columns = new Map()
  const dynamic = []
  const dynamicSeen = new Set()
  // One line per distinct runtime-built name: schema_hygiene formats the same
  // `ALTER TABLE public.%I` four times and the reader needs to see it once.
  const noteDynamic = (line) => {
    if (dynamicSeen.has(line)) return
    dynamicSeen.add(line)
    dynamic.push(line)
  }

  const moveColumns = (from, to) => {
    for (const [key, value] of [...columns]) {
      if (key.startsWith(`${from}.`)) {
        columns.delete(key)
        columns.set(`${to}${key.slice(from.length)}`, value)
      }
    }
  }
  const dropColumns = (table) => {
    for (const key of [...columns.keys()]) if (key.startsWith(`${table}.`)) columns.delete(key)
  }

  for (const { name, sql: raw } of files) {
    const sql = stripSqlComments(raw)
    const events = []
    const collect = (re, handler) => {
      for (const m of sql.matchAll(re)) events.push({ at: m.index, run: () => handler(m) })
    }
    const dynamicName = (n) => n.includes('%')

    collect(
      /\bcreate\s+(?:unlogged\s+)?table\s+(?:if\s+not\s+exists\s+)?(?:"?([a-z0-9_]+)"?\.)?"?([a-z0-9_%]+)"?/gi,
      (m) => {
        if (dynamicName(m[2])) return noteDynamic(`${name}: create table ${m[2]}`)
        tables.set(q(m[1], m[2]), name)
      },
    )
    collect(
      /\bcreate\s+(?:or\s+replace\s+)?(?:materialized\s+)?view\s+(?:if\s+not\s+exists\s+)?(?:"?([a-z0-9_]+)"?\.)?"?([a-z0-9_%]+)"?/gi,
      (m) => {
        if (dynamicName(m[2])) return noteDynamic(`${name}: create view ${m[2]}`)
        views.set(q(m[1], m[2]), name)
      },
    )
    collect(/\bdrop\s+(?:materialized\s+)?view\s+(?:if\s+exists\s+)?(?:"?([a-z0-9_]+)"?\.)?"?([a-z0-9_]+)"?/gi, (m) =>
      views.delete(q(m[1], m[2])),
    )
    collect(/\bdrop\s+table\s+(?:if\s+exists\s+)?(?:"?([a-z0-9_]+)"?\.)?"?([a-z0-9_]+)"?/gi, (m) => {
      const key = q(m[1], m[2])
      tables.delete(key)
      dropColumns(key)
    })
    collect(/\bcreate\s+type\s+(?:"?([a-z0-9_]+)"?\.)?"?([a-z0-9_%]+)"?\s+as\s+enum\b/gi, (m) => {
      if (dynamicName(m[2])) return noteDynamic(`${name}: create type ${m[2]}`)
      enums.set(q(m[1], m[2]), name)
    })
    collect(/\bdrop\s+type\s+(?:if\s+exists\s+)?(?:"?([a-z0-9_]+)"?\.)?"?([a-z0-9_]+)"?/gi, (m) =>
      enums.delete(q(m[1], m[2])),
    )
    collect(
      /\balter\s+type\s+(?:"?([a-z0-9_]+)"?\.)?"?([a-z0-9_]+)"?\s+rename\s+to\s+"?([a-z0-9_]+)"?/gi,
      (m) => {
        const from = q(m[1], m[2])
        if (!enums.has(from)) return
        enums.set(q(m[1], m[3]), enums.get(from))
        enums.delete(from)
      },
    )
    collect(
      /\bcreate\s+(?:or\s+replace\s+)?function\s+(?:"?([a-z0-9_]+)"?\.)?"?([a-z0-9_%]+)"?\s*\(/gi,
      (m) => {
        if (dynamicName(m[2])) return noteDynamic(`${name}: create function ${m[2]}`)
        const open = m.index + m[0].length - 1
        const close = closingParen(sql, open)
        if (close < 0) return
        const after = sql.slice(close, close + 400)
        const returns = /^\s*returns\s+(?:setof\s+)?(?:"?([a-z0-9_]+)"?\.)?"?([a-z0-9_]+)"?/i.exec(after)
        const kind = (returns?.[2] ?? '').toLowerCase()
        if (kind === 'trigger' || kind === 'event_trigger') return
        functions.set(q(m[1], m[2]), name)
      },
    )
    collect(/\bdrop\s+function\s+(?:if\s+exists\s+)?(?:"?([a-z0-9_]+)"?\.)?"?([a-z0-9_]+)"?/gi, (m) =>
      functions.delete(q(m[1], m[2])),
    )
    collect(
      /\balter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?(?:"?([a-z0-9_]+)"?\.)?"?([a-z0-9_%]+)"?([^;]*)/gi,
      (m) => {
        if (dynamicName(m[2])) return noteDynamic(`${name}: alter table ${m[2]}`)
        const table = q(m[1], m[2])
        const body = m[3]
        const renameTable = /^\s*rename\s+to\s+"?([a-z0-9_]+)"?/i.exec(body)
        if (renameTable) {
          const to = q(m[1], renameTable[1])
          if (tables.has(table)) {
            tables.set(to, tables.get(table))
            tables.delete(table)
          }
          moveColumns(table, to)
          return
        }
        for (const c of body.matchAll(/\badd\s+(?:column\s+)?(?:if\s+not\s+exists\s+)?"?([a-z0-9_%]+)"?/gi)) {
          const column = c[1].toLowerCase()
          if (NOT_A_COLUMN.has(column)) continue
          if (dynamicName(column)) {
            noteDynamic(`${name}: alter table ${m[2]} add column ${column}`)
            continue
          }
          columns.set(`${table}.${column}`, name)
        }
        for (const c of body.matchAll(/\bdrop\s+(?:column\s+)?(?:if\s+exists\s+)?"?([a-z0-9_]+)"?/gi)) {
          const column = c[1].toLowerCase()
          if (NOT_A_COLUMN.has(column)) continue
          columns.delete(`${table}.${column}`)
        }
        for (const c of body.matchAll(/\brename\s+(?:column\s+)?"?([a-z0-9_]+)"?\s+to\s+"?([a-z0-9_]+)"?/gi)) {
          const from = `${table}.${c[1].toLowerCase()}`
          if (!columns.has(from)) continue
          columns.set(`${table}.${c[2].toLowerCase()}`, columns.get(from))
          columns.delete(from)
        }
      },
    )

    events.sort((a, b) => a.at - b.at)
    for (const e of events) e.run()
  }

  return { tables, views, enums, functions, columns, dynamic }
}

/**
 * Every path prefix the generated types carry, so "is public.Tables.x present"
 * is one set lookup rather than a scan of 3,600 leaves per question.
 */
function prefixesOf(leaves) {
  const set = new Set()
  for (const key of leaves.keys()) {
    const parts = key.split('.')
    for (let i = 1; i <= parts.length; i++) set.add(parts.slice(0, i).join('.'))
  }
  return set
}

/**
 * Judge the replayed schema against the parsed generated types
 * (`parseGeneratedTypes` from scripts/ci/types-drift-analyse.mjs).
 *
 * Returns `{ faults, judged, skipped }`. A fault is `{ kind, name, migration,
 * path }`, where `path` is the type path that should exist. A column on a
 * table that is itself absent is NOT reported twice: the table fault covers it.
 */
export function judgeTypesCoverage(objects, leaves) {
  const present = prefixesOf(leaves)
  const faults = []
  const skipped = []
  const judged = { table: 0, view: 0, enum: 0, function: 0, column: 0 }
  const absentTables = new Set()

  const judge = (kind, map, pathOf) => {
    for (const [key, migration] of [...map].sort()) {
      const dot = key.indexOf('.')
      const schema = key.slice(0, dot)
      const name = key.slice(dot + 1)
      if (schema !== 'public') {
        skipped.push(`${kind} ${key} (${migration}): the generator emits the public schema only, so it is not judged here`)
        continue
      }
      judged[kind] += 1
      const path = pathOf(name)
      if (!present.has(path)) {
        if (kind === 'table') absentTables.add(key)
        faults.push({ kind, name: key, migration, path })
      }
    }
  }

  judge('table', objects.tables, (n) => `public.Tables.${n}`)
  judge('view', objects.views, (n) => `public.Views.${n}`)
  judge('enum', objects.enums, (n) => `public.Enums.${n}`)
  judge('function', objects.functions, (n) => `public.Functions.${n}`)

  for (const [key, migration] of [...objects.columns].sort()) {
    const [schema, table, column] = key.split('.')
    if (schema !== 'public') continue
    const tableKey = `${schema}.${table}`
    if (absentTables.has(tableKey)) continue
    if (!objects.tables.has(tableKey) && !present.has(`public.Tables.${table}`)) {
      skipped.push(`column ${key} (${migration}): its table is neither created by a migration nor in the types, so it is not judged here`)
      continue
    }
    judged.column += 1
    const path = `public.Tables.${table}.Row.${column}`
    if (!present.has(path)) faults.push({ kind: 'column', name: key, migration, path })
  }

  for (const d of objects.dynamic) skipped.push(`${d}: the name is built at runtime, so it cannot be judged here`)

  return { faults, judged, skipped }
}

/** One line per fault, in the shape the guard prints and the drills expect. */
export function describeFault(f) {
  return `${f.kind} ${f.name} is created by ${f.migration} and ${f.path} is not in src/types/database.ts`
}

export const REGENERATE_INSTRUCTION = [
  'The generated section of src/types/database.ts is behind the migrations in this tree.',
  'Regenerate it from a database that HAS these migrations applied (TEST, after',
  '`supabase db push --linked`), with the CLI version the types-drift guard prints:',
  '    npx --yes supabase gen types --lang=typescript --project-id <ref> > /tmp/live.ts',
  'and replace everything ABOVE the `// BEGIN LEGACY ALIASES` marker with that output.',
  'Then run `npm run gate:push -- --only types-drift`: against production it must read',
  'MIGRATIONS PENDING (or IN SYNC once the founder has applied them), never DRIFT.',
].join(NL)
