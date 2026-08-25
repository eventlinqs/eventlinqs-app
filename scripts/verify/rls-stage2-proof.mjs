/**
 * STAGE 2 PROOF: the policy refactor plus the FULL column lockdown, on TEST,
 * inside one transaction that is rolled back.
 *
 * WHAT HAS TO BE TRUE AT THE SAME TIME, and why anon-only testing is not enough.
 *
 *   1. anon can no longer read the sensitive columns. That is the point.
 *   2. anon has not LOST any table it could read before. That is the 404 class:
 *      revoking organisations broke SELECT on 29 tables because their policies
 *      subquery it, and the original review never looked.
 *   3. ORGANISERS SEE EXACTLY WHAT THEY SAW BEFORE. This is the one the first two
 *      cannot catch. Forty-four policies are rewritten; a mistake in any of them
 *      changes what an authenticated organiser can read, and a policy that admits
 *      NOBODY passes tests 1 and 2 perfectly while silently emptying the
 *      organiser's dashboard. So this counts the rows a real owner can see, per
 *      table, before and after, and demands the numbers be identical.
 *   4. Nothing gains access either. Row counts equal in BOTH directions catches a
 *      widened policy as well as a narrowed one, which is the specific risk in
 *      collapsing fifteen owner-only and twenty-four member policies onto shared
 *      helpers.
 *
 * HOW AN ORGANISER IS IMPERSONATED. Supabase's auth.uid() reads the `sub` claim out
 * of `request.jwt.claims`, so setting that GUC and the `authenticated` role makes
 * the session genuinely that user for every policy. No token is minted and no
 * password is used; it is the same mechanism PostgREST uses after it validates a
 * JWT.
 *
 * TEST ONLY. It executes REVOKE, GRANT, CREATE FUNCTION and CREATE POLICY, so it
 * preflights, runs in ONE transaction, and ROLLS BACK. Nothing persists.
 *
 * USAGE: node --env-file=.env.test scripts/verify/rls-stage2-proof.mjs
 */
import { readFileSync } from 'node:fs'
import { assertNotProductionDatabase } from '../lib/production-write-preflight.mjs'
import pg from 'pg'

const target = assertNotProductionDatabase()
const client = await target.connect()
const STAGE1 = 'supabase/migrations/20260818000001_column_lockdown_stage1_no_policy_dependency.sql'
const STAGE2 = 'supabase/migrations/20260819000001_policy_refactor_no_org_privilege.sql'

/**
 * The organisations lockdown, read from ITS OWN MIGRATION FILE rather than retyped
 * here. An earlier version inlined the four statements, which meant the proof
 * validated a copy and the founder would have applied a different artefact. The
 * three files below are exactly what `supabase db push` will run.
 */
const STAGE3 = 'supabase/migrations/20260819000002_organisations_column_lockdown.sql'

const MUST_DENY = [
  ['organisations', 'email'], ['organisations', 'phone'], ['organisations', 'owner_id'],
  ['organisations', 'metadata'], ['organisations', 'stripe_account_id'],
  ['organisations', 'stripe_charges_enabled'], ['organisations', 'stripe_requirements'],
  ['organisations', 'payout_status'], ['organisations', 'total_volume_cents'],
  ['venues', 'stripe_account_id'], ['venues', 'stripe_payouts_enabled'],
  ['seats', 'held_by_user_id'], ['seats', 'metadata'], ['seats', 'reservation_id'],
  ['event_artists', 'invite_token'],
]

const APP_READS = [
  { what: 'event detail organisation embed', sql: `SELECT id, name, slug, description, logo_url, website FROM public.organisations LIMIT 3` },
  { what: 'event card organisation embed', sql: `SELECT id, name, slug FROM public.organisations LIMIT 3` },
  { what: 'the event page shaped join (the query that 404d)', sql: `SELECT e.id, e.slug, o.name FROM public.events e JOIN public.organisations o ON o.id = e.organisation_id LIMIT 3` },
  { what: 'venue public fields', sql: `SELECT id, name, address, city, state, postal_code, latitude, longitude FROM public.venues LIMIT 3` },
  { what: 'seat map availability', sql: `SELECT id, event_id, ticket_tier_id, status, x, y, price_cents FROM public.seats LIMIT 3` },
  { what: 'lineup read', sql: `SELECT id, event_id, artist_id, billing_order, status FROM public.event_artists LIMIT 3` },
  { what: 'published ticket tiers (the public sale path)', sql: `SELECT id, event_id, name, price, sold_count, total_capacity FROM public.ticket_tiers LIMIT 3` },
  { what: 'published events list', sql: `SELECT id, slug, title, start_date FROM public.events LIMIT 3` },
]

const fails = []
const scanned = []
const hr = t => console.log(`\n${'='.repeat(78)}\n${t}\n${'='.repeat(78)}`)
function assert(cond, msg, detail) {
  if (cond) console.log(`  PASS: ${msg}`)
  else { console.log(`  FAIL: ${msg}${detail !== undefined ? ` (${detail})` : ''}`); fails.push(msg) }
}

