/**
 * A TRIGGER THAT CAN REFUSE MUST NOT RE-JUDGE A ROW THE DATABASE REWROTE ON ITS
 * OWN BEHALF.
 *
 * ===========================================================================
 * THE DEFECT, DRIVEN AGAINST TEST ON 19 SEPTEMBER 2026
 * ===========================================================================
 *
 * `on delete set null` is a standing instruction: when the parent goes, the
 * database issues `UPDATE ONLY child SET fk = NULL WHERE $1 = fk`. That
 * statement is how an account, an order or an event is deleted. Nothing about
 * the child's own contents has changed and nobody has edited anything.
 *
 * A `BEFORE UPDATE ... FOR EACH ROW` trigger with no column list and no early
 * return runs on it anyway, and judges the whole row again against TODAY'S
 * configuration rather than the configuration in force when the row was
 * written. So the delete fails, and the error names a subject the person
 * deleting has never heard of:
 *
 *   update public.event_group_rates set created_by = null where $1 = created_by
 *   ERROR: a group rate of 2000 is below the floor of 2488 for this event
 *
 *   update public.audience_members set last_order_id = null where email = ...
 *   ERROR: the consent resolver does not currently permit marketing to this address
 *
 * THE SECOND ONE ARMS ITSELF WITH THE CALENDAR. `consent_policy.max_age_months`
 * defaults to 24, nothing sweeps the audience when consent simply ages, so
 * every member who passes that threshold silently becomes an anchor holding
 * down their own account, their last order and their last event.
 *
 * ===========================================================================
 * THE RULE
 * ===========================================================================
 *
 * For every table carrying an `on delete set null` foreign key, every
 * BEFORE UPDATE FOR EACH ROW trigger whose function can `raise exception` must
 * decline to judge a statement that changes only the nullable key columns.
 *
 * THREE CONSTRUCTS SATISFY IT, and this tree already contains all three, which
 * is why the guard accepts all three rather than imposing one house style on
 * two triggers that were correct before it was written.
 *
 *   1. `UPDATE OF (columns)` in the event list, naming no nullable key column.
 *      The trigger does not fire at all. Strongest, cheapest, and the only one
 *      that works on a `before insert or update` trigger without splitting it.
 *      Worked example: `organisations.trg_founding_waiver_cap`.
 *
 *   2. `WHEN (...)` on the trigger, naming no nullable key column. Rejected by
 *      Postgres on a trigger that also fires on INSERT, because it may
 *      reference OLD, so in practice this is for update-only triggers.
 *
 *   3. An early `return new` in the function, under a condition naming every
 *      column the function judges and no nullable key column.
 *      Worked example: `events.trg_refund_policy_one_way`, which opens
 *      "Nothing about the policy changed: not our business."
 *
 * SECOND CLAUSE, THE DRIFT. Where construct 1 is used, the column list must
 * cover every column the function reads from NEW, excluding the primary key,
 * which a trigger reads to exclude its own row and which nobody updates.
 * Otherwise the check silently stops running the day the function grows a
 * reference, which is a worse failure than the one this guard exists to stop:
 * a refusal that was supposed to happen and did not.
 *
 * ===========================================================================
 * WHAT IT PROVES AND WHAT IT DOES NOT, STATED RATHER THAN IMPLIED
 * ===========================================================================
 *
 * It judges the schema the migration FILES would build, through the shared
 * parser in `lib/referential-keys.mjs`, so it runs on the Vercel build host
 * with no database and no credentials. It does not execute SQL and cannot prove
 * a function's semantics; what it enforces is a DISCIPLINE, that a trigger
 * which can refuse must say in a form a machine can read which columns it
 * judges. The semantics are proved by
 * `scripts/verify/a-referential-null-is-not-an-edit-drive.mjs`, which puts the
 * real statements to the real database.
 *
 * ITS SIBLING covers the other half. `evidence-outlives-the-account` judges
 * UNCONDITIONAL, statement-level refusals, where the parent becomes undeletable
 * for everybody at once. This one judges the ROW-level case, where the refusal
 * depends on the row's own contents and on configuration that moves. They share
 * one parser so they cannot drift about what a key is.
 *
 * Run standalone:  node scripts/guards/a-referential-null-is-not-an-edit.mjs
 */
