/**
 * THE FILE PARSER AND THE DATABASE ARE ASKED THE SAME QUESTION, AND THE ANSWERS
 * ARE COMPARED ROW BY ROW.
 *
 * `scripts/guards/lib/referential-keys.mjs` replays the migration files and
 * says which foreign keys rewrite a child row when the parent goes, and which
 * triggers survive. It runs on the Vercel build host, where there is no
 * database, so it can only ever be as right as its parsing.
 *
 * THAT IS EXACTLY HOW THE DEFECT IT REPLACES SURVIVED. The parser it succeeds
 * required a column's type and the word `references` to sit on ONE LINE, missed
 * two of the four shapes this repository writes keys in, and printed a
 * confident PASS over a schema it had read a third of. A guard cannot notice
 * that about itself; only a second source can.
 *
 * So this asks TEST the same question through `pg_constraint` and `pg_trigger`
 * and fails on any disagreement in either direction:
 *
 *   IN THE DATABASE, NOT IN THE FILES  the parser is blind to a shape, or a
 *                                      constraint was added to TEST by hand
 *   IN THE FILES, NOT IN THE DATABASE  a migration has not been applied, or the
 *                                      parser is inventing keys
 *
 * It is a VERIFY script and not a guard, deliberately: it needs a credential
 * and a network, and a build-time guard that needs either is a guard that gets
 * switched off. It is run by hand beside the guard, and its output is evidence.
 *
 * Run:
 *   scripts\ops\with-supabase-token.ps1 node scripts/verify/referential-keys-agree-with-the-database.mjs
 */
import { migrationFiles, replaySchema, setNullKeys } from '../guards/lib/referential-keys.mjs'

const TEST_PROJECT_REF = 'vkapkibzokmfaxqogypq'
const TAG = '[referential-keys-agree-with-the-database]'

const token = process.env.SUPABASE_ACCESS_TOKEN
if (!token) {
  console.error(`${TAG} REFUSED: no SUPABASE_ACCESS_TOKEN. Run it through scripts\\ops\\with-supabase-token.ps1.`)
  process.exit(2)
}

