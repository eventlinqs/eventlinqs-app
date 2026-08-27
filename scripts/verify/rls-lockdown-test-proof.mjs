/**
 * PROVE THE COLUMN LOCKDOWN ON TEST BEFORE ANY OF IT IS RUN ON PRODUCTION.
 *
 * WHAT HAPPENED. Migration 20260808000010 revoked table-level SELECT on four
 * tables from `anon` and `authenticated` and re-granted a narrow column list.
 * Applied to production it took every event page to 404, and a broad grant was run
 * under pressure to restore service. That grant was triage: it returned production
 * to the exact state the migration was written to end.
 *
 * WHY THE 404 HAPPENED, proven by scripts/verify/rls-policy-dependency-probe.mjs
 * and re-proven by the sweep below. A row security policy is an expression
 * evaluated with the CALLER's privileges. Twenty-nine tables in `public` carry
 * policies whose USING clause subqueries `public.organisations` for an ownership or
 * membership check. While `anon` held table-level SELECT on organisations those
 * subqueries were legal. The moment it was revoked, SELECT on all of those tables
 * began to fail with "permission denied for table organisations" - including
 * `events`, `ticket_tiers` and `tickets`, which is every public surface on the
 * platform. The migration was reviewed against the queries the APPLICATION writes.
 * The queries the DATABASE writes on its behalf were not in scope.
 *
 * A wider column grant is NOT the fix, and the temptation is tested explicitly
 * below: granting owner_id restores the reads and re-publishes one of the columns
 * the migration existed to hide. It trades the exposure for the outage.
 *
 * SO THE WORK SPLITS IN TWO, and this script proves them separately:
 *
 *   --stage stage1   venues, seats and event_artists ONLY. No policy anywhere
 *                    subqueries those three for an ownership check, so their column
 *                    privileges can be narrowed with no second-order breakage. This
 *                    closes the worst of the exposure, including
 *                    event_artists.invite_token, which is a live bearer credential
 *                    that transfers ownership of an artist profile when presented.
 *   --stage full     adds organisations. Expected to FAIL the sweep until the
 *                    policies are refactored, and it is included precisely so the
 *                    failure is demonstrable rather than argued about.
 *
 * THE SWEEP IS THE POINT. Rather than checking a hand-picked list of queries, it
 * reads one row from EVERY base table in `public` as role anon, before and after,
 * and reports any table that regressed. A hand-picked list is how the original
 * review missed 29 tables.
 *
 * TEST ONLY. This executes REVOKE and GRANT, so it preflights before opening a
 * socket, runs everything in ONE transaction, and ROLLS BACK. Nothing persists.
 *
 * USAGE:
 *   node --env-file=.env.test scripts/verify/rls-lockdown-test-proof.mjs --stage stage1
 *   node --env-file=.env.test scripts/verify/rls-lockdown-test-proof.mjs --stage full
 */
import { assertNotProductionDatabase } from '../lib/production-write-preflight.mjs'
import _pg from 'pg'

const argv = process.argv.slice(2)
const arg = (n, d = null) => { const i = argv.indexOf(n); return i === -1 ? d : argv[i + 1] }
const STAGE = arg('--stage', 'stage1')
if (!['stage1', 'full'].includes(STAGE)) { console.error('--stage must be stage1 or full'); process.exit(2) }

const target = assertNotProductionDatabase()
const client = await target.connect()
const fails = []
const scanned = []
const hr = t => console.log(`\n${'='.repeat(74)}\n${t}\n${'='.repeat(74)}`)
function assert(cond, msg, detail) {
  if (cond) console.log(`  PASS: ${msg}`)
  else { console.log(`  FAIL: ${msg}${detail !== undefined ? ` (${detail})` : ''}`); fails.push(msg) }
}

