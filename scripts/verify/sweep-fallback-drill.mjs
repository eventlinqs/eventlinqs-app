/**
 * THE SWEEP'S REFUSAL PATH, DRIVEN.
 *
 * scripts/ops/sweep-lane-b-fixture-leftovers.mjs has two fallbacks that only run
 * when the database refuses a delete: it ARCHIVES an event it cannot delete and
 * sets an organisation it cannot delete to `pending`. Both take the row out of
 * the sitemap, which is the whole point of the sweep, and neither had ever run:
 * the first real sweep, of the GA5 leftover on 15 September 2026, deleted
 * everything cleanly and never reached them.
 *
 * A code path nobody has executed is a claim, and the standing lesson in
 * CLAUDE.md is that prose does not run. So this builds the refusal on purpose.
 *
 * HOW THE REFUSAL IS BUILT, and the two attempts that did not work are written
 * down because they taught the rule the sweep now holds.
 *
 * FIRST a `refund_requests` row hung off an order, expecting the order delete to
 * be refused. The foreign key cascades, so the request went with the order.
 * THEN a SQUAD with a paid member, which `refuse_event_delete_with_money()`
 * counts. `squads.ticket_tier_id` cascades from the tier the sweep deletes, so
 * that went too. Both times the event deleted cleanly and the fallback never
 * ran.
 *
 * What those two attempts actually showed is that the sweep was REMOVING EVERY
 * MONEY RECORD IN ITS WAY, including four confirmed orders on its first real
 * run. So the sweep changed rather than the drill: an order with a payment or a
 * refund behind it is now kept, the event is archived instead of deleted, and
 * THAT is what this drives. A fixture that took a real test payment is exactly
 * that shape.
 * Run (the shell must not carry the production Supabase URL):
 *   env -u NEXT_PUBLIC_SUPABASE_URL -u NEXT_PUBLIC_SUPABASE_ANON_KEY \
 *     node --env-file=.env.local scripts/verify/sweep-fallback-drill.mjs
 *
 * It cleans up after itself, including the payment that makes the refusal, and
 * it says what it left if it cannot.
 */
import { randomUUID } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'
import { laneFixturesStillPublished } from './lib/sitemap-footprint.mjs'

const PREFIX = 'lane-b-sweepdrill-'
const STAMP = Date.now().toString(36)
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
if (!/vkapkibzokmfaxqogypq/.test(url)) {
  console.error(`FAIL: this drill only touches TEST vkapkibzokmfaxqogypq, not ${url || 'nothing'}`)
  process.exit(1)
}
const db = createClient(url, serviceKey, { auth: { persistSession: false } })

