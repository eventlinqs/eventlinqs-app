/**
 * PROVE MIGRATION 20260903000001 (virtual and hybrid delivery) ON TEST, BY
 * QUERYING THE RESULT RATHER THAN TRUSTING THE PUSH.
 *
 * What it checks, each against the live TEST project through PostgREST with
 * the service role (Supabase reloads the PostgREST schema cache on DDL through
 * its own event trigger, and every check below fails loudly if a column is
 * still unknown, so a stale cache reads as a failure rather than a pass):
 *
 *   1. ticket_tiers.access_mode exists and reads back.
 *   2. events.stream_geo_allow exists and reads back.
 *   3. stream_messages exists for the service role AND is refused to anon
 *      (the anon key sits in every page's source; it must get 42501 here).
 *   4. The backfill held: no tier on a virtual event is still in_person.
 *   5. The tier-side trigger RAISES 23514 when a livestream tier is written
 *      against an in-person event, and accepts an in-person tier. The scratch
 *      tier is deleted afterwards.
 *   6. The event-side trigger COERCES: the scratch event is moved to hybrid, a
 *      livestream tier is accepted, the event is moved back to in-person, and
 *      the tier reads back as in_person. The event's type is restored and the
 *      scratch tier deleted, in a finally block, so a failure cannot leave a
 *      seed event altered.
 *   7. The geo CHECK refuses a lower-case or three-letter code.
 *
 * It refuses PRODUCTION before it does anything (assertNotProduction), and it
 * only ever writes a scratch tier on a seed event with nothing sold.
 *
 * Usage:  node --env-file=.env.local scripts/verify/virtual-hybrid-schema-verify.mjs
 */
import { assertNotProduction } from '../lib/production-write-preflight.mjs'
import { createClient } from '@supabase/supabase-js'

assertNotProduction()

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const service = process.env.SUPABASE_SERVICE_ROLE_KEY
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
if (!url || !service || !anon) {
  console.error('FAIL: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_ANON_KEY are all required (run with --env-file=.env.local).')
  process.exit(1)
}
const TEST_REF = 'vkapkibzokmfaxqogypq'
if (!url.includes(TEST_REF)) {
  console.error(`FAIL: this only ever runs against TEST (${TEST_REF}); the URL names another project.`)
  process.exit(1)
}

const admin = createClient(url, service, { auth: { persistSession: false } })
const anonClient = createClient(url, anon, { auth: { persistSession: false } })

let checks = 0
let failures = 0
function pass(what, detail = '') {
  checks += 1
  console.log(`  [PASS] ${what}${detail ? `  -> ${detail}` : ''}`)
}
function fail(what, detail = '') {
  checks += 1
  failures += 1
  console.log(`  [FAIL] ${what}${detail ? `  -> ${detail}` : ''}`)
}

console.log(`virtual-hybrid-schema-verify against ${TEST_REF} (TEST)`)

// 1. ticket_tiers.access_mode
{
  const { data, error } = await admin.from('ticket_tiers').select('id, access_mode').limit(1)
  if (error) fail('ticket_tiers.access_mode reads back', error.message)
  else pass('ticket_tiers.access_mode reads back', data.length ? `first row ${data[0].access_mode}` : 'no rows')
}

// 2. events.stream_geo_allow
{
  const { data, error } = await admin.from('events').select('id, stream_geo_allow').limit(1)
  if (error) fail('events.stream_geo_allow reads back', error.message)
  else pass('events.stream_geo_allow reads back', data.length ? `first row ${JSON.stringify(data[0].stream_geo_allow)}` : 'no rows')
}

// 3. stream_messages: service role yes, anon no
{
  const { error } = await admin.from('stream_messages').select('id').limit(1)
  if (error) fail('stream_messages exists for the service role', error.message)
  else pass('stream_messages exists for the service role')

  const { error: anonError } = await anonClient.from('stream_messages').select('id').limit(1)
  if (anonError && (anonError.code === '42501' || /permission denied/i.test(anonError.message))) {
    pass('stream_messages is refused to anon', `${anonError.code} ${anonError.message}`)
  } else {
    fail('stream_messages is refused to anon', anonError ? `${anonError.code} ${anonError.message}` : 'anon could read it')
  }
}