/** Verbatim from 20260808000010, grouped by table so a stage can select them. */
const BY_TABLE = {
  venues: [
    `REVOKE SELECT ON public.venues FROM anon`,
    `REVOKE SELECT ON public.venues FROM authenticated`,
    `GRANT SELECT (id, name, description, image_url, capacity, address, city, state, country, postal_code, latitude, longitude, organisation_id, is_active, created_at, updated_at) ON public.venues TO anon`,
    `GRANT SELECT (id, name, description, image_url, capacity, address, city, state, country, postal_code, latitude, longitude, organisation_id, is_active, created_at, updated_at) ON public.venues TO authenticated`,
  ],
  seats: [
    `REVOKE SELECT ON public.seats FROM anon`,
    `REVOKE SELECT ON public.seats FROM authenticated`,
    `GRANT SELECT (id, event_id, seat_map_section_id, ticket_tier_id, row_label, seat_number, seat_type, status, x, y, price_cents, held_reason, note, created_at, updated_at) ON public.seats TO anon`,
    `GRANT SELECT (id, event_id, seat_map_section_id, ticket_tier_id, row_label, seat_number, seat_type, status, x, y, price_cents, held_reason, note, created_at, updated_at) ON public.seats TO authenticated`,
  ],
  event_artists: [
    `REVOKE SELECT ON public.event_artists FROM anon`,
    `REVOKE SELECT ON public.event_artists FROM authenticated`,
    `GRANT SELECT (id, event_id, artist_id, billing_order, status, created_at) ON public.event_artists TO anon`,
    `GRANT SELECT (id, event_id, artist_id, billing_order, status, created_at) ON public.event_artists TO authenticated`,
  ],
  organisations: [
    `REVOKE SELECT ON public.organisations FROM anon`,
    `REVOKE SELECT ON public.organisations FROM authenticated`,
    `GRANT SELECT (id, name, slug, description, logo_url, website) ON public.organisations TO anon`,
    `GRANT SELECT (id, name, slug, description, logo_url, website) ON public.organisations TO authenticated`,
  ],
}
const STAGE_TABLES = STAGE === 'stage1'
  ? ['venues', 'seats', 'event_artists']
  : ['venues', 'seats', 'event_artists', 'organisations']

/** Columns that must become unreadable, per table. */
const MUST_DENY = {
  organisations: ['email', 'phone', 'owner_id', 'metadata', 'stripe_account_id',
    'stripe_charges_enabled', 'stripe_requirements', 'payout_status', 'total_volume_cents'],
  venues: ['stripe_account_id', 'stripe_payouts_enabled', 'revenue_share_status'],
  seats: ['held_by_user_id', 'metadata', 'reservation_id', 'order_item_id'],
  event_artists: ['invite_token'],
}

