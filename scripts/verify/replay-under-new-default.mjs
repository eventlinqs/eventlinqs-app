// REPLAY A MIGRATION ON TEST UNDER SUPABASE'S NEW DEFAULT: NO AUTOMATIC GRANTS.
//
// From 30 October 2026 Supabase stops granting new public tables to anon,
// authenticated and service_role: "New tables in the public schema will no
// longer be exposed to the Data API automatically"
// (https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically,
// read 21 October 2026). A migration that leans on the old default works on
// every database that exists today and fails on the next fresh one. This runs
// the migration the way a fresh database will, today:
//
//   1. Supabase's own opt-in statements, verbatim from that page, so new tables
//      get no select, insert, update or delete for the three roles;
//   2. every table the migration creates is dropped (it must be empty: this
//      refuses otherwise);
//   3. the migration file, exactly as written, creates them again;
//   4a. ROLLBACK MODE (default): a proof file runs as each role and RAISES its
//       verdict, so everything above is undone and TEST is left as found;
//   4b. --keep: the old default is put back exactly (read before, compared
//       after) and the transaction COMMITS, so the tables stay created under
//       the new default and the routes can be driven against them.
//
// It all runs inside ONE DO block, so it is one transaction whatever the API
// does with a multi-statement string. It proves itself by reading the result
// back, never by trusting its own call.
//
// TEST ONLY: the project ref is a constant, there is no flag to change it.
//
// Usage (the token comes from the environment and is never printed):
//   scripts/ops/with-supabase-token.ps1 node scripts/verify/replay-under-new-default.mjs <migration.sql> <proof.sql>
//   scripts/ops/with-supabase-token.ps1 node scripts/verify/replay-under-new-default.mjs <migration.sql> --keep
import { readFileSync } from 'node:fs'
import { basename } from 'node:path'

const REF = 'vkapkibzokmfaxqogypq'
// TEST only. The replay drops a migration's tables and creates them again, so
// the production ref is refused outright, whatever REF is edited to.
const PRODUCTION_REF = 'gndnldyfudbytbboxesk'
if (REF === PRODUCTION_REF) throw new Error('replay-under-new-default runs on TEST only, never on production')
const args = process.argv.slice(2)
const KEEP = args.includes('--keep')
const [migrationFile, proofFile] = args.filter((a) => !a.startsWith('--'))
const token = process.env.SUPABASE_ACCESS_TOKEN

// Supabase's opt-in and its exact reverse, from changelog 45329.
const OPT_IN = [
  'alter default privileges for role postgres in schema public revoke select, insert, update, delete on tables from anon, authenticated, service_role',
  'alter default privileges for role postgres in schema public revoke usage, select on sequences from anon, authenticated, service_role',
]
const OPT_OUT = [
  'alter default privileges for role postgres in schema public grant select, insert, update, delete on tables to anon, authenticated, service_role',
  'alter default privileges for role postgres in schema public grant usage, select on sequences to anon, authenticated, service_role',
]

async function run(sql, readOnly) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql, read_only: readOnly }),
  })
  return { ok: res.ok, status: res.status, text: await res.text() }
}

/** Tables the migration creates in public, in file order. */
export function createdTables(sql) {
  const out = []
  for (const m of sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?"?([a-z_][a-z0-9_]*)"?\s*\(/gi)) out.push(m[1])
  return [...new Set(out)]
}

const DEFAULT_ACL = `select coalesce(json_agg(json_build_object('type', d.defaclobjtype, 'acl', d.defaclacl::text) order by d.defaclobjtype), '[]'::json)::text as acl
  from pg_default_acl d join pg_namespace n on n.oid = d.defaclnamespace
 where n.nspname = 'public' and pg_get_userbyid(d.defaclrole) = 'postgres'`

