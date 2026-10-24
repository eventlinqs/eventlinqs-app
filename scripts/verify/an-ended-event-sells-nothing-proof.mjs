// AN ENDED EVENT SELLS NOTHING: THE DATABASE PROOF, ON TEST ONLY
// (migration 20261023000001; the project manager's order of 23 October 01:15).
//
// Two fixtures shaped like the production event that exposed the fault (the
// Afro-Fusion showcase: ticketed, one general admission tier at $18, 25 places),
// with ONE difference that matters: the tier has NO sale_end, which is the case
// that sold after the event was over. One fixture ended yesterday, one starts in
// thirty days. Both are published but UNLISTED, named as TEST fixtures, and owned
// by the organisation the checkout gate fixture already uses, so they appear on
// no surface and are never mistaken for real events.
//
// Then it asks create_reservation, the function every ticket path reaches, for
// one ticket to each, and prints exactly what the database answered. Any hold it
// is given is cancelled at once (the trigger releases the place), so the run
// leaves no reservation behind.
//
//   RED (before the migration is on TEST): the ENDED fixture is reserved.
//   GREEN (after): the ENDED fixture answers "This event has ended."; the
//   UPCOMING fixture is still reserved, so the gate stops only what is over.
//
// Usage, from the repository root in PowerShell (the token comes from the
// Supabase CLI's own login and is never printed):
//   scripts\ops\with-supabase-token.ps1 node scripts/verify/an-ended-event-sells-nothing-proof.mjs [--expect red|green] [--scratch]
// --scratch calls this migration's own function from a scratch copy (see
// makeScratchCopy below for why TEST's live one is not main's).
// It writes to TEST only and refuses any other project before it acts.

const TEST_REF = 'vkapkibzokmfaxqogypq'
const TEMPLATE_SLUG = 'gate-fixture-checkout-viewport'
const FIXTURES = [
  { key: 'ended', slug: 'proof-fixture-ended-event-sells-nothing', title: 'Proof fixture: an ended event (TEST only, not a real event)', startDays: -1 },
  { key: 'upcoming', slug: 'proof-fixture-upcoming-event-sells', title: 'Proof fixture: an upcoming event (TEST only, not a real event)', startDays: 30 },
]

class Refusal extends Error {}

const args = process.argv.slice(2)
const SCRATCH = args.includes('--scratch')
const SCRATCH_SCHEMA = 'proof_window4_ended'
const MIGRATION = new URL('../../supabase/migrations/20261023000001_an_ended_event_sells_nothing.sql', import.meta.url)
const expectIdx = args.indexOf('--expect')
const expect = expectIdx >= 0 ? args[expectIdx + 1] : null
if (expect !== null && expect !== 'red' && expect !== 'green') {
  console.error(`REFUSED: --expect takes red or green, got ${JSON.stringify(expect)}`)
  process.exitCode = 2
} else {
  main().then(
    (code) => {
      process.exitCode = code
    },
    (error) => {
      console.error(`${error instanceof Refusal ? 'REFUSED' : 'FAILED'}: ${error.message}`)
      process.exitCode = error instanceof Refusal ? 2 : 1
    },
  )
}

async function query(sql, readOnly = false) {
  const url = `https://api.supabase.com/v1/projects/${TEST_REF}/database/query`
  if (!url.includes(TEST_REF)) throw new Error('REFUSED: this proof writes to TEST only')
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql, read_only: readOnly }),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`TEST query failed (HTTP ${res.status}): ${text.slice(0, 600)}`)
  return JSON.parse(text)
}

/** Make the fixture if it is missing, and set its dates relative to now every run. */
async function ensureFixture(f) {
  const start = `now() + interval '${f.startDays} days'`
  const end = `now() + interval '${f.startDays} days' + interval '150 minutes'`
  await query(`
    do $fixture$
    declare v_cols text; v_id uuid;
    begin
      select id into v_id from public.events where slug = '${f.slug}';
      if v_id is null then
        select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into v_cols
          from information_schema.columns
         where table_schema = 'public' and table_name = 'events' and is_generated = 'NEVER';
        execute format(
          'insert into public.events (%1$s) select %1$s from jsonb_populate_record(null::public.events, $1)',
          v_cols)
        using (select to_jsonb(e) || jsonb_build_object(
                 'id', gen_random_uuid(), 'slug', '${f.slug}', 'title', '${f.title}',
                 'visibility', 'unlisted', 'status', 'draft', 'published_at', null,
                 'scheduled_publish_at', null, 'created_at', now(), 'updated_at', now())
                 from public.events e where e.slug = '${TEMPLATE_SLUG}');
        select id into v_id from public.events where slug = '${f.slug}';
        if v_id is null then raise exception 'the template % is missing on TEST', '${TEMPLATE_SLUG}'; end if;
        insert into public.ticket_tiers (event_id, name, price, total_capacity, sale_start, sale_end)
        values (v_id, 'General admission', 1800, 25, now() - interval '45 days', null);
      end if;
      update public.events
         set start_date = ${start}, end_date = ${end}, visibility = 'unlisted',
             status = 'published', published_at = coalesce(published_at, now())
       where id = v_id;
      update public.ticket_tiers set sale_end = null, is_active = true where event_id = v_id;
    end
    $fixture$;`)
  const [row] = await query(
    `select e.id, e.status, e.visibility, e.start_date, e.end_date, t.id as tier_id, t.sale_end, t.total_capacity - t.sold_count - t.reserved_count as available
       from public.events e join public.ticket_tiers t on t.event_id = e.id where e.slug = '${f.slug}'`,
    true,
  )
  return row
}