const checks = []
function check(name, ok, detail) {
  checks.push({ name, ok: Boolean(ok), detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${detail}`)
}

const fixture = { ownerId: null, orgId: null, eventId: null, orderId: null, paymentId: null }

try {
  const { data: category } = await db.from('event_categories').select('id').eq('is_active', true).order('sort_order').limit(1).single()
  const { data: city } = await db.from('cities').select('slug').eq('is_active', true).order('display_order').limit(1).single()

  const owner = await db.auth.admin.createUser({
    email: `${PREFIX}owner-${STAMP}@eventlinqs.test`,
    password: `${randomUUID()}Aa1`,
    email_confirm: true,
  })
  if (owner.error) throw new Error(`owner: ${owner.error.message}`)
  fixture.ownerId = owner.data.user.id

  const org = await db
    .from('organisations')
    .insert({ name: `Lane B sweep drill ${STAMP}`, slug: `${PREFIX}org-${STAMP}`, owner_id: fixture.ownerId, status: 'pending' })
    .select('id')
    .single()
  if (org.error) throw new Error(`organisation: ${org.error.message}`)
  fixture.orgId = org.data.id

  const start = new Date(Date.now() + 14 * 86_400_000)
  const event = await db
    .from('events')
    .insert({
      title: `Lane B sweep drill ${STAMP}`,
      slug: `${PREFIX}event-${STAMP}`,
      organisation_id: fixture.orgId,
      created_by: fixture.ownerId,
      category_id: category.id,
      status: 'published',
      visibility: 'unlisted',
      published_at: new Date().toISOString(),
      start_date: start.toISOString(),
      end_date: new Date(start.getTime() + 3 * 3_600_000).toISOString(),
      timezone: 'Australia/Melbourne',
      city_primary: city.slug,
      venue_name: 'Lane B sweep drill room',
      venue_city: city.slug,
      venue_postal_code: '3220',
      summary: 'Built by the sweep fallback drill to make the database refuse a delete. It is removed when the drill ends.',
    })
    .select('id')
    .single()
  if (event.error) throw new Error(`event: ${event.error.message}`)
  fixture.eventId = event.data.id

  const orderId = randomUUID()
  const order = await db.from('orders').insert({
    id: orderId,
    order_number: `EL-SWD${STAMP.slice(-5).toUpperCase()}`,
    event_id: fixture.eventId,
    organisation_id: fixture.orgId,
    guest_email: `${PREFIX}buyer-${STAMP}@eventlinqs.test`,
    guest_name: 'Lane B sweep drill buyer',
    status: 'confirmed',
    confirmed_at: new Date().toISOString(),
    subtotal_cents: 1000,
    total_cents: 1000,
    currency: 'AUD',
  })
  if (order.error) throw new Error(`order: ${order.error.message}`)
  fixture.orderId = orderId

  const payment = await db
    .from('payments')
    .insert({
      order_id: orderId,
      gateway: 'stripe',
      status: 'completed',
      amount_cents: 1000,
      currency: 'AUD',
      idempotency_key: `sweep-drill-${STAMP}`,
    })
    .select('id')
    .single()
  if (payment.error) throw new Error(`payment: ${payment.error.message}`)
  fixture.paymentId = payment.data.id
  /* ---- the sweep, on a fixture the database will not let it delete ---- */
  const run = spawnSync(
    process.execPath,
    ['--env-file=.env.local', 'scripts/ops/sweep-lane-b-fixture-leftovers.mjs', '--prefix', PREFIX, '--apply'],
    { encoding: 'utf8' },
  )
  const out = `${run.stdout ?? ''}${run.stderr ?? ''}`
  console.log(out.split('\n').map((l) => `    ${l}`).join('\n'))

  check(
    'sweep.an-order-with-a-payment-behind-it-is-kept-and-named',
    /KEEPING order .*1 payment/i.test(out),
    'the sweep said which order it was keeping and why, rather than deleting a record of money that moved',
  )
  check(
    'sweep.the-event-it-cannot-delete-is-archived-instead',
    /archived .*sweepdrill/i.test(out),
    'the archive fallback ran, which is the lawful end state in docs/EVENT-LIFECYCLE.md',
  )

  const { data: after } = await db.from('events').select('status, archived_at, archived_from_status').eq('id', fixture.eventId).single()
  check(
    'sweep.the-archived-event-is-honestly-archived',
    after?.status === 'archived' && Boolean(after?.archived_at),
    `status ${after?.status}, archived_at ${after?.archived_at ? 'set' : 'null'}, from ${after?.archived_from_status}`,
  )

  const published = await laneFixturesStillPublished(db, PREFIX)
  check(
    'sweep.nothing-of-the-fixture-is-left-in-the-sitemap',
    published.length === 0,
    published.length === 0 ? 'the sweep verified its own result and the result is empty' : `still published: ${published.join(', ')}`,
  )
  check(
    'sweep.it-exits-zero-only-when-that-is-true',
    run.status === 0,
    `the sweep exited ${run.status}, and it verifies by re-asking rather than by trusting its own calls`,
  )
} catch (error) {
  check('sweep.drill.completed', false, error instanceof Error ? error.message : String(error))
  console.error(error)
} finally {
  if (fixture.paymentId) await db.from('payments').delete().eq('id', fixture.paymentId)
  if (fixture.orderId) await db.from('orders').delete().eq('id', fixture.orderId)
  if (fixture.eventId) await db.from('events').delete().eq('id', fixture.eventId)
  if (fixture.orgId) await db.from('organisations').delete().eq('id', fixture.orgId)
  if (fixture.ownerId) await db.auth.admin.deleteUser(fixture.ownerId).catch(() => {})
  const { count } = await db.from('events').select('id', { count: 'exact', head: true }).like('slug', `${PREFIX}%`)
  check('sweep.drill.left-as-found', (count ?? 0) === 0, `${count ?? 0} sweep drill event row(s) remain`)
}

const failed = checks.filter((c) => !c.ok)
console.log('')
console.log(`SWEEP FALLBACK DRILL: ${checks.length - failed.length} of ${checks.length} checks passed`)
for (const f of failed) console.log(`  FAILED  ${f.name}  ${f.detail}`)
process.exit(failed.length === 0 ? 0 : 1)
