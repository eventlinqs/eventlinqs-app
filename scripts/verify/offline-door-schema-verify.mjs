/**
 * PROVE MIGRATION 20260905000001 (offline door validation) ON TEST, BY DRIVING
 * THE RPCS AS REAL USERS AND READING BACK RATHER THAN TRUSTING THE PUSH.
 *
 *   1. ticket_scans carries the eight new columns.
 *   2. THE DOOR LIST: anon is refused, a signed-in stranger is refused, a
 *      manager of the event's organisation gets the list, paged by code, and
 *      every row carries sha256(secret) and never the secret.
 *   3. THE CONFLICT RULE, END TO END: device A admits tickets 1 and 2 offline
 *      and syncs; device B admits tickets 2 and 3 offline and syncs after.
 *      Exactly one 'admitted' row exists per ticket; B's ticket 2 is recorded
 *      already_scanned with review_status needs_review; every ticket is
 *      'scanned'. First sync wins, the second is flagged.
 *   4. A retried batch is replayed, not repeated. A device reject is recorded
 *      and never flagged. A device admit of a code the server cannot match is
 *      not_found and flagged. An oversized batch and a non-array are refused.
 *   5. THE REVIEW: anon and the stranger are refused; the manager resolves the
 *      flag once (true) and cannot resolve it twice (false); the row reads
 *      resolved with the note and the reviewer.
 *
 * Everything it creates (three users, a membership, an order with three
 * tickets, the scan rows) is removed at the end, and on failure.
 *
 * Refuses PRODUCTION before it does anything (assertNotProduction).
 * Usage:  node --env-file=.env.local scripts/verify/offline-door-schema-verify.mjs
 */
import { assertNotProduction } from '../lib/production-write-preflight.mjs'
import { createClient } from '@supabase/supabase-js'
import { createHash, randomBytes, randomUUID } from 'node:crypto'

assertNotProduction()

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const service = process.env.SUPABASE_SERVICE_ROLE_KEY
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
if (!url || !service || !anonKey) {
  console.error('FAIL: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are required (run with --env-file=.env.local).')
  process.exit(1)
}
const db = createClient(url, service, { auth: { persistSession: false } })
const anon = createClient(url, anonKey, { auth: { persistSession: false } })
let failed = 0
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)
  if (!ok) failed += 1
}
const sha = (s) => createHash('sha256').update(s).digest('hex')
const stamp = Date.now().toString(36)
const cleanup = []

/** A throwaway confirmed user with a minted password, signed in through GoTrue. */
async function mintUser(label) {
  const email = `door.${label}.${stamp}@example.com`
  const secret = randomBytes(12).toString('base64url') + '-Aa1'
  const { data, error } = await db.auth.admin.createUser({ email, password: secret, email_confirm: true, user_metadata: { full_name: `Door ${label}` } })
  if (error) throw new Error(`createUser ${label}: ${error.message}`)
  cleanup.push(async () => db.auth.admin.deleteUser(data.user.id))
  const { error: profileErr } = await db.from('profiles').upsert({ id: data.user.id, email, full_name: `Door ${label}` }, { onConflict: 'id' })
  if (profileErr) throw new Error(`profile ${label}: ${profileErr.message}`)
  const session = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { error: signInErr } = await session.auth.signInWithPassword({ email, password: secret })
  if (signInErr) throw new Error(`sign in ${label}: ${signInErr.message}`)
  return { id: data.user.id, email, session }
}

