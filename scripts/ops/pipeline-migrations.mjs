/**
 * MIGRATIONS BY THE PIPELINE, NOT BY LAWAL (car M; Lawal's word of 19 November 2026, relayed by the PM at 04:42: "I'm not
 * doing all of this now ... get tired of all this migration. Get it all done internally"; his directive of that morning,
 * AUTONOMOUS-OPS-DIRECTIVE-LOCKED-19NOV.md section 1: "database migrations, with backups, validation and rollback
 * safeguards"). The planning and proving half of the 'migrate production' job in .github/workflows/ci.yml; the CLI applies.
 *
 * WHEN: as soon as a gated pull request is ready, BEFORE its merge, and again on every push to main as the safety net.
 * Not only after the merge: production parity (a required check) and the production build's own guards refuse a tree
 * whose migrations production lacks (two merges failed to deploy for exactly that on 6 September 2026), so a migration
 * applied only after the merge would lose the race with Vercel's production build of the same commit.
 *
 *   node scripts/ops/pipeline-migrations.mjs plan     what production has not applied, each one classified; writes
 *                                                     destructive= and tables= to $GITHUB_OUTPUT; exits 1 when a
 *                                                     migration would delete a record law 19 (d) preserves
 *   node scripts/ops/pipeline-migrations.mjs verify   production's ledger read back: exits 1 unless nothing is pending
 *
 * THE SAFETY, read from each migration's own SQL (classify below, pure, driven by tests/unit/ops/pipeline-migrations.test.ts):
 *   - DESTRUCTIVE: a drop, a rename, a delete or a truncate. The workflow then backs up every table it names before the
 *     production run, and runs it on production only after the test database took it.
 *   - REFUSED: a delete, truncate or table drop on the records law 19 (d) preserves (orders, tickets, payments, payouts,
 *     refunds and disputes, the money ledger, the events themselves, and the listing checks that verify them). Such a
 *     migration is never applied by the pipeline; it fails closed and says why.
 * The ledger is read through the Management API, as production parity reads it (production-parity.mjs).
 */
import { appendFileSync, copyFileSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { computePendingMigrations, fetchAppliedMigrations, MIGRATIONS_DIR, PRODUCTION_PROJECT_REF } from './production-parity.mjs'
import { declareWork } from '../lib/work-report.mjs'

/** The records law 19 (d) preserves: never deleted, truncated or dropped by a migration. */
export const PRESERVED = /^(?:public\.)?"?(orders|order_items|tickets|ticket_[a-z_]+|payments|payment_[a-z_]+|payouts|payout_[a-z_]+|refunds|disputes|ledger_entries|events|listing_checks)"?$/i

const STRIP_COMMENTS = (sql) => sql.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '')

/**
 * What a migration's SQL does that cannot be undone by running it again, and which tables it touches so. Pure.
 * @param {string} sql
 */
