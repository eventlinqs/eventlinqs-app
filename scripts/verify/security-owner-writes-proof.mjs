// AN OWNER CANNOT WRITE THEIR OWN ORGANISATION'S MONEY COLUMNS, PROVED RED THEN GREEN ON TEST
// (window 4, 25 October 2026).
//
// supabase/migrations/20261023000007_security_an_owner_cannot_write_their_money_columns.sql takes UPDATE and
// DELETE on organisations from authenticated and keeps INSERT on exactly the eight columns the create step
// writes. Each run is ONE DO block, signed in as a real TEST organiser (auth.uid() their user id, role
// authenticated), ending by RAISING its verdict, so every write in it is rolled back and TEST is left as found:
//
//   red    as TEST stands (the same grants production holds once 20261023000006 is applied): the owner
//          sets their own hold_amount_cents to 0 and stripe_charges_enabled to true, and creates an
//          organisation that starts out charge ready;
//   green  the migration exactly as written first, then the same: both refused, while the create step's own
//          insert (the eight columns, returning id, name and slug, src/app/(dashboard)/dashboard/organisation/
//          actions.ts:70) still works.
//
// TEST ONLY: the project ref is a constant and production's ref is refused outright.
// Usage: scripts\ops\with-supabase-token.ps1 node scripts/verify/security-owner-writes-proof.mjs red|green
import { readFileSync } from 'node:fs'

const REF = 'vkapkibzokmfaxqogypq'
const PRODUCTION_REF = 'gndnldyfudbytbboxesk'
if (REF === PRODUCTION_REF) throw new Error('this proof runs on TEST only, never on production')
const MIGRATION = 'supabase/migrations/20261023000007_security_an_owner_cannot_write_their_money_columns.sql'
const OWNER = 'd11f5c1d-d18f-429f-a58c-67caafc29d1b' // broadcast.gate.organiser on TEST, the sweeps' own organiser
const ORG = 'e875fa77-1e8a-46fe-8f9d-e82e58b5864b' // their organisation, broadcast-gate-presents
const mode = process.argv[2]
const token = process.env.SUPABASE_ACCESS_TOKEN

// [what, the statement, true when the run must REACH it, by mode]
const PROBES = [
  ['the owner sets their own hold_amount_cents to 0 and stripe_charges_enabled to true',
    `update public.organisations set hold_amount_cents = 0, stripe_charges_enabled = true where id = '${ORG}'`,
    { red: true, green: false }],
  ['the owner changes their own description through the session (no application path does)',
    `update public.organisations set description = 'w4 proof' where id = '${ORG}'`,
    { red: true, green: false }],
  ['the owner creates an organisation that starts out charge ready with no hold',
    `insert into public.organisations (name, slug, owner_id, status, stripe_charges_enabled, hold_amount_cents)
       values ('W4 proof charge ready', 'w4-proof-charge-ready-' || floor(random() * 1e9)::text, '${OWNER}', 'active', true, 0)`,
    { red: true, green: false }],
  ['the create step itself: the eight columns, returning id, name and slug',
    `insert into public.organisations (name, slug, description, website, email, phone, owner_id, status)
       values ('W4 proof create step', 'w4-proof-create-step-' || floor(random() * 1e9)::text, null, null,
               'w4-proof@example.com', null, '${OWNER}', 'active') returning id, name, slug`,
    { red: true, green: true }],
]

const q = (s) => `'${s.replace(/'/g, "''")}'`

function proofSql(green, migration) {
  const probes = PROBES.map(([what, stmt, want]) => `
  BEGIN
    EXECUTE ${q(stmt)};
    ${want[green ? 'green' : 'red'] ? `lines := lines || ${q(`reached: ${what}`)}::text;` : `fails := fails || ${q(`REACHED, must be refused: ${what}`)}::text;`}
  EXCEPTION WHEN insufficient_privilege THEN
    ${want[green ? 'green' : 'red'] ? `fails := fails || (${q(`REFUSED, must be reached: ${what}: `)} || sqlerrm);` : `lines := lines || (${q(`refused: ${what}: `)} || sqlerrm);`}
  END;`).join('\n')
  return `DO $owner_proof$
DECLARE
  lines text[] := '{}';
  fails text[] := '{}';
BEGIN
  ${green ? `EXECUTE $w4_mig$${migration}$w4_mig$;\n  lines := lines || 'the migration ran as written, its own post-condition passing'::text;` : ''}
  PERFORM set_config('request.jwt.claims', json_build_object('sub', '${OWNER}', 'role', 'authenticated')::text, true);
  EXECUTE 'set local role authenticated';
${probes}
  EXECUTE 'reset role';
  RAISE EXCEPTION 'PROOF ${green ? 'GREEN' : 'RED'} (% failure(s), rolled back):%', coalesce(array_length(fails, 1), 0),
    array_to_string(array(select ' FAIL ' || x from unnest(fails) x) || array(select ' ' || x from unnest(lines) x), ' | ');
END
$owner_proof$;`
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