try {
  // 1. The columns.
  const { error: colErr } = await db
    .from('ticket_scans')
    .select('client_scan_id, scanned_offline, device_id, device_scanned_at, review_status, review_note, reviewed_at, reviewed_by')
    .limit(1)
  check('ticket_scans carries the eight new columns', !colErr, colErr ? `${colErr.code} ${colErr.message}` : 'read back')

  // The fixture: a published event with a tier, a manager, a buyer with three tickets.
  const { data: ev, error: evErr } = await db
    .from('events')
    .select('id, slug, title, organisation_id, ticket_tiers!inner(id, name)')
    .eq('status', 'published')
    .not('organisation_id', 'is', null)
    .limit(1)
    .maybeSingle()
  if (evErr || !ev) throw new Error(`no published event with a tier on TEST: ${evErr?.message ?? 'none'}`)
  const tier = ev.ticket_tiers[0]

  const staff = await mintUser('staff')
  const stranger = await mintUser('stranger')
  const buyer = await mintUser('buyer')

  const { error: memberErr } = await db.from('organisation_members').insert({ organisation_id: ev.organisation_id, user_id: staff.id, role: 'manager' })
  if (memberErr) throw new Error(`membership: ${memberErr.message}`)
  cleanup.push(async () => db.from('organisation_members').delete().eq('organisation_id', ev.organisation_id).eq('user_id', staff.id))

  const orderNumber = `EL-DR${stamp.toUpperCase()}`.slice(0, 16)
  const { data: order, error: orderErr } = await db
    .from('orders')
    .insert({
      user_id: buyer.id,
      event_id: ev.id,
      organisation_id: ev.organisation_id,
      order_number: orderNumber,
      status: 'confirmed',
      currency: 'AUD',
      subtotal_cents: 0,
      total_cents: 0,
      confirmed_at: new Date().toISOString(),
    })
    .select('id')
    .single()
  if (orderErr) throw new Error(`order: ${orderErr.message}`)
  cleanup.push(async () => db.from('orders').delete().eq('id', order.id))

  const { error: itemErr } = await db.from('order_items').insert({
    order_id: order.id,
    ticket_tier_id: tier.id,
    item_type: 'ticket',
    item_name: tier.name,
    quantity: 3,
    unit_price_cents: 0,
    total_cents: 0,
    attendee_email: buyer.email,
    attendee_first_name: 'Door',
    attendee_last_name: 'Buyer',
  })
  if (itemErr) throw new Error(`order_item: ${itemErr.message}`)
  const { error: issueErr } = await db.rpc('issue_tickets_for_order', { p_order_id: order.id })
  if (issueErr) throw new Error(`issue: ${issueErr.message}`)
  const { data: tickets, error: ticketsErr } = await db.from('tickets').select('id, ticket_code, secret, status').eq('order_id', order.id).order('ticket_code')
  if (ticketsErr || !tickets || tickets.length !== 3) throw new Error(`tickets: ${ticketsErr?.message ?? `${tickets?.length} issued`}`)
  const [t1, t2, t3] = tickets
  console.log(`fixture: event ${ev.id} (${ev.title}), tickets ${tickets.map((t) => t.ticket_code).join(', ')}`)

  // 2. The door list.
  const { error: anonSetErr } = await anon.rpc('door_validation_set', { p_event_id: ev.id })
  check('door_validation_set is refused to anon', Boolean(anonSetErr), anonSetErr?.code ?? 'no error')
  const { error: strangerSetErr } = await stranger.session.rpc('door_validation_set', { p_event_id: ev.id })
  check('a signed-in stranger is refused the door list', Boolean(strangerSetErr) && /not_authorised/.test(strangerSetErr.message), strangerSetErr?.message ?? 'no error')

  const page1 = await staff.session.rpc('door_validation_set', { p_event_id: ev.id, p_limit: 2 })
  check('a manager of the organisation gets the door list, paged', !page1.error && page1.data?.length === 2, page1.error?.message ?? `${page1.data?.length} rows`)
  const page2 = await staff.session.rpc('door_validation_set', { p_event_id: ev.id, p_after_code: page1.data?.[1]?.ticket_code, p_limit: 2 })
  check('the second page starts after the first', !page2.error && (page2.data ?? []).every((r) => r.ticket_code > page1.data[1].ticket_code), page2.error?.message ?? `${page2.data?.length} rows`)

  const all = []
  let after = null
  for (let i = 0; i < 50; i += 1) {
    const { data, error } = await staff.session.rpc('door_validation_set', { p_event_id: ev.id, p_after_code: after ?? undefined, p_limit: 5000 })
    if (error) throw new Error(`door_validation_set: ${error.message}`)
    all.push(...data)
    if (data.length < 5000) break
    after = data[data.length - 1].ticket_code
  }
  const mine = tickets.map((t) => all.find((r) => r.ticket_code === t.ticket_code))
  check('the list carries the three fixture tickets', mine.every(Boolean), `${all.length} rows on the event`)
  check('every row carries sha256(secret), never the secret', mine.every((r, i) => r && r.secret_hash === sha(tickets[i].secret)) && all.every((r) => !('secret' in r)), mine[0]?.secret_hash?.slice(0, 12))
  check('the rows say valid and carry the tier name', mine.every((r) => r && r.status === 'valid' && r.tier_name === tier.name))

  // 3. The conflict rule.
  const item = (t, device, id, offlineResult = 'admitted', code = t.ticket_code) => ({
    client_scan_id: id,
    ticket_code: code,
    secret_hash: sha(t.secret),
    device_id: device,
    scanned_at: new Date(Date.now() - 60_000).toISOString(),
    offline_result: offlineResult,
  })
  const a1 = randomUUID(), a2 = randomUUID(), b2 = randomUUID(), b3 = randomUUID()
  const syncA = await staff.session.rpc('sync_offline_scans', { p_event_id: ev.id, p_scans: [item(t1, 'device-a', a1), item(t2, 'device-a', a2)] })
  check('device A syncs two admissions and both are admitted', !syncA.error && syncA.data?.length === 2 && syncA.data.every((o) => o.result === 'admitted' && o.needs_review === false), syncA.error?.message ?? JSON.stringify(syncA.data?.map((o) => o.result)))

  const syncB = await staff.session.rpc('sync_offline_scans', { p_event_id: ev.id, p_scans: [item(t2, 'device-b', b2), item(t3, 'device-b', b3)] })
  const outB2 = syncB.data?.find((o) => o.client_scan_id === b2)
  const outB3 = syncB.data?.find((o) => o.client_scan_id === b3)
  check('device B, syncing second, has ticket 2 recorded already_scanned and flagged for review', !syncB.error && outB2?.result === 'already_scanned' && outB2?.needs_review === true, syncB.error?.message ?? JSON.stringify(outB2))
  check('device B has ticket 3 admitted', outB3?.result === 'admitted' && outB3?.needs_review === false, JSON.stringify(outB3))
  check('the flagged answer carries the first admission time', typeof outB2?.first_scanned_at === 'string')

  const { data: scanRows } = await db
    .from('ticket_scans')
    .select('ticket_id, result, review_status, scanned_offline, client_scan_id, device_id, device_scanned_at')
    .in('client_scan_id', [a1, a2, b2, b3])
  const admittedFor = (t) => (scanRows ?? []).filter((r) => r.ticket_id === t.id && r.result === 'admitted').length
  check('exactly one admitted row per ticket', admittedFor(t1) === 1 && admittedFor(t2) === 1 && admittedFor(t3) === 1, `${admittedFor(t1)}, ${admittedFor(t2)}, ${admittedFor(t3)}`)
  check('every synced row says scanned_offline with its device', (scanRows ?? []).length === 4 && scanRows.every((r) => r.scanned_offline === true && r.device_id && r.device_scanned_at))
  const { data: after1 } = await db.from('tickets').select('ticket_code, status, first_scanned_at, scan_count').eq('order_id', order.id)
  check('all three tickets are scanned, once each', (after1 ?? []).every((t) => t.status === 'scanned' && t.first_scanned_at && t.scan_count === 1), JSON.stringify(after1?.map((t) => [t.status, t.scan_count])))

  // 4. Replay, a device reject, an unmatched admit, a bad batch.
  const replay = await staff.session.rpc('sync_offline_scans', { p_event_id: ev.id, p_scans: [item(t1, 'device-a', a1), item(t2, 'device-a', a2)] })
  check('a retried batch is replayed from the rows already written', !replay.error && replay.data?.every((o) => o.replayed === true && o.result === 'admitted'), replay.error?.message ?? JSON.stringify(replay.data?.map((o) => o.replayed)))
  const { count: afterReplay } = await db.from('ticket_scans').select('id', { count: 'exact', head: true }).in('client_scan_id', [a1, a2])
  check('the replay wrote no new rows', afterReplay === 2, `${afterReplay} rows`)

  const rejectId = randomUUID()
  const rej = await staff.session.rpc('sync_offline_scans', { p_event_id: ev.id, p_scans: [item(t1, 'device-b', rejectId, 'already_scanned')] })
  check('a device reject is recorded as the server sees it and never flagged', !rej.error && rej.data?.[0]?.result === 'already_scanned' && rej.data?.[0]?.needs_review === false, rej.error?.message ?? JSON.stringify(rej.data?.[0]))

  const ghostId = randomUUID()
  const ghost = await staff.session.rpc('sync_offline_scans', { p_event_id: ev.id, p_scans: [item(t1, 'device-b', ghostId, 'admitted', 'EL-ZZZZ-ZZZZ')] })
  check('a device admit of a code the server cannot match is not_found and flagged', !ghost.error && ghost.data?.[0]?.result === 'not_found' && ghost.data?.[0]?.needs_review === true, ghost.error?.message ?? JSON.stringify(ghost.data?.[0]))
  const { data: ghostRow } = await db.from('ticket_scans').select('ticket_id, review_status').eq('client_scan_id', ghostId).maybeSingle()
  check('the unmatched admit is on record with no ticket and needs_review', ghostRow?.ticket_id === null && ghostRow?.review_status === 'needs_review')

  const tooMany = await staff.session.rpc('sync_offline_scans', { p_event_id: ev.id, p_scans: Array.from({ length: 501 }, () => item(t1, 'device-b', randomUUID())) })
  check('more than 500 scans in one call is refused', Boolean(tooMany.error) && /too_many_scans/.test(tooMany.error.message), tooMany.error?.message ?? 'accepted')
  const notArray = await staff.session.rpc('sync_offline_scans', { p_event_id: ev.id, p_scans: { surprise: true } })
  check('a non-array is refused', Boolean(notArray.error) && /scans_not_an_array/.test(notArray.error.message), notArray.error?.message ?? 'accepted')
  const { error: anonSyncErr } = await anon.rpc('sync_offline_scans', { p_event_id: ev.id, p_scans: [] })
  check('sync_offline_scans is refused to anon', Boolean(anonSyncErr), anonSyncErr?.code ?? 'no error')
  const strangerSync = await stranger.session.rpc('sync_offline_scans', { p_event_id: ev.id, p_scans: [item(t3, 'device-x', randomUUID())] })
  check('a stranger cannot sync scans onto the event', Boolean(strangerSync.error) && /not_authorised/.test(strangerSync.error.message), strangerSync.error?.message ?? 'accepted')

  // 5. The review.
  const { data: flagged } = await db.from('ticket_scans').select('id').eq('client_scan_id', b2).single()
  const { error: anonResolveErr } = await anon.rpc('resolve_scan_review', { p_scan_id: flagged.id, p_note: 'x' })
  check('resolve_scan_review is refused to anon', Boolean(anonResolveErr), anonResolveErr?.code ?? 'no error')
  const strangerResolve = await stranger.session.rpc('resolve_scan_review', { p_scan_id: flagged.id, p_note: 'x' })
  check('a stranger cannot resolve the flag', Boolean(strangerResolve.error) && /not_authorised/.test(strangerResolve.error.message), strangerResolve.error?.message ?? 'accepted')
  const resolved = await staff.session.rpc('resolve_scan_review', { p_scan_id: flagged.id, p_note: '  Same guest came back through the second door  ' })
  check('the manager resolves the flag', !resolved.error && resolved.data === true, resolved.error?.message ?? String(resolved.data))
  const again = await staff.session.rpc('resolve_scan_review', { p_scan_id: flagged.id, p_note: 'again' })
  check('resolving it a second time answers false, changing nothing', !again.error && again.data === false, again.error?.message ?? String(again.data))
  const { data: resolvedRow } = await db.from('ticket_scans').select('review_status, review_note, reviewed_by, reviewed_at').eq('id', flagged.id).single()
  check('the row reads resolved with the trimmed note and the reviewer', resolvedRow?.review_status === 'resolved' && resolvedRow?.review_note === 'Same guest came back through the second door' && resolvedRow?.reviewed_by === staff.id && Boolean(resolvedRow?.reviewed_at), JSON.stringify(resolvedRow))
} catch (error) {
  failed += 1
  console.error(`FAIL  ${error instanceof Error ? error.message : String(error)}`)
} finally {
  // Scan rows with no ticket (the not_found one) are not cascaded by the order delete.
  await db.from('ticket_scans').delete().is('ticket_id', null).like('device_id', 'device-%').gte('scanned_at', new Date(Date.now() - 15 * 60_000).toISOString())
  for (const step of cleanup.reverse()) {
    try {
      await step()
    } catch (error) {
      console.error(`cleanup: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  console.log('fixture removed')
}

console.log(failed === 0 ? '\nALL CHECKS PASSED' : `\n${failed} CHECK(S) FAILED`)
process.exit(failed === 0 ? 0 : 1)
