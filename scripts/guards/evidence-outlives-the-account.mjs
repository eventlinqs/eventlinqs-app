/**
 * A TABLE THAT REFUSES EVERY UPDATE MUST NOT ALSO CARRY A FOREIGN KEY WHOSE
 * WHOLE JOB IS TO UPDATE IT.
 *
 * ===========================================================================
 * THE DEFECT, MEASURED ON TEST ON 19 SEPTEMBER 2026
 * ===========================================================================
 *
 * NO ACCOUNT ON THE PLATFORM COULD BE DELETED. Not a class of account: any of
 * them. Deleting two accounts that appeared nowhere in the table involved:
 *
 *   delete from auth.users where email like 'lane-b-aq3%'
 *   ERROR: 42501: append only: UPDATE on public.marketing_capture_placement is
 *   refused. A consent record is evidence of what a person was shown and agreed
 *   to, so it is never altered and never removed.
 *   CONTEXT: SQL statement "UPDATE ONLY public.marketing_capture_placement
 *            SET decided_by = NULL WHERE $1 = decided_by"
 *
 * TWO CLAUSES WRITTEN THE SAME DAY, EACH CORRECT ALONE:
 *
 *     decided_by uuid references auth.users(id) on delete set null
 *
 *     create trigger ... before update on public.marketing_capture_placement
 *       for each statement execute function public.refuse_ledger_mutation()
 *
 * The first is a standing instruction to rewrite the row. The second refuses
 * every rewrite. AND THE FAILURE IS TOTAL RATHER THAN PARTIAL, which is the
 * part nobody predicts: the referential action issues its UPDATE whether or not
 * a single row matches, and a FOR EACH STATEMENT trigger fires on an update of
 * nothing. So a table with thirteen rows made every account on the platform
 * undeletable, including accounts created a minute earlier by a drive.
 *
 * IT WAS INVISIBLE FOR THE SAME REASON EVERY TIME. Every caller of
 * `auth.admin.deleteUser` in this repository's drives ends `.catch(() => {})`,
 * so eighteen accounts accumulated on TEST while every teardown reported
 * success. Account closure in the product would have failed the same way.
 *
 * ===========================================================================
 * THE RULE
 * ===========================================================================
 *
 * For any table this tree gives an UNCONDITIONAL refusal to (a statement-level
 * `refuse_ledger_mutation` trigger), no foreign key on that table may carry
 * `on delete set null`, and for a delete refusal none may carry
 * `on delete cascade`. The parent row can then never be deleted, anywhere, by
 * anybody, and nothing says so until somebody tries.
 *
 * THE RESOLUTION IS ALWAYS TO DROP THE KEY, NOT THE TRIGGER. If the row really
 * is evidence, then who acted is a historical fact and an account closing later
 * does not un-make it. A ledger that forgets the actor the day they leave is
 * not a ledger. See supabase/migrations/20260919000130.
 *
 * ===========================================================================
 * WHAT IT CANNOT SEE, STATED RATHER THAN IMPLIED
 * ===========================================================================
 *
 * It reads the migration FILES in version order and replays adds and drops, so
 * it judges the schema this tree would build. It does not connect to a database
 * and cannot see a constraint somebody added by hand.
 *
 * It judges UNCONDITIONAL refusals only. `event_group_rates` carries a FOR EACH
 * ROW trigger that judges the PRICE and a `created_by ... on delete set null`,
 * and that pair passes today and can only refuse once the floor has moved under
 * an existing rate. That is a latent trap rather than a live defect, it is
 * recorded in REVIEW-QUEUE-B.md, and this guard deliberately does not claim to
 * cover it, because a guard that quietly widens its own subject is a guard
 * nobody can predict.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { declareWork } from '../lib/work-report.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')
const MIGRATIONS = join(ROOT, 'supabase', 'migrations')
export const TAG = '[evidence-outlives-the-account]'


const bare = name => String(name).replace(/^public\./, '').replace(/"/g, '').trim().toLowerCase()

/**
 * Column-level foreign keys carrying a referential ACTION, inside a create table.
 *
 * Only `set null` and `cascade` matter here: those are the two that make the
 * database touch the child row when the parent goes. `no action` and `restrict`
 * refuse the parent delete outright, which is loud rather than silent and is a
 * different decision.
 */
const COLUMN_FK =
  /^\s*"?([a-z_][a-z0-9_]*)"?\s+[a-z ]*\breferences\s+([a-z_.]+)\s*\([^)]*\)\s*on\s+delete\s+(set\s+null|cascade)/gim

