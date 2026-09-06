/**
 * THE EVENT LIFECYCLE, PROVEN AGAINST THE DATABASE (close-out C13.2, C13.3,
 * C13.5, C13.9). Everything here is the DATABASE's behaviour, asked directly,
 * because the interface hiding a button is not enforcement:
 *
 *   1. A delete against an event carrying an order and a ticket is REFUSED by
 *      the database under the SERVICE ROLE, with the trigger's own sentence.
 *   2. A delete of a zero-sales event completes, and afterwards every table
 *      that references events (enumerated live from pg_constraint through
 *      event_referencing_tables(), never from memory) holds ZERO rows for it,
 *      both storage prefixes are empty, the tombstone exists, and its share
 *      link is retired with a null event.
 *   3. An ARCHIVED event is invisible to an anonymous read of events and of
 *      ticket_tiers, and create_reservation refuses it as not on sale.
 *   4. A ticket to that archived event still VALIDATES at the door:
 *      door_validation_set lists it and scan_ticket admits it, as the organiser.
 *   5. Restore returns the event to exactly the status it came from.
 *
 * TEST ONLY. It writes rows, so it goes through assertNotProduction and
 * refuses any project that is not the TEST project. Every row it creates is
 * removed at the end, money records first (the trigger would otherwise refuse
 * the tidy-up, which is itself the proof working).
 *
 * Usage (the shell must not carry a production NEXT_PUBLIC_SUPABASE_URL; Node's
 * --env-file never overrides an existing variable):
 *   env -u NEXT_PUBLIC_SUPABASE_URL -u NEXT_PUBLIC_SUPABASE_ANON_KEY \
 *     node --env-file=.env.local scripts/verify/event-lifecycle-proof.mjs [outDir]
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomBytes, randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { assertNotProduction } from '../lib/production-write-preflight.mjs'

assertNotProduction()

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
if (!URL || !SERVICE || !ANON) throw new Error('NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_ANON_KEY are required')
if (!/vkapkibzokmfaxqogypq/.test(URL)) throw new Error(`refusing to write to ${URL}: this proof runs against TEST only`)

const OUT = process.argv[2] ?? join('C:', 'dev', 'EVIDENCE', 'C13', 'db-proof')
mkdirSync(OUT, { recursive: true })

const admin = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } })
const anon = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } })

const stamp = Date.now().toString(36)
const results = []
function verdict(name, ok, detail) {
  results.push({ name, ok, detail: String(detail ?? '') })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  :: ${detail}` : ''}`)
}
function must(res, what) {
  if (res.error) throw new Error(`${what}: ${res.error.message}`)
  return res.data
}

const password = randomBytes(12).toString('base64url') + '-Aa1'
const created = { userId: null, orgId: null, events: [], orderId: null, itemId: null, ticketId: null, storage: [] }

async function main() {
  // The organiser, an organisation, and a signed-in client for the door.
  const email = `lifecycle.proof.${stamp}@example.com`
  const user = must(await admin.auth.admin.createUser({ email, password, email_confirm: true }), 'createUser').user
  created.userId = user.id
  const org = must(
    await admin.from('organisations').insert({ name: `Lifecycle Proof ${stamp}`, slug: `lifecycle-proof-${stamp}`, owner_id: user.id, status: 'active' }).select('id').single(),
    'create organisation',
  )
  created.orgId = org.id
  const organiser = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } })
  must(await organiser.auth.signInWithPassword({ email, password }), 'sign in as the organiser')

  const start = new Date(Date.now() + 14 * 864e5).toISOString()
  const end = new Date(Date.now() + 14 * 864e5 + 3 * 36e5).toISOString()
  async function makeEvent(label) {
    const slug = `lifecycle-${label}-${stamp}`
    const ev = must(
      await admin
        .from('events')
        .insert({
          title: `Lifecycle ${label} ${stamp}`,
          slug,
          organisation_id: org.id,
          created_by: user.id,
          start_date: start,
          end_date: end,
          timezone: 'Australia/Melbourne',
          status: 'published',
          visibility: 'public',
          is_free: true,
          cover_image_url: 'https://vkapkibzokmfaxqogypq.supabase.co/storage/v1/object/public/event-images/proof/cover.jpg',
          venue_name: 'The Wool Exchange',
          venue_address: '44 Moorabool Street',
          venue_city: 'Geelong',
        })
        .select('id, slug, title')
        .single(),
      `create event ${label}`,
    )
    created.events.push(ev.id)
    const tier = must(
      await admin.from('ticket_tiers').insert({ event_id: ev.id, name: 'General admission', total_capacity: 50, price: 0, currency: 'AUD', tier_type: 'free', is_active: true, is_visible: true }).select('id').single(),
      `tier for ${label}`,
    )
    return { ...ev, tierId: tier.id }
  }

  const withMoney = await makeEvent('sold')
  const zeroSales = await makeEvent('empty')

  // ONE FREE TICKET on the first event: an order, an item, a ticket.
  const order = must(
    await admin
      .from('orders')
      .insert({ event_id: withMoney.id, organisation_id: org.id, order_number: `EL-${stamp.toUpperCase()}`, status: 'confirmed', subtotal_cents: 0, total_cents: 0, currency: 'AUD', guest_email: email, confirmed_at: new Date().toISOString() })
      .select('id')
      .single(),
    'create order',
  )
  created.orderId = order.id
  const item = must(
    await admin.from('order_items').insert({ order_id: order.id, item_name: 'General admission', item_type: 'ticket', quantity: 1, unit_price_cents: 0, total_cents: 0, ticket_tier_id: withMoney.tierId }).select('id').single(),
    'create order item',
  )
  created.itemId = item.id
  const ticketCode = `EL-${stamp.slice(-4).toUpperCase()}-${randomBytes(2).toString('hex').toUpperCase()}`
  const secret = randomUUID()
  const ticket = must(
    await admin.from('tickets').insert({ event_id: withMoney.id, order_id: order.id, order_item_id: item.id, idx_in_item: 0, ticket_code: ticketCode, secret, holder_email: email, holder_name: 'Proof Holder', status: 'valid', ticket_tier_id: withMoney.tierId }).select('id').single(),
    'create ticket',
  )
  created.ticketId = ticket.id

  // Things the zero-sales event owns, so the delete has something to remove:
  // two storage objects, a discount code, a share link, a saved-event row.
  const objects = [`${user.id}/${zeroSales.id}/${stamp}-cover.jpg`, `generated-covers/${zeroSales.id}/${stamp}.jpg`]
  for (const name of objects) {
    must(await admin.storage.from('event-images').upload(name, Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x43]), { contentType: 'image/jpeg', upsert: true }), `upload ${name}`)
    created.storage.push(name)
  }
  must(await admin.from('discount_codes').insert({ event_id: zeroSales.id, organisation_id: org.id, code: `PROOF${stamp.toUpperCase()}`, discount_type: 'percentage', discount_percentage: 10 }), 'discount code')
  const link = must(
    // 'qr' is one of the channels share_links_channel_check admits (migration
    // 20260808000002): the poster's tracked link is the QR channel.
    await admin.from('share_links').insert({ event_id: zeroSales.id, channel: 'qr', code: `p${stamp}`.slice(0, 12), created_by: user.id }).select('id').single(),
    'share link',
  )
  must(await admin.from('saved_events').insert({ event_id: zeroSales.id, user_id: user.id }), 'saved event')

  // 1. The delete with money records is REFUSED under the service role.
  const counts = must(await admin.rpc('event_money_record_counts', { p_event_id: withMoney.id }), 'money counts')
  verdict('event_money_record_counts sees the order and the ticket', counts.orders === 1 && counts.tickets === 1 && counts.total === 2, JSON.stringify(counts))
  const refused = await admin.from('events').delete().eq('id', withMoney.id).select('id')
  verdict(
    'DELETE of an event with an order is refused at the database, under the service role',
    Boolean(refused.error) && /event has money records/.test(refused.error?.message ?? ''),
    refused.error ? `${refused.error.message} (hint ${refused.error.hint ?? 'none'})` : 'THE DELETE WENT THROUGH',
  )
  const stillThere = must(await admin.from('events').select('id').eq('id', withMoney.id).maybeSingle(), 'reread')
  verdict('the refused event is still there', Boolean(stillThere))

  // 2. The zero-sales delete completes and leaves nothing behind.
  const referencing = must(await admin.rpc('event_referencing_tables'), 'event_referencing_tables')
  verdict('the referencing tables are enumerated from pg_constraint', Array.isArray(referencing) && referencing.length >= 30, `${referencing.length} foreign keys`)
  const noAction = referencing.filter((r) => r.on_delete === 'NO ACTION')
  verdict('no foreign key onto events is NO ACTION', noAction.length === 0, noAction.map((r) => r.constraint).join(', ') || 'none')

  const deleted = await admin.from('events').delete().eq('id', zeroSales.id).select('id')
  verdict('DELETE of a zero-sales event completes', !deleted.error && (deleted.data?.length ?? 0) === 1, deleted.error?.message ?? 'one row')
  created.events = created.events.filter((id) => id !== zeroSales.id)

  let orphans = []
  for (const r of referencing) {
    const { count, error } = await admin.from(r.table).select('*', { count: 'exact', head: true }).eq(r.column, zeroSales.id)
    if (error) orphans.push(`${r.table}.${r.column}: ${error.message}`)
    else if ((count ?? 0) > 0) orphans.push(`${r.table}.${r.column}: ${count}`)
  }
  verdict(`zero orphan rows across ${referencing.length} referencing columns after the delete`, orphans.length === 0, orphans.join('; ') || 'all zero')

  /*
   * STORAGE. The row is the database's to refuse or remove; the objects are the
   * application's to sweep (sweepEventStorage in src/lib/upload.ts, a
   * server-only module that cannot load outside Next, so it is driven by the
   * journey, which lists both prefixes after the organiser's own delete). This
   * proof shows the objects were THERE before the delete, removes them by the
   * same two prefixes the sweep uses, and proves the listing is empty after.
   */
  const prefixes = [`${user.id}/${zeroSales.id}`, `generated-covers/${zeroSales.id}`]
  let before = 0
  for (const prefix of prefixes) {
    const { data } = await admin.storage.from('event-images').list(prefix, { limit: 100 })
    before += data?.length ?? 0
  }
  const { data: removed, error: removeError } = await admin.storage.from('event-images').remove(objects)
  let after = 0
  for (const prefix of prefixes) {
    const { data } = await admin.storage.from('event-images').list(prefix, { limit: 100 })
    after += data?.length ?? 0
  }
  verdict(
    'both storage prefixes held the objects before and list empty after the sweep',
    before === 2 && !removeError && (removed?.length ?? 0) === 2 && after === 0,
    `before ${before}, removed ${removed?.length ?? 0}${removeError ? ` (${removeError.message})` : ''}, after ${after}`,
  )
  created.storage = []

  const tomb = must(await admin.from('event_tombstones').select('slug, event_id, status_at_delete').eq('slug', zeroSales.slug).maybeSingle(), 'tombstone')
  verdict('a tombstone was written for the deleted slug', Boolean(tomb) && tomb.event_id === zeroSales.id, JSON.stringify(tomb))
  const anonTomb = await anon.from('event_tombstones').select('slug, deleted_at').eq('slug', zeroSales.slug).maybeSingle()
  verdict('anon can read the tombstone slug and date', !anonTomb.error && Boolean(anonTomb.data), anonTomb.error?.message ?? 'read')
  const anonTitle = await anon.from('event_tombstones').select('title').eq('slug', zeroSales.slug).maybeSingle()
  verdict('anon can NOT read the tombstone title', Boolean(anonTitle.error), anonTitle.error?.message ?? 'THE TITLE WAS READABLE')
  const retired = must(await admin.from('share_links').select('event_id, retired_at').eq('id', link.id).maybeSingle(), 'share link after delete')
  verdict('the share link survives with a null event and a retired_at', Boolean(retired) && retired.event_id === null && Boolean(retired.retired_at), JSON.stringify(retired))

  // 3. Archive the sold event: invisible to anon, not on sale.
  must(await admin.from('events').update({ status: 'archived', archived_at: new Date().toISOString(), archived_from_status: 'published', archived_by: user.id }).eq('id', withMoney.id), 'archive')
  const anonEvent = await anon.from('events').select('id').eq('slug', withMoney.slug).maybeSingle()
  verdict('an archived event is invisible to an anonymous read of events', !anonEvent.error && anonEvent.data === null, anonEvent.error?.message ?? (anonEvent.data ? 'VISIBLE' : 'no row'))
  const anonTiers = await anon.from('ticket_tiers').select('id').eq('event_id', withMoney.id)
  verdict('its tiers are invisible to an anonymous read', !anonTiers.error && (anonTiers.data?.length ?? 0) === 0, anonTiers.error?.message ?? `${anonTiers.data?.length ?? 0} rows`)
  const reservation = must(
    await anon.rpc('create_reservation', { p_event_id: withMoney.id, p_session_id: `proof-${stamp}`, p_items: [{ ticket_tier_id: withMoney.tierId, quantity: 1 }] }),
    'create_reservation',
  )
  verdict('create_reservation refuses the archived event as not on sale', reservation?.success === false && /not on sale/.test(reservation?.error ?? ''), JSON.stringify(reservation))

  // 4. The door still admits its ticket.
  const doorSet = must(await organiser.rpc('door_validation_set', { p_event_id: withMoney.id }), 'door_validation_set')
  verdict('door_validation_set lists the ticket on the archived event', Array.isArray(doorSet) && doorSet.some((r) => r.ticket_code === ticketCode || r.ticket_id === ticket.id), `${Array.isArray(doorSet) ? doorSet.length : 0} rows`)
  const scan = must(await organiser.rpc('scan_ticket', { p_ticket_code: ticketCode, p_secret: secret, p_event_id: withMoney.id, p_device_id: `proof-${stamp}` }), 'scan_ticket')
  const scanRow = Array.isArray(scan) ? scan[0] : scan
  verdict('scan_ticket ADMITS the ticket on the archived event', scanRow?.result === 'admitted', JSON.stringify(scanRow))

  // 5. Restore is exact.
  must(await admin.from('events').update({ status: 'published', archived_at: null, archived_from_status: null, archived_by: null }).eq('id', withMoney.id).eq('status', 'archived'), 'restore')
  const restored = must(await admin.from('events').select('status').eq('id', withMoney.id).single(), 'reread restored')
  verdict('restore returns the event to published', restored.status === 'published', restored.status)
  const pairCheck = await admin.from('events').update({ status: 'archived' }).eq('id', withMoney.id)
  verdict('the CHECK refuses status archived without archived_at', Boolean(pairCheck.error), pairCheck.error?.message ?? 'THE ROW ACCEPTED archived WITHOUT archived_at')
}