import {
  calibrationFailures,
  migrationFiles,
  replaySchema,
  setNullColumnsByTable,
} from './lib/referential-keys.mjs'
import { declareWork } from '../lib/work-report.mjs'

export const TAG = '[a-referential-null-is-not-an-edit]'

/*
 * ===========================================================================
 * THE BASELINE IS EMPTY, AND THE REASON IS WORTH WRITING DOWN
 * ===========================================================================
 *
 * This list exists for a trigger that has the defect and belongs to ANOTHER
 * LANE, which a lane may not reach into under the three-lane protocol. It holds
 * nothing, and an entry fails the build the day it stops matching, so the list
 * can only shrink.
 *
 * IT HELD ONE ENTRY FOR AN HOUR AND THE ENTRY WAS WRONG, which is the useful
 * part. `ticket_tiers.tier_access_mode_matches_event` was read off a database
 * query that asked only whether the trigger had a WHEN clause and whether the
 * function could raise. Both answers said "unprotected", and it was written
 * down as a border for the lane that owns seat maps. It is declared
 *
 *     BEFORE INSERT OR UPDATE OF access_mode, event_id ON public.ticket_tiers
 *
 * so it never sees the statement that blanks `seat_map_section_id`, and it was
 * correct before this guard existed. The guard refused its own baseline entry
 * on the first run that could read an event list, and the live trigger
 * definition on TEST confirmed it. A query that does not ask about every
 * protective construct is a query that invents defects.
 */
const NOT_THIS_LANE = []

/** `new.x` and `old.x`, minus the ones that are only ever assigned to. */
export function columnsRead(body) {
  const read = new Set()
  for (const [, , column] of body.matchAll(/\b(new|old)\s*\.\s*([a-z_][a-z0-9_]*)/gi)) {
    read.add(column.toLowerCase())
  }
  for (const [, column] of body.matchAll(/\bnew\s*\.\s*([a-z_][a-z0-9_]*)\s*:=/gi)) {
    const name = column.toLowerCase()
    /*
     * ASSIGNED AND NEVER READ. `new.updated_at := now()` is the trigger writing
     * to the row, not judging it, and counting it as a judgement would demand a
     * column list naming the very column the stamp exists to change.
     */
    const readElsewhere = new RegExp(`\\b(new|old)\\s*\\.\\s*${name}\\b(?!\\s*:=)`, 'i').test(body)
    if (!readElsewhere) read.delete(name)
  }
  return read
}

/**
 * Columns named by LEADING `if ... then return new; end if;` blocks, meaning
 * the blocks that come before the function can raise. A guard clause after the
 * raise guards nothing.
 */
export function earlyReturnColumns(body) {
  const firstRaise = body.search(/\braise\s+exception\b/i)
  const upTo = firstRaise === -1 ? body.length : firstRaise
  const columns = new Set()
  let any = false
  for (const match of body.slice(0, upTo).matchAll(/\bif\b([\s\S]*?)\bthen\b\s*return\s+new\s*;/gi)) {
    any = true
    for (const [, , column] of match[1].matchAll(/\b(new|old)\s*\.\s*([a-z_][a-z0-9_]*)/gi)) {
      columns.add(column.toLowerCase())
    }
  }
  return { columns, any }
}

/** Columns a `when (...)` clause refers to. */
export function whenColumns(when) {
  const columns = new Set()
  for (const [, , column] of String(when).matchAll(/\b(new|old)\s*\.\s*([a-z_][a-z0-9_]*)/gi)) {
    columns.add(column.toLowerCase())
  }
  return columns
}

const overlap = (a, b) => [...a].filter(x => b.has(x))