async function main() {
  if (!token) {
    console.error('REFUSED: SUPABASE_ACCESS_TOKEN is not in the environment; run through scripts/ops/with-supabase-token.ps1')
    return 2
  }
  if (!migrationFile || (!KEEP && !proofFile)) {
    console.error('REFUSED: give a migration file and either a proof file or --keep')
    return 2
  }
  // The file's own top-level BEGIN; and COMMIT; lines are the ONE change made to
  // it: the replay is already a single transaction, and plpgsql cannot EXECUTE
  // a transaction command. A plpgsql body's own "begin" carries no semicolon and
  // is untouched.
  const asWritten = readFileSync(migrationFile, 'utf8')
  const migration = asWritten.replace(/^[ \t]*(begin|commit)[ \t]*;[ \t]*$/gim, '-- ($1; removed by the replay: it is one transaction already)')
  const removed = (asWritten.match(/^[ \t]*(begin|commit)[ \t]*;[ \t]*$/gim) ?? []).length
  const proof = proofFile ? readFileSync(proofFile, 'utf8') : ''
  for (const [tag, text] of [['$wi_mig$', migration], ['$wi_prf$', proof]]) {
    if (text.includes(tag)) {
      console.error(`REFUSED: ${tag} appears inside the text it would quote`)
      return 2
    }
  }
  const tables = createdTables(migration)
  console.log(`target TEST (${REF}), ${KEEP ? 'KEEP: commits' : 'ROLLBACK: proof raises its verdict'}`)
  console.log(`migration ${basename(migrationFile)} creates ${tables.length ? tables.join(', ') : 'no table'}; ${removed} top-level transaction line(s) set aside`)

  // Refuse before acting: only empty tables are dropped.
  if (tables.length) {
    // A table this migration brings for the first time is not on TEST yet: it counts as empty (nothing to lose), read
    // through query_to_xml so the absent name is never parsed.
    const counts = await run(
      `select ${tables
        .map(
          (t) =>
            `(case when to_regclass('public.${t}') is null then 0 else (xpath('/row/c/text()', query_to_xml('select count(*) as c from public.${t}', false, true, '')))[1]::text::int end) as ${t}`,
        )
        .join(', ')}`,
      true,
    )
    if (!counts.ok) {
      console.error(`REFUSED: could not count the tables first (HTTP ${counts.status}): ${counts.text.slice(0, 400)}`)
      return 1
    }
    const row = JSON.parse(counts.text)[0]
    const full = Object.entries(row).filter(([, n]) => n > 0)
    if (full.length) {
      console.error(`REFUSED: these tables hold rows and would lose them: ${full.map(([t, n]) => `${t} (${n})`).join(', ')}`)
      return 1
    }
    console.log(`ON RECORD empty: ${tables.join(', ')}`)
  }

  const before = await run(DEFAULT_ACL, true)
  if (!before.ok) {
    console.error(`FAILED to read the default privileges (HTTP ${before.status})`)
    return 1
  }
  const aclBefore = JSON.parse(before.text)[0].acl
  console.log(`ON RECORD default privileges for postgres in public: ${aclBefore}`)

  const drop = tables.length ? `EXECUTE 'drop table if exists ${[...tables].reverse().map((t) => `public.${t}`).join(', ')} cascade';` : ''
  const body = [
    ...OPT_IN.map((s) => `EXECUTE '${s}';`),
    drop,
    `EXECUTE $wi_mig$${migration}$wi_mig$;`,
    KEEP ? OPT_OUT.map((s) => `EXECUTE '${s}';`).join('\n') : `EXECUTE $wi_prf$${proof}$wi_prf$;`,
  ].join('\n')
  const result = await run(`DO $wi_replay$\nBEGIN\n${body}\nEND\n$wi_replay$;`, false)

  let code = 0
  if (KEEP) {
    if (!result.ok) {
      console.error(`FAILED, nothing committed (HTTP ${result.status}): ${result.text.slice(0, 1500)}`)
      return 1
    }
    console.log('COMMITTED: the tables were created again under the new default')
  } else {
    // The RAISED verdict only, by its exact shape. The error text can echo the
    // proof's own source, whose header names both words, so a looser match
    // once read a comment as a pass.
    let message = result.text
    try {
      message = JSON.parse(result.text).message ?? result.text
    } catch (error) {
      console.log(`(the API answer was not JSON: ${error.message})`)
    }
    const verdict = message.match(/PROOF (PASSED|FAILED) \((\d+) failure\(s\), rolled back\):(.*?)(?:\nCONTEXT:|$)/s)
    if (!verdict) {
      console.error(`FAILED before the proof gave a verdict (HTTP ${result.status}): ${message.slice(0, 1500)}`)
      return 1
    }
    console.log(`PROOF ${verdict[1]}, ${verdict[2]} failure(s)`)
    for (const line of verdict[3].split(' | ').filter((l) => l.trim())) console.log(`  ${line.trim()}`)
    code = verdict[1] === 'PASSED' && verdict[2] === '0' ? 0 : 1
  }

  // Observed, not trusted: the default privileges are what they were, and each
  // table carries exactly the grants the migration wrote.
  const after = await run(DEFAULT_ACL, true)
  const aclAfter = after.ok ? JSON.parse(after.text)[0].acl : null
  if (aclAfter !== aclBefore) {
    console.error(`DEFAULT PRIVILEGES CHANGED: before ${aclBefore}, after ${aclAfter}`)
    code = 1
  } else {
    console.log('READ BACK default privileges unchanged')
  }
  if (tables.length) {
    const acls = await run(
      `select c.relname as t, c.relacl::text as acl from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname in (${tables.map((t) => `'${t}'`).join(', ')}) order by 1`,
      true,
    )
    for (const r of acls.ok ? JSON.parse(acls.text) : []) console.log(`READ BACK ${r.t} ${r.acl}`)
  }
  return code
}

// process.exitCode rather than process.exit after network work: exiting while a
// fetch socket is still closing aborts Node on Windows (nodejs/node#56645).
main().then(
  (code) => {
    process.exitCode = code
  },
  (error) => {
    console.error(`FAILED: ${error.message}`)
    process.exitCode = 1
  },
)
