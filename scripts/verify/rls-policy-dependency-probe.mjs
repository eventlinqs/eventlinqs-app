/**
 * WHY EVERY EVENT PAGE 404d: the RLS policies that read `organisations`.
 *
 * THE OBSERVATION THAT PRODUCED THIS SCRIPT. With 20260808000010's statements
 * applied on TEST, `SELECT id, name, price FROM public.ticket_tiers` as role anon
 * failed with "permission denied for TABLE organisations". The query does not
 * mention organisations. Neither does the venues query that failed the same way.
 *
 * THE MECHANISM, which this script proves rather than asserts. A row security
 * policy is an expression evaluated with the CALLER's privileges. Several tables
 * carry policies whose USING clause contains a subquery over `public.organisations`
 * (the ownership and membership checks). When `anon` held table-level SELECT on
 * organisations those subqueries were legal. The moment the migration revoked it
 * and granted six columns instead, every SELECT on any table carrying such a
 * policy began to fail, because evaluating the policy needs a privilege the role
 * no longer has.
 *
 * That is the 404. It is not the sale gate (that failure renders a designed
 * "finishing their payment setup" message, per scripts/guards/migration-needs-sale-gate-fix.mjs)
 * and it is not a missing column in the grant list. It is second-order: the
 * migration was reviewed against the queries the APPLICATION writes, and the
 * queries the DATABASE writes on its behalf were not in scope.
 *
 * A column GRANT cannot fix it, and this is the important part: a policy subquery
 * shaped `SELECT 1 FROM organisations WHERE ...` or one referencing a column not on
 * the public list needs privileges the lockdown deliberately withholds. So the
 * remedy is to stop the policy needing them, not to widen the grant.
 *
 * WHAT IT REPORTS:
 *   1. every policy in `public` whose expression references organisations
 *   2. which tables therefore become unreadable by anon under the lockdown
 *   3. an A/B test on the real database: the same query as anon, with and without
 *      the revoke, inside one rolled-back transaction
 *
 * TEST ONLY: it executes REVOKE/GRANT, so it preflights and it rolls back.
 * USAGE: node --env-file=.env.test scripts/verify/rls-policy-dependency-probe.mjs
 */
import { assertNotProductionDatabase } from '../lib/production-write-preflight.mjs'
import pg from 'pg'

const target = assertNotProductionDatabase()
const client = new pg.Client(target.clientConfig)
const hr = t => console.log(`\n${'='.repeat(74)}\n${t}\n${'='.repeat(74)}`)
const scanned = []

async function asAnon(sql) {
  try {
    await client.query('SAVEPOINT p')
    await client.query('SET LOCAL ROLE anon')
    const r = await client.query(sql)
    await client.query('RESET ROLE')
    await client.query('RELEASE SAVEPOINT p')
    return { ok: true, rows: r.rowCount }
  } catch (err) {
    await client.query('ROLLBACK TO SAVEPOINT p').catch(() => {})
    await client.query('RESET ROLE').catch(() => {})
    return { ok: false, code: err.code, message: err.message.split('\n')[0] }
  }
}

