/**
 * THE FOUR WAYS THIS REPOSITORY DECLARES A FOREIGN KEY, AND THE ONE PLACE THAT
 * KNOWS ALL FOUR.
 *
 * ===========================================================================
 * WHY IT EXISTS: A GUARD WAS READING A THIRD OF THE SCHEMA AND SAYING PASS
 * ===========================================================================
 *
 * `evidence-outlives-the-account` exists to stop a parent row becoming
 * undeletable. It found its keys with two regular expressions, both of which
 * required the column type and the word `references` to sit on ONE LINE:
 *
 *     /^\s*"?([a-z_][a-z0-9_]*)"?\s+[a-z ]*\breferences\s+/
 *                                  ^^^^^^^ no newline in this class
 *
 * MEASURED ON TEST, 19 September 2026, by asking the database the same
 * question the guard asks the files: the database reports EIGHT
 * `on delete set null` keys on the five tables this change touches, and two of
 * them are invisible to that parser, because this repository writes keys in
 * four shapes and the parser knew two:
 *
 *   1. inline, one line       `created_by uuid references auth.users(id) on delete set null`
 *   2. inline, WRAPPED        `referred_by_organisation_id UUID\n  REFERENCES public.organisations(id) ON DELETE SET NULL`
 *   3. table-level constraint `constraint x foreign key (c) references t(id) on delete set null`
 *   4. ALTER ADD CONSTRAINT   `ALTER TABLE public.ticket_tiers ADD CONSTRAINT ... FOREIGN KEY (seat_map_section_id) REFERENCES ... ON DELETE SET NULL`
 *
 * Shape 2 is `organisations.referred_by_organisation_id`; shape 4 is
 * `ticket_tiers.seat_map_section_id`. Neither was ever seen, and the guard
 * printed a confident PASS over a schema it had only partly read. That is the
 * exact failure mode its own header warns about in another context: "a regular
 * expression that has stopped matching reports a confident pass".
 *
 * ===========================================================================
 * HOW IT READS THEM, AND WHY IT IS NOT MORE REGULAR EXPRESSIONS
 * ===========================================================================
 *
 * A `create table` body is SPLIT ON TOP-LEVEL COMMAS into its real items,
 * respecting nesting and quotes, and each item is then judged on its own. A
 * column definition and a table constraint are different shapes, and asking
 * "what kind of item is this" is a question a splitter can answer and a
 * line-anchored pattern cannot. Whitespace, including newlines, stops being
 * significant, which is the whole of defect 2 above.
 *
 * WHAT IT STILL CANNOT SEE, stated rather than implied. It reads migration
 * FILES and replays them in version order, so it judges the schema this tree
 * would build. It cannot see a constraint somebody added to a database by hand,
 * and it does not execute SQL, so a key created inside a `do $$ ... $$` block
 * or by string-built DDL is invisible to it. Both are visible to
 * `scripts/verify/referential-keys-agree-with-the-database.mjs`, which asks
 * TEST the same question and compares the two answers.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
export const MIGRATIONS = join(HERE, '..', '..', '..', 'supabase', 'migrations')

/** `public.orders` and `"orders"` and `Orders` are all `orders`. */
export const bare = name => String(name).replace(/^[a-z_]+\./i, '').replace(/"/g, '').trim().toLowerCase()

/**
 * The schema a name was WRITTEN with, defaulting to `public`.
 *
 * `bare` throws it away on purpose, because every table this tree owns is in
 * `public` and carrying the prefix everywhere would be noise. But `auth.users`
 * is not this tree's table, and a comparison against `public` that does not
 * know the difference reports `on_auth_user_created` as a missing trigger for
 * ever. So the schema is recorded beside the bare name rather than instead of
 * it.
 */
export const schemaOf = name => {
  const m = /^([a-z_]+)\./i.exec(String(name).replace(/"/g, '').trim())
  return m ? m[1].toLowerCase() : 'public'
}

/** Strips `--` line comments so prose about a constraint is not read as one. */
export function withoutComments(sql) {
  return sql
    .split(/\r?\n/)
    .map(line => line.replace(/--.*$/, ''))
    .join('\n')
}

/**
 * Splits a parenthesised body on its TOP-LEVEL commas, respecting nesting and
 * single-quoted strings. This is the whole reason the parser stopped being
 * line-anchored: an item is an item however many lines it is spread over.
 */
export function splitTopLevel(body) {
  const items = []
  let depth = 0
  let quoted = false
  let start = 0
  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i]
    if (quoted) {
      if (ch === "'") quoted = false
      continue
    }
    if (ch === "'") quoted = true
    else if (ch === '(') depth += 1
    else if (ch === ')') depth -= 1
    else if (ch === ',' && depth === 0) {
      items.push(body.slice(start, i))
      start = i + 1
    }
  }
  items.push(body.slice(start))
  return items.map(item => item.trim()).filter(Boolean)
}

/**
 * Splits a migration into STATEMENTS, in the order they are written, honouring
 * dollar-quoted function bodies and single-quoted strings.
 *
 * ORDER IS THE WHOLE POINT, and getting it wrong is how the first version of
 * this file reported 16 triggers where the database has 63. Nearly every
 * migration here writes
 *
 *     drop trigger if exists trg_x on public.t;
 *     create trigger trg_x ...;
 *
 * so a replay that applies every CREATE and then every DROP deletes the trigger
 * it has just made, on the strength of a DROP that was written first and meant
 * something else. Statements are therefore applied one at a time, in order.
 */
export function splitStatements(sql) {
  const statements = []
  let start = 0
  let i = 0
  let quoted = false
  let tag = null
  while (i < sql.length) {
    if (tag) {
      if (sql.startsWith(tag, i)) {
        i += tag.length
        tag = null
        continue
      }
      i += 1
      continue
    }
    if (quoted) {
      if (sql[i] === "'") quoted = false
      i += 1
      continue
    }
    if (sql[i] === "'") {
      quoted = true
      i += 1
      continue
    }
    const dollar = /^\$[a-z_]*\$/i.exec(sql.slice(i, i + 40))
    if (dollar) {
      tag = dollar[0]
      i += tag.length
      continue
    }
    if (sql[i] === ';') {
      statements.push(sql.slice(start, i + 1))
      i += 1
      start = i
      continue
    }
    i += 1
  }
  if (sql.slice(start).trim()) statements.push(sql.slice(start))
  return statements.map(s => s.trim()).filter(Boolean)
}

/** Every `create table` block, paired with its body, by balanced parentheses. */
export function tableBlocks(sql) {
  const blocks = []
  const re = /create\s+table\s+(?:if\s+not\s+exists\s+)?([a-z_."]+)\s*\(/gi
  let m
  while ((m = re.exec(sql)) !== null) {
    let depth = 1
    let i = re.lastIndex
    while (i < sql.length && depth > 0) {
      if (sql[i] === '(') depth += 1
      else if (sql[i] === ')') depth -= 1
      i += 1
    }
    blocks.push({ table: bare(m[1]), body: sql.slice(re.lastIndex, i - 1) })
  }
  return blocks
}

/** `on delete <action>`, normalised, or `no action` when none is written. */
function deleteAction(text) {
  const m = /on\s+delete\s+(set\s+null|set\s+default|cascade|restrict|no\s+action)/i.exec(text)
  return m ? m[1].replace(/\s+/g, ' ').toLowerCase() : 'no action'
}

/**
 * SHAPE 1 and 2: a COLUMN definition that carries its own `references`.
 * Whitespace between the column name, its type and `references` is irrelevant,
 * which is the fix. Returns null for anything that is not a column definition.
 */
export function columnKey(item) {
  if (/^(constraint|primary\s+key|unique|check|foreign\s+key|exclude|like)\b/i.test(item)) return null
  const m = /^"?([a-z_][a-z0-9_]*)"?\s+[\s\S]*?\breferences\s+([a-z_."]+)\s*(?:\([^)]*\))?/i.exec(item)
  if (!m) return null
  return { column: m[1].toLowerCase(), parent: bare(m[2]), action: deleteAction(item), constraint: null }
}

/**
 * The NAME a column definition declares, or null when the item is a table
 * constraint rather than a column.
 *
 * Tracked because `add column IF NOT EXISTS` on a column that is already there
 * creates NOTHING, key included. `20260504000002` tries to add
 * `events.event_type text references public.event_types(slug) on delete set
 * null` over the enum column the baseline schema already declared, so that key
 * has never existed on any database, and a replay that does not model IF NOT
 * EXISTS reports it for ever.
 */
export function columnName(item) {
  if (/^(constraint|primary\s+key|unique|check|foreign\s+key|exclude|like)\b/i.test(item)) return null
  const m = /^"?([a-z_][a-z0-9_]*)"?\s+\S/i.exec(item)
  return m ? m[1].toLowerCase() : null
}

/**
 * The PRIMARY KEY columns a `create table` item declares, inline or as a table
 * constraint. Recorded because a trigger that reads `NEW.id` to exclude its own
 * row is not reading a column anybody can change, and a rule that counts it as
 * one reports a correct trigger as broken.
 */
export function primaryKeyColumns(item) {
  const table = /^primary\s+key\s*\(([^)]*)\)/i.exec(item)
  if (table) return table[1].split(',').map(c => c.replace(/"/g, '').trim().toLowerCase()).filter(Boolean)
  const constraint = /^constraint\s+"?[a-z_][a-z0-9_]*"?\s+primary\s+key\s*\(([^)]*)\)/i.exec(item)
  if (constraint) return constraint[1].split(',').map(c => c.replace(/"/g, '').trim().toLowerCase()).filter(Boolean)
  const name = columnName(item)
  if (name && /\bprimary\s+key\b/i.test(item)) return [name]
  return []
}

/**
 * SHAPE 3 and 4: a table CONSTRAINT, inside `create table` or added later by
 * `alter table ... add constraint`. Multi-column keys are recorded once per
 * column, because the referential action rewrites every one of them.
 */
export function constraintKey(item) {
  const m = /^(?:constraint\s+"?([a-z_][a-z0-9_]*)"?\s+)?foreign\s+key\s*\(([^)]*)\)\s*references\s+([a-z_."]+)\s*(?:\([^)]*\))?/i.exec(item)
  if (!m) return null
  const columns = m[2].split(',').map(c => c.replace(/"/g, '').trim().toLowerCase()).filter(Boolean)
  return columns.map(column => ({
    column,
    parent: bare(m[3]),
    action: deleteAction(item),
    constraint: m[1] ? m[1].toLowerCase() : null,
  }))
}

/** Postgres's own default name for a key that was not given one. */
const defaultName = (table, column) => `${table}_${column}_fkey`

/**
 * `alter table t add column ..., add constraint ..., ...` -- one statement can
 * carry several clauses and `organisations` uses exactly that form, so the
 * clauses are split rather than the first one taken.
 */
function alterClauses(sql) {
  const out = []
  const re = /alter\s+table\s+(?:only\s+)?(?:if\s+exists\s+)?([a-z_."]+)([\s\S]*?);/gi
  let m
  while ((m = re.exec(sql)) !== null) out.push({ table: bare(m[1]), body: m[2] })
  return out
}

/**
 * The one unconditional refusal this tree uses. Named once so the two guards
 * that care cannot drift about what an unconditional refusal looks like.
 */
export const REFUSAL = 'refuse_ledger_mutation'

const STATEMENT_REFUSAL = new RegExp(
  `create\\s+trigger\\s+[a-z_0-9]+\\s+before\\s+(update|delete|truncate)\\s+on\\s+([a-z_."]+)` +
    `\\s+for\\s+each\\s+statement\\s+execute\\s+(?:function|procedure)\\s+[a-z_.]*${REFUSAL}`,
  'gi',
)

/**
 * `create trigger n <timing> <events> on t <for each row> [when (...)] execute f(`
 *
 * THE EVENT LIST CAN NAME COLUMNS, and missing that is how the first version of
 * this parser lost `trg_founding_waiver_cap` entirely:
 *
 *     BEFORE INSERT OR UPDATE OF founding_fee_free_until ON public.organisations
 *
 * `UPDATE OF (columns)` is not decoration. Postgres fires the trigger only when
 * one of the named columns appears in the statement's SET list, which makes it
 * the strongest of the three ways a trigger can decline to judge a row nobody
 * re-priced, and the only one that works on a `before insert or update`
 * trigger without splitting it in two.
 */
const TRIGGER =
  /create\s+(?:constraint\s+)?trigger\s+([a-z_0-9]+)\s+(before|after|instead\s+of)\s+([a-z_0-9,\s()]*?)\s+on\s+([a-z_."]+)\s+([\s\S]*?)execute\s+(?:function|procedure)\s+([a-z_.]+)\s*\(/gi

/** `update of a, b` inside a trigger's event list. */
const UPDATE_OF = /\bupdate\s+of\s+([a-z_0-9,\s"]+?)(?=\s+or\s+|\s*$)/i

const DROP_TRIGGER = /drop\s+trigger\s+(?:if\s+exists\s+)?([a-z_0-9]+)\s+on\s+([a-z_."]+)/gi
const DROP_CONSTRAINT = /alter\s+table\s+(?:only\s+)?(?:if\s+exists\s+)?([a-z_."]+)\s+drop\s+constraint\s+(?:if\s+exists\s+)?"?([a-z_][a-z0-9_]*)"?/gi
const DROP_TABLE = /drop\s+table\s+(?:if\s+exists\s+)?([a-z_."]+)/gi
const DROP_COLUMN = /alter\s+table\s+(?:only\s+)?(?:if\s+exists\s+)?([a-z_."]+)\s+drop\s+column\s+(?:if\s+exists\s+)?"?([a-z_][a-z0-9_]*)"?/gi

/**
 * RENAMES, which this repository does use and which a replay that ignores them
 * reports as a key on a column that is not there. `events.community_primary`
 * was renamed from its banned-word predecessor by migration 20260621000006, and
 * the parser this replaces was still reporting a key on the retired name.
 *
 * The old name is NOT spelled here, in this comment or in the probe below,
 * because the banned-word law covers identifiers and comments as well as copy
 * and a guard's own source is not exempt from the laws it enforces beside.
 */
const RENAME_COLUMN =
  /alter\s+table\s+(?:only\s+)?(?:if\s+exists\s+)?([a-z_."]+)\s+rename\s+column\s+"?([a-z_][a-z0-9_]*)"?\s+to\s+"?([a-z_][a-z0-9_]*)"?/gi
const RENAME_CONSTRAINT =
  /alter\s+table\s+(?:only\s+)?(?:if\s+exists\s+)?([a-z_."]+)\s+rename\s+constraint\s+"?([a-z_][a-z0-9_]*)"?\s+to\s+"?([a-z_][a-z0-9_]*)"?/gi
const RENAME_TABLE = /alter\s+table\s+(?:only\s+)?(?:if\s+exists\s+)?([a-z_."]+)\s+rename\s+to\s+"?([a-z_][a-z0-9_]*)"?/gi

/**
 * A trigger function body.
 *
 * The closing dollar quote is NOT followed by a semicolon in every case, and
 * assuming it was cost this parser every `update_updated_at`-shaped function in
 * the baseline schema:
 *
 *     CREATE OR REPLACE FUNCTION public.update_updated_at()
 *     RETURNS TRIGGER AS $$ ... $$ LANGUAGE plpgsql;
 *                               ^^ the language comes after the body
 *
 * A function whose body cannot be read is reported UNREADABLE rather than
 * assumed harmless, so this mattered: eight correct `set_updated_at` triggers
 * were named as defects on the guard's first run.
 */
const TRIGGER_FUNCTION =
  /create\s+or\s+replace\s+function\s+([a-z_.]+)\s*\(\s*\)\s*returns\s+trigger([\s\S]*?)\$([a-z_]*)\$([\s\S]*?)\$\3\$/gi

/**
 * Replays every migration in version order and returns the schema the tree
 * would build: the referential keys, the tables that refuse a statement
 * outright, every trigger that survives, and every trigger function body.
 */
export function replaySchema(files) {
  const keys = new Map() // `${table}.${constraint}` -> key
  const refuses = new Map() // table -> Set of 'update' | 'delete' | 'truncate'
  const triggers = new Map() // `${table}.${trigger}` -> trigger
  const functions = new Map() // bare function name -> body
  const columns = new Map() // table -> Set of column names
  const primaryKeys = new Map() // table -> Set of primary key column names

  const noteColumn = (table, column) => {
    if (!column) return
    if (!columns.has(table)) columns.set(table, new Set())
    columns.get(table).add(column)
  }
  const hasColumn = (table, column) => Boolean(columns.get(table)?.has(column))

  /*
   * KEYED BY COLUMN AS WELL AS BY CONSTRAINT, because a multi-column key shares
   * ONE constraint name across several columns and the referential action
   * rewrites every one of them. Keying by constraint alone made the second
   * column overwrite the first, which is how `marketing_link.recipient_id`
   * disappeared while `campaign_id` from the same key survived.
   */
  const remember = (table, key, file) => {
    const constraint = key.constraint ?? defaultName(table, key.column)
    keys.set(`${table}.${constraint}.${key.column}`, { ...key, constraint, table, file })
  }
  const forget = (table, constraint) => {
    for (const [id, key] of keys) if (key.table === table && key.constraint === constraint) keys.delete(id)
  }

  for (const { name, sql: raw } of files) {
    for (const sql of splitStatements(withoutComments(raw))) {
      for (const block of tableBlocks(sql)) {
        for (const item of splitTopLevel(block.body)) {
          noteColumn(block.table, columnName(item))
          for (const pk of primaryKeyColumns(item)) {
            if (!primaryKeys.has(block.table)) primaryKeys.set(block.table, new Set())
            primaryKeys.get(block.table).add(pk)
          }
          const column = columnKey(item)
          if (column) {
            remember(block.table, column, name)
            continue
          }
          for (const key of constraintKey(item) ?? []) remember(block.table, key, name)
        }
      }

      for (const { table, body } of alterClauses(sql)) {
        for (const clause of splitTopLevel(body)) {
          const added = /^add\s+(?:(column)\s+(if\s+not\s+exists\s+)?)?([\s\S]*)$/i.exec(clause)
          if (!added) continue
          const [, isColumn, ifNotExists, rest] = added
          const constraints = isColumn ? null : constraintKey(rest)
          if (constraints) {
            for (const key of constraints) remember(table, key, name)
            continue
          }
          const declared = columnName(rest)
          if (isColumn && ifNotExists && hasColumn(table, declared)) continue
          noteColumn(table, declared)
          const column = columnKey(rest)
          if (column) remember(table, column, name)
        }
      }

      for (const [, kind, table] of sql.matchAll(STATEMENT_REFUSAL)) {
        const t = bare(table)
        if (!refuses.has(t)) refuses.set(t, new Set())
        refuses.get(t).add(kind.toLowerCase())
      }

      for (const match of sql.matchAll(TRIGGER)) {
        const [, trigger, timing, events, table, middle, fn] = match
        const t = bare(table)
        const tableSchema = schemaOf(table)
        const whenMatch = /\bwhen\s*\(([\s\S]*)\)\s*$/i.exec(middle.trim())
        const updateOf = UPDATE_OF.exec(events)
        triggers.set(`${t}.${trigger.toLowerCase()}`, {
          table: t,
          schema: tableSchema,
          trigger: trigger.toLowerCase(),
          timing: timing.replace(/\s+/g, ' ').toLowerCase(),
          events: events
            .split(/\s+or\s+/i)
            .map(e => e.trim().toLowerCase().replace(/\s+of\s+[\s\S]*$/, ''))
            .filter(e => ['insert', 'update', 'delete', 'truncate'].includes(e)),
          updateOf: updateOf
            ? updateOf[1].split(',').map(c => c.replace(/"/g, '').trim().toLowerCase()).filter(Boolean)
            : null,
          forEachRow: /for\s+each\s+row/i.test(middle),
          when: whenMatch ? whenMatch[1].trim() : null,
          fn: bare(fn),
          file: name,
        })
      }

      for (const [, trigger, table] of sql.matchAll(DROP_TRIGGER)) {
        triggers.delete(`${bare(table)}.${trigger.toLowerCase()}`)
      }
      for (const [, table, constraint] of sql.matchAll(DROP_CONSTRAINT)) {
        forget(bare(table), constraint.toLowerCase())
      }
      for (const [, table, column] of sql.matchAll(DROP_COLUMN)) {
        const t = bare(table)
        columns.get(t)?.delete(column.toLowerCase())
        for (const [id, key] of keys) if (key.table === t && key.column === column.toLowerCase()) keys.delete(id)
      }
      for (const [, table, from, to] of sql.matchAll(RENAME_COLUMN)) {
        const t = bare(table)
        if (columns.get(t)?.delete(from.toLowerCase())) noteColumn(t, to.toLowerCase())
        for (const [id, key] of keys) {
          if (key.table !== t || key.column !== from.toLowerCase()) continue
          keys.delete(id)
          keys.set(`${t}.${key.constraint}.${to.toLowerCase()}`, { ...key, column: to.toLowerCase() })
        }
      }
      for (const [, table, from, to] of sql.matchAll(RENAME_CONSTRAINT)) {
        const t = bare(table)
        for (const [id, key] of keys) {
          if (key.table !== t || key.constraint !== from.toLowerCase()) continue
          keys.delete(id)
          keys.set(`${t}.${to.toLowerCase()}.${key.column}`, { ...key, constraint: to.toLowerCase() })
        }
      }
      for (const [, table, to] of sql.matchAll(RENAME_TABLE)) {
        const t = bare(table)
        const renamed = bare(to)
        for (const [id, key] of keys) {
          if (key.table !== t) continue
          keys.delete(id)
          keys.set(`${renamed}.${key.constraint}.${key.column}`, { ...key, table: renamed })
        }
        for (const [id, trg] of triggers) {
          if (trg.table !== t) continue
          triggers.delete(id)
          triggers.set(`${renamed}.${trg.trigger}`, { ...trg, table: renamed })
        }
        if (refuses.has(t)) {
          refuses.set(renamed, refuses.get(t))
          refuses.delete(t)
        }
      }
      for (const [, table] of sql.matchAll(DROP_TABLE)) {
        const t = bare(table)
        for (const [id, key] of keys) if (key.table === t) keys.delete(id)
        for (const [id, trg] of triggers) if (trg.table === t) triggers.delete(id)
        refuses.delete(t)
      }

      for (const match of sql.matchAll(TRIGGER_FUNCTION)) {
        functions.set(bare(match[1]), match[4])
      }
    }
  }

  return { keys, refuses, triggers, functions, columns, primaryKeys }
}

/** Every migration on disk, in version order. */
export function migrationFiles(dir = MIGRATIONS) {
  return readdirSync(dir)
    .filter(f => f.endsWith('.sql'))
    .sort()
    .map(name => ({ name, sql: readFileSync(join(dir, name), 'utf8') }))
}

/** Keys whose referential action REWRITES the child row when the parent goes. */
export function setNullKeys(keys) {
  return [...keys.values()].filter(key => key.action === 'set null')
}

/** table -> Set of columns a parent delete will blank. */
export function setNullColumnsByTable(keys) {
  const out = new Map()
  for (const key of setNullKeys(keys)) {
    if (!out.has(key.table)) out.set(key.table, new Set())
    out.get(key.table).add(key.column)
  }
  return out
}

/**
 * CALIBRATION, shared by both guards that read this.
 *
 * Every shape above is exercised against SQL that is known to declare exactly
 * one key, so a parser that has stopped matching is reported as a broken parser
 * rather than as a clean schema. Two of these four probes are the defects this
 * file was written to fix and they FAILED against the parser it replaces.
 */
export function calibrationFailures() {
  const failures = []
  const expect = (label, sql, wanted) => {
    const want = [].concat(wanted).sort().join(', ')
    const { keys } = replaySchema([{ name: 'probe.sql', sql }])
    const found = setNullKeys(keys)
      .map(k => `${k.table}.${k.column}`)
      .sort()
      .join(', ')
    if (found !== want) failures.push(`${label}: expected ${want}, parsed ${found === '' ? 'nothing' : found}`)
  }

  expect(
    'shape 1, an inline key on one line',
    `create table public.p_one (id uuid primary key, created_by uuid references auth.users(id) on delete set null);`,
    'p_one.created_by',
  )
  expect(
    'shape 2, an inline key WRAPPED onto the next line',
    `create table public.p_two (
       id uuid primary key,
       referred_by uuid
         references public.p_two(id) on delete set null
     );`,
    'p_two.referred_by',
  )
  expect(
    'shape 3, a table-level constraint inside create table',
    `create table public.p_three (
       id uuid primary key,
       section_id uuid,
       constraint p_three_section_fk foreign key (section_id)
         references public.sections(id) on delete set null
     );`,
    'p_three.section_id',
  )
  expect(
    'shape 4, alter table add constraint',
    `create table public.p_four (id uuid primary key, section_id uuid);
     alter table public.p_four
       add constraint p_four_section_fk
       foreign key (section_id) references public.sections(id) on delete set null;`,
    'p_four.section_id',
  )
  expect(
    'a multi-clause alter that adds a wrapped column key beside another column',
    `create table public.p_five (id uuid primary key);
     alter table public.p_five
       add column if not exists referred_by uuid
         references public.p_five(id) on delete set null,
       add column if not exists credited_at timestamptz;`,
    'p_five.referred_by',
  )

  expect(
    'a MULTI-COLUMN key, which rewrites every one of its columns',
    `create table public.p_nine (
       id uuid primary key,
       recipient_id uuid,
       campaign_id uuid,
       constraint p_nine_recipient_belongs
         foreign key (recipient_id, campaign_id)
         references public.recipients (id, campaign_id) on delete set null
     );`,
    ['p_nine.recipient_id', 'p_nine.campaign_id'],
  )
  expect(
    'a column RENAMED after its key was declared',
    `create table public.p_ten (id uuid primary key, retired_primary text references public.c(slug) on delete set null);
     alter table public.p_ten rename column retired_primary to community_primary;`,
    'p_ten.community_primary',
  )
  expect(
    'a constraint RENAMED, then dropped by its NEW name',
    `create table public.p_eleven (id uuid primary key, a uuid references public.x(id) on delete set null);
     alter table public.p_eleven rename constraint p_eleven_a_fkey to p_eleven_a_key2;
     alter table public.p_eleven drop constraint if exists p_eleven_a_key2;`,
    [],
  )

  expect(
    'ADD COLUMN IF NOT EXISTS over a column that is already there, which adds nothing',
    `create table public.p_fourteen (id uuid primary key, event_type text not null);
     alter table public.p_fourteen
       add column if not exists event_type text references public.event_types(slug) on delete set null;`,
    [],
  )
  expect(
    'ADD COLUMN IF NOT EXISTS over a column that is NOT there, which does add it',
    `create table public.p_fifteen (id uuid primary key);
     alter table public.p_fifteen
       add column if not exists event_type text references public.event_types(slug) on delete set null;`,
    'p_fifteen.event_type',
  )

  /*
   * `UPDATE OF (columns)` IN THE EVENT LIST. Not a key probe: a trigger probe,
   * and it lives here because losing it lost a whole trigger. The parser it
   * replaces could not read the event list past an underscore.
   */
  const updateOf = replaySchema([
    {
      name: 'probe.sql',
      sql: `create trigger trg_p_twelve
              before insert or update of founding_fee_free_until on public.p_twelve
              for each row execute function public.f();`,
    },
  ])
  const trg = updateOf.triggers.get('p_twelve.trg_p_twelve')
  if (!trg) failures.push('a trigger whose event list names a column is not seen at all')
  else if (!trg.updateOf || trg.updateOf[0] !== 'founding_fee_free_until') {
    failures.push(`the column list of an "update of" trigger is not read (got ${JSON.stringify(trg?.updateOf)})`)
  } else if (!trg.events.includes('update') || !trg.events.includes('insert')) {
    failures.push(`the events of an "update of" trigger are not read (got ${JSON.stringify(trg.events)})`)
  }

  /*
   * PRIMARY KEYS, in both shapes. A rule that asks "which columns can change"
   * needs to know which one is the row's own name, and a probe that never
   * matches reports a table with no primary key, which every table here has.
   */
  const pk = replaySchema([
    {
      name: 'probe.sql',
      sql: `create table public.p_sixteen (id uuid primary key default gen_random_uuid(), a int);
            create table public.p_seventeen (a int, b int, primary key (a, b));`,
    },
  ])
  if ([...(pk.primaryKeys.get('p_sixteen') ?? [])].join() !== 'id') {
    failures.push('an inline `primary key` on a column definition is not read')
  }
  if ([...(pk.primaryKeys.get('p_seventeen') ?? [])].join() !== 'a,b') {
    failures.push('a table-level `primary key (a, b)` is not read')
  }

  /*
   * A DROP WRITTEN BEFORE THE CREATE IT PRECEDES, which is how nearly every
   * migration in this tree writes a trigger. Replaying creates and then drops
   * deletes the trigger it has just made.
   */
  const dropThenCreate = replaySchema([
    {
      name: 'probe.sql',
      sql: `drop trigger if exists trg_p_thirteen on public.p_thirteen;
            create trigger trg_p_thirteen before update on public.p_thirteen
              for each row execute function public.f();`,
    },
  ])
  if (!dropThenCreate.triggers.has('p_thirteen.trg_p_thirteen')) {
    failures.push('a trigger dropped and then re-created in one file is reported as absent')
  }

  /* A key that was later dropped is not a key. */
  const dropped = replaySchema([
    {
      name: 'probe.sql',
      sql: `create table public.p_six (id uuid primary key, created_by uuid references auth.users(id) on delete set null);
            alter table public.p_six drop constraint if exists p_six_created_by_fkey;`,
    },
  ])
  if (setNullKeys(dropped.keys).length !== 0) failures.push('a dropped key is still reported')

  /* A drop written only in a COMMENT must not be honoured. */
  const commented = replaySchema([
    {
      name: 'probe.sql',
      sql: `create table public.p_seven (id uuid primary key, created_by uuid references auth.users(id) on delete set null);
            -- alter table public.p_seven drop constraint if exists p_seven_created_by_fkey;`,
    },
  ])
  if (setNullKeys(commented.keys).length !== 1) failures.push('a drop written only in a comment is honoured as a real one')

  /* `on delete cascade` and a bare key are not rewrites and must not be counted. */
  const notRewrites = replaySchema([
    {
      name: 'probe.sql',
      sql: `create table public.p_eight (
              id uuid primary key,
              a uuid references public.x(id) on delete cascade,
              b uuid references public.y(id)
            );`,
    },
  ])
  if (setNullKeys(notRewrites.keys).length !== 0) failures.push('a cascade or a bare key is miscounted as a rewrite')

  return failures
}