/*
 * --scratch: call the migration's OWN create_reservation, copied word for word
 * into a scratch schema, instead of the one TEST runs. Why it exists: TEST's
 * live create_reservation is not main's. lane/b-growth's unmerged migration
 * 20260921000050 dropped the five-argument function on TEST and made a six-argument
 * one (p_group_hold), so applying this migration on TEST adds a SECOND overload
 * and every four-argument call becomes ambiguous ("is not unique", 23 October
 * 01:31). The copy proves this file's SQL exactly, and touches nothing of that
 * lane's. It is dropped again before the run ends, whatever happens.
 */
async function makeScratchCopy() {
  const { readFileSync } = await import('node:fs')
  const text = readFileSync(MIGRATION, 'utf8').replace(/\r\n/g, '\n')
  const start = text.indexOf('CREATE OR REPLACE FUNCTION public.create_reservation(')
  const end = text.indexOf('\n$$;', start)
  if (start < 0 || end < 0) throw new Error('the migration has no create_reservation definition to copy')
  const definition = text.slice(start, end + '\n$$;'.length).replace('FUNCTION public.create_reservation(', `FUNCTION ${SCRATCH_SCHEMA}.create_reservation(`)
  await query(`drop schema if exists ${SCRATCH_SCHEMA} cascade; create schema ${SCRATCH_SCHEMA};`)
  await query(definition)
}

async function tryReserve(f, row) {
  const session = `proof-ended-${f.key}-${Date.now()}`
  const fn = SCRATCH ? `${SCRATCH_SCHEMA}.create_reservation` : 'public.create_reservation'
  const [{ result }] = await query(
    `select ${fn}('${row.id}'::uuid, null, '${session}',
       '[{"ticket_tier_id": "${row.tier_id}", "quantity": 1}]'::jsonb) as result`,
  )
  if (result?.success && result.reservation_id) {
    await query(`update public.reservations set status = 'cancelled' where id = '${result.reservation_id}'`)
  }
  const [{ available }] = await query(
    `select total_capacity - sold_count - reserved_count as available from public.ticket_tiers where id = '${row.tier_id}'`,
    true,
  )
  return { result, availableAfter: available }
}

async function main() {
  if (!process.env.SUPABASE_ACCESS_TOKEN) {
    throw new Refusal('SUPABASE_ACCESS_TOKEN is not in the environment; run through scripts\\ops\\with-supabase-token.ps1')
  }
  const [{ gated }] = await query(
    `select count(*)::int as gated from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname in ('create_reservation', 'create_seat_reservation')
        and pg_get_functiondef(p.oid) like '%This event has ended.%'`,
    true,
  )
  console.log(`TEST ${TEST_REF}: ${gated} of the live reservation functions carry the end gate`)
  if (SCRATCH) {
    await makeScratchCopy()
    console.log(`calling the migration's own create_reservation, copied into ${SCRATCH_SCHEMA}`)
  }
  const out = {}
  try {
    for (const f of FIXTURES) {
      const row = await ensureFixture(f)
      const { result, availableAfter } = await tryReserve(f, row)
      out[f.key] = result
      console.log(
        `${f.key.toUpperCase().padEnd(8)} ${f.slug}: ends ${row.end_date}, tier sale_end ${row.sale_end ?? 'none'}, ` +
          `${row.available} places -> create_reservation answered ${JSON.stringify({ success: result?.success, error: result?.error ?? null })}; ` +
          `${availableAfter} places after (any hold cancelled)`,
      )
    }
  } finally {
    if (SCRATCH) {
      await query(`drop schema if exists ${SCRATCH_SCHEMA} cascade`)
      console.log(`${SCRATCH_SCHEMA} dropped`)
    }
  }
  const endedSold = out.ended?.success === true
  const endedRefused = out.ended?.success === false && out.ended?.error === 'This event has ended.'
  const upcomingSold = out.upcoming?.success === true
  const verdict = endedRefused && upcomingSold ? 'green' : endedSold ? 'red' : 'neither'
  console.log(
    verdict === 'green'
      ? 'GREEN: the ended event is refused with "This event has ended.", the upcoming one still sells'
      : verdict === 'red'
        ? 'RED: the ended event was sold a ticket (the fault as it stands)'
        : 'NEITHER: the answers match neither the fault nor the fix; read them above',
  )
  if (expect === null) return verdict === 'neither' ? 1 : 0
  return verdict === expect ? 0 : 1
}
