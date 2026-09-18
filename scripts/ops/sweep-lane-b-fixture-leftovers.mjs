/**
 * SWEEP A LANE B DRIVE'S LEFTOVER FIXTURE OFF SHARED TEST.
 *
 * WHY THIS EXISTS. On 15 September 2026, `lane-b-ga5-event-202609131728` was
 * found on TEST: published, public, two days old, with an organisation, four
 * orders, one tier and three campaigns behind it. It was in the sitemap the
 * whole time, at three URLs, on a database three lanes share. GA5's teardown
 * had reported "left as found" on every run since, because the only thing it
 * counted was `marketing_campaign` rows.
 *
 * The rows could not simply be deleted in the order the teardown tried: the
 * event carries money records, and the database enforces docs/EVENT-LIFECYCLE.md
 * ("delete requires zero money records"). So the fixture orders go first, and
 * ONLY the fixture orders: an order with a payment or a refund behind it is a
 * record of money that actually moved and is never deleted here. When one is
 * kept, the event is ARCHIVED instead of deleted, which takes it out of the
 * sitemap and off every public surface while keeping every record. That path is
 * driven by scripts/verify/sweep-fallback-drill.mjs rather than assumed.
 *
 * THE THREE RULES OF A SCRIPT THAT ACTS FOR SOMEBODY (Law 10).
 *   It REFUSES before it acts: TEST only, `lane-b-` prefixes only, and nothing
 *   happens at all without --apply.
 *   It prints no secret.
 *   It VERIFIES BY OBSERVING THE RESULT: it re-asks the sitemap's own question
 *   afterwards through scripts/verify/lib/sitemap-footprint.mjs, rather than
 *   trusting that its own deletes worked. Every delete's error is printed; the
 *   teardown that produced this mess ignored all of them.
 *
 * IT IS NOT A BLANKET SWEEP, and that is deliberate. `lane-b-fo1-` fixtures are
 * PERSISTENT BY DESIGN: fo1-founding-offer-drive tops the tree up to two
 * sellable lane B organisations and reuses them, so they never disappear and
 * never 404. A prefix must be named.
 *
 * Usage:
 *   node --env-file=.env.local scripts/ops/sweep-lane-b-fixture-leftovers.mjs --prefix lane-b-ga5-
 *   node --env-file=.env.local scripts/ops/sweep-lane-b-fixture-leftovers.mjs --prefix lane-b-ga5- --apply
 *
 * The shell must not carry the production Supabase URL:
 *   env -u NEXT_PUBLIC_SUPABASE_URL -u NEXT_PUBLIC_SUPABASE_ANON_KEY node --env-file=.env.local ...
 */
import { createClient } from '@supabase/supabase-js'
import { laneFixturesStillPublished } from '../verify/lib/sitemap-footprint.mjs'

const TAG = '[sweep-lane-b-fixtures]'
const args = process.argv.slice(2)
let prefix = null
let apply = false
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === '--prefix') prefix = args[++i]
  if (args[i] === '--apply') apply = true
}