/** `alter table x add column y ... references z(...) on delete set null` */
const ALTER_ADD_FK =
  /alter\s+table\s+(?:if\s+exists\s+)?([a-z_.]+)[\s\S]{0,400}?add\s+column\s+(?:if\s+not\s+exists\s+)?"?([a-z_][a-z0-9_]*)"?\s+[a-z ]*\breferences\s+([a-z_.]+)\s*\([^)]*\)\s*on\s+delete\s+(set\s+null|cascade)/gi

/** `alter table x drop constraint [if exists] name` */
const DROP_CONSTRAINT = /alter\s+table\s+(?:if\s+exists\s+)?([a-z_.]+)\s+drop\s+constraint\s+(?:if\s+exists\s+)?"?([a-z_][a-z0-9_]*)"?/gi

/** `create trigger n before update on public.t for each statement execute function public.refuse...` */
/** The one unconditional refusal this tree uses, named once. */
const REFUSAL = 'refuse_ledger_mutation'

const STATEMENT_REFUSAL = new RegExp(
  `create\\s+trigger\\s+[a-z_0-9]+\\s+before\\s+(update|delete|truncate)\\s+on\\s+([a-z_.]+)` +
    `\\s+for\\s+each\\s+statement\\s+execute\\s+(?:function|procedure)\\s+[a-z_.]*${REFUSAL}`,
  'gi',
)

/** `drop trigger [if exists] n on public.t` */
const DROP_TRIGGER = /drop\s+trigger\s+(?:if\s+exists\s+)?([a-z_0-9]+)\s+on\s+([a-z_.]+)/gi