/**
 * Every trigger of the shape this rule governs, with its verdict. Exported so a
 * test can put a synthetic schema to it without running the guard.
 */
export function judge(schema) {
  const nullable = setNullColumnsByTable(schema.keys)
  const subjects = []

  for (const trigger of schema.triggers.values()) {
    if (trigger.timing !== 'before') continue
    if (!trigger.events.includes('update')) continue
    if (!trigger.forEachRow) continue
    const nullableHere = nullable.get(trigger.table)
    if (!nullableHere || nullableHere.size === 0) continue

    const body = schema.functions.get(trigger.fn)
    if (body === undefined) {
      subjects.push({
        ...trigger,
        verdict: 'UNREADABLE',
        detail:
          `the body of ${trigger.fn}() is not in this tree, so whether it can refuse a referential null ` +
          'cannot be judged here',
      })
      continue
    }
    if (!/\braise\s+exception\b/i.test(body)) continue

    const nullableColumns = [...nullableHere].sort()
    const read = columnsRead(body)

    if (trigger.updateOf) {
      const clash = overlap(new Set(trigger.updateOf), nullableHere)
      if (clash.length > 0) {
        subjects.push({
          ...trigger,
          verdict: 'BROKEN',
          detail:
            `its event list names ${clash.join(', ')}, which the database blanks when a parent row is ` +
            'deleted, so the deletion is judged by this trigger',
        })
        continue
      }
      const primaryKey = schema.primaryKeys.get(trigger.table) ?? new Set()
      const uncovered = [...read].filter(c => !trigger.updateOf.includes(c) && !primaryKey.has(c)).sort()
      if (uncovered.length > 0) {
        subjects.push({
          ...trigger,
          verdict: 'DRIFTED',
          detail:
            `${trigger.fn}() reads ${uncovered.join(', ')}, which its event list ` +
            `(${trigger.updateOf.join(', ')}) does not cover, so the check silently stops running when one ` +
            'of them changes',
        })
        continue
      }
      subjects.push({ ...trigger, verdict: 'HELD', by: `update of ${trigger.updateOf.join(', ')}`, nullableColumns })
      continue
    }

    if (trigger.when) {
      const named = whenColumns(trigger.when)
      const clash = overlap(named, nullableHere)
      if (clash.length > 0) {
        subjects.push({
          ...trigger,
          verdict: 'BROKEN',
          detail: `its when clause names ${clash.join(', ')}, which the database blanks on a parent delete`,
        })
        continue
      }
      subjects.push({ ...trigger, verdict: 'HELD', by: 'a when clause', nullableColumns })
      continue
    }

    const early = earlyReturnColumns(body)
    if (!early.any) {
      subjects.push({
        ...trigger,
        verdict: 'BROKEN',
        detail:
          `${trigger.fn}() can raise and returns early for nothing, so blanking any of ` +
          `${nullableColumns.join(', ')} re-judges the whole row`,
      })
      continue
    }
    const clash = overlap(early.columns, nullableHere)
    if (clash.length > 0) {
      subjects.push({
        ...trigger,
        verdict: 'BROKEN',
        detail: `its early return is conditioned on ${clash.join(', ')}, which is exactly what a parent delete changes`,
      })
      continue
    }
    const unguarded = [...read].filter(c => !early.columns.has(c)).sort()
    if (unguarded.length > 0) {
      subjects.push({
        ...trigger,
        verdict: 'BROKEN',
        detail:
          `${trigger.fn}() judges ${unguarded.join(', ')} and its early return does not mention ` +
          'them, so the early return cannot be trusted to mean nothing it judges has changed',
      })
      continue
    }
    subjects.push({ ...trigger, verdict: 'HELD', by: 'an early return in the function', nullableColumns })
  }

  return subjects
}

/**
 * CALIBRATION. Each probe is a schema whose answer is known, so a rule that has
 * stopped matching is reported as a broken rule rather than as a clean tree.
 */
