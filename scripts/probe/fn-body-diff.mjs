/**
 * READ-ONLY: dump a function body and the applied-migration list from two
 * databases and diff them.
 *
 * WHY. The refund/privilege probe reported reconcile_refund at 4598 chars on
 * TEST and 4716 on production. Both carried every marker the probe tests for, so
 * both are "the fixed version" by that test, and a 118-character difference in a
 * function that moves money is not something to accept on a marker match. This
 * prints the actual difference.
 *
 * Read-only is enforced server-side (default_transaction_read_only=on) exactly as
 * in refund-and-privilege-probe.mjs. Prints no key material.
 *
 * USAGE: node scripts/probe/fn-body-diff.mjs --a test --b prod --fn reconcile_refund
 */
import { writeFileSync } from 'node:fs'
import { openProject } from '../lib/production-write-preflight.mjs'

const argv = process.argv.slice(2)
const arg = (n, d = null) => { const i = argv.indexOf(n); return i === -1 ? d : argv[i + 1] }

const A = arg('--a'), B = arg('--b'), FN = arg('--fn', 'reconcile_refund')
const OUT = arg('--out', null)
if (!A || !B) { console.error('usage: --a <project> --b <project> [--fn name] [--out dir]'); process.exit(2) }

/*
 * CONNECTIONS come from the shared helper (scripts/lib/db-credentials.mjs).
 * This file used to carry its own env-file reader, its own connection parser
 * and a hardcoded pooler host. --a and --b now name PROJECTS ("prod", "test",
 * or a bare project ref), not env files, so no connection string is assembled
 * anywhere and a percent-encoded password can no longer fail as a bare 28P01.
 */
async function pull(project) {
  const { client: c, ref } = await openProject(project, { readOnly: true })
  try {
    await c.query('BEGIN READ ONLY')
    const def = (await c.query(
      `select pg_get_functiondef(p.oid) as def from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
        where n.nspname='public' and p.proname=$1`, [FN])).rows[0]?.def ?? ''
    const migs = (await c.query(
      `select version from supabase_migrations.schema_migrations order by version`)).rows.map(r => r.version)
    await c.query('ROLLBACK')
    return { ref, def, migs }
  } finally { await c.end() }
}

const a = await pull(A), b = await pull(B)

console.log(`A = ${a.ref}  (${a.migs.length} migrations)`)
console.log(`B = ${b.ref}  (${b.migs.length} migrations)`)

const setA = new Set(a.migs), setB = new Set(b.migs)
console.log(`\nApplied in B but NOT in A: ${b.migs.filter(v => !setA.has(v)).join(', ') || 'none'}`)
console.log(`Applied in A but NOT in B: ${a.migs.filter(v => !setB.has(v)).join(', ') || 'none'}`)

console.log(`\n=== ${FN}: line-by-line difference ===`)
// Line endings are normalised before comparing. One of these bodies was stored
// with CRLF and the other with LF, which made EVERY line differ and hid whether
// there was any real difference at all. The character counts are reported raw so
// the ending difference is still visible rather than silently absorbed.
const la = a.def.replace(/\r/g, '').split('\n'), lb = b.def.replace(/\r/g, '').split('\n')
console.log(`A lines ${la.length} (${a.def.length} chars raw, ${a.def.replace(/\r/g, '').length} normalised)`)
console.log(`B lines ${lb.length} (${b.def.length} chars raw, ${b.def.replace(/\r/g, '').length} normalised)`)

// Plain longest-common-subsequence diff. Small inputs, so the quadratic table is fine.
const m = la.length, n = lb.length
const dp = Array.from({ length: m + 1 }, () => new Uint16Array(n + 1))
for (let i = m - 1; i >= 0; i--) for (let j = n - 1; j >= 0; j--)
  dp[i][j] = la[i] === lb[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
let i = 0, j = 0, diffs = 0
while (i < m && j < n) {
  if (la[i] === lb[j]) { i++; j++ }
  else if (dp[i + 1][j] >= dp[i][j + 1]) { console.log(`  A only | ${la[i]}`); i++; diffs++ }
  else { console.log(`  B only | ${lb[j]}`); j++; diffs++ }
}
while (i < m) { console.log(`  A only | ${la[i++]}`); diffs++ }
while (j < n) { console.log(`  B only | ${lb[j++]}`); diffs++ }
if (diffs === 0) console.log('  IDENTICAL')
console.log(`\n${diffs} differing line(s)`)

if (OUT) {
  writeFileSync(`${OUT}/${FN}.${a.ref}.sql`, a.def)
  writeFileSync(`${OUT}/${FN}.${b.ref}.sql`, b.def)
  console.log(`\nbodies written to ${OUT}`)
}