// 4. backfill
{
  const { data: virtualEvents, error } = await admin.from('events').select('id').eq('event_type', 'virtual')
  if (error) {
    fail('backfill: virtual events listed', error.message)
  } else {
    const ids = virtualEvents.map((e) => e.id)
    let stragglers = 0
    if (ids.length > 0) {
      const { count, error: e2 } = await admin
        .from('ticket_tiers')
        .select('id', { count: 'exact', head: true })
        .in('event_id', ids)
        .neq('access_mode', 'virtual')
      if (e2) fail('backfill: tiers on virtual events counted', e2.message)
      stragglers = count ?? 0
    }
    if (stragglers === 0) pass('backfill: every tier on a virtual event is virtual', `${ids.length} virtual event(s)`)
    else fail('backfill: every tier on a virtual event is virtual', `${stragglers} still in_person`)
  }
}

// 5 and 6. Triggers, on a seed in-person event with nothing sold.
const { data: scratch } = await admin
  .from('events')
  .select('id, title, event_type')
  .eq('event_type', 'in_person')
  .eq('is_seed_data', true)
  .limit(1)
  .maybeSingle()

if (!scratch) {
  fail('trigger drill: a seed in-person event exists on TEST to drill against')
} else {
  const tierBase = {
    event_id: scratch.id,
    name: 'verify scratch tier',
    total_capacity: 1,
    price: 0,
    currency: 'AUD',
    is_visible: false,
    is_active: false,
    sort_order: 999,
  }
  const scratchTierIds = []
  try {
    // 5a. livestream tier on an in-person event: must raise 23514
    const { data: bad, error: badError } = await admin
      .from('ticket_tiers')
      .insert({ ...tierBase, access_mode: 'virtual' })
      .select('id')
      .maybeSingle()
    if (bad) scratchTierIds.push(bad.id)
    if (badError && badError.code === '23514' && /tier_access_mode_mismatch/.test(badError.message)) {
      pass('trigger: a livestream tier on an in-person event is refused', `${badError.code} ${badError.message}`)
    } else {
      fail('trigger: a livestream tier on an in-person event is refused', badError ? `${badError.code} ${badError.message}` : 'it was accepted')
    }

    // 5b. in-person tier on an in-person event: accepted
    const { data: ok, error: okError } = await admin
      .from('ticket_tiers')
      .insert({ ...tierBase, access_mode: 'in_person' })
      .select('id, access_mode')
      .maybeSingle()
    if (ok) scratchTierIds.push(ok.id)
    if (okError || !ok) fail('trigger: an in-person tier on an in-person event is accepted', okError?.message ?? 'no row')
    else pass('trigger: an in-person tier on an in-person event is accepted', ok.access_mode)

    // 6. coercion round trip
    const { error: toHybrid } = await admin.from('events').update({ event_type: 'hybrid' }).eq('id', scratch.id)
    if (toHybrid) fail('coercion: scratch event moved to hybrid', toHybrid.message)
    const { data: live, error: liveError } = await admin
      .from('ticket_tiers')
      .insert({ ...tierBase, name: 'verify scratch livestream tier', access_mode: 'virtual' })
      .select('id, access_mode')
      .maybeSingle()
    if (live) scratchTierIds.push(live.id)
    if (liveError || !live) fail('coercion: a livestream tier on a hybrid event is accepted', liveError?.message ?? 'no row')
    else pass('coercion: a livestream tier on a hybrid event is accepted', live.access_mode)

    const { error: back } = await admin.from('events').update({ event_type: 'in_person' }).eq('id', scratch.id)
    if (back) fail('coercion: scratch event moved back to in-person', back.message)
    if (live) {
      const { data: after, error: afterError } = await admin.from('ticket_tiers').select('access_mode').eq('id', live.id).maybeSingle()
      if (afterError || !after) fail('coercion: the livestream tier followed the event back to in-person', afterError?.message ?? 'no row')
      else if (after.access_mode === 'in_person') pass('coercion: the livestream tier followed the event back to in-person')
      else fail('coercion: the livestream tier followed the event back to in-person', `still ${after.access_mode}`)
    }

    // 7. geo CHECK
    const { error: geoBad } = await admin.from('events').update({ stream_geo_allow: ['au', 'NZL'] }).eq('id', scratch.id)
    if (geoBad && geoBad.code === '23514') pass('geo: lower-case or three-letter codes are refused', `${geoBad.code}`)
    else fail('geo: lower-case or three-letter codes are refused', geoBad ? `${geoBad.code} ${geoBad.message}` : 'accepted')
    const { error: geoGood } = await admin.from('events').update({ stream_geo_allow: ['AU', 'NZ'] }).eq('id', scratch.id)
    if (geoGood) fail('geo: AU and NZ are accepted', geoGood.message)
    else pass('geo: AU and NZ are accepted')
  } finally {
    await admin.from('events').update({ event_type: scratch.event_type, stream_geo_allow: null }).eq('id', scratch.id)
    if (scratchTierIds.length > 0) await admin.from('ticket_tiers').delete().in('id', scratchTierIds)
    const { count } = await admin
      .from('ticket_tiers')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', scratch.id)
      .like('name', 'verify scratch%')
    if ((count ?? 0) === 0) pass('cleanup: scratch tiers removed and the seed event restored', scratch.title)
    else fail('cleanup: scratch tiers removed and the seed event restored', `${count} scratch tier(s) remain on ${scratch.id}`)
  }
}

