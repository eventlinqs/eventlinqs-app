/**
 * READ-ONLY: every RLS policy that reads ANOTHER TABLE inside its own expression.
 *
 * WHY THE MAP HAS TO BE WIDER THAN THE ONE TABLE THAT BROKE. Applying
 * 20260808000010 took every event page to 404 because 29 tables carry policies
 * whose USING clause subqueries `organisations`, and revoking anon's table-level
 * SELECT on organisations made evaluating those policies illegal. The review that
 * shipped it checked the queries the APPLICATION issues. It never checked the
 * queries the DATABASE issues on the application's behalf, and that is the entire
 * blind spot.
 *
 * Fixing only the organisations case would leave the same blind spot for the next
 * table somebody locks down. So this enumerates EVERY cross-table policy
 * dependency in `public`, grouped by the table being read, and reports which of
 * those reader tables are reachable by anon. That set is the true blast radius of
 * any future column lockdown, and it is a fact about the database rather than a
 * judgement about it.
 *
 * IT ALSO CLASSIFIES THE AUTHORISATION SEMANTICS, because the refactor must not
 * change them. A policy that admits only the OWNER and a policy that admits
 * owner/admin/manager MEMBERS look similar and are not: replacing one with the
 * other would widen access while appearing to fix a privilege bug. Each policy is
 * tagged owner-only, member, both or other, so the rewrite can be checked
 * per-policy instead of assumed uniform.
 *
 * Read-only, enforced server-side with default_transaction_read_only=on.
 * USAGE: node --env-file=.env.test scripts/probe/policy-cross-table-map.mjs
 *
 * The target comes from the PROCESS environment via the preflight, so it must be
 * loaded with node's own --env-file. The preflight refuses production.
 */
import { readFileSync, existsSync, writeFileSync } from 'node:fs'
import pg from 'pg'
import { assertNotProductionDatabase } from '../lib/production-write-preflight.mjs'

const argv = process.argv.slice(2)
const arg = (n, d = null) => { const i = argv.indexOf(n); return i === -1 ? d : argv[i + 1] }
const ENV_FILE = arg('--env', '.env.test')
const OUT = arg('--out', null)
if (!existsSync(ENV_FILE)) { console.error(`env file not found: ${ENV_FILE}`); process.exit(2) }

const env = {}
for (const line of readFileSync(ENV_FILE, 'utf8').split(/\r?\n/)) {
  const t = line.trim()
  if (!t || t.startsWith('#') || !t.includes('=')) continue
  const i = t.indexOf('=')
  const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, '')
  env[t.slice(0, i).trim()] = v.startsWith('#') ? '' : v
}
const ref = (env.NEXT_PUBLIC_SUPABASE_URL || '').match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1] || ''
const target = assertNotProductionDatabase()
// The preflight resolves and REFUSES production; the read-only option is kept on
// top so the session cannot write even against TEST.
const client = new pg.Client({
  ...target.clientConfig,
  options: '-c default_transaction_read_only=on',
  connectionTimeoutMillis: 15000,
})

const hr = t => console.log(`\n${'='.repeat(78)}\n${t}\n${'='.repeat(78)}`)
const scanned = []

