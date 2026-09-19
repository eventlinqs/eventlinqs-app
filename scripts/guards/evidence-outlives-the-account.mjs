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
 *   CONTEXT:  SQL statement "UPDATE ONLY public.marketing_capture_placement
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
 * It judges the schema the migration FILES would build, through the shared
 * parser in `lib/referential-keys.mjs`. It does not connect to a database.
 *
 * ITS OWN PARSER USED TO LIVE HERE AND IT WAS READING A THIRD OF THE SCHEMA.
 * Two line-anchored regular expressions required a column's type and the word
 * `references` to sit on ONE LINE, which is two of the FIVE shapes this
 * repository writes keys in; a replay that applied every CREATE and then every
 * DROP deleted the triggers it had just made; a multi-column key lost every
 * column but the last; and renames, `add column if not exists` over an existing
 * column and `create constraint trigger` were all unmodelled. Measured against
 * TEST on 19 September 2026 it saw 113 of the 114 keys it should have and 16 of
 * the 78 triggers. The parser now lives in the shared library, is calibrated
 * against every shape, and is checked against the live database by
 * `scripts/verify/referential-keys-agree-with-the-database.mjs`.
 *
 * It judges UNCONDITIONAL refusals ONLY, which is the statement-level case.
 * The ROW-level case, where a trigger judges the row's own contents and can
 * refuse a referential null for a reason that has nothing to do with the
 * delete, is a different rule with a different fix and it belongs to
 * `a-referential-null-is-not-an-edit.mjs`. The two share this file's parser and
 * between them cover both halves.
 */
import {
  calibrationFailures,
  migrationFiles,
  replaySchema,
  withoutComments,
} from './lib/referential-keys.mjs'
import { declareWork } from '../lib/work-report.mjs'

export const TAG = '[evidence-outlives-the-account]'

export { withoutComments }

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
  const files = migrationFiles()
  const schema = replaySchema(files)
  const found = collisions(schema)

  /*
   * CALIBRATION. Every clause here rests on a parser, and a parser that has
   * stopped matching reports a confident pass. The shared library exercises
   * each declaration shape against SQL known to declare exactly one key; this
   * guard then exercises its OWN rule, the collision, against a schema known to
   * be wrong. It REFUSES rather than passing if either probe comes back clean.
   */
  const probes = calibrationFailures()

  const probeSchema = replaySchema([
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

  const cascadeProbe = replaySchema([
    {
      name: 'probe.sql',
      sql: `
        create table public.b_probe_ledger (
          id uuid primary key,
          order_id uuid references public.orders(id) on delete cascade
        );
        create trigger trg_b_probe_ledger_no_delete
          before delete on public.b_probe_ledger
          for each statement execute function public.refuse_ledger_mutation();
      `,
    },
  ])
  if (collisions(cascadeProbe).length !== 1) probes.push('a cascading key into a delete-refusing table is not caught')

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