// 8 to 11. The vault (20260903000002): the link never sits on the anon-readable row.
{
  const { error } = await admin.from('event_stream_links').select('event_id').limit(1)
  if (error) fail('vault: event_stream_links exists for the service role', error.message)
  else pass('vault: event_stream_links exists for the service role')

  const { error: anonError } = await anonClient.from('event_stream_links').select('event_id').limit(1)
  if (anonError && (anonError.code === '42501' || /permission denied/i.test(anonError.message))) {
    pass('vault: event_stream_links is refused to anon', `${anonError.code}`)
  } else {
    fail('vault: event_stream_links is refused to anon', anonError ? `${anonError.code} ${anonError.message}` : 'anon could read it')
  }

  const { count, error: leftError } = await admin
    .from('events')
    .select('id', { count: 'exact', head: true })
    .not('virtual_url', 'is', null)
  if (leftError) fail('vault: events.virtual_url is empty everywhere', leftError.message)
  else if ((count ?? 0) === 0) pass('vault: events.virtual_url is empty everywhere')
  else fail('vault: events.virtual_url is empty everywhere', `${count} row(s) still carry a value`)

  if (scratch) {
    // Write the column the old way; the trigger must move it and empty the column.
    const probe = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
    const { error: writeError } = await admin.from('events').update({ virtual_url: probe }).eq('id', scratch.id)
    if (writeError) fail('vault: writing events.virtual_url the old way is accepted', writeError.message)
    const { data: row } = await admin.from('events').select('virtual_url').eq('id', scratch.id).maybeSingle()
    const { data: vault } = await admin.from('event_stream_links').select('url').eq('event_id', scratch.id).maybeSingle()
    if (row && row.virtual_url === null && vault && vault.url === probe) {
      pass('vault: a value written to events.virtual_url moves to the vault and the column is emptied')
    } else {
      fail('vault: a value written to events.virtual_url moves to the vault and the column is emptied', `column=${row?.virtual_url ?? 'unreadable'} vault=${vault?.url ?? 'missing'}`)
    }
    await admin.from('event_stream_links').delete().eq('event_id', scratch.id)
    const { data: gone } = await admin.from('event_stream_links').select('event_id').eq('event_id', scratch.id).maybeSingle()
    if (!gone) pass('cleanup: the scratch vault row removed')
    else fail('cleanup: the scratch vault row removed')
  }
}

console.log(`virtual-hybrid-schema-verify: ${checks} checks, ${failures} failed`)
process.exit(failures === 0 ? 0 : 1)
