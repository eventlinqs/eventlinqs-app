// THE SECURITY GRANTS HOTFIX, PROVED RED THEN GREEN ON TEST (window 4, 25 October 2026).
//
// supabase/migrations/20261023000006_security_grants_hotfix.sql closes what production's catalogue showed
// on 25 October: table level select on organisations, venues, seats and event_artists for anon and
// authenticated, and EXECUTE on SECURITY DEFINER functions meant for the service role. TEST was rebuilt
// without that table level select, so a proof on TEST as it stands would pass with or without the file.
// So both runs first REPLAY PRODUCTION'S GRANTS on TEST (the table level select, and anon's own EXECUTE on
// transfer_ticket, the one function grant production holds and TEST does not), then:
//
//   red    probes as anon and as authenticated with nothing else changed: every private column readable,
//          every function reachable, and anon CONFIRMS A REAL PENDING ORDER and its tickets are minted;
//   green  runs the migration file exactly as written, then the same probes: every private column and
//          every function refused, every public column still readable by both roles, scan_ticket and
//          transfer_ticket still reachable by a signed in user, and the service role confirms the same
//          pending order with its tickets minted, so the paid path still works.
//
// Each run is ONE DO block that ends by RAISING its verdict, so everything in it, the replay, the file and
// the confirmed order, is rolled back and TEST is left as found. A function is probed without running its
// body ("select f(...) where random() < 0": the privilege is checked when the expression is compiled, and no
// row ever calls it), except confirm_order, which is called for real on the pending order.
//
// TEST ONLY: the project ref is a constant and production's ref is refused outright.
// Usage (the token is never printed):
//   scripts\ops\with-supabase-token.ps1 node scripts/verify/security-grants-hotfix-proof.mjs red
//   scripts\ops\with-supabase-token.ps1 node scripts/verify/security-grants-hotfix-proof.mjs green
import { readFileSync } from 'node:fs'

const REF = 'vkapkibzokmfaxqogypq'
const PRODUCTION_REF = 'gndnldyfudbytbboxesk'
if (REF === PRODUCTION_REF) throw new Error('this proof runs on TEST only, never on production')
const MIGRATION = 'supabase/migrations/20261023000006_security_grants_hotfix.sql'
const mode = process.argv[2]
const token = process.env.SUPABASE_ACCESS_TOKEN

const PRIVATE = {
  organisations: ['email', 'phone', 'owner_id', 'abn', 'legal_name', 'stripe_account_id', 'stripe_charges_enabled', 'payout_destination', 'hold_amount_cents', 'total_volume_cents'],
  venues: ['stripe_account_id', 'stripe_account_country', 'stripe_payouts_enabled', 'revenue_share_status', 'revenue_share_enrolled_at', 'revenue_share_unenrolled_at'],
  seats: ['held_by_user_id', 'reservation_id', 'order_item_id', 'metadata'],
  event_artists: ['invite_token'],
}
const PUBLIC = {
  organisations: ['id', 'name', 'slug', 'description', 'logo_url', 'website', 'instagram_handle', 'short_name'],
  venues: ['id', 'name', 'description', 'image_url', 'capacity', 'address', 'city', 'state', 'country', 'postal_code', 'latitude', 'longitude', 'organisation_id', 'is_active', 'created_at', 'updated_at'],
  seats: ['id', 'event_id', 'seat_map_section_id', 'ticket_tier_id', 'row_label', 'seat_number', 'seat_type', 'status', 'x', 'y', 'price_cents', 'held_reason', 'note', 'created_at', 'updated_at'],
  event_artists: ['id', 'event_id', 'artist_id', 'billing_order', 'status', 'created_at'],
}
const SERVICE_ONLY = [
  'confirm_order(uuid)', 'issue_tickets_for_order(uuid)', 'transition_payment_status(uuid, payment_status, jsonb)',
  'increment_sold_count(uuid, integer)', 'increment_discount_uses(uuid)', 'assign_order_seats(uuid)',
  'reassign_ticket_seat(uuid, uuid)', 'materialize_seats(uuid, uuid)', 'release_expired_seat_reservations()',
  'expire_stale_squads()', 'reconcile_refund(text, text, bigint)',
  'create_refund_request(uuid, uuid[], refund_reason, refund_initiator, uuid, text)',
  'freeze_chargeback(uuid, text, bigint)', 'resolve_chargeback(text, text)', 'disburse_payout(uuid, text, bigint, uuid)',
  'disburse_transfer(uuid, uuid, text, bigint, uuid)', 'disburse_venue_share(uuid, uuid, text, bigint, uuid)',
  'void_payout(uuid, text, text)', 'void_venue_payout(uuid, text, text)', 'release_holds()',
  'organiser_available_balance(uuid, text)', 'organiser_event_available_balance(uuid, uuid, text)',
  'venue_event_share_balance(uuid, uuid, text)',
  'write_pricing_rule(text, text, text, text, uuid, uuid, uuid, numeric, bigint, bigint)', 'claim_founding_spot(uuid, text)',
  'record_marketing_decline(text, text, text, text, timestamp with time zone)', 'refresh_audience_member(text)',
  'directory_artists_ranked_by_draw(text, text, boolean, boolean, integer)',
]
const NEVER_ANON = ['increment_sold_count(uuid, integer)', 'increment_discount_uses(uuid)']
const SIGNED_IN = ['scan_ticket(text, uuid, uuid, text)', 'transfer_ticket(uuid, text, text)']