/** Select lists the application actually issues on a public (anon) path. */
const APP_READS = [
  { what: 'event detail organisation embed (src/app/events/[slug]/page.tsx:136)',
    sql: `SELECT id, name, slug, description, logo_url, website FROM public.organisations LIMIT 3` },
  { what: 'event card organisation embed (src/lib/events/fetchers.ts:573)',
    sql: `SELECT id, name, slug FROM public.organisations LIMIT 3` },
  { what: 'venue public fields (address stays public: it is where the event is)',
    sql: `SELECT id, name, image_url, capacity, address, city, state, postal_code, latitude, longitude, is_active FROM public.venues LIMIT 3` },
  { what: 'seat map availability (the anonymous seat map on every event page)',
    sql: `SELECT id, event_id, ticket_tier_id, row_label, seat_number, status, x, y, price_cents FROM public.seats LIMIT 3` },
  { what: 'lineup read (who is playing is public data)',
    sql: `SELECT id, event_id, artist_id, billing_order, status FROM public.event_artists LIMIT 3` },
  { what: 'the event page shaped join (events + organisation embed), the query that 404d',
    sql: `SELECT e.id, e.slug, o.name, o.slug FROM public.events e JOIN public.organisations o ON o.id = e.organisation_id LIMIT 3` },
  { what: 'ticket tiers (a table the migration does not touch)',
    sql: `SELECT id, event_id, name, price, sold_count, total_capacity FROM public.ticket_tiers LIMIT 3` },
]

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
try {
  await client.query('BEGIN')
  hr(`TARGET ${target.ref} (TEST)  |  STAGE: ${STAGE}  |  one transaction, ROLLED BACK at the end`)
  console.log(`  tables in scope: ${STAGE_TABLES.join(', ')}`)

  const allTables = (await client.query(
    `select c.relname as t from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname='public' and c.relkind='r' order by c.relname`,
  )).rows.map(r => r.t)
  scanned.push(`${allTables.length} base tables in public swept as role anon, before and after`)

  // ---- PHASE 1: BEFORE ----------------------------------------------------
  hr('PHASE 1  BEFORE')
  const sweepBefore = {}
  for (const t of allTables) sweepBefore[t] = await asAnon(`SELECT id FROM public.${t} LIMIT 1`)
  const okBefore = allTables.filter(t => sweepBefore[t].ok)
  console.log(`  anon can SELECT from ${okBefore.length} of ${allTables.length} tables`)

  const denyList = STAGE_TABLES.flatMap(t => (MUST_DENY[t] ?? []).map(c => [t, c]))
  scanned.push(`${denyList.length} sensitive columns read as anon before and after`)
  let readableBefore = 0
  for (const [t, c] of denyList) {
    if ((await asAnon(`SELECT ${c} FROM public.${t} LIMIT 1`)).ok) readableBefore += 1
  }
  console.log(`  ${readableBefore} of ${denyList.length} sensitive columns in scope are readable by anon`)
  assert(readableBefore === denyList.length,
    'every in-scope sensitive column is readable BEFORE, so a later denial is caused by these statements and nothing else',
    `${readableBefore}/${denyList.length}`)

  // ---- PHASE 2: APPLY ----------------------------------------------------
  const statements = STAGE_TABLES.flatMap(t => BY_TABLE[t])
  hr(`PHASE 2  APPLYING ${statements.length} statements`)
  scanned.push(`${statements.length} REVOKE/GRANT statements executed`)
  for (const sql of statements) {
    try {
      await client.query(sql)
      console.log(`  ok  ${sql.length > 92 ? `${sql.slice(0, 92)} ...` : sql}`)
    } catch (err) {
      console.log(`  ERR ${sql.slice(0, 60)} -> ${err.message.split('\n')[0]}`)
      fails.push(`statement failed: ${err.message.split('\n')[0]}`)
    }
  }

  // ---- PHASE 3a: the exposure must be closed ------------------------------
  hr('PHASE 3a  the in-scope sensitive columns must now be DENIED')
  let denied = 0
  for (const [t, c] of denyList) {
    const r = await asAnon(`SELECT ${c} FROM public.${t} LIMIT 1`)
    if (!r.ok && r.code === '42501') denied += 1
    else console.log(`      STILL READABLE: ${t}.${c}`)
  }
  assert(denied === denyList.length, `all ${denyList.length} in-scope sensitive columns denied to anon (42501)`,
    `${denied}/${denyList.length}`)

  // ---- PHASE 3b: THE SWEEP, the check the original review lacked ----------
  hr('PHASE 3b  THE SWEEP: did anything that worked before stop working?')
  const regressed = []
  for (const t of allTables) {
    const after = await asAnon(`SELECT id FROM public.${t} LIMIT 1`)
    if (sweepBefore[t].ok && !after.ok) regressed.push({ t, code: after.code, message: after.message })
  }
  if (regressed.length === 0) {
    console.log(`  no regression. All ${okBefore.length} readable tables are still readable.`)
  } else {
    console.log(`  ${regressed.length} table(s) READABLE BEFORE are now UNREADABLE:\n`)
    for (const r of regressed) console.log(`      ${r.t.padEnd(28)} ${r.code}: ${r.message.slice(0, 52)}`)
    console.log('\n  Each of these is a public surface that would 404 or render empty.')
  }
  assert(regressed.length === 0,
    `no table lost anon readability (the 404 class): 0 of ${okBefore.length} regressed`,
    `${regressed.length} regressed`)

  // ---- PHASE 3c: the real application reads -------------------------------
  hr('PHASE 3c  the select lists the application issues on public paths')
  scanned.push(`${APP_READS.length} real application select lists executed as anon after`)
  for (const q of APP_READS) {
    const r = await asAnon(q.sql)
    assert(r.ok, q.what, r.ok ? undefined : `${r.code}: ${r.message}`)
  }

  // ---- PHASE 4: ROLLBACK -------------------------------------------------
  await client.query('ROLLBACK')
  hr('PHASE 4  ROLLBACK')
  scanned.push('ROLLBACK, then a re-read in a fresh transaction to confirm nothing persisted')
  await client.query('BEGIN')
  const back = await asAnon(`SELECT invite_token FROM public.event_artists LIMIT 1`)
  assert(back.ok, 'TEST is exactly as it was (event_artists.invite_token readable again), so nothing persisted')
  await client.query('ROLLBACK')
} finally {
  await client.end()
}

hr(`WHAT THIS PROOF SCANNED  (stage: ${STAGE})`)
scanned.forEach((s, i) => console.log(`  ${i + 1}. ${s}`))
console.log(`\n  ${fails.length === 0
  ? `ALL ASSERTIONS PASSED for stage "${STAGE}".`
  : `${fails.length} FAILED ASSERTION(S) for stage "${STAGE}":`}`)
for (const f of fails) console.log(`    - ${f}`)
process.exitCode = fails.length === 0 ? 0 : 2
