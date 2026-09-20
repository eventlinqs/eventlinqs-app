/**
 * THE DATABASE'S OWN HALF OF LB-INVITEWHOLE, PROVEN AGAINST TEST.
 *
 * Migration 20260920000050 makes two promises that no unit test can check,
 * because both are properties of a real Postgres transaction and a real
 * trigger. This exercises them against the live TEST database with real rows,
 * every one of them tagged lane-b-invitewhole, and removes them again.
 *
 *   1. A FAULT DURING THE CLAIM LEAVES THE INVITE PENDING. Proven by injecting
 *      a fault into the claim and reading the invite's status back. The
 *      injection is a trigger that fires ONLY for the one organisation this
 *      script created, so no other row on TEST, and no other lane driving
 *      against it, can reach it. It is dropped in the same run, and the run
 *      fails loudly if it is still there afterwards.
 *
 *   2. THE SIXTH INVITE IS REFUSED BY THE DATABASE, not merely by the screen.
 *      Proven by inserting six and reading back the 23514.
 *
 * TEST ONLY. The project ref is asserted before a row is written.
 *
 *   env -u NEXT_PUBLIC_SUPABASE_URL -u NEXT_PUBLIC_SUPABASE_ANON_KEY \
 *     node --env-file=.env.local scripts/verify/lb-invitewhole-sql-proof.mjs
 */
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tearDownAccountOrFailTheRun } from './lib/teardown-account.mjs'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const TEST_REF = 'vkapkibzokmfaxqogypq'
if (!URL || !KEY) {
  console.error('needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from .env.local')
  process.exit(2)
}
if (!URL.includes(TEST_REF)) {
  console.error(`REFUSING: ${URL} is not TEST ${TEST_REF}. This script writes rows.`)
  process.exit(2)
}

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN
if (!TOKEN) {
  console.error('needs SUPABASE_ACCESS_TOKEN; run through scripts/ops/with-supabase-token.ps1')
  process.exit(2)
}

const db = createClient(URL, KEY, { auth: { persistSession: false } })
const OUT = join('C:', 'dev', 'EVIDENCE', 'LB-INVITEWHOLE')
mkdirSync(OUT, { recursive: true })

const TAG = 'lane-b-invitewhole'
const RUN = Date.now().toString(36)

const lines = []
const results = []
const check = (name, ok, detail) => {
  results.push({ name, ok, detail })
  const line = `${ok ? 'PASS' : 'FAIL'}  ${name}  ${detail}`
  lines.push(line)
  console.log(line)
}