async function query(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${TEST_PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  })
  const body = await res.text()
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${body.slice(0, 400)}`)
  return JSON.parse(body)
}

/*
 * THE DATABASE'S ANSWER. `confdeltype = 'n'` is SET NULL. A multi-column key is
 * unnested so it is compared column by column, which is how the parser records
 * it and how the referential action actually rewrites the row.
 */
const DB_KEYS = `
  select c.relname as tbl, a.attname as col
    from pg_constraint con
    join pg_class c on c.oid = con.conrelid
    join pg_namespace n on n.oid = c.relnamespace
    join lateral unnest(con.conkey) as k(attnum) on true
    join pg_attribute a on a.attrelid = c.oid and a.attnum = k.attnum
   where n.nspname = 'public' and con.contype = 'f' and con.confdeltype = 'n'
   order by 1, 2`

const DB_TRIGGERS = `
  select c.relname as tbl, t.tgname as trg
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and not t.tgisinternal
   order by 1, 2`

/*
 * ===========================================================================
 * THE TWO KINDS OF RESIDUE, AND WHY ONLY ONE OF THEM IS THIS FILE'S BUSINESS
 * ===========================================================================
 *
 * BUILT BY STRING DDL, so the parser is blind BY DESIGN and says so in its own
 * header. `20260520000001_schema_hygiene.sql` builds a touch trigger for a list
 * of tables with `format(...)` and `EXECUTE`, so the trigger name never appears
 * in the file as text. A parser that does not run SQL cannot see it and should
 * not pretend to. These are listed so the count is EXPLAINED rather than
 * waved through, and the list FAILS THIS SCRIPT if an entry stops appearing on
 * TEST, which is what happens when the hygiene migration stops running.
 */
const BUILT_BY_STRING_DDL = [
  'order_items.set_updated_at',
  'payout_holds.set_updated_at',
  'reservations.set_updated_at',
  'squad_members.set_updated_at',
  'squads.set_updated_at',
  'waitlist.set_updated_at',
]

/*
 * ON TEST AND IN NO MIGRATION IN THIS TREE. Not a parser gap and not this
 * lane's to fix: TEST has drifted from the repository, which is what happens
 * when a migration is applied from a branch that has not merged. Reported every
 * run so it cannot become invisible, and NOT failing, because a lane cannot fix
 * another lane's unmerged migration and a gate nobody can go green on is a gate
 * somebody switches off.
 */
const TEST_HAS_WHAT_THE_TREE_DOES_NOT_BUILD = {
  triggers: [
    'event_needs.event_needs_touch_updated_at',
    'events.events_set_is_multi_day',
    'event_addons.event_addons_refuse_delete_with_orders',
  ],
  keys: ['event_needs.created_by'],
}

async function main() {
  const { keys, triggers } = replaySchema(migrationFiles())

  const dbKeyRows = await query(DB_KEYS)
  const dbTables = new Set(dbKeyRows.map(r => r.tbl))
  const fromDatabase = new Set(dbKeyRows.map(r => `${r.tbl}.${r.col}`))
  const fromFiles = new Set(setNullKeys(keys).map(k => `${k.table}.${k.column}`))

  const dbTriggerRows = await query(DB_TRIGGERS)
  const dbTriggers = new Set(dbTriggerRows.map(r => `${r.tbl}.${r.trg}`))
  /*
   * PUBLIC ONLY, ON BOTH SIDES. This tree also builds `on_auth_user_created` on
   * `auth.users`, which the query above deliberately does not read, and a
   * comparison that keeps it on one side reports it missing for ever.
   */
  const fileTriggers = new Set(
    [...triggers.values()].filter(t => t.schema === 'public').map(t => `${t.table}.${t.trigger}`),
  )

  const drifted = new Set([
    ...TEST_HAS_WHAT_THE_TREE_DOES_NOT_BUILD.triggers,
    ...TEST_HAS_WHAT_THE_TREE_DOES_NOT_BUILD.keys,
  ])
  const stringBuilt = new Set(BUILT_BY_STRING_DDL)

  const keysOnlyInDatabase = [...fromDatabase].filter(k => !fromFiles.has(k) && !drifted.has(k))
  const keysOnlyInFiles = [...fromFiles].filter(k => !fromDatabase.has(k))
  const triggersOnlyInDatabase = [...dbTriggers].filter(
    t => !fileTriggers.has(t) && !drifted.has(t) && !stringBuilt.has(t),
  )
  const triggersOnlyInFiles = [...fileTriggers].filter(t => !dbTriggers.has(t))

  /*
   * A DECLARED EXPLANATION THAT NO LONGER EXPLAINS ANYTHING IS A FINDING.
   * Both lists above assert something about TEST, and an assertion nobody
   * checks is how a baseline rots into an unexamined list.
   */
  const staleExplanations = [
    ...[...stringBuilt].filter(t => !dbTriggers.has(t)).map(t => `${t} is declared as built by string DDL and TEST does not have it`),
    ...[...drifted].filter(o => !dbTriggers.has(o) && !fromDatabase.has(o)).map(o => `${o} is declared as TEST drift and TEST no longer has it`),
    ...[...stringBuilt, ...drifted].filter(o => fileTriggers.has(o) || fromFiles.has(o)).map(o => `${o} is declared as unparseable and the parser now sees it`),
  ]

  console.log(`${TAG} set-null keys: ${fromFiles.size} parsed from the files, ${fromDatabase.size} reported by TEST`)
  console.log(`${TAG} triggers:      ${fileTriggers.size} parsed from the files, ${dbTriggers.size} reported by TEST`)

  let failed = false

  if (keysOnlyInDatabase.length > 0) {
    failed = true
    console.error(`${TAG} ${keysOnlyInDatabase.length} set-null key(s) TEST holds and the parser cannot see:`)
    for (const k of keysOnlyInDatabase) console.error(`${TAG}   ${k}`)
    console.error(`${TAG}   Either the parser is blind to a declaration shape, or somebody added a key by hand.`)
  }
  if (keysOnlyInFiles.length > 0) {
    failed = true
    console.error(`${TAG} ${keysOnlyInFiles.length} set-null key(s) the files declare and TEST does not hold:`)
    for (const k of keysOnlyInFiles) console.error(`${TAG}   ${k}`)
    console.error(`${TAG}   Either a migration is unapplied on TEST, or the parser is inventing keys.`)
  }

  /*
   * TRIGGERS ARE REPORTED IN BOTH DIRECTIONS BUT ONLY FAIL IN ONE.
   *
   * Supabase's own extensions and the auth schema install triggers this
   * repository never wrote, so "in the database, not in the files" is normal
   * for triggers in a way it is not for keys. The direction that MATTERS is a
   * trigger this tree builds that TEST does not have, which means an unapplied
   * migration, and that is the one that fails.
   */
  if (triggersOnlyInFiles.length > 0) {
    failed = true
    console.error(`${TAG} ${triggersOnlyInFiles.length} trigger(s) the files build and TEST does not have:`)
    for (const t of triggersOnlyInFiles) console.error(`${TAG}   ${t}`)
  }
  if (triggersOnlyInDatabase.length > 0) {
    failed = true
    console.error(`${TAG} ${triggersOnlyInDatabase.length} trigger(s) on TEST that this tree neither writes nor explains:`)
    for (const t of triggersOnlyInDatabase) console.error(`${TAG}   ${t}`)
  }

  if (staleExplanations.length > 0) {
    failed = true
    console.error(`${TAG} a declared explanation no longer explains anything:`)
    for (const s of staleExplanations) console.error(`${TAG}   ${s}`)
  }

  console.log(
    `${TAG} accounted for rather than ignored: ${stringBuilt.size} trigger(s) built by string DDL in ` +
      `20260520000001_schema_hygiene.sql (${[...stringBuilt].join(', ')}), and ${drifted.size} object(s) on ` +
      `TEST that no migration in this tree builds (${[...drifted].join(', ')}), which is TEST drift from an ` +
      `unmerged branch and is reported rather than fixed here`,
  )

  if (failed) process.exit(1)
  console.log(
    `${TAG} PASS: the files and TEST agree on every one of ${fromFiles.size} set-null key(s) across ` +
      `${dbTables.size} table(s), and on every trigger this tree builds`,
  )
}

main().catch(error => {
  console.error(`${TAG} FAILED: ${error.message}`)
  process.exit(1)
})