if (!prefix || !/^lane-b-[a-z0-9]+-$/.test(prefix)) {
  console.error(`${TAG} --prefix is required and must look like lane-b-ga5-`)
  console.error(`${TAG} this is lane B's script and it refuses any prefix that is not lane B's own.`)
  process.exit(1)
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
if (!/vkapkibzokmfaxqogypq/.test(url)) {
  console.error(`${TAG} REFUSING: this only ever touches TEST vkapkibzokmfaxqogypq, and the environment names ${url || 'nothing'}`)
  process.exit(1)
}
const db = createClient(url, serviceKey, { auth: { persistSession: false } })

/** Run one delete and SAY what the database answered. Never swallow. */
async function del(what, query) {
  if (!apply) {
    console.log(`${TAG}   would delete ${what}`)
    return true
  }
  const { error } = await query
  if (error) {
    console.error(`${TAG}   REFUSED ${what}: ${error.message}`)
    return false
  }
  console.log(`${TAG}   deleted ${what}`)
  return true
}

const { data: events, error: eventError } = await db
  .from('events')
  .select('id, slug, status, visibility, venue_name')
  .like('slug', `${prefix}%`)
if (eventError) {
  console.error(`${TAG} could not read events: ${eventError.message}`)
  process.exit(1)
}
const { data: orgs, error: orgError } = await db
  .from('organisations')
  .select('id, slug, status, owner_id')
  .like('slug', `${prefix}%`)
if (orgError) {
  console.error(`${TAG} could not read organisations: ${orgError.message}`)
  process.exit(1)
}

console.log(`${TAG} prefix ${prefix} on TEST: ${events.length} event(s), ${orgs.length} organisation(s)`)
for (const e of events) console.log(`${TAG}   event ${e.slug} (${e.status}/${e.visibility}) venue ${JSON.stringify(e.venue_name)}`)
for (const o of orgs) console.log(`${TAG}   organisation ${o.slug} (${o.status})`)

const before = await laneFixturesStillPublished(db, prefix)
console.log(`${TAG} the sitemap currently publishes ${before.length === 0 ? 'nothing of this prefix' : before.join(', ')}`)
if (!apply) console.log(`${TAG} DRY RUN. Nothing was changed. Add --apply to act.`)

const eventIds = events.map((e) => e.id)
const orgIds = orgs.map((o) => o.id)

/**
 * A RECORD OF MONEY THAT ACTUALLY MOVED IS NEVER DELETED HERE.
 *
 * The first version of this script deleted every order hanging off the event,
 * and on its first real sweep it removed four confirmed orders without pausing.
 * On TEST, of fixtures with no payment behind them, that is what you want. It is
 * still the wrong rule for a script to hold, because the rule it encodes is
 * 'delete whatever is in the way'.
 *
 * So an order is only removed when nothing charged or refunded against it. If
 * anything did, the order stays, the event cannot be deleted (the database
 * refuses it: docs/EVENT-LIFECYCLE.md), and the event is ARCHIVED instead, which
 * takes it off every public surface and out of the sitemap with every record
 * kept. That is the lawful end state and it is what the product's own archive
 * does.
 */
async function ordersSafeToDelete(orders) {
  const safe = []
  const kept = []
  for (const o of orders) {
    const { count: paid } = await db.from('payments').select('id', { count: 'exact', head: true }).eq('order_id', o.id)
    const { count: refunded } = await db.from('refunds').select('id', { count: 'exact', head: true }).eq('order_id', o.id)
    if ((paid ?? 0) > 0 || (refunded ?? 0) > 0) kept.push({ ...o, paid: paid ?? 0, refunded: refunded ?? 0 })
    else safe.push(o)
  }
  return { safe, kept }
}

let moneyWasLeftBehind = false

if (eventIds.length > 0) {
  const { data: orders } = await db.from('orders').select('id, order_number, status').in('event_id', eventIds)
  const { safe, kept } = await ordersSafeToDelete(orders ?? [])
  for (const o of kept) {
    moneyWasLeftBehind = true
    console.log(`${TAG}   KEEPING order ${o.order_number}: ${o.paid} payment(s) and ${o.refunded} refund(s) are behind it`)
  }
  const orderIds = safe.map((o) => o.id)
  if (orderIds.length > 0) {
    console.log(`${TAG} ${orderIds.length} order(s) with nothing charged against them go before the event can`)
    await del(`${orderIds.length} ticket(s)`, db.from('tickets').delete().in('order_id', orderIds))
    await del(`${orderIds.length} order item(s)`, db.from('order_items').delete().in('order_id', orderIds))
    await del('marketing attribution reversals', db.from('marketing_attribution_reversal').delete().in('order_id', orderIds))
    await del('marketing attribution', db.from('marketing_attribution').delete().in('order_id', orderIds))
    await del(`${orderIds.length} order(s)`, db.from('orders').delete().in('id', orderIds))
  }

  const { data: campaigns } = await db.from('marketing_campaign').select('id, reference').in('event_id', eventIds)
  const campaignIds = (campaigns ?? []).map((c) => c.id)
  if (campaignIds.length > 0) {
    console.log(`${TAG} ${campaignIds.length} campaign(s) reference these events`)
    await del('proof snapshots', db.from('marketing_proof_snapshot').delete().in('campaign_id', campaignIds))
    await del('sends', db.from('marketing_send').delete().in('campaign_id', campaignIds))
    await del('send approvals', db.from('marketing_send_approval').delete().in('campaign_id', campaignIds))
    await del('recipient allowlists', db.from('marketing_recipient_allowlist').delete().in('campaign_id', campaignIds))
    await del(`${campaignIds.length} campaign(s)`, db.from('marketing_campaign').delete().in('id', campaignIds))
  }

  let eventsGone = false
  if (moneyWasLeftBehind) {
    console.log(`${TAG} not attempting the event delete: money was left behind on purpose and the database would refuse it`)
  } else {
    await del('ticket tiers', db.from('ticket_tiers').delete().in('event_id', eventIds))
    eventsGone = await del(`${eventIds.length} event(s)`, db.from('events').delete().in('id', eventIds))
  }

  if (apply && !eventsGone) {
    console.log(`${TAG} the event stays, so it is ARCHIVED, which is the lawful end state in docs/EVENT-LIFECYCLE.md`)
    for (const e of events) {
      const { error } = await db
        .from('events')
        .update({ status: 'archived', archived_at: new Date().toISOString(), archived_from_status: e.status })
        .eq('id', e.id)
      if (error) console.error(`${TAG}   REFUSED archive of ${e.slug}: ${error.message}`)
      else console.log(`${TAG}   archived ${e.slug} from ${e.status}`)
    }
  }
}
if (orgIds.length > 0) {
  const gone = await del(`${orgIds.length} organisation(s)`, db.from('organisations').delete().in('id', orgIds))
  if (apply && !gone) {
    console.log(`${TAG} the organisation could not be deleted, so it is set pending, which takes it out of the sitemap`)
    for (const o of orgs) {
      const { error } = await db.from('organisations').update({ status: 'pending' }).eq('id', o.id)
      if (error) console.error(`${TAG}   REFUSED pending on ${o.slug}: ${error.message}`)
      else console.log(`${TAG}   ${o.slug} is pending`)
    }
  }
}

/*
 * VERIFY BY OBSERVING, not by trusting the calls above. This asks the sitemap's
 * own question again.
 */
const after = await laneFixturesStillPublished(db, prefix)
if (after.length === 0) {
  console.log(`${TAG} VERIFIED: the sitemap publishes nothing under ${prefix}`)
  process.exit(0)
}
console.error(`${TAG} STILL PUBLISHED: ${after.join(', ')}`)
console.error(`${TAG} ${apply ? 'The sweep did not finish the job.' : 'This was a dry run; add --apply.'}`)
process.exit(apply ? 1 : 0)
