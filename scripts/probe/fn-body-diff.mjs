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
 * USAGE: node scripts/probe/fn-body-diff.mjs --a .env.test --b <prod env> --fn reconcile_refund
 */
import { readFileSync, existsSync, writeFileSync } from 'node:fs'
import pg from 'pg'

const argv = process.argv.slice(2)
const arg = (n, d = null) => { const i = argv.indexOf(n); return i === -1 ? d : argv[i + 1] }

const A = arg('--a'), B = arg('--b'), FN = arg('--fn', 'reconcile_refund')
const OUT = arg('--out', null)
if (!A || !B) { console.error('usage: --a <env> --b <env> [--fn name] [--out dir]'); process.exit(2) }

function readEnv(file) {
  if (!existsSync(file)) { console.error(`env file not found: ${file}`); process.exit(2) }
  const env = {}
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const t = line.trim()
    if (!t || t.startsWith('#') || !t.includes('=')) continue
    const i = t.indexOf('=')
    const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, '')
    env[t.slice(0, i).trim()] = v.startsWith('#') ? '' : v
  }
  return env
}

function target(env) {
  const ref = (env.NEXT_PUBLIC_SUPABASE_URL || '').match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1] || ''
  if (env.SUPABASE_DB_URL) {
    const s = env.SUPABASE_DB_URL.trim()
    const at = s.lastIndexOf('@'), schemeEnd = s.indexOf('://')
    const creds = s.slice(schemeEnd + 3, at), sep = creds.indexOf(':')
    const tail = s.slice(at + 1), cut = tail.search(/[/?]/)
    const hp = cut === -1 ? tail : tail.slice(0, cut), colon = hp.indexOf(':')
    const user = sep === -1 ? creds : creds.slice(0, sep)
    return {
      cfg: { user, password: creds.slice(sep + 1), host: colon === -1 ? hp : hp.slice(0, colon), port: Number(colon === -1 ? 5432 : hp.slice(colon + 1)), database: 'postgres', ssl: { rejectUnauthorized: false }, options: '-c default_transaction_read_only=on', connectionTimeoutMillis: 15000 },
      ref: user.match(/^postgres\.([a-z0-9]+)$/i)?.[1] || ref,
    }
  }
  return {
    cfg: { user: `postgres.${ref}`, password: env.SUPABASE_DB_PASSWORD_SYDNEY, host: 'aws-1-ap-southeast-2.pooler.supabase.com', port: 5432, database: 'postgres', ssl: { rejectUnauthorized: false }, options: '-c default_transaction_read_only=on', connectionTimeoutMillis: 15000 },
    ref,
  }
}

async function pull(envFile) {
  const t = target(readEnv(envFile))
  const c = new pg.Client(t.cfg)
  await c.connect()
  try {
    await c.query('BEGIN READ ONLY')
    const def = (await c.query(
      `select pg_get_functiondef(p.oid) as def from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
        where n.nspname='public' and p.proname=$1`, [FN])).rows[0]?.def ?? ''
    const migs = (await c.query(
      `select version from supabase_migrations.schema_migrations order by version`)).rows.map(r => r.version)
    await c.query('ROLLBACK')
    return { ref: t.ref, def, migs }
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