function selfChecks() {
  const failures = calibrationFailures()

  const verdictOf = (label, sql, wanted) => {
    const subjects = judge(replaySchema([{ name: 'probe.sql', sql }]))
    const got = subjects.length === 1 ? subjects[0].verdict : `${subjects.length} subjects`
    if (got !== wanted) failures.push(`${label}: expected ${wanted}, got ${got}`)
  }

  const table = (extra = '') => `
    create table public.q_probe (
      id uuid primary key,
      watched int not null,
      created_by uuid references auth.users(id) on delete set null
    );
    create or replace function public.q_probe_fn() returns trigger language plpgsql as $f$
    begin
      ${extra}
      if new.watched < 0 then
        raise exception 'no';
      end if;
      return new;
    end;
    $f$;`

  verdictOf(
    'a bare before-update trigger that can raise, on a table with a set-null key',
    `${table()}
     create trigger q_probe_trg before insert or update on public.q_probe
       for each row execute function public.q_probe_fn();`,
    'BROKEN',
  )
  verdictOf(
    'the same trigger held by an event list',
    `${table()}
     create trigger q_probe_trg before insert or update of watched on public.q_probe
       for each row execute function public.q_probe_fn();`,
    'HELD',
  )
  verdictOf(
    'an event list that names the nullable key itself',
    `${table()}
     create trigger q_probe_trg before insert or update of watched, created_by on public.q_probe
       for each row execute function public.q_probe_fn();`,
    'BROKEN',
  )
  verdictOf(
    'an event list that no longer covers what the function reads',
    `${table()}
     create trigger q_probe_trg before insert or update of id on public.q_probe
       for each row execute function public.q_probe_fn();`,
    'DRIFTED',
  )
  verdictOf(
    'the same trigger held by an early return in the function',
    `${table('if new.watched is not distinct from old.watched then return new; end if;')}
     create trigger q_probe_trg before update on public.q_probe
       for each row execute function public.q_probe_fn();`,
    'HELD',
  )
  verdictOf(
    'an early return conditioned on the nullable key itself',
    `${table('if new.created_by is not distinct from old.created_by then return new; end if;')}
     create trigger q_probe_trg before update on public.q_probe
       for each row execute function public.q_probe_fn();`,
    'BROKEN',
  )
  verdictOf(
    'a trigger whose function cannot raise at all, which is not this rule’s business',
    `create table public.q_probe (id uuid primary key, created_by uuid references auth.users(id) on delete set null);
     create or replace function public.q_probe_fn() returns trigger language plpgsql as $f$
     begin new.id := new.id; return new; end;
     $f$;
     create trigger q_probe_trg before update on public.q_probe
       for each row execute function public.q_probe_fn();`,
    '0 subjects',
  )
  verdictOf(
    'a table with no set-null key at all, which cannot have this defect',
    `create table public.q_probe (id uuid primary key, created_by uuid references auth.users(id) on delete cascade);
     create or replace function public.q_probe_fn() returns trigger language plpgsql as $f$
     begin raise exception 'no'; end;
     $f$;
     create trigger q_probe_trg before update on public.q_probe
       for each row execute function public.q_probe_fn();`,
    '0 subjects',
  )

  /* A stamp the trigger writes and never reads must not be demanded of the list. */
  const stamped = judge(
    replaySchema([
      {
        name: 'probe.sql',
        sql: `create table public.q_stamp (
                id uuid primary key, watched int, updated_at timestamptz,
                created_by uuid references auth.users(id) on delete set null);
              create or replace function public.q_stamp_fn() returns trigger language plpgsql as $f$
              begin
                new.updated_at := now();
                if new.watched < 0 then raise exception 'no'; end if;
                return new;
              end; $f$;
              create trigger q_stamp_trg before insert or update of watched on public.q_stamp
                for each row execute function public.q_stamp_fn();`,
      },
    ]),
  )
  if (stamped[0]?.verdict !== 'HELD') {
    failures.push(`a column the function only ASSIGNS is demanded of the event list (got ${stamped[0]?.verdict})`)
  }

  return failures
}