/** Arbitrary SQL against TEST, through the Management API. Used for the fault injection only. */
async function sql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${TEST_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`)
  return res.json()
}

const FAULT_TRIGGER = `trg_${TAG.replace(/-/g, '_')}_force_claim_fault`

let inviterId = null
let inviteeId = null
let inviterUser = null
let inviteeUser = null
let faultInstalled = false

try {
  // ---------------------------------------------------------------------
  // The fixture: two organisations and two auth users, all tagged.
  // ---------------------------------------------------------------------
  const mkUser = async label => {
    const email = `${TAG}-${label}-${RUN}@eventlinqs.test`
    const created = await db.auth.admin.createUser({
      email,
      password: `${randomUUID()}Aa1`,
      email_confirm: true,
    })
    if (created.error) throw new Error(`auth user ${label}: ${created.error.message}`)
    await db.from('profiles').upsert({ id: created.data.user.id, email, full_name: `${TAG} ${label}` })
    return created.data.user.id
  }

  inviterUser = await mkUser('inviter')
  inviteeUser = await mkUser('invitee')

  const mkOrg = async (label, ownerId, founding) => {
    const { data, error } = await db
      .from('organisations')
      .insert({
        name: `Lane B invitewhole ${label} ${RUN}`,
        slug: `${TAG}-${label}-${RUN}`,
        owner_id: ownerId,
        email: `${TAG}-${label}-${RUN}@eventlinqs.test`,
        status: 'pending',
        is_founding: founding,
      })
      .select('id')
      .single()
    if (error) throw new Error(`organisation ${label}: ${error.message}`)
    return data.id
  }

  inviterId = await mkOrg('inviter', inviterUser, true)
  inviteeId = await mkOrg('invitee', inviteeUser, false)
  check('lb-invitewhole.sql.fixture', Boolean(inviterId && inviteeId), `inviter=${inviterId} invitee=${inviteeId}`)

  // ---------------------------------------------------------------------
  // 1. THE ALLOWANCE IS THE DATABASE'S, NOT THE SCREEN'S.
  // ---------------------------------------------------------------------
  const codes = []
  for (let i = 1; i <= 5; i++) {
    const code = `LANEB${RUN.toUpperCase()}${i}`.slice(0, 16)
    const { error } = await db.from('founding_invites').insert({
      code,
      inviter_kind: 'organiser',
      inviter_org_id: inviterId,
      inviter_name: 'Lane B invitewhole inviter',
      city_slug: 'geelong',
      status: 'pending',
    })
    if (error) throw new Error(`invite ${i}: ${error.message}`)
    codes.push(code)
  }
  check('lb-invitewhole.sql.five-invites-are-allowed', codes.length === 5, codes.join(', '))

  const sixth = await db.from('founding_invites').insert({
    code: `LANEB${RUN.toUpperCase()}6`.slice(0, 16),
    inviter_kind: 'organiser',
    inviter_org_id: inviterId,
    inviter_name: 'Lane B invitewhole inviter',
    city_slug: 'geelong',
    status: 'pending',
  })
  check(
    'lb-invitewhole.sql.the-sixth-is-refused-by-the-database',
    sixth.error?.code === '23514',
    `code=${sixth.error?.code ?? 'NONE'} message=${(sixth.error?.message ?? 'inserted, which is the defect').slice(0, 140)}`,
  )

  // ---------------------------------------------------------------------
  // 2. A FAULT DURING THE CLAIM LEAVES THE INVITE PENDING.
  //
  // The fault is injected where the real one lives: inside the claim, after
  // the invite has been marked accepted. The trigger's WHEN clause names the
  // one organisation this script created, so every other row on TEST is
  // untouched even while it is installed.
  // ---------------------------------------------------------------------
  await sql(`
    CREATE OR REPLACE FUNCTION public.${FAULT_TRIGGER}_fn() RETURNS TRIGGER
    LANGUAGE plpgsql AS $fault$
    BEGIN
      RAISE EXCEPTION 'lane-b-invitewhole injected claim fault' USING ERRCODE = 'internal_error';
    END $fault$;
    CREATE TRIGGER ${FAULT_TRIGGER}
      BEFORE UPDATE ON public.organisations
      FOR EACH ROW
      WHEN (NEW.id = '${inviteeId}'::uuid AND NEW.is_founding AND NOT OLD.is_founding)
      EXECUTE FUNCTION public.${FAULT_TRIGGER}_fn();
  `)
  faultInstalled = true

  const faulted = await db.rpc('accept_founding_invite', {
    p_code: codes[0],
    p_user_id: inviteeUser,
    p_org_id: inviteeId,
    p_offer_open: true,
  })
  check(
    'lb-invitewhole.sql.a-fault-in-the-claim-is-an-error-not-a-null-spot',
    Boolean(faulted.error),
    `error=${(faulted.error?.message ?? 'NONE, the caller would read this as the programme being full').slice(0, 140)}`,
  )

  const afterFault = await db
    .from('founding_invites')
    .select('status, accepted_at, accepted_org_id')
    .eq('code', codes[0])
    .maybeSingle()
  check(
    'lb-invitewhole.sql.the-invite-is-still-pending-after-the-fault',
    afterFault.data?.status === 'pending' && afterFault.data?.accepted_at === null,
    `status=${afterFault.data?.status} accepted_at=${afterFault.data?.accepted_at} accepted_org_id=${afterFault.data?.accepted_org_id}`,
  )

  await sql(`DROP TRIGGER IF EXISTS ${FAULT_TRIGGER} ON public.organisations;
             DROP FUNCTION IF EXISTS public.${FAULT_TRIGGER}_fn();`)
  faultInstalled = false

  const stillThere = await sql(
    `select count(*)::int as n from pg_trigger where tgname = '${FAULT_TRIGGER}' and not tgisinternal`,
  )
  check(
    'lb-invitewhole.sql.the-injected-fault-is-gone',
    stillThere[0]?.n === 0,
    `pg_trigger rows named ${FAULT_TRIGGER}: ${stillThere[0]?.n}`,
  )

  // ---------------------------------------------------------------------
  // 3. THE SAME CODE, WITH NO FAULT: CONSUMED, GRANTED, ATTRIBUTED, ONCE.
  // ---------------------------------------------------------------------
  const granted = await db.rpc('accept_founding_invite', {
    p_code: codes[0],
    p_user_id: inviteeUser,
    p_org_id: inviteeId,
    p_offer_open: true,
  })
  const row = Array.isArray(granted.data) ? granted.data[0] : granted.data
  check(
    'lb-invitewhole.sql.the-retry-after-the-fault-succeeds',
    !granted.error && row?.consumed === true && typeof row?.spot_number === 'number',
    `error=${granted.error?.message ?? 'null'} consumed=${row?.consumed} spot=${row?.spot_number} referral=${row?.referral_recorded}`,
  )
  check(
    'lb-invitewhole.sql.the-referral-is-recorded',
    row?.referral_recorded === true,
    `referral_recorded=${row?.referral_recorded}`,
  )

  const replay = await db.rpc('accept_founding_invite', {
    p_code: codes[0],
    p_user_id: inviteeUser,
    p_org_id: inviteeId,
    p_offer_open: true,
  })
  const replayRow = Array.isArray(replay.data) ? replay.data[0] : replay.data
  check(
    'lb-invitewhole.sql.a-spent-code-is-spent',
    !replay.error && replayRow?.consumed === false,
    `consumed=${replayRow?.consumed} spot=${replayRow?.spot_number}`,
  )

  // ---------------------------------------------------------------------
  // 4. THE OFFER CLOSED: CONSUMED, NO SPOT, AND SAID SO RATHER THAN "FULL".
  // ---------------------------------------------------------------------
  const closed = await db.rpc('accept_founding_invite', {
    p_code: codes[1],
    p_user_id: inviteeUser,
    p_org_id: inviteeId,
    p_offer_open: false,
  })
  const closedRow = Array.isArray(closed.data) ? closed.data[0] : closed.data
  check(
    'lb-invitewhole.sql.a-closed-offer-says-closed-not-full',
    !closed.error && closedRow?.consumed === true && closedRow?.offer_closed === true && closedRow?.spot_number === null,
    `consumed=${closedRow?.consumed} offer_closed=${closedRow?.offer_closed} spot=${closedRow?.spot_number}`,
  )
} catch (err) {
  check('lb-invitewhole.sql.the-run-completed', false, String(err?.message ?? err))
} finally {
  if (faultInstalled) {
    await sql(`DROP TRIGGER IF EXISTS ${FAULT_TRIGGER} ON public.organisations;
               DROP FUNCTION IF EXISTS public.${FAULT_TRIGGER}_fn();`).catch(() => {})
  }
  // TEST IS LEFT AS FOUND, and the teardown is read back by name rather than
  // assumed: forty-two accounts were once left behind by a teardown that could
  // not fail (LB-TEARDOWN).
  await db.from('founding_invites').delete().eq('inviter_org_id', inviterId ?? randomUUID())
  if (inviteeId) await db.from('organisations').delete().eq('id', inviteeId)
  if (inviterId) await db.from('organisations').delete().eq('id', inviterId)
  // THROUGH THE ONE DOOR. tearDownAccountOrFailTheRun is the only thing that
  // can tell an account that was already gone from a deletion that was
  // REFUSED, which is how forty-two accounts were once left on TEST by a
  // teardown that could not fail (LB-TEARDOWN).
  for (const u of [inviterUser, inviteeUser]) {
    if (!u) continue
    await db.from('profiles').delete().eq('id', u)
    await tearDownAccountOrFailTheRun(db, u)
  }
  const { count: orgsLeft } = await db
    .from('organisations')
    .select('id', { count: 'exact', head: true })
    .like('slug', `${TAG}-%`)
  const { count: invitesLeft } = await db
    .from('founding_invites')
    .select('id', { count: 'exact', head: true })
    .like('code', `LANEB${RUN.toUpperCase()}%`)
  check(
    'lb-invitewhole.sql.test-is-left-as-found',
    orgsLeft === 0 && invitesLeft === 0,
    `organisations=${orgsLeft} invites=${invitesLeft}`,
  )

  writeFileSync(join(OUT, 'sql-proof.log'), `${lines.join('\n')}\n`, 'utf8')
  writeFileSync(
    join(OUT, 'sql-proof.json'),
    `${JSON.stringify({ at: new Date().toISOString(), results }, null, 2)}\n`,
    'utf8',
  )
  const failed = results.filter(r => !r.ok)
  console.log(`\n${results.length - failed.length} of ${results.length} checks passed`)
  process.exit(failed.length ? 1 : 0)
}
