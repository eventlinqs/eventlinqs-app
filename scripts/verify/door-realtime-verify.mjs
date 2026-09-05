/**
 * PROVE MIGRATION 20260905000002 (multi-scanner realtime) ON TEST, END TO END,
 * WITH REAL SESSIONS ON A REAL SOCKET.
 *
 *   1. door_realtime_enabled() answers true to a signed-in staff member and is
 *      refused to anon.
 *   2. THE FEED: a staff session subscribes to the event's channel (the same
 *      channel name and filter the scanner uses); a second staff session, on
 *      another device id, admits a ticket through scan_ticket with its device
 *      id; the row arrives at the first session within the wait, carrying the
 *      device id, and the door list now returns ticket_id for it.
 *   3. THE FILTER: a scan on a different event does not arrive.
 *   4. THE POLICY: a stranger's subscription on the same channel receives
 *      nothing while the staff session receives the next row.
 *   5. THE OLD CALL SHAPE: scan_ticket with three arguments still resolves.
 *
 * Everything it creates (three users, a membership, an order with tickets,
 * the scan rows) is removed at the end, and on failure.
 *
 * Refuses PRODUCTION before it does anything (assertNotProduction).
 * Usage:  node --env-file=.env.local scripts/verify/door-realtime-verify.mjs
 */
import { assertNotProduction } from '../lib/production-write-preflight.mjs'
import { createClient } from '@supabase/supabase-js'
import { randomBytes } from 'node:crypto'

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
const stamp = Date.now().toString(36)
const cleanup = []
const WAIT_MS = 8000
/** How long after SUBSCRIBED the first scan waits, see the warm-up note below. */
const SETTLE_MS = Number(process.env.SETTLE_MS ?? 3000)

async function mintUser(label) {
  const email = `live.${label}.${stamp}@example.com`
  const secret = randomBytes(12).toString('base64url') + '-Aa1'
  const { data, error } = await db.auth.admin.createUser({ email, password: secret, email_confirm: true, user_metadata: { full_name: `Live ${label}` } })
  if (error) throw new Error(`createUser ${label}: ${error.message}`)
  cleanup.push(async () => db.auth.admin.deleteUser(data.user.id))
  const { error: profileErr } = await db.from('profiles').upsert({ id: data.user.id, email, full_name: `Live ${label}` }, { onConflict: 'id' })
  if (profileErr) throw new Error(`profile ${label}: ${profileErr.message}`)
  const session = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { error: signInErr } = await session.auth.signInWithPassword({ email, password: secret })
  if (signInErr) throw new Error(`sign in ${label}: ${signInErr.message}`)
  cleanup.push(async () => session.removeAllChannels())
  return { id: data.user.id, email, session }
}

/** Subscribe as the scanner does and collect rows; resolves once SUBSCRIBED. */
function listen(session, eventId, label) {
  const rows = []
  const statuses = []
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label}: not SUBSCRIBED within ${WAIT_MS} ms (${statuses.join(',') || 'no status'})`)), WAIT_MS)
    const channel = session
      .channel(`door:${eventId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ticket_scans', filter: `event_id=eq.${eventId}` }, (payload) => rows.push(payload.new))
      .subscribe((status, err) => {
        statuses.push(status)
        if (status === 'SUBSCRIBED') {
          clearTimeout(timer)
          resolve({ rows, statuses, channel })
        }
        if (status === 'CHANNEL_ERROR' && err) {
          clearTimeout(timer)
          reject(new Error(`${label}: ${err.message}`))
        }
      })
  })
}

const until = async (test, ms = WAIT_MS) => {
  const started = Date.now()
  while (Date.now() - started < ms) {
    if (test()) return true
    await new Promise((r) => setTimeout(r, 250))
  }
  return test()
}