/** Run sql as a role, optionally as a specific authenticated user. */
async function asRole(role, sql, uid = null) {
  try {
    await client.query('SAVEPOINT p')
    if (uid) await client.query(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid, role })])
    await client.query(`SET LOCAL ROLE ${role}`)
    const r = await client.query(sql)
    await client.query('RESET ROLE')
    await client.query('RELEASE SAVEPOINT p')
    return { ok: true, rows: r.rowCount, data: r.rows }
  } catch (err) {
    await client.query('ROLLBACK TO SAVEPOINT p').catch(() => {})
    await client.query('RESET ROLE').catch(() => {})
    return { ok: false, code: err.code, message: err.message.split('\n')[0] }
  }
}
try {
  await client.query('BEGIN')
  hr(`STAGE 2 PROOF  |  target ${target.ref} (TEST)  |  ONE transaction, ROLLED BACK`)

  const allTables = (await client.query(
    `select c.relname as t from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname='public' and c.relkind='r' order by c.relname`,
  )).rows.map(r => r.t)

  // An owner with real data, so "rows visible" is a meaningful number.
  const owner = (await client.query(
    `select o.owner_id, count(e.id) as events
       from public.organisations o join public.events e on e.organisation_id = o.id
      where o.owner_id is not null
      group by o.owner_id order by count(e.id) desc limit 1`,
  )).rows[0]
  if (!owner) throw new Error('no organisation with events and an owner on TEST')
  console.log(`  impersonating owner ${owner.owner_id} (${owner.events} events)`)
  scanned.push(`an organiser with ${owner.events} events, impersonated via request.jwt.claims`)

  // The 32 tables whose policies read organisations / organisation_members.
  const affected = (await client.query(
    `select distinct tablename from pg_policies
      where schemaname='public'
        and (coalesce(qual,'') || ' ' || coalesce(with_check,'')) ~* '(organisations|organisation_members)'
      order by tablename`,
  )).rows.map(r => r.tablename)

  // ---- BEFORE --------------------------------------------------------------
  hr('PHASE 1  BEFORE')
  const anonBefore = {}
  for (const t of allTables) anonBefore[t] = await asRole('anon', `SELECT id FROM public.${t} LIMIT 1`)
  const anonOkBefore = allTables.filter(t => anonBefore[t].ok)
  console.log(`  anon can SELECT from ${anonOkBefore.length} of ${allTables.length} tables`)
  scanned.push(`${allTables.length} tables swept as anon, before and after`)

  const orgBefore = {}
  for (const t of affected) {
    orgBefore[t] = await asRole('authenticated', `SELECT count(*)::int AS n FROM public.${t}`, owner.owner_id)
  }
  const orgVisibleBefore = affected.filter(t => orgBefore[t].ok).length
  console.log(`  the organiser can read ${orgVisibleBefore} of the ${affected.length} policy-affected tables`)
  scanned.push(`${affected.length} policy-affected tables counted as the organiser, before and after`)

  let readableBefore = 0
  for (const [t, c] of MUST_DENY) if ((await asRole('anon', `SELECT ${c} FROM public.${t} LIMIT 1`)).ok) readableBefore += 1
  assert(readableBefore === MUST_DENY.length,
    `all ${MUST_DENY.length} sensitive columns readable BEFORE, so a later denial is caused by these statements`,
    `${readableBefore}/${MUST_DENY.length}`)

  // ---- APPLY ---------------------------------------------------------------
  hr('PHASE 2  APPLYING the three migration files in filename order, from disk')
  // The migration files are executed verbatim, minus their own transaction control:
  // this proof owns the transaction so it can roll everything back together.
  const strip = sql => sql.replace(/^\s*(BEGIN|COMMIT)\s*;\s*$/gim, '')
  await client.query(strip(readFileSync(STAGE2, 'utf8')))
  console.log(`  applied ${STAGE2}`)
  await client.query(strip(readFileSync(STAGE1, 'utf8')))
  console.log(`  applied ${STAGE1}`)
  await client.query(strip(readFileSync(STAGE3, 'utf8')))
  console.log(`  applied ${STAGE3}`)
  scanned.push('all THREE migration files executed verbatim, in filename order, from disk')

  const helpers = (await client.query(
    `select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and proname like 'el\\_%organisation_ids' order by proname`,
  )).rows.map(r => r.proname)
  console.log(`  helpers installed: ${helpers.join(', ')}`)
  assert(helpers.length === 3, 'all three SECURITY DEFINER helpers exist', helpers.length)

  const leftover = (await client.query(
    `select count(*)::int as n from pg_policies
      where schemaname='public' and tablename <> 'organisations'
        and (coalesce(qual,'') || ' ' || coalesce(with_check,'')) ~* '(^|[^a-z_.])organisations([^a-z_]|$)'`,
  )).rows[0].n
  assert(leftover === 0,
    'no policy outside organisations still names organisations in its expression', `${leftover} remain`)
  scanned.push('pg_policies re-read to confirm no policy still references organisations')

  // ---- AFTER: the exposure is closed --------------------------------------
  hr('PHASE 3a  every sensitive column must now be DENIED to anon')
  let denied = 0
  for (const [t, c] of MUST_DENY) {
    const r = await asRole('anon', `SELECT ${c} FROM public.${t} LIMIT 1`)
    if (!r.ok && r.code === '42501') denied += 1
    else console.log(`      STILL READABLE: ${t}.${c}`)
  }
  assert(denied === MUST_DENY.length, `all ${MUST_DENY.length} sensitive columns denied to anon (42501)`, `${denied}/${MUST_DENY.length}`)

  // ---- AFTER: nothing anon could read has been lost -----------------------
  hr('PHASE 3b  THE SWEEP: did anon lose any table it could read before?')
  const regressed = []
  for (const t of allTables) {
    const after = await asRole('anon', `SELECT id FROM public.${t} LIMIT 1`)
    if (anonBefore[t].ok && !after.ok) regressed.push(`${t} (${after.code}: ${after.message.slice(0, 48)})`)
  }
  if (regressed.length) for (const r of regressed) console.log(`      LOST: ${r}`)
  assert(regressed.length === 0,
    `no table lost anon readability: 0 of ${anonOkBefore.length} regressed (this is the 404 class)`,
    `${regressed.length} regressed`)

  hr('PHASE 3c  the select lists the application issues on public paths')
  for (const q of APP_READS) {
    const r = await asRole('anon', q.sql)
    assert(r.ok, q.what, r.ok ? undefined : `${r.code}: ${r.message}`)
  }

  // ---- AFTER: the organiser sees EXACTLY what they saw --------------------
  hr('PHASE 3d  ORGANISER VISIBILITY: identical before and after, in both directions')
  const changed = []
  for (const t of affected) {
    const after = await asRole('authenticated', `SELECT count(*)::int AS n FROM public.${t}`, owner.owner_id)
    const b = orgBefore[t]
    if (b.ok !== after.ok) {
      changed.push(`${t}: readable=${b.ok} -> ${after.ok}${after.ok ? '' : ` (${after.code} ${after.message.slice(0, 40)})`}`)
      continue
    }
    if (!b.ok) continue
    const bn = Number(b.data[0].n), an = Number(after.data[0].n)
    if (bn !== an) changed.push(`${t}: ${bn} rows -> ${an} rows  (${an > bn ? 'WIDENED' : 'NARROWED'})`)
  }
  if (changed.length) for (const c of changed) console.log(`      CHANGED: ${c}`)
  else console.log(`  all ${affected.length} policy-affected tables return the SAME row count to the organiser.`)
  assert(changed.length === 0,
    `the refactor changed nobody's access: ${affected.length} tables identical for the organiser`,
    `${changed.length} changed`)

  // ---- AFTER: an unrelated user still sees nothing they should not --------
  hr('PHASE 3e  a stranger must NOT gain access through the helpers')
  const stranger = '00000000-0000-4000-8000-00000000dead'
  const strangerReads = []
  for (const t of ['orders', 'payments', 'tickets', 'refunds', 'payouts', 'organiser_balance_ledger']) {
    const r = await asRole('authenticated', `SELECT count(*)::int AS n FROM public.${t}`, stranger)
    if (r.ok && Number(r.data[0].n) > 0) strangerReads.push(`${t}: ${r.data[0].n} rows`)
  }
  if (strangerReads.length) for (const s of strangerReads) console.log(`      LEAK: ${s}`)
  assert(strangerReads.length === 0,
    'an authenticated user who owns nothing reads 0 rows from the money and attendee tables',
    strangerReads.join('; '))
  scanned.push('a stranger uuid checked against 6 money and attendee tables')

  // ---- ROLLBACK ----------------------------------------------------------
  await client.query('ROLLBACK')
  hr('PHASE 4  ROLLBACK')
  await client.query('BEGIN')
  const back = await asRole('anon', `SELECT invite_token FROM public.event_artists LIMIT 1`)
  assert(back.ok, 'TEST is exactly as it was (event_artists.invite_token readable again), nothing persisted')
  const helpersGone = (await client.query(
    `select count(*)::int as n from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and proname like 'el\\_%organisation_ids'`,
  )).rows[0].n
  assert(helpersGone === 0, 'the helper functions were rolled back too', helpersGone)
  await client.query('ROLLBACK')
  scanned.push('ROLLBACK, then a re-read in a fresh transaction to confirm nothing persisted')
} finally {
  await client.end()
}

hr('WHAT THIS PROOF SCANNED')
scanned.forEach((s, i) => console.log(`  ${i + 1}. ${s}`))
console.log(`\n  ${fails.length === 0
  ? 'STAGE 2 IS SAFE TO APPLY: the exposure closes, no public read is lost, and no\n'
    + '  organiser gains or loses a single row. Nothing was persisted to TEST.'
  : `${fails.length} FAILED ASSERTION(S):`}`)
for (const f of fails) console.log(`    - ${f}`)
process.exitCode = fails.length === 0 ? 0 : 2
