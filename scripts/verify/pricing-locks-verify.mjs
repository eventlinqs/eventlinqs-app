/**
 * Verifies the two pricing migrations landed, and PROVES the one-open-row
 * constraint rejects a bad insert.
 *
 *   node scripts/verify/pricing-locks-verify.mjs test
 *   node scripts/verify/pricing-locks-verify.mjs prod
 *
 * Reads through the PostgREST service-role API, so it needs no psql and no
 * database password beyond what is already in .env.test / .env.local.
 *
 * PRODUCTION IS READ ONLY here. The rejection probe (a deliberate bad INSERT)
 * runs ONLY against TEST, and is self-cleaning: the insert is expected to be
 * rejected by the unique index, and on the failure path where it is NOT
 * rejected the row is deleted immediately and the run reports FAILED.
 */
import fs from 'node:fs'

const target = (process.argv[2] ?? '').toLowerCase()
if (!['test', 'prod'].includes(target)) {
  console.error('usage: node scripts/verify/pricing-locks-verify.mjs <test|prod>')
  process.exit(2)
}
const file = target === 'prod' ? '.env.local' : '.env.test'

const env = Object.fromEntries(
  fs.readFileSync(file, 'utf8').split('\n')
    .filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] }))

const url = env.NEXT_PUBLIC_SUPABASE_URL
const key = env.SUPABASE_SERVICE_ROLE_KEY
const ref = (url.match(/https:\/\/([a-z0-9]+)\./) ?? [])[1] ?? '?'
const PROD_REF = 'gndnldyfudbytbboxesk'
if (target === 'prod' && ref !== PROD_REF) throw new Error(`expected PRODUCTION ref, got ${ref}`)
if (target === 'test' && ref === PROD_REF) throw new Error('SAFETY STOP: .env.test points at PRODUCTION')

const H = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }
const api = (path, init) => fetch(`${url}/rest/v1/${path}`, { headers: H, ...init })

console.log(`\nVERIFYING ${target.toUpperCase()}  (project ${ref})\n${'='.repeat(62)}`)
const results = []
const check = (name, ok, detail) => { results.push({ name, ok }); console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  ${detail}` : ''}`) }

// ── 1. One open row per AU rule, at the locked values ────────────────────────
const LOCKED = {
  platform_fee_percentage: 3.5,
  platform_fee_fixed: 99,
  processing_fee_percentage: 2.5,
  processing_fee_fixed_cents: 0,
  processing_fee_pass_through: 1,
}
const now = new Date().toISOString()
for (const [rule, want] of Object.entries(LOCKED)) {
  const q = new URLSearchParams({
    select: 'version,value_percentage,value_cents,value_integer',
    rule_type: `eq.${rule}`, country_code: 'eq.AU', currency: 'eq.AUD',
    event_id: 'is.null', organisation_id: 'is.null',
    effective_from: `lte.${now}`, or: `(effective_until.is.null,effective_until.gt.${now})`,
    order: 'version.desc',
  })
  const rows = await (await api(`pricing_rules?${q}`)).json()
  const got = rows.length ? Number(rows[0].value_percentage ?? rows[0].value_cents ?? rows[0].value_integer) : null
  check(`${rule} = ${want}`, got === want, `got ${got ?? '(none)'}`)
  check(`${rule} has exactly ONE open row`, rows.length === 1, `${rows.length} open`)
}

// ── 2. The founding window column exists ─────────────────────────────────────
const orgProbe = await api('organisations?select=id,founding_fee_free_until&limit=1')
check('organisations.founding_fee_free_until exists', orgProbe.ok,
  orgProbe.ok ? '' : `HTTP ${orgProbe.status} (migration 20260727000002 not applied)`)

// ── 3. How many organisations hold the waiver ────────────────────────────────
if (orgProbe.ok) {
  const held = await api('organisations?select=id&founding_fee_free_until=not.is.null')
  const n = (await held.json()).length
  console.log(`  INFO  organisations holding the waiver: ${n} of 50`)
}

// ── 4. THE REJECTION PROOF (TEST only, self-cleaning) ────────────────────────
if (target === 'test') {
  console.log(`\n  CONSTRAINT REJECTION PROBE (TEST only)`)
  const probe = {
    rule_type: 'platform_fee_percentage', country_code: 'AU', currency: 'AUD',
    event_type: 'ALL', organiser_tier: 'ALL', organisation_id: null, event_id: null,
    value_type: 'percentage', value_percentage: 9.9, version: 999,
    effective_from: new Date().toISOString(), effective_until: null,
  }
  const res = await api('pricing_rules', {
    method: 'POST', body: JSON.stringify(probe),
    headers: { ...H, Prefer: 'return=representation' },
  })
  if (res.status === 409 || res.status === 400) {
    const body = await res.text()
    const isUnique = /uq_pricing_rules_one_open_per_scope|duplicate key/i.test(body)
    check('a SECOND open row for the same scope is REJECTED', isUnique,
      isUnique ? `HTTP ${res.status}, unique index fired` : `HTTP ${res.status} but not the unique index: ${body.slice(0, 120)}`)
  } else if (res.ok) {
    const [row] = await res.json()
    await api(`pricing_rules?id=eq.${row.id}`, { method: 'DELETE' })
    check('a SECOND open row for the same scope is REJECTED', false,
      'the insert was ACCEPTED, so the index is missing. Probe row deleted again')
  } else {
    check('a SECOND open row for the same scope is REJECTED', false, `unexpected HTTP ${res.status}`)
  }
}

const failed = results.filter(r => !r.ok)
console.log(`\n${'='.repeat(62)}`)
if (failed.length === 0) {
  console.log(`ALL CHECKS PASSED on ${target.toUpperCase()}.\n`)
  process.exit(0)
}
console.log(`${failed.length} CHECK(S) FAILED on ${target.toUpperCase()}:`)
for (const f of failed) console.log(`  - ${f.name}`)
console.log('')
process.exit(1)