/** "f(a, b)" called with a typed null for every argument, never run: the privilege is checked at compile. */
const unrunCall = (sig) => {
  const [, name, args] = sig.match(/^(\w+)\((.*)\)$/)
  const nulls = args ? args.split(', ').map((t) => `null::${t}`).join(', ') : ''
  return `select public.${name}(${nulls}) where random() < 0`
}
const q = (s) => `'${s.replace(/'/g, "''")}'`
/** A text literal an array can take: text[] || 'x' reads the literal as an array. */
const t = (s) => `${q(s)}::text`

function proofSql(withMigration, migration) {
  const tableProbes = []
  for (const role of ['anon', 'authenticated']) {
    tableProbes.push(`execute 'set local role ${role}';`)
    for (const [tbl, cols] of Object.entries(PRIVATE)) {
      for (const col of cols) {
        tableProbes.push(`begin
  execute ${q(`select count(${col}) from (select ${col} from public.${tbl} limit 50) s`)} into n;
  ${withMigration ? `fails := fails || ${t(`${role} READ private ${tbl}.${col}`)};` : `lines := lines || (${q(`${role} reads private ${tbl}.${col}: `)} || n || ' value(s) in the first 50 rows it can see');`}
exception when insufficient_privilege then
  ${withMigration ? `lines := lines || ${t(`${role} refused ${tbl}.${col}`)};` : `fails := fails || ${t(`${role} REFUSED ${tbl}.${col} before the file (replay did not take)`)};`}
end;`)
      }
      tableProbes.push(`begin
  execute ${q(`select ${PUBLIC[tbl].join(', ')} from public.${tbl} limit 1`)};
  lines := lines || ${t(`${role} reads public ${tbl} (${PUBLIC[tbl].length} columns)`)};
exception when insufficient_privilege then
  fails := fails || (${q(`${role} LOST public ${tbl}: `)} || sqlerrm);
end;`)
      if (role === 'anon' || tbl === 'seats') {
        tableProbes.push(`begin
  execute ${q(`delete from public.${tbl} where random() < 0`)};
  ${withMigration ? `fails := fails || ${t(`${role} CAN DELETE ${tbl}`)};` : `lines := lines || ${t(`${role} holds delete on ${tbl}`)};`}
exception when insufficient_privilege then
  ${withMigration ? `lines := lines || ${t(`${role} refused delete on ${tbl}`)};` : `fails := fails || ${t(`${role} REFUSED delete on ${tbl} before the file`)};`}
end;`)
      }
    }
    const fns = role === 'anon' ? [...SERVICE_ONLY, ...SIGNED_IN] : SERVICE_ONLY
    for (const sig of fns) {
      // Production granted these two to authenticated only (read 25 October 04:40), so anon is refused
      // them before the file as well as after it.
      if (role === 'anon' && NEVER_ANON.includes(sig)) {
        tableProbes.push(`begin
  execute ${q(unrunCall(sig))};
  fails := fails || ${t(`anon REACHES ${sig}`)};
exception when insufficient_privilege then
  lines := lines || ${t(`anon refused ${sig} (never granted to anon)`)};
end;`)
        continue
      }
      tableProbes.push(`begin
  execute ${q(unrunCall(sig))};
  ${withMigration ? `fails := fails || ${t(`${role} REACHES ${sig}`)};` : `lines := lines || ${t(`${role} reaches ${sig}`)};`}
exception when insufficient_privilege then
  ${withMigration ? `lines := lines || ${t(`${role} refused ${sig}`)};` : `fails := fails || ${t(`${role} REFUSED ${sig} before the file`)};`}
end;`)
    }
    if (role === 'authenticated') {
      for (const sig of SIGNED_IN) {
        tableProbes.push(`begin
  execute ${q(unrunCall(sig))};
  lines := lines || ${t(`authenticated still reaches ${sig}`)};
exception when insufficient_privilege then
  fails := fails || ${t(`authenticated LOST ${sig}`)};
end;`)
      }
    }
    tableProbes.push(`execute 'reset role';`)
  }

  // The real call: a pending order with items, confirmed by anon (red) or refused to anon and confirmed by
  // the service role (green). Rolled back with everything else.
  const confirm = `select o.id into pending from public.orders o
 where o.status = 'pending' and exists (select 1 from public.order_items i where i.order_id = o.id)
 order by o.created_at desc limit 1;
if pending is null then
  fails := fails || 'NO pending order with items on TEST to confirm'::text;
else
  select count(*) into before_n from public.tickets where order_id = pending;
  execute 'set local role anon';
  begin
    execute format('select public.confirm_order(%L::uuid)', pending) into ok;
    execute 'reset role';
    select count(*) into after_n from public.tickets where order_id = pending;
    select status::text into st from public.orders where id = pending;
    ${withMigration
      ? `fails := fails || ('anon CONFIRMED pending order ' || pending || ': ' || st || ', tickets ' || before_n || ' -> ' || after_n);`
      : `lines := lines || ('anon confirmed pending order ' || pending || ' with the anon role: status ' || st || ', tickets ' || before_n || ' -> ' || after_n);
    if st <> 'confirmed' or after_n <= before_n then fails := fails || 'anon call did not confirm and mint'::text; end if;`}
  exception when insufficient_privilege then
    execute 'reset role';
    ${withMigration
      ? `lines := lines || ('anon refused confirm_order on pending order ' || pending || ': ' || sqlerrm);`
      : `fails := fails || ('anon REFUSED confirm_order before the file: ' || sqlerrm);`}
  end;
  ${withMigration ? `execute 'set local role service_role';
  execute format('select public.confirm_order(%L::uuid)', pending) into ok;
  execute 'reset role';
  select count(*) into after_n from public.tickets where order_id = pending;
  select status::text into st from public.orders where id = pending;
  lines := lines || ('service_role confirmed the same order: status ' || st || ', tickets ' || before_n || ' -> ' || after_n);
  if st <> 'confirmed' or after_n <= before_n then fails := fails || 'SERVICE ROLE could not confirm and mint'::text; end if;` : ''}
end if;`

  return `DO $grants_proof$
DECLARE
  lines text[] := '{}';
  fails text[] := '{}';
  n bigint;
  pending uuid;
  before_n bigint;
  after_n bigint;
  st text;
  ok boolean;
BEGIN
  -- Production's grants, replayed (read 25 October 2026 from production's catalogue).
  EXECUTE 'grant select on public.organisations, public.venues, public.seats, public.event_artists to anon, authenticated';
  EXECUTE 'grant execute on function public.transfer_ticket(uuid, text, text) to anon';
  ${withMigration ? `EXECUTE $wi_mig$${migration}$wi_mig$;\n  lines := lines || 'the migration ran as written, its own post-condition passing'::text;` : ''}
${tableProbes.join('\n')}
${confirm}
  RAISE EXCEPTION 'PROOF ${withMigration ? 'GREEN' : 'RED'} (% failure(s), rolled back):%', coalesce(array_length(fails, 1), 0),
    array_to_string(array(select ' FAIL ' || x from unnest(fails) x) || array(select ' ' || x from unnest(lines) x), ' | ');
END
$grants_proof$;`
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
  if (migration.includes('$wi_mig$')) throw new Error('the migration holds the quoting tag')
  const sql = proofSql(mode === 'green', migration)
  console.log(`target TEST (${REF}), ${mode.toUpperCase()}: one transaction, rolled back by its own verdict`)
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql, read_only: false }),
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