function main() {
  const files = migrationFiles()
  const schema = replaySchema(files)
  const probes = selfChecks()

  if (probes.length > 0) {
    console.error(`${TAG} REFUSING: the calibration probe came back wrong, so this guard has gone blind:`)
    for (const probe of probes) console.error(`${TAG}   ${probe}`)
    process.exit(1)
  }

  const subjects = judge(schema)
  const held = subjects.filter(s => s.verdict === 'HELD')
  const broken = subjects.filter(s => s.verdict !== 'HELD')

  const baselined = []
  const problems = []
  for (const s of broken) {
    const entry = NOT_THIS_LANE.find(b => b.table === s.table && b.trigger === s.trigger)
    if (entry) baselined.push({ ...s, entry })
    else problems.push(s)
  }

  /*
   * A BASELINE ENTRY THAT NO LONGER MATCHES ANYTHING IS A FINDING, not a
   * convenience. It is the only thing that makes the list shrink-only: the day
   * the owning lane fixes its trigger, this refuses until the line is deleted.
   */
  const stale = NOT_THIS_LANE.filter(
    entry => !broken.some(s => s.table === entry.table && s.trigger === entry.trigger),
  )

  for (const { entry } of baselined) {
    console.log(
      `${TAG} NOT THIS LANE: ${entry.table}.${entry.trigger} has the defect and belongs to ${entry.lane}. ` +
        `${entry.why}. Delete this line from NOT_THIS_LANE the day it is fixed.`,
    )
  }

  if (problems.length > 0) {
    console.error(`${TAG} a parent delete is judged by a trigger that has nothing to do with it:`)
    for (const s of problems) {
      console.error(`${TAG}   ${s.table}.${s.trigger} (${s.file}) is ${s.verdict}: ${s.detail}.`)
      console.error(
        `${TAG}     Fix it with an event list, "before insert or update of <the columns the function ` +
          'reads>", which is the shape organisations.trg_founding_waiver_cap uses, or with an early return ' +
          'naming every column it judges, which is the shape events.trg_refund_policy_one_way uses. ' +
          'Worked example: supabase/migrations/20260919000140.',
      )
    }
  }

  if (stale.length > 0) {
    console.error(`${TAG} a NOT_THIS_LANE entry no longer matches a trigger with the defect:`)
    for (const entry of stale) {
      console.error(`${TAG}   ${entry.table}.${entry.trigger} is either fixed or gone. Delete the line.`)
    }
  }

  declareWork('a-referential-null-is-not-an-edit', {
    did: {
      'migration replayed': files.length,
      'trigger of this shape judged': subjects.length,
      'trigger held against a referential null': held.length,
      'trigger left to another lane': baselined.length,
    },
    found: { 'parent delete a trigger can refuse': problems.length + stale.length },
    /*
     * ZERO IS THE STATE THE FIX ACHIEVED, not a step that did nothing. Every
     * trigger of this shape in the tree is now held, so there is nothing left
     * for another lane to be asked about. The day one appears the count goes to
     * one, the build fails, and the line that appears here names its owner.
     */
    zeroIsFine: {
      'trigger left to another lane':
        'every before-update row trigger that can raise on a set-null table is held, so no lane is waiting ' +
        'on another. The only entry this list ever had turned out to be already held by an event list.',
    },
  })

  if (problems.length > 0 || stale.length > 0) process.exit(1)

  console.log(
    `${TAG} PASS: ${subjects.length} before-update row trigger(s) that can raise sit on a table with a ` +
      `set-null key; ${held.length} decline a referential null (${held
        .map(s => `${s.table}.${s.trigger} by ${s.by}`)
        .join('; ')}), and ${baselined.length} is another lane's, listed by name`,
  )
}

if (process.argv[1] && process.argv[1].endsWith('a-referential-null-is-not-an-edit.mjs')) main()