/** Table blocks, so a column FK is attributed to the table that declares it. */
function tableBlocks(sql) {
  const blocks = []
  const re = /create\s+table\s+(?:if\s+not\s+exists\s+)?([a-z_.]+)\s*\(/gi
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

/** Strips `--` line comments so prose about a constraint is not read as one. */
export function withoutComments(sql) {
  return sql
    .split(/\r?\n/)
    .map(line => line.replace(/--.*$/, ''))
    .join('\n')
}

/**
 * Replays every migration in version order and returns the schema it builds:
 * which tables refuse a statement outright, and which cascading keys survive.
 */
export function replay(files) {
  const refuses = new Map() // table -> Set of 'update' | 'delete'
  const keys = new Map() // `${table}.${constraint}` -> { table, column, parent, action, file }
  const droppedTriggers = new Set()

  for (const { name, sql: raw } of files) {
    const sql = withoutComments(raw)

    for (const [, kind, table] of sql.matchAll(STATEMENT_REFUSAL)) {
      const t = bare(table)
      if (!refuses.has(t)) refuses.set(t, new Set())
      refuses.get(t).add(kind.toLowerCase())
    }
    for (const [, trigger, table] of sql.matchAll(DROP_TRIGGER)) {
      droppedTriggers.add(`${bare(table)}.${trigger.toLowerCase()}`)
    }

    for (const block of tableBlocks(sql)) {
      COLUMN_FK.lastIndex = 0
      for (const [, column, parent, action] of block.body.matchAll(COLUMN_FK)) {
        const constraint = `${block.table}_${column}_fkey`
        keys.set(`${block.table}.${constraint}`, {
          table: block.table,
          column,
          parent: bare(parent),
          action: action.replace(/\s+/g, ' ').toLowerCase(),
          file: name,
        })
      }
    }

    for (const [, table, column, parent, action] of sql.matchAll(ALTER_ADD_FK)) {
      const t = bare(table)
      const constraint = `${t}_${column}_fkey`
      keys.set(`${t}.${constraint}`, {
        table: t,
        column,
        parent: bare(parent),
        action: action.replace(/\s+/g, ' ').toLowerCase(),
        file: name,
      })
    }

    for (const [, table, constraint] of sql.matchAll(DROP_CONSTRAINT)) {
      keys.delete(`${bare(table)}.${constraint.toLowerCase()}`)
    }
  }

  return { refuses, keys, droppedTriggers }
}

/** The pairs that make a parent row undeletable. */
export function collisions({ refuses, keys }) {
  const found = []
  for (const key of keys.values()) {
    const refused = refuses.get(key.table)
    if (!refused) continue
    if (key.action === 'set null' && refused.has('update')) {
      found.push({ ...key, because: 'every UPDATE on it is refused outright' })
    }
    if (key.action === 'cascade' && refused.has('delete')) {
      found.push({ ...key, because: 'every DELETE on it is refused outright' })
    }
  }
  return found
}

function main() {
  const names = readdirSync(MIGRATIONS)
    .filter(f => f.endsWith('.sql'))
    .sort()
  const files = names.map(name => ({ name, sql: readFileSync(join(MIGRATIONS, name), 'utf8') }))
  const schema = replay(files)
  const found = collisions(schema)

  /*
   * CALIBRATION. Every clause above is a regular expression over SQL, and a
   * regular expression that has stopped matching reports a confident pass. So
   * the parsers are run against a synthetic schema that is known to be wrong,
   * and the guard REFUSES rather than passing if its own probe comes back clean.
   */
  const probes = []
  const probeSchema = replay([
    {
      name: 'probe.sql',
      sql: `
        create table public.a_probe_ledger (
          id uuid primary key,
          decided_by uuid references auth.users(id) on delete set null
        );
        create trigger trg_a_probe_ledger_no_update
          before update on public.a_probe_ledger
          for each statement execute function public.refuse_ledger_mutation();
      `,
    },
  ])
  if (collisions(probeSchema).length !== 1) probes.push('a set-null key into an update-refusing table is not caught')
  const droppedProbe = replay([
    {
      name: 'probe.sql',
      sql: `
        create table public.b_probe_ledger (
          id uuid primary key,
          decided_by uuid references auth.users(id) on delete set null
        );
        create trigger trg_b_probe_ledger_no_update
          before update on public.b_probe_ledger
          for each statement execute function public.refuse_ledger_mutation();
        alter table public.b_probe_ledger
          drop constraint if exists b_probe_ledger_decided_by_fkey;
      `,
    },
  ])
  if (collisions(droppedProbe).length !== 0) probes.push('a key that was later dropped is still reported')
  /*
   * THE COMMENT PROBE, AND WHY IT IS SHAPED THIS WAY. Its first version put the
   * foreign key itself in a comment, and it could never have failed: the column
   * matcher is line-anchored, so a line beginning `--` was never going to match
   * whether comments were stripped or not. It reported a working stripper while
   * testing nothing, which is the exact shape of guard this file distrusts.
   *
   * So the comment here is a DROP that would, if believed, make a live and
   * dangerous key disappear. Stripped, the collision stands and is caught.
   * Unstripped, the guard would quietly report the schema as safe.
   */
  const commentProbe = replay([
    {
      name: 'probe.sql',
      sql: `
        create table public.c_probe_ledger (
          id uuid primary key,
          decided_by uuid references auth.users(id) on delete set null
        );
        create trigger trg_c_probe_ledger_no_update
          before update on public.c_probe_ledger
          for each statement execute function public.refuse_ledger_mutation();
        -- ONE LINE ON PURPOSE: the drop matcher is not line-anchored, so a
        -- comment split across two lines would not match it even unstripped,
        -- and the probe would prove nothing. The first version was split, and
        -- its drill sat there saying DID NOT FAIL until it was read properly.
        -- alter table public.c_probe_ledger drop constraint if exists c_probe_ledger_decided_by_fkey;
      `,
    },
  ])
  if (collisions(commentProbe).length !== 1) probes.push('a drop written only in a comment is honoured as a real one')
  if (schema.refuses.size === 0) probes.push('no table in this tree is seen to refuse anything')
  if (schema.keys.size === 0) probes.push('no cascading foreign key is seen in this tree at all')

  if (probes.length > 0) {
    console.error(`${TAG} REFUSING: the calibration probe came back clean, so this guard has gone blind:`)
    for (const probe of probes) console.error(`${TAG}   ${probe}`)
    process.exit(1)
  }

  if (found.length > 0) {
    console.error(`${TAG} a parent row can never be deleted, by anybody, and nothing says so until somebody tries:`)
    for (const f of found) {
      console.error(
        `${TAG}   ${f.table}.${f.column} references ${f.parent} "on delete ${f.action}" (${f.file}), ` +
          `and ${f.because}. Deleting a ${f.parent} row therefore fails ALWAYS, including when no row here ` +
          `names it, because the referential action runs its statement either way. Drop the key and keep the ` +
          `column: who acted is a historical fact and the account closing does not un-make it. ` +
          `Worked example: supabase/migrations/20260919000130.`,
      )
    }
  }

  declareWork('evidence-outlives-the-account', {
    did: {
      'migration replayed': files.length,
      'table refusing a statement outright': schema.refuses.size,
      'cascading foreign key tracked': schema.keys.size,
    },
    found: { 'parent row nothing can delete': found.length },
  })

  if (found.length > 0) process.exit(1)

  console.log(
    `${TAG} PASS: ${files.length} migration(s) replayed, ${schema.refuses.size} table(s) refuse a statement ` +
      `outright, ${schema.keys.size} cascading foreign key(s), and not one of them lands on a refusing table`,
  )
}

if (process.argv[1] && process.argv[1].endsWith('evidence-outlives-the-account.mjs')) main()