async function cleanup() {
  // Money records first: the trigger refuses the event delete while they exist,
  // which is the rule working, so the tidy-up removes them the way a refund and
  // void would, then the event, the organisation and the user.
  try {
    if (created.ticketId) await admin.from('ticket_scans').delete().eq('ticket_id', created.ticketId)
    if (created.ticketId) await admin.from('tickets').delete().eq('id', created.ticketId)
    if (created.itemId) await admin.from('order_items').delete().eq('id', created.itemId)
    if (created.orderId) await admin.from('orders').delete().eq('id', created.orderId)
    for (const id of created.events) {
      const r = await admin.from('events').delete().eq('id', id)
      if (r.error) console.error('cleanup: could not delete event', id, r.error.message)
    }
    if (created.storage.length) await admin.storage.from('event-images').remove(created.storage)
    await admin.from('event_tombstones').delete().like('slug', `lifecycle-%-${stamp}`)
    await admin.from('share_links').delete().eq('code', `p${stamp}`.slice(0, 12))
    if (created.orgId) await admin.from('organisations').delete().eq('id', created.orgId)
    if (created.userId) await admin.auth.admin.deleteUser(created.userId)
  } catch (err) {
    console.error('cleanup failed:', err)
  }
}

let failed = false
try {
  await main()
} catch (err) {
  failed = true
  verdict('the proof ran to the end', false, err instanceof Error ? err.message : String(err))
} finally {
  await cleanup()
}

const passed = results.filter((r) => r.ok).length
writeFileSync(join(OUT, 'results.json'), JSON.stringify({ project: URL, stamp, passed, total: results.length, results }, null, 2))
console.log(`\n${passed} of ${results.length} passed; results in ${join(OUT, 'results.json')}`)
if (failed || passed !== results.length) process.exitCode = 1
