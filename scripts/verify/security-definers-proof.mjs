// THE SECOND TIER OF DEFINER FUNCTIONS AND THE INVARIANT VIEW, PROVED RED THEN GREEN ON TEST
// (window 4, 25 October 2026).
//
// supabase/migrations/20261023000008_security_definers_meant_for_the_service_role.sql takes EXECUTE on sixteen
// SECURITY DEFINER functions, and every privilege on the view marketing_match_invariant_breaches, from PUBLIC,
// anon and authenticated, and grants them to the service role. Each run is ONE DO block that ends by RAISING
// its verdict, so everything in it is rolled back and TEST is left as found:
//
//   red    as TEST stands: anon and authenticated reach every one of the sixteen and read the view;
//   green  the migration exactly as written first: both refused all sixteen and the view, the service role
//          reaches them all and reads the view, and anon keeps the buyer path it was granted by name
//          (create_seat_reservation, redeem_tier_access_codes).
//
// A function is probed without running its body ("select f(...) where random() < 0": the privilege is checked
// when the expression is compiled and no row ever calls it). The view is read with a count.
//
// TEST ONLY: the project ref is a constant and production's ref is refused outright.
// Usage: scripts\ops\with-supabase-token.ps1 node scripts/verify/security-definers-proof.mjs red|green
import { readFileSync } from 'node:fs'

const REF = 'vkapkibzokmfaxqogypq'
const PRODUCTION_REF = 'gndnldyfudbytbboxesk'
if (REF === PRODUCTION_REF) throw new Error('this proof runs on TEST only, never on production')
const MIGRATION = 'supabase/migrations/20261023000008_security_definers_meant_for_the_service_role.sql'
const mode = process.argv[2]
const token = process.env.SUPABASE_ACCESS_TOKEN

const SERVICE_ONLY = [
  'admit_queue_batch(uuid, integer, integer)', 'promote_waitlist(uuid, uuid, integer, integer)',
  'join_waitlist(uuid, uuid, uuid, integer)', 'enter_queue(uuid, uuid, text, inet, text)',
  'rematerialize_seats_additive(uuid, uuid)', 'expire_stale_reservations()', 'expire_stale_queue_admissions()',
  'expire_waitlist_notifications()',
  'record_platform_notification(platform_notification_kind, text, text, text, uuid, uuid, uuid, uuid, text, text, text, jsonb)',
  'consent_permits(text, text, text, text, timestamp with time zone)', 'audience_consent_is_live(text)',
  'marketing_attribution_is_billable(text, smallint, uuid)', 'platform_notification_guards()',
  'platform_trigger_on(text, text)', 'marketing_attribution_default_window()', 'marketing_campaigner_default_cap()',
]
const BUYER_PATH = ['create_seat_reservation(uuid, uuid, uuid[], integer, text)', 'redeem_tier_access_codes(text, uuid[])']
const VIEW = 'select count(*) from public.marketing_match_invariant_breaches'

const unrunCall = (sig) => {
  const [, name, args] = sig.match(/^(\w+)\((.*)\)$/)
  const nulls = args ? args.split(', ').map((t) => `null::${t}`).join(', ') : ''
  return `select public.${name}(${nulls}) where random() < 0`
}
const q = (s) => `'${s.replace(/'/g, "''")}'`
const t = (s) => `${q(s)}::text`

function probe(role, what, stmt, mustReach) {
  return `begin
  execute ${q(stmt)};
  ${mustReach ? `lines := lines || ${t(`${role} reaches ${what}`)};` : `fails := fails || ${t(`${role} REACHES ${what}`)};`}
exception when insufficient_privilege then
  ${mustReach ? `fails := fails || ${t(`${role} REFUSED ${what}`)};` : `lines := lines || ${t(`${role} refused ${what}`)};`}
end;`
}

function proofSql(green, migration) {
  const body = []
  for (const role of ['anon', 'authenticated', 'service_role']) {
    body.push(`execute 'set local role ${role}';`)
    const reaches = role === 'service_role' || !green
    for (const sig of SERVICE_ONLY) body.push(probe(role, sig, unrunCall(sig), reaches))
    body.push(probe(role, 'the view marketing_match_invariant_breaches', VIEW, reaches))
    if (role === 'anon') for (const sig of BUYER_PATH) body.push(probe(role, `the buyer path ${sig}`, unrunCall(sig), true))
    body.push(`execute 'reset role';`)
  }
  return `DO $definers_proof$
DECLARE
  lines text[] := '{}';
  fails text[] := '{}';
BEGIN
  ${green ? `EXECUTE $w4_mig$${migration}$w4_mig$;\n  lines := lines || 'the migration ran as written, its own post-condition passing'::text;` : ''}
${body.join('\n')}
  RAISE EXCEPTION 'PROOF ${green ? 'GREEN' : 'RED'} (% failure(s), rolled back):%', coalesce(array_length(fails, 1), 0),
    array_to_string(array(select ' FAIL ' || x from unnest(fails) x) || array(select ' ' || x from unnest(lines) x), ' | ');
END
$definers_proof$;`
}

async function main() {
  if (!token) {
    console.error('REFUSED: SUPABASE_ACCESS_TOKEN is not in the environment; run through scripts/ops/with-supabase-token.ps1')
    return 2
  }
  if (mode !== 'red' && mode !== 'green') {
    console.error('REFUSED: say red or green')
    return 2
  }
  const migration = readFileSync(MIGRATION, 'utf8')
  if (migration.includes('$w4_mig$')) throw new Error('the migration holds the quoting tag')
  console.log(`target TEST (${REF}), ${mode.toUpperCase()}: one transaction, rolled back by its own verdict`)
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: proofSql(mode === 'green', migration), read_only: false }),
  })
  const text = await res.text()
  let message = text
  try {
    message = JSON.parse(text).message ?? text
  } catch {
    // not JSON: printed as it came
  }
  const verdict = message.match(/PROOF (RED|GREEN) \((\d+) failure\(s\), rolled back\):(.*?)(?:\nCONTEXT:|$)/s)
  if (!verdict) {
    console.error(`FAILED before the proof gave a verdict (HTTP ${res.status}): ${message.slice(0, 2000)}`)
    return 1
  }
  console.log(`PROOF ${verdict[1]}: ${verdict[2]} failure(s)`)
  for (const line of verdict[3].split(' | ').filter((l) => l.trim())) console.log(`  ${line.trim()}`)
  return verdict[2] === '0' ? 0 : 1
}

main().then(
  (code) => {
    process.exitCode = code
  },
  (error) => {
    console.error(`FAILED: ${error.message}`)
    process.exitCode = 1
  },
)