await client.connect()
try {
  await client.query('BEGIN')
  hr(`TARGET ${target.ref} (TEST). One transaction, rolled back at the end.`)

  // ---- 1. Which policies read organisations? -------------------------------
  hr('1. POLICIES IN public WHOSE EXPRESSION READS public.organisations')
  scanned.push('pg_policies across public, matched on an organisations reference in USING or WITH CHECK')
  const pols = (await client.query(
    `select tablename, policyname, cmd, roles::text as roles,
            coalesce(qual,'') || ' ' || coalesce(with_check,'') as expr
       from pg_policies
      where schemaname = 'public'
        and (coalesce(qual,'') || ' ' || coalesce(with_check,'')) ~ 'organisations'
      order by tablename, policyname`,
  )).rows
  const affected = [...new Set(pols.map(p => p.tablename))]
  console.log(`  ${pols.length} policy(ies) across ${affected.length} table(s) read organisations inside their expression:\n`)
  for (const p of pols) {
    const reachesAnon = /public|anon/.test(p.roles)
    console.log(`  ${p.tablename}.${p.policyname}  [${p.cmd}] to ${p.roles}${reachesAnon ? '   <-- reachable by anon' : ''}`)
  }
  console.log(`\n  tables affected: ${affected.join(', ')}`)

  // ---- 2. A/B on the real database ----------------------------------------
  hr('2. A/B TEST as role anon: the same queries BEFORE and AFTER the revoke')
  scanned.push('one query per affected table, run as anon before and after the revoke')

  // One representative query per affected table, plus the two that failed.
  const PROBES = affected.map(t => ({ t, sql: `SELECT id FROM public.${t} LIMIT 1` }))

  const before = {}
  for (const p of PROBES) before[p.t] = await asAnon(p.sql)

  await client.query('REVOKE SELECT ON public.organisations FROM anon')
  await client.query('REVOKE SELECT ON public.organisations FROM authenticated')
  await client.query('GRANT SELECT (id, name, slug, description, logo_url, website) ON public.organisations TO anon')
  await client.query('GRANT SELECT (id, name, slug, description, logo_url, website) ON public.organisations TO authenticated')
  console.log('  (organisations table-level SELECT revoked; the 6 public columns granted)\n')

  const after = {}
  for (const p of PROBES) after[p.t] = await asAnon(p.sql)

  let broke = 0
  console.log(`  ${'table'.padEnd(26)} ${'before'.padEnd(10)} after`)
  console.log(`  ${'-'.repeat(26)} ${'-'.repeat(10)} ${'-'.repeat(40)}`)
  for (const p of PROBES) {
    const b = before[p.t].ok ? 'ok' : `ERR ${before[p.t].code}`
    const a = after[p.t].ok ? 'ok' : `ERR ${after[p.t].code}: ${after[p.t].message.slice(0, 44)}`
    if (before[p.t].ok && !after[p.t].ok) broke += 1
    console.log(`  ${p.t.padEnd(26)} ${b.padEnd(10)} ${a}`)
  }

  console.log(`\n  ${broke} table(s) READABLE BEFORE became UNREADABLE AFTER, from the revoke alone.`)
  console.log('  Each one is a public surface that would 404 or render empty. This is the')
  console.log('  second-order failure the migration review did not cover: the application')
  console.log('  queries were checked, the queries the POLICIES make were not.')

  // ---- 3. Is a wider column grant enough? ---------------------------------
  hr('3. WOULD GRANTING MORE COLUMNS FIX IT? (testing the tempting shortcut)')
  scanned.push('a wider column grant, to test whether widening the grant is a sufficient remedy')
  await client.query('GRANT SELECT (id, name, slug, description, logo_url, website, owner_id, status) ON public.organisations TO anon')
  const withOwner = {}
  for (const p of PROBES) withOwner[p.t] = await asAnon(p.sql)
  const stillBroken = PROBES.filter(p => before[p.t].ok && !withOwner[p.t].ok)
  console.log(`  after also granting owner_id and status: ${stillBroken.length} table(s) still unreadable`)
  for (const p of stillBroken) {
    console.log(`      ${p.t}: ${withOwner[p.t].code} ${withOwner[p.t].message.slice(0, 60)}`)
  }
  if (stillBroken.length === 0) {
    console.log('  => widening the grant DOES restore these reads, but it re-publishes owner_id,')
    console.log('     which is one of the columns the migration set out to hide. It trades the')
    console.log('     exposure for the outage rather than fixing either.')
  } else {
    console.log('  => widening the grant is NOT sufficient. A policy subquery that references no')
    console.log('     column at all (SELECT 1 FROM organisations / EXISTS) needs TABLE-level')
    console.log('     SELECT, which no column grant can supply. The policies must stop needing')
    console.log('     the privilege: wrap the ownership check in a SECURITY DEFINER function.')
  }

  await client.query('ROLLBACK')
  hr('ROLLED BACK: nothing persisted to TEST')
} finally {
  await client.end()
}

hr('WHAT THIS PROBE SCANNED')
scanned.forEach((s, i) => console.log(`  ${i + 1}. ${s}`))
