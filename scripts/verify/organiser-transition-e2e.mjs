/**
 * Organiser moderation - end-to-end verification of the guarded status
 * transition against the real Sydney database and the real org_status enum,
 * inside BEGIN ... ROLLBACK (nothing persists).
 *
 * applyOrganiserAction performs a CONDITIONAL update:
 *   UPDATE organisations SET status=<to> WHERE id=? AND status = ANY(<from>)
 * so a transition only applies from an allowed source state (and a concurrent
 * change cannot be clobbered). This exercises that exact guard: valid
 * transitions update one row; disallowed transitions update zero rows and
 * leave the status untouched.
 *
 * Run: node scripts/verify/organiser-transition-e2e.mjs
 */
import { config } from 'dotenv'
config({ path: '.env.local' })
import pg from 'pg'
import { randomUUID } from 'node:crypto'

const client = new pg.Client({
  host: 'db.gndnldyfudbytbboxesk.supabase.co',
  port: 5432, user: 'postgres', password: process.env.SUPABASE_DB_PASSWORD_SYDNEY,
  database: 'postgres', ssl: { rejectUnauthorized: false },
})

const fails = []
function assert(cond, msg, detail) {
  if (cond) console.log('  PASS:', msg)
  else { console.log('  FAIL:', msg, detail !== undefined ? `(got ${JSON.stringify(detail)})` : ''); fails.push(msg) }
}
const q = (t, p) => client.query(t, p)
const one = async (t, p) => (await q(t, p)).rows[0]

const owner = randomUUID(), orgId = randomUUID(), orgId2 = randomUUID()
const sfx = Date.now().toString(36)
const statusOf = async id => (await one(`SELECT status FROM public.organisations WHERE id=$1`, [id])).status
// Mirrors applyOrganiserAction's conditional update; returns rows affected.
async function transition(id, to, from) {
  const r = await q(`UPDATE public.organisations SET status=$2, updated_at=now() WHERE id=$1 AND status = ANY($3::text[]::org_status[]) RETURNING id`, [id, to, from])
  return r.rowCount
}

await client.connect()
try {
  await q('BEGIN')
  await q('INSERT INTO auth.users (id, email) VALUES ($1,$2)', [owner, `owner_${sfx}@test.invalid`])
  await q(`INSERT INTO public.profiles (id, email) VALUES ($1,$2) ON CONFLICT (id) DO UPDATE SET email=EXCLUDED.email`, [owner, `owner_${sfx}@test.invalid`])
  await q(`INSERT INTO public.organisations (id, name, slug, owner_id, status) VALUES ($1,$2,$3,$4,'pending'),($5,$6,$7,$4,'pending')`,
    [orgId, `E2E Org ${sfx}`, `e2e-org-${sfx}`, owner, orgId2, `E2E Org2 ${sfx}`, `e2e-org2-${sfx}`])

  console.log('\n[approve] pending -> active (allowed)')
  assert(await transition(orgId, 'active', ['pending']) === 1, 'approve updates exactly one row')
  assert(await statusOf(orgId) === 'active', 'status is now active', await statusOf(orgId))

  console.log('\n[guard] approve again from active (disallowed)')
  assert(await transition(orgId, 'active', ['pending']) === 0, 'approve-from-active updates zero rows (guarded)')
  assert(await statusOf(orgId) === 'active', 'status unchanged', await statusOf(orgId))

  console.log('\n[suspend] active -> suspended (allowed)')
  assert(await transition(orgId, 'suspended', ['active']) === 1, 'suspend updates one row')
  assert(await statusOf(orgId) === 'suspended', 'status suspended', await statusOf(orgId))

  console.log('\n[reinstate] suspended -> active (allowed)')
  assert(await transition(orgId, 'active', ['suspended', 'deactivated']) === 1, 'reinstate updates one row')
  assert(await statusOf(orgId) === 'active', 'status active again', await statusOf(orgId))

  console.log('\n[guard] suspend a pending org (disallowed)')
  assert(await transition(orgId2, 'suspended', ['active']) === 0, 'suspend-from-pending updates zero rows (guarded)')
  assert(await statusOf(orgId2) === 'pending', 'second org still pending', await statusOf(orgId2))

  await q('ROLLBACK')
  console.log('\n[cleanup] ROLLBACK complete - no fixture rows persisted')
} catch (err) {
  try { await q('ROLLBACK') } catch {}
  console.error('\nORGANISER E2E ERROR:', err.message)
  fails.push('exception: ' + err.message)
} finally {
  await client.end()
}

console.log(`\n${'='.repeat(60)}`)
if (fails.length === 0) console.log('ORGANISER TRANSITION E2E: ALL ASSERTIONS PASSED (against real DB, rolled back)')
else { console.log(`ORGANISER TRANSITION E2E: ${fails.length} FAILURE(S):`); fails.forEach(f => console.log('  -', f)) }
process.exit(fails.length === 0 ? 0 : 1)