try {
  // The fixture: two published events with tiers, a manager of the first event's organisation
  // (and of the second's if it is the same organisation), a buyer with tickets on each.
  const { data: events, error: evErr } = await db
    .from('events')
    .select('id, title, organisation_id, ticket_tiers!inner(id, name)')
    .eq('status', 'published')
    .not('organisation_id', 'is', null)
    .limit(2)
  if (evErr || !events || events.length < 2) throw new Error(`need two published events with tiers on TEST: ${evErr?.message ?? events?.length}`)
  const [evA, evB] = events

  const staff = await mintUser('staff')
  const staff2 = await mintUser('staff2')
  const stranger = await mintUser('stranger')
  const buyer = await mintUser('buyer')
  for (const org of new Set([evA.organisation_id, evB.organisation_id])) {
    for (const s of [staff, staff2]) {
      const { error } = await db.from('organisation_members').insert({ organisation_id: org, user_id: s.id, role: 'manager' })
      if (error) throw new Error(`membership: ${error.message}`)
      cleanup.push(async () => db.from('organisation_members').delete().eq('organisation_id', org).eq('user_id', s.id))
    }
  }

  async function ticketsOn(ev, n) {
    const { data: order, error: orderErr } = await db
      .from('orders')
      .insert({ user_id: buyer.id, event_id: ev.id, organisation_id: ev.organisation_id, order_number: `EL-LV${stamp.toUpperCase()}${n}`.slice(0, 16), status: 'confirmed', currency: 'AUD', subtotal_cents: 0, total_cents: 0, confirmed_at: new Date().toISOString() })
      .select('id')
      .single()
    if (orderErr) throw new Error(`order: ${orderErr.message}`)
    cleanup.push(async () => db.from('orders').delete().eq('id', order.id))
    const tier = ev.ticket_tiers[0]
    const { error: itemErr } = await db.from('order_items').insert({ order_id: order.id, ticket_tier_id: tier.id, item_type: 'ticket', item_name: tier.name, quantity: 2, unit_price_cents: 0, total_cents: 0, attendee_email: buyer.email, attendee_first_name: 'Live', attendee_last_name: 'Buyer' })
    if (itemErr) throw new Error(`order_item: ${itemErr.message}`)
    const { error: issueErr } = await db.rpc('issue_tickets_for_order', { p_order_id: order.id })
    if (issueErr) throw new Error(`issue: ${issueErr.message}`)
    const { data: tickets } = await db.from('tickets').select('id, ticket_code, secret').eq('order_id', order.id).order('ticket_code')
    return tickets
  }
  const [a1, a2] = await ticketsOn(evA, 1)
  const [b1] = await ticketsOn(evB, 2)
  console.log(`fixture: event A ${evA.id} (${evA.title}) tickets ${a1.ticket_code}, ${a2.ticket_code}; event B ${evB.id} ticket ${b1.ticket_code}`)

  // 1. The probe.
  const probe = await staff.session.rpc('door_realtime_enabled')
  check('door_realtime_enabled() answers true to signed-in staff', !probe.error && probe.data === true, probe.error?.message ?? String(probe.data))
  const anonProbe = await anon.rpc('door_realtime_enabled')
  check('door_realtime_enabled() is refused to anon', Boolean(anonProbe.error), anonProbe.error?.code ?? 'no error')

  // 2. The feed.
  const doorA = await listen(staff.session, evA.id, 'door A')
  check('a staff session subscribes to the event channel', doorA.statuses.includes('SUBSCRIBED'), doorA.statuses.join(','))
  /*
   * THE WARM-UP. Measured 5 September 2026 on TEST: on the FIRST run after
   * the table joined the publication, a row inserted straight after
   * SUBSCRIBED did not arrive and one inserted ten seconds later did; on the
   * two runs after that the first row arrived 759 ms and 257 ms after the scan,
   * the second with no settle at all. So the gap is the realtime tenant's cold
   * start, not every subscription's. The scanner re-downloads the door list
   * once the channel goes live so nothing admitted in that window is missed
   * either way; this proof keeps a settle it can be run without (SETTLE_MS=0)
   * and prints how long the row took.
   */
  await new Promise((r) => setTimeout(r, SETTLE_MS))
  const scan1 = await staff2.session.rpc('scan_ticket', { p_ticket_code: a1.ticket_code, p_secret: a1.secret, p_event_id: evA.id, p_device_id: 'door-b-device' })
  check('door B admits ticket 1 through scan_ticket with its device id', !scan1.error && scan1.data?.[0]?.result === 'admitted', scan1.error?.message ?? JSON.stringify(scan1.data?.[0]))
  const sentAt = Date.now()
  const arrived = await until(() => doorA.rows.some((r) => r.ticket_id === a1.id))
  const row1 = doorA.rows.find((r) => r.ticket_id === a1.id)
  check(`the row reaches door A over the socket within the wait (settle ${SETTLE_MS} ms)`, arrived, arrived ? `${Date.now() - sentAt} ms after the scan` : `${doorA.rows.length} row(s) arrived`)
  check('the live row carries the result, the event and the device id', row1?.result === 'admitted' && row1?.event_id === evA.id && row1?.device_id === 'door-b-device', JSON.stringify(row1 ? { result: row1.result, device_id: row1.device_id, scanned_offline: row1.scanned_offline } : null))
  const list = await staff.session.rpc('door_validation_set', { p_event_id: evA.id, p_limit: 5000 })
  const listed = (list.data ?? []).find((r) => r.ticket_code === a1.ticket_code)
  check('the door list now returns ticket_id, so the phone can match a live row', !list.error && listed?.ticket_id === a1.id && listed?.status === 'scanned', list.error?.message ?? JSON.stringify(listed ? { ticket_id: listed.ticket_id, status: listed.status } : null))

  // 3. The filter.
  const before = doorA.rows.length
  const scanB = await staff2.session.rpc('scan_ticket', { p_ticket_code: b1.ticket_code, p_secret: b1.secret, p_event_id: evB.id, p_device_id: 'door-b-device' })
  check('a scan on another event is admitted there', !scanB.error && scanB.data?.[0]?.result === 'admitted', scanB.error?.message ?? JSON.stringify(scanB.data?.[0]))
  await new Promise((r) => setTimeout(r, 3000))
  check("door A's channel receives nothing for the other event", doorA.rows.length === before, `${doorA.rows.length - before} row(s) leaked`)

  // 4. The policy.
  const strangerDoor = await listen(stranger.session, evA.id, 'stranger')
  const scan2 = await staff2.session.rpc('scan_ticket', { p_ticket_code: a2.ticket_code, p_secret: a2.secret, p_event_id: evA.id, p_device_id: 'door-b-device' })
  check('door B admits ticket 2', !scan2.error && scan2.data?.[0]?.result === 'admitted', scan2.error?.message ?? JSON.stringify(scan2.data?.[0]))
  const arrived2 = await until(() => doorA.rows.some((r) => r.ticket_id === a2.id))
  await new Promise((r) => setTimeout(r, 2000))
  check('door A receives ticket 2 while the stranger, subscribed to the same channel, receives nothing', arrived2 && strangerDoor.rows.length === 0, `door A ${doorA.rows.length} row(s), stranger ${strangerDoor.rows.length} row(s)`)

  // 5. The old call shape.
  const again = await staff2.session.rpc('scan_ticket', { p_ticket_code: a2.ticket_code, p_secret: a2.secret, p_event_id: evA.id })
  check('scan_ticket with three arguments still resolves (the fourth defaults)', !again.error && again.data?.[0]?.result === 'already_scanned', again.error?.message ?? JSON.stringify(again.data?.[0]))
  const { data: rows } = await db.from('ticket_scans').select('result, device_id').eq('event_id', evA.id).in('ticket_id', [a1.id, a2.id]).order('scanned_at')
  check('the audit rows carry the device id where it was given, and null where it was not', (rows ?? []).filter((r) => r.device_id === 'door-b-device').length === 2 && (rows ?? []).some((r) => r.device_id === null && r.result === 'already_scanned'), JSON.stringify(rows))
} catch (error) {
  failed += 1
  console.error(`FAIL  ${error instanceof Error ? error.message : String(error)}`)
} finally {
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