await client.connect()
try {
  await client.query('BEGIN READ ONLY')
  hr(`CROSS-TABLE POLICY MAP  |  project ${ref}`)

  const tables = (await client.query(
    `select c.relname as t, has_table_privilege('anon', c.oid, 'SELECT') as anon
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname='public' and c.relkind='r' order by c.relname`,
  )).rows
  const tableNames = tables.map(t => t.t)
  const anonReadable = new Set(tables.filter(t => t.anon).map(t => t.t))
  scanned.push(`${tableNames.length} base tables in public enumerated with anon table-level SELECT`)

  const policies = (await client.query(
    `select tablename, policyname, cmd, roles::text as roles, permissive,
            coalesce(qual,'') as qual, coalesce(with_check,'') as wc
       from pg_policies where schemaname='public'
      order by tablename, policyname`,
  )).rows
  scanned.push(`${policies.length} policies read from pg_policies`)

  /** Which OTHER tables does this policy expression read? */
  function referenced(expr, self) {
    const hits = new Set()
    for (const name of tableNames) {
      if (name === self) continue
      // Match a schema-qualified or bare reference as a whole word. pg_policies
      // renders expressions with the schema stripped inside subqueries, so both
      // shapes appear.
      const re = new RegExp(`(^|[^a-z0-9_.])(public\\.)?${name}([^a-z0-9_]|$)`, 'i')
      if (re.test(expr)) hits.add(name)
    }
    return [...hits]
  }

  /** Preserve-the-semantics tag. The refactor must not widen access. */
  function semantics(expr) {
    const owner = /owner_id\s*=\s*auth\.uid\(\)/.test(expr)
    const member = /organisation_members/.test(expr)
    if (owner && member) return 'owner+member'
    if (owner) return 'owner-only'
    if (member) return 'member'
    if (/auth\.role\(\)\s*=\s*'service_role'/.test(expr)) return 'service-role'
    if (/auth\.uid\(\)/.test(expr)) return 'self'
    if (/^\s*true\s*$/.test(expr)) return 'public'
    return 'other'
  }

  const byReadTable = new Map()
  const rows = []
  for (const p of policies) {
    const expr = `${p.qual} ${p.wc}`
    const refs = referenced(expr, p.tablename)
    if (refs.length === 0) continue
    rows.push({ ...p, expr, refs, sem: semantics(expr) })
    for (const r of refs) {
      if (!byReadTable.has(r)) byReadTable.set(r, new Set())
      byReadTable.get(r).add(p.tablename)
    }
  }

  hr('1. BLAST RADIUS: if you revoke anon table SELECT on X, which readers break?')
  const sorted = [...byReadTable.entries()].sort((a, b) => b[1].size - a[1].size)
  console.log(`  ${'table read INSIDE a policy'.padEnd(28)} ${'readers'.padStart(7)}  ${'anon-readable readers'.padStart(21)}`)
  console.log(`  ${'-'.repeat(28)} ${'-'.repeat(7)}  ${'-'.repeat(21)}`)
  for (const [readTable, readers] of sorted) {
    const exposed = [...readers].filter(r => anonReadable.has(r))
    console.log(`  ${readTable.padEnd(28)} ${String(readers.size).padStart(7)}  ${String(exposed.length).padStart(21)}`)
  }
  console.log('\n  "readers" = tables whose own policy expression reads that table, so revoking')
  console.log('  anon SELECT on it makes SELECT on every one of those readers fail with 42501.')

  hr('2. THE organisations DEPENDENCY, policy by policy, with its semantics')
  const orgReaders = rows.filter(r => r.refs.includes('organisations'))
  console.log(`  ${orgReaders.length} policies across ${new Set(orgReaders.map(r => r.tablename)).size} tables\n`)
  const bySem = new Map()
  for (const r of orgReaders) bySem.set(r.sem, (bySem.get(r.sem) ?? 0) + 1)
  console.log(`  semantics tally: ${[...bySem].map(([k, v]) => `${k}=${v}`).join('  ')}`)
  console.log('')
  for (const r of orgReaders) {
    console.log(`  ${r.tablename}.${r.policyname}`)
    console.log(`      cmd=${r.cmd} roles=${r.roles} permissive=${r.permissive} semantics=${r.sem}`)
    console.log(`      reads: ${r.refs.join(', ')}`)
  }

  hr('3. EVERY OTHER CROSS-TABLE DEPENDENCY (the ones nobody has looked at)')
  const others = rows.filter(r => !r.refs.includes('organisations'))
  console.log(`  ${others.length} policies read another table but NOT organisations\n`)
  for (const r of others) {
    console.log(`  ${r.tablename}.${r.policyname}  [${r.cmd}] ${r.sem}  reads: ${r.refs.join(', ')}`)
  }

  if (OUT) {
    writeFileSync(OUT, JSON.stringify({ ref, rows, blastRadius: sorted.map(([t, s]) => ({ table: t, readers: [...s] })) }, null, 2))
    console.log(`\n  full map written to ${OUT}`)
  }

  await client.query('ROLLBACK')
} finally { await client.end() }

hr('WHAT THIS PROBE SCANNED')
scanned.forEach((s, i) => console.log(`  ${i + 1}. ${s}`))
console.log('\n  writes attempted: 0 (default_transaction_read_only=on; BEGIN READ ONLY; ROLLBACK)')