export function classify(sql) {
  const text = STRIP_COMMENTS(sql)
  const touches = new Set()
  const kinds = new Set()
  const refused = []
  const name = String.raw`((?:[a-z_][a-z0-9_]*\.)?"?[a-z_][a-z0-9_]*"?)`
  const rules = [
    { kind: 'drop table', re: new RegExp(String.raw`\bdrop\s+table\s+(?:if\s+exists\s+)?` + name, 'gi'), money: true },
    { kind: 'truncate', re: new RegExp(String.raw`\btruncate\s+(?:table\s+)?` + name, 'gi'), money: true },
    { kind: 'delete', re: new RegExp(String.raw`\bdelete\s+from\s+(?:only\s+)?` + name, 'gi'), money: true },
    { kind: 'drop column', re: new RegExp(String.raw`\balter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?` + name + String.raw`\s+drop\s+column\b`, 'gi'), money: false },
    { kind: 'drop constraint', re: new RegExp(String.raw`\balter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?` + name + String.raw`\s+drop\s+constraint\b`, 'gi'), money: false },
    { kind: 'rename', re: new RegExp(String.raw`\balter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?` + name + String.raw`\s+rename\b`, 'gi'), money: false },
  ]
  for (const r of rules) {
    for (const m of text.matchAll(r.re)) {
      const table = m[1].replace(/"/g, '').toLowerCase()
      kinds.add(r.kind)
      touches.add(table.includes('.') ? table : `public.${table}`)
      if (r.money && PRESERVED.test(table)) refused.push(`${r.kind} on ${table}: law 19 (d) preserves these records; the pipeline never applies it`)
    }
  }
  if (/\bdrop\s+(?:schema|type|function|view|materialized\s+view|trigger|policy|index)\b/i.test(text)) kinds.add('drop object')
  const losesData = [...kinds].some((k) => LOSES_DATA.has(k))
  return { destructive: kinds.size > 0, losesData, kinds: [...kinds].sort(), touches: [...touches].sort(), refused }
}

/**
 * The kinds that take away what live code may still read (rows, columns, a table, a name). Law 14 (gg): such a migration
 * reaches production only once the code that copes with it is live, so it never rides in one pull request with code:
 * the code lands first, the migration after it, alone (expand, then contract). A rewritten constraint or a replaced
 * function is not one of these: the code beside it is the code it was written for.
 */
export const LOSES_DATA = new Set(['delete', 'truncate', 'drop table', 'drop column', 'rename'])

/** Why a pull request may not apply its migrations before its merge, or null when it may. Pure. */
export function splitRefusal(plan, changesCode) {
  if (!changesCode) return null
  const losing = plan.each.filter((e) => e.losesData).map((e) => `${e.file} (${e.kinds.filter((k) => LOSES_DATA.has(k)).join(', ')})`)
  return losing.length === 0
    ? null
    : `a migration that removes what live code may read rides alone, after the code that copes is live (law 14 (gg)): ${losing.join('; ')}; this pull request also changes code, so split it`
}

/**
 * THE BACKUP, KEPT INSIDE THE DATABASE (car M, 19 November 2026). `supabase db dump` dumps whole schemas only (no table
 * flag: `supabase db dump --help`, CLI 3.0.0, read 19 November), and this repository is public, so a run's artifact is no
 * place for people's rows. Each table a destructive migration names is copied, before production, into the schema
 * migration_backups, which the Data API never exposes (it serves public only) and no client role may read. A table the
 * migration itself creates is skipped (to_regclass). The SQL is pure, so its test reads it.
 * @param {string[]} tables  schema-qualified names
 * @param {string} stamp     the run's own mark (the commit and the time)
 */
export function backupSql(tables, stamp) {
  const safe = stamp.replace(/[^a-z0-9_]/gi, '_').slice(0, 30)
  const lines = [
    'create schema if not exists migration_backups;',
    'revoke all on schema migration_backups from public, anon, authenticated;',
  ]
  for (const t of tables) {
    const [schema, table] = t.split('.')
    if (!/^[a-z_][a-z0-9_]*$/.test(schema ?? '') || !/^[a-z_][a-z0-9_]*$/.test(table ?? '')) throw new Error(`not a table name: ${t}`)
    const copy = `${schema}__${table}__${safe}`.slice(0, 63)
    lines.push(
      `do $b$ begin if to_regclass('${schema}.${table}') is not null then execute 'create table migration_backups.${copy} as table ${schema}.${table}'; execute 'revoke all on migration_backups.${copy} from public, anon, authenticated'; end if; end $b$;`,
    )
  }
  return lines.join('\n')
}

/**
 * THE TEST DATABASE'S SCRATCH FOLDER (19 November 2026). TEST's history holds versions from branches never merged, and
 * `supabase db push` refuses any history it cannot find in the folder ('DbPushMissingLocalError: Remote migration versions
 * not found in local migrations directory', read in a dry run that day: ten versions, newest 20261118103501). So TEST is
 * pushed from a scratch folder holding the tree's migrations and an EMPTY placeholder for each version only TEST holds;
 * with --include-all the CLI applies exactly the tree migrations TEST lacks, in order, and touches nothing else (the same
 * dry run listed the four production already carries and car D's one). Pure: which files to copy, which to stub.
 * @param {string[]} treeFiles  the names in supabase/migrations
 * @param {Set<string>} testApplied  the versions TEST's history holds
 */
export function workdirPlan(treeFiles, testApplied) {
  const copy = treeFiles.filter((f) => /^\d+_.*\.sql$/.test(f)).sort()
  const local = new Set(copy.map((f) => f.split('_')[0]))
  const stubs = [...testApplied].filter((v) => !local.has(v)).sort()
  return { copy, stubs }
}

/** The plan for the pending migrations. Pure over the files' texts. */
export function planOf(pending, read) {
  const each = pending.map((m) => ({ file: m.file, ...classify(read(m.file)) }))
  return {
    pending: each.map((e) => e.file),
    destructive: each.some((e) => e.destructive),
    tables: [...new Set(each.flatMap((e) => e.touches))].sort(),
    refused: each.flatMap((e) => e.refused.map((r) => `${e.file}: ${r}`)),
    each,
  }
}

async function main() {
  const mode = process.argv[2]
  const token = process.env.SUPABASE_ACCESS_TOKEN
  const project = process.env.SUPABASE_PROJECT_ID || PRODUCTION_PROJECT_REF
  if (mode !== 'plan' && mode !== 'verify' && mode !== 'backup' && mode !== 'test-workdir') {
    console.error('usage: node scripts/ops/pipeline-migrations.mjs plan|backup|verify|test-workdir <dir>')
    return 2
  }
  if (!token) {
    console.error('[pipeline-migrations] FAIL: SUPABASE_ACCESS_TOKEN is not set, so production\'s ledger cannot be read; nothing is applied on a guess.')
    return 1
  }
  if (mode === 'test-workdir') {
    const dir = process.argv[3]
    if (!dir) {
      console.error('[pipeline-migrations] FAIL: test-workdir needs its folder')
      return 2
    }
    const testRef = process.env.TEST_REF || 'vkapkibzokmfaxqogypq'
    const test = await fetchAppliedMigrations(token, testRef)
    if (!test.ok) {
      console.error(`[pipeline-migrations] FAIL: the test database's history could not be read (${test.reason}); nothing is pushed.`)
      return 1
    }
    const plan = workdirPlan(readdirSync(MIGRATIONS_DIR), test.applied)
    rmSync(dir, { recursive: true, force: true })
    mkdirSync(join(dir, 'supabase', 'migrations'), { recursive: true })
    copyFileSync(join(MIGRATIONS_DIR, '..', 'config.toml'), join(dir, 'supabase', 'config.toml'))
    for (const f of plan.copy) copyFileSync(join(MIGRATIONS_DIR, f), join(dir, 'supabase', 'migrations', f))
    for (const v of plan.stubs) writeFileSync(join(dir, 'supabase', 'migrations', `${v}_applied_on_test_only.sql`), '-- applied on the test database from a branch never merged; kept so its history reads whole\n')
    declareWork('pipeline-migrations', {
      did: { 'migration file copied for the test database': plan.copy.length },
      found: { 'unmerged version on the test database': plan.stubs.length },
      exitOnZero: false,
    })
    console.log(`[pipeline-migrations] test workdir ${dir}: ${plan.copy.length} migrations, ${plan.stubs.length} placeholders (${plan.stubs.join(' ') || 'none'})`)
    return 0
  }
  const listed = await fetchAppliedMigrations(token, project)
  if (!listed.ok) {
    console.error(`[pipeline-migrations] FAIL: production's ledger could not be read (${listed.reason}).`)
    return 1
  }
  const files = readdirSync(MIGRATIONS_DIR)
  const pending = computePendingMigrations(files, listed.applied)
  // Steps declare their work (scripts/guards/steps-declare-work.mjs): a run that compared nothing exits 1. With nothing
  // pending, 'migration classified' is zero by right, and says so.
  declareWork('pipeline-migrations', {
    did: { 'migration file compared with production': files.filter((f) => f.endsWith('.sql')).length, 'migration classified': mode === 'verify' ? 0 : pending.length },
    found: { 'migration pending on production': pending.length },
    zeroIsFine: { 'migration classified': mode === 'verify' ? 'verify reads the ledger only' : 'nothing is pending on production' },
    exitOnZero: false,
  })
  if (mode === 'verify') {
    if (pending.length > 0) {
      console.error(`[pipeline-migrations] FAIL: ${pending.length} migration(s) still pending on ${project} after the run: ${pending.map((p) => p.file).join(', ')}`)
      return 1
    }
    console.log(`[pipeline-migrations] PASS: production ${project} carries every one of the ${files.filter((f) => f.endsWith('.sql')).length} migrations in the tree; 0 pending.`)
    return 0
  }
  const plan = planOf(pending, (f) => readFileSync(join(MIGRATIONS_DIR, f), 'utf8'))
  if (mode === 'backup') {
    if (!plan.destructive || plan.tables.length === 0) {
      console.log('[pipeline-migrations] no destructive migration pending, so nothing to back up.')
      return 0
    }
    const stamp = `${(process.env.GITHUB_SHA ?? 'local').slice(0, 8)}_${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '')}`
    const res = await fetch(`https://api.supabase.com/v1/projects/${project}/database/query`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: backupSql(plan.tables, stamp), read_only: false }),
    })
    if (!res.ok) {
      console.error(`[pipeline-migrations] FAIL: the backup was refused (HTTP ${res.status}: ${(await res.text()).slice(0, 300)}); production is not touched.`)
      return 1
    }
    console.log(`[pipeline-migrations] backed up before production, in migration_backups (mark ${stamp}): ${plan.tables.join(', ')}`)
    return 0
  }
  console.log(`[pipeline-migrations] ${plan.pending.length} pending on ${project}: ${plan.pending.join(', ') || 'none'}`)
  for (const e of plan.each) console.log(`[pipeline-migrations]   ${e.file}: ${e.destructive ? `DESTRUCTIVE (${e.kinds.join(', ')}; touches ${e.touches.join(', ')})` : 'adds only'}`)
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `pending=${plan.pending.length}\ndestructive=${plan.destructive}\ntables=${plan.tables.join(' ')}\n`)
  }
  if (plan.refused.length > 0) {
    for (const r of plan.refused) console.error(`[pipeline-migrations] REFUSED: ${r}`)
    return 1
  }
  // On a pull request the migrations go before the merge (production parity and the production build need them there);
  // PR_CHANGES_CODE says whether the pull request also changes src/ (the workflow reads it from git).
  const split = process.env.GITHUB_EVENT_NAME === 'pull_request' ? splitRefusal(plan, process.env.PR_CHANGES_CODE === 'true') : null
  if (split) {
    console.error(`[pipeline-migrations] REFUSED: ${split}`)
    return 1
  }
  return 0
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}` || process.argv[1]?.endsWith('pipeline-migrations.mjs')) {
  main().then((code) => { process.exitCode = code })
}
